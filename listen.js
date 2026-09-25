// 출퇴근 듣기: 한국어 → 생각할 시간 → 영어 정답을 이어서 자동 재생. 화면을 안 봐도 된다.
// app.js의 say·saved·save·esc와 review.js의 fromKey를 쓴다.

function listenSources() {
  const all = (cs) => cs.flatMap((c) => c.variants.map((v) => ({ c, v })));
  const fav = new Set(saved('fav', []));
  return [
    ['learned', '학습한 문장', Object.keys(saved('srs', {})).map(fromKey).filter(Boolean)],
    ['fav', '즐겨찾기', all(CARDS.filter((c) => fav.has(c.id)))],
    ...Object.entries(CATS).map(([k, name]) => [k, name, all(CARDS.filter((c) => c.cat === k))]),
    ['all', '전체', all(CARDS)],
  ];
}

const shuffled = (a) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

// 재생 중엔 화면이 꺼지지 않게. 화면이 꺼지면 음성 재생도 멈출 수 있다
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) {
      await wake.release();
    }
  } catch { /* 지원 안 하면 그냥 재생 */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lp && lp.playing) keepAwake(true);
});

// token이 바뀌면 이전 재생의 콜백은 모두 무시된다 (멈춤·다음·화면 이동)
let lp = null;
const later = (tok, ms, fn) => setTimeout(() => { if (lp && tok === lp.token) fn(); }, ms);

function stopListen() {
  if (!lp) return;
  lp.token++;
  lp.playing = false;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  keepAwake(false);
}

function listen() {
  const opt = { src: 'learned', gap: 3, again: false, shuffle: true, ...saved('listen', {}) };
  const sources = listenSources();
  if (!sources.find(([k, , items]) => k === opt.src && items.length)) opt.src = saved('tab', 'daily') in CATS ? saved('tab', 'daily') : 'daily';
  lp = { list: [], i: 0, playing: false, token: 0 };

  $('#app').innerHTML = `
    <header class="bar"><a href="#" class="back">← 목록</a></header>
    <h1 class="page-h">출퇴근 듣기</h1>
    <p class="hint">한국어를 듣고, 멈춘 사이에 영어로 말해본 뒤 정답을 들어요. 화면을 보지 않아도 돼요.</p>
    <section class="step">
      <label class="label" for="src">들을 문장</label>
      <select id="src" class="select">${sources.map(([k, name, items]) =>
        `<option value="${k}" ${k === opt.src ? 'selected' : ''} ${items.length ? '' : 'disabled'}>${name} (${items.length}문장)</option>`).join('')}</select>
      <label class="label" for="gap">생각할 시간</label>
      <select id="gap" class="select">${[2, 3, 5].map((s) => `<option value="${s}" ${s === opt.gap ? 'selected' : ''}>${s}초</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="again" ${opt.again ? 'checked' : ''}> 영어를 한 번 더 천천히</label>
      <label class="check"><input type="checkbox" id="shuffle" ${opt.shuffle ? 'checked' : ''}> 섞어서 듣기</label>
    </section>
    <section class="step now" aria-live="polite">
      <p class="label" id="pos"></p>
      <p class="q" id="ko">재생을 누르면 시작해요.</p>
      <p class="en" id="en"></p>
      <div class="row player">
        <button class="btn ghost" id="prev" aria-label="이전 문장">◀ 이전</button>
        <button class="btn" id="play">▶ 재생</button>
        <button class="btn ghost" id="next" aria-label="다음 문장">다음 ▶</button>
      </div>
    </section>
    <p class="hint small">재생하는 동안 화면이 꺼지지 않게 해 둘게요. 다른 앱으로 넘어가면 멈출 수 있어요.
      ${voices['ko-KR'] ? '' : '<br><b>이 기기에서 한국어 음성을 찾지 못했어요.</b> 한국어는 화면에만 나오고 소리로는 안 들릴 수 있어요.'}</p>`;

  const read = () => {
    Object.assign(opt, { src: $('#src').value, gap: Number($('#gap').value), again: $('#again').checked, shuffle: $('#shuffle').checked });
    save('listen', opt);
  };
  const load = () => {
    const items = (sources.find(([k]) => k === opt.src) || [, , []])[2];
    lp.list = opt.shuffle ? shuffled(items) : items;
    lp.i = 0;
  };
  const show = (revealEn) => {
    const it = lp.list[lp.i];
    $('#pos').textContent = it ? `${lp.i + 1} / ${lp.list.length}` : '';
    $('#ko').textContent = it ? it.v.ko : '끝까지 들었어요. 다시 들으려면 재생을 누르세요.';
    $('#en').textContent = it && revealEn ? it.v.en : '';
    $('#play').textContent = lp.playing ? '❚❚ 멈춤' : '▶ 재생';
  };

  const step = (tok) => {
    const it = lp.list[lp.i];
    if (!it) { stopListen(); lp.i = 0; show(false); $('#ko').textContent = '끝까지 들었어요. 다시 들으려면 재생을 누르세요.'; return; }
    show(false);
    const next = () => later(tok, 1200, () => { lp.i++; step(tok); });
    say(it.v.ko, 1, () => later(tok, opt.gap * 1000, () => {
      show(true);
      say(it.v.en, 0.95, () => {
        if (!lp || tok !== lp.token) return;
        if (opt.again) later(tok, 600, () => say(it.v.en, 0.75, next));
        else next();
      });
    }), 'ko-KR');
  };
  const start = () => {
    if (!lp.list.length) load();
    lp.playing = true;
    keepAwake(true);
    step(++lp.token);
  };

  $('#play').onclick = () => {
    if (lp.playing) { stopListen(); show(false); } else start();
  };
  $('#next').onclick = () => { lp.i = Math.min(lp.i + 1, lp.list.length); lp.playing ? step(++lp.token) : show(false); };
  $('#prev').onclick = () => { lp.i = Math.max(lp.i - 1, 0); lp.playing ? step(++lp.token) : show(false); };
  for (const id of ['src', 'gap', 'again', 'shuffle']) {
    $('#' + id).onchange = () => {
      read();
      if (id === 'src' || id === 'shuffle') { stopListen(); load(); show(false); }
    };
  }
  load();
  show(false);
}
