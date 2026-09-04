# -*- coding: utf-8 -*-
"""common.py — 「앉을 자리」 수집 파이프라인 공용 도구.

의존성 없음(파이썬 표준 라이브러리만). pip install 이 필요 없어야
어느 컴퓨터에서도 크론에 바로 걸린다.

지켜야 할 것 두 가지
  1. **키를 절대 로그·예외 메시지에 흘리지 않는다.** URL 에 키가 박히는 API 가 많아서
     그냥 찍으면 그대로 샌다. 찍기 전에 mask_url() 을 통과시킨다.
  2. **원천 응답은 손대지 말고 그대로 저장한다.** 파싱은 나중에 다시 할 수 있지만,
     안 받아 둔 날짜는 영영 못 받는다(사양서 4.1 — 역별승하차인원은 최근 1주일치뿐).
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# 윈도우 콘솔 기본 코드페이지(cp949)에서는 한글 로그가 깨진다. 파일은 항상 UTF-8 이므로
# 화면만 맞춰 준다. 못 바꾸는 환경이면 조용히 넘어간다.
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
RAW = os.path.join(DATA, 'raw')
LOGS = os.path.join(DATA, 'logs')
KST = timezone(timedelta(hours=9))


# ── 키 ─────────────────────────────────────────────────────────────────────
def load_keys():
    """pipeline/keys.json → 환경변수 순으로 찾는다. keys.json 은 커밋하지 않는다."""
    keys = {}
    path = os.path.join(ROOT, 'pipeline', 'keys.json')
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            keys.update(json.load(f))
    for name in ('DATA_GO_KR_KEY', 'SEOUL_OPEN_KEY', 'TDATA_KEY'):
        if os.environ.get(name):
            keys[name] = os.environ[name]
    return keys


def require_key(keys, name, how):
    if not keys.get(name):
        raise SystemExit(
            '\n[키 없음] %s 가 필요하다.\n  %s\n'
            '  받은 뒤 pipeline/keys.json 에 넣거나 환경변수로 준다.\n'
            '  (예시는 pipeline/keys.example.json, 신청 절차는 docs/DATA_SOURCES.md)\n' % (name, how)
        )
    return keys[name]


_SECRETS = []


def register_secret(value):
    """이 값이 로그에 나오면 가린다."""
    if value and len(str(value)) >= 8:
        _SECRETS.append(str(value))


def mask_url(url):
    out = str(url)
    for s in _SECRETS:
        out = out.replace(s, '****')
    # 키가 경로에 박히는 열린데이터광장 형태(.../{KEY}/json/...)도 한 번 더 가린다.
    out = re.sub(r'(apikey|serviceKey|KEY)=[^&]+', r'\1=****', out, flags=re.I)
    return out


# ── 로그 ───────────────────────────────────────────────────────────────────
def log(msg):
    os.makedirs(LOGS, exist_ok=True)
    now = datetime.now(KST)
    line = '[%s] %s' % (now.strftime('%Y-%m-%d %H:%M:%S'), mask_url(msg))
    print(line, flush=True)
    with open(os.path.join(LOGS, now.strftime('%Y%m') + '.log'), 'a', encoding='utf-8') as f:
        f.write(line + '\n')


# ── HTTP ───────────────────────────────────────────────────────────────────
def http_get(url, params=None, timeout=30, retries=3, as_json=True):
    """지수 백오프로 재시도한다. 공공 API 는 몰리면 조용히 5xx 를 뱉는다."""
    full = url
    if params:
        full = url + ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, headers={'User-Agent': 'seat-map/0.1 (data collector)'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode('utf-8', 'replace')
            return json.loads(body) if as_json else body
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            wait = 2 ** attempt
            log('  요청 실패(%d/%d) %s — %s초 뒤 재시도' % (attempt + 1, retries, type(e).__name__, wait))
            time.sleep(wait)
    raise RuntimeError('요청이 %d회 모두 실패했다: %s (%s)' % (retries, mask_url(full), last))


# ── 저장 ───────────────────────────────────────────────────────────────────
def save_json(path, obj):
    """임시 파일에 쓴 뒤 바꿔치기한다. 크론이 도중에 죽어도 반쪽 파일이 안 남는다."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, path)
    return path


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def config():
    return load_json(os.path.join(ROOT, 'pipeline', 'config.json'), {})


# ── 날짜·요일 ──────────────────────────────────────────────────────────────
def today_kst():
    return datetime.now(KST).date()


def ymd(d):
    return d.strftime('%Y%m%d')


def parse_ymd(s):
    return datetime.strptime(str(s), '%Y%m%d').date()


# 날짜가 고정된 공휴일(양력). 대체공휴일은 여기서 계산하지 않는다.
FIXED_HOLIDAYS = {(1, 1), (3, 1), (5, 5), (6, 6), (8, 15), (10, 3), (10, 9), (12, 25)}


def load_holidays():
    """음력 명절(설·추석·부처님오신날)과 대체공휴일은 계산하지 않고 표로 받는다.

    표는 data/holidays.json 의 ["YYYYMMDD", ...] 이고,
    collect_subway_daily.py --holidays 가 공공데이터포털 특일정보 API 로 채운다.
    표가 비어 있어도 파이프라인은 돌아간다 — 그 대신 명절이 평일로 섞인다.
    """
    return set(load_json(os.path.join(DATA, 'holidays.json'), []) or [])


def day_type(d, holidays=None):
    """평일 / 토요일 / 일요일·공휴일 (사양서 3.2). 공휴일은 일요일 프로파일로 취급(사양서 4.2)."""
    hol = holidays if holidays is not None else load_holidays()
    if ymd(d) in hol or (d.month, d.day) in FIXED_HOLIDAYS:
        return 'sunday'
    wd = d.weekday()          # 월=0 … 토=5, 일=6
    if wd == 6:
        return 'sunday'
    if wd == 5:
        return 'saturday'
    return 'weekday'


def daterange(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


# ── 분산 역산 (사양서 4.2) ────────────────────────────────────────────────
def _inv_norm(p):
    """표준정규 역함수 (Acklam). engine/seat-model.js 의 invNorm 과 같은 식이다.
    두 곳에서 값이 달라지면 파이프라인이 만든 sd 와 브라우저 계산이 어긋난다."""
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
         1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
         6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
         -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    lo = 0.02425
    import math
    if p <= 0:
        return float('-inf')
    if p >= 1:
        return float('inf')
    if p < lo:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > 1 - lo:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)


def sd_from_mean_max(mean, mx, trips):
    """평균·최대·운행횟수 → 표준편차 추정 (Blom 근사).

    T-DATA 가 평균과 최대를 둘 다 주는 것이 이 프로젝트의 결정적 이점이다.
    평균만 쓰면 「8대 중 3대는 만원」이라는 정보가 통째로 사라진다(사양서 4.2).
    """
    if not trips or trips < 2:
        return 0.0
    z = _inv_norm((trips - 0.375) / (trips + 0.25))
    if not (z > 0):
        return 0.0
    return max(0.0, (float(mx) - float(mean)) / z)


# ── 표 파일 읽기 (csv / xlsx) ─────────────────────────────────────────────
# 열린데이터광장 파일은 분기마다 csv 였다 xlsx 였다 한다(실제로 2025-11 은 csv, 2026-03·06 은 xlsx).
# openpyxl·pandas 를 쓰면 pip 이 필요해지므로 zipfile + ElementTree 로 직접 읽는다.
def read_csv_rows(path):
    """한글 공공데이터는 대개 cp949 다. BOM 붙은 UTF-8 도 있어 순서대로 시도한다."""
    import csv as _csv
    raw = open(path, 'rb').read()
    text = None
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode('cp949', 'replace')
    return [r for r in _csv.reader(io.StringIO(text)) if r]


def _col_index(ref):
    """'AB12' → 27 (0부터). 빈 칸이 생략되므로 열 위치를 글자에서 되찾아야 한다."""
    n = 0
    for ch in ref:
        if ch.isalpha():
            n = n * 26 + (ord(ch.upper()) - 64)
        else:
            break
    return n - 1


def xlsx_sheet_names(path):
    """워크북에 든 시트 이름들. 순서가 sheet1.xml, sheet2.xml … 과 같다고 본다."""
    import zipfile
    with zipfile.ZipFile(path) as z:
        wb = z.read('xl/workbook.xml').decode('utf-8', 'replace')
    return re.findall(r'<sheet[^>]*\bname="([^"]+)"', wb)


def read_xlsx_rows(path, sheet_index=0):
    """xlsx 한 장을 [[셀값...]] 으로. 수식은 계산하지 않고 저장된 값을 읽는다."""
    import zipfile
    import xml.etree.ElementTree as ET
    NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(NS + 'si'):
                shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))
        sheets = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))
        if not sheets:
            raise RuntimeError('시트를 못 찾았다: %s' % path)
        root = ET.fromstring(z.read(sheets[sheet_index]))
        rows = []
        for row in root.iter(NS + 'row'):
            cells = {}
            for c in row.findall(NS + 'c'):
                ref = c.get('r') or ''
                idx = _col_index(ref) if ref else len(cells)
                typ = c.get('t')
                if typ == 'inlineStr':
                    is_el = c.find(NS + 'is')
                    val = ''.join(t.text or '' for t in is_el.iter(NS + 't')) if is_el is not None else ''
                else:
                    v = c.find(NS + 'v')
                    val = v.text if v is not None else ''
                    if typ == 's' and val not in (None, ''):
                        val = shared[int(val)]
                cells[idx] = val if val is not None else ''
            if not cells:
                continue
            width = max(cells) + 1
            rows.append([cells.get(i, '') for i in range(width)])
    return rows


def read_table(path):
    """확장자를 보고 알아서 읽는다. xlsx 는 **첫 장만** — 여러 장이면 read_tables 를 쓴다."""
    return read_xlsx_rows(path) if path.lower().endswith(('.xlsx', '.xlsm')) else read_csv_rows(path)


def read_tables(path):
    """[(장 이름, 행들)] — xlsx 는 모든 장, csv 는 하나.

    혼잡도 xlsx 는 평일·토요일·일요일이 **각각 다른 장**이다(csv 판은 한 장에 다 있었다).
    첫 장만 읽으면 1,671행 중 557행만 들어오고, 그러면 주말 통계가 통째로 사라진 채
    "잘 돌아가는 것처럼" 보인다. 실제로 한 번 그렇게 만들었다.
    """
    if path.lower().endswith(('.xlsx', '.xlsm')):
        names = xlsx_sheet_names(path)
        out = []
        for i, nm in enumerate(names or ['sheet1']):
            try:
                out.append((nm, read_xlsx_rows(path, i)))
            except (IndexError, KeyError):
                break
        return out
    return [(os.path.basename(path), read_csv_rows(path))]


# ── 응답 껍데기 벗기기 ─────────────────────────────────────────────────────
# 세 곳의 JSON 모양이 다 다르다.
#   열린데이터광장  {"CardSubwayTime": {"RESULT": {...}, "row": [...]}}
#   공공데이터포털  {"response": {"header": {...}, "body": {"items": {"item": [...]}}}}
#   T-DATA          문서마다 다르게 적혀 있어 실제 응답을 봐야 안다
# 그래서 모양을 외우지 않고 "딕셔너리들이 든 가장 큰 리스트"를 찾는다.
# 원천 응답은 어차피 통째로 저장하므로, 여기서 틀려도 데이터는 안 잃는다.
def find_rows(obj):
    best = []

    def walk(o):
        nonlocal best
        if isinstance(o, list):
            if o and all(isinstance(x, dict) for x in o):
                if len(o) > len(best):
                    best = o
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)

    walk(obj)
    return best


def find_message(obj):
    """오류 코드·메시지를 찾아 사람이 읽을 한 줄로 만든다."""
    hits = []

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, (str, int)) and re.search(r'(CODE|MESSAGE|resultCode|resultMsg|errMsg)', str(k), re.I):
                    hits.append('%s=%s' % (k, v))
                walk(v)
        elif isinstance(o, list):
            for x in o[:5]:
                walk(x)

    walk(obj)
    return ' '.join(hits[:6])


def die(msg):
    sys.stderr.write(msg.rstrip() + '\n')
    raise SystemExit(1)
