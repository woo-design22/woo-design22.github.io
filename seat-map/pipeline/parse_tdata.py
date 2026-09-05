# -*- coding: utf-8 -*-
"""parse_tdata.py — T-DATA 스키마 파서 + 정규화 레이어 + 요일별 집계 (사양서 M1-3).

하는 일
  1. 원천 행(a18Num00h … a18Num23h 처럼 시간이 필드 이름에 박힌 넓은 표)을
     {노선, 구간, 시간, 평균, 최대, 운행횟수, 초과횟수} 로 편다.
  2. 평균·최대·운행횟수로 **표준편차를 역산**한다(사양서 4.2).
     평균만 남기면 "8대 중 3대는 만원"이 사라진다.
  3. 여러 날짜를 요일(평일/토/일·공휴일)로 묶어 집계한다.
     T-DATA 는 일자별로만 주고 요일 구분값이 없다(사양서 4.2).
  4. 노선 단위 파일로 쪼개 내보낸다(사양서 3.4 — 노선 단위 샤딩 + 지연 로딩).

사용법
  python parse_tdata.py --selftest        # 가짜 표본으로 파서·집계를 시험 (키 불필요)
  python parse_tdata.py                   # data/raw/tdata/*.json 전부 집계
  python parse_tdata.py --allow-fake      # 가짜 표본까지 포함해서 집계 (개발용)

내보내는 것
  data/routes/<routeId>.json   노선 하나, 구간별·요일별·시간대별 {mean, sd, trips, over}
  data/routes/index.json       노선 목록과 구간 수

  ※ 바이너리 샤드(uint8)는 M1-5 다. 먼저 JSON 으로 내용을 맞춰 놓고,
     화면이 실제로 무엇을 읽는지 확정된 뒤에 압축한다.
"""
import argparse
import glob
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

RAW_DIR = os.path.join(C.RAW, 'tdata')
OUT_DIR = os.path.join(C.DATA, 'routes')

# ── 1. 스키마 ──────────────────────────────────────────────────────────────
# 사양서 4.2 가 적어 둔 이름을 정본으로 삼되, 대소문자·밑줄 차이는 흡수한다.
# 진짜 응답이 다른 이름을 쓰면 parse_row 가 None 을 돌려주고 그 자리에서 티가 난다
# (조용히 0으로 채우면 "데이터는 있는데 전부 0" 이라는 최악의 상태가 된다).
FIELD_ALIASES = {
    'route_id':     ['route_id', 'routeId', 'ROUTE_ID', 'rte_id'],
    'from_sta_id':  ['from_sta_id', 'fromStaId', 'FROM_STA_ID'],
    'to_sta_id':    ['to_sta_id', 'toStaId', 'TO_STA_ID'],
    'sta_sn':       ['sta_sn', 'staSn', 'STA_SN', 'seq'],
}
# ★ 2026-09-05 실제 응답으로 확인한 이름을 맨 앞에 둔다 ★
# 사양서 표기를 보고 'max_a18Num08h' 로 짐작했는데 진짜는 **'maxA18Num08h'**(밑줄 없음)였다.
# 이 하나가 안 맞으면 '최대 재차인원'을 통째로 못 읽고, 그러면 분산 역산이 죽는다 —
# 정확히 이 API 를 쓰는 이유(차량 간 편차)가 사라진다. 아래 _find_hours 가
# 대소문자·밑줄을 무시하고 한 번 더 훑으므로 이름이 또 바뀌어도 버틴다.
HOUR_PATTERNS = {
    'mean':  [r'^a18Num(\d{2})h$', r'^A18_NUM_(\d{2})H$'],
    'max':   [r'^maxA18Num(\d{2})h$', r'^max_a18Num(\d{2})h$', r'^MAX_A18_NUM_(\d{2})H$'],
    'trips': [r'^a18FcntNum(\d{2})h$', r'^A18_FCNT_NUM_(\d{2})H$'],
    'over':  [r'^a18OverCntNum(\d{2})h$', r'^A18_OVER_CNT_NUM_(\d{2})H$'],
}
# 이름이 안 맞을 때 마지막으로 기대는 모양 — 밑줄·대소문자를 지우고 비교한다
HOUR_LOOSE = {
    'mean':  'a18num%02dh',
    'max':   'maxa18num%02dh',
    'trips': 'a18fcntnum%02dh',
    'over':  'a18overcntnum%02dh',
}


def _pick(row, names):
    for n in names:
        if n in row and row[n] not in (None, ''):
            return row[n]
    # 대소문자·밑줄 무시 비교 (마지막 수단)
    flat = {re.sub(r'[^a-z0-9]', '', str(k).lower()): v for k, v in row.items()}
    for n in names:
        k = re.sub(r'[^a-z0-9]', '', n.lower())
        if k in flat and flat[k] not in (None, ''):
            return flat[k]
    return None


def _num(v, default=0.0):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return default


def parse_row(row):
    """넓은 표 한 행 → {'routeId','fromSta','toSta','seq','hours':[24개 dict]}.
    필수 키를 못 찾으면 None."""
    route_id = _pick(row, FIELD_ALIASES['route_id'])
    if route_id is None:
        return None
    hours = [{'mean': 0.0, 'max': 0.0, 'trips': 0, 'over': 0} for _ in range(24)]
    hit = 0
    for key, val in row.items():
        for kind, pats in HOUR_PATTERNS.items():
            for pat in pats:
                m = re.match(pat, str(key))
                if not m:
                    continue
                h = int(m.group(1))
                if 0 <= h < 24:
                    hours[h][kind] = _num(val)
                    hit += 1
                break
    if not hit:
        # 이름이 하나도 안 맞았다. 밑줄·대소문자를 지우고 한 번 더 훑는다
        # (사양서 표기와 실제가 다른 전례가 있다 — max_a18Num08h 가 아니라 maxA18Num08h 였다).
        flat = {re.sub(r'[^a-z0-9]', '', str(k).lower()): v for k, v in row.items()}
        for kind, shape in HOUR_LOOSE.items():
            for h in range(24):
                v = flat.get(shape % h)
                if v is not None:
                    hours[h][kind] = _num(v)
                    hit += 1
    if not hit:
        return None
    odd = 0
    for h in hours:
        h['trips'] = int(h['trips'])
        h['over'] = int(h['over'])
        # 최대가 평균보다 작게 오는 행이 있다(결측을 0으로 채운 경우). 분산 역산이 음수가 되므로 막는다.
        if h['max'] < h['mean']:
            h['max'] = h['mean']
        # 운행이 0회인데 평균 재차인원이 있다 = 앞뒤가 안 맞는다.
        # a18Num 은 그 시간대 운행의 평균이므로 분모가 0이면 값이 있을 수 없다.
        # 조용히 두면 "새벽 3시에도 사람이 타 있다"가 되어 그대로 화면에 나간다.
        if h['trips'] == 0 and (h['mean'] or h['max']):
            odd += 1
            h['mean'] = h['max'] = 0.0
            h['over'] = 0
    return {
        'routeId': str(route_id),
        'fromSta': str(_pick(row, FIELD_ALIASES['from_sta_id']) or ''),
        'toSta': str(_pick(row, FIELD_ALIASES['to_sta_id']) or ''),
        'seq': int(_num(_pick(row, FIELD_ALIASES['sta_sn']), 0)),
        'hours': hours,
        'oddCells': odd,
    }


def parse_file(path, allow_fake=False):
    doc = C.load_json(path) or {}
    if doc.get('fake') and not allow_fake:
        return None, '가짜 표본이라 건너뜀 (--allow-fake 로 포함)'
    rows = doc.get('rows') or []
    parsed, bad = [], 0
    for r in rows:
        p = parse_row(r)
        if p is None:
            bad += 1
        else:
            parsed.append(p)
    if rows and not parsed:
        return None, '한 행도 못 읽었다 — 필드 이름이 사양서와 다르다 (첫 행 키: %s)' % ', '.join(list(rows[0].keys())[:8])
    return {'date': doc.get('date'), 'dayType': doc.get('dayType') or C.day_type(C.parse_ymd(doc['date'])),
            'fake': bool(doc.get('fake')), 'sections': parsed, 'unparsed': bad,
            'oddCells': sum(p['oddCells'] for p in parsed)}, None


# ── 2·3. 집계 ──────────────────────────────────────────────────────────────
def aggregate(days):
    """[파일별 파싱 결과] → {routeId: {seq: {dayType: {mean/sd/trips/over 24칸}}}}

    같은 요일의 여러 날짜를 합칠 때 분산은 두 갈래로 나뉜다.
      · 날짜 안의 흔들림  = 그날 운행한 차들 사이의 편차 (평균·최대·운행횟수로 역산)
      · 날짜 사이의 흔들림 = 같은 화요일이라도 날마다 다른 것
    둘을 더해야 진짜 편차다. 앞의 것만 쓰면 "매주 화요일은 늘 같다"고 우기는 셈이 된다.
    """
    acc = {}
    for day in days:
        dt = day['dayType']
        for sec in day['sections']:
            r = acc.setdefault(sec['routeId'], {})
            s = r.setdefault(sec['seq'], {'fromSta': sec['fromSta'], 'toSta': sec['toSta'], 'days': {}})
            slot = s['days'].setdefault(dt, [[] for _ in range(24)])
            for h in range(24):
                src = sec['hours'][h]
                slot[h].append({
                    'mean': src['mean'],
                    'sd': C.sd_from_mean_max(src['mean'], src['max'], src['trips']),
                    'trips': src['trips'],
                    'over': src['over'],
                })

    out = {}
    for route_id, secs in acc.items():
        rec = {'routeId': route_id, 'slotMinutes': 60, 'startHour': 0, 'sections': []}
        for seq in sorted(secs):
            s = secs[seq]
            entry = {'seq': seq, 'from': s['fromSta'], 'to': s['toSta']}
            for dt, hours in s['days'].items():
                mean24, sd24, trips24, over24 = [], [], [], []
                for h in range(24):
                    obs = hours[h]
                    wsum = sum(o['trips'] for o in obs)
                    if wsum <= 0:
                        # 운행이 없던 시간대. 날짜 수로만 평균낸다(대개 0이다).
                        m = sum(o['mean'] for o in obs) / max(1, len(obs))
                        mean24.append(round(m, 2)); sd24.append(0.0)
                        trips24.append(0); over24.append(0)
                        continue
                    m = sum(o['mean'] * o['trips'] for o in obs) / wsum
                    within = sum(o['sd'] ** 2 * o['trips'] for o in obs) / wsum
                    between = sum((o['mean'] - m) ** 2 * o['trips'] for o in obs) / wsum
                    mean24.append(round(m, 2))
                    sd24.append(round(math.sqrt(within + between), 2))
                    trips24.append(int(round(wsum / len(obs))))
                    over24.append(int(round(sum(o['over'] for o in obs) / len(obs))))
                entry[dt] = {'mean': mean24, 'sd': sd24, 'trips': trips24, 'over': over24}
            rec['sections'].append(entry)
        out[route_id] = rec
    return out


def write_routes(routes, dates, fake):
    os.makedirs(OUT_DIR, exist_ok=True)
    index = {'routes': [], 'dates': sorted(dates), 'slotMinutes': 60, 'fake': fake}
    for rid, rec in sorted(routes.items()):
        rec['sources'] = {'dates': sorted(dates)}
        rec['fake'] = fake
        C.save_json(os.path.join(OUT_DIR, rid + '.json'), rec)
        index['routes'].append({'routeId': rid, 'sections': len(rec['sections'])})
    C.save_json(os.path.join(OUT_DIR, 'index.json'), index)
    return len(index['routes'])


# ── 4. 자체 시험 ───────────────────────────────────────────────────────────
def selftest():
    """가짜 표본을 만들어 파서·집계가 도는지, 값이 물리적으로 말이 되는지 본다.
    키가 없어도 파이프라인이 살아 있는지 오늘 확인할 수 있게 하려는 것."""
    import fetch_tdata_section as F
    from datetime import timedelta
    fails = []

    def check(name, cond, detail=''):
        print(('  [OK]   ' if cond else '  [실패] ') + name + (('  — ' + detail) if detail and not cond else ''))
        if not cond:
            fails.append(name)

    base = C.today_kst() - timedelta(days=100)
    made = []
    for i in range(3):                      # 같은 요일 3주치
        d = base - timedelta(days=7 * i)
        path, _ = F.make_sample(d)
        made.append(path)

    days = []
    for p in made:
        parsed, err = parse_file(p, allow_fake=True)
        check('스키마 파싱 ' + os.path.basename(p), parsed is not None, err or '')
        if parsed:
            check('  못 읽은 행 0', parsed['unparsed'] == 0, '%d행' % parsed['unparsed'])
            days.append(parsed)

    routes = aggregate(days)
    check('노선 3개로 묶였다', len(routes) == 3, str(len(routes)))
    any_route = next(iter(routes.values()))
    sec = any_route['sections'][0]
    dt = C.day_type(base)
    check('요일 칸이 생겼다 (%s)' % dt, dt in sec, ', '.join(k for k in sec if k not in ('seq', 'from', 'to')))
    if dt in sec:
        g = sec[dt]
        check('시간 24칸', len(g['mean']) == 24 and len(g['sd']) == 24)
        check('평균이 음수가 아니다', all(v >= 0 for v in g['mean']))
        check('표준편차가 음수가 아니다', all(v >= 0 for v in g['sd']))
        check('운행이 2회 이상인 시간대엔 편차가 잡힌다',
              any(g['sd'][h] > 0 for h in range(24) if g['trips'][h] >= 2),
              '전부 0이면 평균·최대 역산이 죽은 것이다')
        check('새벽 3시엔 운행이 없다', g['trips'][3] == 0)
        peak = max(range(24), key=lambda h: g['mean'][h])
        check('가장 붐비는 시간이 출퇴근대다 (실제 %d시)' % peak, peak in (7, 8, 9, 17, 18, 19))

    # 최대 < 평균으로 뒤집힌 행이 와도 음수 분산이 안 나오는지
    bad = {'route_id': 'X', 'sta_sn': 1, 'a18Num08h': 30, 'max_a18Num08h': 10, 'a18FcntNum08h': 5, 'a18OverCntNum08h': 0}
    p = parse_row(bad)
    check('최대<평균 행을 만나도 분산이 음수가 안 된다',
          p is not None and C.sd_from_mean_max(p['hours'][8]['mean'], p['hours'][8]['max'], 5) >= 0)
    check('알아볼 수 없는 행은 조용히 0으로 채우지 않고 None 을 돌려준다',
          parse_row({'뭔가': 1, '다른': 2}) is None)

    # 운행 0회인데 재차인원이 있는 칸 — 그냥 두면 "새벽 3시에도 사람이 타 있다"가 화면에 나간다.
    odd = parse_row({'route_id': 'X', 'sta_sn': 1, 'a18Num03h': 12, 'max_a18Num03h': 15, 'a18FcntNum03h': 0})
    check('운행 0회인데 재차인원이 있으면 0으로 정리하고 세어 둔다',
          odd is not None and odd['hours'][3]['mean'] == 0 and odd['oddCells'] == 1,
          '정리 안 되면 %s' % (odd['hours'][3] if odd else None))

    print('\n  %s (%d/%d)' % ('모두 통과' if not fails else '실패 %d건' % len(fails),
                             0 if fails else 1, 1))
    return 0 if not fails else 1


def main():
    ap = argparse.ArgumentParser(description='T-DATA 파서·정규화·요일별 집계')
    ap.add_argument('--selftest', action='store_true', help='가짜 표본으로 파이프라인 시험 (키 불필요)')
    ap.add_argument('--allow-fake', action='store_true', help='가짜 표본도 집계에 포함(개발용)')
    args = ap.parse_args()

    if args.selftest:
        raise SystemExit(selftest())

    files = sorted(glob.glob(os.path.join(RAW_DIR, '*.json')))
    if not files:
        C.die('data/raw/tdata/ 가 비어 있다. 먼저 fetch_tdata_section.py 로 받는다\n'
              '(키가 아직 없으면 --sample 로 가짜 표본을 만들어 --allow-fake 로 시험한다).')

    days, dates, fake = [], set(), False
    for p in files:
        parsed, err = parse_file(p, args.allow_fake)
        if parsed is None:
            C.log('  %s — %s' % (os.path.basename(p), err))
            continue
        days.append(parsed)
        dates.add(parsed['date'])
        fake = fake or parsed['fake']
        C.log('  %s (%s) — 구간 %d개%s%s' % (
            parsed['date'], parsed['dayType'], len(parsed['sections']),
            ', 못 읽음 %d행' % parsed['unparsed'] if parsed['unparsed'] else '',
            ', 앞뒤 안 맞는 칸 %d개(운행 0인데 재차인원 있음 → 0으로 정리)' % parsed['oddCells'] if parsed['oddCells'] else ''))
    if not days:
        C.die('읽을 수 있는 날짜가 없다.')

    routes = aggregate(days)
    n = write_routes(routes, dates, fake)
    C.log('== 노선 %d개 / 날짜 %d일 → %s%s ==' % (n, len(dates), OUT_DIR, '  ※가짜 표본 포함' if fake else ''))


if __name__ == '__main__':
    main()
