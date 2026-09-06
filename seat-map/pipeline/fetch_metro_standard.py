# -*- coding: utf-8 -*-
"""fetch_metro_standard.py — 전국도시철도역사정보 표준데이터(국가철도공단) 내려받기.

수도권 확장(D-85)의 원천이다. **인증키가 필요 없다** — 공공데이터포털 15013205 의
「기관 자체 제공」 링크가 가리키는 KRIC 레일포털에서 직다운로드한다.
받은 파일은 data/raw/open/metro/ 에 두고, build_graph.py 가 1~8호선 밖의
수도권 전철(신분당·분당·경의중앙·경인·9호선·인천·김포…)을 이 파일로 세운다.

사용: python pipeline/fetch_metro_standard.py
"""
import io
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

URL = 'https://data.kric.go.kr/rips/dataset/download.file?type=filedata&id=32&operation=1'
DST_DIR = os.path.join(C.RAW, 'open', 'metro')
UA = {'User-Agent': 'Mozilla/5.0 seat-map/0.1'}


def main():
    os.makedirs(DST_DIR, exist_ok=True)
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r:
        body = r.read()
        cd = r.headers.get('Content-Disposition', '')
    m = re.search(r'filename="?([^";]+)', cd)
    name = m.group(1) if m else '전체_도시철도역사정보.xlsx'
    # 한글 파일명이 라틴1로 오면 되살린다
    try:
        name = name.encode('latin-1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    if not name.endswith('.xlsx'):
        name += '.xlsx'
    dst = os.path.join(DST_DIR, name)
    io.open(dst, 'wb').write(body)
    C.log('받음: %s (%s바이트)' % (dst, format(len(body), ',')))
    if len(body) < 100000:
        C.die('파일이 너무 작다 — 포털 응답이 바뀌었는지 확인할 것')
    # 빠른 검증: 머리글에 역번호·역위도가 있어야 한다
    sheets = C.read_tables(dst)
    head = [str(c) for c in sheets[0][1][0]]
    if '역번호' not in head or '역위도' not in head:
        C.die('머리글이 다르다: %s' % head[:8])
    C.log('검증 통과 — 행 %d개. 다음: python pipeline/build_graph.py' % (len(sheets[0][1]) - 1))


if __name__ == '__main__':
    main()
