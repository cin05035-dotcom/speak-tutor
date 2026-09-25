// 카드 데이터 검사: 카드를 추가할 때 오타로 화면이 깨지는 걸 막는다
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const { usesPattern } = require('./judge.js');

// index.html이 불러오는 카드 파일을 그대로 따라 읽는다 (파일을 빠뜨리면 여기서 드러난다)
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const files = [...html.matchAll(/src="((?:cards|words)[^"?]*\.js)/g)].map((m) => m[1]);
const ctx = {};
vm.runInNewContext(files.map((f) => fs.readFileSync(__dirname + '/' + f, 'utf8')).join(';\n') + ';this.CARDS=CARDS;this.SITS=SITS;this.WORDS=WORDS;', ctx);
const { CARDS, SITS, WORDS } = ctx;
const RULES = fs.readFileSync(__dirname + '/app.js', 'utf8').match(/const RULES = \{([\s\S]*?)\n\};/)[1]
  .match(/^\s+(\w+):/gm).map((s) => s.trim().slice(0, -1));

test('카드 파일을 모두 불러온다', () => {
  for (const dir of ['cards', 'words']) {
    assert.deepStrictEqual(files.filter((f) => f.startsWith(dir + '/')).sort(), fs.readdirSync(__dirname + '/' + dir).map((f) => dir + '/' + f).sort());
  }
});

test('단어: id가 겹치지 않고, 이어진 카드가 있고, 예문에 단어와 카드 패턴이 들어 있다', () => {
  const { judge, tokens } = require('./judge.js');
  assert.strictEqual(new Set(WORDS.map((w) => w.id)).size, WORDS.length);
  for (const w of WORDS) {
    const c = CARDS.find((x) => x.id === w.card);
    assert.ok(c, `${w.id}: 카드 ${w.card} 없음`);
    for (const f of ['en', 'ko', 'ex', 'exKo']) assert.ok(w[f], `${w.id}: ${f} 비어 있음`);
    assert.ok(usesPattern(w.en, w.ex), `${w.id}: 예문에 단어가 없음`);
    assert.ok(usesPattern(c.key, w.ex), `${w.id}: 예문에 카드 패턴이 없음`);
    assert.ok(judge(w.ex, w.ex, c.key).passed, `${w.id}: 그대로 말해도 통과 못 함`);
  }
});

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

test('모든 문장은 그대로 말하면 통과한다 (판정이 정답을 떨어뜨리지 않는다)', () => {
  const { judge } = require('./judge.js');
  for (const c of CARDS) for (const v of c.variants) {
    const r = judge(v.en, v.en, c.key);
    assert.ok(r.passed, `${c.id}: ${v.en} → ${JSON.stringify(r)}`);
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
