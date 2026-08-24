# -*- coding: utf-8 -*-
"""포스터의 아이콘/도형/배경 요소를 개별 PNG로 생성한다.

각 PNG는 '자기 크기에 꼭 맞는' 비트맵 + 투명 여백을 갖는다.
미리캔버스에서 PDF를 열었을 때 각각 독립된 이미지 개체로 잡히게 하기 위함이다.
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

from gfx import Mask, colorize, gradient_fill, stack, pad, path, mirror_x, linear_gradient

OUT = r"C:\Claude\poster-editable\assets"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- 팔레트
NAVY      = (26, 62, 124)
GREEN     = (71, 164, 75)
GREEN_CTA = (67, 160, 71)
BLUE_IC   = (46, 111, 184)
TEAL_IC   = (44, 143, 152)
GREEN_IC  = (62, 154, 78)
CREAM     = (251, 247, 239)
FOOTNAVY  = (48, 82, 137)
WHITE     = (255, 255, 255)
LEAF_A    = (108, 186, 84)
LEAF_B    = (76, 163, 102)


def save(im, name):
    p = os.path.join(OUT, name)
    im.save(p)
    print("%-22s %-13s %6.1f KB" % (name, str(im.size), os.path.getsize(p) / 1024))


def cap(m, cx, cy, rmid, ang_deg, r):
    a = math.radians(ang_deg)
    m.circle(cx + rmid * math.cos(a), cy + rmid * math.sin(a), r)


# ================================================================ 글리프 정의
def glyph_sprout(m):
    """새싹 3잎 — 환경 보호"""
    # 줄기
    m.thick_line([(50, 90), (50, 78), (49, 66), (50, 56)], 7)
    # 좌우 잎
    left = path([('M', 50, 69), ('C', 38, 70, 22, 62, 17, 40),
                 ('C', 33, 42, 47, 54, 50, 69), ('Z',)])
    m.poly(left)
    m.poly(mirror_x(left, 50))
    # 가운데 잎
    mid = path([('M', 50, 60), ('C', 38, 48, 38, 26, 50, 13),
                ('C', 62, 26, 62, 48, 50, 60), ('Z',)])
    m.poly(mid)


def glyph_people(m):
    """3인 그룹 — 지역 나눔"""
    side_body_l = path([('M', 4, 82), ('C', 4, 63, 11, 54, 23, 54),
                        ('C', 29, 54, 33, 56, 36, 60), ('L', 36, 82), ('Z',)])
    # 옆 사람(뒤)
    m.circle(21, 40, 11)
    m.poly(side_body_l)
    m.circle(79, 40, 11)
    m.poly(mirror_x(side_body_l, 50))
    # 가운데 사람 실루엣 (살짝 키운 형태로 지워 틈을 만든 뒤 다시 그림)
    center_body = path([('M', 26, 84), ('C', 26, 60, 36, 49, 50, 49),
                        ('C', 64, 49, 74, 60, 74, 84), ('Z',)])
    grown = path([('M', 22, 86), ('C', 22, 57, 34, 45, 50, 45),
                  ('C', 66, 45, 78, 57, 78, 86), ('Z',)])
    m.circle(50, 30, 17, v=0)
    m.poly(grown, v=0)
    m.circle(50, 30, 13.5)
    m.poly(center_body)


def glyph_hands_heart(m):
    """하트를 감싼 두 손 — 손가락 묘사 없이 매끈한 곡면으로 처리"""
    heart = path([('M', 50, 52),
                  ('C', 32, 40, 21, 31, 21, 21),
                  ('C', 21, 13, 27, 8, 34, 8),
                  ('C', 40, 8, 46, 12, 50, 19),
                  ('C', 54, 12, 60, 8, 66, 8),
                  ('C', 73, 8, 79, 13, 79, 21),
                  ('C', 79, 31, 68, 40, 50, 52), ('Z',)])
    m.poly(heart)
    # 손: 큰 원호 밴드 두 개가 그릇 모양을 이룬다
    ro, ri, cx, cy = 45.0, 31.0, 50.0, 37.0
    rm = (ro + ri) / 2.0
    rc = (ro - ri) / 2.0
    m.arc_band(cx, cy, ro, ri, 96, 168)
    cap(m, cx, cy, rm, 96, rc); cap(m, cx, cy, rm, 168, rc)
    m.arc_band(cx, cy, ro, ri, 12, 84)
    cap(m, cx, cy, rm, 12, rc); cap(m, cx, cy, rm, 84, rc)


def glyph_qr(m):
    def finder(x, y):
        m.rrect(x, y, x + 27, y + 27, 6)
        m.rrect(x + 6, y + 6, x + 21, y + 21, 3, v=0)
        m.rrect(x + 10, y + 10, x + 17, y + 17, 1.6)
    finder(10, 10); finder(63, 10); finder(10, 63)
    for (x, y, w, h) in [(63, 63, 11, 11), (79, 63, 11, 11), (63, 79, 11, 11),
                         (79, 79, 11, 11), (44, 44, 9, 9), (44, 20, 8, 8),
                         (44, 76, 8, 8), (20, 44, 8, 8), (76, 44, 8, 8)]:
        m.rrect(x, y, x + w, y + h, 1.8)


def glyph_form(m):
    m.rrect(17, 11, 66, 90, 7)
    m.rrect(25, 28, 58, 34, 3, v=0)
    m.rrect(25, 44, 58, 50, 3, v=0)
    m.rrect(25, 60, 46, 66, 3, v=0)
    # 연필
    tip, end, w = (55, 86), (93, 34), 12.0
    dx, dy = end[0] - tip[0], end[1] - tip[1]
    L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    a = (tip[0] + ux * L * 0.20 + nx * w / 2, tip[1] + uy * L * 0.20 + ny * w / 2)
    b = (tip[0] + ux * L * 0.20 - nx * w / 2, tip[1] + uy * L * 0.20 - ny * w / 2)
    c = (end[0] + nx * w / 2, end[1] + ny * w / 2)
    e = (end[0] - nx * w / 2, end[1] - ny * w / 2)
    m.poly([tip, a, c, e, b], v=0)                      # 문서와 분리되는 흰 테두리
    a2 = (tip[0] + ux * L * 0.22 + nx * w * 0.40, tip[1] + uy * L * 0.22 + ny * w * 0.40)
    b2 = (tip[0] + ux * L * 0.22 - nx * w * 0.40, tip[1] + uy * L * 0.22 - ny * w * 0.40)
    c2 = (end[0] + nx * w * 0.40, end[1] + ny * w * 0.40)
    e2 = (end[0] - nx * w * 0.40, end[1] - ny * w * 0.40)
    tip2 = (tip[0] + ux * 3, tip[1] + uy * 3)
    m.poly([tip2, a2, c2, e2, b2])


# ================================================================ 요소 빌더
def circle_icon(glyph_fn, circle_rgb, glyph_rgb, px=640):
    cm = Mask(px, px); cm.circle(50, 50, 50)
    gm = Mask(px, px)
    inner = Mask(px, px)
    glyph_fn(inner)
    # 글리프를 원 안쪽 62% 영역으로 축소 배치
    gsrc = inner.get(int(px * 0.60), int(px * 0.60))
    canvas = Image.new("L", (px, px), 0)
    canvas.paste(gsrc, (int(px * 0.20), int(px * 0.20)))
    return pad(stack(colorize(cm.get(), circle_rgb), colorize(canvas, glyph_rgb)), pct=0.05)


def build_category_icons():
    save(circle_icon(glyph_sprout, GREEN_IC, WHITE), "icon_cat_env.png")
    save(circle_icon(glyph_people, BLUE_IC, WHITE), "icon_cat_share.png")
    save(circle_icon(glyph_hands_heart, TEAL_IC, WHITE), "icon_cat_youth.png")


def build_step_icons():
    save(circle_icon(glyph_qr, WHITE, FOOTNAVY, 560), "step_qr.png")
    save(circle_icon(glyph_form, WHITE, FOOTNAVY, 560), "step_form.png")
    save(circle_icon(glyph_hands_heart, WHITE, FOOTNAVY, 560), "step_join.png")


def build_chevron():
    m = Mask(150, 190)
    m.thick_line([(28, 16), (74, 50), (28, 84)], 11)
    save(pad(colorize(m.get(), WHITE), pct=0.08), "chevron.png")


def build_cta_arrow():
    m = Mask(280, 150, unit=100)
    m.rrect(6, 43, 62, 57, 7)
    m.poly([(52, 24), (94, 50), (52, 76)])
    save(pad(colorize(m.get(), WHITE), pct=0.07), "cta_arrow.png")


def build_logo_mark():
    """두 사람이 서로를 감싸 원(포용)을 이루는 마크."""
    px = 460
    ro, ri, cx, cy = 45.0, 28.0, 50.0, 54.0
    rm = (ro + ri) / 2.0
    rc = (ro - ri) / 2.0

    blue = Mask(px, px)
    blue.arc_band(cx, cy, ro, ri, 96, 214)
    cap(blue, cx, cy, rm, 96, rc); cap(blue, cx, cy, rm, 214, rc)
    blue.circle(cx + rm * math.cos(math.radians(214)) - 1,
                cy + rm * math.sin(math.radians(214)) - 12, 12.5)

    green = Mask(px, px)
    green.arc_band(cx, cy, ro, ri, 326, 444)      # 360도를 넘겨 시계방향으로 진행
    cap(green, cx, cy, rm, 326, rc); cap(green, cx, cy, rm, 84, rc)
    green.circle(cx + rm * math.cos(math.radians(326)) + 1,
                 cy + rm * math.sin(math.radians(326)) - 11, 11.5)

    save(pad(stack(colorize(blue.get(), (42, 106, 178)),
                   colorize(green.get(), (92, 178, 74))), pct=0.05), "logo_mark.png")


def build_ring():
    px = 1500
    m = Mask(px, px)
    m.arc_band(50, 50, 45.5, 34.5, 185, 320, arrow=True)
    m.arc_band(50, 50, 45.5, 34.5, 5, 140, arrow=True)
    save(pad(gradient_fill(m.get(), (58, 122, 198), (94, 187, 92), 45.0), pct=0.03), "ring.png")


def build_ring_disc():
    px = 1000
    m = Mask(px, px)
    m.circle(50, 50, 46)
    soft = m.get().filter(ImageFilter.GaussianBlur(px * 0.045))
    img = colorize(soft, WHITE)
    a = img.getchannel("A").point(lambda v: int(v * 0.80))
    img.putalpha(a)
    save(pad(img, pct=0.04), "ring_disc.png")


def build_panels():
    # CTA 초록 바 (170 x 14 mm 비율)
    w, h = 2400, 198
    m = Mask(w, h, unit=100.0)
    m.d.rounded_rectangle([0, 0, w * 8 - 1, h * 8 - 1], radius=h * 8 * 0.42, fill=255)
    save(colorize(m.get(w, h), GREEN_CTA), "panel_cta.png")

    # 크림 카드 패널 (180 x 53 mm)
    w, h = 2400, 707
    m = Mask(w, h, unit=100.0)
    m.d.rounded_rectangle([0, 0, w * 8 - 1, h * 8 - 1], radius=64 * 8, fill=255)
    save(colorize(m.get(w, h), CREAM), "panel_card.png")

    # 하단 네이비 바 (210 x 29 mm) — 사각형
    w, h = 2100, 290
    m = Mask(w, h, unit=100.0)
    m.d.rectangle([0, 0, w * 8, h * 8], fill=255)
    save(colorize(m.get(w, h), FOOTNAVY), "panel_footer.png")

    # 카드 세로 구분선
    w, h = 12, 620
    m = Mask(w, h, unit=100.0)
    m.d.rounded_rectangle([4 * 8, 0, 7 * 8, h * 8], radius=8, fill=255)
    save(colorize(m.get(w, h), (226, 219, 205)), "divider_v.png")

    # 하단 흰 스트립의 세로 구분자
    w, h = 10, 90
    m = Mask(w, h, unit=100.0)
    m.d.rectangle([4 * 8, 0, 6 * 8, h * 8], fill=255)
    save(colorize(m.get(w, h), (198, 208, 222)), "footer_sep.png")


def build_bg_sky():
    w, h = 1400, 1240
    g = linear_gradient((w, h), (240, 248, 253), (206, 233, 248), 90.0).convert("RGBA")
    # 좌상단 은은한 광량
    glow = Image.new("L", (w, h), 0)
    ImageDraw.Draw(glow).ellipse([-int(w * .45), -int(h * .55), int(w * .75), int(h * .45)], fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.13)).point(lambda v: int(v * 0.55))
    g = Image.alpha_composite(g, colorize(glow, (255, 255, 255)))
    save(g, "bg_sky.png")


def build_clouds():
    """타원 합집합만으로 만든다. 사각형을 섞으면 블러 후에도 직선 경계가 남는다."""
    BLOBS = [
        [(50, 46, 30, 32), (29, 60, 23, 22), (71, 59, 22, 21), (50, 66, 40, 16)],
        [(48, 50, 27, 28), (27, 62, 21, 19), (70, 60, 24, 22), (50, 68, 38, 14)],
        [(52, 52, 25, 26), (30, 62, 20, 18), (72, 62, 19, 17), (50, 68, 36, 13)],
    ]
    specs = [("cloud_a.png", 560, 0.55), ("cloud_b.png", 440, 0.47),
             ("cloud_c.png", 360, 0.40)]
    for (name, px, alpha), blobs in zip(specs, BLOBS):
        m = Mask(px, int(px * 0.52))
        for (cx, cy, rx, ry) in blobs:
            m.ellipse(cx, cy, rx, ry)
        soft = m.get().filter(ImageFilter.GaussianBlur(px * 0.030))
        img = colorize(soft, WHITE)
        img.putalpha(img.getchannel("A").point(lambda v: int(v * alpha)))
        save(pad(img, pct=0.06), name)


def build_birds():
    for name, px, col in [("birds_a.png", 240, (120, 158, 196)), ("birds_b.png", 190, (138, 172, 205))]:
        m = Mask(px, int(px * 0.52))
        m.thick_line([(8, 40), (24, 22), (40, 40)], 4.5)
        m.thick_line([(48, 26), (66, 8), (84, 26)], 4.0)
        m.thick_line([(58, 60), (72, 46), (86, 60)], 3.4)
        save(pad(colorize(m.get(), col), pct=0.08), name)


def build_leaves():
    """잎 + 살짝 어두운 중앙맥. 흰 선으로 파내지 않아 거친 이음매가 생기지 않는다."""
    leaf = path([('M', 50, 92), ('C', 20, 74, 12, 40, 50, 8),
                 ('C', 88, 40, 80, 74, 50, 92), ('Z',)])
    specs = [("leaf_a.png", 300, LEAF_A, -18), ("leaf_b.png", 250, LEAF_B, 24),
             ("leaf_c.png", 200, LEAF_A, 62)]
    for name, px, col, rot in specs:
        body = Mask(px, px)
        body.poly(leaf)
        vein = Mask(px, px)
        vein.thick_line([(50, 86), (50, 60), (51, 34), (50, 16)], 2.6)
        vein.clip_to(body)
        dark = tuple(max(0, int(c * 0.78)) for c in col)
        img = stack(colorize(body.get(), col), colorize(vein.get(), dark))
        img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
        save(pad(img.crop(img.getbbox()), pct=0.08), name)


def build_small_icons():
    # 수화기: 가로로 그린 뒤 -32도 회전 -> 전형적인 전화 실루엣
    m = Mask(200, 200)
    m.thick_line([(15, 54), (30, 39), (50, 35), (70, 39), (85, 54)], 15)
    m.rrect(3, 43, 30, 78, 10)
    m.rrect(70, 43, 97, 78, 10)
    m.ellipse(50, 78, 27, 20, v=0)
    phone_mask = m.rotated(32)
    save(pad(colorize(phone_mask, WHITE), pct=0.10), "icon_phone.png")
    save(pad(colorize(phone_mask, (42, 106, 178)), pct=0.10), "icon_phone_navy.png")

    # 지구본: 경위선을 원판으로 클립해 밖으로 삐져나가지 않게 한다
    disc = Mask(200, 200)
    disc.circle(50, 50, 46)
    ring = Mask(200, 200)
    ring.circle(50, 50, 46)
    ring.circle(50, 50, 39, v=0)
    lines = Mask(200, 200)
    lines.ellipse(50, 50, 20, 40)
    lines.ellipse(50, 50, 13.5, 40, v=0)
    lines.rect(6, 47.4, 94, 52.6)
    lines.rect(6, 28.5, 94, 33.0)
    lines.rect(6, 67.0, 94, 71.5)
    lines.clip_to(disc)
    rg, lg = ring.get(), lines.get()
    save(pad(stack(colorize(rg, WHITE), colorize(lg, WHITE)), pct=0.10), "icon_globe.png")
    save(pad(stack(colorize(rg, (42, 106, 178)), colorize(lg, (42, 106, 178))), pct=0.10),
         "icon_globe_navy.png")


def build_bullets():
    for name, col in [("bullet_green.png", GREEN_IC), ("bullet_blue.png", BLUE_IC),
                      ("bullet_teal.png", TEAL_IC)]:
        m = Mask(80, 80)
        m.circle(50, 50, 42)
        save(pad(colorize(m.get(), col), pct=0.10), name)


def build_qr():
    import qrcode
    qr = qrcode.QRCode(version=3, error_correction=qrcode.constants.ERROR_CORRECT_M,
                       box_size=20, border=3)
    qr.add_data("https://www.happyshare.or.kr")
    qr.make(fit=True)
    img = qr.make_image(fill_color="#12326B", back_color="white").convert("RGBA")
    save(img, "qr_code.png")


if __name__ == "__main__":
    build_category_icons()
    build_step_icons()
    build_chevron()
    build_cta_arrow()
    build_logo_mark()
    build_ring()
    build_ring_disc()
    build_panels()
    build_bg_sky()
    build_clouds()
    build_birds()
    build_leaves()
    build_small_icons()
    build_bullets()
    build_qr()
