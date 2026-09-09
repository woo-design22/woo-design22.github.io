# -*- coding: utf-8 -*-
"""첫차·막차 — 역별·방향별 실제 시각 (D-112).

★ 왜 필요한가 ★ 지금은 「혼잡 자료 범위(05:30~24:30) 40분 밖 = 안 다님」(D-81)이라는
**노선 공통 근사**로 심야를 막는다. 그런데 첫·막차는 역마다 한 시간 넘게 다르다 —
1호선 소요산 막차와 서울역 막차가 같을 리 없다. 어르신이 밤에 「막차 끊겼나」를 묻는데
근사로 답하면 안 되는 자리다.

★ 어디서 오나 ★ `fetch_rail_tph.py` 가 역별 시간표(SearchSTNTimeTableByIDService)를
부르면서 tph 와 함께 **방향별 첫·막차 분**을 함께 뽑아 rail-tph.json 에 넣어 둔다.
여기서는 그것을 **역 이름 기준**으로 접어 앱이 읽을 작은 파일로 만든다.
(그래프는 역 이름으로 붙는다 — D-108 과 같은 이유.)

★ 방향 ★ 원천의 inout 은 1=상행·2=하행이다. 우리 격자의 방향 라벨(상선/하선/내선/외선)은
노선마다 다르므로(D-36) **여기서 라벨을 정하지 않고** 1/2 그대로 둔다. 엔진이 route.dirLabels
와 맞춰 읽는다 — 라벨을 여기서 박으면 1호선처럼 뒤집힌 노선에서 통째로 틀린다.

내는 것: data/subway/firstlast.json
  {"note":…, "unit":"분(0=자정)", "stations": {"<역이름>": {"1":[첫,막], "2":[첫,막]}}}

사용: python pipeline/build_firstlast.py
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

TPH = os.path.join(C.DATA, 'subway', 'rail-tph.json')
OUT = os.path.join(C.DATA, 'subway', 'firstlast.json')


def flat(s):
    return re.sub(r'\(.*?\)', '', str(s or '').replace(' ', '')).strip()


def main():
    if not os.path.exists(TPH):
        C.die('%s 가 없다. fetch_rail_tph.py 를 먼저 돌린다.' % TPH)
    doc = json.load(io.open(TPH, encoding='utf-8'))
    stations = doc.get('stations') or {}
    out, skipped = {}, 0
    for v in stations.values():
        fl = v.get('firstlast') or {}
        nm = flat(v.get('name'))
        if not nm or not fl:
            skipped += 1
            continue
        cur = out.setdefault(nm, {})
        for d in ('1', '2'):
            got = fl.get(d)
            if not got or len(got) != 2:
                continue
            old = cur.get(d)
            # 환승역은 노선마다 따로 온다 — **첫차는 가장 이른 것, 막차는 가장 늦은 것**을 쓴다.
            # 그 역에서 「아직 차가 있나」를 묻는 것이므로 어느 노선이든 있으면 있는 것이다.
            # (노선별로 더 정확히 하려면 격자처럼 노선 축을 넣어야 하는데, 원천의 노선명이
            #  운영 노선명이라 우리 안내 노선명과 어긋난다 — D-108 과 같은 함정이라 피한다.)
            cur[d] = [min(old[0], got[0]), max(old[1], got[1])] if old else [got[0], got[1]]
    C.save_json(OUT, {
        'note': '역별·방향별 첫차·막차(분, 0=자정). 방향 1=상행·2=하행(원천 표기 그대로). '
                '환승역은 여러 노선 중 가장 이른 첫차·가장 늦은 막차. 서울 열린데이터 '
                '역별 시간표에서 뽑았다(D-112).',
        'unit': 'minutes', 'stations': out})
    C.log('== 첫·막차 %d역 → %s (%.0fKB) ==' % (len(out), OUT, os.path.getsize(OUT) / 1e3))
    if skipped:
        C.log('   시간표가 없어 건너뛴 역 %d곳(코레일 광역전철 등 — 그쪽은 D-81 근사로 간다)' % skipped)
    # 눈으로 확인할 표본 — 막차가 이른 곳과 늦은 곳
    tail = sorted(((v.get('1') or v.get('2'))[1], k) for k, v in out.items() if (v.get('1') or v.get('2')))
    for lab, arr in (('가장 이른 막차', tail[:3]), ('가장 늦은 막차', tail[-3:])):
        C.log('   %s: %s' % (lab, ', '.join('%s %02d:%02d' % (n, m // 60 % 24, m % 60) for m, n in arr)))


if __name__ == '__main__':
    main()
