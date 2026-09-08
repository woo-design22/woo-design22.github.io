# -*- coding: utf-8 -*-
"""부산 승하차 → 구간 재차 → 혼잡도 (D-103).

★ 왜 이렇게 하나 ★
서울은 「혼잡도(정원 대비 %)」를 방향별로 그대로 준다. 부산은 그게 없다 —
있는 것은 **역별 시간대별 승하차 인원**뿐이고, 거기엔 방향이 없다.
그래서 사람이 어디서 어디로 가는지를 추정해(OD) 선로에 실어야 재차가 나온다.

★ 호선별로 따로 풀면 안 된다 ★
환승 승객은 승하차 자료에 안 잡힌다. 다대포에서 타 서면에서 2호선으로 갈아타고
해운대에서 내리면, 기록은 「다대포 승차 · 해운대 하차」뿐이다. 1호선만 떼어 풀면
이 사람은 서면에서 사라진다. 그래서 **1~4호선을 한 망으로 놓고 최단경로에 싣는다.**

방법 (실측으로 고른 것 — 아래 --validate 가 그 근거다):
  ① 중력모형으로 OD 씨앗: 승차_i × 하차_j × exp(-거리/10)
  ② IPF 로 양쪽 가장자리(승차·하차)를 실제 값에 맞춘다
  ③ 각 OD 를 최단경로(환승벌점 4)에 실어 구간별 재차를 만든다
  ④ 편성·정원·배차로 나눠 혼잡도 %로 바꾼다

★ 검증 ★  2020~2021 년 1호선 **실측 열차혼잡도**(차량별·행선지별)와 맞대었다.
  상관 0.946 · 기울기 1.01 · 평균오차 8.2%p (평일 7·8·9·12·17·18·19시, 304쌍)
  연도 차는 부산교통공사 공표값으로 보정했다(1일 평균 2020년 67.3만 → 2025년 87.3만 = 1.30배).
  → `python pipeline/build_busan_congestion.py --validate` 로 언제든 다시 잰다.

★ 한계 (화면에 「추정」이라고 밝힌다) ★
  · 2~4호선은 맞대 볼 실측이 없다. 1호선에서 고른 계수를 그대로 쓴다.
  · 토·일요일도 실측이 없다(정답지가 평일뿐이다).
  · 시간당 승차와 하차는 애초에 안 맞는다(7시에 탄 사람이 8시에 내린다).
    IPF 가 그 차이를 하차 쪽에 고르게 나눠 흡수한다.

사용: python pipeline/build_busan_congestion.py [--validate]
"""
import argparse
import collections
import heapq
import io
import json
import math
import os
import statistics
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C        # noqa: E402
import busan_spec as SPEC  # noqa: E402

RAW = os.path.join(C.RAW, 'busan')
BOARD_CSV = os.path.join(RAW, 'boarding.csv')
TRUTH_ZIP = os.path.join(RAW, 'congestion2021.zip')
ROUTES = os.path.join(C.DATA, 'graph', 'routes.json')
OUT = os.path.join(C.DATA, 'subway', 'busan.json')

# 1호선 실측과 맞대 본 평균 오차(%p). --validate 가 이 값을 다시 재고, 엔진은 이 폭만큼
# 확률 곡선을 무디게 한다(D-104). ★ 모형을 고치면 --validate 를 돌려 이 값을 갱신할 것 ★
MODEL_ERROR_PCT = 8.0

CONG_START, CONG_STEP, CONG_SLOTS = 330, 30, 39     # congestion.json 과 같은 격자
RIDE_START, RIDE_STEP, RIDE_SLOTS = 300, 60, 20     # ride.json 과 같은 격자
DAYS = ('weekday', 'saturday', 'sunday')


# ── ① 노선 순서 ────────────────────────────────────────────────────────────
def load_lines():
    doc = json.load(io.open(ROUTES, encoding='utf-8'))
    lines = {}
    for r in doc['routes']:
        if r.get('line') in SPEC.LINES:
            lines[r['line']] = r['stops'][0]
    missing = set(SPEC.LINES) - set(lines)
    if missing:
        C.die('그래프에 %s 가 없다. 먼저 build_graph.py 를 돌린다.' % ', '.join(sorted(missing)))
    return doc, lines


# ── ② 승하차 읽기 + 공휴일 가려내기 ────────────────────────────────────────
def read_boardings(graph_names):
    if not os.path.exists(BOARD_CSV):
        C.die('%s 가 없다. 먼저 `python pipeline/fetch_busan.py` 를 돌린다.' % BOARD_CSV)
    txt = open(BOARD_CSV, 'rb').read().decode('cp949', 'replace')
    rows = [l for l in txt.split('\n') if l.strip()]
    cols = rows[0].split(',')[6:]
    hours = [int(c.split('시')[0]) % 24 for c in cols]      # '24시-01시' → 0시

    recs, dow = [], {}
    tot = collections.defaultdict(float)
    peak = collections.defaultdict(float)
    unknown = set()
    for ln in rows[1:]:
        c = ln.split(',')
        if len(c) < 7:
            continue
        name = SPEC.norm_station(c[1], graph_names)
        if name is None:
            unknown.add(c[1].strip())
            continue
        try:
            vals = [float(x or 0) for x in c[6:6 + len(cols)]]
        except ValueError:
            continue
        date, wd, kind = c[2].strip(), c[3].strip(), c[4].strip()
        dow[date] = wd
        recs.append((name, date, kind, vals))
        if kind == '승차':
            tot[date] += sum(vals)
            for h, v in zip(hours, vals):
                if h in (7, 8):
                    peak[date] += v
    if unknown:
        C.log('  그래프에 없는 역(건너뜀): %s' % ', '.join(sorted(unknown)))

    # ★ 공휴일을 표로 적지 않고 자료가 말하게 한다 ★
    # 설·추석은 해마다 날짜가 바뀌고 대체공휴일·임시공휴일은 예고 없이 생긴다. 표를
    # 손으로 적으면 반드시 틀린다. 대신 **출근 첨두 비율**(07~09시 승차 ÷ 하루 승차)을 본다.
    # 평일은 0.16 안팎, 주말은 0.07 안팎이라 신호가 두 배 넘게 벌어진다.
    wkdays = [d for d in tot if dow[d] in '월화수목금']
    med = statistics.median(peak[d] / tot[d] for d in wkdays if tot[d])
    holidays = sorted(d for d in wkdays if tot[d] and peak[d] / tot[d] < med * 0.7)

    def daytype(d):
        if dow[d] == '일' or d in holidays:
            return 'sunday'          # 공휴일은 일요일 무리에 넣는다(운행·이용 모두 그렇다)
        return 'saturday' if dow[d] == '토' else 'weekday'

    ndays = collections.Counter(daytype(d) for d in dow)
    on = collections.defaultdict(float)
    off = collections.defaultdict(float)
    for name, date, kind, vals in recs:
        dt = daytype(date)
        tgt = on if kind == '승차' else off
        for h, v in zip(hours, vals):
            tgt[(dt, h, name)] += v
    for k in on:
        on[k] /= ndays[k[0]]
    for k in off:
        off[k] /= ndays[k[0]]
    return on, off, holidays, ndays, sorted(dow)


# ── ③ 망과 최단경로 ────────────────────────────────────────────────────────
def build_network(lines):
    lns = sorted(lines)
    states, sidx = [], {}
    for li, ln in enumerate(lns):
        for p, s in enumerate(lines[ln]):
            sidx[(li, p)] = len(states)
            states.append((li, p, s))
    adj = collections.defaultdict(list)
    for li, ln in enumerate(lns):
        seq = lines[ln]
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


def shortest_paths(stations, states, adj, byname, lines, lns):
    """역 → 역 최단경로가 지나는 링크와, 호선별 승·하차 사건."""
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


def _events(links):
    """경로의 링크 목록 → (호선, 역색인, +1 탐 / -1 내림). 환승은 내림+탐 두 개다."""
    if not links:
        return []
    ev = []

    def start_of(lk):
        li, p, dr = lk
        return (li, p if dr == 0 else p + 1)

    def end_of(lk):
        li, p, dr = lk
        return (li, p + 1 if dr == 0 else p)

    ev.append(start_of(links[0]) + (1,))
    for a, b in zip(links, links[1:]):
        if a[0] != b[0]:
            ev.append(end_of(a) + (-1,))
            ev.append(start_of(b) + (1,))
    ev.append(end_of(links[-1]) + (-1,))
    return ev


# ── ④ 시간대별 배분 ────────────────────────────────────────────────────────
def assign(stations, paths, on, off, dt, hour):
    n = len(stations)
    b = [on.get((dt, hour, s), 0.0) for s in stations]
    a = [off.get((dt, hour, s), 0.0) for s in stations]
    sb, sa = sum(b), sum(a)
    if sb <= 0 or sa <= 0:
        return {}, {}, {}
    tgt = [x * sb / sa for x in a]          # 시간당 승·하차 불균형은 하차 쪽에서 흡수
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


# ── ⑤ 시간별 값 → 격자 ─────────────────────────────────────────────────────
def to_slots(hourly, start, step, count):
    """시간대 값 24개 → 격자. 시간값은 그 시각의 한가운데 값으로 보고 선형으로 잇는다."""
    out = []
    for i in range(count):
        x = (start + step * i) / 60.0 - 0.5
        h0 = int(math.floor(x))
        f = x - h0
        v = hourly[h0 % 24] * (1 - f) + hourly[(h0 + 1) % 24] * f
        out.append(round(v, 1))
    return out


def build(validate=False):
    doc, lines = load_lines()
    gnames = {s for v in lines.values() for s in v}
    C.log('== 부산 혼잡도 만들기 ==')
    on, off, holidays, ndays, dates = read_boardings(gnames)
    C.log('  자료 %s ~ %s · 날 수 %s' % (dates[0], dates[-1], dict(ndays)))
    C.log('  공휴일로 가려낸 평일 %d일: %s' % (len(holidays), ', '.join(holidays)))

    stations = sorted(gnames)
    lns, states, adj, byname = build_network(lines)
    paths = shortest_paths(stations, states, adj, byname, lines, lns)
    C.log('  망: 역 %d · 노선 %d · 최단경로 %d쌍' % (len(stations), len(lns), len(stations) ** 2))

    # 호선·방향·역별 시간대 값 채우기
    cong = collections.defaultdict(lambda: [0.0] * 24)
    ride_on = collections.defaultdict(lambda: [0.0] * 24)
    ride_off = collections.defaultdict(lambda: [0.0] * 24)
    for dt in DAYS:
        for h in range(24):
            loads, board, alight = assign(stations, paths, on, off, dt, h)
            for li, ln in enumerate(lns):
                cars, cap, seats, veh = SPEC.LINES[ln]
                per = SPEC.trains_per_hour(ln, h) * cars * cap
                seq = lines[ln]
                for p in range(len(seq) - 1):
                    for dr in (0, 1):
                        st = seq[p] if dr == 0 else seq[p + 1]
                        v = loads.get((li, p, dr), 0.0) / per * 100.0
                        cong[(ln, st, dt, '하선' if dr == 0 else '상선')][h] = v
                for p, st in enumerate(seq):
                    ride_on[(ln, st, dt)][h] = board.get((li, p), 0.0)
                    ride_off[(ln, st, dt)][h] = alight.get((li, p), 0.0)
        C.log('  %s 배분 끝' % dt)

    grid = {}
    for (ln, st, dt, side), hourly in cong.items():
        grid['%s|%s|%s|%s' % (ln, st, dt, side)] = to_slots(hourly, CONG_START, CONG_STEP, CONG_SLOTS)
    # 역 최대(방향 모를 때) · 호선 피크(역도 모를 때) — 서울 격자와 같은 층 구조
    per_st = collections.defaultdict(lambda: [0.0] * CONG_SLOTS)
    per_ln = collections.defaultdict(lambda: [0.0] * CONG_SLOTS)
    for k, arr in list(grid.items()):
        ln, st, dt, _side = k.split('|')
        a = per_st[(ln, st, dt)]
        b = per_ln[(ln, dt)]
        for i, v in enumerate(arr):
            if v > a[i]:
                a[i] = v
            if v > b[i]:
                b[i] = v
    for (ln, st, dt), arr in per_st.items():
        grid['%s|%s|%s' % (ln, st, dt)] = [round(v, 1) for v in arr]
    for (ln, dt), arr in per_ln.items():
        grid['%s|전체|%s' % (ln, dt)] = [round(v, 1) for v in arr]

    ride = {}
    for (ln, st, dt), hourly in ride_on.items():
        ride['%s|%s|%s|승차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]
    for (ln, st, dt), hourly in ride_off.items():
        ride['%s|%s|%s|하차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]

    meta = {}
    for ln in lns:
        cars, cap, seats, veh = SPEC.LINES[ln]
        meta[ln] = {'cars': cars, 'capacity': cap, 'seats': seats,
                    'vehicle': veh, 'tph': SPEC.tph_table(ln)}

    out = {
        'note': '부산 1~4호선 — 승하차에서 추정한 혼잡도(정원 대비 %). 서울처럼 실측이 아니다. '
                '1호선 실측(2020~2021)과 상관 0.946·기울기 1.01로 맞춰 두었다(D-103).',
        'source': '부산교통공사 시간대별 승하차인원(공공데이터포털 3057229)',
        'estimated': True,
        'estimatedLines': lns,
        # 1호선 실측과 맞대 본 평균 오차(%p). 엔진이 이 폭만큼 확률 곡선을 무디게 한다(D-104).
        'modelErrorPct': MODEL_ERROR_PCT,
        'holidays': holidays,
        'dayCount': dict(ndays),
        'congestion': {'startMinutes': CONG_START, 'slotMinutes': CONG_STEP,
                       'slots': CONG_SLOTS, 'grid': grid},
        'ride': {'startMinutes': RIDE_START, 'slotMinutes': RIDE_STEP,
                 'slots': RIDE_SLOTS, 'grid': ride},
        'lines': meta,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    C.save_json(OUT, out)
    C.log('  혼잡도 칸 %d · 승하차 칸 %d → %s (%.1fMB)'
          % (len(grid), len(ride), OUT, os.path.getsize(OUT) / 1e6))

    patch_routes(doc, meta)
    if validate:
        run_validate(lines, on, off, stations, paths, lns)
    return out


def patch_routes(doc, meta):
    """그래프의 부산 노선에 편성·차종·배차를 실어 둔다.

    엔진은 서울 기준값(1칸 정원 160·8칸·시간당 20대)을 기본으로 쓴다. 부산은 다르므로
    노선에 적어 두고 엔진이 그것을 먼저 읽게 한다. 없으면 서울 값으로 물러난다."""
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


# ── ⑥ 검증 ─────────────────────────────────────────────────────────────────
COVID = 873.0 / 673.0     # 부산교통공사 1일 평균 수송: 2020년 67.3만 → 2025년 87.3만
SOUTH_DEST = {'다대포해수욕장', '다대포항', '신평', '동매', '대티'}


def read_truth():
    if not os.path.exists(TRUTH_ZIP):
        C.die('검증에는 정답지가 필요하다: python pipeline/fetch_busan.py --truth')
    z = zipfile.ZipFile(TRUTH_ZIP)
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
            st = SPEC.ALIAS.get(st, st)
            # 색인은 다대포(0) → 노포(39). 노포행이 하선(0), 다대포행이 상선(1).
            k = (st, 1 if c[3].strip() in SOUTH_DEST else 0, h)
            tot[k] += sum(vals) / len(vals)
            cnt[k] += 1
    return {k: tot[k] / cnt[k] for k in tot}


def run_validate(lines, on, off, stations, paths, lns):
    truth = read_truth()
    seq = lines['부산 1호선']
    li = lns.index('부산 1호선')
    cars, cap, seats, veh = SPEC.LINES['부산 1호선']
    xs, ys = [], []
    for h in (7, 8, 9, 12, 17, 18, 19):
        loads, _b, _a = assign(stations, paths, on, off, 'weekday', h)
        per = SPEC.trains_per_hour('부산 1호선', h) * cars * cap
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
    C.log('== 검증 (1호선 실측 2020~2021, 연도차 %.2f배 보정) ==' % COVID)
    C.log('  짝 %d · 상관 %.3f · 기울기 %.2f · 평균오차 %.1f%%p' % (len(xs), r, mx / my, mae))
    if r < 0.90:
        C.die('상관이 0.90 아래다 — 모형이나 자료가 어긋났다. 그대로 내보내지 말 것.')
    if not 0.85 <= mx / my <= 1.20:
        C.die('기울기가 0.85~1.20 밖이다 — 재차 수준이 어긋났다.')
    C.log('  통과.')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='부산 승하차 → 혼잡도')
    ap.add_argument('--validate', action='store_true', help='1호선 실측과 맞대 본다')
    a = ap.parse_args()
    build(validate=a.validate)
