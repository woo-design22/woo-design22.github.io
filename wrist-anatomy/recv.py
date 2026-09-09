# -*- coding: utf-8 -*-
"""
브라우저가 그린 프레임을 받아 파일로 떨어뜨리는 아주 작은 서버.

    python recv.py [포트] [폴더]

본문 형식: 첫 줄이 시작 번호, 그 아래 한 줄에 data URL 한 장씩.
base64 를 손으로 옮기면 큰 파일이 깨진다 — 원본 바이트로 받아 바로 쓴다.
"""
import base64
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8912
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join("out", "frames")
os.makedirs(OUT, exist_ok=True)

count = [0]


class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode("ascii", "replace")
        lines = body.split("\n")
        start = int(lines[0].strip())
        wrote = 0
        for k, line in enumerate(lines[1:]):
            if "," not in line:
                continue
            raw = base64.b64decode(line.split(",", 1)[1])
            with open(os.path.join(OUT, "f%05d.jpg" % (start + k)), "wb") as f:
                f.write(raw)
            wrote += 1
        count[0] += wrote
        msg = ("ok %d (total %d)" % (wrote, count[0])).encode()
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)
        print("[받음] %d~%d  (누적 %d)" % (start, start + wrote - 1, count[0]),
              flush=True)

    def log_message(self, *a):
        pass


print("[대기] http://localhost:%d  ->  %s" % (PORT, OUT), flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
