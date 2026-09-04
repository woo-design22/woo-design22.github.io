# -*- coding: utf-8 -*-
"""collect_subway_daily.py — 지하철 승하차인원 일일 수집 (사양서 M1-2, 최우선).

**왜 이것이 1순위인가**
서울교통공사_역별승하차인원 API 는 최근 1주일치만 준다(사양서 4.1).
오늘 안 받으면 그 날짜는 영영 못 받는다. 모델이 아직 없어도, 화면이 아직 없어도
이 크론만은 오늘부터 돌아야 한다.

사용법
  python collect_subway_daily.py                 # 어제까지 최근 7일치 중 없는 날만 받는다
  python collect_subway_daily.py --date 20260903 # 그 날짜만
  python collect_subway_daily.py --days 7        # 최근 며칠을 훑을지
  python collect_subway_daily.py --probe         # 키·주소가 살아 있는지만 확인(저장 안 함)
  python collect_subway_daily.py --holidays 2026 # 공휴일 표 채우기(요일 구분에 쓰인다)
  python collect_subway_daily.py --force         # 이미 받은 날짜도 다시 받는다

저장 위치
  data/raw/subway/<소스>/<YYYYMMDD>.json   원천 응답 그대로 (가공하지 않는다)
  data/raw/subway/index.json               어느 날짜를 받았는지의 대장

이미 있는 날짜는 건너뛴다. 크론이 하루에 여러 번 돌아도 안전하다.
"""
import argparse
import os
import sys
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402


def source_seoul_open(cfg, keys, date):
    """서울 열린데이터광장. 인증키가 즉시 발급돼 오늘 바로 시작할 수 있다."""
    sec = cfg['seoul_open']
    svc = sec['services']['subway_time']
    key = C.require_key(keys, sec['key'], '서울 열린데이터광장 인증키 (즉시 발급)')
    C.register_secret(key)
    rows, page, size = [], 1, svc.get('page_size', 1000)
    while True:
        start, end = (page - 1) * size + 1, page * size
        url = '%s/%s/json/%s/%d/%d/%s' % (sec['base'], key, svc['name'], start, end, C.ymd(date))
        data = C.http_get(url)
        got = C.find_rows(data)
        if not got:
            if page == 1:
                raise RuntimeError('빈 응답 — %s' % (C.find_message(data) or '메시지 없음'))
            break
        rows.extend(got)
        if len(got) < size:
            break
        page += 1
        if page > 60:      # 6만 행이면 하루치로는 충분히 많다. 무한 페이지 방어.
            break
    return rows


def source_data_go_kr(cfg, keys, date):
    """공공데이터포털 서울교통공사 API. 주소는 포털 상세 화면에서 복사해 config.json 에 넣는다."""
    sec = cfg['data_go_kr']
    svc = sec['services']['subway_boarding_recent']
    if not svc.get('url'):
        raise RuntimeError('config.json 의 data_go_kr.services.subway_boarding_recent.url 이 비어 있다 '
                           '(docs/DATA_SOURCES.md 의 절차대로 포털에서 복사해 넣을 것)')
    key = C.require_key(keys, sec['key'], '공공데이터포털 서비스키 (활용신청 승인 필요)')
    C.register_secret(key)
    rows, page = [], 1
    while True:
        params = dict(svc.get('params') or {})
        params = {k: (key if v == '{KEY}' else v) for k, v in params.items()}
        params['pageNo'] = page
        params['stdDate'] = C.ymd(date)      # 파라미터 이름은 서비스마다 다르다 — 상세 화면 확인
        data = C.http_get(svc['url'], params)
        got = C.find_rows(data)
        if not got:
            if page == 1:
                raise RuntimeError('빈 응답 — %s' % (C.find_message(data) or '메시지 없음'))
            break
        rows.extend(got)
        if len(got) < params.get('numOfRows', 1000):
            break
        page += 1
        if page > 60:
            break
    return rows


SOURCES = {
    'seoul_open': source_seoul_open,
    'data_go_kr': source_data_go_kr,
}


def collect_day(cfg, keys, date, force=False):
    """그 날짜를 받을 수 있는 소스를 모두 시도한다. 하나라도 성공하면 그 날은 확보다."""
    idx_path = os.path.join(C.RAW, 'subway', 'index.json')
    index = C.load_json(idx_path, {}) or {}
    day = C.ymd(date)
    saved = []
    for name, fn in SOURCES.items():
        out = os.path.join(C.RAW, 'subway', name, day + '.json')
        if os.path.exists(out) and not force:
            C.log('  %s %s — 이미 있음, 건너뜀' % (name, day))
            saved.append(name)
            continue
        try:
            rows = fn(cfg, keys, date)
        except SystemExit:
            raise
        except Exception as e:
            C.log('  %s %s — 실패: %s' % (name, day, e))
            continue
        C.save_json(out, {'source': name, 'date': day, 'rows': rows, 'count': len(rows)})
        C.log('  %s %s — %d행 저장' % (name, day, len(rows)))
        saved.append(name)

    if saved:
        entry = index.get(day, {})
        entry['sources'] = sorted(set(entry.get('sources', []) + saved))
        entry['dayType'] = C.day_type(date)
        index[day] = entry
        C.save_json(idx_path, index)
    return saved


def probe(cfg, keys):
    """저장하지 않고 한 번씩만 불러 본다. 크론에 걸기 전에 이걸로 확인한다."""
    date = C.today_kst() - timedelta(days=2)
    ok = True
    for name, fn in SOURCES.items():
        try:
            rows = fn(cfg, keys, date)
            C.log('  [OK]   %-12s %s — %d행' % (name, C.ymd(date), len(rows)))
        except SystemExit as e:
            C.log('  [키없음] %-12s %s' % (name, str(e).strip().splitlines()[0] if str(e).strip() else ''))
            ok = False
        except Exception as e:
            C.log('  [실패] %-12s %s' % (name, e))
            ok = False
    return ok


def fetch_holidays(cfg, keys, year):
    """특일정보 API 로 공휴일 표를 채운다. 음력 명절·대체공휴일은 계산으로 못 구한다."""
    sec = cfg['data_go_kr']
    svc = sec['services']['holiday']
    key = C.require_key(keys, sec['key'], '공공데이터포털 서비스키 (특일정보)')
    C.register_secret(key)
    got = set(C.load_holidays())
    for month in range(1, 13):
        params = dict(svc['params'])
        params = {k: (key if v == '{KEY}' else v) for k, v in params.items()}
        params['solYear'] = year
        params['solMonth'] = '%02d' % month
        try:
            data = C.http_get(svc['url'], params)
        except Exception as e:
            C.log('  %d-%02d 실패: %s' % (year, month, e))
            continue
        for row in C.find_rows(data):
            if str(row.get('isHoliday', 'Y')).upper().startswith('Y') and row.get('locdate'):
                got.add(str(row['locdate']))
    C.save_json(os.path.join(C.DATA, 'holidays.json'), sorted(got))
    C.log('공휴일 %d일 저장 (data/holidays.json)' % len(got))
    return got


def main():
    ap = argparse.ArgumentParser(description='지하철 승하차인원 일일 수집')
    ap.add_argument('--date', help='YYYYMMDD 하루만')
    ap.add_argument('--days', type=int, default=7, help='최근 며칠을 훑을지 (기본 7 — API 가 주는 만큼)')
    ap.add_argument('--probe', action='store_true', help='키·주소 확인만')
    ap.add_argument('--holidays', type=int, metavar='YEAR', help='그 해 공휴일 표 채우기')
    ap.add_argument('--force', action='store_true', help='이미 받은 날짜도 다시 받기')
    args = ap.parse_args()

    cfg = C.config()
    keys = C.load_keys()
    if not cfg:
        C.die('pipeline/config.json 이 없다.')

    if args.holidays:
        fetch_holidays(cfg, keys, args.holidays)
        return

    if args.probe:
        C.log('== 확인만 (저장하지 않음) ==')
        raise SystemExit(0 if probe(cfg, keys) else 1)

    if args.date:
        days = [C.parse_ymd(args.date)]
    else:
        today = C.today_kst()
        days = [today - timedelta(days=i) for i in range(1, args.days + 1)]

    C.log('== 지하철 승하차 수집 %d일치 ==' % len(days))
    got = 0
    for d in days:
        if collect_day(cfg, keys, d, args.force):
            got += 1
    C.log('== 끝: %d/%d일 확보 ==' % (got, len(days)))
    # 크론이 실패를 알아채려면 종료 코드가 필요하다. 하루도 못 받으면 실패다.
    raise SystemExit(0 if got else 1)


if __name__ == '__main__':
    main()
