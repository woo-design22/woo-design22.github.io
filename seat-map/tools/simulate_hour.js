/* simulate_hour.js — 한 시간 연속 시뮬레이션 (2026-09-06, 사용자 지시 「1시간동안 시뮬레이션해」)
   물결(wave) 여섯 개를 시간이 다할 때까지 돌린다. 씨앗은 물결마다 굴러가므로
   매 바퀴 다른 서울이 나온다. 위반은 종류별로 세고 앞 몇 건만 자세히 남긴다.
     W1 무작위 여정 대량 불변식 (OD·시각·요일 무작위)
     W2 회랑 시간 격자 (05:00~새벽4시 30분 간격) — 요동·심야 규칙
     W3 몬테카를로 — 무작위 지하철 구간의 해석해 vs 시뮬레이션
     W4 앉는 자리 화면 — 목적지 12곳 × 시각 4개
     W5 경유 잇기(joinJourneys) 산수
     W6 요일×시간 전체 격자 한 판
   쓰는 법: node tools/simulate_hour.js [분]   (기본 55분) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const R = require('../engine/route.js');
const L = require('../engine/loads.js');

const BUDGET_MIN = parseFloat(process.argv[2] || '55');
const T0 = Date.now();
const leftMin = () => BUDGET_MIN - (Date.now() - T0) / 60000;

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const NODES = load(path.join(D, 'graph', 'nodes.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const CALIB = load(path.join(D, 'bus', 'tdata-calib.json'));
if (!NODES || !ROUTES || !CONG) { console.error('자료가 없다'); process.exit(1); }
const graph = { nodes: NODES.nodes, routes: ROUTES.routes };
const index = R.buildIndex(graph);
const busCache = {};
function busRouteOf(name) {
  if (name in busCache) return busCache[name];
  const f = path.join(D, 'bus', 'routes', String(name).replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  return (busCache[name] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
}
function ctxAt(minutes, dayType) {
  const ctx = { graph, congestion: CONG, ride: RIDE, busCalib: CALIB, busRouteOf,
                minutes, dayType, alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L.makeLoadFor(ctx);
  return ctx;
}
function planAt(a, b, minutes, dayType) {
  const found = R.search({ graph, index,
    fromNodes: R.nearbyMixed(graph.nodes, a.lat, a.lon, 900, 12),
    toNodes: R.nearbyMixed(graph.nodes, b.lat, b.lon, 900, 12),
    fromPoint: a, toPoint: b, maxTransfers: 2, walkSpeed: 'normal' });
  const ctx = ctxAt(minutes, dayType);
  found.forEach(j => R.evaluate(j, ctx));
  return R.rank(found);
}
const pickName = n => { const h = R.findNodes(graph, n, 3); return h.length ? h[0] : null; };
const hv = (a, b) => {
  const rd = x => x * Math.PI / 180, RR = 6371e3;
  const h = Math.sin(rd(b.lat - a.lat) / 2) ** 2
    + Math.cos(rd(a.lat)) * Math.cos(rd(b.lat)) * Math.sin(rd(b.lon - a.lon) / 2) ** 2;
  return 2 * RR * Math.asin(Math.sqrt(h));
};

let seed = parseInt(process.argv[3] || '96001', 10);   // 둘째 인자 = 난수 씨앗
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pickOf = arr => arr[Math.floor(rnd() * arr.length)];

const COUNT = {};                 // 종류별 위반 수
const DETAIL = [];                // 앞 200건만 자세히
const KNOWN = /(^|·|\()8101($|·|\))/;   // 문서화된 남은 일(출근맞춤 8101)은 따로 센다
function flag(kind, msg) {
  if (KNOWN.test(msg)) kind = '알려진문제(8101)';
  COUNT[kind] = (COUNT[kind] || 0) + 1;
  if (DETAIL.length < 200) DETAIL.push(kind + ' | ' + msg);
}
const STAT = { plans: 0, journeys: 0, waves: 0, mc: 0 };

const cand = graph.nodes.filter(n => n.kinds && n.kinds.length);
const TIMES = [];
for (let m = 300; m <= 1680; m += 30) TIMES.push(m);   // 05:00 ~ 새벽 4:00
const DAYS = ['weekday', 'weekday', 'weekday', 'saturday', 'sunday'];   // 평일 가중

function checkJourneys(tag, got, minutes) {
  if (!got || !got.length) return;
  const live = got.filter(j => !j.notRunning);
  const fastest = live.length ? Math.min(...live.map(j => j.totalMinutes)) : null;
  const noSit = j => j.standingMinutes + j.walkMinutes;
  for (let i = 0; i < got.length; i++) {
    const j = got[i]; STAT.journeys++;
    const bad = m => flag('불변식', `${tag} #${i + 1}: ${m}`);
    if (i > 0 && noSit(j) < noSit(got[i - 1]) - 1e-6 && !j.walkOnly && !got[i - 1].walkOnly
        && !j.notRunning && !got[i - 1].notRunning) bad('정렬');
    if (!j.walkOnly && j.knownLegs > 0 && j.seatChance && j.seatChance.percent !== null) {
      const rs = Math.round(j.rideMinutes), vs = Math.round(j.vehicleStandingMinutes);
      const want = rs > 0 ? Math.round(100 * Math.max(0, rs - vs) / rs) : 100;
      if (j.seatChance.percent !== want) bad(`퍼센트 ${j.seatChance.percent}≠${want}`);
      if (/\b(9[1-9]|100)%/.test(j.seatChance.text)) bad('90 초과 숫자: ' + j.seatChance.text);
    }
    if (j.transfers > 2) bad('환승 3+');
    const ids = j.legs.map(l => l.routeId);
    if (new Set(ids).size !== ids.length) bad('같은 노선 2회');
    if (j.standingMinutes < -1e-6 || j.walkMinutes < -1e-6 || j.rideMinutes < -1e-6) bad('음수');
    if (j.vehicleStandingMinutes > j.rideMinutes + 1e-6) bad('차내서기>타기');
    if (!j.notRunning && fastest !== null
        && !(j.totalMinutes <= fastest * 1.6 + 1 || j.totalMinutes <= fastest + 26)) bad('가지치기');
    // 심야 규칙: 살아 있는 카드에 한해 — ★ 검색 시각이 아니라 그 구간의 탑승 시각으로 ★
    // (03시 검색이 심야버스로 이동 뒤 04:02에 첫차 201번을 태우는 것은 옳다 — 예열에서
    //  검색 시각으로 판정해 헛깃발 여덟이 섰다)
    if (!j.notRunning) for (const l of j.legs) {
      const bm = (minutes + (l.offsetMinutes || 0)) % 1440;
      if (l.kind === 'subway' && bm >= 100 && bm < 280)
        bad(`심야 ${(bm / 60).toFixed(1)}시 탑승인데 산 지하철(${l.routeName})`);
      if (l.kind !== 'subway' && l.kind !== 'night' && bm >= 95 && bm < 235)
        bad(`심야 ${(bm / 60).toFixed(1)}시 탑승인데 산 낮버스(${l.routeName})`);
    }
  }
}

/* W1 — 무작위 여정 */
function wave1(n) {
  let done = 0;
  while (done < n && leftMin() > 0.5) {
    const a = pickOf(cand), b = pickOf(cand);
    const km = hv(a, b) / 1000;
    if (km < 1.5 || km > 25) continue;
    const minutes = pickOf(TIMES), day = pickOf(DAYS);
    const got = planAt(a, b, minutes, day);
    STAT.plans++; done++;
    checkJourneys(`${a.name}→${b.name} ${day} ${Math.floor(minutes / 60)}시`, got, minutes);
  }
}

/* W2 — 회랑 시간 격자 */
const CORRIDORS = [['미아역', '충무로역'], ['신림역', '강남역'], ['화곡역', '여의도역'],
  ['천호역', '광화문역'], ['불광역', '종로3가역'], ['수유역', '시청역'], ['암사역', '잠실역'],
  ['성수역', '시청역'], ['중계역', '고속터미널역'], ['까치산역', '여의도역']];
function wave2() {
  const [f, t] = pickOf(CORRIDORS);
  const A = pickName(f), B = pickName(t);
  if (!A || !B) return;
  const dir = rnd() < 0.5 ? [A, B] : [B, A];
  const curveT = [], curveV = [];
  for (const m of TIMES) {
    if (leftMin() < 0.5) return;
    const got = planAt(dir[0], dir[1], m, 'weekday');
    STAT.plans++;
    checkJourneys(`${f}~${t} 격자 ${m}`, got, m);
    const live = (got || []).filter(j => !j.notRunning);
    const st = live.length ? Math.round(live[0].standingMinutes) : null;
    curveT.push(m); curveV.push(st);
  }
  // 요동은 「뾰족점」만 잡는다 — 양옆과 다 어긋나며 방향이 뒤집히는 점.
  // 한 방향 급감(중계 09:30→10:00 서기 27→12→2, 15분 단위 단조 실측)은 출근 꼬리의 실제 모습이고,
  // 막차~첫차 경계(01시 이후)는 차편 구성이 통째로 바뀌는 전환이라 정상이다.
  for (let i = 1; i + 1 < curveV.length; i++) {
    const a0 = curveV[i - 1], b0 = curveV[i], c0 = curveV[i + 1];
    if (a0 === null || b0 === null || c0 === null || curveT[i] >= 1470) continue;
    if ((b0 - a0 > 20 && b0 - c0 > 20) || (a0 - b0 > 20 && c0 - b0 > 20))
      flag('요동', `${dir[0].name}→${dir[1].name}: ${curveT[i]}분에 서기 ${a0}→${b0}→${c0} 뾰족점`);
  }
}

/* W3 — 몬테카를로 */
/* 질량 보존 몬테카를로 v3 — 입석 수를 내 산수가 아니라 **재차 자료**에서 읽는다.
   v1은 서 있는 하차자를 안 내렸고, v2는 입석을 자체 산수로 끌고 가다 재차가 좌석 아래로
   떨어져도(문정 154명 → 단대오거리 49명) 나를 계속 세워 뒀다 — 빈자리가 다섯인데 서 있는
   사람은 물리적으로 없다. 공리(탑승 로지스틱·순하차 D-72·α·상한 0.92)는 엔진과 공유. */
function mcLeg(info, seats, trials, alpha) {
  let hit = 0;
  const segs = info.segments;
  for (let t = 0; t < trials; t++) {
    let seated = rnd() < M.pBoard(segs[0].load, seats);
    for (let k = 0; k + 1 < segs.length && !seated; k++) {
      const A = Math.max(0, segs[k].alightAtEnd || 0), B = Math.max(0, segs[k].boardAtEnd || 0);
      const freed = Math.max(0, A - B);                          // 공리: 순하차
      const others = Math.max(0, segs[k].load - seats);          // 물리: 자료의 입석 수
      let q = Math.min(0.92, alpha * freed / Math.max(1, others + 1));
      const nextLoad = segs[k + 1].load;
      if (seats - nextLoad >= 1) q = 0.92;                       // 다음 역엔 빈자리 — 그냥 앉는다
      if (rnd() < q) seated = true;
    }
    if (seated) hit++;
  }
  return hit / trials;
}
function wave3() {
  const subs = index.routes.map((r, i) => ({ r, i })).filter(x => x.r.kind === 'subway');
  for (let n = 0; n < 6 && leftMin() > 0.5; n++) {
    const { r, i } = pickOf(subs);
    const di = rnd() < 0.5 ? 0 : 1;
    const len = r.dirs[di].length;
    if (len < 6) continue;
    const p = Math.floor(rnd() * (len - 5));
    const q = Math.min(len - 1, p + 3 + Math.floor(rnd() * 10));
    const minutes = pickOf([480, 510, 540, 750, 1110, 1140]);
    const ctx = ctxAt(minutes, 'weekday');
    const info = ctx.loadFor({ routeIdx: i, dirIdx: di, fromPos: p, toPos: q,
      from: r.dirs[di][p], to: r.dirs[di][q], stops: q - p, kind: 'subway',
      vehicle: r.vehicle, rideMinutes: (q - p) * 2, offsetMinutes: 0 });
    if (!info || info.notRunning || !info.segments || info.segments.length < 2) continue;
    const rr = M.ride({ vehicle: 'subwayCar', alpha: M.ALPHA_DEFAULT, segments: info.segments, freeSeats: info.freeSeats });
    const analytic = 1 - (1 - rr.pBoard) * (1 - rr.pDuring);
    const mc = mcLeg(info, 54, 1500, M.ALPHA_DEFAULT);
    STAT.mc++;
    if (analytic > mc * 1.3 && analytic - mc > 0.1)
      flag('모델낙관', `${r.name} ${r.stops[di][p]}→${r.stops[di][q]} ${Math.floor(minutes / 60)}시: 해석해 ${(analytic * 100).toFixed(0)}% vs MC ${(mc * 100).toFixed(0)}%`);
  }
}

/* W4 — 앉는 자리 */
const DESTS = ['시청역', '을지로입구역', '강남역', '여의도역', '노원역', '신림역', '천호역',
  '수유역', '왕십리역', '잠실역', '불광역', '고속터미널역'];
function wave4() {
  const destName = pickOf(DESTS);
  const d = pickName(destName);
  if (!d) return;
  const minutes = pickOf([480, 840, 1110, 1320]);
  const ctx = ctxAt(minutes, 'weekday');
  const toNodes = R.nearbyMixed(graph.nodes, d.lat, d.lon, 900, 10);
  const got = R.boardingPointsTo({ graph, index, toNodes, loadFor: ctx.loadFor,
    alpha: M.ALPHA_DEFAULT, limit: 20, maxRideMinutes: 60, minP: 0.95 });
  STAT.plans++;
  for (const x of got) {
    if (x.stops < 3) flag('앉는자리', `${destName} ${Math.floor(minutes / 60)}시: ${x.routeName} ${x.stops}정거장(최소 3 미만)`);
    if (x.rideMinutes > 60) flag('앉는자리', `${destName}: ${x.routeName} ${x.rideMinutes}분(60 초과)`);
    if (!(x.pBoard >= 0.95)) flag('앉는자리', `${destName}: ${x.routeName} pBoard ${(x.pBoard * 100).toFixed(0)}<95`);
  }
  const cbd = ['시청역', '을지로입구역', '강남역', '여의도역'].includes(destName);
  const subs = got.filter(x => x.kind === 'subway');
  if (cbd && minutes === 480 && subs.length > 0)
    flag('앉는자리', `${destName} 08시 지하철 확실 자리 ${subs.length}곳(${subs[0].routeName} ${subs[0].boardName})`);
}

/* W5 — 경유 잇기 산수 */
function wave5() {
  for (let n = 0; n < 4 && leftMin() > 0.5; n++) {
    const a = pickOf(cand), v = pickOf(cand), b = pickOf(cand);
    if (hv(a, v) / 1000 < 2 || hv(v, b) / 1000 < 2 || hv(a, b) / 1000 > 25) continue;
    const minutes = pickOf([480, 840, 1110]);
    const g1 = planAt(a, v, minutes, 'weekday'), g2 = planAt(v, b, minutes, 'weekday');
    STAT.plans += 2;
    if (!g1 || !g2 || !g1.length || !g2.length) continue;
    const joined = R.combineVia([g1, g2], 3, { waitAsStanding: true });
    for (const j of (joined || []).slice(0, 6)) {
      STAT.journeys++;
      const partsRide = (j.parts || []).reduce((s, p) => s + (p.rideMinutes || 0), 0);
      if (Math.abs(partsRide - j.rideMinutes) > 0.5)
        flag('경유산수', `${a.name}→${v.name}→${b.name}: 타기 합 ${partsRide.toFixed(1)} ≠ ${j.rideMinutes.toFixed(1)}`);
      if (j.seatChance && j.seatChance.percent !== null && j.knownLegs !== 0) {
        const rs = Math.round(j.rideMinutes), vs = Math.round(j.vehicleStandingMinutes);
        const want = rs > 0 ? Math.round(100 * Math.max(0, rs - vs) / rs) : 100;
        if (j.seatChance.percent !== want)
          flag('경유산수', `${a.name}→${v.name}→${b.name}: 퍼센트 ${j.seatChance.percent}≠${want}`);
      }
    }
  }
}

/* W6 — 요일×시간 한 판 */
function wave6() {
  const [f, t] = pickOf(CORRIDORS);
  const A = pickName(f), B = pickName(t);
  if (!A || !B) return;
  for (const dm of [[480, 'weekday'], [480, 'saturday'], [480, 'sunday'],
                    [1110, 'weekday'], [1110, 'sunday']]) {
    if (leftMin() < 0.5) return;
    const got = planAt(A, B, dm[0], dm[1]);
    STAT.plans++;
    checkJourneys(`${f}→${t} ${dm[1]} ${dm[0]}`, got, dm[0]);
  }
}

console.log(`시작 — 예산 ${BUDGET_MIN}분, 노드 ${graph.nodes.length} · 노선 ${graph.routes.length}`);
while (leftMin() > 0.5) {
  STAT.waves++;
  wave1(30); if (leftMin() <= 0.5) break;
  wave2(); if (leftMin() <= 0.5) break;
  wave3(); if (leftMin() <= 0.5) break;
  wave4(); wave5(); wave6();
  if (STAT.waves % 3 === 0)
    console.log(`  …${STAT.waves}바퀴, ${Math.round(BUDGET_MIN - leftMin())}분 경과, 길찾기 ${STAT.plans}회 · 여정 ${STAT.journeys}개 · MC ${STAT.mc}구간 · 위반종류 ${Object.keys(COUNT).length}`);
}

console.log('\n══ 한 시간 시뮬레이션 결론 ══');
console.log(`바퀴 ${STAT.waves} · 길찾기 ${STAT.plans}회 · 여정 ${STAT.journeys}개 · 몬테카를로 ${STAT.mc}구간`);
const kinds = Object.keys(COUNT);
if (!kinds.length) console.log('위반 0건 — 상식·불변식이 전부 버텼다.');
else {
  for (const k of kinds) console.log(`  ${k}: ${COUNT[k]}건`);
  console.log('― 자세히 (앞 200건 한도):');
  DETAIL.forEach(d => console.log('  ⚑ ' + d));
}
