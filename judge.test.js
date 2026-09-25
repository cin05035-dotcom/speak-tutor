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

test('내용어가 빠지면 80%를 넘어도 실패, 기능어·강조어는 빠져도 통과', () => {
  const r = judge('Can I get this to go?', 'can I get this to');
  assert.strictEqual(r.passed, false);
  assert.deepStrictEqual(r.missingCore, ['go']);
  assert.ok(judge("I've been really busy lately.", "I've been busy lately").passed);
  assert.ok(!judge("I'm not really into sports.", "I'm really into sports").passed);
});

test('목표 문장에 든 카드 패턴을 안 쓰면 실패', () => {
  const r = judge('It should take about 10 minutes.', 'it will take about 10 minutes', 'it should');
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.patternMissed, 'it should');
  // 목표 문장에 패턴이 없으면(변형이 패턴 밖) 패턴 검사를 하지 않는다
  assert.ok(judge('Can everyone see this?', 'can everyone see this', 'can you see').passed);
});

test('롤플레이에서 패턴을 썼는지 확인', () => {
  assert.ok(usesPattern('i was wondering if', 'I was wondering if you could help'));
  assert.ok(usesPattern(["i'm sorry", 'i apologize'], 'I apologize for the wait'));
  assert.ok(!usesPattern('how about', 'what about Friday'));
});
