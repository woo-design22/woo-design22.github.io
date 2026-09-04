# -*- coding: utf-8 -*-
"""fetch_tdata_section.py — T-DATA 구간별 재차인원 수집 (사양서 4.2).

이 프로젝트에서 가장 중요한 원천이다. 시간대별 **평균·최대·운행횟수**를 함께 주므로
분포의 분산을 역산할 수 있다(사양서 4.2 "반드시 분산을 살릴 것").

  http://t-data.seoul.go.kr/apig/apiman-gateway/tapi/TaimsTpssA18RouteSection/1.0
  요청: apikey, stdrDe(YYYYMMDD), startRow, rowCnt

요일 처리: 이 API 는 일자별로만 주고 평일/토/일 구분값이 없다.
그래서 최소 8주치를 모아 날짜를 요일로 바꿔 집계한다(집계는 parse_tdata.py).

사용법
  python fetch_tdata_section.py --probe                # 키·주소 확인만
  python fetch_tdata_section.py --date 20260701        # 하루치
  python fetch_tdata_section.py --backfill             # 요일별 8주치 백필 (M1-3)
  python fetch_tdata_section.py --sample               # 키 없이 스키마 확인용 표본 만들기
"""
import argparse
import os
import random
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

OUT_DIR = os.path.join(C.RAW, 'tdata')


def fetch_day(cfg, keys, date, max_pages=400):
    sec = cfg['tdata']
    svc = sec['services']['route_section']
    key = C.require_key(keys, sec['key'], 'T-DATA(TAIMS) 인증키')
    C.register_secret(key)
    size = svc.get('page_size', 1000)
    rows, start = [], 1
    for _ in range(max_pages):
        params = dict(svc['params'])
        params = {k: (key if v == '{KEY}' else v) for k, v in params.items()}
        params['stdrDe'] = C.ymd(date)
        params['startRow'] = start
        params['rowCnt'] = size
        data = C.http_get(svc['url'], params)
        got = C.find_rows(data)
        if not got:
            if start == 1:
                raise RuntimeError('빈 응답 — %s' % (C.find_message(data) or '메시지 없음'))
            break
        rows.extend(got)
        if len(got) < size:
            break
        start += size
    return rows


def save_day(date, rows):
    path = os.path.join(OUT_DIR, C.ymd(date) + '.json')
    C.save_json(path, {'source': 'tdata.route_section', 'date': C.ymd(date),
                       'dayType': C.day_type(date), 'rows': rows, 'count': len(rows)})
    return path


# ── 표본 만들기 ────────────────────────────────────────────────────────────
def make_sample(date, routes=3, stops=12):
    """키가 없을 때 스키마 파서를 시험하기 위한 **가짜** 표본.

    사양서 4.2 가 적어 둔 필드 이름을 그대로 쓴다. 진짜 응답이 오면
    파서가 그대로 먹거나, 필드 이름이 다르면 그 자리에서 티가 난다.
    파일 안에 fake=True 를 박아 두어 집계가 실수로 섞지 못하게 한다.
    """
    rnd = random.Random(20260904)
    rows = []
    for r in range(routes):
        route_id = 'B10010%04d' % (r + 1)
        for s in range(stops - 1):
            row = {
                'route_id': route_id,
                'from_sta_id': '%08d' % (100000 + r * 100 + s),
                'to_sta_id': '%08d' % (100000 + r * 100 + s + 1),
                'sta_sn': s + 1,
            }
            for h in range(24):
                # 출퇴근 두 봉우리 + 노선 중앙이 볼록한 모양
                peak = 1.0 if h in (7, 8, 18) else (0.6 if 9 <= h <= 17 else 0.15)
                mid = 1.0 - abs((s / (stops - 2)) - 0.55) * 1.4
                trips = 0 if h < 5 else max(1, int(6 * peak + rnd.uniform(0, 2)))
                # 운행이 0회면 평균 재차인원도 0이어야 한다 — 진짜 응답의 규칙을 표본도 지킨다.
                mean = max(0.0, 26 * peak * mid + rnd.uniform(-2, 2)) if trips else 0.0
                mx = mean * (1.35 + rnd.uniform(0, 0.35)) if trips >= 2 else mean
                row['a18Num%02dh' % h] = round(mean, 1)
                row['max_a18Num%02dh' % h] = round(mx, 1)
                row['a18FcntNum%02dh' % h] = trips
                row['a18OverCntNum%02dh' % h] = int(trips * 0.2) if peak == 1.0 else 0
            rows.append(row)
    path = os.path.join(OUT_DIR, C.ymd(date) + '.json')
    C.save_json(path, {'source': 'tdata.route_section', 'date': C.ymd(date),
                       'dayType': C.day_type(date), 'rows': rows, 'count': len(rows),
                       'fake': True,
                       'note': '키 없이 스키마 파서를 시험하려고 만든 가짜 표본이다. 실측이 아니다.'})
    return path, len(rows)


def main():
    ap = argparse.ArgumentParser(description='T-DATA 구간별 재차인원 수집')
    ap.add_argument('--date', help='YYYYMMDD 하루')
    ap.add_argument('--backfill', action='store_true', help='요일별 8주치 백필')
    ap.add_argument('--probe', action='store_true', help='키·주소 확인만')
    ap.add_argument('--sample', action='store_true', help='가짜 표본 만들기(키 불필요)')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    cfg = C.config()
    keys = C.load_keys()

    if args.sample:
        d = C.today_kst() - timedelta(days=40)
        path, n = make_sample(d)
        C.log('가짜 표본 %d행 → %s' % (n, path))
        C.log('※ 실측이 아니다. 집계는 --allow-fake 를 줘야 이 파일을 쓴다.')
        return

    if args.probe:
        d = C.today_kst() - timedelta(days=cfg['collect']['tdata_lag_days'])
        try:
            rows = fetch_day(cfg, keys, d)
            C.log('[OK] tdata %s — %d행' % (C.ymd(d), len(rows)))
            if rows:
                C.log('     필드: %s' % ', '.join(sorted(rows[0].keys())[:12]))
        except Exception as e:
            C.log('[실패] tdata — %s' % e)
            raise SystemExit(1)
        return

    if args.date:
        days = [C.parse_ymd(args.date)]
    elif args.backfill:
        # 월 1회 갱신이라 최근 날짜는 아직 없다. lag 만큼 뒤로 물러난 뒤 8주치.
        base = C.today_kst() - timedelta(days=cfg['collect']['tdata_lag_days'])
        weeks = cfg['collect']['backfill_weeks']
        days = [base - timedelta(days=i) for i in range(weeks * 7)]
    else:
        days = [C.today_kst() - timedelta(days=cfg['collect']['tdata_lag_days'])]

    C.log('== T-DATA 구간별 재차인원 %d일치 ==' % len(days))
    got = 0
    for d in days:
        path = os.path.join(OUT_DIR, C.ymd(d) + '.json')
        if os.path.exists(path) and not args.force:
            C.log('  %s — 이미 있음' % C.ymd(d))
            got += 1
            continue
        try:
            rows = fetch_day(cfg, keys, d)
        except SystemExit:
            raise
        except Exception as e:
            C.log('  %s — 실패: %s' % (C.ymd(d), e))
            continue
        save_day(d, rows)
        C.log('  %s (%s) — %d행' % (C.ymd(d), C.day_type(d), len(rows)))
        got += 1
    C.log('== 끝: %d/%d일 ==' % (got, len(days)))
    raise SystemExit(0 if got else 1)


if __name__ == '__main__':
    main()
