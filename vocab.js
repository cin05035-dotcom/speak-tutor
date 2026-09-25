// 상황별 단어: 카드 패턴에 끼워 쓰는 단어를 익히고, 그 패턴으로 예문을 말해 본다.
// "외울래요"를 고른 단어는 복습 목록(srs 'w:단어id')에 들어가 한→영 복습에 예문으로 섞여 나온다.

const wordCard = (w) => CARDS.find((c) => c.id === w.card);
const wordsOf = (sit) => WORDS.filter((w) => (wordCard(w) || {}).sit === sit);

// 'learn' = 외울래요(복습에 넣음), 'known' = 이미 알아요
function setWord(w, state) {
  const all = saved('wstate', {});
  const s = saved('srs', {});
  const key = 'w:' + w.id;
  if (all[w.id] === state) { delete all[w.id]; delete s[key]; } // 같은 버튼을 다시 누르면 해제
  else {
    all[w.id] = state;
    if (state === 'learn') Object.assign(s, SRS.add(s, key, SRS.today()));
    else delete s[key];
  }
  save('wstate', all);
  save('srs', s);
}

function vocab(sit) {
  const ws = wordsOf(sit);
  const c0 = ws.length && wordCard(ws[0]);
  const state = saved('wstate', {});
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a>${c0 ? `<span class="chip cat-${c0.cat}">${CATS[c0.cat]} · ${esc(sit)}</span>` : ''}</header>
    <h1 class="page-h">${esc(sit)} 단어</h1>
    <p class="hint">이 상황 패턴에 끼워 쓰는 단어예요. 단어만 외우지 말고 예문으로 말해 보세요. 어울림은 추정이에요.</p>
    ${ws.length ? '' : '<p class="empty">이 상황의 단어는 아직 준비 중이에요.</p>'}
    <details class="step" open>
      <summary><h2>단어 ${ws.length}개</h2></summary>
      ${ws.map((w, i) => `<div class="word cat-${wordCard(w).cat}">
        <div class="row word-head"><p class="en" lang="en">${esc(w.en)}</p><button class="btn ghost" data-say-w="${i}">듣기</button></div>
        <p class="ko-s">${esc(w.ko)}</p>
        <p class="ex"><span lang="en">${esc(w.ex)}</span> <button class="linkish" data-say-ex="${i}">예문 듣기</button></p>
        <div class="row choice" role="group" aria-label="${esc(w.en)} 공부 상태">
          <button class="btn ghost" data-w="${i}" data-state="learn" aria-pressed="${state[w.id] === 'learn'}">외울래요</button>
          <button class="btn ghost" data-w="${i}" data-state="known" aria-pressed="${state[w.id] === 'known'}">이미 알아요</button>
        </div>
      </div>`).join('')}
      <p class="hint small">"외울래요"를 고른 단어는 내일부터 복습에 예문으로 나와요.</p>
    </details>
    ${ws.length ? `<details class="step" id="drill" open>
      <summary><h2>말해보기</h2></summary>
      <div id="drill-box"></div>
    </details>` : ''}`;

  $('#app').querySelectorAll('[data-say-w]').forEach((b) => b.onclick = () => say(ws[b.dataset.sayW].en));
  $('#app').querySelectorAll('[data-say-ex]').forEach((b) => b.onclick = () => say(ws[b.dataset.sayEx].ex));
  $('#app').querySelectorAll('[data-state]').forEach((b) => b.onclick = () => {
    setWord(ws[b.dataset.w], b.dataset.state);
    const now = saved('wstate', {})[ws[b.dataset.w].id];
    b.parentElement.querySelectorAll('[data-state]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.state === now));
  });
  if (ws.length) drill(ws, 0, 0);
}

// 한국어 뜻 + 패턴 힌트를 보고 예문을 말한다
function drill(ws, i, ok) {
  const box = $('#drill-box');
  if (!box) return;
  if (i >= ws.length) {
    box.innerHTML = `<p class="verdict ok">${ws.length}개 중 ${ok}개를 한 번에 말했어요</p>
      <button class="btn ghost" id="drill-again">처음부터 다시</button>`;
    $('#drill-again').onclick = () => drill(ws, 0, 0);
    return;
  }
  const w = ws[i];
  const c = wordCard(w);
  box.innerHTML = `
    <p class="eyebrow">${i + 1} / ${ws.length}</p>
    <p class="q">${esc(w.exKo)}</p>
    <p class="hint">단어: <b>${esc(w.ko)}</b> · 패턴: <b lang="en">${esc(c.pattern.replace('___', '~'))}</b></p>
    <div class="row"><button class="btn" id="d-speak">영어로 말하기</button><button class="btn ghost" id="d-skip">모르겠어요</button></div>
    <div class="out" id="d-out" aria-live="polite"></div>
    <div id="d-after" hidden>
      <p class="eyebrow">정답</p>
      <div class="row"><p class="en" lang="en">${esc(w.ex)}</p><button class="btn ghost" id="d-listen">듣기</button></div>
      <button class="btn finish" id="d-next">다음 단어</button>
    </div>`;
  let first = null;
  const shownAt = performance.now();
  $('#d-speak').onclick = async () => {
    const heard = await mic($('#d-speak'), $('#d-out'), (h) => variantResult(w.ex, h, c));
    if (!heard) return;
    if (first === null) {
      first = Judge.judge(w.ex, heard, c.key).passed;
      if (speechStartedAt > shownAt) $('#d-out').insertAdjacentHTML('beforeend', timeNote((speechStartedAt - shownAt) / 1000));
    }
    $('#d-after').hidden = false;
  };
  $('#d-skip').onclick = () => { if (first === null) first = false; $('#d-after').hidden = false; };
  $('#d-listen').onclick = () => say(w.ex);
  $('#d-next').onclick = () => drill(ws, i + 1, ok + (first ? 1 : 0));
}
