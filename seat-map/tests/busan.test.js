/* 부산 시험 (D-103) — 승하차로 되짚은 혼잡도가 엔진에 제대로 물리는지.

   ★ 이 시험이 지키는 것 ★
   부산 자료는 서울과 **다른 파일·다른 원천·다른 차량**이다. 어긋날 수 있는 자리가
   셋인데 셋 다 「조용히」 망가진다 — 값이 안 나오는 게 아니라 서울 기본값(정원 160·
   8칸·시간당 20대)으로 물러나 그럴듯한 숫자를 내놓는다. 그래서 눈으로는 못 잡는다.
     ① 격자 모양이 어긋나면 합쳐지지 않는다
     ② 방향 이름이 어긋나면 방향값을 못 찾고 「역 최대」로 물러난다
     ③ 편성·정원이 안 실리면 서울 대형차로 계산한다
*/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../engine/seat-model.js');
const L = require('../engine/loads.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const BUSAN = load(path.join(D, 'subway', 'busan.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const HAVE = !!(BUSAN && CONG && ROUTES);

if (!HAVE) console.log('\n  [건너뜀] `python pipeline/build_busan_congestion.py`\n');
const t = (name, fn) => test(name, { skip: !HAVE && '부산 자료 없음' }, fn);

function routeOf(line) {
  return (ROUTES.routes || []).filter(r => r.line === line)[0];
}
/* 앱이 하는 합치기를 그대로 재현한다 — 시험이 앱과 다른 길을 걸으면 거짓말을 한다. */
function merged() {
  const c = JSON.parse(JSON.stringify(CONG));
  const r = JSON.parse(JSON.stringify(RIDE));
  for (const k in BUSAN.congestion.grid) if (!(k in c.grid)) c.grid[k] = BUSAN.congestion.grid[k];
  for (const k in BUSAN.ride.grid) if (!(k in r.grid)) r.grid[k] = BUSAN.ride.grid[k];
  c.estimatedLines = (c.estimatedLines || []).concat(BUSAN.estimatedLines || []);
  return { congestion: c, ride: r };
}
function segsOf(line, from, to, minutes, dayType) {
  const route = routeOf(line);
  const names = route.stops[0];
  let dirIdx = 0, a = names.indexOf(from), b = names.indexOf(to);
  if (a < 0 || b < 0) throw new Error('역을 못 찾음: ' + from + '/' + to);
  if (a > b) { dirIdx = 1; const rev = route.stops[1]; a = rev.indexOf(from); b = rev.indexOf(to); }
  const ctx = Object.assign({ minutes, dayType: dayType || 'weekday' }, merged());
  return L.subwaySegments(ctx, { dirIdx, fromPos: a, toPos: b, offsetMinutes: 0 }, route);
}

// ── ① 격자 모양 ────────────────────────────────────────────────────────────
t('부산 격자가 서울 격자와 같은 모양이라 합칠 수 있다', () => {
  assert.strictEqual(BUSAN.congestion.slotMinutes, CONG.slotMinutes);
  assert.strictEqual(BUSAN.congestion.startMinutes, CONG.startMinutes);
  assert.strictEqual(BUSAN.congestion.slots, CONG.slots);
  assert.strictEqual(BUSAN.ride.slotMinutes, RIDE.slotMinutes);
  assert.strictEqual(BUSAN.ride.startMinutes, RIDE.startMinutes);
  for (const k in BUSAN.congestion.grid)
    assert.strictEqual(BUSAN.congestion.grid[k].length, CONG.slots, k + ' 칸 수가 다르다');
  // 서울 키를 덮어쓰지 않는다
  for (const k in BUSAN.congestion.grid)
    assert.ok(!(k in CONG.grid), '서울 자료와 키가 겹친다: ' + k);
});

// ── ② 방향 이름 ────────────────────────────────────────────────────────────
t('방향 키가 엔진이 만드는 이름과 같다 (어긋나면 방향값을 통째로 놓친다)', () => {
  for (const line of BUSAN.estimatedLines) {
    const route = routeOf(line);
    assert.ok(route, line + ' 이 그래프에 없다');
    for (const dirIdx of [0, 1]) {
      const side = L.dirName(route, dirIdx);
      const names = route.stops[dirIdx];
      const key = line + '|' + names[0] + '|weekday|' + side;
      assert.ok(key in BUSAN.congestion.grid, '없는 키: ' + key);
    }
  }
});

// ── ③ 차량 제원 ────────────────────────────────────────────────────────────
t('부산 노선에 편성·정원·배차가 실려 있고 차종이 정의돼 있다', () => {
  const want = { '부산 1호선': 8, '부산 2호선': 6, '부산 3호선': 4, '부산 4호선': 6 };
  for (const line in want) {
    const r = routeOf(line);
    assert.strictEqual(r.cars, want[line], line + ' 편성 량수');
    assert.ok(r.capacity > 0 && r.capacity < 160, line + ' 정원이 서울 대형차 값이면 안 된다');
    assert.strictEqual(r.tph.length, 24, line + ' 배차표');
    assert.ok(M.VEHICLES[r.vehicle], '모르는 차종: ' + r.vehicle);
  }
  // 경전철은 중형차보다 확실히 작다 — 이 둘이 같아지면 4호선이 통째로 틀린다
  assert.ok(M.VEHICLES.subwayBusanLight.capacity < M.VEHICLES.subwayBusan.capacity / 2);
  assert.ok(M.VEHICLES.subwayBusan.capacity < M.VEHICLES.subwayCar.capacity);
});

t('엔진이 서울 기본값이 아니라 노선의 편성·배차를 쓴다', () => {
  const r1 = routeOf('부산 1호선');
  assert.strictEqual(L.trainsPerHour(8 * 60, r1), 15);      // 부산 1호선 출근 4분
  assert.strictEqual(L.trainsPerHour(8 * 60, null), 20);    // 서울 기본값은 그대로 산다
  assert.strictEqual(L.trainsPerHour(13 * 60, r1), 10);     // 평시 6분
});

// ── ④ 실제 구간 ────────────────────────────────────────────────────────────
t('1호선 노포→서면 평일 08시 — 방향값을 쓰고, 가는 동안 만원이 된다', () => {
  const veh = routeOf('부산 1호선').vehicle;
  const info = segsOf('부산 1호선', '노포', '서면', 8 * 60);
  assert.ok(info && info.segments.length > 5, '구간이 안 나왔다');
  assert.ok(info.direction, '방향을 못 가렸다 — 키 표기가 어긋난 것');
  assert.ok(info.estimated, '부산은 추정이라고 밝혀야 한다');
  assert.match(info.why, /승하차/, '추정 사유가 화면에 나갈 문구여야 한다');
  const seats = M.VEHICLES[veh].seats;
  const peak = Math.max.apply(null, info.segments.map(s => s.load));
  assert.ok(peak > seats, '출근 첨두인데 좌석보다 적게 탔다고 나온다 (재차 ' + peak.toFixed(0) + '명)');
  /* 노포는 시발역이라 **앉는 게 맞다**(D-33: 「앉을 확률」은 탈 때 바로). 시발역에서
     못 앉는다고 나오면 그게 고장이다. 붐빔은 도중에 온다. */
  const r = M.ride({ vehicle: veh, segments: info.segments });
  assert.ok(r.pBoard > 0.8, '시발역 노포에서 앉을 확률이 ' + Math.round(r.pBoard * 100) + '%다');
});

t('1호선 동래→서면 — 시각이 늦을수록 앉기 쉬워진다', () => {
  const veh = routeOf('부산 1호선').vehicle;
  const p = h => {
    const info = segsOf('부산 1호선', '동래', '서면', h * 60);
    assert.ok(info && info.segments.length, h + '시 구간이 없다');
    return M.ride({ vehicle: veh, segments: info.segments, loadSigma: info.loadSigma }).pBoard;
  };
  const peak = p(8), noon = p(13), night = p(21);
  /* 08시·13시 모두 이미 좌석이 다 찬 열차다(재차 70·65명 > 좌석 44석). 그러니 **탈 때**
     앉을 확률이 둘 다 낮은 것이 맞다 — 여기서 큰 차이를 기대하면 그게 잘못된 기대다.
     차이는 밤에 드러난다. 순서만 지켜지면 시간대가 살아 있는 것이다. */
  assert.ok(peak < 0.15, '출근 첨두인데 앉을 확률 ' + Math.round(peak * 100) + '%');
  assert.ok(noon > peak, '한낮이 출근길보다 앉기 어렵게 나온다');
  assert.ok(night > 0.7, '밤 9시인데 앉을 확률이 ' + Math.round(night * 100) + '%뿐이다');
});

t('추정 자료라 확률 곡선이 무디다 (D-104) — 실측 자료는 그대로다', () => {
  const info = segsOf('부산 1호선', '동래', '서면', 13 * 60);
  assert.ok(info.loadSigma > 5, '추정 오차 폭이 안 실렸다 (' + info.loadSigma + ')');
  const veh = routeOf('부산 1호선').vehicle;
  const soft = M.ride({ vehicle: veh, segments: info.segments, loadSigma: info.loadSigma }).pBoard;
  const hard = M.ride({ vehicle: veh, segments: info.segments }).pBoard;
  assert.ok(soft > hard, '오차를 반영했는데 확률이 더 확신에 차 있다');
  // 서울(실측)에는 σ 가 없으므로 한 자리도 안 바뀐다
  assert.strictEqual(M.kRatioFor(54, 0), M.K_RATIO);
  assert.ok(M.kRatioFor(44, 9.4) > M.K_RATIO * 1.3, '추정일 때 곡선이 충분히 무뎌지지 않는다');
});

t('한산한 시간에는 앉을 수 있다고 말한다 (모든 시각이 만원이면 그것도 고장)', () => {
  const info = segsOf('부산 1호선', '노포', '동래', 11 * 60);
  assert.ok(info && info.segments.length, '낮 시간 구간이 없다');
  const r = M.ride({ vehicle: routeOf('부산 1호선').vehicle, segments: info.segments });
  assert.ok(r.pBoard > 0.5, '평일 11시 외곽 구간인데 앉을 확률 ' + Math.round(r.pBoard * 100) + '%');
});

t('새벽 3시에는 안 다닌다 (D-81 의 심야 문이 부산에도 걸린다)', () => {
  const info = segsOf('부산 1호선', '노포', '서면', 3 * 60);
  assert.ok(info && info.notRunning, '03시 부산 지하철이 살아 있다');
});

t('「좌석 만석」 임계가 차종마다 제 값이다', () => {
  /* 서울 대형차는 정원의 34%에서 좌석이 찬다(사양서 4.1). 부산 중형차는 44/118 = 37%,
     경전철은 21/53 = 40%다. 이 셋이 같아졌다면 어딘가에서 서울 값을 베낀 것이다. */
  const ratio = v => M.VEHICLES[v].seats / M.VEHICLES[v].capacity;
  assert.ok(Math.abs(ratio('subwayCar') - 0.34) < 0.01, '서울 34%');
  assert.ok(Math.abs(ratio('subwayBusan') - 0.373) < 0.01, '부산 중형 37%');
  assert.ok(Math.abs(ratio('subwayBusanLight') - 0.396) < 0.01, '부산 경전철 40%');
  // 같은 「정원 대비 %」면 좌석 비율이 높은 쪽이 앉기 낫다 — 계산이 차종을 실제로 읽는다는 뜻
  const at = (v, pct) => M.ride({ vehicle: v,
    segments: [{ load: pct / 100 * M.VEHICLES[v].capacity, minutes: 3, alightAtEnd: 0, boardAtEnd: 0 }] });
  assert.ok(at('subwayBusanLight', 60).pBoard > at('subwayCar', 60).pBoard,
    '차종을 안 읽고 한 가지 값으로 계산하고 있다');
});

// ── ⑤ 자료 자체 ────────────────────────────────────────────────────────────
t('공휴일을 자료에서 가려냈다 (설 연휴가 평일 평균에 섞이면 안 된다)', () => {
  assert.ok(Array.isArray(BUSAN.holidays) && BUSAN.holidays.length >= 5,
    '공휴일을 하나도 못 가려냈다');
  assert.ok(BUSAN.holidays.indexOf('2026-01-01') >= 0, '신정이 빠졌다');
  assert.ok(BUSAN.dayCount.weekday > 100, '평일 표본이 너무 적다');
});

t('첨두가 낮보다 붐빈다 · 주말이 평일보다 한산하다', () => {
  const g = BUSAN.congestion.grid;
  const at = (k, min) => {
    const a = g[k];
    return a ? a[Math.round((min - BUSAN.congestion.startMinutes) / BUSAN.congestion.slotMinutes)] : null;
  };
  const k = '부산 1호선|서면|weekday|상선';
  const peak = at(k, 8 * 60), noon = at(k, 13 * 60);
  assert.ok(peak !== null && noon !== null, '서면 자료가 없다');
  assert.ok(peak > noon * 1.3, '출근 첨두(' + peak + ')가 낮(' + noon + ')보다 안 붐빈다');
  const sun = at('부산 1호선|서면|sunday|상선', 8 * 60);
  assert.ok(sun < peak * 0.8, '일요일 08시(' + sun + ')가 평일(' + peak + ')만큼 붐빈다');
});

t('혼잡도가 물리적으로 있을 수 없는 값이 아니다', () => {
  for (const k in BUSAN.congestion.grid)
    for (const v of BUSAN.congestion.grid[k]) {
      assert.ok(v >= 0, k + ' 에 음수가 있다');
      assert.ok(v < 250, k + ' 에 정원 2.5배가 넘는 값(' + v + ')이 있다');
    }
});
