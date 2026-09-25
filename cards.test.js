// 카드 데이터 검사: 카드를 추가할 때 오타로 화면이 깨지는 걸 막는다
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { usesPattern } = require('./judge.js');

const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/cards.js', 'utf8') + ';this.CARDS=CARDS;this.SITS=SITS;', ctx);
const { CARDS, SITS } = ctx;
const RULES = fs.readFileSync(__dirname + '/app.js', 'utf8').match(/const RULES = \{([\s\S]*?)\n\};/)[1]
  .match(/^\s+(\w+):/gm).map((s) => s.trim().slice(0, -1));

test('id가 겹치지 않는다', () => {
  assert.strictEqual(new Set(CARDS.map((c) => c.id)).size, CARDS.length);
});

test('분류·상황·격식이 정해진 값이다', () => {
  for (const c of CARDS) {
    assert.ok(SITS[c.cat], `${c.id}: cat ${c.cat}`);
    assert.ok(SITS[c.cat].includes(c.sit), `${c.id}: sit ${c.sit}`);
    assert.ok(['casual', 'neutral', 'polite'].includes(c.tone), `${c.id}: tone`);
  }
});

test('변형 3개, 롤플레이 예시 답변에 패턴이 들어 있다', () => {
  for (const c of CARDS) {
    assert.strictEqual(c.variants.length, 3, c.id);
    assert.ok(usesPattern(c.key, c.roleplay.answer), `${c.id}: 예시 답변에 key가 없음`);
  }
});

test('연음 표시는 있는 규칙만 쓰고 원문과 단어가 같다', () => {
  const words = (s) => s.toLowerCase().replace(/‿/g, ' ').replace(/\((t)\)/g, '$1').replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const c of CARDS) for (const v of c.variants) {
    if (!v.link) continue;
    for (const r of v.link.rules) assert.ok(RULES.includes(r), `${c.id}: 규칙 ${r}`);
    assert.deepStrictEqual(words(v.link.text), words(v.en), `${c.id}: ${v.en}`);
  }
});
