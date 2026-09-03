// node counsel-proxy/tests/cache.test.mjs — 프롬프트 캐싱이 지침대로 붙었는지 확인한다.
// 복사본을 만들면 그 순간 검증이 거짓말을 한다 — 진짜 파일을 읽는다.
// 복사본을 만들지 않는다 — 진짜 파일을 읽어 Deno 껍데기 아래에서 돌린다.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, '..', 'deno-proxy.js'), 'utf8').split('\r\n').join('\n');

const fakeDeno = {
  env: { get: () => '' },
  serve: () => {},
  openKv: async () => { throw new Error('no kv'); },
  upgradeWebSocket: () => { throw new Error('no ws'); }
};
const exposed = src + '\n;return { cacheSystem, cacheMessages, CACHE_MARK, CACHE_TTL, BASE_PROMPT, modeById };';
const M = new Function('Deno', 'BroadcastChannel', exposed)(fakeDeno, function () { this.onmessage = null; this.postMessage = () => {}; });

let fail = 0;
const ok = (name, cond, extra) => { console.log((cond ? '  OK  ' : ' FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fail++; };

// 1. TTL 이 1시간인가
ok('TTL = 1h', M.CACHE_TTL === '1h', M.CACHE_TTL);

// 2. 지시문 — 첫 블록과 마지막 블록 둘 다 표가 붙는가
const sys = M.cacheSystem([
  { type: 'text', text: M.BASE_PROMPT },
  { type: 'text', text: M.modeById('prt').prompt },
  { type: 'text', text: '함께상담 지시문' }
]);
ok('지시문 첫 블록에 표', !!(sys[0].cache_control && sys[0].cache_control.ttl === '1h'));
ok('지시문 마지막 블록에 표', !!(sys[2].cache_control && sys[2].cache_control.ttl === '1h'));
ok('가운데 블록은 표 없음', !sys[1].cache_control);
ok('표는 3개 이하 (상한 4개)', sys.filter(b => b.cache_control).length <= 3);

// 3. 원본을 건드리지 않는가
const orig = [{ type: 'text', text: 'a' }];
M.cacheSystem(orig);
ok('원본 지시문 안 건드림', !orig[0].cache_control);

// 4. 마지막 말에 표가 붙고 모양이 맞는가
const msgs = [{ role: 'user', content: '첫 말' }, { role: 'assistant', content: '답' }, { role: 'user', content: '둘째 말' }];
const cm = M.cacheMessages(msgs);
ok('마지막 말이 블록 배열로', Array.isArray(cm[2].content));
ok('마지막 말에 표', !!(cm[2].content[0].cache_control && cm[2].content[0].cache_control.ttl === '1h'));
ok('마지막 말 내용 보존', cm[2].content[0].text === '둘째 말');
ok('앞의 말들은 그대로', cm[0].content === '첫 말' && cm[1].content === '답');
ok('원본 messages 안 건드림', typeof msgs[2].content === 'string');

// 5. 빈 내용·빈 배열에 안 터지는가 (빈 텍스트 블록은 캐싱 불가)
ok('빈 배열 통과', M.cacheMessages([]).length === 0);
ok('빈 내용은 표 안 붙임', typeof M.cacheMessages([{ role: 'user', content: '' }])[0].content === 'string');
ok('이미 블록 배열이면 그대로', Array.isArray(M.cacheMessages([{ role: 'user', content: [{ type: 'text', text: 'x' }] }])[0].content));

// 6. 최소 토큰 512 (Opus 5) 를 넘는가 — 못 넘으면 조용히 캐싱이 안 된다
const chars = M.BASE_PROMPT.length;
ok('BASE_PROMPT 가 최소 토큰선 위', chars > 900, chars + '자 (한글은 대략 1자 이상 = 1토큰)');

// 7. JSON 으로 직렬화되는가 (실제로 보내지는 모양)
const body = JSON.stringify({ system: sys, messages: cm });
ok('요청 본문 직렬화', body.indexOf('"ttl":"1h"') > 0 && JSON.parse(body).system.length === 3);

console.log(fail ? '\n실패 ' + fail + '건' : '\n전부 통과');
process.exit(fail ? 1 : 0);
