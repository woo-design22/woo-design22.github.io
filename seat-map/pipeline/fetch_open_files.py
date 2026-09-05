# -*- coding: utf-8 -*-
"""fetch_open_files.py — 서울 열린데이터광장의 **파일 데이터**를 받는다.

★ 이 파일이 있는 이유 ★
열린데이터광장은 데이터셋마다 OpenAPI(인증키 필요)와 **파일(인증키 불필요)**을 따로 준다.
파일 쪽은 로그인도 캡차도 없이 POST 한 번이면 된다. 그래서 **키를 기다리는 동안에도
실측 데이터로 일할 수 있다** — 특히 지하철혼잡도정보는 사양서 10장 검증 기준에 바로 쓰인다.

  POST https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false
       infId=<OA-xxxxx>&seq=<파일번호>&infSeq=1

파일번호(seq)는 데이터셋 화면의 `downloadFile('23')` 에서 온다.
분기가 바뀌면 번호가 늘어나므로 아래 표를 갱신해야 한다 — `--list` 로 현재 목록을 뽑는다.

사용법
  python fetch_open_files.py --list OA-12928     # 그 데이터셋의 파일 목록과 번호
  python fetch_open_files.py                      # 아래 DATASETS 를 전부 받는다
  python fetch_open_files.py --only congestion    # 하나만
"""
import argparse
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C   # noqa: E402

DOWNLOAD_URL = 'https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false'
VIEW_URL = 'https://data.seoul.go.kr/dataList/%s/F/1/datasetView.do'
OUT_DIR = os.path.join(C.RAW, 'open')

# 받을 것. seq 는 화면에서 확인한 값이고, 분기·월이 바뀌면 --list 로 다시 본다.
DATASETS = {
    'congestion': {
        'infId': 'OA-12928',
        'name': '서울교통공사_지하철혼잡도정보',
        'seqs': [23, 22, 19],          # 2026-06-30, 2026-03-31, 2025-11-30
        'why': '30분 단위·요일구분 혼잡도. 사양서 10장 검증 기준의 실측 원천',
    },
    'busstops': {
        'infId': 'OA-15067',
        'name': '서울시 버스정류소 위치정보',
        'seqs': [58],                  # 2026-09-02
        'why': '정류장 좌표. 150m 환승 노드 클러스터링(M1-4)의 입력',
    },
    'busride': {
        'infId': 'OA-12913',
        'name': '버스노선별 정류장별 시간대별 승하차 인원',
        'seqs': [112, 111, 110],       # 2026년 07·06·05월
        'why': '버스노선별·정류장별·시간대별 필터의 원천. 월 단위라 요일 구분은 없다',
    },
    'routestops': {
        'infId': 'OA-1095',
        'name': '서울시 버스노선별 정류소 정보',
        'seqs': [58],                  # 2026-09-02
        'why': '**노선의 경유 순번**. 길찾기의 뼈대다 — 이게 없으면 어느 방향으로 몇 정거장인지 모른다',
    },
    'routeinfo': {
        'infId': 'OA-15262',
        'name': '서울시 버스노선 ID 정보',
        # seq 49 = 최신 노선ID 표(두 열뿐). seq 25 = **배차간격·유형·기점종점이 실린 마지막 판**
        # (2024년 1~4월 기준 — 이후 판에서는 그 열들이 사라졌다. 노선별 배차의 유일한 무키 원천)
        'seqs': [49, 25],
        'why': '노선 ID 와 **인가 평균배차간격**. 배차가 재차인원의 나누는 수라 앉을 확률을 좌우한다',
    },
    'subwayride': {
        'infId': 'OA-12921',
        'name': '서울교통공사_역별 일별 시간대별 승하차인원',
        'seqs': [46],                  # 2025-12-31 까지
        'why': '**일별**이라 날짜→요일 변환이 된다. 역별 평일/토/일 구분의 유일한 무키 원천',
    },
}


def list_files(inf_id):
    """데이터셋 화면에서 downloadFile('n') 과 파일 이름을 뽑는다."""
    html = C.http_get(VIEW_URL % inf_id, as_json=False, timeout=40)
    out = []
    # <a href="javascript:downloadFile('23');">이름.xlsx 다운로드</a>
    for m in re.finditer(r"downloadFile\('(\d+)'\)\s*;?\s*\"[^>]*>\s*([^<]{1,120})", html):
        out.append((int(m.group(1)), re.sub(r'\s+', ' ', m.group(2)).strip()))
    if not out:
        for m in re.finditer(r"downloadFile\('(\d+)'\)", html):
            out.append((int(m.group(1)), '(이름을 못 읽음)'))
    seen, uniq = set(), []
    for seq, nm in out:
        if seq not in seen:
            seen.add(seq)
            uniq.append((seq, nm))
    return sorted(uniq, reverse=True)


_FORM_CACHE = {}


def form_fields(inf_id):
    """내려받기 폼(frmFile)의 숨은 값들을 페이지에서 읽는다.

    **infSeq 를 1로 고정하면 안 된다** — 데이터셋마다 다르다(혼잡도 OA-12928=1,
    버스승하차 OA-12913=3). 틀리면 서버가 파일 대신
    「잘못된 접근입니다」 라는 HTML 200바이트를 돌려주는데, 확장자만 보면 성공처럼 보인다.
    """
    if inf_id in _FORM_CACHE:
        return dict(_FORM_CACHE[inf_id])
    html = C.http_get(VIEW_URL % inf_id, as_json=False, timeout=40)
    m = re.search(r'<form[^>]*name="frmFile".*?</form>', html, re.S)
    fields = {'infId': inf_id, 'seqNo': '', 'infSeq': '1'}
    if m:
        for inp in re.findall(r'<input[^>]*>', m.group(0)):
            nm = re.search(r'name="([^"]+)"', inp)
            val = re.search(r'value="([^"]*)"', inp)
            if nm:
                fields[nm.group(1)] = val.group(1) if val else ''
    _FORM_CACHE[inf_id] = dict(fields)
    return fields


def download(inf_id, seq, out_dir):
    """POST 로 파일 하나를 받는다. 이름은 Content-Disposition 에서 가져온다."""
    fields = form_fields(inf_id)
    fields['seq'] = seq
    body = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(DOWNLOAD_URL, data=body, headers={
        'User-Agent': 'seat-map/0.1 (data collector)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': VIEW_URL % inf_id,
    })
    with urllib.request.urlopen(req, timeout=600) as r:
        disp = r.headers.get('Content-Disposition') or ''
        data = r.read()
    # 실패해도 200 과 HTML 을 돌려준다. 파일인 척하고 저장하면 나중에 파서가 이상한 데서 죽는다.
    if data[:200].lstrip().lower().startswith(b'<html') or b"\xec\x9e\x98\xeb\xaa\xbb\xeb\x90\x9c" in data[:400]:
        raise RuntimeError('파일 대신 HTML 이 왔다(%d바이트) — infSeq·seq 를 확인할 것' % len(data))
    name = None
    m = re.search(r"filename\*?=(?:UTF-8'')?\"?([^\";]+)", disp)
    if m:
        name = urllib.parse.unquote(m.group(1).strip())
    # 헤더의 한글이 UTF-8 바이트인데 파이썬이 latin-1 로 읽어 온다(HTTP 헤더 규약이 latin-1 이라서).
    # 되돌리지 않으면 「ìì¸êµíµê³µì¬」 같은 이름으로 저장된다.
    if name:
        try:
            name = name.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    if not name:
        name = '%s_%d.bin' % (inf_id, seq)
    # 경로 조작 방어 — 서버가 준 이름을 그대로 믿지 않는다.
    name = os.path.basename(name).replace('\\', '_')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, 'wb') as f:
        f.write(data)
    return path, len(data)


def main():
    ap = argparse.ArgumentParser(description='열린데이터광장 파일 데이터 받기 (인증키 불필요)')
    ap.add_argument('--list', metavar='OA-xxxxx', help='그 데이터셋의 파일 목록과 번호')
    ap.add_argument('--only', help='DATASETS 의 키 하나만')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    if args.list:
        C.log('== %s 파일 목록 ==' % args.list)
        for seq, nm in list_files(args.list):
            C.log('  seq %-4d %s' % (seq, nm))
        return

    picked = {args.only: DATASETS[args.only]} if args.only else DATASETS
    total = 0
    for key, ds in picked.items():
        C.log('== %s (%s) — %s ==' % (ds['name'], ds['infId'], ds['why']))
        out_dir = os.path.join(OUT_DIR, key)
        for seq in ds['seqs']:
            try:
                path, size = download(ds['infId'], seq, out_dir)
            except Exception as e:
                C.log('  seq %d — 실패: %s' % (seq, e))
                continue
            C.log('  seq %-4d %s  (%.1f KB)' % (seq, os.path.basename(path), size / 1024))
            total += 1
    C.log('== 파일 %d개 → %s ==' % (total, OUT_DIR))


if __name__ == '__main__':
    main()
