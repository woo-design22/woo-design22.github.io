# -*- coding: utf-8 -*-
"""APK 자산 준비 — europe-rpg 를 assets/ 로 옮긴다. build.ps1 이 먼저 부른다.

웹판은 사진을 photos/<키>.bin 으로 두고 fetch 로 읽어 XOR 복호한다.
공개 저장소에 원본이 그대로 올라가지 않게 하려는 장치인데, APK 안에서는
두 가지 이유로 쓸 수 없다:

  1. WebView 가 file:// 로 열리면 fetch 가 막힌다(브라우저 보안 정책).
     그대로 두면 사진 여섯 장이 전부 안내 카드로 대체된다.
  2. APK 안은 어차피 공개 저장소가 아니다.

그래서 여기서 .bin 을 원래 .jpg 로 되돌려 넣는다. index.html 의 showPhoto 는
.bin → jpg → 안내 카드 순으로 찾으므로, 게임 코드는 한 줄도 고치지 않는다.
"""
import io, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(os.path.dirname(HERE), 'europe-rpg')
DST = os.path.join(HERE, 'assets')

# 사진 XOR 키 = 게임 비밀번호(index.html 의 PASSWORD)
PW = None
src_html = os.path.join(WEB, 'index.html')
if not os.path.exists(src_html):
    sys.exit('!! 웹 원본을 찾을 수 없다: ' + WEB)
for line in io.open(src_html, encoding='utf-8'):
    if line.startswith('const PASSWORD'):
        PW = line.split("'")[1]
        break
if not PW:
    sys.exit('!! PASSWORD 를 찾지 못했다')


def unxor(data, pw):
    b = bytearray(data)
    key = [ord(c) for c in pw + pw]
    for i in range(len(b)):
        b[i] ^= key[i % len(key)] ^ ((i * 7) & 0xff)
    return bytes(b)


if os.path.isdir(DST):
    shutil.rmtree(DST)
os.makedirs(os.path.join(DST, 'photos'))

shutil.copy(src_html, os.path.join(DST, 'index.html'))
for f in ['bgm1.mp3', 'bgm2.mp3']:
    shutil.copy(os.path.join(WEB, f), os.path.join(DST, f))

n = 0
for fn in sorted(os.listdir(os.path.join(WEB, 'photos'))):
    if not fn.endswith('.bin'):
        continue
    out = unxor(open(os.path.join(WEB, 'photos', fn), 'rb').read(), PW)
    if out[:3] != b'\xff\xd8\xff':
        sys.exit('!! %s 복호 실패 — 비밀번호(%s)가 맞는지 확인' % (fn, PW))
    open(os.path.join(DST, 'photos', fn[:-4] + '.jpg'), 'wb').write(out)
    n += 1

tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(DST) for f in fs)
print('   assets 준비 완료 — 사진 %d장 복호, 합계 %.1f MB' % (n, tot / 1048576))
