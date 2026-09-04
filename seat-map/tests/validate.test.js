/* 사양서 10장 「검증 기준」 — 모델이 상식과 맞는지 보는 시험.
   실행:  cd seat-map && node --test tests/

   ★ 이 파일이 무엇을 증명하고 무엇을 증명하지 않는가 ★
   data/subway/congestion.json 이 있으면 REAL 모드로 **실측값**을 검사한다.
   없으면 SIM 모드로 engine/sim-seoul.js 의 폴백 곡선을 검사한다.
   SIM 모드 통과는 "서울이 실제로 그렇다"가 아니라 "폴백이 목표대로 보정돼 있고
   모델이 그 값을 제대로 읽는다"는 뜻뿐이다. 모드는 실행할 때마다 화면에 찍는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const S = require('../engine/sim-seoul.js');
const T = require('../engine/transfer.js');

const REAL_PATH = path.join(__dirname, '..', 'data', 'subway', 'congestion.json');
const REAL = fs.existsSync(REAL_PATH) ? JSON.parse(fs.readFileSync(REAL_PATH, 'utf8')) : null;
const MODE = REAL ? 'REAL' : 'SIM';
console.log(`\n  [검증 모드: ${MODE}] ${REAL ? REAL_PATH : '실측 파일이 없어 폴백 시뮬레이션으로 검사한다'}\n`);

/* 혼잡도(%) 한 값. REAL 이면 실측 격자에서, SIM 이면 폴백 곡선에서. */
function congestion(line, station, dayType, minutes) {
  if (REAL) {
    const key = `${line}|${station}|${dayType}`;
    const grid = REAL.grid[key];
    assert.ok(grid, `실측에 ${key} 가 없다`);
    const I = require('../engine/interp.js');
    return I.valueAt(grid, { slotMinutes: REAL.slotMinutes || 30, startMinutes: REAL.startMinutes || 300, atMinutes: minutes });
  }
  return S.congestionAt({ line, dayType, minutes });
}

/* 하루(05:00~24:00)를 5분 간격으로 훑어 최대 혼잡도를 찾는다. */
function peakCongestion(line, station, dayType) {
  let mx = 0;
  for (let t = 300; t <= 1440; t += 5) mx = Math.max(mx, congestion(line, station, dayType, t));
  return mx;
}

/* ── 기대값의 정본 ────────────────────────────────────────────────────────
   사양서 10장은 원래 5호선 110~130%, 6호선 70~85%, 빈 좌석 20석 이상을 적었다.
   2026-06-30 실측(서울교통공사 공식)을 넣자 셋 다 어긋났고,
   2026-09-04 사용자 판단으로 **실측에 맞춰 갱신**했다(DECISIONS.md D-19).

   「호선 피크」의 정의도 여기서 못 박는다 — **그 호선 전 역·전 방향의 칸별 최댓값**.
   가장 보수적이고, "내가 서게 되나"라는 질문에 가장 가깝다.

   값은 원천이 갱신되면 달라진다. 그때 이 표를 고치고 왜 달라졌는지 HANDOFF 에 적는다.
   ★ 시험을 통과시키려고 범위를 넓히지 말 것 — 그러면 이 표가 아무것도 안 지킨다. */
const EXPECT = {
  source: '서울교통공사_지하철혼잡도정보 2026-06-30',
  line5Peak: [125, 145],      // 실측 133.3% (길동 하선)
  line6Peak: [100, 120],      // 실측 110.3% (동묘앞 하선)
  wolgok0600: { minEmptySeats: 10, minSeatProb: 0.90 },   // 실측 상선 24.8% → 빈 14석 · 착석 91.8%
  weekendRatio: [0.35, 0.65]  // 실측 토 52% · 일 41%
};

const CAP = M.VEHICLES.subwayCar.capacity;
const SEATS = M.VEHICLES.subwayCar.seats;
function loadAt(line, station, dayType, minutes) {
  return M.loadFromCongestion(congestion(line, station, dayType, minutes), CAP);
}

/* 방향별로도 본다. 실측은 상·하선이 크게 다르고(6호선 월곡 06:00 = 상선 24.8% / 하선 10.8%),
   사양서 10장은 방향을 밝히지 않았다. 기본 키는 **더 붐비는 쪽**이라 보수적이다. */
function bothWays(line, station, dayType, minutes) {
  const out = {};
  for (const d of ['상선', '하선', '내선', '외선']) {
    const k = `${line}|${station}|${dayType}|${d}`;
    if (REAL && REAL.grid[k]) out[d] = M.loadFromCongestion(
      require('../engine/interp.js').valueAt(REAL.grid[k], {
        slotMinutes: REAL.slotMinutes || 30, startMinutes: REAL.startMinutes || 300, atMinutes: minutes }), CAP);
  }
  return out;
}

// ── 표 1행: 6호선 월곡, 평일 06:00 (기준은 EXPECT.wolgok0600 — 사양서 원안은 20석이었다) ──
test('6호선 월곡 평일 06:00 — 빈 좌석 10석 이상, 착석 확률 90% 이상', () => {
  const load = loadAt('6', '월곡', 'weekday', 6 * 60);
  const empty = M.emptySeats(load, SEATS);
  const p = M.pBoard(load, SEATS);
  const ways = bothWays('6', '월곡', 'weekday', 6 * 60);
  const detail = Object.entries(ways)
    .map(([d, l]) => `${d} ${(l / CAP * 100).toFixed(1)}%/빈 ${M.emptySeats(l, SEATS)}석`).join(' · ');
  console.log(`    06:00  혼잡도 ${(load / CAP * 100).toFixed(1)}% · 빈 좌석 ${empty}석 · 착석 ${(p * 100).toFixed(1)}%`
    + (detail ? `   [${detail}]` : ''));
  assert.ok(p >= EXPECT.wolgok0600.minSeatProb,
    `착석 확률 ${(p * 100).toFixed(1)}% — ${EXPECT.wolgok0600.minSeatProb * 100}% 이상이어야 한다`);
  assert.ok(empty >= EXPECT.wolgok0600.minEmptySeats,
    `빈 좌석 ${empty}석 — ${EXPECT.wolgok0600.minEmptySeats}석 이상이어야 한다. 방향별: ${detail || '(SIM 모드)'}`);
});

// ── 표 2행: 6호선 월곡, 평일 08:00 → 빈 좌석 0석 ──────────────────────────
test('6호선 월곡 평일 08:00 — 빈 좌석 0석', () => {
  const load = loadAt('6', '월곡', 'weekday', 8 * 60);
  const empty = M.emptySeats(load, SEATS);
  console.log(`    08:00  혼잡도 ${(load / CAP * 100).toFixed(1)}% · 빈 좌석 ${empty}석`);
  assert.strictEqual(empty, 0, `빈 좌석 ${empty}석 — 출근시간에 자리가 남아선 안 된다`);
});

// ── 표 3·4행: 호선별 평일 피크 혼잡도 ────────────────────────────────────
test('5호선 평일 피크 혼잡도가 실측 기준 안에 있다', () => {
  const pk = peakCongestion('5', '전체', 'weekday');
  const [lo, hi] = EXPECT.line5Peak;
  console.log(`    5호선 피크 ${pk.toFixed(1)}%  (기준 ${lo}~${hi})`);
  assert.ok(pk >= lo && pk <= hi, `${pk.toFixed(1)}% — ${lo}~${hi} 밖이다 (기준: ${EXPECT.source})`);
});

/* 5호선과 같은 기준(그 호선 전 역·전 방향의 칸별 최댓값)으로 물어야 한다.
   처음엔 6호선만 '월곡'으로 물어서 84.4% 가 나왔고 그래서 통과했다 — 기준이 달랐던 것뿐이다. */
test('6호선 평일 피크 혼잡도가 실측 기준 안에 있다', () => {
  const pk = peakCongestion('6', '전체', 'weekday');
  const [lo, hi] = EXPECT.line6Peak;
  console.log(`    6호선 피크 ${pk.toFixed(1)}%  (기준 ${lo}~${hi}, 참고: 월곡 ${peakCongestion('6', '월곡', 'weekday').toFixed(1)}%)`);
  assert.ok(pk >= lo && pk <= hi, `${pk.toFixed(1)}% — ${lo}~${hi} 밖이다 (기준: ${EXPECT.source})`);
});

test('6호선이 5호선보다 한산하다 — 정의를 바꿔도 뒤집히면 안 된다', () => {
  assert.ok(peakCongestion('6', '전체', 'weekday') < peakCongestion('5', '전체', 'weekday'),
    '6호선이 5호선보다 붐비게 나왔다 — 사양서가 6호선을 한산한 노선으로 본 전제가 깨진다');
});

// ── 표 5행: 토·일 피크는 평일 대비 40~65% ────────────────────────────────
test('토·일 피크는 평일 피크의 40~65% 수준', () => {
  const wd = peakCongestion('6', '월곡', 'weekday');
  for (const d of ['saturday', 'sunday']) {
    const r = peakCongestion('6', '월곡', d) / wd;
    console.log(`    ${d === 'saturday' ? '토' : '일'} 피크 = 평일의 ${(r * 100).toFixed(0)}%`);
    const [wlo, whi] = EXPECT.weekendRatio;
    assert.ok(r >= wlo && r <= whi,
      `${d}: 평일의 ${(r * 100).toFixed(0)}% — ${wlo * 100}~${whi * 100} 밖이다`);
  }
});

// ── 표 6행: 광역 M버스 피크 → 잔여좌석 0, 착석 확률 계단식 하락 ──────────
test('광역 M버스 피크 — 잔여좌석 0, 착석 확률은 계단식으로 떨어진다', () => {
  const ex = M.VEHICLES.busExpress;
  // 하루 중 가장 붐비는 시각의, 가장 붐비는 정거장에서 탄다고 본다.
  let worst = 0, worstAt = 0;
  for (let t = 300; t <= 1440; t += 5) {
    const prof = S.busProfile({ stops: 24, dayType: 'weekday', minutes: t, peakRiders: ex.seats });
    const m = Math.max.apply(null, prof.loads);
    if (m > worst) { worst = m; worstAt = t; }
  }
  const free = Math.max(0, Math.round(ex.seats - worst));
  console.log(`    피크 ${Math.floor(worstAt / 60)}:${String(worstAt % 60).padStart(2, '0')} · 재차 ${worst.toFixed(1)}명 / 좌석 ${ex.seats}석 · 잔여 ${free}석`);
  assert.strictEqual(free, 0, `잔여좌석 ${free}석 — 광역버스 피크는 만석이어야 한다`);

  const steps = [4, 3, 2, 1, 0].map(M.pBoardExpress);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] < steps[i - 1] - 0.05, '잔여좌석이 줄었는데 확률이 완만하게만 떨어진다');
  }
  console.log('    잔여 4·3·2·1·0석 → ' + steps.map(p => (p * 100).toFixed(0) + '%').join(' · '));
});

// ── 표 7행: 임의 경로에 되돌아가는 구간이 없을 것 ────────────────────────
/* 경로 탐색 본체는 M2-2 에서 만든다. 지금은 탐색이 반드시 통과해야 하는 관문
   (같은 노선 환승 배제 · 완성 경로의 되돌아감 검출)을 검사한다.
   탐색이 생기면 이 시험을 실제 탐색 결과에 걸어 확장한다. */
test('되돌아가는 경로가 만들어지지 않는다 (화곡→여의도 사례)', () => {
  const atNode = [
    { routeId: '5', label: '5호선 방화행' },
    { routeId: '5', label: '5호선 하남검단산행' },
    { routeId: '9', label: '9호선 급행' },
    { routeId: 'B600', label: '600번' }
  ];
  const ok = T.transferCandidates('5', atNode);
  assert.ok(!ok.some(c => c.routeId === '5'), '같은 노선이 환승 후보에 남았다');

  const badRoute = [{ routeId: '5', fromSeq: 12, toSeq: 1 }, { routeId: '5', fromSeq: 1, toSeq: 30 }];
  const goodRoute = [{ routeId: '5', fromSeq: 12, toSeq: 20 }, { routeId: 'B600', fromSeq: 3, toSeq: 9 }];
  assert.strictEqual(T.hasBacktrack(badRoute), true);
  assert.strictEqual(T.hasBacktrack(goodRoute), false);
});

// ── 6.2-③ 재차인원 모델이 물리적으로 틀리지 않을 것 ──────────────────────
test('OD 방식이라 인원이 보존되고, 노선 중앙이 볼록하다', () => {
  const n = 30;
  const b = [], w = [];
  for (let i = 0; i < n; i++) {
    b.push(Math.exp(-Math.pow((i - n * 0.2) / (n * 0.28), 2)));
    w.push(Math.exp(-Math.pow((i - n * 0.7) / (n * 0.26), 2)));
  }
  const od = S.odLoads({ boardings: b, attract: w });
  // 종점 승차는 갈 데가 없어 0으로 잘린다. 잘린 뒤의 승차 합과 하차 합이 맞아야 한다.
  const inSum = od.boardings.reduce((a, x) => a + x, 0);
  const outSum = od.alights.reduce((a, x) => a + x, 0);
  assert.ok(Math.abs(inSum - outSum) < 1e-9, `탄 사람 ${inSum} · 내린 사람 ${outSum} — 인원이 안 맞는다`);
  assert.ok(Math.abs(od.droppedBoardings - b[n - 1]) < 1e-12, '잘라낸 종점 승차를 보고하지 않았다');

  const peakIdx = od.loads.indexOf(Math.max.apply(null, od.loads));
  assert.ok(peakIdx > n * 0.2 && peakIdx < n * 0.8,
    `재차 최대가 ${peakIdx}번째 — 노선 중앙이 볼록해야 한다(사양서 6.2-③)`);
  assert.ok(od.loads[0] >= 0 && od.loads[n - 1] === 0, '종점에 사람이 남았다');
});
