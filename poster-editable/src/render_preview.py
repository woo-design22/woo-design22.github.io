# -*- coding: utf-8 -*-
"""layout.py 를 PIL로 렌더링해 시안 PNG를 만든다 (배치 확인용)."""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

import layout as L

ASSETS = r"C:\Claude\poster-editable\assets"
OUT = r"C:\Claude\poster-editable\out"
SCALE = 8.0                      # px per mm
PT2MM = 25.4 / 72.0

FONTS = {"NotoR": r"C:\Windows\Fonts\NotoSansKR-Regular.ttf",
         "NotoM": r"C:\Windows\Fonts\NotoSansKR-Medium.ttf",
         "NotoB": r"C:\Windows\Fonts\NotoSansKR-Bold.ttf"}
_cache = {}


def font(name, size_pt):
    key = (name, round(size_pt * PT2MM * SCALE, 1))
    if key not in _cache:
        _cache[key] = ImageFont.truetype(FONTS[name], int(round(key[1])))
    return _cache[key]


def text_width(f, s, track_px):
    return sum(f.getlength(ch) + track_px for ch in s) - (track_px if s else 0)


def draw_runs(d, op, rs):
    f = font(op["font"], op["size"])
    track = op["track"] * op["size"] * PT2MM * SCALE
    x = op["x"] * SCALE
    y = op["y"] * SCALE
    total = sum(text_width(f, s, track) + track for s, _ in rs) - track
    if op["align"] == "c":
        x -= total / 2.0
    elif op["align"] == "r":
        x -= total
    for s, color in rs:
        for ch in s:
            d.text((x, y), ch, font=f, fill=tuple(color), anchor="ls")
            x += f.getlength(ch) + track


def draw_text(d, op):
    draw_runs(d, op, [(op["s"], op["color"])])


def place(canvas, op):
    p = os.path.join(ASSETS, op["f"])
    if not os.path.exists(p):
        print("  !! MISSING ASSET:", op["f"])
        return
    im = Image.open(p).convert("RGBA")
    nw, nh = im.size
    w, h = op["w"], op["h"]
    if w is None and h is None:
        w = nw / SCALE
    if w is None:
        w = h * nw / nh
    if h is None:
        h = w * nh / nw
    tw, th = max(1, int(round(w * SCALE))), max(1, int(round(h * SCALE)))
    im = im.resize((tw, th), Image.LANCZOS)
    if op["op"] < 1.0:
        im.putalpha(im.getchannel("A").point(lambda v: int(v * op["op"])))
    ax, ay = op["x"] * SCALE, op["y"] * SCALE
    if op["anchor"] == "c":
        ax -= tw / 2.0; ay -= th / 2.0
    elif op["anchor"] == "tc":
        ax -= tw / 2.0
    canvas.alpha_composite(im, (int(round(ax)), int(round(ay))))


def render(path=None):
    W = int(L.PAGE_W * SCALE)
    H = int(L.PAGE_H * SCALE)
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(canvas)
    for op in L.build():
        if op["kind"] == "img":
            place(canvas, op)
        elif op["kind"] == "runs":
            draw_runs(d, op, op["rs"])
        else:
            draw_text(d, op)
    out = path or os.path.join(OUT, "preview.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.convert("RGB").save(out)
    print("preview ->", out, canvas.size)
    return out


if __name__ == "__main__":
    render(sys.argv[1] if len(sys.argv) > 1 else None)
