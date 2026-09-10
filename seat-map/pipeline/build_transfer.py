# -*- coding: utf-8 -*-
"""환승 승차위치 → 앱이 쓰는 표 (D-116).

원천(fetch_transfer.py 가 받아 둔 CSV)의 한 줄은 이렇게 읽는다:
  서울역 · 1호선 · 「시청 방면」 열차에서 **10호차 4번 문**으로 내리면
  4호선 「숙대입구 방면」 승강장의 1호차 1번 문 자리로 나오고, 걸리는 시간은 3분 34초.

★ 무엇을 열쇠로 삼나 ★ (노선 | 갈아타는 역 | 갈아탈 노선) 이고, **방면은 값 안에 목록으로** 둔다.
  방향 라벨(상선/하선)로 잇지 않는다 — 노선마다 뜻이 달라 또 어긋난다(D-108).
  처음엔 방면을 열쇠에 넣었다가 한 짝도 못 찾았다: 우리 그래프의 노선 배열은 지선·급행이
  이어붙어 있어 **배열의 다음 역이 실제 다음 역이 아닐 수 있다**(1호선 신길 다음이 신도림으로
  나온다 — 실제로는 영등포가 사이에 있다). 그래서 방면은 앱이 고른다:
  진행 방향 배열에서 **내리는 자리보다 뒤에 나오는** 방면을 가진 항목이 내 방향이다.

★ 이름을 맞춰야 하는 곳 ★ 원천의 호선 표기가 우리 그래프와 다르다
  (경의선 → 경의중앙선, 공항철도 → 인천국제공항선 …). LINE_MAP 이 정본이고,
  **모르는 표기가 나오면 조용히 버리지 않고 세어서 로그에 남긴다**.

내는 것: data/subway/transfer-pos.json
  {"pairs": {"<노선>|<환승역>|<갈아탈 노선>": [{"toward":"시청","off":"10-4","on":"1-1","sec":214}, …]}}
사용: python pipeline/build_transfer.py
"""
import collections
import csv
import io
import re
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

RAW = os.path.join(C.RAW, 'seoulrail')
SRC = os.path.join(RAW, 'transfer.csv')
STN = os.path.join(RAW, 'stations.json')
OUT = os.path.join(C.DATA, 'subway', 'transfer-pos.json')

# 원천 호선 표기 → 우리 그래프의 노선 이름
LINE_MAP = {
    '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
    '9': '9호선', '경강선': '경강선', '경춘선': '경춘선', '수인분당선': '수인분당선',
    '서해선': '서해선', '신림선': '신림선', '신분당선': '신분당선',
    '경의선': '경의중앙선', '공항철도': '인천국제공항선',
    '우이신설경전철': '우이신설선', '의정부경전철': '의정부',
    '인천선': '인천지하철 1호선', '인천2': '인천지하철 2호선',
    # 환승종료역 쪽 LINE_NUM 은 표기가 또 다르다(같은 노선을 다르게 적는다)
    '인천2호선': '인천지하철 2호선', '김포도시철도': '김포도시철도', '용인경전철': '에버라인',
}
# 역 코드 앞 두 자리·LINE_NUM 표기 → 같은 이름 (환승종료역은 코드로만 온다)
STN_LINE_MAP = dict(LINE_MAP)
for n in range(1, 10):
    STN_LINE_MAP['%02d호선' % n] = LINE_MAP[str(n)]


# ★ 이름을 엔진과 **같은 규칙**으로 다듬는다 ★ 그래프는 「신길역」, 원천은 「신길」이라
# 그대로 두면 한 짝도 안 맞는다(실측). engine/transfer.js 의 canonStopName 과 같은 규칙이다 —
# 한쪽만 고치면 열쇠가 어긋나므로 규칙이 바뀌면 두 곳을 함께 본다.
SUFFIX = re.compile(r'(역앞|역|정류장|승강장|.{1,3}방면)$')


def canon(s):
    t = re.sub(r'\(.*?\)', '', str(s or '')).replace(' ', '')
    for _ in range(4):
        nxt = SUFFIX.sub('', t)
        if nxt == t or not nxt:
            break
        t = nxt
    return t


def secs(t):
    """'03:34' → 214초. 빈칸이면 None."""
    p = str(t or '').split(':')
    try:
        return int(p[0]) * 60 + int(p[1])
    except (ValueError, IndexError):
        return None


def pos(car, door):
    """('10','4') → '10-4'. 'All' 은 「아무 칸이나」라는 뜻이라 그대로 남긴다."""
    car, door = str(car or '').strip(), str(door or '').strip()
    if not car:
        return None
    if car.lower() == 'all':
        return 'All'
    return car + ('-' + door if door and door.lower() != 'all' else '')


def read_csv(path):
    for enc in ('utf-8-sig', 'cp949'):
        try:
            return list(csv.DictReader(io.open(path, encoding=enc)))
        except UnicodeDecodeError:
            continue
    C.die('%s 인코딩을 못 읽었다' % path)


def main():
    if not os.path.exists(SRC):
        C.die('%s 가 없다. fetch_transfer.py 를 먼저 돌린다.' % SRC)
    rows = read_csv(SRC)
    stn = {str(x.get('STATION_CD')): x for x in json.load(io.open(STN, encoding='utf-8'))}
    C.log('== 환승 승차위치 ==')
    C.log('  원천 %d줄 · 역 코드표 %d개' % (len(rows), len(stn)))

    pairs = {}
    unknown_line = collections.Counter()
    unknown_code = 0
    no_time = 0
    for r in rows:
        ln = LINE_MAP.get(str(r.get('환승시작 호선') or '').strip())
        if not ln:
            unknown_line[str(r.get('환승시작 호선'))] += 1
            continue
        st = str(r.get('환승시작역') or '').strip()
        # 「시청 방면」 → 다음 역 이름. 이것이 우리 그래프에서 방향을 가르는 열쇠다.
        nxt = str(r.get('하차 열차 방면') or '').replace('방면', '').strip()
        end = stn.get(str(r.get('환승종료역') or '').strip())
        if not (st and nxt and end):
            unknown_code += 1
            continue
        to_ln = STN_LINE_MAP.get(str(end.get('LINE_NUM') or '').strip())
        if not to_ln:
            unknown_line[str(end.get('LINE_NUM'))] += 1
            continue
        sec = secs(r.get('소요시간'))
        # 「00:00」은 같은 승강장이라 걸어갈 것이 없다는 뜻이다(금천구청 1호선 지선 갈아타기).
        # 「0분 걸린다」고 적으면 화면이 이상해지므로 시간 없음으로 다룬다 — 자리는 그대로 쓴다.
        if sec == 0:
            sec = None
        if sec is None:
            no_time += 1
        rec = {'off': pos(r.get('하차위치(호차)'), r.get('하차위치(문)')),
               'on': pos(r.get('환승 승차위치(호차)'), r.get('환승 승차위치(문)'))}
        if sec is not None:
            rec['sec'] = sec
        if not rec['off']:
            continue
        # 한 열쇠에 방면이 둘(상·하행)이라 목록으로 담는다. 같은 방면이 여러 줄인 것은
        # 갈아탈 열차의 방면이 또 둘인 경우다 — 내리는 자리는 같으니 짧은 쪽 시간만 남긴다.
        rec['toward'] = canon(nxt)
        key = '%s|%s|%s' % (ln, canon(st), to_ln)
        lst = pairs.setdefault(key, [])
        same = None
        for it in lst:
            if it['toward'] == rec['toward'] and it['off'] == rec['off']:
                same = it
                break
        if same is None:
            lst.append(rec)
        elif rec.get('sec') is not None and rec['sec'] < same.get('sec', 10 ** 9):
            same['sec'] = rec['sec']
            same['on'] = rec['on']

    C.save_json(OUT, {
        'note': '환승할 때 어느 칸·어느 문에서 내리면 갈아타는 길이 가장 짧은지 '
                '(서울교통공사 「서울 도시철도 환승정보」). off=내릴 자리, on=갈아탄 뒤 서는 자리, '
                'sec=갈아타는 데 걸리는 초. All 은 아무 칸이나 좋다는 뜻이다.',
        'pairs': pairs})
    C.log('  환승 %d짝 · 방면까지 %d개 → %s (%.0fKB)'
          % (len(pairs), sum(len(v) for v in pairs.values()), OUT, os.path.getsize(OUT) / 1e3))
    if unknown_line:
        C.log('  ★ 모르는 호선 표기 %d종 — 그만큼 빠졌다: %s'
              % (len(unknown_line), dict(unknown_line.most_common(6))))
    if unknown_code:
        C.log('  역 코드를 못 푼 줄 %d개' % unknown_code)
    if no_time:
        C.log('  소요시간이 빈 줄 %d개(자리만 쓴다)' % no_time)
    for k, lst in list(pairs.items())[:3]:
        for v in lst:
            C.log('   예) %s · %s 방면 → 내릴 자리 %s · 갈아탄 뒤 %s%s'
                  % (k, v['toward'], v['off'], v['on'],
                     (' · %d초' % v['sec']) if 'sec' in v else ''))


if __name__ == '__main__':
    main()
