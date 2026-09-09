/* 수도권 광역전철 시험 (D-108) — 경의중앙·수인분당·9호선 등 18개 노선 + 1·3·4호선 직결 구간.

   ★ 이 시험이 지키는 것 ★
   ① 격자 모양·방향 키가 엔진과 어긋나면 「조용히」 서울 기본값으로 물러난다 — cities 와 같다.
   ② 1·3·4호선은 한 노선 안에 실측(서울 구간)과 추정(코레일 구간)이 **섞여 있다**.
      추정 구간을 지나는 leg 만 추정으로 표시돼야 하고(estimatedStations),
      실측 구간만 지나는 leg 에 추정 오차 폭이 붙으면 실측을 흐리는 것이다.
   ③ 승하차 원천이 없는 노선(김포골드라인 등)은 혼잡도가 **없어야 한다** —
      동명 환승역 값만 걸려 0%대로 나오면 첨두 만원 노선이 「빈 차」로 보인다.
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
const RAIL = load(path.join(D, 'subway', 'rail.json'));
const CITY = load(path.join(D, 'subway', 'cities.json'));
const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const HAVE = !!(RAIL && CONG && ROUTES);

if (!HAVE) console.log('\n  [건너뜀] `python pipeline/build_rail_congestion.py`\n');
const t = (name, fn) => test(name, { skip: !HAVE && '광역전철 자료 없음' }, fn);

function routeOf(line) {
  return (ROUTES.routes || []).filter(r => r.line === line)[0];
}
/* 앱(index.html)이 하는 합치기를 그대로 재현한다 — cities 다음 rail 순서다. */
function merged() {
  const c = JSON.parse(JSON.stringify(CONG));
  const r = JSON.parse(JSON.stringify(RIDE));
  for (const ext of [CITY, RAIL]) {
    if (!ext) continue;
    for (const k in ext.congestion.grid) if (!(k in c.grid)) c.grid[k] = ext.congestion.grid[k];
    for (const k in ext.ride.grid) if (!(k in r.grid)) r.grid[k] = ext.ride.grid[k];
    c.estimatedLines = (c.estimatedLines || []).concat(ext.estimatedLines || []);
    if (ext.estimatedStations) {
      c.estimatedStations = c.estimatedStations || {};
      for (const k in ext.estimatedStations) c.estimatedStations[k] = ext.estimatedStations[k];
    }
    if (ext.modelErrorPct) c.modelErrorPct = Math.max(c.modelErrorPct || 0, ext.modelErrorPct);
  }
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
    Math.round((min - RAIL.congestion.startMinutes) / RAIL.congestion.slotMinutes)))];

// ── ① 격자 모양·키 ─────────────────────────────────────────────────────────
t('광역전철 격자가 서울 격자와 같은 모양이라 합칠 수 있다', () => {
  assert.strictEqual(RAIL.congestion.slotMinutes, CONG.slotMinutes);
  assert.strictEqual(RAIL.congestion.startMinutes, CONG.startMinutes);
  assert.strictEqual(RAIL.congestion.slots, CONG.slots);
  assert.strictEqual(RAIL.ride.slotMinutes, RIDE.slotMinutes);
  for (const k in RAIL.congestion.grid) {
    assert.strictEqual(RAIL.congestion.grid[k].length, CONG.slots, k + ' 칸 수가 다르다');
    assert.ok(!(k in CONG.grid), '서울 실측과 키가 겹친다(실측을 덮는다): ' + k);
    if (CITY) assert.ok(!(k in CITY.congestion.grid), '지방 도시와 키가 겹친다: ' + k);
  }
});

t('큰 노선들이 다 들어 있다', () => {
  for (const ln of ['9호선', '경의중앙선', '수인분당선', '경춘선', '경강선',
                    '경원선', '우이신설선', '신림선', '인천국제공항선', '1호선(인천 방면)'])
    assert.ok(RAIL.estimatedLines.indexOf(ln) >= 0, ln + ' 이 빠졌다');
  for (const ln of ['1', '3', '4'])
    assert.ok(RAIL.estimatedLines.indexOf(ln) < 0,
      ln + '호선은 노선 전체가 추정이 아니다 — estimatedStations 로 가야 한다');
  assert.ok(RAIL.estimatedStations['1'].length >= 40, '1호선 코레일 구간이 덜 채워졌다');
  assert.ok(RAIL.estimatedStations['4'].length >= 20, '4호선 과천·안산선이 덜 채워졌다');
});

// ── ② 방향 키 ─────────────────────────────────────────────────────────────
t('방향 키가 엔진이 만드는 이름과 같다 (1호선은 색인 증가가 「상선」이다)', () => {
  const keys = Object.keys(RAIL.congestion.grid);
  const lines = RAIL.estimatedLines.concat(Object.keys(RAIL.estimatedStations));
  for (const line of lines) {
    const route = routeOf(line);
    assert.ok(route, line + ' 이 그래프에 없다');
    for (const dirIdx of [0, 1]) {
      const side = L.dirName(route, dirIdx);
      assert.ok(keys.some(k => k.indexOf(line + '|') === 0 && k.indexOf('|weekday|' + side) > 0),
        line + ' — ' + side + ' 방향 키가 하나도 없다(라벨이 어긋난 것)');
    }
  }
  // 1호선 실측이 쓰는 라벨 그대로인지 — 서울역은 실측, 수원은 추정. 같은 축이다.
  assert.ok('1|수원|weekday|상선' in RAIL.congestion.grid, '1호선 추정 키가 실측 라벨과 다르다');
});

// ── ③ 실측과 추정이 한 노선에 섞일 때 ─────────────────────────────────────
t('1호선: 실측 역은 덮지 않았고, noCong 은 그래프에 그대로 남아 있다', () => {
  const measured = new Set();
  for (const k in CONG.grid) { const p = k.split('|'); if (p[0] === '1') measured.add(p[1]); }
  assert.ok(measured.size >= 5, '서울 1호선 실측이 없다?');
  for (const st of RAIL.estimatedStations['1'])
    assert.ok(!measured.has(st), st + ' — 실측이 있는 역을 추정으로 덮었다');
  /* noCong 은 걷어내지 않는다 — rail.json 을 못 읽은 구성에서 호선피크 폴백이
     되살아나는 것(D-87 의 사고)을 막는 마지막 안전판이다. 엔진이 방향값 있는 역만 쓴다. */
  assert.ok((routeOf('1').noCong || []).length >= 40, '1호선 noCong 안전판이 사라졌다');
  assert.ok((routeOf('수인분당선').noCong || []).length >= 50, '수인분당선 noCong 안전판이 사라졌다');
});

t('D-87 구간: rail.json 이 있으면 방향값을 쓰고, 없으면 옛날처럼 통째로 모름이다', () => {
  const route = routeOf('4');
  const names = route.stops[0];
  const a = names.indexOf('산본'), b = names.indexOf('금정');
  assert.ok(a >= 0 && b >= 0, '산본·금정을 못 찾았다');
  const leg = a < b ? { dirIdx: 0, fromPos: a, toPos: b, offsetMinutes: 0 }
                    : { dirIdx: 0, fromPos: b, toPos: a, offsetMinutes: 0 };
  const withRail = L.subwaySegments(
    Object.assign({ minutes: 8 * 60, dayType: 'weekday' }, merged()), leg, route);
  assert.ok(withRail && withRail.segments && withRail.segments.length,
    '채워 넣은 안산선 구간이 아직도 모름이다');
  assert.match(withRail.why, /되짚은 추정/, '안산선 모형값이 추정 표시가 없다');
  const noRail = L.subwaySegments(
    { congestion: CONG, ride: RIDE, minutes: 8 * 60, dayType: 'weekday' }, leg, route);
  assert.strictEqual(noRail, null,
    'rail.json 없이 산본 구간이 값을 낸다 — 호선피크 폴백이 되살아났다(D-87 퇴행)');
});

t('1호선 경부 구간 leg 는 추정 표시·오차 폭, 서울 실측 구간 leg 는 실측 그대로', () => {
  const est = segsOf('1', '수원', '안양', 8 * 60);
  assert.ok(est && est.segments.length, '수원→안양 구간이 안 나왔다');
  assert.ok(est.direction, '방향을 못 가렸다');
  assert.match(est.why, /되짚은 추정/, '코레일 구간인데 추정 사유가 없다');
  assert.ok(est.loadSigma > 10, '추정 오차 폭이 안 실렸다 (' + est.loadSigma + ')');
  const real = segsOf('1', '시청', '종로5가', 8 * 60);
  assert.ok(real && real.segments.length, '시청→종로5가 구간이 안 나왔다');
  assert.strictEqual(real.loadSigma, 0, '실측 구간에 추정 오차 폭이 붙었다');
  assert.doesNotMatch(real.why || '', /되짚은 추정/, '실측 구간을 추정이라 한다');
});

// ── ④ 실제 구간 ────────────────────────────────────────────────────────────
t('노선마다 실제 구간이 계산된다 (한 노선이라도 죽으면 잡는다)', () => {
  const cases = [
    ['9호선', '김포공항', '여의도'], ['경의중앙선(청량리~지평)', '청량리', '덕소'],
    ['수인분당선', '수원', '모란'], ['경춘선', '평내호평', '춘천'],
    ['경원선', '의정부', '광운대'],
    ['인천국제공항선', '검암', '김포공항'], ['우이신설선', '북한산우이', '성신여대입구'],
    ['1호선(인천 방면)', '부천', '구로'],
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

t('수인분당선에 흐름이 실려 있다 (왕복 이어붙임을 정리하기 전엔 전 구간이 1%였다)', () => {
  const morning = slotAt(RAIL.congestion.grid['수인분당선|정자|weekday|' +
    L.dirName(routeOf('수인분당선'), 0)] ||
    RAIL.congestion.grid['수인분당선|정자|weekday|' + L.dirName(routeOf('수인분당선'), 1)], 8 * 60);
  assert.ok(morning > 10, '분당 축 출근 시간이 ' + morning + '% — 흐름이 안 실렸다');
});

// ── ⑤ 승하차 원천이 없는 노선 ─────────────────────────────────────────────
t('원천이 없는 노선은 혼잡도가 없다 — 「빈 차」로 보이는 것이 「모름」보다 나쁘다', () => {
  /* 서해선은 원천이 있지만 뺐다 — 김포공항·부천종합운동장 허브의 타 노선 승하차가 역 이름으로
     합산돼 폭주 OD 가 실렸다(칸 절반이 천장 200%). 소음을 「만원」으로 보여주지 않는다. */
  for (const ln of ['김포도시철도', '신분당선', '에버라인', '의정부', '동해선', '대경선', '서해선']) {
    assert.ok(RAIL.estimatedLines.indexOf(ln) < 0, ln + ' 이 추정 목록에 있다');
    for (const k in RAIL.congestion.grid)
      assert.ok(k.indexOf(ln + '|') !== 0, ln + ' 에 혼잡도가 있다: ' + k);
  }
  const info = segsOf('김포도시철도', '구래', '김포공항', 8 * 60);
  assert.strictEqual(info, null, '김포골드라인이 「모름 = 서서」가 아니다');
});

t('원천이 없어도 배차·편성은 실려 있다 (대기 시간이 좋아진다)', () => {
  const spec = { '김포도시철도': [2, 'subwayLightAGT'], '신분당선': [6, 'subwayCar'],
                 '에버라인': [1, 'subwayLightAGT'], '경의중앙선': [8, 'subwayCar'],
                 '수인분당선': [6, 'subwayCar'], '서해선': [4, 'subwayCar'],
                 '우이신설선': [2, 'subwayLightAGT'] };
  for (const ln in spec) {
    const r = routeOf(ln);
    assert.ok(r, ln + ' 이 그래프에 없다');
    assert.strictEqual(r.cars, spec[ln][0], ln + ' 편성 량수');
    assert.strictEqual(r.vehicle, spec[ln][1], ln + ' 차종');
    assert.strictEqual(r.tph.length, 24, ln + ' 배차표');
    assert.ok(r.tph[8] > 0, ln + ' 출근 시간 배차가 0');
  }
  // 김포골드라인 첨두 3분 = 시간 20대 — 서울 기본값(20)과 같아 보여도 저녁·낮이 다르다
  assert.ok(routeOf('김포도시철도').tph[13] < 15, '김포 낮 배차가 첨두와 같다');
  // 실측 노선(서울 1~8호선)은 손대지 않았다 — 그쪽 계수는 기존 검증에 물려 있다
  assert.ok(!routeOf('1').tph, '1호선(실측)에 tph 를 심었다 — 실측 노선은 그대로 둬야 한다');
});

// ── ⑥ 자료 자체 ────────────────────────────────────────────────────────────
t('혼잡도가 물리적으로 있을 수 없는 값이 아니다', () => {
  for (const k in RAIL.congestion.grid)
    for (const v of RAIL.congestion.grid[k]) {
      assert.ok(v >= 0, k + ' 에 음수가 있다');
      assert.ok(v < 250, k + ' 에 정원 2.5배가 넘는 값(' + v + ')이 있다');
    }
});

t('밤 늦은 시각이 출근 첨두보다 한산하고, 새벽 3시에는 안 다닌다', () => {
  for (const line of RAIL.estimatedLines) {
    const arr = RAIL.congestion.grid[line + '|전체|weekday'];
    if (!arr) continue;
    /* 역 몇 개짜리 짧은 연장 구간(8호선 별내선 등)은 승하차 표본이 적어 저녁 귀가가
       아침을 넘기도 한다 — 상식 검증은 표본이 있는 본선급에만 건다. */
    const n = new Set(Object.keys(RAIL.congestion.grid)
      .filter(k => k.indexOf(line + '|') === 0).map(k => k.split('|')[1])).size;
    if (n < 10) continue;
    assert.ok(slotAt(arr, 22 * 60) < slotAt(arr, 8 * 60), line + ' — 22시가 08시보다 붐빈다');
  }
  const info = segsOf('경의중앙선(청량리~지평)', '청량리', '덕소', 3 * 60);
  assert.ok(info && info.notRunning, '03시 경의중앙선이 살아 있다');
});

t('오차 폭이 검증 실측(12%p)으로 실려 있고, 합치면 큰 쪽이 이긴다', () => {
  assert.ok(RAIL.modelErrorPct >= 10, '오차 폭이 부산 값(8)보다 커야 한다 — 어림이 한 겹 더 끼었다');
  const c = merged().congestion;
  assert.strictEqual(c.modelErrorPct, RAIL.modelErrorPct, '합칠 때 작은 오차 폭이 이겼다');
});
