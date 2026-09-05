# -*- coding: utf-8 -*-
"""T-DATA 「TPSS_재차인원_노선_구간」 **파일판**을 받는다 (D-64).

★ API 가 아니라 파일이 정본이다 ★
같은 자료의 오픈API(TaimsTpssA18RouteSection)는 인증키가 통과돼도 **측정값이 전부 비어 온다** —
최근 날짜는 뼈대(노선·구간 목록)만 오고, 과거는 행 자체가 없다(2021~2026 여덟 시점 실측 확인).
게다가 요청 하나에 3분씩 걸린다. 반면 데이터제공 쪽 파일(data_id=25)은 로그인 없이 받아지고
「재차인원합」이 실제로 차 있다(월 1회 갱신, 최근 이틀치 — 일요일 하나 + 평일 하나).

내려받기 주소의 파일 id 는 갱신 때마다 바뀔 수 있어 상세 페이지에서 그때그때 읽는다.

사용:  python pipeline/fetch_tdata_file.py         # 내려받아 data/raw/tdata/ 에 저장
받은 뒤:  node pipeline/build_tdata_calib.js       # 요일×시간 계수표 갱신
"""
import io
import os
import re
import ssl
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

PAGE = 'https://t-data.seoul.go.kr/dataprovide/trafficdataviewfile.do?data_id=25'
DOWN = 'https://t-data.seoul.go.kr/dataprovide/download.do?id=%s'
OUT_DIR = os.path.join(C.RAW, 'tdata')
OUT = os.path.join(OUT_DIR, 'TPSS_재차인원_노선_구간.csv')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0'


def opener():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE          # 기관 사이트 인증서 사슬이 종종 어긋난다
    op = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    op.addheaders = [('User-Agent', UA), ('Referer', PAGE)]
    return op


def main():
    op = opener()
    html = op.open(PAGE, timeout=90).read().decode('utf-8', 'replace')
    m = re.search(r'<select[^>]*id="filedata_selectbox".*?<option[^>]*value="(\d+)"', html, re.S)
    if not m:
        raise SystemExit('상세 페이지에서 파일 id 를 못 찾았다 — 화면 구조가 바뀌었다')
    fid = m.group(1)
    C.log('파일 id %s — 내려받는 중' % fid)
    os.makedirs(OUT_DIR, exist_ok=True)
    r = op.open(DOWN % fid, timeout=600)
    first = r.read(4096)
    if first[:200].lstrip().lower().startswith(b'<'):
        raise SystemExit('파일 대신 HTML 이 왔다 — 로그인·권한 문제일 수 있다')
    tot = len(first)
    with io.open(OUT, 'wb') as f:
        f.write(first)
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            tot += len(chunk)
    # 머리글 검사 — 형식이 바뀌면 여기서 바로 티가 나야 한다
    head = io.open(OUT, encoding='utf-8-sig', newline='').readline()
    if '재차인원합' not in head:
        raise SystemExit('머리글에 「재차인원합」이 없다 — 파일 형식이 바뀌었다 (열: %s…)' % head[:120])
    C.log('저장 %s바이트 → %s' % (format(tot, ','), OUT))
    C.log('다음: node pipeline/build_tdata_calib.js')


if __name__ == '__main__':
    main()
