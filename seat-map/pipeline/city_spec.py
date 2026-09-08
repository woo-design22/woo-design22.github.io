# -*- coding: utf-8 -*-
"""서울 밖 도시철도 제원·자료 위치 — 한 곳에만 적는다 (D-103·D-105).

★ 서울 값을 전국에 쓰면 안 된다 ★
서울 대형전동차는 20m·1칸 정원 160·좌석 54다. 지방은 다르다:
  · 중형(17.5~18m) — 부산 1~3호선, 대구 1·2호선, 대전 1호선, 광주 1호선, 인천 1호선
    선두차 정원 113(좌석 42) / 중간차 124(좌석 48) — 편성 량수에 따라 평균이 조금씩 다르다
  · 경전철 — 부산 4호선(9.1m, 53/21), 인천 2호선(17.2m, 103/29)
  · 모노레일 — 대구 3호선(1편성 265명·좌석 89 → 1량 88/30)
출처: 각 교통공사 공표 제원(부산교통공사 「전동차 주요제원」, 인천교통공사 「전동차현황」,
      대전·광주·대구 차량 제원표).

★ 배차는 여기 안 적는다 ★ 공표 문구("평시 6분")는 하루 운행 실적과 안 맞는다.
`build_city_tph.py` 가 **시각표·운행실적에서 직접 세어** data/subway/tph.json 에 넣고,
없을 때만 아래 FALLBACK_TPH 로 물러난다.
"""

# ── 차종 (engine/seat-model.js 의 VEHICLES 와 짝이다 — 한쪽만 고치면 어긋난다) ──
VEHICLES = {
    'subwayBusan': (44, 118),        # 부산 1~3호선 17.5m 중형
    'subwayBusanLight': (21, 53),    # 부산 4호선 K-AGT 경전철
    'subwayMid': (46, 120),          # 18m 중형 — 대구1·2, 대전1, 광주1, 인천1
    'subwayMonorail': (30, 88),      # 대구 3호선 모노레일
    'subwayLightAGT': (29, 103),     # 인천 2호선 경전철
}

# 노선 → (편성 량수, 차종)
LINES = {
    '부산 1호선': (8, 'subwayBusan'),
    '부산 2호선': (6, 'subwayBusan'),
    '부산 3호선': (4, 'subwayBusan'),
    '부산 4호선': (6, 'subwayBusanLight'),
    '대구 1호선': (6, 'subwayMid'),
    '대구 2호선': (6, 'subwayMid'),
    '대구 3호선': (3, 'subwayMonorail'),
    '대전 1호선': (4, 'subwayMid'),
    '광주 1호선': (4, 'subwayMid'),
    '인천지하철 1호선': (8, 'subwayMid'),
    '인천지하철 2호선': (2, 'subwayLightAGT'),
}

# 시각표를 못 셌을 때만 쓰는 어림 (첨두 07~09 · 퇴근 17~20 · 평시 06~23 · 그 밖)
FALLBACK_TPH = (12.0, 11.0, 7.0, 5.0)

# ── 도시별 자료 ────────────────────────────────────────────────────────────
# csv: 승하차 파일 읽는 법. date=날짜 만드는 법, name/kind=칸 번호,
#      first=첫 시간 칸 번호, hours=그 칸들이 뜻하는 시각(순서대로), line=호선 칸(있으면)
CITIES = {
    'busan': {
        'name': '부산',
        'lines': ['부산 1호선', '부산 2호선', '부산 3호선', '부산 4호선'],
        'boarding': {'pk': '3057229', 'uddi': 'uddi:c03e50b4-8f95-4dfe-8b47-a46940ad0cc3',
                     'file': 'busan.csv', 'title': '부산교통공사_시간대별 승하차인원'},
        'extra': [{'pk': '3057438', 'uddi': 'uddi:71266463-db45-4979-8eee-8e451e577805',
                   'file': 'busan_ops.csv', 'title': '부산교통공사_열차운행실적'}],
        'csv': {'date': ('col', 2), 'name': 1, 'kind': 4, 'first': 6,
                'hours': list(range(1, 24)) + [0]},
        'alias': {'부산역': '부산'},
    },
    'daegu': {
        'name': '대구',
        'lines': ['대구 1호선', '대구 2호선', '대구 3호선'],
        'boarding': {'pk': '15002503', 'uddi': 'uddi:8072c061-f86b-437e-b673-9b18b0c58ab2',
                     'file': 'daegu.csv', 'title': '대구교통공사_역별일별시간별승하차인원현황'},
        'extra': [
            {'pk': '15138731', 'uddi': 'uddi:4e79e06e-4fb0-4b9a-9220-df9c6afb2357',
             'file': 'tt_daegu1.csv', 'title': '대구 1호선 열차시각표'},
            {'pk': '15138732', 'uddi': 'uddi:2d37b2e6-37a0-43c2-a98b-a9413bb8ce33',
             'file': 'tt_daegu2.csv', 'title': '대구 2호선 열차시각표'},
            {'pk': '15138734', 'uddi': 'uddi:ee14e4d3-d46a-4dd7-8f23-e402f231ed68',
             'file': 'tt_daegu3.csv', 'title': '대구 3호선 열차시각표'},
        ],
        # 년 칸이 없다(월,일). 자료 제목이 2026년판이라 2026으로 읽는다.
        'csv': {'date': ('md', 0, 1, 2026), 'name': 3, 'kind': 4, 'first': 5,
                'hours': list(range(5, 24))},
        # 역 이름이 바뀐 곳 — 승하차 자료는 옛 이름, 표준 자료(그래프)는 새 이름이다
        'alias': {'대공원': '수성알파시티', '어린이회관': '어린이세상'},
    },
    'daejeon': {
        'name': '대전',
        'lines': ['대전 1호선'],
        'boarding': {'pk': '15060591', 'uddi': 'uddi:2617d7dd-72df-43ac-ae06-8d050833c6b0',
                     'file': 'daejeon.csv', 'title': '대전교통공사_시간대별 승하차인원'},
        'extra': [{'pk': '15153569', 'uddi': 'uddi:b911152d-697c-4a10-a063-9f2087b6cea4',
                   'file': 'tt_daejeon.csv', 'title': '대전교통공사_열차운행 상황 및 시각표'}],
        'csv': {'date': ('col', 0), 'name': 2, 'kind': 3, 'first': 4,
                'hours': list(range(3, 24)) + [0, 1, 2]},
        'alias': {},
    },
    'gwangju': {
        'name': '광주',
        'lines': ['광주 1호선'],
        'boarding': {'pk': '15060048', 'uddi': 'uddi:973058a6-c9b3-43bd-b554-8491a90aeaf7',
                     'file': 'gwangju.csv', 'title': '광주교통공사_역일시간대별 승하차량'},
        'extra': [{'pk': '15111497', 'uddi': 'uddi:b191df7a-59f1-410d-b608-877f5c7b09ee',
                   'file': 'tt_gwangju.csv', 'title': '광주교통공사_열차 시간표 데이터'}],
        'csv': {'date': ('col', 0), 'name': 2, 'kind': 3, 'first': 4,
                'hours': list(range(5, 24))},
        'alias': {'컨벤션센터': '김대중컨벤션센터', '학동증심사': '학동증심사입구'},
    },
    'incheon': {
        'name': '인천',
        'lines': ['인천지하철 1호선', '인천지하철 2호선'],
        'boarding': {'pk': '15159353', 'uddi': 'uddi:d42d3848-4870-4429-88b6-9fc39099bd3a',
                     'file': 'incheon.csv', 'title': '인천교통공사_일별 역별 시간대별 이용인원현황'},
        'extra': [
            {'pk': '15051203', 'uddi': 'uddi:7bebc8fb-81a4-430c-84fe-c22e70386716',
             'file': 'tt_incheon1.csv', 'title': '인천 1호선 평일상선 열차운행시각표'},
            {'pk': '15051210', 'uddi': 'uddi:4769b3a2-6e7e-4c0e-a347-a9aa689a4a3a',
             'file': 'tt_incheon2.csv', 'title': '인천 2호선 평일상선 열차운행시각표'},
        ],
        # 06시이전 → 5시로, 24시이후 → 0시로 몰아 넣는다(양 끝은 뭉친 값이다)
        # ★ 7호선 줄이 섞여 있다 ★ 인천교통공사가 7호선 인천·부천 구간도 운영해서다.
        # 그 구간은 서울 혼잡도 자료가 따로 있으므로 여기서는 1·2호선만 쓴다 —
        # 안 거르면 부평구청처럼 이름이 겹치는 역에서 승하차가 두 번 더해진다.
        'csv': {'date': ('col', 1), 'name': 4, 'kind': 5, 'first': 6, 'line': 2,
                'keepLines': {'1', '2'},
                'hours': [5] + list(range(6, 24)) + [0]},
        'alias': {},
    },
}

# 검증용 정답지 — 부산 1호선만 있다(2020~2021 실측 열차혼잡도)
TRUTH = {'pk': '15139787', 'uddi': 'uddi:87dfcf62-5843-4426-8f48-ae999e57a911',
         'file': 'busan_truth.zip', 'title': '부산교통공사_1호선 열차혼잡도'}

# ── 모형 상수 (부산 실측으로 정했다 — D-103) ───────────────────────────────
DECAY_STOPS = 10.0       # 중력모형 감쇠. 부산 1호선 실측과 상관 0.95
TRANSFER_PENALTY = 4.0   # 환승 한 번 = 역 4개 값
IPF_ITERS = 25
MODEL_ERROR_PCT = 8.0    # 실측 대조 평균 오차(%p). 확률 곡선을 이만큼 무디게 한다(D-104)


def norm_station(name, graph_names, alias):
    """자료의 역 이름 → 그래프의 역 이름.

    운영사 자료와 표준 자료의 이름이 세 가지로 어긋난다:
      · **개명**  대구 대공원→수성알파시티, 어린이회관→어린이세상 (표로 못 박는다)
      · **괄호 병기**  인천 「가정(루원시티)」·「석남(거북시장)」 → 앞부분이 정식 이름
      · **환승역 호선 꼬리표**  대구 「반월당1」·「반월당2」 는 한 역을 호선별로 적은 것
    ★ rstrip 은 쓰지 않는다 ★ '서면'.rstrip('역') 같은 사고가 난다(D-48).
    꼬리표는 **떼어 낸 것이 실제 역 이름일 때만** 인정한다.
    """
    nm = str(name).strip()
    if nm in graph_names:
        return nm
    if nm in alias:
        got = alias[nm]
        return got if got in graph_names else None
    cands = [nm]
    if '(' in nm:
        cands.append(nm.split('(')[0].strip())          # 가정(루원시티) → 가정
    if len(nm) > 1 and nm[-1].isdigit():
        cands.append(nm[:-1].strip())                    # 반월당2 → 반월당
    for c in cands:
        if c in graph_names:
            return c
        if c in alias and alias[c] in graph_names:
            return alias[c]
    for c in cands:
        flat = c.replace('·', '').replace('(', '').replace(')', '').replace(' ', '')
        if flat.endswith('역') and flat[:-1] in graph_names:
            return flat[:-1]
        for g in graph_names:
            if g.replace('·', '').replace('(', '').replace(')', '').replace(' ', '') == flat:
                return g
    return None
