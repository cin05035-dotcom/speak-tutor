const test = require('node:test');
const assert = require('node:assert');
const { addDays, add, grade, due } = require('./srs.js');

test('날짜 계산은 월말·연말을 넘어간다', () => {
  assert.strictEqual(addDays('2026-09-30', 1), '2026-10-01');
  assert.strictEqual(addDays('2026-12-31', 3), '2027-01-03');
});

test('새 문장은 내일 첫 복습, 이미 있으면 건드리지 않는다', () => {
  const s = add({}, 'a:0', '2026-09-25');
  assert.deepStrictEqual(s['a:0'], { box: 0, due: '2026-09-26' });
  const kept = { 'a:0': { box: 3, due: '2026-10-09' } };
  assert.strictEqual(add(kept, 'a:0', '2026-09-25'), kept);
});

test('성공할수록 간격이 1→3→7→14→30일로 늘고 30일에서 멈춘다', () => {
  let item = { box: 0, due: '2026-09-25' };
  const gaps = [];
  for (let i = 0; i < 6; i++) {
    item = grade(item, true, '2026-09-25');
    gaps.push(item.due);
  }
  assert.deepStrictEqual(gaps, ['2026-09-28', '2026-10-02', '2026-10-09', '2026-10-25', '2026-10-25', '2026-10-25']);
});

test('실패하면 첫 상자로 돌아가 내일 다시', () => {
  assert.deepStrictEqual(grade({ box: 3, due: '2026-09-25' }, false, '2026-09-25'), { box: 0, due: '2026-09-26' });
});

test('오늘까지 밀린 것만, 오래된 순으로', () => {
  const s = { a: { box: 0, due: '2026-09-25' }, b: { box: 1, due: '2026-09-20' }, c: { box: 0, due: '2026-09-26' } };
  assert.deepStrictEqual(due(s, '2026-09-25'), ['b', 'a']);
});
