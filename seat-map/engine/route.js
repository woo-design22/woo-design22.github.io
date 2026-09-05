/* route.js — 경로 탐색 (사양서 6장). **이 서비스의 본체다.**
   브라우저 window.SeatRoute / Node module.exports. 의존: seat-model.js, transfer.js.

   ★ 이 서비스가 남과 다른 단 하나 ★
   찾은 경로를 **빠른 순이 아니라 「서서 가는 시간이 짧은 순」으로** 정렬한다(사양서 5.4).
   41분 서서 가는 지하철보다 52분 앉아 가는 버스를 위에 놓는다. 그게 존재 이유의 전부다.

   그래프(pipeline/build_graph.py 산출)
     nodes  [{name, lat, lon, kinds, members}]           150m 로 묶은 환승 노드
     routes [{id, name, kind, vehicle, minutes, dirs}]   dirs = 노드 번호의 순서 배열
            버스는 왕복이 한 줄(dirs 길이 1) — **순번 i < j 이면 그것이 곧 방향이다.**
            지하철만 상·하행 두 줄.

   탐색 (D-03: 환승 2회까지 BFS)
     앞에서 한 번(F1: 한 번 타서 닿는 곳), 뒤에서 한 번(B1: 한 번 타면 도착하는 곳)을 만들고
     교집합을 본다. 양쪽에서 좁히지 않으면 2회 환승에서 경우의 수가 터진다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./seat-model.js'), require('./transfer.js'));
  else root.SeatRoute = factory(root.SeatModel, root.SeatTransfer);
})(typeof self !== 'undefined' ? self : this, function (M, T) {
  'use strict';

  var WALK_RADIUS_M = 700;      // 출발·도착 지점에서 걸어갈 만한 거리
  var TRANSFER_WALK_MIN = 5;    // 환승 도보 기본값 (사양서 6.3 — 실측이 없을 때)
  var WAIT_MIN = { subway: 3, trunk: 5, branch: 6, village: 7, express: 10, night: 12 };
  var MAX_RIDE_STOPS = 90;      // 한 번에 이 이상 타는 경로는 후보에서 뺀다
  var MAX_RESULTS = 12;
  /* 「그냥 걸어가기」를 후보에 넣는 기준은 거리가 아니라 **걸리는 시간**이다.
     2.5km 로 잘랐더니 **35분 걷는 길이 1순위**로 올라왔다(서서 가는 시간이 0이라서).
     주 사용자가 어르신·교통약자인데 35분을 걸으라는 것은 답이 아니다.
     시간으로 자르면 걸음 속도 설정이 그대로 반영된다 —
     보통이면 약 1.1km, 「아주 느림」이면 약 550m 까지만 걷기를 권한다. */
  var WALK_ONLY_MAX_MIN = 20;
  var WALK_ONLY_MAX_M = 2500;   // 그래도 아주 먼 것은 계산 전에 걸러 낸다

  // ── 색인 ────────────────────────────────────────────────────────────────
  /* 노드 → 그 노드를 지나는 [노선번호, 방향번호, 몇 번째] 목록.
     한 노선이 같은 노드를 두 번 지날 수 있다(버스 왕복). 그래서 배열이다. */
  function buildIndex(graph) {
    var byNode = [];
    var i, d, p;
    for (i = 0; i < graph.nodes.length; i++) byNode.push(null);
    for (i = 0; i < graph.routes.length; i++) {
      var dirs = graph.routes[i].dirs;
      for (d = 0; d < dirs.length; d++) {
        var arr = dirs[d];
        for (p = 0; p < arr.length; p++) {
          var n = arr[p];
          if (!byNode[n]) byNode[n] = [];
          byNode[n].push([i, d, p]);
        }
      }
    }
    return { byNode: byNode, nodes: graph.nodes, routes: graph.routes };
  }

  // ── 걸어서 닿는 곳 ──────────────────────────────────────────────────────
  /* 걸어갈 만한 거리의 노드를 뽑되 **지하철역 자리를 따로 남겨 둔다.**

     ★ 이걸 안 하면 지하철이 경로에서 통째로 사라진다 ★
     실측: 월곡두산위브아파트에서 월곡역은 741m 로 반경 안인데, 그 반경 안에
     버스정류장이 68곳이나 있어 「가까운 순 12개」에 46번째인 월곡역이 못 든다.
     그래서 6호선이 후보에 아예 오르지 않고 마을버스 두 번 갈아타는 길만 나왔다.

     정류장은 촘촘하고 역은 드물다 — 거리만으로 자르면 **드문 쪽이 늘 진다.**
     역은 수송력도 배차도 정류장과 급이 달라 후보에서 빠지면 안 된다. */
  function nearbyMixed(nodes, lat, lon, radiusM, limit, subLimit) {
    var all = nearby(nodes, lat, lon, radiusM, 1e9);
    var keep = subLimit === undefined ? 3 : subLimit;
    var out = [], taken = Object.create(null), i, n = 0;
    for (i = 0; i < all.length && n < keep; i++) {
      var kinds = nodes[all[i].node].kinds || [];
      if (kinds.indexOf('subway') >= 0) { out.push(all[i]); taken[all[i].node] = 1; n++; }
    }
    var room = (limit || 12) + out.length;
    for (i = 0; i < all.length && out.length < room; i++)
      if (!taken[all[i].node]) out.push(all[i]);
    out.sort(function (a, b) { return a.meters - b.meters; });
    return out;
  }

  function nearby(nodes, lat, lon, radiusM, limit) {
    var R = radiusM || WALK_RADIUS_M, out = [];
    for (var i = 0; i < nodes.length; i++) {
      var m = T.haversine({ lat: lat, lon: lon }, nodes[i]);
      if (m <= R) out.push({ node: i, meters: m });
    }
    out.sort(function (a, b) { return a.meters - b.meters; });
    return out.slice(0, limit || 12);
  }

  /* 이름으로 찾기. 출발지·도착지 입력칸이 쓴다.

     ★ 순서가 중요하다 ★
     그냥 「들어 있으면 맞다」로 하면 「월곡」을 쳤을 때 **상월곡역**이 먼저 나오고,
     「을지로4가」를 쳤을 때 **방산시장.을지로4가** 라는 버스정류장이 먼저 나온다.
     실제로 그렇게 골라져서 엉뚱한 곳에서 길을 찾았다.
     그래서 점수를 매긴다 — 정확히 같은 이름 → 「역」만 뺀 이름 → 앞에서 시작 → 그냥 포함.
     같은 점수면 지하철역을, 그 다음엔 이름이 짧은 쪽을 먼저 준다. */
  function findNodes(graph, q, limit) {
    var text = String(q || '').replace(/\s+/g, '');
    if (!text) return [];
    var bare = text.replace(/역$/, '');
    var scored = [];
    for (var i = 0; i < graph.nodes.length; i++) {
      var nm = graph.nodes[i].name.replace(/\s+/g, '');
      var nb = nm.replace(/역$/, '');
      var s;
      if (nm === text) s = 0;
      else if (nb === bare) s = 1;
      else if (nm.indexOf(text) === 0) s = 2;
      else if (nb.indexOf(bare) === 0) s = 3;
      else if (nm.indexOf(text) >= 0) s = 4;
      else continue;
      if (graph.nodes[i].kinds.indexOf('subway') >= 0) s -= 0.5;   // 같은 점수면 역이 먼저
      scored.push([s, nm.length, i]);
    }
    scored.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return scored.slice(0, limit || 30).map(function (x) {
      var n = graph.nodes[x[2]];
      return { node: x[2], name: n.name, kinds: n.kinds, lat: n.lat, lon: n.lon };
    });
  }

  // ── 한 번 타서 닿는 곳 ──────────────────────────────────────────────────
  /* start 노드에서 노선 하나를 타고 갈 수 있는 하류 노드들.
     같은 노선을 두 번 세지 않고(사양서 6.2-①), 몇 정거장인지도 같이 준다. */
  function ridesFrom(idx, node, excludeRouteId) {
    var at = idx.byNode[node];
    if (!at) return [];
    var out = [];
    for (var a = 0; a < at.length; a++) {
      var ri = at[a][0], di = at[a][1], pos = at[a][2];
      var route = idx.routes[ri];
      if (excludeRouteId !== undefined && route.id === excludeRouteId) continue;   // 버그 ①
      var arr = route.dirs[di];
      var seen = {};
      for (var p = pos + 1; p < arr.length && p - pos <= MAX_RIDE_STOPS; p++) {
        var to = arr[p];
        if (to === node || seen[to]) continue;      // 제자리·같은 노드 재방문 제외
        seen[to] = 1;
        out.push({ routeIdx: ri, dirIdx: di, fromPos: pos, toPos: p, from: node, to: to,
                   stops: p - pos });
      }
    }
    return out;
  }

  /* 뒤에서 한 번: 이 노드에서 타면 dest 에 닿는가? — dest 에 닿는 노드 집합을 만든다. */
  function backOne(idx, destNodes) {
    var reach = Object.create(null);       // 노드 → [{routeIdx,dirIdx,fromPos,toPos,to,stops}]
    var dset = Object.create(null);
    var i;
    for (i = 0; i < destNodes.length; i++) dset[destNodes[i]] = 1;
    for (var ri = 0; ri < idx.routes.length; ri++) {
      var dirs = idx.routes[ri].dirs;
      for (var di = 0; di < dirs.length; di++) {
        var arr = dirs[di];
        // 뒤에서부터 훑으며 「이 뒤에 도착지가 있는 가장 가까운 자리」를 들고 간다
        var nextDest = -1;
        for (var p = arr.length - 1; p >= 0; p--) {
          if (nextDest >= 0 && nextDest - p <= MAX_RIDE_STOPS) {
            var n = arr[p];
            if (!reach[n]) reach[n] = [];
            reach[n].push({ routeIdx: ri, dirIdx: di, fromPos: p, toPos: nextDest,
                            from: n, to: arr[nextDest], stops: nextDest - p });
          }
          if (dset[arr[p]]) nextDest = p;
        }
      }
    }
    return reach;
  }

  // ── 탐색 ────────────────────────────────────────────────────────────────
  /* opt = {graph, index, fromNodes:[{node,meters}], toNodes:[{node,meters}],
            maxTransfers=2, walkSpeed='normal'}
     돌려주는 것: [{legs:[...], transfers, totalMinutes, walkMinutes}]  (아직 서서 가는 시간은 없다) */
  function search(opt) {
    var idx = opt.index, maxT = opt.maxTransfers === undefined ? 2 : opt.maxTransfers;
    var fromNodes = opt.fromNodes || [], toNodes = opt.toNodes || [];
    var walkOf = {}, i;
    for (i = 0; i < fromNodes.length; i++) walkOf[fromNodes[i].node] = fromNodes[i].meters;
    var destWalk = {}, destSet = [];
    for (i = 0; i < toNodes.length; i++) { destWalk[toNodes[i].node] = toNodes[i].meters; destSet.push(toNodes[i].node); }

    var journeys = [];
    var back = backOne(idx, destSet);

    function add(legs) {
      if (legs.length - 1 > maxT) return;
      if (T.hasBacktrack(legs.map(function (l) {
        return { routeId: idx.routes[l.routeIdx].id, fromSeq: l.fromPos, toSeq: l.toPos };
      }))) return;                                   // 버그 ①: 같은 노선 재승차 = 되돌아감
      journeys.push(legs);
    }

    // 0회 환승 — 출발 노드에서 바로 도착 노드까지
    var firstLegs = [];
    for (i = 0; i < fromNodes.length; i++) {
      var rides = ridesFrom(idx, fromNodes[i].node);
      for (var r = 0; r < rides.length; r++) {
        firstLegs.push(rides[r]);
        if (destWalk[rides[r].to] !== undefined) add([rides[r]]);
      }
    }

    // 1회 환승 — 첫 구간의 끝에서 도착지로 가는 차가 있으면
    var seenPair = Object.create(null);
    for (i = 0; i < firstLegs.length && journeys.length < 400; i++) {
      var a = firstLegs[i];
      var opts = back[a.to];
      if (!opts) continue;
      for (var j = 0; j < opts.length; j++) {
        var b = opts[j];
        if (idx.routes[b.routeIdx].id === idx.routes[a.routeIdx].id) continue;
        var key = a.routeIdx + ':' + a.to + ':' + b.routeIdx;
        if (seenPair[key]) continue;
        seenPair[key] = 1;
        add([a, b]);
      }
    }

    // 2회 환승 — 첫 구간 끝에서 한 번 더 타고, 거기서 도착지로
    if (maxT >= 2 && journeys.length < 60) {
      var seen2 = Object.create(null);
      for (i = 0; i < firstLegs.length && journeys.length < 200; i++) {
        var a2 = firstLegs[i];
        var mid = ridesFrom(idx, a2.to, idx.routes[a2.routeIdx].id);
        for (var m = 0; m < mid.length; m++) {
          var b2 = mid[m];
          var opts2 = back[b2.to];
          if (!opts2) continue;
          for (var k = 0; k < opts2.length; k++) {
            var c2 = opts2[k];
            var ids = [idx.routes[a2.routeIdx].id, idx.routes[b2.routeIdx].id, idx.routes[c2.routeIdx].id];
            if (ids[0] === ids[2] || ids[1] === ids[2]) continue;
            var key2 = ids.join('>') + ':' + a2.to + ':' + b2.to;
            if (seen2[key2]) continue;
            seen2[key2] = 1;
            add([a2, b2, c2]);
            if (journeys.length >= 200) break;
          }
          if (journeys.length >= 200) break;
        }
      }
    }

    /* 가까우면 「그냥 걸어가기」도 답이다 — 네 정거장 타려고 두 번 갈아타는 것보다 낫다.
       서서 가는 시간은 0 이므로 정렬 1순위에 오른다. 그게 맞다(걷는 동안 안 서 있는 건 아니지만,
       이 서비스가 재는 것은 「차 안에서 서 있는 시간」이다 — 그래서 화면에 「걸어서」라고 분명히 쓴다). */
    if (opt.fromPoint && opt.toPoint) {
      var straight = T.haversine(opt.fromPoint, opt.toPoint);
      var wmTest = T.walkMinutes(straight, opt.walkSpeed);
      if (straight <= WALK_ONLY_MAX_M && wmTest <= WALK_ONLY_MAX_MIN) {
        var wm = wmTest;
        journeys.push(null);           // 자리만 맡아 두고 아래에서 따로 만든다
        var walkJourney = {
          legs: [], transfers: 0, walkOnly: true,
          totalMinutes: wm, walkMinutes: wm, rideMinutes: 0,
          standingMinutes: 0, knownLegs: 0,
          startWalkMeters: straight, endWalkMeters: 0,
          walkMeters: T.walkDistance(straight),
          seatPhrase: { tone: 'good', text: '걸어서 갑니다' }
        };
      }
    }

    // 시간 계산
    var out = [];
    if (typeof walkJourney !== 'undefined' && walkJourney) out.push(walkJourney);
    for (i = 0; i < journeys.length; i++) {
      var legs = journeys[i];
      if (!legs) continue;
      var startWalk = walkOf[legs[0].from];
      var endWalk = destWalk[legs[legs.length - 1].to];
      if (startWalk === undefined || endWalk === undefined) continue;
      out.push(describe(idx, legs, startWalk, endWalk, opt.walkSpeed));
    }
    // 같은 노선 조합은 가장 짧은 것만 남긴다
    var best = Object.create(null);
    for (i = 0; i < out.length; i++) {
      var sig = out[i].walkOnly ? 'walk' : out[i].legs.map(function (l) { return l.routeId; }).join('>');
      if (!best[sig] || out[i].totalMinutes < best[sig].totalMinutes) best[sig] = out[i];
    }
    var uniq = Object.keys(best).map(function (k) { return best[k]; });
    uniq.sort(function (a, b) { return a.totalMinutes - b.totalMinutes; });
    return uniq.slice(0, MAX_RESULTS * 3);
  }

  function describe(idx, legs, startWalkM, endWalkM, walkSpeed) {
    var speed = walkSpeed || 'normal';
    var total = T.walkMinutes(startWalkM, speed);
    var walk = total;
    var outLegs = [], i;
    for (i = 0; i < legs.length; i++) {
      var l = legs[i], route = idx.routes[l.routeIdx];
      /* 기다림 = 배차간격의 절반. 노선별 인가 배차(headwayMin, D-57)가 있으면 그것을 쓴다 —
         배차 15분짜리 마을버스를 「7분 기다림」으로 말하면 소요시간이 거짓말이 된다. */
      var wait = route.headwayMin
        ? Math.max(2, Math.round(route.headwayMin / 2))
        : (WAIT_MIN[route.kind] === undefined ? 5 : WAIT_MIN[route.kind]);
      var ride = l.stops * route.minutes;
      if (i > 0) { total += TRANSFER_WALK_MIN; walk += TRANSFER_WALK_MIN; }
      total += wait;
      /* ★ 구간마다 **실제로 타는 시각**이 다르다 ★
         출발 시각 하나를 모든 구간에 쓰면, 걷고 갈아타고 한 시간 뒤에 타는 지하철도
         출발 시각의 혼잡도로 계산된다. 아침에는 30분 차이로 혼잡도가 두 배가 된다
         (4호선 미아 하선: 06:00 37% → 07:00 68%). 그래서 여기까지 걸린 시간을 담아 둔다. */
      var offset = total;                 // 출발부터 이 차를 타기까지 걸린 분
      total += ride;
      outLegs.push({
        routeIdx: l.routeIdx, routeId: route.id, routeName: route.name, kind: route.kind,
        vehicle: route.vehicle, dirIdx: l.dirIdx, fromPos: l.fromPos, toPos: l.toPos,
        fromNode: l.from, toNode: l.to,
        fromName: idx.nodes[l.from].name, toName: idx.nodes[l.to].name,
        // 방향 라벨은 배열 끝에서 파생한다 — 저장하면 뒤집힌다(사양서 6.2-④)
        headsign: idx.nodes[route.dirs[l.dirIdx][route.dirs[l.dirIdx].length - 1]].name + ' 방면',
        stops: l.stops, rideMinutes: ride, waitMinutes: wait, offsetMinutes: offset
      });
    }
    total += T.walkMinutes(endWalkM, speed);
    walk += T.walkMinutes(endWalkM, speed);
    return {
      legs: outLegs, transfers: legs.length - 1,
      totalMinutes: total, walkMinutes: walk,
      startWalkMeters: startWalkM, endWalkMeters: endWalkM,
      // 화면이 「몇 m 걷는다」를 말하려면 직선거리가 아니라 **실제 걷는 거리**를 줘야 한다
      startWalkWalked: T.walkDistance(startWalkM), endWalkWalked: T.walkDistance(endWalkM)
    };
  }

  // ── 서서 가는 시간 (사양서 5장) ─────────────────────────────────────────
  /* loadFor(leg, ctx) 가 그 구간의 재차인원을 준다. 엔진은 자료를 모른다 —
     지하철은 혼잡도, 버스는 승하차 OD 로 앱이 만들어 넣는다.
     돌려주는 값이 null 이면 그 구간은 「모름」으로 두고 정직하게 표시한다. */
  function evaluate(journey, ctx) {
    if (journey.walkOnly) return journey;      // 걸어가는 길엔 탈 차가 없다
    var standing = 0, known = 0, total = 0, i;
    var legs = journey.legs;
    for (i = 0; i < legs.length; i++) {
      var leg = legs[i];
      var veh = M.VEHICLES[leg.vehicle];
      var info = ctx.loadFor ? ctx.loadFor(leg, ctx) : null;
      total += leg.rideMinutes;
      if (info && info.notRunning) {
        // 그 시각에 안 다니는 노선이다. 「텅 비어 있으니 앉는다」가 아니라 아예 탈 수 없다.
        journey.notRunning = true;
        leg.notRunning = true; leg.standingMinutes = leg.rideMinutes;
        leg.pSeated = null; leg.pAnytime = null; leg.pBoard = null; leg.pLater = 0;
        standing += leg.rideMinutes;
        continue;
      }
      if (!info || !info.segments || !info.segments.length) {
        leg.unknown = true;
        /* ★ 모르면 서서 간다고 본다 ★
           반대로 하면 **자료가 없는 노선일수록 정렬에서 유리해진다.**
           실제로 그래서 오전 8시에 심야버스가 1순위로 올라왔었다.
           모르는 것을 유리하게 세지 않는 것이 이 서비스의 정직함이다. */
        standing += leg.rideMinutes;
        leg.standingMinutes = leg.rideMinutes;
        leg.pSeated = null; leg.pAnytime = null; leg.pBoard = null; leg.pLater = 0;
        continue;
      }
      known++;
      var r = info.sd
        ? M.rideSpread({ vehicle: leg.vehicle, alpha: ctx.alpha, segments: info.segments, freeSeats: info.freeSeats })
        : M.ride({ vehicle: leg.vehicle, alpha: ctx.alpha, segments: info.segments, freeSeats: info.freeSeats });
      /* ★ 「앉을 확률」 = 그 역에서 **탈 때 바로** 앉을 확률 ★
         (2026-09-04 사용자 지시: 「타자마자 앉을 확률을 말한다.
          중간에 가다가 누가 내려서 그 자리에 앉을 확률이 아니라」)

         만원 열차에 타면 이미 서 있는 사람이 백 명이다. 그 사람들이 자리를 먼저 가져가므로
         **지금 타는 나에게는 0% 다.** 「가다가 앉을 확률」을 앉을 확률이라 부르면
         만원인데도 34% 같은 숫자가 나와 앉을 것처럼 읽힌다.

         가다가 앉게 되는 것은 버리지 않는다 — 두 군데에 살아 있다.
           · **서서 가는 시간** (앉으면 그 뒤로 안 쌓인다) — 정렬 1순위 키
           · **pAnytime** — 사람이 많이 빠져 자리가 날 만하면 화면이 따로 알린다 */
      leg.pBoard = r.pBoard;
      leg.pSeated = r.pBoard;                    // 화면에 쓰는 값
      leg.pAnytime = r.pSeated;                  // 가다가라도 앉을 확률
      leg.pLater = Math.max(0, r.pSeated - r.pBoard);   // 타고 나서 새로 생기는 몫
      leg.pSeatedTime = leg.rideMinutes > 0 ? 1 - r.standingMinutes / leg.rideMinutes : 1;
      leg.standingMinutes = r.standingMinutes;
      leg.emptySeats = M.emptySeats(info.segments[0].load, veh.seats);
      leg.seats = veh.seats;
      leg.seatText = M.describeSeats(info.segments[0].load, veh.seats);
      standing += r.standingMinutes;
    }
    journey.standingMinutes = standing;
    journey.knownLegs = known;
    journey.rideMinutes = total;

    /* 여정 전체 값은 구간을 **타는 시간으로 가중평균**한다(2026-09-04 사용자 지시).
       세 구간이 21%·21%·34% 인데 「한 번이라도」로 합치면 58% 가 나와 앉을 것처럼 읽혔다.
       모르는 구간·안 다니는 구간은 0 으로 들어간다 — 모르는 것을 유리하게 세지 않는다(D-25). */
    var wsum = 0, wlater = 0;
    for (i = 0; i < legs.length; i++) {
      var pb = typeof legs[i].pSeated === 'number' && !isNaN(legs[i].pSeated) ? legs[i].pSeated : 0;
      wsum += pb * legs[i].rideMinutes;
      wlater += (legs[i].pLater || 0) * legs[i].rideMinutes;
    }
    journey.pSeated = total > 0 ? wsum / total : 1;
    journey.pLater = total > 0 ? wlater / total : 0;
    journey.pSeatedTime = total > 0 ? 1 - standing / total : 1;
    // 여정은 「탈 때」가 여러 번이다 — 구간용 문구(탈 때 앉을 확률)를 그대로 붙이면 거짓말이 된다
    journey.seatChance = M.seatChanceJourney(journey.knownLegs > 0 ? journey.pSeated : null);
    journey.seatPhrase = M.seatPhrase(journey.pSeated);
    return journey;
  }

  /* ── 목적지까지 「앉아 갈 수 있는 승차 위치」 찾기 ────────────────────
     ★ 길찾기와 묻는 것이 다르다 ★
     길찾기: 「A 에서 B 로 어떻게 갈까」 — 출발지가 정해져 있다.
     이것  : 「B 로 가려는데 **어디서 타면 앉아서 갈 수 있나**」 — **출발지가 없다.**

     앉아서 가려고 몇 정거장 거슬러 올라가 타는 것은 실제로 많이 쓰는 요령이다.
     그 「거슬러 올라갈 자리」를 찾아 주는 것이 이 함수다.
     목적지에서 **가까운 순**으로 준다 — 덜 거슬러 올라가는 쪽이 낫기 때문이다.

     opt = {graph, index, toNodes, loadFor, minutes, minP, limit, maxStops}
     돌려주는 것: [{routeName, kind, headsign, boardName, boardNode, stops, rideMinutes,
                    pBoard, metersFromDest, seatText, emptySeats, arriveName}] */
  function boardingPointsTo(opt) {
    var idx = opt.index, nodes = idx.nodes;
    var maxStops = opt.maxStops || 35;
    /* 앉겠다고 100분을 타는 것은 답이 아니다. 실측에서 39정거장 101분짜리 버스가
       「목적지에서 7.6km」라는 이유로 상위에 올라왔다. 타는 시간으로 자른다. */
    var maxRide = opt.maxRideMinutes || 60;
    var minP = opt.minP === undefined ? 0.95 : opt.minP;
    var destSet = Object.create(null), dests = [], i;
    for (i = 0; i < (opt.toNodes || []).length; i++) {
      destSet[opt.toNodes[i].node] = 1; dests.push(opt.toNodes[i].node);
    }
    if (!dests.length) return [];

    var out = [], bestAt = Object.create(null);
    for (var ri = 0; ri < idx.routes.length; ri++) {
      var route = idx.routes[ri];
      for (var di = 0; di < route.dirs.length; di++) {
        var arr = route.dirs[di];
        // 뒤에서부터 훑으며 「이 뒤에 목적지가 있는 가장 가까운 자리」를 들고 간다
        var nextDest = -1;
        for (var p = arr.length - 1; p >= 0; p--) {
          if (destSet[arr[p]]) { nextDest = p; continue; }
          if (nextDest < 0 || nextDest - p > maxStops) continue;
          var node = arr[p];
          var leg = { routeIdx: ri, dirIdx: di, fromPos: p, toPos: nextDest,
                      from: node, to: arr[nextDest], stops: nextDest - p,
                      kind: route.kind, vehicle: route.vehicle,
                      rideMinutes: (nextDest - p) * route.minutes, offsetMinutes: 0 };
          var info = opt.loadFor ? opt.loadFor(leg) : null;
          if (!info || info.notRunning || !info.segments || !info.segments.length) continue;
          var r = M.ride({ vehicle: route.vehicle, alpha: opt.alpha,
                           segments: info.segments, freeSeats: info.freeSeats });
          if (r.pBoard < minP) continue;
          if (leg.rideMinutes > maxRide) continue;
          /* 한두 정거장 타려고 자리를 찾아 가는 것은 뜻이 없다 — 그 거리면 걸어간다.
             실제로 「강남역에서 166m 떨어진 정류장에서 1정거장」이 1등으로 올라왔다. */
          if (leg.stops < (opt.minStops || 3)) continue;
          // 목적지에서 얼마나 떨어진 자리인가 — 덜 거슬러 올라가는 쪽이 낫다
          var far = Infinity;
          for (i = 0; i < dests.length; i++) far = Math.min(far, T.haversine(nodes[node], nodes[dests[i]]));
          var veh = M.VEHICLES[route.vehicle];
          var item = {
            routeId: route.id, routeName: route.name, kind: route.kind, dirIdx: di,
            headsign: nodes[arr[arr.length - 1]].name + ' 방면',
            direction: leg.direction || null,
            boardNode: node, boardName: nodes[node].name,
            arriveName: nodes[arr[nextDest]].name,
            stops: leg.stops, rideMinutes: leg.rideMinutes,
            pBoard: r.pBoard, metersFromDest: far,
            seats: veh.seats, emptySeats: M.emptySeats(info.segments[0].load, veh.seats),
            seatText: M.describeSeats(info.segments[0].load, veh.seats),
            boardMinutes: info.boardMinutes, estimated: info.estimated
          };
          // 같은 노선·방향은 **목적지에 가장 가까운 자리** 하나만 (거슬러 더 올라갈 필요가 없다)
          var key = route.id + '|' + di;
          if (!bestAt[key] || far < bestAt[key].metersFromDest) bestAt[key] = item;
        }
      }
    }
    for (var k in bestAt) out.push(bestAt[k]);
    out.sort(function (a, b) { return a.metersFromDest - b.metersFromDest; });
    return out.slice(0, opt.limit || 20);
  }

  /* ── 앉아 가는 차 찾기 (길찾기의 반대) ────────────────────────────────
     길찾기는 「A 에서 B 로」를 묻고 서서 가는 시간으로 줄 세운다.
     이건 반대다 — **「지금 여기서 앉아 갈 수 있는 차가 무엇이냐」**를 묻는다.
     앉아서 가려고 조금 돌아가거나 기다릴 수 있는 사람에게 필요한 화면이다.

     opt = {graph, index, fromNodes, loadFor, walkSpeed, toNodes(선택), minP, limit}
     돌려주는 것: [{routeName, kind, headsign, direction, boardName, walkMeters,
                    pBoard, pLater, seats, emptySeats, stops, toName, reaches}] */
  function seatableRoutes(opt) {
    var idx = opt.index, out = [], seen = Object.create(null);
    var destSet = Object.create(null), hasDest = false, i;
    for (i = 0; i < (opt.toNodes || []).length; i++) { destSet[opt.toNodes[i].node] = 1; hasDest = true; }

    for (i = 0; i < (opt.fromNodes || []).length; i++) {
      var node = opt.fromNodes[i].node, meters = opt.fromNodes[i].meters;
      var at = idx.byNode[node];
      if (!at) continue;
      for (var a = 0; a < at.length; a++) {
        var ri = at[a][0], di = at[a][1], pos = at[a][2];
        var route = idx.routes[ri];
        var key = route.id + '|' + di;
        if (seen[key]) continue;                    // 같은 노선·같은 방향은 한 번만
        var arr = route.dirs[di];
        if (pos + 1 >= arr.length) continue;        // 종점이라 더 갈 데가 없다
        var far = Math.min(arr.length - 1, pos + 12);
        var leg = { routeIdx: ri, dirIdx: di, fromPos: pos, toPos: far,
                    from: node, to: arr[far], stops: far - pos,
                    kind: route.kind, vehicle: route.vehicle,
                    rideMinutes: (far - pos) * route.minutes,
                    offsetMinutes: T.walkMinutes(meters, opt.walkSpeed) };
        var info = opt.loadFor ? opt.loadFor(leg) : null;
        if (!info || info.notRunning || !info.segments || !info.segments.length) continue;
        var r = M.ride({ vehicle: route.vehicle, alpha: opt.alpha,
                         segments: info.segments, freeSeats: info.freeSeats });
        if (r.pBoard < (opt.minP === undefined ? 0.5 : opt.minP)) continue;
        seen[key] = 1;
        var veh = M.VEHICLES[route.vehicle];
        // 도착지를 정해 뒀으면 그 쪽으로 가는지도 알려 준다(거르지는 않는다 — 고르는 건 사람이다)
        var reaches = false;
        if (hasDest) for (var p = pos + 1; p < arr.length; p++) if (destSet[arr[p]]) { reaches = true; break; }
        out.push({
          routeId: route.id, routeName: route.name, kind: route.kind, dirIdx: di,
          direction: leg.direction || null,
          headsign: idx.nodes[arr[arr.length - 1]].name + ' 방면',
          boardNode: node, boardName: idx.nodes[node].name,
          walkMeters: meters, walkMinutes: T.walkMinutes(meters, opt.walkSpeed),
          pBoard: r.pBoard, pLater: Math.max(0, r.pSeated - r.pBoard),
          seats: veh.seats, emptySeats: M.emptySeats(info.segments[0].load, veh.seats),
          seatText: M.describeSeats(info.segments[0].load, veh.seats),
          stops: leg.stops, toName: idx.nodes[arr[far]].name,
          boardMinutes: info.boardMinutes, estimated: info.estimated,
          reaches: reaches
        });
      }
    }
    /* 앉을 확률이 1순위. 같으면 덜 걷는 쪽 — 앉으려고 십 분을 더 걷는 것은 답이 아니다.
       도착지 쪽으로 가는 것이 있으면 그것부터 보여 준다. */
    out.sort(function (x, y) {
      if (hasDest && x.reaches !== y.reaches) return x.reaches ? -1 : 1;
      if (Math.abs(y.pBoard - x.pBoard) > 0.02) return y.pBoard - x.pBoard;
      return x.walkMeters - y.walkMeters;
    });
    return out.slice(0, opt.limit || 15);
  }

  /* ── 경유지 ──────────────────────────────────────────────────────────
     「A 들렀다 B 로」는 두 번의 길찾기를 이어 붙인 것이다.
     환승 2회 제한은 **구간마다** 적용된다 — 경유지에서 한 번 내렸다 타는 것은
     사용자가 원해서 내리는 것이지 갈아타는 게 아니기 때문이다.
     경유지에 머무는 시간은 더하지 않는다(얼마나 머물지는 사람마다 다르다).
     화면이 「경유」라고 분명히 표시한다. */
  function joinJourneys(parts) {
    var ok = (parts || []).filter(Boolean);
    if (!ok.length) return null;
    if (ok.length === 1) return ok[0];
    var legs = [], total = 0, walk = 0, standing = 0, ride = 0, later = 0, i;
    for (i = 0; i < ok.length; i++) {
      var p = ok[i];
      for (var k = 0; k < p.legs.length; k++) {
        var leg = p.legs[k];
        if (k === 0 && i > 0) leg.afterVia = true;      // 경유지에서 다시 타는 구간
        // 앞 구간에 쓴 시간만큼 뒤로 민다 — 뒤 구간은 그만큼 늦게 탄다
        leg.offsetMinutes = (leg.offsetMinutes || 0) + total;
        legs.push(leg);
      }
      total += p.totalMinutes; walk += p.walkMinutes;
      standing += p.standingMinutes; ride += p.rideMinutes || 0;
      later += (p.pLater || 0) * (p.rideMinutes || 0);
    }
    var wsum = 0;
    for (i = 0; i < legs.length; i++) {
      var pb = typeof legs[i].pSeated === 'number' && !isNaN(legs[i].pSeated) ? legs[i].pSeated : 0;
      wsum += pb * legs[i].rideMinutes;
    }
    var out = {
      legs: legs, parts: ok, via: true,
      transfers: ok.reduce(function (a, p) { return a + p.transfers; }, 0),
      totalMinutes: total, walkMinutes: walk, rideMinutes: ride,
      standingMinutes: standing,
      startWalkMeters: ok[0].startWalkMeters, endWalkMeters: ok[ok.length - 1].endWalkMeters,
      startWalkWalked: ok[0].startWalkWalked, endWalkWalked: ok[ok.length - 1].endWalkWalked,
      pSeated: ride > 0 ? wsum / ride : 1,
      pLater: ride > 0 ? later / ride : 0,
      notRunning: ok.some(function (p) { return p.notRunning; })
    };
    out.seatChance = M.seatChanceJourney(out.pSeated);   // 경유지를 이은 것도 여정이다
    out.seatPhrase = M.seatPhrase(out.pSeated);
    return out;
  }

  /* 구간별 후보 목록들 → 이어 붙인 여정들. 각 구간에서 위 topK 개만 쓴다
     (전부 조합하면 구간 셋에 1,000가지가 넘는다). */
  function combineVia(lists, topK) {
    var K = topK || 3;
    var acc = [[]];
    for (var i = 0; i < lists.length; i++) {
      var picks = (lists[i] || []).slice(0, K);
      if (!picks.length) return [];
      var next = [];
      for (var a = 0; a < acc.length; a++)
        for (var b = 0; b < picks.length; b++) next.push(acc[a].concat([picks[b]]));
      acc = next;
    }
    return acc.map(joinJourneys).filter(Boolean);
  }

  /* 정렬 — 1순위 서서 가는 시간, 동점이면 총 소요시간. 문구도 함께 온다. */
  /* 정렬하기 전에 **그 시각에 안 다니는 경로를 뺀다.** 남는 게 없으면 그때는 돌려주되
     notRunning 을 달아 화면이 「지금은 다니지 않습니다」라고 말할 수 있게 한다. */
  /* 「너무 돌아가는 길」의 경계.
     앉아 가는 것이 목적이라도 한계는 있다 — 실측에서 **64분이면 갈 길을 201분**짜리로
     안내하고 있었다(서서 가는 시간 0분이라는 이유로). 사양서 1.2 의 예시도
     41분 대 52분(1.27배)이지 세 배가 아니다.
     짧은 길은 비율만으로 자르면 야박하므로 「+25분」 쪽도 함께 본다. */
  var DETOUR_MAX = 1.6, DETOUR_ADD = 25;

  function prune(journeys) {
    if (journeys.length < 2) return journeys;
    var fastest = Infinity, i;
    for (i = 0; i < journeys.length; i++)
      if (journeys[i].totalMinutes < fastest) fastest = journeys[i].totalMinutes;
    var cap = Math.max(fastest * DETOUR_MAX, fastest + DETOUR_ADD);
    var kept = journeys.filter(function (j) { return j.totalMinutes <= cap; });
    return kept.length ? kept : journeys;
  }

  function rank(journeys) {
    var running = journeys.filter(function (j) { return !j.notRunning; });
    if (running.length) journeys = running;
    journeys = prune(journeys);
    var sorted = M.sortRoutes(journeys);
    if (sorted.length) sorted[0].badge = M.SORT_BADGE;      // 「가장 적게 서서 가는 길」
    var fastest = sorted.slice().sort(function (a, b) { return a.totalMinutes - b.totalMinutes; })[0];
    if (fastest && fastest !== sorted[0]) fastest.badge = '가장 빨리 가는 길';
    return sorted.slice(0, MAX_RESULTS);
  }

  return {
    WALK_RADIUS_M: WALK_RADIUS_M, TRANSFER_WALK_MIN: TRANSFER_WALK_MIN, WAIT_MIN: WAIT_MIN,
    WALK_ONLY_MAX_M: WALK_ONLY_MAX_M, WALK_ONLY_MAX_MIN: WALK_ONLY_MAX_MIN,
    buildIndex: buildIndex, nearby: nearby, nearbyMixed: nearbyMixed,
    prune: prune, findNodes: findNodes,
    joinJourneys: joinJourneys, combineVia: combineVia, seatableRoutes: seatableRoutes,
    boardingPointsTo: boardingPointsTo,
    ridesFrom: ridesFrom, backOne: backOne,
    search: search, evaluate: evaluate, rank: rank
  };
});
