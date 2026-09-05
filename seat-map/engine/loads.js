/* loads.js — 경로의 한 구간 → 「그 차에 몇 명 타 있나」.
   route.js 의 evaluate() 에 물려 주는 다리다. 브라우저 window.SeatLoads / Node module.exports.
   의존: interp.js, sim-seoul.js.

   ★ 여기가 이 서비스에서 가장 조심할 자리다 ★
   원천은 전부 **역·정류장 단위 총량**(시간당 몇 명)인데, 착석 확률에 필요한 것은
   **차 한 대 안의 인원**이다. 그 사이를 「시간당 몇 대가 다니는가」로 나눠 건넌다.
   그 대수는 지금 **추정값**이다 — 지하철 열차시간표와 T-DATA 운행횟수는 인증키가 있어야 한다.
   그래서 값마다 `estimated: true` 를 달아 화면이 그대로 밝힐 수 있게 한다.
   추정을 숨기면 사양서 3.3 이 금지한 「UI에서 속이는 것」이 된다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./interp.js'), require('./sim-seoul.js'));
  else root.SeatLoads = factory(root.SeatInterp, root.SeatSim);
})(typeof self !== 'undefined' ? self : this, function (I, SIM) {
  'use strict';

  // ── 시간당 운행 대수 (추정) ──────────────────────────────────────────────
  var SUBWAY_CARS = 8;            // 서울 1~8호선은 대개 8칸(2·5호선 10칸 구간도 있다)
  function trainsPerHour(minutes) {
    var h = minutes / 60;
    if ((h >= 7 && h < 9.5) || (h >= 17.5 && h < 19.5)) return 20;   // 출퇴근 배차 약 3분
    if (h >= 6 && h < 23) return 12;                                  // 평시 약 5분
    return 7;                                                          // 첫·막차 무렵
  }
  /* ── 시간당 몇 대가 오는가 ────────────────────────────────────────────
     ★ 이 나누는 수가 두 배 틀리면 앉을 확률이 통째로 뒤집힌다 ★
     예전에는 종류별 상수(간선 10 × 첨두 1.4 = 14대/시 = 4.3분 배차)를 박아 두었는데,
     세 갈래 검산이 전부 「과다」를 가리켰다:
       · 서울시 인가대수(2026-01, 시내 7,383 + 마을 1,626 = 9,009대)로 역산하면
         옛 가정은 버스 15,972대를 요구한다 — 서울에 있는 것의 1.8배
       · 노선기본정보(OA-15262, 2024-04 인가) 실측 배차: 간선 중앙값 11분·지선 12분·마을 12분
         (옛 가정은 각각 6분·7.5분·5분으로 읽고 있었다)
       · 100번 실측 배차 10분 = 6대/시. 옛 가정 14대/시 → 재차인원이 절반으로 희석되어
         출근길 간선버스가 「2자리 비어 있습니다 68%」로 나왔다
     그래서 **노선별 인가 배차간격(route.headwayMin, 그래프에 실려 온다)이 있으면 그것을 쓰고**,
     없는 노선(2024 이후 신설·맞춤버스)만 아래 종류별 중앙값으로 물러난다.
     첨두 ×1.25 는 배차표가 출근시간에 압축되는 몫이다 — 1.4 를 곱하면
     인가대수로 낼 수 있는 상한(간선 8.3대/시)을 넘어 버린다. */
  var BUSES_PER_HOUR = { trunk: 5.5, branch: 5.0, village: 5.0, express: 4.0,
                         circular: 5.2, night: 2.5 };
  function busesPerHour(route, minutes) {
    var kind = typeof route === 'string' ? route : (route && route.kind);
    var hw = route && typeof route === 'object' ? route.headwayMin : null;
    var base = (hw && hw >= 3 && hw <= 60) ? 60 / hw
             : (BUSES_PER_HOUR[kind] === undefined ? 5 : BUSES_PER_HOUR[kind]);
    // 심야버스는 밤이 본업이다 — 시간대 배율을 얹으면 새벽 2시에 「거의 안 다닌다」가 된다.
    // 다니는 시각인지는 nightBusRunning 이 따로 가른다.
    if (kind === 'night') return base;
    var h = minutes / 60;
    if ((h >= 7 && h < 9.5) || (h >= 17.5 && h < 19.5)) return base * 1.25;
    if (h < 6 || h >= 23) return Math.max(1, base * 0.5);
    return base;
  }

  /* 승객이 평균 몇 정거장을 타는가(OD 감쇠) — **저장소 안 실측으로 보정한 값이다.**
     버스 자료에는 정류장별 승차와 하차가 둘 다 있으므로, 그대로 누적하면 감쇠 모형 없이
     재차 곡선이 나온다(승·하차 합이 15% 안에서 맞는 429개 방향, 08시).
     그 정답지와 대조한 「OD 최대재차 ÷ 실측 최대재차」 중앙값:
       L=15(옛 값): 간선 1.42 · 지선 1.35 — 재차를 40% 부풀린다
       L=6        : 간선 1.01 · 지선 1.04 · 마을 1.06 — 맞는다
     실측 평균 탑승 정거장: 간선 5.6 · 지선 5.2 · 마을 4.4.
     광역만 다르다 — 멀리 가는 차라 평균 12정거장쯤 타므로 따로 길게 둔다(표본 얇음). */
  var DECAY_STOPS = { village: 5, branch: 6, trunk: 6, night: 6, circular: 5, express: 20 };

  /* ── 내가 타는 차는 평균 차보다 붐빈다 (대기시간 역설) ───────────────────
     서울 시내버스는 정체로 배차가 불규칙하다(실사용 후기·나무위키 100번: "배차가 불규칙하며
     가축수송", "입석은 기본"). 앞차와 3분 벌어진 차는 비고 15분 벌어진 차는 미어터지는데,
     **승객은 벌어진 틈에 더 많이 쌓이므로 붐비는 차에 탈 확률이 높다.**
     간격의 변동계수를 CV 라 하면 승객이 겪는 평균 재차는 차량 평균의 (1+CV²)배다 —
     도심 혼합차로의 CV 0.5 를 잡아 **1.25배**로 둔다(보수적인 쪽 — 실측 CV 는 0.5~0.75).
     재차·하차·승차에 똑같이 곱한다(「승객이 겪는 그 차」의 세계로 통째로 옮기는 것).
     지하철에는 안 곱한다 — 열차는 배차가 규칙적이라(CV≈0.1) 이 효과가 거의 없다.
     이 근사의 정답은 T-DATA 의 차량별 재차인원이다. 키가 나오면 이 상수를 걷어낸다. */
  var RIDER_LOAD_FACTOR = 1.25;

  function gridValue(doc, key, minutes) {
    var g = doc && doc.grid && doc.grid[key];
    if (!g) return null;
    return I.valueAt(g, { slotMinutes: doc.slotMinutes || 30,
                          startMinutes: doc.startMinutes || 300, atMinutes: minutes });
  }

  /* 자료 격자 밖의 시각인가. 밖이면 valueAt 이 양 끝값으로 **조용히 잘라** 쓴다 —
     05:00 을 물으면 05:30 값이 나온다. 그 사실을 숨기면 없는 정보를 아는 척하는 것이다. */
  function outOfRange(doc, minutes) {
    if (!doc) return null;
    var start = doc.startMinutes || 300;
    var end = start + ((doc.slots || (doc.grid && doc.grid[Object.keys(doc.grid)[0]] || []).length) - 1) * (doc.slotMinutes || 30);
    if (minutes < start) return { before: true, at: start };
    if (minutes > end) return { before: false, at: end };
    return null;
  }

  /* 그 구간을 실제로 타는 시각 = 출발 시각 + 여기까지 걸린 시간 */
  function legMinutes(ctx, leg) {
    return (ctx.minutes || 0) + (leg && leg.offsetMinutes ? leg.offsetMinutes : 0);
  }

  // ── 지하철 ──────────────────────────────────────────────────────────────
  /* 혼잡도(정원 대비 %)가 그대로 「칸 안의 인원」을 준다 — 이건 추정이 아니다.
     하차 인원만 「역 전체 시간당」이라 열차 수·칸 수로 나눠 칸 단위로 바꾼다(추정). */
  /* ★ 방향을 반드시 가려야 한다 ★
     실측(4호선 미아 평일 08:00): **상선 15% / 하선 103%** — 일곱 배 차이다.
     둘 중 큰 값을 쓰면 한산한 방향으로 가는 사람에게도 「못 앉는다」고 말하게 된다.

     ★ 그런데 규칙을 손으로 박으면 안 된다 ★
     처음엔 「dirs[0](번호 증가) = 하선」으로 못 박았는데 **1호선에서 뒤집혀 있었고**
     **2호선은 상선/하선이 아니라 내선/외선**이라 아예 안 맞아 늘 큰 값으로 물러났다.
     그래서 pipeline/build_graph.py 가 자료로 판정해 `route.dirLabels` 에 넣어 둔다
     (진행 방향의 재차인원 증감과 승차-하차의 상관을 본다). 여기서는 그걸 읽기만 한다.
     저장된 값이 없을 때만 일반 규칙으로 물러난다. */
  function dirName(route, dirIdx) {
    if (route && route.dirLabels && route.dirLabels[dirIdx]) return route.dirLabels[dirIdx];
    return dirIdx === 1 ? '상선' : '하선';
  }

  function subwaySegments(ctx, leg, route) {
    var line = route.line || String(route.id).replace(/^S/, '');
    var names = route.stops && route.stops[leg.dirIdx];
    if (!names) return null;
    var cap = 160, minutes = legMinutes(ctx, leg), day = ctx.dayType || 'weekday';
    /* ★ 자료 범위가 곧 운행 시간이다 (D-81) ★
       혼잡도는 첫차(05:30)부터 막차 언저리(자정 넘어 24:30)까지만 있다 — 그건 공백이
       아니라 그 밖에는 열차가 없다는 뜻이다. 40분 넘게 벗어나면 안 다닌다고 말한다.
       (02시 검색에 지하철 넷이 「첫차가 없을 수 있습니다」 딱지로 나오던 것을 끊는다.
        자정 직후 00~03시는 하루의 연장으로 계산한다 — 00:30 막차 시간대는 살아 있어야 한다.) */
    if (ctx.congestion && ctx.congestion.startMinutes !== undefined) {
      var svc0 = ctx.congestion.startMinutes;
      var svc1 = svc0 + ((ctx.congestion.slots || 39) - 1) * (ctx.congestion.slotMinutes || 30);
      var effMin = minutes < 180 ? minutes + 1440 : minutes;
      if (effMin < svc0 - 40 || effMin > svc1 + 40)
        return { notRunning: true, why: '그 시각에는 지하철이 다니지 않는다' };
    }
    var oor = outOfRange(ctx.congestion, minutes);
    var per = trainsPerHour(minutes) * SUBWAY_CARS;
    var side = dirName(route, leg.dirIdx);
    var segs = [], estimated = false, any = false, usedDir = false;
    var bestOff = -1, bestOffAt = null;

    for (var p = leg.fromPos; p < leg.toPos; p++) {
      var here = names[p], next = names[p + 1];
      var t = minutes + (p - leg.fromPos) * (route.minutes || 2);
      var pct = gridValue(ctx.congestion, line + '|' + here + '|' + day + '|' + side, t);
      var tierName = pct !== null ? '방향값' : null;
      if (pct !== null) usedDir = true;
      /* ★ 이웃 메우기 (D-79) ★
         지선 접점(성수·신도림)은 원천에 그 방향 줄이 아예 없다(전부 0이라 수집기가 버린다).
         혼잡은 한 역 사이에 확 안 바뀌므로 **같은 방향** 이웃 역 값으로 메운다.
         ★ 앞(가는 방향)부터 본다 ★ — 뒤는 노선표에서 지선이 이어붙는 경계일 수 있어
         (2호선 배열: …신답 | 성수 | 뚝섬…) 딴 선로의 값을 집는다. 앞쪽은 이 leg 가
         실제로 달리는 선로라 안전하다. 어림이므로 estimated. */
      if (pct === null) {
        for (var nb = 1; nb <= 3 && pct === null; nb++) {
          var cand = null;
          if (names[p + nb] !== undefined)
            cand = gridValue(ctx.congestion, line + '|' + names[p + nb] + '|' + day + '|' + side, t);
          if (cand === null && names[p - nb] !== undefined)
            cand = gridValue(ctx.congestion, line + '|' + names[p - nb] + '|' + day + '|' + side, t);
          if (cand !== null) { pct = cand; usedDir = true; estimated = true; tierName = '이웃메움'; }
        }
      }
      /* 어느 층의 자료를 밟았는지 센다 (D-82) — 조용한 폴백이 오류를 숨기는 게
         이 앱 결함사의 공통 뿌리라, 부르는 쪽이 ctx.stats 를 주면 층별로 계수한다. */
      if (pct === null) { pct = gridValue(ctx.congestion, line + '|' + here + '|' + day, t); if (pct !== null) tierName = '역최대'; }
      if (pct === null) { pct = gridValue(ctx.congestion, line + '|전체|' + day, t); if (pct !== null) tierName = '호선피크'; }
      if (ctx.stats && ctx.stats.tier) ctx.stats.tier[tierName || '없음'] = (ctx.stats.tier[tierName || '없음'] || 0) + 1;
      if (pct === null) continue;
      if (pct <= 0.01) return { notRunning: true, why: '그 시각에는 열차가 다니지 않는다' };
      any = true;
      var offTotal = gridValue(ctx.ride, line + '|' + next + '|' + day + '|하차', t);
      var alight;
      if (offTotal === null) { alight = 0; }
      else {
        /* 승하차 자료에는 방향이 없다(역 전체 합계다). 그대로 쓰면 반대 방향 하차까지
           내 열차에서 내리는 것으로 세어 두 배가 된다 — 빈자리를 실제보다 많게 본다.
           방향을 나눌 근거가 없으므로 절반으로 잡는다. 어림이라 estimated 로 표시한다. */
        alight = offTotal / 2 / per;
        estimated = true;
        /* ★ 내리는 역에서 자리가 나는 것은 나에게 아무 소용이 없다 ★
           나도 거기서 내린다. 그런데 이 루프는 마지막 바퀴에서 next 가 **목적지 자신**이라
           「충무로에서 많이 내립니다」처럼 **내가 내릴 역**을 자리 나는 곳으로 안내했다.
           (확률 계산은 무사하다 — ride() 가 마지막 구간의 alightAtEnd 를 안 쓴다.
            틀린 것은 화면에 붙는 이름뿐이었지만, 그 한 줄이 숫자 전체를 못 믿게 만든다.)
           가는 도중의 역만 센다. */
        if (p + 1 < leg.toPos && alight > bestOff) { bestOff = alight; bestOffAt = next; }
      }
      segs.push({ load: pct / 100 * cap, minutes: route.minutes || 2, alightAtEnd: alight,
                  boardAtEnd: 0 });      // 다음 바퀴에서 재차 변화를 보고 채운다
    }
    /* 그 역에서 몇 명이 탔는지는 승차 자료를 따로 안 봐도 재차인원의 변화로 나온다:
       탄 사람 = (다음 재차) - (지금 재차) + (내린 사람). 빈자리를 두고 겨룰 사람 수다. */
    for (var q = 0; q + 1 < segs.length; q++)
      segs[q].boardAtEnd = Math.max(0, segs[q + 1].load - segs[q].load + (segs[q].alightAtEnd || 0));
    if (!any || !segs.length) return null;
    return { segments: segs, estimated: estimated, direction: usedDir ? side : null,
             bestOffAt: bestOffAt, boardMinutes: minutes,
             outOfRange: oor ? (oor.before
                 ? '그 시각엔 아직 첫차가 없을 수 있습니다 — 자료가 ' + I.hhmm(oor.at) + '부터라 그 값으로 봤습니다'
                 : '그 시각엔 이미 막차가 끊겼을 수 있습니다 — 자료가 ' + I.hhmm(oor.at) + '까지라 그 값으로 봤습니다') : null,
             why: estimated ? '하차 인원을 양방향 절반 · 시간당 열차 ' + trainsPerHour(minutes)
                            + '대 × ' + SUBWAY_CARS + '칸으로 나눈 추정' : '' };
  }

  // ── 버스 ────────────────────────────────────────────────────────────────
  /* 승차·하차가 정류장별로 있으므로 **OD 배분으로 재차인원을 만든다**(사양서 6.2-③).
     승차량·하차량을 따로 쓰면 인원이 보존되지 않아 재차인원이 엉뚱해진다.
     그 다음 시간당 대수로 나눠 한 대 분으로 바꾼다(추정). */
  /* 심야·새벽버스는 대략 23시~05시에만 다닌다. 승하차 자료가 아예 없는 노선도 있어
     「자료 없음」으로 빠지는데, 그러면 낮 시간 후보에 그대로 남는다
     (실제로 08시 경로에 「새벽A160」이 올라왔다). 시간대로 먼저 자른다. */
  function nightBusRunning(minutes) {
    var h = (minutes % 1440) / 60;                   // 새벽은 25~28시(하루의 연장)로도 온다
    return h >= 23 || h < 5;
  }

  var busCache = Object.create(null);
  var dayCache = null, dayCacheFor = null;
  function clearCache() { busCache = Object.create(null); dayCache = dayCacheFor = null; }

  /* ── 버스 승객의 요일 보정 ──────────────────────────────────────────────
     ★ 이게 없으면 일요일 아침 버스가 출근버스와 똑같이 붐빈다 ★
     버스 원천(OA-12913)은 **월 총계**라 요일이 아예 없다. 그래서 날짜 수로 나눈
     「하루 평균」에는 평일 출근 첨두가 주말에 희석돼 들어가 있고,
     화면에서 요일을 바꿔도 버스 숫자가 1도 안 변했다.

     지하철 승하차(OA-12921)는 **요일별 실측**이라 그 비율을 뽑아 버스에 쓴다.
     같은 도시의 같은 시각 통행이므로 근사로 쓸 만하고, 안 쓰는 것보다 훨씬 낫다.
     실측(2026 자료, 전 역 합계): 하루 전체로는 토 0.76 · 일 0.57(평일=1)인데
     **08시만 보면 토 0.33 · 일 0.23** 이다 — 출근 첨두는 요일 차가 훨씬 크다.
     그래서 하루 한 개 값이 아니라 **시간대별 표**로 만든다.
     → 08시 보정계수: 평일 1.28 · 토 0.43 · 일 0.29

     이건 어디까지나 추정이다. 버스 요일별 실측이 생기면 이 함수를 걷어낸다. */
  function dayFactors(ride) {
    if (dayCache && dayCacheFor === ride) return dayCache;
    var t = { weekday: [], saturday: [], sunday: [] }, k, i, p, a;
    if (!ride || !ride.grid || !ride.dayCount) return (dayCache = null, dayCacheFor = ride, null);
    var n = ride.slots || 20, h0 = Math.round((ride.startMinutes || 300) / 60);
    for (k in t) for (i = 0; i < n; i++) t[k].push(0);
    for (k in ride.grid) {
      p = k.split('|');
      if (p[3] !== '승차' || !t[p[2]]) continue;
      a = ride.grid[k];
      for (i = 0; i < n; i++) t[p[2]][i] += a[i] || 0;
    }
    var c = ride.dayCount, days = (c.weekday || 0) + (c.saturday || 0) + (c.sunday || 0);
    if (!days) return (dayCache = null, dayCacheFor = ride, null);
    var out = { weekday: [], saturday: [], sunday: [], hour0: h0, slots: n };
    for (i = 0; i < n; i++) {
      var mixed = (t.weekday[i] * (c.weekday || 0) + t.saturday[i] * (c.saturday || 0)
                 + t.sunday[i] * (c.sunday || 0)) / days;
      for (k in t) {
        // 자료가 얇은 시간대(첫차 전·막차 후)에서 계수가 튀지 않게 가둔다
        var f = mixed > 0 ? t[k][i] / mixed : 1;
        out[k].push(Math.max(0.2, Math.min(2.0, f)));
      }
    }
    dayCache = out; dayCacheFor = ride;
    return out;
  }

  /* ── 버스 자신의 실측 계수 (T-DATA, D-64) ─────────────────────────────
     지하철 차용 계수(D-54)는 버스에 과했다 — T-DATA 구간 실측과 대조하니 첨두 ×1.4~1.6
     과대, 낮 ×0.7, 일요일 ×0.54 과소였다(구간 상관은 0.84~0.95로 배분 구조 자체는 맞았다).
     버스는 통근 쏠림이 지하철보다 완만하다. 그래서 T-DATA 재차인원합 실측에서
     종류×요일×시간 계수를 직접 뽑아(data/bus/tdata-calib.json) 1순위로 쓰고,
     표본이 얇은 칸(null)만 지하철 차용으로 물러난다. */
  function busDayFactor(ctx, kind, hour) {
    var t = ctx.busCalib && ctx.busCalib.factors;
    var k = t && (t[kind] || t.branch);
    var row = k && k[ctx.dayType || 'weekday'];
    var v = row ? row[hour] : undefined;
    if (v === null || v === undefined) return dayFactor(ctx, hour);
    return v;
  }

  function dayFactor(ctx, hour) {
    var tb = dayFactors(ctx.ride);
    if (!tb) return 1;
    var i = hour - tb.hour0;
    if (i < 0 || i >= tb.slots) return 1;      // 격자 밖(새벽)은 건드리지 않는다
    var row = tb[ctx.dayType] || tb.weekday;
    return row ? row[i] : 1;
  }

  function busSegments(ctx, leg, route) {
    var when = legMinutes(ctx, leg);
    if (route.kind === 'night' && !nightBusRunning(when))
      return { notRunning: true, why: '심야·새벽버스라 그 시각에는 다니지 않는다' };
    /* 낮 버스의 막차~첫차 공백 (D-81): 서울 시내버스는 대개 00:30~01:00에 끊기고
       04:00~05:00에 시작한다. 02시 검색에 공항·지선 버스가 살아 있던 것을 끊는다.
       (노선별 첫·막차는 노선정보조회 API 가 000000 을 줘 못 얻는다 — 그때까지의
        안전한 공통 공백만 막는다. 8101 같은 출근전용의 낮 시간은 여전히 남은 일.) */
    if (route.kind !== 'night' && (when % 1440) >= 90 && (when % 1440) < 240)
      return { notRunning: true, why: '그 시각에는 이 버스가 다니지 않는다' };
    var doc = ctx.busRoute;                     // data/bus/routes/<노선명>.json
    if (!doc || !doc.stops || !doc.stops.length) return null;
    var ids = route.stops && route.stops[leg.dirIdx];
    if (!ids) return null;

    var byId = ctx._busById;
    if (!byId || ctx._busByIdFor !== doc.route) {
      byId = ctx._busById = Object.create(null);
      ctx._busByIdFor = doc.route;
      for (var i = 0; i < doc.stops.length; i++) byId[doc.stops[i].stopId] = doc.stops[i];
    }

    var hour = Math.max(0, Math.min(23, Math.floor((when % 1440) / 60)));
    var dayMul = busDayFactor(ctx, route.kind, hour);   // 월 총계에는 요일이 없다 — 실측 비율로 되돌린다
    var boardings = [], attract = [], found = 0, k;
    for (k = 0; k < ids.length; k++) {
      var s = byId[ids[k]];
      var on = s ? (s.on[hour] || 0) * dayMul : 0;
      var off = s ? (s.off[hour] || 0) * dayMul : 0;
      if (s) found++;
      boardings.push(on);
      attract.push(off + 0.0001);
    }
    if (found < 2) return null;

    /* ★ 승객이 0명인 것은 「텅 비어 앉을 수 있다」가 아니라 「안 다닌다」는 뜻이다 ★
       처음엔 이걸 안 걸러서 오전 8시에 **심야버스 N51 이 1순위**로 올라왔다 —
       그 시각 승하차가 전부 0이라 「23자리가 모두 비어 있습니다」로 계산됐기 때문이다.
       자료가 없을수록 점수가 좋아지는 구조는 이 서비스에서 가장 위험한 함정이다. */
    var moved = 0;
    for (k = 0; k < ids.length; k++) moved += boardings[k] + (attract[k] - 0.0001);
    /* 심야버스는 제 시간대엔 자료가 얇아도 다닌다 (D-81): 승하차 표본이 적은 N15·N16이
       「승객<1 = 안 다님」 규칙(원래 낮 유령 노선용)에 제 시간대에 살해당해, 02시 미아에서
       심야버스가 전멸했다. 심야 창(23~05시)의 night 노선만 면제 — 낮 유령은 계속 죽는다. */
    if (moved < 1 && !(route.kind === 'night' && nightBusRunning(when)))
      return { notRunning: true, why: '그 시각에는 이 노선이 다니지 않는다' };

    /* OD 배분은 노선 하나에 정류장 수만큼 도는 계산이라 비싸다.
       「앉아 갈 수 있는 위치 찾기」는 한 노선의 여러 승차 지점을 훑으므로 수천 번 부른다.
       노선·시간 단위로 한 번만 계산해 들고 있는다. */
    /* ★ 캐시 키에 **방향**이 반드시 들어가야 한다 ★
       버스도 왕복을 두 방향으로 가르면서(D-51) 방향마다 정류장 ID 가 달라졌다 —
       방향을 빼면 아침 도심행의 값이 한산한 반대 방향에 그대로 쓰인다. */
    var ck = (doc.route || '') + '@' + hour + '#' + leg.dirIdx + '/' + ctx.dayType
           + (ctx.busCalib ? '/c' : '');
    var od;
    if (!busCache[ck]) busCache[ck] = SIM.odLoads({ boardings: boardings, attract: attract,
                                                    decayStops: DECAY_STOPS[route.kind] || 6 });
    od = busCache[ck];
    var per = busesPerHour(route, when);
    var segs = [];
    for (k = leg.fromPos; k < leg.toPos && k < od.loads.length - 1; k++) {
      segs.push({
        load: od.loads[k] / per * RIDER_LOAD_FACTOR,
        minutes: route.minutes || 2.6,
        alightAtEnd: (od.alights[k + 1] || 0) / per * RIDER_LOAD_FACTOR,
        // 그 정류장에서 타는 사람 — 같은 빈자리를 두고 겨룬다
        boardAtEnd: (od.boardings[k + 1] || 0) / per * RIDER_LOAD_FACTOR
      });
    }
    if (!segs.length) return null;
    var hwNote = route.headwayMin
      ? '배차 ' + route.headwayMin + '분(인가 기준)으로 시간당 ' + per.toFixed(1) + '대'
      : '배차 자료가 없어 같은 종류의 중앙값으로 시간당 ' + per.toFixed(1) + '대';
    var out = { segments: segs, estimated: true, boardMinutes: when,
                why: '정류장별 승·하차를 OD 로 배분한 뒤 ' + hwNote + '로 나눈 추정'
                     + (Math.abs(dayMul - 1) > 0.02
                        ? ' (요일·시간 보정 ×' + dayMul.toFixed(2)
                          + (ctx.busCalib ? ' — 버스 구간 실측(T-DATA)에서 얻은 비율' : ' — 지하철 실측 비율을 빌려 씀')
                          + ')'
                        : '') };
    if (route.kind === 'express') {
      // 광역버스는 입석 금지 — 잔여좌석이 곧 탑승 가능 여부다(사양서 5.1)
      out.freeSeats = Math.max(0, 41 - segs[0].load);
    }
    return out;
  }

  // ── route.js 에 넘길 함수 ────────────────────────────────────────────────
  /* ctx = {graph, congestion, ride, busRouteOf(routeName), minutes, dayType, alpha} */
  function makeLoadFor(ctx) {
    /* ★ 버스에 넘기는 ctx 를 그때그때 새로 만들면 안 된다 ★
       예전에는 여기서 { minutes, busRoute } 만 담은 껍데기를 매번 새로 지어 넘겼다.
       그래서 두 가지가 조용히 죽어 있었다:
         ① `dayType`·`ride` 가 안 실려 **요일 보정이 버스에 영영 안 먹었다** —
            화면에서 일요일을 골라도 버스 숫자가 평일과 똑같았다.
         ② `_busById` 를 매번 null 로 지어 넘겨 정류장 색인 memo 가 늘 헛돌았다.
       하나를 만들어 두고 값만 갈아 끼운다. */
    var busCtx = { minutes: ctx.minutes, dayType: ctx.dayType, ride: ctx.ride,
                   busCalib: ctx.busCalib,          // D-55: 골라 담다 빠뜨리면 조용히 굶는다
                   busRoute: null, _busById: null, _busByIdFor: null };
    return function (leg) {
      var route = ctx.graph.routes[leg.routeIdx];
      var got;
      if (route.kind === 'subway') {
        got = subwaySegments(ctx, leg, route);
      } else {
        // 자료가 없어도 「심야버스가 낮에 다니는가」는 판정할 수 있다 — 먼저 부른다.
        busCtx.busRoute = ctx.busRouteOf ? ctx.busRouteOf(route.name) : null;
        busCtx.minutes = ctx.minutes;      // 부르는 쪽이 시각을 바꿔 쓸 수 있다
        busCtx.dayType = ctx.dayType;
        busCtx.ride = ctx.ride;
        busCtx.busCalib = ctx.busCalib;
        got = busSegments(busCtx, leg, route);
      }
      if (got) { leg.boardMinutes = got.boardMinutes; leg.outOfRange = got.outOfRange || null; }
      if (got && got.notRunning) { leg.notRunning = true; leg.estimateWhy = got.why; return got; }
      if (got) {
        leg.estimated = got.estimated; leg.estimateWhy = got.why;
        leg.direction = got.direction; leg.bestOffAt = got.bestOffAt;
      }
      return got;
    };
  }

  return {
    SUBWAY_CARS: SUBWAY_CARS, BUSES_PER_HOUR: BUSES_PER_HOUR, dirName: dirName,
    nightBusRunning: nightBusRunning,
    trainsPerHour: trainsPerHour, busesPerHour: busesPerHour,
    legMinutes: legMinutes, outOfRange: outOfRange, clearCache: clearCache,
    dayFactors: dayFactors, dayFactor: dayFactor, busDayFactor: busDayFactor,
    RIDER_LOAD_FACTOR: RIDER_LOAD_FACTOR,
    subwaySegments: subwaySegments, busSegments: busSegments,
    makeLoadFor: makeLoadFor
  };
});
