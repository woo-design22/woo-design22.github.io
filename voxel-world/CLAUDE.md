# voxel-world — 감독 문서 1: 설계도

마인크래프트 알파(2010) 수준의 복셀 샌드박스를 목표로 하는 **다중 파일** 브라우저 앱.
이 저장소의 다른 앱과 달리 파일이 여러 개이고, **이 문서의 규칙이 루트 `CLAUDE.md`보다 우선**한다.
루트 규칙 중 그대로 유지하는 것: 한국어 UI·주석, `:root` CSS 변수, 폰트 스택
`'Segoe UI', Pretendard, sans-serif`, 마우스/키보드 + 터치 양쪽 경로, `store` 래퍼, `file://` 동작.

## 0. 감독 문서 체계 — 세션 시작 시 가장 먼저 읽을 것

| 문서 | 역할 | 누가 언제 고치나 |
|---|---|---|
| `CLAUDE.md` (이 문서) | 설계도. 파일 구성, 모듈 간 약속, 상수, 규칙 | 설계가 바뀔 때. 코드보다 **먼저** 고친다 |
| `ROADMAP.md` | 20단계 체크리스트. 단계마다 완료 조건과 확인 방법 | 단계 완료 시 체크. 조건 변경은 §0.2 절차 |
| `HANDOFF.md` | 세션 인수인계 일지. 최신 항목이 맨 위 | 세션이 끝날 때마다 항목 추가 |

저장소 전체를 기억하는 채팅은 없다. **이 세 문서 + git 커밋이 감독이고, 채팅은 매번 버리는 작업 공간**이다.
코드와 문서가 어긋나면 그 세션 안에서 둘 중 하나를 고쳐 일치시킨다. 어긋난 채 세션을 끝내지 않는다.

### 0.1 세션 의식 (매 세션 동일)

1. `HANDOFF.md` 맨 위 항목과 `ROADMAP.md`의 "현재 단계"를 읽는다.
2. 그 단계의 **완료 조건과 확인 방법을 먼저 읽고**, 확인에 필요한 `VX.debug` 함수가 없으면 이번 단계 산출물에 포함시킨다.
3. 구현한다. 한 세션에 한 단계가 원칙. 단계가 크면 쪼개되 쪼갠 사실을 ROADMAP에 적는다.
4. 검증한다: 정적 서버(`http://localhost:8765/voxel-world/?debug=1`)와 `file://` **둘 다** 열어 콘솔 에러·경고 0을 확인하고, 완료 조건을 항목별로 **실측값**과 함께 기록한다.
5. 완료 조건을 전부 충족했을 때만 ROADMAP에 체크한다. 미달이면 "진행 중"으로 두고 남은 항목을 HANDOFF에 적는다.
6. HANDOFF 항목 추가 → ROADMAP "현재 단계" 갱신 → 커밋(§10, 사용자 지시에 따름).
7. 사용자에게 보고: 실측 결과, 남은 문제, 직접 플레이해서 확인해 달라는 항목(최대 3개).

### 0.2 문서 수정 규칙 — 실행해 보니 오류가 있을 때

문서는 살아 있는 것이고, 오류가 나면 **고치는 게 정상**이다. 다만 무엇을 고치느냐는 원인에 따라 정해진다.

| 원인 | 고치는 것 | 기록 |
|---|---|---|
| 코드 버그 | 코드. 문서는 그대로 | HANDOFF "미달/알려진 문제"에 증상과 수정 내용 |
| 설계가 틀렸음 (파일 구성, 모듈 약속, 상수 의미) | **CLAUDE.md 먼저**, 그다음 코드 | HANDOFF "문서 수정"에 무엇을 왜 바꿨는지 |
| 단계 순서가 틀렸음 (선행 단계가 필요했음) | ROADMAP 순서 조정 | HANDOFF에 이유. 순서 변경은 사용자에게 보고 |
| 완료 조건 자체가 잘못됨 (측정 불가, 모순) | ROADMAP 완료 조건 | **사용자 확인 후에만**. 확인 전까지 단계는 미완료 |

금지: **통과시키려고 완료 조건을 낮추는 것.** "60fps"를 "50fps"로 고쳐서 체크하는 식의 수정은 사용자 확인 없이는 안 된다.
상수 값 튜닝(예: 점프 속도 9.0 → 8.6)은 허용되지만 §3의 표를 **같은 커밋에서** 함께 고친다.

## 1. 범위

**목표 (알파 수준)**: 무한 청크 지형(언덕·바다·동굴·나무·광물), 1인칭 이동·점프·수영, 블록 부수기·놓기,
조명(하늘빛·블록빛·낮밤), 인벤토리·제작·화로·상자, 생존(체력·낙하·익사), 동물·적대 몹, 물·용암 흐름,
레드스톤 기초, 저장/불러오기·JSON 백업, 데스크톱+모바일 터치, 안드로이드 APK.

**범위 밖** (이유): 멀티플레이(서버 없음, Node 미설치) · 네더/엔드 · 모드 API · 음악 · 인챈트/경험치 ·
마을/NPC · 배고픔(베타 1.8 기능) · 계단(형태 복잡도 대비 가치 낮음) · 리피터 이후의 레드스톤 · 불 번짐.
범위 밖 항목을 넣으려면 먼저 이 표를 고치고 ROADMAP에 단계를 추가한다.

**법적 경계**: 이름·텍스처·캐릭터 디자인·효과음을 베끼지 않는다. 메커닉은 저작권 대상이 아니다.
표시 이름은 "복셀 월드"(가칭, 사용자가 바꿀 수 있음). 몹은 독자 디자인(색·비례가 다른 박스 모델).

## 2. 기술 결정 — 바꾸려면 이 문서를 먼저 고친다

- **순수 JS + WebGL2.** 번들러·패키지 매니저·CDN·이미지 파일·오디오 파일 없음. WebGL2 미지원 시 한국어 안내 문구.
- **ES 모듈 금지.** `file://`에서 CORS로 막힌다. `index.html` 끝에 `<script src="js/NN-name.js">`를 번호순으로 나열한다.
- **유일한 전역은 `window.VX` 하나.** `00-core.js`만 `window.VX = {}`를 만들고, 나머지 파일은 전부
  `(function (VX) { 'use strict'; ... })(window.VX);` 로 감싼다. 다른 전역을 만들면 1단계 완료 조건 위반.
- **`fetch`/XHR 금지** (`file://`에서 실패). 셰이더·레시피·블록 표는 JS 문자열/객체로 파일 안에 둔다.
- **워커는 Blob URL로만.** `new Worker('x.js')`는 `file://`에서 막힌다. `21-gen.js`의 자급자족 함수를
  `Function.prototype.toString()`으로 문자열화해 `new Worker(URL.createObjectURL(new Blob([src])))`. 워커 생성 실패 시 같은 함수를 메인 스레드에서 호출(폴백).
- **텍스처는 시작 시 절차 생성.** 캔버스에 16×16 타일을 그려 256×256 아틀라스(16×16 = 256 슬롯) 한 장. `NEAREST`, 밉맵 없음, UV 반픽셀 인셋.
- **저장은 시드 + 편집 diff**, `VX.store`(try/catch localStorage) 경유, 키 접두사 `vx_`.
  `file://`에서는 이 저장소의 모든 앱이 localStorage 네임스페이스를 공유하므로 접두사가 충돌 방지 수단이다.
- **소리는 Web Audio 합성.** 첫 사용자 입력 후 `AudioContext.resume()`.
- **루트 규칙 예외**: "상태 변경 시 전체 재렌더"는 이 앱에 적용하지 않는다. 섹션(16³) 단위 부분 갱신이 기본이다.

## 3. 좌표·단위·상수

좌표계: 오른손, **Y가 위**. 블록 `(x,y,z)`는 `[x,x+1)×[y,y+1)×[z,z+1)`. 단위 1 = 블록 1 = 1m.
시점: `yaw=0`은 −Z 방향, yaw 증가 = 오른쪽(+X)으로 회전, `pitch` 양수 = 위, 범위 ±89°.
정면 벡터 `(sin yaw · cos pitch, sin pitch, −cos yaw · cos pitch)`. 마우스 오른쪽 이동 = yaw 증가, 위 이동 = pitch 증가. 터치 드래그도 동일.
면 번호: `0 +X(동) 1 −X(서) 2 +Y(위) 3 −Y(아래) 4 +Z(남) 5 −Z(북)`. 메싱·레이캐스트·블록 놓기 모두 이 번호를 쓴다.

| 상수 | 값 | 비고 |
|---|---|---|
| `CHUNK_W` / `CHUNK_H` | 16 / 128 | 청크 = 16×128×16 |
| `SECTION_H` | 16 | 청크당 섹션 8개, `sy = y >> 4` |
| 청크 좌표 | `cx = x >> 4`, `cz = z >> 4`, `lx = x & 15`, `lz = z & 15` | 음수도 비트 연산으로 정확 |
| 블록 인덱스 | `idx = (lx * 16 + lz) * 128 + y` | y가 가장 빠르게 변한다 (컬럼 연산용) |
| 청크 키 / 섹션 키 | `'cx,cz'` / `'cx,sy,cz'` | 문자열 |
| `SEA_LEVEL` | 64 | `y < 64`인 빈 칸은 물 |
| `y < 0` / `y ≥ 128` | 기반암 취급 / 공기 취급 | 메싱·물리·조명 모두 |
| `UNLOADED` | 255 | 미로드 청크의 블록 값. 물리=고체, 메싱=불투명 |
| `RENDER_DIST` | 기본 6(데스크톱) / 4(터치), 범위 2~10 | 청크 반경. 로드는 r+1, 메싱은 4방향 이웃 청크가 있는 것만 |
| `FOV` / `NEAR` / `FAR` | 70° / 0.05 / `(r+1)*16` | 안개 시작 `(r-1)*16`, 끝 `r*16`, 안개색 = 하늘색 |
| `TICK_HZ` / `PHYSICS_HZ` | 20 / 60 | 고정 스텝 누적기. 프레임 dt 상한 0.1s |
| `DAY_TICKS` | 24000 | 0 일출 · 6000 정오 · 12000 일몰 · 18000 자정 (20분) |
| `RANDOM_TICKS_PER_SECTION` | 3 | 틱마다 섹션당 무작위 블록 3개 (잔디 번짐·묘목 성장) |
| 플레이어 AABB | 폭 0.6 × 높이 1.8, 눈높이 1.62 | |
| `WALK` / `SNEAK` / `SWIM` | 4.3 / 1.3 / 2.0 m/s | 창작 비행 10.0 |
| `GRAVITY` / `JUMP_V` / `TERMINAL` | 32 / 9.0 / 78 m/s² · m/s | 점프 높이 ≈ 1.27블록. 물속 중력 1/4 |
| `REACH` | 5 블록 | 창작·생존 동일 |
| `HEALTH_MAX` | 20 | 낙하 피해 `max(0, floor(낙하거리 − 3))` |
| 빛 | 0~15, `light = sky << 4 \| block` | 횃불 14, 용암 15. 감쇠: 공기 1, 잎·유리 1, 물 3, 불투명 차단 |
| 면 음영 / AO | 위 1.0 · 아래 0.5 · ±Z 0.8 · ±X 0.6 / 4단계 1.0·0.8·0.6·0.4 | 정점 `ao`에 곱해서 굽는다 |
| 아틀라스 | 타일 16px, 256×256, `u=(t&15)/16`, `v=(t>>4)/16`, 인셋 0.5/256 | |
| 부수기 시간 | `hardness × (도구 등급 충족 ? 1.5 : 5) / 도구 속도` | 속도: 맨손 1 · 나무 2 · 돌 4 · 철 6 · 다이아 8 · 금 12 |
| `MESH_BUDGET_MS` | 6 | 프레임당 메싱 시간 예산 |
| 워커 결과 적용 | 프레임당 ≤ 2청크 | 메인 스레드 폴백 생성은 프레임당 1청크 |
| `AUTOSAVE_SEC` / `WORLD_SLOTS` / `WARN_BYTES` | 30 / 3 / 2,000,000 | 저장 JSON이 경고 용량을 넘으면 안내 |
| `MAX_DPR` | 2 | 저사양 모드에서 렌더 스케일 0.5~1.0 |
| 스택 상한 | 64 (도구·양동이 1) | |

상수는 전부 `VX.C`에 두고 코드에 숫자를 박지 않는다. 값을 바꾸면 **이 표를 같은 커밋에서** 고친다.

## 4. 파일 구성과 로드 순서

```
voxel-world/
  CLAUDE.md  ROADMAP.md  HANDOFF.md      감독 문서
  index.html                             마크업·CSS(:root 변수)·스크립트 태그. 로직 없음
  js/
    00-core.js     VX 네임스페이스, VX.C 상수, VX.store, VX.events, VX.math(vec3/mat4), VX.rng(시드 난수), VX.hash
    10-blocks.js   블록·아이템 레지스트리(VX.B 상수, VX.blocks[], VX.items[]), 텍스처 아틀라스 절차 생성(VX.atlas)
    20-world.js    Chunk, World(청크 맵, get/setBlock, 편집 diff, 레이캐스트, 무작위 틱)
    21-gen.js      지형 생성. 자급자족 함수 하나(노이즈 포함, DOM·VX 참조 금지) → 워커/메인 양쪽에서 실행
    22-light.js    하늘빛·블록빛 플러드필(BFS), 경계 전파
    30-mesh.js     섹션 메싱(면 컬링, AO, 빛 → 정점 배열), 블록 형태별 지오메트리
    31-render.js   WebGL2 컨텍스트, 셰이더(문자열), 아틀라스 업로드, 카메라 행렬, 섹션/엔티티/하이라이트 드로우, 안개
    40-physics.js  AABB 축 분리 충돌, 중력, 유체 판정
    41-player.js   플레이어 상태, 시점, 게임 모드, 블록 부수기 진행, 아이템 사용
    42-input.js    키보드·마우스·포인터락 + 터치(조이스틱·드래그·탭·롱프레스) → 통일된 VX.input.state
    50-entities.js 엔티티 기반, 박스 모델, 드롭 아이템, 투사체, 몹 AI, 스폰 규칙
    60-ui.js       HUD(핫바·체력·조준점), 인벤토리/제작/화로/상자 화면, 메뉴, 월드 선택, 설정, 디버그 오버레이
    61-sound.js    Web Audio 합성 효과음
    70-save.js     저장/불러오기, 자동 저장, JSON 내보내기/가져오기, AndroidBridge 연동
    90-main.js     초기화, 게임 루프, 청크 로드/언로드 스케줄링, 메싱 큐, VX.debug
```

규칙:
- 파일 `N`은 **로드 시점**에는 번호가 작은 파일만 참조한다. 실행 시점(함수 안)에는 `VX.*`로 무엇이든 호출해도 된다.
- 순환 의존은 `VX.events`로 끊는다. 예: `20-world`는 `30-mesh`를 모르고 `blockChanged`만 emit, `90-main`이 받아 메싱 큐에 넣는다.
- 파일 상단 주석 한 줄: 역할 + 의존 파일. 새 파일을 추가하면 이 표와 `index.html` 둘 다 고친다.
- 핫루프(메싱·물리·조명·생성)에서 객체·배열 생성 금지. typed array를 재사용한다.
- `console.error` 0이 기준이고 경고도 남기지 않는다. 예외는 사용자에게 한국어로 보이는 메시지로 바꾼다.

## 5. 데이터 구조

**Chunk** `{ cx, cz, blocks: Uint8Array(32768), meta: Uint8Array(32768), light: Uint8Array(32768), height: Uint8Array(256),
generated, decorated, dirty: 8비트 마스크(섹션별), edits: Map<idx, id<<8 | meta> }`. `height[lx*16+lz]` = 가장 높은 불투명 블록 y+1.
`meta`는 하위 4비트만 쓴다(통나무 종류, 물 수위 0~7, 횃불 방향, 문 상태, 와이어 세기).

**블록 정의** `VX.blocks[id] = { id, name(한국어), shape: 'cube'|'cross'|'torch'|'slab'|'none', opaque, solid, liquid,
lightEmit(0~15), lightFilter(0~15: 공기 0, 잎·유리 1, 물 3, 불투명 15), hardness(초), tool: null|'pickaxe'|'axe'|'shovel',
toolMin(0 맨손 · 1 나무 · 2 돌 · 3 철 · 4 다이아), drops: [[id, count]] | (meta, toolLevel) => [...],
tex: t | {top, bottom, side} | (meta) => {...}, tickRandom, tickScheduled }`.

**블록 id는 추가만 하고 절대 재번호하지 않는다** (저장 호환). 초기 표:

```
 0 공기        1 돌          2 잔디        3 흙          4 조약돌      5 판자        6 묘목        7 기반암
 8 물          9 용암       10 모래       11 자갈       12 통나무     13 잎         14 유리       15 석탄 광석
16 철 광석    17 금 광석    18 다이아 광석 19 레드스톤 광석 20 횃불    21 작업대     22 화로       23 상자
24 노란 꽃    25 빨간 꽃    26 풀         27 양털       28 벽돌       29 사다리     30 나무 문    31 점토
32 눈         33 얼음       34 이끼 조약돌 35 흑요석     36 돌 벽돌    37 철 블록    38 금 블록    39 다이아 블록
40 레버       41 레드스톤 가루 42 레드스톤 횃불 43 버튼  44 압력판     45 돌 반블록  46 발광 블록  47 책장
```
이후 번호는 단계에서 추가하며 위 표에 덧붙인다. **아이템 id는 256부터**: 256~299 재료(막대 256, 석탄 257, 철괴 258, 금괴 259,
다이아몬드 260, 레드스톤 261, 가죽 262, 양털실 263, 점토 덩이 264, 벽돌 조각 265, 눈덩이 266, 부싯돌 267, 실 268),
300~349 도구(종류 순서 곡괭이·도끼·삽·검 × 재질 순서 나무·돌·철·금·다이아 → `300 + 종류*5 + 재질`), 350~369 음식
(사과 350, 생고기 351, 익힌 고기 352, 빵 353), 370~ 기타(양동이 370, 물 양동이 371, 용암 양동이 372).

**아이템 스택** `{ id, count, dmg }` 또는 `null`. **인벤토리** `{ hot: Array(9), main: Array(27), sel: 0~8 }`.

**엔티티** `{ id, type, pos: [x,y,z], vel: [x,y,z], yaw, pitch, w, h, onGround, inWater, health, age, ai: {상태}, data }`.
타입 레지스트리 `VX.entityTypes[type] = { w, h, health, boxes: [{ size, offset, pivot, color, anim }], ai, drops }`.
드롭 아이템은 `type: 'item'`, `data: {stack}`. 투사체 `type: 'arrow'`.

**저장 형식 v1** (`vx_world_<id>`):
```
{ v: 1, name, seed, time, mode: 'survival'|'creative', difficulty: 'peaceful'|'normal',
  player: { pos: [x,y,z], yaw, pitch, health, inv: { hot: [...], main: [...], sel } },
  edits: { "cx,cz": [idx, id, meta, idx, id, meta, ...] },   // 평면 배열 3개씩
  savedAt: "YYYY-MM-DD HH:mm" }
```
v2(12단계)에서 `tiles: { "x,y,z": {...} }`(상자·화로 내용물)를 추가한다. 엔티티는 저장하지 않는다(재스폰).
월드 목록 `vx_worlds = [{ id, name, seed, createdAt, lastPlayed }]`, 설정 `vx_settings = { renderDist, sens, volume, touchUI: 'auto'|'on'|'off', lowMode }`.

## 6. 모듈 약속 (API)

이 서명대로 만든다. 바꾸면 여기부터 고친다.

- **00-core** — `VX.C` 상수, `VX.store.get/set/remove`, `VX.events.on/off/emit(name, ...args)`,
  `VX.math` (vec3 add/scale/dot/cross/normalize, mat4 perspective/lookAt/multiply/rotateX/rotateY/translate, 열 우선 Float32Array),
  `VX.rng(seed) → () => [0,1)` (mulberry32), `VX.hash(...ints) → uint32`, `VX.isTouch()`.
- **10-blocks** — `VX.B.STONE` 등 id 상수, `VX.blocks[]`, `VX.items[]`, `VX.registerBlock(def)`, `VX.registerItem(def)`,
  `VX.atlas = { canvas, tileUV(t) → [u0,v0,u1,v1], build() }`.
- **20-world** — `new VX.World(seed)`: `getChunk(cx,cz)`, `getBlock(x,y,z)`, `getMeta`, `getLight(x,y,z) → {sky, block}`,
  `setBlock(x,y,z,id,meta=0,opts={silent})` (편집 기록 + 섹션 dirty + 경계 인접 섹션 dirty + 조명 갱신 + `blockChanged` emit),
  `raycast(origin, dir, maxDist) → { x,y,z, face, hit:[x,y,z] } | null` (DDA),
  `isSolid(x,y,z)`, `collides(aabb) → bool`, `tick()`, `loadedKeys()`.
- **21-gen** — `VX.gen.source` (자급자족 함수). 함수는 `{ generateChunk(cx,cz,seed) → {blocks, height}, decorate(cx,cz,seed,get,set) }`를 반환.
  `generateChunk`는 청크 내부만(지형·물·광물), `decorate`는 4방향 이웃이 생성된 뒤 메인 스레드에서 실행(나무·꽃, 경계 넘는 배치 허용).
  같은 시드·좌표면 생성 순서와 무관하게 같은 결과. 워커 프로토콜: `{type:'gen', id, cx, cz, seed}` → `{type:'chunk', id, cx, cz, blocks, height}` (Transferable).
- **22-light** — `VX.light.initChunk(world, chunk)` (하늘빛 컬럼), `VX.light.onBlockChange(world, x,y,z, oldId, newId)`, `VX.light.flush(budgetMs)`.
- **30-mesh** — `VX.mesh.buildSection(world, cx, sy, cz) → { opaque: Float32Array, opaqueCount, trans: Float32Array, transCount } | null`(이웃 미로드).
  정점 v1 = `[x,y,z, u,v, sky, blk, ao]` 8 float, 섹션 로컬 좌표. 18단계에서 정수 패킹으로 교체.
- **31-render** — `VX.renderer.init(canvas) → bool`, `resize()`, `uploadSection(key, data)`, `deleteSection(key)`,
  `draw({ camera: {pos, yaw, pitch}, world, entities, time, highlight })`, `stats()`.
  드로우 순서: 클리어(안개색) → 불투명(프러스텀 컬링, 잎 등은 알파 테스트 `discard`) → 엔티티 → 투명(섹션 거리 내림차순, depth write off) → 하이라이트 와이어.
  셰이더 밝기 `light = max(sky * u_day, blk) * ao`, `color = tex.rgb * (0.05 + 0.95 * light)`, 거리 안개 선형 보간.
- **40-physics** — `VX.physics.step(world, ent, dt)`: 축 분리 이동(x→y→z), 축별 충돌 시 해당 속도 0, `onGround`·`inWater` 갱신. 자동 등반 없음.
- **41-player** — `VX.player` (엔티티 + `mode`, `inv`, `breaking: {x,y,z,progress}`), `update(dt, input)`, `selectSlot(i)`, `useItem()`, `attack()`.
- **42-input** — `VX.input.state = { move: [x,z](−1~1), look: [dx,dy](프레임 누적, 소비 후 0), jump, sneak, sprint, attack(누름 상태), use(엣지), slot(0~8|null), inventory(엣지), escape(엣지) }`.
  데스크톱: WASD·Space·Shift·Ctrl·1~9·E·Esc·F3, 좌클릭 attack, 우클릭 use, 휠 슬롯. 터치: 좌 조이스틱 move, 우 드래그 look, 탭 use, 0.25초 롱프레스 후 홀드 attack, 버튼 점프/숙이기/인벤토리/비행.
  `VX.input.inject(partial, frames) → Promise` (디버그·자동 검증용).
- **50-entities** — `VX.entities.list`, `spawn(type, pos, data) → ent`, `remove(ent)`, `update(dt)`, `tick()`, `registerType(name, def)`, 스폰 규칙 §ROADMAP 14·15.
- **60-ui** — `VX.ui.showScreen(name, data)`, `hide()`, `updateHUD()`, `toast(msg)`, `confirm(msg) → Promise<bool>`. 전부 HTML 오버레이, `pointer*` 이벤트로 마우스·터치 동시 지원. 색은 `:root` 변수.
- **61-sound** — `VX.sound.play(name, { pos, volume })`, 이름: `break place step hurt splash pop click`. `setVolume(v)`, `unlock()`(첫 입력).
- **70-save** — `VX.save.list()`, `create(name, seed) → id`, `load(id) → bool`, `saveNow()`, `remove(id)`, `exportJSON() → string`, `importJSON(text) → id | null`, `settings.get/set`.
  내보내기: `AndroidBridge.saveFile(name, content)` 있으면 그쪽, 없으면 Blob 다운로드. 가져오기: `<input type="file">`. 브리지 메서드는 `saveFile(name, content)`, `copyText(text)` 둘뿐이다(`android-mood-log`와 동일 서명).
- **90-main** — `VX.main.start()`, 루프(rAF, 물리 1/60 누적, 틱 1/20 누적), 청크 스케줄러(거리순 생성 → 이웃 충족 시 decorate → 메싱 큐 예산 소비), `VX.debug`(§7), 오버레이(`?debug=1` 또는 F3).

## 7. `VX.debug` — 검증 API

제가 브라우저 자동화(`javascript_tool`)로 완료 조건을 실측하는 통로다. 항상 존재하고 값은 JSON 직렬화 가능해야 한다.

```
stats()                 → { fps(60프레임 평균), frameMs, p95Ms(300프레임), chunks, sections, visible, drawCalls, triangles,
                            entities, genMs, meshMs, lightMs, pos:[x,y,z], yaw, pitch, time, mode }
getBlock(x,y,z) / getMeta(x,y,z) / getLight(x,y,z) → {sky, block}
setBlock(x,y,z,id,meta)
heightAt(x,z)           → 가장 높은 고체 블록 y
teleport(x,y,z,yaw?,pitch?)
setTime(ticks) / getTime()
seed()
inject(partialInput, frames) → Promise      입력 주입 (42-input 경유)
waitIdle()              → Promise            생성·메싱·조명 큐가 빌 때 resolve
chunkHash(cx,cz)        → uint32             blocks+meta 해시 (결정성 검증)
mode('creative'|'survival') / difficulty('peaceful'|'normal')
spawn(type,x,y,z) → id / give(itemId,count)
screenshot()            → dataURL            debug 모드에서만 preserveDrawingBuffer
```

## 8. 실행·검증 환경

- 정적 서버: 루트 `.claude/launch.json`의 `static-server` → `http://localhost:8765/voxel-world/?debug=1`.
- `file:///C:/Claude/voxel-world/index.html` 도 매 단계 연다. 둘 다 콘솔 에러·경고 0.
- 모바일: 브라우저 기기 에뮬레이션 375×812 + 터치. 성능 조건은 CPU 4배 스로틀 기준(18단계).
- 성능 수치는 전부 `VX.debug.stats()` 값으로 기록한다. "빠르다"가 아니라 숫자.

## 9. 안드로이드 APK (20단계)

`android-voxel-world/` = `android-mood-log/` 복제. 차이: `build.ps1`이 `voxel-world/index.html` + `voxel-world/js/` 전체를 `assets/`로 복사,
가로 고정·전체화면(immersive), 뒤로가기 = 일시정지 메뉴, `Bridge`는 `saveFile`·`copyText`만. `build/ dist/ assets/ debug.keystore`는 커밋하지 않는다.
기록은 WebView localStorage에만 있으므로 앱 삭제 전 JSON 백업 안내 문구 필수.

## 10. git

- 브랜치 `feat/voxel-world`. `main`은 첫 커밋에 머물러 있고 실제 최신은 `feat/mood-log`이므로 거기서 분기한다.
- 커밋 메시지: 코드 `feat(voxel): N단계 — 제목`, 문서만 `docs(voxel): ...`, 수정 `fix(voxel): ...`.
- 단계의 ROADMAP 체크와 HANDOFF 항목은 **코드와 같은 커밋**에 넣는다.
- 커밋·푸시는 사용자가 지시할 때만 한다. "매 세션 끝에 커밋해라"는 지시를 받으면 메모리에 남기고 그 뒤로는 그대로 따른다.
