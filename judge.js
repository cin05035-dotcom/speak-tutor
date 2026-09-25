// 음성인식 결과(heard)가 목표 문장(target)의 뜻을 전달했는지 판정한다.
// 기준은 "원어민처럼"이 아니라 "알아들었나". 단, 문맥으로 구분 안 되는 최소대립쌍은 잡아낸다.
(function (root) {
  const NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const EXPAND = { "i'm": 'i am', "i'll": 'i will', "i've": 'i have', "i'd": 'i would', "it's": 'it is',
    "that's": 'that is', "there's": 'there is', "what's": 'what is', "we're": 'we are', "you're": 'you are',
    "can't": 'can not', cannot: 'can not', "don't": 'do not', gonna: 'going to', wanna: 'want to',
    ok: 'okay', wifi: 'wi fi' };
  // 한국인이 헷갈리기 쉽고, 같은 문맥에 둘 다 들어갈 수 있는 쌍
  const PAIRS = [['walk', 'work'], ['sheet', 'shit'], ['beach', 'bitch'], ['light', 'right'], ['lice', 'rice'],
    ['fly', 'fry'], ['glass', 'grass'], ['collect', 'correct'], ['file', 'pile'], ['fan', 'pan'],
    ['coffee', 'copy'], ['leave', 'live'], ['full', 'fool'], ['ship', 'sheep'], ['sit', 'seat'], ['fill', 'feel'],
    ['13', '30'], ['14', '40'], ['15', '50'], ['16', '60'], ['17', '70'], ['18', '80'], ['19', '90']];
  // 빠져도 뜻이 거의 안 바뀌는 기능어·강조어. 나머지(내용어)는 하나라도 빠지면 통과 못 한다.
  // not·no는 뜻을 뒤집으므로 여기 넣지 않는다
  const LIGHT = new Set(('a an the i me my you your we us our he him his she her it its they them their ' +
    'this that these those is am are was were be been being do does did have has had will would can could ' +
    'should shall may might must to of for in on at by with from about as and or but if so just really very ' +
    'pretty quite please').split(' '));
  const PAIR = new Map();
  for (const [a, b] of PAIRS) { PAIR.set(a, b); PAIR.set(b, a); }

  function tokens(s) {
    return s.toLowerCase().replace(/[’‘]/g, "'").replace(/-/g, ' ').replace(/[^a-z0-9' ]/g, ' ')
      .split(/\s+/).filter(Boolean)
      .flatMap((w) => (EXPAND[w] || (w in NUM ? String(NUM[w]) : w)).split(' '));
  }

  function usesPattern(key, heard) {
    const h = ' ' + tokens(heard).join(' ') + ' ';
    return [].concat(key).some((k) => h.includes(' ' + tokens(k).join(' ') + ' '));
  }

  // key: 카드의 패턴 구절. 목표 문장에 들어 있는 패턴이면 그것도 말해야 통과
  function judge(target, heard, key = []) {
    const t = tokens(target), h = tokens(heard);
    const dp = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
    for (let i = t.length - 1; i >= 0; i--)
      for (let j = h.length - 1; j >= 0; j--)
        dp[i][j] = t[i] === h[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const matched = new Array(t.length).fill(false);
    for (let i = 0, j = 0; i < t.length && j < h.length;) {
      if (t[i] === h[j]) { matched[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const missing = t.filter((_, i) => !matched[i]);
    const hs = new Set(h);
    const confusions = missing.filter((w) => PAIR.has(w) && hs.has(PAIR.get(w)))
      .map((w) => ({ meant: w, said: PAIR.get(w) }));
    const score = t.length ? dp[0][0] / t.length : 0;
    const missingCore = [...new Set(missing.filter((w) => !LIGHT.has(w) && !hs.has(w)))];
    const pattern = [].concat(key).find((k) => usesPattern(k, target));
    const patternMissed = pattern && !usesPattern(pattern, heard) ? pattern : null;
    const passed = score >= 0.8 && !confusions.length && !missingCore.length && !patternMissed;
    return { score, passed, missing, missingCore, patternMissed, confusions };
  }

  const api = { tokens, judge, usesPattern };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Judge = api;
})(this);
