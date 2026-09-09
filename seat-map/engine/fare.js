/* 요금 계산 (D-111) — 대중교통 여정의 대략 요금.
   브라우저에서는 window.SeatFare, Node 에서는 module.exports 로 같은 코드가 돈다.

   ★ 왜 순수함수 별도 파일인가 ★ 요금은 앉을 확률과 성격이 다르고(거리·수단·환승만 봄),
   seat-model 이 이미 크다. engine 규칙대로 DOM·네트워크·Date 를 안 쓴다.

   ★ 근거: 수도권 통합환승할인 (2025-06-28 인상, 2026 현재 유효) ★
   - 카드 기준. 한 번 탈 때마다 내는 게 아니라 **여정 전체를 묶어** 계산한다:
     기본요금(탄 수단 중 가장 비싼 것) + 10km 넘는 만큼 거리비례 + 환승은 요금 안 더함.
   - 지하철·간선·지선: 기본 1,550원 / 10km 초과 5km 마다 100원(50km 초과는 8km 마다).
   - 마을버스: 기본 1,200원. 광역(빨간)버스: 기본 3,000원(수도권). 순환은 간선과 같게 본다.
   - 환승은 **하차 태그 뒤 30분 안**(밤 21시~다음날 07시는 60분)에 갈아타면 무료 환승.
     우리 여정은 애초에 이어지는 환승만 만들므로 늘 무료 환승으로 본다.
   - 거리비례는 **여정의 실제 탄 거리 합**으로 잡는다(환승해도 거리는 이어서 센다).

   ★ 이건 「대략」이다 ★ 조조할인(첫차~06:30 −20%)·나이 할인·정확한 노선 실거리(우리는
   역·정류장 좌표 직선합 ×보정)는 반영하지 않는다. 화면에 「약」과 「환승할인 포함」을 붙인다.
   지정석(KTX·고속·시외)은 여기서 계산하지 않는다 — 그건 노선에 실제 요금(fare)이 실려 온다.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeatFare = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 수단별 기본요금(원, 카드). kind → 기본요금·거리비례 여부.
  var BASE = {
    subway: 1550, trunk: 1550, branch: 1550, circular: 1550,
    village: 1200, express: 3000, night: 2500
  };
  // 거리비례를 매기지 않는 수단(정액). 마을·광역은 정액이 아니라 아래 규칙을 함께 쓴다.
  var FIRST_KM = 10;          // 이 거리까지는 기본요금
  var STEP1_KM = 5, STEP1_WON = 100;    // 10~50km: 5km 마다 100원
  var STEP2_KM = 8, STEP2_WON = 100;    // 50km 초과: 8km 마다 100원

  var EARTH = 6371000, RAD = Math.PI / 180;
  function haversine(a, b) {
    var dLat = (b.lat - a.lat) * RAD, dLon = (b.lon - a.lon) * RAD;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* 거리비례 추가요금(원). 총 탄 거리(m)를 받아 10km 초과분을 계단으로 매긴다. */
  function distanceExtra(meters) {
    var km = meters / 1000;
    if (km <= FIRST_KM) return 0;
    var extra = 0, over = Math.min(km, 50) - FIRST_KM;   // 10~50km 구간
    if (over > 0) extra += Math.ceil(over / STEP1_KM) * STEP1_WON;
    if (km > 50) extra += Math.ceil((km - 50) / STEP2_KM) * STEP2_WON;
    return extra;
  }

  /* 한 leg 의 탄 거리(m) — 노드 좌표 직선합 × 우회보정(선로·도로가 곧지 않다).
     지하철은 역이 드물어 보정을 조금만, 버스는 길을 따라 도니 조금 더 준다.
     leg 에 실제 노드열(stopsList)이 있으면 그걸 쓰고, 없으면 그래프의 노선 배열
     dirs[dirIdx][fromPos..toPos] 에서 뽑는다(route.js 를 안 고쳐도 되게). */
  var DETOUR = { subway: 1.15, default: 1.25 };
  function legNodeSeq(leg, routes) {
    if (leg.stopsList && leg.stopsList.length) return leg.stopsList;
    var r = routes && leg.routeIdx != null ? routes[leg.routeIdx] : null;
    var dir = r && r.dirs && r.dirs[leg.dirIdx];
    if (!dir || leg.fromPos == null || leg.toPos == null) return null;
    var a = Math.min(leg.fromPos, leg.toPos), b = Math.max(leg.fromPos, leg.toPos);
    return dir.slice(a, b + 1);
  }
  function legMeters(nodes, leg, routes) {
    var seq = legNodeSeq(leg, routes);
    if (!seq || seq.length < 2) return 0;
    var m = 0;
    for (var i = 0; i + 1 < seq.length; i++) {
      var a = nodes[seq[i]], b = nodes[seq[i + 1]];
      if (a && b && a.lat != null && b.lat != null) m += haversine(a, b);
    }
    return m * (leg.kind === 'subway' ? DETOUR.subway : DETOUR.default);
  }

  /* 여정 요금. legs 는 [{kind, reserved, fare, routeIdx, dirIdx, fromPos, toPos}],
     nodes 는 그래프 노드 배열, routes 는 그래프 노선 배열(거리 뽑기용).
     돌려주는 것: { total(원|null), base, distanceExtra, reservedWon, hasReserved, approx } */
  function journeyFare(legs, nodes, routes) {
    if (!legs || !legs.length) return { total: null };
    var base = 0, meters = 0, reservedWon = 0, hasReserved = false, hasTransit = false, unknown = false;
    for (var i = 0; i < legs.length; i++) {
      var l = legs[i];
      if (l.reserved) {
        // 지정석은 노선에 실제 요금이 실려 온다. 통합환승과 섞지 않고 그대로 더한다.
        hasReserved = true;
        if (l.fare) reservedWon += l.fare; else unknown = true;
        continue;
      }
      hasTransit = true;
      var b = BASE[l.kind];
      if (b === undefined) { unknown = true; continue; }
      if (b > base) base = b;            // 기본요금 = 탄 수단 중 가장 비싼 것
      meters += legMeters(nodes, l, routes);
    }
    var extra = hasTransit ? distanceExtra(meters) : 0;
    var transitWon = hasTransit ? base + extra : 0;
    var total = transitWon + reservedWon;
    return {
      total: (total > 0 && !(hasTransit && base === 0)) ? total : (reservedWon > 0 ? reservedWon : null),
      base: base, distanceExtra: extra, meters: Math.round(meters),
      reservedWon: reservedWon, hasReserved: hasReserved, hasTransit: hasTransit,
      // 지정석 요금을 하나라도 모르거나, 통합환승 대상이 섞여 있으면 「약」이다
      approx: hasTransit || unknown
    };
  }

  /* 화면 문구. 「약 1,650원 (환승할인 포함)」 / 지정석이면 합산 방식을 밝힌다. */
  function fareText(f) {
    if (!f || f.total == null) return null;
    var won = f.total.toLocaleString('ko-KR') + '원';
    if (f.hasReserved && f.hasTransit)
      return '약 ' + won + ' <span class="muted">(지정석 요금 + 대중교통 환승할인)</span>';
    if (f.hasReserved)
      return won + ' <span class="muted">(지정석 · 예매 기준)</span>';
    return '약 ' + won + ' <span class="muted">(카드 · 환승할인 포함)</span>';
  }

  return {
    BASE: BASE, distanceExtra: distanceExtra, legMeters: legMeters,
    journeyFare: journeyFare, fareText: fareText, haversine: haversine
  };
}));
