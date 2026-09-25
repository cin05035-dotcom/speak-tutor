// 대화 이어가기: 카드 3단계에서 Mia와 여러 번 주고받는다 (Gemini 키가 있을 때만).
// Mia는 이 카드 패턴과 이미 배운 패턴을 쓸 기회를 만들고, 틀린 말은 흐름을 끊지 않게 짧게만 짚는다.
const CHAT_TURNS = 4; // 사용자가 말하는 횟수

// 복습 목록에 있는 다른 카드의 패턴 (대화에서 다시 꺼내 쓰게)
function learnedPatterns(except) {
  const ids = new Set(Object.keys(saved('srs', {})).map((k) => k.split(':')[0]));
  ids.delete(except.id);
  return [...ids].map((id) => CARDS.find((c) => c.id === id)).filter(Boolean).slice(0, 8).map((c) => c.pattern);
}

async function chatTurn(card, history, final) {
  const data = await gemini(saved('gemini', ''), {
    systemInstruction: { parts: [{ text:
      `You are ${TUTOR}, a friendly 27-year-old American from Chicago, role-playing with a Korean learner in their 20s.
Situation: ${card.when} (category: ${CATS[card.cat]}, politeness: ${card.tone}).
Target pattern to practice: "${card.pattern}". Patterns the learner already studied: ${JSON.stringify(learnedPatterns(card))}.
Stay in character. Keep each reply short and spoken (1-2 sentences, under 20 words). Naturally create chances for the learner to use the target pattern (and sometimes a studied pattern), but never tell them which phrase to use.
The learner's lines come from speech recognition: ignore spelling, punctuation and capitalization, never comment on pronunciation.
Also judge ONLY the learner's latest line: verdict natural/ok/awkward/wrong; "better" is a more natural version in English (same as their line if natural); "why" is one short Korean sentence (해요체).
If "final" is true, "reply" is a natural closing line, and fill "summary": "good" = what they did well (Korean, 1-2 sentences), "fixes" = up to 3 of the learner's lines from the whole conversation worth improving. Otherwise leave summary.good empty and summary.fixes [].` }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ history, final }) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', required: ['verdict', 'better', 'why', 'reply', 'reply_ko', 'summary'], properties: {
        verdict: { type: 'STRING', enum: Object.keys(VERDICT) },
        better: { type: 'STRING' }, why: { type: 'STRING' },
        reply: { type: 'STRING' }, reply_ko: { type: 'STRING' },
        summary: { type: 'OBJECT', required: ['good', 'fixes'], properties: {
          good: { type: 'STRING' },
          fixes: { type: 'ARRAY', items: { type: 'OBJECT', required: ['said', 'better', 'why'], properties: {
            said: { type: 'STRING' }, better: { type: 'STRING' }, why: { type: 'STRING' } } } },
        } },
      } },
    },
  });
  const r = JSON.parse(data.candidates[0].content.parts[0].text);
  const fixes = (r.summary && Array.isArray(r.summary.fixes) ? r.summary.fixes : [])
    .map((f) => ({ said: str(f && f.said), better: str(f && f.better), why: str(f && f.why) })).filter((f) => f.better).slice(0, 3);
  return {
    verdict: VERDICT[r.verdict] ? r.verdict : 'ok', better: str(r.better), why: str(r.why),
    reply: str(r.reply) || 'Sounds good!', reply_ko: str(r.reply_ko),
    summary: { good: str(r.summary && r.summary.good, 300), fixes },
  };
}

const miaBubble = (en, ko) => `<div class="bubble mia">
    <p class="who">${TUTOR}</p>
    <div class="row"><button class="btn ghost" data-replay="${esc(en)}">듣기</button></div>
    <details><summary>자막 보기</summary><p class="en" lang="en">${esc(en)}</p>${ko ? `<p class="ko-s">${esc(ko)}</p>` : ''}</details>
  </div>`;

function startChat(card, box) {
  const history = [{ speaker: TUTOR, text: card.roleplay.tutor }];
  let n = 0;
  box.innerHTML = `
    <summary><h2><span>3</span>대화에 써보기</h2></summary>
    <p class="hint">${TUTOR}와 ${CHAT_TURNS}번 주고받아요. ${TUTOR}의 말은 소리로 먼저 들어보고, 안 들리면 자막을 여세요. 이 카드 표현을 한 번은 써보세요.</p>
    <div class="chat" id="chat">${miaBubble(card.roleplay.tutor, card.roleplay.ko)}</div>
    <div class="row" id="talk-ctl">
      <button class="btn" id="talk-mic">대답하기</button>
      <button class="btn ghost" id="talk-hint">힌트</button>
    </div>
    <p class="tip" id="talk-hint-out" hidden>이 카드 표현: <b lang="en">${esc(card.pattern)}</b> — ${esc(card.ko)}</p>
    <div id="talk-end"></div>`;
  const chat = $('#chat');
  const add = (html) => { chat.insertAdjacentHTML('beforeend', html); chat.lastElementChild.scrollIntoView({ block: 'nearest' }); };
  box.onclick = (e) => { const b = e.target.closest('[data-replay]'); if (b) say(b.dataset.replay); };
  $('#talk-hint').onclick = () => { $('#talk-hint-out').hidden = false; };
  // 첫 마디는 자동 재생하지 않는다 (카드를 연 순간엔 3단계가 아직 숨겨져 있다)

  const turn = async (heard) => {
    const final = n >= CHAT_TURNS;
    add(`<div class="bubble me"><p class="en" lang="en">${esc(heard)}</p><div class="fb"></div></div>`);
    const fb = chat.lastElementChild.querySelector('.fb');
    add(`<p class="hint small thinking">${TUTOR}가 생각하는 중…</p>`);
    const thinking = chat.lastElementChild;
    let r;
    try { r = await chatTurn(card, history, final); }
    catch (err) {
      thinking.outerHTML = `<p class="note">${esc(typeof err === 'string' ? err : '대답을 읽지 못했어요.')} <button class="btn ghost" id="talk-retry">다시 시도</button></p>`;
      $('#talk-retry').onclick = (e) => { e.target.parentElement.remove(); chat.lastElementChild.remove(); turn(heard); };
      return;
    }
    thinking.remove();
    if (r.verdict === 'awkward' || r.verdict === 'wrong') {
      fb.innerHTML = `<p class="fix">더 자연스럽게: <b lang="en">${esc(r.better)}</b></p>${r.why ? `<p class="ko-s">${esc(r.why)}</p>` : ''}`;
    }
    history.push({ speaker: TUTOR, text: r.reply });
    add(miaBubble(r.reply, r.reply_ko));
    say(r.reply);
    if (final) endChat(card, history, r.summary);
    else $('#talk-mic').disabled = false;
  };

  $('#talk-mic').onclick = async () => {
    const heard = await mic($('#talk-mic'), $('#talk-end'), () => '');
    if (!heard) return;
    n++;
    history.push({ speaker: 'Learner', text: heard });
    $('#talk-mic').disabled = true;
    turn(heard);
  };
}

function endChat(card, history, summary) {
  $('#talk-ctl').hidden = true;
  const mine = history.filter((h) => h.speaker === 'Learner').map((h) => h.text);
  const used = mine.some((t) => Judge.usesPattern(card.key, t));
  $('#talk-end').innerHTML = `
    <div class="summary">
      <p class="eyebrow">대화 정리</p>
      <p class="verdict ${used ? 'ok' : 'bad'}">${used ? '이 카드 표현을 썼어요' : '이 카드 표현은 아직 안 썼어요'}</p>
      ${summary.good ? `<p class="why">${esc(summary.good)}</p>` : ''}
      ${summary.fixes.length ? `<p class="eyebrow">이렇게 고치면 더 자연스러워요</p>
        <ul class="fixes">${summary.fixes.map((f) => `<li>${f.said ? `<span class="ko-s" lang="en">${esc(f.said)}</span><br>` : ''}→ <b lang="en">${esc(f.better)}</b>${f.why ? `<br><span class="ko-s">${esc(f.why)}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <button class="btn ghost" id="talk-again">다시 대화하기</button>
    </div>`;
  $('#talk-again').onclick = () => startChat(card, $('#talk'));
}
