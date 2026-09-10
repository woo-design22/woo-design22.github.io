/* 환승 승차위치 시험 (D-116) — 어느 칸에서 내리면 갈아타는 길이 가장 짧은가.

   지키는 것:
   ① 자료 열쇠가 엔진이 만드는 열쇠와 같다(이름 정규화가 어긋나면 한 짝도 안 맞는다 — 실측)
   ② 방향을 못 가리면 **아무것도 주지 않는다**(반대 방향 자리를 알려주면 엉뚱한 데서 내린다)
   ③ 지하철끼리 환승에만 쓴다(버스 leg 에는 line 이 없다)
   ④ 문구가 어르신이 읽는 말이다(「10-4」가 아니라 「10번째 칸 4번 문」)
*/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TP = require('../engine/transfer-pos.js');
const T = require('../engine/transfer.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const DOC = load(path.join(D, 'subway', 'transfer-pos.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const NODES = load(path.join(D, 'graph', 'nodes.json'));
const HAVE = !!(DOC && ROUTES && NODES);

if (!HAVE) console.log('\n  [건너뜀] `python pipeline/fetch_transfer.py && python pipeline/build_transfer.py`\n');
const t = (name, fn) => test(name, { skip: !HAVE && '환승 승차위치 자료 없음' }, fn);

function graph() { return { nodes: NODES.nodes, routes: ROUTES.routes }; }
function lineOf(name) {
  return ROUTES.routes.filter(r => r.line === name && r.kind === 'subway')[0];
}
/* 그 노선에서 역 이름으로 leg 를 만든다(방향은 목적지 위치로 정한다). */
function legOn(lineName, fromNm, toNm) {
  const g = graph(), r = lineOf(lineName);
  const ri = g.routes.indexOf(r);
  for (let d = 0; d < r.dirs.length; d++) {
    const names = r.stops[d];
    const a = names.indexOf(fromNm), b = names.indexOf(toNm);
    if (a >= 0 && b > a)
      return { routeIdx: ri, dirIdx: d, fromPos: a, toPos: b, kind: 'subway',
               fromName: names[a], toName: names[b] };
  }
  return null;
}

t('자료가 있고 모양이 성하다', () => {
  const keys = Object.keys(DOC.pairs);
  assert.ok(keys.length > 200, '짝이 ' + keys.length + '개뿐이다');
  for (const k of keys) {
    assert.strictEqual(k.split('|').length, 3, '열쇠는 노선|역|갈아탈노선 셋이다: ' + k);
    const lst = DOC.pairs[k];
    assert.ok(Array.isArray(lst) && lst.length, k + ' 값이 목록이 아니다');
    for (const v of lst) {
      assert.ok(v.toward, k + ' 방면이 없다');
      assert.ok(v.off, k + ' 내릴 자리가 없다');
      if (v.sec !== undefined) assert.ok(v.sec > 0 && v.sec < 3600, k + ' 소요시간이 이상하다');
    }
  }
});

t('열쇠의 역 이름이 엔진 정규화와 같다 (「신길역」↔「신길」)', () => {
  for (const k of Object.keys(DOC.pairs)) {
    const st = k.split('|')[1];
    assert.strictEqual(T.canonStopName(st), st,
      '열쇠 역 이름이 정규화 형태가 아니다: ' + k + ' (엔진이 못 찾는다)');
  }
});

t('교대에서 2호선 → 3호선: 내릴 자리를 알려준다', () => {
  const g = graph();
  const cur = legOn('2', '방배', '교대'), next = legOn('3', '교대', '경복궁');
  assert.ok(cur && next, '구간을 못 만들었다');
  const info = TP.forTransfer(DOC.pairs, g, cur, next);
  assert.ok(info, '교대 2→3 환승 안내가 없다');
  assert.match(TP.text(info), /번째 칸/);
});

t('방향을 못 가리면 아무것도 주지 않는다', () => {
  const g = graph();
  const cur = legOn('2', '방배', '교대'), next = legOn('3', '교대', '경복궁');
  // 진행 방향 배열을 비워 「어느 쪽인지 모르는」 상태로 만든다
  const broken = Object.assign({}, cur, { toPos: 10 ** 6 });
  const info = TP.forTransfer(DOC.pairs, g, broken, next);
  assert.strictEqual(info, null, '방향을 모르는데 자리를 지어냈다 — 반대편에서 내리게 된다');
});

t('지하철끼리가 아니면 손대지 않는다', () => {
  const g = graph();
  const cur = legOn('2', '방배', '교대'), next = legOn('3', '교대', '경복궁');
  assert.strictEqual(TP.forTransfer(DOC.pairs, g, Object.assign({}, cur, { kind: 'trunk' }), next), null);
  assert.strictEqual(TP.forTransfer(DOC.pairs, g, cur, Object.assign({}, next, { kind: 'village' })), null);
  assert.strictEqual(TP.forTransfer(null, g, cur, next), null, '표가 없으면 조용히 넘어간다');
});

t('문구가 어르신이 읽는 말이다', () => {
  assert.match(TP.text({ off: '10-4', on: '1-1', sec: 214 }), /10번째 칸 4번 문/);
  assert.match(TP.text({ off: '10-4', sec: 214 }), /약 4분/);
  assert.strictEqual(TP.text({ off: 'All' }), '아무 칸에서나 내리셔도 됩니다');
  assert.strictEqual(TP.text(null), null);
  assert.strictEqual(TP.text({}), null);
});
