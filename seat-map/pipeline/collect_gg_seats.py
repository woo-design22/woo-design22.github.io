# -*- coding: utf-8 -*-
"""경기 광역버스 **빈자리 수** 수집기 (D-121).

★ 왜 이것이 서울 것보다 값진가 ★ 서울 실시간은 혼잡 4단계(등급)뿐이라 「몇 자리 비었나」를
모형으로 되짚어야 한다. 경기는 **`remainSeatCnt` 로 빈자리 수를 그대로 준다** —
이 앱이 파는 바로 그 숫자다. 추정이 아니라 실측이라 모형을 **검증·보정**할 수 있다.
게다가 대상이 직행좌석·광역급행이다. 오래 타고 입석이 금지라 「앉느냐」가 가장 절실한 자리다.

★ 무엇을 부르나 ★ 경기도_버스위치정보 조회(공공데이터 15080648, GBIS v2).
    getBusLocationListv2?routeId=<GBIS 노선id>
한 줄이 차 한 대다: `remainSeatCnt`(빈자리) · `crowded`(혼잡) · `stationSeq`(위치) ·
`lowPlate`(저상) · `vehId`. 응답이 차 3대에 725바이트로 아주 작다.
★ 서울과 혼잡 눈금이 다르다 ★ 서울은 3~6, GBIS 는 **1 여유 · 2 보통 · 3 혼잡 · 4 매우혼잡 · 0 미제공**.
같은 이름이라고 같은 값으로 읽으면 안 된다. 어차피 우리가 쓰는 것은 빈자리 수다.
★ `remainSeatCnt` 가 없는 차가 있다 ★ 좌석 계수기가 없으면 -1 이나 빈 값이 온다 —
**0(만석)과 구별해야 한다.** 없으면 -1 로 적고 집계에서 뺀다(D-79: 빈칸을 값으로 읽지 않는다).

★ 하루 한도가 설계를 정한다 ★ 개발계정 **하루 1,000건**이고 노선이 436개다
(사용자 판단 2026-09-11: 「운영계정은 과하다」 — 늘리지 않고 이 안에서 산다).
그래서 한 판에 전 노선을 부르지 않는다:
  · **닻 노선**은 매 판 넣어 시계열이 끊기지 않게 한다(같은 노선이 10분마다 어떻게 차는지).
  · 나머지 몫은 전 노선을 **돌려가며** 채운다(오늘 못 본 노선은 내일).
  · 시간대에 무게를 준다 — 출퇴근 3, 낮 1, 심야 0.3. 10분 차이가 큰 곳에 몫을 몰아준다.
예산을 올리면 같은 코드가 저절로 전 노선 한 판으로 자란다(`DAILY_BUDGET` 한 숫자).

받는 것: data/raw/ggseats/YYYYMMDD/HHMM.json.gz  (원천 — 커밋 안 함)
    {"t":"20260911_0740","dt":"weekday","n":37,"ask":15,
     "r":{"<GBIS 노선id>":[[차id, 정류장순번, 방향, 빈자리, 혼잡, 저상], ...]}}

사용: python pipeline/collect_gg_seats.py            (한 번 — 작업 스케줄러가 10분마다)
      python pipeline/collect_gg_seats.py --probe    (노선 8개 · 저장 안 함)
      python pipeline/collect_gg_seats.py --status   (오늘 얼마나 썼나)
      python pipeline/collect_gg_seats.py --selftest (인터넷 없이 도는 시험)
      python pipeline/collect_gg_seats.py --prune 60 (오래된 원천 지우기)
"""
import argparse
import gzip
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C          # noqa: E402
import fetch_citybus as FC  # noqa: E402  (key·QuotaExceeded 재사용)

OUT_DIR = os.path.join(C.RAW, 'ggseats')
STATE_PATH = os.path.join(OUT_DIR, 'state.json')
URL = 'https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2'
PREFIX = 'GG-GGB'        # 그래프의 노선 id = 이 접두사 + GBIS 노선 id
TIMEOUT = 25             # GBIS 는 504(SERVICETIMEOUT)를 자주 준다 — 넉넉히 준다
KEEP_DAYS = 60
DAILY_BUDGET = 950       # 개발계정 1,000 에서 50건은 손 검사 몫으로 남긴다
ANCHORS = 4              # 매 판 꼭 보는 노선 수 (시계열이 끊기지 않게)

HOUR_WEIGHT = {7: 3.0, 8: 3.0, 17: 3.0, 18: 3.0,
               6: 2.0, 9: 2.0, 16: 2.0, 19: 2.0,
               5: 1.0, 10: 1.0, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0,
               20: 1.0, 21: 1.0, 22: 1.0}
NIGHT_WEIGHT = 0.3
TICKS_PER_HOUR = 6


def weight_of(hour):
    return HOUR_WEIGHT.get(hour, NIGHT_WEIGHT)


TOTAL_WEIGHT = sum(weight_of(h) for h in range(24)) * TICKS_PER_HOUR


def tick_quota(hour, budget):
    """이번 판에 부를 노선 수 = 하루 예산을 시간대 무게로 나눈 것."""
    return max(1, int(round(budget * weight_of(hour) / TOTAL_WEIGHT)))


# ── 하루 예산 장부 ─────────────────────────────────────────────────────────
def load_state(today):
    s = C.load_json(STATE_PATH, None) or {}
    if s.get('d') != today:
        s = {'d': today, 'used': 0, 'cursor': 0, 'dead': False}
    s.setdefault('used', 0)
    s.setdefault('cursor', 0)
    s.setdefault('dead', False)
    return s


def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    C.save_json(STATE_PATH, s)


# ── 노선·방향 ──────────────────────────────────────────────────────────────
def gg_routes():
    """그래프의 경기 광역버스. 정류장이 긴 노선을 앞에 둔다 — 앞의 몇 개가 닻이 된다.

    긴 노선이 곧 서울로 들어가는 장거리 통근 노선이라 「앉느냐」가 가장 걸린 자리다
    (이용객 표가 따로 없어 쓰는 어림자다 — 표가 생기면 그걸로 바꾼다).
    """
    g = C.load_json(os.path.join(C.DATA, 'graph', 'routes.json'), {}) or {}
    out = []
    for r in (g.get('routes') or []):
        rid = str(r.get('id', ''))
        if not rid.startswith(PREFIX):
            continue
        st = r.get('stops') or []
        out.append({'gid': rid[len(PREFIX):], 'name': r.get('name'),
                    'stops': st, 'n': sum(len(x) for x in st)})
    out.sort(key=lambda r: -r['n'])
    return out


def dir_tables(routes):
    """정류장 id → 방향(0/1). 양쪽에 다 있는 정류장은 못 가리므로 뺀다."""
    out = {}
    for r in routes:
        st = r['stops']
        if len(st) < 2:
            out[r['gid']] = ({}, 0)
            continue
        a = set(str(s) for s in st[0])
        b = set(str(s) for s in st[1])
        m = {}
        for s in a - b:
            m[s] = 0
        for s in b - a:
            m[s] = 1
        out[r['gid']] = (m, len(st[0]))
    return out


# ── 부르기 ─────────────────────────────────────────────────────────────────
def call(key, gid):
    url = (URL + '?serviceKey=' + urllib.parse.quote(key)
           + '&routeId=' + str(gid) + '&format=json')
    req = urllib.request.Request(url, headers={'User-Agent': 'seat-map/0.1 (data collector)'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        if 'LIMITED_NUMBER_OF_SERVICE_REQUESTS' in body or '요청제한' in body:
            raise FC.QuotaExceeded(body[:120])
        raise
    if 'LIMITED_NUMBER_OF_SERVICE_REQUESTS' in body or '요청제한' in body:
        raise FC.QuotaExceeded(body[:120])
    lst = (((json.loads(body).get('response') or {}).get('msgBody') or {})
           .get('busLocationList') or [])
    return [lst] if isinstance(lst, dict) else lst


def num(v, default=-1):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def fold(items, gid, dirs, out, st):
    """한 노선의 응답을 차 한 대 = 한 줄로 접는다."""
    if not items:
        return
    dmap, n_first = dirs.get(gid, ({}, 0))
    rows = []
    for x in items:
        veh = num(x.get('vehId'), 0)
        if not veh:
            continue
        seq = num(x.get('stationSeq'), 0)
        seat = num(x.get('remainSeatCnt'))      # 없으면 -1 — ★0(만석)과 다르다★
        crowd = num(x.get('crowded'), 0)
        low = 1 if str(x.get('lowPlate')) == '1' else 0
        d = dmap.get(str(x.get('stationId')))
        if d is None:
            # 못 가리면 정류장 순번이 첫 방향의 길이를 넘는지로 어림한다
            # (서울 자료에서 같은 어림법을 661대에 겹쳐 보니 661대 모두 일치했다 — D-120)
            st['nodir'] += 1
            d = 1 if (n_first and seq > n_first) else 0
        rows.append([veh, seq, d, seat, crowd, low])
        st['veh'] += 1
        if seat >= 0:
            st['seat'] += 1
            st['seatsum'] += seat
        else:
            st['noseat'] += 1
    if rows:
        out[gid] = rows


def sweep(key, picks, dirs):
    out = {}
    st = {'veh': 0, 'calls': 0, 'fail': 0, 'quota': False,
          'seat': 0, 'noseat': 0, 'seatsum': 0, 'nodir': 0, 'why': {}}
    for r in picks:
        gid = r['gid']
        st['calls'] += 1
        try:
            fold(call(key, gid), gid, dirs, out, st)
        except FC.QuotaExceeded:
            st['quota'] = True
            break
        except urllib.error.HTTPError as e:
            st['fail'] += 1
            k = 'HTTP %d' % e.code
            st['why'][k] = st['why'].get(k, 0) + 1
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            st['fail'] += 1
            k = type(e).__name__
            st['why'][k] = st['why'].get(k, 0) + 1
    return out, st


def prune(days):
    if not os.path.isdir(OUT_DIR):
        return 0
    keep = C.ymd(C.today_kst())
    gone = 0
    for name in sorted(os.listdir(OUT_DIR)):
        p = os.path.join(OUT_DIR, name)
        if not (os.path.isdir(p) and len(name) == 8 and name.isdigit()):
            continue
        if name < keep and (C.parse_ymd(keep) - C.parse_ymd(name)).days > days:
            shutil.rmtree(p, ignore_errors=True)
            gone += 1
    return gone


def selftest():
    ok = []

    def chk(n, c):
        ok.append((n, bool(c)))

    # ① 빈자리 없음(-1)과 만석(0)은 다르다 — 섞으면 만석 버스가 「모름」이 된다(D-79)
    st = {'veh': 0, 'seat': 0, 'noseat': 0, 'seatsum': 0, 'nodir': 0}
    out = {}
    fold([{'vehId': 1, 'stationSeq': 3, 'stationId': 'A', 'remainSeatCnt': 0,
           'crowded': 4, 'lowPlate': '1'},
          {'vehId': 2, 'stationSeq': 4, 'stationId': 'A', 'remainSeatCnt': '',
           'crowded': 0, 'lowPlate': '0'},
          {'vehId': 3, 'stationSeq': 5, 'stationId': 'A', 'remainSeatCnt': 38,
           'crowded': 1, 'lowPlate': '0'}],
         'R', {'R': ({'A': 0}, 10)}, out, st)
    chk('만석(0)은 값으로 센다', st['seat'] == 2 and st['seatsum'] == 38)
    chk('빈 값은 -1 로 적고 뺀다', st['noseat'] == 1 and out['R'][1][3] == -1)
    chk('저상 표시를 읽는다', out['R'][0][5] == 1)

    # ② 방향
    st2 = {'veh': 0, 'seat': 0, 'noseat': 0, 'seatsum': 0, 'nodir': 0}
    out2 = {}
    fold([{'vehId': 9, 'stationSeq': 2, 'stationId': 'B', 'remainSeatCnt': 5},
          {'vehId': 8, 'stationSeq': 30, 'stationId': '몰라', 'remainSeatCnt': 5}],
         'R', {'R': ({'B': 1}, 20)}, out2, st2)
    chk('정류장으로 방향을 가른다', out2['R'][0][2] == 1)
    chk('못 가리면 순번으로 어림', out2['R'][1][2] == 1 and st2['nodir'] == 1)

    # ③ 예산
    for b in (950, 100000):
        day = sum(tick_quota(h, b) for h in range(24) for _ in range(TICKS_PER_HOUR))
        chk('예산 %d 을 안 넘는다(합 %d)' % (b, day), day <= b * 1.02)
    chk('출근이 새벽보다 두껍다', tick_quota(8, 950) > tick_quota(3, 950))
    chk('닻이 한 판 몫보다 작다', ANCHORS < tick_quota(8, DAILY_BUDGET))

    # ④ 날이 바뀌면 장부가 새로 선다
    s = load_state('19990101')
    chk('날이 바뀌면 장부 초기화', s['used'] == 0 and not s['dead'])

    for n, v in ok:
        print('  %s %s' % ('OK  ' if v else '★틀렸다★', n))
    bad = [n for n, v in ok if not v]
    print('%d개 중 %d개 통과' % (len(ok), len(ok) - len(bad)))
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser(description='경기 광역버스 빈자리 수 수집')
    ap.add_argument('--probe', action='store_true', help='노선 8개 · 저장 안 함')
    ap.add_argument('--budget', type=int, default=DAILY_BUDGET, help='하루 호출 예산')
    ap.add_argument('--status', action='store_true', help='오늘 장부만 보고 끝')
    ap.add_argument('--selftest', action='store_true', help='인터넷 없이 도는 시험')
    ap.add_argument('--prune', type=int, metavar='일', help='오래된 원천을 지우고 끝')
    a = ap.parse_args()

    if a.selftest:
        sys.exit(selftest())
    if a.prune is not None:
        C.log('[경기빈자리] %d일 지난 원천 %d일치를 지웠다' % (a.prune, prune(a.prune)))
        return

    now = datetime.now(C.KST)
    today = now.strftime('%Y%m%d')
    s = load_state(today)

    if a.status:
        C.log('[경기빈자리] %s · 오늘 %d/%d건 · 다음 노선 %d번부터%s'
              % (today, s['used'], a.budget, s['cursor'],
                 ' · ★한도 끝★' if s['dead'] else ''))
        return

    routes = gg_routes()
    if not routes:
        C.die('그래프에 경기 노선이 없다. fetch_ggbus_routes.py → build_graph.py 를 먼저.')
    key = FC.key()
    dirs = dir_tables(routes)

    if a.probe:
        data, st = sweep(key, routes[:8], dirs)
        C.log('[살펴보기] 노선 %d · 차 %d대 · 빈자리 실린 차 %d대(평균 %.1f석) · 없는 차 %d대%s'
              % (len(data), st['veh'], st['seat'],
                 st['seatsum'] / float(st['seat'] or 1), st['noseat'],
                 ' · ★한도 끝★' if st['quota'] else ''))
        return

    if s['dead']:
        return
    left = a.budget - s['used']
    if left <= 0:
        s['dead'] = True
        save_state(s)
        C.log('[경기빈자리] 오늘 예산 %d건을 다 썼다 — 내일 다시' % a.budget)
        return

    # 닻 노선은 매 판, 나머지 몫은 돌려가며 — 시계열과 폭을 함께 얻는다.
    want = min(tick_quota(now.hour, a.budget), left, len(routes))
    picks = routes[:min(ANCHORS, want)]
    seen = {r['gid'] for r in picks}
    cur = s['cursor'] % len(routes)
    i = 0
    while len(picks) < want and i < len(routes):
        r = routes[(cur + i) % len(routes)]
        i += 1
        if r['gid'] in seen:
            continue
        picks.append(r)
        seen.add(r['gid'])

    t0 = time.time()
    data, st = sweep(key, picks, dirs)
    el = time.time() - t0

    s['used'] += st['calls']
    s['cursor'] = (cur + i) % len(routes)
    if st['quota']:
        s['dead'] = True
    save_state(s)

    note = ('노선 %d/%d · 차 %d대 · 빈자리 %d대(평균 %.1f석) · 없음 %d대 · %.1f초 · 오늘 %d/%d건'
            % (len(data), want, st['veh'], st['seat'],
               st['seatsum'] / float(st['seat'] or 1), st['noseat'],
               el, s['used'], a.budget))
    if st['fail']:
        note += ' · 막힘 %d(%s)' % (st['fail'], ','.join(
            '%s×%d' % kv for kv in sorted(st['why'].items(), key=lambda kv: -kv[1])[:3]))
    if st['nodir']:
        note += ' · 방향 어림 %d' % st['nodir']
    if st['quota']:
        note += ' · ★한도 끝, 오늘은 여기까지★'

    if st['veh'] == 0:
        C.log('[경기빈자리] 다니는 차가 없다 — 저장 안 함 · ' + note)
        return

    path = os.path.join(OUT_DIR, today, now.strftime('%H%M') + '.json.gz')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    doc = {'t': now.strftime('%Y%m%d_%H%M'), 'dt': C.day_type(now.date()),
           'n': st['veh'], 'ask': want, 'got': want - st['fail'], 'r': data}
    tmp = path + '.tmp'
    with gzip.open(tmp, 'wt', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)
    C.log('[경기빈자리] %s · %.1fKB' % (note, os.path.getsize(path) / 1024.0))

    if now.hour == 4 and now.minute < 10:
        gone = prune(KEEP_DAYS)
        if gone:
            C.log('[경기빈자리] %d일 지난 원천 %d일치를 지웠다' % (KEEP_DAYS, gone))


if __name__ == '__main__':
    # ★ 창 없이(pythonw) 도는 물건이라 예외가 조용히 사라진다 ★ 반드시 로그에 남긴다.
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        import traceback
        C.log('[경기빈자리] ★터졌다★\n' + traceback.format_exc())
        raise
