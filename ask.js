// "이 말 영어로?": 한국어로 하고 싶은 말을 적으면 Gemini가 자연스러운 영어로 바꾸고, 내 카드로 저장한다.
// 내 카드는 기존 카드와 같은 모양이라 카드 학습·복습·듣기에 그대로 들어간다. 폰(localStorage 'mycards')에만 저장.

const WHERE = { daily: '일상', travel: '여행', service: '고객 응대 (내가 직원)', office: '사내 소통 (외국계 회사)', any: '잘 모르겠음' };

function addMine(card) {
  CATS.mine = '내 카드';
  SITS.mine = ['내 표현'];
  CARDS.push(card);
}

function removeMine(id) {
  const i = CARDS.findIndex((c) => c.id === id);
  if (i >= 0) CARDS.splice(i, 1);
  save('mycards', saved('mycards', []).filter((c) => c.id !== id));
  save('fav', saved('fav', []).filter((x) => x !== id));
  save('done', saved('done', []).filter((x) => x !== id));
  const s = saved('srs', {});
  for (const k of Object.keys(s)) if (k.startsWith(id + ':')) delete s[k];
  save('srs', s);
  const plan = saved('plan', null);
  if (plan) save('plan', { ...plan, picks: plan.picks.filter((x) => x !== id) });
  if (!CARDS.some((c) => c.mine)) { delete CATS.mine; delete SITS.mine; }
}

// AI 답을 그대로 믿지 않는다: 문자열만, 길이 제한, 빠진 값은 채운다
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function toCard(r, input) {
  const c = r.card || {};
  const best = str(r.best);
  const variants = (Array.isArray(c.variants) ? c.variants : [])
    .map((v) => ({ en: str(v && v.en), ko: str(v && v.ko) })).filter((v) => v.en && v.ko).slice(0, 3);
  if (!variants.length) variants.push({ en: best, ko: input });
  const pattern = str(c.pattern, 80) || variants[0].en;
  // key는 목표 문장에 실제로 들어 있어야 판정에 쓸 수 있다. 아니면 패턴의 빈칸 앞부분으로
  let key = str(c.key, 60).toLowerCase();
  if (!key || !Judge.usesPattern(key, variants[0].en)) {
    key = (pattern.split('___')[0] || variants[0].en).replace(/[.,?!]/g, '').trim().toLowerCase().split(/\s+/).slice(0, 4).join(' ');
  }
  const rp = c.roleplay || {};
  return {
    id: 'my-' + Date.now().toString(36), cat: 'mine', sit: '내 표현', mine: true,
    tone: ['casual', 'neutral', 'polite'].includes(c.tone) ? c.tone : 'neutral',
    pattern, key, ko: str(c.ko, 80) || input, when: str(c.when, 100) || `"${input.slice(0, 40)}"를 말하고 싶을 때`,
    variants,
    roleplay: { tutor: str(rp.tutor) || 'What would you say here?', ko: str(rp.ko) || '이럴 때 뭐라고 할까요?', answer: str(rp.answer) || variants[0].en },
  };
}

async function translate(input, where) {
  const data = await gemini(saved('gemini', ''), {
    systemInstruction: { parts: [{ text:
      `You are ${TUTOR}, a friendly 27-year-old American coaching a Korean learner in their 20s.
The learner writes in Korean what they want to say. Give the most natural thing an American in their 20s-30s would actually say in that situation, at the right politeness level. Prefer common, reusable spoken phrasing over literal translation.
"why" and every "note"/"ko"/"when" are in Korean (해요체), short. English fields are plain sentences without quotes.
For "card": pick one reusable pattern contained in "best", written with ___ for the swappable part (e.g. "Can I get ___?"). "key" is the fixed words of that pattern in lowercase, exactly as they appear in "best". Give 3 variants that swap the ___ part (the first one is "best"), and a one-turn role-play where the tutor's line naturally leads to "best".` }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ korean: input, situation: WHERE[where] }) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', required: ['best', 'why', 'others', 'card'], properties: {
        best: { type: 'STRING' },
        why: { type: 'STRING' },
        others: { type: 'ARRAY', items: { type: 'OBJECT', required: ['en', 'note'], properties: { en: { type: 'STRING' }, note: { type: 'STRING' } } } },
        card: { type: 'OBJECT', required: ['pattern', 'key', 'ko', 'when', 'tone', 'variants', 'roleplay'], properties: {
          pattern: { type: 'STRING' }, key: { type: 'STRING' }, ko: { type: 'STRING' }, when: { type: 'STRING' },
          tone: { type: 'STRING', enum: ['casual', 'neutral', 'polite'] },
          variants: { type: 'ARRAY', items: { type: 'OBJECT', required: ['en', 'ko'], properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } } } },
          roleplay: { type: 'OBJECT', required: ['tutor', 'ko', 'answer'], properties: { tutor: { type: 'STRING' }, ko: { type: 'STRING' }, answer: { type: 'STRING' } } },
        } },
      } },
    },
  });
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

function ask() {
  const hasKey = !!saved('gemini', '');
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a></header>
    <h1 class="page-h">이 말 영어로?</h1>
    <p class="hint">하고 싶은 말을 한국어로 적으면 ${TUTOR}가 자연스러운 영어로 바꿔 주고, 연습할 수 있는 내 카드로 만들어 줘요.</p>
    ${hasKey ? `<section class="step">
      <label class="label" for="q">하고 싶은 말</label>
      <textarea id="q" class="field" name="korean" rows="3" maxlength="200" autocomplete="off" placeholder="예: 지난주에 산 옷 환불하고 싶어요…"></textarea>
      <label class="label" for="where">어떤 상황이에요?</label>
      <select id="where" class="select">${Object.entries(WHERE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <button class="btn finish" id="go">영어로 바꾸기</button>
      <p class="note" id="msg" aria-live="polite"></p>
    </section>
    <div id="result" aria-live="polite"></div>`
    : `<section class="step"><p>이 기능은 AI를 써서 <a href="#/settings">AI 교정</a>에 Gemini 키를 저장해야 쓸 수 있어요.</p></section>`}`;
  if (!hasKey) return;

  $('#go').onclick = async () => {
    const input = $('#q').value.trim();
    const msg = $('#msg');
    if (!input) { msg.textContent = '하고 싶은 말을 먼저 적어주세요.'; $('#q').focus(); return; }
    const go = $('#go');
    go.disabled = true; go.textContent = `${TUTOR}가 생각하는 중…`; msg.textContent = '';
    let r;
    try { r = await translate(input, $('#where').value); }
    catch (e) { msg.textContent = typeof e === 'string' ? e : '결과를 읽지 못했어요. 한 번 더 눌러보세요.'; return; }
    finally { go.disabled = false; go.textContent = '영어로 바꾸기'; }
    showAnswer(r, input);
  };
}

function showAnswer(r, input) {
  const card = toCard(r, input);
  const norm = (p) => p.toLowerCase().replace(/[^a-z_ ]/g, '').trim();
  const same = CARDS.find((c) => !c.mine && norm(c.pattern) === norm(card.pattern));
  const others = (Array.isArray(r.others) ? r.others : []).map((o) => ({ en: str(o && o.en), note: str(o && o.note) })).filter((o) => o.en).slice(0, 2);
  const line = (en, i) => `<div class="row"><p class="en" lang="en">${esc(en)}</p><button class="btn ghost" data-say="${i}">듣기</button></div>`;
  const speak = [card.variants[0].en, ...others.map((o) => o.en)];
  $('#result').innerHTML = `
    <section class="step">
      <p class="eyebrow">가장 자연스러운 표현</p>
      ${line(speak[0], 0)}
      ${r.why ? `<p class="why">${esc(str(r.why, 300))}</p>` : ''}
      ${others.length ? `<p class="eyebrow">이렇게도 말해요</p>${others.map((o, i) => `${line(o.en, i + 1)}<p class="ko-s">${esc(o.note)}</p>`).join('')}` : ''}
      ${same ? `<p class="tip">비슷한 패턴의 카드가 이미 있어요: <a href="#/c/${same.id}" lang="en">${esc(same.pattern)}</a></p>` : ''}
      <button class="btn finish" id="keep">내 카드로 저장하고 연습하기</button>
      <p class="hint small">카드에는 패턴 <b lang="en">${esc(card.pattern)}</b>, 비슷한 문장 ${card.variants.length}개, ${TUTOR}와의 대화가 함께 들어가요. AI가 만든 문장이라 가끔 어색할 수 있어요.</p>
    </section>`;
  $('#result').querySelectorAll('[data-say]').forEach((b) => b.onclick = () => say(speak[b.dataset.say]));
  $('#keep').onclick = () => {
    save('mycards', [...saved('mycards', []), card]);
    addMine(card);
    location.hash = '#/c/' + card.id;
  };
}
