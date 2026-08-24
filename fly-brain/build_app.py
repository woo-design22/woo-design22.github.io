# -*- coding: utf-8 -*-
"""run_multi.py(또는 run_sugar.py)가 만든 results/*_summary.json을 index.html의 <script id="fly-data"> 안에 넣는다.

    python build_app.py                                  # 기본: results/multi_summary.json
    python build_app.py results/sugarR_200Hz_x30_summary.json
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
src = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / 'results' / 'multi_summary.json')
html_path = HERE / 'index.html'

data = src.read_text(encoding='utf-8').strip()
# HTML 안의 <script> 블록에 넣으므로 '</script>'가 JSON 문자열에 들어 있으면 깨진다 (현재 데이터엔 없지만 안전장치)
data = data.replace('</', '<\/')
html = html_path.read_text(encoding='utf-8')
pat = re.compile(r'(<script id="fly-data" type="application/json">)(.*?)(</script>)', re.S)
assert pat.search(html), 'fly-data 블록을 찾지 못했다'
html = pat.sub(lambda m: m.group(1) + data + m.group(3), html, count=1)
html_path.write_text(html, encoding='utf-8')
print(f'{src.name} ({len(data) // 1024} KB) -> {html_path.name}')
