# -*- coding: utf-8 -*-
"""큰 제목 레터링을 그림 파일로 만든다.

미리캔버스에 같은 폰트가 없어도 제목 모양이 그대로 유지되도록 텍스트가 아닌
이미지로 굽는다. 색 구간마다 별도 마스크를 만들어 단색 RGB에 입히므로
축소해도 색이 번지지 않는다. 잉크 경계로 크롭한 뒤 투명 여백을 넣어
가장자리가 잘리지 않게 한다.
"""
import os
from PIL import Image, ImageDraw, ImageFont

from gfx import colorize, stack, pad

OUT = r"C:\Claude\poster-editable\assets"
VF = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"

NAVY = (26, 62, 124)
GREEN = (71, 164, 75)

PX = 320           # 렌더 폰트 크기(px). 최종 배치는 비율 유지로 축소된다.
TRACK = -0.035     # em 단위 자간


def black_font(size):
    f = ImageFont.truetype(VF, size)
    f.set_variation_by_name(b"Black")
    return f


def render_runs(runs, size=PX, track=TRACK):
    """runs = [(문자열, RGB), ...] -> 색 구간별 마스크를 합성한 RGBA."""
    font = black_font(size)
    tr = track * size

    # 글자마다 (구간 인덱스, 글자, x오프셋) 를 미리 계산
    placed, x = [], 0.0
    for i, (text, _rgb) in enumerate(runs):
        for ch in text:
            placed.append((i, ch, x))
            x += font.getlength(ch) + tr
    total = max(x - tr, 1.0)

    asc, desc = font.getmetrics()
    W, H = int(total) + size, asc + desc + size // 2
    ox, oy = size // 2, size // 6

    layers = []
    for i, (_text, rgb) in enumerate(runs):
        m = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(m)
        for ri, ch, px in placed:
            if ri == i:
                d.text((ox + px, oy), ch, font=font, fill=255)
        layers.append(colorize(m, rgb))

    return stack(*layers)


def render_lines(specs):
    """여러 줄을 '같은 세로 기준'으로 잘라 저장한다.

    줄마다 잉크 bbox로 따로 자르면 줄마다 배율이 달라져 글자 크기가 어긋난다.
    모든 줄의 세로 잉크 범위를 합집합으로 잡아 동일한 밴드로 자르면,
    배치할 때 높이만 같게 줘도 두 줄의 글자 크기가 정확히 일치한다.
    """
    imgs = [render_runs(runs) for runs, _ in specs]
    boxes = [im.getbbox() for im in imgs]
    y0 = min(b[1] for b in boxes)
    y1 = max(b[3] for b in boxes)
    pad_px = 12
    for (runs, name), im, bb in zip(specs, imgs, boxes):
        c = im.crop((bb[0], y0, bb[2], y1))
        canvas = Image.new("RGBA", (c.width + 2 * pad_px, c.height + 2 * pad_px), (0, 0, 0, 0))
        canvas.paste(c, (pad_px, pad_px))
        p = os.path.join(OUT, name)
        canvas.save(p)
        print("%-20s %-13s ratio=%.4f  %6.1f KB"
              % (name, str(canvas.size), canvas.width / canvas.height,
                 os.path.getsize(p) / 1024))


if __name__ == "__main__":
    render_lines([
        ([("작은 참여가", NAVY)], "title_line1.png"),
        ([("큰 변화", GREEN), ("를 만듭니다", NAVY)], "title_line2.png"),
    ])
