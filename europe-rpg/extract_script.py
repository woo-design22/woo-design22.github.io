# -*- coding: utf-8 -*-
"""index.html 의 대본에서 대사집(대사집.txt)을 뽑아낸다.

게임을 고친 뒤에는 이 스크립트를 다시 돌려야 대사집이 최신이 된다.

    python europe-rpg/extract_script.py

뽑는 것: say(이름, 글) · ask(이름, 글, [선택지]) · showPhoto 의 설명 ·
playPick 의 안내 문구와 보기. 장(章)은 CHAPTERS 순서를 따르고,
QUESTS.cN 블록 안에 나오는 순서 그대로 적는다.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'index.html')
OUT = os.path.join(HERE, '대사집.txt')

s = io.open(SRC, encoding='utf-8').read()

# ---- 등장인물 (FRIENDS 의 name/tag 를 그대로 쓴다) ----
people = re.findall(r"\{ id: '(\w+)', name: '([^']*)', tag: '([^']*)'", s)

# ---- 장 목록 ----
chapters = re.findall(r"\{ id: '(c\d)', hero: '\w+', title: '([^']*)', sub: '([^']*)' \}", s)

def unesc(t):
    return t.replace("\\n", "\n         ").replace("\\'", "'").replace('\\"', '"')

# '앞부분 ' + 변수 + '뒷부분' 처럼 이어 붙인 대사를 한 줄로 되살린다.
# 변수 자리는 실제 값이 플레이마다 달라지므로 ○ 로 표시한다.
JOIN = re.compile(r"'\s*\+\s*[A-Za-z_$][\w.$\[\]']*\s*\+\s*'")
def joinparts(t):
    return JOIN.sub('○', t)

# 한 블록(문자열) 안에서 대사를 등장 순서대로 뽑는다
# 대사 본문: 보통 글자·이스케이프에 더해 "' + 변수 + '" 이음매도 한 덩어리로 본다
BODY = r"(?:[^'\\]|\\.|'\s*\+\s*[A-Za-z_$][\w.$\[\]']*\s*\+\s*')*"
LINE = re.compile(
    r"say\(\s*'([^']*)'\s*,\s*'(" + BODY + r")'"                          # say(이름, 글)
    r"|ask\(\s*'([^']*)'\s*,\s*'(" + BODY + r")'\s*,\s*\[([^\]]*)\]"       # ask(이름, 글, [보기])
    r"|showPhoto\(\s*'[^']*'\s*,\s*'(" + BODY + r")'"                      # showPhoto(키, 설명)
    r"|playPick\(\s*'(" + BODY + r")'\s*,\s*\[(.*?)\]\s*,\s*'(" + BODY + r")'"  # playPick
    , re.S)

def render(block):
    out = []
    for m in LINE.finditer(block):
        who, txt, aw, atx, opts, cap, pq, pitems, phint = m.groups()
        if txt is not None:
            name = who.strip() or '   '
            out.append('  [%s] %s' % (name, unesc(joinparts(txt))))
        elif atx is not None:
            name = aw.strip() or '   '
            out.append('  [%s] %s' % (name, unesc(joinparts(atx))))
            for o in re.findall(r"'((?:[^'\\]|\\.)*)'", opts):
                out.append('        → %s' % unesc(o))
        elif cap is not None:
            out.append('  ( 사진 ) %s' % unesc(joinparts(cap)))
        elif pq is not None:
            out.append('  ( 미니게임 ) %s' % unesc(joinparts(pq)))
            for o in re.findall(r"icon: '((?:[^'\\]|\\.)*)'", pitems):
                out.append('        → %s' % unesc(o))
            if phint:
                out.append('        (안내: %s)' % unesc(phint))
    return out

def block_of(marker, end_markers):
    i0 = s.index(marker)
    ends = [s.index(e, i0 + len(marker)) for e in end_markers if e in s[i0 + len(marker):]]
    i1 = min(ends) if ends else len(s)
    return s[i0:i1]

L = []
L.append('우리가족 유럽여행 — 전체 대사집')
L.append('=' * 60)
L.append('')
L.append('등장인물')
for _id, name, tag in people:
    L.append('  %-6s — %s' % (name, tag))
L.append('')
L.append('표기: [인물] 대사   /   [   ] 는 나레이션(지문)   /   → 는 선택지·보기')
L.append('=' * 60)
L.append('')

order = [c[0] for c in chapters]
for idx, (cid, title, sub) in enumerate(chapters):
    nxt = ['QUESTS.%s = {' % order[idx + 1]] if idx + 1 < len(order) else ['// ===== 엔딩', 'async function playEnding']
    blk = block_of('QUESTS.%s = {' % cid, nxt)
    L.append('─' * 60)
    L.append('%d장. %s — %s' % (idx + 1, title, sub))
    L.append('─' * 60)
    L += render(blk)
    L.append('')

# 엔딩
L.append('─' * 60)
L.append('엔딩')
L.append('─' * 60)
L += render(block_of('async function playEnding()', ['const c = $(\'credits\')']))
# 크레딧
for k, label in [('FINAL_MESSAGE', '크레딧 마지막 메시지'), ('ERA', '부제'), ('MAKER', '만든 사람')]:
    m = re.search(r"const %s = '((?:[^'\\]|\\.)*)'" % k, s)
    if m:
        L.append('')
        L.append('  < %s >' % label)
        for line in unesc(m.group(1)).split('\n'):
            L.append('    ' + line.strip())
L.append('')

# 평소 대사 (대사 테이블)
L.append('─' * 60)
L.append('평소 대사 (아무 때나 말 걸면 나오는 말)')
L.append('─' * 60)
fam = re.search(r"const FRIEND_LINES = \{(.*?)\n\};", s, re.S)
npc = re.search(r"const NPC_LINES = \{(.*?)\n\};", s, re.S)
names = {i: n for i, n, _t in people}
for blk, head in [(fam, '가족'), (npc, '여행에서 만난 사람들')]:
    if not blk: continue
    L.append('')
    L.append('  · %s' % head)
    for key, body in re.findall(r"(\w+):\s*(\[[^\]]*\]|'(?:[^'\\]|\\.)*')", blk.group(1)):
        who = names.get(key, key)
        for t in re.findall(r"'((?:[^'\\]|\\.)*)'", body):
            L.append('    [%s] %s' % (who, unesc(t)))
L.append('')

io.open(OUT, 'w', encoding='utf-8', newline='\r\n').write('\n'.join(L))
print('대사집 생성:', OUT, '/', len(L), '줄')
