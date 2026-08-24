# -*- coding: utf-8 -*-
"""layout.py 를 편집 가능한 PDF로 굽는다.

미리캔버스 대응 설계
  * 도형/아이콘/패널/배경을 포함한 모든 비(非)텍스트 요소를 개별 이미지 XObject 로 넣는다.
    벡터 패스를 하나도 쓰지 않으므로, 임포터가 벡터 드로잉 전체를 페이지 크기 개체
    하나로 묶어버리는 문제('나머지 요소가 포스터 전체 크기로 잡히는' 현상)가 생기지 않는다.
  * Form XObject / 페이지 투명도 그룹 / 클리핑 경로를 만들지 않는다.
    Form XObject 의 BBox 가 페이지 크기면 그 안의 모든 것이 페이지 크기로 잡힌다.
  * 각 이미지는 자기 그림 크기에 꼭 맞는 비트맵이고, 배치는 q/cm/Do/Q 한 쌍씩 독립적으로 나간다.
  * 텍스트는 한글 폰트를 임베드한 진짜 텍스트로 넣어 편집 가능하게 유지한다.
"""
import os

from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

import layout as L

ASSETS = r"C:\Claude\poster-editable\assets"
OUT = r"C:\Claude\poster-editable\out"
MM = 72.0 / 25.4

FONT_FILES = {"NotoR": r"C:\Windows\Fonts\NotoSansKR-Regular.ttf",
              "NotoM": r"C:\Windows\Fonts\NotoSansKR-Medium.ttf",
              "NotoB": r"C:\Windows\Fonts\NotoSansKR-Bold.ttf"}

_readers = {}


def reader(name):
    if name not in _readers:
        _readers[name] = ImageReader(os.path.join(ASSETS, name))
    return _readers[name]


def register_fonts():
    for n, p in FONT_FILES.items():
        pdfmetrics.registerFont(TTFont(n, p))


def run_advance(s, font, size, tc):
    return pdfmetrics.stringWidth(s, font, size) + tc * len(s)


def draw_runs(c, op, rs):
    size = op["size"]
    tc = op["track"] * size
    total = sum(run_advance(s, op["font"], size, tc) for s, _ in rs) - tc
    x = op["x"] * MM
    y = (L.PAGE_H - op["y"]) * MM
    if op["align"] == "c":
        x -= total / 2.0
    elif op["align"] == "r":
        x -= total
    t = c.beginText()
    t.setFont(op["font"], size)
    t.setCharSpace(tc)
    for s, color in rs:
        t.setFillColorRGB(color[0] / 255.0, color[1] / 255.0, color[2] / 255.0)
        t.setTextOrigin(x, y)          # 구간마다 좌표를 직접 지정해 미리보기와 일치시킨다
        t.textOut(s)
        x += run_advance(s, op["font"], size, tc)
    c.drawText(t)


def draw_img(c, op):
    p = os.path.join(ASSETS, op["f"])
    if not os.path.exists(p):
        print("  !! MISSING ASSET:", op["f"])
        return
    ir = reader(op["f"])
    nw, nh = ir.getSize()
    w, h = op["w"], op["h"]
    if w is None and h is None:
        w = nw / 8.0
    if w is None:
        w = h * nw / nh
    if h is None:
        h = w * nh / nw
    x, y_top = op["x"], op["y"]
    if op["anchor"] == "c":
        x -= w / 2.0; y_top -= h / 2.0
    elif op["anchor"] == "tc":
        x -= w / 2.0
    # 좌상단 기준 -> PDF 좌하단 기준
    c.drawImage(ir, x * MM, (L.PAGE_H - y_top - h) * MM, w * MM, h * MM,
                mask="auto", preserveAspectRatio=False, anchor="sw")


def build(path=None):
    register_fonts()
    out = path or os.path.join(OUT, "poster-editable.pdf")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    c = canvas.Canvas(out, pagesize=(L.PAGE_W * MM, L.PAGE_H * MM),
                      pageCompression=1)
    c.setTitle("작은 참여가 큰 변화를 만듭니다")
    c.setAuthor("행복나눔 공익재단")
    c.setSubject("공익 프로젝트 참여 안내 포스터")

    n_img = n_txt = 0
    for op in L.build():
        if op["kind"] == "img":
            draw_img(c, op); n_img += 1
        elif op["kind"] == "runs":
            draw_runs(c, op, op["rs"]); n_txt += 1
        else:
            draw_runs(c, op, [(op["s"], op["color"])]); n_txt += 1

    c.showPage()
    c.save()
    print("pdf -> %s   images=%d  text=%d  %.0f KB"
          % (out, n_img, n_txt, os.path.getsize(out) / 1024))
    return out


if __name__ == "__main__":
    build()
