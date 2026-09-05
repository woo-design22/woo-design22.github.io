# -*- coding: utf-8 -*-
"""서울시 노선정보조회(공공데이터포털 15000193)에서 **노선별 현재 배차간격**을 받는다.

왜 필요한가 (DECISIONS.md D-63)
  배차간격은 재차인원의 나누는 수라 앉을 확률을 좌우한다(D-57).
  처음에는 노선기본정보(OA-15262)의 **2024-04 인가값**을 썼는데 — 그 판이 배차 열이 실린
  마지막 판이라 어쩔 수 없었다 — 이 API 가 승인되면서 **오늘 값**을 받을 수 있게 됐다.
  실측 대조(2026-09-05, 644개 노선): 60%는 그대로지만 마을버스 여럿이 절반/두 배로 바뀌었다
  (노원03 25→13분, 광진04 9→18분). 2024값을 계속 쓰면 그 노선들이 두 배 틀린다.

사용
  python pipeline/fetch_headways.py          # 받아서 data/bus/headways.json 갱신
  python pipeline/fetch_headways.py --probe  # 키·연결 확인만

- 인증키: keys.json 의 DATA_GO_KR_KEY (Decoding 키). 없으면 그대로 두고 끝낸다 —
  build_graph 는 headways.json 이 없으면 2024 인가값(OA-15262)으로 물러난다.
- 빈 검색(strSrch='')이 전 노선을 한 번에 준다(실측 1,363건, 호출 1회) —
  개발계정 트래픽(1,000/일)을 사실상 안 쓴다.
"""
import argparse
import json
import io
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

URL = 'http://ws.bus.go.kr/api/rest/busRouteInfo/getBusRouteList'
OUT = os.path.join(C.DATA, 'bus', 'headways.json')


def fetch_all(key):
    q = urllib.parse.urlencode({'serviceKey': key, 'strSrch': '', 'resultType': 'json'})
    req = urllib.request.Request(URL + '?' + q, headers={'User-Agent': 'seat-map/0.1'})
    with urllib.request.urlopen(req, timeout=90) as r:
        res = json.loads(r.read().decode('utf-8', 'replace'))
    hdr = res.get('msgHeader') or {}
    if str(hdr.get('headerCd')) not in ('0', '4'):        # 4 = 결과 없음
        raise RuntimeError('노선정보조회 오류: %s %s' % (hdr.get('headerCd'), hdr.get('headerMsg')))
    return (res.get('msgBody') or {}).get('itemList') or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--probe', action='store_true', help='키·연결 확인만')
    args = ap.parse_args()

    key = C.load_keys().get('DATA_GO_KR_KEY')
    if not key:
        C.log('DATA_GO_KR_KEY 가 없다 — 건너뜀 (2024 인가값으로 물러난다)')
        return
    items = fetch_all(key)
    C.log('노선 %d건 수신' % len(items))
    if args.probe:
        return

    routes = {}
    skipped = 0
    for it in items:
        nm = str(it.get('busRouteNm') or '').strip()
        try:
            term = float(it.get('term') or 0)
        except (TypeError, ValueError):
            term = 0
        if not nm or not (0 < term <= 120):
            skipped += 1
            continue
        routes[nm] = {'headwayMin': term,
                      'routeType': str(it.get('routeType') or ''),
                      'routeId': str(it.get('busRouteId') or '')}
    C.save_json(OUT, {
        'fetchedAt': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'source': '서울특별시_노선정보조회 (공공데이터포털 15000193, ws.bus.go.kr). '
                  '배차간격(term)은 평일 기준 분 단위',
        'note': 'build_graph.py 가 이 값을 1순위로 쓴다. 없으면 2024 인가값(OA-15262) → 종류별 중앙값 순',
        'count': len(routes),
        'routes': routes,
    })
    C.log('배차간격 %d개 저장 (버린 것 %d)' % (len(routes), skipped))


if __name__ == '__main__':
    main()
