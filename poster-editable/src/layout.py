# -*- coding: utf-8 -*-
"""포스터 레이아웃 정의 (A4 210 x 297 mm, 좌상단 원점, 단위 mm).

이 한 곳의 정의가 PDF와 미리보기 PNG를 모두 구동한다.
이미지는 종횡비를 보존한다 — w 또는 h 중 하나만 주면 나머지는 원본 비율로 계산된다.
"""
PAGE_W, PAGE_H = 210.0, 297.0

NAVY     = (26, 62, 124)
GREEN    = (71, 164, 75)
GREEN_IC = (62, 154, 78)
BLUE_IC  = (46, 111, 184)
TEAL_IC  = (44, 143, 152)
BODY     = (68, 84, 106)
BODY_L   = (92, 106, 128)
WHITE    = (255, 255, 255)
CREAM_TX = (120, 112, 96)

R, M, B = "NotoR", "NotoM", "NotoB"


def img(f, x, y, w=None, h=None, anchor="tl", op=1.0):
    return dict(kind="img", f=f, x=x, y=y, w=w, h=h, anchor=anchor, op=op)


def txt(s, x, y, font, size, color, align="l", track=0.0):
    return dict(kind="txt", s=s, x=x, y=y, font=font, size=size,
                color=color, align=align, track=track)


def runs(rs, x, y, font, size, align="l", track=0.0):
    """색이 다른 여러 구간을 한 줄로 이어 그린다.

    구간별 x좌표를 미리 계산해 하드코딩하면 렌더러마다 폭이 달라져 틈이 벌어진다.
    각 렌더러가 자기 폰트 메트릭으로 이어붙이도록 한 op 으로 넘긴다.
    """
    return dict(kind="runs", rs=rs, x=x, y=y, font=font, size=size,
                align=align, track=track)


# 카드 3열의 왼쪽 기준선
COL = [21.0, 81.0, 141.0]
CARD_TOP = 203.0
FOOT_TOP = 257.0

CATS = [
    ("icon_cat_env.png",   "환경 보호", GREEN_IC, "bullet_green.png",
     ["자연을 지키는 작은 실천이", "깨끗한 미래를 만듭니다."],
     ["플로깅 & 환경 정화 활동", "나무 심기 캠페인"]),
    ("icon_cat_share.png", "지역 나눔", BLUE_IC, "bullet_blue.png",
     ["이웃을 향한 따뜻한 마음이", "더 행복한 공동체를 만듭니다."],
     ["취약계층 지원", "지역 문화·교육 지원"]),
    ("icon_cat_youth.png", "청년 참여", TEAL_IC, "bullet_teal.png",
     ["청년의 아이디어와 행동이", "사회를 변화시킵니다."],
     ["청년 공익 아이디어 공모", "자원봉사 & 멘토링"]),
]

STEPS = [("step_qr.png", "QR코드 스캔"), ("step_form.png", "신청서 작성"),
         ("step_join.png", "활동 참여하기")]
STEP_CX = [50.0, 78.0, 106.0]


def build():
    ops = []
    a = ops.append

    # ---------------------------------------------------------- 배경 / 하늘
    a(img("bg_sky.png", 0, 0, w=PAGE_W, h=183.0))
    a(img("cloud_a.png", 132, 12, w=54))
    a(img("cloud_b.png", 6, 50, w=42))
    a(img("cloud_c.png", 170, 64, w=33))
    a(img("birds_a.png", 96, 28, w=19))
    a(img("birds_b.png", 178, 43, w=14))

    # ---------------------------------------------------------- 도시 풍경
    a(img("bg_cityscape.png", -4, 96.5, w=218))

    # 순환 링 — 인물보다 먼저 그려 뒤에 깔린다 (원본과 동일한 겹침 순서)
    a(img("ring_disc.png", 146, 113, w=68, anchor="c"))
    a(img("ring.png", 146, 113, w=80, anchor="c"))
    a(txt("참여", 146, 101.5, B, 13.4, NAVY, align="c", track=-0.01))
    a(txt("×",   146, 109.0, M, 9.0, BODY_L, align="c"))
    a(txt("나눔", 146, 117.5, B, 13.4, GREEN, align="c", track=-0.01))
    a(txt("=",   146, 125.0, M, 9.0, BODY_L, align="c"))
    a(txt("변화", 146, 133.5, B, 13.4, NAVY, align="c", track=-0.01))

    # ---------------------------------------------------------- 인물 일러스트
    a(img("illus_planting.png", 17, 131, h=48))
    a(img("illus_boy_box.png", 122, 135, h=45))
    a(img("illus_wheelchair.png", 138, 119, h=61))

    # ---------------------------------------------------------- 로고 (우상단)
    a(img("logo_mark.png", 156.5, 9.0, w=13.5))
    a(txt("함께하는", 173.0, 14.6, B, 9.6, NAVY))
    a(txt("공익 프로젝트", 173.0, 22.2, B, 12.6, NAVY, track=-0.02))

    # ---------------------------------------------------------- 헤드라인
    a(runs([("함께 만드는 더 나은 ", NAVY), ("우리 사회", GREEN)],
           13.5, 25.6, B, 10.4, track=-0.01))
    a(img("title_line1.png", 12.85, 33.8, h=17.5))
    a(img("title_line2.png", 12.85, 55.6, h=17.5))

    # 제목 옆 잎사귀 (제목 오른쪽 여백에 배치)
    a(img("leaf_a.png", 150.0, 47.0, w=13.0))
    a(img("leaf_b.png", 165.0, 40.5, w=11.0))
    a(img("leaf_c.png", 158.5, 59.5, w=9.5))

    # ---------------------------------------------------------- 리드 문장
    for i, s in enumerate(["우리의 일상 속 작은 실천이", "누군가의 삶을 바꾸고,",
                           "더 나은 내일을 만듭니다."]):
        a(txt(s, 15.0, 81.5 + i * 7.0, R, 10.6, BODY, track=-0.015))

    # ---------------------------------------------------------- CTA 바
    a(img("panel_cta.png", 15, 185, w=180, h=14.6))
    a(txt("지금, 우리 함께 시작해요!", 100.0, 195.2, B, 15.4, WHITE, align="c", track=-0.02))
    a(img("cta_arrow.png", 176.5, 189.6, w=11.5))

    # ---------------------------------------------------------- 카드 패널
    a(img("panel_card.png", 15, CARD_TOP, w=180, h=53))
    a(img("divider_v.png", 74.6, CARD_TOP + 5.5, h=42))
    a(img("divider_v.png", 134.6, CARD_TOP + 5.5, h=42))

    for (icon, title, col, bullet, desc, items), cx in zip(CATS, COL):
        a(img(icon, cx, CARD_TOP + 5.4, w=12.4))
        a(txt(title, cx + 15.4, CARD_TOP + 13.6, B, 13.0, col, track=-0.02))
        for i, s in enumerate(desc):
            a(txt(s, cx + 15.4, CARD_TOP + 20.4 + i * 5.4, R, 8.5, BODY, track=-0.015))
        for i, s in enumerate(items):
            a(img(bullet, cx + 2.2, CARD_TOP + 33.6 + i * 6.8, w=1.9))
            a(txt(s, cx + 6.4, CARD_TOP + 35.2 + i * 6.8, M, 9.0, BODY, track=-0.015))

    # ---------------------------------------------------------- 하단 네이비 바
    a(img("panel_footer.png", 0, FOOT_TOP, w=PAGE_W, h=29.0))
    a(txt("참여", 24.0, FOOT_TOP + 11.4, B, 12.6, WHITE, align="c", track=-0.02))
    a(txt("방법", 24.0, FOOT_TOP + 19.4, B, 12.6, WHITE, align="c", track=-0.02))

    for (icon, label), cx in zip(STEPS, STEP_CX):
        a(img(icon, cx, FOOT_TOP + 10.6, w=15.0, anchor="c"))
        a(txt(label, cx, FOOT_TOP + 25.2, M, 8.2, WHITE, align="c", track=-0.02))
    a(img("chevron.png", 64.0, FOOT_TOP + 10.6, w=3.6, anchor="c"))
    a(img("chevron.png", 92.0, FOOT_TOP + 10.6, w=3.6, anchor="c"))

    a(txt("자세한 내용은", 141.0, FOOT_TOP + 12.0, M, 9.6, WHITE, align="c", track=-0.02))
    a(txt("홈페이지를 확인하세요!", 141.0, FOOT_TOP + 19.4, M, 9.6, WHITE, align="c", track=-0.02))
    a(img("qr_code.png", 170.0, FOOT_TOP + 3.4, w=23.0))

    # ---------------------------------------------------------- 최하단 흰 스트립
    base = 292.8
    a(img("logo_mark.png", 15.0, base - 5.4, w=7.6))
    a(txt("행복나눔 공익재단", 24.4, base, B, 8.8, NAVY, track=-0.02))
    a(img("footer_sep.png", 63.0, base - 4.4, h=5.6))
    a(img("icon_phone_navy.png", 69.0, base - 4.0, w=4.6))
    a(txt("02-1234-5678", 76.0, base, M, 8.8, BODY, track=-0.01))
    a(img("footer_sep.png", 108.0, base - 4.4, h=5.6))
    a(img("icon_globe_navy.png", 114.0, base - 4.4, w=5.0))
    a(txt("www.happyshare.or.kr", 121.0, base, M, 8.8, BODY, track=-0.01))

    return ops
