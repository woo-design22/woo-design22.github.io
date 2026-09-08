# -*- coding: utf-8 -*-
"""fetch_poi.py — 상호로 찾기 위한 장소 목록(POI)을 받는다.

★ 이 파일이 있는 이유 (D-99) ★
「미아동 내과」·「◯◯정형외과」로 검색이 안 되고, 「미아동 202-11」 같은 **지번주소**도
엉뚱한 도로명을 물어 온다. 실측으로 확인한 원인은 우리 코드가 아니라 자료다 —
OpenStreetMap 계열(Photon·Nominatim)은 한국 상호 색인이 없고 지번주소를 못 읽는다.
그래서 정류장 8,886곳처럼 **장소 목록을 우리가 들고 있기로** 했다.

원천 (둘 다 공공데이터포털, 우리가 이미 쓰는 DATA_GO_KR_KEY 로 활용신청만 하면 된다)
  · 건강보험심사평가원_병원정보서비스   getHospBasisList   (요양기관명·주소·좌표)
  · 건강보험심사평가원_약국정보서비스   getParmacyBasisList
좌표는 XPos(경도)·YPos(위도) 로 **WGS84 그대로** 온다 — 변환이 필요 없다.

사용
  python pipeline/fetch_poi.py --probe     # 키·승인 상태만 확인
  python pipeline/fetch_poi.py             # 서비스 지역 전부 받아 data/raw/poi/*.json
  python pipeline/fetch_poi.py --sido 110000   # 서울만

승인 전에는 403 이 온다. 그때는 화면에 신청 주소를 찍어 준다 — 사람이 눌러야 하는 일이다.
받은 뒤에는 `python pipeline/build_poi.py` 가 검색용 색인으로 굽는다.
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

OUT_DIR = os.path.join(C.RAW, 'poi')
UA = {'User-Agent': 'seat-map/0.1'}

SERVICES = {
    'hosp': {
        'url': 'http://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList',
        'name': '병의원',
        'apply': 'https://www.data.go.kr/data/15001698/openapi.do',
    },
    'pharm': {
        'url': 'http://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList',
        'name': '약국',
        'apply': 'https://www.data.go.kr/data/15051059/openapi.do',
    },
}


# ★ 상가(상권)정보 — 약국·음식점·학원까지 한 판에 (D-100) ★
# 심평원은 병의원·약국만이다. 사용자가 물은 「음식점 등등」은 소상공인시장진흥공단의
# 상가업소정보가 답이다 — 상호명·업종·지번·도로명·위경도가 한 줄에 다 있다.
# 개발계정은 하루 호출 수가 정해져 있어(대개 1,000회) **한 번에 다 못 받는다.**
# 그래서 ① 업종을 골라 받고 ② 어디까지 받았는지 적어 두고 이어 받는다(state.json).
STORE = {
    'url': 'http://apis.data.go.kr/B553077/api/open/sdsc2/storeListInArea',
    'name': '상가(음식점·약국·학원 등)',
    'apply': 'https://www.data.go.kr/data/15012005/openapi.do',
}
# 업종 대분류 — 사람이 목적지로 삼는 것만. 전부 받으면 서울만 57만 곳이라 하루로는 못 끝낸다.
UPJONG = {
    'S': '의료',        # 병원·의원·약국·한의원
    'Q': '음식',        # 식당·카페
    'R': '학문/교육',   # 학원·교습소
    'P': '스포츠',      # 체육시설
}
SIDO_CTPRVN = {'11': '서울', '41': '경기', '28': '인천',
               '26': '부산', '27': '대구', '29': '광주', '30': '대전'}


def harvest_store(key, sidos, upjongs, day_cap):
    """시도 × 업종대분류로 쪽을 넘기며 받는다. 하루 호출 상한에 닿으면 멈추고 자리를 적는다."""
    st_path = os.path.join(OUT_DIR, 'store_state.json')
    state = {}
    if os.path.exists(st_path):
        try:
            state = json.load(io.open(st_path, encoding='utf-8'))
        except Exception:
            state = {}
    dst = os.path.join(OUT_DIR, 'store.json')
    rows = []
    if os.path.exists(dst):
        try:
            rows = json.load(io.open(dst, encoding='utf-8'))
        except Exception:
            rows = []
    seen = set(str(r.get('bizesId') or '') for r in rows)
    calls = 0
    for sido in sidos:
        for up in upjongs:
            k = sido + ':' + up
            page = int(state.get(k) or 1)
            if page == 0:
                continue                      # 0 = 이 짝은 다 받았다는 표시
            while calls < day_cap:
                doc = call(STORE['url'], key,
                           {'divId': 'ctprvnCd', 'key': sido, 'indsLclsCd': up,
                            'pageNo': page, 'numOfRows': 1000, 'type': 'json'})
                calls += 1
                items, total = rows_of(doc)
                if not items:
                    state[k] = 0
                    break
                for it in items:
                    bid = str(it.get('bizesId') or '')
                    if bid and bid in seen:
                        continue
                    seen.add(bid)
                    rows.append(it)
                C.log('  상가 %s/%s 쪽 %d — 누적 %d / 전체 %d'
                      % (SIDO_CTPRVN.get(sido, sido), UPJONG.get(up, up), page, len(rows), total))
                if page * 1000 >= total:
                    state[k] = 0
                    break
                page += 1
                state[k] = page
            if calls >= day_cap:
                break
        if calls >= day_cap:
            break
    io.open(dst, 'w', encoding='utf-8').write(json.dumps(rows, ensure_ascii=False))
    io.open(st_path, 'w', encoding='utf-8').write(json.dumps(state, ensure_ascii=False))
    left = [k for k, v in state.items() if v]
    C.log('상가 %d건 저장 (호출 %d회)%s' % (len(rows), calls,
          (' — 남은 짝 %d개, 내일 다시 돌리면 이어 받는다' % len(left)) if left else ' — 다 받았다'))


# 서비스 지역의 시도 코드 (심평원 코드계) — 수도권·광역시만 받는다(D-88 의 서비스권과 같다)
SIDO = {
    '110000': '서울', '410000': '경기', '280000': '인천',
    '260000': '부산', '270000': '대구', '290000': '광주', '300000': '대전',
}


def call(url, key, params, tries=3):
    q = {'serviceKey': key, '_type': 'json'}
    q.update(params)
    u = url + '?' + urllib.parse.urlencode(q, safe='%')
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read()
            return json.loads(raw.decode('utf-8', 'replace'))
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def rows_of(doc):
    body = ((doc or {}).get('response') or {}).get('body') or {}
    items = body.get('items') or {}
    if isinstance(items, dict):
        items = items.get('item') or []
    if isinstance(items, dict):
        items = [items]
    return items or [], int(body.get('totalCount') or 0)


def harvest(kind, key, sidos, cap_pages=200):
    svc = SERVICES[kind]
    got, seen = [], set()
    for sido in sidos:
        page = 1
        while page <= cap_pages:
            doc = call(svc['url'], key, {'pageNo': page, 'numOfRows': 1000, 'sidoCd': sido})
            items, total = rows_of(doc)
            if not items:
                break
            for it in items:
                code = str(it.get('ykiho') or it.get('yadmNm') or '') + str(it.get('XPos') or '')
                if code in seen:
                    continue
                seen.add(code)
                got.append(it)
            C.log('  %s %s 쪽 %d — 누적 %d / 전체 %d' % (svc['name'], SIDO.get(sido, sido), page, len(got), total))
            if page * 1000 >= total:
                break
            page += 1
    return got


def main():
    ap = argparse.ArgumentParser(description='상호 검색용 장소 목록 받기')
    ap.add_argument('--probe', action='store_true', help='키·승인 상태만 확인')
    ap.add_argument('--sido', help='시도 코드 하나만 (예: 110000)')
    ap.add_argument('--store', action='store_true', help='상가(음식점·약국·학원 등)만 받는다')
    ap.add_argument('--cap', type=int, default=900, help='한 번에 부를 최대 횟수(개발계정 하루 상한 대비)')
    args = ap.parse_args()

    key = (C.load_keys() or {}).get('DATA_GO_KR_KEY') or os.environ.get('DATA_GO_KR_KEY')
    if not key:
        C.die('keys.json 에 DATA_GO_KR_KEY 가 없다.')
    sidos = [args.sido] if args.sido else list(SIDO.keys())

    if args.store:
        os.makedirs(OUT_DIR, exist_ok=True)
        try:
            harvest_store(key, list(SIDO_CTPRVN.keys()), list(UPJONG.keys()), args.cap)
        except Exception as e:
            C.log('상가 받기 실패 — %s' % str(e)[:70])
            C.log('   활용신청: %s' % STORE['apply'])
        return

    if args.probe:
        try:
            call(STORE['url'], key, {'divId': 'ctprvnCd', 'key': '11', 'pageNo': 1,
                                     'numOfRows': 1, 'type': 'json'}, tries=1)
            C.log('%s: 됨' % STORE['name'])
        except Exception as e:
            C.log('%s: 아직 안 된다 (%s)' % (STORE['name'], str(e)[:40]))
            C.log('   활용신청: %s' % STORE['apply'])
        for kind, svc in SERVICES.items():
            try:
                doc = call(svc['url'], key, {'pageNo': 1, 'numOfRows': 1, 'sidoCd': '110000'}, tries=1)
                items, total = rows_of(doc)
                C.log('%s: 됨 — 전체 %d건' % (svc['name'], total))
            except Exception as e:
                msg = str(e)
                C.log('%s: 아직 안 된다 (%s)' % (svc['name'], msg[:60]))
                C.log('   활용신청: %s  ← 여기서 「활용신청」을 누르면 대개 바로 승인된다' % svc['apply'])
        return

    os.makedirs(OUT_DIR, exist_ok=True)
    for kind, svc in SERVICES.items():
        try:
            rows = harvest(kind, key, sidos)
        except Exception as e:
            C.log('%s 받기 실패 — %s' % (svc['name'], str(e)[:70]))
            C.log('   활용신청: %s' % svc['apply'])
            continue
        dst = os.path.join(OUT_DIR, kind + '.json')
        io.open(dst, 'w', encoding='utf-8').write(json.dumps(rows, ensure_ascii=False))
        C.log('%s %d건 → %s' % (svc['name'], len(rows), dst))
    C.log('다음: python pipeline/build_poi.py')


if __name__ == '__main__':
    main()
