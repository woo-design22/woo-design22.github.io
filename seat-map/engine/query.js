/* query.js — 필터해서 한 줄의 시계열을 뽑는다.
   브라우저 window.SeatQuery / Node module.exports. 의존: interp.js (같이 불러야 한다).

   ★ 요구(2026-09-04) ★
   역별 · 노선별 · 버스정류장별 · 버스노선별 · 시간별 · 10분단위 · 평일/주말별로
   **각각 따로** 걸러져야 한다. 그래서 축을 미리 합쳐 두지 않았고, 여기서 조합만 한다.

   축이 살아 있는 곳
     지하철 혼잡도  호선 · 역 · 방향(상/하선) · 요일 · 30분
     지하철 승하차  호선 · 역 · 승/하차 · 요일 · 1시간
     버스 승하차    노선 · 정류장 · 승/하차 · 1시간   ← **요일 축이 없다**(원천이 월 집계)

   10분 단위는 저장하지 않고 여기서 만든다(사양서 3.3). 그래서 보간값에는 반드시
   출처 문구(note)가 따라 나간다 — 화면이 그걸 그대로 띄운다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./interp.js'));
  else root.SeatQuery = factory(root.SeatInterp);
})(typeof self !== 'undefined' ? self : this, function (I) {
  'use strict';

  var DAY_TYPES = ['weekday', 'saturday', 'sunday'];
  var DAY_NAMES = { weekday: '평일', saturday: '토요일', sunday: '일요일·공휴일' };

  function esc(s) { return String(s === undefined || s === null ? '' : s); }

  // ── 키 만들기 ────────────────────────────────────────────────────────────
  /* 혼잡도: "호선|역|요일" 또는 "호선|역|요일|방향". 역을 안 고르면 '전체'(그 호선 피크). */
  function congestionKey(f) {
    var k = esc(f.line) + '|' + (f.station || '전체') + '|' + (f.dayType || 'weekday');
    return f.direction ? k + '|' + f.direction : k;
  }
  /* 승하차: "호선|역|요일|승차" */
  function rideKey(f) {
    return esc(f.line) + '|' + (f.station || '전체') + '|' + (f.dayType || 'weekday') + '|' + (f.kind || '승차');
  }

  // ── 한 줄 뽑기 ───────────────────────────────────────────────────────────
  /* doc  = congestion.json / ride.json 처럼 {startMinutes, slotMinutes, grid} 를 가진 것
     key  = 위에서 만든 키
     opt  = {stepMinutes, from, to}
     돌려주는 것 = {key, found, slotMinutes, stepMinutes, note, points:[{minutes,value,perStep}]}

     **perStep 을 따로 주는 이유**: 승하차는 「그 1시간 동안의 인원」이다.
     10분으로 보간한 값은 그대로 두면 여전히 시간당 인원이라 6배 커 보인다.
     value = 원천 단위(시간당), perStep = 그 눈금 동안의 인원. 화면이 골라 쓴다.
     혼잡도는 비율이라 둘이 같다(rate 로 구분). */
  function seriesFrom(doc, key, opt) {
    var o = opt || {};
    var grid = (doc && doc.grid) ? doc.grid[key] : null;
    var slot = (doc && doc.slotMinutes) || 30;
    var start = (doc && doc.startMinutes) || 0;
    var step = o.stepMinutes || 10;
    var rate = o.rate !== false;                      // false 면 합계량(승하차)
    var out = { key: key, found: !!grid, slotMinutes: slot, stepMinutes: step,
                note: I.noteFor(slot), points: [] };
    if (!grid || !grid.length) return out;

    var end = start + (grid.length - 1) * slot;
    var from = o.from === undefined ? start : Math.max(start, o.from);
    var to = o.to === undefined ? end : Math.min(end, o.to);
    for (var t = from; t <= to + 1e-9; t += step) {
      var v = I.valueAt(grid, { slotMinutes: slot, startMinutes: start, atMinutes: t });
      out.points.push({ minutes: t, value: v, perStep: rate ? v : v * step / slot });
    }
    return out;
  }

  // ── 지하철 ───────────────────────────────────────────────────────────────
  /* f = {measure:'congestion'|'ride', line, station, direction, dayType, kind, stepMinutes, from, to} */
  function subway(docs, f) {
    var m = f.measure || 'congestion';
    if (m === 'ride') {
      var r = seriesFrom(docs.ride, rideKey(f), { stepMinutes: f.stepMinutes, from: f.from, to: f.to, rate: false });
      r.measure = 'ride'; r.unit = '명'; r.label = labelOf(f);
      return r;
    }
    // 방향을 골랐는데 그 키가 없으면 방향 없는 키(둘 중 더 붐비는 쪽)로 물러난다.
    var key = congestionKey(f);
    var got = seriesFrom(docs.congestion, key, { stepMinutes: f.stepMinutes, from: f.from, to: f.to });
    if (!got.found && f.direction) {
      got = seriesFrom(docs.congestion, congestionKey({ line: f.line, station: f.station, dayType: f.dayType }),
                       { stepMinutes: f.stepMinutes, from: f.from, to: f.to });
      got.fellBack = '그 방향 자료가 없어 두 방향 중 더 붐비는 쪽을 보여준다';
    }
    got.measure = 'congestion'; got.unit = '%'; got.label = labelOf(f);
    return got;
  }

  // ── 버스 ────────────────────────────────────────────────────────────────
  /* routeDoc = data/bus/routes/<노선>.json
     f = {stopId | ars | station, kind, stepMinutes}
     정류장을 안 고르면 그 노선 전 정류장의 합. */
  function bus(routeDoc, f) {
    var kind = f.kind || '승차';
    var field = kind === '하차' ? 'off' : 'on';
    var stops = (routeDoc && routeDoc.stops) || [];
    var picked = null, i;

    if (f.stopId || f.ars || f.station) {
      for (i = 0; i < stops.length; i++) {
        var s = stops[i];
        if ((f.stopId && s.stopId === f.stopId) || (f.ars && s.ars === f.ars) ||
            (f.station && s.name === f.station)) { picked = s; break; }
      }
    }

    var arr;
    if (picked) {
      arr = picked[field];
    } else if (stops.length) {
      arr = new Array((stops[0][field] || []).length).fill(0);
      for (i = 0; i < stops.length; i++) {
        var v = stops[i][field] || [];
        for (var h = 0; h < arr.length; h++) arr[h] += v[h] || 0;
      }
    } else {
      arr = null;
    }

    var doc = {
      startMinutes: (routeDoc && routeDoc.startMinutes) || 0,
      slotMinutes: (routeDoc && routeDoc.slotMinutes) || 60,
      grid: { x: arr }
    };
    var out = seriesFrom(doc, 'x', { stepMinutes: f.stepMinutes, from: f.from, to: f.to, rate: false });
    out.measure = 'ride'; out.unit = '명';
    out.route = routeDoc && routeDoc.route;
    out.station = picked ? picked.name : '노선 전체';
    out.label = (routeDoc && routeDoc.route ? routeDoc.route + '번 ' : '') + out.station + ' ' + kind;
    // 원천이 월 집계라 요일 축이 없다. 화면이 「평일」을 고르고 있어도 같은 값이 나온다 — 반드시 알린다.
    out.noDayType = '버스 승하차는 월 집계라 평일/주말 구분이 없다 (T-DATA 키가 있어야 요일별이 된다)';
    return out;
  }

  function labelOf(f) {
    var bits = [];
    if (f.line) bits.push(f.line + '호선');
    bits.push(f.station || '전체');
    if (f.direction) bits.push(f.direction);
    bits.push(DAY_NAMES[f.dayType || 'weekday']);
    if (f.measure === 'ride') bits.push(f.kind || '승차');
    return bits.join(' · ');
  }

  // ── 요약 ────────────────────────────────────────────────────────────────
  /* 한 줄에서 사람이 읽을 값만 뽑는다. 화면의 「가장 붐비는 시각」이 이걸 쓴다. */
  function summarize(s) {
    if (!s || !s.points.length) return null;
    var mx = s.points[0], mn = s.points[0], sum = 0;
    for (var i = 0; i < s.points.length; i++) {
      var p = s.points[i];
      if (p.value > mx.value) mx = p;
      if (p.value < mn.value) mn = p;
      sum += p.perStep;
    }
    return {
      peak: { minutes: mx.minutes, value: mx.value, at: I.hhmm(mx.minutes) },
      low: { minutes: mn.minutes, value: mn.value, at: I.hhmm(mn.minutes) },
      total: sum, avg: sum / s.points.length
    };
  }

  /* 필터 조합 여러 개를 한 번에 — 「평일 vs 토요일」처럼 나란히 놓고 보려는 것. */
  function compare(docs, list) {
    return list.map(function (f) { return subway(docs, f); });
  }

  // ── 드롭다운 채우기 ──────────────────────────────────────────────────────
  /* 앞의 선택에 따라 뒤의 선택지가 줄어든다(호선을 고르면 그 호선의 역만). */
  function optionsFor(facets, sel) {
    var s = sel || {};
    var subwayLines = ((facets && facets.subway && facets.subway.lines) || []);
    var line = subwayLines.filter(function (l) { return l.line === s.line; })[0];
    return {
      lines: subwayLines.map(function (l) { return { id: l.line, name: l.name }; }),
      stations: line ? line.stations.slice() : [],
      directions: ((facets && facets.subway && facets.subway.directions) || []).slice(),
      dayTypes: DAY_TYPES.map(function (d) { return { id: d, name: DAY_NAMES[d] }; }),
      steps: ((facets && facets.steps) || [{ minutes: 10, name: '10분' }]).slice(),
      busRoutes: ((facets && facets.bus && facets.bus.routes) || []).slice()
    };
  }

  /* 정류장 이름·번호로 찾기. 12,500개라 화면이 전부 그릴 수 없어 검색이 필수다. */
  function findStops(index, q, limit) {
    var text = String(q || '').replace(/\s+/g, '');
    var lim = limit || 40;
    if (!text) return [];
    var stops = (index && index.stops) || [];
    var out = [];
    for (var i = 0; i < stops.length && out.length < lim; i++) {
      var st = stops[i];
      if (st.name.replace(/\s+/g, '').indexOf(text) >= 0 || st.ars.indexOf(text) === 0) out.push(st);
    }
    return out;
  }

  /* 노선 찾기. **번호가 앞에서 맞는 것을 먼저 준다** — 「6」을 치면 6번·600번을 기대하지,
     이름 어딘가에 6이 들어간 노선을 기대하지 않는다. */
  function findRoutes(index, q, limit) {
    var text = String(q || '').replace(/\s+/g, '');
    var lim = limit || 40;
    var routes = (index && index.routes) || [];
    if (!text) return routes.slice(0, lim);
    var exact = [], prefix = [], loose = [];
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.route === text) exact.push(r);
      else if (r.route.indexOf(text) === 0) prefix.push(r);
      else if (r.name.replace(/\s+/g, '').indexOf(text) >= 0) loose.push(r);
    }
    return exact.concat(prefix, loose).slice(0, lim);
  }

  return {
    DAY_TYPES: DAY_TYPES, DAY_NAMES: DAY_NAMES,
    congestionKey: congestionKey, rideKey: rideKey,
    seriesFrom: seriesFrom, subway: subway, bus: bus,
    summarize: summarize, compare: compare,
    optionsFor: optionsFor, findStops: findStops, findRoutes: findRoutes
  };
});
