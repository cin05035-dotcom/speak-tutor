const test = require('node:test');
const assert = require('node:assert');
const { judge, usesPattern } = require('./judge.js');

test('문장부호·축약형·대소문자 차이는 통과', () => {
  assert.ok(judge("I'm down for that.", 'i am down for that').passed);
  assert.ok(judge("I feel like it's gonna rain.", 'I feel like it is going to rain').passed);
});

test('숫자를 글자로 인식해도 통과', () => {
  assert.ok(judge('How about 7?', 'how about seven').passed);
  assert.ok(judge('Do you have Wi-Fi here?', 'do you have wifi here').passed);
});

test('최소대립쌍 혼동은 실패로 잡는다', () => {
  const r = judge('I work from home.', 'I walk from home');
  assert.strictEqual(r.passed, false);
  assert.deepStrictEqual(r.confusions, [{ meant: 'work', said: 'walk' }]);
  assert.strictEqual(judge('It is 15 dollars.', 'it is fifty dollars').passed, false);
});

test('절반만 말하면 실패하고 빠진 말을 알려준다', () => {
  const r = judge('Could I get your phone number?', 'could I get');
  assert.strictEqual(r.passed, false);
  assert.deepStrictEqual(r.missing, ['your', 'phone', 'number']);
});

test('롤플레이에서 패턴을 썼는지 확인', () => {
  assert.ok(usesPattern('i was wondering if', 'I was wondering if you could help'));
  assert.ok(usesPattern(["i'm sorry", 'i apologize'], 'I apologize for the wait'));
  assert.ok(!usesPattern('how about', 'what about Friday'));
});
