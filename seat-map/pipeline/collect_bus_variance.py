# -*- coding: utf-8 -*-
"""차량 간 편차 수집기 — 「같은 시각, 같은 노선, 차마다 다른 붐빔」을 표본으로 쌓는다 (D-65).

왜
  모델의 마지막 근사가 차량 간 편차(×1.25, D-62)다. 통계 자료 어디에도 없는데,
  실시간 버스위치 API 는 지금 달리는 **차 한 대 한 대**의 혼잡도(여유3/보통4/혼잡5)와
  만차 여부를 준다. 첫 실측(2026-09-05 토 저녁): 100번 20대 = 여유15·보통3·혼잡2.
  이 순간사진(snapshot)을 여러 날 쌓으면 「이 시각에 오는 차가 혼잡일 확률」이 분포로 나온다.

제약과 설계
  - 개발계정 트래픽 하루 1,000건 → 기본 900건에서 스스로 멈춘다(상태 파일로 날짜별 집계).
  - 마을버스는 혼잡도 미제공(전부 0)이라 표본단에서 뺀다 — 부르면 예산만 탄다.
    (미제공이 계속인지 가끔 확인하도록 --include-village 로 몇 개 끼울 수는 있다)
  - 표본단은 이용객 많은 순 상위에서 날짜별로 돌아가며 뽑고(오늘 못 본 노선은 내일),
    닻 노선(100·152·143·271·601·N16)은 매일 넣어 시계열이 이어지게 한다.
  - 저장은 data/raw/variance/YYYYMMDD.jsonl 한 줄 = 한 노선 한 순간사진.
    차량 번호판은 저장하지 않는다(집계에 불필요).

사용
  python pipeline/collect_bus_variance.py --once            # 한 바퀴만 (동작 확인)
  python pipeline/collect_bus_variance.py                   # 기본: 12개 노선 × 5분 간격 × 55분
  python pipeline/collect_bus_variance.py --daemon          # 24시간 상주 (작업 스케줄러용)
집계
  python pipeline/build_variance.py                         # → data/bus/variance.json

--daemon 은 시간대 적응형이다: 출퇴근(7~9·17~19시) 10분 · 낮 20분 · 심야(23~05시) 60분 간격.
하루 예산이 12개 노선 기준 약 900건 = 상한과 같게 설계돼 있다. 이중 실행은 잠금이 막고
(state.json 의 lock, 10분 이상 조용하면 죽은 것으로 보고 이어받는다), 기록은
data/raw/variance/collector.log 에도 남긴다(pythonw 로 돌면 콘솔이 없어서다).
"""
import argparse
import datetime as dt
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

URL = 'http://ws.bus.go.kr/api/rest/buspos/getBusPosByRtid'
OUT_DIR = os.path.join(C.RAW, 'variance')
STATE = os.path.join(OUT_DIR, 'state.json')
ANCHORS = ['100', '152', '143', '271', '601', 'N16']   # 매일 꼭 보는 노선
DAILY_CAP = 900                                        # 개발계정 1,000 에서 여유


LOG = os.path.join(OUT_DIR, 'collector.log')
_daemon = False


def log(msg):
    C.log(msg)
    if _daemon:
        try:
            with io.open(LOG, 'a', encoding='utf-8') as f:
                f.write('[%s] %s\n' % (dt.datetime.now().strftime('%m-%d %H:%M:%S'), msg))
        except OSError:
            pass


def adaptive_interval(now):
    h = now.hour + now.minute / 60.0
    if (7 <= h < 9.5) or (17 <= h < 19.5):
        return 10
    if h >= 23 or h < 5:
        return 60
    return 20


def take_lock():
    st = load_state()
    lk = st.get('lock') or {}
    try:
        fresh = (dt.datetime.now() - dt.datetime.strptime(lk.get('t', ''), '%Y-%m-%dT%H:%M:%S')).total_seconds() < 600
    except ValueError:
        fresh = False
    if fresh and lk.get('pid') != os.getpid():
        return False
    st['lock'] = {'pid': os.getpid(), 't': dt.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}
    save_state(st)
    return True


def load_state():
    try:
        # utf-8-sig: 다른 도구(파워셸 등)가 BOM 을 붙여 저장해도 읽힌다 —
        # BOM 때문에 상태를 빈 것으로 보면 호출 계수가 리셋돼 하루 상한이 뚫린다(실제로 났다)
        with io.open(STATE, encoding='utf-8-sig') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(st):
    os.makedirs(OUT_DIR, exist_ok=True)
    with io.open(STATE, 'w', encoding='utf-8') as f:
        json.dump(st, f)


def build_panel(n, include_village):
    """이용객 많은 순 + 날짜 회전. routeId 와 종류는 그래프·배차 스냅숏에서 잇는다."""
    hw = json.load(io.open(os.path.join(C.DATA, 'bus', 'headways.json'), encoding='utf-8'))['routes']
    graph = json.load(io.open(os.path.join(C.DATA, 'graph', 'routes.json'), encoding='utf-8'))['routes']
    kind_of = {r['name']: r['kind'] for r in graph if r.get('kind') != 'subway'}
    riders = []
    rdir = os.path.join(C.DATA, 'bus', 'routes')
    for name, rec in hw.items():
        kind = kind_of.get(name)
        if not kind or not rec.get('routeId'):
            continue
        if kind == 'village' and not include_village:
            continue
        f = os.path.join(rdir, '%s.json' % name.replace('/', '_'))
        total = 0
        if os.path.exists(f):
            try:
                doc = json.load(io.open(f, encoding='utf-8'))
                total = sum(sum(s['on']) for s in doc['stops'])
            except (OSError, ValueError, KeyError):
                pass
        riders.append((total, name, rec['routeId'], kind))
    riders.sort(reverse=True)
    panel, seen = [], set()
    for a in ANCHORS:
        for t, name, rid, kind in riders:
            if name == a and name not in seen:
                panel.append((name, rid, kind)); seen.add(name)
    rot = dt.date.today().toordinal()                 # 날짜별 회전: 내일은 다음 묶음
    pool = [x for x in riders if x[1] not in seen]
    if pool:
        start = (rot * max(1, n)) % len(pool)
        for i in range(len(pool)):
            if len(panel) >= n:
                break
            t, name, rid, kind = pool[(start + i) % len(pool)]
            panel.append((name, rid, kind)); seen.add(name)
    return panel[:n]


def snapshot(key, rid):
    q = urllib.parse.urlencode({'serviceKey': key, 'busRouteId': rid, 'resultType': 'json'})
    req = urllib.request.Request(URL + '?' + q, headers={'User-Agent': 'seat-map/0.1'})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read().decode('utf-8', 'replace'))
    hd = res.get('msgHeader') or {}
    if str(hd.get('headerCd')) not in ('0', '4'):
        raise RuntimeError('%s %s' % (hd.get('headerCd'), hd.get('headerMsg')))
    out = []
    for it in (res.get('msgBody') or {}).get('itemList') or []:
        out.append([int(it.get('sectOrd') or 0), int(it.get('congetion') or 0),
                    int(it.get('isFullFlag') or 0), int(it.get('busType') or 0)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--routes', type=int, default=12, help='한 바퀴에 볼 노선 수')
    ap.add_argument('--minutes', type=int, default=55, help='총 수집 시간(분)')
    ap.add_argument('--interval', type=float, default=5, help='바퀴 간격(분)')
    ap.add_argument('--once', action='store_true', help='한 바퀴만')
    ap.add_argument('--daemon', action='store_true', help='24시간 상주 — 간격을 시간대에 맞게 스스로 정한다')
    ap.add_argument('--include-village', action='store_true')
    args = ap.parse_args()
    global _daemon
    _daemon = args.daemon
    if args.daemon and not take_lock():
        C.log('이미 다른 수집기가 살아 있다 — 조용히 물러난다')
        return

    key = C.load_keys().get('DATA_GO_KR_KEY')
    if not key:
        raise SystemExit('DATA_GO_KR_KEY 가 없다 (pipeline/keys.json)')
    panel = build_panel(args.routes, args.include_village)
    C.log('표본단 %d개: %s' % (len(panel), ' '.join(p[0] for p in panel)))
    os.makedirs(OUT_DIR, exist_ok=True)

    t_end = time.time() + args.minutes * 60
    rounds = 0
    while True:
        today = dt.date.today().strftime('%Y%m%d')
        st = load_state()
        used = st.get(today, 0)
        if used + len(panel) > DAILY_CAP:
            if args.daemon:
                # 상주 모드는 멈추지 않는다 — 자정에 예산이 새로 열릴 때까지 잔다
                log('오늘 호출 %d — 상한. 자정까지 대기' % used)
                nxt = dt.datetime.combine(dt.date.today() + dt.timedelta(days=1), dt.time(0, 2))
                time.sleep(max(60, (nxt - dt.datetime.now()).total_seconds()))
                panel = build_panel(args.routes, args.include_village)   # 새 날 = 새 회전
                continue
            C.log('오늘 호출 %d — 상한(%d)에 닿아 멈춘다' % (used, DAILY_CAP))
            break
        path = os.path.join(OUT_DIR, today + '.jsonl')
        got = errs = 0
        with io.open(path, 'a', encoding='utf-8') as f:
            for name, rid, kind in panel:
                try:
                    veh = snapshot(key, rid)
                    f.write(json.dumps({'t': dt.datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
                                        'route': name, 'kind': kind, 'veh': veh},
                                       ensure_ascii=False) + '\n')
                    got += 1
                except Exception as e:                      # 한 노선 실패가 바퀴를 못 세우게
                    errs += 1
                    C.log('  %s 실패 %s' % (name, str(e)[:60]))
                time.sleep(1.2)                             # 서버 예절
        st = load_state()                     # 그 사이 다른 손이 만졌을 수 있다
        st[today] = st.get(today, 0) + len(panel)
        if args.daemon:
            st['lock'] = {'pid': os.getpid(), 't': dt.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}
        save_state(st)
        rounds += 1
        log('바퀴 %d — 순간사진 %d개 저장 (오늘 호출 %d/%d)' % (rounds, got, st[today], DAILY_CAP))
        if args.once:
            break
        gap = adaptive_interval(dt.datetime.now()) if args.daemon else args.interval
        if not args.daemon and time.time() + gap * 60 > t_end:
            break
        time.sleep(gap * 60)
    C.log('끝 — 집계: python pipeline/build_variance.py')


if __name__ == '__main__':
    main()
