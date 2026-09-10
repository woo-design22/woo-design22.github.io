# -*- coding: utf-8 -*-
"""환승 승차위치 받기 — 서울교통공사 「서울 도시철도 환승정보」 (D-116).

★ 무엇인가 ★ 「어느 칸·어느 문에서 내려야 갈아타는 길이 가장 짧은가」다.
   예) 서울역 1호선 시청 방면에서 4호선으로 갈아타려면 **10호차 4번 문**에서 내리고,
       갈아탄 뒤에는 1호차 1번 문 자리에 서게 된다 — 걸리는 시간 3분 34초.
   네이버·카카오가 「빠른환승 10-4」로 보여주는 바로 그 정보이고, 공공데이터로 열려 있다.

★ 왜 우리에게 중요한가 ★ 이 앱은 **서서 가는 시간**을 줄이는 것이 존재 이유다.
   환승 통로를 덜 걷는 것은 곧 서서 버티는 시간이 주는 것이라 정확히 우리 일이다.
   게다가 주 사용자가 어르신·교통약자다.

키·로그인 불필요(공공데이터포털 파일데이터, 3단계 받기 — D-17 방식).
사용: python pipeline/fetch_transfer.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C       # noqa: E402
import fetch_city as FC  # noqa: E402

ITEM = {'pk': '15098252', 'uddi': 'uddi:b77326ab-5f86-48a1-bd0f-c72a1fd87e21',
        'title': '서울교통공사_서울 도시철도 환승정보', 'file': 'transfer.csv'}
OUT_DIR = os.path.join(C.RAW, 'seoulrail')


def main():
    C.log('== 환승 승차위치 받기 ==')
    p = FC.download(ITEM, OUT_DIR, min_bytes=2000)
    if not p and not os.path.exists(os.path.join(OUT_DIR, ITEM['file'])):
        C.die('받지 못했고 이전 파일도 없다.')
    C.log('== %s ==' % os.path.join(OUT_DIR, ITEM['file']))


if __name__ == '__main__':
    main()
