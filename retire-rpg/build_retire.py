# -*- coding: utf-8 -*-
"""「아버지의 정복」(retire-rpg) 빌드 — europe-rpg 엔진을 복제해 만든다.

연애물(love-rpg)과 구조를 일부러 다르게 잡았다.
  · 장면 = 장소가 아니라 **연도**다. 1988 → 2026, 38년을 일곱 장면으로 걷는다.
  · 같은 파출소 한 곳이 시대마다 다르게 보인다(S.era 가 타일을 다시 칠한다).
    무전기·타자기·형광등 → 모니터·정수기. 장소가 아니라 시간이 배경이다.
  · 6장까지는 아버지를 조작하고, **7장에서 딸로 시점이 바뀐다.**
  · 보상함이 사진첩이 아니라 **아버지 사물함**이다.

    python retire-rpg/build_retire.py
"""
import io, os, re, shutil, sys

SRC = r'C:\Claude\europe-rpg'
DST = r'C:\Claude\retire-rpg'

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
    if c != n: sys.exit('!! expected %d, found %d: %r' % (n, c, old[:90]))
    s = s.replace(old, new)

def swap(start, end, new):
    """start 부터 end 직전까지를 new 로 갈아 끼운다."""
    global s
    i0 = s.index(start); i1 = s.index(end, i0)
    s = s[:i0] + new + s[i1:]

# ================= 1) 겉면 =================
rep('<title>우리가족 유럽여행</title>', '<title>아버지의 정복 (데모)</title>')
s = re.sub(r'<meta name="description" content="[^"]*"',
           '<meta name="description" content="어느 경찰관의 38년을 일곱 장면으로 걷는 도트 RPG"', s, count=1)

# 저장 키 접두사
s = s.replace("'eu_", "'rt_")

# ================= 2) 바꾸기 쉬운 것들 =================
swap("// ----- 선물하는 사람이 바꾸기 쉬운 것들 -----", "// ----- 상수 -----", """// ----- 선물하는 사람이 바꾸기 쉬운 것들 -----
// 게임 비밀번호 (데모라 잠금 화면에 적어 둔다)
const PASSWORD = '0000';
// 엔딩 크레딧 마지막 메시지. 줄바꿈은 \\n
const FINAL_MESSAGE = '아버지가 지킨 자리는\\n골목 하나가 아니라\\n우리 넷의 밤이었습니다.\\n38년 동안, 고맙습니다.';
const ERA = '1988 - 2026, 서른여덟 해';
const MAKER = '딸이 아버지께';

""")

# ================= 3) 등장인물 · 장(章) · 주변 사람들 =================
# europe-rpg 는 이 구간에 FRIENDS / CHAPTERS / NPC_PAL / OUTLINE 이 붙어 있다. 통째로 간다.
PEOPLE = '''// ----- 등장인물 -----
// pal: s 피부, h 머리, t 윗옷, p 바지, b 신발, a 포인트
const FRIENDS = [
  { id: 'ap', name: '김성호', tag: '아버지 · 38년을 같은 골목에서',
    pal: { s: '#e6b48f', h: '#2a2a30', t: '#2f3f5c', p: '#22304a', b: '#1e1e22', a: '#c9b06a' } },
  { id: 'om', name: '박순임', tag: '어머니 · 야간 근무 날엔 잠을 못 잤다', female: true,
    pal: { s: '#f7d3b3', h: '#5a3a2a', t: '#e0a3b5', p: '#6b5a7a', b: '#f4f4f4', a: '#fff1f4' } },
  { id: 'dj', name: '김다정', tag: '딸 · 마지막 장면의 시점', female: true,
    pal: { s: '#f7d3b3', h: '#3a2a24', t: '#5fb88a', p: '#4a5a7a', b: '#2b2b33', a: '#e8fff0' } },
  { id: 'ms', name: '김민수', tag: '아들 · 아버지 정복을 몰래 입어 봤다',
    pal: { s: '#f1c7a3', h: '#2a2a2a', t: '#e9c44c', p: '#4a5d8c', b: '#2b2b33', a: '#fff7d6' } }
];
const F = {}; FRIENDS.forEach(f => { F[f.id] = f; });

// 일곱 장면 = 일곱 해. 장소가 아니라 시간이 배경이다.
const CHAPTERS = [
  { id: 'c1', hero: 'ap', title: '서울행 완행열차',     sub: '1988 · 스물둘' },
  { id: 'c2', hero: 'ap', title: '첫 야간 근무',        sub: '1990 · 순경' },
  { id: 'c3', hero: 'ap', title: '아이가 태어난 밤',    sub: '1995 · 경장' },
  { id: 'c4', hero: 'ap', title: '잃어버린 아이',       sub: '2001 · 경사' },
  { id: 'c5', hero: 'ap', title: '이름을 지운 밤',      sub: '2008 · 경위' },
  { id: 'c6', hero: 'ap', title: '정복이 부끄러웠던 날', sub: '2015 · 경감' },
  { id: 'c7', hero: 'dj', title: '마지막 근무',         sub: '2026 · 정년' }
];
const CH = {}; CHAPTERS.forEach(c => { CH[c.id] = c; });

// 주변 사람들 (같은 도안, 색만 다름)
const NPC_PAL = {
  chief:   { s: '#e6c8a8', h: '#7a7a7a', t: '#2f3f5c', p: '#22304a', b: '#1e1e22', a: '#c9b06a' },  // 소장님
  senior:  { s: '#e6b48f', h: '#4a4a4a', t: '#2f4a72', p: '#22304a', b: '#1e1e22', a: '#ffd166' },  // 선배
  rookie:  { s: '#f1c7a3', h: '#2a2a2a', t: '#2f4a72', p: '#22304a', b: '#1e1e22', a: '#ffd166' },  // 후배
  female:  { s: '#f7d3b3', h: '#4a2f24', t: '#2f4a72', p: '#22304a', b: '#1e1e22', a: '#ffd166', female: true },
  granny:  { s: '#e6c8a8', h: '#c9c9c9', t: '#8a6a7a', p: '#5a5a5a', b: '#2b2b33', a: '#d9c9a8', female: true },
  ajussi:  { s: '#e6b48f', h: '#777777', t: '#4c7a3f', p: '#3a3a3a', b: '#2b2b33', a: '#d9e8c9' },
  kid:     { s: '#f7d3b3', h: '#3a2a20', t: '#ffd166', p: '#5a6b7a', b: '#f4f4f4', a: '#ffffff' },
  nurse:   { s: '#f7d3b3', h: '#3a2a24', t: '#ffffff', p: '#cfe4f4', b: '#f4f4f4', a: '#7bd389', female: true },
  student: { s: '#f1c7a3', h: '#2a2a2a', t: '#e0e0e0', p: '#3a3a4a', b: '#2b2b33', a: '#ffffff' },
  // 시대별로 갈아입는 옷 (S.heroSpr 로 덮어쓴다)
  apYoung:  { s: '#e6b48f', h: '#2a2a30', t: '#8a7a5a', p: '#4a4a52', b: '#3a2a20', a: '#e8dfd0' },
  apRookie: { s: '#e6b48f', h: '#2a2a30', t: '#2f4a72', p: '#22304a', b: '#1e1e22', a: '#ffd166' },
  apSenior: { s: '#e6c8a8', h: '#8a8a8a', t: '#2f3f5c', p: '#22304a', b: '#1e1e22', a: '#c9b06a' },
  omYoung:  { s: '#f7d3b3', h: '#5a3a2a', t: '#c9d9e8', p: '#5a6b8a', b: '#f4f4f4', a: '#ffffff', female: true },
  djKid:    { s: '#f7d3b3', h: '#3a2a24', t: '#ff9eb5', p: '#6b5a8c', b: '#f4f4f4', a: '#fff1f4', female: true },
  djTeen:   { s: '#f7d3b3', h: '#3a2a24', t: '#e0e0e0', p: '#3a3a4a', b: '#2b2b33', a: '#ffffff', female: true }
};
const OUTLINE = '#1d1a2b';

'''
swap("// ----- 설가네 네 식구 -----", "// ----- 캐릭터 픽셀 도안", PEOPLE)

# ================= 4) 타일 · 시대 전환 · 맵 =================
# 유럽 관광지 타일을 걷어내고 파출소·기차·병원·집 타일로 갈아 끼운다.
TILES_NEW = '''const TILES = {
  // --- 공용 바닥·구조 ---
  '.': { name: '잔디' }, ',': { name: '풀꽃' }, '_': { name: '보도' },
  '=': { name: '도로', solid: true },   // 차도는 걸어 들어가지 않는다
  'f': { name: '마루' }, 'F': { name: '타일바닥' }, 'X': { name: '공간밖', solid: true },
  '|': { name: '실내벽', solid: true }, 'W': { name: '벽', solid: true }, 'w': { name: '창문', solid: true },
  'D': { name: '문', over: true }, 'T': { name: '나무', solid: true, over: true },
  't': { name: '덤불', solid: true, over: true }, 'L': { name: '가로등', solid: true, over: true },
  'i': { name: '화분', solid: true, over: true }, 'C': { name: '의자', solid: true, over: true },
  'd': { name: '책상', solid: true, over: true }, 'v': { name: '자판기', solid: true, over: true },
  's': { name: '간판', solid: true, over: true }, 'n': { name: '눈밭' },
  // --- 파출소 (시대에 따라 setEra 가 다시 칠한다) ---
  '1': { name: '민원 창구', solid: true, over: true },
  '2': { name: '무전 책상', solid: true, over: true },
  '3': { name: '서류 캐비닛', solid: true, over: true },
  '4': { name: '게시판', solid: true, over: true },
  '5': { name: '사물함', solid: true, over: true },
  '6': { name: '태극기', solid: true, over: true },
  // --- 기차 ---
  'r': { name: '선로', solid: true }, 'p': { name: '플랫폼' },
  'k': { name: '기차 앞', solid: true, over: true }, 'c': { name: '객차', solid: true, over: true },
  'S': { name: '좌석', solid: true, over: true }, 'g': { name: '차창', solid: true },
  // --- 병원 ---
  'h': { name: '진료실 문', solid: true, over: true }, 'b': { name: '대기 의자', solid: true, over: true },
  'x': { name: '접수대', solid: true, over: true },
  // --- 집 ---
  'e': { name: '밥상', solid: true, over: true }, 'o': { name: '이불', over: true },
  'z': { name: '싱크대', solid: true, over: true }, 'V': { name: '브라운관 TV', solid: true, over: true },
  // --- 골목 ---
  'Z': { name: '셔터 내린 가게', solid: true }, 'Y': { name: '전봇대', solid: true, over: true },
  'q': { name: '평상', solid: true, over: true }
};
'''

# ---- 타일 그림 ----
ATLAS_NEW = r'''  // ===== 공용 =====
  def('.', g => { R(g, 0, 0, T, T, '#5fae4a'); dots(g, 7, '#4f9a3d'); dots(g, 3, '#74c25c'); });
  def(',', g => { R(g, 0, 0, T, T, '#5fae4a'); dots(g, 6, '#4f9a3d'); R(g, 3, 4, 2, 2, '#ffd166'); R(g, 10, 9, 2, 2, '#ff8fb1'); });
  def('_', g => { R(g, 0, 0, T, T, '#b9b4a8'); R(g, 0, 0, T, 1, '#d2cdc0'); R(g, 0, 0, 1, T, '#d2cdc0'); R(g, 8, 0, 1, T, '#a39e92'); R(g, 0, 8, T, 1, '#a39e92'); });
  def('=', g => { R(g, 0, 0, T, T, '#55565e'); dots(g, 5, '#4a4b52'); R(g, 0, 7, 6, 2, '#d9d2a3'); });
  def('f', g => { R(g, 0, 0, T, T, '#c99a5b'); for (let y = 0; y < T; y += 4) { R(g, 0, y, T, 1, '#b4874d'); R(g, (y / 4) % 2 ? 3 : 10, y + 1, 1, 3, '#b4874d'); } });
  def('F', g => { R(g, 0, 0, T, T, '#d8d6cf'); R(g, 0, 0, 8, 8, '#e6e4dd'); R(g, 8, 8, 8, 8, '#e6e4dd'); R(g, 0, 0, T, 1, '#c1bfb7'); R(g, 0, 0, 1, T, '#c1bfb7'); });
  def('X', g => { R(g, 0, 0, T, T, '#0e0d1a'); });
  def('|', g => { R(g, 0, 0, T, T, '#e2dbcb'); R(g, 0, 10, T, 6, '#c9bfa8'); R(g, 0, 0, T, 1, '#f0e9db'); R(g, 0, 10, T, 1, '#b3a68c'); });
  def('W', g => { R(g, 0, 0, T, T, '#e9e2d3'); R(g, 0, 0, T, 1, '#c9c2b2'); R(g, 0, 15, T, 1, '#bdb6a6'); R(g, 0, 8, T, 1, '#d8d1c1'); });
  def('w', g => { R(g, 0, 0, T, T, '#e2dbcb'); R(g, 2, 2, 12, 11, '#4f5a6a'); R(g, 3, 3, 10, 9, '#9fd0ea'); R(g, 8, 3, 1, 9, '#4f5a6a'); R(g, 3, 7, 10, 1, '#4f5a6a'); R(g, 4, 4, 3, 2, '#d6f0fb'); });
  def('D', g => { R(g, 2, 1, 12, 15, '#6b4226'); R(g, 3, 2, 10, 14, '#8a5a33'); R(g, 7, 2, 2, 14, '#6b4226'); R(g, 10, 8, 1, 2, '#ffd166'); });
  def('T', g => { R(g, 6, 10, 4, 6, '#6b4226'); R(g, 2, 2, 12, 9, '#2f7a33'); R(g, 1, 4, 14, 5, '#2f7a33'); R(g, 4, 1, 8, 2, '#3d9442'); R(g, 5, 8, 7, 2, '#256629'); });
  def('t', g => { R(g, 2, 6, 12, 8, '#3d8a3f'); R(g, 4, 4, 8, 3, '#3d8a3f'); R(g, 4, 6, 3, 2, '#5cb15e'); R(g, 3, 12, 10, 2, '#2c6b2e'); });
  def('L', g => { R(g, 7, 4, 2, 12, '#44464f'); R(g, 5, 1, 6, 4, '#ffe9a3'); R(g, 6, 0, 4, 1, '#44464f'); });
  def('i', g => { R(g, 5, 9, 6, 6, '#b5573f'); R(g, 4, 9, 8, 1, '#d9704f'); R(g, 4, 2, 8, 7, '#3d8a3f'); R(g, 6, 0, 4, 3, '#49a84f'); R(g, 2, 4, 3, 3, '#49a84f'); R(g, 11, 5, 3, 3, '#49a84f'); });
  def('C', g => { R(g, 4, 2, 8, 2, '#5a5a64'); R(g, 4, 4, 2, 6, '#5a5a64'); R(g, 10, 4, 2, 6, '#5a5a64'); R(g, 3, 8, 10, 4, '#6e6e7a'); R(g, 4, 12, 2, 3, '#44464f'); R(g, 10, 12, 2, 3, '#44464f'); });
  def('v', g => { R(g, 2, 0, 12, 16, '#3f5a8a'); R(g, 3, 1, 10, 7, '#9fd0ea'); R(g, 4, 2, 2, 5, '#ffd166'); R(g, 7, 2, 2, 5, '#7bd389'); R(g, 4, 10, 8, 4, '#2a2a2a'); });
  def('s', g => { R(g, 7, 8, 2, 8, '#6b4226'); R(g, 1, 2, 14, 7, '#f4e8c1'); R(g, 1, 2, 14, 1, '#6b4226'); R(g, 1, 8, 14, 1, '#6b4226'); R(g, 3, 4, 10, 1, '#8a5a33'); R(g, 3, 6, 7, 1, '#8a5a33'); });
  def('n', g => { R(g, 0, 0, T, T, '#f0f4fa'); dots(g, 6, '#dde6f0'); dots(g, 3, '#ffffff'); });

  // ===== 기차 =====
  def('r', g => { R(g, 0, 0, T, T, '#6b5a4a'); R(g, 0, 3, T, 2, '#9a9aa4'); R(g, 0, 11, T, 2, '#9a9aa4'); for (let x = 1; x < T; x += 4) R(g, x, 0, 2, T, '#5a4a3a'); });
  def('p', g => { R(g, 0, 0, T, T, '#b8b4ac'); R(g, 0, 0, T, 1, '#cfcbc2'); dots(g, 5, '#a8a49c'); R(g, 0, 14, T, 2, '#e0c04a'); });
  def('k', g => { R(g, 0, 1, T, 14, '#3f5a8a'); R(g, 0, 1, T, 2, '#5a7aa8'); R(g, 2, 4, 12, 5, '#9fd0ea'); R(g, 1, 10, 14, 3, '#3a3a44'); R(g, 5, 12, 6, 3, '#2a2a33'); });
  def('c', g => { R(g, 0, 1, T, 14, '#4f6f4a'); R(g, 0, 1, T, 2, '#6a8a62'); R(g, 1, 4, 6, 5, '#9fd0ea'); R(g, 9, 4, 6, 5, '#9fd0ea'); R(g, 0, 10, T, 2, '#c9b06a'); R(g, 2, 13, 3, 2, '#2a2a33'); R(g, 11, 13, 3, 2, '#2a2a33'); });
  def('S', g => { R(g, 1, 3, 14, 10, '#7a5a4a'); R(g, 1, 3, 14, 2, '#8f6d59'); R(g, 2, 5, 12, 6, '#5f4436'); R(g, 1, 13, 3, 3, '#4a3a30'); R(g, 12, 13, 3, 3, '#4a3a30'); });
  def('g', g => { R(g, 0, 0, T, T, '#4f6f4a'); R(g, 1, 2, 14, 11, '#2f3f4a'); R(g, 2, 3, 12, 9, '#8fb8d8'); R(g, 2, 9, 12, 3, '#6a8a5a'); R(g, 8, 3, 1, 9, '#2f3f4a'); });

  // ===== 병원 =====
  def('h', g => { R(g, 0, 0, T, T, '#e8eef2'); R(g, 1, 1, 14, 15, '#c8d4dc'); R(g, 2, 2, 12, 8, '#f4f8fb'); R(g, 3, 3, 10, 6, '#9fc4d8'); R(g, 11, 10, 2, 2, '#8a94a6'); });
  def('b', g => { R(g, 1, 5, 14, 4, '#5a6b8a'); R(g, 1, 3, 14, 3, '#6a7b9a'); R(g, 2, 9, 2, 5, '#8a8a94'); R(g, 12, 9, 2, 5, '#8a8a94'); });
  def('x', g => { R(g, 0, 3, T, 11, '#d8dfe6'); R(g, 0, 3, T, 2, '#eef2f6'); R(g, 2, 7, 5, 4, '#ffffff'); R(g, 9, 7, 5, 4, '#9fc4d8'); R(g, 0, 14, T, 2, '#b9c2ca'); });

  // ===== 집 =====
  def('e', g => { R(g, 2, 4, 12, 8, '#c98b4a'); R(g, 2, 4, 12, 1, '#e0a95f'); R(g, 4, 6, 3, 3, '#f4f1e6'); R(g, 9, 6, 3, 3, '#f4f1e6'); R(g, 6, 10, 4, 2, '#e0c04a'); R(g, 3, 12, 2, 3, '#8a5a33'); R(g, 11, 12, 2, 3, '#8a5a33'); });
  def('o', g => { R(g, 1, 3, 14, 11, '#d9b8c9'); R(g, 1, 3, 14, 3, '#f0dbe6'); R(g, 3, 7, 10, 5, '#c49ab0'); });
  def('z', g => { R(g, 0, 2, T, 12, '#b9c2ca'); R(g, 0, 2, T, 2, '#d8dfe6'); R(g, 3, 6, 10, 5, '#8a94a6'); R(g, 6, 3, 4, 3, '#6a7480'); });
  def('V', g => { R(g, 1, 2, 14, 11, '#5a4a3a'); R(g, 2, 3, 12, 8, '#2a3a44'); R(g, 3, 4, 10, 6, '#7aa8c4'); R(g, 6, 13, 4, 3, '#4a3a30'); R(g, 12, 0, 1, 3, '#8a8a94'); });

  // ===== 골목 =====
  def('Z', g => { R(g, 0, 0, T, T, '#8a8a94'); for (let y = 1; y < T; y += 3) R(g, 0, y, T, 1, '#6e6e7a'); R(g, 0, 14, T, 2, '#4a4a54'); });
  def('Y', g => { R(g, 6, 0, 4, 16, '#7a6a5a'); R(g, 6, 3, 4, 1, '#5a4a3a'); R(g, 6, 9, 4, 1, '#5a4a3a'); R(g, 2, 2, 12, 1, '#3a3a44'); });
  def('q', g => { R(g, 1, 5, 14, 6, '#a8794f'); R(g, 1, 5, 14, 1, '#c69a68'); R(g, 2, 11, 2, 4, '#6b4226'); R(g, 12, 11, 2, 4, '#6b4226'); });

  // ===== 파출소 ===== 는 setEra 가 그린다 (1·2·3·4·5·6)
'''

swap("const TILES = {", "const ATLAS = {};", TILES_NEW)

# buildAtlas 안쪽(공용 def 부터 IIFE 끝까지)을 통째로 교체
i0 = s.index("  def('.', g =>")
i1 = s.index("})();", i0)
s = s[:i0] + ATLAS_NEW + s[i1:]

# ---- 시대별 파출소 그리기 ----
ERA_JS = r'''
// ----- 시대 -----
// 같은 파출소가 해마다 달라 보이게, 연도가 바뀌면 타일 여섯 개를 다시 칠한다.
// 이 게임에서 배경은 장소가 아니라 시간이다.
// 바닥·벽 색까지 함께 바꾼다. 낡은 누런 장판(1990) → 차갑고 밝은 타일(2026).
// 화면 전체 색조가 바뀌어야 '다른 시대'로 읽힌다.
const ERAS = {
  1990: { wall: '#ddd0b4', desk: '#8a5f3c', tech: 'radio', paper: '#f4e8c1', floor: '#d9c9a4', floor2: '#e6d8b8', grout: '#c2ae86' },
  1995: { wall: '#ddd0b4', desk: '#8a5f3c', tech: 'radio', paper: '#f4e8c1', floor: '#d9c9a4', floor2: '#e6d8b8', grout: '#c2ae86' },
  2001: { wall: '#e3ddc9', desk: '#7a6a52', tech: 'crt',   paper: '#eef0e8', floor: '#ddd6c2', floor2: '#eae4d2', grout: '#c9c1ab' },
  2008: { wall: '#e6e3d8', desk: '#6f6a5e', tech: 'crt',   paper: '#eef0e8', floor: '#e0ded2', floor2: '#eeecE2', grout: '#cbc9bd' },
  2015: { wall: '#e9eaec', desk: '#5f5f66', tech: 'lcd',   paper: '#f4f6f8', floor: '#e4e7ea', floor2: '#f1f4f7', grout: '#cdd2d7' },
  2026: { wall: '#eef0f3', desk: '#55555c', tech: 'lcd',   paper: '#f8fafc', floor: '#eaeef2', floor2: '#f7fafd', grout: '#d3d9df' }
};
let eraNow = null;
function setEra(year) {
  if (eraNow === year) return;
  eraNow = year;
  const E = ERAS[year] || ERAS[2026];
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const def = (ch, fn) => {
    const c = document.createElement('canvas'); c.width = T; c.height = T;
    const g = c.getContext('2d'); fn(g); ATLAS[ch] = c;
  };
  // 1 민원 창구 — 나무 카운터. 시대가 지나면 색이 차분해진다
  def('1', g => { R(g, 0, 2, T, 12, E.desk); R(g, 0, 2, T, 3, '#a8794f'); R(g, 0, 5, T, 1, '#6b4226');
    R(g, 2, 7, 5, 5, '#7a5232'); R(g, 9, 7, 5, 5, '#7a5232'); R(g, 0, 14, T, 2, '#5a3a22'); });
  // 2 무전 책상 — 1990 무전기 / 2001 브라운관 / 2015 LCD
  def('2', g => {
    R(g, 0, 8, T, 8, E.desk); R(g, 0, 8, T, 1, '#a8794f');
    if (E.tech === 'radio') {
      R(g, 3, 2, 10, 6, '#3a3f4a'); R(g, 4, 3, 5, 3, '#7bd389'); R(g, 10, 3, 2, 2, '#c94b4b');
      R(g, 12, 0, 1, 3, '#8a8a94'); R(g, 4, 6, 8, 1, '#5a5f6a');
    } else if (E.tech === 'crt') {
      R(g, 2, 1, 12, 7, '#d8d4c8'); R(g, 3, 2, 10, 5, '#2a3a44'); R(g, 4, 3, 8, 3, '#5a8ab0');
      R(g, 6, 8, 4, 1, '#b9b4a8');
    } else {
      R(g, 2, 1, 12, 6, '#2a2a30'); R(g, 3, 2, 10, 4, '#7aa8c4'); R(g, 7, 7, 2, 1, '#55555c');
    }
  });
  // 3 서류 캐비닛
  def('3', g => { R(g, 1, 1, 14, 15, E.tech === 'radio' ? '#8a8a72' : '#9aa0a6');
    R(g, 2, 3, 12, 3, E.paper); R(g, 2, 8, 12, 3, E.paper); R(g, 2, 13, 12, 2, E.paper);
    R(g, 7, 4, 2, 1, '#5a5a5a'); R(g, 7, 9, 2, 1, '#5a5a5a'); });
  // 4 게시판 — 수배 전단·표창장이 붙어 있다
  def('4', g => { R(g, 0, 0, T, T, E.wall); R(g, 1, 1, 14, 13, '#7a5a3c'); R(g, 2, 2, 12, 11, '#c9b898');
    R(g, 3, 3, 4, 5, E.paper); R(g, 9, 3, 4, 5, E.paper); R(g, 3, 9, 10, 3, E.paper);
    R(g, 4, 4, 2, 1, '#5a5a5a'); R(g, 10, 4, 2, 1, '#5a5a5a'); });
  // 5 사물함 — 마지막 장면의 주인공
  def('5', g => { R(g, 1, 0, 14, 16, '#7a8a94'); R(g, 1, 0, 14, 1, '#9aa8b0');
    R(g, 2, 1, 12, 6, '#6a7a84'); R(g, 2, 8, 12, 7, '#6a7a84');
    R(g, 11, 4, 2, 1, '#c9b06a'); R(g, 11, 11, 2, 1, '#c9b06a');
    R(g, 3, 2, 6, 1, E.paper); });
  // 6 태극기 — 파출소 벽에 늘 있던 것
  def('6', g => { R(g, 0, 0, T, T, E.wall); R(g, 1, 3, 14, 9, '#ffffff'); R(g, 1, 3, 14, 1, '#c9c2b2');
    R(g, 6, 6, 4, 3, '#c94b4b'); R(g, 6, 8, 4, 2, '#3f5a8a');
    R(g, 2, 4, 2, 1, '#2a2a30'); R(g, 12, 4, 2, 1, '#2a2a30');
    R(g, 2, 10, 2, 1, '#2a2a30'); R(g, 12, 10, 2, 1, '#2a2a30'); });
  // 파출소 벽·바닥도 시대색을 탄다
  def('|', g => { R(g, 0, 0, T, T, E.wall); R(g, 0, 10, T, 6, E.tech === 'radio' ? '#c4b393' : '#d8dade');
    R(g, 0, 0, T, 1, '#f4efe2'); R(g, 0, 10, T, 1, E.grout); });
  def('F', g => { R(g, 0, 0, T, T, E.floor); R(g, 0, 0, 8, 8, E.floor2); R(g, 8, 8, 8, 8, E.floor2);
    R(g, 0, 0, T, 1, E.grout); R(g, 0, 0, 1, T, E.grout); });
}
setEra(1990);
'''
rep("// ----- 맵 -----", ERA_JS + "\n// ----- 맵 -----")

# ================= 5) 맵 =================
MAPS_NEW = '''const MAPS = {
  // ===== 1988 고향 역 ===== 아래가 대합실, 위가 플랫폼과 선로
  station: { name: '고향 간이역', base: 'p', rows: [
    'rrrrrrrrrrrrrrrrrrrr',
    'kccccccccccccccccccc',
    'pppppppppppppppppppp',
    'pppppppppppppppppppp',
    'WWWWWWWWWDDWWWWWWWWW',
    'FFFFFFFFFFFFFFFFFFFF',
    'FbbFFbbFFFFFFbbFFbbF',
    'FFFFFFFFFFFFFFFFFFFF',
    'FFFFFFFFsFFFFFFFFFFF',
    'FFFFFFFFFFFFFFFFFFFF',
    'WWWWWWWWWDDWWWWWWWWW',
    '____________________',
    '__T______L______T___',
    '____________________'
  ], exits: [], signs: { '8,8': '서울행 완행열차\\n06:40 · 12:20 · 18:05' },
  labels: [ { x: 10, y: 1, t: '서울행 완행' }, { x: 10, y: 8, t: '대합실' } ] },

  // ===== 1988 열차 안 ===== 창밖으로 논이 흘러간다
  train: { name: '서울행 완행열차', base: 'f', rows: [
    'gggggggggggggggggggg',
    'SSffSSffSSffSSffSSff',
    'ffffffffffffffffffff',
    'ffffffffffffffffffff',
    'SSffSSffSSffSSffSSff',
    'gggggggggggggggggggg'
  ], exits: [], signs: {},
  labels: [ { x: 10, y: 0, t: '창밖 · 논과 산' } ] },

  // ===== 파출소 ===== 1990·2001·2008·2026 이 같은 이 방을 쓴다
  station2: { name: '삼거리 파출소', base: 'F', rows: [
    '||||||||||||||||||',
    '|6F44FF33FFFF33F6|',
    '|FFFFFFFFFFFFFFFF|',
    '|11111111FFFFFFFF|',
    '|FFFFFFFFFFFFFFFF|',
    '|F22FF22FFFF22FFF|',
    '|FFFFFFFFFFFFFFFF|',
    '|FFFFFFFFFFFFFCCF|',
    '|5555FFFFFFFFFvFF|',
    '|FFFFFFFFFFFFFFFF|',
    '||||||||D|||||||||',
    '__________________',
    '__T_____L______T__',
    '__________________',
    '==================',
    '=================='
  ], exits: [], signs: {
    '1,1': '태극기. 파출소에 늘 걸려 있던 것.'
  },   // 사물함(1,8)에는 간판을 두지 않는다 — 간판이 퀘스트 상호작용보다 먼저 처리된다
  labels: [ { x: 4, y: 3, t: '민원 창구' }, { x: 12, y: 5, t: '근무석' }, { x: 2, y: 8, t: '사물함' }, { x: 9, y: 11, t: '삼거리' } ] },

  // ===== 골목 ===== 야간 순찰 구역
  // 가운데를 막지 않는다 — 이 엔진의 원칙: 길을 헤맬 수 없어야 한다
  alley: { name: '파출소 뒷골목', base: '_', rows: [
    'ZZZZZZZZZZZZZZZZZZZZ',
    '____________________',
    '__Y_______q______Y__',
    '____________________',
    '______L______L______',
    '____________________',
    '__q______________q__',
    '____________________',
    '____________________',
    '______L______L______',
    '____________________',
    'ZZZZZZZZZZZZZZZZZZZZ'
  ], exits: [], signs: {},
  labels: [ { x: 10, y: 2, t: '평상' }, { x: 10, y: 10, t: '파출소 쪽' } ] },

  // ===== 1995 병원 ===== 분만실 앞 복도
  hospital: { name: '시립병원 복도', base: 'F', rows: [
    'WWWWWWWWWWWWWWWWWWWW',
    'WFFFFFFFFhhFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFW',
    'WbbFFFFFFFFFFFFFbbFW',
    'WFFFFFFFFFFFFFFFFFFW',
    'WFFFFxxxxFFFFFFFFFFW',
    'WFFFFFFFFFFFFFFFFFFW',
    'WbbFFFFFFFFFFFFFbbFW',
    'WFFFFFFFFFFFFFFFFFFW',
    'WWWWWWWWWDWWWWWWWWWW',
    '____________________',
    '____________________'
  ], exits: [], signs: { '9,1': '분만실.\\n불이 켜져 있다.' },
  labels: [ { x: 9, y: 1, t: '분만실' }, { x: 6, y: 6, t: '접수' } ] },

  // ===== 시장 ===== 2001 잃어버린 아이를 찾는 곳
  market: { name: '삼거리 시장', base: '_', rows: [
    'ZZZZZZZZZZZZZZZZZZZZZZ',
    '______________________',
    '_ssss____ssss____ssss_',
    '______________________',
    '______________________',
    '__q_______q_______q___',
    '______________________',
    '_ssss____ssss____ssss_',
    '______________________',
    '______________________',
    '__Y______L_______Y____',
    '______________________',
    'ZZZZZZZZZZZZZZZZZZZZZZ'
  ], exits: [], signs: {},
  labels: [ { x: 11, y: 2, t: '시장 골목' } ] },

  // ===== 집 ===== 1995·2015 두 번 쓴다
  home: { name: '우리 집', base: 'f', rows: [
    '||||||||||||',
    '|offfffzzff|',
    '|ffffffffff|',
    '|ffffeeffff|',
    '|ffffeeffff|',
    '|Vfffffffff|',
    '|ffffffffff|',
    '|||||D||||||',
    '____________',
    '____________'
  ], exits: [], signs: { '1,5': '브라운관 TV. 9시 뉴스가 나오고 있다.' },
  labels: [ { x: 5, y: 0, t: '우리 집' } ] }
};
'''
swap("const MAPS = {", "// 맵 크기·바닥 캐시", MAPS_NEW)

# ================= 6) 사람 배치 =================
NPCS_NEW = '''const NPCS = {
  station: [ { id: 'granny', spr: 'granny', x: 5, y: 6, dir: 'right', name: '보따리 할머니' } ],
  train: [],
  station2: [
    { id: 'chief', spr: 'chief', x: 14, y: 5, dir: 'down', name: '소장님' },
    { id: 'senior', spr: 'senior', x: 3, y: 5, dir: 'down', name: '박 선배' },
    { id: 'rookie', spr: 'rookie', x: 6, y: 5, dir: 'down', name: '후배 순경' },
    { id: 'female', spr: 'female', x: 12, y: 6, dir: 'up', name: '이 경장' }
  ],
  alley: [ { id: 'ajussi', spr: 'ajussi', x: 10, y: 3, dir: 'down', name: '가게 아저씨' } ],
  hospital: [ { id: 'nurse', spr: 'nurse', x: 6, y: 5, dir: 'down', name: '간호사' } ],
  market: [
    { id: 'ajussi', spr: 'ajussi', x: 4, y: 4, dir: 'down', name: '생선가게 아저씨' },
    { id: 'granny', spr: 'granny', x: 15, y: 8, dir: 'left', name: '떡집 할머니' }
  ],
  home: []
};
'''
swap("const NPCS = {", "// 가족 배치는 각 장면 대본", NPCS_NEW)

# ================= 7) 타일 설명 =================
LOOK_NEW = '''const GENERIC_LOOK = {
  '1': '민원 창구. 하루에도 몇 번씩 사람이 앉았다 간다.',
  '2': '근무석. 무전이 조용하면 오히려 불안하다.',
  '3': '서류 캐비닛. 사건 하나가 종이 한 장이 된다.',
  '4': '게시판. 수배 전단과 표창장이 나란히 붙어 있다.',
  '5': '사물함. 아버지 자리는 맨 왼쪽이다.',
  '6': '태극기. 파출소에 늘 걸려 있던 것.',
  S: '완행열차 좌석. 등받이가 딱딱하다.', g: '차창. 논과 산이 흘러간다.',
  k: '기관차.', c: '객차.', r: '선로.', p: '플랫폼.',
  h: '분만실 문. 불이 켜져 있다.', b: '대기 의자.', x: '접수대.',
  e: '밥상. 늘 아버지 자리만 비어 있었다.', o: '이불.', z: '싱크대.',
  V: '브라운관 TV. 9시 뉴스가 나오고 있다.',
  Z: '셔터 내린 가게.', Y: '전봇대.', q: '평상. 여름밤이면 동네 사람이 다 모였다.',
  d: '책상.', C: '의자.', i: '화분.', v: '자판기.', w: '창문.', D: '문.',
  T: '나무.', t: '덤불.', L: '가로등.', ',': '풀꽃.', '_': '보도.', s: '간판.'
};
'''
swap("const GENERIC_LOOK = {", "function pressA()", LOOK_NEW)

# ================= 8) 대사 테이블 =================
LINES_NEW = '''const NPC_LINES = {
  chief: ['김 순경, 오늘도 무사히.', '자네 같은 사람이 오래 있어 줘야지.'],
  senior: ['야간은 처음이 제일 길어. 둘째 날부터는 괜찮아진다.', '무전 잘 듣고 있어라.'],
  rookie: ['선배님, 커피 타 왔습니다!', '저도 선배님처럼 되고 싶습니다.'],
  female: ['오늘 순찰 구역 바뀐 거 아시죠?', '김 경위님은 늘 제일 늦게 퇴근하시더라.'],
  granny: ['총각, 서울 가나? 조심히 가.', '우리 동네는 저 양반 때문에 발 뻗고 자.'],
  ajussi: ['어이, 김 순경! 오늘도 수고 많아.', '이 골목은 자네가 지켜 주니 마음이 놓여.'],
  nurse: ['아버님, 조금만 더 기다리세요.', '산모분 잘하고 계세요.']
};
const FRIEND_LINES = {
  ap: ['오늘도 별일 없어야 할 텐데.', '(무전기를 한 번 더 확인한다)'],
  om: ['오늘 야간이에요? 국 데워 놓을게요.', '늦으면 전화 한 통만 해요.'],
  dj: ['아빠, 오늘도 늦어?', '(아빠 정복을 슬쩍 본다)'],
  ms: ['아빠 나 이거 입어봐도 돼?', '아빠 멋있다!']
};
'''
swap("const NPC_LINES = {", "function markEnts", LINES_NEW)

# ================= 9) 일곱 장면 =================
QUESTS_NEW = r'''// ===== 장면 대본 =====
// 이 게임의 장면은 장소가 아니라 해(年)다. 장면이 바뀔 때마다 setEra 로 시대가 바뀐다.
const QUESTS = {};

// --- 1. 1988 · 서울행 완행열차 (스물둘) ---
QUESTS.c1 = {
  start: { map: 'station', x: 9, y: 8, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '어머니가 싸 준 보따리 챙기기 (노란 !)' : '플랫폼으로 올라가 열차 타기 (위로)'; },
  hint() { return '대합실 왼쪽 할머니에게 먼저 말을 걸어 보세요. 그다음 위로 쭉 올라가면 플랫폼입니다.'; },
  familyPos: fam('station', [['om', 8, 8, 'right']]),
  async onEnter() { S.heroSpr = 'apYoung'; setEra(1990); },
  async intro() {
    await say('', '1988년 봄. 경상도의 어느 간이역.');
    await say('', '스물두 살 김성호는 서울행 완행열차를 기다리고 있다.');
    await say('박순임', '…');
    await say('김성호', '(어머니는 아까부터 아무 말이 없으시다.)');
    await say('박순임', '성호야. 서울 가면… 밥은 꼭 챙겨 먹어라.');
    await say('김성호', '예, 어머니.');
    await say('박순임', '순경 시험, 떨어져도 괜찮다. 그냥 몸만 성하면 된다.');
    await say('김성호', '(그 말이 제일 무거웠다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(S.q.stage < 2 ? ['om'] : []); },
  familyTalk: {
    om: async e => {
      const q = S.q;
      if (q.stage >= 2) { await say(e.name, '어여 가라. 뒤돌아보지 말고.'); return; }
      await say('박순임', '이거. 삶은 계란하고 김밥이다.');
      await say('김성호', '어머니, 이거 다 못 먹습니다.');
      await say('박순임', '남으면 옆 사람 줘라. 서울 사람들도 배는 고프다.');
      const i = await ask('김성호', '(무슨 말을 해야 할까)', [
        '어머니, 꼭 붙어서 돌아오겠습니다',
        '…다녀오겠습니다',
        '(말없이 보따리를 받는다)']);
      if (i === 0) await say('박순임', '붙든 안 붙든, 니가 내 아들이다.');
      else if (i === 1) await say('박순임', '그래. 다녀와라.');
      else await say('박순임', '(어머니가 등을 두 번 두드리셨다.)');
      got('보따리를 받았다');
      q.stage = 2; setHud(); save(); QUESTS.c1.marks();
      await say('', '기차 시간이 다 됐다. 플랫폼으로 올라가자.');
    }
  },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId !== 'station' || q.stage !== 2 || y > 2) return;
    S.lock = true;
    await say('', '플랫폼. 완행열차가 들어온다.');
    await say('', '(어머니는 대합실에 그대로 서 계셨다. 손을 흔들지도 않으셨다.)');
    q.stage = 3; save();
    await goMap('train', 9, 2, 'up', true);
    await say('', '열차가 움직인다. 창밖으로 논이 흘러간다.');
    await say('김성호', '(서울까지 여섯 시간. 아직 아무것도 정해진 게 없다.)');
    await say('', '완행열차는 역마다 선다. 정차역에서 잘 멈추게 도와주자.');
    const good = await playTrain(3);
    if (good >= 2) await say('김성호', '(' + good + '번 다 잘 섰다. 이제 서울이다.)');
    else await say('김성호', '(덜컹거렸지만, 어쨌든 서울이다.)');
    await say('', '해가 질 무렵, 열차가 서울역에 닿았다.');
    await say('김성호', '(사람이… 정말 많다.)');
    await say('', '그날 김성호는 서울에 내렸다. 주머니에 삶은 계란 두 개가 남아 있었다.');
    await showPhoto('boarding', '1988 · 서울행 완행열차', 2000);
    S.lock = false;
    await finishQuest();
  },
  npcTalk: {
    granny: async e => { await say(e.name, '총각, 서울 가나? 조심히 가.'); }
  }
};

// --- 2. 1990 · 첫 야간 근무 (순경) ---
QUESTS.c2 = {
  start: { map: 'station2', x: 9, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '박 선배에게 신고하기 (노란 !)' : q.stage === 1 ? '뒷골목으로 순찰 나가기 (아래 문을 지나가면 됩니다)' : '평상 쪽 소리를 확인하기'; },
  hint(q) { return q.stage < 1 ? '근무석의 박 선배에게 말을 거세요.' : '아래쪽 문 칸을 밟고 지나가면 바로 뒷골목입니다. 누를 필요 없어요.'; },
  async onEnter(mapId) { S.heroSpr = 'apRookie'; setEra(1990); },
  async intro() {
    await say('', '1990년 겨울. 삼거리 파출소.');
    await say('', '두 해 전 서울에 내린 청년은 순경 정복을 입고 있다.');
    await say('김성호', '(오늘이 첫 야간 근무다.)');
    await say('', '벽에는 태극기, 책상에는 무전기. 형광등이 지직거린다.');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { const q = S.q; markEnts(q.stage < 1 ? ['senior'] : []); },
  npcTalk: {
    senior: async e => {
      const q = S.q;
      if (q.stage >= 1) { await say(e.name, '무전 잘 듣고 있어라. 뭐 있으면 바로 부르고.'); return; }
      await say('김성호', '순경 김성호, 야간 근무 신고합니다!');
      await say('박 선배', '어어, 목소리 크다. 밤엔 좀 줄여.');
      await say('박 선배', '첫 야간이지? 하나만 알려 줄게.');
      await say('박 선배', '이 동네 사람들은 자네 얼굴을 기억할 거야. 십 년, 이십 년.');
      await say('김성호', '…예?');
      await say('박 선배', '그러니까 잘 웃고 다녀. 그게 절반이다.');
      await say('', '순찰을 나가자. 아래쪽 문을 지나가면 뒷골목이다.');
      q.stage = 1; setHud(); save(); QUESTS.c2.marks();
    },
    chief: async e => { await say(e.name, '김 순경, 오늘도 무사히.'); },
    ajussi: async e => { await say(e.name, '어이, 김 순경! 오늘도 수고 많아.'); }
  },
  async onStep(mapId, x, y) {
    const q = S.q;
    // 문은 누르는 게 아니라 밟으면 나간다
    if (mapId === 'station2' && q.stage === 1 && y === 10) {
      S.lock = true;
      await goMap('alley', 9, 8, 'up', true);
      q.stage = 2; setHud(); save();
      await say('', '뒷골목. 가로등 두 개가 전부다.');
      await say('김성호', '(무전기 잡음 말고는 아무 소리도 안 난다.)');
      await say('', '평상 쪽에서 부스럭 소리가 났다. 가 보자.');
      QUESTS.c2.marks();
      S.lock = false;
      return;
    }
    if (mapId !== 'alley' || q.stage !== 2 || y !== 3 || x < 8 || x > 12) return;
    S.lock = true;
    await say('', '평상 위에 사람이 누워 있다. 술 냄새가 난다.');
    await say('김성호', '(어떻게 하지?)');
    const i = await ask('김성호', '', [
      '아저씨, 여기서 주무시면 얼어요. 댁이 어디세요?',
      '일어나세요. 여기 이러시면 안 됩니다.',
      '(무전으로 보고부터 한다)']);
    if (i === 0) {
      await say('가게 아저씨', '어… 우리 집? 저기… 저 골목…');
      await say('김성호', '제가 모셔다 드릴게요. 일어나 보세요.');
      await say('', '김 순경은 아저씨를 부축해 골목 끝까지 걸었다.');
    } else if (i === 1) {
      await say('가게 아저씨', '내가 뭘! 여기 내 가게 앞이야!');
      await say('김성호', '아, 사장님이셨습니까. 그래도 추우신데…');
      await say('', '실랑이 끝에 결국 부축해서 안으로 모셨다.');
    } else {
      await say('', '무전이 지직거렸다. 박 선배 목소리가 들렸다.');
      await say('박 선배', '아이고, 그 양반 또. 자네가 좀 데려다줘라.');
      await say('', '김 순경은 아저씨를 부축해 골목 끝까지 걸었다.');
    }
    await say('가게 아저씨', '…고맙네. 자네 이름이 뭐라고?');
    await say('김성호', '김성호입니다.');
    await say('가게 아저씨', '김성호. …김 순경. 내가 기억해 두지.');
    await say('', '그 아저씨는 그 뒤로 이십 년 동안 아버지 이름을 불렀다.');
    await showPhoto('badge', '1990 · 순경 김성호', 2000);
    S.lock = false;
    await finishQuest();
  }
};

// --- 3. 1995 · 아이가 태어난 밤 (경장) ---
QUESTS.c3 = {
  start: { map: 'station2', x: 9, y: 6, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '근무 중… 무전을 기다리기' : '병원으로 가는 길 정하기'; },
  hint() { return '근무석(무전 책상) 앞에 서서 A를 누르세요.'; },
  async onEnter() { S.heroSpr = 'apRookie'; setEra(1995); },
  async intro() {
    await say('', '1995년 여름. 김성호는 경장이 되었고, 아내가 만삭이다.');
    await say('김성호', '(오늘도 야간이다. 예정일이 다음 주니까 괜찮겠지.)');
    await say('', '…라고 생각한 지 두 시간 만에, 전화가 울렸다.');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  interact(mapId, x, y, ch) {
    if (mapId !== 'station2' || ch !== '2' || S.q.stage !== 0) return null;
    return async () => {
      S.lock = true;
      await say('', '(따르릉—)');
      await say('박순임', '여보! 나… 나 지금 병원 가야 될 것 같아요!');
      await say('김성호', '뭐?! 지금? 예정일 다음 주라며!');
      await say('박순임', '애가 그걸 어떻게 알아요!');
      await say('박 선배', '뭐 해! 가! 여기는 내가 본다!');
      await say('김성호', '선배님, 죄송합니다!');
      S.q.stage = 1; setHud(); save();
      await playPick('병원까지 어떻게 갈까?', [
        { icon: '🚓  순찰차 — 근무 중인데…' },
        { icon: '🚕  택시 — 이 시간에 잡힐까' },
        { icon: '🏃  뛴다 — 십오 분 거리', ok: true }
      ], '무엇을 골라도 아버지는 도착합니다');
      await say('', '김 경장은 정복 차림으로 밤길을 뛰었다. 모자를 손에 든 채로.');
      await goMap('hospital', 9, 9, 'up', true);
      await say('', '시립병원 복도. 분만실 불이 켜져 있다.');
      QUESTS.c3.marks2();
      S.lock = false;
    };
  },
  marks2() { S.q.stage = 2; setHud(); markEnts(['nurse']); },
  npcTalk: {
    nurse: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '아버님, 축하드려요.'); return; }
      await say('간호사', '아버님이세요? 조금만 더 기다리세요.');
      await say('김성호', '(복도 의자에 앉았다가 일어나기를 스무 번쯤 했다.)');
      await say('', '새벽 세 시 사십 분.');
      await say('간호사', '아버님! 딸입니다!');
      await say('김성호', '…딸.');
      await say('', '(김 경장은 그 자리에 한참 서 있었다.)');
      const i = await ask('김성호', '(아이 이름을 뭐라고 하지?)', [
        '다정이. 다정하게 크라고.',
        '아내가 짓기로 했지.',
        '(아직 아무 생각이 안 난다)']);
      if (i === 0) await say('', '그렇게 김다정이라는 이름이 생겼다.');
      else if (i === 1) { await say('박순임', '다정이. 다정이로 해요.'); await say('', '그렇게 김다정이라는 이름이 생겼다.'); }
      else { await say('', '이름은 사흘 뒤에 정해졌다. 김다정.'); }
      await say('', '그날 아버지는 근무 중에 자리를 비운 것으로 시말서를 썼다.');
      await say('', '그리고 그 시말서를 이십 년 동안 지갑에 넣고 다녔다.');
      await showPhoto('note', '1995 · 시말서 한 장', 2000);
      await finishQuest();
    }
  }
};

// --- 4. 2001 · 잃어버린 아이 (경사) ---
QUESTS.c4 = {
  start: { map: 'station2', x: 9, y: 6, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '민원 창구의 신고 받기' : '시장에서 아이 찾기'; },
  hint() { return '민원 창구 앞에 서서 A를 누르세요.'; },
  async onEnter() { S.heroSpr = 'apRookie'; setEra(2001); },
  async intro() {
    await say('', '2001년 가을. 파출소에 브라운관 컴퓨터가 들어왔다.');
    await say('김성호', '(이 네모난 게 무전기보다 낫다는데, 아직은 잘 모르겠다.)');
    await say('', '그때 창구 쪽에서 여자 목소리가 울렸다.');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  interact(mapId, x, y, ch) {
    if (mapId !== 'station2' || ch !== '1' || S.q.stage !== 0) return null;
    return async () => {
      S.lock = true;
      await say('떡집 할머니', '경찰관 양반! 우리 손주가 없어졌어요!');
      await say('김성호', '진정하시고요. 몇 살이고, 어디서 놓치셨습니까?');
      await say('떡집 할머니', '여섯 살! 시장에서… 내가 잠깐 나물 값 치르는 사이에…');
      await say('김성호', '옷은요? 무슨 색 옷을 입었습니까?');
      await say('떡집 할머니', '노란… 노란 옷이요! 노란 티셔츠!');
      await say('김성호', '알겠습니다. 제가 찾겠습니다.');
      await say('', '해가 지고 있었다. 시장은 사람으로 가득했다.');
      S.q.stage = 1; setHud(); save();
      await goMap('market', 11, 9, 'up', true);
      await say('', '사람들 사이를 헤치며 노란 옷을 찾자.');
      S.lock = false;
    };
  },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId !== 'market' || q.stage !== 1 || y > 4) return;
    S.lock = true;
    q.stage = 2; save();
    await say('김성호', '(사람이 너무 많다. 그래도 찾아야 한다.)');
    const n = await playCrowd(3);
    await say('', '한 시간 반. 시장 골목을 세 바퀴 돌았다.');
    await say('', '그리고 생선가게 뒤 상자 더미 사이에서—');
    await say('', '노란 티셔츠가 보였다.');
    await say('김성호', '…찾았다.');
    await say('아이', '(울다가 잠들어 있었다)');
    await say('김성호', '(모자를 벗어 아이 얼굴의 땀을 닦아 주었다.)');
    await say('김성호', '얘야. 할머니한테 가자.');
    await say('떡집 할머니', '아이고! 아이고 경찰관 양반!');
    await say('', '할머니는 김 경사의 손을 붙잡고 놓지 않으셨다.');
    await say('김성호', '괜찮습니다. 제 일입니다.');
    await say('', '그해 김성호는 표창을 받았다. 상장은 파출소 게시판에 붙었다.');
    await say('', '아버지는 그 상장을 집에 가져오지 않았다. 자랑한 적도 없었다.');
    await showPhoto('award', '2001 · 게시판에 붙은 상장', 2000);
    S.lock = false;
    await finishQuest();
  },
  npcTalk: {
    ajussi: async e => { await say(e.name, '노란 옷? 아까 저쪽으로 뛰어가는 애를 본 것도 같은데…'); },
    granny: async e => { await say(e.name, '우리 손주 좀 찾아 주세요…'); }
  }
};

// --- 5. 2008 · 이름을 지운 밤 (경위) ---
QUESTS.c5 = {
  start: { map: 'station2', x: 9, y: 7, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '근무석에서 서류 마무리하기'; },
  hint() { return '근무석(모니터) 앞에 서서 A를 누르세요.'; },
  async onEnter() { S.heroSpr = 'apSenior'; setEra(2008); },
  async intro() {
    await say('', '2008년 겨울. 김성호는 경위가 되었다.');
    await say('', '파출소에 아무도 없다. 새벽 두 시.');
    await say('김성호', '(후배 하나가 큰 실수를 했다. 서류를 쓰고 있다.)');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  interact(mapId, x, y, ch) {
    if (mapId !== 'station2' || ch !== '2' || S.q.stage !== 0) return null;
    return async () => {
      S.lock = true;
      await say('', '보고서 마지막 줄. 책임자 이름을 적는 칸이 비어 있다.');
      await say('김성호', '(여기 이름을 적는 사람이 책임을 진다.)');
      await say('', '문이 열렸다. 후배 순경이 서 있었다.');
      await say('후배 순경', '경위님… 제가 쓰겠습니다. 제 잘못입니다.');
      await say('김성호', '자네 몇 년 차야.');
      await say('후배 순경', '…이 년 찼습니다.');
      const i = await ask('김성호', '(어떻게 할까)', [
        '(내 이름을 적는다)',
        '자네 이름을 적어라. 배워야지.',
        '둘 다 적자. 같이 책임지면 된다.']);
      if (i === 0) {
        await say('김성호', '가서 자. 내일 아침에 다시 얘기하자.');
        await say('후배 순경', '경위님…');
        await say('김성호', '이 년 차가 지고 갈 무게가 아니다.');
      } else if (i === 1) {
        await say('후배 순경', '…예. 감사합니다.');
        await say('', '후배가 나간 뒤, 김 경위는 그 이름을 지우고 자기 이름을 적었다.');
      } else {
        await say('후배 순경', '경위님, 그러면 경위님까지…');
        await say('김성호', '알아. 그래도 혼자 두는 것보다는 낫다.');
        await say('', '결국 아침에 김 경위는 자기 이름만 남기고 후배 이름을 지웠다.');
      }
      await say('', '그해 김성호의 승진은 삼 년 미뤄졌다.');
      await say('', '집에서는 아무도 그 이유를 몰랐다.');
      await say('박순임', '(그때 당신 왜 그렇게 술을 드셨어요?)');
      await say('김성호', '(…그냥. 추워서.)');
      await showPhoto('report', '2008 · 이름을 지운 보고서', 2000);
      S.lock = false;
      await finishQuest();
    };
  },
  npcTalk: {
    rookie: async e => { await say(e.name, '경위님, 아직 안 가셨습니까…'); }
  }
};

// --- 6. 2015 · 정복이 부끄러웠던 날 (경감) ---
QUESTS.c6 = {
  start: { map: 'home', x: 5, y: 6, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '밥상에 앉은 다정이와 이야기하기'; },
  hint() { return '밥상 근처의 다정이에게 말을 거세요.'; },
  async onEnter() { S.heroSpr = 'apSenior'; setEra(2015); },
  familyPos: fam('home', [['dj', 4, 5, 'right'], ['om', 8, 3, 'left']]),
  async intro() {
    await say('', '2015년 봄. 김성호는 경감이 되었고, 딸은 스무 살이 되었다.');
    await say('', '집. 9시 뉴스가 켜져 있다.');
    await say('김성호', '(오늘 학교에 갔다 왔다. 딸이 상을 받는 날이었다.)');
    await say('김성호', '(…정복을 입고 갔다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['dj']); },
  familyTalk: {
    dj: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '아빠. …아까는 미안해.'); return; }
      await say('김다정', '아빠.');
      await say('김성호', '어. 왜.');
      await say('김다정', '…오늘 왜 그러고 왔어.');
      await say('김성호', '…정복?');
      await say('김다정', '애들이 다 쳐다봤단 말이야.');
      await say('', '(아버지는 아무 말도 하지 않으셨다.)');
      const i = await ask('김성호', '', [
        '…미안하다. 근무 끝나고 바로 오느라고.',
        '아빠는 이 옷이 제일 좋은 옷인데.',
        '(그냥 웃는다)']);
      if (i === 0) await say('김다정', '…아니야. 됐어.');
      else if (i === 1) { await say('김다정', '…'); await say('김성호', '(딸이 고개를 숙였다.)'); }
      else await say('김다정', '왜 웃어. 진짜.');
      await say('', '그날 밤, 다정이는 방에서 인터넷을 뒤졌다.');
      await say('', '「경감」이 어떤 계급인지, 되기까지 몇 년이 걸리는지.');
      await say('김다정', '(…스물다섯 해.)');
      await say('', '그리고 아버지가 받은 표창이 몇 개인지도 찾아봤다.');
      await say('김다정', '(열한 개.)');
      await say('', '다정이는 그날 아버지에게 아무 말도 하지 못했다.');
      await say('', '대신 십 년 뒤에, 이 게임을 만들었다.');
      await showPhoto('uniform', '2015 · 그날의 정복', 2000);
      await finishQuest();
    },
    om: async e => { await say(e.name, '아빠 오늘 아침부터 옷 다리시더라. 세 번이나.'); }
  }
};

// --- 7. 2026 · 마지막 근무 (딸의 시점) ---
QUESTS.c7 = {
  start: { map: 'station2', x: 9, y: 9, dir: 'up' },
  init(q) { q.stage = 0; q.found = {}; },
  goal(q) { return '아버지 사물함 정리하기 (' + Object.keys(S.q.found || {}).length + '/3)'; },
  hint() { return '왼쪽 아래 사물함 앞에 서서 A를 세 번 누르세요.'; },
  async onEnter() { S.heroSpr = null; setEra(2026); },
  async intro() {
    await say('', '2026년 2월. 삼거리 파출소.');
    await say('', '(이번 장면은 딸 김다정의 시점입니다.)');
    await say('김다정', '(아버지 정년 퇴임식이 끝났다.)');
    await say('김다정', '(사물함 정리를 도우러 왔다.)');
    await say('', '서른여덟 해 동안 아버지가 드나든 문을, 딸이 처음으로 들어왔다.');
    await say('김다정', '(생각보다… 작다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  interact(mapId, x, y, ch) {
    if (mapId !== 'station2' || ch !== '5' || S.q.finished) return null;
    return async () => {
      const q = S.q;
      const f = q.found;
      S.lock = true;
      if (!f.a) {
        f.a = true;
        await say('', '사물함 맨 위 칸. 낡은 종이가 한 장 접혀 있다.');
        await say('김다정', '(…시말서?)');
        await say('김다정', '「1995년 8월 3일, 근무 중 무단 이탈」');
        await say('김다정', '(내 생일이다.)');
        got('시말서를 찾았다 (1/3)');
      } else if (!f.b) {
        f.b = true;
        await say('', '가운데 칸. 표창장 열한 장이 고무줄로 묶여 있다.');
        await say('김다정', '(집에는 한 장도 없었는데.)');
        await say('김다정', '(왜 한 번도 안 보여 주셨을까.)');
        got('표창장 열한 장 (2/3)');
      } else if (!f.c) {
        f.c = true;
        await say('', '맨 아래 칸. 작은 사진 한 장이 문 안쪽에 붙어 있다.');
        await say('김다정', '(…우리 가족 사진이다.)');
        await say('김다정', '(내가 초등학교 때. 삼십 년 가까이 여기 붙어 있었던 거야?)');
        await say('', '사진 뒤에는 볼펜으로 이렇게 적혀 있었다.');
        await say('', '「오늘도 무사히. 집에 가자.」');
        got('가족 사진 (3/3)');
      }
      setHud(); save();
      if (f.a && f.b && f.c) {
        await say('', '문이 열렸다.');
        await say('김성호', '다 챙겼냐.');
        await say('김다정', '아빠.');
        await say('김다정', '…이거 왜 한 번도 말 안 했어.');
        await say('김성호', '뭘.');
        await say('김다정', '전부 다.');
        await say('', '아버지는 사물함을 한 번 닫고, 한 번 더 열어 보셨다.');
        await say('김성호', '별거 아니라서.');
        await say('김다정', '(아빠. 그거 별거야.)');
        const i = await ask('김다정', '(무슨 말을 해야 할까)', [
          '아빠, 고생 많았어.',
          '아빠 딸이라서 좋았어.',
          '(아무 말 없이 아버지 손을 잡는다)']);
        if (i === 0) await say('김성호', '…그래. 고맙다.');
        else if (i === 1) { await say('김성호', '…'); await say('', '아버지는 창밖을 오래 보셨다.'); }
        else await say('', '아버지 손은 생각보다 거칠고, 생각보다 따뜻했다.');
        await say('김성호', '가자. 밥 먹으러.');
        await say('', '두 사람은 아버지가 서른여덟 해 동안 지킨 삼거리를 나란히 걸었다.');
        await showPhoto('locker', '2026 · 마지막 근무', 2200);
        S.lock = false;
        await finishQuest();
        return;
      }
      await say('', '(사물함에 아직 더 있다.)');
      S.lock = false;
    };
  },
  npcTalk: {
    chief: async e => { await say(e.name, '따님이시죠? 김 경감님, 우리 파출소의 기둥이셨습니다.'); },
    rookie: async e => { await say(e.name, '경감님한테 배운 게 제일 많습니다.'); },
    female: async e => { await say(e.name, '오늘 다들 눈이 빨개요.'); }
  }
};

// ===== 엔딩 =====
async function playEnding() {
  quest = { familyPos: fam('station2', [['ap', 8, 9, 'right'], ['om', 11, 9, 'left'], ['ms', 12, 8, 'down']]), hideNpc: () => false, goal: () => '' };
  S.ch = 'c7'; S.hero = 'dj'; S.q = { finished: true }; S.heroSpr = null;
  setEra(2026);
  showScreen('game'); fit(); setHud(); $('hudGoal').textContent = '';
  S.tint = 'rgba(255, 170, 90, 0.16)'; S.focus = { x: 9, y: 9 };
  await goMap('station2', 9, 9, 'up', true);
  S.busy = true;
  await say('', '파출소 앞. 동료들이 줄지어 서 있다.');
  await say('소장님', '경례!');
  await say('', '(서른여덟 해 만의 마지막 경례였다.)');
  await say('김성호', '…충성.');
  await say('김민수', '아빠, 이제 뭐 할 거야?');
  await say('김성호', '글쎄. 늦잠부터 자 봐야지.');
  await say('박순임', '이제 밤에 전화 안 기다려도 되겠네.');
  await say('김성호', '…그러네.');
  await say('김다정', '(어머니가 그 말을 하는 데 삼십팔 년이 걸렸다.)');
  await say('', '아버지는 파출소를 한 번 돌아보고, 모자를 벗었다.');
  await showPhoto('salute', '2026 · 마지막 경례', 2400);
  await fade(true);
  const c = $('credits'); c.innerHTML = '';
  const add = (t, cls) => { const p = document.createElement('p'); p.textContent = t; if (cls) p.className = cls; p.style.margin = '0 0 10px'; c.appendChild(p); };
  add(ERA);
  add('김성호 · 박순임 · 김다정 · 김민수', 'names');
  FINAL_MESSAGE.split('\n').forEach(l => add(l));
  add('BGM: 평화로운 피아노 브금 · A hisa – Dreamin’');
  add('— ' + MAKER + ' —');
  add('★ 이 게임은 주문 제작 데모입니다.');
  add('이름·직업·장소·실제 있었던 일로 이렇게 만들어 드립니다.');
  add('김성호 씨와 가족은 가상의 인물입니다.');
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

# ================= 10) 보상함 = 아버지 사물함 =================
REW_NEW = '''const REWARDS = [
  { id: 'boarding', ch: 'c1', name: '서울행 승차권', kind: 'photo', icon: '🎫' },
  { id: 'badge', ch: 'c2', name: '첫 순경 흉장', kind: 'photo', icon: '🚨' },
  { id: 'note', ch: 'c3', name: '1995년 시말서', kind: 'photo', icon: '📄' },
  { id: 'award', ch: 'c4', name: '표창장', kind: 'photo', icon: '🏅' },
  { id: 'report', ch: 'c5', name: '이름을 지운 보고서', kind: 'photo', icon: '🖊' },
  { id: 'uniform', ch: 'c6', name: '다려 둔 정복', kind: 'photo', icon: '👮' },
  { id: 'locker', ch: 'c7', name: '사물함 속 가족 사진', kind: 'photo', icon: '🖼' },
  { id: 'salute', ch: 'end', name: '마지막 경례', kind: 'draw', icon: '🎖' }
];'''
r0 = s.index('const REWARDS = [')
r1 = s.index('];', r0) + 2
s = s[:r0] + REW_NEW + s[r1:]

# 보상함 제목
s = s.replace('보상함', '사물함')

# ================= 11) 겉면 문구 =================
import re as _re
s = _re.sub(r'<h1 style="font-size:26px">🔒[^<]*</h1>\s*<p>[^<]*</p>',
    '<h1 style="font-size:26px">🔒 아버지의 정복</h1>\n    <p>체험판 비밀번호: <b>0000</b></p>\n    <p style="font-size:12px">실제 주문 제작 게임은 가족만 아는 번호로 잠깁니다.</p>', s, count=1)
s = _re.sub(r'<h1><small>[^<]*</small>[\s\S]{0,60}?</h1>',
    '<h1><small>어느 경찰관의 서른여덟 해</small>아버지의<br>정복</h1>', s, count=1)
s = _re.sub(r'<p>[^<]*일곱 장면[^<]*</p>',
    '<p>1988년 서울행 완행열차부터 2026년 마지막 경례까지,<br>일곱 해를 차례대로 걷는 이야기.</p>', s, count=1)
s = _re.sub(r'<h1 style="font-size:26px">[^<]*장면[^<]*</h1>',
    '<h1 style="font-size:26px">서른여덟 해</h1>', s, count=1)

# ================= 12) 장면 아이콘 =================
ICONS_NEW = r'''const CHAP_ICONS = {};
(function buildChapIcons() {
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const def = (k, fn) => { const c = document.createElement('canvas'); c.width = T; c.height = T; fn(c.getContext('2d')); CHAP_ICONS[k] = c; };
  // 1988 완행열차
  def('c1', g => {
    R(g, 0, 0, 16, 16, '#a8c4dd'); R(g, 0, 11, 16, 5, '#b8b4ac');
    R(g, 0, 10, 16, 1, '#8a8a94');
    R(g, 1, 3, 13, 8, '#4f6f4a'); R(g, 1, 3, 13, 2, '#6a8a62');
    R(g, 2, 6, 4, 3, '#9fd0ea'); R(g, 8, 6, 4, 3, '#9fd0ea');
    R(g, 1, 9, 13, 1, '#c9b06a');
    R(g, 2, 11, 3, 2, '#2a2a33'); R(g, 10, 11, 3, 2, '#2a2a33');
  });
  // 1990 순경 흉장 · 정복
  def('c2', g => {
    R(g, 0, 0, 16, 16, '#22304a');
    R(g, 4, 2, 8, 3, '#2f4a72'); R(g, 3, 5, 10, 8, '#2f4a72');
    R(g, 7, 5, 2, 8, '#22304a');
    R(g, 5, 6, 2, 2, '#ffd166'); R(g, 9, 6, 2, 2, '#ffd166');
    R(g, 6, 0, 4, 2, '#1a2438'); R(g, 5, 1, 6, 1, '#c9b06a');
  });
  // 1995 병원 · 아기
  def('c3', g => {
    R(g, 0, 0, 16, 16, '#e8eef2'); R(g, 0, 12, 16, 4, '#d8dfe6');
    R(g, 3, 4, 10, 8, '#ffffff'); R(g, 3, 4, 10, 1, '#c8d4dc');
    R(g, 5, 6, 6, 5, '#f7d3b3'); R(g, 6, 7, 1, 1, '#3a2a24'); R(g, 9, 7, 1, 1, '#3a2a24');
    R(g, 4, 5, 8, 1, '#ffc9d6');
    R(g, 7, 1, 2, 3, '#c94b4b'); R(g, 6, 2, 4, 1, '#c94b4b');
  });
  // 2001 표창장
  def('c4', g => {
    R(g, 0, 0, 16, 16, '#7a5a3c'); R(g, 1, 1, 14, 14, '#f4e8c1');
    R(g, 2, 2, 12, 1, '#c9a227'); R(g, 2, 13, 12, 1, '#c9a227');
    R(g, 3, 4, 10, 1, '#8a7a5a'); R(g, 3, 6, 8, 1, '#8a7a5a'); R(g, 3, 8, 9, 1, '#8a7a5a');
    R(g, 9, 9, 5, 5, '#c94b4b'); R(g, 10, 10, 3, 3, '#e0c04a');
  });
  // 2008 밤의 보고서
  def('c5', g => {
    R(g, 0, 0, 16, 16, '#1f2a3a');
    R(g, 2, 3, 12, 11, '#e8e4d8'); R(g, 3, 5, 10, 1, '#8a8a94'); R(g, 3, 7, 10, 1, '#8a8a94');
    R(g, 3, 9, 7, 1, '#8a8a94');
    R(g, 3, 11, 6, 1, '#c94b4b');
    R(g, 10, 10, 4, 1, '#3a3f4a'); R(g, 13, 9, 2, 2, '#c9b06a');
  });
  // 2015 다려 둔 정복
  def('c6', g => {
    R(g, 0, 0, 16, 16, '#eceae6');
    R(g, 7, 1, 2, 2, '#8a8a94'); R(g, 4, 2, 8, 1, '#8a8a94');
    R(g, 4, 3, 8, 10, '#2f3f5c'); R(g, 7, 3, 2, 10, '#22304a');
    R(g, 5, 5, 2, 2, '#c9b06a'); R(g, 9, 5, 2, 2, '#c9b06a');
    R(g, 3, 4, 1, 6, '#2f3f5c'); R(g, 12, 4, 1, 6, '#2f3f5c');
  });
  // 2026 사물함
  def('c7', g => {
    R(g, 0, 0, 16, 16, '#7a8a94');
    R(g, 1, 1, 14, 6, '#6a7a84'); R(g, 1, 8, 14, 7, '#6a7a84');
    R(g, 12, 3, 2, 1, '#c9b06a'); R(g, 12, 11, 2, 1, '#c9b06a');
    R(g, 3, 9, 8, 5, '#f4f1e6'); R(g, 4, 10, 6, 3, '#9fc4d8');
    R(g, 3, 2, 6, 1, '#e8e4d8');
  });
})();'''
i0 = s.index('const CHAP_ICONS = {};')
i1 = s.index('})();', i0) + 5
s = s[:i0] + ICONS_NEW + s[i1:]



# 디버그 훅에 시대 함수 노출 (검증용)
s = s.replace("window.NS = { S, MAPS,", "window.NS = { S, MAPS, QUESTS, setEra, eraYear: () => eraNow,")

io.open(os.path.join(DST, 'index.html'), 'w', encoding='utf-8', newline='').write(s)
print('1단계 완료:', len(s), 'chars')
