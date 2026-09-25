// 오늘의 학습(복습 + 새 카드)과 한→영 복습 화면. app.js의 함수들(mic, say, saved…)을 쓴다.
const NEW_PER_DAY = 3;
const keyOf = (c, i) => `${c.id}:${i}`;
function fromKey(k) {
  const [id, i] = k.split(':');
  const c = CARDS.find((x) => x.id === id);
  return c && c.variants[i] ? { c, v: c.variants[i] } : null;
}

// 카드를 끝내면 그 카드의 문장들이 내일부터 복습에 나온다
function learned(c) {
  save('done', [...new Set([...saved('done', []), c.id])]);
  let s = saved('srs', {});
  c.variants.forEach((_, i) => { s = SRS.add(s, keyOf(c, i), SRS.today()); });
  save('srs', s);
}

// 복습 기능 전에 완료한 카드는 오늘 바로 복습에 넣는다
function syncSrs() {
  const yesterday = SRS.addDays(SRS.today(), -1);
  let s = saved('srs', {});
  for (const id of saved('done', [])) {
    const c = CARDS.find((x) => x.id === id);
    if (c) c.variants.forEach((_, i) => { s = SRS.add(s, keyOf(c, i), yesterday); });
  }
  save('srs', s);
  return s;
}

// 새 카드는 하루 동안 고정: 즐겨찾기 → 지금 탭 순서 → 나머지
function todayPlan() {
  const day = SRS.today();
  let plan = saved('plan', null);
  if (!plan || plan.day !== day) {
    const done = new Set(saved('done', []));
    const tab = CATS[saved('tab', 'daily')] ? saved('tab', 'daily') : 'daily';
    const order = [...saved('fav', []).map((id) => CARDS.find((c) => c.id === id)).filter(Boolean),
      ...bySit(tab).flatMap(([, cs]) => cs), ...CARDS];
    plan = { day, picks: [...new Set(order.filter((c) => !done.has(c.id)).map((c) => c.id))].slice(0, NEW_PER_DAY) };
    save('plan', plan);
  }
  return plan;
}

function todayPanel() {
  const srs = syncSrs();
  const dueN = SRS.due(srs, SRS.today()).filter(fromKey).length;
  const done = new Set(saved('done', []));
  const picks = todayPlan().picks.map((id) => CARDS.find((c) => c.id === id)).filter(Boolean);
  const left = picks.filter((c) => !done.has(c.id)).length;
  const summary = dueN || left
    ? `복습 ${dueN}문장 · 새 카드 ${left}장 · 약 ${Math.max(1, Math.ceil(dueN * 0.4 + left * 4))}분`
    : '오늘 할 일을 다 했어요. 내일 또 만나요!';
  return `<section class="today">
    <h2>오늘의 학습</h2>
    <p class="hint">${summary}</p>
    <div class="row">
      ${dueN ? `<a class="btn go" href="#/review">복습 시작 (${dueN}문장)</a>` : ''}
      <a class="btn ghost go" href="#/listen">🎧 출퇴근 듣기</a>
    </div>
    ${Object.keys(srs).length ? '' : '<p class="hint small">카드를 끝내면 그 문장들이 다음 날부터 복습에 나와요. 복습은 한국어를 보고 영어로 말하는 연습이에요.</p>'}
    <ul class="picks">${picks.map((c) => `<li class="cat-${c.cat}"><a href="#/c/${c.id}">
      <span class="p">${slot(c.pattern)}</span>${done.has(c.id) ? '<span class="done">완료</span>' : ''}</a></li>`).join('')}</ul>
  </section>`;
}

// 진행 중인 복습. 목록에 다녀와도 같은 날이면 이어서 한다
let rv = null;

function review() {
  if (!rv || rv.day !== SRS.today()) {
    const keys = SRS.due(syncSrs(), SRS.today()).filter(fromKey);
    rv = { day: SRS.today(), queue: keys.map((k) => ({ k, retry: false })), i: 0, ok: 0, total: keys.length };
  }
  const item = rv.queue[rv.i];
  if (!item) return reviewDone();
  const { c, v } = fromKey(item.k);
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a><span class="chip cat-${c.cat}">복습 ${rv.i + 1} / ${rv.queue.length}</span></header>
    <section class="step">
      <h2>한국어를 보고 영어로 말해보세요</h2>
      ${item.retry ? '<p class="hint small">아까 틀린 문장이에요. 한 번 더 연습해요.</p>' : ''}
      <p class="q">${esc(v.ko)}</p>
      <details><summary>힌트: 패턴 보기</summary><p class="en">${slot(c.pattern)}</p></details>
      <div class="row"><button class="btn" id="speak">영어로 말하기</button><button class="btn ghost" id="skip">모르겠어요</button></div>
      <div class="out" id="out" aria-live="polite"></div>
      <div id="after" hidden>
        <p class="label">정답</p>
        <p class="en">${esc(v.en)}</p>
        <div class="row">
          <button class="btn ghost" id="listen">정답 듣기</button>
          <button class="btn ghost" id="override" hidden>맞게 말했는데 인식이 틀렸어요</button>
        </div>
        <button class="btn finish" id="next">다음</button>
      </div>
    </section>`;
  let ok = null; // 첫 시도 결과만 복습 일정에 반영
  const reveal = () => { $('#after').hidden = false; };
  $('#speak').onclick = async () => {
    const heard = await mic($('#speak'), $('#out'), (h) => variantResult(v.en, h, c));
    if (!heard) return;
    if (ok === null) ok = Judge.judge(v.en, heard, c.key).passed;
    $('#override').hidden = ok;
    reveal();
  };
  $('#skip').onclick = () => {
    if (ok === null) ok = false;
    $('#override').hidden = true;
    reveal();
  };
  $('#listen').onclick = () => say(v.en);
  $('#override').onclick = () => {
    ok = true;
    $('#override').hidden = true;
    $('#out').insertAdjacentHTML('beforeend', '<p class="verdict ok">맞은 걸로 할게요</p>');
  };
  $('#next').onclick = () => {
    if (!item.retry) {
      const s = saved('srs', {});
      s[item.k] = SRS.grade(s[item.k], ok === true, SRS.today());
      save('srs', s);
      if (ok) rv.ok++;
      else rv.queue.push({ k: item.k, retry: true });
    }
    rv.i++;
    review();
    window.scrollTo(0, 0);
  };
}

function reviewDone() {
  const r = rv;
  rv = null;
  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a></header>
    <section class="step">
      <h2>${r.total ? '오늘 복습 끝!' : '오늘 복습할 문장이 없어요'}</h2>
      <p>${r.total
        ? `${r.total}문장 중 ${r.ok}문장을 한 번에 말했어요. 틀린 문장은 내일 다시 나와요.`
        : '카드를 끝내면 그 문장들이 다음 날부터 여기에 나와요.'}</p>
      <a class="btn go" href="#">목록으로</a>
    </section>`;
}
