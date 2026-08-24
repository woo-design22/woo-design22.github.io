# -*- coding: utf-8 -*-
# 「봄날, 두 사람」(love-rpg) 빌드 v2
# v1은 couple-rpg 를 이름만 바꿔 주민센터 배치가 그대로 남았다.
# v2는 카페·레스토랑 전용 타일과 맵, 포스터 퍼즐 그림을 새로 만든다.
import io, os, shutil, sys

SRC = r'C:\Claude\couple-rpg'
DST = r'C:\Claude\love-rpg'

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

def cut(start_marker, end_marker, insert=''):
    global s
    i0 = s.index(start_marker); i1 = s.index(end_marker, i0)
    s = s[:i0] + insert + s[i1:]

# ================= 1) 마음결 상담 제거 =================
cut('  <div id="care">', '</div>\n<script>')
cut('// ===== 마음결 상담', 'if (/[?&]debug=1/', 'boot();' + chr(10) + chr(10))
rep(", CARE, careSend, openCare };", " };")
rep('    <button class="big" id="btnCare">마음결 상담 💬</button>\n', '')
rep('    <p id="careHint" style="font-size:12px">마음결 상담: 둘이 싸우면 꼭 해보세요. 평소 마음 돌보기도 있어요.</p>\n', '')
rep("  $('btnCare').disabled = false;\n", '')
rep("  $('btnCare').textContent = '마음결 상담 \\ud83d\\udcac';\n", '')
rep("""  // 상담은 언제든 열린다(안내 문구는 상담 첫 화면에 있다)
  $('careHint').textContent = '마음결 상담: 둘이 싸우면 꼭 해보세요. 평소 마음 돌보기도 있어요.';
""", '')

# ================= 2) 겉면 =================
rep('<title>철우와 수지</title>', '<title>봄날, 두 사람 (데모)</title>')
rep('<h1 style="font-size:26px">🔒 두 사람만의 이야기</h1>\n    <p>비밀번호 네 자리를 눌러 주세요.</p>',
    '<h1 style="font-size:26px">🔒 봄날, 두 사람</h1>\n    <p>체험판 비밀번호: <b>0000</b></p>\n    <p style="font-size:12px">실제 주문 제작 게임은 두 분만 아는 번호로 잠깁니다.</p>')
rep('<h1><small>어느 주민센터에서 시작된</small>철우와<br>수지</h1>',
    '<h1><small>어느 골목 카페에서 시작된</small>봄날,<br>두 사람</h1>')
rep('<p>처음 만난 날부터 우리 집 마련까지,<br>일곱 장면을 차례대로 플레이하는 두 사람의 이야기.</p>',
    '<p>가상의 커플 민준과 서연, 다섯 장면.<br>이런 게임을 <b>두 분의 이야기</b>로 만들어 드립니다.</p>')
rep('<h1 style="font-size:26px">우리의 장면들</h1>', '<h1 style="font-size:26px">두 사람의 장면들</h1>')

# ================= 3) 저장 키·상수·주인공 =================
s = s.replace("'cs_", "'lv_")
rep("const PASSWORD = '0316';", "const PASSWORD = '0000';   // 데모: 잠금 화면에 공개")
rep("const FINAL_MESSAGE = '처음 만난 주민센터에서 지금 우리 집까지.\\n이렇게 보고 있으면, 고맙고 사랑해.\\n앞으로도 잘 부탁해.';",
    "const FINAL_MESSAGE = '누구에게나 봄날이 있습니다.\\n두 분의 이야기도\\n이렇게 게임이 됩니다.';")
rep("const ERA = '장충동에서 시작된 이야기';", "const ERA = '어느 골목 카페에서 시작된 이야기';")
rep("const MAKER = '철우가 수지에게';", "const MAKER = '주문 제작 데모 · 이야기공방';")
rep("""  { id: 'cw', name: '철우', tag: '중구 공무원 · 예쁜 눈, 다정한 성격',
    pal: { s: '#f1c7a3', h: '#1c1c24', t: '#3f7fd9', p: '#2f3f73', b: '#2b2b33', a: '#ffffff' } },
  { id: 'sj', name: '수지', tag: '사회복지 공무원 · 귀여운 목소리', female: true,
    pal: { s: '#f7d3b3', h: '#4a2f24', t: '#ff9eb5', p: '#6b5a8c', b: '#f4f4f4', a: '#fff1f4' } }""",
    """  { id: 'cw', name: '민준', tag: '디자인 하는 회사원 · 늘 같은 자리에 앉는다',
    pal: { s: '#f1c7a3', h: '#2a2a30', t: '#4a7a5f', p: '#33415e', b: '#2b2b33', a: '#ffffff' } },
  { id: 'sj', name: '서연', tag: '카페 봄날의 바리스타 · 웃음이 많다', female: true,
    pal: { s: '#f7d3b3', h: '#6a4530', t: '#f2b8c6', p: '#7a6a9a', b: '#f4f4f4', a: '#fff4f7' } }""")
rep("""const CHAPTERS = [
  { id: 'c1', hero: 'cw', title: '처음 만난 날', sub: '장충동 주민센터' },
  { id: 'c2', hero: 'cw', title: '드론 데이트', sub: '한강공원' },
  { id: 'c3', hero: 'cw', title: '우리, 사귀자', sub: '장충동 철우집' },
  { id: 'c4', hero: 'cw', title: '결혼식', sub: '부산 목장원' },
  { id: 'c5', hero: 'cw', title: '화해의 기술', sub: '성수동 신혼집' },
  { id: 'c6', hero: 'sj', title: '저녁 메뉴의 신', sub: '성수동 신혼집' },
  { id: 'c7', hero: 'cw', title: '내 집 마련', sub: '월곡 두산위브' }
];""",
    """const CHAPTERS = [
  { id: 'c1', hero: 'cw', title: '포스터 한 장', sub: '카페 봄날' },
  { id: 'c2', hero: 'cw', title: '드론이 나는 날', sub: '강변 공원' },
  { id: 'c3', hero: 'cw', title: '우리, 사귈래요?', sub: '민준의 자취방' },
  { id: 'c4', hero: 'cw', title: '처음 서운했던 날', sub: '서연의 원룸' },
  { id: 'c5', hero: 'cw', title: '네 글자', sub: '바닷가 레스토랑' }
];""")

# ================= 4) 카페·레스토랑 타일 추가 =================
rep("""  '1': { name: '꽃아치', solid: true, over: true }
};""",
"""  '1': { name: '꽃아치', solid: true, over: true },
  // --- 카페 봄날 ---
  '2': { name: '에스프레소 머신', solid: true, over: true },
  '3': { name: '디저트 쇼케이스', solid: true, over: true },
  '4': { name: '원형 테이블', solid: true, over: true },
  '5': { name: '벽 메뉴판', solid: true, over: true },
  '6': { name: '거리 쪽 창', solid: true },
  '7': { name: '주문 카운터', solid: true, over: true },
  '8': { name: '관엽 화분', solid: true, over: true },
  '9': { name: '창가 노트북 자리', solid: true, over: true },
  'x': { name: '카페 벽', solid: true },
  // --- 바닷가 레스토랑 ---
  '$': { name: '바다 쪽 통유리', solid: true },
  '*': { name: '촛불 테이블', solid: true, over: true },
  '(': { name: '피아노', solid: true, over: true }
};""")

rep("""  def('1', g => { R(g, 0, 5, T, 4, '#e8f4e0'); R(g, 1, 4, 3, 3, '#ff8fb1'); R(g, 6, 5, 3, 3, '#ffd166'); R(g, 11, 4, 3, 3, '#ff8fb1'); R(g, 4, 7, 2, 2, '#7bd389'); R(g, 9, 7, 2, 2, '#7bd389'); R(g, 14, 6, 2, 2, '#ffffff'); });""",
"""  def('1', g => { R(g, 0, 5, T, 4, '#e8f4e0'); R(g, 1, 4, 3, 3, '#ff8fb1'); R(g, 6, 5, 3, 3, '#ffd166'); R(g, 11, 4, 3, 3, '#ff8fb1'); R(g, 4, 7, 2, 2, '#7bd389'); R(g, 9, 7, 2, 2, '#7bd389'); R(g, 14, 6, 2, 2, '#ffffff'); });

  // ===== 카페 봄날 =====
  // 카페 벽: 위는 크림색, 아래는 나무 웨인스코팅
  def('x', g => { R(g, 0, 0, T, T, '#e8d9c0'); R(g, 0, 0, T, 1, '#f2e6d4');
    R(g, 0, 11, T, 5, '#c9a77f'); R(g, 0, 11, T, 1, '#a8865e'); });
  // 에스프레소 머신: 은색 몸통 + 게이지 두 개 + 포터필터 + 잔
  def('2', g => { R(g, 0, 0, T, T, '#e8d9c0'); R(g, 1, 2, 14, 11, '#c9ccd2'); R(g, 1, 2, 14, 2, '#e4e7ec');
    R(g, 2, 5, 5, 4, '#3a3a44'); R(g, 3, 6, 3, 2, '#7bd389');
    R(g, 9, 5, 5, 4, '#3a3a44'); R(g, 10, 6, 3, 2, '#ffd166');
    R(g, 6, 9, 4, 2, '#8a8a94'); R(g, 6, 11, 4, 2, '#e8e0d0'); R(g, 7, 12, 2, 1, '#6b4226');
    R(g, 0, 13, T, 3, '#7a5a3c'); });
  // 디저트 쇼케이스: 유리 안에 크루아상·케이크·스콘
  def('3', g => { R(g, 0, 0, T, T, '#e8d9c0'); R(g, 0, 2, T, 10, '#dbe9f0'); R(g, 0, 2, T, 1, '#8a9aa8');
    R(g, 1, 4, 4, 3, '#e0a03a'); R(g, 6, 4, 4, 3, '#f2b8c6'); R(g, 11, 4, 4, 3, '#f4e8c1');
    R(g, 0, 7, T, 1, '#a8c0cc');
    R(g, 2, 8, 4, 3, '#c98b6b'); R(g, 8, 8, 5, 3, '#e8dfe2');
    R(g, 0, 12, T, 4, '#7a5a3c'); R(g, 0, 12, T, 1, '#96714c'); });
  // 원형 테이블 (위에서 본 모습): 둥근 상판 + 잔 하나. 다리는 그림자로만 암시한다
  def('4', g => { R(g, 3, 13, 10, 2, 'rgba(90,60,30,0.35)');                       // 바닥 그림자
    R(g, 4, 1, 8, 13, '#4e3824');                                                  // 짙은 호두나무 상판
    R(g, 3, 2, 10, 11, '#4e3824'); R(g, 2, 4, 12, 7, '#4e3824');
    R(g, 5, 2, 6, 11, '#6b4f33'); R(g, 4, 4, 8, 7, '#6b4f33');                     // 안쪽 밝은 면
    R(g, 5, 2, 6, 1, '#8a6844');
    R(g, 6, 6, 4, 4, '#f7f4ef'); R(g, 6, 6, 4, 1, '#ffffff'); R(g, 7, 7, 2, 2, '#c98b6b'); });
  // 벽 메뉴판: 나무 테두리 칠판, 분홍 줄이 벚꽃 라떼
  def('5', g => { R(g, 0, 0, T, T, '#e8d9c0'); R(g, 1, 1, 14, 14, '#5a4a3a'); R(g, 2, 2, 12, 12, '#2e3b33');
    R(g, 3, 3, 8, 1, '#f4e8c1'); R(g, 3, 5, 9, 1, '#f4e8c1'); R(g, 3, 7, 7, 1, '#f4e8c1');
    R(g, 3, 9, 9, 1, '#f2b8c6'); R(g, 3, 11, 6, 1, '#f4e8c1'); });
  // 거리 쪽 창: 창밖에 가로수와 건물
  def('6', g => { R(g, 0, 0, T, T, '#e9e2d3');
    R(g, 1, 2, 14, 12, '#4f5a6a'); R(g, 2, 3, 12, 10, '#bfe0f2');
    R(g, 10, 4, 4, 5, '#c9a27a'); R(g, 11, 5, 1, 1, '#8a7358'); R(g, 12, 7, 1, 1, '#8a7358');
    R(g, 3, 5, 3, 4, '#5fae4a'); R(g, 4, 8, 1, 2, '#6b4226');
    R(g, 2, 10, 12, 3, '#9aa0a6'); R(g, 8, 3, 1, 10, '#4f5a6a'); R(g, 2, 8, 12, 1, '#4f5a6a'); });
  // 주문 카운터: 나무 몸통 + 상판
  def('7', g => { R(g, 0, 2, T, 12, '#8a5f3c'); R(g, 0, 2, T, 3, '#a8794f'); R(g, 0, 5, T, 1, '#6b4226');
    R(g, 2, 7, 5, 5, '#7a5232'); R(g, 9, 7, 5, 5, '#7a5232');
    R(g, 0, 14, T, 2, '#5a3a22'); });
  // 관엽 화분
  def('8', g => { R(g, 5, 11, 6, 5, '#b5573f'); R(g, 4, 10, 8, 2, '#d9704f');
    R(g, 7, 4, 2, 7, '#3d8a3f');
    R(g, 2, 3, 5, 3, '#49a84f'); R(g, 9, 2, 5, 3, '#49a84f');
    R(g, 3, 6, 4, 2, '#3d8a3f'); R(g, 9, 6, 4, 2, '#3d8a3f'); R(g, 6, 1, 4, 2, '#5cb15e'); });
  // 창가 노트북 자리
  def('9', g => { R(g, 4, 2, 8, 5, '#3a3a44'); R(g, 5, 3, 6, 3, '#bfe0f2');
    R(g, 1, 7, 14, 3, '#a8794f'); R(g, 1, 7, 14, 1, '#c69a68'); R(g, 3, 7, 10, 1, '#8a8a94');
    R(g, 2, 10, 2, 5, '#6b4226'); R(g, 12, 10, 2, 5, '#6b4226'); });

  // ===== 바닷가 레스토랑 =====
  // 바다 쪽 통유리
  def('$', g => { R(g, 0, 0, T, T, '#3f5a72'); R(g, 1, 1, 14, 14, '#a8d2e8');
    R(g, 1, 8, 14, 7, '#5f9fc4'); R(g, 2, 10, 6, 1, '#cfe8f4'); R(g, 8, 12, 6, 1, '#cfe8f4');
    R(g, 1, 2, 5, 2, '#f4f8ff'); R(g, 7, 1, 1, 14, '#3f5a72'); R(g, 1, 7, 14, 1, '#3f5a72'); });
  // 촛불 테이블 (하얀 테이블보 + 촛대)
  def('*', g => { R(g, 6, 11, 4, 4, '#8a7358'); R(g, 4, 14, 8, 2, '#6b5a44');
    R(g, 2, 5, 12, 6, '#f7f4ef'); R(g, 3, 4, 10, 2, '#ffffff'); R(g, 2, 10, 12, 1, '#ded7cc');
    R(g, 7, 6, 2, 3, '#e8dfd0'); R(g, 7, 4, 2, 2, '#ffb84a'); R(g, 7, 3, 2, 1, '#ffe9a3');
    R(g, 4, 8, 2, 2, '#c94b4b'); R(g, 10, 8, 2, 2, '#f2b8c6'); });
  // 피아노 (연주 코너)
  def('(', g => { R(g, 1, 4, 14, 9, '#2a2a33'); R(g, 1, 4, 14, 2, '#3f3f4c');
    R(g, 2, 7, 12, 3, '#f4f4f4');
    R(g, 3, 7, 1, 2, '#2a2a33'); R(g, 5, 7, 1, 2, '#2a2a33'); R(g, 8, 7, 1, 2, '#2a2a33'); R(g, 10, 7, 1, 2, '#2a2a33'); R(g, 12, 7, 1, 2, '#2a2a33');
    R(g, 2, 13, 2, 3, '#1e1e26'); R(g, 12, 13, 2, 3, '#1e1e26'); });""")

# ================= 5) 맵 전면 교체 =================
i0 = s.index('const MAPS = {')
i1 = s.index('// 맵 크기·바닥 캐시')
NEW_MAPS = """const MAPS = {
  // ===== 1. 카페 봄날 ===== 왼쪽이 카운터(바 뒤에 서연), 오른쪽이 창가 노트북 자리.
  // 아래쪽 골목까지 한 맵에 넣어 세로 화면이 비지 않게 한다.
  cafe: { name: '카페 봄날', base: 'f', rows: [
    'xxxxxxxxxxxxxxxxxx',
    'x5ff22ff33ffff66fx',
    'xffffffffffffffffx',
    'x77777777ffffffffx',
    'xffffffffffffffffx',
    'xf44ff44fff99ffifx',
    'xffffffffffffffffx',
    'x8fff44ffff44fff8x',
    'xffffffffffffffffx',
    'xxxxxxxxDxxxxxxxxx',
    '__________________',
    '__T_____L_____T___',
    '__________________',
    '==================',
    '==================',
    '__________________'
  ], exits: [], signs: {
    '1,1': '벽 메뉴판.\\n아메리카노 · 라떼 · 그리고 분홍 글씨로 「벚꽃 라떼」.',
    '11,5': '창가 노트북 자리. 민준이 늘 앉는 곳이다.'
  },
  labels: [ { x: 4, y: 3, t: '주문 카운터' }, { x: 12, y: 4, t: '창가 자리' }, { x: 8, y: 10, t: '골목' } ] },

  // ===== 2. 강변 공원 ===== 위는 강, 아래는 잔디밭. 드론 날릴 공터가 넓다
  park: { name: '강변 공원', base: '.', rows: [
    '0000000000000000000000',
    '0000000000000000000000',
    'jjjjjjjjjjjjjjjjjjjjjj',
    '______________________',
    '......................',
    '..C.....,......,....C.',
    '......................',
    '.T.......L....L......T',
    '......................',
    '..,.................,.',
    '......s...............',
    '.t..................t.',
    'TTTTTTTTTTTTTTTTTTTTTT'
  ], exits: [], signs: { '6,10': '드론 비행 가능 구역\\n(초보 환영 · 새들 조심)' },
  labels: [ { x: 10, y: 0, t: '강' }, { x: 10, y: 3, t: '산책로' } ] },

  // ===== 3. 민준의 자취방 ===== 좁지만 정리된 원룸
  room: { name: '민준의 자취방', base: 'f', rows: [
    '||||||||||',
    '|eeffkkfi|',
    '|ffffffff|',
    '|dCffffff|',
    '|ffffffff|',
    '|offfrrff|',
    '|ffffffff|',
    '||||D|||||'
  ], exits: [], signs: {
    '1,1': '민준의 침대. 이불이 그날따라 각 잡혀 있었다.',
    '5,1': '책장. 디자인 책 사이에 카페 쿠폰이 꽂혀 있다.',
    '1,3': '작업 책상. 그 포스터를 여기서 만들었다.'
  },
  labels: [ { x: 4, y: 0, t: '민준의 방' } ] },

  // ===== 4. 서연의 원룸 ===== 분리형, 주방이 오른쪽
  sjroom: { name: '서연의 원룸', base: 'f', rows: [
    '||||||||||||||',
    '|eeff|kzzffff|',
    '|ffff|fffffif|',
    '|ffffDfffffff|',
    '|ffffffrrffff|',
    '|offfffrrfffi|',
    '|ffffffffffff|',
    '||||||D|||||||'
  ], exits: [], signs: {
    '2,1': '서연의 침실. 커튼이 반쯤 닫혀 있다.',
    '7,1': '작은 주방. 드립 도구가 가지런하다.'
  },
  labels: [ { x: 2, y: 1, t: '침실' }, { x: 9, y: 1, t: '주방' } ] },

  // ===== 5. 바닷가 레스토랑 「첫눈」 ===== 위가 통유리(바다), 창가에 촛불 테이블
  sea: { name: '바닷가 레스토랑 「첫눈」', base: 'f', rows: [
    '$$$$$$$$$$$$$$$$$$$$',
    'ffffffffffffffffffff',
    'ff**ffffffffffff**ff',
    'ffffffffffffffffffff',
    'ffffffff****ffffffff',
    'ffffffffffffffffffff',
    'ff**ffff****ffff**ff',
    'ffffffffffffffffffff',
    '((ffff**ffff**ffff8f',
    'ffffffffffffffffffff',
    'ff8ffffffffffffff8ff',
    'ffffffffffffffffffff',
    'xxxxxxxxxDxxxxxxxxxx',
    '____________________',
    '____________________',
    '===================='
  ], exits: [], signs: {
    '9,0': '통유리 너머로 바다가 어둡게 빛난다. 배 한 척이 지나간다.',
    '9,4': '창가 자리. 초가 두 개 켜져 있다.'
  },
  labels: [ { x: 10, y: 0, t: '바다' }, { x: 9, y: 3, t: '창가 자리' }, { x: 1, y: 8, t: '연주 코너' } ] }
};
"""
s = s[:i0] + NEW_MAPS + s[i1:]

# 맵 id 변경 반영
for a, b in [("'office'", "'cafe'"), ("'hangang'", "'park'"), ("'cwhome'", "'room'"),
             ("'sjhome'", "'sjroom'"), ("'mokjang'", "'sea'"), ("'apt'", "'sea'")]:
    s = s.replace(a, b)

# ================= 6) 사람 배치 =================
i0 = s.index('const NPCS = {')
i1 = s.index('// 상대방 배치는 장면 대본')
s = s[:i0] + """const NPCS = {
  cafe: [
    { id: 'boss', spr: 'boss', x: 2, y: 2, dir: 'down', name: '사장님' },
    { id: 'senior', spr: 'senior', x: 4, y: 4, dir: 'up', name: '할머니 손님' },
    { id: 'coA', spr: 'coA', x: 13, y: 6, dir: 'up', name: '단골 손님' },
    { id: 'civil', spr: 'civil', x: 3, y: 6, dir: 'up', name: '손님 아저씨' },
    { id: 'civil2', spr: 'civil2', x: 7, y: 6, dir: 'up', name: '손님 아주머니' }
  ],
  park: [ { id: 'runner', spr: 'runner', x: 17, y: 3, dir: 'left', name: '러너' } ],
  room: [],
  sjroom: [],
  sea: [
    { id: 'fil', spr: 'fil', x: 2, y: 9, dir: 'up', name: '피아노 연주자' },
    { id: 'officiant', spr: 'officiant', x: 15, y: 11, dir: 'left', name: '지배인' },
    { id: 'mil', spr: 'mil', x: 4, y: 11, dir: 'right', name: '홀 매니저' },
    { id: 'guestA', spr: 'guestA', x: 3, y: 7, dir: 'up', name: '손님' },
    { id: 'guestB', spr: 'guestB', x: 17, y: 7, dir: 'up', name: '손님' },
    { id: 'guestC', spr: 'guestC', x: 9, y: 7, dir: 'up', name: '손님' }
  ]
};
""" + s[i1:]

# ================= 7) 타일 설명 =================
i0 = s.index('const GENERIC_LOOK = {')
i1 = s.index('function pressA()')
s = s[:i0] + """const GENERIC_LOOK = {
  '2': '에스프레소 머신. 아침마다 이 소리로 하루가 시작된다.',
  '3': '디저트 쇼케이스. 크루아상이 오늘도 잘 나왔다.',
  '4': '원형 테이블. 잔 자국이 동그랗게 남아 있다.',
  '5': '벽 메뉴판.\\n아메리카노 · 라떼 · 그리고 분홍 글씨로 「벚꽃 라떼」.',
  '6': '거리 쪽 창. 골목에 사람이 지나간다.',
  '7': '주문 카운터. 반질반질한 나무 상판.',
  '8': '관엽 화분. 잎이 크다.',
  '9': '창가 노트북 자리. 민준이 늘 앉는 곳이다.',
  '$': '통유리 너머로 바다가 어둡게 빛난다.',
  '*': '촛불 테이블. 초가 조용히 흔들린다.',
  '(': '피아노. 오늘 밤은 연주가 있는 모양이다.',
  d: '작업 책상. 그 포스터를 여기서 만들었다.', k: '책장. 디자인 책 사이에 카페 쿠폰이 꽂혀 있다.',
  C: '의자.', i: '화분. 잘 자라고 있다.', e: '침대. 이불이 폭신하다.',
  o: '소파. 두 사람 자리가 딱 정해져 있다.', r: '러그. 발이 따뜻하다.',
  z: '작은 주방. 드립 도구가 가지런하다.', w: '큰 창. 뷰가 좋다.', D: '문.',
  0: '강물이 반짝인다.', j: '흰 난간. 바람이 좋다.', T: '나무.', t: '덤불.',
  L: '가로등.', ',': '꽃이 피었다.', '_': '산책로.', s: '안내판.'
};
""" + s[i1:]

# ================= 8) 포스터 그림 (리플릿 교체) =================
i0 = s.index('function drawLeaflet(g) {')
i1 = s.index('// 리플릿 조각 퍼즐')
s = s[:i0] + """function drawPoster(g) {
  g.fillStyle = '#fff5f7'; g.fillRect(0, 0, 144, 144);
  // 위아래 분홍 띠
  g.fillStyle = '#f2b8c6'; g.fillRect(0, 0, 144, 30);
  g.fillStyle = '#ffffff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center';
  g.fillText('벚꽃 라떼', 72, 22);
  // 잔
  g.fillStyle = '#e8dfe2'; g.fillRect(46, 50, 52, 8);
  g.fillStyle = '#ffffff'; g.fillRect(48, 58, 48, 50);
  g.fillStyle = '#f7d9e0'; g.fillRect(52, 62, 40, 16);
  g.fillStyle = '#c98b6b'; g.fillRect(52, 78, 40, 26);
  // 하트 라떼아트
  g.fillStyle = '#f2b8c6';
  g.beginPath(); g.arc(66, 70, 6, 0, 7); g.fill();
  g.beginPath(); g.arc(78, 70, 6, 0, 7); g.fill();
  g.beginPath(); g.moveTo(59, 73); g.lineTo(72, 86); g.lineTo(85, 73); g.fill();
  // 잔 받침
  g.fillStyle = '#e8dfe2'; g.fillRect(40, 108, 64, 6);
  // 흩날리는 벚꽃잎
  const petals = [[18, 44], [122, 52], [26, 96], [116, 100], [14, 68], [128, 78]];
  g.fillStyle = '#ffc9d6';
  petals.forEach(p => { g.beginPath(); g.arc(p[0], p[1], 5, 0, 7); g.fill(); });
  g.fillStyle = '#ff9eb5';
  petals.forEach(p => { g.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
  // 아래 문구
  g.fillStyle = '#f2b8c6'; g.fillRect(0, 118, 144, 26);
  g.fillStyle = '#ffffff'; g.font = 'bold 11px sans-serif';
  g.fillText('봄 한정 · 3,900원', 72, 130);
  g.font = 'bold 10px sans-serif';
  g.fillText('카페 봄날', 72, 141);
}
""" + s[i1:]
rep('// 리플릿 조각 퍼즐: 기울어진 조각을 탭해서 90도씩 돌려 바로 세우면 완성',
    '// 포스터 조각 퍼즐: 기울어진 조각을 탭해서 90도씩 돌려 바로 세우면 완성')
rep('    drawLeaflet(art.getContext(\'2d\'));', '    drawPoster(art.getContext(\'2d\'));')
rep("    if (r.id === 'leaflet') { c.width = 288; c.height = 288; const g = c.getContext('2d'); g.scale(2, 2); drawLeaflet(g); }",
    "    if (r.id === 'poster') { c.width = 288; c.height = 288; const g = c.getContext('2d'); g.scale(2, 2); drawPoster(g); }")

# ================= 9) 대사 테이블 =================
i0 = s.index('const NPC_LINES = {')
i1 = s.index('function markEnts')
s = s[:i0] + """const NPC_LINES = {
  boss: ['어서 와요. 늘 앉던 자리 비워 놨어요.', '우리 서연이가 일을 참 잘해요.'],
  coA: '이 카페 포스터 예쁘죠? 단골 손님이 만들었대요.',
  civil: '여기 벚꽃 라떼가 그렇게 맛있다며?',
  civil2: '사진 찍기 좋은 카페라고 해서 왔어요.',
  senior: '이 집 아가씨가 아주 친절햐.',
  runner: '강바람이 좋죠. 드론 조심하시고요!',
  fil: '(피아노 앞에서 손을 풀고 있다)',
  mil: '오늘 예약 손님이 특별한 준비를 하셨더라고요. 후후.',
  officiant: '창가 자리로 모시겠습니다.',
  guestA: '어머, 저 창가 테이블 뭔가 있다.', guestB: '초까지 켜 놨네.', guestC: '박수 칠 준비 하자.'
};
const FRIEND_LINES = {
  cw: ['서연 씨는 웃을 때 봄 같아요.', '(괜히 메뉴판만 본다)'],
  sj: ['민준 씨, 오늘도 아메리카노죠?', '(콧노래를 부른다)']
};
""" + s[i1:]

# ================= 10) 장면 대본 + 엔딩 =================
q0 = s.index('// ===== 장면 대본 =====')
q1 = s.index('\\n// ----- 배경음악') if '\\n// ----- 배경음악' in s else s.index('\n// ----- 배경음악')
NEW_QUESTS = r"""// ===== 장면 대본 =====
const QUESTS = {};

// --- 1. 포스터 한 장 (민준 · 카페 봄날) ---
QUESTS.c1 = {
  start: { map: 'cafe', x: 8, y: 7, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage <= 1 ? '주문 카운터 앞으로 가 보기 (왼쪽 위)' : q.stage === 2 ? '창가 노트북 자리에서 포스터 만들기 (오른쪽)' : '카운터의 서연에게 포스터 보여 주기'; },
  hint(q) { return q.stage <= 1 ? '카운터 앞줄(위쪽)로 걸어가면 목소리가 들린다.' : q.stage === 2 ? '오른쪽 창가의 노트북 자리 앞에 서서 위를 보고 A.' : '할머니가 떠난 카운터 앞에 서서 위를 보고 A. 카운터 너머로도 말이 걸린다.'; },
  marks() { const q = S.q; markEnts(q.stage === 3 ? ['sj'] : q.stage <= 1 ? ['senior'] : []); },
  friendPos(fid) { return fid === 'sj' ? { map: 'cafe', x: 4, y: 2, dir: 'down' } : null; },
  async intro() {
    await say('', '어느 봄날 점심시간, 골목 카페 「봄날」. 회사원 민준의 단골 가게다.');
    await say('사장님', '어서 와요. 늘 앉던 창가 자리 비워 놨어요.');
    await say('사장님', '아 참, 우리 알바생이 손님 찾던데? 카운터 쪽으로 가 봐요.');
    await say('민준', '(나를? 왜지?)');
    S.q.stage = 1; setHud(); this.marks();
  },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId !== 'cafe' || q.stage !== 1 || y !== 4 || x < 3 || x > 7) return;
    S.lock = true;
    await say('', '카운터 앞. 할머니 한 분이 메뉴판을 올려다보고 계신다.');
    await say('서연', '할머니~ 이건 덜 달고요, 이게 지난번에 드신 그거예요. 뜨겁게 해 드릴까요?');
    await say('할머니 손님', '아이고, 우리 아가씨가 내 입맛을 다 기억하네.');
    await say('서연', '단골이신걸요! 자리에 계시면 가져다 드릴게요~');
    await say('민준', '(목소리가… 봄 같다. 그리고 할머니께 진짜 다정하다.)');
    const sn = findEnt('senior');
    if (sn) { await say('할머니 손님', '고마워요. (총총)'); await walkEnt(sn, ['down', 'down', 'right', 'right']); sn.gone = true; }
    await say('서연', '어! 저기, 늘 창가에서 노트북 하시는 분 맞죠? 부탁이 하나 있어서요.');
    await say('서연', '사장님이 신메뉴 포스터를 저더러 만들래요… 저 그림엔 진짜 자신 없거든요.');
    const i = await ask('민준', '(부탁을 받았다!)', ['맡겨 주세요. 오늘 안에 만들어 드릴게요', '어… 일정이 좀…', '신메뉴가 뭔데요?']);
    if (i === 0) await say('서연', '와, 시원시원하다! 감사해요!');
    else if (i === 1) { await say('서연', '아… 바쁘시구나…'); await say('민준', '농담입니다! 바로 만들게요. (내가 왜 그랬지)'); }
    else { await say('서연', '벚꽃 라떼요! 저기 분홍 글씨. 예쁘죠?'); await say('민준', '(이름부터 봄이네.)'); }
    q.stage = 2; setHud(); save(); QUESTS.c1.marks();
    await say('', '늘 앉던 창가 자리로 돌아가 노트북을 열자.');
    S.lock = false;
  },
  interact(mapId, x, y, ch) {
    if (mapId !== 'cafe' || ch !== '9' || S.q.stage !== 2) return null;
    return async () => {
      await say('민준', '벚꽃 라떼 포스터… 조각부터 바로 세우자.');
      const win = await playPuzzle();
      if (!win) { await say('민준', '음, 다시 해 보자. (노트북 자리 앞에서 A)'); return; }
      S.q.stage = 3; setHud(); save(); QUESTS.c1.marks();
      await say('민준', '완성! 이 골목 역대급 포스터다. 보여 주러 가자.');
    };
  },
  friendTalk: {
    sj: async e => {
      const q = S.q;
      if (q.stage === 3) {
        await say('민준', '서연 씨, 포스터 완성했어요.');
        await say('서연', '벌써요?! …우와, 예쁘다. 벚꽃잎까지 날려 주셨네!');
        await say('서연', '(그림도 잘 그리고, 매일 같은 자리에서 성실하고…)');
        await say('민준', '(칭찬받았다. 오늘 커피가 더 달다.)');
        await say('서연', '보답으로 내일 음료는 제가 쏠게요! 사장님 몰래는 아니고요.');
        await say('', '이렇게 두 사람의 봄이 시작됐다.');
        await finishQuest();
      } else if (q.stage === 2) await say(e.name, '포스터 부탁드려요! 편하게 창가 자리에서 하세요~');
      else await say(e.name, '주문 도와드릴까요? 오늘의 추천은 벚꽃 라떼!');
    }
  },
  npcTalk: {
    boss: async e => { await say(e.name, S.q.stage <= 1 ? '카운터는 왼쪽 위요.' : '포스터 기대할게요.'); }
  }
};

// --- 2. 드론이 나는 날 (민준 · 강변 공원) ---
QUESTS.c2 = {
  start: { map: 'park', x: 10, y: 9, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '서연에게 말 걸고 드론 날리기 (링 5개 통과)'; },
  hint() { return '드론은 탭(Z)할 때마다 떠오르고, 가만두면 내려간다. 초록 기둥 사이 틈으로!'; },
  async intro() {
    await say('', '몇 번의 커피와 몇 번의 수다 끝에, 첫 데이트. 민준이 아끼는 드론을 들고 나왔다.');
    await say('민준', '(오늘은… 꼭 멋있는 모습을 보여 준다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['sj']); },
  friendPos(fid) { return fid === 'sj' ? { map: 'park', x: 11, y: 8, dir: 'left' } : null; },
  friendTalk: {
    sj: async e => {
      const q = S.q;
      if (q.finished) { await say(e.name, '민준 씨, 저 드론 잘 날리죠?'); return; }
      if (!q.ready) {
        await say('서연', '우와, 이게 그 드론이에요? 진짜 날아요?');
        await say('민준', '그럼요. 강바람쯤은 껌입니다. (사실 조금 긴장된다)');
        q.ready = true;
      }
      await say('서연', '날려 봐요, 날려 봐요!');
      const win = await playDrone(5);
      if (!win) { await say('서연', '앗… 그래도 멋있었어요! 한 번 더?'); return; }
      await say('서연', '와아아! 진짜 잘 날린다!');
      await say('민준', '(됐다. 오늘의 목표 달성.) 서연 씨도 해 볼래요?');
      await say('', '(서연이 조종간을 잡았다. …의외로 민준보다 잘 날렸다.)');
      await say('서연', '이거 재밌네요! 우리 다음에 또 날려요.');
      await say('민준', '(다음이 생겼네.)');
      await showPhoto('drone', '그날의 강변, 그리고 드론', 2000);
      await say('', '해 질 무렵까지, 두 사람은 강가에서 웃었다.');
      await finishQuest();
    }
  },
  npcTalk: { runner: async e => { await say(e.name, '드론 데이트인가 봐요? 보기 좋네요!'); } }
};

// --- 3. 우리, 사귈래요? (민준 · 자취방) ---
QUESTS.c3 = {
  start: { map: 'room', x: 4, y: 5, dir: 'up' },
  init(q) { q.stage = 0; },
  goal() { return '소파의 서연 옆에서 마음 전하기'; },
  hint() { return '왼쪽 소파 근처의 서연에게 A. 솔직한 마음이 제일 세다.'; },
  async intro() {
    await say('', '데이트를 이어오던 어느 저녁. 오늘은 민준의 자취방에서 영화를 봤다.');
    await say('', '영화는 끝났는데, 아무도 리모컨을 잡지 않는다.');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['sj']); },
  friendPos(fid) { return fid === 'sj' ? { map: 'room', x: 2, y: 5, dir: 'right' } : null; },
  friendTalk: {
    sj: async e => {
      const q = S.q;
      if (q.finished) { await defaultTalk(e); return; }
      await say('서연', '…영화 재밌었다. 그치?');
      const i = await ask('민준', '(심장 소리가 들릴 것 같다. 뭐라고 하지?)', ['서연 씨랑 있으면 시간이 너무 빨라요', '라, 라면 먹을래요?', '(아무 말 없이 눈을 본다)']);
      if (i === 0) await say('서연', '…나도요. 이상하게 안 지겨워.');
      else if (i === 1) { await say('서연', '방금 먹었잖아요. 후후.'); await say('민준', '(바보냐 나는)'); }
      else await say('서연', '…왜요. 왜 그렇게 봐요. (귀가 빨개졌다)');
      await say('민준', '서연 씨.');
      await say('서연', '…네.');
      S.tint = 'rgba(255, 150, 180, 0.2)';
      await say('민준', '우리… 사귈래요?');
      await say('', '(아주 짧고, 아주 긴 침묵)');
      await say('서연', '…네.');
      S.tint = null;
      await say('', '창밖의 봄이 조금 더 환해졌다.');
      await finishQuest();
    }
  }
};

// --- 4. 처음 서운했던 날 (민준 · 서연의 원룸) ---
QUESTS.c4 = {
  start: { map: 'sjroom', x: 8, y: 6, dir: 'up' },
  init(q) { q.stage = 0; q.fails = 0; },
  goal() { return '침실 앞의 서연 달래기 (선택지를 잘 고르자)'; },
  hint(q) { return q.fails ? '정답은 늘 같다: 서두르지 말고, 탓하지 말고, 구체적으로. 그리고 마지막은 손.' : '서연은 쉽게 안 풀린다. 다섯 번 중 네 번은 마음에 닿아야 한다.'; },
  async intro() {
    await say('', '사귄 지 백 일쯤 된 어느 날, 서연의 원룸. 오늘은 공기가 낮다.');
    await say('', '(약속에 늦고, 사과가 짧았다. 무슨 일이었는지는… 사실 중요하지 않다.)');
    await say('민준', '(달래러 왔다. 그런데 서연 달래기는… 난이도가 높다.)');
    S.q.stage = 1; setHud(); this.marks();
  },
  marks() { markEnts(['sj']); },
  friendPos(fid) { return fid === 'sj' ? { map: 'sjroom', x: 2, y: 2, dir: 'down' } : null; },
  friendTalk: {
    sj: async e => {
      const q = S.q;
      if (q.finished) { await defaultTalk(e); return; }
      let ok = 0;
      let i = await ask('민준', '(첫마디가 절반이다)', ['서연아, 아까는 미안해. 내 말이 짧았어', '뭐가 그렇게 서운한데?', '떡볶이 시킬까?']);
      if (i === 0) { ok++; await say('서연', '…흥.'); } else if (i === 1) { await say('서연', '몰라서 물어?'); } else { await say('서연', '지금 떡볶이가 넘어가?'); }
      i = await ask('민준', '(다음 한마디)', ['네 입장에서 먼저 생각을 못 했어', '나도 나름 바빴거든?', '자자, 우리 착하지']);
      if (i === 0) { ok++; await say('서연', '…그걸 알긴 아네.'); } else if (i === 1) { await say('서연', '지금 그 얘기가 왜 나와.'); } else { await say('서연', '애 취급하지 마.'); }
      await say('서연', '…됐어.');
      i = await ask('민준', '("됐어"의 번역은?)', ['안 됐다는 뜻. 더 들을게, 천천히 말해 줘', '그래, 그럼 좀 쉬어', '알았어, 나 갈게?']);
      if (i === 0) { ok++; await say('서연', '(조금 풀렸다) …있잖아. 나는 그때…'); await say('', '(서연의 이야기를 끝까지 들었다. 중간에 끼어들지 않고.)'); }
      else if (i === 1) { await say('서연', '쉬라면 진짜 쉰다?'); } else { await say('서연', '…가.'); }
      i = await ask('민준', '(약속의 시간)', ['다음엔 늦을 것 같으면 미리 전화할게. 약속', '내가 다 잘못했어 (영혼 1g)', '우리 이제 싸우지 말자!']);
      if (i === 0) { ok++; await say('서연', '…구체적이네. 좋아, 기억한다?'); } else if (i === 1) { await say('서연', '영혼 없는 거 다 티 나거든.'); } else { await say('서연', '그게 마음대로 되니?'); }
      i = await ask('민준', '(마무리)', ['(가만히 손을 내민다)', '셀카 찍자! 화해 기념', '내일 카페 갈까']);
      if (i === 0) { ok++; await say('', '(서연이 잠깐 노려보다가… 손을 잡았다)'); } else { await say('서연', '분위기 파악.'); }
      if (ok >= 4) {
        await say('서연', '…치. 다음엔 진짜 잘해.');
        await say('민준', '응. (첫 화해, 무사히 완료)');
        await say('', '싸우는 법보다 화해하는 법을 먼저 배웠다.');
        await finishQuest();
      } else {
        q.fails++;
        await say('서연', '…아직이야.');
        await say('민준', '(다시. 서두르지 말자. 다시 말 걸어 보자.)');
      }
    }
  }
};

// --- 5. 네 글자 (민준 · 바닷가 레스토랑) ---
QUESTS.c5 = {
  start: { map: 'sea', x: 9, y: 11, dir: 'up' },
  init(q) { q.stage = 0; },
  goal(q) { return q.stage < 1 ? '창가 자리로 (위로 걷기)' : q.stage === 1 ? '연주자의 피아노 (박자 맞추기)' : q.stage === 2 ? '민준의 세레나데 (박자 맞추기)' : '네 글자'; },
  hint() { return '박자 게임: 바늘이 금색 구간에 들어왔을 때 탭(Z). 8번 중 6번이면 성공.'; },
  async intro() {
    S.heroSpr = 'cwTux';
    await say('', '이 년 뒤, 바닷가 레스토랑 「첫눈」. 민준이 한 달 전부터 예약한 곳이다.');
    await say('', '통유리 너머로 어두운 바다가 반짝인다. 주머니 속 작은 상자가 아까부터 무겁다.');
    await say('민준', '(정장이 조금 조인다. 아니, 심장이 조이는 건가.)');
    S.q.stage = 0; setHud(); this.marks();
  },
  marks() { markEnts([]); },
  friendPos(fid) { return fid === 'sj' ? { map: 'sea', x: 10, y: 5, dir: 'up', spr: 'sjDress' } : null; },
  async onStep(mapId, x, y) {
    const q = S.q;
    if (mapId === 'sea' && q.stage === 0 && y === 5 && x >= 8 && x <= 11) {
      S.lock = true;
      await say('지배인', '예약하신 창가 자리입니다. …준비는 말씀하신 대로 해 두었습니다.');
      await say('서연', '뭐야, 오늘 왜 이렇게 좋은 데야? 무슨 날이야?');
      await say('민준', '(아직 아니다. 침착하자.)');
      await say('지배인', '먼저, 오늘 밤 연주가 있겠습니다.');
      q.stage = 1; setHud(); save();
      const win1 = await this.piano();
      if (win1) await this.song();
      S.lock = false;
    }
  },
  async piano() {
    const win = await playRhythm('연주자의 피아노 ♪', 8, 6);
    if (!win) { await say('피아노 연주자', '험, 다시 하겠습니다. 바닷바람 때문입니다.'); const r = await this.piano(); return r; }
    await say('', '(피아노 소리가 통유리 너머 바다까지 흘러갔다)');
    await say('서연', '(뭔가 이상하다. 이 곡… 우리가 처음 같이 들은 노래다.)');
    S.q.stage = 2; setHud(); save();
    return true;
  },
  async song() {
    await say('민준', '서연아. 나 사실… 노래 하나 연습했어.');
    await say('서연', '뭐? 여기서? (주변 테이블이 슬금슬금 쳐다본다)');
    const win = await playRhythm('민준의 세레나데 ♪', 8, 6);
    if (!win) { await say('민준', '(헛기침) 마이크 탓입니다. 다시!'); const r = await this.song(); return r; }
    await say('', '(노래가 끝나고, 민준이 한쪽 무릎을 꿇었다)');
    await say('서연', '…어? 어어?');
    await say('민준', '서연아. 네 글자만 말할게.');
    const i = await ask('민준', '(상자를 연다)', ['나랑 결혼해 줄래?', '…그 네 글자, 알지?', '(말없이 반지를 내민다)']);
    if (i === 0) await say('서연', '다섯 글자거든, 바보야. …응. 할래.');
    else if (i === 1) { await say('서연', '알지. …나도 네 글자로 답할게. 「나도 좋아」.'); }
    else { await say('서연', '(눈물이 그렁그렁) …말로 해 줘. 아니다, 됐어. 응!'); }
    await say('', '(박수, 파도 소리, 그리고 두 사람)');
    await say('손님', '축하합니다~!!');
    await showPhoto('ring', '바닷가 레스토랑 — 네 글자의 밤', 2000);
    S.q.stage = 3;
    await finishQuest();
  },
  npcTalk: {
    fil: async e => { await say(e.name, S.q.stage < 1 ? '(피아노 앞에서 손을 풀고 있다)' : '좋은 밤입니다.'); },
    mil: async e => { await say(e.name, '오늘 두 분, 그림 같네요.'); }
  }
};

// ===== 엔딩 =====
async function playEnding() {
  quest = { friendPos: fid => fid === 'sj' ? { map: 'cafe', x: 4, y: 2, dir: 'down' } : null, hideNpc: id => id !== 'boss', goal: () => '' };
  S.ch = 'c5'; S.hero = 'cw'; S.q = { finished: true };
  showScreen('game'); fit(); setHud(); $('hudGoal').textContent = '';
  S.tint = 'rgba(255, 170, 120, 0.16)'; S.focus = { x: 6, y: 4 };
  await goMap('cafe', 5, 4, 'up', true);
  S.busy = true;
  await say('', '몇 달 뒤, 다시 카페 봄날. 두 사람이 청첩장을 들고 왔다.');
  await say('서연', '있잖아, 우리 처음 만난 날 기억나?');
  await say('민준', '바로 여기. 포스터 만들어 달라던 날.');
  await say('사장님', '아이고, 그 포스터! 아직도 저기 붙어 있어요.');
  await say('서연', '강변에서 드론 날리고, 네 방에서 영화 보고.');
  await say('민준', '백 일째엔 크게 싸우고… 화해하는 법부터 배웠지.');
  await say('서연', '그리고 그 레스토랑. 네 글자.');
  await say('민준', '다섯 글자라며.');
  await say('서연', '후후. …잘 살자, 우리.');
  await showPhoto('postcard', '두 사람의 이야기는 계속됩니다', 2000);
  await fade(true);
  const c = $('credits'); c.innerHTML = '';
  const add = (t, cls) => { const pp = document.createElement('p'); pp.textContent = t; if (cls) pp.className = cls; pp.style.margin = '0 0 10px'; c.appendChild(pp); };
  add(ERA);
  add('민준 · 서연', 'names');
  FINAL_MESSAGE.split('\n').forEach(l => add(l));
  add('BGM: 평화로운 피아노 브금 · A hisa – Dreamin’');
  add('— ' + MAKER + ' —');
  add('★ 이 게임은 주문 제작 데모입니다.');
  add('이름·장소·대사·사진·미니게임까지, 두 분의 실제 이야기로 만들어 드립니다.');
  add('민준과 서연은 가상의 인물입니다.');
  add('닫은 뒤 「나의 이야기로 만들기」를 눌러 보세요 💝');
  grantReward('end');
  S.tint = null; S.focus = null; quest = null;
  S.ending = true; save();
  showScreen('end');
  $('fade').classList.remove('on'); S.busy = false;
}
"""
s = s[:q0] + NEW_QUESTS + s[q1:]

# ================= 11) 보상함 =================
r0 = s.index('const REWARDS = [')
r1 = s.index('];', r0) + 2
s = s[:r0] + """const REWARDS = [
  { id: 'poster', ch: 'c1', name: '벚꽃 라떼 포스터', kind: 'draw', icon: '🖼' },
  { id: 'drone', ch: 'c2', name: '강변 드론의 기억', kind: 'photo', icon: '🚁' },
  { id: 'ticket', ch: 'c3', name: '그날 본 영화표', kind: 'draw', icon: '🎬' },
  { id: 'sorry', ch: 'c4', name: '화해의 손', kind: 'photo', icon: '🤝' },
  { id: 'ring', ch: 'c5', name: '네 글자의 반지', kind: 'photo', icon: '💍' },
  { id: 'postcard', ch: 'end', name: '두 사람의 엽서', kind: 'photo', icon: '💌' }
];""" + s[r1:]

# ================= 12) 5장 체계 =================
s = s.replace('.done.c7', '.done.c5')
s = s.replace("'/7)'", "'/5)'")
s = s.replace('일곱 장면', '다섯 장면')

# ================= 13) 판매 장치 =================
rep("cap.textContent = caption + (ok ? '' : '\\n(couple-rpg/photos/' + keys[0] + '.jpg 파일을 넣으면 실제 사진이 나옵니다)');",
    "cap.textContent = caption + (ok ? '' : '\\n\\n✨ 완성판에는 이 자리에\\n두 분의 실제 사진이 들어갑니다');")
rep("""    <button class="big" id="btnGift">보상함 🎁 <span id="giftCount"></span></button>""",
    """    <button class="big" id="btnGift">보상함 🎁 <span id="giftCount"></span></button>
    <button class="big" id="btnOrder">💝 나의 이야기로 만들기</button>""")
rep('<div class="screen" id="scrMenu">',
    """<div class="screen" id="scrOrder">
    <h1 style="font-size:24px">💝 나의 이야기로 만들기</h1>
    <p style="max-width:300px">방금 보신 게임의 <b>이름·장소·대사·사진·미니게임</b>이 전부 주문하신 이야기로 바뀝니다.</p>
    <div style="text-align:left; max-width:300px; font-size:14px; line-height:1.7; background:var(--panel); border:3px solid var(--panel-edge); border-radius:12px; padding:14px 16px">
      <b>이런 선물을 만들어 드려요</b><br>
      · 커플·부부의 이야기, 프러포즈<br>
      · 부모님 환갑·칠순·금혼식<br>
      · 정년·명예퇴직 기념, 자서전<br><br>
      <b>받으시는 것</b><br>
      · 장면 5~7개의 도트 게임 링크<br>
      · 두 분만 아는 4자리 비밀번호 잠금<br>
      · 실제 사진 · 실제로 했던 대사<br>
      · 수정 3회 포함<br><br>
      <b>주문 방법</b><br>
      ① 카카오톡 채널에서 "주문"이라고 보내기<br>
      ② 봇의 질문에 이야기를 들려주기 (10~15분)<br>
      ③ 완성 링크 + 비밀번호 받기
    </div>
    <button class="big primary" id="btnOrderGo">카카오톡 채널로 가기</button>
    <button class="big" id="btnOrderBack">돌아가기</button>
    <p style="font-size:12px; color:var(--muted)">지금은 준비 중입니다. 채널이 열리면 이 버튼이 연결됩니다.</p>
  </div>

  <div class="screen" id="scrMenu">""")
rep("['Title', 'Select', 'Menu', 'End', 'Lock', 'Gift']", "['Title', 'Select', 'Menu', 'End', 'Lock', 'Gift', 'Order']")
rep("$('btnEndClose').addEventListener('click', async () => { S.care = true; save(); showSelect(); });",
    """$('btnEndClose').addEventListener('click', async () => { S.care = true; save(); showSelect(); });
// ----- 주문 안내 (판매 데모 전용) -----
const ORDER_URL = '';   // 카카오톡 채널이 열리면 여기에 주소를 넣는다 (예: http://pf.kakao.com/_xxxxxx)
$('btnOrder').addEventListener('click', () => showScreen('order'));
$('btnOrderBack').addEventListener('click', () => showSelect());
$('btnOrderGo').addEventListener('click', () => {
  if (ORDER_URL) location.href = ORDER_URL;
  else toast('채널 준비 중입니다. 조금만 기다려 주세요!');
});""")
rep("window.NS = { S, MAPS, tick: now => { update(now); draw(); }, goMap, say, startHero, finishQuest, findEnt, MG, showPhoto };",
    "window.NS = { S, MAPS, QUESTS, tick: now => { update(now); draw(); }, goMap, say, startHero, finishQuest, findEnt, MG, showPhoto, pressA, tryMove };")

# ================= 14) 남은 문구·주석 =================
s = s.replace('// 민원인 아저씨', '// 손님 아저씨').replace('// 민원인 아주머니', '// 손님 아주머니')
s = s.replace('// 결혼식 예복 (철우 턱시도 / 수지 드레스)', '// 프로포즈 예복 (민준 정장 / 서연 드레스)')
s = s.replace('// 리플릿 그리기 (퍼즐 원본이자 보상함 이미지)', '// 포스터 그리기 (퍼즐 원본이자 보상함 이미지)')
s = s.replace("g.fillText(over ? '리플릿 완성!' : '기울어진 조각을 바로 세우자', 80, 22);",
              "g.fillText(over ? '포스터 완성!' : '기울어진 조각을 바로 세우자', 80, 22);")
s = s.replace("? '「한국사회복지연구회」 리플릿 완성!\\n탭(Z)해서 계속'",
              "? '「벚꽃 라떼」 포스터 완성!\\n탭(Z)해서 계속'")

# 안 쓰는 미니게임(집값 맞히기) 제거 — 5장 구성에서는 호출되지 않는다.
# 주의: playPrice 와 playPuzzle 사이에 drawPoster 가 있으므로 끝점은 drawPoster 앞으로 잡는다.
i0 = s.index('function playPrice()')
i0 = s.rindex('//', 0, i0)
i1 = s.index('function drawPoster(g)')
i1 = s.rindex('//', 0, i1)
s = s[:i0] + s[i1:]
assert 'function drawPoster(g)' in s and 'playPrice' not in s

# 드론 난이도: 링 8개 -> 5개 (데모 플레이 난이도 조정)
s = s.replace('// 드론 비행: 탭하면 떠오르고, 놓으면 내려간다. 링 8개를 통과하면 성공',
              '// 드론 비행: 탭하면 떠오르고, 놓으면 내려간다. 링 5개를 통과하면 성공(데모 난이도)')

io.open(os.path.join(DST, 'index.html'), 'w', encoding='utf-8', newline='').write(s)

m = io.open(os.path.join(SRC, 'manifest.webmanifest'), encoding='utf-8').read()
m = m.replace('철우와 수지', '봄날, 두 사람').replace('"철우수지"', '"봄날두사람"')
io.open(os.path.join(DST, 'manifest.webmanifest'), 'w', encoding='utf-8', newline='').write(m)

left = [k + ':' + str(s.count(k)) for k in
        ['철우', '수지', '주민센터', '민원', '리플릿', '복지연구회', '목장원', '성수', '장충동', '월곡', 'drawLeaflet', 'openCare', '마음결']
        if s.count(k)]
print('빌드 완료.', len(s), 'chars')
print('잔재:', left if left else '깨끗함')
