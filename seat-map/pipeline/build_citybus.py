# -*- coding: utf-8 -*-
"""광역시 시내버스를 길찾기 그래프에 얹는다 (D-106).

★ 왜 덧붙이나 (build_graph.py 를 고치지 않고) ★
`build_graph.py` 를 다시 돌리면 **노드 번호가 통째로 다시 매겨진다.** 지하철 쪽은
좌표·직결·지선 문제를 하나씩 잡아 가며 맞춰 둔 상태라(D-80·D-86·D-87), 그걸 흔들면서
버스를 넣으면 무엇이 깨졌는지 가릴 수가 없다. 그래서 **기존 노드 번호를 그대로 두고
뒤에 이어 붙인다.**

★ 묶는 규칙은 build_graph.py 와 같아야 한다 ★
  거리 ≤ 150m **그리고** (종류가 다르거나 · 정식 이름이 똑같거나)
연쇄 병합을 막으려고 대표점 기준으로 묶는 것도 같다. 규칙이 어긋나면
지하철역 앞 정류장이 역과 안 묶여 **환승이 통째로 사라진다**(그게 이 작업의 핵심인데).

★ 노선 이름에 도시를 붙인다 ★
서울에도 「101」이 있고 대구에도 「101」이 있다. 이름이 겹치면 앱이 대구 101 의
혼잡도로 **서울 101 의 승하차 파일**을 읽는다 — 오류 없이 틀린 숫자가 나오는,
이 저장소에서 제일 위험한 종류의 사고다. 그래서 「대구 101」로 둔다.

사용: python pipeline/build_citybus.py [--only busan,daegu]
"""
import argparse
import collections
import io
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

RAW = os.path.join(C.RAW, 'citybus')
GRAPH = os.path.join(C.DATA, 'graph')
CLUSTER_M = 150.0
EARTH_M = 6371000.0

# TAGO 노선유형 → 우리 종류. 모르는 값은 지선으로 둔다(가장 흔하고 가장 안전한 쪽).
KIND_OF = {
    '간선버스': 'trunk', '급행버스': 'trunk', '일반버스': 'trunk', '좌석버스': 'trunk',
    '급행간선버스': 'trunk', '간선급행버스': 'trunk', '주요버스': 'trunk',
    '지선버스': 'branch', '외곽버스': 'branch', '지선': 'branch', '일반': 'trunk',
    '마을버스': 'village', '마을': 'village',
    '순환버스': 'circular', '순환': 'circular',
    '광역버스': 'express', '공항버스': 'express', '리무진버스': 'express',
    '심야버스': 'night',
}
KIND_INFO = {'trunk': ('busTrunk', 2.6), 'branch': ('busBranch', 2.6),
             'village': ('busVillage', 2.2), 'express': ('busExpress', 4.2),
             'night': ('busTrunk', 2.6), 'circular': ('busVillage', 2.2)}


def haversine(a_lat, a_lon, b_lat, b_lon):
    to = math.pi / 180
    d_lat, d_lon = (b_lat - a_lat) * to, (b_lon - a_lon) * to
    h = (math.sin(d_lat / 2) ** 2 +
         math.cos(a_lat * to) * math.cos(b_lat * to) * math.sin(d_lon / 2) ** 2)
    return 2 * EARTH_M * math.asin(min(1.0, math.sqrt(h)))


def flat(s):
    return re.sub(r'\s+', '', str(s or ''))


class NodeIndex(object):
    """기존 노드 위에 새 정류장을 얹는다. build_graph.py 의 cluster() 와 같은 규칙."""

    def __init__(self, nodes):
        self.nodes = nodes
        self.cell = CLUSTER_M / 111320.0
        self.grid = collections.defaultdict(list)
        for i, n in enumerate(nodes):
            self.grid[self._key(n['lat'], n['lon'])].append(i)
        self.added = 0

    def _key(self, lat, lon):
        return (int(lon / self.cell), int(lat / self.cell))

    def place(self, name, lat, lon, member):
        cx, cy = self._key(lat, lon)
        nm = flat(name)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in self.grid.get((cx + dx, cy + dy), ()):
                    q = self.nodes[i]
                    if haversine(lat, lon, q['lat'], q['lon']) > CLUSTER_M:
                        continue
                    kinds = q.get('kinds') or []
                    # 규칙: 종류가 다르거나(지하철↔버스) · 정식 이름이 똑같거나
                    if ('bus' not in kinds) or flat(q['name']) == nm:
                        if member not in q['members']:
                            q['members'].append(member)
                        if 'bus' not in kinds:
                            kinds.append('bus')
                            q['kinds'] = kinds
                        return i
        i = len(self.nodes)
        # ★ members 를 비워 둔다 ★ 이 배열은 그래프를 **만들 때** 쓰는 것이고
        # 실행 중에는 아무도 안 읽는다(engine·index.html 전수 확인). 정류장 1만 7천 개면
        # 그것만으로 1MB 가까이 되는데, 셀룰러로 여는 어르신에게 그 1MB 는 그냥 손해다.
        # cb 표시 — 다시 돌릴 때 이 노드들만 걷어내려고 단다(항상 뒤에 붙으므로 꼬리에 모인다)
        self.nodes.append({'name': str(name).strip(), 'lat': round(lat, 6),
                           'lon': round(lon, 6), 'members': [], 'kinds': ['bus'], 'cb': 1})
        self.grid[(cx, cy)].append(i)
        self.added += 1
        return i


SPLIT_NEAR_M = 160.0


def split_round_trip(seq):
    """방향값이 없는 노선을 **두 방향으로 가른다** (build_graph.py 의 같은 함수와 같은 규칙).

    ★ 광주는 356개 노선 전부가 방향값(updowncd)이 없다 ★ 대구도 절반이 그렇다.
    한 줄로 두면 「가는 길」과 「돌아오는 길」이 한 줄에 이어져, 되돌아오는 구간을 타려면
    노선을 한 바퀴 다 돌아야 하는 것으로 계산된다 — 그 경로는 시간이 터무니없어져
    후보에서 잘리고, 결국 **그 방향이 통째로 사라진다.**

    회차점 = 기점에서 가장 멀어지는 자리. 다만 **순환 노선을 가르면 안 되므로**
    네 가지를 확인하고 하나라도 어긋나면 가르지 않는다(그때는 한 줄로 둔다).
    seq 는 [(순번, 이름, 위도, 경도)] 이고 돌려주는 것도 같은 모양의 둘이다.
    """
    n = len(seq)
    if n < 10:
        return None
    _, _, la0, lo0 = seq[0]
    k, best = 0, -1.0
    for i in range(1, n):
        d = haversine(la0, lo0, seq[i][2], seq[i][3])
        if d > best:
            best, k = d, i
    fwd, back = seq[:k + 1], seq[k:]
    if len(fwd) < 4 or len(back) < 4:
        return None
    if min(len(fwd), len(back)) / float(max(len(fwd), len(back))) < 0.55:
        return None
    if haversine(seq[-1][2], seq[-1][3], la0, lo0) > 2000.0:
        return None
    paired = 0
    for p in fwd:
        for q in back:
            if haversine(p[2], p[3], q[2], q[3]) <= SPLIT_NEAR_M:
                paired += 1
                break
    if paired / float(len(fwd)) < 0.5:
        return None
    return fwd, back


def load_headways_daegu():
    """대구는 노선별 평균 배차간격 파일이 있다 — 있으면 쓴다(없으면 종류 중앙값으로 물러난다)."""
    p = os.path.join(RAW, 'dg_headway.csv')
    if not os.path.exists(p):
        return {}
    raw = open(p, 'rb').read()
    txt = None
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            txt = raw.decode(enc)
            break
        except Exception:
            pass
    if not txt:
        return {}
    vals = collections.defaultdict(list)
    for ln in txt.split('\n')[1:]:
        c = ln.split(',')
        if len(c) < 9 or c[4].strip() != '평일':
            continue
        try:
            v = float(c[8])
        except ValueError:
            continue
        if 2 <= v <= 90:
            vals[c[2].strip()].append(v)
    out = {}
    for k, v in vals.items():
        v.sort()
        out[k] = round(v[len(v) // 2], 1)      # 중앙값 — 정류장마다 조금씩 다르다
    return out


def build(only=None):
    nodes_doc = json.load(io.open(os.path.join(GRAPH, 'nodes.json'), encoding='utf-8'))
    routes_doc = json.load(io.open(os.path.join(GRAPH, 'routes.json'), encoding='utf-8'))
    nodes = nodes_doc['nodes']
    routes = routes_doc['routes']
    before_nodes, before_routes = len(nodes), len(routes)

    # ★ 다시 돌려도 같은 결과가 나오게 ★ 앞서 붙인 노선과 노드를 먼저 걷어낸다.
    # 안 걷어내면 돌릴 때마다 노드가 쌓이고, 옛 노드를 가리키는 노선이 남아 경로가 어긋난다.
    # 도시 간 노선(IC-)도 함께 걷어낸다 — 그것들은 여기서 붙인 정류장을 가리키고 있어서,
    # 남겨 두면 「지우려는 노드를 아직 쓰는 노선이 있다」로 막힌다(실제로 막혔다).
    # 노드 번호가 다시 매겨지므로 build_intercity.py 를 뒤이어 돌려야 한다.
    had_ic = sum(1 for r in routes if str(r.get('id', '')).startswith('IC-'))
    routes[:] = [r for r in routes
                 if not str(r.get('id', '')).startswith(('CB-', 'IC-'))]
    if had_ic:
        C.log('  도시 간 노선 %d개도 함께 걷어냈다 — 끝나면 build_intercity.py 를 다시 돌릴 것' % had_ic)
    first_cb = next((i for i, n in enumerate(nodes) if n.get('cb')), None)
    if first_cb is not None:
        tail = nodes[first_cb:]
        if not all(n.get('cb') for n in tail):
            C.die('cb 노드가 꼬리에 모여 있지 않다 — 손으로 확인할 것')
        used = max((max(d) for r in routes for d in (r.get('dirs') or []) if d), default=-1)
        if used >= first_cb:
            C.die('지우려는 노드(%d 이상)를 아직 쓰는 노선이 있다' % first_cb)
        del nodes[first_cb:]
        C.log('  앞서 붙인 정류장 %d개를 걷어냈다' % len(tail))
    idx = NodeIndex(nodes)
    hw_daegu = load_headways_daegu()

    files = sorted(f for f in os.listdir(RAW) if f.endswith('.json'))
    if only:
        keep = set(only.split(','))
        files = [f for f in files if os.path.splitext(f)[0] in keep]
    if not files:
        C.die('%s 에 도시 파일이 없다. 먼저 `python pipeline/fetch_citybus.py` 를 돌린다.' % RAW)

    kinds_seen = collections.Counter()
    split_count = [0]
    total_routes = 0
    for fn in files:
        doc = json.load(io.open(os.path.join(RAW, fn), encoding='utf-8'))
        city = doc['city']
        made = 0
        for r in doc['routes']:
            per_dir = collections.defaultdict(list)
            for nm, la, lo, ordn, up in r['stops']:
                per_dir[int(up)].append((ordn, nm, la, lo))
            # 방향값이 없으면(광주 전부·대구 절반) 회차점을 찾아 스스로 가른다
            seqs = [sorted(per_dir[up]) for up in sorted(per_dir)]
            if len(seqs) == 1:
                cut = split_round_trip(seqs[0])
                if cut:
                    seqs = [list(cut[0]), list(cut[1])]
                    split_count[0] += 1
            dirs = []
            for seq in seqs:
                if len(seq) < 3:
                    continue
                ids = [idx.place(nm, la, lo, 'CB%s-%s' % (doc['code'], flat(nm)))
                       for ordn, nm, la, lo in seq]
                # 같은 노드를 연달아 지나면(정류장 두 개가 한 노드로 묶인 경우) 하나로 줄인다
                keep_i = []
                for i in ids:
                    if not keep_i or keep_i[-1] != i:
                        keep_i.append(i)
                if len(keep_i) >= 3:
                    dirs.append(keep_i)
            if not dirs:
                continue
            kind = KIND_OF.get(r['type'], 'branch')
            kinds_seen[r['type']] += 1
            veh, mins = KIND_INFO[kind]
            name = '%s %s' % (city, r['no'])
            # stops 는 넣지 않는다 — 그건 승하차 파일(data/bus/routes/…)과 이어 붙일 때만
            # 쓰는 열쇠인데, 지방 시내버스는 그 파일이 없어 loads.js 가 그 앞에서
            # 「종류 평균 어림」으로 빠져나간다. 1,394개 노선에 정류장 열쇠를 다 실으면
            # routes.json 이 2MB 넘게 불어난다. 나중에 승하차를 붙이면 그때 함께 넣는다.
            routes.append({
                'id': 'CB-' + r['id'], 'name': name, 'kind': kind, 'vehicle': veh,
                'minutes': mins, 'headwayMin': hw_daegu.get(str(r['no'])),
                'dirs': dirs})
            made += 1
        total_routes += made
        C.log('  %s — 노선 %d개' % (city, made))

    C.log('  노선유형: %s' % ', '.join('%s %d' % (k, v) for k, v in kinds_seen.most_common()))
    C.log('  방향값이 없어 회차점으로 가른 노선 %d개' % split_count[0])
    C.save_json(os.path.join(GRAPH, 'nodes.json'), nodes_doc)
    C.save_json(os.path.join(GRAPH, 'routes.json'), routes_doc)
    C.log('== 노드 %d → %d (새로 %d) · 노선 %d → %d (시내버스 %d) =='
          % (before_nodes, len(nodes), idx.added, before_routes, len(routes), total_routes))
    C.log('   nodes.json %.1fMB · routes.json %.1fMB'
          % (os.path.getsize(os.path.join(GRAPH, 'nodes.json')) / 1e6,
             os.path.getsize(os.path.join(GRAPH, 'routes.json')) / 1e6))

    # 검색용 목록도 함께 갱신한다 — 안 하면 새 정류장이 검색에 안 잡힌다
    search = [{'i': i, 'n': nd['name'], 'k': ''.join(x[0] for x in nd['kinds'])}
              for i, nd in enumerate(nodes)]
    C.save_json(os.path.join(GRAPH, 'stops.json'), {'stops': search})
    C.log('   stops.json %.1fMB (검색 항목 %d개)'
          % (os.path.getsize(os.path.join(GRAPH, 'stops.json')) / 1e6, len(search)))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='광역시 시내버스를 그래프에 얹는다')
    ap.add_argument('--only', help='도시 파일 골라서 (busan,daegu,incheon,gwangju,daejeon)')
    build(ap.parse_args().only)
