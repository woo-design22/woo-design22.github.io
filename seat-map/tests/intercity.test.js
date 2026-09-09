/* 도시 간 이동(KTX·SRT·고속·시외버스) 시험 — 지정석 처리 (D-107).

   ★ 이 시험이 지키는 것 ★
   지정석은 **확률이 아니라 사실**이다. 표를 끊으면 앉고 매진이면 못 탄다.
   그런데 이 저장소의 기본 규칙은 「모르는 구간 = 서서 간다」(D-25)이다 —
   지정석 노선을 그 규칙에 그냥 흘리면 **KTX 를 두 시간 반 서서 가는 것으로** 계산한다.
   정반대의 답이라 눈에 안 띄고, 그래서 시험으로 못 박는다.

   자료(API)가 없어도 도는 시험이다 — 손으로 만든 작은 그래프로 확인한다.
   활용신청이 필요한 API 는 pipeline/fetch_intercity.py --probe 가 상태를 말해 준다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../engine/seat-model.js');
const L = require('../engine/loads.js');
const R = require('../engine/route.js');

// ── 손으로 만든 그래프: 서울역 → 부산역, KTX 한 편 ──────────────────────────
const nodes = [
  { name: '서울역', lat: 37.5547, lon: 126.9707, members: [], kinds: ['subway', 'bus'] },
  { name: '부산역', lat: 35.1151, lon: 129.0403, members: [], kinds: ['subway', 'bus'] },
];
const ktx = {
  id: 'IC-train-서울-부산-KTX', name: 'KTX 서울→부산', kind: 'rail',
  vehicle: 'trainReserved', minutes: 155, headwayMin: 24, reserved: true,
  runsPerDay: 45, fare: 59800, dirs: [[0, 1]],
};
const graph = { nodes: nodes, routes: [ktx] };

test('지정석 차종은 확률이 아니라 사실로 답한다', () => {
  const r = M.ride({ vehicle: 'trainReserved',
                     segments: [{ load: 0, minutes: 155, alightAtEnd: 0, boardAtEnd: 0 }] });
  assert.strictEqual(r.reserved, true, 'reserved 표시가 없다');
  assert.strictEqual(r.pSeated, 1);
  assert.strictEqual(r.pBoard, 1);
  assert.strictEqual(r.standingMinutes, 0, '지정석인데 서서 가는 시간이 있다');
  assert.strictEqual(r.totalMinutes, 155);
  for (const veh of ['trainReserved', 'coachReserved'])
    assert.strictEqual(M.VEHICLES[veh].reserved, true, veh + ' 에 reserved 가 없다');
});

test('재차 계산이 지정석 노선을 「자료 없음 = 서서」로 떨어뜨리지 않는다 (D-25 의 예외)', () => {
  const ctx = { graph: graph, minutes: 9 * 60, dayType: 'weekday' };
  const loadFor = L.makeLoadFor(ctx);
  const info = loadFor({ routeIdx: 0, dirIdx: 0, fromPos: 0, toPos: 1, stops: 1, offsetMinutes: 0 });
  assert.ok(info, '지정석 노선인데 자료 없음(null)으로 떨어졌다');
  assert.strictEqual(info.reserved, true);
  assert.strictEqual(info.estimated, false, '지정석은 추정이 아니다 — 표가 곧 좌석이다');
  assert.strictEqual(info.segments.length, 1);
  assert.strictEqual(info.segments[0].minutes, 155);
});

test('경로에 실리면 서는 시간 0분 · 빈자리 문구 없음 · 지정석 표시', () => {
  const index = R.buildIndex(graph);
  const found = R.search({
    graph: graph, index: index,
    fromNodes: [{ node: 0, meters: 0 }], toNodes: [{ node: 1, meters: 0 }],
    maxTransfers: 0, walkSpeed: 'normal',
  });
  assert.ok(found.length, '서울역 → 부산역 경로가 안 나왔다');
  const ctx = { graph: graph, minutes: 9 * 60, dayType: 'weekday', alpha: M.ALPHA_DEFAULT };
  ctx.loadFor = L.makeLoadFor(ctx);
  found.forEach(j => R.evaluate(j, ctx));
  const j = R.rank(found)[0];
  const leg = j.legs[0];
  assert.strictEqual(leg.reserved, true, '구간에 지정석 표시가 안 실렸다');
  assert.strictEqual(leg.seatText, null, '지정석인데 「몇 자리 비었다」를 지어냈다');
  assert.strictEqual(Math.round(leg.standingMinutes), 0, '지정석인데 서서 간다고 나온다');
  assert.strictEqual(leg.pSeated, 1);
  // 기다림은 배차(24분)의 절반 — 편수에서 뽑은 값을 엔진이 그대로 쓴다(D-57)
  assert.strictEqual(leg.waitMinutes, 12, '편수에서 뽑은 배차를 안 쓴다');
  assert.strictEqual(Math.round(leg.rideMinutes), 155);
});

test('지정석이라도 「기다림은 서 있는 것」 규칙은 그대로다 (D-74)', () => {
  /* 차 안에서는 앉지만 승강장에서 기다리는 시간까지 앉아 있다고 하면 안 된다.
     이 규칙이 무너지면 도시 간 경로가 늘 1위로 올라와 목록을 못 믿게 된다. */
  const index = R.buildIndex(graph);
  const mk = waitAsStanding => {
    const found = R.search({ graph: graph, index: index,
      fromNodes: [{ node: 0, meters: 0 }], toNodes: [{ node: 1, meters: 0 }],
      maxTransfers: 0, walkSpeed: 'normal' });
    const ctx = { graph: graph, minutes: 9 * 60, dayType: 'weekday',
                  alpha: M.ALPHA_DEFAULT, waitAsStanding: waitAsStanding };
    ctx.loadFor = L.makeLoadFor(ctx);
    found.forEach(j => R.evaluate(j, ctx));
    return R.rank(found)[0];
  };
  assert.strictEqual(Math.round(mk(true).standingMinutes), 12, '기다림이 서는 시간에 안 들어갔다');
  assert.strictEqual(Math.round(mk(false).standingMinutes), 0);
});
