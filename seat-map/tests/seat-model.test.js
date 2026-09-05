/* 착석 확률 모델 단위 시험 (사양서 M2-4).
   실행:  cd seat-map && node --test tests/
   외부 의존 없음 — Node 기본 test runner 만 쓴다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../engine/seat-model.js');
const T = require('../engine/transfer.js');
const I = require('../engine/interp.js');

const SUB = M.VEHICLES.subwayCar;

// ── 5.1 승차 즉시 착석 확률 ────────────────────────────────────────────────
test('재차인원 = 좌석수 이면 착석 확률이 정확히 0.5', () => {
  assert.strictEqual(M.pBoard(54, 54), 0.5);
  assert.strictEqual(M.pBoard(23, 23), 0.5);
});

test('재차인원이 늘수록 착석 확률은 단조 감소한다', () => {
  let prev = 1;
  for (let load = 0; load <= 160; load += 5) {
    const p = M.pBoard(load, SUB.seats);
    assert.ok(p < prev, `load=${load} 에서 단조성이 깨졌다`);
    prev = p;
  }
});

test('지하철 혼잡도 34% 가 좌석 만석 지점이다 (사양서 4.1)', () => {
  const load = M.loadFromCongestion(M.SEAT_RATIO_SUBWAY * 100, SUB.capacity);
  const p = M.pBoard(load, SUB.seats);
  assert.ok(p > 0.45 && p < 0.55, `34% 에서 p=${p.toFixed(3)} — 0.5 근처가 아니다`);
});

test('광역버스는 잔여좌석 1석에서 0.5, 계단식으로 떨어진다', () => {
  assert.ok(Math.abs(M.pBoardExpress(1) - 0.5) < 1e-12);
  const steps = [3, 2, 1, 0].map(M.pBoardExpress);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] < steps[i - 1], '잔여좌석이 줄었는데 확률이 안 떨어졌다');
    assert.ok(steps[i - 1] - steps[i] > 0.10, '하락폭이 계단이라 부르기엔 완만하다');
  }
});

// ── 5.2 가는 도중 착석 확률 ────────────────────────────────────────────────
test('한 정거장 착석 확률은 0.92 를 넘지 않는다', () => {
  assert.strictEqual(M.pSitAtStop(9999, 200, 54, 0.55), M.P_STOP_CAP);
});

test('서 있는 사람이 0명이어도 나눗셈이 터지지 않는다', () => {
  const p = M.pSitAtStop(10, 20, 54, 0.55);   // 재차 20 < 좌석 54
  assert.ok(Number.isFinite(p) && p >= 0 && p <= M.P_STOP_CAP);
});

// ── ride() ────────────────────────────────────────────────────────────────
function seg(load, minutes, alight) { return { load, minutes, alightAtEnd: alight }; }

test('서서 가는 시간은 총 소요시간을 넘지 않고, 음수가 되지 않는다', () => {
  const r = M.ride({ vehicle: 'subwayCar', segments: [seg(150, 2, 12), seg(140, 2, 10), seg(130, 2, 9)] });
  assert.ok(r.standingMinutes >= 0);
  assert.ok(r.standingMinutes <= r.totalMinutes + 1e-9);
  assert.strictEqual(r.totalMinutes, 6);
});

test('텅 빈 차는 바로 앉고 서서 가는 시간이 0에 가깝다', () => {
  const r = M.ride({ vehicle: 'subwayCar', segments: [seg(10, 2, 1), seg(9, 2, 1)] });
  assert.ok(r.pBoard > 0.99);
  assert.ok(r.standingMinutes < 0.05);
});

test('아무도 안 내리면 도중 착석 확률이 0이고, 서서 가는 시간은 (1-pBoard)×총시간', () => {
  const segs = [seg(150, 3, 0), seg(150, 3, 0), seg(150, 3, 0)];
  const r = M.ride({ vehicle: 'subwayCar', segments: segs });
  assert.ok(Math.abs(r.pDuring) < 1e-12);
  assert.ok(Math.abs(r.standingMinutes - (1 - r.pBoard) * 9) < 1e-9);
});

test('앉을 확률(pSeated)은 승차 확률(pBoard) 이상이다', () => {
  const r = M.ride({ vehicle: 'subwayCar', segments: [seg(150, 2, 20), seg(130, 2, 18), seg(110, 2, 15)] });
  assert.ok(r.pSeated >= r.pBoard);
  assert.ok(r.pSeated <= 1 && r.pDuring <= 1);
});

test('경쟁 계수 α 가 클수록 서서 가는 시간이 줄어든다', () => {
  const segs = [seg(150, 2, 12), seg(140, 2, 12), seg(130, 2, 12), seg(120, 2, 12)];
  const lo = M.ride({ vehicle: 'subwayCar', alpha: 0.30, segments: segs }).standingMinutes;
  const hi = M.ride({ vehicle: 'subwayCar', alpha: 0.80, segments: segs }).standingMinutes;
  assert.ok(hi < lo, 'α 를 올렸는데 서서 가는 시간이 안 줄었다');
});

test('구간별 서 있을 확률은 뒤로 갈수록 줄기만 한다', () => {
  const r = M.ride({ vehicle: 'subwayCar', segments: [seg(150, 2, 20), seg(130, 2, 20), seg(110, 2, 20), seg(90, 2, 20)] });
  for (let i = 1; i < r.perSegment.length; i++) {
    assert.ok(r.perSegment[i].standingProb <= r.perSegment[i - 1].standingProb + 1e-12);
  }
});

test('광역버스는 입석이 없으므로 서서 가는 시간이 0이다', () => {
  const r = M.ride({ vehicle: 'busExpress', freeSeats: 4, segments: [seg(37, 10, 0), seg(37, 12, 0)] });
  assert.strictEqual(r.standingMinutes, 0);
  assert.strictEqual(r.boardable, r.pBoard);
  assert.strictEqual(r.totalMinutes, 22);
});

// ── 4.2 분산 살리기 ───────────────────────────────────────────────────────
test('invNorm 은 표준정규 역함수다', () => {
  assert.ok(Math.abs(M.invNorm(0.5)) < 1e-9);
  assert.ok(Math.abs(M.invNorm(0.975) - 1.959964) < 1e-4);
  assert.ok(Math.abs(M.invNorm(0.025) + 1.959964) < 1e-4);
});

test('평균·최대·운행횟수로 표준편차를 역산한다', () => {
  assert.strictEqual(M.sdFromMeanMax(30, 45, 1), 0, '운행이 1회면 최대=평균이라 분산을 못 구한다');
  const sd = M.sdFromMeanMax(30, 45, 8);
  assert.ok(sd > 0 && sd < 15, `sd=${sd} — 8회 중 최대가 평균보다 15 크면 표준편차는 그 사이여야 한다`);
  // 같은 최대라도 운행이 많을수록 그 최대는 "흔한 꼬리"라 표준편차 추정은 작아진다.
  assert.ok(M.sdFromMeanMax(30, 45, 40) < M.sdFromMeanMax(30, 45, 4));
});

test('분산이 0이면 rideSpread 는 ride 와 같은 값을 낸다', () => {
  const segs = [seg(120, 2, 12), seg(115, 2, 11)];
  const a = M.ride({ vehicle: 'subwayCar', segments: segs });
  const b = M.rideSpread({ vehicle: 'subwayCar', segments: segs.map(s => ({ ...s, loadSd: 0 })) });
  assert.ok(Math.abs(a.standingMinutes - b.standingMinutes) < 1e-9);
  assert.ok(Math.abs(a.pSeated - b.pSeated) < 1e-9);
});

test('"8대 중 3대는 만원" — 평균만 보면 놓치는 것을 분산이 잡아낸다', () => {
  // 평균 재차 40명(좌석 54)이면 평균만 볼 땐 91% 앉는다. 그런데 편차가 크면
  // 붐비는 차가 섞여 있고, 그 차에서 못 앉는 손해가 한산한 차의 이득보다 크다(로지스틱이 휘어 있다).
  const flat = M.ride({ vehicle: 'subwayCar', segments: [seg(40, 3, 0)] });
  const wide = M.rideSpread({ vehicle: 'subwayCar', segments: [{ load: 40, minutes: 3, alightAtEnd: 0, loadSd: 20 }] });
  assert.ok(wide.pBoard < flat.pBoard - 0.02,
    `평균 ${flat.pBoard.toFixed(3)} / 분산 반영 ${wide.pBoard.toFixed(3)} — 분포 정보가 버려지고 있다`);
  assert.ok(wide.standingMinutes > flat.standingMinutes,
    '분산을 넣으면 서서 가는 시간 기댓값도 늘어야 한다');

  // 평균이 정확히 좌석수면 로지스틱이 그 점에서 대칭이라 값이 거의 안 변한다. 버그가 아니다.
  const sym = M.rideSpread({ vehicle: 'subwayCar', segments: [{ load: 54, minutes: 3, alightAtEnd: 0, loadSd: 20 }] });
  assert.ok(Math.abs(sym.pBoard - 0.5) < 0.02);
});

// ── 5.4 정렬과 문구 ───────────────────────────────────────────────────────
test('사양서 1.2 의 예시대로 정렬한다 — 52분 앉아가는 버스가 41분 서서가는 지하철보다 위', () => {
  const subway = { name: '지하철', totalMinutes: 41, standingMinutes: 33 };
  const bus    = { name: '버스',   totalMinutes: 52, standingMinutes: 6 };
  const sorted = M.sortRoutes([subway, bus]);
  assert.strictEqual(sorted[0].name, '버스');
});

test('못 앉는 시간이 같으면 총 소요시간으로 2차 정렬한다', () => {
  const a = { name: 'a', totalMinutes: 50, standingMinutes: 10 };
  const b = { name: 'b', totalMinutes: 40, standingMinutes: 10 };
  assert.strictEqual(M.sortRoutes([a, b])[0].name, 'b');
});

test('D-77 — 서기 3분+걷기 30분보다 서기 8분+걷기 5분이 앞이다 (못 앉는 시간 정렬)', () => {
  const a = { name: 'lessStand', totalMinutes: 40, standingMinutes: 3, walkMinutes: 30 };
  const b = { name: 'lessNoSit', totalMinutes: 45, standingMinutes: 8, walkMinutes: 5 };
  assert.strictEqual(M.sortRoutes([a, b])[0].name, 'lessNoSit',
    '서는 시간만 보고 세웠다 — 걷기도 못 앉는 시간이다');
  assert.strictEqual(M.noSitMinutes(a), 33);
});

test('D-77 — 90 초과는 숫자 없이 「웬만하면 타는 내내」 (백 프로 절대 금지)', () => {
  for (const p of [0.91, 0.97, 1.0]) {
    const c = M.seatChanceJourney(p);
    assert.strictEqual(c.text, '웬만하면 타는 내내 앉아 갑니다', `${p} 에서 "${c.text}"`);
    assert.ok(!/\d/.test(c.text), '90 초과 숫자가 입 밖에 나왔다');
    assert.ok(!c.label, '「웬만하면 앉아 갑니다」가 겹쳐 붙는다');
  }
  assert.ok(M.seatChanceJourney(0.90).text.includes('90%'), '90 까지는 숫자로 말한다');
});

test('D-77 — 0% 는 「타는 동안 못 앉아 갑니다」 (사용자 지시)', () => {
  const c = M.seatChanceJourney(0);
  assert.strictEqual(c.text, '타는 동안 못 앉아 갑니다');
  assert.strictEqual(c.percent, 0);
  assert.ok(!c.label, '「못 앉습니다」를 붙이면 같은 말이 두 번이다');
  assert.ok(M.seatChanceJourney(0.004).text.includes('못 앉아'), '반올림해서 0 이어도 같은 문구');
  assert.ok(M.seatChanceJourney(0.01).text.includes('1%'), '1% 부터는 숫자로 말한다');
});

test('버그 ⑤ — 배지 문구가 정렬 키와 어긋나지 않는다 (D-77)', () => {
  assert.strictEqual(M.SORT_KEY, 'standingMinutes+walkMinutes');   // 정렬 = 못 앉는 시간
  assert.ok(M.SORT_BADGE.includes('못 앉는'), '정렬은 못 앉는 시간인데 문구에 그 말이 없다');
  // 「가장 앉아서 갈 수 있는 길」 류(확률 얘기)로 돌아가면 안 된다 — 시간 얘기만 한다.
  assert.ok(M.SORT_BADGE.includes('시간'), '배지는 확률이 아니라 시간을 말해야 한다');
});

test('7.3 — 숫자가 아니라 자리 수로 말한다', () => {
  assert.strictEqual(M.describeSeats(19, 23), '23자리 가운데 4자리 비어 있습니다');
  assert.strictEqual(M.describeSeats(40, 23), '23자리가 모두 찼습니다');
});

test('착석 확률은 다섯 단계로 나뉘고 경계가 정확하다 (2026-09-04 지시)', () => {
  const want = [
    [1.00, 'best'], [0.80, 'best'], [0.799, 'good'], [0.60, 'good'],
    [0.599, 'mid'], [0.40, 'mid'], [0.399, 'low'], [0.20, 'low'],
    [0.199, 'bad'], [0, 'bad']
  ];
  for (const [p, tone] of want) {
    assert.strictEqual(M.seatChance(p).tone, tone, `${(p * 100).toFixed(1)}% 가 ${tone} 이 아니다`);
  }
  assert.strictEqual(M.SEAT_LEVELS.length, 5);
});

test('확률은 숫자로 말하고, 문구가 항상 함께 붙는다', () => {
  const c = M.seatChance(0.923);
  // D-73: 표기 상한 90 — 계산 92 라도 입 밖으로는 90
  assert.strictEqual(c.text, '탈 때 앉을 확률 90%');
  assert.strictEqual(c.label, '웬만하면 앉아 갑니다');
  // 뜻(「탈 때」)이 이름 안에 있어야 한다 — 밖에 꼬리말로 붙이면 뒷줄과 붙어 읽힌다.
  assert.ok(c.text.startsWith('탈 때'), '「탈 때」가 이름에 없다');
  // 「앉을 확률 79% · 앉을 확률 높습니다」처럼 같은 말이 겹치면 안 된다.
  for (const lv of M.SEAT_LEVELS) {
    assert.ok(!lv.text.includes('앉을 확률'), `"${lv.text}" — 앞의 「앉을 확률 NN%」와 겹친다`);
  }
});

test('7.3 — 색에는 항상 문구가 따라붙는다', () => {
  for (const p of [0.95, 0.6, 0.1]) {
    const s = M.seatPhrase(p);
    assert.ok(s.tone && s.text && s.text.length > 3, '색만 있고 문구가 없다');
  }
  assert.strictEqual(M.standingPhrase(11), '서는 시간 11분');   // D-74 문구
});

// ── 6.2 이미 겪은 버그들 ──────────────────────────────────────────────────
test('버그 ② — 지하철역 「월곡」과 버스정류장 「월곡역」이 같은 이름으로 정규화된다', () => {
  assert.strictEqual(T.canonStopName('월곡역'), T.canonStopName('월곡'));
  assert.strictEqual(T.canonStopName('월곡역 정류장'), '월곡');
  assert.strictEqual(T.canonStopName('신촌(경의중앙선)'), '신촌');
});

test('버그 ② — 정답은 좌표 클러스터링이다 (150m 안이면 한 노드)', () => {
  const stops = [
    { id: 's1', name: '월곡',       lat: 37.6020, lon: 127.0415, kind: 'subway' },
    { id: 'b1', name: '월곡역앞',   lat: 37.6021, lon: 127.0424, kind: 'bus' },   // 약 80m
    { id: 'b2', name: '먼정류장',   lat: 37.6060, lon: 127.0500, kind: 'bus' }    // 800m 밖
  ];
  const nodes = T.clusterStops(stops, 150);
  assert.strictEqual(nodes.length, 2);
  const big = nodes.find(n => n.members.length === 2);
  assert.ok(big, '월곡역과 월곡역앞이 한 노드로 안 묶였다 — 버스↔지하철 환승이 통째로 사라진다');
  assert.strictEqual(big.name, '월곡', '노드 이름은 사람이 아는 지하철역 이름이어야 한다');
});

test('버그 ① — 같은 노선은 방향 무관하게 환승 후보에서 빠진다 (화곡→여의도)', () => {
  const cands = [
    { routeId: '5', label: '5호선 방화행' },
    { routeId: '5', label: '5호선 상일동행' },
    { routeId: '9', label: '9호선 중앙보훈병원행' }
  ];
  const left = T.transferCandidates('5', cands);
  assert.strictEqual(left.length, 1);
  assert.strictEqual(left[0].routeId, '9');
});

test('버그 ① — 완성된 경로에 같은 노선이 두 번 나오면 되돌아가는 경로다', () => {
  assert.strictEqual(T.hasBacktrack([{ routeId: '5', fromSeq: 10, toSeq: 2 }, { routeId: '5', fromSeq: 2, toSeq: 20 }]), true);
  assert.strictEqual(T.hasBacktrack([{ routeId: '5', fromSeq: 10, toSeq: 20 }, { routeId: '9', fromSeq: 3, toSeq: 11 }]), false);
});

test('버그 ④ — 방향 라벨은 역 배열에서 파생된다', () => {
  const line6 = ['응암', '역촌', '불광', '월곡', '상월곡', '봉화산', '신내'];
  const dirs = T.directionsOf(line6);
  assert.strictEqual(dirs[0].label, '신내행');
  assert.strictEqual(dirs[1].label, '응암행');
  // 배열을 뒤집으면 라벨도 반드시 같이 뒤집힌다 — 따로 관리하면 여기서 어긋난다.
  assert.strictEqual(T.directionsOf(line6.slice().reverse())[0].label, '응암행');
});

test('6.3 — 보행속도가 느릴수록 도보 시간이 길어진다', () => {
  const n = T.walkMinutes(600, 'normal'), s = T.walkMinutes(600, 'slow'), v = T.walkMinutes(600, 'vslow');
  assert.ok(n < s && s < v);
  assert.ok(Math.abs(n - 600 * T.WALK_DETOUR / 1.2 / 60) < 1e-9);
});

test('직선거리를 그대로 쓰지 않고 우회계수를 곱한다', () => {
  // 안 곱하면 「300m 니까 4분」이라 해 놓고 실제로는 6분이 걸린다.
  assert.ok(T.WALK_DETOUR >= 1.2 && T.WALK_DETOUR <= 1.5, '우회계수가 상식 범위를 벗어났다');
  assert.strictEqual(T.walkDistance(1000), 1000 * T.WALK_DETOUR);
  assert.ok(T.walkMinutes(600, 'normal') > 600 / 1.2 / 60,
    '직선거리를 그대로 나눠 실제보다 짧게 말하고 있다');
});

// ── 3.3 보간 ──────────────────────────────────────────────────────────────
test('격자점에서는 원천값을 그대로 돌려준다', () => {
  const grid = [10, 20, 60, 30];
  for (let i = 0; i < grid.length; i++) {
    const v = I.valueAt(grid, { slotMinutes: 30, startMinutes: 300, atMinutes: 300 + i * 30 });
    assert.ok(Math.abs(v - grid[i]) < 1e-9, `격자점 ${i} 에서 값이 변했다`);
  }
});

test('보간값은 이웃한 두 원천값 사이를 절대 벗어나지 않는다', () => {
  const grid = [10, 20, 60, 30, 31];
  for (let t = 300; t <= 300 + 4 * 30; t += 1) {
    const v = I.valueAt(grid, { slotMinutes: 30, startMinutes: 300, atMinutes: t });
    const i = Math.min(grid.length - 2, Math.floor((t - 300) / 30));
    const lo = Math.min(grid[i], grid[i + 1]), hi = Math.max(grid[i], grid[i + 1]);
    assert.ok(v >= lo - 1e-9 && v <= hi + 1e-9,
      `t=${t} 에서 ${v} — 없는 극값을 만들어냈다`);
  }
});

test('격자 밖 시각은 양 끝값으로 잘린다', () => {
  const grid = [10, 20, 30];
  assert.strictEqual(I.valueAt(grid, { slotMinutes: 30, startMinutes: 300, atMinutes: 0 }), 10);
  assert.strictEqual(I.valueAt(grid, { slotMinutes: 30, startMinutes: 300, atMinutes: 9999 }), 30);
});

test('30분 격자를 5분으로 펼치면 6배가 된다', () => {
  const out = I.expand([10, 20, 30], { slotMinutes: 30, startMinutes: 300, stepMinutes: 5 });
  assert.strictEqual(out.length, 13);        // 60분 구간 / 5분 + 1
  assert.strictEqual(out[0].minutes, 300);
  assert.strictEqual(I.hhmm(out[0].minutes), '05:00');
});

test('보간값에 붙일 출처 문구가 있다 (사양서 3.3 — UI에서 속이지 말 것)', () => {
  assert.ok(I.noteFor(30).includes('30분'));
  assert.ok(I.noteFor(60).includes('1시간'));
  assert.ok(I.noteFor(30).includes('예상값'));
});

// ── D-66: 「어디쯤에서 앉게 되는가」 ────────────────────────────────────────
test('못 앉고 탄 사람이 앉게 되는 중앙값 정거장을 낸다 (D-66)', () => {
  // 만석으로 타서(재차 60/54석) 두 번째 정거장에서 하차가 쏟아지는 상황
  const segs = [
    { load: 60, minutes: 2, alightAtEnd: 1, boardAtEnd: 1 },
    { load: 60, minutes: 2, alightAtEnd: 30, boardAtEnd: 0 },   // 여기서 대량 하차
    { load: 30, minutes: 2, alightAtEnd: 2, boardAtEnd: 0 },
    { load: 28, minutes: 2, alightAtEnd: 2, boardAtEnd: 0 },
  ];
  const r = M.ride({ vehicle: 'subwayCar', segments: segs });
  assert.ok(r.seatAtIdx === 2, `대량 하차 다음 정거장(2)이어야 하는데 ${r.seatAtIdx}`);
  assert.strictEqual(r.seatAtMinutes, 4, `거기까지 4분(2+2)이어야 하는데 ${r.seatAtMinutes}`);
  // 탈 때 바로 앉는 상황에서는 자리 예고가 없어야 한다
  const easy = M.ride({ vehicle: 'subwayCar', segments: [
    { load: 10, minutes: 2, alightAtEnd: 1 }, { load: 10, minutes: 2, alightAtEnd: 1 }] });
  assert.strictEqual(easy.seatAtIdx, null, '거의 다 앉는데 자리 예고가 나왔다');
  // 끝까지 붐비면(하차 미미) 절반을 못 넘겨 null — 「내릴 때까지 서기 쉬움」으로 말할 근거
  const packed = M.ride({ vehicle: 'subwayCar', segments: [
    { load: 150, minutes: 2, alightAtEnd: 2 }, { load: 150, minutes: 2, alightAtEnd: 2 },
    { load: 150, minutes: 2, alightAtEnd: 2 }] });
  assert.strictEqual(packed.seatAtIdx, null, '만원 유지인데 자리 예고가 나왔다');
});
