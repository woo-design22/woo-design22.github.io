# -*- coding: utf-8 -*-
"""도시 간 이동 받기 — KTX·새마을·무궁화 / 고속버스 / 시외버스 (D-107).

★ 이 영역에서 우리가 답할 질문은 다르다 ★
이 셋은 **전 좌석 지정석**이다. 표를 끊었으면 앉고, 매진이면 못 탄다 — 「앉을 확률」을
예측할 것이 없다. 그래서 받는 것도 혼잡도가 아니라 **언제·얼마나 걸려·얼마에 갈 수 있나**다:
편수 · 소요시간 · 등급(우등/프리미엄) · 요금 · 첫차·막차.
화면은 확률 대신 「지정석입니다 — 예매하면 앉아 갑니다(매진이면 탈 수 없습니다)」로 답한다.

★ 서비스마다 활용신청이 따로다 ★
같은 국토교통부(1613000) 안에서도 서비스별로 키를 등록해야 한다. 등록 안 된 서비스는
403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 를 준다(주소가 틀리면 400 `NO_OPENAPI_SERVICE_ERROR`
라 서로 구분된다). `--probe` 가 어느 쪽인지 말해 준다.
  · 열차     https://www.data.go.kr/data/15098552/openapi.do
  · 고속버스 https://www.data.go.kr/data/15098522/openapi.do
  · 시외버스 https://www.data.go.kr/data/15098541/openapi.do

★ 왜 도시 쌍을 골라 받나 ★
이 API 는 「출발지-도착지-날짜」로 묻는 조회형이다. 전국 터미널을 다 곱하면 수십만 번이고,
정적 페이지인 우리 앱은 키를 브라우저에 둘 수 없어 실시간 조회도 못 한다. 그래서
**우리가 시내 교통을 가진 도시들**(서울·부산·대구·대전·광주·인천) 사이만 미리 받아 둔다.
도시를 넓히려면 CITIES 에 한 줄 더하면 된다.

사용: python pipeline/fetch_intercity.py --probe        (승인 상태만 본다)
      python pipeline/fetch_intercity.py [--date 20260916]
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

BASE = 'http://apis.data.go.kr/1613000/'
OUT_DIR = os.path.join(C.RAW, 'intercity')

# 우리가 시내 교통을 가진 도시들. cityCode 는 서비스마다 물어서 채운다(도시명으로 맞춘다).
CITIES = ['서울', '부산', '대구', '대전', '광주', '인천']

# 서비스 → (경로, 목록 오퍼레이션, 조회 오퍼레이션, 출발/도착 인자 이름)
MODES = {
    'train': {'path': 'TrainInfo', 'name': '열차',
              'list': 'GetCtyAcctoTrainSttnList', 'find': 'GetStrtpntAlocFndTrainInfo',
              'dep': 'depPlaceId', 'arr': 'arrPlaceId',
              'id': 'nodeid', 'nm': 'nodename',
              'apply': 'https://www.data.go.kr/data/15098552/openapi.do'},
    'express': {'path': 'ExpBusInfo', 'name': '고속버스',
                'list': 'GetExpBusTrminlList', 'find': 'GetStrtpntAlocFndExpbusInfo',
                'dep': 'depTerminalId', 'arr': 'arrTerminalId',
                'id': 'terminalId', 'nm': 'terminalNm',
                'apply': 'https://www.data.go.kr/data/15098522/openapi.do'},
    'suburb': {'path': 'SuburbsBusInfo', 'name': '시외버스',
               'list': 'GetSuberbsBusTrminlList', 'find': 'GetStrtpntAlocFndSuberbsBusInfo',
               'dep': 'depTerminalId', 'arr': 'arrTerminalId',
               'id': 'terminalId', 'nm': 'terminalNm',
               'apply': 'https://www.data.go.kr/data/15098541/openapi.do'},
}


def key():
    try:
        k = json.load(io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                           'keys.json'), encoding='utf-8'))['DATA_GO_KR_KEY']
    except Exception:
        k = os.environ.get('DATA_GO_KR_KEY', '')
    if not k:
        C.die('DATA_GO_KR_KEY 가 없다. pipeline/keys.json 에 넣는다.')
    return urllib.parse.unquote(k)


class NotRegistered(Exception):
    pass


def call(k, path, op, tries=3, **kw):
    p = {'serviceKey': k, '_type': 'json', 'numOfRows': 300, 'pageNo': 1}
    p.update(kw)
    url = BASE + path + '/' + op + '?' + urllib.parse.urlencode(p)
    last = None
    for i in range(tries):
        try:
            raw = urllib.request.urlopen(url, timeout=120).read().decode('utf-8', 'replace')
            return json.loads(raw)
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            if 'NOT_REGISTERED' in body:
                raise NotRegistered(op)
            last = Exception('%d %s' % (e.code, body[:90].replace('\n', ' ')))
        except Exception as e:
            last = e
        time.sleep(1.2 * (i + 1))
    raise last


def items(doc):
    """0개면 items 가 빈 문자열, 1개면 dict, 여럿이면 list 다."""
    b = (doc.get('response') or {}).get('body') or {}
    it = b.get('items')
    if not it or isinstance(it, str):
        return []
    it = it.get('item')
    if not it:
        return []
    return it if isinstance(it, list) else [it]


def city_codes(k, mode):
    out = {}
    for c in items(call(k, MODES[mode]['path'], 'GetCtyCodeList')):
        nm = str(c.get('cityname') or c.get('cityName') or '')
        code = c.get('citycode') or c.get('cityCode')
        for want in CITIES:
            if nm.startswith(want):
                out.setdefault(want, code)
    return out


def places(k, mode, code):
    """그 도시의 역·터미널 목록. 이름이 큰 곳(본역·종합터미널)이 앞에 오게 정렬한다."""
    m = MODES[mode]
    got = items(call(k, m['path'], m['list'], cityCode=code))
    out = []
    for x in got:
        pid, nm = x.get(m['id']), str(x.get(m['nm']) or '').strip()
        if pid and nm:
            out.append({'id': str(pid), 'name': nm})
    def rank(p):
        n = p['name']
        return (0 if ('종합' in n or n.endswith('역')) else 1, len(n))
    out.sort(key=rank)
    return out


def probe(k):
    C.log('== 승인 상태 확인 ==')
    ok = True
    for mode, m in MODES.items():
        try:
            call(k, m['path'], 'GetCtyCodeList', tries=1)
            C.log('  %-8s 된다' % m['name'])
        except NotRegistered:
            ok = False
            C.log('  %-8s ✗ 키가 이 서비스에 등록돼 있지 않다 — 활용신청 한 번이 필요하다' % m['name'])
            C.log('           %s' % m['apply'])
        except Exception as e:
            ok = False
            C.log('  %-8s ✗ %s' % (m['name'], str(e)[:70]))
    return ok


def harvest(k, date):
    os.makedirs(OUT_DIR, exist_ok=True)
    for mode, m in MODES.items():
        C.log(' %s' % m['name'])
        try:
            codes = city_codes(k, mode)
        except NotRegistered:
            C.log('  건너뜀 — 활용신청 필요: %s' % m['apply'])
            continue
        except Exception as e:
            C.log('  건너뜀 — %s' % str(e)[:70])
            continue
        spots = {}
        for city, code in codes.items():
            try:
                spots[city] = places(k, mode, code)[:2]     # 도시마다 큰 곳 두 군데까지
            except Exception as e:
                C.log('  %s 목록 실패 — %s' % (city, str(e)[:50]))
        doc = {'mode': mode, 'name': m['name'], 'date': date,
               'places': spots, 'runs': []}
        pairs = 0
        for a in CITIES:
            for b in CITIES:
                if a == b or a not in spots or b not in spots:
                    continue
                found = None
                for pa in spots[a]:
                    for pb in spots[b]:
                        try:
                            got = items(call(k, m['path'], m['find'], depPlandTime=date,
                                             **{m['dep']: pa['id'], m['arr']: pb['id']}))
                        except Exception:
                            got = []
                        if got:
                            found = (pa, pb, got)
                            break
                    if found:
                        break
                pairs += 1
                if not found:
                    continue
                pa, pb, got = found
                doc['runs'].append({'from': a, 'to': b,
                                    'fromPlace': pa['name'], 'toPlace': pb['name'],
                                    'items': got})
                C.log('  %s → %s : %d편 (%s → %s)' % (a, b, len(got), pa['name'], pb['name']))
        C.save_json(os.path.join(OUT_DIR, mode + '.json'), doc)
        C.log('  %s — 쌍 %d개 중 %d개에 편성이 있다' % (m['name'], pairs, len(doc['runs'])))


def main():
    ap = argparse.ArgumentParser(description='도시 간 열차·고속·시외버스 받기')
    ap.add_argument('--probe', action='store_true', help='승인 상태만 본다')
    ap.add_argument('--date', default=None, help='조회할 날짜 YYYYMMDD (기본: 다음 수요일)')
    a = ap.parse_args()
    k = key()
    if a.probe:
        probe(k)
        return
    date = a.date
    if not date:
        import datetime
        d = datetime.date.today()
        d += datetime.timedelta(days=(2 - d.weekday()) % 7 or 7)   # 다음 수요일(평일 대표)
        date = d.strftime('%Y%m%d')
    C.log('== 도시 간 이동 받기 (기준일 %s) ==' % date)
    if not probe(k):
        C.log('  ※ 등록 안 된 서비스는 건너뛴다. 위 주소에서 활용신청 뒤 다시 돌리면 채워진다.')
    harvest(k, date)
    C.log('== %s ==' % OUT_DIR)


if __name__ == '__main__':
    main()
