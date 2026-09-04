# -*- coding: utf-8 -*-
"""build_congestion.py — 지하철혼잡도 원천 파일 → data/subway/congestion.json.

원천은 서울교통공사_지하철혼잡도정보(열린데이터광장 OA-12928, **인증키 불필요**).
  컬럼: 요일구분, 호선, 역번호, 출발역, 상하구분, 5시30분 … 00시30분 (30분 간격 39칸)
  값  : 혼잡도(%) = 정원 대비 승차인원. **좌석 만석이 34%**

이 파일이 만들어지면 `node --test tests/*.test.js` 의 검증이 [SIM] → **[REAL]** 로 바뀐다.

만드는 키 세 가지
  "6|월곡|weekday|상선"   방향별 원천값 그대로
  "6|월곡|weekday"        두 방향 중 **더 붐비는 쪽**(칸마다 최댓값). 화면 기본값
  "6|전체|weekday"        그 호선에서 가장 붐비는 지점(칸마다 전 역·전 방향 최댓값) = 호선 피크

사용법
  python build_congestion.py                 # 가장 최근 원천으로
  python build_congestion.py --all           # 받아 둔 분기를 전부 (기간별 키가 따로 생긴다)
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

SRC_DIR = os.path.join(C.RAW, 'open', 'congestion')
OUT = os.path.join(C.DATA, 'subway', 'congestion.json')

DAY_MAP = {'평일': 'weekday', '토요일': 'saturday', '일요일': 'sunday',
           '일요일(공휴일)': 'sunday', '공휴일': 'sunday', '토': 'saturday', '일': 'sunday'}


# 분기마다 머리글이 다르다(실측):
#   csv  2025-11 : 요일구분, 호선, 역번호, 출발역, 상하구분, 5시30분 …
#   xlsx 2026-03 : 구분,     호선, 역번호, 역명,   상하구분, 05:30~06:00 …
# 이름과 시각 표기를 둘 다 받는다. 못 알아보면 조용히 넘어가지 말고 그 자리에서 멈춘다.
COL_ALIASES = {
    '요일구분': ['요일구분', '구분'],
    '호선': ['호선'],
    '역명': ['출발역', '역명'],
    '상하구분': ['상하구분', '상하선구분'],
}
TIME_PATTERNS = [
    r'^\s*(\d{1,2})시\s*(\d{1,2})분\s*$',          # 5시30분
    r'^\s*(\d{1,2}):(\d{2})\s*~',                   # 05:30~06:00
    r'^\s*(\d{1,2}):(\d{2})\s*$',                   # 05:30
]


def parse_time_header(cells):
    """머리글의 시각 열 → 시작 분·간격·칸 수. 어느 표기든 「그 칸이 시작하는 시각」을 쓴다."""
    times = []
    first = None
    for i, c in enumerate(cells):
        m = None
        for pat in TIME_PATTERNS:
            m = re.match(pat, str(c))
            if m:
                break
        if not m:
            continue
        if first is None:
            first = i
        h, mi = int(m.group(1)), int(m.group(2))
        t = h * 60 + mi
        # 자정을 넘으면 24시를 더해 하루가 이어지게 둔다(00시00분 → 1440).
        if times and t < times[-1]:
            t += 1440
        times.append(t)
    if not times:
        raise RuntimeError('시각 열을 못 찾았다. 머리글: %s' % ', '.join(map(str, cells[:8])))
    slots = [times[i + 1] - times[i] for i in range(len(times) - 1)]
    slot = min(slots) if slots else 30
    return first, times[0], slot, len(times)


def canon_station(name):
    """부역명(괄호)을 떼서 다른 원천과 이름을 맞춘다.
    혼잡도는 「월곡」, 승하차는 「월곡(동덕여대)」로 적는다 — 사양서 6.2-② 의 그 버그다."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', str(name or '').strip()).strip() or str(name or '').strip()


def num(v):
    try:
        return round(float(str(v).strip()), 1)
    except (TypeError, ValueError):
        return 0.0


def load_file(path):
    """파일 하나 → {start, slot, n, rows, skipped}.
    xlsx 는 평일·토·일이 각각 다른 장이라 **모든 장**을 합친다(common.read_tables)."""
    sheets = C.read_tables(path)
    merged, start = [], None
    slot = n = tcol = None
    skipped_all = 0
    for name, rows in sheets:
        if not rows:
            continue
        got = _load_sheet(path, name, rows)
        if got is None:
            continue
        if start is None:
            start, slot, n = got['start'], got['slot'], got['n']
        elif (got['start'], got['slot'], got['n']) != (start, slot, n):
            C.log('  ! %s [%s] 는 시각 격자가 달라 건너뛴다' % (os.path.basename(path), name))
            continue
        merged.extend(got['rows'])
        skipped_all += got['skipped']
    if start is None:
        raise RuntimeError('읽을 수 있는 장이 없다: %s' % path)
    return {'start': start, 'slot': slot, 'n': n, 'rows': merged, 'skipped': skipped_all}


def _load_sheet(path, sheet_name, rows):
    head = rows[0]
    tcol, start, slot, n = parse_time_header(head)
    seen = {re.sub(r'\s+', '', str(c)): i for i, c in enumerate(head[:tcol])}
    idx, missing = {}, []
    for want, names in COL_ALIASES.items():
        hit = next((seen[nm] for nm in names if nm in seen), None)
        if hit is None:
            missing.append('%s(%s 중 하나)' % (want, '/'.join(names)))
        else:
            idx[want] = hit
    if missing:
        raise RuntimeError('컬럼을 못 찾았다: %s (머리글: %s)' % (', '.join(missing), ', '.join(map(str, head[:8]))))

    out, skipped = [], 0
    for r in rows[1:]:
        if len(r) < tcol + n:
            skipped += 1
            continue
        day = DAY_MAP.get(re.sub(r'\s+', '', str(r[idx['요일구분']])))
        if not day:
            skipped += 1
            continue
        line = re.sub(r'[^0-9]', '', str(r[idx['호선']])) or str(r[idx['호선']]).strip()
        out.append({
            'day': day,
            'line': line,
            'station': canon_station(r[idx['역명']]),
            'dir': str(r[idx['상하구분']]).strip(),
            'values': [num(r[tcol + i]) for i in range(n)],
        })
    return {'start': start, 'slot': slot, 'n': n, 'rows': out, 'skipped': skipped}


def build(files):
    grid, meta_src = {}, []
    start = slot = n = None
    for path in files:
        d = load_file(path)
        if start is None:
            start, slot, n = d['start'], d['slot'], d['n']
        elif (d['start'], d['slot'], d['n']) != (start, slot, n):
            C.log('  ! %s 는 시각 격자가 다르다(%d분 시작 %d칸) — 건너뛴다'
                  % (os.path.basename(path), d['start'], d['n']))
            continue
        meta_src.append({'file': os.path.basename(path), 'rows': len(d['rows']), 'skipped': d['skipped']})
        C.log('  %s — %d행%s' % (os.path.basename(path), len(d['rows']),
                                 ', 건너뜀 %d행' % d['skipped'] if d['skipped'] else ''))

        for r in d['rows']:
            base = '%s|%s|%s' % (r['line'], r['station'], r['day'])
            grid['%s|%s' % (base, r['dir'])] = r['values']
            # 두 방향 중 더 붐비는 쪽. 방향을 모르는 화면(경로 목록 요약)이 이걸 쓴다.
            cur = grid.get(base)
            grid[base] = r['values'] if cur is None else [max(a, b) for a, b in zip(cur, r['values'])]
            # 호선 전체에서 가장 붐비는 지점 = 그 호선의 피크
            allk = '%s|전체|%s' % (r['line'], r['day'])
            cur = grid.get(allk)
            grid[allk] = r['values'] if cur is None else [max(a, b) for a, b in zip(cur, r['values'])]

    return {
        'slotMinutes': slot,
        'startMinutes': start,
        'slots': n,
        'unit': '혼잡도(%) = 정원 대비 승차인원. 좌석 만석 = 34%',
        'source': '서울교통공사_지하철혼잡도정보 (서울 열린데이터광장 OA-12928, 인증키 불필요)',
        'files': meta_src,
        'note': '「호선|전체|요일」은 그 호선 전 역·전 방향의 칸별 최댓값이다(= 그 호선 피크). '
                '「호선|역|요일」은 상·하선 중 더 붐비는 쪽.',
        'grid': grid,
    }


def main():
    ap = argparse.ArgumentParser(description='지하철혼잡도 원천 → congestion.json')
    ap.add_argument('--all', action='store_true', help='받아 둔 분기를 전부 합친다')
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        C.die('%s 가 없다. 먼저 `python pipeline/fetch_open_files.py --only congestion` 을 돌린다.' % SRC_DIR)
    files = sorted(os.path.join(SRC_DIR, f) for f in os.listdir(SRC_DIR)
                   if f.lower().endswith(('.csv', '.xlsx')))
    if not files:
        C.die('%s 에 파일이 없다.' % SRC_DIR)
    if not args.all:
        files = files[-1:]                      # 이름에 날짜가 들어 있어 정렬하면 마지막이 최신

    C.log('== 혼잡도 원천 %d개 ==' % len(files))
    doc = build(files)
    C.save_json(OUT, doc)
    lines = sorted({k.split('|')[0] for k in doc['grid']}, key=lambda s: (len(s), s))
    C.log('== 키 %d개 / 호선 %s → %s ==' % (len(doc['grid']), ', '.join(lines), OUT))
    C.log('   이제 `node --test tests/*.test.js` 가 [REAL] 모드로 돈다.')


if __name__ == '__main__':
    main()
