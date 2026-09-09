# -*- coding: utf-8 -*-
"""수도권 광역전철 승하차 → 구간 재차 → 혼잡도 (D-108).

우리 그래프의 지하철 46개 노선 중 23개(486역)가 「자료 없음 = 서서 간다」였다.
서울 열린데이터광장의 `CardSubwayTime`(역별 시간대별 승하차)과 역별 열차시간표로 그것을 채운다.
방법은 부산·대구에 쓴 것과 같다(D-103) — 중력모형 씨앗 + IPF + 최단경로 배분.

★ 노선 이름을 맞추지 않는다 ★
원천은 **운영 노선명**(경부선·경인선·중앙선), 우리 그래프는 **안내 노선명**(1호선·경의중앙선)이라
표로 이으려면 반드시 어긋난다. 대신 **역 이름으로** 붙인다 — 승하차는 어차피 역 단위 총계이고,
OD 모형도 역 노드 위에서 돈다. 환승역에서 여러 줄로 나뉘어 온 값은 그 역으로 합친다.

★ 배차는 세 겹이다 ★ 「이 나누는 수가 두 배 틀리면 앉을 확률이 통째로 뒤집힌다」.
  ① 1~9호선 계통(연장·경인·경원 포함)은 서울 시간표 API 가 **역마다** 세어 준다(rail-tph.json).
     실측해 보니 1호선은 연천~신창~인천 102역이 전부 들어 있다 — 번호 없는 노선만 빈다.
  ② 코레일 노선(경의중앙·수인분당·경춘·경강)은 시간표가 없다 — 코레일 「여객열차 운행횟수」
     파일의 전동차 회/일을 1호선 하루 모양으로 펴서 시간당으로 나눈다(부산에서 쓴 방식).
  ③ 그마저 없는 민자·경전철(신분당·공항철도·김포…)은 운영사가 공표한 배차간격을 손으로 적는다.
  배차를 역별로 붙일 때는 반드시 (원천 노선, 역이름) 짝으로 찾는다 — 이름만 보면
  신림선 「신림」에 2호선 신림의 열차 수가 붙는 사고가 난다.

★ 승하차 원천이 없는 노선은 혼잡도를 만들지 않는다 ★
CardSubwayTime 에 신분당선·김포골드라인·에버라인·의정부경전철은 아예 없다. 동명 환승역
(강남·김포공항…)만 값이 걸려 혼잡도가 0%대로 나온다 — 첨두 김포골드를 「빈 차」로 보여주는
것은 「자료 없음」보다 훨씬 나쁘다. 그런 노선은 배차·편성만 적고 혼잡도는 비워 둔다.

★ 요일이 없다 ★ 원천이 월 단위 합계라 평일·토·일을 못 가른다. 그래서 **우리가 이미 가진
서울 지하철 실측**(ride.json, 요일별)에서 시간대별 요일 비를 뽑아 나눈다. 어림이므로 밝힌다.

★ 검증 ★ 1호선 서울 구간은 **실측 혼잡도가 이미 있다**(서울교통공사). 모형이 그 구간을
얼마나 맞히는지로 계수를 확인한다 — 부산에서 한 것과 같은 방식이다.

사용: python pipeline/build_rail_congestion.py [--validate]
"""
import argparse
import calendar
import collections
import io
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C            # noqa: E402
import city_spec as SPEC      # noqa: E402
import build_city_congestion as B   # noqa: E402

RAW = os.path.join(C.RAW, 'seoulrail')
GRAPH = os.path.join(C.DATA, 'graph')
TPH = os.path.join(C.DATA, 'subway', 'rail-tph.json')
RUNS = os.path.join(C.RAW, 'korail', 'runs.json')
OUT = os.path.join(C.DATA, 'subway', 'rail.json')

CONG_START, CONG_STEP, CONG_SLOTS = 330, 30, 39
RIDE_START, RIDE_STEP, RIDE_SLOTS = 300, 60, 20
DAYS = ('weekday', 'saturday', 'sunday')

# 이 모형의 오차 폭(한 칸 %p). --validate 가 1·3·4호선 실측 828짝과 맞대 잰 평균오차다
# (상관 0.83 · 기울기 0.96). 부산(8%)보다 크다 — 요일도 배차도 어림이 한 겹씩 더 끼어서다.
RAIL_ERROR_PCT = 12.0

# 노선별 편성 량수와 차종. 확인한 것만 적고 나머지는 대형 8량으로 둔다(코레일 광역전철 기본).
#   경의중앙 8량 · 수인분당 6량 · 경춘 8량 · 서해 4량 · 경강 4량 (위키백과 「수도권 전철의 차량」)
#   신분당 6량 · 공항철도 6량 · 9호선 6량 · 동해선 4량 · 대경선 2량
#   경전철(우이신설 2·신림 3·김포 2·에버라인 1·의정부 2량)은 대형차와 정원이 딴판이라 AGT 차종을 쓴다
CARS = {
    '1': (10, 'subwayCar'), '1호선(인천 방면)': (10, 'subwayCar'),
    '3': (10, 'subwayCar'), '4': (10, 'subwayCar'),
    '경원선': (10, 'subwayCar'),
    '경의중앙선': (8, 'subwayCar'), '경의중앙선(청량리~지평)': (8, 'subwayCar'),
    '수인분당선': (6, 'subwayCar'), '경춘선': (8, 'subwayCar'),
    '서해선': (4, 'subwayCar'), '경강선': (4, 'subwayCar'),
    '인천국제공항선': (6, 'subwayCar'), '신분당선': (6, 'subwayCar'),
    '9호선': (6, 'subwayCar'),
    '7호선(연장)': (8, 'subwayCar'), '8호선(연장)': (6, 'subwayCar'),
    '동해선': (4, 'subwayCar'),
    '대경선': (2, 'subwayCar'), '대경선(서대구~경산)': (2, 'subwayCar'),
    '우이신설선': (2, 'subwayLightAGT'), '신림선': (3, 'subwayLightAGT'),
    '김포도시철도': (2, 'subwayLightAGT'), '에버라인': (1, 'subwayLightAGT'),
    '의정부': (2, 'subwayLightAGT'), '자기부상철도': (2, 'subwayLightAGT'),
}
DEFAULT_CARS = (8, 'subwayCar')

# 그래프 노선 → 서울 시간표의 번호 노선. 이 계통은 역별 배차를 그대로 쓴다(①).
NUM_SRC = {'1': '01호선', '1호선(인천 방면)': '01호선', '경원선': '01호선',
           '2': '02호선', '3': '03호선', '4': '04호선', '5': '05호선', '6': '06호선',
           '7': '07호선', '7호선(연장)': '07호선', '8': '08호선', '8호선(연장)': '08호선',
           '9호선': '09호선'}

# 그래프 노선 → 코레일 「여객열차 운행횟수(주중)」의 운영 노선명(②). 값은 전동차 회/일(왕복).
# 직결 계통은 구간별 값 중 큰 쪽을 대표로 쓴다(핵심 구간 기준 — 지선 값은 몇 배 작게 나온다).
KORAIL_MAP = {'경의중앙선': ('중앙선', '경의선'), '경의중앙선(청량리~지평)': ('중앙선',),
              '수인분당선': ('분당선', '수인선'), '경춘선': ('경춘선',),
              '경강선': ('경강선',), '동해선': ('동해남부선',)}

# 원천이 아예 없는 노선의 공표 배차간격(첨두분, 평시분)(③). 각 운영사 안내 기준(2026).
# 자기부상철도는 휴업이 잦아 가장 성긴 값으로 둔다.
HEADWAY = {'신분당선': (5, 8), '인천국제공항선': (5.5, 8), '서해선': (12, 20),
           '우이신설선': (3.5, 6), '신림선': (3.5, 7), '김포도시철도': (3, 6),
           '에버라인': (4, 6), '의정부': (5.5, 10),
           '대경선': (19, 25), '대경선(서대구~경산)': (19, 25),
           '자기부상철도': (15, 15)}

# 승하차 원천(CardSubwayTime 27개 노선)에 대응이 있는 노선 — 이들만 혼잡도를 만든다.
# ★ 서해선은 원천이 있는데도 뺀다 ★ 대곡소사 연장 구간의 승하차가 김포공항(5·9호선·공항철도·
# 김포골드 합산)·부천종합운동장(7호선) 같은 초대형 환승허브의 타 노선 몫까지 역 이름으로 합산돼,
# 4량·시간 3~5대짜리 서해선에 폭주 OD 가 실렸다(40칸 중 10칸이 천장 200%). 노선 절반이
# 그 지경이면 값이 아니라 소음이다 — 배차·편성만 적고 혼잡도는 「모름 = 서서」로 둔다.
BOARD_SRC = {'1호선(인천 방면)', '7호선(연장)', '8호선(연장)', '9호선', '경강선', '경원선',
             '경의중앙선', '경의중앙선(청량리~지평)', '경춘선', '수인분당선',
             '신림선', '우이신설선', '인천국제공항선'}
BOARD_MIN = 0.4   # 이름이 붙는 역이 이보다 적으면 모형이 헛돈다 — 혼잡도를 만들지 않는다

# 수도권 망이 아니거나 고립된 것 — 역 이름이 같아 유령 환승이 생긴다
# (부산 동해선 「교대」 ↔ 서울 2호선 「교대」). OD 망에서 빼고 배차·편성만 적는다.
NETWORK_SKIP = {'동해선', '대경선', '대경선(서대구~경산)', '자기부상철도'}

# 서울 구간만 실측이고 코레일 직결 구간(경부·일산·과천안산선)은 비어 있는 노선.
# ★ 그래프 상태(noCong 존재)에서 유도하면 안 된다 ★ — 상태가 바뀌면 판정도 따라 변해
# 두 번째 실행에서 노선이 통째로 빠진 적이 있다. 이름으로 못 박는다.
MIXED_LINES = ('1', '3', '4')


def flat(s):
    """공백·괄호 별명을 걷어낸 역 이름 — 「신창(순천향대)」과 원천의 「신창」을 잇는다."""
    return re.sub(r'\(.*?\)', '', str(s or '').replace(' ', '')).strip()


def clean_seq(seq):
    """왕복이 이어붙은 역 나열을 편도로 정리한다 — OD 모형용(원본 그래프는 안 건드린다).

    수인분당선 stops 는 인천→서울→인천 한 바퀴(97역)라 인접성이 꼬여 최단경로가
    이 노선을 통째로 기피했다(전 구간이 바닥값 1%가 됐다 — 실제로 그랬다).
    ★ 자를 때는 남은 꼬리가 전부 이미 본 역일 때만 자른다 ★ 새 역이 섞여 있으면
    지선·급행 계통을 이어붙인 것(5호선 마천지선·9호선 급행)이라 자르면 역을 잃는다."""
    # 갔다가 바로 돌아오는 막다른 지선 [A, B, A] — B(9호선 개화)를 본선 사슬에서 걷는다.
    # 두면 B 가 본선 한가운데 낀 것처럼 되어 0% 키가 생기고, 엔진이 「안 다님」으로 읽는다.
    # B 는 키가 아예 없는 편이 낫다 — 이웃 메우기(D-79)가 옆 역 값으로 채워 준다.
    trimmed, i = [], 0
    while i < len(seq):
        if i + 2 < len(seq) and seq[i] == seq[i + 2] and seq[i] != seq[i + 1]:
            trimmed.append(seq[i])
            i += 3
        else:
            trimmed.append(seq[i])
            i += 1
    out, seen = [], set()
    for i, s in enumerate(trimmed):
        if out and s == out[-1]:
            continue                          # 같은 역 연속(자료 오류)은 걷는다
        if s in seen and all(x in seen for x in trimmed[i:]):
            break                             # 순수 되돌이 — 처음 돌아오는 데서 끊는다
        out.append(s)
        seen.add(s)
    return out


def load_boardings():
    """월별 파일 → 역 이름별 시간대 승·하차(하루 평균). 중복 행은 (노선,역)으로 접는다."""
    if not os.path.isdir(RAW):
        C.die('%s 가 없다. fetch_seoul_rail.py 를 먼저 돌린다.' % RAW)
    on = collections.defaultdict(lambda: [0.0] * 24)
    off = collections.defaultdict(lambda: [0.0] * 24)
    months = 0
    for fn in sorted(os.listdir(RAW)):
        if not fn.endswith('.json') or fn == 'stations.json':
            continue
        doc = json.load(io.open(os.path.join(RAW, fn), encoding='utf-8'))
        ym = str(doc.get('month') or fn[:6])
        try:
            days = calendar.monthrange(int(ym[:4]), int(ym[4:6]))[1]
        except Exception:
            days = 30
        seen = set()
        for r in doc.get('rows', []):
            keypair = (r.get('SBWY_ROUT_LN_NM'), r.get('STTN'))
            if keypair in seen:
                continue                     # API 가 같은 줄을 두 번 주는 달이 있다
            seen.add(keypair)
            nm = flat(r.get('STTN'))
            if not nm:
                continue
            for h in range(24):
                a = r.get('HR_%d_GET_ON_NOPE' % h)
                b = r.get('HR_%d_GET_OFF_NOPE' % h)
                if a:
                    on[nm][h] += float(a) / days
                if b:
                    off[nm][h] += float(b) / days
        months += 1
    if not months:
        C.die('월별 자료가 없다.')
    for d in (on, off):
        for k in d:
            for h in range(24):
                d[k][h] /= months
    C.log('  승하차 %d달 평균 · 역 %d곳' % (months, len(on)))
    return on, off


def day_factors(ride):
    """서울 지하철 실측(요일별)에서 시간대별 요일 비를 뽑는다.

    월 합계는 평일·토·일이 섞여 있다. 그 섞인 값을 1로 보고 각 요일이 몇 배인지 구한다.
    (한 달 ≈ 평일 21 · 토 4.3 · 일 5.7 로 잡는다 — 공휴일이 일요일 쪽에 들어간다.)"""
    W, S, U = 21.0, 4.3, 5.7
    tot = {d: [0.0] * 24 for d in DAYS}
    grid = ride.get('grid') or {}
    for k, arr in grid.items():
        p = k.split('|')
        if len(p) != 4 or p[3] != '승차' or p[2] not in tot:
            continue
        for i, v in enumerate(arr):
            h = (RIDE_START + RIDE_STEP * i) // 60 % 24
            tot[p[2]][h] += float(v or 0)
    out = {d: [1.0] * 24 for d in DAYS}
    for h in range(24):
        mix = (tot['weekday'][h] * W + tot['saturday'][h] * S + tot['sunday'][h] * U) / (W + S + U)
        if mix <= 0:
            continue
        for d in DAYS:
            out[d][h] = tot[d][h] / mix if tot[d][h] > 0 else 1.0
    return out


def load_tph():
    """역별 시간표 배차 — (원천 노선, 역이름) 으로 색인한다.

    이름만으로 붙이면 신림선 「신림」에 2호선 신림의 열차 수가,
    신분당선 「강남」에 2호선 강남의 열차 수가 붙는다. 노선 짝을 반드시 본다."""
    try:
        doc = json.load(io.open(TPH, encoding='utf-8'))
    except Exception:
        C.log('  rail-tph.json 이 없다 — 노선 대표값으로만 간다(정확도가 떨어진다)')
        return {}
    out = {}
    for v in (doc.get('stations') or {}).values():
        nm, ln = flat(v.get('name')), str(v.get('line') or '')
        arr = v.get('tph') or []
        if nm and len(arr) == 24:
            old = out.get((ln, nm))
            if not old or sum(arr) > sum(old):
                out[(ln, nm)] = arr
    return out


def line_fallbacks(order_all, sttph):
    """노선 대표 배차(시간당·한 방향) 24칸 — ①시간표 중앙값 ②코레일 회/일 ③공표 배차간격."""
    # 하루 모양: 1호선 전 역 중앙값을 정규화한다 — 코레일 광역전철도 첨두 구조가 같다
    ones = [a for (ln, _n), a in sttph.items() if ln == '01호선']
    shape = []
    for h in range(24):
        xs = sorted(a[h] for a in ones)
        shape.append(float(xs[len(xs) // 2]) if xs else 0.0)
    tot = sum(shape) or 1.0
    shape = [x / tot for x in shape]
    try:
        runs = json.load(io.open(RUNS, encoding='utf-8'))
    except Exception:
        runs = {}
        C.log('  코레일 운행횟수(runs.json)가 없다 — 경의중앙·수인분당 등은 공표값도 없어 빈다')
    fb, how = {}, {}
    for ln, seq in order_all.items():
        src = NUM_SRC.get(ln)
        if src:
            arrs = [sttph[(src, flat(s))] for s in seq if (src, flat(s)) in sttph]
            if len(arrs) >= 3:
                fb[ln] = [sorted(a[h] for a in arrs)[len(arrs) // 2] for h in range(24)]
                how[ln] = '시간표'
                continue
        ops = [float(runs[o]) for o in KORAIL_MAP.get(ln, ()) if runs.get(o)]
        if ops:
            daily = max(ops) / 2.0                     # 왕복 → 한 방향
            fb[ln] = [round(daily * s, 2) for s in shape]
            how[ln] = '코레일 회/일'
            continue
        if ln in HEADWAY:
            pk, base = HEADWAY[ln]
            p, b = 60.0 / pk, 60.0 / base
            arr = [0.0] * 24
            for h in range(6, 23):
                arr[h] = b
            arr[0], arr[5], arr[23] = b * 0.5, b * 0.7, b * 0.7
            for h in (7, 8, 17, 18):
                arr[h] = p
            fb[ln] = [round(x, 2) for x in arr]
            how[ln] = '공표 배차'
    return fb, how


def main():
    ap = argparse.ArgumentParser(description='수도권 광역전철 혼잡도')
    ap.add_argument('--validate', action='store_true', help='1호선 실측과 맞대 본다')
    a = ap.parse_args()

    doc = json.load(io.open(os.path.join(GRAPH, 'routes.json'), encoding='utf-8'))
    cong = json.load(io.open(os.path.join(C.DATA, 'subway', 'congestion.json'), encoding='utf-8'))
    ride = json.load(io.open(os.path.join(C.DATA, 'subway', 'ride.json'), encoding='utf-8'))
    have = {k.split('|')[0] for k in cong['grid']}
    try:
        cities = json.load(io.open(os.path.join(C.DATA, 'subway', 'cities.json'), encoding='utf-8'))
        have |= {k.split('|')[0] for k in cities['congestion']['grid']}
    except Exception:
        pass

    # 수도권 지하철 노선만 (부산·대구 등은 line 이름으로 걸러진다)
    subs = [r for r in doc['routes'] if r.get('kind') == 'subway'
            and not str(r.get('line') or '').startswith(('부산', '대구', '대전', '광주', '인천지하철'))]
    order_all, sides = {}, {}
    for r in subs:
        ln = r.get('line') or r['name']
        order_all.setdefault(ln, clean_seq(r['stops'][0]))
        # ★ 방향 라벨은 노선마다 다르다 ★ 엔진은 route.dirLabels[방향]으로 격자를 찾는다
        # (1호선은 색인 증가가 「상선」, 대부분은 「하선」). 같은 표를 보고 써야 맞아떨어진다.
        dl = r.get('dirLabels') or []
        sides.setdefault(ln, ((dl[0] if len(dl) > 0 and dl[0] else '하선'),
                              (dl[1] if len(dl) > 1 and dl[1] else '상선')))
    order = {ln: v for ln, v in order_all.items() if ln not in NETWORK_SKIP}
    need = [ln for ln in order if ln not in have]
    # 실측 노선인데 코레일 직결 구간이 「모름 = 서서」(D-87 noCong)로 남은 것 — 1·3·4호선.
    # 그 구간을 모형으로 채운다. noCong 은 그래프에 그대로 남고, 엔진이 방향값 있는 역만 쓴다.
    mixed = [ln for ln in MIXED_LINES if ln in have and ln in order]
    C.log('== 수도권 광역전철 혼잡도 ==')
    C.log('  노선 %d개 중 자료 없는 %d개 + 직결 빈 구간 %d개(%s)를 채운다 (망 밖 %d개는 배차만)'
          % (len(order_all), len(need), len(mixed), ','.join(mixed),
             len(NETWORK_SKIP & set(order_all))))

    on_raw, off_raw = load_boardings()
    fac = day_factors(ride)
    sttph = load_tph()
    fb, how = line_fallbacks(order_all, sttph)
    for ln in sorted(fb):
        if ln in have:
            continue
        t = fb[ln]
        C.log('   배차 %-18s %-8s 08시 %4.1f · 13시 %4.1f · 18시 %4.1f'
              % (ln, how[ln], t[8], t[13], t[18]))

    def tph_at(ln, st):
        src = NUM_SRC.get(ln)
        if src:
            arr = sttph.get((src, flat(st)))
            if arr:
                return arr
        return fb.get(ln) or []

    # 승하차 원천이 있고 이름이 충분히 붙는 노선만 혼잡도 대상이다
    covered = set()
    for ln in need + mixed:
        seq = order[ln]
        m = sum(1 for s in seq if flat(s) in on_raw)
        if (ln in BOARD_SRC or ln in mixed) and seq and m >= BOARD_MIN * len(seq):
            covered.add(ln)
        elif ln in BOARD_SRC or ln in mixed:
            C.log('   혼잡도 제외 %-18s 승하차가 붙는 역이 %d/%d뿐' % (ln, m, len(seq)))
    only_tph = sorted(set(need) - covered) + sorted(NETWORK_SKIP & set(order_all))
    if only_tph:
        C.log('  배차·편성만 적는 노선: %s' % ', '.join(only_tph))
    # 실측 노선은 실측이 있는 역을 절대 덮지 않는다 — 격자에 이미 있는 역을 여기서 접는다
    meas_st = {ln: set() for ln in mixed}
    for k in cong['grid']:
        p = k.split('|')
        if len(p) == 4 and p[0] in meas_st:
            meas_st[p[0]].add(p[1])

    names = {s for ln in order for s in order[ln]}
    matched = sum(1 for s in names if flat(s) in on_raw)
    C.log('  그래프 역 %d곳 중 승하차가 붙은 곳 %d곳' % (len(names), matched))

    on = collections.defaultdict(float)
    off = collections.defaultdict(float)
    for s in names:
        k = flat(s)
        if k not in on_raw:
            continue
        for dt in DAYS:
            for h in range(24):
                on[(dt, h, s)] = on_raw[k][h] * fac[dt][h]
                off[(dt, h, s)] = off_raw[k][h] * fac[dt][h]

    stations = sorted(names)
    lns, states, adj, byname = B.build_network(order, list(order))
    paths = B.shortest_paths(stations, states, adj, byname)
    C.log('  망: 역 %d · 노선 %d · 최단경로 계산' % (len(stations), len(lns)))

    grid, r_on, r_off, meta = {}, {}, {}, {}
    acc = collections.defaultdict(lambda: [0.0] * 24)
    aon = collections.defaultdict(lambda: [0.0] * 24)
    aoff = collections.defaultdict(lambda: [0.0] * 24)
    for dt in DAYS:
        for h in range(24):
            loads, board, alight = B.assign(stations, paths, on, off, dt, h)
            for li, ln in enumerate(lns):
                if ln not in covered:
                    continue
                cars, veh = CARS.get(ln, DEFAULT_CARS)
                cap = SPEC.VEHICLES.get(veh, (54, 160))[1] if veh in SPEC.VEHICLES else 160
                seq = order[ln]
                for p in range(len(seq) - 1):
                    # ★ 구간 배차는 양 끝 역의 큰 쪽 ★ 종착·지선역(신창·서동탄·광명)은
                    # 시간표가 한쪽 방향만 잡혀 tph 가 0인 시간이 있다 — 그 역에서 시작하는
                    # 구간이 0%가 되고, 지나는 leg 전체가 「안 다님」이 된다(실제로 그랬다).
                    ta, tb = tph_at(ln, seq[p]), tph_at(ln, seq[p + 1])
                    tv = max(ta[h] if len(ta) == 24 else 0, tb[h] if len(tb) == 24 else 0)
                    per = tv * cars * cap
                    if per <= 0:
                        continue                      # 그 시각 열차 없음 → 0 그대로 = 안 다님
                    for dr in (0, 1):
                        key = (ln, seq[p] if dr == 0 else seq[p + 1], dt, sides[ln][dr])
                        # ★ 바닥 1% ★ 흐름이 안 실린 구간을 0으로 두면 엔진이
                        # 「열차가 다니지 않는다」로 읽는다. 다니는 시각이면 빈 차로 적는다.
                        # ★ 천장 200% ★ 그보다 크면 값이 아니라 배차 과소(광명셔틀만 세인
                        # 금천구청 254%)의 신호다 — 정원 2배에서 자른다.
                        acc[key][h] = min(200.0, max(1.0, loads.get((li, p, dr), 0.0) / per * 100.0))
                for p, st in enumerate(seq):
                    aon[(ln, st, dt)][h] = board.get((li, p), 0.0)
                    aoff[(ln, st, dt)][h] = alight.get((li, p), 0.0)
        C.log('  %s 배분 끝' % dt)

    wrote_st = collections.defaultdict(set)
    for (ln, st, dt, side), hourly in acc.items():
        if ln in meas_st and st in meas_st[ln]:
            continue                       # 실측이 있는 역은 절대 덮지 않는다
        grid['%s|%s|%s|%s' % (ln, st, dt, side)] = B.to_slots(hourly, CONG_START, CONG_STEP, CONG_SLOTS)
        wrote_st[ln].add(st)
    for (ln, st, dt), hourly in aon.items():
        if ln in meas_st and st in meas_st[ln]:
            continue
        r_on['%s|%s|%s|승차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]
    for (ln, st, dt), hourly in aoff.items():
        if ln in meas_st and st in meas_st[ln]:
            continue
        r_off['%s|%s|%s|하차' % (ln, st, dt)] = [round(hourly[(5 + i) % 24], 1) for i in range(RIDE_SLOTS)]
    B.add_fallback_layers(grid)
    # 1·3·4호선의 「호선피크(|전체|)」는 코레일 구간만으로 만든 반쪽이라 버린다 —
    # 서울 실측의 |전체| 키가 이미 있고(합칠 때 실측이 이긴다), 반쪽 값은 오해만 만든다.
    for ln in mixed:
        for dt in DAYS:
            grid.pop('%s|전체|%s' % (ln, dt), None)

    # 엔진이 서울 기본값(정원 160·8칸·첨두 20대)으로 물러나지 않게 그래프에 실어 준다.
    # 실측 노선(서울 1~8호선·부산…)은 손대지 않는다 — 그쪽 계수는 D-103 검증에 물려 있다.
    for ln in order_all:
        if ln in have or ln not in fb or not any(fb[ln]):
            continue
        cars, veh = CARS.get(ln, DEFAULT_CARS)
        seats, cap2 = SPEC.VEHICLES.get(veh, (54, 160))
        # 낮 시간 배차간격(분) — 엔진의 기다림 계산(D-57 headwayMin)에 넣는다.
        # 서울 기본값(지하철 3분 대기)을 경의중앙(배차 13분)에 쓰면 소요시간이 거짓말이 된다.
        day = sorted(fb[ln][h] for h in range(6, 23))
        med = day[len(day) // 2]
        hw = max(2, min(30, int(round(60.0 / med)))) if med > 0 else None
        meta[ln] = {'cars': cars, 'vehicle': veh, 'capacity': cap2, 'seats': seats,
                    'headwayMin': hw,
                    'tph': [round(fb[ln][h], 2) for h in range(24)]}
    # noCong(D-87)은 그래프에 그대로 둔다 — 엔진이 「그 역의 방향값이 실제로 있으면 쓰고,
    # 없으면 옛날처럼 leg 전체를 모름」으로 읽는다(loads.js). 여기서 걷어내 버리면
    # rail.json 이 없는 구성(파이프라인 도중·파일 못 읽음)에서 호선피크 폴백이 되살아나
    # 없는 만원을 지어낸다 — D-87 이 막은 바로 그 사고다.
    n = 0
    for r in doc['routes']:
        m = meta.get(r.get('line'))
        if not m:
            continue
        r['vehicle'] = m['vehicle']; r['cars'] = m['cars']
        r['capacity'] = m['capacity']; r['tph'] = m['tph']
        if m.get('headwayMin'):
            r['headwayMin'] = m['headwayMin']
        n += 1
    C.save_json(os.path.join(GRAPH, 'routes.json'), doc)
    C.log('  그래프 노선 %d개에 편성·차종·배차를 적었다' % n)

    ride_grid = dict(r_on)
    ride_grid.update(r_off)
    out = {'note': '수도권 광역전철 — 승하차에서 되짚은 혼잡도(정원 대비 %). 실측이 아니다. '
                   '배차는 ①역별 시간표 ②코레일 운행횟수 ③공표 배차간격 순으로 붙였고, '
                   '요일은 서울 지하철 실측 비로 나눴다(D-108).',
           'estimated': True, 'estimatedLines': sorted(covered - set(mixed)),
           # 실측 노선의 직결 빈 구간만 채운 것 — 노선 전체가 아니라 이 역들만 추정이다
           'estimatedStations': {ln: sorted(wrote_st[ln]) for ln in mixed if wrote_st[ln]},
           'modelErrorPct': RAIL_ERROR_PCT,
           'congestion': {'startMinutes': CONG_START, 'slotMinutes': CONG_STEP,
                          'slots': CONG_SLOTS, 'grid': grid},
           'ride': {'startMinutes': RIDE_START, 'slotMinutes': RIDE_STEP,
                    'slots': RIDE_SLOTS, 'grid': ride_grid},
           'lines': meta}
    C.save_json(OUT, out)
    C.log('  혼잡도 칸 %d · 승하차 칸 %d → %s (%.1fMB)'
          % (len(grid), len(ride_grid), OUT, os.path.getsize(OUT) / 1e6))

    if a.validate:
        validate(order, stations, paths, on, off, tph_at, cong, sides, mixed or ['1'])


def validate(order, stations, paths, on, off, tph_at, cong, sides, lines):
    """실측 혼잡도가 있는 노선(1·3·4호선 서울 구간) — 모형이 그것을 얼마나 맞히나.

    방향 라벨은 반드시 그 노선의 dirLabels 로 잇는다 — 1호선은 색인 증가가 「상선」이라
    폴백 규칙으로 맞대면 아침 유입·유출이 뒤바뀌어 상관이 0 이 된다(실제로 그랬다)."""
    lns = list(order)
    hours = (7, 8, 9, 12, 17, 18)
    loads_by_h = {}
    for h in hours:
        loads_by_h[h] = B.assign(stations, paths, on, off, 'weekday', h)[0]
    ax, ay = [], []
    C.log('== 검증 (서울 구간 실측 혼잡도) ==')
    for ln in lines:
        if ln not in order:
            continue
        seq = order[ln]
        li = lns.index(ln)
        cars, veh = CARS.get(ln, DEFAULT_CARS)
        cap = SPEC.VEHICLES.get(veh, (54, 160))[1] if veh in SPEC.VEHICLES else 160
        xs, ys = [], []
        for h in hours:
            loads = loads_by_h[h]
            for p in range(len(seq) - 1):
                for dr in (0, 1):
                    st = seq[p] if dr == 0 else seq[p + 1]
                    arr = cong['grid'].get('%s|%s|weekday|%s' % (ln, st, sides[ln][dr]))
                    if not arr:
                        continue
                    i = int(round((h * 60 - CONG_START) / CONG_STEP))
                    if not (0 <= i < len(arr)):
                        continue
                    ta, tb = tph_at(ln, seq[p]), tph_at(ln, seq[p + 1])
                    per = max(ta[h] if len(ta) == 24 else 0,
                              tb[h] if len(tb) == 24 else 0) * cars * cap
                    if per <= 0:
                        continue
                    xs.append(loads.get((li, p, dr), 0.0) / per * 100.0)
                    ys.append(float(arr[i]))
        if len(xs) < 20:
            C.log('  %s호선: 짝 %d개뿐 — 건너뜀' % (ln, len(xs)))
            continue
        r, slope, mae = _stats(xs, ys)
        C.log('  %s호선: 짝 %d · 상관 %.3f · 기울기 %.2f · 평균오차 %.1f%%p'
              % (ln, len(xs), r, slope, mae))
        ax += xs; ay += ys
    if ax:
        r, slope, mae = _stats(ax, ay)
        C.log('  전체: 짝 %d · 상관 %.3f · 기울기 %.2f · 평균오차 %.1f%%p' % (len(ax), r, slope, mae))


def _stats(xs, ys):
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    r = cov / math.sqrt(vx * vy) if vx > 0 and vy > 0 else 0
    mae = sum(abs(x - y) for x, y in zip(xs, ys)) / len(xs)
    return r, (mx / my if my else 0), mae


if __name__ == '__main__':
    main()
