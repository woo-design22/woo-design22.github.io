# -*- coding: utf-8 -*-
"""build_graph.py — 길찾기용 그래프 (사양서 6장, M1-4 + M2-2의 입력).

**이 서비스의 본체는 길찾기다.** 노선 정보 표시가 아니다(2026-09-04 사용자 지시).
길찾기가 되려면 세 가지가 있어야 하고, 셋 다 인증키 없이 구했다.

  ① 노선의 **경유 순번**   서울시 버스노선별 정류소 정보 (OA-1095) — 41,688행
  ② 정류장 **좌표와 이름** 같은 파일에 다 들어 있다 (좌표 100%)
  ③ 지하철 역 **순서**     혼잡도 파일의 역번호를 오름차순 (실측 확인: 응암→역촌→…→신내)

만드는 것
  data/graph/nodes.json    환승 노드 — 150m 안의 정류장·역을 하나로 묶은 것
  data/graph/routes.json   노선 — 노드 번호의 순서 배열(방향별)
  data/graph/stops.json    검색용 이름 목록 (출발지·도착지 자동완성)

★ 방향을 따로 관리하지 않는다 ★
버스 원천은 **왕복이 순번 하나로** 들어 있다(147번: 1~115, 기점→회차→기점).
그래서 「순번 i < j」이면 그것이 곧 방향이다. 지하철만 역번호 오름/내림 두 줄로 만든다.
사양서 6.2-④(방향 라벨 뒤집힘)를 원천적으로 막는 구조다 — 라벨을 저장하지 않는다.

사용법
  python build_graph.py
"""
import argparse
import glob
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

OPEN = os.path.join(C.RAW, 'open')
OUT = os.path.join(C.DATA, 'graph')
CLUSTER_M = 150          # 사양서 6.2-②: 반경 150m 안의 정류장·역을 한 환승 노드로


# ── 노선 종류 (서울 버스 번호체계) ────────────────────────────────────────
# 좌석수와 정거장 소요시간 기본값이 여기서 갈린다(사양서 6.3).
def route_kind(name):
    n = str(name or '').strip().upper()
    # 「N15」뿐 아니라 「새벽A160」도 심야 전용이다. 이름으로만 알 수 있어 둘 다 잡는다.
    if n.startswith('N') or '새벽' in n:
        return 'night'                      # 심야·새벽버스 — 간선과 같은 차
    if re.match(r'^M\d', n) or re.match(r'^9\d{3}$', n) or re.match(r'^\d{4}$', n) and n.startswith('9'):
        return 'express'                    # 광역 (입석 금지)
    if re.match(r'^\d{4}$', n):
        return 'branch'                     # 지선
    if re.match(r'^\d{1,3}$', n) or re.match(r'^\d{3}[A-Z]$', n):
        return 'trunk'                      # 간선
    return 'village'                        # 마을·공항·순환 등


KIND_INFO = {
    'trunk':   {'vehicle': 'busTrunk',   'name': '간선버스', 'minutes': 2.6},
    'branch':  {'vehicle': 'busBranch',  'name': '지선버스', 'minutes': 2.6},
    'village': {'vehicle': 'busVillage', 'name': '마을버스', 'minutes': 2.2},
    'express': {'vehicle': 'busExpress', 'name': '광역버스', 'minutes': 4.2},
    'night':   {'vehicle': 'busTrunk',   'name': '심야버스', 'minutes': 2.6},
    'subway':  {'vehicle': 'subwayCar',  'name': '지하철',   'minutes': 2.0},
}


# ── 환승 노드 묶기 ────────────────────────────────────────────────────────
EARTH_M = 6371000


def haversine(a_lat, a_lon, b_lat, b_lon):
    to = math.pi / 180
    d_lat = (b_lat - a_lat) * to
    d_lon = (b_lon - a_lon) * to
    h = (math.sin(d_lat / 2) ** 2 +
         math.cos(a_lat * to) * math.cos(b_lat * to) * math.sin(d_lon / 2) ** 2)
    return 2 * EARTH_M * math.asin(min(1.0, math.sqrt(h)))


def canon_name(s):
    """정류장 이름을 맞대 보기 위한 형태. 「월곡역앞」·「월곡역 1번출구」 → 「월곡」."""
    t = re.sub(r'\s+', '', str(s or ''))
    t = re.sub(r'\(.*?\)', '', t)
    t = t.split('.')[0]                       # 「이촌2동대림아파트.새남터성지」 → 앞쪽만
    for _ in range(4):
        n2 = re.sub(r'(\d?번?출구|역앞|역전|정류장|승강장|앞|입구|건너|중앙|사거리|교차로|역)$', '', t)
        if n2 == t or not n2:
            break
        t = n2
    return t or re.sub(r'\s+', '', str(s or ''))


def cluster(points, radius_m=CLUSTER_M):
    """[{name, lat, lon, kind, id}] → 군집 번호 배열.

    ★ union-find 를 쓰지 않는다 ★
    처음엔 「150m 안이면 잇는다」를 union-find 로 했더니 **연쇄 병합**이 일어났다 —
    A~B 가 150m, B~C 가 150m 면 A~C 가 300m 라도 한 덩어리가 된다.
    정류장이 100m 간격으로 늘어선 큰길은 통째로 노드 하나가 돼 버렸다
    (실측: 13,128개 → 3,611개, 그중 3,002개가 여러 개 묶임 = 길 전체가 뭉갬).
    그러면 노선이 같은 노드를 몇 번씩 지나 경로 계산이 무너진다.

    그래서 **대표점 기준(greedy)** 으로 묶고, 붙일 조건을 하나 더 건다.
      거리 ≤ 150m  **그리고**  (종류가 다르거나 · **정식 이름이 똑같거나**)
    환승 노드의 목적이 그 둘이기 때문이다 —
    ① 지하철역과 그 앞 정류장(사양서 6.2-②의 「월곡/월곡역」) ② 같은 이름의 양방향 정류장.

    같은 종류끼리는 **정규화한 이름이 아니라 정식 이름**을 본다.
    정규화 이름으로 묶었더니 4호선 「미아」와 「미아사거리」가 한 역이 됐다
    (canon_name 이 「사거리」를 떼기 때문). 붙어 있는 두 역이 하나로 뭉개지면
    노선이 같은 노드를 연달아 지나 경로 계산이 어긋난다.
    """
    n = len(points)
    cid = [-1] * n
    cell = radius_m / 111320.0
    grid = {}
    for i, p in enumerate(points):
        grid.setdefault((int(p['lon'] / cell), int(p['lat'] / cell)), []).append(i)
    full = [re.sub(r'\s+', '', str(p['name'])) for p in points]

    nxt = 0
    for i in range(n):
        if cid[i] >= 0:
            continue
        cid[i] = nxt
        p = points[i]
        cx, cy = int(p['lon'] / cell), int(p['lat'] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k in grid.get((cx + dx, cy + dy), ()):
                    if cid[k] >= 0:
                        continue
                    q = points[k]
                    if haversine(p['lat'], p['lon'], q['lat'], q['lon']) > radius_m:
                        continue
                    same_kind = (q['kind'] == p['kind'])
                    if (not same_kind) or full[k] == full[i]:
                        cid[k] = nxt
        nxt += 1
    return cid


# ── 버스 ──────────────────────────────────────────────────────────────────
def load_bus():
    files = glob.glob(os.path.join(OPEN, 'routestops', '*.xlsx')) + \
            glob.glob(os.path.join(OPEN, 'routestops', '*.csv'))
    if not files:
        C.die('버스 노선별 정류소 정보가 없다. `python pipeline/fetch_open_files.py --only routestops`')
    rows = C.read_table(sorted(files)[-1])
    head = [re.sub(r'\s+', '', str(c)) for c in rows[0]]

    def col(*names):
        for nm in names:
            if nm in head:
                return head.index(nm)
        raise RuntimeError('컬럼을 못 찾았다: %s (머리글 %s)' % ('/'.join(names), ', '.join(head[:8])))
    i_rid, i_nm, i_sn = col('ROUTE_ID'), col('노선명'), col('순번')
    i_node, i_ars, i_stop = col('NODE_ID'), col('ARS_ID'), col('정류소명')
    i_x, i_y = col('X좌표'), col('Y좌표')

    routes, stops, bad = {}, {}, 0
    for r in rows[1:]:
        if len(r) <= max(i_x, i_y):
            bad += 1
            continue
        try:
            lon, lat, seq = float(r[i_x]), float(r[i_y]), int(float(r[i_sn]))
        except (ValueError, TypeError):
            bad += 1
            continue
        if not (33 < lat < 39 and 124 < lon < 132):
            bad += 1
            continue
        sid = str(r[i_node]).strip()
        stops[sid] = {'id': sid, 'ars': str(r[i_ars]).strip(),
                      'name': str(r[i_stop]).strip(), 'lat': lat, 'lon': lon, 'kind': 'bus'}
        rid = str(r[i_rid]).strip()
        rec = routes.setdefault(rid, {'routeId': rid, 'name': str(r[i_nm]).strip(), 'seq': []})
        rec['seq'].append((seq, sid))
    for rec in routes.values():
        rec['seq'].sort()
    return routes, stops, bad


# ── 지하철 ────────────────────────────────────────────────────────────────
def load_subway(bus_stops):
    """혼잡도 파일에서 호선·역번호·역명을 읽어 노선 순서를 만든다.

    좌표는 원천에 없다. **「◯◯역」이라는 버스정류장의 좌표를 빌린다** —
    지하철역 출입구 앞 정류장이라 실제로 100m 안쪽이고, 어차피 150m 로 한 노드가 된다.
    (제대로 된 역사마스터는 인증키가 있어야 한다 — DATA_SOURCES.md 참고.)
    """
    files = sorted(glob.glob(os.path.join(OPEN, 'congestion', '*.xlsx')) +
                   glob.glob(os.path.join(OPEN, 'congestion', '*.csv')))
    if not files:
        C.die('혼잡도 원천이 없다.')
    rows = []
    for name, sheet in C.read_tables(files[-1]):
        rows.extend(sheet[1:] if rows else sheet)
    head = [re.sub(r'\s+', '', str(c)) for c in rows[0]]

    def col(*names):
        for nm in names:
            if nm in head:
                return head.index(nm)
        return None
    i_l, i_no, i_nm = col('호선'), col('역번호'), col('역명', '출발역')
    if i_l is None or i_no is None or i_nm is None:
        raise RuntimeError('혼잡도 머리글에서 호선/역번호/역명을 못 찾았다: %s' % ', '.join(head[:6]))

    # 지하철역 이름 → 좌표. 「◯◯역」이라는 버스정류장의 좌표를 빌린다.
    # 정규화해서 맞댄다 — 「서울역」·「을지로입구역앞」·「종각역 4번출구」가 다 같은 이름이 되게.
    by_name, by_exact = {}, {}
    for s in bus_stops.values():
        by_name.setdefault(canon_name(s['name']), []).append(s)
        by_exact.setdefault(re.sub(r'\s+', '', s['name']), []).append(s)

    lines, missing = {}, []
    for r in rows[1:]:
        if len(r) <= max(i_l, i_no, i_nm):
            continue
        try:
            no = int(float(r[i_no]))
        except (ValueError, TypeError):
            continue
        if no >= 9000:
            continue          # 9000번대는 지선·순환 표시(응암S·성수E) — 본선만 쓴다
        ln = re.sub(r'[^0-9]', '', str(r[i_l]))
        nm = re.sub(r'\s*\([^)]*\)\s*$', '', str(r[i_nm]).strip())
        lines.setdefault(ln, {})[no] = nm

    stations = {}
    for ln, by_no in lines.items():
        for no, nm in by_no.items():
            sid = 'S%s-%d' % (ln, no)
            # 정식 이름(「미아사거리역」)을 먼저 찾는다. 정규화만 쓰면
            # 「미아」와 「미아사거리」가 같은 좌표를 물려받는다.
            cands = (by_exact.get(nm + '역') or by_exact.get(nm)
                     or by_name.get(canon_name(nm)) or by_name.get(canon_name(nm + '역')) or [])
            if not cands:
                missing.append(ln + '/' + nm)
                continue
            lat = sum(c['lat'] for c in cands) / len(cands)
            lon = sum(c['lon'] for c in cands) / len(cands)
            stations[sid] = {'id': sid, 'ars': '', 'name': nm + '역', 'lat': lat, 'lon': lon,
                             'kind': 'subway', 'line': ln, 'no': no}

    routes = {}
    for ln, by_no in lines.items():
        order = [('S%s-%d' % (ln, no)) for no in sorted(by_no) if ('S%s-%d' % (ln, no)) in stations]
        if len(order) < 2:
            continue
        routes['S' + ln] = {'routeId': 'S' + ln, 'name': ln + '호선', 'kind': 'subway',
                            'order': order}
    return routes, stations, missing


# ── 방향 라벨 판정 ────────────────────────────────────────────────────────
def _corr(xs, ys):
    n = len(xs)
    if n < 3:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0


def _grid_at(doc, key, minutes):
    """원천 해상도 격자에서 가장 가까운 칸을 읽는다(보간 없이 — 판정에는 충분하다)."""
    g = (doc.get('grid') or {}).get(key)
    if not g:
        return None
    slot = doc.get('slotMinutes') or 30
    start = doc.get('startMinutes') or 300
    i = int(round((minutes - start) / slot))
    return g[max(0, min(len(g) - 1, i))]


def detect_directions(line, names):
    """혼잡도의 방향 라벨 중 **어느 것이 역번호 증가 방향인가**를 자료로 판정한다.

    ★ 규칙을 손으로 박으면 안 된다 ★
    「상행선은 기점(번호 작은 쪽)」이라는 일반 규칙을 그대로 썼더니
    **1호선에서 뒤집혀 있었다.** 서울교통공사 1호선 구간(서울역 150 ~ 동묘앞 160)은
    전체 1호선의 가운데 토막인데 자체 번호를 붙였고, 상·하 표기는 전체 노선 기준을 따른다.
    2호선은 아예 상선/하선이 아니라 **내선/외선**이라 이름으로는 짝을 못 짓는다.

    판정 방법 — 물리로 정한다:
      진행 방향으로 한 정거장 갈 때 재차인원의 증감은 그 역의 (승차 - 하차)와 부호가 같다.
      라벨 L 을 「번호 증가 방향」으로 놓고 상관계수를 재서, 가장 큰 쪽이 그 방향이다.
    실측(2026-09-04, 평일 08시·18시 둘 다 같은 답):
      1호선 상선 +0.84 / 하선 -0.37,  2호선 내선 +0.29 / 외선 -0.26,  3~8호선 하선 +0.3~0.8
    """
    cong = C.load_json(os.path.join(C.DATA, 'subway', 'congestion.json'))
    ride = C.load_json(os.path.join(C.DATA, 'subway', 'ride.json'))
    if not cong or not ride:
        return None, '혼잡도·승하차 집계본이 없어 방향을 판정할 수 없다'

    labels = sorted({k.split('|')[3] for k in cong.get('grid', {})
                     if k.startswith(line + '|') and len(k.split('|')) == 4})
    if len(labels) < 2:
        return None, '방향 라벨이 %d개뿐이다' % len(labels)

    scores = {}
    for lab in labels:
        dx, dy = [], []
        for t in (8 * 60, 18 * 60):
            for i in range(len(names) - 1):
                a = _grid_at(cong, '%s|%s|weekday|%s' % (line, names[i], lab), t)
                b = _grid_at(cong, '%s|%s|weekday|%s' % (line, names[i + 1], lab), t)
                on = _grid_at(ride, '%s|%s|weekday|승차' % (line, names[i + 1]), t)
                off = _grid_at(ride, '%s|%s|weekday|하차' % (line, names[i + 1]), t)
                if None in (a, b, on, off):
                    continue
                dx.append(b - a)
                dy.append(on - off)
        scores[lab] = _corr(dx, dy)

    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    up, down = ranked[0][0], ranked[-1][0]
    margin = ranked[0][1] - ranked[-1][1]
    if ranked[0][1] <= 0 or margin < 0.15:
        return None, '판정이 뚜렷하지 않다 (%s)' % ', '.join('%s %+.2f' % kv for kv in ranked)
    return [up, down], '%s (%s)' % (up, ', '.join('%s %+.2f' % kv for kv in ranked))


SPLIT_NEAR_M = 160.0      # 맞은편 정류장은 대개 20~60m 떨어져 있다


def split_round_trip(pts):
    """왕복 한 줄로 들어온 버스 정류장 순서를 **두 방향으로 가른다.**

    ★ 이걸 안 하면 출근시간 버스가 전부 「앉을 확률 100%」가 된다 ★
    원천(OA-1095)에는 방향 열이 없다. 대신 **정류장 ID 가 방향마다 다르다** —
    「동대문역.흥인지문」이 100000398(한 방향)과 100000365(반대 방향)로 따로 있고
    승하차(OA-12913)도 그 ID 별로 따로 집계돼 있다. 즉 **자료에는 방향이 살아 있는데
    우리가 순번을 한 줄로 이어 붙여 그 구분을 뭉개고 있었다.**

    한 줄로 두면 OD 배분이 회차점을 넘어 이어져, 도심으로 몰리는 아침 승객이
    돌아 나오는 빈 차편과 섞여 평준화된다(실측: 261번 08시 한 대 최대 24명, 좌석 23
    → 「거의 다 앉는다」). 방향을 가르면 도심행만 따로 쌓인다.

    회차점 = 기점에서 **가장 멀어지는 자리**. 그다음 세 가지를 확인하고,
    하나라도 어긋나면 **가르지 않는다**(순환 노선을 가르면 안 된다):
      (1) 양쪽 다 4정류장 이상이고 길이가 심하게 치우치지 않는다
      (2) 돌아온 끝이 기점 근처다 (2km 안)
      (3) 되짚어 온다 - 가는 쪽 정류장의 절반 이상이 오는 쪽 160m 안에 짝이 있다
    (3) 이 순환 노선을 걸러 낸다. 순환은 되짚지 않고 한 바퀴 돌기 때문이다.
    """
    n = len(pts)
    if n < 10:
        return None
    a0 = pts[0]
    k, best = 0, -1.0
    for i in range(1, n):
        d = haversine(a0['lat'], a0['lon'], pts[i]['lat'], pts[i]['lon'])
        if d > best:
            best, k = d, i
    fwd, back = pts[:k + 1], pts[k:]
    if len(fwd) < 4 or len(back) < 4:
        return None
    if min(len(fwd), len(back)) / float(max(len(fwd), len(back))) < 0.55:
        return None
    if haversine(pts[-1]['lat'], pts[-1]['lon'], a0['lat'], a0['lon']) > 2000.0:
        return None
    paired = 0
    for p in fwd:
        for q in back:
            if haversine(p['lat'], p['lon'], q['lat'], q['lon']) <= SPLIT_NEAR_M:
                paired += 1
                break
    if paired / float(len(fwd)) < 0.5:
        return None
    return fwd, back


# ── 조립 ──────────────────────────────────────────────────────────────────
def build():
    C.log('== 길찾기 그래프 만들기 ==')
    bus_routes, bus_stops, bad = load_bus()
    C.log('  버스 — 노선 %d개 / 정류장 %d개%s'
          % (len(bus_routes), len(bus_stops), ', 건너뜀 %d행' % bad if bad else ''))

    sub_routes, sub_stations, missing = load_subway(bus_stops)
    C.log('  지하철 — 호선 %d개 / 역 %d개%s'
          % (len(sub_routes), len(sub_stations),
             ', 좌표 못 찾은 역 %d개' % len(missing) if missing else ''))
    if missing:
        C.log('    좌표 없음: %s%s' % (', '.join(missing[:8]), ' …' if len(missing) > 8 else ''))

    # 정류장 + 역을 한 목록으로 놓고 150m 로 묶는다
    points = list(bus_stops.values()) + list(sub_stations.values())
    roots = cluster(points)
    node_of_root, nodes, node_of_stop = {}, [], {}
    for i, p in enumerate(points):
        root = roots[i]
        idx = node_of_root.get(root)
        if idx is None:
            idx = node_of_root[root] = len(nodes)
            nodes.append({'name': p['name'], 'lat': 0.0, 'lon': 0.0,
                          'members': [], 'kinds': [], '_sx': 0.0, '_sy': 0.0})
        nd = nodes[idx]
        nd['members'].append(p['id'])
        nd['_sx'] += p['lon']; nd['_sy'] += p['lat']
        if p['kind'] not in nd['kinds']:
            nd['kinds'].append(p['kind'])
        if p['kind'] == 'subway':
            nd['name'] = p['name']          # 사람이 아는 이름은 역 이름 쪽이다
        node_of_stop[p['id']] = idx
    for nd in nodes:
        k = len(nd['members'])
        nd['lon'] = round(nd['_sx'] / k, 6); nd['lat'] = round(nd['_sy'] / k, 6)
        del nd['_sx'], nd['_sy']

    # 노선을 노드 번호의 순서 배열로
    routes = []
    split_ok = split_no = 0
    for rid, rec in sorted(bus_routes.items()):
        kind = route_kind(rec['name'])
        seqnodes, seqstops, last = [], [], -1
        for _seq, sid in rec['seq']:
            idx = node_of_stop.get(sid)
            if idx is None or idx == last:      # 같은 노드가 연달아 나오면 한 번만
                continue
            seqnodes.append(idx); seqstops.append(sid); last = idx
        if len(seqnodes) < 2:
            continue
        # 왕복 한 줄을 두 방향으로 가른다 (못 가르면 순환 노선으로 보고 한 줄로 둔다)
        pts = [bus_stops[s] for s in seqstops if s in bus_stops]
        cut = split_round_trip(pts) if len(pts) == len(seqstops) else None
        if cut:
            k = len(cut[0]) - 1
            dirs = [seqnodes[:k + 1], seqnodes[k:]]
            stops = [seqstops[:k + 1], seqstops[k:]]
            split_ok += 1
        else:
            dirs, stops = [seqnodes], [seqstops]
            split_no += 1
        routes.append({'id': rid, 'name': rec['name'], 'kind': kind,
                       'vehicle': KIND_INFO[kind]['vehicle'],
                       'minutes': KIND_INFO[kind]['minutes'],
                       # 왕복을 **방향별로** 나눈 두 줄 (순환 노선만 한 줄)
                       'dirs': dirs,
                       # 원래 정류장 ID 도 같이 둔다 — 승하차 자료(NODE_ID 기준)와 이어야 하므로.
                       # 노드 번호만 남기면 「이 자리의 승객 수」를 영영 못 찾는다.
                       'stops': stops})
    C.log('    버스 방향 가르기: 두 방향 %d개 · 한 줄로 둔 것(순환 등) %d개' % (split_ok, split_no))
    for rid, rec in sorted(sub_routes.items()):
        order = [node_of_stop[s] for s in rec['order'] if s in node_of_stop]
        if len(order) < 2:
            continue
        # ★ rstrip('역') 을 쓰면 안 된다 ★
        # 파이썬 rstrip 은 인자를 **문자 집합**으로 보고 끝에서부터 반복해 뗀다.
        # 역 이름에 '역' 을 붙여 두었으므로 서울역은 '서울역역' 이 되고, rstrip 은 '서울' 까지 깎는다.
        # 그러면 혼잡도 키('4|서울역|…')를 못 찾아 **호선 전체 최댓값**으로 물러났다
        # (4호선 서울역 08시 하선 실제 30.8% → 노선 피크 131.4% 로 읽어 「앉을 확률 0%」).
        names = [re.sub(r'역$', '', sub_stations[s]['name'])
                 for s in rec['order'] if s in node_of_stop]
        line_no = rec['name'].replace('호선', '')
        dir_labels, why = detect_directions(line_no, names)
        C.log('    %s 방향 판정: %s' % (rec['name'], why if dir_labels else '실패 — ' + why))
        routes.append({'id': rid, 'name': rec['name'], 'kind': 'subway',
                       'vehicle': 'subwayCar', 'minutes': KIND_INFO['subway']['minutes'],
                       'line': line_no,
                       'dirs': [order, list(reversed(order))],       # 상·하행 두 줄
                       # 혼잡도 자료에서 이 방향을 가리키는 라벨. **자료로 판정한 값이다**
                       # (1호선은 번호 증가 = 상선, 2호선은 내선/외선 — 일반 규칙과 다르다)
                       'dirLabels': dir_labels,
                       # 혼잡도·승하차 자료의 키가 되는 역 이름(부역명 뗀 것)
                       'stops': [names, list(reversed(names))]})

    os.makedirs(OUT, exist_ok=True)
    C.save_json(os.path.join(OUT, 'nodes.json'), {
        'radiusM': CLUSTER_M,
        'note': '150m 안의 정류장·역을 한 환승 노드로 묶은 것(사양서 6.2-②). 이름이 아니라 좌표로 묶는다.',
        'nodes': nodes})
    C.save_json(os.path.join(OUT, 'routes.json'), {
        'note': '버스는 왕복이 한 줄(순번 i<j 이면 그것이 방향), 지하철만 상·하행 두 줄. '
                '방향 라벨은 저장하지 않고 배열 끝에서 파생한다(사양서 6.2-④).',
        'kinds': KIND_INFO,
        'routes': routes})

    # 검색용 — 이름 하나에 노드 하나
    search = [{'i': i, 'n': nd['name'], 'k': ''.join(x[0] for x in nd['kinds'])} for i, nd in enumerate(nodes)]
    C.save_json(os.path.join(OUT, 'stops.json'), {'stops': search})

    mixed = sum(1 for n in nodes if len(n['kinds']) > 1)
    multi = sum(1 for n in nodes if len(n['members']) > 1)
    C.log('  노드 %d개 (여럿 묶인 것 %d개, 버스+지하철이 함께인 것 %d개)' % (len(nodes), multi, mixed))
    C.log('  노선 %d개 (버스 %d · 지하철 %d)' % (len(routes), len(bus_routes), len(sub_routes)))
    kinds = {}
    for r in routes:
        kinds[r['kind']] = kinds.get(r['kind'], 0) + 1
    C.log('  종류: ' + ' · '.join('%s %d' % (KIND_INFO[k]['name'], v) for k, v in sorted(kinds.items())))
    C.log('== %s ==' % OUT)


if __name__ == '__main__':
    argparse.ArgumentParser(description='길찾기 그래프').parse_args()
    build()
