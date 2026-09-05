/* interp.js — 원천 해상도(30분·1시간) 격자를 5분으로 잇는다.
   브라우저 window.SeatInterp / Node module.exports. 의존: 없음.

   사양서 3.3 의 결론을 그대로 구현한 자리다.
   저장은 원천 해상도 그대로, 5분 값은 **클라이언트 런타임에서** 만든다.
   저장 용량이 6배 줄고, 원천이 갱신되면 그대로 반영된다.

   ★ 없는 정보를 만들어내는 것이 아니다 ★
   30분 격자 사이를 부드럽게 잇는 것뿐이다. 그래서 두 가지를 지킨다.
   ① 보간값은 이웃한 두 원천값 사이를 절대 벗어나지 않는다(아래 clamp).
      매끄럽게 잇겠다고 오버슛을 허용하면 원천에 없는 최댓값이 생겨 버린다.
   ② SOURCE_NOTE 를 화면에 반드시 같이 띄운다. 사양서 3.3 "UI에서 속이지 말 것". */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeatInterp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOURCE_NOTE = '30분 단위 통계를 부드럽게 이은 예상값입니다';
  var SOURCE_NOTE_HOUR = '1시간 단위 통계를 부드럽게 이은 예상값입니다';

  function noteFor(slotMinutes) { return slotMinutes >= 60 ? SOURCE_NOTE_HOUR : SOURCE_NOTE; }

  function at(arr, i) {
    if (i < 0) return arr[0];
    if (i >= arr.length) return arr[arr.length - 1];
    return arr[i];
  }

  /* Catmull-Rom 한 마디. p1~p2 구간을 u(0~1) 로 잇되 결과를 두 값 사이로 가둔다. */
  function segment(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    var v = 0.5 * ((2 * p1) +
                   (-p0 + p2) * u +
                   (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
                   (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    var lo = Math.min(p1, p2), hi = Math.max(p1, p2);
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* 격자 값 하나 읽기.
       grid          원천값 배열
       slotMinutes   격자 간격(지하철 30, 버스 60)
       startMinutes  grid[0] 이 가리키는 시각(자정 기준 분). 기본 0
       atMinutes     알고 싶은 시각(자정 기준 분) */
  function valueAt(grid, opt) {
    if (!grid || !grid.length) return 0;
    var slot = opt.slotMinutes || 30;
    var start = opt.startMinutes || 0;
    var x = (opt.atMinutes - start) / slot;
    if (x <= 0) return grid[0];
    if (x >= grid.length - 1) return grid[grid.length - 1];
    var i = Math.floor(x), u = x - i;
    if (u === 0) return grid[i];
    return segment(at(grid, i - 1), at(grid, i), at(grid, i + 1), at(grid, i + 2), u);
  }

  /* 격자 전체를 stepMinutes(기본 5분) 간격으로 펼친다. 화면의 그래프용. */
  function expand(grid, opt) {
    var o = opt || {};
    var slot = o.slotMinutes || 30;
    var start = o.startMinutes || 0;
    var step = o.stepMinutes || 5;
    var end = start + (grid.length - 1) * slot;
    var out = [], t;
    for (t = start; t <= end + 1e-9; t += step) {
      out.push({ minutes: t, value: valueAt(grid, { slotMinutes: slot, startMinutes: start, atMinutes: t }) });
    }
    return out;
  }

  /* "08:35" 같은 표시용. 24시를 넘는 첫차·막차 표기(25:10)도 그대로 둔다. */
  function hhmm(minutes) {
    var h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    if (m === 60) { h += 1; m = 0; }
    if (h >= 25) h -= 24;                     // 새벽 표현(25~28시)은 시계 표기(01~04시)로 접는다
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function parseHHMM(s) {
    var p = String(s).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  return {
    SOURCE_NOTE: SOURCE_NOTE, SOURCE_NOTE_HOUR: SOURCE_NOTE_HOUR, noteFor: noteFor,
    valueAt: valueAt, expand: expand, hhmm: hhmm, parseHHMM: parseHHMM
  };
});
