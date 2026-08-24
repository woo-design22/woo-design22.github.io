# -*- coding: utf-8 -*-
"""참가격(가제) 데이터 수집기.

공공 사이트의 화면이 쓰는 JSON/HTML 호출을 그대로 써서 데이터를 모은다. 파일 다운로드(엑셀 등)는 하지 않는다.

  1) 한국소비자원 참가격 · 결혼서비스
     - 지역별 가격 분위 (areaCompareDetail.do, 단위 만 원, 하위10%·25%·중간·상위25%·10%·평균)
     - 지역별 평균 계약금액 + 기준월 (areaStatistic.do)
     - 중요정보 공개 업체 목록 (게시판 0090000121 예식장 / 0090000122 결혼준비대행) — 업체명·주소·연락처·공개일·파일 링크
  2) 보건복지부 e하늘 · 장례식장
     - 시설 목록 (fac_list.ajax) — 기본은 --sido 한 곳(서울특별시), --all 이면 전국
     - 시설별 가격 (price_info.ajax) — 시설사용료·서비스 항목·장례용품 + 관내/전국 평균
     - 전국 평균 벤치마크 (응답에 포함된 avgPriceAll을 품종별로 모음)

출력: data/wedding_stats.json, data/wedding_businesses.json, data/funeral_facilities.json,
      data/funeral_benchmarks.json, data/meta.json
--inject 를 주면 index.html 의 <script id="ep-data" type="application/json"> 블록을 교체한다.

주의
  - price.go.kr 은 인증서 체인이 불완전해 이 호스트만 TLS 검증을 끈다.
  - e하늘 저작권정책: 수익 목적 이용은 보건복지부 사전 허락 필요. 이 스크립트는 시제품용이며 출처를 meta.json 에 남긴다.
  - 대표자 성명 같은 개인정보는 저장하지 않는다.

사용:  python build_data.py [--sido 서울특별시] [--all] [--skip-wedding] [--skip-stats] [--skip-biz] [--skip-funeral] [--no-inject]
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
from html.parser import HTMLParser

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
      '  chamgagyeok-prototype/0.1')  # 사이트 방화벽이 비브라우저 UA를 끊어서 브라우저형 UA에 식별자만 덧붙인다
PAUSE = 0.25  # 요청 간격(초)

PRICE_BASE = 'https://www.price.go.kr'
EHANEUL_BASE = 'https://www.15774129.go.kr'

# ---------------------------------------------------------------- 참가격 결혼서비스 상수
REGIONS = [('SG', '서울(강남)'), ('SO', '서울(강남외)'), ('BS', '부산'), ('DG', '대구'), ('IC', '인천'),
           ('GJ', '광주'), ('DJ', '대전'), ('US', '울산'), ('GG', '경기도'), ('GW', '강원도'),
           ('CC', '충청도'), ('JL', '전라도'), ('GS', '경상도'), ('JJ', '제주도')]

# (카테고리, 필수/선택) → [(품목코드, 품목명)] — areaCompare.do 화면의 체크박스 값 그대로
ITEMS = {
    ('hall', 'essential'): [(14, '대관비용'), (15, '기본 장식비'), (18, '1인당 식대(대인)'), (22, '기본식대(총금액)')],
    ('hall', 'optional'): [(22, '생화꽃장식'), (26, '축가/축하공연'), (30, '본식 사회자'), (34, '본식 도우미'), (38, '주례비'),
                           (42, '폐백 음식'), (46, '폐백 수모비'), (50, '혼주 헤어/메이크업'), (54, '부케'), (58, '본식 촬영 비용'),
                           (62, '본식 원판 구매'), (66, '플라워 샤워'), (70, '축주비'), (74, '포토테이블'), (78, '한복대여'),
                           (82, '웨딩케이크'), (86, '본식드레스도우미')],
    ('studio', 'essential'): [(10, '기본가격')],
    ('studio', 'optional'): [(10, '앨범페이지 추가'), (14, '드레스 추가'), (18, '드레스 외 의상 추가'), (22, '수정비용'), (26, '액자변경'),
                             (30, '촬영시간 추가'), (34, '선수정본'), (38, '컨펌비'), (42, '담당자 지정'), (46, '야외촬영'),
                             (50, '야간촬영'), (54, '촬영 출장비'), (58, '서브 스냅'), (62, '소품 활용'), (66, '들러리 촬영'),
                             (70, '반려동물 촬영'), (74, '원본구매비'), (78, '수정본구매비'), (82, '모바일 사진 제공'), (86, '얼리스타트비')],
    ('dress', 'essential'): [(10, '(본식+촬영)기본가격'), (15, '(본식)기본가격'), (20, '(촬영)기본가격')],
    ('dress', 'optional'): [(10, '헬퍼(촬영)'), (14, '헬퍼(본식)'), (18, '기본 피팅비'), (22, '추가 피팅비'), (26, '재가봉비'),
                            (30, '가봉스냅'), (34, '드레스 지정비'), (38, '디자인 추가'), (42, '웨딩슈즈 대여'), (46, '2부 드레스'),
                            (50, '퍼스트웨어'), (54, '야외 예식'), (58, '턱시도 대여'), (62, '액세서리 대여')],
    ('makeup', 'essential'): [(10, '(원장)기본가격'), (15, '(부원장)기본가격'), (20, '(실장)기본가격')],
    ('makeup', 'optional'): [(10, '담당자 지정'), (14, '촬영 출장비'), (18, '휴무일 진행비'), (22, '신랑 메이크업'), (26, '신랑헤어'),
                             (30, '신부 커트'), (34, '가발'), (38, '흑채'), (42, '헤어변형'), (46, '헤어피스 구매'),
                             (50, '헤어피스 보증금'), (54, '헤어피스 시술'), (58, '남성혼주 헤어&메이크업'), (62, '여성혼주 헤어&메이크업'),
                             (66, '레이트 스타트비'), (76, '얼리스타트비')],
}
CAT_PARAM = {'hall': 'WeddingHall', 'studio': 'Studio', 'dress': 'Dress', 'makeup': 'Makeup'}
CAT_RESP = {'hall': 'weddingHall', 'studio': 'studio', 'dress': 'dress', 'makeup': 'makeup'}
RANGES = [(1, 'p10'), (2, 'p25'), (3, 'median'), (4, 'p75'), (5, 'p90'), (6, 'mean')]
BOARDS = [('0090000121', 'hall', '예식장'), ('0090000122', 'planner', '결혼준비대행')]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


for _stream in (sys.stdout, sys.stderr):  # 윈도우 콘솔 한글 깨짐 방지
    try:
        _stream.reconfigure(encoding='utf-8')
    except Exception:
        pass


def session():
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'ko', 'Accept': 'application/json, text/javascript, text/html, */*; q=0.01'})
    return s


def warm_up(s, url, verify=True):
    """화면을 한 번 열어 세션 쿠키(JSESSIONID)를 받는다. 없으면 AJAX 호출이 응답하지 않는다."""
    s.get(url, timeout=30, verify=verify)
    s.headers['Referer'] = url
    s.headers['Origin'] = url.split('/tprice')[0].split('/portal')[0]


def post(s, url, data, verify=True, json_resp=False, timeout=30):
    time.sleep(PAUSE)
    for attempt in range(3):
        try:
            r = s.post(url, data=data, timeout=timeout, verify=verify,
                       headers={'X-Requested-With': 'XMLHttpRequest'})
            r.raise_for_status()
            return r.json() if json_resp else r.text
        except Exception as e:  # 재시도
            log('  재시도', attempt + 1, url, type(e).__name__)
            time.sleep(1.5)
    raise RuntimeError('요청 실패: ' + url)


def get(s, url, verify=True):
    time.sleep(PAUSE)
    for attempt in range(3):
        try:
            r = s.get(url, timeout=30, verify=verify)
            r.raise_for_status()
            return r.text
        except Exception as e:
            log('  재시도', attempt + 1, url, type(e).__name__)
            time.sleep(1.5)
    raise RuntimeError('요청 실패: ' + url)


# ---------------------------------------------------------------- 참가격: 지역별 가격 분위
def fetch_wedding_stats(s):
    """stats[cat][kind][item][region] = {p10, p25, median, p75, p90, mean} (만 원, 0은 자료 없음)"""
    # 서버가 품목×지역 조합당 약 1초를 쓰므로 (카테고리, 필수/선택) 단위로 쪼개 요청한다(요청당 10~30초).
    stats = {}
    n = len(REGIONS)
    for rcode, rkey in RANGES:
        for (cat, kind), items in ITEMS.items():
            data = {'selectedAreaList': ','.join(c for c, _ in REGIONS), 'selectedPriceRange': str(rcode)}
            for (c2, k2) in ITEMS:
                data['selected%s%sItemList' % (CAT_PARAM[c2], k2.capitalize())] = ''
            data['selected%s%sItemList' % (CAT_PARAM[cat], kind.capitalize())] = ','.join(str(i) for i, _ in items)
            resp = post(s, PRICE_BASE + '/tprice/portal/wedding/areaCompareDetail.do', data, verify=False, json_resp=True, timeout=240)
            arr = resp.get('%s%sPriceList' % (CAT_RESP[cat], kind.capitalize())) or []
            if len(arr) != len(items) * n:
                log('  경고: 길이 불일치', cat, kind, len(arr), len(items) * n)
            for i, (_, name) in enumerate(items):
                for r, (rc, _) in enumerate(REGIONS):
                    idx = i * n + r
                    val = arr[idx] if idx < len(arr) else None
                    stats.setdefault(cat, {}).setdefault(kind, {}).setdefault(name, {}).setdefault(rc, {})[rkey] = val
            log('  분위 %s %s/%s 완료' % (rkey, cat, kind))
    return stats


def fetch_wedding_overview(s):
    """최신 기준월(YYYYMM), 지역별 평균 계약금액 구성(식대·스드메·대관·장식, 만 원), 전국 중간값 월별 추이."""
    page = get(s, PRICE_BASE + '/tprice/portal/wedding/areaStatistic.do', verify=False)
    months = sorted(set(re.findall(r'value="?(20\d{4})"?', page)))
    latest = months[-1] if months else None
    out = {'latest_month': latest, 'contract': {}, 'trend': None}
    if not latest:
        return out
    sec1 = post(s, PRICE_BASE + '/tprice/portal/wedding/areaStatisticSection1.do', {'scheduleNumber': latest}, verify=False, json_resp=True, timeout=120)
    areas = [(a.get('areaId'), a.get('areaName')) for a in sec1.get('areaList') or []]
    for i, (aid, aname) in enumerate(areas):
        def pick(key):
            arr = sec1.get(key) or []
            return round(float(arr[i]), 1) if i < len(arr) and arr[i] is not None else None
        out['contract'][aid] = {'name': aname, 'meal': pick('areaMealSumList'), 'sdm': pick('areaSdmSumList'),
                                'rental': pick('areaRentalSumList'), 'deco': pick('areaDecoSumList')}
    out['contract_total'] = {k: round(float(sec1.get(k) or 0), 1) for k in ('totalMeal', 'totalSDM', 'totalRental', 'totalDeco')}
    sec2 = post(s, PRICE_BASE + '/tprice/portal/wedding/areaStatisticSection2.do', {'scheduleNumber': latest}, verify=False, json_resp=True, timeout=120)
    hall = sec2.get('monthAreaMidianPercentileList') or []
    sdm = sec2.get('monthAreaSdmMidianPercentileList') or []
    # 추이 배열은 최신 달이 마지막. 달 라벨은 latest 에서 거꾸로 센다.
    y, m = int(latest[:4]), int(latest[4:])
    labels = []
    for k in range(len(hall)):
        mm = m - (len(hall) - 1 - k)
        yy = y
        while mm <= 0:
            mm += 12
            yy -= 1
        labels.append('%04d%02d' % (yy, mm))
    out['trend'] = {'months': labels, 'hall_median': hall, 'sdm_median': sdm}
    return out


# ---------------------------------------------------------------- 참가격: 중요정보 공개 업체
class _RowText(HTMLParser):
    """<tr> 단위로 텍스트와 링크를 모은다."""

    def __init__(self):
        super().__init__()
        self.rows, self._cur, self._links, self._in_tr = [], [], [], False

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self._in_tr, self._cur, self._links = True, [], []
        if tag == 'a' and self._in_tr:
            href = dict(attrs).get('href') or ''
            if 'file_down' in href:
                self._links.append(href)
        if tag == 'br' and self._in_tr:
            self._cur.append('\n')

    def handle_endtag(self, tag):
        if tag == 'tr' and self._in_tr:
            self.rows.append((''.join(self._cur), list(self._links)))
            self._in_tr = False

    def handle_data(self, data):
        if self._in_tr:
            self._cur.append(data)


def _field(text, label):
    m = re.search(label + r'\s*[:：]\s*([^\n•]+)', text)
    return m.group(1).strip() if m else ''


def fetch_wedding_businesses(s):
    out = []
    for code, kind, kind_name in BOARDS:
        seqs = {}
        for page in (1, 2, 3):
            lst = post(s, PRICE_BASE + '/tprice/portal/board/boardInfoMgr.do?boardTypeCode=%s&pageNo=%d' % (code, page),
                       {'boardTypeCode': code, 'pageNo': str(page)}, verify=False)
            for m in re.finditer(r"fn_goReadView\('(\d+)'\);[^>]*>\s*([^<]+?)\s*<", lst):
                seqs[m.group(1)] = html.unescape(m.group(2)).strip()
        for seq, title in sorted(seqs.items()):
            if '공지' in title:
                continue
            rm = re.match(r'\[([^\]]+)\]', title)
            region = rm.group(1) if rm else ''
            body = get(s, PRICE_BASE + '/tprice/portal/board/BoardReadView.do?boardTypeCode=%s&boardSeq=%s' % (code, seq), verify=False)
            p = _RowText()
            p.feed(body)
            n = 0
            for text, links in p.rows:
                if '업체명' not in text:
                    continue
                name = _field(text, '업체명')
                if not name:
                    continue
                out.append({
                    'kind': kind, 'kind_name': kind_name, 'region': region, 'name': name,
                    'addr': _field(text, '주소'), 'tel': _field(text, '연락처'), 'date': _field(text, '자료공개일'),
                    'file': (PRICE_BASE + links[0]) if links and links[0].startswith('/') else (links[0] if links else ''),
                    'source': PRICE_BASE + '/tprice/portal/board/BoardReadView.do?boardTypeCode=%s&boardSeq=%s' % (code, seq),
                })
                n += 1
            log('  %s %s: %d곳' % (kind_name, region, n))
    return out


# ---------------------------------------------------------------- e하늘: 장례식장
def fetch_sido(s):
    j = post(s, EHANEUL_BASE + '/common/common/sido_list.ajax', {}, json_resp=True)
    return [(x['govcd'], x['govnm']) for x in j.get('sidoList', [])]


def fetch_facility_list(s, sidocd):
    rows, page = [], 1
    while True:
        j = post(s, EHANEUL_BASE + '/portal/fnlfac/fac_list.ajax',
                 {'pageInqCnt': '100', 'curPageNo': str(page), 'sidocd': sidocd, 'gungucd': '', 'companyname': '',
                  'facilitygroupcd': 'TBC0700001', 'publiccode': ''}, json_resp=True)
        lst = j.get('list') or []
        rows.extend(lst)
        total = int(j.get('cnt') or 0)
        if not lst or len(rows) >= total:
            break
        page += 1
    return rows


def _cnt(txt):
    m = re.search(r'(\d+)', txt or '')
    return int(m.group(1)) if m else None


def _items(arr, group, name_key, content_key):
    out = []
    for it in arr or []:
        out.append({
            'g': group, 't1': it.get('tier1Nm') or '', 't2': it.get('tier2Nm') or '',
            'n': (it.get(name_key) or '').strip(), 'c': (it.get(content_key) or '').strip(),
            'p': it.get('facilityamt') if 'facilityamt' in it else it.get('commamt'),
            'ai': it.get('avgPriceIn'), 'aa': it.get('avgPriceAll'), 'na': _cnt(it.get('avgFacilityCntAll')),
            'sale': it.get('sale') == 'Y',
        })
    return out


def fetch_facility_price(s, row, benchmarks):
    j = post(s, EHANEUL_BASE + '/portal/fnlfac/price_info.ajax',
             {'facilitycd': row['facilitycd'], 'sanbundiv': row.get('sanbundiv') or 'N'}, json_resp=True)
    d = j.get('detail') or {}
    items = (_items(j.get('hallRent'), '시설', 'item', 'rentcontent')
             + _items(j.get('commission'), '서비스', 'item', 'servcontent')
             + _items(j.get('funeralItem'), '용품', 'commodity', 'etcinfo'))
    for it in items:
        if it['aa'] and it['t1']:
            key = '%s|%s|%s' % (it['g'], it['t1'], it['t2'])
            b = benchmarks.setdefault(key, {'g': it['g'], 't1': it['t1'], 't2': it['t2'], 'avg_all': it['aa'], 'n_all': it['na']})
            b['avg_all'], b['n_all'] = it['aa'], it['na']
    pk = []
    for p in j.get('packageList') or []:
        pk.append({'name': p.get('packagename') or p.get('packagenm') or '', 'price': p.get('saleamt') or p.get('saleprice'),
                   'list_price': p.get('normalamt') or p.get('normalprice'), 'raw': {k: v for k, v in p.items() if isinstance(v, (int, str)) and k not in ('facilitycd',)}})
    return {
        'id': row['facilitycd'], 'name': d.get('companyname') or row.get('companyname'),
        'addr': d.get('fulladdress') or row.get('fulladdress'), 'tel': d.get('telephone') or row.get('telephone'),
        'homepage': d.get('homepage') or '', 'sido': (row.get('sidonm') or '').split(' ')[0], 'gungu': d.get('orgidnm') or row.get('orgidnm'),
        'public': (row.get('publiccode') == 'TCM0100001'), 'mgmt': d.get('manageclassdiv') or '', 'kind': d.get('funeraltypecd') or '',
        'rooms': d.get('mortuaycnt'), 'morgue': d.get('charnelabilitycnt'), 'parking': d.get('parkcnt'),
        'cases_year': d.get('yDeadCnt'), 'cases_month': d.get('mDeadCnt'),
        'price_date': (d.get('priceitemdate') or row.get('lastUpdateDate') or '').replace('/', '-'),
        'bizno': d.get('companyno') or '', 'lat': row.get('latitude'), 'lng': row.get('longitude'),
        'packages': pk, 'items': items,
        'source': EHANEUL_BASE + '/portal/esky/fnlfac/fac_view.do?menuId=M0001000100000000 (POST facilitycd=%s)' % row['facilitycd'],
    }


def fetch_funeral(s, sido_name, all_sido):
    sidos = fetch_sido(s)
    targets = sidos if all_sido else [x for x in sidos if x[1] == sido_name]
    if not targets:
        raise SystemExit('시도를 찾지 못함: %s (가능: %s)' % (sido_name, ', '.join(n for _, n in sidos)))
    benchmarks, facilities = {}, []
    for cd, nm in targets:
        rows = fetch_facility_list(s, cd)
        log('  %s 장례식장 %d곳' % (nm, len(rows)))
        for i, row in enumerate(rows):
            try:
                facilities.append(fetch_facility_price(s, row, benchmarks))
            except Exception as e:
                log('  실패', row.get('companyname'), type(e).__name__, e)
            if (i + 1) % 10 == 0:
                log('   ... %d/%d' % (i + 1, len(rows)))
    return facilities, sorted(benchmarks.values(), key=lambda b: (b['g'], b['t1'], b['t2']))


# ---------------------------------------------------------------- 저장·주입
def save(name, obj):
    path = os.path.join(DATA, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    log('  저장', name, '%.0f KB' % (os.path.getsize(path) / 1024))


def load(name):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def inject(payload):
    path = os.path.join(HERE, 'index.html')
    if not os.path.exists(path):
        log('index.html 없음 — 주입 생략')
        return
    with open(path, encoding='utf-8') as f:
        src = f.read()
    blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    new, n = re.subn(r'(<script id="ep-data" type="application/json">)[\s\S]*?(</script>)',
                     lambda m: m.group(1) + '\n' + blob + '\n' + m.group(2), src, count=1)
    if n != 1:
        log('index.html 에 ep-data 블록이 없음 — 주입 생략')
        return
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    log('  index.html 주입 완료 (%.0f KB)' % (len(blob.encode('utf-8')) / 1024))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sido', default='서울특별시', help='e하늘 수집 시도명 (기본 서울특별시)')
    ap.add_argument('--all', action='store_true', help='e하늘 전국 수집 (허락 협의 후 사용)')
    ap.add_argument('--skip-wedding', action='store_true')
    ap.add_argument('--skip-stats', action='store_true', help='결혼 가격 분위는 기존 data/wedding_stats.json 재사용 (약 10분 절약)')
    ap.add_argument('--skip-biz', action='store_true', help='공개 업체 목록은 기존 파일 재사용')
    ap.add_argument('--skip-funeral', action='store_true')
    ap.add_argument('--no-inject', action='store_true')
    args = ap.parse_args()

    os.makedirs(DATA, exist_ok=True)
    s = session()
    today = dt.date.today().isoformat()
    meta = load('meta.json') or {}

    if not args.skip_wedding:
        warm_up(s, PRICE_BASE + '/tprice/portal/wedding/areaCompare.do', verify=False)
        prev = load('wedding_stats.json')
        if args.skip_stats and prev and prev.get('stats'):
            stats = prev['stats']
            log('[참가격] 가격 분위 재사용')
        else:
            log('[참가격] 결혼서비스 가격 분위')
            stats = fetch_wedding_stats(s)
        log('[참가격] 지역별 평균 계약금액')
        ov = fetch_wedding_overview(s)
        save('wedding_stats.json', {'regions': REGIONS, 'items': {'%s/%s' % k: v for k, v in ITEMS.items()},
                                    'stats': stats, 'contract': ov['contract'], 'contract_total': ov.get('contract_total'),
                                    'trend': ov['trend'], 'latest_month': ov['latest_month']})
        if args.skip_biz and load('wedding_businesses.json') is not None:
            biz = load('wedding_businesses.json')
            log('[참가격] 업체 목록 재사용 (%d곳)' % len(biz))
        else:
            log('[참가격] 중요정보 공개 업체 목록')
            biz = fetch_wedding_businesses(s)
            save('wedding_businesses.json', biz)
        meta['wedding'] = {'collected': today, 'latest_month': ov['latest_month'], 'businesses': len(biz),
                           'source': [PRICE_BASE + '/tprice/portal/wedding/areaCompare.do',
                                      PRICE_BASE + '/tprice/portal/board/boardInfoMgr.do?boardTypeCode=0090000121',
                                      PRICE_BASE + '/tprice/portal/board/boardInfoMgr.do?boardTypeCode=0090000122']}

    if not args.skip_funeral:
        warm_up(s, EHANEUL_BASE + '/portal/esky/fnlfac/fac_list.do?menuId=M0001000100000000')
        log('[e하늘] 장례식장 (%s)' % ('전국' if args.all else args.sido))
        facilities, benchmarks = fetch_funeral(s, args.sido, args.all)
        save('funeral_facilities.json', facilities)
        save('funeral_benchmarks.json', benchmarks)
        meta['funeral'] = {'collected': today, 'scope': '전국' if args.all else args.sido, 'facilities': len(facilities),
                           'source': EHANEUL_BASE + '/portal/esky/fnlfac/fac_list.do?menuId=M0001000100000000',
                           'license': 'e하늘 저작권정책: 수익 목적 이용 시 보건복지부 사전 허락 필요'}

    save('meta.json', meta)

    if not args.no_inject:
        payload = {'meta': meta,
                   'wedding': load('wedding_stats.json'), 'wedding_businesses': load('wedding_businesses.json'),
                   'funeral': load('funeral_facilities.json'), 'funeral_benchmarks': load('funeral_benchmarks.json')}
        inject(payload)


if __name__ == '__main__':
    main()
