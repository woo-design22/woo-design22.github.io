/* transfer-pos.js — 환승할 때 어느 칸·어느 문에서 내리면 되나 (D-116).
   브라우저 window.SeatTransferPos / Node module.exports.

   ★ 왜 이 앱에 필요한가 ★ 환승 통로를 덜 걷는 것은 곧 **서서 버티는 시간이 주는 것**이다.
   이 앱의 존재 이유가 서서 가는 시간을 줄이는 것이라 정확히 우리 일이고,
   주 사용자가 어르신·교통약자다.

   자료: pipeline/build_transfer.py 가 만든 transfer-pos.json
     {"pairs": {"<노선>|<환승역>|<갈아탈 노선>": [{toward, off, on, sec}, …]}}

   ★ 방면은 여기서 고른다 ★ 한 열쇠에 방면이 둘(상·하행) 담겨 온다.
   진행 방향 배열에서 **내리는 자리보다 뒤에 나오는** 방면이 내 방향이다.
   방향 라벨(상선/하선)로 고르지 않는다 — 노선마다 뜻이 달라 어긋난다(D-108).
   그래프 배열은 지선·급행이 이어붙어 실제 이웃이 아닐 수 있으므로(1호선 신길 다음이
   신도림으로 나온다) **바로 다음 역만 보지 않고 뒤쪽 전체에서 찾는다.** */
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('./transfer.js'));
  else root.SeatTransferPos = factory(root.SeatTransfer);
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  function canon(s) { return T && T.canonStopName ? T.canonStopName(s) : String(s || ''); }

  /* 이 환승 한 번에 쓸 안내. 못 찾으면 null(화면은 그 줄을 아예 안 그린다).
     cur·next 는 leg, graph 는 {nodes, routes}, table 은 transfer-pos.json 의 pairs. */
  function forTransfer(table, graph, cur, next) {
    if (!table || !graph || !cur || !next) return null;
    if (cur.kind !== 'subway' || next.kind !== 'subway') return null;
    var routes = graph.routes, nodes = graph.nodes;
    var a = routes[cur.routeIdx], b = routes[next.routeIdx];
    if (!a || !b || !a.line || !b.line) return null;
    var list = table[a.line + '|' + canon(cur.toName) + '|' + b.line];
    if (!list || !list.length) return null;
    if (list.length === 1) return list[0];

    /* 방면 고르기: 내가 가는 쪽(내리는 자리 뒤)에 그 방면 역이 있는가. */
    var dir = a.dirs && a.dirs[cur.dirIdx];
    if (!dir) return null;
    var ahead = Object.create(null), i;
    for (i = cur.toPos + 1; i < dir.length; i++) {
      var nd = nodes[dir[i]];
      if (nd) ahead[canon(nd.name)] = 1;
    }
    for (i = 0; i < list.length; i++)
      if (ahead[list[i].toward]) return list[i];
    /* 어느 쪽인지 못 가리면 **아무거나 주지 않는다** — 반대 방향 자리를 알려주면
       엉뚱한 데서 내리게 된다(1호선 신길: 대방 방면 9-1 / 영등포 방면 2-4). */
    return null;
  }

  /* 화면 문구. 「10-4에서 내리세요」가 아니라 어르신이 읽는 말로. */
  function text(info) {
    if (!info || !info.off) return null;
    if (info.off === 'All') return '아무 칸에서나 내리셔도 됩니다';
    var p = String(info.off).split('-');
    var s = p[0] + '번째 칸' + (p[1] ? ' ' + p[1] + '번 문' : '') + '에서 내리면 가장 가깝습니다';
    if (info.sec) s += ' <span class="muted">(갈아타는 데 약 ' + Math.round(info.sec / 60) + '분)</span>';
    return s;
  }

  return { forTransfer: forTransfer, text: text };
}));
