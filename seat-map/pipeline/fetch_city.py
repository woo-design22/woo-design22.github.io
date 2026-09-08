# -*- coding: utf-8 -*-
"""서울 밖 도시철도 자료 받기 — 공공데이터포털 **파일데이터**는 키도 로그인도 필요 없다.

★ 왜 이 파일이 따로 있나 ★
활용신청이 필요한 것은 「오픈 API」뿐이고, 파일데이터는 화면 안내대로
「로그인 없이 다운로드」된다. 그런데 다운로드 버튼은 주소 하나가 아니라 **세 단계**다
(브라우저 개발자도구로 확인):
  ① POST /tcs/dss/selectFileDataDownload.do   → 첨부파일 id 를 받는다
  ② POST /cmm/cmm/check-limit.json            → 사람 확인(캡차) 필요 여부
  ③ GET  /cmm/cmm/fileDownload.do?atchFileId=…&fileDetailSn=…&dataNm=…
①을 건너뛰고 ③만 부르면 **0바이트가 조용히 내려온다** — 실패가 아니라 빈 파일이라
알아채기 어렵다. 세션 쿠키도 ①에서 생긴다.

받는 것(도시마다):
  · 시간대별 승하차인원      → 혼잡도 모형의 입력
  · 열차시각표 / 운행실적    → **배차를 세는 자료**(공표 문구는 실적과 안 맞는다, D-105)
  · (부산만) 1호선 열차혼잡도 2020~2021 → 모형을 맞추는 정답지. `--truth` 로 받는다.

사용: python pipeline/fetch_city.py [--only busan,daegu] [--truth]
"""
import argparse
import http.cookiejar
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C       # noqa: E402
import city_spec as SPEC  # noqa: E402

BASE = 'https://www.data.go.kr'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) seat-map/0.1',
      'Referer': BASE + '/', 'Accept-Language': 'ko-KR,ko;q=0.9'}
OUT_DIR = os.path.join(C.RAW, 'city')


def download(item, out_dir):
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    page = BASE + '/data/%s/fileData.do' % item['pk']
    op.open(urllib.request.Request(page, headers=UA), timeout=90).read()      # ① 세션

    hdr = dict(UA)
    hdr.update({'X-Requested-With': 'XMLHttpRequest', 'Referer': page,
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'})

    def post(url, data):
        body = urllib.parse.urlencode(data).encode('utf-8')
        return op.open(urllib.request.Request(url, data=body, headers=hdr), timeout=120).read()

    doc = json.loads(post(BASE + '/tcs/dss/selectFileDataDownload.do',
                          {'publicDataPk': item['pk'], 'publicDataDetailPk': item['uddi'],
                           'atchFileId': '', 'fileDetailSn': '1',
                           'publicDataTyCode': 'PR0051'}).decode('utf-8', 'replace'))
    if not doc.get('status'):
        C.log('  %s — 파일 정보를 못 받았다(자료가 교체됐을 수 있다). 건너뜀' % item['title'])
        return None
    afid, fsn = doc['atchFileId'], str(doc['fileDetailSn'])
    nm = (doc.get('dataSetFileDetailInfo') or {}).get('dataNm') or item['file']

    lim = json.loads(post(BASE + '/cmm/cmm/check-limit.json',
                          {'atchFileId': afid, 'fileDetailSn': fsn}).decode('utf-8', 'replace'))
    if lim.get('needCaptcha'):
        C.log('  %s — 포털이 사람 확인을 요구한다. 잠시 뒤 다시 하거나 브라우저에서 받아 '
              '%s 에 둔다.' % (item['title'], out_dir))
        return None

    url = (BASE + '/cmm/cmm/fileDownload.do?atchFileId=' + urllib.parse.quote(afid)
           + '&fileDetailSn=' + fsn + '&dataNm=' + urllib.parse.quote(nm))
    blob = op.open(urllib.request.Request(url, headers=dict(UA, Referer=page)), timeout=300).read()
    # ★ 0바이트를 성공으로 넘기지 말 것 ★ — 단계를 건너뛰면 이렇게 온다
    if len(blob) < 2000:
        C.log('  %s — 내려온 것이 %d바이트뿐이다. 받기 흐름이 바뀐 것 같다.'
              % (item['title'], len(blob)))
        return None
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, item['file'])
    with open(path, 'wb') as f:
        f.write(blob)
    C.log('  %s → %s (%.1fMB)' % (nm[:46], item['file'], len(blob) / 1e6))
    return path


def main():
    ap = argparse.ArgumentParser(description='도시철도 승하차·시각표 받기 (키 불필요)')
    ap.add_argument('--only', help='도시 골라서 (쉼표로: busan,daegu,daejeon,gwangju,incheon)')
    ap.add_argument('--truth', action='store_true',
                    help='검증용 부산 1호선 실측 혼잡도까지(18MB, 한 번만 받으면 된다)')
    args = ap.parse_args()
    keys = [k for k in SPEC.CITIES if not args.only or k in args.only.split(',')]
    C.log('== 도시철도 자료 받기 ==')
    for k in keys:
        city = SPEC.CITIES[k]
        C.log(' %s' % city['name'])
        download(city['boarding'], OUT_DIR)
        for extra in city.get('extra', []):
            download(extra, OUT_DIR)
    if args.truth:
        C.log(' 검증용 정답지')
        download(SPEC.TRUTH, OUT_DIR)
    C.log('== %s ==' % OUT_DIR)


if __name__ == '__main__':
    main()
