# -*- coding: utf-8 -*-
"""원본 일러스트 컷아웃을 정제해 assets/ 에 저장한다.

해결하는 문제
  1) 알파가 254 등으로 눌려 있어 전체가 반투명 -> 정규화
  2) 가장자리가 흐릿(soft matte) -> 알파 레벨 커브로 코어는 완전 불투명,
     배경은 완전 투명, 경계만 1~2px 부드럽게
  3) 마젠타 크로마키 잔상(spill) -> 디스필
  4) 가장자리 잘림 -> bbox 크롭 후 사방에 투명 패딩
"""
import os
import numpy as np
from PIL import Image

G = r"C:\Users\User\.codex\generated_images"
S1 = os.path.join(G, "01a01563-040f-7300-ae7b-96f5ed614d72")
OUT = r"C:\Claude\poster-editable\assets"
os.makedirs(OUT, exist_ok=True)


def normalize_alpha(a, lo=0.06, hi=0.88):
    """알파를 0~1로 펴고 레벨 커브를 적용해 매트를 단단하게 만든다."""
    a = a.astype(np.float32) / 255.0
    m = a.max()
    if m > 0:
        a = a / m
    a = (a - lo) / max(hi - lo, 1e-6)
    return np.clip(a, 0.0, 1.0)


def despill_magenta(rgb, alpha):
    """R,B 가 G 보다 과도하게 높은 픽셀에서 마젠타 성분을 뺀다."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mn = np.minimum(r, b)
    spill = np.clip(mn - g, 0, None)
    edge = (alpha < 0.98)                      # 경계에서만 보정
    k = np.where(edge, spill * 0.9, spill * 0.35)
    out = rgb.copy()
    out[..., 0] = np.clip(r - k, 0, 255)
    out[..., 2] = np.clip(b - k, 0, 255)
    return out


def bleed_edges(rgb, alpha, iterations=6):
    """투명 영역의 RGB를 이웃 색으로 채워, 축소 시 검은/흰 후광을 막는다."""
    rgb = rgb.astype(np.float32).copy()
    known = (alpha > 0.02).astype(np.float32)
    for _ in range(iterations):
        w = known
        acc = np.zeros_like(rgb)
        wacc = np.zeros_like(w)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            sr = np.roll(np.roll(rgb, dy, 0), dx, 1)
            sw = np.roll(np.roll(w, dy, 0), dx, 1)
            acc += sr * sw[..., None]
            wacc += sw
        fill = wacc > 0
        newpix = np.where(fill[..., None] & (known[..., None] < 0.5),
                          acc / np.maximum(wacc, 1e-6)[..., None], rgb)
        rgb = newpix
        known = np.maximum(known, fill.astype(np.float32))
    return rgb


def pad_to_safe(im, pct=0.035, minpx=12):
    """사방에 투명 여백을 넣어 가장자리 안티에일리어싱이 잘리지 않게 한다."""
    w, h = im.size
    p = max(minpx, int(round(max(w, h) * pct)))
    canvas = Image.new("RGBA", (w + 2 * p, h + 2 * p), (0, 0, 0, 0))
    canvas.paste(im, (p, p))
    return canvas


def clean_rgba(path, alpha_lo=0.06, alpha_hi=0.88, do_despill=True):
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    a = normalize_alpha(a, alpha_lo, alpha_hi)
    if do_despill:
        rgb = despill_magenta(rgb, a)
    rgb = bleed_edges(rgb, a)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255.0]).astype(np.uint8)
    res = Image.fromarray(out, "RGBA")
    bb = res.getbbox()
    if bb:
        res = res.crop(bb)
    return pad_to_safe(res)


def key_magenta(path, t0=45.0, t1=135.0):
    """마젠타 배경 이미지를 투명하게 키잉한다."""
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    score = np.minimum(r, b) - g                 # 마젠타일수록 큼
    a = 1.0 - np.clip((score - t0) / (t1 - t0), 0.0, 1.0)
    rgb = despill_magenta(rgb, a)
    rgb = bleed_edges(rgb, a)
    out = np.dstack([np.clip(rgb, 0, 255), a * 255.0]).astype(np.uint8)
    res = Image.fromarray(out, "RGBA")
    bb = res.getbbox()
    if bb:
        res = res.crop(bb)
    return res      # 배경 밴드는 패딩 없이 (좌우로 화면 밖까지 나가야 함)


JOBS = [
    ("illus_planting.png", clean_rgba, os.path.join(S1, "exec-7597b891-63d7-4f19-a080-4299b441bc92.png")),
    ("illus_boy_box.png",  clean_rgba, os.path.join(S1, "exec-1ffc8c67-ced5-44f5-97ca-216f503610fb.png")),
    ("illus_wheelchair.png", clean_rgba, os.path.join(S1, "exec-b30f691c-b234-4bec-b348-250ced42f6c6.png")),
    ("bg_cityscape.png",   key_magenta, os.path.join(S1, "exec-08a4ba71-683f-4713-820e-d01f4dd9857c.png")),
]

if __name__ == "__main__":
    for name, fn, src in JOBS:
        if not os.path.exists(src):
            print("MISSING", src)
            continue
        img = fn(src)
        dst = os.path.join(OUT, name)
        img.save(dst)
        print("%-24s %-12s %s" % (name, str(img.size), "%.0f KB" % (os.path.getsize(dst) / 1024)))
