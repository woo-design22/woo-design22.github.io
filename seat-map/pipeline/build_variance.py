# -*- coding: utf-8 -*-
"""차량 간 편차 집계 — 순간사진(JSONL)을 종류×요일×시간의 혼잡 분포로 만든다 (D-65).

python pipeline/build_variance.py
입력: data/raw/variance/*.jsonl   (collect_bus_variance.py 가 쌓는다)
출력: data/bus/variance.json
  { kind: { dayType: { hour: {n대수, free여유, mid보통, crowd혼잡, full만차, na미제공} } } }

해석 지침
  - congetion: 3 여유(빈 좌석 있음) · 4 보통(좌석 만석 언저리) · 5 혼잡(입석 많음) · 0 미제공
  - 분포가 곧 「지금 오는 차가 어떤 차일 확률」이다. ×1.25(D-62) 를 대체하려면
    평일 첨두 표본이 며칠 쌓여야 한다 — 표본 수(n)를 반드시 함께 보라.
"""
import datetime as dt
import glob
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

IN_DIR = os.path.join(C.RAW, 'variance')
OUT = os.path.join(C.DATA, 'bus', 'variance.json')
DOW = ['sunday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'saturday']


def main():
    files = sorted(glob.glob(os.path.join(IN_DIR, '*.jsonl')))
    if not files:
        raise SystemExit('순간사진이 없다 — collect_bus_variance.py 를 먼저 돌린다')
    agg = {}
    snaps = 0
    for path in files:
        with io.open(path, encoding='utf-8') as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                snaps += 1
                t = dt.datetime.strptime(rec['t'][:19], '%Y-%m-%dT%H:%M:%S')
                day = DOW[int(t.strftime('%w'))]
                slot = (agg.setdefault(rec['kind'], {})
                           .setdefault(day, {})
                           .setdefault(str(t.hour), {'n': 0, 'free': 0, 'mid': 0,
                                                     'crowd': 0, 'full': 0, 'na': 0}))
                for sect, cong, isfull, btype in rec['veh']:
                    slot['n'] += 1
                    if isfull:
                        slot['full'] += 1
                    if cong == 3:
                        slot['free'] += 1
                    elif cong == 4:
                        slot['mid'] += 1
                    elif cong == 5:
                        slot['crowd'] += 1
                    else:
                        slot['na'] += 1
    C.save_json(OUT, {
        'source': '서울시 버스위치정보(getBusPosByRtid) 차량별 혼잡도 순간사진',
        'legend': 'free=여유(3) mid=보통(4) crowd=혼잡(5) full=만차 na=미제공(0). n=관측 차량 연인원',
        'note': '표본단이 이용객 상위 위주라 서울 평균이 아니라 「주요 노선」 분포다. n 이 얇은 칸은 쓰지 말 것',
        'snapshots': snaps,
        'dist': agg,
    })
    C.log('순간사진 %d개 집계 → %s' % (snaps, OUT))
    # 사람 눈용 요약
    for kind in sorted(agg):
        for day in sorted(agg[kind]):
            hours = agg[kind][day]
            tot = {'n': 0, 'free': 0, 'mid': 0, 'crowd': 0, 'full': 0, 'na': 0}
            for h in hours.values():
                for k in tot:
                    tot[k] += h[k]
            known = max(1, tot['n'] - tot['na'])
            C.log('  %-8s %-8s 차량 %4d대: 여유 %d%% · 보통 %d%% · 혼잡 %d%% · 만차 %d대 · 미제공 %d%%'
                  % (kind, day, tot['n'], 100 * tot['free'] // known, 100 * tot['mid'] // known,
                     100 * tot['crowd'] // known, tot['full'], 100 * tot['na'] // max(1, tot['n'])))


if __name__ == '__main__':
    main()
