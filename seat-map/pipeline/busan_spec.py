# -*- coding: utf-8 -*-
"""부산 도시철도 제원 — 한 곳에만 적는다 (D-103).

편성·정원·좌석·배차는 **서울과 다르다.** 서울 값을 그대로 쓰면 앉을 확률이 통째로
틀린다 — 부산 전동차는 17.5m 중형이라 한 칸 정원이 118명(서울 대형 160명)이고,
4호선은 9.1m 경전철이라 53명뿐이다. 여기 값을 고치면 파이프라인과 그래프가 함께 따른다.

출처: 부산교통공사 「전동차 현황 및 주요제원」
  https://www.humetro.busan.kr/homepage/chs/page/subLocation.do?menu_no=1001050403
  1호선 8량 편성 · 1량 정원 113~124 · 좌석 35~56 (17,500~17,900mm × 2,750mm)
  2호선 6량 · 3호선 4량 — 같은 중형차, 좌석 39~48
  4호선 6량 · 1량 정원 52~54 · 좌석 18~24 (9,140mm × 2,400mm, K-AGT 경전철)
정원·좌석은 위 범위의 가운데를 쓴다(칸마다 다르다 — 끝칸이 적다).
"""

# 노선 → (편성 량수, 1량 정원, 1량 좌석, 차종 이름)
LINES = {
    '부산 1호선': (8, 118, 44, 'subwayBusan'),
    '부산 2호선': (6, 118, 44, 'subwayBusan'),
    '부산 3호선': (4, 118, 44, 'subwayBusan'),
    '부산 4호선': (6, 53, 21, 'subwayBusanLight'),
}

# 시간당 열차 수. 공표 배차간격에서 환산했다(60 ÷ 배차분).
#   1호선 출근 4분 · 퇴근 4분 30초 · 평시 6분   (나무위키/부산교통공사 공표)
#   2호선 평시 7분 30초 · 4호선 평시 9분 30초   (2026-08 조정, 출퇴근은 유지)
# ★ 이 나누는 수가 두 배 틀리면 앉을 확률이 통째로 뒤집힌다 ★ — 서울 buses 와 같은 교훈.
HEADWAY = {                      # (출근 07~09, 퇴근 17~20, 평시 06~23, 그 밖)
    '부산 1호선': (15.0, 13.3, 10.0, 7.0),
    '부산 2호선': (12.0, 11.0, 8.0, 6.0),
    '부산 3호선': (10.0, 9.0, 7.5, 5.0),
    '부산 4호선': (10.0, 9.0, 6.3, 5.0),
}


def trains_per_hour(line, hour):
    peak, eve, day, night = HEADWAY[line]
    if 7 <= hour < 9: return peak
    if 17 <= hour < 20: return eve
    if 6 <= hour < 23: return day
    return night


def tph_table(line):
    """24칸 표 — routes.json 에 실어 두면 엔진이 그대로 읽는다."""
    return [trains_per_hour(line, h) for h in range(24)]


# ── 모형 상수 (실측으로 정했다 — DECISIONS D-103) ──────────────────────────
DECAY_STOPS = 10.0      # 중력모형 감쇠. 1호선 실측과 상관 0.946 · 기울기 1.01
TRANSFER_PENALTY = 4.0  # 환승 한 번 = 역 4개 값(대기+걷기)
IPF_ITERS = 25

# ── 역 이름 맞추기 ─────────────────────────────────────────────────────────
# 승하차 자료의 이름과 그래프의 이름이 셋 다르다. rstrip 을 쓰면 '부산역'→'부산' 을
# 넘어 '서면'→'서'까지 깎는다(D-48). 표로 못 박는다.
ALIAS = {'부산역': '부산'}


def norm_station(name, graph_names):
    nm = name.strip()
    if nm in graph_names: return nm
    if nm in ALIAS and ALIAS[nm] in graph_names: return ALIAS[nm]
    flat = nm.replace('·', '').replace('(', '').replace(')', '').replace(' ', '')
    for g in graph_names:
        if g.replace('·', '').replace('(', '').replace(')', '').replace(' ', '') == flat:
            return g
    return None
