"""마음톡 런처 아이콘 생성 — 잔잔한 물결 위의 대화 방울.

실행:  python make_icons.py   (PIL 필요)
res/mipmap-*/ic_launcher.png 을 다섯 밀도로 만든다.
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

BG = (74, 124, 111)        # --accent
BG_DEEP = (58, 100, 89)
WAVE = (110, 163, 148)
BUBBLE = (244, 242, 238)   # --bg


def draw_icon(size):
    S = size * 4  # 4배로 그리고 축소해 안티앨리어싱
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    r = S // 5

    # 위에서 아래로 어두워지는 바탕
    for y in range(S):
        t = y / S
        c = tuple(int(BG[i] + (BG_DEEP[i] - BG[i]) * t) for i in range(3))
        d.line([(0, y), (S, y)], fill=c)

    # 물결 두 줄 — "마음톡"의 결
    for k, amp, yy, w in ((0, S * 0.030, 0.70, S // 26), (1, S * 0.022, 0.815, S // 34)):
        pts = []
        for x in range(0, S + 1, max(1, S // 120)):
            ph = x / S * math.pi * 2 + k * 1.1
            pts.append((x, S * yy + math.sin(ph) * amp))
        d.line(pts, fill=WAVE, width=w, joint="curve")

    # 대화 방울
    bw, bh = int(S * 0.52), int(S * 0.36)
    bx, by = (S - bw) // 2, int(S * 0.20)
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=int(bh * 0.34), fill=BUBBLE)
    # 꼬리
    tx, ty = bx + int(bw * 0.28), by + bh
    d.polygon([(tx, ty - 2), (tx + int(bw * 0.20), ty - 2),
               (tx + int(bw * 0.03), ty + int(bh * 0.26))], fill=BUBBLE)

    # 말줄임 세 점
    dot = max(2, int(S * 0.028))
    cy = by + bh // 2
    for i in (-1, 0, 1):
        cx = bx + bw // 2 + i * int(bw * 0.22)
        d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=BG)

    # 둥근 모서리 마스킹
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    out = Image.new("RGB", (S, S), BG)
    out.paste(img, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


for dpi, size in SIZES.items():
    path = os.path.join(ROOT, "res", f"mipmap-{dpi}", "ic_launcher.png")
    draw_icon(size).save(path, optimize=True)
    print(path, size)
