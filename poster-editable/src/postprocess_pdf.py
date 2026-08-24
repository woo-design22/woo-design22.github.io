# -*- coding: utf-8 -*-
"""PDF 뒷정리 — 임포터가 오해할 여지를 없앤다.

  1) 이미지 XObject 이름이 reportlab 기본값인 '/FormXob.<해시>' 라서 이름만 보고
     Form 으로 오판할 수 있다 -> /Im0, /Im1 ... 로 바꾼다. (Subtype 은 원래 /Image)
  2) reportlab 이 넣는 빈 텍스트 블록 'BT /F1 12 Tf 14.4 TL ET' 을 지운다.
     글자는 없지만 임베드되지 않은 Helvetica 를 참조한다.
  3) 참조가 사라진 /F1 폰트 항목을 리소스에서 제거한다.
"""
import re
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject


def clean(src, dst):
    reader = PdfReader(src)
    writer = PdfWriter()
    writer.append(reader)

    page = writer.pages[0]
    res = page["/Resources"]
    data = page.get_contents().get_data().decode("latin-1")

    # 1) 이미지 XObject 이름 정리
    xo = res["/XObject"].get_object()
    old_names = [n for n in xo.keys()]
    new_xo = DictionaryObject()
    renamed = 0
    for i, old in enumerate(old_names):
        new = "/Im%d" % i
        new_xo[NameObject(new)] = xo.raw_get(old)
        if old != new:
            data = re.sub(re.escape(old) + r"(?=[\s/\[<(])", new, data)
            renamed += 1
    res[NameObject("/XObject")] = new_xo

    # 2) 빈 텍스트 블록 제거
    before = len(data)
    data = re.sub(r"BT\s+/F1\s+[\d.]+\s+Tf\s+[\d.]+\s+TL\s+ET\s*", "", data)
    removed_preamble = before != len(data)

    # 3) 더 이상 참조되지 않는 폰트 제거
    fonts = res.get("/Font")
    fonts = fonts.get_object() if fonts is not None else None
    dropped = []
    if fonts is not None:
        for fname in [n for n in fonts.keys()]:
            if not re.search(re.escape(fname) + r"\s+[\d.]+\s+Tf", data):
                del fonts[NameObject(fname)]
                dropped.append(fname)

    stream = DecodedStreamObject()
    stream.set_data(data.encode("latin-1"))
    page[NameObject("/Contents")] = writer._add_object(stream)

    page.compress_content_streams()          # 새로 쓴 스트림을 다시 압축
    writer.compress_identical_objects()
    with open(dst, "wb") as f:
        writer.write(f)

    print("이름 정리한 XObject : %d개" % renamed)
    print("빈 텍스트 블록 제거 : %s" % ("예" if removed_preamble else "없음"))
    print("제거한 폰트         : %s" % (", ".join(dropped) if dropped else "없음"))
    return dst


if __name__ == "__main__":
    s = sys.argv[1] if len(sys.argv) > 1 else r"C:\Claude\poster-editable\out\poster-editable.pdf"
    d = sys.argv[2] if len(sys.argv) > 2 else s
    clean(s, d)
