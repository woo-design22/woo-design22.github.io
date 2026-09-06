/* build_kind_load.js — 종류별 「대당 평균 재차」 곡선 (D-86, 2026-09-06 사용자 지시)
   승하차 자료가 없는 버스(일부 마을·앞으로 들어올 경기 버스)를 「알 수 없음」으로만 두지
   말고, **같은 종류 버스들의 같은 시간대 평균**으로 어림하라는 지시.
   자료가 있는 전 노선에 대해 시간대별 대당 평균 재차(엔진과 같은 셈: OD 배분 ÷ 시간당
   대수)를 구해 종류별 중앙값을 저장한다. 요일 계수·승객 가중은 런타임에 늘 하던 대로
   얹으므로 여기서는 평일 원값(계수 1)만 만든다.
   사용: node pipeline/build_kind_load.js  →  data/bus/kind-load.json */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const SIM = require('../engine/sim-seoul.js');
const L = require('../engine/loads.js');

const D = path.join(__dirname, '..', 'data');
const RDIR = path.join(D, 'bus', 'routes');
const graph = JSON.parse(fs.readFileSync(path.join(D, 'graph', 'routes.json'), 'utf8')).routes;
const headways = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(D, 'bus', 'headways.json'), 'utf8')).routes; }
  catch (e) { return {}; }
})();
const DECAY = { village: 5, branch: 6, trunk: 6, night: 6, circular: 5, express: 20 };

const acc = {};   // kind → hour → [route 평균들]
let used = 0;
for (const f of fs.readdirSync(RDIR)) {
  if (!f.endsWith('.json')) continue;
  const doc = JSON.parse(fs.readFileSync(path.join(RDIR, f), 'utf8'));
  if (!doc.stops || doc.stops.length < 5) continue;
  const g = graph.find(r => r.name === doc.route);
  const kind = (g && g.kind) || 'branch';
  const hw = headways[doc.route];
  const routeObj = { kind, headwayMin: hw && hw.headwayMin };
  used++;
  for (let h = 0; h < 24; h++) {
    const on = doc.stops.map(s => s.on[h] || 0);
    const off = doc.stops.map(s => (s.off[h] || 0) + 0.0001);
    const total = on.reduce((a, b) => a + b, 0);
    if (total < 1) continue;
    const od = SIM.odLoads({ boardings: on, attract: off, decayStops: DECAY[kind] || 6 }).loads;
    const per = L.busesPerHour(routeObj, h * 60);
    if (!(per > 0)) continue;
    const mean = od.reduce((a, b) => a + b, 0) / od.length / per;
    (acc[kind] = acc[kind] || {})[h] = acc[kind][h] || [];
    acc[kind][h].push(mean);
  }
}
const out = { note: '종류×시간대 「대당 평균 재차」(평일 원값 — 요일 계수·승객 가중 ×1.25 는 런타임에 얹는다). ' +
                    '승하차 자료가 없는 노선의 어림용(D-86). 자료 있는 노선의 중앙값.',
              madeFrom: used, kinds: {} };
for (const kind of Object.keys(acc)) {
  const row = [];
  for (let h = 0; h < 24; h++) {
    const v = (acc[kind][h] || []).sort((a, b) => a - b);
    row.push(v.length ? +v[Math.floor(v.length / 2)].toFixed(2) : 0);
  }
  out.kinds[kind] = row;
  console.log(kind.padEnd(9), '표본', (acc[kind][8] || []).length, '· 08시 중앙값',
    row[8], '· 18시', row[18], '· 03시', row[3]);
}
fs.writeFileSync(path.join(D, 'bus', 'kind-load.json'), JSON.stringify(out));
console.log('저장: data/bus/kind-load.json (노선 ' + used + '개 기반)');
