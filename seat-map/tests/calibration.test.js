/* 보정값이 현실에 붙어 있는지 — **자료가 정답지다** (2026-09-05, D-56~D-61)

   ★ 이 시험이 있는 이유 ★
   배차·감쇠 상수가 현실과 2~3배 어긋난 채 111개 시험이 전부 초록불이었다.
   상수를 5로 바꿔도 30으로 바꿔도 통과했다 — 아무 시험도 그 값을 안 보고 있었다.
   그 상태로 「출근길 간선버스에 2자리 비어 있다(68%)」가 화면에 나갔다.
   여기 있는 시험들은 흉내(SIM)가 아니라 **저장소 안 실측**과 대조한다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const L = require('../engine/loads.js');
const SIM = require('../engine/sim-seoul.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const HAVE = !!ROUTES;
const t = (name, fn) => test(name, { skip: !HAVE && '그래프 없음' }, fn);

function busDoc(name) {
  const f = path.join(D, 'bus', 'routes', String(name).replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  return load(f);
}

t('노선별 인가 배차간격이 실려 있고, 나누는 수가 그 값을 쓴다 (D-57)', () => {
  const bus = ROUTES.routes.filter(r => r.kind !== 'subway');
  const withHw = bus.filter(r => r.headwayMin >= 3 && r.headwayMin <= 60);
  assert.ok(withHw.length / bus.length > 0.8,
    `배차간격이 실린 노선이 ${withHw.length}/${bus.length}뿐 — load_headways 가 망가졌다`);
  const r100 = bus.find(r => r.name === '100');
  assert.strictEqual(r100.headwayMin, 10, '100번 인가 배차는 10분이다 (2024-04 기준)');
  // 배차 10분 = 6대/시, 첨두 ×1.25 = 7.5대/시. 이 나누는 수가 앉을 확률을 좌우한다
  assert.ok(Math.abs(L.busesPerHour(r100, 8 * 60) - 7.5) < 0.01, 'busesPerHour 가 headwayMin 을 안 쓴다');
  // 배차를 모르는 노선은 종류별 중앙값으로 물러난다 — 옛 상수(간선 14대/시)로 돌아가면 안 된다
  assert.ok(L.busesPerHour('trunk', 8 * 60) < 8.5,
    '간선 폴백이 첨두 8.5대/시를 넘는다 — 인가대수로 낼 수 없는 배차다(D-57)');
});

t('배차 가정을 전부 더해도 서울에 있는 버스 대수를 넘지 않는다 (D-57)', () => {
  /* 시간당 대수 × 왕복 소요시간 = 그 시각에 길에 나와 있어야 하는 대수.
     서울시 공식(2026-01): 시내버스 인가 7,383대 + 마을버스 1,626대 = 9,009대.
     옛 가정은 첨두에 15,972대를 요구했다 — 서울에 있는 것의 1.8배.
     정류장당 2.0분은 인가 운행소요시간(100·143·1113번)과 대조해 얻은 값이다. */
  const SEOUL_BUSES = 9009;
  let need = 0;
  for (const r of ROUTES.routes) {
    if (r.kind === 'subway') continue;
    const stops = r.dirs.reduce((s, d) => s + d.length, 0);
    need += L.busesPerHour(r, 8 * 60) * (stops * 2.0 / 60);
  }
  assert.ok(need < SEOUL_BUSES * 1.25,
    `첨두 가정이 ${Math.round(need).toLocaleString()}대를 요구한다 — 서울 전체는 ${SEOUL_BUSES.toLocaleString()}대다`);
  assert.ok(need > SEOUL_BUSES * 0.4,
    `첨두 가정이 ${Math.round(need).toLocaleString()}대뿐 — 나누는 수가 너무 커져 버스가 텅 비게 계산된다`);
});

t('OD 감쇠가 실측 재차 곡선과 맞는다 (D-58)', () => {
  /* 버스 자료에는 정류장별 승차·하차가 둘 다 있다. 그대로 누적하면 감쇠 모형 없이
     재차 곡선이 나온다 — 그것이 정답지다. 승·하차 합이 맞는 깨끗한 방향만 골라
     「OD 최대재차 ÷ 실측 최대재차」의 중앙값이 1 근처인지 본다.
     실측 보정(2026-09-05, 08시 429개 방향): L=15 → 1.42(40% 부풀림), L=6 → 1.01. */
  const H = 8, ratios = [];
  for (const r of ROUTES.routes) {
    if (r.kind === 'subway' || r.kind === 'express') continue;
    if (ratios.length >= 120) break;
    const doc = busDoc(r.name);
    if (!doc) continue;
    const by = {}; doc.stops.forEach(s => { by[s.stopId] = s; });
    for (let di = 0; di < r.stops.length; di++) {
      const ids = r.stops[di];
      const on = ids.map(i => (by[i] ? by[i].on[H] : 0));
      const off = ids.map(i => (by[i] ? by[i].off[H] : 0));
      const sOn = on.reduce((a, b) => a + b, 0), sOff = off.reduce((a, b) => a + b, 0);
      if (sOn < 50 || Math.abs(sOn - sOff) / sOn > 0.15) continue;
      let cum = 0, bad = false, truth = 0;
      for (let i = 0; i < ids.length; i++) {
        cum += on[i] - off[i];
        if (cum < -0.05 * sOn) { bad = true; break; }
        truth = Math.max(truth, cum);
      }
      if (bad || truth <= 0) continue;
      const od = SIM.odLoads({ boardings: on, attract: off.map(v => v + 0.0001), decayStops: 6 });
      ratios.push(Math.max.apply(null, od.loads) / truth);
    }
  }
  assert.ok(ratios.length >= 40, `깨끗한 방향을 ${ratios.length}개밖에 못 모았다 — 검사가 헛돈다`);
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  assert.ok(med > 0.85 && med < 1.15,
    `OD 최대재차가 실측의 ${med.toFixed(2)}배 (표본 ${ratios.length}) — 감쇠값이 틀어졌다`);
});

t('여정 문구에는 「탈 때」가 없다 — 여정은 탈 때가 여러 번이다 (D-61)', () => {
  const j = M.seatChanceJourney(0.75), leg = M.seatChance(0.68);
  assert.ok(j.text.indexOf('탈 때') < 0, `여정 문구에 「탈 때」가 있다: ${j.text}`);
  assert.ok(j.text.indexOf('75') >= 0, '여정 문구에 퍼센트가 없다');
  assert.strictEqual(j.label, '앉을 가능성 높습니다', '다섯 단계 분류가 여정에서 빠졌다');
  assert.ok(leg.text.indexOf('탈 때') >= 0, '구간 문구는 「탈 때 앉을 확률」이어야 한다 (D-33)');
});

t('못 앉고 탄 사람은 평균보다 붐비는 차에 탄 것이다 (D-59)', () => {
  /* 재차 25/좌석 23 — 평균으로는 2명만 서 있지만, 못 앉은 사람의 차는 더 붐빈다.
     조건부 보정(k=좌석×0.11)이 빠지면 분모가 2로 쪼그라들어 「다음 정거장에 바로 앉는다」가 된다. */
  const naive = Math.min(M.P_STOP_CAP, 3 * M.ALPHA_DEFAULT / Math.max(1, 25 - 23));
  const got = M.pSitAtStop(3, 25, 23, M.ALPHA_DEFAULT, 2);
  assert.ok(got < naive - 0.05, `조건부 보정이 사라졌다: ${got.toFixed(2)} (소박한 값 ${naive.toFixed(2)})`);
  // 만원 구간에서는 보정이 티가 안 나야 한다 — 깊은 만원의 성질을 바꾸면 안 된다
  const packed = M.pSitAtStop(5, 130, 54, M.ALPHA_DEFAULT, 5);
  const packedNaive = Math.min(M.P_STOP_CAP, 5 * M.ALPHA_DEFAULT / (130 - 54 + 5));
  assert.ok(Math.abs(packed - packedNaive) < 0.01, '만원 구간에서 보정이 과하게 작동한다');
});

t('내리는 역에서 자리 나는 것은 안내하지 않는다 (D-60)', () => {
  const CG = load(path.join(D, 'subway', 'congestion.json'));
  const RD = load(path.join(D, 'subway', 'ride.json'));
  if (!CG || !RD) return;
  const N = load(path.join(D, 'graph', 'nodes.json')).nodes;
  const g = { nodes: N, routes: ROUTES.routes };
  const r4 = ROUTES.routes.find(x => x.name === '4호선');
  let di = -1, a = -1, b = -1;
  r4.stops.forEach((nm, k) => {
    const i = nm.indexOf('삼각지'), j = nm.indexOf('충무로');
    if (i >= 0 && j > i) { di = k; a = i; b = j; }
  });
  assert.ok(di >= 0, '4호선 삼각지→충무로를 못 찾았다');
  const ctx = { graph: g, congestion: CG, ride: RD, minutes: 8 * 60 + 46,
                dayType: 'weekday', alpha: M.ALPHA_DEFAULT, busRouteOf: () => null };
  ctx.loadFor = L.makeLoadFor(ctx);
  const leg = { routeIdx: ROUTES.routes.indexOf(r4), dirIdx: di, fromPos: a, toPos: b,
                kind: 'subway', vehicle: 'subwayCar', stops: b - a,
                rideMinutes: (b - a) * 2, offsetMinutes: 0 };
  const info = ctx.loadFor(leg);
  assert.ok(info && info.bestOffAt !== '충무로',
    `bestOffAt 이 내리는 역이다: ${info && info.bestOffAt} — 「충무로에서 많이 내립니다」 사고 재발`);
});

t('승객이 겪는 차는 평균 차보다 붐빈다 (D-62)', () => {
  /* 배차가 불규칙하면 승객은 벌어진 틈의 붐비는 차에 몰린다(대기시간 역설).
     실사용 후기("입석 기본")와 평균 재차(만석 언저리)의 틈을 잇는 계수다.
     T-DATA 차량별 실측이 오면 걷어낸다 — 그때까지는 1.1~1.5 밖으로 나가면 안 된다. */
  assert.ok(L.RIDER_LOAD_FACTOR >= 1.1 && L.RIDER_LOAD_FACTOR <= 1.5,
    `승객 가중 계수가 ${L.RIDER_LOAD_FACTOR} — 근거 없이 움직였다`);
});
