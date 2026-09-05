/* verify_deep.js — 심층 상식 검증·시뮬레이션 (2026-09-06, 사용자 지시)
   verify_rush.js(아침 훑기)보다 넓고 깊게:
     A. 퇴근(18:30) 비대칭 — 아침의 거울인지
     B. 시간 곡선 — 한 경로를 05~23시로 돌려 출근·퇴근 쌍봉이 나오는지, 요동은 없는지
     C. 요일 곡선 — 평일 ≥ 토 ≥ 일
     D. 무작위 수십 쌍 — 씨앗 고정 난수로 서울 전역 OD를 만들어 모든 카드의 불변식 검사
     E. 심야·새벽 — 02시에 지하철·낮버스가 나오면 안 된다, 00:30 지하철은 나와야 한다
     F. 극단 — 최고 혼잡 구간(사당→방배), 초단거리 걷기, 공항→도심
     G. 앉는 자리 퇴근판 — 집으로 가는 목적지로 뒤집어 본다
     H. 몬테카를로 — 좌석 모델의 해석해와 무작위 시뮬레이션을 맞대 본다
   쓰는 법: node tools/verify_deep.js */
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
function pick(name) { const h = R.findNodes(graph, name, 5); return h.length ? h[0] : null; }
function planAt(a, b, minutes, dayType) {
  if (!a || !b) return null;
  const found = R.search({ graph, index,
    fromNodes: R.nearbyMixed(graph.nodes, a.lat, a.lon, 900, 12),
    toNodes: R.nearbyMixed(graph.nodes, b.lat, b.lon, 900, 12),
    fromPoint: a, toPoint: b,          // 걷기 경로는 이 두 점이 있어야 만들어진다(앱과 동일)
    maxTransfers: 2, walkSpeed: 'normal' });
  const ctx = ctxAt(minutes, dayType);
  found.forEach(j => R.evaluate(j, ctx));
  return R.rank(found);
}
const plan = (f, t, m, d) => planAt(pick(f), pick(t), m, d);
const FLAGS = [];
const flag = (k, m) => FLAGS.push(k + ' | ' + m);
const hv = (a, b) => {
  const rd = x => x * Math.PI / 180, RR = 6371e3;
  const h = Math.sin(rd(b.lat - a.lat) / 2) ** 2
    + Math.cos(rd(a.lat)) * Math.cos(rd(b.lat)) * Math.sin(rd(b.lon - a.lon) / 2) ** 2;
  return 2 * RR * Math.asin(Math.sqrt(h));
};

/* ── A. 퇴근 비대칭 (18:30) — 아침의 거울 ────────────────────────────── */
console.log('A. 퇴근 비대칭 — 평일 18:30, 주거지 앵커에서 「집으로」 ≥ 「도심으로」');
const ANCHORS = [
  ['2호선', '신림', '강남'], ['2호선', '성수', '시청'], ['3호선', '불광', '종로3가'],
  ['4호선', '미아', '동대문'], ['5호선', '까치산', '광화문'], ['6호선', '석계', '삼각지'],
  ['7호선', '중계', '고속터미널'], ['8호선', '암사', '잠실'], ['1호선', '제기동', '시청'],
];
const ctxEve = ctxAt(18 * 60 + 30, 'weekday');
for (const [ln, res, cbd] of ANCHORS) {
  let toward = null, away = null;
  for (let ri = 0; ri < index.routes.length; ri++) {
    const route = index.routes[ri];
    if (route.kind !== 'subway' || route.name !== ln) continue;
    for (let di = 0; di < route.dirs.length; di++) {
      const s = route.stops[di], p = s.indexOf(res);
      if (p < 0 || p + 1 >= s.length) continue;
      const info = ctxEve.loadFor({ routeIdx: ri, dirIdx: di, fromPos: p, toPos: p + 1,
        from: route.dirs[di][p], to: route.dirs[di][p + 1], stops: 1, kind: 'subway',
        vehicle: route.vehicle, rideMinutes: route.minutes || 2, offsetMinutes: 0 });
      if (!info || info.notRunning) continue;
      const item = { load: info.segments[0].load };
      if (s.indexOf(cbd, p + 1) > p) toward = item; else away = item;
    }
  }
  if (!toward || !away) { flag('A앵커없음', `${ln} ${res}`); continue; }
  const ok = away.load >= toward.load * 0.9;   // 저녁엔 집 방향이 덜 붐비면 이상하다
  console.log(`  ${ok ? '✓' : '✗'} ${ln} ${res}: 집방향 ${away.load.toFixed(0)}명 vs 도심행 ${toward.load.toFixed(0)}명`);
  if (!ok) flag('A퇴근방향', `${ln} ${res}: 18:30 집방향 ${away.load.toFixed(0)} < 도심행 ${toward.load.toFixed(0)}`);
}

/* ── B. 시간 곡선 — 쌍봉과 요동 ──────────────────────────────────────── */
console.log('\nB. 시간 곡선 — 1위 경로의 서는 시간, 05~23시 (평일)');
// 아침 봉우리는 출근 방향(정방향)에서, 저녁 봉우리는 퇴근 방향(역방향)에서 본다 —
// 미아→충무로의 저녁은 역출근이라 한산한 것이 맞다(처음 이걸 정방향에 물어 헛깃발이 섰다).
for (const [f, t] of [['미아역', '충무로역'], ['신림역', '강남역'], ['화곡역', '여의도역']]) {
  const A = pick(f), Bp = pick(t);
  const curveOf = (x, y) => {
    const c = [];
    for (let h = 5; h <= 23; h++) {
      const got = planAt(x, y, h * 60, 'weekday');
      c.push(got && got.length ? Math.round(got[0].standingMinutes) : null);
    }
    return c;
  };
  const fwd = curveOf(A, Bp), rev = curveOf(Bp, A);
  console.log(`  ${f}→${t}(출근방향): ` + fwd.map((v, i) => `${i + 5}시 ${v === null ? '–' : v}`).join(' '));
  console.log(`  ${t}→${f}(퇴근방향): ` + rev.map((v, i) => `${i + 5}시 ${v === null ? '–' : v}`).join(' '));
  const at = (c, h) => c[h - 5];
  const lullF = Math.min(...[11, 12, 13, 14, 15].map(h => at(fwd, h)).filter(v => v !== null));
  const am = Math.max(...[7, 8, 9].map(h => at(fwd, h)).filter(v => v !== null));
  const lullR = Math.min(...[11, 12, 13, 14, 15].map(h => at(rev, h)).filter(v => v !== null));
  const pm = Math.max(...[17, 18, 19].map(h => at(rev, h)).filter(v => v !== null));
  if (!(am >= lullF)) flag('B아침봉우리', `${f}→${t}: 아침 최고 ${am} < 낮 최저 ${lullF}`);
  if (!(pm >= lullR)) flag('B저녁봉우리', `${t}→${f}: 퇴근 최고 ${pm} < 낮 최저 ${lullR}`);
  for (const [nm, c] of [[f + '→' + t, fwd], [t + '→' + f, rev]])
    for (let i = 1; i < c.length; i++)
      if (c[i] !== null && c[i - 1] !== null && Math.abs(c[i] - c[i - 1]) > 18)
        flag('B요동', `${nm}: ${i + 4}시 ${c[i - 1]}분 → ${i + 5}시 ${c[i]}분 널뜀`);
}

/* ── C. 요일 곡선 ────────────────────────────────────────────────────── */
console.log('\nC. 요일 — 08시 서는 시간: 평일 ≥ 토 ≥ 일 (허용 오차 3분)');
for (const [f, t] of [['미아역', '충무로역'], ['신림역', '강남역'], ['화곡역', '여의도역']]) {
  const v = {};
  for (const d of ['weekday', 'saturday', 'sunday']) {
    const got = plan(f, t, 8 * 60, d);
    v[d] = got && got.length ? Math.round(got[0].standingMinutes) : null;
  }
  console.log(`  ${f}→${t}: 평일 ${v.weekday} · 토 ${v.saturday} · 일 ${v.sunday}`);
  if (v.weekday !== null && v.saturday !== null && v.saturday > v.weekday + 3)
    flag('C요일', `${f}→${t}: 토(${v.saturday}) > 평일(${v.weekday})`);
  if (v.saturday !== null && v.sunday !== null && v.sunday > v.saturday + 3)
    flag('C요일', `${f}→${t}: 일(${v.sunday}) > 토(${v.saturday})`);
}

/* ── D. 무작위 수십 쌍 — 카드 불변식 전수 ────────────────────────────── */
console.log('\nD. 무작위 OD — 씨앗 고정 난수, 쌍마다 08시·14시·18:30 세 판');
let seed = 20260906;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const cand = graph.nodes.map((n, i) => ({ n, i }))
  .filter(x => x.n.kinds && x.n.kinds.length);
let pairs = 0, journeys = 0, viol = 0;
while (pairs < 40) {
  const a = cand[Math.floor(rnd() * cand.length)].n;
  const b = cand[Math.floor(rnd() * cand.length)].n;
  const km = hv(a, b) / 1000;
  if (km < 2 || km > 22) continue;
  pairs++;
  for (const [mins, day] of [[480, 'weekday'], [840, 'weekday'], [1110, 'weekday']]) {
    const got = planAt(a, b, mins, day);
    if (!got || !got.length) continue;
    const fastest = Math.min(...got.map(j => j.totalMinutes));
    const noSit = j => j.standingMinutes + j.walkMinutes;
    for (let i = 0; i < got.length; i++) {
      const j = got[i]; journeys++;
      const bad = m => { viol++; flag('D불변식', `${a.name}→${b.name} ${Math.round(mins / 60)}시 #${i + 1}: ${m}`); };
      // 정렬: 못 앉는 시간 오름차순 (D-77)
      if (i > 0 && noSit(j) < noSit(got[i - 1]) - 1e-6) bad('정렬이 못 앉는 시간 순이 아니다');
      // 퍼센트 ≡ 괄호 (D-76)
      if (!j.walkOnly && j.knownLegs > 0 && j.seatChance && j.seatChance.percent !== null) {
        const rs = Math.round(j.rideMinutes), vs = Math.round(j.vehicleStandingMinutes);
        const want = rs > 0 ? Math.round(100 * Math.max(0, rs - vs) / rs) : 100;
        if (j.seatChance.percent !== want) bad(`퍼센트 ${j.seatChance.percent} ≠ 괄호 ${want}(${rs}분 중 ${rs - vs})`);
        if (/100%/.test(j.seatChance.text)) bad('문장에 100%');
        if (/\b(9[1-9]|100)%/.test(j.seatChance.text)) bad('문장에 90 초과 숫자: ' + j.seatChance.text);
      }
      // 산수·구조
      if (j.transfers > 2) bad('환승 3회+');
      const ids = j.legs.map(l => l.routeId);
      if (new Set(ids).size !== ids.length) bad('같은 노선 두 번');
      if (j.standingMinutes < -1e-6 || j.walkMinutes < -1e-6) bad('음수 시간');
      if (j.vehicleStandingMinutes > j.rideMinutes + 1e-6) bad('차 안 서기 > 타는 시간');
      if (!(j.totalMinutes <= fastest * 1.6 + 1 || j.totalMinutes <= fastest + 25 + 1))
        bad(`가지치기 위반: ${Math.round(j.totalMinutes)}분 (최속 ${Math.round(fastest)}분)`);
    }
    if (got.length && got[0].badge !== M.SORT_BADGE && !got[0].walkOnly)
      { viol++; flag('D배지', `${a.name}→${b.name}: 1위 배지가 「${got[0].badge}」`); }
  }
}
console.log(`  쌍 ${pairs} · 여정 ${journeys}개 검사 · 위반 ${viol}건`);

/* ── E. 심야·새벽 ────────────────────────────────────────────────────── */
console.log('\nE. 심야 02시 — 지하철·낮버스가 나오면 안 된다 (00:30 지하철은 된다)');
for (const [f, t] of [['미아역', '충무로역'], ['신림역', '강남역']]) {
  const night = plan(f, t, 2 * 60, 'weekday');
  // 시체 카드(notRunning)는 UI 가 「다니지 않습니다」 경고를 붙여 보여 준다 — 산 것만 센다.
  const kinds = new Set();
  (night || []).filter(j => !j.notRunning)
    .forEach(j => j.legs.forEach(l => kinds.add(l.kind + ':' + l.routeName)));
  const subs = [...kinds].filter(k => k.startsWith('subway'));
  const dayBus = [...kinds].filter(k => !k.startsWith('subway') && !/:N/.test(k) && !/night/.test(k));
  console.log(`  ${f}→${t} 02시: 경로 ${(night || []).length}개 · 지하철 ${subs.length} · 낮버스 ${dayBus.length} (${[...kinds].slice(0, 6).join(', ') || '없음'})`);
  subs.forEach(s => flag('E심야지하철', `${f}→${t} 02시에 ${s}`));
  dayBus.forEach(s => flag('E심야낮버스', `${f}→${t} 02시에 ${s}`));
  const half = plan(f, t, 30, 'weekday');   // 00:30 — 막차 시간대, 지하철이 나와야 정상
  const hasSub = (half || []).some(j => j.legs.some(l => l.kind === 'subway'));
  if (!hasSub) flag('E막차', `${f}→${t} 00:30에 지하철이 전멸 — 막차 시간대인데`);
}

/* ── F. 극단 ────────────────────────────────────────────────────────── */
console.log('\nF. 극단 사례');
{ // 2호선 최고 혼잡으로 유명한 사당→방배 아침
  const ctx8 = ctxAt(8 * 60, 'weekday');
  for (let ri = 0; ri < index.routes.length; ri++) {
    const route = index.routes[ri];
    if (route.kind !== 'subway' || route.name !== '2호선') continue;
    for (let di = 0; di < route.dirs.length; di++) {
      const s = route.stops[di], p = s.indexOf('사당');
      if (p < 0 || s[p + 1] !== '방배') continue;
      const info = ctx8.loadFor({ routeIdx: ri, dirIdx: di, fromPos: p, toPos: p + 1,
        from: route.dirs[di][p], to: route.dirs[di][p + 1], stops: 1, kind: 'subway',
        vehicle: route.vehicle, rideMinutes: 2, offsetMinutes: 0 });
      const r = M.ride({ vehicle: 'subwayCar', alpha: M.ALPHA_DEFAULT, segments: info.segments, freeSeats: info.freeSeats });
      console.log(`  사당→방배 08시 [${info.direction}]: 재차 ${info.segments[0].load.toFixed(0)}명, 탈 때 앉을 확률 ${(r.pBoard * 100).toFixed(0)}%`);
      if (r.pBoard > 0.1) flag('F혼잡전설', `사당→방배 08시 ${(r.pBoard * 100).toFixed(0)}% — 최고 혼잡 구간인데`);
    }
  }
  const short = plan('을지로3가역', '을지로4가역', 8 * 60, 'weekday');
  const w = (short || []).find(j => j.walkOnly);
  console.log(`  을지로3가→을지로4가: 경로 ${(short || []).length}개, 걷기 ${w ? Math.round(w.totalMinutes) + '분' : '없음'}`);
  if (!w) flag('F초단거리', '한 정거장 거리인데 걷기 경로가 없다');
  if (w && (w.totalMinutes < 5 || w.totalMinutes > 25)) flag('F걷기시간', `을지로 한 구간 걷기 ${Math.round(w.totalMinutes)}분`);
  const air = plan('김포공항역', '여의도역', 8 * 60, 'weekday');
  if (air && air.length) {
    const top = air[0];
    console.log(`  김포공항→여의도 08시: 1위 ${Math.round(top.totalMinutes)}분, 앉는비율 ${top.seatChance ? top.seatChance.percent : '?'}%`);
    if (top.pSeatedShown >= 0.995 && !top.walkOnly) flag('F공항낙관', '김포공항→여의도 08시 내내 앉음 — 5호선 출근인데');
  }
}

/* ── G. 앉는 자리 퇴근판 ─────────────────────────────────────────────── */
console.log('\nG. 앉는 자리 — 평일 18:30, 집(노원·신림) 방향');
for (const destName of ['노원역', '신림역']) {
  const d = pick(destName);
  const toNodes = R.nearbyMixed(graph.nodes, d.lat, d.lon, 900, 10);
  const sure = R.boardingPointsTo({ graph, index, toNodes, loadFor: ctxEve.loadFor,
                                    alpha: M.ALPHA_DEFAULT, limit: 20, maxRideMinutes: 60, minP: 0.95 });
  const sub = sure.filter(x => x.kind === 'subway');
  console.log(`  ${destName}: 제안 ${sure.length}곳(지하철 ${sub.length})`);
  sub.slice(0, 4).forEach(x => console.log(`    지하철 95%+: ${x.routeName} ${x.boardName} [${x.headsign}] ${x.stops}정거장`));
  if (sub.length > 4) flag('G퇴근앉는자리', `${destName} 18:30 지하철 확실 자리 ${sub.length}곳 — 퇴근인데 너무 많다`);
}

/* ── H. 몬테카를로 — 해석해 vs 무작위 시뮬레이션 ─────────────────────── */
console.log('\nH. 몬테카를로 4,000판 — 「끝까지 가면 앉아 있나」 해석해와 대조');
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
{
  const ctx8 = ctxAt(8 * 60, 'weekday');
  const CASES = [['2호선', '성수', '시청'], ['4호선', '미아', '동대문'], ['5호선', '화곡', '여의도']];
  for (const [ln, f, t] of CASES) {
    for (let ri = 0; ri < index.routes.length; ri++) {
      const route = index.routes[ri];
      if (route.kind !== 'subway' || route.name !== ln) continue;
      for (let di = 0; di < route.dirs.length; di++) {
        const s = route.stops[di], p = s.indexOf(f);
        if (p < 0) continue;
        const q = s.indexOf(t, p + 1);
        if (q < 0) continue;
        const info = ctx8.loadFor({ routeIdx: ri, dirIdx: di, fromPos: p, toPos: q,
          from: route.dirs[di][p], to: route.dirs[di][q], stops: q - p, kind: 'subway',
          vehicle: route.vehicle, rideMinutes: (q - p) * 2, offsetMinutes: 0 });
        if (!info || info.notRunning) continue;
        const r = M.ride({ vehicle: 'subwayCar', alpha: M.ALPHA_DEFAULT, segments: info.segments, freeSeats: info.freeSeats });
        const analytic = 1 - (1 - r.pBoard) * (1 - r.pDuring);   // 끝까지 가면 앉아 있을 확률
        const mc = mcLeg(info, 54, 4000, M.ALPHA_DEFAULT);
        const note = analytic > mc * 1.3 ? ' ⚑ 해석해가 시뮬레이션보다 낙관적' : '';
        console.log(`  ${ln} ${f}→${t}: 해석해 ${(analytic * 100).toFixed(0)}% vs 몬테카를로 ${(mc * 100).toFixed(0)}%${note}`);
        if (analytic > mc * 1.3 && analytic - mc > 0.08)
          flag('H모델낙관', `${ln} ${f}→${t}: 해석해 ${(analytic * 100).toFixed(0)}% > MC ${(mc * 100).toFixed(0)}%×1.3 — 사람을 앉힌다고 속인다`);
      }
    }
  }
}

console.log('\n══ 결론 ══');
if (!FLAGS.length) console.log('상식·불변식 위반을 못 찾았다.');
else { console.log(`걸린 것 ${FLAGS.length}건:`); FLAGS.forEach(f => console.log('  ⚑ ' + f)); }
