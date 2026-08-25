# 도트 RPG 공통 틀

`namsan-rpg` · `couple-rpg` · `europe-rpg` 세 게임은 같은 엔진 위에 서 있다.
이 문서는 그 엔진이 실제로 무엇인지 **실측으로 확인해** 적어 둔 것이다.
새 도트 RPG를 만들 때는 `CLAUDE.md` → 이 문서 → (해당 게임 폴더) 순으로 읽는다.

## 1. 실측 — 무엇이 공통인가 (2026-08-25)

|                | namsan-rpg | couple-rpg | europe-rpg |
| -------------- | ---------- | ---------- | ---------- |
| `index.html`   | 110KB / 1,869줄 | 132KB / 2,317줄 | 139KB / 2,525줄 |
| 함수            | 59 | 92 | 87 |
| 최상위 `const`   | 41 | 54 | 50 |
| DOM `id`        | 46 | 74 | 57 |

- **세 게임 공통: 함수 56개 · 최상위 상수 40개 · DOM id 46개.**
- **namsan-rpg 고유 DOM id는 0개** — namsan-rpg의 HTML 골격이 곧 이 틀이다.
  couple-rpg가 더한 28개는 전부 상담 패널(`care*`), europe-rpg가 더한 3개는 복구 코드 입력란(`restore*`)이다.
- 엔진부(`// ===== 엔진` ~ `// ===== 대사`) 줄 단위 동일도:
  namsan↔couple **84%**, namsan↔europe **83%**, couple↔europe **89%**.
- 게임마다 새로 쓰는 함수는 3~16개뿐:
  namsan 3개(`pickFriend` `playStack` `bgmFirst`),
  couple 16개(상담 `care*` 13 + `playPuzzle` `drawLeaflet` 등),
  europe 11개(하늘 `drawSky` `drawRain` `drawTower` + 미니게임 5 + `fam` `mgGhost` `restoreAll`).

> 결론: 새 게임 = **엔진 복제 + 데이터(타일·맵·도안·대본) 교체 + 고유 미니게임 몇 개**.
> 엔진을 다시 쓰지 않는다. 가장 가까운 게임을 복사해 데이터만 갈아 끼운다.

## 2. 파일 골격 (섹션 순서는 고정)

`<head>`의 `<style>` 하나, `</body>` 직전 IIFE `<script>` 하나. 전역 노출은 `?debug=1`일 때의 `window.NS`뿐.

```
1  store            영속 저장 래퍼 (localStorage 예외 삼킴)
2  선물하는 사람이 바꾸기 쉬운 것들   FINAL_MESSAGE / ERA / MAKER / PASSWORD
3  상수             T=16, VIEW_W=11, WALK_MS, DIRS, SAVE_KEY
4  등장인물          FRIENDS[] + 팔레트
5  캐릭터 픽셀 도안   SPR (16×16 글자 도안) → buildFrames → SPRITES
6  타일             TILES + buildAtlas → ATLAS
7  맵               MAPS (문자열 배열) → baseRows 캐시
8  ===== 엔진 =====  fit / 입력 / 대화창 / ICONS / 이동 / 상호작용 / 그리기 /
                    이름표 / 미니맵 / showPhoto / 미니게임 오버레이 / HUD·저장·화면
9  ===== 대사 =====  FRIEND_LINES / NPC_LINES / GENERIC_LOOK
10 ===== 대본 =====  QUESTS
11 ===== 엔딩 =====  playEnding + 크레딧
12 배경음악 · 효과음
13 (선택) 보상함 · 상담 · 복구 코드
```

## 3. 엔진 계약

### 3.1 `store` — 새 영속 상태는 반드시 이걸 통한다
```js
store.get(k, d) / store.set(k, v) / store.del(k)   // 전부 try/catch
```
`file://`에서는 모든 앱이 같은 네임스페이스를 쓰므로 **게임마다 키 접두사**를 갖는다
(`namsan_*`, `cs_*`, `eu_*`). `SAVE_KEY`는 그중 하나(`<접두사>save`)다.

### 3.2 `S` — 상태 한 덩어리
```js
const S = {
  screen, ch, hero, map, px, py, dir, ending, care,
  moving, step, ents, q, done, busy, lock, onExit, time
};
```
- `S.q` = **지금 장면의 진행 상태 전부.** 저장·이어하기가 `S.q` 하나만 직렬화하므로,
  퀘스트가 기억해야 하는 것은 지역 변수가 아니라 반드시 `S.q`에 넣는다.
- `S.busy` = 대화 중, `S.lock` = 컷신 이동 잠금. 둘은 다르다.
- 게임 고유 상태를 더할 때도 여기에 필드를 하나 붙인다 (예: europe-rpg의 `weather`).

### 3.3 `TILES` / `MAPS`
```js
TILES = { '문자': { name, solid?, over?, ... } }
MAPS.<id> = { name, base:'문자', rows:['...'], exits:[], signs:{'x,y':'글'}, labels:[{x,y,t,exit?}] }
```
- `rows`의 글자 하나 = 타일 하나. **줄 길이가 다르면 로드 시 `console.error`.**
- `solid` 못 지나감 / `over` 바닥 위에 겹쳐 그림.
- `over` 타일의 바닥은 `baseRows`가 정한다: 같은 줄에서 **왼쪽으로 가장 가까운 걸을 수 있는 타일**,
  없으면 맵 `base`. 그래서 겹침 타일을 줄 맨 왼쪽에 두면 엉뚱한 바닥이 깔린다.
- `exits`의 도착 칸은 반드시 출구가 아닌 칸으로 잡는다(무한 왕복 방지).

### 3.4 `SPR` — 사람은 도안 하나, 색만 바꾼다
16×16 글자 도안(`.` 투명, `k` 외곽선, `e` 눈, 나머지는 팔레트 글자)에
`pal = { s:살, h:머리, t:상의, p:하의, b:신발, a:포인트 }`를 입혀 모든 인물을 만든다.
여성 도안이 필요하면 얼굴 줄만 교체한 `SPR_F` + `pal.female = true`(couple-rpg 방식).

### 3.5 `QUESTS` — 장면 하나 = 객체 하나 (훅 16개)
```
start(map,x,y,dir)  init(q)  intro()  goal(q)  hint(q)
marks()  onEnter(mapId)  onStep()  onGoal()  interact(mapId,x,y,tile)
ents(mapId)  friendPos/familyPos  npcPos  hideNpc  friendTalk/familyTalk  npcTalk
```
대본은 `await say(이름, 글)` / `await ask(이름, 글, [선택지])`, 끝은 `await finishQuest()`.
**대사 문자열 안 줄바꿈은 반드시 `\n` 이스케이프로 쓴다** — 진짜 줄바꿈은 구문 오류다.

### 3.6 DOM 46개 id (전부 있어야 엔진이 돈다)
```
app stage cv labels mini hud hudName hudGoal toast fade
dlg dlgName dlgText dlgMore choices
pad dpad btns btnA btnB btnMenu btnBgm
scrTitle titleCv titleHint btnNew btnContinue
scrSelect roster btnEnding btnSwitch
scrMenu menuList goalBox btnResume btnRestartQuest btnToTitle
scrEnd credits btnEndClose
photo photoImg photoCap   mg mgCv mgInfo
```

### 3.7 화면 흐름
`lock`(비밀번호, 선택) → `title` → `select`(로스터) → `game` ↔ `menu` → `end`
`showScreen(name)`이 유일한 전환 경로이고, 전환할 때마다 입력 상태를 비운다.

## 4. 새 게임 만드는 절차

1. 가장 가까운 게임 폴더를 통째로 복사한다.
   - 장면이 순서대로 열리는 이야기 → `couple-rpg` (챕터형)
   - 여러 인물 중 골라 플레이 → `namsan-rpg` (선택형)
   - 미니게임이 장면마다 다른 여행기 → `europe-rpg`
2. `SAVE_KEY`와 `store` 키 접두사를 새로 정한다. **기존 접두사와 겹치면 저장이 섞인다.**
3. §2의 2~7번 블록(인물·도안·타일·맵)만 갈아 끼운다. 8번(엔진)은 건드리지 않는다.
4. `QUESTS`를 쓴다. 진행 상태는 전부 `S.q`.
5. 고유 미니게임을 `#mg` 오버레이 규약(`MG.tap` / `MG.dir` / `MG.cancel` / `MG.forceWin` / `MG.dbg`)에 맞춰 만든다.
6. `manifest.webmanifest` · `icons/` · `bgm1/2.mp3`를 옮기고 이름만 고친다.
7. 사진을 쓰면 `photos/encode_photo.py`로 XOR `.bin`을 만든다(공개 저장소에 원본이 그대로 올라가지 않게).
8. `CLAUDE.md`의 앱 목록과 실행 URL 목록에 새 게임을 **추가한다**.
9. **대사집을 뽑아 게임과 함께 전달한다** — `python tools/extract_script.py <폴더>`.
   게임을 고칠 때마다 다시 돌린다. 손님에게 링크만 주고 대사집을 빼먹지 않는다.

## 5. 검증 방법

```bash
python -m http.server 8765
```

- `?debug=1` → `window.NS = { S, MAPS, tick, goMap, say, startHero, finishQuest, findEnt, MG, showPhoto }`
- **숨은 탭에서는 `requestAnimationFrame`이 멈춘다.** 자동화로 볼 때는 `NS.tick(performance.now())`로 프레임을 직접 돌린다.
- 미니게임은 `NS.MG.forceWin()` / `NS.MG.dbg()`로 통과시켜 뒤쪽 장면까지 확인한다.
- **맵마다 목표 칸까지 실제로 걸어갈 수 있는지** 너비우선탐색으로 한 번 훑는다.
  좌표를 직접 바꾸면(`S.px = ...`) `onStep`이 걸리지 않는다. 이동 검증은 방향키를 실제로 눌러서 한다.
- **`confirm()`은 자동화에서 멈춘다.** 「처음부터」는 저장이 있으면 `confirm`을 띄우므로,
  누르기 전에 `localStorage`의 `SAVE_KEY`를 지운다.
- 화면을 그림으로 확인할 때는 **캔버스 바이트를 파일로 직접 받는다**(§6 마지막 항목).

## 6. 되풀이해서 밟은 지뢰

| 증상 | 원인 | 대응 |
| --- | --- | --- |
| 구문 오류 | 대사 문자열에 진짜 줄바꿈 | `\n` 이스케이프 |
| 맵이 어긋남 | `rows` 줄 길이 불일치 | 로드 시 `console.error` 확인 |
| 겹침 타일 밑에 엉뚱한 바닥 | `baseRows`가 왼쪽에서 찾음 | 겹침 타일 왼쪽에 걸을 수 있는 타일을 둔다 |
| 이어하기가 진행을 잃음 | 진행 상태를 지역 변수에 둠 | 전부 `S.q` |
| 컷신 중 걸어다님 | `S.busy`만 세움 | 이동 잠금은 `S.lock` |
| 인물이 안 나타남 | 맵 진입 시에만 `buildEnts` | 그 자리에서 다시 만든다 |
| 간판이 미니게임을 가로챔 | 상호작용 우선순위 | 간판을 옆 칸으로 옮긴다 |
| **타일 그림이 이웃과 안 이어짐** | 타일 조각으로 큰 구조물(에펠탑)을 그림 | 큰 구조물은 타일이 아니라 **월드 좌표에 한 덩어리로** 그린다 |
| 배경이 검게 나옴 | 하늘 자리에 `X`(공간밖, `#0e0d1a`) | 하늘 타일(`~`, 그림 없음) + 배경을 하늘색으로 칠한다 |
| **옮긴 PNG가 열리지 않음** | 긴 base64를 사람이 옮기다 글자 유실 | 브라우저가 만든 바이트를 **손을 거치지 않고** 파일로 받는다 |
| **문을 A로 눌러야 나감** | 맵 이동을 `interact`로 붙임 | 이동은 밟으면 되는 것 — `exits` 또는 `onStep` |
| 가구 뒤 물건에 못 다가감 | 조작 대상 바로 앞칸이 solid(의자 등) | 대상 앞 한 칸은 반드시 비워 둔다 |
| 길을 헤맴 | 맵 가운데를 벽으로 가름 | 목표까지 막힘 없이 걸어갈 수 있게 (BFS 검사) |
| 차도를 걸어 다님 | 장식용 도로 타일이 walkable | 배경으로만 쓸 타일은 `solid: true` |
| 간판이 퀘스트를 가로챔 | `signs` 가 `quest.interact` 보다 먼저 처리된다 | 조작할 칸에는 간판을 두지 않는다 |

마지막 항목 보충 — 캔버스를 파일로 받는 법:
로컬에 POST를 받아 저장하는 작은 서버를 띄우고, 페이지에서 `canvas.toBlob` → `fetch(POST)`로 보낸다.
base64를 대화에 실어 옮기면 수천 글자 중 일부가 빠져 PNG의 IDAT CRC가 깨지고,
관대한 디코더(PIL)는 열지만 엄격한 디코더는 "처리할 수 없는 이미지"로 거절한다.
