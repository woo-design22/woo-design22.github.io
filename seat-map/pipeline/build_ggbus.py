# -*- coding: utf-8 -*-
"""경기 광역버스를 그래프에 얹고, 승하차를 서울 버스와 같은 모양으로 낸다 (D-109).

★ 무엇이 특별한가 ★ 광역시 시내버스(D-106)는 승하차가 없어 노선망만 얹었다.
경기 광역버스는 「노선별 정류장별 시간대별」 승하차가 있다 — 서울 버스와 같은 모양의
파일(data/bus/routes/…)을 만들면 **엔진 수정 없이** OD 재차·앉을 확률까지 그대로 돈다.
어르신이 서서 한 시간을 갈지 앉아 갈지가 가장 크게 갈리는 노선들이 바로 이것들이다.

★ 잇는 열쇠는 정류소 ID ★ TAGO nodeid = 'GGB'+GBIS 정류소아이디 = 승하차 자료의
정류소아이디. 이름 맞추기가 아예 없다. 같은 번호가 여러 시에 있으면(3100이 4개)
**정류장 ID 겹침이 가장 큰 TAGO 노선**에 승하차를 붙인다.

★ 구간 시간은 좌표에서 잰다 ★ 광역버스는 정류장 사이가 고속도로 한 구간(십수 km)일 수
있어 시내버스 상수(구간 4.2분)로는 소요시간이 엉터리가 된다. 정류장 좌표로 거리를 재고
표정속도 30km/h 로 나눠 노선마다 구간 분을 정한다(1.2~6분 사이로 자른다).

그래프 되돌림 규칙은 build_citybus(D-106)와 같다 — GG- 노선과 gg 표시 노드를 걷어내고
다시 붙인다. build_citybus 를 다시 돌리면 이 노드들도 함께 걷히므로, 순서는 늘
build_citybus → build_ggbus → build_intercity 다.

사용: python pipeline/build_ggbus.py
"""
import collections
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C           # noqa: E402
import build_citybus as CB   # noqa: E402  (NodeIndex·split_round_trip·haversine 재사용)

RAW = os.path.join(C.RAW, 'ggbus')
GRAPH = os.path.join(C.DATA, 'graph')
BUS_DIR = os.path.join(C.DATA, 'bus', 'routes')
SPEED_KMH = 30.0            # 광역버스 표정속도(시내+고속도로 섞임) — 어림, 아래서 근거 확인
SEG_MIN, SEG_MAX = 1.2, 6.0


def safe_name(n):
    import re
    return re.sub(r'[^0-9A-Za-z가-힣_-]', '_', str(n))


def load_boardings():
    """월별 CSV(파이프 구분) → (노선번호, 운행업체)별 {정류소ID: on[24]/off[24]}, 하루 평균.

    ★ 노선번호만으로 묶으면 안 된다 ★ 「3100」이 네 회사에 있다 — 번호로만 합치면
    네 노선의 승객이 한 노선에 눌어붙고 나머지 셋은 통째로 사라진다. 업체명으로 가른다."""
    files = sorted(f for f in os.listdir(RAW) if f.endswith('.csv'))
    if not files:
        C.die('%s 에 승하차 CSV 가 없다. fetch_ggbus.py 를 먼저 돌린다.' % RAW)
    on = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0] * 24))
    off = collections.defaultdict(lambda: collections.defaultdict(lambda: [0.0] * 24))
    names = {}
    days = set()
    rows = 0
    for fn in files:
        path = os.path.join(RAW, fn)
        with io.open(path, encoding='utf-8-sig', errors='replace') as f:
            head = f.readline().strip().split('|')
            col = {h: i for i, h in enumerate(head)}
            try:
                iy, ih, ino = col['운행일자'], col['시간대'], col['노선번호']
                ico = col['운행업체명']
                iid, inm = col['정류소아이디'], col['정류소명']
                ion = [i for h, i in col.items() if h.startswith('승차')][0]
                ioff = [i for h, i in col.items() if h.startswith('하차')][0]
            except (KeyError, IndexError):
                C.die('%s 열 구성이 다르다: %s' % (fn, head))
            for line in f:
                c = line.rstrip('\n').split('|')
                if len(c) <= max(ion, ioff):
                    continue
                try:
                    h = int(c[ih])
                    a, b = float(c[ion] or 0), float(c[ioff] or 0)
                except ValueError:
                    continue
                if not (0 <= h < 24):
                    continue
                key, sid = (c[ino].strip(), c[ico].strip()), c[iid].strip()
                on[key][sid][h] += a
                off[key][sid][h] += b
                names.setdefault(sid, c[inm].strip())
                days.add(c[iy].replace('-', '')[:8])
                rows += 1
        C.log('  %s 읽음 (누적 %d행)' % (fn, rows))
    nd = max(1, len(days))
    for d in (on, off):
        for no in d:
            for sid in d[no]:
                arr = d[no][sid]
                for h in range(24):
                    arr[h] = round(arr[h] / nd, 2)
    C.log('  노선 %d개 · 날 %d일 · %d행' % (len(on), nd, rows))
    return on, off, names, sorted(days)


def seg_minutes(seq):
    """정류장 좌표로 잰 노선의 구간당 분."""
    dist = 0.0
    for i in range(len(seq) - 1):
        dist += CB.haversine(seq[i][1], seq[i][2], seq[i + 1][1], seq[i + 1][2])
    if len(seq) < 2:
        return 2.5
    per_km = dist / 1000.0 / (len(seq) - 1)
    return round(min(SEG_MAX, max(SEG_MIN, per_km / SPEED_KMH * 60.0)), 1)


def main():
    tago = json.load(io.open(os.path.join(RAW, 'routes.json'), encoding='utf-8'))
    on, off, stop_names, days = load_boardings()

    nodes_doc = json.load(io.open(os.path.join(GRAPH, 'nodes.json'), encoding='utf-8'))
    routes_doc = json.load(io.open(os.path.join(GRAPH, 'routes.json'), encoding='utf-8'))
    nodes, routes = nodes_doc['nodes'], routes_doc['routes']
    before_n, before_r = len(nodes), len(routes)

    # 되돌림 — 앞서 붙인 GG- 노선과 gg 노드를 걷어낸다 (build_citybus 와 같은 방식)
    routes[:] = [r for r in routes if not str(r.get('id', '')).startswith('GG-')]
    first_gg = next((i for i, n in enumerate(nodes) if n.get('gg')), None)
    if first_gg is not None:
        tail = nodes[first_gg:]
        if not all(n.get('gg') for n in tail):
            C.die('gg 노드가 꼬리에 모여 있지 않다 — 손으로 확인할 것')
        used = max((max(d) for r in routes for d in (r.get('dirs') or []) if d), default=-1)
        if used >= first_gg:
            C.die('지우려는 노드(%d 이상)를 아직 쓰는 노선이 있다 — build_intercity 를 먼저 걷을 것' % first_gg)
        del nodes[first_gg:]
        C.log('  앞서 붙인 경기 정류장 %d개를 걷어냈다' % len(tail))
    base_len = len(nodes)
    idx = CB.NodeIndex(nodes)

    # 승하차의 노선번호 → TAGO 노선: 같은 번호 중 정류장 ID 겹침이 가장 큰 것
    by_no = collections.defaultdict(list)
    for r in tago['routes']:
        by_no[r['no']].append(r)
    made, skipped, name_used = 0, [], {}
    used_rids = set()
    os.makedirs(BUS_DIR, exist_ok=True)
    for fn in os.listdir(BUS_DIR):              # 지난 실행의 경기 파일을 먼저 걷는다(이름이 바뀔 수 있다)
        if fn.startswith('경기_'):
            os.remove(os.path.join(BUS_DIR, fn))
    for key in sorted(on):
        no, comp = key
        cands = by_no.get(no)
        if not cands:
            skipped.append('%s(%s)' % (no, comp[:4]))
            continue
        sids = set(on[key])
        best, best_ov = None, -1
        for r in cands:
            if r['id'] in used_rids:            # 같은 TAGO 노선을 두 업체가 나눠 갖지 않게
                continue
            ov = sum(1 for s in r['stops'] if s[5][3:] in sids)
            if ov > best_ov:
                best, best_ov = r, ov
        r = best
        if r is None or best_ov < 3:
            skipped.append('%s(%s)' % (no, comp[:4]))
            continue
        used_rids.add(r['id'])

        seq = sorted(((s[3], s[0], s[1], s[2], s[5][3:]) for s in r['stops']))
        # split_round_trip 은 [(순번,이름,위도,경도)] 를 받는다 — ID 는 자리로 되찾는다
        plain = [(o, nm, la, lo) for o, nm, la, lo, _sid in seq]
        cut = CB.split_round_trip(plain)
        seqs = [seq[:len(cut[0])], seq[len(cut[0]) - 1:]] if cut else [seq]

        dirs, stop_keys = [], []
        for sq in seqs:
            if len(sq) < 3:
                continue
            pairs = []
            for o, nm, la, lo, sid in sq:
                ni = idx.place(nm, la, lo, 'GG-' + no)
                if not pairs or pairs[-1][0] != ni:
                    pairs.append((ni, sid))
            if len(pairs) >= 3:
                dirs.append([p[0] for p in pairs])
                stop_keys.append([p[1] for p in pairs])
        if not dirs:
            skipped.append(no)
            continue

        name = '경기 %s' % no
        if name in name_used:                      # 3100 이 네 시에 있다 — 시로 가른다
            name = '경기 %s(%s)' % (no, r['city'])
        name_used[name] = 1
        mins = seg_minutes([(nm, la, lo) for _o, nm, la, lo, _s in seq])
        routes.append({'id': 'GG-' + r['id'], 'name': name, 'kind': 'express',
                       'vehicle': 'busExpress', 'minutes': mins,
                       'dirs': dirs, 'stops': stop_keys})

        # 승하차 파일 — 서울 버스(build_datasets)와 같은 모양이라 엔진이 그대로 읽는다
        st_list = []
        seen = set()
        for keys in stop_keys:
            for sid in keys:
                if sid in seen:
                    continue
                seen.add(sid)
                st_list.append({'stopId': sid, 'ars': '',
                                'name': stop_names.get(sid, ''),
                                'on': on[key].get(sid, [0.0] * 24),
                                'off': off[key].get(sid, [0.0] * 24)})
        C.save_json(os.path.join(BUS_DIR, safe_name(name) + '.json'),
                    {'route': name, 'routeName': '%s번(%s, %s)' % (no, r['city'], r['type']),
                     'vehicleType': '경기광역버스', 'startMinutes': 0, 'slotMinutes': 60,
                     'slots': 24, 'months': sorted({d[:6] for d in days}),
                     'unit': '하루 평균 승객수(명) — 일자별 원천을 날 수로 나눈 값. '
                             '요일 구분 없음(엔진이 실측 요일 비로 되돌린다)',
                     'stops': st_list})
        made += 1

    if skipped:
        C.log('  승하차만 있고 못 이은 노선 %d개: %s%s'
              % (len(skipped), ','.join(skipped[:12]), '…' if len(skipped) > 12 else ''))
    # 이번에 새로 만든 노드에 gg 표시 — CB.NodeIndex 가 cb 는 이미 달아 줬으므로
    # build_citybus 의 꼬리 걷어내기에도 함께 걸리고, 이 스크립트 단독 재실행도 안전하다
    for n in nodes[base_len:]:
        n['gg'] = 1
    C.save_json(os.path.join(GRAPH, 'nodes.json'), nodes_doc)
    C.save_json(os.path.join(GRAPH, 'routes.json'), routes_doc)
    C.log('== 노드 %d → %d · 노선 %d → %d (경기 광역 %d) =='
          % (before_n, len(nodes), before_r, len(routes), made))

    search = [{'i': i, 'n': nd_['name'], 'k': ''.join(x[0] for x in nd_['kinds'])}
              for i, nd_ in enumerate(nodes)]
    C.save_json(os.path.join(GRAPH, 'stops.json'), {'stops': search})
    C.log('   stops.json %.1fMB (검색 항목 %d개)'
          % (os.path.getsize(os.path.join(GRAPH, 'stops.json')) / 1e6, len(search)))


if __name__ == '__main__':
    main()
