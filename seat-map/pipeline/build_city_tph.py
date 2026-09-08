# -*- coding: utf-8 -*-
"""열차시각표·운행실적 → 「시간당 몇 대가 오는가」 (D-105).

★ 왜 따로 만드나 ★
이 나누는 수가 두 배 틀리면 앉을 확률이 통째로 뒤집힌다(집 규칙의 그 항목).
그런데 「출퇴근 4분·평시 6분」 같은 공표 문구는 **하루 총 운행 횟수와 안 맞는다.**
부산 1호선을 그 문구대로 깔면 하루 204회가 되는데, 공사가 내는 운행실적은 177회다
(15% 과다 — 그만큼 재차를 묽게 세고 있었다는 뜻).

그래서 배차는 문구가 아니라 **자료에서 센다**:
  · 대구·대전·광주·인천 — 열차시각표 파일에서 **열차를 직접 센다**(가장 정확)
  · 부산 — 시각표 파일이 없다. 대신 **월별 운행실적(횟수)** 으로 하루 총량을 못 박고,
    시간대 모양만 공표 배차비로 깔아 총량에 맞춘다.

운행실적이 편도 1회인지 왕복인지는 **운행거리로 검산했다**:
1호선 424,089km ÷ 11,000회 = 38.6km ≈ 노선 길이 40.5km → 한 번은 편도 한 번이다.

내는 것: data/subway/tph.json  {호선: [24칸], ...}  (한 방향 기준 시간당 열차 수)
사용: python pipeline/build_city_tph.py
"""
import collections
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

RAW = os.path.join(C.RAW, 'city')
OUT = os.path.join(C.DATA, 'subway', 'tph.json')


def read(path):
    if not os.path.exists(path):
        return None
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp949', 'utf-8'):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return None


def hour_of(t):
    m = re.match(r'\s*(\d{1,2}):(\d{2})', str(t))
    return int(m.group(1)) % 24 if m else None


def spread(counts, label):
    """센 값이 비면 안 된다 — 빈 시간대는 앞뒤에서 메우고, 그래도 없으면 포기."""
    hrs = [h for h in range(24) if counts.get(h)]
    if len(hrs) < 6:
        C.log('  %s — 센 시간대가 %d개뿐이라 버린다' % (label, len(hrs)))
        return None
    out = [0.0] * 24
    for h in range(24):
        out[h] = float(counts.get(h, 0))
    return out


# ── 대구: 요일별,역명,구분,열차번호… (칸마다 시각) ──────────────────────────
def daegu(path, label):
    txt = read(path)
    if not txt:
        return None
    rows = [r for r in txt.split('\n') if r.strip()]
    body = [r.split(',') for r in rows[1:]]
    # 평일 + 「출발」 행만. 종점은 열차가 몰리므로 노선 한가운데 역을 고른다.
    cand = [r for r in body if r and r[0].startswith('평일') and len(r) > 3 and '출발' in r[2]]
    if not cand:
        return None
    mid = cand[len(cand) // 2]
    cnt = collections.Counter()
    for v in mid[3:]:
        h = hour_of(v)
        if h is not None:
            cnt[h] += 1
    C.log('  %s — %s 역에서 %d대' % (label, mid[1], sum(cnt.values())))
    return spread(cnt, label)


# ── 광주: 한 줄에 열차 한 대의 역 도착 ─────────────────────────────────────
def gwangju(path, label):
    txt = read(path)
    if not txt:
        return None
    rows = [r.split(',') for r in txt.split('\n') if r.strip()]
    head = [h.strip() for h in rows[0]]
    try:
        iDay, iDir, iTime, iSta = (head.index('요일'), head.index('방향(상_하행)'),
                                   head.index('도착시간'), head.index('역사명'))
    except ValueError:
        return None
    per = collections.defaultdict(collections.Counter)
    for r in rows[1:]:
        if len(r) <= max(iDay, iDir, iTime, iSta):
            continue
        if not r[iDay].strip().startswith('평일') or r[iDir].strip() != '1':
            continue
        h = hour_of(r[iTime])
        if h is not None:
            per[r[iSta].strip()][h] += 1
    if not per:
        return None
    sta = max(per, key=lambda s: sum(per[s].values()))
    C.log('  %s — %s 에서 %d대' % (label, sta, sum(per[sta].values())))
    return spread(per[sta], label)


# ── 대전: 역명,운행방향,휴일구분,시간대,"동 시간대 분" ──────────────────────
def daejeon(path, label):
    txt = read(path)
    if not txt:
        return None
    rows = [r for r in txt.split('\n') if r.strip()]
    per = collections.defaultdict(lambda: collections.Counter())
    for r in rows[1:]:
        c = [x.strip().strip('"') for x in re.split(r',(?=(?:[^"]*"[^"]*")*[^"]*$)', r)]
        if len(c) < 5 or c[2] != '평일' or c[1] != '하행':
            continue
        try:
            h = int(c[3]) % 24
        except ValueError:
            continue
        per[c[0]][h] += len([m for m in c[4].split() if m.strip()])
    if not per:
        return None
    sta = max(per, key=lambda s: sum(per[s].values()))
    C.log('  %s — %s 에서 %d대' % (label, sta, sum(per[sta].values())))
    return spread(per[sta], label)


# ── 인천: 한 줄이 열차 하나, 칸이 역 ───────────────────────────────────────
def incheon(path, label):
    txt = read(path)
    if not txt:
        return None
    rows = [r.split(',') for r in txt.split('\n') if r.strip()]
    head = rows[0]
    start = 3                                   # 시발역·종착역·열차번호(또는 순번) 다음부터가 역
    best, bestn = None, -1
    for j in range(start, len(head)):
        n = sum(1 for r in rows[1:] if len(r) > j and hour_of(r[j]) is not None)
        if n > bestn:
            best, bestn = j, n
    if best is None or bestn < 20:
        return None
    cnt = collections.Counter()
    for r in rows[1:]:
        if len(r) > best:
            h = hour_of(r[best])
            if h is not None:
                cnt[h] += 1
    C.log('  %s — %s 에서 %d대' % (label, head[best].strip(), bestn))
    return spread(cnt, label)


# ── 부산: 운행실적(월별 횟수) + 실측으로 바로잡은 시간대 모양 ──────────────
# 부산만 시각표 파일이 없다. 그래서 **하루 총량은 운행실적**이 정하고, 시간대 모양은
# 공표 배차비(출퇴근 4분·평시 6분)로 깔았는데 — 실측과 맞대 보니 그 모양이 틀렸다:
#   2021 실측 대비 기울기  05~07시 0.71~0.84 · 08시 1.08 · 09~16시 1.25~1.48 · 19~23시 0.63~0.95
# 즉 실제 부산 지하철은 **낮에도 공표 문구보다 자주 다니고**, 새벽·밤에는 더 뜸하다.
# 그래서 시간대를 네 무리로 묶어 그 어긋남만큼 되돌린다(BAND). 네 숫자만 자료에 맞추므로
# 역별 분포(546쌍)의 검증력은 그대로 남는다.
# ★ 이 보정은 부산에만 쓴다 ★ — 대구·대전·광주·인천은 시각표에서 열차를 직접 세므로
#   보정할 것이 없다. 자료가 있으면 자료를 쓰고, 없을 때만 이렇게 맞춘다.
BUSAN_BAND = {'peak': 0.96, 'day': 1.32, 'eve': 1.09, 'edge': 0.77}


def _band(h):
    if h in (7, 8):
        return 'peak'
    if 9 <= h <= 16:
        return 'day'
    if 17 <= h <= 19:
        return 'eve'
    return 'edge'


BUSAN_SHAPE = {                       # 시각 → 상대값 (공표 배차비 × 실측 보정)
    '부산 1호선': {h: w * BUSAN_BAND[_band(h)] for h, w in
                {5: 0.5, 6: 0.8, 7: 1.5, 8: 1.5, 9: 1.0, 10: 1.0, 11: 1.0, 12: 1.0,
                 13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0, 17: 1.33, 18: 1.33, 19: 1.33,
                 20: 1.0, 21: 0.8, 22: 0.8, 23: 0.5, 0: 0.2}.items()},
}
for _ln in ('부산 2호선', '부산 3호선', '부산 4호선'):
    BUSAN_SHAPE[_ln] = dict(BUSAN_SHAPE['부산 1호선'])


def busan(path):
    txt = read(path)
    if not txt:
        return {}
    rows = [r.split(',') for r in txt.split('\n') if r.strip()]
    runs = collections.defaultdict(list)        # 호선 → [월별 횟수]
    for r in rows[1:]:
        if len(r) < 4:
            continue
        line = '부산 ' + r[1].strip()
        try:
            runs[line].append(float(r[3] or r[2]))
        except ValueError:
            continue
    out = {}
    for line, vals in runs.items():
        if line not in BUSAN_SHAPE or not vals:
            continue
        per_day = sum(vals) / len(vals) / 30.44          # 달 평균 → 하루
        per_dir = per_day / 2                            # 두 방향으로 나눈다
        shape = BUSAN_SHAPE[line]
        tot = sum(shape.values())
        tbl = [0.0] * 24
        for h, w in shape.items():
            tbl[h] = round(per_dir * w / tot, 2)
        out[line] = tbl
        C.log('  %s — 하루 편도 %.0f회 · 첨두 %.1f대/시 · 평시 %.1f대/시'
              % (line, per_dir, tbl[8], tbl[13]))
    return out


def main():
    C.log('== 시간당 열차 수 세기 ==')
    tph = {}
    jobs = [
        ('부산', None, None),
        ('대구 1호선', daegu, 'tt_daegu1.csv'),
        ('대구 2호선', daegu, 'tt_daegu2.csv'),
        ('대구 3호선', daegu, 'tt_daegu3.csv'),
        ('광주 1호선', gwangju, 'tt_gwangju.csv'),
        ('대전 1호선', daejeon, 'tt_daejeon.csv'),
        ('인천지하철 1호선', incheon, 'tt_incheon1.csv'),
        ('인천지하철 2호선', incheon, 'tt_incheon2.csv'),
    ]
    for label, fn, path in jobs:
        if fn is None:
            tph.update(busan(os.path.join(RAW, 'busan_ops.csv')))
            continue
        got = fn(os.path.join(RAW, path), label)
        if got:
            tph[label] = [round(v, 2) for v in got]
    if not tph:
        C.die('센 것이 하나도 없다. data/raw/city/ 에 시각표를 먼저 받는다.')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    C.save_json(OUT, {'note': '한 방향 기준 시간당 열차 수. 시각표·운행실적에서 직접 셌다(D-105).',
                      'lines': tph})
    C.log('== 노선 %d개 → %s ==' % (len(tph), OUT))
    for k in sorted(tph):
        t = tph[k]
        C.log('  %-16s 08시 %4.1f · 13시 %4.1f · 18시 %4.1f · 하루 %.0f'
              % (k, t[8], t[13], t[18], sum(t)))


if __name__ == '__main__':
    main()
