const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = { daily: '일상', travel: '여행', service: '고객 응대', office: '사내 소통' };
const GROUP = { service: '회사', office: '회사' };
const TONE = { casual: '캐주얼', neutral: '중립', polite: '공손' };
const TUTOR = 'Mia';

const saved = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 학습은 계속 */ } };
for (const c of saved('mycards', [])) addMine(c); // "이 말 영어로?"로 만든 내 카드 (ask.js)

// ── 튜터 음성 (기기 내장 TTS) ──
const voices = {};
function pickVoice() {
  for (const lang of ['en-US', 'ko-KR']) {
    const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-') === lang);
    voices[lang] = vs.find((v) => /google/i.test(v.name)) || vs[0];
  }
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let utter; // 재생 중 참조를 잡아둬야 Chrome이 onend 전에 버리지 않는다
function say(text, rate = 0.95, onend, lang = 'en-US') {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang; utter.rate = rate;
  if (voices[lang]) utter.voice = voices[lang];
  if (onend) utter.onend = onend;
  speechSynthesis.speak(utter);
}

// ── 내 목소리 녹음 (튜터 음성과 비교 듣기용) ──
let recorder = null;
async function record(btn, onDone) {
  if (recorder) { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    onDone(null, '이 브라우저는 녹음을 지원하지 않아요. 안드로이드 Chrome에서 열어주세요.'); return;
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { onDone(null, ERR['not-allowed']); return; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const chunks = [];
  const label = btn.textContent;
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    recorder = null;
    btn.classList.remove('live'); btn.textContent = label;
    onDone(URL.createObjectURL(new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })));
  };
  const r = recorder;
  r.start();
  btn.classList.add('live'); btn.textContent = '녹음 중… 다 말했으면 탭';
  setTimeout(() => r.state === 'recording' && r.stop(), 10000);
}

// ── 음성 인식 ──
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const ERR = {
  'not-allowed': '마이크 권한이 꺼져 있어요. 주소창 왼쪽 아이콘에서 마이크를 허용하세요.',
  'no-speech': '소리가 들리지 않았어요. 버튼을 누르고 바로 말해보세요.',
  network: '음성 인식에 인터넷 연결이 필요해요.',
  'audio-capture': '마이크를 찾지 못했어요. 이어폰 연결을 확인하세요.',
};
let rec = null;
let speechStartedAt = 0; // 말하기 시작한 순간 (복습의 "대답까지 걸린 시간"용)
function hear() {
  return new Promise((resolve, reject) => {
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onspeechstart = () => { speechStartedAt = performance.now(); };
    let got = '';
    rec.onresult = (e) => { got = e.results[0][0].transcript; };
    rec.onerror = (e) => reject(e.error);
    rec.onend = () => { rec = null; got ? resolve(got) : reject('no-speech'); };
    rec.start();
  });
}
async function mic(btn, out, render) {
  if (!SR) { out.innerHTML = '<p class="note">이 브라우저는 음성 인식을 지원하지 않아요. 안드로이드 Chrome에서 열어주세요.</p>'; return; }
  if (rec) { rec.stop(); return; }
  speechSynthesis.cancel();
  const label = btn.textContent;
  btn.classList.add('live'); btn.textContent = '듣는 중… 다 말했으면 탭';
  let heard = '';
  try { heard = await hear(); out.innerHTML = render(heard); }
  catch (err) { out.innerHTML = `<p class="note">${ERR[err] || '음성 인식에 실패했어요 (' + esc(String(err)) + ')'}</p>`; }
  finally { btn.classList.remove('live'); btn.textContent = label.startsWith('다시') ? label : '다시 ' + label; }
  return heard;
}

// ── AI 교정 (Gemini 무료 등급, 키는 이 폰의 브라우저에만 저장) ──
// 503(과부하)은 무료 등급에서 가끔 난다 → 같은 모델로 두 번 더, 그래도 안 되면 가벼운 모델로
const TRIES = [['gemini-3.8-flash', 0], ['gemini-3.8-flash', 1000], ['gemini-3.8-flash', 3000], ['gemini-3.5-flash-lite', 0]];
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const VERDICT = {
  natural: ['ok', '자연스러워요'],
  ok: ['ok', '통해요. 더 자연스러운 표현도 있어요'],
  awkward: ['bad', '어색하게 들려요'],
  wrong: ['bad', '뜻이 다르게 전달돼요'],
};
const apiError = (status) => ({
  400: '키가 올바르지 않아요. 설정에서 키를 다시 확인하세요.',
  403: '이 키로는 Gemini를 쓸 수 없어요. 설정에서 키를 다시 확인하세요.',
  429: '무료 사용량을 잠시 넘었어요. 1분쯤 뒤에 다시 시도하세요.',
  500: '구글 서버가 붐벼요. 잠시 뒤 다시 시도하세요.',
  503: '구글 서버가 붐벼요. 잠시 뒤 다시 시도하세요.',
}[status] || (status ? `AI 교정을 불러오지 못했어요 (오류 ${status}).` : '인터넷 연결을 확인하세요.'));

async function gemini(key, body) {
  let status;
  for (const [model, wait] of TRIES) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    let res;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch { throw apiError(0); }
    if (res.ok) return res.json();
    status = res.status;
    if (status !== 503 && status !== 500) break;
  }
  throw apiError(status);
}

const caption = (heard) => `<div class="cc"><span>상대에게 들린 말</span><p lang="en">${esc(heard)}</p></div>`;

const words = (ws) => ws.map((w) => `<b>${esc(w)}</b>`).join(', ');

// card를 넘기면 그 카드의 패턴을 말했는지도 본다
function variantResult(target, heard, card) {
  const r = Judge.judge(target, heard, card ? card.key : []);
  let v;
  if (r.confusions.length) {
    const c = r.confusions[0];
    v = `<p class="verdict bad">뜻이 바뀌었어요</p><p class="why"><b>${c.meant}</b>를 <b>${c.said}</b>로 들었어요. 둘 다 이 문장에 들어갈 수 있어서 문맥으로 구분이 안 돼요.</p>`;
  } else if (r.missingCore.length) {
    v = `<p class="verdict bad">핵심 단어가 빠졌어요</p><p class="why">안 들린 말: ${words(r.missingCore)}. 이 단어가 빠지면 뜻이 달라지거나 전달되지 않아요.</p>`;
  } else if (r.patternMissed) {
    v = `<p class="verdict bad">패턴이 안 들렸어요</p><p class="why">뜻은 통하지만, 이 카드의 표현 <b>${esc(card.pattern.replace('___', '~'))}</b>(으)로 말해보세요.</p>`;
  } else if (r.passed) {
    v = '<p class="verdict ok">전달됐어요</p>';
  } else {
    v = `<p class="verdict bad">일부가 전달되지 않았어요</p><p class="why">안 들린 말: ${words(r.missing)}</p>`;
  }
  return caption(heard) + v;
}

function roleplayResult(card, heard) {
  const used = Judge.usesPattern(card.key, heard);
  return caption(heard) + (used
    ? '<p class="verdict ok">패턴을 썼어요</p>'
    : `<p class="verdict bad">패턴이 안 들렸어요</p><p class="why"><b>${esc(card.pattern)}</b>를 넣어서 다시 말해보세요.</p>`);
}

// ── 연음 표시 ──
const RULES = {
  link: ['이어 읽기', '앞 단어의 끝 자음이 뒤 단어의 첫 모음에 붙어요. Can I → kə-nai'],
  flap: ['t가 ㄹ처럼', '모음 사이의 t는 혀를 한 번 튕기듯 빠르게 발음해서 가벼운 d나 ㄹ처럼 들려요. get a → ge-də'],
  yu: ['t·d + you', 't나 d 뒤에 you가 오면 섞여서 [츄]·[쥬]처럼 돼요. Did you → di-jə'],
  same: ['겹자음은 한 번', '같은 자음이 겹치면 한 번만, 살짝 길게 발음해요. bad day → ba-day'],
  stop: ['t는 멈추기만', '끝의 t 뒤에 자음이 오면 t를 터뜨리지 않고 혀만 대고 멈춰요. get back → ge(t) back'],
  weak: ['약하게', 'to·for·and·can·a·of 같은 기능어는 힘을 빼서 tə·fər·ən·kən·ə·əv로 줄여요.'],
  glide: ['모음 사이 이음', '모음으로 끝나고 모음으로 시작하면 사이에 가벼운 y나 w가 끼어들어요. okay if → o-kay-yif'],
};
function linkBlock(l) {
  if (!l) return '<p class="hint small">이 문장은 연음 표시가 없어요. 튜터 음성을 듣고 녹음해서 비교해 보세요.</p>';
  const marked = esc(l.text).replace(/‿/g, '<span class="tie">‿</span>').replace(/\(t\)/g, '<span class="hold">(t)</span>');
  return `<p class="link" lang="en">${marked}</p><p class="sound">[${esc(l.sound)}]</p>
    ${l.rules.length ? `<ul class="rules">${l.rules.map((r) => `<li><b>${RULES[r][0]}</b> ${RULES[r][1]}</li>`).join('')}</ul>` : ''}
    <p class="hint small">‿는 이어 읽기, (t)는 멈추기만, 대문자는 강하게 읽는 부분이에요. 규칙을 적용해 만든 표시라 원어민 녹음으로 확인한 건 아니에요.</p>`;
}

// ── 화면 ──
const slot = (p) => esc(p).replace('___', '<span class="slot" aria-label="빈칸"></span>');

// 분류 안의 카드를 상황 순서대로 묶는다. SITS에 없는 상황은 맨 뒤 '기타'로
function bySit(cat) {
  // 캐시 때문에 예전 cards.js(SITS 없음)가 섞여 들어와도 목록은 뜨게
  const order = (typeof SITS !== 'undefined' && SITS[cat]) || [];
  const groups = order.map((s) => [s, CARDS.filter((c) => c.cat === cat && c.sit === s)]);
  groups.push(['기타', CARDS.filter((c) => c.cat === cat && !order.includes(c.sit))]);
  return groups.filter(([, cs]) => cs.length);
}

function toggleFav(id) {
  const f = new Set(saved('fav', []));
  f.has(id) ? f.delete(id) : f.add(id);
  save('fav', [...f]);
  return f.has(id);
}
const star = (id, on) => {
  const c = CARDS.find((x) => x.id === id);
  return `<button class="star" data-fav="${id}" aria-pressed="${on}" aria-label="즐겨찾기: ${esc(c.pattern.replace('___', '~'))}">${on ? '★' : '☆'}</button>`;
};

function home() {
  const done = new Set(saved('done', []));
  const fav = new Set(saved('fav', []));
  let tab = saved('tab', 'daily');
  if (tab !== 'fav' && !CATS[tab]) tab = 'daily';
  const groups = tab === 'fav'
    ? Object.keys(CATS).map((k) => [CATS[k], CARDS.filter((c) => c.cat === k && fav.has(c.id))]).filter(([, cs]) => cs.length)
    : bySit(tab);
  const cards = groups.flatMap(([, cs]) => cs);
  const n = cards.filter((c) => done.has(c.id)).length;
  const count = tab === 'fav'
    ? `즐겨찾기 ${cards.length}개`
    : `${GROUP[tab] ? GROUP[tab] + ' · ' : ''}${CATS[tab]} — ${cards.length}개 중 ${n}개 완료`;
  const tabs = [['fav', '★ 즐겨찾기'], ...Object.entries(CATS)];
  const opened = saved('opened', {});
  $('#app').innerHTML = `
    <header class="top">
      <div class="tools">
        <button class="set" id="theme"></button>
        <a class="set" href="#/settings">AI 교정 ${saved('gemini', '') ? '켜짐' : '꺼짐'}</a>
      </div>
      <h1>말해보는 영어</h1>
      <p>매일 오늘의 학습부터 해보세요. 새 표현은 소리 내어 익히고, 익힌 표현은 다음 날부터 한국어만 보고 꺼내 말해요.</p>
    </header>
    ${todayPanel()}
    <nav class="tabs" aria-label="분류">
      ${tabs.map(([k, v]) => `<button class="tab cat-${k}" aria-pressed="${k === tab}" data-tab="${k}">${v}</button>`).join('')}
    </nav>
    <p class="count">${count}</p>
    ${cards.length ? '' : '<p class="empty">아직 모은 표현이 없어요. 카드의 ☆를 누르면 여기에 모여요.</p>'}
    ${groups.map(([title, cs], gi) => {
      // 상황별 묶음은 접어 둔다. 연 상태는 기억하고, 처음엔 첫 묶음만 연다
      const key = `${tab}:${title}`;
      const open = key in opened ? opened[key] : gi === 0;
      const d = cs.filter((c) => done.has(c.id)).length;
      return `<details class="sit-group" data-open-key="${esc(key)}" ${open ? 'open' : ''}>
      <summary><h2 class="sit">${esc(title)}</h2><span class="sit-n">완료 ${d}/${cs.length}</span></summary>
      <ul class="list">
      ${cs.map((c) => `<li class="cat-${c.cat}"><a href="#/c/${c.id}">
        <span class="p" lang="en">${slot(c.pattern)}</span>
        <span class="k">${esc(c.ko)}</span>
        ${done.has(c.id) ? '<span class="done">완료</span>' : ''}
      </a>${star(c.id, fav.has(c.id))}</li>`).join('')}
      </ul></details>`;
    }).join('')}`;
  $('#app').querySelectorAll('[data-open-key]').forEach((d) => d.ontoggle = () => {
    save('opened', { ...saved('opened', {}), [d.dataset.openKey]: d.open });
  });
  const themeBtn = $('#theme');
  const showTheme = (t) => {
    const [icon, name] = { system: ['🌓', '기기 설정'], light: ['☀️', '라이트'], dark: ['🌙', '다크'] }[t];
    themeBtn.innerHTML = `<span aria-hidden="true">${icon}</span> ${name}`;
    themeBtn.setAttribute('aria-label', `화면 모드: ${name}. 누르면 바뀌어요`);
  };
  showTheme(Theme.get());
  themeBtn.onclick = () => showTheme(Theme.next());
  $('#app').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { save('tab', b.dataset.tab); home(); });
  $('#app').querySelectorAll('[data-fav]').forEach((b) => b.onclick = () => {
    toggleFav(b.dataset.fav);
    home();
  });
}

function settings() {
  const key = saved('gemini', '');
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a></header>
    <h1 class="page-h">AI 교정</h1>
    <p>카드의 "대화에 써보기"에서 ${TUTOR}와 여러 번 이어서 대화하며 더 자연스러운 표현을 배우고, "이 말 영어로?"도 쓸 수 있어요. Google Gemini 무료 API 키가 필요해요.</p>
    <section class="step">
      <label class="label" for="key">Gemini API 키</label>
      <p class="hint" id="state">${key ? `저장된 키: ${esc(key.slice(0, 4))}…${esc(key.slice(-4))}` : '저장된 키가 없어요.'}</p>
      <input id="key" name="gemini-key" type="password" autocomplete="off" spellcheck="false" placeholder="AIza로 시작하는 키 붙여넣기…">
      <div class="row">
        <button class="btn" id="save">키 확인하고 저장</button>
        ${key ? '<button class="btn ghost" id="del">키 삭제</button>' : ''}
      </div>
      <p class="why" id="msg" aria-live="polite"></p>
    </section>
    <p class="hint small">키는 이 폰의 브라우저에만 저장되고 Google 외에는 보내지 않아요. 무료 등급에서는 입력한 문장이 Google 서비스 개선에 쓰일 수 있으니 개인정보는 말하지 마세요.</p>
    <p><a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener">Google AI Studio에서 키 발급하기 ↗</a></p>`;
  $('#save').onclick = async () => {
    const k = $('#key').value.trim();
    const msg = $('#msg');
    if (!k) { msg.textContent = '키를 붙여넣은 뒤 눌러주세요.'; return; }
    msg.textContent = '키 확인 중…';
    try {
      await gemini(k, { contents: [{ parts: [{ text: 'Reply with OK.' }] }] });
      save('gemini', k);
      settings();
      $('#msg').textContent = `저장했어요. 이제 카드의 "대화에 써보기"에서 ${TUTOR}와 이어서 대화할 수 있어요.`;
    } catch (e) { msg.textContent = e; }
  };
  const del = $('#del');
  if (del) del.onclick = () => {
    if (!confirm('저장된 API 키를 지울까요? 다시 쓰려면 키를 다시 붙여넣어야 해요.')) return;
    try { localStorage.removeItem('gemini'); } catch { /* 무시 */ }
    settings();
  };
}

function card(c) {
  const [first] = c.variants;
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a>
      <span class="bar-r">${star(c.id, saved('fav', []).includes(c.id))}<span class="chip cat-${c.cat}">${CATS[c.cat]} · ${esc(c.sit || '기타')}</span></span></header>
    <section class="intro cat-${c.cat}">
      <p class="tone">${TONE[c.tone]}</p>
      <h1 class="pattern" lang="en">${slot(c.pattern)}</h1>
      <p class="ko">${esc(c.ko)}</p>
      <p class="when">${esc(c.when)}</p>
      ${c.tip ? `<p class="tip">${esc(c.tip)}</p>` : ''}
    </section>
    <details class="step" id="s1" open>
      <summary><h2><span>1</span>귀로 먼저 맞혀보기</h2></summary>
      <p class="hint">조금 빠르게 들려줘요. 무슨 뜻인지 먼저 떠올린 뒤 확인하세요.</p>
      <div class="row"><button class="btn" id="fast">빠르게 듣기</button><button class="btn ghost" id="reveal">뜻 확인하고 계속</button></div>
      <div id="answer" hidden><p class="en" lang="en">${esc(first.en)}</p><p class="ko-s">${esc(first.ko)}</p></div>
    </details>
    <div id="rest" hidden>
      <details class="step" open>
        <summary><h2><span>2</span>단어 바꿔 말하기</h2></summary>
        ${c.variants.map((v, i) => `<div class="variant">
          <p class="en" lang="en">${esc(v.en)}</p><p class="ko-s">${esc(v.ko)}</p>
          <div class="row">
            <button class="btn ghost" data-say="${i}">듣기</button>
            <button class="btn ghost" data-slow="${i}">천천히</button>
            <button class="btn mic" data-mic="${i}">말하기</button>
          </div>
          <div class="out" id="out-${i}" aria-live="polite"></div>
          <details class="more"><summary>연음 보기 · 내 목소리와 비교</summary>
            ${linkBlock(v.link)}
            <div class="row">
              <button class="btn ghost" data-rec="${i}">내 목소리 녹음</button>
              <button class="btn ghost" data-cmp="${i}" hidden>튜터 → 나 비교 듣기</button>
            </div>
            <p class="note" id="recnote-${i}" aria-live="polite"></p>
            <p class="hint small">블루투스 이어폰 마이크는 소리가 먹먹하게 녹음돼요. 비교할 때는 폰 마이크가 더 정확해요.</p>
          </details>
        </div>`).join('')}
      </details>
      <details class="step" id="talk" open>
        <summary><h2><span>3</span>대화에 써보기</h2></summary>
        <p class="hint">${TUTOR}의 말을 듣고, 이 패턴으로 대답해보세요.</p>
        <div class="tutor">
          <p class="who">${TUTOR}</p>
          <div class="row"><button class="btn ghost" id="rp-say">듣기</button></div>
          <details><summary>자막 보기</summary><p class="en" lang="en">${esc(c.roleplay.tutor)}</p><p class="ko-s">${esc(c.roleplay.ko)}</p></details>
        </div>
        <button class="btn mic" id="rp-mic">대답하기</button>
        <div class="out" id="rp-out" aria-live="polite"></div>
        <details><summary>예시 답변 보기</summary><p class="en" lang="en">${esc(c.roleplay.answer)}</p></details>
      </details>
      <button class="btn finish" id="finish">다 했어요, 다음 표현</button>
    </div>
    ${c.mine ? '<button class="btn ghost danger" id="drop">내 카드 삭제</button>' : ''}`;
  if (c.mine) $('#drop').onclick = () => {
    if (!confirm('이 카드를 지울까요? 복습 기록과 즐겨찾기도 같이 지워져요.')) return;
    removeMine(c.id);
    location.hash = '';
  };

  $('#fast').onclick = () => say(first.en, 1.2);
  $('#reveal').onclick = () => {
    $('#answer').hidden = false; $('#rest').hidden = false; $('#reveal').remove();
    $('#s1').open = false; // 뜻을 확인했으면 1단계는 접고 2단계로
    $('#rest').scrollIntoView({ block: 'start' });
  };
  $('#app').querySelectorAll('[data-say]').forEach((b) => b.onclick = () => say(c.variants[b.dataset.say].en));
  $('#app').querySelectorAll('[data-slow]').forEach((b) => b.onclick = () => say(c.variants[b.dataset.slow].en, 0.7));
  $('#app').querySelectorAll('[data-mic]').forEach((b) => {
    const v = c.variants[b.dataset.mic];
    b.onclick = () => mic(b, $('#out-' + b.dataset.mic), (heard) => variantResult(v.en, heard, c));
  });
  $('.bar [data-fav]').onclick = (e) => {
    const on = toggleFav(c.id);
    e.currentTarget.textContent = on ? '★' : '☆';
    e.currentTarget.setAttribute('aria-pressed', on);
  };
  const clips = [];
  $('#app').querySelectorAll('[data-rec]').forEach((b) => {
    const i = b.dataset.rec;
    b.onclick = () => record(b, (url, err) => {
      if (!b.isConnected) return;
      $('#recnote-' + i).textContent = err || '';
      if (!url) return;
      if (clips[i]) URL.revokeObjectURL(clips[i]);
      clips[i] = url;
      b.textContent = '다시 녹음';
      $(`[data-cmp="${i}"]`).hidden = false;
    });
  });
  $('#app').querySelectorAll('[data-cmp]').forEach((b) => {
    const i = b.dataset.cmp;
    b.onclick = () => say(c.variants[i].en, 0.95, () => new Audio(clips[i]).play());
  });
  $('#rp-say').onclick = () => say(c.roleplay.tutor);
  $('#rp-mic').onclick = async () => {
    const out = $('#rp-out');
    const heard = await mic($('#rp-mic'), out, (h) => roleplayResult(c, h));
    if (heard) out.insertAdjacentHTML('beforeend', `<p class="hint small"><a href="#/settings">AI 교정</a>을 켜면 ${TUTOR}와 여러 번 이어서 대화하고 교정도 받을 수 있어요.</p>`);
  };
  if (saved('gemini', '')) startChat(c, $('#talk')); // 키가 있으면 한 번 주고받기 대신 이어지는 대화 (chat.js)
  $('#finish').onclick = () => {
    learned(c);
    if (todayPlan().picks.includes(c.id)) { location.hash = ''; return; } // 오늘의 학습에서 왔으면 목록으로
    const same = bySit(c.cat).flatMap(([, cs]) => cs);
    const next = same[same.indexOf(c) + 1];
    location.hash = next ? '#/c/' + next.id : '';
  };
}

function route() {
  if (rec) rec.abort();
  if (recorder) recorder.stop();
  stopListen();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const m = location.hash.match(/^#\/c\/(.+)$/);
  const c = m && CARDS.find((x) => x.id === m[1]);
  if (c) card(c);
  else if (location.hash === '#/settings') settings();
  else if (location.hash === '#/review') review();
  else if (location.hash === '#/listen') listen();
  else if (location.hash === '#/ask') ask();
  else home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
