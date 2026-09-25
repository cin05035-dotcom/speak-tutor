// 간격 반복 복습 일정. 문장 하나(key = "카드id:변형번호")마다 {box, due}를 둔다.
// 성공하면 다음 상자로(간격이 늘어남), 실패하면 첫 상자로 돌아가 내일 다시.
(function (root) {
  const DAYS = [1, 3, 7, 14, 30];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function addDays(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    return ymd(new Date(y, m - 1, d + n));
  }
  const today = () => ymd(new Date());

  // 새로 배운 문장은 내일 첫 복습
  const add = (srs, key, day) => (srs[key] ? srs : { ...srs, [key]: { box: 0, due: addDays(day, 1) } });

  function grade(item, ok, day) {
    const box = ok ? Math.min((item ? item.box : 0) + 1, DAYS.length - 1) : 0;
    return { box, due: addDays(day, ok ? DAYS[box] : 1) };
  }

  // 오늘까지 복습할 문장, 오래 밀린 것부터
  const due = (srs, day) => Object.keys(srs).filter((k) => srs[k].due <= day)
    .sort((a, b) => srs[a].due.localeCompare(srs[b].due));

  const api = { DAYS, addDays, today, add, grade, due };
  if (typeof module !== 'undefined') module.exports = api;
  else root.SRS = api;
})(this);
