// 화면 모드: 기기 설정 / 라이트 / 다크. <head>에서 먼저 실행해 첫 화면이 번쩍이지 않게 한다.
// 결과는 <html data-theme="light|dark">로 표시하고, 색은 style.css가 정한다.
const Theme = (() => {
  const MODES = ['system', 'light', 'dark'];
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const get = () => {
    try { const t = JSON.parse(localStorage.getItem('theme')); return MODES.includes(t) ? t : 'system'; }
    catch { return 'system'; }
  };
  function apply() {
    const t = get();
    const dark = t === 'dark' || (t === 'system' && mq.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#0F141C' : '#EEF2F7';
  }
  function next() {
    const t = MODES[(MODES.indexOf(get()) + 1) % MODES.length];
    try { localStorage.setItem('theme', JSON.stringify(t)); } catch { /* 저장 못 해도 이번엔 적용 */ }
    apply();
    return t;
  }
  mq.addEventListener('change', apply);
  apply();
  return { get, next };
})();
