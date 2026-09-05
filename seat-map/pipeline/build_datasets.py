# -*- coding: utf-8 -*-
"""build_datasets.py — 원천 파일들 → 화면이 필터해서 읽을 데이터셋.

요구(2026-09-04 사용자): **역별·노선별·버스정류장별·버스노선별·시간별·10분단위·평일/주말별로
각각 따로 걸러져야 한다.** 그러려면 축마다 값이 살아 있는 채로 저장돼야 한다.
합쳐서 평균 내 버리면 그 축은 영영 못 되살린다.

만드는 것
  data/subway/ride.json            지하철 역별×요일×승·하차×시간(1시간, 20칸)
  data/bus/index.json              버스 노선 목록 + 정류장 목록(좌표 포함)
  data/bus/routes/<노선번호>.json   그 노선의 정류장별×승·하차×시간(1시간, 24칸)
  data/facets.json                 필터 축의 목록 (화면의 드롭다운이 이걸 읽는다)

  ※ data/subway/congestion.json 은 build_congestion.py 가 따로 만든다(30분·방향별).

10분 단위는 **여기서 만들지 않는다.** 저장은 원천 해상도 그대로, 10분 값은
브라우저에서 engine/interp.js 가 만든다(사양서 3.3). 용량이 6배 줄고 원천 갱신이 그대로 반영된다.

사용법
  python build_datasets.py             # 전부
  python build_datasets.py --only bus  # subway | bus | facets
"""
import argparse
import csv
import io
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

OPEN = os.path.join(C.RAW, 'open')
DAY_NAMES = {'weekday': '평일', 'saturday': '토요일', 'sunday': '일요일·공휴일'}


def read_csv_big(path):
    """15~25MB 짜리를 다룬다. common.read_csv_rows 와 같은 인코딩 순서."""
    raw = open(path, 'rb').read()
    text = None
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode('cp949', 'replace')
    return csv.reader(io.StringIO(text))


def canon_station(name):
    """역 이름을 원천 사이에서 맞춘다.

    같은 역을 원천마다 다르게 적는다 — 혼잡도(OA-12928)는 「월곡」,
    승하차(OA-12921)는 「월곡(동덕여대)」. 그대로 두면 두 자료가 영영 안 이어진다.
    (사양서 6.2-② 가 경고한 그 버그가 우리 데이터 안에서 그대로 났다.)
    괄호 안 부역명을 떼서 키로 쓰고, 보여줄 이름은 따로 남긴다.
    """
    return re.sub(r'\s*\([^)]*\)\s*$', '', str(name or '').strip()).strip() or str(name or '').strip()


def num(v):
    try:
        return float(str(v).replace(',', '').strip() or 0)
    except ValueError:
        return 0.0


# ── 지하철 역별 일별 시간대별 승하차 (OA-12921) ────────────────────────────
# 컬럼: 연번, 수송일자, 호선, 역번호, 역명, 승하차구분, 06시이전, 06-07시간대 … 23-24시간대, 24시이후
# 시각 격자: 06시이전을 05:00 칸으로 보고 60분 간격 20칸 (05:00 ~ 24:00)
SUBWAY_START = 300
SUBWAY_SLOT = 60
SUBWAY_SLOTS = 20


def build_subway_ride():
    src_dir = os.path.join(OPEN, 'subwayride')
    if not os.path.isdir(src_dir):
        C.log('  지하철 일별 원천이 없다 — 건너뜀')
        return None
    files = [os.path.join(src_dir, f) for f in os.listdir(src_dir) if f.lower().endswith('.csv')]
    if not files:
        C.log('  지하철 일별 원천이 없다 — 건너뜀')
        return None

    holidays = C.load_holidays()
    # (호선, 역명, 요일, 승하차) → [합계 20칸], 그리고 날짜 수
    acc, days_seen = {}, {}
    stations, display = {}, {}
    rows_read = bad = 0

    for path in files:
        rdr = read_csv_big(path)
        head = next(rdr, None)
        if not head:
            continue
        for r in rdr:
            if len(r) < 6 + SUBWAY_SLOTS:
                bad += 1
                continue
            rows_read += 1
            try:
                d = datetime.strptime(r[1].strip()[:10], '%Y-%m-%d').date()
            except ValueError:
                bad += 1
                continue
            day = C.day_type(d, holidays)
            line = re.sub(r'[^0-9]', '', r[2]) or r[2].strip()
            full = r[4].strip()
            station = canon_station(full)
            display.setdefault(station, full)
            kind = '승차' if '승' in r[5] else '하차'
            key = (line, station, day, kind)
            vals = [num(r[6 + i]) for i in range(SUBWAY_SLOTS)]
            cur = acc.get(key)
            if cur is None:
                acc[key] = list(vals)
            else:
                for i in range(SUBWAY_SLOTS):
                    cur[i] += vals[i]
            days_seen.setdefault((day, r[1].strip()[:10]), 1)
            stations.setdefault(line, set()).add(station)

    # 요일별 날짜 수로 나눠 「그 요일의 하루 평균」을 만든다
    day_count = {}
    for (day, _date) in days_seen:
        day_count[day] = day_count.get(day, 0) + 1

    grid = {}
    for (line, station, day, kind), vals in acc.items():
        n = max(1, day_count.get(day, 1))
        grid['%s|%s|%s|%s' % (line, station, day, kind)] = [round(v / n, 1) for v in vals]

    # 호선 전체 합계(역별 필터를 안 걸었을 때 보여줄 값)
    line_acc = {}
    for (line, station, day, kind), vals in acc.items():
        k = (line, day, kind)
        cur = line_acc.get(k)
        if cur is None:
            line_acc[k] = list(vals)
        else:
            for i in range(SUBWAY_SLOTS):
                cur[i] += vals[i]
    for (line, day, kind), vals in line_acc.items():
        n = max(1, day_count.get(day, 1))
        grid['%s|전체|%s|%s' % (line, day, kind)] = [round(v / n, 1) for v in vals]

    doc = {
        'startMinutes': SUBWAY_START, 'slotMinutes': SUBWAY_SLOT, 'slots': SUBWAY_SLOTS,
        'unit': '그 요일 하루 평균 승객수(명). 교통카드 기준 — 현금 승하차는 빠져 있다',
        'source': '서울교통공사_역별 일별 시간대별 승하차인원 (열린데이터광장 OA-12921, 인증키 불필요)',
        'dayCount': day_count,
        'stationNames': display,
        'note': '첫 칸(05:00)은 원천의 「06시이전」, 마지막 칸(24:00)은 「24시이후」다. '
                '공휴일 표(data/holidays.json)가 비어 있으면 음력 명절이 평일에 섞인다.',
        'grid': grid,
    }
    C.save_json(os.path.join(C.DATA, 'subway', 'ride.json'), doc)
    C.log('  지하철 승하차 — %d행 읽음%s, 키 %d개, 날짜 %s'
          % (rows_read, ', 건너뜀 %d행' % bad if bad else '', len(grid),
             ', '.join('%s %d일' % (DAY_NAMES[k], v) for k, v in sorted(day_count.items()))))
    return {'lines': {k: sorted(v) for k, v in stations.items()}}


# ── 버스 노선별 정류장별 시간대별 승하차 (OA-12913) ────────────────────────
# 컬럼: 사용년월, 노선번호, 노선명, 표준버스정류장ID, 버스정류장ARS번호, 역명,
#       00시승차총승객수, 00시하차총승객수, … 23시승차, 23시하차
BUS_SLOTS = 24


def days_in_month(yyyymm):
    """「사용년월」(예: 202605) → 그 달의 날짜 수.

    ★ 이걸 안 나누면 30배가 부풀어 오른다 ★
    OA-12913 의 한 행은 그 달의 **총계**다(첫 열이 사용년월). 그런데 예전 코드는
    행 수(= 월 파일 개수 3)로만 나눠 「월 평균」을 만들어 놓고 「하루 평균」이라 적었다.
    그 값을 loads.js 가 **시간당 인원**으로 읽어 시간당 버스 대수로 나누니
    한 달치 승객을 버스 열 대에 다 태우는 셈이 됐다 —
    간선버스가 전부 「앉을 확률 0%」로 나오고, 승객이 많은 노선일수록 정렬에서 꼴찌가 됐다.

    검산: 2026-05 원천 전체 승차 150,975,269명 ÷ 31일 = 487만명/일.
    서울 버스 하루 승차(약 480~490만)와 맞는다.
    """
    try:
        y, m = int(str(yyyymm)[:4]), int(str(yyyymm)[4:6])
    except (ValueError, TypeError):
        return 30.4
    if m in (1, 3, 5, 7, 8, 10, 12):
        return 31
    if m != 2:
        return 30
    return 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28


def build_bus():
    src_dir = os.path.join(OPEN, 'busride')
    if not os.path.isdir(src_dir):
        C.log('  버스 원천이 없다 — 건너뜀')
        return None
    files = sorted(os.path.join(src_dir, f) for f in os.listdir(src_dir) if f.lower().endswith('.csv'))
    if not files:
        C.log('  버스 원천이 없다 — 건너뜀')
        return None

    coords = load_stop_coords()
    # 노선 → 정류장ID → {name, ars, on[24], off[24], months}
    routes = {}
    route_names = {}
    route_types = {}          # 노선번호 → 원천이 말하는 교통수단타입명
    stops = {}
    months = set()
    rows_read = bad = 0

    for path in files:
        rdr = read_csv_big(path)
        head = next(rdr, None)
        if not head:
            continue
        for r in rdr:
            if len(r) < 6 + BUS_SLOTS * 2:
                bad += 1
                continue
            rows_read += 1
            ym = r[0].strip()
            months.add(ym)
            days = days_in_month(ym)
            route = r[1].strip()
            route_names[route] = r[2].strip()
            # ★ 노선 종류를 이름으로 추측하지 않는다 ★
            # 원천(OA-12913)의 마지막 열이 「교통수단타입명」이다 — 서울간선버스·서울지선버스·
            # 서울마을버스·서울광역버스·서울심야버스·서울순환버스를 **원천이 직접 알려 준다.**
            # 예전에는 번호 자릿수로 추측해 665개 중 44개가 틀렸고, 그 전부가 좌석 수까지 틀렸다
            # (741번은 4자리지만 간선, 9401-1·서울01출근은 광역인데 마을버스로 봤다).
            # 좌석 수와 배차 대수가 여기서 갈리므로 앉을 확률이 통째로 달라진다.
            if len(r) > 55 and r[55].strip():
                route_types[route] = r[55].strip()
            sid = r[3].strip()
            ars = r[4].strip()
            name = re.sub(r'\(\d+\)$', '', r[5].strip())     # 「종로2가사거리(00089)」 → 「종로2가사거리」
            rec = routes.setdefault(route, {}).setdefault(sid, {
                'name': name, 'ars': ars, 'on': [0.0] * BUS_SLOTS, 'off': [0.0] * BUS_SLOTS, 'n': 0})
            for h in range(BUS_SLOTS):
                # 그 달의 총계를 날짜 수로 나눠 **하루 값**으로 만든 뒤 더한다
                rec['on'][h] += num(r[6 + h * 2]) / days
                rec['off'][h] += num(r[7 + h * 2]) / days
            rec['n'] += 1
            st = stops.setdefault(sid, {'name': name, 'ars': ars, 'routes': set()})
            st['routes'].add(route)

    os.makedirs(os.path.join(C.DATA, 'bus', 'routes'), exist_ok=True)
    index_routes = []
    for route, by_stop in routes.items():
        secs = []
        for sid, rec in by_stop.items():
            k = max(1, rec['n'])
            secs.append({
                'stopId': sid, 'ars': rec['ars'], 'name': rec['name'],
                'on': [round(v / k, 1) for v in rec['on']],
                'off': [round(v / k, 1) for v in rec['off']],
            })
        secs.sort(key=lambda s: s['ars'])
        C.save_json(os.path.join(C.DATA, 'bus', 'routes', safe_name(route) + '.json'), {
            'route': route, 'routeName': route_names.get(route, route),
            'vehicleType': route_types.get(route),      # 원천이 말하는 노선 종류 (추측이 아니다)
            'startMinutes': 0, 'slotMinutes': 60, 'slots': BUS_SLOTS,
            'months': sorted(months),
            'unit': '하루 평균 승객수(명) — 월 총계를 그 달 날짜 수로 나눈 값. '
                    '**요일 구분 없음**(원천이 월 집계라 평일·주말이 섞여 있다)',
            'stops': secs,
        })
        index_routes.append({'route': route, 'name': route_names.get(route, route),
                             'vehicleType': route_types.get(route), 'stops': len(secs)})

    index_stops = []
    for sid, st in stops.items():
        c = coords.get(sid) or coords.get(st['ars'])
        index_stops.append({
            'stopId': sid, 'ars': st['ars'], 'name': st['name'],
            'routes': sorted(st['routes']),
            'lat': c['lat'] if c else None, 'lon': c['lon'] if c else None,
        })
    index_routes.sort(key=lambda x: x['route'])
    index_stops.sort(key=lambda x: x['name'])
    withxy = sum(1 for s in index_stops if s['lat'] is not None)
    C.save_json(os.path.join(C.DATA, 'bus', 'index.json'), {
        'months': sorted(months),
        'source': '버스노선별 정류장별 시간대별 승하차 (OA-12913) + 정류소 위치정보 (OA-15067)',
        'note': '월 집계라 평일/주말 구분이 없다. 요일별은 T-DATA(일자별) 키가 있어야 한다.',
        'routes': index_routes, 'stops': index_stops,
    })
    C.log('  버스 — %d행 읽음%s, 노선 %d개, 정류장 %d개(좌표 %d개), 월 %s'
          % (rows_read, ', 건너뜀 %d행' % bad if bad else '', len(index_routes),
             len(index_stops), withxy, '·'.join(sorted(months))))
    return {'routes': index_routes, 'stops': index_stops}


def safe_name(s):
    """노선번호가 파일 이름이 된다. 윈도우에서 금지된 글자를 막는다."""
    return re.sub(r'[^0-9A-Za-z가-힣_-]', '_', s)[:60] or 'unknown'


def load_stop_coords():
    """정류소 위치정보(OA-15067) 에서 정류장ID/ARS → 좌표."""
    src_dir = os.path.join(OPEN, 'busstops')
    if not os.path.isdir(src_dir):
        return {}
    out = {}
    for f in os.listdir(src_dir):
        path = os.path.join(src_dir, f)
        try:
            rows = C.read_table(path)
        except Exception as e:
            C.log('  정류소 위치 읽기 실패: %s' % e)
            continue
        if not rows:
            continue
        head = [re.sub(r'\s+', '', str(c)) for c in rows[0]]

        def find(*names):
            for nm in names:
                if nm in head:
                    return head.index(nm)
            return None
        # 실측 머리글(2026-09-02판): NODE_ID, ARS_ID, 정류소명, X좌표, Y좌표, 정류소타입
        i_id = find('표준정류장ID', '정류장ID', 'NODE_ID', '정류소ID')
        i_ars = find('ARS_ID', '정류소번호', 'ARS번호', '정류장번호')
        i_y = find('Y좌표', '위도', 'YCODE', 'LATITUDE')
        i_x = find('X좌표', '경도', 'XCODE', 'LONGITUDE')
        if i_y is None or i_x is None:
            C.log('  정류소 위치: 좌표 열을 못 찾았다 (머리글: %s)' % ', '.join(head[:8]))
            continue
        for r in rows[1:]:
            try:
                lat, lon = float(r[i_y]), float(r[i_x])
            except (ValueError, IndexError, TypeError):
                continue
            if not (33 < lat < 39 and 124 < lon < 132):     # 한반도 밖이면 좌표계가 다른 것이다
                continue
            for i in (i_id, i_ars):
                if i is not None and i < len(r) and str(r[i]).strip():
                    out[str(r[i]).strip()] = {'lat': lat, 'lon': lon}
    return out


# ── 필터 축 목록 ──────────────────────────────────────────────────────────
def build_facets(bus):
    """화면의 드롭다운이 읽는 파일. 어느 축으로 걸를 수 있는지가 여기 다 있다."""
    cong = C.load_json(os.path.join(C.DATA, 'subway', 'congestion.json'), {}) or {}
    ride = C.load_json(os.path.join(C.DATA, 'subway', 'ride.json'), {}) or {}

    lines, stations, dirs = {}, {}, set()
    for k in (cong.get('grid') or {}):
        p = k.split('|')
        if len(p) < 3:
            continue
        line, st, day = p[0], canon_station(p[1]) if p[1] != '전체' else p[1], p[2]
        lines.setdefault(line, set()).add(day)
        if st != '전체':
            stations.setdefault(line, set()).add(st)
        if len(p) >= 4:
            dirs.add(p[3])
    for k in (ride.get('grid') or {}):
        p = k.split('|')
        if len(p) >= 4 and p[1] != '전체':
            stations.setdefault(p[0], set()).add(p[1])
            lines.setdefault(p[0], set()).add(p[2])

    doc = {
        'dayTypes': [{'id': k, 'name': v} for k, v in DAY_NAMES.items()],
        'steps': [
            {'minutes': 10, 'name': '10분'}, {'minutes': 30, 'name': '30분'}, {'minutes': 60, 'name': '1시간'}],
        'stationNames': (ride.get('stationNames') or {}),
        'subway': {
            'lines': [{'line': l, 'name': l + '호선', 'stations': sorted(stations.get(l, []))}
                      for l in sorted(lines, key=lambda s: (len(s), s))],
            'directions': sorted(dirs),
            'measures': [
                {'id': 'congestion', 'name': '혼잡도(%)', 'file': 'subway/congestion.json',
                 'slotMinutes': cong.get('slotMinutes'), 'byDirection': True, 'byDayType': True},
                {'id': 'ride', 'name': '승·하차 인원(명)', 'file': 'subway/ride.json',
                 'slotMinutes': ride.get('slotMinutes'), 'byDirection': False, 'byDayType': True,
                 'kinds': ['승차', '하차']},
            ],
        },
        'bus': {
            'routes': (bus or {}).get('routes', []),
            'stopCount': len((bus or {}).get('stops', [])),
            'measures': [
                {'id': 'ride', 'name': '승·하차 인원(명)', 'file': 'bus/routes/<노선>.json',
                 'slotMinutes': 60, 'byDirection': False, 'byDayType': False,
                 'kinds': ['승차', '하차'],
                 'note': '월 집계라 평일/주말 구분이 없다'},
            ],
        },
        'note': '저장은 원천 해상도 그대로다. 10분 값은 브라우저에서 engine/interp.js 가 만든다(사양서 3.3).',
    }
    C.save_json(os.path.join(C.DATA, 'facets.json'), doc)
    nst = sum(len(l['stations']) for l in doc['subway']['lines'])
    C.log('  필터 축 — 호선 %d개/역 %d개, 버스노선 %d개/정류장 %d개, 요일 3, 단위 10·30·60분'
          % (len(doc['subway']['lines']), nst, len(doc['bus']['routes']), doc['bus']['stopCount']))


def main():
    ap = argparse.ArgumentParser(description='원천 → 필터용 데이터셋')
    ap.add_argument('--only', choices=['subway', 'bus', 'facets'])
    args = ap.parse_args()

    C.log('== 필터용 데이터셋 만들기 ==')
    bus = None
    if args.only in (None, 'subway'):
        build_subway_ride()
    if args.only in (None, 'bus'):
        bus = build_bus()
    if args.only in (None, 'facets'):
        if bus is None:
            idx = C.load_json(os.path.join(C.DATA, 'bus', 'index.json'), {}) or {}
            bus = {'routes': idx.get('routes', []), 'stops': idx.get('stops', [])}
        build_facets(bus)
    C.log('== 끝 ==')


if __name__ == '__main__':
    main()
