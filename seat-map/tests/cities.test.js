/* 서울 밖 도시철도 시험 (D-103·D-104·D-105) — 부산·대구·대전·광주·인천.

   ★ 이 시험이 지키는 것 ★
   이 자료는 서울과 **다른 파일·다른 원천·다른 차량·다른 배차**다. 어긋날 수 있는 자리가
   여럿인데 전부 「조용히」 망가진다 — 값이 안 나오는 게 아니라 서울 기본값(정원 160·
   8칸·시간당 20대)으로 물러나 그럴듯한 숫자를 내놓는다. 그래서 눈으로는 못 잡는다.
     ① 격자 모양이 어긋나면 합쳐지지 않는다
     ② 방향 이름이 어긋나면 방향값을 못 찾고 「역 최대」로 물러난다
     ③ 편성·정원·배차가 안 실리면 서울 대형차·서울 배차로 계산한다
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
const CITY = load(path.join(D, 'subway', 'cities.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const HAVE = !!(CITY && CONG && ROUTES);

if (!HAVE) console.log('\n  [건너뜀] `python pipeline/build_city_congestion.py`\n');
const t = (name, fn) => test(name, { skip: !HAVE && '도시 자료 없음' }, fn);

function routeOf(line) {
  return (ROUTES.routes || []).filter(r => r.line === line)[0];
}
/* 앱이 하는 합치기를 그대로 재현한다 — 시험이 앱과 다른 길을 걸으면 거짓말을 한다. */
function merged() {
  const c = JSON.parse(JSON.stringify(CONG));
  const r = JSON.parse(JSON.stringify(RIDE));
  for (const k in CITY.congestion.grid) if (!(k in c.grid)) c.grid[k] = CITY.congestion.grid[k];
  for (const k in CITY.ride.grid) if (!(k in r.grid)) r.grid[k] = CITY.ride.grid[k];
  c.estimatedLines = (c.estimatedLines || []).concat(CITY.estimatedLines || []);
  c.modelErrorPct = CITY.modelErrorPct;
  return { congestion: c, ride: r };
}
function segsOf(line, from, to, minutes, dayType) {
  const route = routeOf(line);
  const names = route.stops[0];
  let dirIdx = 0, a = names.indexOf(from), b = names.indexOf(to);
  assert.ok(a >= 0 && b >= 0, '역을 못 찾음: ' + from + '/' + to);
  if (a > b) { dirIdx = 1; const rev = route.stops[1]; a = rev.indexOf(from); b = rev.indexOf(to); }
  const ctx = Object.assign({ minutes, dayType: dayType || 'weekday' }, merged());
  return L.subwaySegments(ctx, { dirIdx, fromPos: a, toPos: b, offsetMinutes: 0 }, route);
}
const slotAt = (arr, min) =>
  arr[Math.max(0, Math.min(arr.length - 1,
    Math.round((min - CITY.congestion.startMinutes) / CITY.congestion.slotMinutes)))];

// ── ① 격자 모양 ────────────────────────────────────────────────────────────
t('도시 격자가 서울 격자와 같은 모양이라 합칠 수 있다', () => {
  assert.strictEqual(CITY.congestion.slotMinutes, CONG.slotMinutes);
  assert.strictEqual(CITY.congestion.startMinutes, CONG.startMinutes);
  assert.strictEqual(CITY.congestion.slots, CONG.slots);
  assert.strictEqual(CITY.ride.slotMinutes, RIDE.slotMinutes);
  assert.strictEqual(CITY.ride.startMinutes, RIDE.startMinutes);
  for (const k in CITY.congestion.grid) {
    assert.strictEqual(CITY.congestion.grid[k].length, CONG.slots, k + ' 칸 수가 다르다');
    assert.ok(!(k in CONG.grid), '서울 자료와 키가 겹친다: ' + k);
  }
});

t('다섯 도시가 다 들어 있다', () => {
  for (const city of ['부산', '대구', '대전', '광주', '인천'])
    assert.ok(CITY.cities[city], city + ' 자료가 없다');
  assert.ok(CITY.estimatedLines.length >= 11,
    '노선이 ' + CITY.estimatedLines.length + '개뿐이다');
});

// ── ② 방향 이름 ────────────────────────────────────────────────────────────
t('방향 키가 엔진이 만드는 이름과 같다 (어긋나면 방향값을 통째로 놓친다)', () => {
  for (const line of CITY.estimatedLines) {
    const route = routeOf(line);
    assert.ok(route, line + ' 이 그래프에 없다');
    for (const dirIdx of [0, 1]) {
      const key = line + '|' + route.stops[dirIdx][0] + '|weekday|' + L.dirName(route, dirIdx);
      assert.ok(key in CITY.congestion.grid, '없는 키: ' + key);
    }
  }
});

// ── ③ 차량 제원 ────────────────────────────────────────────────────────────
t('노선마다 제 편성·정원·배차가 실려 있다 (서울 값이면 안 된다)', () => {
  const cars = { '부산 1호선': 8, '부산 2호선': 6, '부산 3호선': 4, '부산 4호선': 6,
                 '대구 1호선': 6, '대구 2호선': 6, '대구 3호선': 3, '대전 1호선': 4,
                 '광주 1호선': 4, '인천지하철 1호선': 8, '인천지하철 2호선': 2 };
  for (const line in cars) {
    const r = routeOf(line);
    assert.ok(r, line + ' 이 그래프에 없다');
    assert.strictEqual(r.cars, cars[line], line + ' 편성 량수');
    assert.ok(r.capacity > 0 && r.capacity < 160, line + ' 정원이 서울 대형차 값이면 안 된다');
    assert.strictEqual(r.tph.length, 24, line + ' 배차표');
    assert.ok(M.VEHICLES[r.vehicle], '모르는 차종: ' + r.vehicle);
    assert.strictEqual(M.VEHICLES[r.vehicle].capacity, r.capacity,
      line + ' — 그래프의 정원과 차종표가 어긋난다');
  }
  // 작은 차가 큰 차보다 크면 어딘가에서 값을 베낀 것이다
  assert.ok(M.VEHICLES.subwayBusanLight.capacity < M.VEHICLES.subwayMid.capacity / 2);
  assert.ok(M.VEHICLES.subwayMonorail.capacity < M.VEHICLES.subwayMid.capacity);
  assert.ok(M.VEHICLES.subwayMid.capacity < M.VEHICLES.subwayCar.capacity);
});

t('엔진이 서울 기본값이 아니라 노선의 배차를 쓴다', () => {
  const r = routeOf('대구 1호선');
  assert.strictEqual(L.trainsPerHour(8 * 60, r), r.tph[8]);
  assert.strictEqual(L.trainsPerHour(13 * 60, r), r.tph[13]);
  assert.strictEqual(L.trainsPerHour(8 * 60, null), 20);    // 서울 기본값은 그대로 산다
  assert.ok(r.tph[8] < 20, '대구가 서울만큼 자주 다닌다고 나온다');
});

t('「좌석 만석」 임계가 차종마다 제 값이다', () => {
  /* 서울 대형차는 정원의 34%에서 좌석이 찬다(사양서 4.1). 중형은 46/120 = 38%,
     모노레일 30/88 = 34%, 인천 2호선 경전철 29/103 = 28%다. 이 값들이 같아졌다면
     어딘가에서 서울 값을 베낀 것이다. */
  const ratio = v => M.VEHICLES[v].seats / M.VEHICLES[v].capacity;
  assert.ok(Math.abs(ratio('subwayCar') - 0.34) < 0.01, '서울 34%');
  assert.ok(Math.abs(ratio('subwayBusan') - 0.373) < 0.01, '부산 중형 37%');
  assert.ok(Math.abs(ratio('subwayMid') - 0.383) < 0.01, '지방 중형 38%');
  assert.ok(Math.abs(ratio('subwayLightAGT') - 0.282) < 0.01, '인천 2호선 28%');
  const at = (v, pct) => M.ride({ vehicle: v,
    segments: [{ load: pct / 100 * M.VEHICLES[v].capacity, minutes: 3, alightAtEnd: 0, boardAtEnd: 0 }] });
  assert.ok(at('subwayMid', 60).pBoard > at('subwayLightAGT', 60).pBoard,
    '차종을 안 읽고 한 가지 값으로 계산하고 있다');
});

// ── ④ 실제 구간 ────────────────────────────────────────────────────────────
t('부산 1호선 노포→서면 08시 — 방향값을 쓰고, 가는 동안 만원이 된다', () => {
  const veh = routeOf('부산 1호선').vehicle;
  const info = segsOf('부산 1호선', '노포', '서면', 8 * 60);
  assert.ok(info && info.segments.length > 5, '구간이 안 나왔다');
  assert.ok(info.direction, '방향을 못 가렸다 — 키 표기가 어긋난 것');
  assert.ok(info.estimated, '추정이라고 밝혀야 한다');
  assert.match(info.why, /승하차/, '추정 사유가 화면에 나갈 문구여야 한다');
  const peak = Math.max.apply(null, info.segments.map(s => s.load));
  assert.ok(peak > M.VEHICLES[veh].seats,
    '출근 첨두인데 좌석보다 적게 탔다고 나온다 (재차 ' + peak.toFixed(0) + '명)');
  /* 노포는 시발역이라 **앉는 게 맞다**(D-33: 「앉을 확률」은 탈 때 바로). */
  const r = M.ride({ vehicle: veh, segments: info.segments, loadSigma: info.loadSigma });
  assert.ok(r.pBoard > 0.8, '시발역 노포에서 앉을 확률이 ' + Math.round(r.pBoard * 100) + '%다');
});

t('도시마다 실제 구간이 계산된다 (한 도시라도 죽으면 잡는다)', () => {
  const cases = [
    ['부산 2호선', '해운대', '서면'], ['대구 1호선', '반월당', '동대구'],
    ['대구 3호선', '수성시장', '서문시장'], ['대전 1호선', '대전', '정부청사'],
    ['광주 1호선', '금남로4가', '상무'], ['인천지하철 1호선', '부평', '인천시청'],
    ['인천지하철 2호선', '주안', '인천시청'],
  ];
  for (const [line, a, b] of cases) {
    const info = segsOf(line, a, b, 8 * 60);
    assert.ok(info && info.segments && info.segments.length,
      line + ' ' + a + '→' + b + ' 구간이 안 나왔다');
    assert.ok(info.direction, line + ' — 방향을 못 가렸다');
    assert.ok(info.estimated, line + ' — 추정 표시가 없다');
    const r = M.ride({ vehicle: routeOf(line).vehicle, segments: info.segments,
                       loadSigma: info.loadSigma });
    assert.ok(r.pBoard >= 0 && r.pBoard <= 1, line + ' — 확률이 범위 밖');
  }
});

t('밤 늦은 시각이 출근 첨두보다 한산하다 (모든 노선)', () => {
  for (const line of CITY.estimatedLines) {
    const a = slotAt(CITY.congestion.grid[line + '|전체|weekday'], 8 * 60);
    const b = slotAt(CITY.congestion.grid[line + '|전체|weekday'], 22 * 60);
    assert.ok(b < a, line + ' — 22시(' + b + ')가 08시(' + a + ')보다 붐빈다');
  }
});

t('일요일이 평일보다 한산하다 (모든 노선)', () => {
  for (const line of CITY.estimatedLines) {
    const wd = slotAt(CITY.congestion.grid[line + '|전체|weekday'], 8 * 60);
    const su = slotAt(CITY.congestion.grid[line + '|전체|sunday'], 8 * 60);
    assert.ok(su < wd * 0.9, line + ' — 일요일 08시(' + su + ')가 평일(' + wd + ')만 하다');
  }
});

t('새벽 3시에는 안 다닌다 (D-81 의 심야 문이 지방에도 걸린다)', () => {
  const info = segsOf('대구 1호선', '반월당', '동대구', 3 * 60);
  assert.ok(info && info.notRunning, '03시 대구 지하철이 살아 있다');
});

// ── ⑤ 자료 자체 ────────────────────────────────────────────────────────────
t('공휴일을 자료에서 가려냈다 (설 연휴가 평일 평균에 섞이면 안 된다)', () => {
  for (const city in CITY.cities) {
    const h = CITY.cities[city].holidays;
    assert.ok(Array.isArray(h) && h.length >= 5, city + ' — 공휴일을 못 가려냈다');
    assert.ok(CITY.cities[city].dayCount.weekday > 100, city + ' — 평일 표본이 적다');
  }
  assert.ok(CITY.cities['부산'].holidays.indexOf('2026-01-01') >= 0, '신정이 빠졌다');
});

t('혼잡도가 물리적으로 있을 수 없는 값이 아니다', () => {
  for (const k in CITY.congestion.grid)
    for (const v of CITY.congestion.grid[k]) {
      assert.ok(v >= 0, k + ' 에 음수가 있다');
      assert.ok(v < 250, k + ' 에 정원 2.5배가 넘는 값(' + v + ')이 있다');
    }
});

t('추정 자료라 확률 곡선이 무디다 (D-104) — 실측 자료는 그대로다', () => {
  const info = segsOf('대구 1호선', '반월당', '동대구', 13 * 60);
  assert.ok(info.loadSigma > 5, '추정 오차 폭이 안 실렸다 (' + info.loadSigma + ')');
  const veh = routeOf('대구 1호선').vehicle;
  const soft = M.ride({ vehicle: veh, segments: info.segments, loadSigma: info.loadSigma }).pBoard;
  const hard = M.ride({ vehicle: veh, segments: info.segments }).pBoard;
  assert.ok(soft >= hard, '오차를 반영했는데 확률이 더 확신에 차 있다');
  assert.strictEqual(M.kRatioFor(54, 0), M.K_RATIO);
  assert.ok(M.kRatioFor(44, 9.4) > M.K_RATIO * 1.3, '추정일 때 곡선이 충분히 무뎌지지 않는다');
});
