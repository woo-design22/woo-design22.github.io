/* transfer.js — 환승 노드와 방향 라벨.
   사양서 6.2 의 「이미 겪은 버그」 ①②④ 를 코드로 못 박는 자리다.
   경로 탐색(M2-2) 본체는 아직 없지만, 탐색이 반드시 통과해야 하는 관문만 먼저 순수 함수로 만들어 둔다.
   브라우저 window.SeatTransfer / Node module.exports. 의존 없음. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeatTransfer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── ② 정류장 이름이 안 이어진다 ─────────────────────────────────────────
  /* 지하철역 「월곡」과 버스정류장 「월곡역」이 다른 노드로 잡혀 버스-지하철 환승이
     아예 탐색되지 않았다. 이름 정규화는 임시방편이고, 정답은 아래 clusterStops 의
     좌표 기반 근접 클러스터링이다 — 둘 다 두되 우선순위를 헷갈리지 말 것. */
  var STOP_SUFFIX = /(역앞|역|정류장|승강장|.{1,3}방면)$/;
  function canonStopName(s) {
    var t = String(s || '').replace(/\s+/g, '').replace(/\(.*?\)/g, '');   // 「신촌(경의중앙선)」 부기 제거
    // 「월곡역정류장」처럼 꼬리가 겹쳐 붙는다. 한 번만 떼면 「월곡역」에서 멈춘다.
    // 이름이 통째로 사라지는 것만 막고(「역」 하나뿐인 이름) 더 못 뗄 때까지 반복한다.
    for (var i = 0; i < 4; i++) {
      var next = t.replace(STOP_SUFFIX, '');
      if (next === t || next.length === 0) break;
      t = next;
    }
    return t;
  }

  var EARTH_M = 6371000;
  function haversine(a, b) {
    var toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    var la1 = a.lat * toRad, la2 = b.lat * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* 반경 radiusM 안의 정류장·역 출입구를 하나의 환승 노드로 묶는다.
     격자로 후보를 좁히고 union-find 로 잇는다 — 11,000개를 전수 비교하면 6천만 번이다.
     stops = [{id, name, lat, lon, kind}] → [{nodeId, name, lat, lon, members:[id...]}] */
  function clusterStops(stops, radiusM) {
    var R = radiusM === undefined ? 150 : radiusM;
    var cell = R / 111320;                     // 위도 1도 ≈ 111.32km. 격자 한 칸 = 반경 크기
    var grid = Object.create(null), i, j;
    var parent = new Array(stops.length);
    for (i = 0; i < stops.length; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(x, y) { var rx = find(x), ry = find(y); if (rx !== ry) parent[Math.max(rx, ry)] = Math.min(rx, ry); }

    for (i = 0; i < stops.length; i++) {
      var gx = Math.floor(stops[i].lon / cell), gy = Math.floor(stops[i].lat / cell);
      var key = gx + ':' + gy;
      (grid[key] || (grid[key] = [])).push(i);
    }
    for (i = 0; i < stops.length; i++) {
      var cx = Math.floor(stops[i].lon / cell), cy = Math.floor(stops[i].lat / cell);
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var bucket = grid[(cx + dx) + ':' + (cy + dy)];
        if (!bucket) continue;
        for (j = 0; j < bucket.length; j++) {
          var k = bucket[j];
          if (k <= i) continue;
          if (haversine(stops[i], stops[k]) <= R) union(i, k);
        }
      }
    }

    // 묶기와 무게중심을 한 번에 훑는다. 군집마다 다시 전수 조회하면 11,000개에서 1억 번이 된다.
    var byRoot = Object.create(null), out = [];
    for (i = 0; i < stops.length; i++) {
      var r = find(i), g = byRoot[r];
      if (!g) { g = byRoot[r] = { nodeId: 'N' + r, name: stops[i].name, lat: 0, lon: 0, members: [], _sx: 0, _sy: 0 }; out.push(g); }
      g.members.push(stops[i].id);
      g._sx += stops[i].lon; g._sy += stops[i].lat;
      // 이름은 지하철역 이름을 우선으로 삼는다 — 사람이 아는 이름이 그 쪽이다.
      if (stops[i].kind === 'subway') g.name = stops[i].name;
    }
    for (i = 0; i < out.length; i++) {
      out[i].lon = out[i]._sx / out[i].members.length;
      out[i].lat = out[i]._sy / out[i].members.length;
      delete out[i]._sx; delete out[i]._sy;
    }
    return out;
  }

  // ── ① 되돌아가는 경로가 나온다 ──────────────────────────────────────────
  /* 화곡→여의도인데 「5호선(화곡→방화) + 5호선(방화→여의도)」가 1위로 올라왔다.
     환승 후보에서 같은 노선은 방향과 무관하게 전부 제외한다.
     방향만 걸러도 안 된다 — 방향 라벨이 뒤집히면(버그 ④) 그대로 뚫린다. */
  function isValidTransfer(fromRouteId, toRouteId) {
    return String(fromRouteId) !== String(toRouteId);
  }
  function transferCandidates(fromRouteId, candidates) {
    return candidates.filter(function (c) { return isValidTransfer(fromRouteId, c.routeId); });
  }

  /* 완성된 경로에 되돌아가는 구간이 있는지 본다(사양서 10장 마지막 줄의 검증 기준).
     legs = [{routeId, fromSeq, toSeq}] — 같은 노선이 두 번 나오면 그 자체로 실격이다. */
  function hasBacktrack(legs) {
    var seen = Object.create(null);
    for (var i = 0; i < legs.length; i++) {
      var id = String(legs[i].routeId);
      if (seen[id]) return true;
      seen[id] = true;
      if (legs[i].toSeq === legs[i].fromSeq) return true;      // 한 정거장도 못 간 구간
    }
    return false;
  }

  // ── ④ 방향 라벨이 뒤집힌다 ──────────────────────────────────────────────
  /* 역 배열 순서와 방향 이름을 따로 관리하다 6호선 신내행/응암순환행이 뒤바뀌었다.
     라벨은 저장하지 말고 배열에서 그때그때 파생시킨다. */
  function directionLabel(stationNames) {
    if (!stationNames || !stationNames.length) return '';
    return stationNames[stationNames.length - 1] + '행';
  }
  /* 상·하행 두 방향을 한 배열에서 만든다. reversed=true 면 뒤집은 배열의 종점이 라벨이 된다. */
  function directionsOf(stationNames) {
    var back = stationNames.slice().reverse();
    return [
      { reversed: false, stations: stationNames, label: directionLabel(stationNames) },
      { reversed: true,  stations: back,         label: directionLabel(back) }
    ];
  }

  // ── 6.3 도보 시간 (교통약자 기준) ───────────────────────────────────────
  /* 네이버·카카오는 1.2m/s 한 값뿐이라 어르신에게는 실제보다 짧게 나온다. */
  /* 화면에는 초속을 쓰지 않는다 — 「0.8m/s」는 사용자가 자기를 견줄 수 있는 말이 아니다.
     주 사용자가 어르신이므로 고르는 말은 보통/느림/아주 느림 세 마디면 된다. */
  var WALK_SPEEDS = [
    { id: 'normal', name: '보통',      mps: 1.2 },
    { id: 'slow',   name: '느림',      mps: 0.8 },
    { id: 'vslow',  name: '아주 느림',  mps: 0.6 }
  ];

  /* ★ 직선거리를 그대로 나누면 안 된다 ★
     사람은 직선으로 못 걷는다 — 길을 따라 돌고, 횡단보도를 건너고, 육교를 오른다.
     실제 걷는 거리 ÷ 직선거리를 **우회계수**라 하고, 도시 격자 도로에서 대체로 1.2~1.4 다.
     이걸 안 붙이면 「300m 니까 4분」이라고 말해 놓고 실제로는 6분이 걸린다.
     어르신·교통약자가 주 사용자인데 도보 시간을 짧게 부르는 것이 가장 나쁘다.

     제대로 하려면 실제 보행 경로(OSRM 같은 것)를 물어야 하고 그건 인터넷이 필요하다.
     오프라인에서도 답이 나와야 하므로(사양서 2.3) 기본은 이 계수로 간다. */
  var WALK_DETOUR = 1.3;

  function speedOf(speedId) {
    return WALK_SPEEDS.filter(function (w) { return w.id === speedId; })[0] || WALK_SPEEDS[0];
  }
  /* 직선거리 → 실제 걷게 되는 거리(m) */
  function walkDistance(straightMeters) { return straightMeters * WALK_DETOUR; }
  /* 직선거리 → 걸리는 시간(분). 받는 값이 **직선거리**라는 점을 헷갈리지 말 것. */
  function walkMinutes(straightMeters, speedId) {
    return walkDistance(straightMeters) / speedOf(speedId).mps / 60;
  }

  return {
    canonStopName: canonStopName, haversine: haversine, clusterStops: clusterStops,
    isValidTransfer: isValidTransfer, transferCandidates: transferCandidates, hasBacktrack: hasBacktrack,
    directionLabel: directionLabel, directionsOf: directionsOf,
    WALK_SPEEDS: WALK_SPEEDS, WALK_DETOUR: WALK_DETOUR,
    speedOf: speedOf, walkDistance: walkDistance, walkMinutes: walkMinutes
  };
});
