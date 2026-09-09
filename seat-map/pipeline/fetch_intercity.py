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
              'id': 'nodeid', 'nm': 'nodename', 'ahead': 7,
              'apply': 'https://www.data.go.kr/data/15098552/openapi.do'},
    'express': {'path': 'ExpBusInfo', 'name': '고속버스',
                'list': 'GetExpBusTrminlList', 'find': 'GetStrtpntAlocFndExpbusInfo',
                'dep': 'depTerminalId', 'arr': 'arrTerminalId',
                'id': 'terminalId', 'nm': 'terminalNm', 'ahead': 2,
                'apply': 'https://www.data.go.kr/data/15098522/openapi.do'},
    'suburb': {'path': 'SuburbsBusInfo', 'name': '시외버스',
               'list': 'GetSuberbsBusTrminlList', 'find': 'GetStrtpntAlocFndSuberbsBusInfo',
               'dep': 'depTerminalId', 'arr': 'arrTerminalId',
               'id': 'terminalId', 'nm': 'terminalNm', 'ahead': 2,
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


# ★ 수서역에서 떠나는 고속열차는 SRT 다 ★
# 이 API 는 SR(수서고속철도)의 열차를 **차량 형식명(KTX·KTX-산천)으로 표기**해 준다.
# 실측: 등급코드 17(SRT)로 물으면 0편인데, 수서→부산을 등급 없이 물으면 34편이
# 「KTX·KTX-산천·KTX-산천(A-type)」으로 나온다. 수서역은 SRT 전용역이라
# 코레일 KTX 가 들어오지 않으므로, 그 편들은 SRT 다.
# 이름을 그대로 두면 화면이 「KTX 수서→부산」이라고 거짓말을 하고, 등급이 겹쳐
# 아래 「새 등급만 담는다」 규칙에 걸려 통째로 빠진다. 그래서 여기서 바로잡는다.
SRT_STATIONS = {'수서'}


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


def places(k, mode, code, city):
    """그 도시의 역·터미널 후보.

    ★ 수단마다 목록 부르는 법이 다르다 ★ (실측으로 확인)
      · 열차·시외버스 — `cityCode` 가 먹는다
      · 고속버스     — **cityCode 를 무시하고 전국 453곳을 준다.** 그래서 도시 이름으로
                       검색해야 한다(`terminalNm`). 안 그러면 목록 앞머리의 「병점역」이
                       서울 대표로 잡힌다 — 실제로 그렇게 잡혀 조회가 통째로 0이 됐다.
    이름 정렬은 어림일 뿐이고, **어느 조합이 맞는지는 편수가 말한다**(harvest 참고).
    """
    m = MODES[mode]
    if mode == 'express':
        got = items(call(k, m['path'], m['list'], terminalNm=city))
    else:
        got = items(call(k, m['path'], m['list'], cityCode=code))
    out, seen = [], set()
    for x in got:
        pid, nm = x.get(m['id']), str(x.get(m['nm']) or '').strip()
        if not pid or not nm or nm in seen:
            continue
        seen.add(nm)
        out.append({'id': str(pid), 'name': nm})

    def rank(p):
        n = p['name']
        # 도시 이름으로 시작하는 큰 곳이 먼저, 그 다음 짧은 이름.
        # 버스에서 「◯◯역」은 터미널이 아니라 경유 정류소인 경우가 많아 뒤로 민다.
        return (0 if n.startswith(city) or n == city else 1,
                1 if (mode != 'train' and n.endswith('역')) else 0,
                len(n))
    out.sort(key=rank)
    return out


def pick_date(mode, given):
    """수단마다 **볼 수 있는 날이 다르다** (실측).
       열차는 일주일 뒤도 나오는데 **고속·시외버스는 이틀 뒤까지만** 나온다(사흘 뒤면 0편).
       그래서 한 날짜로 다 받으면 버스가 통째로 비어 버린다 — 실제로 그렇게 비었다.
       평일을 대표로 삼되, 그 범위 안에 평일이 없으면 있는 날을 쓴다."""
    if given:
        return given
    import datetime
    ahead = MODES[mode].get('ahead', 7)
    today = datetime.date.today()
    cands = [today + datetime.timedelta(days=d) for d in range(1, ahead + 1)] + [today]
    for d in cands:
        if d.weekday() < 5:
            return d.strftime('%Y%m%d')
    return cands[0].strftime('%Y%m%d')


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


def harvest(k, given_date):
    os.makedirs(OUT_DIR, exist_ok=True)
    for mode, m in MODES.items():
        date = pick_date(mode, given_date)
        C.log(' %s (기준일 %s)' % (m['name'], date))
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
                # 열차는 후보를 넉넉히 본다 — 수서(SRT)·용산·광명처럼 도시 이름이 안 들어간
                # 역이 있어서, 셋만 보면 그 역에서만 다니는 등급이 통째로 빠진다.
                spots[city] = places(k, mode, code, city)[:(5 if mode == 'train' else 3)]
            except Exception as e:
                C.log('  %s 목록 실패 — %s' % (city, str(e)[:50]))
        doc = {'mode': mode, 'name': m['name'], 'date': date,
               'places': spots, 'runs': []}
        pairs = 0
        for a in CITIES:
            for b in CITIES:
                if a == b or a not in spots or b not in spots:
                    continue
                # ★ 첫 조합에서 멈추면 안 된다 ★ 처음엔 「편성이 나오는 첫 조합」을 썼더니
                # 서울→부산이 **구포** 경유 27편으로 잡혔다(부산역 본선이 아니라 지선이다).
                # 후보를 다 돌려 **편수가 가장 많은 조합**을 먼저 고른다.
                #
                # ★ 그런데 하나만 고르면 SRT 가 사라진다 ★ SRT 는 서울역이 아니라 **수서역**에서
                # 떠나므로, 편수가 가장 많은 조합(서울역)만 남기면 통째로 빠진다.
                # 그래서 **새 등급을 물어오는 조합은 함께 담는다** — 같은 등급만 있으면 버린다.
                combos = []
                for pa in spots[a]:
                    for pb in spots[b]:
                        try:
                            got = items(call(k, m['path'], m['find'], depPlandTime=date,
                                             **{m['dep']: pa['id'], m['arr']: pb['id']}))
                        except Exception:
                            got = []
                        if got:
                            if mode == 'train' and (pa['name'] in SRT_STATIONS
                                                    or pb['name'] in SRT_STATIONS):
                                for it in got:
                                    it['traingradename'] = 'SRT'
                            combos.append((pa, pb, got))
                pairs += 1
                if not combos:
                    continue
                combos.sort(key=lambda c: -len(c[2]))
                seen = set()
                for pa, pb, got in combos:
                    grades = set(str(it.get('traingradename') or it.get('gradeNm') or '').strip()
                                 for it in got)
                    if seen and not (grades - seen):
                        continue                      # 이미 담은 등급뿐이면 건너뛴다
                    seen |= grades
                    doc['runs'].append({'from': a, 'to': b,
                                        'fromPlace': pa['name'], 'toPlace': pb['name'],
                                        'items': got})
                    C.log('  %s → %s : %d편 (%s → %s) %s'
                          % (a, b, len(got), pa['name'], pb['name'], '·'.join(sorted(grades))[:40]))
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
    C.log('== 도시 간 이동 받기 ==')
    if not probe(k):
        C.log('  ※ 등록 안 된 서비스는 건너뛴다. 위 주소에서 활용신청 뒤 다시 돌리면 채워진다.')
    harvest(k, a.date)
    C.log('== %s ==' % OUT_DIR)


if __name__ == '__main__':
    main()
