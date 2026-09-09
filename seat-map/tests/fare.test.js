/* 요금 계산 시험 (D-111) — 수도권 통합환승할인.
   지키는 것: ① 거리비례 계단이 규칙대로 ② 환승은 기본요금 하나(최고가) ③ 지정석은 실제 요금
   ④ 10km 이내 0원 ⑤ 자료 없는 수단 섞여도 안 죽는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const F = require('../engine/fare.js');

// 서울역(133 근처)~강남(222 근처) 대략 좌표로 노드 몇 개
const N = [
  { lat: 37.554, lon: 126.970 }, { lat: 37.540, lon: 126.990 },
  { lat: 37.500, lon: 127.010 }, { lat: 37.497, lon: 127.028 },
];
const ROUTES = [{ dirs: [[0, 1, 2, 3]] }, { dirs: [[0, 1]] }, { dirs: [[1, 2, 3]] }];

test('거리비례 계단이 통합환승 규칙과 맞는다', () => {
  assert.strictEqual(F.distanceExtra(8000), 0, '10km 이내는 0');
  assert.strictEqual(F.distanceExtra(10000), 0, '정확히 10km도 0');
  assert.strictEqual(F.distanceExtra(15000), 100, '15km = 100원');
  assert.strictEqual(F.distanceExtra(30000), 400, '30km = 400원');
  assert.strictEqual(F.distanceExtra(50000), 800, '50km = 800원');
  assert.strictEqual(F.distanceExtra(58000), 900, '58km = 800 + 8km/8×100');
  // 계단이라 5km 안에서는 안 오른다
  assert.strictEqual(F.distanceExtra(11000), F.distanceExtra(14999), '11~15km 사이는 같은 칸');
});

test('지하철 한 구간 — 기본 + 거리비례', () => {
  const legs = [{ kind: 'subway', routeIdx: 0, dirIdx: 0, fromPos: 0, toPos: 3 }];
  const f = F.journeyFare(legs, N, ROUTES);
  assert.strictEqual(f.base, 1550);
  assert.ok(f.total >= 1550, '기본요금 이상');
  assert.ok(f.hasTransit && !f.hasReserved);
  assert.ok(F.fareText(f).indexOf('약') >= 0, '대략값이라 「약」이 붙는다');
});

test('환승해도 기본요금은 탄 수단 중 가장 비싼 것 하나', () => {
  // 마을(1200) + 지하철(1550) → 기본 1550, 두 번 안 낸다
  const legs = [
    { kind: 'village', routeIdx: 1, dirIdx: 0, fromPos: 0, toPos: 1 },
    { kind: 'subway', routeIdx: 2, dirIdx: 0, fromPos: 0, toPos: 2 },
  ];
  const f = F.journeyFare(legs, N, ROUTES);
  assert.strictEqual(f.base, 1550, '지하철이 더 비싸므로 1550');
  assert.ok(f.total < 1550 + 1200, '두 기본요금을 더하지 않는다(환승 무료)');
});

test('광역버스(빨간버스)는 기본 3,000원', () => {
  const legs = [{ kind: 'express', routeIdx: 0, dirIdx: 0, fromPos: 0, toPos: 1 }];
  const f = F.journeyFare(legs, N, ROUTES);
  assert.strictEqual(f.base, 3000);
});

test('지정석(KTX 등)은 노선의 실제 요금을 그대로 더한다', () => {
  const legs = [{ reserved: true, fare: 59800 }];
  const f = F.journeyFare(legs, N, ROUTES);
  assert.strictEqual(f.total, 59800);
  assert.ok(f.hasReserved && !f.hasTransit);
  assert.ok(F.fareText(f).indexOf('지정석') >= 0);
});

test('지정석 + 대중교통 섞이면 합산하고 그렇게 밝힌다', () => {
  const legs = [
    { reserved: true, fare: 59800 },
    { kind: 'subway', routeIdx: 2, dirIdx: 0, fromPos: 0, toPos: 2 },
  ];
  const f = F.journeyFare(legs, N, ROUTES);
  assert.ok(f.total > 59800, '지하철 요금이 더해진다');
  assert.ok(f.hasReserved && f.hasTransit);
  assert.match(F.fareText(f), /지정석 요금 \+ 대중교통/);
});

test('빈 여정·모르는 수단에도 안 죽는다', () => {
  assert.strictEqual(F.journeyFare([], N, ROUTES).total, null);
  assert.strictEqual(F.journeyFare(null, N, ROUTES).total, null);
  // 모르는 kind 하나뿐이면 total 은 null(지어내지 않는다)
  const f = F.journeyFare([{ kind: '우주선', routeIdx: 0, dirIdx: 0, fromPos: 0, toPos: 1 }], N, ROUTES);
  assert.strictEqual(f.total, null);
});
