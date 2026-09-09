# -*- coding: utf-8 -*-
"""수도권 광역전철 승하차 받기 — 서울 열린데이터광장 `CardSubwayTime` (D-108).

★ 왜 이것이 답인가 ★
우리 그래프의 지하철 46개 노선 중 23개(486역)가 「자료 없음 = 서서 간다」였다.
코레일이 여는 것은 **연간 총계뿐**(역명·승차·하차)이라 시간대가 없어 못 쓴다.
그런데 서울 열린데이터광장의 이 자료는 **역별 시간대별 승차·하차**를 주고,
실측해 보니 **27개 노선**이 들어 있다 — 9호선·우이신설·신림뿐 아니라
경부·경인·경원·경의·중앙·분당·수인·안산·일산·과천·장항·경춘·경강·서해선과 공항철도까지.
즉 비어 있던 곳을 거의 다 채운다.

★ 한계 두 가지 (반드시 알고 쓸 것) ★
① **월 단위 합계라 요일이 없다.** 평일·토·일을 못 가른다 — 우리가 이미 가진 서울 지하철
   요일 계수로 나눠 써야 한다(버스에 쓰던 방식과 같다).
② 노선 이름이 **운영 노선명**이다(경부선·경인선·중앙선…). 우리 그래프는 **안내 노선명**
   (1호선·수인분당선·경의중앙선…)을 쓰므로 표로 맞춰야 한다. 이름이 안 맞으면
   그 노선이 통째로 조용히 빠진다 — 이 저장소에서 제일 자주 난 사고다.

키: `SEOUL_OPEN_KEY` (열린데이터광장 「일반 인증키」, 무료·즉시 발급, 하루 1,000건)
사용: python pipeline/fetch_seoul_rail.py [--months 6]
"""
import argparse
import datetime
import io
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

BASE = 'http://openapi.seoul.go.kr:8088'
SERVICE = 'CardSubwayTime'
OUT_DIR = os.path.join(C.RAW, 'seoulrail')
PAGE = 1000


def key():
    try:
        k = json.load(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                           'keys.json'), encoding='utf-8'))['SEOUL_OPEN_KEY']
    except Exception:
        k = os.environ.get('SEOUL_OPEN_KEY', '')
    if not k:
        C.die('SEOUL_OPEN_KEY 가 없다. https://data.seoul.go.kr 에서 「일반 인증키」를 받아'
              ' pipeline/keys.json 에 넣는다.')
    return k


def fetch_month(k, ym):
    """그 달의 전 역 시간대별 승하차. 한 번에 1,000행씩 끊어 받는다."""
    rows, start = [], 1
    while True:
        url = '%s/%s/json/%s/%d/%d/%s/' % (BASE, k, SERVICE, start, start + PAGE - 1, ym)
        raw = urllib.request.urlopen(url, timeout=180).read().decode('utf-8', 'replace')
        doc = json.loads(raw)
        body = None
        for name in doc:
            if name != 'RESULT':
                body = doc[name]
                break
        if body is None:
            msg = (doc.get('RESULT') or {}).get('MESSAGE', '?')
            if start == 1:
                C.log('  %s — %s' % (ym, str(msg)[:60]))
            return rows
        got = body.get('row') or []
        rows += got
        total = int(body.get('list_total_count') or 0)
        if not got or len(rows) >= total:
            return rows
        start += PAGE


def main():
    ap = argparse.ArgumentParser(description='수도권 광역전철 승하차 받기')
    ap.add_argument('--months', type=int, default=6, help='최근 몇 달을 받을지')
    a = ap.parse_args()
    k = key()
    os.makedirs(OUT_DIR, exist_ok=True)
    C.log('== 수도권 광역전철 승하차 받기 (최근 %d달) ==' % a.months)
    today = datetime.date.today().replace(day=1)
    got_any = 0
    for i in range(1, a.months + 1):
        d = today
        for _ in range(i):                       # 지난달부터 거슬러 올라간다
            d = (d - datetime.timedelta(days=1)).replace(day=1)
        ym = d.strftime('%Y%m')
        path = os.path.join(OUT_DIR, ym + '.json')
        if os.path.exists(path):
            C.log('  %s — 이미 있다' % ym)
            got_any += 1
            continue
        rows = fetch_month(k, ym)
        if not rows:
            continue
        lines = sorted({str(r.get('SBWY_ROUT_LN_NM')) for r in rows})
        C.save_json(path, {'month': ym, 'lines': lines, 'rows': rows})
        C.log('  %s — %d행 · 노선 %d개' % (ym, len(rows), len(lines)))
        got_any += 1
    if not got_any:
        C.die('한 달치도 못 받았다 — 키나 서비스 이름을 확인할 것.')
    C.log('== %s ==' % OUT_DIR)


if __name__ == '__main__':
    main()
