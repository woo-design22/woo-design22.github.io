/* 경기 광역버스 시험 (D-109) — 노선망(TAGO) + 승하차(경기데이터드림)를 서울 버스 모양으로.

   ★ 이 시험이 지키는 것 ★
   ① 그래프의 stops 열쇠와 승하차 파일의 stopId 가 어긋나면 **조용히** 종류 평균 어림으로
      물러난다(오류가 안 난다) — 잇는 열쇠가 살아 있는지 자료로 확인한다.
   ② 같은 번호가 여러 회사에 있다(3100 이 넷) — 승객이 한 노선에 눌어붙으면 안 된다.
   ③ 광역버스는 입석 금지(41석) — 만석이면 「못 탄다」로 계산돼야 한다.
*/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const L = require('../engine/loads.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const GG = ROUTES ? ROUTES.routes.filter(r => String(r.id || '').startsWith('GG-')) : [];
const HAVE = !!(ROUTES && GG.length);

if (!HAVE) console.log('\n  [건너뜀] `python pipeline/build_ggbus.py`\n');
const t = (name, fn) => test(name, { skip: !HAVE && '경기 광역버스 자료 없음' }, fn);

function busFileOf(name) {
  const f = path.join(D, 'bus', 'routes',
    String(name).replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  return load(f);
}
function ctxAt(minutes, dayType) {
  const ctx = { graph: { nodes: [], routes: ROUTES.routes }, congestion: CONG, ride: RIDE,
                busCalib: load(path.join(D, 'bus', 'tdata-calib.json')),
                kindLoad: load(path.join(D, 'bus', 'kind-load.json')),
                busRouteOf: busFileOf, minutes, dayType: dayType || 'weekday',
                alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L.makeLoadFor(ctx);
  return ctx;
}
function legOf(route, dirIdx, fromPos, toPos) {
  return { routeIdx: ROUTES.routes.indexOf(route), dirIdx, fromPos, toPos,
           stops: toPos - fromPos, kind: route.kind, vehicle: route.vehicle,
           offsetMinutes: 0 };
}

// ── ① 구조 ────────────────────────────────────────────────────────────────
t('경기 광역버스가 4백 노선 넘게 있고 이름이 안 겹친다', () => {
  assert.ok(GG.length >= 400, 'GG 노선이 ' + GG.length + '개뿐이다');
  const names = new Set();
  for (const r of GG) {
    assert.ok(!names.has(r.name), '이름이 겹친다: ' + r.name);
    names.add(r.name);
    assert.strictEqual(r.kind, 'express', r.name + ' 종류');
    assert.strictEqual(r.vehicle, 'busExpress', r.name + ' 차종');
    assert.ok(r.minutes >= 1.2 && r.minutes <= 6, r.name + ' 구간 분이 이상하다: ' + r.minutes);
    assert.strictEqual(r.dirs.length, r.stops.length, r.name + ' — dirs 와 stops 방향 수');
    for (let d = 0; d < r.dirs.length; d++)
      assert.strictEqual(r.dirs[d].length, r.stops[d].length,
        r.name + ' — 노드 열과 정류소 열쇠 열의 길이가 다르다(승하차가 어긋나 붙는다)');
  }
});

t('노선마다 승하차 파일이 있고, 그래프의 열쇠가 파일의 정류소와 실제로 잇긴다', () => {
  let checked = 0;
  for (const r of GG) {
    const doc = busFileOf(r.name);
    assert.ok(doc, r.name + ' — 승하차 파일이 없다');
    assert.strictEqual(doc.slots, 24, r.name + ' 칸 수');
    const byId = new Set(doc.stops.map(s => s.stopId));
    for (const dir of r.stops) {
      const hit = dir.filter(id => byId.has(id)).length;
      assert.ok(hit >= dir.length * 0.8,
        r.name + ' — 열쇠 ' + dir.length + '개 중 ' + hit + '개만 잇긴다');
    }
    checked++;
  }
  assert.ok(checked >= 400);
});

t('같은 번호 다른 회사 노선이 제각각 살아 있다 (3100이 넷)', () => {
  const three = GG.filter(r => /^경기 3100(\(|$)/.test(r.name));
  assert.ok(three.length >= 3, '3100 계열이 ' + three.length + '개뿐이다');
  // 서로 다른 노선이니 정류장 집합도 달라야 한다
  const sets = three.map(r => new Set(r.stops.flat()));
  for (let i = 0; i < sets.length; i++)
    for (let j = i + 1; j < sets.length; j++) {
      const inter = [...sets[i]].filter(x => sets[j].has(x)).length;
      assert.ok(inter < Math.min(sets[i].size, sets[j].size) * 0.9,
        '3100 두 노선의 정류장이 거의 같다 — 승객이 눌어붙었다');
    }
});

// ── ② 엔진 계산 ───────────────────────────────────────────────────────────
t('출근 시간 광역버스가 OD 재차로 계산되고 추정 사유가 나간다', () => {
  const cases = ['경기 8100', '경기 M4101', '경기 9407'];
  const ctx = ctxAt(8 * 60);
  for (const nm of cases) {
    const r = GG.find(x => x.name === nm);
    assert.ok(r, nm + ' 이 없다');
    const n = r.dirs[0].length;
    const info = ctx.loadFor(legOf(r, 0, 0, n - 1));
    assert.ok(info && info.segments && info.segments.length, nm + ' — 구간이 안 나왔다');
    assert.ok(!/같은 종류 버스들의 시간대 평균/.test(info.why || ''),
      nm + ' — 승하차 파일을 못 읽고 종류 평균으로 물러났다');
    const ride = M.ride({ vehicle: r.vehicle, segments: info.segments.slice(0, 5),
                          loadSigma: info.loadSigma });
    assert.ok(ride.pBoard > 0.5, nm + ' — 기점 부근인데 앉을 확률이 ' + ride.pBoard);
  }
});

t('만석 광역버스는 41석에 막힌다 — 중간 정류장은 앉기 어렵다', () => {
  const r = GG.find(x => x.name === '경기 8100');
  const ctx = ctxAt(8 * 60);
  const n = r.dirs[0].length;
  const info = ctx.loadFor(legOf(r, 0, 0, n - 1));
  const peak = Math.max.apply(null, info.segments.map(s => s.load));
  assert.ok(peak > M.VEHICLES.busExpress.seats,
    '8100 출근 첨두 재차가 ' + peak.toFixed(0) + '명 — 좌석보다 적다니 승하차가 안 붙은 것');
  // 재차가 좌석을 **넘는** 자리에서 타면 못 앉는다(입석 금지 차라 확률이 뚝 떨어져야 한다)
  let at = -1, best = -1;
  info.segments.forEach((s, i) => { if (s.load > best) { best = s.load; at = i; } });
  assert.ok(best > M.VEHICLES.busExpress.seats);
  const mid = ctx.loadFor(legOf(r, 0, at, n - 1));
  const ride = M.ride({ vehicle: r.vehicle, segments: mid.segments, loadSigma: mid.loadSigma });
  assert.ok(ride.pBoard < 0.6, '만석(재차 ' + best.toFixed(0) + '명) 구간 승차인데 앉을 확률이 '
    + Math.round(ride.pBoard * 100) + '%');
});

t('새벽 3시 낮 광역버스는 「안 다님」이다 (유령 노선 방지 규칙이 경기에도 걸린다)', () => {
  const r = GG.find(x => x.name === '경기 9407');
  const info = ctxAt(3 * 60).loadFor(legOf(r, 0, 0, Math.min(9, r.dirs[0].length - 1)));
  assert.ok(info && info.notRunning, '03시 9407 이 살아 있다');
});

// ── ③ 자료 자체 ───────────────────────────────────────────────────────────
t('승하차 값이 물리적으로 말이 된다', () => {
  let tot = 0;
  for (const nm of ['경기_8100', '경기_M4101', '경기_3100']) {
    const doc = load(path.join(D, 'bus', 'routes', nm + '.json'));
    assert.ok(doc, nm);
    for (const s of doc.stops) {
      assert.strictEqual(s.on.length, 24);
      assert.strictEqual(s.off.length, 24);
      for (let h = 0; h < 24; h++) {
        assert.ok(s.on[h] >= 0 && s.on[h] < 3000, nm + ' ' + s.name + ' 승차 이상값');
        tot += s.on[h];
      }
    }
  }
  assert.ok(tot > 100, '세 노선 승차 합이 ' + tot.toFixed(0) + ' — 자료가 비어 있다');
});
