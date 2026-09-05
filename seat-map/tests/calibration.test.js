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

t('자리는 차가 비워질 때 난다 — 회전문 정거장에서는 안 난다 (D-72)', () => {
  /* 실사용 후기가 잡아낸 규칙(나무위키 100번: "동소문로 입석 기본"):
     길음역처럼 내린 만큼 새로 타는 곳(갈아타기 회전문)에서는 하차가 커도 좌석이 안 빈다. */
  const churn = M.pSitAtStop(5, 130, 54, M.ALPHA_DEFAULT, 5);   // 하차 5 = 승차 5
  assert.strictEqual(churn, 0, `회전문인데 자리 확률이 ${churn} — 하차를 그대로 자리로 셌다`);
  const empty = M.pSitAtStop(5, 130, 54, M.ALPHA_DEFAULT, 0);   // 진짜 비워짐
  assert.ok(empty > 0, '비워지는 정거장에서 자리 확률이 0이다');
  assert.ok(empty > M.pSitAtStop(5, 130, 54, M.ALPHA_DEFAULT, 3), '승차가 늘면 자리 확률이 줄어야 한다');
  // 조건부 재차(D-59의 살아남는 절반): 못 앉고 탄 사람의 차는 평균보다 붐빈다 — 분모가 1~2 로 안 쪼그라든다
  const nearSeat = M.pSitAtStop(3, 25, 23, M.ALPHA_DEFAULT, 0);
  const naive = Math.min(M.P_STOP_CAP, 3 * M.ALPHA_DEFAULT / Math.max(1, 25 - 23));
  assert.ok(nearSeat < naive - 0.05, `조건부 보정이 사라졌다: ${nearSeat.toFixed(2)} (소박한 값 ${naive.toFixed(2)})`);
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

t('버스 요일·시간 계수는 버스 자신의 실측에서 온다 (D-64)', () => {
  const cal = load(path.join(D, 'bus', 'tdata-calib.json'));
  assert.ok(cal && cal.factors, 'tdata-calib.json 이 없다 — fetch_tdata_file.py → build_tdata_calib.js');
  const wd8 = cal.factors.trunk.weekday[8], su8 = cal.factors.trunk.sunday[8];
  // 실측(2026-08-31/30): 평일 08시 1.19, 일요일 08시 0.55. 파일이 갱신돼도 이 폭을 벗어나면 의심하라
  assert.ok(wd8 > 0.8 && wd8 < 1.7, `평일 08시 계수가 ${wd8} — 지하철 차용(1.28)과도 실측과도 멀다`);
  assert.ok(su8 > 0.3 && su8 < 0.9, `일요일 08시 계수가 ${su8}`);
  assert.ok(su8 < wd8, '일요일 아침이 평일보다 붐비게 나온다');
  // busDayFactor 가 표를 1순위로, 없으면 지하철 차용으로 무너지지 않고 물러나는지
  const RIDE = load(path.join(D, 'subway', 'ride.json'));
  const withCal = L.busDayFactor({ busCalib: cal, ride: RIDE, dayType: 'weekday' }, 'trunk', 8);
  const noCal   = L.busDayFactor({ ride: RIDE, dayType: 'weekday' }, 'trunk', 8);
  assert.strictEqual(withCal, wd8, 'busDayFactor 가 실측 표를 안 쓴다');
  assert.ok(Math.abs(noCal - L.dayFactor({ ride: RIDE, dayType: 'weekday' }, 8)) < 1e-9,
    '표가 없을 때 지하철 차용으로 물러나지 않는다');
  // 표본이 얇은 칸(null)도 조용히 0이 되지 말고 물러나야 한다
  const nullCal = { factors: { trunk: { weekday: new Array(24).fill(null) } } };
  const v = L.busDayFactor({ busCalib: nullCal, ride: RIDE, dayType: 'weekday' }, 'trunk', 8);
  assert.ok(v > 0.5, `null 칸에서 ${v} — 계수가 죽었다`);
});

t('확률 표기는 90 을 넘지 않는다 — 계산이 97·100 이어도 (D-73)', () => {
  for (const p of [0.97, 1.0, 0.91]) {
    const c = M.seatChance(p);
    assert.ok(c.percent <= 90, `${p} → ${c.percent}% 표기 — 상한이 뚫렸다`);
    assert.ok(c.text.indexOf(String(c.percent) + '%') >= 0);
  }
  assert.strictEqual(M.seatChance(1.0).label, '웬만하면 앉아 갑니다', '분류는 원값으로 매겨야 한다');
  assert.strictEqual(M.seatChance(0.68).percent, 68, '상한 아래 값이 왜곡됐다');
});

/* ── D-79·D-80 (2026-09-05): 출근 상식 전수 훑기(tools/verify_rush.js)로 잡은 것들 ──
   성수 「앉을 확률 90%」(사용자 실물 검산)에서 시작해 혼잡 원천의 빈 행·동명이역,
   그래프의 좌표·순서·지선 오류까지 내려간 수술의 회귀 시험이다. */
test('D-79 — 혼잡 원천의 빈 행·동명이역이 자료를 오염시키지 않는다', (t) => {
  const CG = load(path.join(D, 'subway', 'congestion.json'));
  if (!CG) return t.skip('congestion.json 없음');
  const slot8 = Math.round((8 * 60 - CG.startMinutes) / CG.slotMinutes);
  // 성수: 본선 외선 행은 원천이 전부 0(빈칸) → 지워야 한다. 내선은 본선(211) 값이어야 한다.
  assert.strictEqual(CG.grid['2|성수|weekday|외선'], undefined,
    '지선(9002) 행이 본선 「성수」 이름을 차지했다 — 출근 성수→시청이 90%로 나가는 원인');
  assert.ok(Math.abs(CG.grid['2|성수|weekday|내선'][slot8] - 42.2) < 3,
    '성수 내선이 본선(211) 값이 아니다');
  // 신도림: 지선(9003)의 빈 행이 본선 외선을 덮으면 「열차가 안 다닌다」가 된다.
  assert.ok(CG.grid['2|신도림|weekday|외선'][slot8] > 30,
    `신도림 외선 08시 ${CG.grid['2|신도림|weekday|외선'] && CG.grid['2|신도림|weekday|외선'][slot8]} — 빈 행이 덮었다`);
});

test('D-79 — 성수→시청(외선) 평일 08시는 이웃 값으로 메워 만원이다', (t) => {
  const NO = load(path.join(D, 'graph', 'nodes.json'));
  const RO = load(path.join(D, 'graph', 'routes.json'));
  const CG = load(path.join(D, 'subway', 'congestion.json'));
  const RD = load(path.join(D, 'subway', 'ride.json'));
  if (!NO || !RO || !CG) return t.skip('자료 없음');
  const R2 = require('../engine/route.js'), L2 = require('../engine/loads.js');
  const g = { nodes: NO.nodes, routes: RO.routes };
  const idx = R2.buildIndex(g);
  const ctx = { graph: g, congestion: CG, ride: RD, minutes: 8 * 60, dayType: 'weekday', alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L2.makeLoadFor(ctx);
  function leg(lineName, fromName, toName) {
    for (let ri = 0; ri < idx.routes.length; ri++) {
      const route = idx.routes[ri];
      if (route.kind !== 'subway' || route.name !== lineName) continue;
      for (let di = 0; di < route.dirs.length; di++) {
        const st = route.stops[di], p = st.indexOf(fromName);
        if (p < 0) continue;
        const q = st.indexOf(toName, p + 1);
        if (q < 0) continue;
        return { routeIdx: ri, dirIdx: di, fromPos: p, toPos: q, from: route.dirs[di][p], to: route.dirs[di][q],
                 stops: q - p, kind: 'subway', vehicle: route.vehicle,
                 rideMinutes: (q - p) * (route.minutes || 2), offsetMinutes: 0 };
      }
    }
    return null;
  }
  const l1 = leg('2호선', '성수', '시청');
  assert.ok(l1, '성수→시청 leg 를 못 만들었다 — 그래프 확인');
  const i1 = ctx.loadFor(l1);
  assert.ok(i1 && !i1.notRunning, '성수→시청이 안 다닌다고 나온다');
  assert.ok(i1.segments[0].load > 60,
    `성수 외선 08시 재차 ${i1.segments[0].load.toFixed(0)}명 — 출근 도심행이 이렇게 빌 수 없다(이웃 뚝섬 52%·왕십리 83%)`);
  const r1 = M.ride({ vehicle: 'subwayCar', alpha: M.ALPHA_DEFAULT, segments: i1.segments, freeSeats: i1.freeSeats });
  assert.ok(r1.pBoard < 0.3, `성수→시청 08시 탈 때 앉을 확률 ${(r1.pBoard * 100).toFixed(0)}% — 사용자 검산이 잡은 그 90%다`);
  // 4호선 미아: 방향 차 7배(실측 165 vs 24) — 방향이 뒤집히면 이 비율이 무너진다.
  const down = ctx.loadFor(leg('4호선', '미아', '동대문'));
  const up = ctx.loadFor(leg('4호선', '미아', '창동'));
  assert.ok(down.segments[0].load / up.segments[0].load > 3,
    `미아 하선/상선 = ${down.segments[0].load.toFixed(0)}/${up.segments[0].load.toFixed(0)} — 출근 비대칭이 사라졌다`);
});

test('D-80 — 지하철 그래프: 좌표·순서·지선이 실제 선형이다', (t) => {
  const NO = load(path.join(D, 'graph', 'nodes.json'));
  const RO = load(path.join(D, 'graph', 'routes.json'));
  if (!NO || !RO) return t.skip('그래프 없음');
  const nodes = NO.nodes, routes = RO.routes.filter(r => r.kind === 'subway');
  const hv = (a, b) => {
    const rd = x => x * Math.PI / 180, R = 6371e3;
    const h = Math.sin(rd(b.lat - a.lat) / 2) ** 2
      + Math.cos(rd(a.lat)) * Math.cos(rd(b.lat)) * Math.sin(rd(b.lon - a.lon) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  // ① 인접 역이 3.2km 를 넘으면 이어붙임·좌표 오류다(잠실새내↛종합운동장 16.9km 로 발각).
  for (const r of routes) for (const d of r.dirs)
    for (let k = 0; k + 1 < d.length; k++)
      assert.ok(hv(nodes[d[k]], nodes[d[k + 1]]) <= 3200,
        `${r.name} ${nodes[d[k]].name}↛${nodes[d[k + 1]].name} — 인접인데 3.2km 초과`);
  // ② 안양 좌표를 빌렸던 종합운동장은 잠실 곁으로 돌아왔다.
  const j = nodes.find(n => n.name === '종합운동장역');
  assert.ok(j && Math.abs(j.lat - 37.511) < 0.012 && Math.abs(j.lon - 127.073) < 0.012,
    `종합운동장역 ${j && j.lat + ',' + j.lon} — 안양(37.40, 126.95) 좌표다`);
  // ③ 미아·미아사거리는 딴 역이다(정규화 통이 섞는 함정).
  assert.ok(nodes.some(n => n.name === '미아역') && nodes.some(n => n.name === '미아사거리역'),
    '미아역과 미아사거리역 중 하나가 사라졌다 — 한 노드로 뭉쳐진 것');
  // ④ 지선은 본선이 아니라 제 노선이다. 본선이 지선을 경유하면 없는 선로를 태운다.
  const main2 = routes.find(r => r.name === '2호선');
  for (const nm of ['도림천', '신답', '용두', '까치산'])
    assert.ok(!main2.stops[0].includes(nm), `2호선 본선이 지선 역(${nm})을 경유한다`);
  for (const want of ['신도림', '성수', '강동']) {
    assert.ok(routes.some(r => /지선/.test(r.name) && r.stops[0][0] === want),
      `접속역 ${want}에서 시작하는 지선이 없다`);
  }
  // ⑤ 8호선은 지선이 없는 한 줄이고 남위례가 들어 있다.
  const m8 = routes.filter(r => r.line === '8');
  assert.strictEqual(m8.length, 1, '8호선이 갈라져 있다');
  assert.ok(m8[0].stops[0].includes('남위례'), '남위례(2021 신설)가 빠졌다');
});
