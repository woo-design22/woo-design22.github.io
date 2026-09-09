# -*- coding: utf-8 -*-
"""지역 분할 — 첫 화면을 가볍게, 나머지는 필요할 때 (D-113).

★ 왜 ★ 첫 로딩이 이미 10.6MB 다(nodes 3.9 + routes 2.4 + stops 1.5 + 혼잡도들).
전국 시·군 버스(약 1만 노선)를 그대로 얹으면 25MB 가 넘는다 — 셀룰러로 여는
어르신에게 그건 그냥 손해다(집 규칙: 주 사용자가 어르신·교통약자).

★ 어떻게 나누나 ★ **좌표 상자**로 나눈다. 행정구역 코드가 아니라 좌표인 이유:
노드에 시·군 정보가 없고(정류장 원천이 제각각), 상자면 「지도에서 고르기」의 지점으로도
바로 어느 조각인지 알 수 있다. 조각은 넉넉히 겹치게 둔다 — 경계에 걸친 환승이
사라지면 그게 제일 나쁜 사고다(D-90 에서 95m 때문에 경로가 통째로 사라진 적이 있다).

★ 무엇을 나누나 ★ **버스만.** 지하철·광역전철·도시 간 열차는 전국을 다 합쳐도 작고
(46개 노선), 무엇보다 **어느 지역에서 물어도 필요할 수 있다**(서울에서 부산행 KTX).
버스는 그 지역 안에서만 쓰이므로 조각으로 나눠도 경로가 안 상한다.

내는 것
  data/graph/core.json      늘 받는 것: 지하철·전철·도시 간 + 수도권 버스
  data/graph/region-<코드>.json  그 지역 버스 노드·노선 (필요할 때만)
  data/graph/regions.json   상자 목록(어느 조각을 받을지 앱이 고르는 표)

사용: python pipeline/build_regions.py [--dry]
"""
import argparse
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

GRAPH = os.path.join(C.DATA, 'graph')

# 좌표 상자 — 겹치게 넉넉히. (lat0, lat1, lon0, lon1)
# 수도권은 core 에 들어가므로 여기 없다. 「기타」는 남는 것 전부를 담는 마지막 조각이다.
REGIONS = [
    ('busan',   '부산·울산·경남', 34.6, 35.7, 128.4, 129.6),
    ('daegu',   '대구·경북',     35.4, 36.9, 128.0, 129.5),
    ('gwangju', '광주·전남',     34.2, 35.6, 126.3, 127.4),
    ('daejeon', '대전·충청',     35.9, 37.1, 126.6, 128.0),
    ('etc',     '그 밖의 지역',  0.0, 90.0, 0.0, 180.0),   # 남는 것 전부
]
# 수도권 상자 — 이 안의 버스는 core 에 넣는다(주 사용자가 여기 있다)
SEOUL_BOX = (36.9, 38.4, 126.2, 128.0)


def in_box(nd, box):
    return box[0] <= nd['lat'] <= box[1] and box[2] <= nd['lon'] <= box[3]


def region_of(nd):
    if in_box(nd, SEOUL_BOX):
        return 'core'
    for code, _nm, la0, la1, lo0, lo1 in REGIONS:
        if la0 <= nd['lat'] <= la1 and lo0 <= nd['lon'] <= lo1:
            return code
    return 'etc'


def main():
    ap = argparse.ArgumentParser(description='그래프를 지역 조각으로 나눈다')
    ap.add_argument('--dry', action='store_true', help='크기만 재 보고 파일은 안 쓴다')
    a = ap.parse_args()

    nodes_doc = json.load(io.open(os.path.join(GRAPH, 'nodes.json'), encoding='utf-8'))
    routes_doc = json.load(io.open(os.path.join(GRAPH, 'routes.json'), encoding='utf-8'))
    nodes, routes = nodes_doc['nodes'], routes_doc['routes']

    # ① 노선을 조각에 배정한다 — **지나는 노드의 다수결**이 아니라 「core 를 스치면 core」다.
    #    수도권을 조금이라도 지나는 노선은 수도권 사용자가 탈 수 있으므로 늘 실어 준다.
    def route_region(rt):
        if rt.get('kind') != 'bus' and rt.get('kind') not in (
                'trunk', 'branch', 'village', 'express', 'night', 'circular'):
            return 'core'                      # 지하철·전철·도시 간은 통째로 core
        seen = {}
        for d in (rt.get('dirs') or []):
            for i in d:
                if 0 <= i < len(nodes):
                    g = region_of(nodes[i])
                    if g == 'core':
                        return 'core'
                    seen[g] = seen.get(g, 0) + 1
        return max(seen, key=seen.get) if seen else 'core'

    by_region = {}
    for ri, rt in enumerate(routes):
        by_region.setdefault(route_region(rt), []).append(ri)

    # ② 조각마다 필요한 노드만 모은다. 노드 번호는 그대로 둔다 —
    #    번호를 다시 매기면 core 와 조각이 서로 못 알아본다(합쳐서 한 그래프가 돼야 한다).
    out = {}
    for code, idxs in by_region.items():
        need = set()
        for ri in idxs:
            for d in (routes[ri].get('dirs') or []):
                need.update(d)
        out[code] = {'routes': idxs, 'nodes': sorted(need)}

    C.log('== 지역 분할 ==')
    core_nodes = out.get('core', {}).get('nodes', [])
    total_mb = 0
    for code in ['core'] + [r[0] for r in REGIONS]:
        if code not in out:
            continue
        idxs, nds = out[code]['routes'], out[code]['nodes']
        # 조각 파일: 그 조각의 노선 + **core 에 없는 노드만**(core 는 늘 먼저 받으므로)
        core_set = set(core_nodes) if code != 'core' else set()
        own = [i for i in nds if i not in core_set]
        doc = {'region': code,
               'routes': [routes[i] for i in idxs],
               'nodes': {str(i): nodes[i] for i in own}}
        s = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
        mb = len(s.encode('utf-8')) / 1e6
        total_mb += mb
        C.log('  %-8s 노선 %5d · 노드 %6d (core 밖 %6d) · %5.2fMB'
              % (code, len(idxs), len(nds), len(own), mb))
        if not a.dry:
            p = os.path.join(GRAPH, ('core.json' if code == 'core' else 'region-%s.json' % code))
            io.open(p, 'w', encoding='utf-8').write(s)
    C.log('  합계 %.2fMB (지금은 한 번에 다 받는 %.2fMB 를 조각으로 나눈 것)'
          % (total_mb, (os.path.getsize(os.path.join(GRAPH, 'nodes.json'))
                        + os.path.getsize(os.path.join(GRAPH, 'routes.json'))) / 1e6))
    if not a.dry:
        C.save_json(os.path.join(GRAPH, 'regions.json'), {
            'note': '지역 조각 목록(D-113). 앱은 core 를 먼저 받고, 출발·도착이 상자 안에 '
                    '들어오면 그 조각을 더 받는다. 상자는 넉넉히 겹친다.',
            'regions': [{'code': c, 'name': nm, 'box': [la0, la1, lo0, lo1]}
                        for c, nm, la0, la1, lo0, lo1 in REGIONS if c in out]})
        # ★ 검색은 전국이어야 한다 ★ 조각을 안 받은 상태에서도 「부산역」이 검색돼야
        # 거기서 조각을 받을 수 있다(안 그러면 지방을 영영 못 고른다 — 실제로 그랬다).
        # 좌표·이름·종류만 담은 가벼운 색인을 따로 낸다(노선 배열이 없어 작다).
        search = [{'n': nd['name'], 'a': round(nd['lat'], 5), 'o': round(nd['lon'], 5),
                   'k': ''.join(x[0] for x in (nd.get('kinds') or []))} for nd in nodes]
        C.save_json(os.path.join(GRAPH, 'search.json'),
                    {'note': '검색 전용 전국 색인(D-113) — 이름·좌표·종류만. 조각을 안 받은 '
                             '지역도 검색되게 하려는 것이다.', 'stops': search})
        C.log('  → core.json · region-*.json · regions.json · search.json (%.2fMB)'
              % (os.path.getsize(os.path.join(GRAPH, 'search.json')) / 1e6))


if __name__ == '__main__':
    main()
