/* calibrate_bus_load.js — 버스 재차 추정을 **실측 혼잡 단계**에 맞춘다 (D-101).

★ 왜 ★
사용자가 「141번 탈 때 앉을 확률 1%가 맞냐」고 물었다. 우리 수집기가 모은 실시간 혼잡
단계(서울 BIS, 여유=「좌석에 앉을 수 있는 정도」)를 보니 **15시 간선버스의 75.7%가 여유**다.
1% 는 명백한 과대추정이었다. 그 어긋남의 크기를 **자료로** 재서 배율을 정한다.

방법 — 같은 노선·같은 시간대에서
  실측: 그 시각 그 노선 차량들 가운데 「여유」 비율   (사람이 센 것과 같은 값)
  모형: 그 노선 모든 정류장의 대당 재차 ≤ 좌석수 인 비율
두 값이 같아지도록 재차에 곱할 배율 f 를 이분법으로 찾는다(종류별).
f 는 「우리 추정이 실제보다 몇 배 부풀어 있었나」를 뜻한다.

쓰는 법: node pipeline/calibrate_bus_load.js   → data/bus/load-calib.json
*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SIM = require('../engine/sim-seoul.js');
const L = require('../engine/loads.js');
const M = require('../engine/seat-model.js');

const D = path.join(__dirname, '..', 'data');
const RDIR = path.join(D, 'bus', 'routes');
const graph = JSON.parse(fs.readFileSync(path.join(D, 'graph', 'routes.json'), 'utf8')).routes;
const headways = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(D, 'bus', 'headways.json'), 'utf8')).routes; }
  catch (e) { return {}; }
})();
const DECAY = { village: 5, branch: 6, trunk: 6, night: 6, circular: 5, express: 20 };

/* ── ① 실측: 노선×시간대별 「여유」 비율 ─────────────────────────────── */
const obs = {};          // route|hour → {ok, all}
const vdir = path.join(D, 'raw', 'variance');
for (const f of (fs.existsSync(vdir) ? fs.readdirSync(vdir) : [])) {
  if (!f.endsWith('.jsonl')) continue;
  for (const ln of fs.readFileSync(path.join(vdir, f), 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    let r; try { r = JSON.parse(ln); } catch (e) { continue; }
    const h = +r.t.slice(11, 13);
    const key = r.route + '|' + h;
    const o = obs[key] || (obs[key] = { ok: 0, all: 0, kind: r.kind });
    for (const v of r.veh) {
      if (!(v[1] > 0)) continue;         // 0 = 자료 없음
      o.all++;
      if (v[1] === 3) o.ok++;            // 3 = 여유 = 좌석에 앉을 수 있는 정도
    }
  }
}

/* ── ② 모형: 같은 노선×시간대의 정류장별 대당 재차 ───────────────────── */
function modelLoads(routeName, hour) {
  const file = path.join(RDIR, routeName.replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  if (!fs.existsSync(file)) return null;
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!doc.stops || doc.stops.length < 5) return null;
  const g = graph.find(r => r.name === routeName);
  const kind = (g && g.kind) || 'branch';
  const hw = headways[routeName];
  const per = L.busesPerHour({ kind: kind, headwayMin: hw && hw.headwayMin }, hour * 60);
  if (!(per > 0)) return null;
  const on = doc.stops.map(s => s.on[hour] || 0);
  const off = doc.stops.map(s => (s.off[hour] || 0) + 0.0001);
  if (on.reduce((a, b) => a + b, 0) < 1) return null;
  const od = SIM.odLoads({ boardings: on, attract: off, decayStops: DECAY[kind] || 6 }).loads;
  const seats = M.VEHICLES[(g && g.vehicle) || 'busTrunk'].seats;
  return { loads: od.map(v => v / per), seats: seats, kind: kind };
}

/* ── ③ 배율 찾기 (종류별 이분법) ─────────────────────────────────────── */
const pool = {};         // kind → [{loads, seats, pObs, n}]
for (const key of Object.keys(obs)) {
  const o = obs[key];
  if (o.all < 40) continue;                       // 표본이 얇으면 쓰지 않는다
  const [routeName, hourStr] = key.split('|');
  const m = modelLoads(routeName, +hourStr);
  if (!m) continue;
  (pool[m.kind] || (pool[m.kind] = [])).push({ loads: m.loads, seats: m.seats,
                                               pObs: o.ok / o.all, n: o.all });
}
function pModel(rows, f) {                        // 배율 f 일 때 「좌석 여유」 비율
  let num = 0, den = 0;
  for (const r of rows) {
    let ok = 0;
    for (const v of r.loads) if (v * f <= r.seats) ok++;
    num += (ok / r.loads.length) * r.n;
    den += r.n;
  }
  return den ? num / den : 0;
}
function pObsAvg(rows) {
  let num = 0, den = 0;
  for (const r of rows) { num += r.pObs * r.n; den += r.n; }
  return den ? num / den : 0;
}
const out = { note: '버스 재차 배율 — 실측 혼잡 단계(여유 비율)에 맞춘 값. 1보다 작으면 우리 추정이 부풀어 있었다는 뜻.',
              madeAt: new Date().toISOString().slice(0, 10), kinds: {}, byHour: {} };
/* 시간대별로도 본다 — 평균 하나로는 「낮에는 과대, 아침에는 과소」가 상쇄돼 보이지 않는다. */
{
  const perHour = {};
  for (const key of Object.keys(obs)) {
    const o = obs[key];
    if (o.all < 40) continue;
    const [rn, hs] = key.split('|');
    const m = modelLoads(rn, +hs);
    if (!m) continue;
    const kk = m.kind + '|' + hs;
    (perHour[kk] || (perHour[kk] = [])).push({ loads: m.loads, seats: m.seats, pObs: o.ok / o.all, n: o.all });
  }
  const tbl = Object.keys(perHour).sort();
  for (const kk of tbl) {
    const rows = perHour[kk];
    const target = pObsAvg(rows);
    let lo = 0.05, hi = 4.0, f = 1;
    for (let i = 0; i < 40; i++) { f = (lo + hi) / 2; if (pModel(rows, f) > target) lo = f; else hi = f; }
    out.byHour[kk] = +f.toFixed(3);
    (out.base || (out.base = {}))[kk] = +target.toFixed(3);   // 실측 「여유」 비율 그 자체(D-101)
    const [kind, h] = kk.split('|');
    if (kind === 'trunk')
      console.log('  간선 ' + String(h).padStart(2) + '시  실측 여유 ' + (target * 100).toFixed(1) + '%'
        + ' · 모형(보정전) ' + (pModel(rows, 1) * 100).toFixed(1) + '%  → 배율 ' + f.toFixed(2)
        + '  (짝 ' + rows.length + ')');
  }
}
for (const kind of Object.keys(pool)) {
  const rows = pool[kind];
  const target = pObsAvg(rows);
  let lo = 0.05, hi = 3.0, f = 1;
  for (let i = 0; i < 40; i++) {                  // 이분법: f 가 커지면 여유 비율은 준다
    f = (lo + hi) / 2;
    if (pModel(rows, f) > target) lo = f; else hi = f;
  }
  out.kinds[kind] = +f.toFixed(3);
  console.log(kind.padEnd(9), '노선×시간 짝', String(rows.length).padStart(3),
    '· 실측 여유', (target * 100).toFixed(1) + '%',
    '· 보정 전 모형', (pModel(rows, 1) * 100).toFixed(1) + '%',
    '→ 배율', f.toFixed(3),
    '(보정 후', (pModel(rows, f) * 100).toFixed(1) + '%)');
}
fs.writeFileSync(path.join(D, 'bus', 'load-calib.json'), JSON.stringify(out));
console.log('저장: data/bus/load-calib.json');
