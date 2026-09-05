# -*- coding: utf-8 -*-
"""편차 수집 자료 백업 + 집계 갱신 (6시간마다, 작업 스케줄러용).

수집 원본(data/raw/variance/)은 C 드라이브 한 곳에만 있어 디스크 사고면 통째로 사라진다.
그래서 세 겹으로 만든다:
  ① 원본 → 다른 물리 드라이브로 복사 (F: → D: → 내 문서 순으로 있는 곳에)
  ② 집계본(data/bus/variance.json) 갱신 — 이건 저장소에 커밋되는 영역이라
     게시할 때마다 깃허브에도 남는다 (원본을 잃어도 분포는 살아남는다)
  ③ 기록은 백업지의 backup.log 에

창 없이 돌도록 pythonw 로 걸었다. 손으로도 언제든:  python pipeline/backup_variance.py
"""
import datetime as dt
import io
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

SRC = os.path.join(C.RAW, 'variance')
CANDIDATES = [r'F:\seat-map-backup\variance',
              r'D:\seat-map-backup\variance',
              os.path.join(os.path.expanduser('~'), 'Documents', 'seat-map-backup', 'variance')]


def pick_dest():
    for d in CANDIDATES:
        drive = os.path.splitdrive(d)[0] + os.sep
        if os.path.isdir(drive):
            return d
    return CANDIDATES[-1]


def main():
    if not os.path.isdir(SRC):
        return
    dest = pick_dest()
    os.makedirs(dest, exist_ok=True)
    copied = 0
    for name in os.listdir(SRC):
        s = os.path.join(SRC, name)
        d = os.path.join(dest, name)
        if not os.path.isfile(s):
            continue
        # 크기가 같으면 안 건드린다 — jsonl 은 자라기만 하므로 이걸로 충분하다
        if os.path.exists(d) and os.path.getsize(d) == os.path.getsize(s):
            continue
        shutil.copy2(s, d)
        copied += 1
    line = '[%s] 복사 %d개 → %s' % (dt.datetime.now().strftime('%m-%d %H:%M'), copied, dest)
    try:
        with io.open(os.path.join(dest, 'backup.log'), 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass
    C.log(line)
    # 집계본 갱신 — 게시 때 깃허브로 나가는 세 번째 겹
    try:
        import build_variance
        build_variance.main()
    except SystemExit:
        pass                      # 순간사진이 아직 없으면 조용히
    except Exception as e:        # 집계가 죽어도 백업은 이미 끝났다
        C.log('집계 실패(백업은 완료): %s' % str(e)[:80])


if __name__ == '__main__':
    main()
