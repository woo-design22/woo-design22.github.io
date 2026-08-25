"""우리가족 유럽여행 런처 아이콘 생성 — 파란 하늘·해 갠 에펠탑, 발치에 네 식구.

실행:  python make_icons.py   (PIL 필요)
res/mipmap-*/ic_launcher.png 을 다섯 밀도로 만든다.
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

SKY = (143, 196, 234)
SUN = (255, 233, 163)
GRASS = (95, 174, 74)
IRON = (154, 122, 80)
IRON_D = (138, 106, 68)
# 게임 속 네 식구 옷 색 (설진쾌·송정자·설수지·설현지)
FAMILY = [(90, 107, 122), (255, 158, 181), (95, 184, 138), (255, 209, 102)]


def draw_icon(size):
    # 4배로 그리고 축소해 안티앨리어싱
    S = size * 4
    img = Image.new("RGB", (S, S), SKY)
    d = ImageDraw.Draw(img)
    u = S / 16.0                      # 16칸 격자 기준

    def R(x, y, w, h, c):
        d.rectangle([round(x * u), round(y * u),
                     round((x + w) * u) - 1, round((y + h) * u) - 1], fill=c)

    R(0, 0, 16, 16, SKY)
    # 해
    d.ellipse([round(1.1 * u), round(1.1 * u), round(4.6 * u), round(4.6 * u)], fill=SUN)
    # 잔디
    R(0, 12.6, 16, 3.4, GRASS)

    # 에펠탑 — 첨탑, 두 전망대, 벌어지는 다리, 아치
    R(7.4, 1.2, 1.2, 2.6, IRON_D)     # 안테나
    R(6.6, 3.8, 2.8, 1.1, IRON)       # 꼭대기 전망대
    R(7.0, 4.9, 2.0, 2.0, IRON)
    R(5.8, 6.9, 4.4, 1.1, IRON_D)     # 2층 전망대
    R(6.4, 8.0, 3.2, 1.6, IRON)
    R(4.6, 9.6, 6.8, 1.1, IRON_D)     # 1층 전망대
    for i, (y, h, i0, i1) in enumerate([(10.7, 0.7, 2.6, 4.0),
                                        (11.4, 0.7, 3.3, 4.8),
                                        (12.1, 0.6, 4.0, 5.6)]):
        R(8 - i1, y, i1 - i0, h, IRON)
        R(8 + i0, y, i1 - i0, h, IRON)
    R(5.6, 10.6, 4.8, 0.5, IRON_D)    # 아치

    # 네 식구 (몸통 + 머리)
    for i, c in enumerate(FAMILY):
        x = 2.2 + i * 3.1
        R(x, 13.4, 1.5, 1.9, c)
        R(x + 0.15, 12.6, 1.2, 0.9, (247, 211, 179))

    # 둥근 모서리
    r = S // 5
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    out = Image.new("RGB", (S, S), SKY)
    out.paste(img, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


for dpi, size in SIZES.items():
    path = os.path.join(ROOT, "res", f"mipmap-{dpi}", "ic_launcher.png")
    draw_icon(size).save(path, optimize=True)
    print(path, size)
