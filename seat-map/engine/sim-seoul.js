/* sim-seoul.js — 실데이터가 없을 때 쓰는 폴백 시뮬레이션.
   브라우저 window.SeatSim / Node module.exports. 의존: 없음.

   ★ 이 파일이 하는 일과 하지 않는 일 ★
   실측이 아니다. 사양서 10장의 검증 기준(5호선 피크 110~130%, 6호선 70~85%,
   토·일 피크는 평일의 40~65%)을 **목표값으로 삼아 맞춰 놓은 곡선**이다.
   그래서 검증 테스트가 SIM 모드에서 통과하는 것은 "현실이 그렇다"는 뜻이 아니라
   "폴백이 목표대로 보정돼 있고, 모델이 그 값을 제대로 읽는다"는 뜻이다.
   실데이터가 data/ 에 들어오면 같은 테스트가 REAL 모드로 같은 주장을 검사한다.
   화면에서도 이 출처를 숨기지 말 것 — 사양서 3.3 "UI에서 속이지 말 것".

   재차인원은 반드시 OD(출발-도착) 방식으로 만든다. 승차·하차를 각각 독립 계수로
   두면 인원이 보존되지 않아 6호선 피크 혼잡도가 7% 로 나왔다(사양서 6.2-③). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeatSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── OD 배분 (사양서 6.2-③) ──────────────────────────────────────────────
  /* 정거장 i 에서 탄 사람을 하류 정거장 j(>i) 에 매력도 비례로 배분한 뒤 누적한다.
     인원이 보존되고, 노선 중앙이 볼록한 실제 프로파일이 나온다.

     boardings   [b0, b1, ...] 정거장별 승차 인원
     attract     [w0, w1, ...] 정거장별 하차 매력도(생략하면 승차량을 그대로 쓴다)
     decayStops  먼 정거장일수록 덜 가는 정도. 클수록 멀리 간다. 기본 15정거장

     돌려주는 것: { loads, alights, boardings }
       loads[i]  = 정거장 i 를 떠나 i+1 로 가는 구간의 재차인원
       alights[i]= 정거장 i 에서 내리는 인원 (alights[0] = 0, 마지막은 남은 전원) */
  function odLoads(opt) {
    var n = opt.boardings.length;
    var w = opt.attract || opt.boardings;
    var L = opt.decayStops === undefined ? 15 : opt.decayStops;
    // 종점에서 타는 사람은 갈 데가 없다. 그냥 두면 배분 루프가 조용히 버려서
    // 「탄 사람 ≠ 내린 사람」이 된다 — 인원 보존이 이 방식의 존재 이유이므로
    // 버리는 대신 여기서 0으로 못 박고 얼마를 뺐는지 함께 돌려준다.
    var b = opt.boardings.slice();
    var dropped = b[n - 1] || 0;
    b[n - 1] = 0;
    var alights = new Array(n), loads = new Array(n), i, j;
    for (i = 0; i < n; i++) { alights[i] = 0; loads[i] = 0; }

    for (i = 0; i < n - 1; i++) {
      if (!b[i]) continue;
      var sum = 0, wt = new Array(n);
      for (j = i + 1; j < n; j++) {
        wt[j] = (w[j] || 0.0001) * Math.exp(-(j - i - 1) / L);
        sum += wt[j];
      }
      if (sum <= 0) { alights[n - 1] += b[i]; continue; }
      for (j = i + 1; j < n; j++) alights[j] += b[i] * wt[j] / sum;
    }

    var onboard = 0;
    for (i = 0; i < n; i++) {
      onboard += (b[i] || 0) - alights[i];
      if (onboard < 0) onboard = 0;          // 반올림 오차 방어
      loads[i] = onboard;
    }
    loads[n - 1] = 0;                        // 종점에서는 전원 하차
    return { loads: loads, alights: alights, boardings: b, droppedBoardings: dropped };
  }

  // ── 시간대 곡선 ─────────────────────────────────────────────────────────
  function gauss(t, c, s) { var d = t - c; return Math.exp(-(d * d) / (2 * s * s)); }

  /* 평일: 아침(08:10)이 가장 높고 저녁(18:30)이 그 다음. 낮은 완만한 언덕.
     주말: 봉우리가 하나뿐이고 오후로 밀린다. */
  function rawCurve(dayType, hour) {
    if (dayType === 'weekday') {
      return 0.18 + 0.90 * gauss(hour, 8.17, 0.62)
                  + 0.78 * gauss(hour, 18.5, 0.85)
                  + 0.25 * gauss(hour, 13.0, 3.2);
    }
    return 0.30 + 0.70 * gauss(hour, 15.0, 3.0) + 0.25 * gauss(hour, 19.0, 1.2);
  }
  var CURVE_MAX = (function () {
    var m = { weekday: 0, weekend: 0 }, t;
    for (t = 5; t <= 24; t += 1 / 60) {
      m.weekday = Math.max(m.weekday, rawCurve('weekday', t));
      m.weekend = Math.max(m.weekend, rawCurve('weekend', t));
    }
    return m;
  })();
  /* 하루 최댓값이 1 이 되도록 정규화. 이래야 LINE.peak 가 곧 그 노선의 피크 혼잡도가 된다. */
  function curve(dayType, hour) {
    var key = dayType === 'weekday' ? 'weekday' : 'weekend';
    return rawCurve(key, hour) / CURVE_MAX[key];
  }

  /* 요일 구분은 평일 / 토요일 / 일요일·공휴일 셋 (사양서 3.2). 공휴일은 일요일 프로파일. */
  var DAY_TYPES = ['weekday', 'saturday', 'sunday'];
  var DAY_FACTOR = { weekday: 1.00, saturday: 0.58, sunday: 0.48 };
  function dayFactor(d) { return DAY_FACTOR[d] === undefined ? 1 : DAY_FACTOR[d]; }
  function curveKind(d) { return d === 'weekday' ? 'weekday' : 'weekend'; }

  // ── 노선별 평일 피크 혼잡도(%) ──────────────────────────────────────────
  /* 5호선 110~130, 6호선 70~85 는 사양서 10장이 정한 범위이고 그 가운데를 잡았다.
     나머지 호선은 서울교통공사 공개 통계의 대략적인 순위만 반영한 어림이다.
     실데이터가 들어오면 이 표는 통째로 버린다. */
  var SUBWAY_LINES = {
    '1': { peak: 105, capacity: 160, seats: 54 },
    '2': { peak: 135, capacity: 160, seats: 54 },
    '3': { peak: 118, capacity: 160, seats: 54 },
    '4': { peak: 128, capacity: 160, seats: 54 },
    '5': { peak: 120, capacity: 160, seats: 54 },
    '6': { peak: 78,  capacity: 160, seats: 54 },
    '7': { peak: 122, capacity: 160, seats: 54 },
    '8': { peak: 95,  capacity: 160, seats: 54 },
    '9': { peak: 160, capacity: 160, seats: 54 }
  };

  function hourOf(minutes) { return minutes / 60; }

  /* 그 노선·요일·시각의 혼잡도(%). station 은 아직 쓰지 않는다 —
     폴백은 노선 단위이고, 역별 차이는 실데이터가 들어와야 생긴다(DECISIONS.md D-05). */
  function congestionAt(opt) {
    var line = SUBWAY_LINES[String(opt.line)];
    if (!line) throw new Error('모르는 호선: ' + opt.line);
    return line.peak * dayFactor(opt.dayType) * curve(curveKind(opt.dayType), hourOf(opt.minutes));
  }

  /* 그 시각 그 노선 1칸의 재차인원. */
  function subwayLoad(opt) {
    var line = SUBWAY_LINES[String(opt.line)];
    return congestionAt(opt) / 100 * line.capacity;
  }

  /* ride() 에 그대로 넘길 구간 배열을 만든다.
     hops 정거장을 가고, 정거장마다 재차인원의 turnover 만큼 내린다고 본다. */
  function subwaySegments(opt) {
    var hops = opt.hops || 8;
    var minutesPerHop = opt.minutesPerHop || 2.0;      // 사양서 6.3: 시간표가 없으면 2.0분
    var turnover = opt.turnover === undefined ? 0.10 : opt.turnover;
    var segs = [], i;
    for (i = 0; i < hops; i++) {
      var load = subwayLoad({ line: opt.line, dayType: opt.dayType, minutes: opt.minutes + i * minutesPerHop });
      segs.push({ load: load, minutes: minutesPerHop, alightAtEnd: load * turnover });
    }
    return segs;
  }

  /* 버스 한 노선의 OD 프로파일. 승차는 앞쪽에, 하차 매력도는 도심(중후반)에 몰아 준다. */
  function busProfile(opt) {
    var n = opt.stops || 30;
    var peakRiders = opt.peakRiders === undefined ? 34 : opt.peakRiders;   // 피크 시 최대 재차인원 목표
    var f = dayFactor(opt.dayType) * curve(curveKind(opt.dayType), hourOf(opt.minutes));
    var b = [], w = [], i;
    for (i = 0; i < n; i++) {
      b.push(Math.exp(-Math.pow((i - n * 0.22) / (n * 0.28), 2)));         // 승차는 기점 쪽
      w.push(Math.exp(-Math.pow((i - n * 0.68) / (n * 0.26), 2)));         // 하차는 도심 쪽
    }
    var od = odLoads({ boardings: b, attract: w, decayStops: opt.decayStops });
    var mx = Math.max.apply(null, od.loads) || 1;
    var scale = peakRiders * f / mx;
    return {
      loads: od.loads.map(function (v) { return v * scale; }),
      alights: od.alights.map(function (v) { return v * scale; }),
      factor: f
    };
  }

  /* 버스 승차 정거장 from 에서 to 까지의 구간 배열. */
  function busSegments(opt) {
    var p = busProfile(opt);
    var minutesPerHop = opt.minutesPerHop || 2.6;      // 사양서 6.3: 간선버스 기본값
    var segs = [], i;
    for (i = opt.from; i < opt.to; i++) {
      segs.push({ load: p.loads[i], minutes: minutesPerHop, alightAtEnd: p.alights[i + 1] || 0 });
    }
    return segs;
  }

  return {
    odLoads: odLoads,
    DAY_TYPES: DAY_TYPES, DAY_FACTOR: DAY_FACTOR, dayFactor: dayFactor,
    curve: curve, curveKind: curveKind,
    SUBWAY_LINES: SUBWAY_LINES,
    congestionAt: congestionAt, subwayLoad: subwayLoad, subwaySegments: subwaySegments,
    busProfile: busProfile, busSegments: busSegments
  };
});
