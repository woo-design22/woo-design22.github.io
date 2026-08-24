# -*- coding: utf-8 -*-
"""아이콘/도형 렌더링 공용 헬퍼.

핵심 원칙 — 가장자리가 흐려지거나 잘리는 문제를 구조적으로 없앤다.
  * 모든 형태는 먼저 SS배 확대한 8bit 마스크(L)에 그린 뒤 LANCZOS로 축소한다.
  * 색은 마스크를 알파로 삼아 '단색 RGB'에 입힌다. RGB가 균일하므로 축소 과정에서
    투명 픽셀의 쓰레기 색이 새어나오는 후광(fringe)이 원리적으로 발생하지 않는다.
  * 선(stroke)을 쓰지 않고 전부 '채워진 폴리곤'으로 만든다. 베지어를 촘촘히
    샘플링하므로 선이 끊기거나 이음매가 어긋나지 않는다.
  * 저장 직전 사방에 투명 여백을 넣어 안티에일리어싱 경계가 비트맵 끝에 닿지 않게 한다.
"""
import math
from PIL import Image, ImageDraw

SS = 8                      # 슈퍼샘플 배율


# ---------------------------------------------------------------- 경로/베지어
def cub(p0, p1, p2, p3, n=48):
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append((
            m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
            m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1],
        ))
    return out


def quad(p0, p1, p2, n=36):
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append((m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0],
                    m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]))
    return out


def path(cmds):
    """[('M',x,y), ('L',x,y), ('C',x1,y1,x2,y2,x,y), ('Q',x1,y1,x,y), ('Z',)] -> 점 리스트"""
    pts, cur, start = [], (0, 0), (0, 0)
    for c in cmds:
        op = c[0]
        if op == 'M':
            cur = start = (c[1], c[2]); pts.append(cur)
        elif op == 'L':
            cur = (c[1], c[2]); pts.append(cur)
        elif op == 'C':
            seg = cub(cur, (c[1], c[2]), (c[3], c[4]), (c[5], c[6]))
            pts.extend(seg[1:]); cur = seg[-1]
        elif op == 'Q':
            seg = quad(cur, (c[1], c[2]), (c[3], c[4]))
            pts.extend(seg[1:]); cur = seg[-1]
        elif op == 'Z':
            pts.append(start); cur = start
    return pts


def mirror_x(pts, axis):
    return [(2 * axis - x, y) for (x, y) in pts]


# ---------------------------------------------------------------- 마스크 캔버스
class Mask:
    """유닛(기본 100x100) 좌표계로 그리는 슈퍼샘플 마스크."""

    def __init__(self, w, h, unit=100.0):
        self.w, self.h, self.unit = w, h, unit
        self.img = Image.new("L", (int(w * SS), int(h * SS)), 0)
        self.d = ImageDraw.Draw(self.img)
        self.sx = w * SS / unit
        self.sy = h * SS / unit

    def _p(self, pts):
        return [(x * self.sx, y * self.sy) for (x, y) in pts]

    def poly(self, pts, v=255):
        self.d.polygon(self._p(pts), fill=v)

    def circle(self, cx, cy, r, v=255):
        self.d.ellipse([(cx - r) * self.sx, (cy - r) * self.sy,
                        (cx + r) * self.sx, (cy + r) * self.sy], fill=v)

    def ellipse(self, cx, cy, rx, ry, v=255):
        self.d.ellipse([(cx - rx) * self.sx, (cy - ry) * self.sy,
                        (cx + rx) * self.sx, (cy + ry) * self.sy], fill=v)

    def rrect(self, x0, y0, x1, y1, r, v=255):
        a, b = x0 * self.sx, y0 * self.sy
        c, d = x1 * self.sx, y1 * self.sy
        # PIL은 반지름이 변의 절반 이상이면 예외를 낸다 -> 살짝 아래로 클램프
        rr = min(r * self.sx, (c - a) / 2.0 - 0.5, (d - b) / 2.0 - 0.5)
        self.d.rounded_rectangle([a, b, c, d], radius=max(rr, 0.0), fill=v)

    def rect(self, x0, y0, x1, y1, v=255):
        self.d.rectangle([x0 * self.sx, y0 * self.sy, x1 * self.sx, y1 * self.sy], fill=v)

    def thick_line(self, pts, w, v=255, caps=True):
        """폴리라인을 '채워진' 두꺼운 선으로. 이음매마다 원을 찍어 끊김을 없앤다."""
        p = self._p(pts)
        ww = w * self.sx
        self.d.line(p, fill=v, width=int(round(ww)), joint="curve")
        if caps:
            r = ww / 2.0
            for (x, y) in (p[0], p[-1]):
                self.d.ellipse([x - r, y - r, x + r, y + r], fill=v)

    def arc_band(self, cx, cy, r_out, r_in, a0, a1, v=255, arrow=False, arrow_ext=1.55, steps=220):
        """도넛 섹터. arrow=True면 a1 끝에 화살촉을 붙인다. 각도는 도(deg), 시계방향."""
        pts = []
        for i in range(steps + 1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            pts.append((cx + r_out * math.cos(a), cy + r_out * math.sin(a)))
        for i in range(steps, -1, -1):
            a = math.radians(a0 + (a1 - a0) * i / steps)
            pts.append((cx + r_in * math.cos(a), cy + r_in * math.sin(a)))
        self.poly(pts, v)
        if arrow:
            mid = (r_out + r_in) / 2.0
            half = (r_out - r_in) / 2.0 * arrow_ext
            a = math.radians(a1)
            sgn = 1.0 if a1 >= a0 else -1.0
            tan = (-math.sin(a) * sgn, math.cos(a) * sgn)          # 진행 방향
            nrm = (math.cos(a), math.sin(a))                        # 반지름 방향
            base = (cx + mid * nrm[0], cy + mid * nrm[1])
            tip = (base[0] + tan[0] * half * 1.75, base[1] + tan[1] * half * 1.75)
            b1 = (base[0] + nrm[0] * half, base[1] + nrm[1] * half)
            b2 = (base[0] - nrm[0] * half, base[1] - nrm[1] * half)
            self.poly([b1, tip, b2], v)

    def get(self, w=None, h=None):
        """최종 해상도 마스크(L)."""
        return self.img.resize((int(w or self.w), int(h or self.h)), Image.LANCZOS)

    def clip_to(self, other):
        """other 마스크와 교집합만 남긴다 (원 밖으로 삐져나간 선 정리용)."""
        from PIL import ImageChops
        self.img = ImageChops.darker(self.img, other.img)
        self.d = ImageDraw.Draw(self.img)
        return self

    def rotated(self, deg, w=None, h=None):
        """SS 상태에서 회전한 뒤 축소한 마스크(L)를 반환."""
        r = self.img.rotate(deg, resample=Image.BICUBIC, expand=True)
        bb = r.getbbox()
        if bb:
            r = r.crop(bb)
        tw = int(w or r.width / SS)
        th = int(h or r.height / SS)
        return r.resize((max(tw, 1), max(th, 1)), Image.LANCZOS)


# ---------------------------------------------------------------- 색 입히기
def colorize(mask, rgb):
    """단색 RGB + 마스크 알파 -> 후광 없는 RGBA."""
    img = Image.new("RGBA", mask.size, tuple(rgb) + (255,))
    img.putalpha(mask)
    return img


def linear_gradient(size, c0, c1, angle_deg=45.0):
    import numpy as np
    w, h = size
    a = math.radians(angle_deg)
    dx, dy = math.cos(a), math.sin(a)
    xs = np.linspace(0.0, 1.0, w)[None, :] * dx
    ys = np.linspace(0.0, 1.0, h)[:, None] * dy
    t = xs + ys
    t = (t - t.min()) / max(float(t.max() - t.min()), 1e-6)
    c0 = np.array(c0, dtype=np.float32)
    c1 = np.array(c1, dtype=np.float32)
    arr = c0[None, None, :] + (c1 - c0)[None, None, :] * t[..., None]
    return Image.fromarray(arr.astype("uint8"), "RGB")


def gradient_fill(mask, c0, c1, angle_deg=45.0):
    g = linear_gradient(mask.size, c0, c1, angle_deg).convert("RGBA")
    g.putalpha(mask)
    return g


def stack(*layers):
    base = Image.new("RGBA", layers[0].size, (0, 0, 0, 0))
    for l in layers:
        base = Image.alpha_composite(base, l)
    return base


def pad(im, pct=0.06, minpx=8):
    w, h = im.size
    p = max(minpx, int(round(max(w, h) * pct)))
    c = Image.new("RGBA", (w + 2 * p, h + 2 * p), (0, 0, 0, 0))
    c.paste(im, (p, p))
    return c
