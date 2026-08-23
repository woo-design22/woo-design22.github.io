"""샌드믹스 런처 아이콘 생성 — 어두운 바탕 위에 쌓인 3색 모래와 떨어지는 블록.

실행:  python make_icons.py   (PIL 필요)
res/mipmap-*/ic_launcher.png 을 다섯 밀도로 만든다.
"""
import os
import random

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

BG = (13, 13, 22)
RED = (255, 61, 74)
YELLOW = (255, 212, 59)
BLUE = (61, 139, 255)


def jitter(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def draw_icon(size):
    # 4배로 그리고 축소해 안티앨리어싱
    S = size * 4
    img = Image.new("RGB", (S, S), BG)
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)

    # 둥근 사각형 바탕 (어댑티브 아이콘이 아니라서 직접 그린다)
    r = S // 5
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=BG)

    # 모래 층: 아래부터 파랑, 노랑, 빨강 — 표면을 울퉁불퉁하게
    grain = max(2, S // 48)
    cols = S // grain
    layers = [(BLUE, 0.62), (YELLOW, 0.45), (RED, 0.33)]
    heights = []
    for x in range(cols):
        base = 0.0
        heights.append([])
    for color, frac in layers:
        wave = [frac + 0.05 * rnd.uniform(-1, 1) for _ in range(cols)]
        # 부드럽게
        for _ in range(3):
            wave = [(wave[i - 1] + wave[i] + wave[(i + 1) % cols]) / 3 for i in range(cols)]
        for x in range(cols):
            top = int(S * (1 - wave[x]))
            for y in range(top, S, grain):
                k = 0.88 + 0.2 * rnd.random()
                d.rectangle([x * grain, y, x * grain + grain - 1, y + grain - 1], fill=jitter(color, k))

    # 떨어지는 노란 블록 (ㄴ 모양) — 위쪽 중앙
    b = S // 7
    ox, oy = S // 2 - b, S // 6
    for (cx, cy) in [(0, 0), (0, 1), (1, 1)]:
        x0, y0 = ox + cx * b, oy + cy * b
        d.rectangle([x0, y0, x0 + b - 2, y0 + b - 2], fill=YELLOW)
        d.rectangle([x0, y0, x0 + b - 2, y0 + b // 5], fill=jitter(YELLOW, 1.15))

    # 둥근 모서리 바깥을 투명 대신 배경색으로 마스킹 (RGB 유지)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=255)
    out = Image.new("RGB", (S, S), BG)
    out.paste(img, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


for dpi, size in SIZES.items():
    path = os.path.join(ROOT, "res", f"mipmap-{dpi}", "ic_launcher.png")
    draw_icon(size).save(path, optimize=True)
    print(path, size)
