# -*- coding: utf-8 -*-
"""전국 시·군 버스 노선망 받기 — TAGO 전 도시 (D-111 준비).

★ 왜 받나 ★ 사용자 지시(2026-09-10): 「앉을 정보 없어도 경로만이라도 넣어줄래?」.
승하차가 없어 앉을 확률은 「모름 = 서서」지만, 길찾기 자체는 되게 한다.
★ 무엇을 빼나 ★ 이미 들어간 것 — 광역시 6곳(fetch_citybus)과 경기 광역버스
(fetch_ggbus_routes 의 직행좌석·광역급행·좌석). 경기 31개 시는 **일반·마을버스만** 받는다.
★ 서울(코드 없음)은 TAGO 에 없다 ★ — 서울은 이미 열린데이터로 다 있다.

규모: 도시 ~100곳 · 노선 ~1만 개 → 호출 ~1만 번. 하루 상한에 걸리면 남은 수를 말하고
멈춘다 — state 는 도시 파일이라 다음 날 그대로 다시 돌리면 이어 받는다(D-106 방식).

받는 것: data/raw/krbus/<코드>.json  {"city","code","routes":[{"id","no","type","stops":[…]}]}
사용: python pipeline/fetch_krbus.py [--cap 8000] [--only 32010,32020]
"""
import argparse
import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C          # noqa: E402
import fetch_citybus as FC  # noqa: E402

OUT_DIR = os.path.join(C.RAW, 'krbus')
DONE_METRO = {21, 22, 23, 24, 25, 26}          # 광역시 — fetch_citybus 가 이미 받았다
GG_SKIP_TYPES = {'직행좌석버스', '광역급행버스', '좌석버스'}   # 경기 광역 — fetch_ggbus_routes 몫


def city_list(k):
    out, page = [], 1
    while True:
        its = FC.items_of(FC.call('getCtyCodeList', k, pageNo=page))
        out += its
        if len(its) < 500:
            return out
        page += 1


def harvest_city(k, code, name, cap_left):
    """한 도시의 전 노선(경기는 일반·마을만). 돌아오는 값: 쓴 호출 수, 남은 노선 수."""
    path = os.path.join(OUT_DIR, '%d.json' % code)
    doc = {'city': name, 'code': code, 'routes': []}
    if os.path.exists(path):
        try:
            doc = json.load(io.open(path, encoding='utf-8'))
        except Exception:
            pass
    done = {r['id'] for r in doc['routes']}
    calls = 0
    lst, page = [], 1
    while True:
        its = FC.items_of(FC.call('getRouteNoList', k, cityCode=code, pageNo=page))
        calls += 1
        if not its and page == 1:              # 일시 오류(수원 0개 사건) — 한 번 쉬고 다시
            time.sleep(2)
            its = FC.items_of(FC.call('getRouteNoList', k, cityCode=code, pageNo=page))
            calls += 1
        lst += its
        if len(its) < 500:
            break
        page += 1
    gg = 31000 <= code < 32000
    want = [r for r in lst
            if not (gg and str(r.get('routetp')) in GG_SKIP_TYPES)]
    todo = [r for r in want if str(r.get('routeid')) not in done]
    if not todo:
        return calls, 0
    for r in todo:
        if calls >= cap_left:
            C.save_json(path, doc)
            return calls, len(todo) - (len(doc['routes']) - len(done))
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
                continue
            la, lo = FC.num(s.get('gpslati')), FC.num(s.get('gpslong'))
            if la is None or lo is None:
                continue
            stops.append([nm, la, lo, int(s.get('nodeord') or 0),
                          int(s.get('updowncd') or 0), str(s.get('nodeid') or '')])
        if len(stops) >= 3:
            doc['routes'].append({'id': rid, 'no': str(r.get('routeno')),
                                  'type': str(r.get('routetp')), 'stops': stops})
        if len(doc['routes']) % 60 == 0:
            C.save_json(path, doc)
    C.save_json(path, doc)
    return calls, 0


def main():
    ap = argparse.ArgumentParser(description='전국 시·군 버스 노선망 받기')
    ap.add_argument('--cap', type=int, default=8000, help='이번 실행 최대 호출 수')
    ap.add_argument('--only', help='도시 코드 골라서 (쉼표)')
    a = ap.parse_args()
    k = FC.key()
    os.makedirs(OUT_DIR, exist_ok=True)
    cities = city_list(k)
    C.log('== 전국 버스 노선망 == TAGO 도시 %d곳' % len(cities))
    total_calls, left_routes, done_cities = 1, 0, 0
    for c in cities:
        try:
            code = int(c.get('citycode'))
        except (TypeError, ValueError):
            continue
        name = str(c.get('cityname') or code)
        if code in DONE_METRO:
            continue
        if a.only and str(code) not in a.only.split(','):
            continue
        if total_calls >= a.cap:
            C.log('  호출 상한(%d)에 닿았다 — 내일 그대로 다시 돌리면 이어 받는다' % a.cap)
            break
        used, left = harvest_city(k, code, name, a.cap - total_calls)
        total_calls += used
        left_routes += left
        done_cities += 1
        p = os.path.join(OUT_DIR, '%d.json' % code)
        n = 0
        if os.path.exists(p):
            try:
                n = len(json.load(io.open(p, encoding='utf-8'))['routes'])
            except Exception:
                pass
        C.log('  %-6s(%d) 노선 %d개%s · 누적 호출 %d'
              % (name, code, n, (' · 못 받은 %d' % left) if left else '', total_calls))
    C.log('== 도시 %d곳 훑음 · 호출 %d회%s ==' %
          (done_cities, total_calls,
           (' · 남은 노선 %d개(이어받기)' % left_routes) if left_routes else ''))


if __name__ == '__main__':
    main()
