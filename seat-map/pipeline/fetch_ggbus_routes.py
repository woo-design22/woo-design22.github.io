# -*- coding: utf-8 -*-
"""경기 광역버스 노선망 받기 — TAGO, 31개 시·군 (D-109).

★ 광역버스만 받는다 ★ 경기 전 노선은 2,100개가 넘지만, 승하차 자료(fetch_ggbus.py)가
광역버스뿐이라 혼잡을 계산할 수 있는 것도 광역버스뿐이다. 유형 셋만 고른다:
직행좌석버스 · 광역급행버스 · 좌석버스 (~4백 노선, 호출 ~450번).

★ 정류소 ID 가 그대로 잇는 열쇠다 ★ TAGO 의 nodeid 는 `GGB` + GBIS 정류소아이디라
(GGB206000498 ↔ 승하차 자료의 206000498), 이름 맞추기 없이 ID 로 붙는다.
★ 미정차 지점이 끼어 있다 ★ 광역버스 나열에는 「(미정차)」 통과 지점이 섞여 있다 —
정류장이 아니므로 걷어낸다(놔두면 그래프에 세우지 않는 역이 생긴다).
★ 수원이 0개로 오는 때가 있다 ★ 일시 오류다 — 비면 한 번 쉬고 다시 묻는다.

받는 것: data/raw/ggbus/routes.json
사용: python pipeline/fetch_ggbus_routes.py [--cap 900]
"""
import argparse
import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C          # noqa: E402
import fetch_citybus as FC  # noqa: E402  (call·items_of·key 재사용)

OUT = os.path.join(C.RAW, 'ggbus', 'routes.json')
WANT = {'직행좌석버스', '광역급행버스', '좌석버스'}
GG = {31010: '수원', 31020: '성남', 31030: '의정부', 31040: '안양', 31050: '부천',
      31060: '광명', 31070: '평택', 31080: '동두천', 31090: '안산', 31100: '고양',
      31110: '과천', 31120: '구리', 31130: '남양주', 31140: '오산', 31150: '시흥',
      31160: '군포', 31170: '의왕', 31180: '하남', 31190: '용인', 31200: '파주',
      31210: '이천', 31220: '안성', 31230: '김포', 31240: '화성', 31250: '광주',
      31260: '양주', 31270: '포천', 31320: '여주', 31350: '연천', 31370: '가평',
      31380: '양평'}


def route_list(k, code):
    out, page = [], 1
    while True:
        its = FC.items_of(FC.call('getRouteNoList', k, cityCode=code, pageNo=page))
        if not its and page == 1:            # 일시 오류(수원 0개 사건) — 한 번 쉬고 다시
            time.sleep(3)
            its = FC.items_of(FC.call('getRouteNoList', k, cityCode=code, pageNo=page))
        out += its
        if len(its) < 500:
            return out
        page += 1


def main():
    ap = argparse.ArgumentParser(description='경기 광역버스 노선망 받기')
    ap.add_argument('--cap', type=int, default=900)
    a = ap.parse_args()
    k = FC.key()
    doc = {'note': 'TAGO 경기 광역버스(직행좌석·광역급행·좌석). nodeid=GGB+GBIS 정류소아이디.',
           'routes': []}
    if os.path.exists(OUT):
        try:
            doc = json.load(io.open(OUT, encoding='utf-8'))
        except Exception:
            pass
    done = {r['id'] for r in doc['routes']}
    calls = 0
    C.log('== 경기 광역버스 노선망 (받아 둔 것 %d개) ==' % len(done))
    for code in sorted(GG):
        if calls >= a.cap:
            break
        lst = route_list(k, code)
        calls += 1
        want = [r for r in lst if str(r.get('routetp')) in WANT]
        todo = [r for r in want if str(r.get('routeid')) not in done]
        if not todo:
            C.log('  %-4s 광역 %d개 — 다 받았다' % (GG[code], len(want)))
            continue
        C.log('  %-4s 노선 %d개 중 광역 %d개 · 남은 것 %d개' % (GG[code], len(lst), len(want), len(todo)))
        for r in todo:
            if calls >= a.cap:
                break
            rid = str(r.get('routeid'))
            try:
                st = FC.items_of(FC.call('getRouteAcctoThrghSttnList', k,
                                         cityCode=code, routeId=rid))
            except Exception as e:
                C.log('   %s %s — 실패(%s)' % (r.get('routeno'), rid, str(e)[:40]))
                calls += 1
                continue
            calls += 1
            stops = []
            for s in sorted(st, key=lambda x: (x.get('updowncd') or 0, x.get('nodeord') or 0)):
                nm = str(s.get('nodenm') or '')
                if '미정차' in nm:
                    continue                     # 통과 지점 — 정류장이 아니다
                la, lo = FC.num(s.get('gpslati')), FC.num(s.get('gpslong'))
                if la is None or lo is None:
                    continue
                stops.append([nm, la, lo, int(s.get('nodeord') or 0),
                              int(s.get('updowncd') or 0), str(s.get('nodeid') or '')])
            if len(stops) < 4:
                continue
            doc['routes'].append({'id': rid, 'no': str(r.get('routeno')),
                                  'city': GG[code], 'citycode': code,
                                  'type': str(r.get('routetp')), 'stops': stops})
            if len(doc['routes']) % 40 == 0:
                C.save_json(OUT, doc)
    C.save_json(OUT, doc)
    left = 0
    C.log('== 노선 %d개 저장 · 호출 %d회 → %s ==' % (len(doc['routes']), calls, OUT))


if __name__ == '__main__':
    main()
