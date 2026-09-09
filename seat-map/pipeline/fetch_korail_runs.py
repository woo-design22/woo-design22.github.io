# -*- coding: utf-8 -*-
"""코레일 「노선별 여객열차 운행횟수(주중)」 받기 — 광역전철 배차의 원천 ② (D-108).

시간표 API 가 답하지 않는 코레일 노선(경의중앙·수인분당·경춘·경강·동해남부)의 배차는
이 파일의 **전동차(회/일, 왕복)** 열에서 온다. build_rail_congestion.py 가
1호선 하루 모양으로 펴서 시간당 값으로 바꾼다.

한계(알고 쓸 것): 노선 총계라 구간 차이가 없고, 직결 계통(장항선 3회·경원선 28회)은
서울 쪽 구간이 경부선 등에 흡수돼 몇 배 작게 나온다 — 그런 노선은 시간표(①)가 담당한다.

키·로그인 불필요(공공데이터포털 파일데이터). 사용: python pipeline/fetch_korail_runs.py
"""
import csv
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C           # noqa: E402
import fetch_city as FC      # noqa: E402

OUT_DIR = os.path.join(C.RAW, 'korail')
ITEM = {'pk': '15068409', 'uddi': 'uddi:0e2fb282-a30d-4c29-95df-98ae6a3462a0',
        'title': '한국철도공사_노선 구간별 여객열차운행횟수(주중)', 'file': 'runs.csv'}


def parse(path):
    for enc in ('utf-8-sig', 'cp949'):
        try:
            rows = list(csv.reader(io.open(path, encoding=enc)))
            break
        except UnicodeDecodeError:
            continue
    else:
        C.die('runs.csv 인코딩을 못 읽었다')
    head = rows[0]
    try:
        li = head.index('선명')
        ei = [i for i, h in enumerate(head) if '전동차' in h][0]
    except (ValueError, IndexError):
        C.die('열 구성이 바뀌었다: %s' % head)
    out = {}
    for r in rows[1:]:
        if len(r) <= max(li, ei) or not r[li].strip():
            continue
        v = r[ei].strip().replace(',', '')
        if v:
            out[r[li].strip()] = float(v)
    return out


def main():
    C.log('== 코레일 여객열차 운행횟수 받기 ==')
    path = os.path.join(OUT_DIR, ITEM['file'])
    got = FC.download(ITEM, OUT_DIR, min_bytes=300)   # 이 CSV 는 원래 1KB 도 안 된다
    if not got and not os.path.exists(path):
        C.die('받지 못했고 이전 파일도 없다.')
    runs = parse(path)
    C.save_json(os.path.join(OUT_DIR, 'runs.json'), runs)
    C.log('  전동차 운행 있는 선 %d개 → %s' % (len(runs), os.path.join(OUT_DIR, 'runs.json')))
    for k in sorted(runs, key=lambda x: -runs[x]):
        C.log('   %-8s %5.0f회/일' % (k, runs[k]))


if __name__ == '__main__':
    main()
