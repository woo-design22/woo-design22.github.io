# -*- coding: utf-8 -*-
"""경기도 광역버스 승하차 받기 — 경기데이터드림 파일데이터 (D-109).

「경기도 광역버스 버스노선별 정류장별 시간대별 일자별 승하차 인원」
  https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=96F1E7F440966B9486CB39084852&infSeq=2
열: 사용일자·시간대(24시간제)·업체명·노선번호·정류소ID·정류소번호·정류소명·승차총승객·하차총승객·운행노선수.
서울 버스와 같은 「정류장별 시간대별」 모양이라 같은 OD 모형을 쓸 수 있다 — 경기 자료 중
이 모양을 주는 것은 광역버스뿐이다(정류소별 집계는 하루 총계라 시간대가 없다).

★ 내려받기는 로그인 없이 된다 ★ 버튼이 부르는 주소를 그대로 쓴다:
  GET /portal/data/file/downloadFileData.do?infId=…&infSeq=2&fileSeq=<월별 번호>
  fileSeq 는 2025-01(16562)부터 달마다 1씩 는다. 한 달 400MB 안팎이라 흘려 받는다.
★ 정제 주의 ★ 최신(D-4)은 정제 전 자료다 — 두 달 전(D-45)까지가 정제본이다.

사용: python pipeline/fetch_ggbus.py [--months 2511,2512]
"""
import argparse
import http.cookiejar
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

PAGE = ('https://data.gg.go.kr/portal/data/service/selectServicePage.do'
        '?infId=96F1E7F440966B9486CB39084852&infSeq=2')
BASE = ('https://data.gg.go.kr/portal/data/file/downloadFileData.do'
        '?infId=96F1E7F440966B9486CB39084852&infSeq=2&fileSeq=%d')
SEQ0, YM0 = 16562, (2025, 1)          # fileSeq 16562 = 2025-01, 달마다 +1
OUT_DIR = os.path.join(C.RAW, 'ggbus')
# ★ 헤더도 브라우저 것 그대로 ★ 짧은 UA(seat-map/0.1)로는 다운로드만 500 을 준다(실측 —
# 페이지·목록은 되는데 downloadFileData 만 막힌다). 같은 공개 버튼 흐름의 재현일 뿐이다.
UA = {'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                     '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': PAGE, 'Accept-Language': 'ko-KR,ko;q=0.9'}

# ★ 세 단계를 거쳐야 한다 ★ 주소만 바로 부르면 500 이 온다(실측 — 하나라도 빼면 500).
# 사이트의 다운로드 버튼이 하는 그대로 —
#   ① 상세 페이지 GET (세션 쿠키 GGSESSIONID)
#   ② 파일 목록 AJAX GET (searchFileData.do — 이걸 빼면 ④가 500. 세션에 파일을 등록하는 듯)
#   ③ 이용목적 신고 POST (saveInfUsePurp.do, U01 = 프로그램 개발 — 실제 용도다)
#   ④ 그제서야 downloadFileData.do 가 열린다.
# ★ 몰아 부르면 잠시 문을 닫는다 ★ 같은 IP 에서 세션을 연달아 만들면 멀쩡하던 주소가
# 404·500 을 준다(실측 — 몇 분 지나면 풀린다). 그래서 단계 사이를 띄우고, 막히면
# 40초씩 세 번 쉬었다 다시 간다. 서버를 조르는 게 아니라 기다리는 것이다.
_cj = http.cookiejar.CookieJar()
_op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_cj))


def _open(req, note, timeout=120):
    last = None
    for i in range(4):
        try:
            return _op.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            last = e
            C.log('   %s — HTTP %d, %d초 쉬었다 다시' % (note, e.code, 40 * (i + 1)))
            time.sleep(40 * (i + 1))
    raise last


def warmup():
    import urllib.parse
    _open(urllib.request.Request(PAGE, headers=UA), '페이지').read()
    time.sleep(2)
    ax = dict(UA)
    ax['X-Requested-With'] = 'XMLHttpRequest'
    # AJAX 는 Accept 가 json 이어야 한다 — text/html 로 물으면 같은 주소가 404 를 준다(실측)
    ax['Accept'] = 'application/json, text/javascript, */*; q=0.01'
    _open(urllib.request.Request(
        'https://data.gg.go.kr/portal/data/file/searchFileData.do'
        '?infId=96F1E7F440966B9486CB39084852&infSeq=2', headers=ax), '파일목록').read()
    time.sleep(2)
    body = urllib.parse.urlencode({'infId': '96F1E7F440966B9486CB39084852',
                                   'dsUsePurpsCd': 'U01', 'dsUsePurps': ''}).encode()
    ax['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    _open(urllib.request.Request(
        'https://data.gg.go.kr/portal/data/sheet/saveInfUsePurp.do',
        data=body, headers=ax), '목적신고').read()
    time.sleep(2)


def seq_of(ym):
    y, m = int(ym[:2]) + 2000, int(ym[2:])
    return SEQ0 + (y - YM0[0]) * 12 + (m - YM0[1])


def fetch_month(ym):
    path = os.path.join(OUT_DIR, ym + '.csv')
    if os.path.exists(path) and os.path.getsize(path) > 1e6:
        C.log('  %s — 이미 있다 (%.0fMB)' % (ym, os.path.getsize(path) / 1e6))
        return path
    url = BASE % seq_of(ym)
    r = _open(urllib.request.Request(url, headers=UA), ym + ' 받기', timeout=300)
    cd = r.headers.get('Content-Disposition') or ''
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = path + '.part'
    got = 0
    with open(tmp, 'wb') as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if got % (64 << 20) < (1 << 20):
                C.log('   %s … %.0fMB' % (ym, got / 1e6))
    if got < 1e6:                      # 한 달이 1MB 미만이면 그 달 자료가 없는 것
        os.remove(tmp)
        C.log('  %s — %d바이트뿐(그 달 파일이 없다). 건너뜀 | %s' % (ym, got, cd[:60]))
        return None
    os.replace(tmp, path)
    C.log('  %s → %.0fMB' % (ym, got / 1e6))
    return path


def main():
    ap = argparse.ArgumentParser(description='경기 광역버스 승하차 받기')
    ap.add_argument('--months', default='2511,2512', help='YYMM 쉼표로')
    a = ap.parse_args()
    C.log('== 경기 광역버스 승하차 받기 ==')
    warmup()
    got = [p for p in (fetch_month(ym.strip()) for ym in a.months.split(',')) if p]
    if not got:
        C.die('한 달치도 못 받았다.')
    C.log('== %d달 → %s ==' % (len(got), OUT_DIR))


if __name__ == '__main__':
    main()
