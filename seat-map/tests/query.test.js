/* 필터 시험 — 역별·노선별·정류장별·요일별·10분단위가 **각각 따로** 걸러지는지.
   2026-09-04 사용자 요구를 그대로 시험으로 옮긴 것이다.

   실데이터(data/…)가 없으면 통째로 건너뛴다. 있으면 실측으로 검사한다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Q = require('../engine/query.js');
const I = require('../engine/interp.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

const CONG = load(path.join(D, 'subway', 'congestion.json'));
const RIDE = load(path.join(D, 'subway', 'ride.json'));
const FACETS = load(path.join(D, 'facets.json'));
const BUSIDX = load(path.join(D, 'bus', 'index.json'));
const HAVE = !!(CONG && RIDE && FACETS && BUSIDX);
const docs = { congestion: CONG, ride: RIDE };

if (!HAVE) {
  console.log('\n  [건너뜀] 실데이터가 없다. `python pipeline/fetch_open_files.py` → `build_congestion.py` → `build_datasets.py`\n');
} else {
  console.log(`\n  [필터 시험] 지하철 키 ${Object.keys(CONG.grid).length}개 · 버스 노선 ${BUSIDX.routes.length}개 · 정류장 ${BUSIDX.stops.length}개\n`);
}
const t = (name, fn) => test(name, { skip: !HAVE && '실데이터 없음' }, fn);

// ── 축 ① 노선별 ───────────────────────────────────────────────────────────
t('노선별 — 호선을 바꾸면 값이 달라진다', () => {
  const a = Q.subway(docs, { line: '5', dayType: 'weekday', stepMinutes: 10 });
  const b = Q.subway(docs, { line: '6', dayType: 'weekday', stepMinutes: 10 });
  assert.ok(a.found && b.found, '호선 키를 못 찾았다');
  const pa = Q.summarize(a).peak.value, pb = Q.summarize(b).peak.value;
  console.log(`    5호선 피크 ${pa.toFixed(1)}% · 6호선 피크 ${pb.toFixed(1)}%`);
  assert.ok(Math.abs(pa - pb) > 1, '호선을 바꿨는데 값이 같다 — 노선 축이 안 살아 있다');
});

// ── 축 ② 역별 ─────────────────────────────────────────────────────────────
t('역별 — 같은 호선 안에서 역을 바꾸면 값이 달라진다', () => {
  const line = FACETS.subway.lines.find(l => l.line === '6');
  assert.ok(line && line.stations.length > 5, '6호선 역 목록이 없다');
  const [s1, s2] = ['월곡', '동묘앞'].filter(s => line.stations.includes(s)).length === 2
    ? ['월곡', '동묘앞'] : [line.stations[0], line.stations[line.stations.length - 1]];
  const a = Q.subway(docs, { line: '6', station: s1, dayType: 'weekday', stepMinutes: 10 });
  const b = Q.subway(docs, { line: '6', station: s2, dayType: 'weekday', stepMinutes: 10 });
  assert.ok(a.found && b.found, `${s1}/${s2} 키를 못 찾았다`);
  console.log(`    ${s1} 피크 ${Q.summarize(a).peak.value.toFixed(1)}% · ${s2} 피크 ${Q.summarize(b).peak.value.toFixed(1)}%`);
  assert.notStrictEqual(Q.summarize(a).peak.value, Q.summarize(b).peak.value);
});

// ── 축 ③ 방향별 ───────────────────────────────────────────────────────────
t('방향별 — 상선과 하선이 따로 나온다', () => {
  const up = Q.subway(docs, { line: '6', station: '월곡', direction: '상선', dayType: 'weekday', stepMinutes: 10 });
  const dn = Q.subway(docs, { line: '6', station: '월곡', direction: '하선', dayType: 'weekday', stepMinutes: 10 });
  assert.ok(up.found && dn.found, '방향별 키가 없다');
  const a = Q.summarize(up).peak, b = Q.summarize(dn).peak;
  console.log(`    상선 피크 ${a.value.toFixed(1)}% (${a.at}) · 하선 피크 ${b.value.toFixed(1)}% (${b.at})`);
  assert.ok(Math.abs(a.value - b.value) > 1, '방향을 바꿨는데 값이 같다');
});

t('없는 방향을 고르면 더 붐비는 쪽으로 물러나고 그 사실을 알린다', () => {
  const r = Q.subway(docs, { line: '6', station: '월곡', direction: '내선', dayType: 'weekday', stepMinutes: 10 });
  assert.ok(r.found, '물러나기가 동작하지 않았다');
  assert.ok(r.fellBack, '조용히 다른 값을 보여주면 안 된다 — 알려야 한다');
});

// ── 축 ④ 요일별 ───────────────────────────────────────────────────────────
t('평일/토/일이 각각 다르고, 주말이 평일보다 한산하다', () => {
  const got = {};
  for (const d of Q.DAY_TYPES) {
    const s = Q.subway(docs, { line: '6', station: '월곡', dayType: d, stepMinutes: 10 });
    assert.ok(s.found, `${d} 키가 없다`);
    got[d] = Q.summarize(s).peak.value;
  }
  console.log(`    평일 ${got.weekday.toFixed(1)}% · 토 ${got.saturday.toFixed(1)}% · 일 ${got.sunday.toFixed(1)}%`);
  assert.ok(got.saturday < got.weekday && got.sunday < got.weekday, '주말이 평일보다 붐비게 나왔다');
  assert.notStrictEqual(got.saturday, got.sunday, '토요일과 일요일이 같은 값이다');
});

// ── 축 ⑤ 시간 단위 (10분) ─────────────────────────────────────────────────
t('10분 단위로 뽑으면 30분 단위보다 점이 3배 나온다', () => {
  const a = Q.subway(docs, { line: '6', station: '월곡', dayType: 'weekday', stepMinutes: 30 });
  const b = Q.subway(docs, { line: '6', station: '월곡', dayType: 'weekday', stepMinutes: 10 });
  console.log(`    30분 ${a.points.length}점 · 10분 ${b.points.length}점 (${a.points[0] && I.hhmm(a.points[0].minutes)}~)`);
  assert.ok(b.points.length > a.points.length * 2.5);
  assert.strictEqual(b.stepMinutes, 10);
});

t('10분 값은 원천 30분 값 사이를 벗어나지 않고, 격자점에서는 원천 그대로다', () => {
  const key = Q.congestionKey({ line: '6', station: '월곡', dayType: 'weekday' });
  const raw = CONG.grid[key];
  const s = Q.subway(docs, { line: '6', station: '월곡', dayType: 'weekday', stepMinutes: 10 });
  for (const p of s.points) {
    const x = (p.minutes - CONG.startMinutes) / CONG.slotMinutes;
    const i = Math.min(raw.length - 2, Math.floor(x));
    const lo = Math.min(raw[i], raw[i + 1]), hi = Math.max(raw[i], raw[i + 1]);
    assert.ok(p.value >= lo - 1e-9 && p.value <= hi + 1e-9,
      `${I.hhmm(p.minutes)} 에서 ${p.value} — 원천에 없는 값을 만들어냈다`);
  }
  const at0 = s.points.find(p => p.minutes === CONG.startMinutes);
  assert.ok(Math.abs(at0.value - raw[0]) < 1e-9, '격자점에서 원천값이 바뀌었다');
});

t('보간값에는 출처 문구가 붙는다', () => {
  const s = Q.subway(docs, { line: '6', station: '월곡', dayType: 'weekday', stepMinutes: 10 });
  assert.ok(s.note && s.note.includes('예상값'), '10분 값이 예상값이라는 표시가 없다');
  console.log(`    "${s.note}"`);
});

// ── 축 ⑥ 승·하차 ──────────────────────────────────────────────────────────
t('지하철 승차와 하차가 따로 나온다', () => {
  const on = Q.subway(docs, { measure: 'ride', line: '6', station: '월곡', dayType: 'weekday', kind: '승차', stepMinutes: 10 });
  const off = Q.subway(docs, { measure: 'ride', line: '6', station: '월곡', dayType: 'weekday', kind: '하차', stepMinutes: 10 });
  assert.ok(on.found && off.found, '승하차 키가 없다');
  const a = Q.summarize(on), b = Q.summarize(off);
  console.log(`    월곡 승차 피크 ${a.peak.value.toFixed(0)}명/시 (${a.peak.at}) · 하차 피크 ${b.peak.value.toFixed(0)}명/시 (${b.peak.at})`);
  assert.notStrictEqual(a.peak.value, b.peak.value);
  // 아침 출근 시간에는 주거지 역에서 승차가 하차보다 많다.
  assert.ok(a.peak.minutes < 12 * 60, `승차 피크가 ${a.peak.at} — 월곡은 주거지라 아침이어야 한다`);
});

t('승하차는 합계량이라 10분 눈금에서 perStep 이 value 보다 작다', () => {
  const s = Q.subway(docs, { measure: 'ride', line: '6', station: '월곡', dayType: 'weekday', kind: '승차', stepMinutes: 10 });
  const p = s.points.find(x => x.value > 0);
  assert.ok(p, '값이 전부 0이다');
  assert.ok(Math.abs(p.perStep - p.value * 10 / 60) < 1e-9,
    '시간당 인원을 10분 눈금에 그대로 쓰면 6배로 부풀어 보인다');
});

// ── 축 ⑦ 버스 노선별 · 정류장별 ───────────────────────────────────────────
t('버스 — 노선 하나를 골라 정류장별로 따로 볼 수 있다', () => {
  const r0 = BUSIDX.routes.find(r => r.stops >= 20) || BUSIDX.routes[0];
  const file = path.join(D, 'bus', 'routes', r0.route.replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
  assert.ok(fs.existsSync(file), `노선 파일이 없다: ${file}`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(doc.stops.length >= 2);

  const whole = Q.bus(doc, { kind: '승차', stepMinutes: 10 });
  const one = Q.bus(doc, { stopId: doc.stops[0].stopId, kind: '승차', stepMinutes: 10 });
  const two = Q.bus(doc, { stopId: doc.stops[Math.floor(doc.stops.length / 2)].stopId, kind: '승차', stepMinutes: 10 });
  console.log(`    ${r0.route}번(정류장 ${doc.stops.length}개) 전체 피크 ${Q.summarize(whole).peak.value.toFixed(0)}명/시`
    + ` · ${one.station} ${Q.summarize(one).peak.value.toFixed(0)} · ${two.station} ${Q.summarize(two).peak.value.toFixed(0)}`);
  assert.ok(Q.summarize(whole).peak.value >= Q.summarize(one).peak.value, '노선 전체가 정류장 하나보다 적다');
  assert.notStrictEqual(Q.summarize(one).peak.value, Q.summarize(two).peak.value, '정류장을 바꿨는데 값이 같다');
});

t('버스에는 요일 축이 없다는 사실을 반드시 함께 알린다', () => {
  const r0 = BUSIDX.routes[0];
  const doc = JSON.parse(fs.readFileSync(
    path.join(D, 'bus', 'routes', r0.route.replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json'), 'utf8'));
  const s = Q.bus(doc, { kind: '승차', stepMinutes: 10 });
  assert.ok(s.noDayType && s.noDayType.includes('월 집계'),
    '요일을 골라도 같은 값이 나오는데 그 사실을 안 알리면 사용자가 속는다');
});

// ── 검색 (정류장 12,500개는 목록으로 못 고른다) ───────────────────────────
t('정류장을 이름과 번호로 찾을 수 있다', () => {
  const byName = Q.findStops(BUSIDX, '종로');
  assert.ok(byName.length > 0, '이름 검색이 안 된다');
  const ars = byName[0].ars;
  const byArs = Q.findStops(BUSIDX, ars);
  assert.ok(byArs.some(s => s.ars === ars), 'ARS 번호 검색이 안 된다');
  console.log(`    "종로" → ${byName.length}개 (예: ${byName[0].name} ${byName[0].ars})`);
});

t('버스 노선을 번호로 찾을 때 번호가 앞에서 맞는 것이 먼저 나온다', () => {
  const got = Q.findRoutes(BUSIDX, '6');
  assert.ok(got.length > 0, '노선 번호 검색이 안 된다');
  assert.ok(got[0].route.startsWith('6'),
    `첫 결과가 ${got[0].route} — 「6」을 쳤으면 6으로 시작하는 노선이 먼저여야 한다`);
  const exact = Q.findRoutes(BUSIDX, '600');
  assert.ok(exact.length === 0 || exact[0].route === '600' || exact[0].route.startsWith('600'));
  console.log(`    "6" → ${got.length}개 (첫 ${got[0].route}) · "600" → ${exact.length}개`);
});

t('정류장 대부분에 좌표가 붙어 있다 (환승 노드 클러스터링의 전제)', () => {
  const withXY = BUSIDX.stops.filter(s => s.lat !== null).length;
  const rate = withXY / BUSIDX.stops.length;
  console.log(`    좌표 있는 정류장 ${withXY}/${BUSIDX.stops.length} (${(rate * 100).toFixed(0)}%)`);
  assert.ok(rate > 0.8, `${(rate * 100).toFixed(0)}% — 좌표 매칭이 너무 낮다`);
});

// ── 드롭다운 ─────────────────────────────────────────────────────────────
t('호선을 고르면 그 호선의 역만 선택지에 남는다', () => {
  const all = Q.optionsFor(FACETS, {});
  const six = Q.optionsFor(FACETS, { line: '6' });
  assert.ok(all.lines.length >= 8, '호선 목록이 비었다');
  assert.strictEqual(all.stations.length, 0, '호선을 안 골랐는데 역이 나온다');
  assert.ok(six.stations.length > 20 && six.stations.includes('월곡'));
  assert.ok(six.steps.some(s => s.minutes === 10), '10분 단위가 선택지에 없다');
  console.log(`    호선 ${all.lines.length}개 · 6호선 역 ${six.stations.length}개 · 단위 ${six.steps.map(s => s.name).join('/')}`);
});
