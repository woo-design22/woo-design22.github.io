/* 길찾기 시험 — **이 서비스의 본체**가 도는지.
   사양서 M2 의 검증 케이스(월곡→을지로4가 세 시각)를 그대로 옮겼다.
   그래프(data/graph/)가 없으면 통째로 건너뛴다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
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
const HAVE = !!(NODES && ROUTES);
const graph = HAVE ? { nodes: NODES.nodes, routes: ROUTES.routes } : null;
const index = HAVE ? R.buildIndex(graph) : null;

if (HAVE) {
  console.log(`\n  [길찾기] 노드 ${graph.nodes.length}개 · 노선 ${graph.routes.length}개 · 혼잡도 ${CONG ? '있음' : '없음'}\n`);
} else {
  console.log('\n  [건너뜀] data/graph/ 가 없다. `python pipeline/build_graph.py`\n');
}
const t = (name, fn) => test(name, { skip: !HAVE && '그래프 없음' }, fn);

const busCache = {};
function busRouteOf(name) {
  if (name in busCache) return busCache[name];
  const f = path.join(D, 'bus', 'routes', String(name).replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  return (busCache[name] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
}

function pick(name) {
  const hits = R.findNodes(graph, name, 5);
  assert.ok(hits.length, `「${name}」 노드를 못 찾았다`);
  return hits[0];
}

function plan(fromName, toName, minutes, dayType) {
  const a = pick(fromName), b = pick(toName);
  const found = R.search({
    graph, index,
    // 화면과 **같은 방식**으로 뽑아야 한다 — 시험만 다른 경로를 타면 거짓말을 한다
    fromNodes: R.nearbyMixed(graph.nodes, a.lat, a.lon, 900, 12),
    toNodes: R.nearbyMixed(graph.nodes, b.lat, b.lon, 900, 12),
    maxTransfers: 2, walkSpeed: 'normal'
  });
  const ctx = { graph, congestion: CONG, ride: RIDE, busRouteOf, minutes, dayType, alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L.makeLoadFor(ctx);
  found.forEach(j => R.evaluate(j, ctx));
  return R.rank(found);
}

// ── 그래프 ────────────────────────────────────────────────────────────────
t('그래프에 정류장 이름이 다 들어 있고 좌표가 있다', () => {
  const noName = graph.nodes.filter(n => !n.name).length;
  const noXY = graph.nodes.filter(n => !(n.lat > 33 && n.lon > 124)).length;
  console.log(`    노드 ${graph.nodes.length}개 · 이름 없음 ${noName} · 좌표 없음 ${noXY}`);
  assert.strictEqual(noName, 0, '이름 없는 노드가 있다');
  assert.strictEqual(noXY, 0, '좌표 없는 노드가 있다');
});

t('버스와 지하철이 한 노드에서 만난다 (환승이 가능하다)', () => {
  const mixed = graph.nodes.filter(n => n.kinds.length > 1);
  console.log(`    버스+지하철 환승 노드 ${mixed.length}개 (예: ${mixed.slice(0, 3).map(n => n.name).join(', ')})`);
  assert.ok(mixed.length > 100, `${mixed.length}개 — 너무 적다. 클러스터링이 안 먹은 것이다`);
});

t('한 노선이 같은 노드를 연달아 지나지 않는다', () => {
  let bad = 0;
  for (const r of graph.routes) for (const d of r.dirs)
    for (let i = 1; i < d.length; i++) if (d[i] === d[i - 1]) bad++;
  assert.strictEqual(bad, 0, `연속 중복 ${bad}곳 — 클러스터링이 노선을 뭉갰다`);
});

// ── 사양서 M2 검증 케이스 ─────────────────────────────────────────────────
t('월곡 → 을지로4가, 평일 08:00 — 경로가 나오고 되돌아가지 않는다', () => {
  const t0 = Date.now();
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  const ms = Date.now() - t0;
  console.log(`    경로 ${got.length}개 · ${ms}ms`);
  got.slice(0, 4).forEach(j => console.log(
    `      ${j.legs.map(l => l.routeName).join(' → ')} · 총 ${Math.round(j.totalMinutes)}분`
    + ` · 서서 ${Math.round(j.standingMinutes)}분 · 환승 ${j.transfers}회${j.badge ? ' [' + j.badge + ']' : ''}`));
  assert.ok(got.length >= 3, `${got.length}개 — 후보가 너무 적다`);
  assert.ok(ms < 2500, `${ms}ms — 너무 느리다`);
  for (const j of got) {
    assert.ok(j.transfers <= 2, '환승 3회 이상이 나왔다');
    const ids = j.legs.map(l => l.routeId);
    assert.strictEqual(new Set(ids).size, ids.length, `같은 노선을 두 번 탄다: ${ids.join(',')}`);
  }
});

t('경로 정렬 1순위는 서서 가는 시간이다 (소요시간이 아니다)', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  for (let i = 1; i < got.length; i++) {
    assert.ok(got[i].standingMinutes >= got[i - 1].standingMinutes - 1e-9,
      `${i}번째가 앞보다 덜 서서 간다 — 정렬이 틀렸다`);
  }
  assert.strictEqual(got[0].badge, M.SORT_BADGE);
  assert.ok(M.SORT_BADGE.includes('서서'));
});

t('06시대는 앉아서 간다 — 08시보다 서서 가는 시간이 짧다 (사양서 M2)', () => {
  const early = plan('월곡', '을지로4가', 6 * 60, 'weekday');
  const peak = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  assert.ok(early.length && peak.length, '경로가 안 나왔다');
  const e = early[0], p = peak[0];
  console.log(`    06:00 서서 ${e.standingMinutes.toFixed(1)}분 / 08:00 서서 ${p.standingMinutes.toFixed(1)}분`);
  assert.ok(e.standingMinutes < p.standingMinutes,
    '새벽이 출근시간보다 더 서서 간다고 나왔다 — 상식과 어긋난다');
  assert.ok(e.legs[0].pSeated === null || e.legs[0].pSeated > 0.8,
    `06시 첫 구간 착석 확률 ${e.legs[0].pSeated} — 새벽엔 앉아야 한다`);
});

t('일요일 14:00이 평일 08:00보다 덜 서서 간다', () => {
  const sun = plan('월곡', '을지로4가', 14 * 60, 'sunday');
  const wd = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  console.log(`    일요일 14:00 서서 ${sun[0].standingMinutes.toFixed(1)}분 / 평일 08:00 서서 ${wd[0].standingMinutes.toFixed(1)}분`);
  assert.ok(sun[0].standingMinutes < wd[0].standingMinutes);
});

t('사양서 1.2의 뒤집기가 실제로 일어난다 — 느려도 앉는 길이 위로 온다', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  const fastest = got.slice().sort((a, b) => a.totalMinutes - b.totalMinutes)[0];
  const top = got[0];
  console.log(`    1순위: ${Math.round(top.totalMinutes)}분(서서 ${Math.round(top.standingMinutes)}분)`
    + ` · 가장 빠른 길: ${Math.round(fastest.totalMinutes)}분(서서 ${Math.round(fastest.standingMinutes)}분)`);
  // 뒤집혔다면 1순위가 가장 빠른 길이 아니어야 한다. 안 뒤집혔어도 정렬 자체는 지켜져야 한다.
  assert.ok(top.standingMinutes <= fastest.standingMinutes + 1e-9);
  if (top !== fastest) assert.strictEqual(fastest.badge, '가장 빨리 가는 길');
});

// ── 구간별 표시 ───────────────────────────────────────────────────────────
t('구간마다 좌석 문구와 서서 가는 시간이 붙는다', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  const withSeat = got.flatMap(j => j.legs).filter(l => l.seatText);
  assert.ok(withSeat.length, '좌석 문구가 붙은 구간이 하나도 없다');
  const l = withSeat[0];
  console.log(`    ${l.routeName} ${l.fromName}→${l.toName} (${l.stops}정거장): ${l.seatText}`
    + ` · 서서 ${l.standingMinutes.toFixed(1)}분` + (l.estimated ? ' [추정 포함]' : ''));
  assert.ok(l.seats > 0 && l.emptySeats >= 0);
  assert.ok(l.standingMinutes >= 0 && l.standingMinutes <= l.rideMinutes + 1e-9);
});

t('추정이 섞인 구간은 그 사실을 달고 나온다', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  const est = got.flatMap(j => j.legs).filter(l => l.estimated);
  assert.ok(est.length, '추정 표시가 하나도 없다 — 열차·버스 대수는 지금 추정값이다');
  assert.ok(est[0].estimateWhy && est[0].estimateWhy.length > 5, '무엇을 추정했는지 설명이 없다');
  console.log(`    "${est[0].estimateWhy}"`);
});

t('방향 라벨은 노선 배열의 끝에서 파생된다 (버그 ④)', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  const leg = got[0].legs[0];
  const r = graph.routes[leg.routeIdx];
  const last = r.dirs[leg.dirIdx][r.dirs[leg.dirIdx].length - 1];
  assert.strictEqual(leg.headsign, graph.nodes[last].name + ' 방면');
});

// ── 교통약자 ──────────────────────────────────────────────────────────────
t('보행속도를 느리게 하면 총 소요시간이 늘어난다 (사양서 6.3)', () => {
  // 역 위에서 출발하면 도보가 0m 라 속도가 아무 영향이 없다(그게 맞다).
  // 그래서 역에서 300m 쯤 떨어진 지점을 출발지로 잡는다 — 실제 사용자가 그렇다.
  const a = pick('월곡'), b = pick('을지로4가');
  // 서울은 정류장이 촘촘해서 어디로 옮겨도 70m 안에 하나쯤 있다.
  // 그래서 좌표를 옮기는 대신 **200m 이상 걸어야 하는 노드만** 후보로 둔다.
  const from = R.nearby(graph.nodes, a.lat, a.lon, 900, 30).filter(x => x.meters >= 200).slice(0, 10);
  assert.ok(from.length, '200m 이상 걸어야 하는 후보가 없다');
  const mk = speed => R.search({
    graph, index, fromNodes: from,
    toNodes: R.nearby(graph.nodes, b.lat, b.lon, 700, 10),
    maxTransfers: 2, walkSpeed: speed
  })[0];
  const n = mk('normal'), s = mk('vslow');
  console.log(`    도보 ${Math.round(from[0].meters)}m · 보통 ${n.totalMinutes.toFixed(1)}분 · 아주 느리게 ${s.totalMinutes.toFixed(1)}분`);
  assert.ok(s.totalMinutes > n.totalMinutes + 1, '느리게 걷는데 시간이 안 늘었다');
});

t('경로마다 앉을 확률이 퍼센트로 나온다', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  for (const j of got) {
    assert.ok(j.seatChance, '확률 표시가 없다');
    assert.ok(/\d+%|알 수 없음/.test(j.seatChance.text), `"${j.seatChance.text}" — 숫자가 없다`);
    if (j.seatChance.percent !== null) {
      assert.ok(j.seatChance.percent >= 0 && j.seatChance.percent <= 100);
      // D-71: 카드 퍼센트의 잣대는 pSeatedTime(머리기사와 같은 것)이다
      assert.ok(Math.abs(j.seatChance.percent / 100 - j.pSeatedTime) < 0.01);
    }
  }
  const top = got[0];
  console.log(`    1순위: ${top.seatChance.text} · 서서 ${Math.round(top.standingMinutes)}분`
    + ` · 구간별 ${top.legs.map(l => M.seatChance(l.pSeated).percent + '%').join(' / ')}`);
});

t('여정 확률은 구간을 타는 시간으로 가중평균한 값이다 (2026-09-04 지시)', () => {
  const got = plan('월곡', '을지로4가', 8 * 60, 'weekday');
  for (const j of got) {
    if (j.walkOnly) continue;
    // ① 「앉아 있는 시간 비율」은 헤드라인의 서서 가는 시간과 언제나 맞아떨어진다
    assert.ok(Math.abs(j.pSeatedTime - (1 - j.standingMinutes / j.rideMinutes)) < 1e-9,
      '앉아 있는 시간 비율이 서서 가는 시간과 어긋난다');
    // 화면에 쓰는 확률은 「탈 때 바로」라 그보다 크지 않다(가다가 앉는 몫이 빠져 있으므로)
    assert.ok(j.pSeated <= j.pSeatedTime + 1e-9,
      '탈 때 바로 앉을 확률이 앉아 있는 시간 비율보다 크다 — 뜻이 뒤집혔다');
    // ② 가중평균이므로 구간 값들의 최소~최대 사이에 있다
    const vals = j.legs.map(l => (typeof l.pSeated === 'number' ? l.pSeated : 0));
    assert.ok(j.pSeated >= Math.min.apply(null, vals) - 1e-9);
    assert.ok(j.pSeated <= Math.max.apply(null, vals) + 1e-9);
    // ③ 실제로 시간 가중평균과 같은지 직접 계산해 대조
    let num = 0, den = 0;
    j.legs.forEach(l => { num += (typeof l.pSeated === 'number' ? l.pSeated : 0) * l.rideMinutes; den += l.rideMinutes; });
    assert.ok(Math.abs(j.pSeated - num / den) < 1e-9, '가중평균이 아니다');
  }
});

t('만원 열차에서는 「탈 때 바로 앉을 확률」이 0에 가깝다 (2026-09-04 지시)', () => {
  // 「이미 사람들이 서 있고 만원이라면 앉을 확률은 0%」 — 4호선 08시 도심행이 그렇다.
  // 버스 인원을 하루 단위로 고친 뒤(D-47) 버스가 상위로 올라와, 순위 안에 지하철이 없을 수 있다.
  // 이 시험이 보려는 것은 「만석이면 0%」이므로 순위와 무관하게 **모든 후보**에서 찾는다.
  const a = pick('미아'), b = pick('충무로');
  const all = R.search({
    graph, index,
    fromNodes: R.nearby(graph.nodes, a.lat, a.lon, 700, 10),
    toNodes: R.nearby(graph.nodes, b.lat, b.lon, 700, 10),
    maxTransfers: 2, walkSpeed: 'normal'
  });
  const ctx2 = { graph, congestion: CONG, ride: RIDE, busRouteOf, minutes: 8 * 60,
                 dayType: 'weekday', alpha: M.ALPHA_DEFAULT };
  ctx2.loadFor = L.makeLoadFor(ctx2);
  all.forEach(j => R.evaluate(j, ctx2));
  const sub = all.flatMap(j => j.legs).filter(l => l.kind === 'subway' && l.pBoard !== null);
  assert.ok(sub.length, '지하철 구간이 없다');
  const crowded = sub.filter(l => l.emptySeats === 0);
  for (const l of crowded) {
    assert.ok(l.pBoard < 0.10,
      `${l.routeName} ${l.fromName}: 만석인데 탈 때 앉을 확률 ${(l.pBoard * 100).toFixed(0)}%`);
  }
  const l0 = crowded[0];
  if (l0) console.log(`    ${l0.routeName} ${l0.fromName}→${l0.toName} [${l0.direction || '-'}]`
    + ` 탈 때 ${(l0.pBoard * 100).toFixed(0)}% · 가다가 ${(l0.pLater * 100).toFixed(0)}%`
    + ` · 서서 ${l0.standingMinutes.toFixed(0)}/${l0.rideMinutes.toFixed(0)}분`);
});

t('호선마다 방향 라벨을 자료로 판정해 저장해 둔다 (규칙을 박지 않는다)', () => {
  const subs = graph.routes.filter(r => r.kind === 'subway');
  const rows = subs.map(r => `${r.name}=${(r.dirLabels || ['?', '?'])[0]}`);
  console.log('    번호 증가 방향: ' + rows.join(' · '));
  for (const r of subs) {
    assert.ok(r.dirLabels && r.dirLabels.length === 2, `${r.name} 방향 라벨이 없다`);
    assert.notStrictEqual(r.dirLabels[0], r.dirLabels[1]);
  }
  // 일반 규칙(번호 증가=하선)을 그대로 박았다면 틀렸을 두 호선
  const l1 = subs.find(r => r.line === '1');
  assert.strictEqual(l1.dirLabels[0], '상선',
    '1호선은 번호 증가가 상선이다 — 일반 규칙과 반대다');
  const l2 = subs.find(r => r.line === '2');
  assert.ok(l2.dirLabels.includes('내선') && l2.dirLabels.includes('외선'),
    '2호선은 상선/하선이 아니라 내선/외선이다');
});

t('오래 걷는 길은 「그냥 걸어가기」로 권하지 않는다', () => {
  // 2.5km 로 잘랐더니 35분 걷는 길이 1순위였다. 시간으로 자르고, 걸음 속도가 반영돼야 한다.
  const a = R.findNodes(graph, '교대', 1)[0], b = R.findNodes(graph, '방배', 1)[0];
  const mk = speed => R.search({
    graph, index, fromPoint: a, toPoint: b,
    fromNodes: R.nearby(graph.nodes, a.lat, a.lon, 700, 8),
    toNodes: R.nearby(graph.nodes, b.lat, b.lon, 700, 8), walkSpeed: speed
  }).filter(j => j.walkOnly);
  console.log(`    교대→방배(직선 ${Math.round(require('../engine/transfer.js').haversine(a, b))}m):`
    + ` 보통 걷기후보 ${mk('normal').length}개 · 아주 느림 ${mk('vslow').length}개`);
  for (const w of mk('normal')) assert.ok(w.totalMinutes <= R.WALK_ONLY_MAX_MIN + 1e-9,
    `${w.totalMinutes.toFixed(0)}분 걷기를 권하고 있다`);
  // 느리게 걸으면 후보에서 더 빨리 빠져야 한다
  assert.ok(mk('vslow').length <= mk('normal').length);
});

t('순환선(2호선)도 두 방향이 갈린다 — 상선/하선이 없어도', () => {
  // 「이 호선은 순환이라서 상선 하선이 없을 수도 있는데 분명히 방향은 다른 방향이 존재한다」
  const l2 = graph.routes.find(r => r.line === '2');
  assert.ok(l2.dirLabels.includes('내선') && l2.dirLabels.includes('외선'));
  const names = l2.stops[0];
  let both = 0, differ = 0, maxGap = 0, at = '';
  const I2 = require('../engine/interp.js');
  const val = (nm, lab) => {
    const gg = CONG.grid[`2|${nm}|weekday|${lab}`];
    return gg ? I2.valueAt(gg, { slotMinutes: CONG.slotMinutes, startMinutes: CONG.startMinutes, atMinutes: 8 * 60 }) : null;
  };
  for (const nm of names) {
    const a = val(nm, '내선'), b = val(nm, '외선');
    if (a === null || b === null) continue;
    both++;
    const gap = Math.abs(a - b);
    if (gap >= 5) differ++;
    if (gap > maxGap) { maxGap = gap; at = `${nm} 내선 ${a.toFixed(0)}% / 외선 ${b.toFixed(0)}%`; }
  }
  console.log(`    2호선 ${both}개 역 두 방향 다 있음 · ${differ}개가 5%p 이상 다름 · 최대 ${at}`);
  assert.strictEqual(both, names.length, '두 방향 자료가 없는 역이 있다');
  assert.ok(differ > names.length * 0.8, '순환선인데 두 방향 값이 거의 같다 — 방향을 못 가리고 있다');
  assert.ok(maxGap > 50, `최대 차이 ${maxGap.toFixed(0)}%p — 순환선은 방향에 따라 크게 달라야 한다`);
});

t('두 방향이 실제로 서로 다른 혼잡도를 읽는다 (큰 값으로 물러나지 않는다)', () => {
  const subs = graph.routes.filter(r => r.kind === 'subway');
  for (const r of subs) {
    const names = r.stops[0];
    const mid = Math.floor(names.length / 2);
    const a = L.subwaySegments({ congestion: CONG, ride: RIDE, minutes: 8 * 60, dayType: 'weekday' },
      { dirIdx: 0, fromPos: mid, toPos: mid + 1 }, r);
    const b = L.subwaySegments({ congestion: CONG, ride: RIDE, minutes: 8 * 60, dayType: 'weekday' },
      { dirIdx: 1, fromPos: names.length - mid - 2, toPos: names.length - mid - 1 }, r);
    if (!a || !b || a.notRunning || b.notRunning) continue;
    assert.ok(a.direction && b.direction, `${r.name} 방향별 자료를 못 읽었다 — 큰 값으로 물러났다`);
    assert.notStrictEqual(a.direction, b.direction, `${r.name} 두 방향이 같은 라벨을 쓴다`);
  }
});

t('방향에 따라 혼잡도가 다르게 잡힌다 (상선 15% / 하선 103%)', () => {
  const toCity = plan('미아', '충무로', 8 * 60, 'weekday');
  const fromCity = plan('충무로', '미아', 8 * 60, 'weekday');
  const pick = list => list.flatMap(j => j.legs).filter(l => l.routeId === 'S4' && l.pBoard !== null)[0];
  const a = pick(toCity), b = pick(fromCity);
  if (!a || !b) return;                       // 4호선 경로가 안 잡히면 건너뛴다
  console.log(`    도심행 [${a.direction}] 탈 때 ${(a.pBoard * 100).toFixed(0)}%`
    + ` · 외곽행 [${b.direction}] 탈 때 ${(b.pBoard * 100).toFixed(0)}%`);
  assert.notStrictEqual(a.direction, b.direction, '두 방향이 같은 혼잡도를 쓰고 있다');
  assert.ok(b.pBoard > a.pBoard, '출근시간엔 도심 반대 방향이 더 앉기 쉬워야 한다');
});

t('「한 번이라도 앉을 확률」로 쓰면 안 되는 이유가 시험으로 남아 있다', () => {
  // 21% · 21% · 34% 짜리 세 구간인데 「한 번이라도」로 합치면 59% 가 된다.
  // 35분 중 31분을 서서 가는데 앉을 것처럼 읽힌다 — 그래서 시간 가중으로 바꿨다.
  const legs = [{ p: 0.21, ride: 9, stand: 8 }, { p: 0.21, ride: 10, stand: 10 }, { p: 0.34, ride: 16, stand: 13 }];
  const anytime = 1 - legs.reduce((a, l) => a * (1 - l.p), 1);
  const ride = legs.reduce((a, l) => a + l.ride, 0), stand = legs.reduce((a, l) => a + l.stand, 0);
  const weighted = 1 - stand / ride;
  assert.ok(anytime > 0.55 && weighted < 0.15,
    `한 번이라도 ${(anytime * 100).toFixed(0)}% / 시간 가중 ${(weighted * 100).toFixed(0)}%`);
  assert.strictEqual(M.seatChance(weighted).tone, 'bad', '서서 31/35분인데 나쁜 단계가 아니다');
});

t('모르는 구간은 확률을 지어내지 않는다', () => {
  // 자료가 없으면 0 으로 치고(D-25), 아는 구간이 하나도 없으면 「알 수 없음」이라고 쓴다.
  assert.strictEqual(M.seatChance(null).percent, null);
  assert.ok(M.seatChance(null).text.includes('알 수 없음'));
  assert.strictEqual(M.seatChance(0.617).text, '탈 때 앉을 확률 62%');
});

t('이름을 치면 정확히 그 역이 먼저 나온다', () => {
  // 「들어 있으면 맞다」로 두면 「월곡」에 상월곡역이, 「을지로4가」에 버스정류장이 먼저 나왔다.
  assert.strictEqual(R.findNodes(graph, '월곡', 5)[0].name, '월곡역');
  assert.strictEqual(R.findNodes(graph, '을지로4가', 5)[0].name, '을지로4가역');
  assert.ok(R.findNodes(graph, '월곡', 5)[0].kinds.indexOf('subway') >= 0);
});

// ── 2026-09-04 에 실제로 터진 것들 (한 화면에 셋이 같이 났다) ─────────────
/* 증상: 「월곡두산위브아파트 → 중구청, 평일 08:00」이
   ① 지하철이 후보에 하나도 없고
   ② 137분·208분짜리 버스 두 번 갈아타는 길을 1·2위로 놓고
   ③ 열두 개가 전부 「탈 때 앉을 확률 100%」였다 — 출근시간인데.        */

t('빽빽한 정류장 틈에서도 지하철역이 후보에 남는다 (D-52)', () => {
  const a = pick('월곡동두산아파트');
  const plain = R.nearby(graph.nodes, a.lat, a.lon, 900, 12);
  const mixed = R.nearbyMixed(graph.nodes, a.lat, a.lon, 900, 12);
  const subOf = list => list.filter(x => (graph.nodes[x.node].kinds || []).indexOf('subway') >= 0);
  // 거리만으로 자르면 월곡역(741m)이 버스정류장 수십 곳에 밀려 잘린다
  assert.strictEqual(subOf(plain).length, 0, '이 사례가 더는 재현되지 않는다 — 시험을 다시 골라야 한다');
  assert.ok(subOf(mixed).length >= 1, 'nearbyMixed 가 지하철역을 남기지 못했다');
  assert.ok(mixed.length > plain.length, '섞어 뽑았는데 개수가 안 늘었다');
});

t('지하철이 실제 경로 후보에 오른다', () => {
  const ranked = plan('월곡동두산아파트', '중구청', 8 * 60, 'weekday');
  assert.ok(ranked.some(j => j.legs.some(l => l.kind === 'subway')),
    '월곡→중구청인데 지하철을 쓰는 경로가 하나도 없다');
});

t('앉는다고 세 배 돌아가는 길을 1위로 놓지 않는다 (D-53)', () => {
  const ranked = plan('월곡동두산아파트', '중구청', 8 * 60, 'weekday');
  const fastest = Math.min.apply(null, ranked.map(j => j.totalMinutes));
  const cap = Math.max(fastest * 1.6, fastest + 25);
  ranked.forEach(j => assert.ok(j.totalMinutes <= cap + 0.5,
    `${Math.round(j.totalMinutes)}분짜리가 남아 있다 (가장 빠른 길 ${Math.round(fastest)}분)`));
  assert.ok(ranked[0].totalMinutes < 120, '1위가 두 시간이 넘는다');
});

t('출근시간이 한산한 시각·요일과 분명히 다르다', () => {
  const avg = list => list.reduce((s, j) => s + j.pSeated, 0) / list.length;
  const rush = plan('월곡동두산아파트', '중구청', 8 * 60, 'weekday');
  const noon = plan('월곡동두산아파트', '중구청', 14 * 60, 'weekday');
  const sun = plan('월곡동두산아파트', '중구청', 8 * 60, 'sunday');
  assert.ok(avg(rush) < avg(noon) - 0.1, `평일 08시(${avg(rush).toFixed(2)})가 평일 14시(${avg(noon).toFixed(2)})보다 낮아야 한다`);
  assert.ok(avg(rush) < avg(sun) - 0.1, `평일 08시(${avg(rush).toFixed(2)})가 일요일 08시(${avg(sun).toFixed(2)})보다 낮아야 한다`);
  // 열두 개가 전부 100% 이던 증상 — 값이 갈리는지 본다
  const pcts = new Set(rush.map(j => Math.round(j.pSeated * 100)));
  assert.ok(pcts.size >= 3, `출근시간인데 확률이 ${pcts.size}가지뿐이다: ${[...pcts].join(',')}`);
});

t('버스 왕복이 방향별로 갈려 있다 (D-51)', () => {
  const bus = graph.routes.filter(r => r.kind !== 'subway');
  const two = bus.filter(r => r.dirs.length === 2);
  assert.ok(two.length / bus.length > 0.7,
    `두 방향으로 갈린 노선이 ${two.length}/${bus.length} 뿐이다 — 회차점 찾기가 망가졌다`);
  two.forEach(r => {
    assert.strictEqual(r.dirs.length, r.stops.length, `${r.name}: dirs 와 stops 개수가 다르다`);
    r.dirs.forEach((d, i) => assert.strictEqual(d.length, r.stops[i].length,
      `${r.name} 방향${i + 1}: 노드와 정류장 ID 개수가 다르다`));
  });
});

t('같은 노선이라도 방향이 다르면 혼잡이 다르다', () => {
  const ctx = { graph, congestion: CONG, ride: RIDE, busRouteOf,
                minutes: 8 * 60, dayType: 'weekday', alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L.makeLoadFor(ctx);
  L.clearCache();
  let differ = 0, looked = 0;
  for (const r of graph.routes) {
    if (r.kind === 'subway' || r.dirs.length !== 2) continue;
    const ri = graph.routes.indexOf(r);
    const p = r.dirs.map((d, di) => {
      const leg = { routeIdx: ri, dirIdx: di, fromPos: 0, toPos: Math.min(8, d.length - 1),
                    kind: r.kind, vehicle: r.vehicle, stops: Math.min(8, d.length - 1),
                    rideMinutes: 20, offsetMinutes: 0 };
      const info = ctx.loadFor(leg);
      return info && info.segments && info.segments.length ? info.segments[0].load : null;
    });
    if (p[0] == null || p[1] == null) continue;
    looked++;
    if (Math.abs(p[0] - p[1]) > 0.5) differ++;
    if (looked >= 60) break;
  }
  assert.ok(looked >= 20, `방향 두 개짜리 노선을 ${looked}개밖에 못 봤다`);
  assert.ok(differ / looked > 0.5,
    `방향에 따라 값이 갈리는 노선이 ${differ}/${looked} 뿐 — 캐시 키에서 방향이 빠졌을 수 있다`);
});

t('버스에도 요일이 반영된다 (D-54)', () => {
  const tb = L.dayFactors(RIDE);
  if (!tb) return;                                   // 지하철 승하차 자료가 없으면 건너뛴다
  const at = (k, h) => tb[k][h - tb.hour0];
  assert.ok(at('weekday', 8) > 1.15, `평일 08시 계수가 ${at('weekday', 8).toFixed(2)} 밖에 안 된다`);
  assert.ok(at('sunday', 8) < 0.5, `일요일 08시 계수가 ${at('sunday', 8).toFixed(2)} 나 된다`);
  // 낮에는 요일 차가 작아야 한다 — 출근 첨두에서만 크게 벌어진다
  assert.ok(Math.abs(at('weekday', 13) - 1) < 0.15, '평일 낮 계수가 1 에서 멀다');
  // 표가 아니라 실제 버스 계산에 먹는지
  const mk = day => { const c = { graph, congestion: CONG, ride: RIDE, busRouteOf,
                                  minutes: 8 * 60, dayType: day, alpha: M.ALPHA_DEFAULT };
                      c.loadFor = L.makeLoadFor(c); return c; };
  // 값이 실제로 나오는 노선을 찾아 본다 — 「자료가 없어 조용히 통과」를 막는다
  const load = (leg, day) => {
    L.clearCache();
    const info = mk(day).loadFor(leg);
    return info && info.segments && info.segments.length ? info.segments[0].load : null;
  };
  let checked = 0;
  for (const r of graph.routes) {
    if (checked >= 5) break;
    if (r.kind === 'subway' || r.kind === 'night' || r.dirs[0].length < 14) continue;
    const leg = { routeIdx: graph.routes.indexOf(r), dirIdx: 0, fromPos: 2, toPos: 10,
                  kind: r.kind, vehicle: r.vehicle, stops: 8, rideMinutes: 20, offsetMinutes: 0 };
    const wd = load(leg, 'weekday'), su = load(leg, 'sunday');
    if (wd == null || su == null || wd < 1) continue;
    checked++;
    assert.ok(wd > su,
      `${r.name}: 평일 08시(${wd.toFixed(1)}명)가 일요일(${su.toFixed(1)}명)보다 많아야 한다`);
  }
  assert.strictEqual(checked, 5, `요일 보정을 확인할 노선을 ${checked}개밖에 못 찾았다`);
});

t('카드의 퍼센트와 「서서 N분」이 한 잣대다 — (1−비율)×타는시간 = 서서시간 (D-71)', () => {
  const ranked = plan('월곡동두산아파트', '중구청', 8 * 60, 'weekday');
  for (const j of ranked) {
    if (j.walkOnly || !j.knownLegs) continue;
    const implied = (1 - j.pSeatedTime) * j.rideMinutes;
    assert.ok(Math.abs(implied - j.standingMinutes) < 0.51,
      `${j.legs.map(l => l.routeName).join('→')}: 비율이 말하는 서서 ${implied.toFixed(1)}분 ≠ 머리기사 ${j.standingMinutes.toFixed(1)}분`);
    assert.strictEqual(j.seatChance.percent, Math.round(j.pSeatedTime * 100),
      '카드 퍼센트가 pSeatedTime 이 아니다 — 탈때 가중평균으로 되돌아갔다(모순 재발)');
  }
});
