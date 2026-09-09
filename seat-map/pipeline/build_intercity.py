# -*- coding: utf-8 -*-
"""도시 간 이동을 길찾기 그래프에 얹는다 — 지정석 노선 (D-107).

★ 무엇을 노선 하나로 만드는가 ★
「서울 → 부산, KTX」처럼 **도시 쌍 × 수단 × 등급**을 노선 하나로 본다. 정류장이 둘뿐인
노선이다(출발역/터미널 → 도착역/터미널). 도시 간 이동에서 사람이 묻는 것은 「어디서 서나」가
아니라 「언제 있고 얼마나 걸리나」이기 때문이다.

  minutes    그 등급 편들의 **소요시간 중앙값**
  headwayMin 운행하는 시간대를 편수로 나눈 값 — 엔진이 절반을 기다림으로 잡는다(D-57)
  reserved   ★ 이 표시가 핵심이다 ★ 재차를 세지 않고 「예매하면 앉는다」로 답하게 한다
  fare       어른 요금(원). 어르신에게 등급과 함께 실제로 중요한 정보다

★ 노드는 이름으로 맞춘다 ★
TAGO 의 역·터미널 목록에는 **좌표가 없다.** 그래서 그래프에 이미 있는 노드(시내버스
정류장·지하철역)와 이름으로 맞춘다 — 도시 상자 안에서만 찾으므로 같은 이름이 딴 도시에
있어도 안 섞인다. 못 맞춘 곳은 조용히 버리지 말고 몇 개인지 말한다.

사용: python pipeline/build_intercity.py
"""
import argparse
import collections
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

RAW = os.path.join(C.RAW, 'intercity')
GRAPH = os.path.join(C.DATA, 'graph')

# 도시 상자 (engine/geocode.js 의 AREAS 와 같은 뜻 — 이름 맞추기를 그 도시 안으로 가둔다)
BOX = {
    '서울': (37.42, 37.70, 126.76, 127.19),
    '부산': (35.05, 35.40, 128.80, 129.30),
    '대구': (35.75, 36.00, 128.45, 128.75),
    '대전': (36.23, 36.45, 127.30, 127.52),
    '광주': (35.08, 35.25, 126.75, 126.95),
    # 인천 상자는 **영종도까지** 넓힌다 — 인천공항(126.44)이 시내 상자 밖이라
    # 공항 오가는 고속·시외버스가 통째로 빠졌다(실제로 빠졌다).
    '인천': (37.35, 37.60, 126.38, 126.80),
}
# 터미널 이름은 자료마다 다르게 적힌다 — API 는 「서울경부」, 우리 그래프(버스 정류장)는
# 「경부고속터미널」이다. 이름이 안 붙으면 그 노선이 통째로 사라지므로 표로 못 박는다.
# ★ 오른쪽 값은 반드시 그래프에 실제로 있는 이름이어야 한다 ★ (없으면 조용히 버려진다)
ALIAS = {
    '서울경부': '경부고속터미널',
    '센트럴시티(서울)': '호남고속터미널',
    '대구용계': '용계역',
    '부산사상': '서부시외버스터미널(사상역)',
    '대전복합': '복합터미널',
    '광주(유·스퀘어)': '광주종합버스터미널',
    '인천공항2터미널': '인천공항2터미널역',
    '인천공항T1': '인천공항1터미널역',
    '인천공항1터미널': '인천공항1터미널역',
    '대구서부': '서부정류장역',
    '부산해운대': '해운대역',       # 해운대 시외정류소는 역 앞이다
}

MODE_INFO = {
    'train':   {'kind': 'rail',  'vehicle': 'trainReserved', 'label': '열차'},
    'express': {'kind': 'coach', 'vehicle': 'coachReserved', 'label': '고속버스'},
    'suburb':  {'kind': 'coach', 'vehicle': 'coachReserved', 'label': '시외버스'},
}


def flat(s):
    return re.sub(r'\s+', '', str(s or ''))


def minutes_of(stamp):
    """20260916053000 → 그날 05:30 을 분으로. 날짜가 넘어가면 24시를 더해 잰다."""
    s = re.sub(r'[^0-9]', '', str(stamp or ''))
    if len(s) < 12:
        return None
    return int(s[8:10]) * 60 + int(s[10:12]), s[:8]


def travel_minutes(dep, arr):
    a, b = minutes_of(dep), minutes_of(arr)
    if not a or not b:
        return None
    m = b[0] - a[0]
    if b[1] != a[1]:          # 자정을 넘긴 편
        m += 24 * 60
    return m if 5 <= m <= 12 * 60 else None


def med(xs):
    xs = sorted(x for x in xs if x is not None)
    return xs[len(xs) // 2] if xs else None


class Finder(object):
    """도시 상자 안에서 이름으로 노드를 찾는다."""

    def __init__(self, nodes):
        self.by = collections.defaultdict(list)
        for i, n in enumerate(nodes):
            self.by[flat(n['name'])].append(i)
        self.nodes = nodes

    def find(self, name, city):
        """★ 느슨하게 맞추면 안 된다 ★

        처음엔 「이름이 들어 있으면 맞다」로 했다가 **KTX 가 서울월드컵경기장에서 출발해
        부산원동역에 닿는** 노선이 만들어졌다 — 「서울」이 「서울월드컵경기장…」에,
        「부산」이 「부산원동역」에 걸린 것이다. 오류가 안 나고 경로만 여섯 시간이 된다.

        그래서 순서를 못 박는다: ① 별칭 표 ② 이름 그대로 ③ **이름+「역」**
        (TAGO 는 「서울·부산」, 우리 그래프는 「서울역·부산역」이다) ④ 그래도 없으면
        **그 이름으로 시작하고 세 글자 이내로만 긴** 이름 중에서 지하철역을 먼저.
        """
        box = BOX.get(city)
        if not box:
            return None
        lo_la, hi_la, lo_lo, hi_lo = box

        def inside(i):
            n = self.nodes[i]
            return lo_la <= n['lat'] <= hi_la and lo_lo <= n['lon'] <= hi_lo

        target = flat(name)
        exact = ([flat(ALIAS[name])] if name in ALIAS else []) + [target, target + '역']
        for k in exact:
            for i in self.by.get(k, ()):
                if inside(i):
                    return i
        cands = []
        for k, idxs in self.by.items():
            if not k.startswith(target) or len(k) > len(target) + 3:
                continue
            for i in idxs:
                if inside(i):
                    kinds = self.nodes[i].get('kinds') or []
                    cands.append((0 if 'subway' in kinds else 1, len(k), i))
        cands.sort()
        return cands[0][2] if cands else None


def build():
    if not os.path.isdir(RAW):
        C.die('%s 가 없다. 먼저 `python pipeline/fetch_intercity.py` 를 돌린다.' % RAW)
    nodes_doc = json.load(io.open(os.path.join(GRAPH, 'nodes.json'), encoding='utf-8'))
    routes_doc = json.load(io.open(os.path.join(GRAPH, 'routes.json'), encoding='utf-8'))
    nodes, routes = nodes_doc['nodes'], routes_doc['routes']
    before = len(routes)
    # 다시 돌려도 같은 결과가 나오게 — 앞서 넣은 도시 간 노선은 걷어낸다
    routes[:] = [r for r in routes if not str(r.get('id', '')).startswith('IC-')]
    finder = Finder(nodes)

    made, missed = 0, collections.Counter()
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith('.json'):
            continue
        doc = json.load(io.open(os.path.join(RAW, fn), encoding='utf-8'))
        mode = doc.get('mode')
        info = MODE_INFO.get(mode)
        if not info:
            continue
        for run in doc.get('runs', []):
            a = finder.find(run['fromPlace'], run['from'])
            b = finder.find(run['toPlace'], run['to'])
            if a is None or b is None:
                missed[run['fromPlace'] if a is None else run['toPlace']] += 1
                continue
            by_grade = collections.defaultdict(list)
            for it in run['items']:
                grade = str(it.get('traingradename') or it.get('gradeNm') or info['label']).strip()
                by_grade[grade].append(it)
            for grade, rows in by_grade.items():
                mins, deps, fares = [], [], []
                for it in rows:
                    dep = it.get('depplandtime') or it.get('depPlandTime')
                    arr = it.get('arrplandtime') or it.get('arrPlandTime')
                    t = travel_minutes(dep, arr)
                    if t:
                        mins.append(t)
                    d = minutes_of(dep)
                    if d:
                        deps.append(d[0])
                    try:
                        fares.append(float(it.get('adultcharge') or it.get('charge') or 0))
                    except (TypeError, ValueError):
                        pass
                m = med(mins)
                if not m or not deps:
                    continue
                span = max(deps) - min(deps)
                # 편수로 배차를 잡는다. 하루 두어 편이면 그만큼 오래 기다리는 게 맞다.
                head = max(20, int(round(span / max(1, len(deps) - 1)))) if len(deps) > 1 else 240
                fare = med([f for f in fares if f > 0])
                routes.append({
                    'id': 'IC-%s-%s-%s-%s' % (mode, run['from'], run['to'], flat(grade)),
                    'name': '%s %s→%s' % (grade, run['from'], run['to']),
                    'kind': info['kind'], 'vehicle': info['vehicle'],
                    'minutes': m, 'headwayMin': head, 'reserved': True,
                    'runsPerDay': len(deps), 'fare': int(fare) if fare else None,
                    'firstMin': min(deps), 'lastMin': max(deps),
                    'dirs': [[a, b]]})
                made += 1
        C.log('  %s — 노선 %d개까지' % (doc.get('name', mode), made))

    if missed:
        C.log('  이름을 못 맞춘 역·터미널 %d곳: %s'
              % (len(missed), ', '.join(list(missed)[:6])))
    C.save_json(os.path.join(GRAPH, 'routes.json'), routes_doc)
    C.log('== 노선 %d → %d (도시 간 %d개) · routes.json %.1fMB =='
          % (before, len(routes), made, os.path.getsize(os.path.join(GRAPH, 'routes.json')) / 1e6))


if __name__ == '__main__':
    argparse.ArgumentParser(description='도시 간 이동을 그래프에 얹는다').parse_args()
    build()
