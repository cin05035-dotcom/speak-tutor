const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = { daily: '일상', travel: '여행', service: '고객 응대', office: '사내 소통' };
const GROUP = { service: '회사', office: '회사' };
const TONE = { casual: '캐주얼', neutral: '중립', polite: '공손' };
const TUTOR = 'Mia';

const saved = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 학습은 계속 */ } };

// ── 튜터 음성 (기기 내장 TTS) ──
let voice;
function pickVoice() {
  const us = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-') === 'en-US');
  voice = us.find((v) => /google/i.test(v.name)) || us[0];
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, rate = 0.95) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = rate;
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
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
function hear() {
  return new Promise((resolve, reject) => {
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
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
  try { out.innerHTML = render(await hear()); }
  catch (err) { out.innerHTML = `<p class="note">${ERR[err] || '음성 인식에 실패했어요 (' + esc(String(err)) + ')'}</p>`; }
  finally { btn.classList.remove('live'); btn.textContent = label.startsWith('다시') ? label : '다시 ' + label; }
}

const caption = (heard) => `<div class="cc"><span>상대에게 들린 말</span><p>${esc(heard)}</p></div>`;

function variantResult(target, heard) {
  const r = Judge.judge(target, heard);
  let v;
  if (r.confusions.length) {
    const c = r.confusions[0];
    v = `<p class="verdict bad">뜻이 바뀌었어요</p><p class="why"><b>${c.meant}</b>를 <b>${c.said}</b>로 들었어요. 둘 다 이 문장에 들어갈 수 있어서 문맥으로 구분이 안 돼요.</p>`;
  } else if (r.passed) {
    v = '<p class="verdict ok">전달됐어요</p>';
  } else {
    v = `<p class="verdict bad">일부가 전달되지 않았어요</p><p class="why">안 들린 말: ${r.missing.map((w) => `<b>${esc(w)}</b>`).join(', ')}</p>`;
  }
  return caption(heard) + v;
}

function roleplayResult(card, heard) {
  const used = Judge.usesPattern(card.key, heard);
  return caption(heard) + (used
    ? '<p class="verdict ok">패턴을 썼어요</p>'
    : `<p class="verdict bad">패턴이 안 들렸어요</p><p class="why"><b>${esc(card.pattern)}</b>를 넣어서 다시 말해보세요.</p>`);
}

// ── 화면 ──
const slot = (p) => esc(p).replace('___', '<span class="slot" aria-label="빈칸"></span>');

function home() {
  const done = new Set(saved('done', []));
  const tab = saved('tab', 'daily');
  const cards = CARDS.filter((c) => c.cat === tab);
  const n = cards.filter((c) => done.has(c.id)).length;
  $('#app').innerHTML = `
    <header class="top">
      <h1>말해보는 영어</h1>
      <p>표현 하나를 골라 소리 내어 말해보세요. 상대가 알아들었는지 바로 알려줘요.</p>
    </header>
    <nav class="tabs" aria-label="분류">
      ${Object.entries(CATS).map(([k, v]) => `<button class="tab cat-${k}" aria-pressed="${k === tab}" data-tab="${k}">${v}</button>`).join('')}
    </nav>
    <p class="count">${GROUP[tab] ? GROUP[tab] + ' · ' : ''}${CATS[tab]} — ${cards.length}개 중 ${n}개 완료</p>
    <ul class="list cat-${tab}">
      ${cards.map((c) => `<li><a href="#/c/${c.id}">
        <span class="p">${slot(c.pattern)}</span>
        <span class="k">${esc(c.ko)}</span>
        ${done.has(c.id) ? '<span class="done" aria-label="완료">완료</span>' : ''}
      </a></li>`).join('')}
    </ul>`;
  $('#app').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { save('tab', b.dataset.tab); home(); });
}

function card(c) {
  const [first] = c.variants;
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a><span class="chip cat-${c.cat}">${CATS[c.cat]}</span></header>
    <section class="intro cat-${c.cat}">
      <p class="tone">${TONE[c.tone]}</p>
      <h1 class="pattern">${slot(c.pattern)}</h1>
      <p class="ko">${esc(c.ko)}</p>
      <p class="when">${esc(c.when)}</p>
      ${c.tip ? `<p class="tip">${esc(c.tip)}</p>` : ''}
    </section>
    <section class="step">
      <h2><span>1</span>귀로 먼저 맞혀보기</h2>
      <p class="hint">조금 빠르게 들려줘요. 무슨 뜻인지 먼저 떠올린 뒤 확인하세요.</p>
      <div class="row"><button class="btn" id="fast">빠르게 듣기</button><button class="btn ghost" id="reveal">뜻 확인하고 계속</button></div>
      <div id="answer" hidden><p class="en">${esc(first.en)}</p><p class="ko-s">${esc(first.ko)}</p></div>
    </section>
    <div id="rest" hidden>
      <section class="step">
        <h2><span>2</span>단어 바꿔 말하기</h2>
        ${c.variants.map((v, i) => `<div class="variant">
          <p class="en">${esc(v.en)}</p><p class="ko-s">${esc(v.ko)}</p>
          <div class="row">
            <button class="btn ghost" data-say="${i}">듣기</button>
            <button class="btn ghost" data-slow="${i}">천천히</button>
            <button class="btn mic" data-mic="${i}">말하기</button>
          </div>
          <div class="out" id="out-${i}" aria-live="polite"></div>
        </div>`).join('')}
      </section>
      <section class="step">
        <h2><span>3</span>대화에 써보기</h2>
        <p class="hint">${TUTOR}의 말을 듣고, 이 패턴으로 대답해보세요.</p>
        <div class="tutor">
          <p class="who">${TUTOR}</p>
          <div class="row"><button class="btn ghost" id="rp-say">듣기</button></div>
          <details><summary>자막 보기</summary><p class="en">${esc(c.roleplay.tutor)}</p><p class="ko-s">${esc(c.roleplay.ko)}</p></details>
        </div>
        <button class="btn mic" id="rp-mic">대답하기</button>
        <div class="out" id="rp-out" aria-live="polite"></div>
        <details><summary>예시 답변 보기</summary><p class="en">${esc(c.roleplay.answer)}</p></details>
      </section>
      <button class="btn finish" id="finish">다 했어요, 다음 표현</button>
    </div>`;

  $('#fast').onclick = () => say(first.en, 1.2);
  $('#reveal').onclick = () => { $('#answer').hidden = false; $('#rest').hidden = false; $('#reveal').remove(); };
  $('#app').querySelectorAll('[data-say]').forEach((b) => b.onclick = () => say(c.variants[b.dataset.say].en));
  $('#app').querySelectorAll('[data-slow]').forEach((b) => b.onclick = () => say(c.variants[b.dataset.slow].en, 0.7));
  $('#app').querySelectorAll('[data-mic]').forEach((b) => {
    const v = c.variants[b.dataset.mic];
    b.onclick = () => mic(b, $('#out-' + b.dataset.mic), (heard) => variantResult(v.en, heard));
  });
  $('#rp-say').onclick = () => say(c.roleplay.tutor);
  $('#rp-mic').onclick = () => mic($('#rp-mic'), $('#rp-out'), (heard) => roleplayResult(c, heard));
  $('#finish').onclick = () => {
    save('done', [...new Set([...saved('done', []), c.id])]);
    const same = CARDS.filter((x) => x.cat === c.cat);
    const next = same[same.indexOf(c) + 1];
    location.hash = next ? '#/c/' + next.id : '';
  };
}

function route() {
  if (rec) rec.abort();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const m = location.hash.match(/^#\/c\/(.+)$/);
  const c = m && CARDS.find((x) => x.id === m[1]);
  c ? card(c) : home();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
