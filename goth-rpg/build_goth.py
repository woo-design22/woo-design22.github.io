# -*- coding: utf-8 -*-
"""「고트전설」(goth-rpg) 빌드 — europe-rpg 엔진을 복제해 만든다.

고전 판타지 RPG(왕자의 망명과 귀환)를 이 포맷으로 아주 축약한 데모.
왕국·인물·지명은 전부 새로 지은 이름이다(특정 상용 작품의 설정을 옮기지 않는다).

구조상 앞선 데모들과 다른 점
  · 주인공이 자라난다: 소년(1~2장) → 청년(3~5장) → 왕(7장). S.heroSpr 로 갈아입는다.
  · 장면마다 장소가 완전히 달라진다(성 → 폐허 → 숲 → 마을 → 고개 → 성문 → 왕좌).
  · 보상함이 '전설의 유물' — 이야기를 증명하는 물건들.

    python goth-rpg/build_goth.py
"""
import io, os, re, shutil, sys

SRC = r'C:\Claude\europe-rpg'
DST = r'C:\Claude\goth-rpg'

os.makedirs(DST, exist_ok=True)
for f in ['bgm1.mp3', 'bgm2.mp3']:
    if not os.path.exists(os.path.join(DST, f)):
        shutil.copy(os.path.join(SRC, f), os.path.join(DST, f))
if not os.path.isdir(os.path.join(DST, 'icons')):
    shutil.copytree(os.path.join(SRC, 'icons'), os.path.join(DST, 'icons'))

s = io.open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()


def rep(old, new, n=1):
    global s
    c = s.count(old)
    if c != n:
        sys.exit('!! expected %d, found %d: %r' % (n, c, old[:90]))
    s = s.replace(old, new)


def swap(start, end, new):
    global s
    i0 = s.index(start); i1 = s.index(end, i0)
    s = s[:i0] + new + s[i1:]


# ================= 1) 겉면 · 저장 키 =================
rep('<title>우리가족 유럽여행</title>', '<title>고트전설 (데모)</title>')
s = re.sub(r'<meta name="description" content="[^"]*"',
           '<meta name="description" content="잃어버린 왕국을 되찾는 일곱 장면 — 고전 판타지 도트 RPG"', s, count=1)
s = s.replace("'eu_", "'gt_")

# ================= 2) 바꾸기 쉬운 것들 =================
swap("// ----- 선물하는 사람이 바꾸기 쉬운 것들 -----", "// ----- 상수 -----", """// ----- 선물하는 사람이 바꾸기 쉬운 것들 -----
const PASSWORD = '0000';
const FINAL_MESSAGE = '왕관은 머리에 얹는 것이 아니라\\n등에 지는 것이라고,\\n아버지는 말씀하셨다.';
const ERA = '고트 왕국 연대기';
const MAKER = '이야기공방';

""")

# ================= 3) 인물 · 일곱 장면 =================
swap("// ----- 설가네 네 식구 -----", "// ----- 캐릭터 픽셀 도안", """// ----- 등장인물 -----
const FRIENDS = [
  { id: 'ra', name: '라온', tag: '고트의 왕자 · 아무것도 모르던 아이',
    pal: { s: '#f1c7a3', h: '#c9a227', t: '#3f6fb0', p: '#33436b', b: '#5a3a22', a: '#e8dfc0' } },
  { id: 'br', name: '브란', tag: '늙은 기사 · 왕의 마지막 명령을 지킨다',
    pal: { s: '#e6c8a8', h: '#b8b8b8', t: '#6a7a86', p: '#4a5058', b: '#3a2a20', a: '#c9b06a' } },
  { id: 'si', name: '실비', tag: '숲의 궁수 · 갚을 빚이 있다', female: true,
    pal: { s: '#f7d3b3', h: '#5a3a2a', t: '#4a7a5f', p: '#3f5a45', b: '#5a3a22', a: '#e8f0d8' } },
  { id: 'ka', name: '카르젠', tag: '재상 · 왕의 오른팔이었던 사람',
    pal: { s: '#dcc0a8', h: '#2a2a30', t: '#5a3a6b', p: '#3a2a44', b: '#1e1e22', a: '#c9a227' } }
];
const F = {}; FRIENDS.forEach(f => { F[f.id] = f; });

// 일곱 장면 — 잃고, 자라고, 돌아온다
const CHAPTERS = [
  { id: 'c1', hero: 'ra', title: '왕의 아침', sub: '고트 성' },
  { id: 'c2', hero: 'ra', title: '무너진 성', sub: '그날 밤' },
  { id: 'c3', hero: 'ra', title: '숲에서 자란 아이', sub: '십 년 뒤' },
  { id: 'c4', hero: 'ra', title: '빚을 갚는 활', sub: '변방 마을' },
  { id: 'c5', hero: 'ra', title: '이름을 되찾다', sub: '바람 고개' },
  { id: 'c6', hero: 'ra', title: '성문 앞에서', sub: '고트 성' },
  { id: 'c7', hero: 'ra', title: '왕좌의 방', sub: '고트 성' }
];
const CH = {}; CHAPTERS.forEach(c => { CH[c.id] = c; });

// 주변 사람들
const NPC_PAL = {
  king:    { s: '#e6c8a8', h: '#c9c9c9', t: '#7a3a5a', p: '#4a2a3a', b: '#2b2b33', a: '#e0c04a' },  // 고트 왕
  queen:   { s: '#f7d3b3', h: '#8a6a3a', t: '#c9a2c9', p: '#6b5a8c', b: '#f4f4f4', a: '#ffffff', female: true },
  guard:   { s: '#e6b48f', h: '#4a4a4a', t: '#6a7a86', p: '#4a5058', b: '#2b2b33', a: '#c9b06a' },  // 근위병
  soldier: { s: '#dcc0a8', h: '#2a2a2a', t: '#7a3a3a', p: '#4a2a2a', b: '#1e1e22', a: '#8a8a94' },  // 반란군
  villager:{ s: '#e6b48f', h: '#777777', t: '#8a7a5a', p: '#5a4a3a', b: '#3a2a20', a: '#d9c9a8' },
  granny:  { s: '#e6c8a8', h: '#c9c9c9', t: '#8a6a7a', p: '#5a5a5a', b: '#2b2b33', a: '#d9c9a8', female: true },
  kid:     { s: '#f7d3b3', h: '#3a2a20', t: '#e0c04a', p: '#5a6b7a', b: '#f4f4f4', a: '#ffffff' },
  bandit:  { s: '#dcc0a8', h: '#3a2a20', t: '#5a4a3a', p: '#3a3028', b: '#1e1e22', a: '#8a3a3a' },
  // 갈아입는 옷
  raBoy:   { s: '#f1c7a3', h: '#c9a227', t: '#c9d0e0', p: '#5a6b8a', b: '#5a3a22', a: '#ffffff' },  // 소년 왕자
  raWood:  { s: '#e6b48f', h: '#c9a227', t: '#6a7a5a', p: '#4a4a3a', b: '#5a3a22', a: '#d9c9a8' },  // 숲의 청년
  raKnight:{ s: '#e6b48f', h: '#c9a227', t: '#3f6fb0', p: '#33436b', b: '#5a3a22', a: '#e0c04a' },  // 갑옷
  raKing:  { s: '#e6b48f', h: '#c9a227', t: '#7a3a5a', p: '#4a2a3a', b: '#2b2b33', a: '#e0c04a' }   // 왕
};
const OUTLINE = '#1d1a2b';

""")

# ================= 4) 타일 =================
TILES_NEW = '''const TILES = {
  // --- 바깥 ---
  '.': { name: '풀밭' }, ',': { name: '들꽃' }, '_': { name: '흙길' }, '=': { name: '돌길' },
  'T': { name: '나무', solid: true, over: true }, 't': { name: '덤불', solid: true, over: true },
  '^': { name: '바위산', solid: true }, '~': { name: '강물', solid: true },
  'n': { name: '눈', }, 'X': { name: '공간밖', solid: true },
  // --- 성 ---
  'W': { name: '성벽', solid: true }, 'w': { name: '스테인드글라스', solid: true },
  'P': { name: '기둥', solid: true, over: true }, 'p': { name: '대리석 바닥' },
  'R': { name: '붉은 융단' }, 'K': { name: '왕좌', solid: true, over: true },
  'L': { name: '횃불', solid: true, over: true }, 'D': { name: '성문', over: true },
  'A': { name: '갑주 장식', solid: true, over: true }, 'B': { name: '깃발', solid: true, over: true },
  // --- 폐허 ---
  'x': { name: '무너진 벽', solid: true, over: true }, 'z': { name: '불길', solid: true, over: true },
  // --- 마을·오두막 ---
  'f': { name: '나무 바닥' }, '|': { name: '흙벽', solid: true },
  'h': { name: '초가지붕', solid: true }, 'H': { name: '흙벽', solid: true },
  'o': { name: '우물', solid: true, over: true },
  'd': { name: '탁자', solid: true, over: true }, 'C': { name: '의자', solid: true, over: true },
  'e': { name: '침상', solid: true, over: true }, 'F': { name: '화로', solid: true, over: true },
  's': { name: '푯말', solid: true, over: true }, 'S': { name: '검 걸이', solid: true, over: true }
};
'''

ATLAS_NEW = r'''  // ===== 바깥 =====
  def('.', g => { R(g, 0, 0, T, T, '#5a9a48'); dots(g, 7, '#4b863c'); dots(g, 3, '#6fb058'); });
  def(',', g => { R(g, 0, 0, T, T, '#5a9a48'); dots(g, 6, '#4b863c'); R(g, 3, 4, 2, 2, '#e0c04a'); R(g, 10, 9, 2, 2, '#d98fb1'); R(g, 12, 3, 1, 1, '#ffffff'); });
  def('_', g => { R(g, 0, 0, T, T, '#b09a72'); dots(g, 8, '#9d8862'); dots(g, 3, '#c4ae86'); });
  def('=', g => { R(g, 0, 0, T, T, '#9a9a92'); R(g, 0, 0, T, 1, '#adada4'); R(g, 0, 7, T, 1, '#88887f'); R(g, 7, 0, 1, 7, '#88887f'); R(g, 3, 8, 1, 8, '#88887f'); });
  def('T', g => { R(g, 6, 10, 4, 6, '#5a3a22'); R(g, 2, 2, 12, 9, '#2c6b34'); R(g, 1, 4, 14, 5, '#2c6b34'); R(g, 4, 1, 8, 2, '#3a8342'); R(g, 3, 3, 4, 3, '#48994f'); R(g, 5, 8, 7, 2, '#1f5528'); });
  def('t', g => { R(g, 2, 6, 12, 8, '#357a3c'); R(g, 4, 4, 8, 3, '#357a3c'); R(g, 4, 6, 3, 2, '#4f9c56'); R(g, 9, 8, 3, 2, '#4f9c56'); R(g, 3, 12, 10, 2, '#25602c'); });
  def('^', g => { R(g, 0, 0, T, T, '#8a8378'); R(g, 0, 0, T, 3, '#a49c8f'); R(g, 2, 5, 5, 4, '#78715f'); R(g, 9, 8, 5, 5, '#78715f'); R(g, 3, 12, 4, 2, '#9a9284'); });
  def('~', g => { R(g, 0, 0, T, T, '#3f6f9a'); R(g, 0, 3, T, 1, '#5f92c0'); R(g, 0, 9, T, 1, '#5f92c0'); R(g, 4, 6, 6, 1, '#7fb0d8'); });
  def('n', g => { R(g, 0, 0, T, T, '#eef2f8'); dots(g, 6, '#dae2ee'); });
  def('X', g => { R(g, 0, 0, T, T, '#0e0d1a'); });

  // ===== 성 =====
  def('W', g => { R(g, 0, 0, T, T, '#8d8a80'); for (let y = 0; y < T; y += 5) { R(g, 0, y, T, 1, '#75726a'); R(g, (y / 5) % 2 ? 4 : 11, y, 1, 5, '#75726a'); } });
  def('w', g => { R(g, 0, 0, T, T, '#8d8a80'); R(g, 3, 1, 10, 13, '#4a4436'); R(g, 4, 2, 8, 11, '#3f6fb0');
    R(g, 5, 3, 3, 4, '#c94b6b'); R(g, 9, 3, 3, 4, '#e0c04a'); R(g, 5, 8, 3, 4, '#4f9c56'); R(g, 9, 8, 3, 4, '#7a4fa0');
    R(g, 8, 2, 1, 11, '#4a4436'); R(g, 4, 7, 8, 1, '#4a4436'); });
  def('P', g => { R(g, 3, 0, 10, 16, '#c9c4b4'); R(g, 3, 0, 10, 2, '#e0dbc9'); R(g, 3, 14, 10, 2, '#a8a294');
    R(g, 5, 2, 1, 12, '#b0aa9a'); R(g, 10, 2, 1, 12, '#b0aa9a'); });
  def('p', g => { R(g, 0, 0, T, T, '#ddd8ca'); R(g, 0, 0, 8, 8, '#e9e5d9'); R(g, 8, 8, 8, 8, '#e9e5d9'); R(g, 0, 0, T, 1, '#c6c0b0'); R(g, 0, 0, 1, T, '#c6c0b0'); });
  def('R', g => { R(g, 0, 0, T, T, '#8f2f3a'); dots(g, 5, '#7d2832'); dots(g, 2, '#a03a46'); R(g, 0, 0, T, 1, '#9c3540'); });
  def('K', g => { R(g, 3, 1, 10, 9, '#c9a227'); R(g, 4, 2, 8, 7, '#8f2f3a'); R(g, 5, 0, 2, 2, '#e0c04a'); R(g, 9, 0, 2, 2, '#e0c04a');
    R(g, 2, 10, 12, 3, '#c9a227'); R(g, 3, 13, 2, 3, '#8a6a1a'); R(g, 11, 13, 2, 3, '#8a6a1a'); });
  def('L', g => { R(g, 7, 6, 2, 10, '#5a3a22'); R(g, 5, 2, 6, 5, '#e0801a'); R(g, 6, 0, 4, 3, '#ffd166'); R(g, 7, 1, 2, 2, '#fff1c0'); });
  def('D', g => { R(g, 1, 0, 14, 16, '#5a3a22'); R(g, 2, 1, 12, 14, '#7a5230'); R(g, 7, 1, 2, 14, '#5a3a22');
    R(g, 2, 4, 12, 1, '#4a2f1c'); R(g, 2, 10, 12, 1, '#4a2f1c'); R(g, 11, 7, 2, 2, '#c9a227'); });
  def('A', g => { R(g, 5, 1, 6, 4, '#b0b4bc'); R(g, 6, 2, 4, 2, '#3a3f4a'); R(g, 4, 5, 8, 7, '#9aa0aa'); R(g, 6, 6, 4, 5, '#b0b4bc');
    R(g, 3, 6, 2, 8, '#8a9098'); R(g, 11, 6, 2, 8, '#8a9098'); R(g, 5, 12, 6, 4, '#8a9098'); });
  def('B', g => { R(g, 7, 0, 2, 16, '#5a3a22'); R(g, 2, 1, 5, 10, '#8f2f3a'); R(g, 9, 1, 5, 10, '#8f2f3a');
    R(g, 3, 4, 3, 3, '#c9a227'); R(g, 10, 4, 3, 3, '#c9a227'); R(g, 2, 11, 5, 2, '#7d2832'); R(g, 9, 11, 5, 2, '#7d2832'); });

  // ===== 폐허 =====
  def('x', g => { R(g, 0, 6, T, 10, '#7a7268'); R(g, 0, 6, T, 1, '#938b7f'); R(g, 2, 3, 5, 4, '#7a7268'); R(g, 10, 1, 4, 6, '#7a7268');
    R(g, 3, 9, 3, 1, '#5f594f'); R(g, 9, 11, 4, 1, '#5f594f'); });
  def('z', g => { R(g, 3, 8, 10, 8, '#e0801a'); R(g, 4, 4, 8, 6, '#f0a83a'); R(g, 6, 1, 4, 5, '#ffd166'); R(g, 7, 0, 2, 3, '#fff1c0');
    R(g, 5, 12, 6, 4, '#c9541a'); });

  // ===== 마을·오두막 =====
  def('f', g => { R(g, 0, 0, T, T, '#b58a56'); for (let y = 0; y < T; y += 4) { R(g, 0, y, T, 1, '#9d7647'); R(g, (y / 4) % 2 ? 3 : 10, y + 1, 1, 3, '#9d7647'); } });
  def('|', g => { R(g, 0, 0, T, T, '#c9b89a'); R(g, 0, 11, T, 5, '#ab9a7e'); R(g, 0, 0, T, 1, '#dccbae'); R(g, 0, 11, T, 1, '#93825f'); });
  def('h', g => { R(g, 0, 0, T, T, '#c2a05c'); for (let x = 0; x < T; x += 3) R(g, x, 0, 1, T, '#a6853f');
    R(g, 0, 0, T, 2, '#d8b877'); R(g, 0, 13, T, 3, '#8d6130'); });
  def('H', g => { R(g, 0, 0, T, T, '#c9b89a'); R(g, 0, 0, T, 2, '#8d6130');
    R(g, 5, 5, 6, 11, '#6b4226'); R(g, 6, 6, 4, 10, '#8a5a33'); R(g, 9, 11, 1, 2, '#c9a227');
    R(g, 0, 14, T, 2, '#a89678'); });
  def('o', g => { R(g, 2, 5, 12, 11, '#8d8a80'); R(g, 3, 6, 10, 9, '#3f5f7a'); R(g, 4, 7, 8, 7, '#5f8fb0');
    R(g, 1, 3, 14, 2, '#5a3a22'); R(g, 7, 0, 2, 4, '#5a3a22'); });
  def('d', g => { R(g, 1, 4, 14, 7, '#a8794f'); R(g, 1, 4, 14, 1, '#c69a68'); R(g, 2, 11, 2, 4, '#6b4226'); R(g, 12, 11, 2, 4, '#6b4226');
    R(g, 5, 6, 3, 3, '#e9e5d9'); R(g, 9, 7, 2, 2, '#c9a227'); });
  def('C', g => { R(g, 4, 2, 8, 2, '#8a5a33'); R(g, 4, 4, 2, 6, '#8a5a33'); R(g, 10, 4, 2, 6, '#8a5a33'); R(g, 3, 8, 10, 4, '#a8744a'); R(g, 4, 12, 2, 3, '#6b4226'); R(g, 10, 12, 2, 3, '#6b4226'); });
  def('e', g => { R(g, 1, 3, 14, 11, '#8a7a5a'); R(g, 1, 3, 14, 3, '#c9b89a'); R(g, 3, 7, 10, 5, '#a8956f'); R(g, 1, 13, 14, 2, '#6b5a3a'); });
  def('F', g => { R(g, 2, 8, 12, 6, '#6a6258'); R(g, 3, 9, 10, 4, '#3a352e'); R(g, 5, 5, 6, 5, '#e0801a'); R(g, 6, 3, 4, 3, '#ffd166'); R(g, 7, 2, 2, 2, '#fff1c0'); });
  def('s', g => { R(g, 7, 8, 2, 8, '#6b4226'); R(g, 1, 2, 14, 7, '#c9a97a'); R(g, 1, 2, 14, 1, '#8a6a3c'); R(g, 3, 4, 10, 1, '#6b4226'); R(g, 3, 6, 7, 1, '#6b4226'); });
  def('S', g => { R(g, 0, 0, T, T, '#c9b89a'); R(g, 7, 2, 2, 10, '#c0c4cc'); R(g, 4, 11, 8, 2, '#8a6a3c'); R(g, 7, 13, 2, 3, '#5a3a22'); R(g, 6, 1, 4, 2, '#e9edf2'); });
'''
swap("const TILES = {", "const ATLAS = {};", TILES_NEW)
i0 = s.index("  def('.', g =>")
i1 = s.index("})();", i0)
s = s[:i0] + ATLAS_NEW + s[i1:]

# ================= 5) 맵 =================
MAPS_NEW = '''const MAPS = {
  // ===== 1장 · 고트 성 대전 ===== 왕좌까지 붉은 융단이 곧게 뻗어 있다
  hall: { name: '고트 성 대전', base: 'p', rows: [
    'WWWWWWWWWWWWWWWWWW',
    'WwwWLWWWKKWWLWWwwW',
    'WppppppRRRRppppppW',
    'WpPppppRRRRpppPppW',
    'WppppppRRRRppppppW',
    'WpAppppRRRRppppApW',
    'WppppppRRRRppppppW',
    'WpPppppRRRRpppPppW',
    'WppppppRRRRppppppW',
    'WpBppppRRRRppppBpW',
    'WppppppRRRRppppppW',
    'WWWWWWWWDDWWWWWWWW',
    '==================',
    '=================='
  ], exits: [], signs: { '1,1': '스테인드글라스. 고트의 초대 왕이 그려져 있다.' },
  labels: [ { x: 9, y: 1, t: '왕좌' }, { x: 9, y: 11, t: '성문' } ] },

  // ===== 2장 · 무너진 성 ===== 같은 대전이 불타고 있다
  ruin: { name: '불타는 대전', base: 'p', rows: [
    'WWWWWWWWWWWWWWWWWW',
    'WxxWzWWWKKWWzWWxxW',
    'WppppppRRRRppppppW',
    'WpxppppRRRRpppxppW',
    'WppppppRRRRppppppW',
    'WpzppppRRRRppppzpW',
    'WppppppRRRRppppppW',
    'WpxppppRRRRpppxppW',
    'WppppppRRRRppppppW',
    'WpzppppRRRRppppzpW',
    'WppppppRRRRppppppW',
    'WWWWWWWWDDWWWWWWWW',
    '==================',
    '=================='
  ], exits: [], signs: {},
  labels: [ { x: 9, y: 1, t: '왕좌' }, { x: 9, y: 11, t: '성문 — 밖으로' } ] },

  // ===== 3장 · 숲속 오두막과 공터 =====
  forest: { name: '이름 없는 숲', base: '.', rows: [
    'TTTTTTTTTTTTTTTTTTTT',
    'T..................T',
    'T..hhhh....,.......T',
    'T..HHHH............T',
    'T............t.....T',
    'T..................T',
    'T....S.........,...T',
    'T..................T',
    'T.,......t.........T',
    'T..................T',
    'T....t........,....T',
    'T..................T',
    'TTTTTTTTTTTTTTTTTTTT'
  ], exits: [], signs: {},   // 검 걸이(5,6)에는 간판을 두지 않는다 — 간판이 quest.interact 보다 먼저 처리된다
  labels: [ { x: 4, y: 2, t: '오두막' }, { x: 12, y: 6, t: '공터' } ] },

  // ===== 4장 · 변방 마을 =====
  village: { name: '변방 마을 라운', base: '_', rows: [
    'TTTTTTTTTTTTTTTTTTTTTT',
    '______________________',
    '_hhhh_____hhhh____hhhh',
    '_HHHH_____HHHH____HHHH',
    '______________________',
    '______________________',
    '_________o____________',
    '______________________',
    '____s_________________',
    '______________________',
    '__t_______________t___',
    '______________________',
    'TTTTTTTTTTTTTTTTTTTTTT'
  ], exits: [], signs: { '4,8': '푯말 — 라운 마을.\\n「길손은 우물물을 마셔도 좋소」' },
  labels: [ { x: 9, y: 6, t: '우물' }, { x: 11, y: 2, t: '라운 마을' } ] },

  // ===== 5장 · 바람 고개 =====
  pass: { name: '바람 고개', base: '_', rows: [
    '^^^^^^^^^^^^^^^^^^^^',
    '^^^^^^^^^^^^^^^^^^^^',
    '^^^______________^^^',
    '^^________________^^',
    '^^__t__________t___^',
    '^^________________^^',
    '^^_____n____n_____^^',
    '^^________________^^',
    '^^__t__________t___^',
    '^^________________^^',
    '^^^______________^^^',
    '^^^^^^^^^^^^^^^^^^^^'
  ], exits: [], signs: {},
  labels: [ { x: 10, y: 2, t: '고개 마루' }, { x: 10, y: 10, t: '아래로' } ] },

  // ===== 6장 · 성문 앞 =====
  gate: { name: '고트 성문 앞', base: '=', rows: [
    'WWWWWWWWDDWWWWWWWWWW',
    'WWWWWWWWDDWWWWWWWWWW',
    '====================',
    '====================',
    '==L==============L==',
    '====================',
    '____________________',
    '____________________',
    '__t______________t__',
    '____________________',
    '.,..................',
    'TTTTTTTTTTTTTTTTTTTT'
  ], exits: [], signs: {},
  labels: [ { x: 9, y: 0, t: '성문' }, { x: 10, y: 9, t: '들판' } ] },

  // ===== 7장 · 왕좌의 방 (1장과 같은 곳, 십 년 뒤) =====
  throne: { name: '왕좌의 방', base: 'p', rows: [
    'WWWWWWWWWWWWWWWWWW',
    'WwwWLWWWKKWWLWWwwW',
    'WppppppRRRRppppppW',
    'WpPppppRRRRpppPppW',
    'WppppppRRRRppppppW',
    'WpAppppRRRRppppApW',
    'WppppppRRRRppppppW',
    'WpPppppRRRRpppPppW',
    'WppppppRRRRppppppW',
    'WpBppppRRRRppppBpW',
    'WppppppRRRRppppppW',
    'WWWWWWWWDDWWWWWWWW',
    '==================',
    '=================='
  ], exits: [], signs: { '1,1': '스테인드글라스. 십 년 전과 똑같이 서 있다.' },
  labels: [ { x: 9, y: 1, t: '왕좌' } ] }
};
'''
swap("const MAPS = {", "// 맵 크기·바닥 캐시", MAPS_NEW)

# ================= 6) 사람 배치 =================
NPCS_NEW = '''const NPCS = {
  hall: [
    { id: 'king', spr: 'king', x: 9, y: 2, dir: 'down', name: '고트 왕' },
    { id: 'guardA', spr: 'guard', x: 6, y: 5, dir: 'right', name: '근위병' },
    { id: 'guardB', spr: 'guard', x: 12, y: 5, dir: 'left', name: '근위병' }
  ],
  ruin: [
    { id: 'soldierA', spr: 'soldier', x: 5, y: 6, dir: 'right', name: '반란군 병사' },
    { id: 'soldierB', spr: 'soldier', x: 13, y: 6, dir: 'left', name: '반란군 병사' }
  ],
  forest: [],
  village: [
    { id: 'granny', spr: 'granny', x: 12, y: 7, dir: 'down', name: '마을 할머니' },
    { id: 'kid', spr: 'kid', x: 8, y: 9, dir: 'up', name: '마을 아이' },
    { id: 'bandit', spr: 'bandit', x: 9, y: 5, dir: 'down', name: '산적 두목' }
  ],
  pass: [],
  gate: [ { id: 'soldierC', spr: 'soldier', x: 9, y: 3, dir: 'down', name: '문지기' } ],
  throne: [
    { id: 'guardA', spr: 'guard', x: 6, y: 8, dir: 'right', name: '옛 근위병' },
    { id: 'guardB', spr: 'guard', x: 12, y: 8, dir: 'left', name: '옛 근위병' }
  ]
};
'''
swap("const NPCS = {", "// 가족 배치는 각 장면 대본", NPCS_NEW)

# ================= 7) 타일 설명 =================
LOOK_NEW = '''const GENERIC_LOOK = {
  K: '고트의 왕좌. 앉는 자리가 닳아 있다.', R: '붉은 융단. 대대로 왕이 걸어온 길이다.',
  w: '스테인드글라스. 고트의 초대 왕이 그려져 있다.', P: '돌기둥.', A: '갑주 장식. 속은 비어 있다.',
  B: '고트의 깃발. 붉은 바탕에 금빛 뿔.', L: '횃불.', D: '성문.', W: '성벽.',
  x: '무너진 벽. 불에 그을렸다.', z: '불길. 다가갈 수 없다.',
  h: '초가지붕.', H: '흙벽. 문이 닫혀 있다.', o: '마을 우물. 두레박이 걸려 있다.', s: '푯말.', S: '검 걸이. 오래 손질된 검이다.',
  d: '탁자.', C: '의자.', e: '침상.', F: '화로. 불씨가 남아 있다.', h: '초가지붕.',
  T: '나무.', t: '덤불.', '^': '바위산. 넘을 수 없다.', '~': '강물.', n: '녹지 않은 눈.',
  ',': '들꽃이 피었다.', '_': '흙길.', '=': '돌길.', f: '나무 바닥.', p: '대리석 바닥.'
};
'''
swap("const GENERIC_LOOK = {", "function pressA()", LOOK_NEW)

# ================= 8) 대사 테이블 =================
LINES_NEW = '''const NPC_LINES = {
  king: ['라온. 오늘도 늦잠이냐.', '왕관은 머리에 얹는 것이 아니라 등에 지는 것이다.'],
  guardA: ['왕자님, 뛰지 마십시오!', '오늘은 성 밖에 나가시면 안 됩니다.'],
  guardB: ['대전은 언제나 조용합니다.', '고트는 삼백 년을 이렇게 서 있었습니다.'],
  soldierA: ['거기 누구냐!', '아이 하나 놓쳤다고 큰일이야 나겠나.'],
  soldierB: ['불을 더 놓아라!', '재상님 명령이다.'],
  soldierC: ['성문은 닫혔다. 돌아가라.', '재상님 허락 없이는 아무도 못 들어간다.'],
  granny: ['이 마을엔 이제 젊은 사람이 없어요.', '산적들이 다 가져가 버렸지.'],
  kid: ['형아 검 들고 있다!', '우리 아빠도 검 있었는데…'],
  bandit: ['이 마을은 이제 우리 거다.', '꼬맹이는 비켜라.']
};
const FRIEND_LINES = {
  ra: ['(아직 검이 무겁다)', '언젠가는… 돌아갈 수 있을까.'],
  br: ['자세가 흐트러졌다. 다시.', '왕자님이라 부르지 않겠다. 아직은.'],
  si: ['활은 숨을 멈추고 쏘는 거야.', '나는 갚을 빚이 있어서 따라온 거야.'],
  ka: ['…….']
};
'''
swap("const NPC_LINES = {", "function markEnts", LINES_NEW)

# ================= 9) 일곱 장면 =================
QUESTS_NEW = r'''// ===== 장면 대본 =====
// 잃고, 자라고, 돌아온다. 고전 판타지의 뼈대를 일곱 장면으로 줄였다.
const QUESTS = {};

// --- 1. 왕의 아침 (고트 성) ---
QUESTS.c1 = {
  start: { map: 'hall', x: 9, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '융단을 따라 올라가 아버지께 인사하기'; },
  hint() { return '붉은 융단 위를 곧장 위로 걸어가면 됩니다.'; },
  async onEnter() { S.heroSpr = 'raBoy'; },
  async intro() {
    await say('', '고트 왕국. 삼백 년을 서 있는 성.');
    await say('', '열두 살 라온에게 이 성은 그저 뛰어다니는 곳이었다.');
    await say('라온', '(아버지가 부르셨다. 또 잔소리겠지.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(S.q.stage >= 1 ? ['king'] : []); },
  npcTalk: {
    king: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '가 보아라. 오늘은 날이 좋구나.'); return; }
      await say('고트 왕', '라온. 이리 오너라.');
      await say('라온', '예, 아버지.');
      await say('고트 왕', '이 융단이 무엇으로 보이느냐.');
      const i = await ask('라온', '', ['붉은 천입니다.', '왕께 가는 길입니다.', '…잘 모르겠습니다.']);
      if (i === 0) await say('고트 왕', '허허. 틀린 말은 아니다.');
      else if (i === 1) await say('고트 왕', '반은 맞았다.');
      else await say('고트 왕', '모르는 것을 모른다 하는 것도 왕의 일이다.');
      await say('고트 왕', '이건 백성이 왕에게 오는 길이다. 반대가 아니라.');
      await say('고트 왕', '왕관은 머리에 얹는 것이 아니라, 등에 지는 것이다.');
      await say('라온', '(무슨 말인지 하나도 몰랐다.)');
      await say('', '그날 라온은 그 말을 흘려들었다.');
      await say('', '십 년 뒤에야 그 말을 매일 되뇌게 될 줄은 몰랐다.');
      await showPhoto('crest', '고트의 문장 — 붉은 바탕에 금빛 뿔', 2000);
      await finishQuest();
    },
    guardA: async e => { await say(e.name, '왕자님, 뛰지 마십시오!'); },
    guardB: async e => { await say(e.name, '대전은 언제나 조용합니다.'); }
  }
};

// --- 2. 무너진 성 (그날 밤) ---
QUESTS.c2 = {
  start: { map: 'ruin', x: 9, y: 3, dir: 'down' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '브란을 따라 성문으로 (아래로)' : '병사들을 뚫고 나가기'; },
  hint() { return '아래쪽 성문까지 곧장 내려가면 됩니다. 브란이 앞을 막아 줍니다.'; },
  async onEnter() { S.heroSpr = 'raBoy'; S.tint = 'rgba(120, 40, 20, 0.18)'; },
  familyPos: fam('ruin', [['br', 9, 2, 'down']]),
  async intro() {
    await say('', '그날 밤, 성에 불이 붙었다.');
    await say('', '왕은 왕좌 앞에서 쓰러졌고, 재상 카르젠이 그 자리에 섰다.');
    await say('브란', '왕자님! 이쪽입니다!');
    await say('라온', '아버지는… 아버지는요!');
    await say('브란', '…폐하께서 제게 마지막으로 내리신 명은 하나였습니다.');
    await say('브란', '「아이를 살려라.」');
    await say('라온', '싫어! 나도 싸울 거야!');
    await say('브란', '왕자님. 지금 죽으면 고트는 오늘로 끝납니다.');
    await say('', '브란은 라온을 안아 들고 뛰었다.');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId !== 'ruin' || q.stage !== 1 || y < 10) return;
    S.lock = true;
    q.stage = 2; save();
    await say('반란군 병사', '거기 누구냐! 아이다! 잡아라!');
    await say('브란', '(등 뒤로 라온을 밀어 넣는다) 뒤만 보고 뛰십시오.');
    await say('', '연기 속을 뚫고 성문으로!');
    const n = await playCrowd(3);
    await say('', '성문을 지나 들판으로. 뒤에서 성이 무너지는 소리가 났다.');
    await say('라온', '(한 번만… 한 번만 돌아보고 싶었다.)');
    await say('브란', '돌아보지 마십시오. 그게 오늘 왕자님의 싸움입니다.');
    await say('', '그렇게 고트의 마지막 왕자는 이름을 버리고 사라졌다.');
    await showPhoto('ember', '그날 밤 · 불타는 고트 성', 2000);
    S.tint = null;
    S.lock = false;
    await finishQuest();
  },
  npcTalk: {
    soldierA: async e => { await say(e.name, '거기 누구냐!'); },
    soldierB: async e => { await say(e.name, '불을 더 놓아라!'); }
  }
};

// --- 3. 숲에서 자란 아이 (십 년 뒤) ---
QUESTS.c3 = {
  start: { map: 'forest', x: 10, y: 8, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '검 걸이에서 검 받기' : '브란과 검술 겨루기'; },
  hint() { return '왼쪽 공터의 검 걸이 앞에서 A. 그다음 브란에게 말을 거세요.'; },
  async onEnter() { S.heroSpr = 'raWood'; },
  familyPos: fam('forest', [['br', 10, 6, 'down']]),
  async intro() {
    await say('', '십 년이 지났다.');
    await say('', '라온은 숲에서 자랐다. 나무를 하고, 물을 긷고, 매일 검을 들었다.');
    await say('라온', '(브란은 내가 누구인지 끝내 말해 주지 않았다.)');
    await say('브란', '늦었다. 오늘 몫은 백 번이다.');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { const q = S.q; markEnts(q.stage >= 1 ? ['br'] : []); },
  interact(mapId, x, y, ch) {
    if (mapId !== 'forest' || ch !== 'S' || S.q.stage !== 0) return null;
    return async () => {
      await say('', '검 걸이. 브란이 십 년을 갈아 온 검이 걸려 있다.');
      await say('라온', '(처음 잡았을 땐 들지도 못했는데.)');
      got('검을 들었다');
      S.q.stage = 1; setHud(); save(); QUESTS.c3.marks();
      await say('브란', '왔으면 서라. 오늘은 백 번이 아니라 한 번이다.');
    };
  },
  familyTalk: {
    br: async e => {
      const q = S.q;
      if (q.stage < 1) { await say(e.name, '검부터 들어라.'); return; }
      await say('브란', '한 번에 나를 넘기면, 오늘부터 아무 말도 안 시키겠다.');
      await say('라온', '…진심입니까?');
      await say('브란', '나는 농담을 한 적이 없다.');
      const win = await playRhythm('브란과의 겨루기 ♪', 8, 6);
      if (!win) { await say('브란', '다시.'); await say('라온', '(팔이 저리다. 그래도 다시.)'); return; }
      await say('', '나무 검이 부딪히는 소리가 숲에 울렸다.');
      await say('브란', '……');
      await say('브란', '(늙은 기사는 처음으로 뒤로 한 걸음 물러섰다.)');
      await say('브란', '되었다. 오늘은 여기까지.');
      await say('라온', '브란. 이제 말해 주십시오. 나는 누구입니까.');
      await say('브란', '…아직이다.');
      await say('라온', '십 년째 아직입니다!');
      await say('브란', '…네가 그 이름을 감당할 수 있게 되면.');
      await say('', '그날 밤 브란은 오래 잠들지 못했다.');
      await showPhoto('sword', '십 년 · 손에 익은 검', 2000);
      await finishQuest();
    }
  }
};

// --- 4. 빚을 갚는 활 (변방 마을) ---
QUESTS.c4 = {
  start: { map: 'village', x: 11, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '우물 앞 산적에게 다가가기' : '실비와 함께 산적 몰아내기'; },
  hint() { return '가운데 우물 쪽으로 걸어가면 됩니다.'; },
  async onEnter() { S.heroSpr = 'raWood'; },
  async intro() {
    await say('', '숲 아래 변방 마을 라운. 장을 보러 내려온 길이었다.');
    await say('', '그런데 마을이 조용하다. 너무 조용하다.');
    await say('마을 아이', '형아… 저기 나쁜 사람들 있어.');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { markEnts(['bandit']); },
  npcTalk: {
    bandit: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '…다시는 안 온다. 안 온다고!'); return; }
      await say('산적 두목', '뭐야 너. 꼬맹이는 비켜라.');
      const i = await ask('라온', '', [
        '우물은 마을 것입니다. 비키십시오.',
        '(검을 뽑는다)',
        '…사람이 몇 명입니까?']);
      if (i === 0) await say('산적 두목', '허, 말은 잘하네.');
      else if (i === 1) await say('산적 두목', '오냐, 해 보자!');
      else await say('산적 두목', '세어서 뭐 하게? 다 덤빌 건데.');
      await say('', '산적 여섯이 라온을 둘러쌌다. 그때—');
      await say('', '(휙!) 화살 한 대가 두목의 모자를 꿰뚫고 지나갔다.');
      await say('실비', '다섯 셀 동안 마을에서 나가. 하나.');
      await say('산적 두목', '누, 누구야!');
      await say('실비', '둘.');
      await say('', '라온과 실비가 마을 골목을 함께 뚫었다.');
      const n = await playCrowd(3);
      await say('', '산적들은 산으로 달아났다.');
      await say('라온', '…고맙습니다. 누구십니까?');
      await say('실비', '실비. 이 마을에 빚이 있어서.');
      await say('실비', '십 년 전에 여기 사람들이 나를 숨겨 줬거든.');
      await say('라온', '십 년 전…');
      await say('실비', '고트 성이 불탄 해. 도망친 사람이 나 말고도 많았어.');
      await say('라온', '(왜 가슴이 뛰지.)');
      await say('마을 할머니', '고맙습니다, 고맙습니다…');
      await say('', '그날 라온에게 처음으로 동료가 생겼다.');
      await showPhoto('arrow', '라운 마을 · 화살 한 대', 2000);
      await finishQuest();
    },
    granny: async e => { await say(e.name, '이 마을엔 이제 젊은 사람이 없어요.'); },
    kid: async e => { await say(e.name, '형아 검 들고 있다!'); }
  }
};

// --- 5. 이름을 되찾다 (바람 고개) ---
QUESTS.c5 = {
  start: { map: 'pass', x: 10, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '고개 마루까지 올라가기 (위로)'; },
  hint() { return '위로 곧장 걸어 올라가면 됩니다.'; },
  async onEnter() { S.heroSpr = 'raWood'; },
  familyPos: fam('pass', [['br', 9, 7, 'up'], ['si', 11, 7, 'up']]),
  async intro() {
    await say('', '바람 고개. 여기서는 고트 성이 보인다고 했다.');
    await say('브란', '…오늘은 여기까지 오르십시오.');
    await say('라온', '브란. 오늘은 대답해 주십시오.');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId !== 'pass' || q.stage !== 1 || y > 3) return;
    S.lock = true;
    q.stage = 2; save();
    await say('', '고개 마루. 발아래로 들판이 열리고, 저 멀리 성이 서 있었다.');
    await say('라온', '…저게.');
    await say('브란', '고트 성입니다.');
    await say('', '늙은 기사는 무릎을 꿇었다. 십 년 만에 처음이었다.');
    await say('브란', '라온 고트 왕자님.');
    await say('라온', '…….');
    await say('브란', '늦어서 죄송합니다. 폐하의 마지막 명을 이제야 끝냅니다.');
    await say('실비', '(그래서 눈이 그렇게 익었구나.)');
    const i = await ask('라온', '(무슨 말을 해야 하지)', [
      '일어나십시오, 브란.',
      '왜 이제야 말합니까.',
      '(아무 말도 나오지 않는다)']);
    if (i === 0) await say('브란', '…예. 왕자님.');
    else if (i === 1) { await say('브란', '감당하실 수 있게 되기를 기다렸습니다.'); await say('라온', '지금은 감당이 됩니까?'); await say('브란', '오늘 아침에 저를 넘기셨습니다.'); }
    else await say('', '바람만 오래 불었다.');
    await say('라온', '아버지가 하신 말이 이제야 들립니다.');
    await say('라온', '「왕관은 머리에 얹는 것이 아니라 등에 지는 것이다.」');
    await say('브란', '…폐하께서도 그 말을 하셨습니까.');
    await say('라온', '갑니다. 고트로.');
    await showPhoto('crown', '바람 고개 · 되찾은 이름', 2200);
    S.lock = false;
    await finishQuest();
  }
};

// --- 6. 성문 앞에서 (고트 성) ---
QUESTS.c6 = {
  start: { map: 'gate', x: 9, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '문지기에게 이름을 말하기'; },
  hint() { return '성문 앞 문지기에게 말을 거세요.'; },
  async onEnter() { S.heroSpr = 'raKnight'; },
  familyPos: fam('gate', [['br', 8, 6, 'up'], ['si', 10, 6, 'up']]),
  async intro() {
    await say('', '고트 성문 앞. 십 년 만이다.');
    await say('실비', '문이 닫혀 있어. 안에 몇 명이나 있을까.');
    await say('브란', '중요한 건 숫자가 아닙니다. 저 문을 여는 이름입니다.');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['soldierC']); },
  npcTalk: {
    soldierC: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '…어서 오십시오.'); return; }
      await say('문지기', '성문은 닫혔다. 돌아가라.');
      const i = await ask('라온', '(무엇이라 답할까)', [
        '라온 고트. 이 성의 왕자다.',
        '길 잃은 나그네입니다.',
        '(말없이 문장을 내보인다)']);
      if (i === 1) { await say('문지기', '나그네는 더 못 받는다. 가라.'); await say('브란', '왕자님. 오늘은 이름을 쓰셔야 합니다.'); }
      await say('라온', '라온 고트. 이 성의 왕자다.');
      await say('문지기', '…뭐?');
      await say('', '문지기는 라온의 얼굴을 오래 보았다.');
      await say('문지기', '…폐하를 닮으셨습니다.');
      await say('문지기', '저는… 십 년 전 그날, 대전 문 앞에 서 있던 병사입니다.');
      await say('문지기', '아무것도 못 하고 서 있었습니다.');
      await say('라온', '지금은 할 수 있는 게 있습니까?');
      await say('', '문지기는 한참을 서 있다가, 빗장을 풀었다.');
      await say('', '성문이 열렸다. 안쪽 복도에 옛 근위병들이 서 있었다.');
      await say('브란', '…다들 기다리고 있었군.');
      await showPhoto('gateopen', '고트 성문 · 십 년 만에 열리다', 2200);
      await finishQuest();
    }
  }
};

// --- 7. 왕좌의 방 ---
QUESTS.c7 = {
  start: { map: 'throne', x: 9, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '융단을 따라 왕좌 앞으로 (위로)' : '카르젠과 마주하기'; },
  hint() { return '십 년 전 그날처럼, 붉은 융단을 따라 곧장 올라가면 됩니다.'; },
  async onEnter() { S.heroSpr = 'raKnight'; },
  familyPos: fam('throne', [['ka', 9, 2, 'down'], ['br', 8, 9, 'up'], ['si', 10, 9, 'up']]),
  async intro() {
    await say('', '왕좌의 방. 스테인드글라스도, 융단도, 십 년 전 그대로였다.');
    await say('라온', '(이 길을 열두 살에 뛰어다녔다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['ka']); },
  async onStep(mapId, x, y) {
    if (mapId !== 'throne' || S.q.stage !== 1 || y > 4) return;
    S.q.stage = 2; setHud(); save();
    await say('카르젠', '…거기서 멈추어라.');
  },
  familyTalk: {
    ka: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '…….'); return; }
      await say('카르젠', '자랐구나. 눈이 아버지와 똑같다.');
      await say('라온', '왜 그랬습니까.');
      await say('카르젠', '고트는 삼백 년 동안 같은 방식으로 서 있었다. 그러다 무너지고 있었다.');
      await say('카르젠', '네 아버지는 바꾸려 하지 않았다. 그래서 내가 바꿨다.');
      await say('라온', '…열두 살짜리한테서 아버지를 빼앗는 방식으로요.');
      await say('카르젠', '…….');
      await say('실비', '십 년 동안 세금은 두 배가 됐고, 마을엔 산적이 들었어. 그게 당신이 바꾼 거야.');
      await say('브란', '카르젠. 자네는 왕의 오른팔이었네.');
      await say('카르젠', '…그만하게, 브란.');
      await say('', '카르젠이 검을 들었다. 마지막이었다.');
      const win = await playRhythm('마지막 겨루기 ♪', 8, 6);
      if (!win) { await say('카르젠', '아직 멀었다.'); await say('라온', '(다시. 아버지가 걸었던 길 위에서.)'); return; }
      await say('', '검이 바닥에 떨어졌다. 소리가 대전에 오래 울렸다.');
      await say('카르젠', '…쳐라. 그게 왕의 일이다.');
      const i = await ask('라온', '(무엇을 할까)', [
        '(검을 내린다) 재판을 받으십시오.',
        '아버지가 앉던 자리에서 사람을 베지는 않겠습니다.',
        '(아무 말 없이 융단을 가리킨다)']);
      if (i === 0) await say('카르젠', '…자비냐, 계산이냐.');
      else if (i === 1) await say('카르젠', '…네 아버지가 할 법한 말이구나.');
      else { await say('라온', '이 융단은 백성이 왕에게 오는 길입니다.'); await say('라온', '오늘은 당신이 그 길로 내려가십시오.'); await say('카르젠', '…….'); }
      await say('라온', '왕관은 머리에 얹는 것이 아니라 등에 지는 것이라고 하셨습니다.');
      await say('라온', '이제 제가 지겠습니다.');
      await say('', '옛 근위병들이 한쪽 무릎을 꿇었다. 브란이 가장 늦게, 가장 깊이 꿇었다.');
      await showPhoto('throne', '왕좌의 방 · 돌아온 왕', 2400);
      await finishQuest();
    },
    br: async e => { await say(e.name, '뒤는 제가 봅니다. 앞만 보십시오.'); },
    si: async e => { await say(e.name, '빚은 다 갚았어. 이제부터는 그냥 따라온 거야.'); }
  }
};

// ===== 엔딩 =====
async function playEnding() {
  quest = { familyPos: fam('throne', [['br', 7, 6, 'right'], ['si', 11, 6, 'left']]), hideNpc: () => false, goal: () => '' };
  S.ch = 'c7'; S.hero = 'ra'; S.q = { finished: true }; S.heroSpr = 'raKing';
  showScreen('game'); fit(); setHud(); $('hudGoal').textContent = '';
  S.tint = 'rgba(255, 200, 120, 0.16)'; S.focus = { x: 9, y: 5 };
  await goMap('throne', 9, 5, 'up', true);
  S.busy = true;
  await say('', '고트력 삼백십 년. 라온 고트가 왕좌에 앉았다.');
  await say('실비', '앉으니까 어때?');
  await say('라온', '…생각보다 딱딱해.');
  await say('브란', '원래 그렇습니다. 편하면 잘못된 겁니다.');
  await say('라온', '브란. 융단을 한 자만 더 넓히려 합니다.');
  await say('브란', '…이유를 여쭈어도 되겠습니까.');
  await say('라온', '올라오는 사람이 많아졌으면 해서요.');
  await say('', '늙은 기사는 대답 대신 오래 웃었다.');
  await showPhoto('legend', '고트전설 · 여기서 다시 시작된다', 2400);
  await fade(true);
  const c = $('credits'); c.innerHTML = '';
  const add = (t, cls) => { const p = document.createElement('p'); p.textContent = t; if (cls) p.className = cls; p.style.margin = '0 0 10px'; c.appendChild(p); };
  add(ERA);
  add('라온 · 브란 · 실비 · 카르젠', 'names');
  FINAL_MESSAGE.split('\n').forEach(l => add(l));
  add('BGM: 평화로운 피아노 브금 · A hisa – Dreamin’');
  add('— ' + MAKER + ' —');
  add('★ 이 게임은 주문 제작 데모입니다.');
  add('좋아하는 이야기도, 우리 가족 이야기도 이렇게 만들어 드립니다.');
  add('고트 왕국과 등장인물은 이 데모를 위해 지어낸 것입니다.');
  grantReward('end');
  S.tint = null; S.focus = null; quest = null;
  S.ending = true; save();
  showScreen('end');
  $('fade').classList.remove('on'); S.busy = false;
}
'''
q0 = s.index('// ===== 장면 대본 =====')
q1 = s.index('\n// ----- 배경음악')
s = s[:q0] + QUESTS_NEW + s[q1:]


# ================= 13) 남은 유럽 흔적 =================
s = re.sub(r'<p>파리에서 스위스까지[\s\S]{0,60}?</p>',
    '<p>불타는 성에서 도망친 왕자가<br>일곱 장면 만에 왕좌로 돌아옵니다.</p>', s, count=1)
s = s.replace('// 에펠탑: 타일로 쪼개면 타일 경계마다 끊겨 보인다. 하늘 위에 한 덩어리로 그린다.',
              '// (유럽여행에서 물려받은 하늘·탑 그리기. 이 게임에는 sky 맵이 없어 호출되지 않는다.)')
s = s.replace('// ① 사진 찍기 (에펠탑) — 해가 나서 화면이 밝아졌을 때 탭. 4장 찍으면 끝.',
              '// ① 활 쏘기 — 바람이 멎어 화면이 밝아졌을 때 탭.')
s = s.replace('// ② 인파 헤치기 (루브르) — 화면을 계속 탭하면 앞으로 간다. 끝까지 가면 성공.',
              '// ② 길 뚫기 — 화면을 계속 탭하면 앞으로 나아간다.')
s = s.replace('// ④ 골라잡기 (기차역·스위스 길찾기 공용) — 세 개 중 하나를 탭. 정답은 화면에 그려져 있다.',
              '// ④ 골라잡기 — 세 개 중 하나를 탭.')
s = s.replace('// ⑤ 라면 익히기 (융프라우) — 면이 노랗게 익으면 탭. 아주 넉넉한 구간.',
              '// ⑤ 달이기 — 알맞게 익으면 탭. (이 게임에서는 쓰지 않는다)')
# 유물함 마지막 그림: 탑승권 → 고트전설 두루마리
_tk = s.index('function drawTicket(g) {')
old_ticket = s[_tk:s.index(chr(10) + '}', _tk) + 2]
s = s.replace(old_ticket, """function drawTicket(g) {
  g.fillStyle = '#efe4c6'; g.fillRect(0, 0, 160, 110);
  g.fillStyle = '#d8c79f'; g.fillRect(0, 0, 160, 8); g.fillRect(0, 102, 160, 8);
  g.fillStyle = '#8f2f3a'; g.fillRect(0, 14, 160, 20);
  g.fillStyle = '#e0c04a'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center';
  g.fillText('고 트 전 설', 80, 29);
  g.fillStyle = '#5a4a30'; g.font = '10px sans-serif';
  g.fillText('불타는 성에서 도망친 아이가', 80, 52);
  g.fillText('십 년 뒤 왕좌로 돌아왔다', 80, 68);
  g.fillStyle = '#8f2f3a'; g.fillRect(66, 76, 28, 18);
  g.fillStyle = '#e0c04a'; g.fillRect(72, 80, 4, 10); g.fillRect(84, 80, 4, 10); g.fillRect(76, 84, 8, 3);
}""")

# ================= 10) 유물함 =================
REW_NEW = '''const REWARDS = [
  { id: 'crest', ch: 'c1', name: '고트의 문장', kind: 'photo', icon: '🛡' },
  { id: 'ember', ch: 'c2', name: '그날 밤의 불씨', kind: 'photo', icon: '🔥' },
  { id: 'sword', ch: 'c3', name: '십 년의 검', kind: 'photo', icon: '⚔' },
  { id: 'arrow', ch: 'c4', name: '실비의 화살', kind: 'photo', icon: '🏹' },
  { id: 'crown', ch: 'c5', name: '되찾은 이름', kind: 'photo', icon: '👑' },
  { id: 'gateopen', ch: 'c6', name: '열린 성문', kind: 'photo', icon: '🚪' },
  { id: 'throne', ch: 'c7', name: '왕좌', kind: 'photo', icon: '🪑' },
  { id: 'legend', ch: 'end', name: '고트전설', kind: 'draw', icon: '📜' }
];'''
r0 = s.index('const REWARDS = [')
r1 = s.index('];', r0) + 2
s = s[:r0] + REW_NEW + s[r1:]
s = s.replace('보상함', '유물함')

# ================= 11) 겉면 문구 =================
s = re.sub(r'<h1 style="font-size:26px">🔒[^<]*</h1>\s*<p>[^<]*</p>',
    '<h1 style="font-size:26px">🔒 고트전설</h1>\n    <p>체험판 비밀번호: <b>0000</b></p>\n    <p style="font-size:12px">좋아하는 이야기도 이 형식으로 만들어 드립니다.</p>', s, count=1)
s = re.sub(r'<h1><small>[^<]*</small>[\s\S]{0,60}?</h1>',
    '<h1><small>잃어버린 왕국의</small>고트<br>전설</h1>', s, count=1)
s = re.sub(r'<p>[^<]*일곱 장면[^<]*</p>',
    '<p>불타는 성에서 도망친 왕자가<br>일곱 장면 만에 왕좌로 돌아옵니다.</p>', s, count=1)
s = re.sub(r'<h1 style="font-size:26px">[^<]*장면[^<]*</h1>',
    '<h1 style="font-size:26px">고트 연대기</h1>', s, count=1)

# ================= 12) 장면 아이콘 =================
ICONS_NEW = r'''const CHAP_ICONS = {};
(function buildChapIcons() {
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const def = (k, fn) => { const c = document.createElement('canvas'); c.width = T; c.height = T; fn(c.getContext('2d')); CHAP_ICONS[k] = c; };
  // 1. 왕의 아침 — 왕좌와 융단
  def('c1', g => { R(g, 0, 0, 16, 16, '#ddd8ca'); R(g, 6, 0, 4, 16, '#8f2f3a');
    R(g, 4, 2, 8, 7, '#c9a227'); R(g, 5, 3, 6, 5, '#8f2f3a'); R(g, 5, 1, 2, 2, '#e0c04a'); R(g, 9, 1, 2, 2, '#e0c04a');
    R(g, 3, 9, 10, 2, '#c9a227'); });
  // 2. 무너진 성 — 불길
  def('c2', g => { R(g, 0, 0, 16, 16, '#2a1a18');
    R(g, 1, 8, 5, 8, '#7a7268'); R(g, 10, 6, 5, 10, '#7a7268');
    R(g, 5, 9, 6, 7, '#e0801a'); R(g, 6, 5, 4, 6, '#f0a83a'); R(g, 7, 2, 2, 4, '#ffd166'); R(g, 7, 1, 2, 2, '#fff1c0'); });
  // 3. 숲에서 자란 아이 — 검
  def('c3', g => { R(g, 0, 0, 16, 16, '#2c6b34'); R(g, 0, 12, 16, 4, '#5a9a48');
    R(g, 7, 1, 2, 10, '#c0c4cc'); R(g, 6, 0, 4, 2, '#e9edf2'); R(g, 4, 11, 8, 2, '#8a6a3c'); R(g, 7, 13, 2, 3, '#5a3a22'); });
  // 4. 빚을 갚는 활 — 화살
  def('c4', g => { R(g, 0, 0, 16, 16, '#b09a72'); R(g, 0, 0, 16, 5, '#5a9a48');
    R(g, 2, 8, 12, 1, '#8a6a3c'); R(g, 12, 6, 3, 2, '#c0c4cc'); R(g, 13, 8, 2, 2, '#c0c4cc');
    R(g, 2, 6, 2, 2, '#e9e5d9'); R(g, 2, 9, 2, 2, '#e9e5d9'); });
  // 5. 이름을 되찾다 — 왕관
  def('c5', g => { R(g, 0, 0, 16, 16, '#8fb8d8'); R(g, 0, 11, 16, 5, '#8a8378');
    R(g, 3, 7, 10, 5, '#c9a227'); R(g, 3, 4, 2, 4, '#c9a227'); R(g, 7, 3, 2, 5, '#c9a227'); R(g, 11, 4, 2, 4, '#c9a227');
    R(g, 3, 3, 2, 2, '#e0c04a'); R(g, 7, 2, 2, 2, '#e0c04a'); R(g, 11, 3, 2, 2, '#e0c04a');
    R(g, 5, 9, 2, 2, '#c94b6b'); R(g, 9, 9, 2, 2, '#3f6fb0'); });
  // 6. 성문 앞에서 — 열린 문
  def('c6', g => { R(g, 0, 0, 16, 16, '#8d8a80');
    R(g, 2, 1, 12, 15, '#5a3a22'); R(g, 3, 2, 5, 13, '#7a5230'); R(g, 9, 2, 4, 13, '#3a2a1a');
    R(g, 3, 6, 5, 1, '#4a2f1c'); R(g, 7, 8, 1, 2, '#c9a227'); });
  // 7. 왕좌의 방 — 스테인드글라스
  def('c7', g => { R(g, 0, 0, 16, 16, '#8d8a80'); R(g, 2, 1, 12, 14, '#4a4436');
    R(g, 3, 2, 4, 5, '#c94b6b'); R(g, 9, 2, 4, 5, '#e0c04a'); R(g, 3, 9, 4, 5, '#4f9c56'); R(g, 9, 9, 4, 5, '#7a4fa0');
    R(g, 7, 2, 2, 12, '#4a4436'); R(g, 3, 7, 10, 2, '#4a4436'); });
})();'''
i0 = s.index('const CHAP_ICONS = {};')
i1 = s.index('})();', i0) + 5
s = s[:i0] + ICONS_NEW + s[i1:]

io.open(os.path.join(DST, 'index.html'), 'w', encoding='utf-8', newline='').write(s)
print('1단계 완료:', len(s), 'chars')
