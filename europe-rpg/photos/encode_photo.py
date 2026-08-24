# 사용법: python encode_photo.py 원본경로 결과이름(card|wedding)
import sys, os
PASSWORD = '0316'
src, name = sys.argv[1], sys.argv[2]
data = bytearray(open(src, 'rb').read())
key = [ord(c) for c in PASSWORD + PASSWORD]
for i in range(len(data)):
    data[i] ^= key[i % len(key)] ^ ((i * 7) & 0xff)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), name + '.bin')
open(out, 'wb').write(bytes(data))
print('wrote', out, len(data), 'bytes')
