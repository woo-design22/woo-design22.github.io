# -*- coding: utf-8 -*-
"""광역시 시내버스 망 받기 — 국토교통부 TAGO (D-106).

★ 왜 TAGO 인가 ★
서울 버스는 열린데이터광장이 「노선별 경유 정류소」를 파일로 준다. 지방은 그런 파일이
도시마다 제각각이고, 있어도 **정류장 순번이 없는** 경우가 많다(대구 노선정보 파일이 그렇다 —
기점·종점만 있고 중간이 없다). 순번이 없으면 길찾기 그래프를 못 만든다.
TAGO 는 138개 시를 한 규격으로 주고 **순번(nodeord)·좌표(gpslati/gpslong)·방향(updowncd)**
이 다 있다. 그래서 지방 버스는 여기서 받는다. 서울은 TAGO 에 없지만 이미 있다.

★ 호출 수가 곧 제약이다 ★
노선 하나당 한 번씩 부른다 — 다섯 광역시 1,395개 노선이면 1,400번쯤이다.
개발계정은 하루 상한이 있으므로 **어디까지 받았는지 적어 두고 이어 받는다**(state 파일).
상한에 걸리면 조용히 멈추지 말고 몇 개가 남았는지 말한다.

받는 것: data/raw/citybus/<도시>.json
  {"city": "대구", "code": 22, "routes": [{"id","no","type","stops":[[이름,위도,경도,순번,방향]]}]}

사용: python pipeline/fetch_citybus.py [--only busan,daegu] [--cap 900]
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

BASE = 'http://apis.data.go.kr/1613000/BusRouteInfoInqireService'
OUT_DIR = os.path.join(C.RAW, 'citybus')
CITIES = {'busan': ('부산', 21), 'daegu': ('대구', 22), 'incheon': ('인천', 23),
          'gwangju': ('광주', 24), 'daejeon': ('대전', 25)}


def key():
    try:
        k = json.load(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                           'keys.json'), encoding='utf-8'))['DATA_GO_KR_KEY']
    except Exception:
        k = os.environ.get('DATA_GO_KR_KEY', '')
    if not k:
        C.die('DATA_GO_KR_KEY 가 없다. pipeline/keys.json 에 넣는다.')
    return urllib.parse.unquote(k)


def call(op, k, tries=3, **kw):
    p = {'serviceKey': k, '_type': 'json', 'numOfRows': 500, 'pageNo': 1}
    p.update(kw)
    url = BASE + '/' + op + '?' + urllib.parse.urlencode(p)
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(url, timeout=120).read().decode('utf-8', 'replace')
            return json.loads(raw)
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def items_of(doc):
    """TAGO 는 결과가 0개면 items 가 빈 문자열, 1개면 dict, 여럿이면 list 다."""
    b = (doc.get('response') or {}).get('body') or {}
    it = b.get('items')
    if not it or isinstance(it, str):
        return []
    it = it.get('item')
    if not it:
        return []
    return it if isinstance(it, list) else [it]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def harvest(key_, city_key, cap):
    name, code = CITIES[city_key]
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, city_key + '.json')
    doc = {'city': name, 'code': code, 'routes': []}
    if os.path.exists(path):
        try:
            doc = json.load(io.open(path, encoding='utf-8'))
        except Exception:
            pass
    done = {r['id'] for r in doc['routes']}

    lst = items_of(call('getRouteNoList', key_, cityCode=code))
    if not lst:
        C.log('  %s — 노선 목록이 비었다. 도시 코드나 키를 확인할 것.' % name)
        return 0, 0
    calls = 1
    todo = [r for r in lst if str(r.get('routeid')) not in done]
    C.log('  %s: 노선 %d개 (받아 둔 것 %d개, 남은 것 %d개)' % (name, len(lst), len(done), len(todo)))

    for r in todo:
        if calls >= cap:
            break
        rid = str(r.get('routeid'))
        try:
            st = items_of(call('getRouteAcctoThrghSttnList', key_, cityCode=code, routeId=rid))
        except Exception as e:
            C.log('    %s %s — 실패(%s)' % (r.get('routeno'), rid, str(e)[:40]))
            calls += 1
            continue
        calls += 1
        stops = []
        for s in st:
            la, lo = num(s.get('gpslati')), num(s.get('gpslong'))
            nm = str(s.get('nodenm') or '').strip()
            if la is None or lo is None or not nm:
                continue
            stops.append([nm, round(la, 6), round(lo, 6),
                          int(num(s.get('nodeord')) or 0), int(num(s.get('updowncd')) or 0)])
        if len(stops) < 3:
            continue
        doc['routes'].append({'id': rid, 'no': str(r.get('routeno') or '').strip(),
                              'type': str(r.get('routetp') or '').strip(), 'stops': stops})
        if len(doc['routes']) % 40 == 0:
            C.save_json(path, doc)
    C.save_json(path, doc)
    left = len(lst) - len(doc['routes'])
    C.log('  %s → 노선 %d개 저장 (호출 %d회%s)'
          % (name, len(doc['routes']), calls,
             (', 남은 노선 %d개 — 내일 다시 돌리면 이어 받는다' % left) if left > 0 else ', 다 받았다'))
    return calls, left


def main():
    ap = argparse.ArgumentParser(description='광역시 시내버스 망 받기 (TAGO)')
    ap.add_argument('--only', help='도시 골라서 (busan,daegu,incheon,gwangju,daejeon)')
    ap.add_argument('--cap', type=int, default=900, help='한 번에 부를 최대 횟수(개발계정 하루 상한 대비)')
    a = ap.parse_args()
    keys = [k for k in CITIES if not a.only or k in a.only.split(',')]
    k = key()
    C.log('== 광역시 시내버스 망 받기 ==')
    used, left_all = 0, 0
    for ck in keys:
        if used >= a.cap:
            C.log('  호출 상한(%d)에 닿았다. 나머지는 다음에.' % a.cap)
            break
        c, left = harvest(k, ck, a.cap - used)
        used += c
        left_all += left
    C.log('== 호출 %d회 · 남은 노선 %d개 → %s ==' % (used, left_all, OUT_DIR))


if __name__ == '__main__':
    main()
