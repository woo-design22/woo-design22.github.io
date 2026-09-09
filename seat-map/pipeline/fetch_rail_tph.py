# -*- coding: utf-8 -*-
"""수도권 광역전철 배차 — 시간표에서 **역마다 열차를 직접 센다** (D-108).

★ 왜 노선 대표값으로 하면 안 되나 ★
집 규칙: 「이 나누는 수가 두 배 틀리면 앉을 확률이 통째로 뒤집힌다」.
수도권 광역전철은 노선 안에서도 편차가 극단적이다 — 1호선 서울역과 신창,
경의중앙선 용산과 지평은 시간당 열차 수가 몇 배 차이 난다. 노선 하나에 값 하나를 쓰면
바깥 구간이 실제보다 몇 배 한산하게 나온다(부산에서 겪은 그 문제다).
그래서 **역마다** 센다. 799역이 하루 상한(1,000건) 안에 들어간다.

★ 한 방향만 센다 ★ 복선이라 상·하행 편수가 거의 같고, 두 방향을 다 세면 1,598건이라
하루 상한을 넘는다. 상행(1)이 비면 하행(2)으로 물러난다.

내는 것: data/subway/rail-tph.json
  {"stations": {"<역코드>": {"line","name","tph":[24칸]}}, "lines": {...노선 중앙값...}}

키: SEOUL_OPEN_KEY (일반 인증키)
사용: python pipeline/fetch_rail_tph.py [--cap 900]
"""
import argparse
import collections
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

BASE = 'http://openapi.seoul.go.kr:8088'
RAW = os.path.join(C.RAW, 'seoulrail')
OUT = os.path.join(C.DATA, 'subway', 'rail-tph.json')


def key():
    try:
        k = json.load(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                           'keys.json'), encoding='utf-8'))['SEOUL_OPEN_KEY']
    except Exception:
        k = os.environ.get('SEOUL_OPEN_KEY', '')
    if not k:
        C.die('SEOUL_OPEN_KEY 가 없다.')
    return k


def call(k, path, tries=3):
    url = '%s/%s/json/%s' % (BASE, k, urllib.parse.quote(path, safe='/'))
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(url, timeout=120).read().decode('utf-8', 'replace')
            doc = json.loads(raw)
            for name in doc:
                if name != 'RESULT':
                    b = doc[name]
                    return b.get('row') or []
            return []                      # RESULT 만 있으면 결과 없음
        except Exception as e:
            last = e
            time.sleep(1.0 * (i + 1))
    raise last


def hour_of(t):
    m = re.match(r'\s*(\d{1,2}):(\d{2})', str(t or ''))
    if not m:
        return None
    h = int(m.group(1))
    return h % 24 if h < 30 else None      # 25:xx 같은 표기는 다음날로 돈다


def main():
    ap = argparse.ArgumentParser(description='수도권 광역전철 역별 배차 세기')
    ap.add_argument('--cap', type=int, default=900, help='한 번에 부를 최대 횟수(하루 1,000건)')
    a = ap.parse_args()
    k = key()
    sp = os.path.join(RAW, 'stations.json')
    if not os.path.exists(sp):
        C.die('%s 가 없다. fetch_seoul_rail.py 를 먼저 돌려 역 목록을 받는다.' % sp)
    stations = json.load(io.open(sp, encoding='utf-8'))

    out = {'note': '평일 한 방향 기준 시간당 열차 수 — 역별 시간표에서 직접 셌다(D-108).',
           'stations': {}, 'lines': {}}
    if os.path.exists(OUT):
        try:
            out = json.load(io.open(OUT, encoding='utf-8'))
            out.setdefault('stations', {})
            out.setdefault('lines', {})
        except Exception:
            pass

    todo = [s for s in stations if str(s.get('STATION_CD')) not in out['stations']]
    C.log('== 역별 배차 세기 == 전체 %d역 · 남은 것 %d역' % (len(stations), len(todo)))
    calls = 0
    for s in todo:
        if calls >= a.cap:
            break
        cd = str(s.get('STATION_CD'))
        rows = []
        for inout in ('1', '2'):                 # 상행이 비면 하행으로
            try:
                rows = call(k, 'SearchSTNTimeTableByIDService/1/1000/%s/1/%s/' % (cd, inout))
            except Exception as e:
                C.log('   %s %s — 실패(%s)' % (s.get('STATION_NM'), cd, str(e)[:40]))
                rows = []
            calls += 1
            if rows:
                break
        if not rows:
            continue
        cnt = collections.Counter()
        for r in rows:
            h = hour_of(r.get('ARRIVETIME') or r.get('LEFTTIME'))
            if h is not None:
                cnt[h] += 1
        if not cnt:
            continue
        out['stations'][cd] = {'line': s.get('LINE_NUM'), 'name': s.get('STATION_NM'),
                               'tph': [cnt.get(h, 0) for h in range(24)]}
        if len(out['stations']) % 60 == 0:
            C.save_json(OUT, out)
            C.log('   %d역까지 (호출 %d)' % (len(out['stations']), calls))

    # 노선별 중앙값 — 역 자료가 빠진 곳의 폴백
    byline = collections.defaultdict(list)
    for cd, v in out['stations'].items():
        byline[v['line']].append(v['tph'])
    for ln, arrs in byline.items():
        med = []
        for h in range(24):
            xs = sorted(a2[h] for a2 in arrs)
            med.append(xs[len(xs) // 2] if xs else 0)
        out['lines'][ln] = med
    C.save_json(OUT, out)
    left = len(stations) - len(out['stations'])
    C.log('== 역 %d개 저장 · 노선 %d개 · 호출 %d회%s ==' %
          (len(out['stations']), len(out['lines']), calls,
           (' · 남은 역 %d개(내일 이어 받는다)' % left) if left > 0 else ''))
    for ln in sorted(out['lines']):
        t = out['lines'][ln]
        C.log('   %-14s 08시 %2d대 · 13시 %2d대 · 18시 %2d대' % (ln, t[8], t[13], t[18]))


if __name__ == '__main__':
    main()
