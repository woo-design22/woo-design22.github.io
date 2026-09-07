/* geocode.js — 「어디서 어디로」를 좌표로 바꾼다.
   브라우저 window.SeatGeo / Node module.exports. 의존: route.js(로컬 검색), transfer.js(거리).

   ★ 왜 두 갈래인가 ★
   사양서 2.3 이 **오프라인 동작**을 못박았다. 그런데 주소 전체를 담은 자료는
   인증키 없이 못 받는다(도로명주소 건물DB 는 승인이 필요하다). 그래서 나눴다.

     ① 로컬 — 정류장·역 이름 8,886곳. 즉시, 오프라인, 항상 된다.
        서울 정류장 이름에는 아파트·학교·시장·랜드마크가 이미 잔뜩 들어 있다
        (「월계사슴아파트3단지」·「인덕대학교후문입구」·「북서울꿈의숲」).
     ② 온라인 — 임의의 주소·건물. Photon/Nominatim(OpenStreetMap 계열, 인증키 불필요).
        느리거나 막힐 수 있고, 오프라인이면 아예 없다.

   **시간 순서와 화면 차례는 다르다** — 헷갈리지 말 것.
     · 시간: ①이 먼저 그려진다(즉시). ②는 뒤늦게 도착한다. 안 와도 앱은 그대로 돈다.
     · 차례: ②(주소·상호)가 **위**, ①(정류장·역)이 아래. 2026-09-04 사용자 지시 —
       「국립중앙박물관」을 쳤을 때 그 앞 버스정류장이 먼저 나오면 안 된다.

   ★ 이 파일은 네트워크를 부르지 않는다 ★
   engine/ 은 순수 함수만 둔다는 규칙(CLAUDE.md §1) 때문이다.
   실제 fetch 는 화면이 하고, 여기는 **주소 만들기·결과 정규화·순위 매기기**만 한다.
   그래야 시험이 인터넷 없이 돈다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./route.js'), require('./transfer.js'));
  else root.SeatGeo = factory(root.SeatRoute, root.SeatTransfer);
})(typeof self !== 'undefined' ? self : this, function (R, T) {
  'use strict';

  /* 서비스권 상자 (D-88) — 서울 상자 하나는 경기 확장(D-85) 때 이미 거짓말이 됐다
     (산본·정자를 「서울 밖」이라 했다). 전철망이 있는 권역만 상자로 연다. */
  var AREAS = [
    { name: '수도권',        minLat: 36.70, maxLat: 38.35, minLon: 126.35, maxLon: 127.95 },
    { name: '부산·울산·김해', minLat: 35.00, maxLat: 35.65, minLon: 128.75, maxLon: 129.45 },
    { name: '대구·경산·구미', minLat: 35.60, maxLat: 36.25, minLon: 128.25, maxLon: 128.95 },
    { name: '광주',          minLat: 35.05, maxLat: 35.25, minLon: 126.70, maxLon: 127.00 },
    { name: '대전',          minLat: 36.20, maxLat: 36.50, minLon: 127.25, maxLon: 127.55 }
  ];
  var CENTER = { lat: 37.5665, lon: 126.9780 };

  function areaOf(lat, lon) {
    for (var i = 0; i < AREAS.length; i++) {
      var a = AREAS[i];
      if (lat >= a.minLat && lat <= a.maxLat && lon >= a.minLon && lon <= a.maxLon) return a.name;
    }
    return null;
  }
  // 이름은 역사적으로 inSeoul 이지만 뜻은 「서비스권 안」이다 — 부르는 곳이 많아 이름을 남긴다.
  function inSeoul(lat, lon) { return areaOf(lat, lon) !== null; }

  // ── ① 로컬 (정류장·역) ──────────────────────────────────────────────────
  function local(graph, q, limit, near) {
    return R.findNodes(graph, q, limit || 8, near).map(function (h) {
      var base = h.kinds.indexOf('subway') >= 0
        ? (h.kinds.length > 1 ? '지하철역 · 버스정류장' : '지하철역') : '버스정류장';
      // 동명 지명(중구청은 서울 정류장이자 대전 지하철역이다) — 지방이면 권역을 밝힌다 (D-88)
      var area = areaOf(h.lat, h.lon);
      return {
        name: h.name,
        detail: base + (area && area !== '수도권' ? ' · ' + area : ''),
        lat: h.lat, lon: h.lon, node: h.node, source: 'local'
      };
    });
  }

  // ── ② 온라인 주소 (화면이 이 주소로 fetch 한다) ─────────────────────────
  /* Photon 은 글자를 치는 중에 쓰기 좋고(빠르다), Nominatim 은 주소를 정확히 짚는다.
     둘 다 OpenStreetMap 자료이고 인증키가 없다. 대신 **출처를 화면에 밝혀야 한다.** */
  function photonUrl(q) {
    return 'https://photon.komoot.io/api/?limit=8&lang=default'
      + '&lat=' + CENTER.lat + '&lon=' + CENTER.lon
      + '&q=' + encodeURIComponent(q);
  }
  function nominatimUrl(q) {
    return 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8'
      + '&accept-language=ko&countrycodes=kr&q=' + encodeURIComponent(q);
  }
  var ATTRIBUTION = '주소 검색 © OpenStreetMap 기여자 (Photon · Nominatim)';

  function fromPhoton(json) {
    var f = (json && json.features) || [], out = [], i;
    for (i = 0; i < f.length; i++) {
      var p = f[i].properties || {}, c = (f[i].geometry || {}).coordinates || [];
      var lat = c[1], lon = c[0];
      if (typeof lat !== 'number' || !inSeoul(lat, lon)) continue;
      var where = p.district || p.city || '';
      var addr = p.street ? (p.street + (p.housenumber ? ' ' + p.housenumber : '')) : '';
      /* 번지까지 있으면 **주소를 제목으로** 올린다.
         「종암로 128」을 쳤는데 「탕화쿵푸 종암사거리점」이 제목으로 뜨면,
         맞는 좌표인데도 엉뚱한 데를 찾은 것처럼 보인다. 찾은 대로 보여줘야 한다. */
      if (addr && p.housenumber) {
        out.push({ name: addr, detail: [p.name, where].filter(Boolean).join(' · ') || '주소',
                   lat: lat, lon: lon, source: 'online' });
      } else {
        out.push({ name: p.name || addr || '이름 없는 곳',
                   detail: [addr, where].filter(Boolean).join(' · ') || '주소',
                   lat: lat, lon: lon, source: 'online' });
      }
    }
    return out;
  }

  function fromNominatim(json) {
    var arr = json || [], out = [], i;
    for (i = 0; i < arr.length; i++) {
      var lat = parseFloat(arr[i].lat), lon = parseFloat(arr[i].lon);
      if (!(lat && lon) || !inSeoul(lat, lon)) continue;
      var full = String(arr[i].display_name || '');
      var parts = full.split(',').map(function (s) { return s.trim(); });
      out.push({
        name: parts[0] || full,
        detail: parts.slice(1, 3).join(' · ') || '주소',
        lat: lat, lon: lon, source: 'online'
      });
    }
    return out;
  }

  // ── 합치기 ──────────────────────────────────────────────────────────────
  /* ★ 주소·상호가 위, 정류장·역이 아래 ★ (2026-09-04 사용자 지시)
     「국립중앙박물관」을 쳤을 때 **「국립중앙박물관.용산가족공원」이라는 버스정류장**이 먼저 나왔다.
     찾는 것은 박물관이지 그 앞 정류장이 아니다. 정류장 이름에 지명이 섞여 있어서 생기는 일이라
     순서를 뒤집는다.

     시간 순서와 헷갈리지 말 것 — **화면에는 로컬이 여전히 먼저 그려진다**(즉시·오프라인).
     여기서 정하는 것은 온라인 결과가 도착한 뒤의 **최종 차례**다.

     같은 곳이 양쪽에 잡히면(「강남역」) 자리는 위쪽을 쓰되 **알맹이는 로컬 것을 남긴다** —
     우리가 아는 좌표이고 「지하철역·버스정류장」이라는 쓸모 있는 부연이 붙어 있다. */
  function sameSpot(a, b) {
    var key = function (x) { return x.name.replace(/\s+/g, '').replace(/역$/, ''); };
    return T.haversine(a, b) < 250 && key(a) === key(b);
  }

  /* 다만 **친 이름과 정확히 맞는 역·정류장은 맨 위**다.
     주소를 먼저 올렸더니 「교대」를 쳤을 때 「서초대로 지하294」라는 도로 주소가 1등이 됐다.
     「교대」라고 친 사람은 교대역을 찾는 것이지 그 앞 지하도로를 찾는 게 아니다.
     반대로 「국립중앙박물관」은 로컬에 「국립중앙박물관.용산가족공원」(정류장)뿐이라
     정확히 맞지 않으므로 주소가 위로 간다 — 두 요구가 다 지켜진다. */
  function canonQ(s) { return String(s || '').replace(/\s+/g, '').replace(/역$/, ''); }

  function merge(localHits, onlineHits, limit, q) {
    var loc = (localHits || []).slice();
    var on = onlineHits || [];
    var out = [], used = {}, i, j;
    var want = canonQ(q);

    // ① 친 이름과 정확히 맞는 로컬부터
    if (want) {
      for (j = 0; j < loc.length; j++) {
        if (!used[j] && canonQ(loc[j].name) === want) { used[j] = 1; out.push(loc[j]); }
      }
    }
    // ② 주소·상호
    for (i = 0; i < on.length; i++) {
      var swapped = null;
      for (j = 0; j < loc.length; j++) {
        if (!used[j] && sameSpot(loc[j], on[i])) { swapped = loc[j]; used[j] = 1; break; }
      }
      if (!swapped && want && canonQ(on[i].name) === want &&
          out.some(function (o) { return canonQ(o.name) === want; })) continue;   // ①과 겹치면 생략
      out.push(swapped || on[i]);
    }
    // ③ 나머지 정류장·역
    for (j = 0; j < loc.length; j++) if (!used[j]) out.push(loc[j]);
    return out.slice(0, limit || 12);
  }

  /* 고른 좌표에서 탈 수 있는 곳까지. 없으면 왜 없는지 말해 준다. */
  function accessPoints(graph, place, radiusM, limit) {
    var got = R.nearby(graph.nodes, place.lat, place.lon, radiusM || 900, limit || 12);
    return got;
  }

  function reason(graph, place) {
    if (!inSeoul(place.lat, place.lon))
      return '서비스 지역(수도권·부산·대구·광주·대전) 밖이라 답할 수 없습니다.';
    if (!accessPoints(graph, place, 1200, 1).length)
      return '1.2km 안에 정류장이나 역이 없습니다.';
    return null;
  }

  return {
    CENTER: CENTER, ATTRIBUTION: ATTRIBUTION,
    inSeoul: inSeoul, areaOf: areaOf, AREAS: AREAS, local: local,
    photonUrl: photonUrl, nominatimUrl: nominatimUrl,
    fromPhoton: fromPhoton, fromNominatim: fromNominatim,
    merge: merge, accessPoints: accessPoints, reason: reason
  };
});
