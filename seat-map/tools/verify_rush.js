/* verify_rush.js — 출근시간 상식 자동검증 (2026-09-05, 사용자 지시로 상설화)
   「내선·외선 같은 기본과 상식 어긋남은 스스로 찾아라」 — 사람 손 없이:
     ① 지하철 전 역·전 방향을 평일 08시로 훑어 말이 안 되는 값을 골라낸다
     ② 호선마다 주거지→도심 방향이 반대 방향보다 붐비는지(출근 비대칭) 확인한다
     ③ 잘 알려진 통근 경로 수십 쌍을 실제로 길찾기해 결과를 상식과 대조한다
   쓰는 법: node tools/verify_rush.js   (그래프·혼잡도 자료가 있어야 한다)
   여기서 걸린 것 중 굳은 사실은 tests/calibration.test.js 에 못 박는다. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const R = require('../engine/route.js');
const L = require('../engine/loads.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const NODES = load(path.join(D, 'graph', 'nodes.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const CALIB = load(path.join(D, 'bus', 'tdata-calib.json'));
if (!NODES || !ROUTES || !CONG) { console.error('자료가 없다 — pipeline 을 먼저 돌린다'); process.exit(1); }
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
function subwayLeg(route, ri, di, p, q) {
  return { routeIdx: ri, dirIdx: di, fromPos: p, toPos: q,
           from: route.dirs[di][p], to: route.dirs[di][q], stops: q - p,
           kind: 'subway', vehicle: route.vehicle,
           rideMinutes: (q - p) * (route.minutes || 2), offsetMinutes: 0 };
}
const FLAGS = [];
function flag(kind, msg) { FLAGS.push(kind + ' | ' + msg); }

/* ── ① 전 역·전 방향 훑기 (평일 08시) ─────────────────────────────────── */
console.log('① 지하철 전 역 훑기 — 평일 08:00, 한 정거장 타기 기준');
const ctx8 = ctxAt(8 * 60, 'weekday');
let scanned = 0, sureSeats = [];
for (let ri = 0; ri < index.routes.length; ri++) {
  const route = index.routes[ri];
  if (route.kind !== 'subway') continue;
  for (let di = 0; di < route.dirs.length; di++) {
    const stops = route.stops[di];
    let ranAny = false;
    for (let p = 0; p + 1 < route.dirs[di].length; p++) {
      const info = ctx8.loadFor(subwayLeg(route, ri, di, p, Math.min(p + 3, route.dirs[di].length - 1)));
      scanned++;
      if (!info) continue;
      if (info.notRunning) { flag('안다님', `${route.name} ${stops[p]}(${p}번째) 08시에 notRunning`); continue; }
      ranAny = true;
      const r = M.ride({ vehicle: route.vehicle, alpha: M.ALPHA_DEFAULT,
                         segments: info.segments, freeSeats: info.freeSeats });
      if (r.pBoard >= 0.95)
        sureSeats.push(`${route.name} ${stops[p]}→${stops[Math.min(p + 3, stops.length - 1)]} [${info.direction || '?'}] load=${info.segments[0].load.toFixed(0)}`);
    }
    if (!ranAny) flag('빈방향', `${route.name} dir${di}(${stops[0]}→${stops[stops.length - 1]}) 전 구간 계산 불능`);
  }
}
console.log(`  훑음 ${scanned}곳 · 「탈 때 거의 확실히 앉음(95%+)」 ${sureSeats.length}곳`);
sureSeats.forEach(s => console.log('   95%+:', s));

/* ── ② 출근 비대칭: 주거지 앵커에서 도심행 ≫ 도심발 ───────────────────── */
console.log('\n② 출근 비대칭 — 08시, 같은 역에서 도심행 vs 반대행 (첫 구간 재차)');
const ANCHORS = [ // [호선 이름, 주거지쪽 역, 도심쪽 역] — 그래프에 있는 이름만 쓴다
  ['2호선', '신림', '강남'], ['2호선', '성수', '시청'], ['3호선', '불광', '종로3가'],
  ['4호선', '미아', '동대문'], ['5호선', '까치산', '광화문'], ['6호선', '석계', '삼각지'],
  ['7호선', '중계', '고속터미널'], ['8호선', '암사', '잠실'], ['1호선', '제기동', '시청'],   // 청량리는 그래프 종점이라 반대행 탐침 불가
];
for (const [ln, res, cbd] of ANCHORS) {
  let toward = null, away = null;
  for (let ri = 0; ri < index.routes.length; ri++) {
    const route = index.routes[ri];
    if (route.kind !== 'subway' || route.name !== ln) continue;
    for (let di = 0; di < route.dirs.length; di++) {
      const s = route.stops[di], p = s.indexOf(res);
      if (p < 0 || p + 1 >= s.length) continue;
      const info = ctx8.loadFor(subwayLeg(route, ri, di, p, p + 1));
      if (!info || info.notRunning) continue;
      const item = { load: info.segments[0].load, side: info.direction || '?' };
      if (s.indexOf(cbd, p + 1) > p) toward = item; else away = item;
    }
  }
  if (!toward || !away) { flag('앵커없음', `${ln} ${res}→${cbd} 짝을 못 만들었다`); continue; }
  const ok = toward.load >= away.load * 0.9;   // 도심행이 뚜렷이 덜 붐비면 방향이 뒤집힌 것
  console.log(`  ${ok ? '✓' : '✗'} ${ln} ${res}: ${cbd}행[${toward.side}] ${toward.load.toFixed(0)}명 vs 반대[${away.side}] ${away.load.toFixed(0)}명`);
  if (!ok) flag('방향의심', `${ln} ${res}: 도심(${cbd})행 ${toward.load.toFixed(0)} < 반대 ${away.load.toFixed(0)} — 라벨/자료 확인`);
}

/* ── ③ 통근 경로 수십 쌍 — 실제 길찾기 결과를 상식과 대조 ─────────────── */
console.log('\n③ 통근 경로 길찾기 — 평일 08시 (역방향·이른 시각과 비교)');
function pick(name) { const h = R.findNodes(graph, name, 5); return h.length ? h[0] : null; }
function plan(fromName, toName, minutes, dayType) {
  const a = pick(fromName), b = pick(toName);
  if (!a || !b) return null;
  const found = R.search({ graph, index,
    fromNodes: R.nearbyMixed(graph.nodes, a.lat, a.lon, 900, 12),
    toNodes: R.nearbyMixed(graph.nodes, b.lat, b.lon, 900, 12),
    maxTransfers: 2, walkSpeed: 'normal' });
  const ctx = ctxAt(minutes, dayType);
  found.forEach(j => R.evaluate(j, ctx));
  return R.rank(found);
}
const PAIRS = [ // 아침에 왼쪽→오른쪽으로 사람이 쏠리는, 널리 알려진 통근 흐름
  ['수유역', '종로3가역'], ['미아역', '충무로역'], ['노원역', '시청역'], ['상계역', '을지로3가역'],
  ['신림역', '강남역'], ['성수역', '시청역'], ['잠실역', '을지로입구역'], ['천호역', '광화문역'],
  ['까치산역', '여의도역'], ['불광역', '종로3가역'], ['연신내역', '을지로입구역'], ['석계역', '삼각지역'],
  ['중계역', '고속터미널역'], ['암사역', '잠실역'], ['월곡역', '중구청'], ['길음역', '시청역'],
  ['왕십리역', '을지로입구역'], ['건대입구역', '시청역'], ['사당역', '강남역'], ['화곡역', '여의도역'],
];
let done = 0;
for (const [from, to] of PAIRS) {
  const fwd = plan(from, to, 8 * 60, 'weekday');
  if (!fwd || !fwd.length) { flag('경로없음', `${from}→${to} 08시 경로가 안 나온다`); continue; }
  done++;
  const top = fwd[0];
  const pct = top.seatChance && top.seatChance.percent;
  const line = `${from}→${to}: 1위 ${Math.round(top.totalMinutes)}분 못앉${Math.round(top.standingMinutes + top.walkMinutes)}분 앉는비율${pct === null ? '?' : pct + '%'}`;
  // 상식 ①: 출근 방향 1위가 「타는 내내 앉음」이면 의심 (걷기뿐이면 예외)
  if (!top.walkOnly && top.pSeatedShown >= 0.995)
    flag('너무낙관', `${from}→${to} 08시 1위가 내내 앉음(${top.legs.map(l => l.routeName).join('·')})`);
  // 상식 ②: 06시가 08시보다 서기 길면 의심
  const early = plan(from, to, 6 * 60, 'weekday');
  if (early && early.length && early[0].standingMinutes > top.standingMinutes + 3)
    flag('시간역전', `${from}→${to}: 06시 서기 ${early[0].standingMinutes.toFixed(0)}분 > 08시 ${top.standingMinutes.toFixed(0)}분`);
  // 상식 ③: 일요일 08시가 평일 08시보다 서기 길면 의심
  const sun = plan(from, to, 8 * 60, 'sunday');
  if (sun && sun.length && sun[0].standingMinutes > top.standingMinutes + 3)
    flag('휴일역전', `${from}→${to}: 일요일 서기 ${sun[0].standingMinutes.toFixed(0)}분 > 평일 ${top.standingMinutes.toFixed(0)}분`);
  // 상식 ④: 역방향(도심→주거지)이 같은 시각에 더 서서 가면 특기 (오류는 아니나 눈으로 볼 것)
  const rev = plan(to, from, 8 * 60, 'weekday');
  const revStand = rev && rev.length ? rev[0].standingMinutes : null;
  console.log(`  ${line}${revStand !== null ? ` (역방향 서기 ${revStand.toFixed(0)}분 vs ${top.standingMinutes.toFixed(0)}분)` : ''}`);
  if (revStand !== null && revStand > top.standingMinutes + 8)
    flag('비대칭의심', `${from}→${to}: 역방향이 ${revStand.toFixed(0)}분으로 더 서서 간다(정방향 ${top.standingMinutes.toFixed(0)}분)`);
}
console.log(`  경로 ${done}/${PAIRS.length}쌍 검사`);

/* ── ④ 「여기서 타면 앉습니다」 스윕 — 도심 목적지 4곳 ─────────────────── */
console.log('\n④ 앉는 자리 화면 — 평일 08시, 지하철 제안 전수');
for (const destName of ['시청역', '을지로입구역', '강남역', '여의도역']) {
  const d = pick(destName);
  if (!d) { flag('목적지없음', destName); continue; }
  const toNodes = R.nearbyMixed(graph.nodes, d.lat, d.lon, 900, 10);
  const sure = R.boardingPointsTo({ graph, index, toNodes, loadFor: ctx8.loadFor,
                                    alpha: M.ALPHA_DEFAULT, limit: 20, maxRideMinutes: 60, minP: 0.95 });
  const sub = sure.filter(x => x.kind === 'subway');
  console.log(`  ${destName}: 제안 ${sure.length}곳(지하철 ${sub.length})`);
  sub.forEach(x => console.log(`    지하철 95%+: ${x.routeName} ${x.boardName} [${x.headsign}] ${x.stops}정거장 빈자리${x.emptySeats}`));
}

console.log('\n══ 결론 ══');
if (!FLAGS.length) console.log('상식과 어긋나는 것을 못 찾았다.');
else { console.log(`걸린 것 ${FLAGS.length}건:`); FLAGS.forEach(f => console.log('  ⚑ ' + f)); }
