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
import json
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
# 원천(OA-12913)의 「교통수단타입명」 → 우리 종류.
# **이 표에 있는 노선은 추측하지 않는다.** route_kind() 는 원천에 없는 노선만 맡는다.
SOURCE_KIND = {
    '서울간선버스': 'trunk',   '서울지선버스': 'branch',  '서울마을버스': 'village',
    '서울광역버스': 'express', '서울심야버스': 'night',   '서울순환버스': 'circular',
    '경기간선버스': 'trunk',   '경기지선버스': 'branch',  '경기마을버스': 'village',
    '경기광역버스': 'express', '인천간선버스': 'trunk',   '인천지선버스': 'branch',
    '인천광역버스': 'express', '공항버스': 'express',
}


def load_headways():
    """노선기본정보(OA-15262)에서 **노선별 평균배차간격(분)** 을 읽는다.

    주의: 이 데이터셋의 최신 판(서울시버스노선ID정보*.xlsx)은 노선명·ID 두 열뿐이다.
    배차간격(CARALC)·노선유형·기점종점이 실린 마지막 판은 **2024년1~4월 기준** 파일이라
    그것을 받는다(fetch_open_files.py 의 routeinfo seq 25). 2년 묵은 값이지만
    배차는 개편 없이는 잘 안 바뀌고, 종류별 상수 하나보다 노선별 실측이 훨씬 낫다.
    같은 노선이 넉 달 치 있으므로 기준일이 가장 늦은 행을 쓴다.
    """
    # 1순위: 오늘의 배차 — 서울시 노선정보조회 API 스냅숏 (fetch_headways.py, D-63).
    # 키가 있어야 만들어지는 파일이라 없으면 조용히 2024 인가값으로 물러난다.
    out = {}
    cur = os.path.join(C.DATA, 'bus', 'headways.json')
    if os.path.exists(cur):
        try:
            with open(cur, encoding='utf-8') as fh:
                doc = json.load(fh)
            for nm, rec in (doc.get('routes') or {}).items():
                hw = rec.get('headwayMin')
                if hw and 3 <= hw <= 60:
                    out[str(nm).strip()] = float(hw)
            C.log('  배차간격(현재, %s): %d개' % (doc.get('fetchedAt', '?'), len(out)))
        except (ValueError, OSError):
            pass

    hits = glob.glob(os.path.join(C.RAW, 'open', 'routeinfo', '*.xlsx'))
    rows = None
    for f in hits:
        try:
            tabs = C.read_tables(f)
        except Exception:
            continue
        tabs = tabs if isinstance(tabs[0], tuple) else [('?', tabs)]
        for _nm, data in tabs:
            if data and 'CARALC' in [str(c).strip() for c in data[0]]:
                rows = data
                break
        if rows:
            break
    if not rows:
        return out
    head = [str(c).strip() for c in rows[0]]
    i_de, i_nm, i_hw = head.index('STDR_DE'), head.index('ROUTE_NM'), head.index('CARALC')
    latest = {}
    for r in rows[1:]:
        try:
            nm, de, hw = str(r[i_nm]).strip(), str(r[i_de]).strip(), float(r[i_hw])
        except (ValueError, TypeError, IndexError):
            continue
        if not (3 <= hw <= 60):        # 0·빈값·비상식값은 버린다
            continue
        if nm not in latest or de > latest[nm][0]:
            latest[nm] = (de, hw)
    added = 0
    for nm, v in latest.items():
        if nm not in out:                 # 현재값이 있으면 2024값은 덮지 않는다
            out[nm] = v[1]
            added += 1
    if added:
        C.log('  배차간격(2024 인가로 보충): %d개' % added)
    return out


def load_source_kinds():
    """버스 승하차 집계본에서 노선별 종류를 읽어 온다(build_datasets.py 가 먼저 돌아야 한다).

    없으면 빈 표를 돌려주고 이름 규칙으로 물러난다 — 자료가 없다고 죽지는 않는다.
    """
    p = os.path.join(C.DATA, 'bus', 'index.json')
    if not os.path.exists(p):
        return {}
    try:
        with open(p, encoding='utf-8') as fh:      # io 를 import 하지 않는 파일이다
            doc = json.load(fh)
    except (ValueError, OSError):
        return {}
    out = {}
    for r in doc.get('routes', []):
        k = SOURCE_KIND.get((r.get('vehicleType') or '').strip())
        if k:
            out[str(r.get('route', '')).strip()] = k
    return out


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
    'trunk':    {'vehicle': 'busTrunk',   'name': '간선버스', 'minutes': 2.6},
    'branch':   {'vehicle': 'busBranch',  'name': '지선버스', 'minutes': 2.6},
    'village':  {'vehicle': 'busVillage', 'name': '마을버스', 'minutes': 2.2},
    'express':  {'vehicle': 'busExpress', 'name': '광역버스', 'minutes': 4.2},
    'night':    {'vehicle': 'busTrunk',   'name': '심야버스', 'minutes': 2.6},
    # 순환버스(01A·01B 남산순환, 상암A21)는 원천이 마을버스와 따로 세지만
    # **차는 마을버스급 소형**이다. 좌석은 마을버스와 같이 두고 종류만 구분한다.
    'circular': {'vehicle': 'busVillage', 'name': '순환버스', 'minutes': 2.2},
    'subway':   {'vehicle': 'subwayCar',  'name': '지하철',   'minutes': 2.0},
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
    seen_pairs = {}          # (호선, 이름) → 번호들 / (호선, 번호) → 원래 이름들 — 접점 힌트용
    junction_hint = {}       # 호선 → {접점역 이름}
    for r in rows[1:]:
        if len(r) <= max(i_l, i_no, i_nm):
            continue
        try:
            no = int(float(r[i_no]))
        except (ValueError, TypeError):
            continue
        ln = re.sub(r'[^0-9]', '', str(r[i_l]))
        raw_nm = str(r[i_nm]).strip()
        nm = re.sub(r'\s*\([^)]*\)\s*$', '', raw_nm)
        # ★ 접점 힌트 ★ — 지선이 갈라지는 역은 원천에 두 번 나온다:
        #   같은 이름이 딴 번호로(성수 211/9002, 신도림 234/9003 — 9000번대 포함해 본다),
        #   또는 같은 번호에 딴 원래 이름으로(강동 2549 = 「강동」과 「강동(하남검단산)」).
        base_nm = re.sub(r'E$|S$', '', nm)
        k1 = (ln, base_nm)
        seen_pairs.setdefault(k1, set()).add(no)
        if len(seen_pairs[k1]) > 1:
            junction_hint.setdefault(ln, set()).add(base_nm)
        k2 = (ln, no)
        seen_pairs.setdefault(k2, set()).add(raw_nm)
        if len(seen_pairs[k2]) > 1:
            junction_hint.setdefault(ln, set()).add(base_nm)
        if no >= 9000:
            continue          # 9000번대는 지선·순환 표시(응암S·성수E) — 본선 배열에는 안 넣는다
        lines.setdefault(ln, {})[no] = nm

    # ★ 좌표 빌리기의 세 가지 함정 (D-80, 2026-09-05 전수 훑기로 발견) ★
    #   ① 동명 정류장이 딴 도시에 있다 — 「종합운동장역」 정류장은 **안양**에 있어
    #      2호선 종합운동장이 16.9km 밖으로 날아갔다(잠실새내↛종합운동장 인접거리로 발각).
    #      → 후보를 무리 지어 **호선 중심에 가장 가까운 무리**만 쓴다.
    #   ② 빌릴 정류장이 없는 역(여의나루)은 통째로 사라졌다 → 번호 이웃으로 **보간**한다.
    #   ③ 역번호 순서가 지리 순서가 아니다 — 나중에 생긴 역(동묘앞 159, 남위례)은 큰 번호를
    #      받아 배열 끝으로 가고, 지선(신정·성수·마천)은 본선 뒤에 이어붙는다. 그대로 두면
    #      길찾기가 **없는 선로**(신답→강남 22정거장)를 태운다 → 기하로 수리하고 지선은 자른다.
    def hav(a, b):
        from math import radians, sin, cos, asin, sqrt
        la1, lo1, la2, lo2 = map(radians, (a[0], a[1], b[0], b[1]))
        h = sin((la2 - la1) / 2) ** 2 + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2) ** 2
        return 2 * 6371000 * asin(sqrt(h))

    def clusters(cands):
        """후보 정류장을 400m 무리로 묶는다 -> [(lat, lon, n)]."""
        out = []
        for c in cands:
            for cl in out:
                if hav((c['lat'], c['lon']), (cl[0] / cl[2], cl[1] / cl[2])) < 400:
                    cl[0] += c['lat']; cl[1] += c['lon']; cl[2] += 1
                    break
            else:
                out.append([c['lat'], c['lon'], 1])
        return [(la / n, lo / n, n) for la, lo, n in out]

    stations, pending = {}, []
    for ln, by_no in lines.items():
        for no, nm in by_no.items():
            sid = 'S%s-%d' % (ln, no)
            # 정식 이름(「미아사거리역」)을 먼저 찾는다. 정규화만 쓰면
            # 「미아」와 「미아사거리」가 같은 좌표를 물려받는다.
            cands = (by_exact.get(nm + '역') or by_exact.get(nm)
                     or by_name.get(canon_name(nm)) or by_name.get(canon_name(nm + '역')) or [])
            if not cands:
                pending.append((ln, no, nm))          # ② 나중에 보간
                continue
            cls = clusters(cands)
            stations[sid] = {'id': sid, 'ars': '', 'name': nm + '역',
                             'lat': cls[0][0], 'lon': cls[0][1],
                             'kind': 'subway', 'line': ln, 'no': no,
                             '_cls': cls, '_amb': cls if len(cls) > 1 else None}
    # 무리가 여럿인 역 고르기 — 두 단계, 두 번 돈다(이웃도 지금 고쳐지는 중이라).
    #   ① **번호 이웃 가운데**에서 2km 안인 무리가 있으면 그것 (제일 강한 근거).
    #      「미아역」이라는 정류장은 없다 — 정규화 통(canon 「미아」)에 미아역앞·미아사거리
    #      정류장이 섞여 오는데, 옛 평균은 우연히 그 사이에 떨어져 들키지 않았고
    #      무리 하나만 고르면 미아가 미아사거리 위에 앉아 두 역이 한 노드로 뭉쳐졌다.
    #   ② 그런 무리가 없으면 호선 중심에 가까운 무리 (안양 종합운동장 같은 딴 도시 걸러내기).
    for _amb_pass in range(2):
        for ln, by_no in lines.items():
            sure = [(s2['lat'], s2['lon']) for s2 in stations.values()
                    if s2['line'] == ln and s2.get('_amb') is None]
            if not sure:
                continue
            ctr = (sum(a for a, _ in sure) / len(sure), sum(b for _, b in sure) / len(sure))
            nos = sorted(n for n in by_no if ('S%s-%d' % (ln, n)) in stations)
            for k, no in enumerate(nos):
                s2 = stations['S%s-%d' % (ln, no)]
                if s2.get('_amb') is None:
                    continue
                best = None
                if 0 < k < len(nos) - 1:
                    a2 = stations['S%s-%d' % (ln, nos[k - 1])]
                    b2 = stations['S%s-%d' % (ln, nos[k + 1])]
                    if hav((a2['lat'], a2['lon']), (b2['lat'], b2['lon'])) <= 4200:
                        mid = ((a2['lat'] + b2['lat']) / 2, (a2['lon'] + b2['lon']) / 2)
                        near = [cl for cl in s2['_amb'] if hav((cl[0], cl[1]), mid) < 2000]
                        if near:
                            best = min(near, key=lambda cl: hav((cl[0], cl[1]), mid))
                if best is None:
                    best = min(s2['_amb'], key=lambda cl: hav((cl[0], cl[1]), ctr))
                if _amb_pass and hav((s2['lat'], s2['lon']), (best[0], best[1])) > 700:
                    C.log('    좌표 판정: %s호선 %s — 동명 정류장 무리 %d개 중 이웃·호선에 맞는 쪽 채택'
                          % (ln, s2['name'], len(s2['_amb'])))
                s2['lat'], s2['lon'] = best[0], best[1]
    for s2 in stations.values():
        s2.pop('_amb', None)

    # ★ 좌표 의심 확인 ★ — 번호 이웃 사이의 「가운데」에서 2.5km 넘게 벗어난 역은
    # 빌린 좌표가 틀린 것이다. 실제 사례 셋:
    #   종합운동장 — 「종합운동장역」 정류장이 전부 **안양**에 있었다(16.9km).
    #   용두 — 번호 이웃(신정네거리·까치산)이 딴 지선이라 가운데가 거짓말 → 호선 곁 무리를 믿는다.
    #   남한산성입구 — 산 입구 등산 정류장(4.4km 북쪽)을 빌렸고, 그 오염이 산성 보간까지
    #   번졌다 → **보간 전에**, 좌표 없는 이웃은 건너뛰고, 고칠 때마다 다시 검사한다(3회).
    for _sus in range(3):
        fixed_any = False
        for ln, by_no in lines.items():
            nos = sorted(n for n in by_no if ('S%s-%d' % (ln, n)) in stations)
            for k in range(len(nos)):
                m = stations['S%s-%d' % (ln, nos[k])]
                if k == 0 or k == len(nos) - 1:
                    continue
                a2 = stations['S%s-%d' % (ln, nos[k - 1])]
                b2 = stations['S%s-%d' % (ln, nos[k + 1])]
                ab = hav((a2['lat'], a2['lon']), (b2['lat'], b2['lon']))
                if ab > 4200:
                    continue
                mid = ((a2['lat'] + b2['lat']) / 2, (a2['lon'] + b2['lon']) / 2)
                if hav((m['lat'], m['lon']), mid) <= 2500:
                    continue
                near = [cl for cl in m.get('_cls', []) if hav((cl[0], cl[1]), mid) < 2000]
                others = [(s3['lat'], s3['lon']) for s3 in stations.values()
                          if s3['line'] == ln and s3['id'] != m['id']]
                on_line = [cl for cl in m.get('_cls', [])
                           if any(hav((cl[0], cl[1]), o) < 2500 for o in others)]
                if near:
                    m['lat'], m['lon'] = near[0][0], near[0][1]
                    C.log('    좌표 의심 → 무리 재선택: %s호선 %s' % (ln, m['name']))
                elif on_line:
                    m['lat'], m['lon'] = on_line[0][0], on_line[0][1]
                    C.log('    좌표 의심 → 호선 곁 무리 채택: %s호선 %s (번호 이웃이 딴 지선이었다)'
                          % (ln, m['name']))
                else:
                    m['lat'], m['lon'] = mid
                    C.log('    좌표 의심 → 이웃 가운데로: %s호선 %s (빌린 정류장이 동명 딴 곳이었다)'
                          % (ln, m['name']))
                fixed_any = True
        if not fixed_any:
            break
    for s2 in stations.values():
        s2.pop('_cls', None)

    for ln, no, nm in pending:                          # ② 번호 이웃 보간
        by_no = lines[ln]
        lo_ = max((n for n in by_no if n < no and ('S%s-%d' % (ln, n)) in stations), default=None)
        hi_ = min((n for n in by_no if n > no and ('S%s-%d' % (ln, n)) in stations), default=None)
        if lo_ is None or hi_ is None:
            missing.append(ln + '/' + nm)
            continue
        a, b = stations['S%s-%d' % (ln, lo_)], stations['S%s-%d' % (ln, hi_)]
        # ★ 이웃 번호가 지리로도 이웃일 때만 보간한다 ★ — 2호선 용답의 번호 이웃은
        # 충정로(본선 끝)와 신답이라 그 「가운데」는 도심 한복판이고, 그 가짜 좌표가
        # 본선을 두 동강 냈다. 문턱 4.2km: 사이에 새 역이 하나 끼어 이웃이 두 정거장
        # 거리인 경우(산성 3.6km — 남위례가 새 번호를 받아 번호상 이웃이 아니다)와
        # 강 건너(여의나루 2.9km)는 살리고, 딴 동네(용답 7.5km)는 거부한다.
        if hav((a['lat'], a['lon']), (b['lat'], b['lon'])) > 4200:
            missing.append(ln + '/' + nm + '(보간 불가 — 번호 이웃이 지리 이웃이 아님)')
            C.log('    좌표 보간 포기: %s호선 %s — 번호 이웃(%s·%s)이 서로 멀다' % (ln, nm, a['name'], b['name']))
            continue
        sid = 'S%s-%d' % (ln, no)
        stations[sid] = {'id': sid, 'ars': '', 'name': nm + '역',
                         'lat': (a['lat'] + b['lat']) / 2, 'lon': (a['lon'] + b['lon']) / 2,
                         'kind': 'subway', 'line': ln, 'no': no}
        C.log('    좌표 보간: %s호선 %s — 정류장이 없어 이웃(%s·%s) 가운데로' % (ln, nm, a['name'], b['name']))

    def dist(x, y):
        return hav((stations[x]['lat'], stations[x]['lon']), (stations[y]['lat'], stations[y]['lon']))

    CUT, INSERT_MAX, ATTACH = 3200.0, 2500.0, 3000.0
    routes = {}
    for ln, by_no in lines.items():
        order = [('S%s-%d' % (ln, no)) for no in sorted(by_no) if ('S%s-%d' % (ln, no)) in stations]
        if len(order) < 2:
            continue
        # ③-1 번호순 배열을 큰 틈(3.2km)에서 자른다. 가장 긴 토막이 본선.
        #     (역번호는 개통 순서라 지리 순서가 아니다 — 지선·신설역이 뒤에 이어붙는다.)
        segs, cur = [], [order[0]]
        for k in range(1, len(order)):
            if dist(order[k - 1], order[k]) > CUT:
                segs.append(cur); cur = [order[k]]
            else:
                cur.append(order[k])
        segs.append(cur)
        segs.sort(key=len, reverse=True)
        main = segs[0]
        pool = [st for sg in segs[1:] for st in sg]
        # ③-2 본선 안 홑 꼬임 수리(동묘앞 159: 번호가 커서 맨끝에 갔다) —
        #     양옆을 크게 우회시키는 역을 가장 덜 늘어나는 틈에 다시 꽂는다.
        for _pass in range(3):
            moved = False
            i = 0
            while i < len(main):
                prev = main[i - 1] if i > 0 else None
                nxt = main[i + 1] if i + 1 < len(main) else None
                if prev and nxt:
                    detour = dist(prev, main[i]) + dist(main[i], nxt) - dist(prev, nxt)
                    limit = 3000.0
                else:
                    detour = dist(prev, main[i]) if prev else dist(main[i], nxt)
                    limit = 2200.0   # 끝점은 우회가 아니라 「맨끝이 멀다」 — 문턱을 낮춘다
                if detour <= limit:
                    i += 1
                    continue
                cand = main[:i] + main[i + 1:]
                best_j, best_add = None, None
                for j in range(1, len(cand)):
                    add = dist(cand[j - 1], main[i]) + dist(main[i], cand[j]) - dist(cand[j - 1], cand[j])
                    if best_add is None or add < best_add:
                        best_j, best_add = j, add
                if best_add is not None and best_add < detour - 1500:
                    st = main[i]
                    C.log('    순서 수리: %s호선 %s — 번호 순서가 지리와 달라 %s 뒤로 옮김'
                          % (ln, stations[st]['name'], stations[cand[best_j - 1]]['name']))
                    main = cand[:best_j] + [st] + cand[best_j:]
                    moved = True
                    i = 0
                else:
                    i += 1
            if not moved:
                break
        # ③-3 남은 역들을 **최근접 사슬**로 먼저 엮는다(번호가 두 지선을 섞어 놓으므로 —
        #     2호선 용두는 250번이라 신정지선 번호 사이에 있다). 그 다음:
        #       홑 사슬(새로 생겨 큰 번호를 받은 본선 역 — 남위례 2828, 강일 2562)은 본선의
        #       가장 싼 틈(2.5km 안 추가)에 꽂고, 두 역 이상 사슬은 지선으로 등록한다.
        #     덩어리를 낱개로 흡수하면 본선이 지선을 경유해 버린다(실제로 5호선이 마천지선을 삼켰다).
        chains = []
        left = list(pool)
        while left:
            head = min(left, key=lambda st: min(dist(st, m) for m in main))
            chain = [head]
            left.remove(head)
            while left:
                nxt = min(left, key=lambda st: dist(chain[-1], st))
                if dist(chain[-1], nxt) > CUT:
                    break
                chain.append(nxt)
                left.remove(nxt)
            chains.append(chain)
        kept_chains = []
        for chain in chains:
            if len(chain) == 1:
                st = chain[0]
                best_j, best_add = None, None
                for j in range(len(main) + 1):
                    if j == 0:
                        add = dist(st, main[0])
                    elif j == len(main):
                        add = dist(main[-1], st)
                    else:
                        add = dist(main[j - 1], st) + dist(st, main[j]) - dist(main[j - 1], main[j])
                    if best_add is None or add < best_add:
                        best_j, best_add = j, add
                if best_add is not None and best_add <= INSERT_MAX:
                    C.log('    본선 복귀: %s호선 %s — %s 자리로'
                          % (ln, stations[st]['name'],
                             ('맨 앞' if best_j == 0 else stations[main[best_j - 1]]['name'] + ' 뒤')))
                    main = main[:best_j] + [st] + main[best_j:]
                    continue
            kept_chains.append(chain)
        routes['S' + ln] = {'routeId': 'S' + ln, 'name': ln + '호선', 'kind': 'subway', 'order': main}
        # ③-4 지선 등록: 접속역은 원천의 접점 힌트(두 번 적힌 역 — 강동·성수·신도림)가 우선.
        #     기하만으로는 못 가린다 — 둔촌동은 실제 접점 강동보다 길동에 더 가깝다.
        bi = 0
        for chain in kept_chains:
            hints = junction_hint.get(ln, set())
            best = None
            for flip in (False, True):
                sq = list(reversed(chain)) if flip else list(chain)
                for m in main:
                    d0 = dist(sq[0], m)
                    if d0 > ATTACH:
                        continue
                    d = d0 + dist(sq[1] if len(sq) > 1 else sq[0], m)
                    hinted = stations[m]['name'].replace('역', '') in hints
                    key = (0 if hinted else 1, d)
                    if best is None or key < best[0]:
                        best = (key, m, flip)
            if best:
                if best[2]:
                    chain = list(reversed(chain))
                chain = [best[1]] + chain
            if len(chain) < 2:
                C.log('    지선 버림: %s호선 외톨이 %s' % (ln, stations[chain[0]]['name']))
                continue
            bi += 1
            nm0 = stations[chain[0]]['name'].replace('역', '')
            nm1 = stations[chain[-1]]['name'].replace('역', '')
            C.log('    지선 분리: %s호선 %s~%s (%d역)' % (ln, nm0, nm1, len(chain)))
            routes['S%s-b%d' % (ln, bi)] = {'routeId': 'S%s-b%d' % (ln, bi),
                                            'name': '%s호선 지선(%s~%s)' % (ln, nm0, nm1),
                                            'kind': 'subway', 'order': chain}
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
    src_kinds = load_source_kinds()
    C.log('  노선 종류: 원천이 알려 준 것 %d개 (나머지는 이름으로 추측)' % len(src_kinds))
    headways = load_headways()
    C.log('  배차간격 합계: %d개 노선 (현재 API 우선, 2024 인가값 보충)' % len(headways))
    routes = []
    split_ok = split_no = 0
    guessed = 0
    for rid, rec in sorted(bus_routes.items()):
        kind = src_kinds.get(str(rec['name']).strip())
        if kind is None:
            kind = route_kind(rec['name'])       # 원천에 없는 노선만 이름으로 본다
            guessed += 1
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
                       # 인가 평균배차간격(분). 없으면 loads.js 가 종류별 중앙값으로 물러난다
                       'headwayMin': headways.get(str(rec['name']).strip()),
                       # 왕복을 **방향별로** 나눈 두 줄 (순환 노선만 한 줄)
                       'dirs': dirs,
                       # 원래 정류장 ID 도 같이 둔다 — 승하차 자료(NODE_ID 기준)와 이어야 하므로.
                       # 노드 번호만 남기면 「이 자리의 승객 수」를 영영 못 찾는다.
                       'stops': stops})
    C.log('    버스 방향 가르기: 두 방향 %d개 · 한 줄로 둔 것(순환 등) %d개' % (split_ok, split_no))
    C.log('    노선 종류를 이름으로 추측한 것 %d개' % guessed)
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
        line_no = re.sub(r'[^0-9]', '', rec['name'].split('호선')[0])   # 지선 이름에서도 호선 숫자만
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
