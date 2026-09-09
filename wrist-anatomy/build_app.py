# -*- coding: utf-8 -*-
"""
data/wrist.bin + data/wrist.json 을 index.html 의 데이터 블록에 심는다.

    python build_app.py

집 규칙이 "폴더 하나에 index.html 한 개"이고 file:// 에서도 돌아야 한다.
file:// 에서는 fetch 가 막히므로 기하 데이터를 밖에 두면 그림이 통째로 안 나온다.
그래서 fly-brain 이 하는 것과 같이 **파일 안에 넣는다**(바이너리는 base64).

수치를 바꾸려면 extract.py 를 먼저 다시 돌린 뒤 이 스크립트를 실행한다.
"""

import base64
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, "index.html")
BIN = os.path.join(HERE, "data", "wrist.bin")
JSN = os.path.join(HERE, "data", "wrist.json")

for p in (HTML, BIN, JSN):
    if not os.path.exists(p):
        sys.exit("없다: %s  (extract.py 를 먼저 돌렸는지 확인할 것)" % p)

with open(BIN, "rb") as f:
    raw = f.read()
b64 = base64.b64encode(raw).decode("ascii")

with open(JSN, encoding="utf-8") as f:
    meta = json.load(f)

# 브라우저는 이름·층·오프셋만 있으면 된다. 사람이 읽으라고 넣은 들여쓰기와
# 주석용 항목은 빼서 용량을 줄인다.
slim = {
    "quant": meta["quant"],
    "layerOrder": meta["layerOrder"],
    "parts": [{"name": p["name"], "layer": p["layer"],
               "vOff": p["vOff"], "vCount": p["vCount"],
               "tOff": p["tOff"], "tCount": p["tCount"],
               "wide": p["wide"]} for p in meta["parts"]],
    "landmarks": meta.get("landmarks", []),
}
js = json.dumps(slim, ensure_ascii=False, separators=(",", ":"))

with open(HTML, encoding="utf-8") as f:
    html = f.read()


def put(html, el_id, body):
    """<script id="..."> 안쪽만 통째로 갈아 끼운다."""
    pat = re.compile(
        r'(<script id="%s"[^>]*>)(.*?)(</script>)' % re.escape(el_id),
        re.S)
    if not pat.search(html):
        sys.exit("index.html 에서 '%s' 블록을 못 찾았다." % el_id)
    # 치환문에서 백슬래시·\g 가 해석되지 않도록 함수로 넣는다
    return pat.sub(lambda m: m.group(1) + body + m.group(3), html, count=1)


html = put(html, "wrist-json", js)
html = put(html, "wrist-bin", b64)

with open(HTML, "w", encoding="utf-8") as f:
    f.write(html)

n = len(meta["parts"])
verts = sum(p["vCount"] for p in meta["parts"])
print("[심음] 부위 %d · 정점 %d · 표지점 %d"
      % (n, verts, len(meta.get("landmarks", []))))
print("[크기] bin %.2f MB -> base64 %.2f MB"
      % (len(raw) / 1048576.0, len(b64) / 1048576.0))
print("[결과] index.html %.2f MB" % (os.path.getsize(HTML) / 1048576.0))
