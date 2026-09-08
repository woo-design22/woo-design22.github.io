# -*- coding: utf-8 -*-
"""서울 밖 도시철도 승하차 → 구간 재차 → 혼잡도 (D-103·D-105).

★ 왜 이렇게 하나 ★
서울은 「혼잡도(정원 대비 %)」를 방향별로 그대로 준다. 부산·대구·대전·광주·인천은 그게 없다 —
있는 것은 **역별 시간대별 승하차 인원**뿐이고 거기엔 방향이 없다.
그래서 사람이 어디서 어디로 가는지를 추정해(OD) 선로에 실어야 재차가 나온다.

★ 호선별로 따로 풀면 안 된다 ★
환승 승객은 승하차 자료에 안 잡힌다. 다대포에서 타 서면에서 2호선으로 갈아타고
해운대에서 내리면 기록은 「다대포 승차·해운대 하차」뿐이다. 1호선만 떼어 풀면
이 사람이 서면에서 사라진다. 그래서 **한 도시의 노선을 한 망으로** 놓고 최단경로에 싣는다.

방법 (부산 실측으로 고른 것 — --validate 가 그 근거다):
  ① 중력모형 씨앗: 승차_i × 하차_j × exp(-거리/10)
  ② IPF 로 양쪽 가장자리(승차·하차)를 실제 값에 맞춘다
  ③ 각 OD 를 최단경로(환승벌점 4)에 실어 구간별 재차를 만든다
  ④ 편성·정원·**실측 배차**(tph.json)로 나눠 혼잡도 %로 바꾼다

★ 검증 ★ 2020~2021 부산 1호선 실측 열차혼잡도(차량별·행선지별)와 맞댄다.
연도 차는 부산교통공사 공표값으로 보정한다(1일 평균 2020년 67.3만 → 2025년 87.3만 = 1.30배).

★ 한계 (화면에 「추정」이라고 밝힌다) ★
  · 맞대 볼 실측이 있는 곳은 부산 1호선뿐이다. 나머지 노선·도시는 같은 계수를 그대로 쓴다.
  · 토·일요일도 정답지가 없다(2021 파일이 평일뿐).
  · 시간당 승차와 하차는 애초에 안 맞는다(7시에 탄 사람이 8시에 내린다).
    IPF 가 그 차이를 하차 쪽에 고르게 나눠 흡수한다.

사용: python pipeline/build_city_congestion.py [--validate] [--only busan,daegu]
"""
import argparse
import collections
import datetime
import heapq
import io
import json
import math
import os
import re
import statistics
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C       # noqa: E402
import city_spec as SPEC  # noqa: E402

RAW = os.path.join(C.RAW, 'city')
ROUTES = os.path.join(C.DATA, 'graph', 'routes.json')
TPH = os.path.join(C.DATA, 'subway', 'tph.json')
OUT = os.path.join(C.DATA, 'subway', 'cities.json')

CONG_START, CONG_STEP, CONG_SLOTS = 330, 30, 39     # congestion.json 과 같은 격자
RIDE_START, RIDE_STEP, RIDE_SLOTS = 300, 60, 20     # ride.json 과 같은 격자
DAYS = ('weekday', 'saturday', 'sunday')
COVID = 873.0 / 673.0
SOUTH_DEST = {'다대포해수욕장', '다대포항', '신평', '동매', '대티'}


def read_text(path):
    if not os.path.exists(path):
        return None
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return None


# ── ① 그래프에서 노선 순서 ─────────────────────────────────────────────────
def load_graph():
    doc = json.load(io.open(ROUTES, encoding='utf-8'))
    order = {}
    for r in doc['routes']:
        ln = r.get('line')
        if ln in SPEC.LINES:
            order[ln] = r['stops'][0]
    return doc, order


def load_tph():
    try:
        return json.load(io.open(TPH, encoding='utf-8'))['lines']
    except Exception:
        C.log('  tph.json 이 없다 — 공표 어림값으로 물러난다 (build_city_tph.py 를 먼저 돌릴 것)')
        return {}


def trains_per_hour(tph, line, hour):
    t = tph.get(line)
    if t and len(t) == 24 and t[hour] > 0:
        return t[hour]
    peak, eve, day, night = SPEC.FALLBACK_TPH
    if 7 <= hour < 9:
        return peak
    if 17 <= hour < 20:
        return eve
    return day if 6 <= hour < 23 else night


# ── ② 승하차 읽기 + 공휴일 가려내기 ────────────────────────────────────────
def parse_date(spec, cols):
    kind = spec['date'][0]
    if kind == 'col':
        s = re.sub(r'[^0-9]', '', cols[spec['date'][1]])
        if len(s) != 8:
            return None
        return '%s-%s-%s' % (s[:4], s[4:6], s[6:])
    mo, da, year = spec['date'][1], spec['date'][2], spec['date'][3]
    try:
        return '%d-%02d-%02d' % (year, int(cols[mo]), int(cols[da]))
    except ValueError:
        return None


def read_boardings(city, graph_names):
    spec = city['csv']
    path = os.path.join(RAW, city['boarding']['file'])
    txt = read_text(path)
    if not txt:
        C.die('%s 가 없다. 먼저 `python pipeline/fetch_city.py` 를 돌린다.' % path)
    rows = [l for l in txt.split('\n') if l.strip()]
    hours = spec['hours']
    recs, dow = [], {}
    tot = collections.defaultdict(float)
    peak = collections.defaultdict(float)
    unknown = collections.Counter()
    for ln in rows[1:]:
        c = ln.split(',')
        if len(c) < spec['first'] + len(hours):
            continue
        if ('keepLines' in spec and len(c) > spec['line']
                and c[spec['line']].strip() not in spec['keepLines']):
            continue                       # 이 도시에서 안 쓰는 호선 줄(인천 7호선)
        date = parse_date(spec, c)
        if not date:
            continue
        name = SPEC.norm_station(c[spec['name']], graph_names, city['alias'])
        if name is None:
            unknown[c[spec['name']].strip()] += 1
            continue
        try:
            vals = [float(x.strip() or 0) for x in c[spec['first']:spec['first'] + len(hours)]]
        except ValueError:
            continue
        kind = c[spec['kind']].strip()
        y, m, d = (int(x) for x in date.split('-'))
        dow[date] = datetime.date(y, m, d).weekday()      # 0=월 … 6=일
        recs.append((name, date, kind, vals))
        if kind.startswith('승'):
            tot[date] += sum(vals)
            for h, v in zip(hours, vals):
                if h in (7, 8):
                    peak[date] += v
    if unknown:
        C.log('  그래프에 없는 역 %d개(건너뜀): %s'
              % (len(unknown), ', '.join(sorted(unknown)[:6])))
    if not recs:
        C.die('%s — 쓸 수 있는 줄이 없다. 자료 형식이 바뀌었을 수 있다.' % city['name'])

    # ★ 공휴일을 표로 적지 않고 자료가 말하게 한다 ★ (D-103)
    wk = [d for d in tot if dow[d] < 5 and tot[d] > 0]
    med = statistics.median(peak[d] / tot[d] for d in wk)
    holidays = sorted(d for d in wk if peak[d] / tot[d] < med * 0.7)

    def daytype(d):
        if dow[d] == 6 or d in holidays:
            return 'sunday'
        return 'saturday' if dow[d] == 5 else 'weekday'

    ndays = collections.Counter(daytype(d) for d in dow)
    on = collections.defaultdict(float)
    off = collections.defaultdict(float)
    for name, date, kind, vals in recs:
        dt = daytype(date)
        tgt = on if kind.startswith('승') else off
        for h, v in zip(hours, vals):
            tgt[(dt, h, name)] += v
    for k in on:
        on[k] /= max(1, ndays[k[0]])
    for k in off:
        off[k] /= max(1, ndays[k[0]])
    return on, off, holidays, dict(ndays), sorted(dow)


# ── ③ 망과 최단경로 ────────────────────────────────────────────────────────
def build_network(order, lines):
    lns = [l for l in lines if l in order]
    states, sidx = [], {}
    for li, ln in enumerate(lns):
        for p, s in enumerate(order[ln]):
            sidx[(li, p)] = len(states)
            states.append((li, p, s))
    adj = collections.defaultdict(list)
    for li, ln in enumerate(lns):
        seq = order[ln]
        for p in range(len(seq) - 1):
            a, b = sidx[(li, p)], sidx[(li, p + 1)]
            adj[a].append((b, 1.0, (li, p, 0)))     # 0 = 색인 증가(하선)
            adj[b].append((a, 1.0, (li, p, 1)))     # 1 = 색인 감소(상선)
    byname = collections.defaultdict(list)
    for st, (li, p, s) in enumerate(states):
        byname[s].append(st)
    for sts in byname.values():
        for a in sts:
            for b in sts:
                if a != b:
                    adj[a].append((b, SPEC.TRANSFER_PENALTY, None))
    return lns, states, adj, byname


def _events(links):
    """경로의 링크 목록 → (호선, 역색인, +1 탐 / -1 내림). 환승은 내림+탐 두 개다."""
    if not links:
        return []

    def start_of(lk):
        li, p, dr = lk
        return (li, p if dr == 0 else p + 1)

    def end_of(lk):
        li, p, dr = lk
        return (li, p + 1 if dr == 0 else p)

    ev = [start_of(links[0]) + (1,)]
    for a, b in zip(links, links[1:]):
        if a[0] != b[0]:
            ev.append(end_of(a) + (-1,))
            ev.append(start_of(b) + (1,))
    ev.append(end_of(links[-1]) + (-1,))
    return ev


def shortest_paths(stations, states, adj, byname):
    out = {}
    for src in stations:
        dist, prev = {}, {}
        pq = []
        for st in byname[src]:
            dist[st] = 0.0
            heapq.heappush(pq, (0.0, st))
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist.get(u, 1e18) + 1e-9:
                continue
            for v, w, lk in adj[u]:
                nd = d + w
                if nd < dist.get(v, 1e18) - 1e-9:
                    dist[v] = nd
                    prev[v] = (u, lk)
                    heapq.heappush(pq, (nd, v))
        best = {}
        for st, (li, p, s) in enumerate(states):
            if st in dist and (s not in best or dist[st] < best[s][0]):
                best[s] = (dist[st], st)
        res = {}
        for dst, (d, st) in best.items():
            links = []
            cur = st
            while cur in prev:
                u, lk = prev[cur]
                if lk is not None:
                    links.append(lk)
                cur = u
            links.reverse()
            res[dst] = (d, tuple(links), tuple(_events(links)))
        out[src] = res
    return out


# ── ④ 시간대별 배분 ────────────────────────────────────────────────────────
def assign(stations, paths, on, off, dt, hour):
    n = len(stations)
    b = [on.get((dt, hour, s), 0.0) for s in stations]
    a = [off.get((dt, hour, s), 0.0) for s in stations]
    sb, sa = sum(b), sum(a)
    if sb <= 0 or sa <= 0:
        return {}, {}, {}
    tgt = [x * sb / sa for x in a]
    T = [[0.0] * n for _ in range(n)]
    for i in range(n):
        if b[i] <= 0:
            continue
        pi = paths[stations[i]]
        row = T[i]
        for j in range(n):
            if i == j or tgt[j] <= 0:
                continue
            e = pi.get(stations[j])
            if e is None:
                continue
            row[j] = tgt[j] * math.exp(-e[0] / SPEC.DECAY_STOPS)
        s = sum(row)
        if s > 0:
            f = b[i] / s
            for j in range(n):
                row[j] *= f
    for _ in range(SPEC.IPF_ITERS):
        cs = [0.0] * n
        for i in range(n):
            row = T[i]
            for j in range(n):
                cs[j] += row[j]
        for j in range(n):
            if cs[j] > 0:
                f = tgt[j] / cs[j]
                for i in range(n):
                    T[i][j] *= f
        for i in range(n):
            row = T[i]
            rs = sum(row)
            if rs > 0:
                f = b[i] / rs
                for j in range(n):
                    row[j] *= f
    loads = collections.defaultdict(float)
    board = collections.defaultdict(float)
    alight = collections.defaultdict(float)
    for i in range(n):
        pi = paths[stations[i]]
        row = T[i]
        for j in range(n):
            v = row[j]
            if v <= 0:
                continue
            d, links, evs = pi[stations[j]]
            for lk in links:
                loads[lk] += v
            for li, sp, sign in evs:
                (board if sign > 0 else alight)[(li, sp)] += v
    return loads, board, alight


def to_slots(hourly, start, step, count):
    """시간대 값 24개 → 격자. 시간값을 그 시각 한가운데 값으로 보고 선형으로 잇는다."""
    out = []
    for i in range(count):
        x = (start + step * i) / 60.0 - 0.5
        h0 = int(math.floor(x))
        f = x - h0
        out.append(round(hourly[h0 % 24] * (1 - f) + hourly[(h0 + 1) % 24] * f, 1))
    return out


# ── ⑤ 한 도시 만들기 ───────────────────────────────────────────────────────
def build_city(key, city, order, tph, grid, ride, meta_out):
    lns = [l for l in city['lines'] if l in order]
    if not lns:
        C.log('  %s — 그래프에 노선이 없다. 건너뜀' % city['name'])
        return None
    names = {s for l in lns for s in order[l]}
    on, off, holidays, ndays, dates = read_boardings(city, names)
    C.log('  %s: %s ~ %s · 날 수 %s · 공휴일 %d일'
          % (city['name'], dates[0], dates[-1], ndays, len(holidays)))

    stations = sorted(names)
    lns2, states, adj, byname = build_network(order, lns)
    paths = shortest_paths(stations, states, adj, byname)

    cong = collections.defaultdict(lambda: [0.0] * 24)
    r_on = collections.defaultdict(lambda: [0.0] * 24)
    r_off = collections.defaultdict(lambda: [0.0] * 24)
    for dt in DAYS:
        for h in range(24):
            loads, board, alight = assign(stations, paths, on, off, dt, h)
            for li, ln in enumerate(lns2):
                cars, veh = SPEC.LINES[ln]
                seats, cap = SPEC.VEHICLES[veh]
                per = trains_per_hour(tph, ln, h) * cars * cap
                seq = order[ln]
                for p in range(len(seq) - 1):
                    for dr in (0, 1):
                        st = seq[p] if dr == 0 else seq[p + 1]
                        cong[(ln, st, dt, '하선' if dr == 0 else '상선')][h] = \
                            loads.get((li, p, dr), 0.0) / per * 100.0 if per > 0 else 0.0
                for p, st in enumerate(seq):
                    r_on[(ln, st, dt)][h] = board.get((li, p), 0.0)
                    r_off[(ln, st, dt)][h] = alight.get((li, p), 0.0)

    for (ln, st, dt, side), hourly in cong.items():
        grid['%s|%s|%s|%s' % (ln, st, dt, side)] = to_slots(hourly, CONG_START, CONG_STEP, CONG_SLOTS)
    for (ln, st, dt), hourly in r_on.items():
        ride['%s|%s|%s|승차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]
    for (ln, st, dt), hourly in r_off.items():
        ride['%s|%s|%s|하차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]

    for ln in lns2:
        cars, veh = SPEC.LINES[ln]
        seats, cap = SPEC.VEHICLES[veh]
        meta_out[ln] = {'cars': cars, 'capacity': cap, 'seats': seats, 'vehicle': veh,
                        'tph': [round(trains_per_hour(tph, ln, h), 2) for h in range(24)]}
    return {'lines': lns2, 'holidays': holidays, 'dayCount': ndays,
            'span': [dates[0], dates[-1]], 'on': on, 'off': off,
            'stations': stations, 'paths': paths, 'order': order}


def add_fallback_layers(grid):
    """역 최대(방향 모를 때)·호선 피크(역도 모를 때) — 서울 격자와 같은 층 구조."""
    per_st = collections.defaultdict(lambda: [0.0] * CONG_SLOTS)
    per_ln = collections.defaultdict(lambda: [0.0] * CONG_SLOTS)
    for k, arr in list(grid.items()):
        parts = k.split('|')
        if len(parts) != 4:
            continue
        ln, st, dt, _side = parts
        a, b = per_st[(ln, st, dt)], per_ln[(ln, dt)]
        for i, v in enumerate(arr):
            if v > a[i]:
                a[i] = v
            if v > b[i]:
                b[i] = v
    for (ln, st, dt), arr in per_st.items():
        grid['%s|%s|%s' % (ln, st, dt)] = [round(v, 1) for v in arr]
    for (ln, dt), arr in per_ln.items():
        grid['%s|전체|%s' % (ln, dt)] = [round(v, 1) for v in arr]


def patch_routes(doc, meta):
    """그래프의 노선에 편성·차종·배차를 실어 둔다 — 없으면 엔진이 서울 값으로 물러난다."""
    n = 0
    for r in doc['routes']:
        m = meta.get(r.get('line'))
        if not m:
            continue
        r['vehicle'] = m['vehicle']
        r['cars'] = m['cars']
        r['capacity'] = m['capacity']
        r['tph'] = m['tph']
        n += 1
    C.save_json(ROUTES, doc)
    C.log('  그래프 노선 %d개에 편성·차종·배차를 적었다' % n)


# ── ⑥ 검증 (부산 1호선 실측) ───────────────────────────────────────────────
def run_validate(ctx, tph):
    zpath = os.path.join(RAW, SPEC.TRUTH['file'])
    if not os.path.exists(zpath):
        C.log('  정답지가 없어 검증을 건너뛴다 (fetch_city.py --truth)')
        return
    z = zipfile.ZipFile(zpath)
    tot = collections.defaultdict(float)
    cnt = collections.Counter()
    for info in z.infolist():
        try:
            nm = info.filename.encode('cp437').decode('cp949')
        except Exception:
            nm = info.filename
        if '2021년' not in nm:
            continue
        for ln in z.read(info).decode('cp949', 'replace').split('\n')[1:]:
            c = ln.strip().split(',')
            if len(c) < 12:
                continue
            try:
                h = int(c[1].split(':')[0]) % 24
                vals = [float(x) for x in c[4:12]]
            except ValueError:
                continue
            st = c[2].strip()
            st = {'부산역': '부산'}.get(st, st)
            tot[(st, 1 if c[3].strip() in SOUTH_DEST else 0, h)] += sum(vals) / len(vals)
            cnt[(st, 1 if c[3].strip() in SOUTH_DEST else 0, h)] += 1
    truth = {k: tot[k] / cnt[k] for k in tot}

    seq = ctx['order']['부산 1호선']
    li = ctx['lines'].index('부산 1호선')
    cars, veh = SPEC.LINES['부산 1호선']
    seats, cap = SPEC.VEHICLES[veh]
    xs, ys = [], []
    for h in (7, 8, 9, 12, 17, 18, 19):
        loads, _b, _a = assign(ctx['stations'], ctx['paths'], ctx['on'], ctx['off'], 'weekday', h)
        per = trains_per_hour(tph, '부산 1호선', h) * cars * cap
        for p in range(len(seq) - 1):
            for dr in (0, 1):
                st = seq[p] if dr == 0 else seq[p + 1]
                t = truth.get((st, dr, h))
                if t is None:
                    continue
                xs.append(loads.get((li, p, dr), 0.0) / per * 100.0)
                ys.append(t * COVID)
    if len(xs) < 30:
        C.die('맞대 볼 짝이 %d개뿐이다 — 역 이름이 어긋났을 수 있다.' % len(xs))
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    r = cov / math.sqrt(vx * vy)
    mae = sum(abs(x - y) for x, y in zip(xs, ys)) / len(xs)
    C.log('== 검증 (부산 1호선 실측 2020~2021, 연도차 %.2f배 보정) ==' % COVID)
    C.log('  짝 %d · 상관 %.3f · 기울기 %.2f · 평균오차 %.1f%%p' % (len(xs), r, mx / my, mae))
    if r < 0.90:
        C.die('상관이 0.90 아래다 — 모형이나 자료가 어긋났다. 그대로 내보내지 말 것.')
    if not 0.85 <= mx / my <= 1.25:
        C.die('기울기가 0.85~1.25 밖이다 — 재차 수준이 어긋났다.')
    C.log('  통과.')


def main():
    ap = argparse.ArgumentParser(description='서울 밖 도시철도 혼잡도')
    ap.add_argument('--validate', action='store_true', help='부산 1호선 실측과 맞대 본다')
    ap.add_argument('--only', help='도시 골라서 (쉼표로: busan,daegu,…)')
    args = ap.parse_args()

    doc, order = load_graph()
    tph = load_tph()
    keys = [k for k in SPEC.CITIES if not args.only or k in args.only.split(',')]
    C.log('== 도시철도 혼잡도 만들기 (%s) ==' % ', '.join(SPEC.CITIES[k]['name'] for k in keys))

    grid, ride, meta = {}, {}, {}
    cities, busan_ctx = {}, None
    for k in keys:
        ctx = build_city(k, SPEC.CITIES[k], order, tph, grid, ride, meta)
        if not ctx:
            continue
        cities[SPEC.CITIES[k]['name']] = {
            'lines': ctx['lines'], 'holidays': ctx['holidays'],
            'dayCount': ctx['dayCount'], 'span': ctx['span'],
            'source': SPEC.CITIES[k]['boarding']['title']}
        if k == 'busan':
            busan_ctx = ctx
    add_fallback_layers(grid)

    out = {
        'note': '서울 밖 도시철도 — 승하차에서 되짚은 혼잡도(정원 대비 %). 실측이 아니다. '
                '부산 1호선 실측과 맞춰 계수를 골랐다(D-103·D-105).',
        'estimated': True,
        'estimatedLines': sorted(meta),
        'modelErrorPct': SPEC.MODEL_ERROR_PCT,
        'cities': cities,
        'congestion': {'startMinutes': CONG_START, 'slotMinutes': CONG_STEP,
                       'slots': CONG_SLOTS, 'grid': grid},
        'ride': {'startMinutes': RIDE_START, 'slotMinutes': RIDE_STEP,
                 'slots': RIDE_SLOTS, 'grid': ride},
        'lines': meta,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    C.save_json(OUT, out)
    C.log('  노선 %d개 · 혼잡도 칸 %d · 승하차 칸 %d → %s (%.1fMB)'
          % (len(meta), len(grid), len(ride), OUT, os.path.getsize(OUT) / 1e6))
    patch_routes(doc, meta)
    if args.validate and busan_ctx:
        run_validate(busan_ctx, tph)


if __name__ == '__main__':
    main()
