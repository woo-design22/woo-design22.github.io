# -*- coding: utf-8 -*-
"""도트 RPG의 index.html 에서 대사집(대사집.txt)을 뽑는 공용 도구.

    python tools/extract_script.py                 # 도트 RPG 전부
    python tools/extract_script.py retire-rpg      # 하나만

**게임을 고치면 반드시 다시 돌린다.** 손님에게 게임을 드릴 때는 대사집도 같이 드린다
(docs/dot-rpg-engine.md 의 납품 절차 참고).

다루는 두 가지 구조
  · 장(章)형  — CHAPTERS 가 순서를 정하는 게임 (couple / europe / love / retire)
  · 친구형    — FRIENDS 한 명당 이야기 하나인 게임 (namsan)

뽑는 것: say(이름, 글) · ask(이름, 글, [선택지]) · showPhoto 설명 ·
playPick 안내와 보기 · playRhythm/playStack 등 미니게임 라벨.
"'앞' + 변수 + '뒤'" 로 이어 붙인 대사는 변수 자리를 ○ 로 표시해 한 줄로 되살린다.
"""
import io, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMES = ['namsan-rpg', 'couple-rpg', 'europe-rpg', 'love-rpg', 'retire-rpg', 'goth-rpg']

# 대사 본문: 보통 글자·이스케이프에 더해 "' + 변수 + '" 이음매도 한 덩어리로 본다
BODY = r"(?:[^'\\]|\\.|'\s*\+\s*[A-Za-z_$][\w.$\[\]']*\s*\+\s*')*"
LINE = re.compile(
    r"say\(\s*'([^']*)'\s*,\s*'(" + BODY + r")'"
    r"|ask\(\s*'([^']*)'\s*,\s*'(" + BODY + r")'\s*,\s*\[([^\]]*)\]"
    r"|showPhoto\(\s*(?:'[^']*'|\[[^\]]*\])\s*,\s*'(" + BODY + r")'"
    r"|playPick\(\s*'(" + BODY + r")'\s*,\s*\[(.*?)\]\s*,\s*'(" + BODY + r")'"
    r"|play(?:Rhythm|Stack|Drone|Crowd|Train|Puzzle|Photo|Ramen)\(\s*'(" + BODY + r")'",
    re.S)
JOIN = re.compile(r"'\s*\+\s*[A-Za-z_$][\w.$\[\]']*\s*\+\s*'")


def unesc(t):
    return t.replace("\\n", "\n         ").replace("\\'", "'").replace('\\"', '"')


def clean(t):
    return unesc(JOIN.sub('○', t))


def render(block):
    out = []
    for m in LINE.finditer(block):
        who, txt, aw, atx, opts, cap, pq, pitems, phint, mgl = m.groups()
        if txt is not None:
            out.append('  [%s] %s' % (who.strip() or '   ', clean(txt)))
        elif atx is not None:
            out.append('  [%s] %s' % (aw.strip() or '   ', clean(atx)))
            for o in re.findall(r"'((?:[^'\\]|\\.)*)'", opts):
                out.append('        → %s' % unesc(o))
        elif cap is not None:
            out.append('  ( 사진 ) %s' % clean(cap))
        elif pq is not None:
            out.append('  ( 미니게임 ) %s' % clean(pq))
            for o in re.findall(r"icon: '((?:[^'\\]|\\.)*)'", pitems):
                out.append('        → %s' % unesc(o))
            if phint:
                out.append('        (안내: %s)' % clean(phint))
        elif mgl is not None:
            out.append('  ( 미니게임 ) %s' % clean(mgl))
    return out


def block_between(s, start, ends):
    i0 = s.index(start)
    cand = [s.index(e, i0 + len(start)) for e in ends if e in s[i0 + len(start):]]
    return s[i0:min(cand) if cand else len(s)]


def extract(game):
    src = os.path.join(ROOT, game, 'index.html')
    if not os.path.exists(src):
        return '%s: index.html 없음' % game
    s = io.open(src, encoding='utf-8').read()

    title = re.search(r'<title>([^<]*)</title>', s)
    title = title.group(1).replace(' (데모)', '') if title else game
    people = re.findall(r"\{\s*id: '(\w+)',\s*name: '([^']*)',\s*tag: '([^']*)'", s)
    names = {i: n for i, n, _t in people}
    # NPC 는 표시 이름이 NPCS 배치표에 있다 (NPC_LINES 는 id 만 쓴다)
    for nid, nname in re.findall(r"\{\s*id: '(\w+)',\s*spr: '[^']*',[^}]*?name: '([^']*)'", s):
        names.setdefault(nid, nname)
    # 대본에서만 등장하는 인물(맵에 고정 배치가 없는 사람)은 ents/spr 로만 나온다
    for nid, nname in re.findall(r"id: '(\w+)',\s*spr: '\w+',\s*name: '([^']*)'", s):
        names.setdefault(nid, nname)
    for nid, nname in re.findall(r"spr: '(\w+)'[^}]*?name: '([^']*)'", s):
        names.setdefault(nid, nname)

    L = ['%s — 전체 대사집' % title, '=' * 60, '', '등장인물']
    for _id, name, tag in people:
        L.append('  %-6s — %s' % (name, tag))
    L += ['', '표기: [인물] 대사   /   [   ] 는 나레이션(지문)   /   → 는 선택지·보기', '=' * 60, '']

    # 정렬용 여분 공백이 있어도 잡히도록 \s* 로 느슨하게 (실제로 한 번 놓쳤다)
    chapters = re.findall(r"\{\s*id: '(c\d)',[^}]*?title: '([^']*)',\s*sub: '([^']*)'\s*\}", s)
    if chapters:                                   # 장(章)형
        keys = [c[0] for c in chapters]
        heads = ['%d장. %s — %s' % (i + 1, c[1], c[2]) for i, c in enumerate(chapters)]
    else:                                          # 친구형 (namsan)
        keys = [i for i, _n, _t in people if 'QUESTS.%s' % i in s or "QUESTS['%s']" % i in s]
        heads = ['%s 이야기' % names.get(k, k) for k in keys]

    for idx, key in enumerate(keys):
        marker = 'QUESTS.%s = {' % key
        if marker not in s:
            continue
        nxt = ['QUESTS.%s = {' % keys[idx + 1]] if idx + 1 < len(keys) else []
        nxt += ['// ===== 엔딩', 'async function playEnding']
        L += ['─' * 60, heads[idx], '─' * 60]
        L += render(block_between(s, marker, nxt))
        L.append('')

    if 'async function playEnding()' in s:
        L += ['─' * 60, '엔딩', '─' * 60]
        L += render(block_between(s, 'async function playEnding()', ["const c = $('credits')"]))

    for k, label in [('FINAL_MESSAGE', '크레딧 마지막 메시지'), ('ERA', '부제'), ('MAKER', '만든 사람')]:
        m = re.search(r"const %s = '((?:[^'\\]|\\.)*)'" % k, s)
        if m:
            L += ['', '  < %s >' % label]
            L += ['    ' + line.strip() for line in unesc(m.group(1)).split('\n')]
    L.append('')

    L += ['─' * 60, '평소 대사 (아무 때나 말 걸면 나오는 말)', '─' * 60]
    for pat, head in [(r"const FRIEND_LINES = \{(.*?)\n\};", '주인공·가족'),
                      (r"const NPC_LINES = \{(.*?)\n\};", '그 밖의 사람들')]:
        blk = re.search(pat, s, re.S)
        if not blk:
            continue
        L += ['', '  · %s' % head]
        for key, body in re.findall(r"(\w+):\s*(\[[^\]]*\]|'(?:[^'\\]|\\.)*')", blk.group(1)):
            for t in re.findall(r"'((?:[^'\\]|\\.)*)'", body):
                L.append('    [%s] %s' % (names.get(key, key), unesc(t)))
    L.append('')

    out = os.path.join(ROOT, game, '대사집.txt')
    io.open(out, 'w', encoding='utf-8', newline='\r\n').write('\n'.join(L))
    return '%-12s %4d줄  →  %s' % (game, len(L), out)


if __name__ == '__main__':
    targets = sys.argv[1:] or GAMES
    for g in targets:
        print(extract(g))
