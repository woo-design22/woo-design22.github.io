# -*- coding: utf-8 -*-
"""build_poi.py — 받아 둔 장소 목록 → 검색용 색인 data/poi/poi.json (D-99).

받는 것은 `fetch_poi.py`(심평원 병의원·약국)이고, 여기서는 **검색이 쓸 수 있는 모양**으로
줄인다. 원천이 무엇이든(앞으로 다른 업종이 붙어도) 이 파일이 한 모양으로 만든다.

굽는 모양 — 한 줄에 다섯 칸, 이름은 짧게:
  {"v":1, "items":[[이름, 위도, 경도, 지번주소, 종류], ...]}
좌표는 소수 다섯 자리(약 1m)로 자른다 — 자릿수를 줄이면 파일이 눈에 띄게 작아진다.

**서비스 지역 밖은 버린다**(D-88 의 상자와 같다). 좌표가 없는 줄도 버린다 —
찾아 놓고 길을 못 찾으면 없느니만 못하다.

사용: python pipeline/build_poi.py
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

SRC_DIR = os.path.join(C.RAW, 'poi')
OUT = os.path.join(C.DATA, 'poi', 'poi.json')

# 서비스권 상자 (engine/geocode.js 의 AREAS 와 같은 값 — 한쪽만 고치면 어긋난다)
AREAS = [
    (36.70, 38.35, 126.35, 127.95),   # 수도권
    (35.00, 35.65, 128.75, 129.45),   # 부산·울산·김해
    (35.60, 36.25, 128.25, 128.95),   # 대구·경산·구미
    (35.05, 35.25, 126.70, 127.00),   # 광주
    (36.20, 36.50, 127.25, 127.55),   # 대전
]


def in_area(lat, lon):
    return any(a <= lat <= b and c <= lon <= d for a, b, c, d in AREAS)


def num(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def rows_from(path, kind):
    try:
        raw = json.load(io.open(path, encoding='utf-8'))
    except Exception as e:
        C.log('  %s 못 읽음 — %s' % (os.path.basename(path), str(e)[:50]))
        return []
    out = []
    for it in raw:
        name = str(it.get('yadmNm') or '').strip()
        lat, lon = num(it.get('YPos')), num(it.get('XPos'))
        if not name or lat is None or lon is None:
            continue
        if not in_area(lat, lon):
            continue
        addr = str(it.get('addr') or '').strip()
        out.append([name, round(lat, 5), round(lon, 5), addr, kind])
    return out


def main():
    if not os.path.isdir(SRC_DIR):
        C.die('%s 가 없다. 먼저 `python pipeline/fetch_poi.py` 를 돌린다.' % SRC_DIR)
    items, seen = [], set()
    for fn, kind in (('hosp.json', '병의원'), ('pharm.json', '약국')):
        p = os.path.join(SRC_DIR, fn)
        if not os.path.exists(p):
            C.log('  %s 없음 — 건너뜀' % fn)
            continue
        got = rows_from(p, kind)
        for r in got:
            key = r[0] + '|' + str(r[1]) + '|' + str(r[2])
            if key in seen:
                continue
            seen.add(key)
            items.append(r)
        C.log('  %s — %d건' % (fn, len(got)))
    if not items:
        C.die('쓸 수 있는 줄이 없다. fetch_poi.py 의 승인 상태를 확인할 것.')
    items.sort(key=lambda r: r[0])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps({'v': 1, 'note': '상호 검색용 장소 목록 — 이름·위도·경도·지번주소·종류',
                    'source': '건강보험심사평가원(공공데이터포털)', 'items': items},
                   ensure_ascii=False, separators=(',', ':')))
    C.log('== 장소 %d곳 → %s (%.1fMB) ==' % (len(items), OUT, os.path.getsize(OUT) / 1e6))


if __name__ == '__main__':
    main()
