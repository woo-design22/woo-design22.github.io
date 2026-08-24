# -*- coding: utf-8 -*-
"""생성한 PDF가 '요소별로 잡히는' 구조인지 검증한다.

확인 항목
  1) XObject 가 전부 /Image 인가 (/Form 이 있으면 그 안의 내용이 통째로 한 덩어리가 된다)
  2) 페이지에 투명도 그룹(/Group)이 붙어 있지 않은가
  3) 콘텐츠 스트림에 벡터 패스/클리핑 연산자가 없는가
  4) 이미지 배치가 q...cm...Do...Q 로 하나씩 독립적으로 나가는가
  5) 한글 폰트가 임베드되고 ToUnicode 가 있는가
"""
import re
import sys

from pypdf import PdfReader

PATH = sys.argv[1] if len(sys.argv) > 1 else r"C:\Claude\poster-editable\out\poster-editable.pdf"

r = PdfReader(PATH)
print("pages:", len(r.pages))
pg = r.pages[0]
box = pg.mediabox
print("mediabox: %.1f x %.1f pt  (%.1f x %.1f mm)"
      % (float(box.width), float(box.height),
         float(box.width) * 25.4 / 72, float(box.height) * 25.4 / 72))

res = pg["/Resources"]
xo = res.get("/XObject", {})
kinds = {}
for name in xo:
    st = xo[name].get_object()
    kinds.setdefault(str(st.get("/Subtype")), []).append(name)
print("\nXObject 종류:")
for k, v in kinds.items():
    print("   %-10s %d개" % (k, len(v)))
forms = kinds.get("/Form", [])
print("   -> /Form 개수:", len(forms), "(0이어야 함)")

print("\n페이지 /Group:", pg.get("/Group", "없음  (없어야 함)"))

data = pg.get_contents().get_data().decode("latin-1")

# 이미지 배치 패턴
do_ops = re.findall(r"/(\w+)\s+Do", data)
print("\n이미지 배치(Do) 호출:", len(do_ops), " / 고유 XObject:", len(set(do_ops)))
qcm = len(re.findall(r"\bq\b[^q]*?\bcm\b[^q]*?\bDo\b[^q]*?\bQ\b", data, re.S))
print("q..cm..Do..Q 독립 배치 블록:", qcm)

# 벡터 패스 / 클리핑 연산자
checks = {
    "클리핑 (W n)":      len(re.findall(r"\bW\*?\s+n\b", data)),
    "사각형 패스 (re)":   len(re.findall(r"\bre\b", data)),
    "베지어 (c/v/y)":     len(re.findall(r"(?<![A-Za-z0-9])[cvy](?![A-Za-z0-9])\s", data)),
    "직선 (l)":           len(re.findall(r"(?<![A-Za-z0-9])l(?![A-Za-z0-9])\s", data)),
    "채우기/선 (f/S/B)":  len(re.findall(r"(?<![A-Za-z0-9])[fSB]\*?(?![A-Za-z0-9])\s", data)),
}
print("\n벡터 연산자 (전부 0이어야 미리캔버스에서 한 덩어리로 묶이지 않음):")
for k, v in checks.items():
    print("   %-18s %d %s" % (k, v, "OK" if v == 0 else "<-- 확인 필요"))

# 텍스트 블록
bt = len(re.findall(r"\bBT\b", data))
print("\n텍스트 블록(BT..ET):", bt)

# 폰트
fonts = res.get("/Font", {})
print("\n폰트:")
for name in fonts:
    f = fonts[name].get_object()
    sub = str(f.get("/Subtype"))
    base = str(f.get("/BaseFont"))
    tou = "/ToUnicode" in f
    desc_emb = False
    if "/DescendantFonts" in f:
        d = f["/DescendantFonts"][0].get_object()
        fd = d.get("/FontDescriptor", {})
        desc_emb = any(k in fd for k in ("/FontFile", "/FontFile2", "/FontFile3"))
    else:
        fd = f.get("/FontDescriptor", {})
        desc_emb = any(k in fd for k in ("/FontFile", "/FontFile2", "/FontFile3"))
    print("   %-6s %-14s %-34s 임베드=%-5s ToUnicode=%s"
          % (name, sub, base, desc_emb, tou))

txt = pg.extract_text() or ""
lines = [l for l in (t.strip() for t in txt.splitlines()) if l]
print("\n추출된 텍스트 %d줄 (편집 가능 여부 확인):" % len(lines))
for l in lines:
    print("   ", l)
