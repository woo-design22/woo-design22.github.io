# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

`C:\Claude`는 서로 독립적인 단일 파일 브라우저 앱들을 모아 둔 작업 공간이다.

- `game-2048/index.html` — 2048 퍼즐
- `pomodoro-todo/index.html` — 뽀모도로 타이머 + 할 일 목록
- `particle-playground/index.html` — 캔버스 파티클 드로잉 툴
- `mood-log/index.html` — 기분·수면·통증 일지 (본인/배우자 2프로필)
- `fly-brain/index.html` — 초파리에게 먹이 주기 🔊: 설탕·쓴맛·물·간지럼에 뇌(Shiu 2024 전뇌 LIF 모델)가 반응해 먹거나 거부하거나 닦음. 광고 잠금 구조 포함, 웹 게시용
- `namsan-rpg/index.html` — 「남산중 6인방」: 친구들에게 선물하는 모바일 세로 화면 도트 RPG. 여섯 친구를 한 명씩 골라
  각자의 작은 목표를 이루고, 여섯이 다 끝나면 엔딩. 웹 게시용(GitHub Pages 링크로 전달)
- `couple-rpg/index.html` — 「철우와 수지」: 아내에게 선물하는 두 사람의 이야기 도트 RPG (namsan-rpg 엔진 재사용).
  일곱 장면을 순서대로 플레이. 4자리 비밀번호 잠금, 엔딩 특전으로 마음결 CBT 상담 내장. 비공개 링크 운영(랜딩 미게재)
- `voxel-world/` — 복셀 샌드박스 (진행 중, 다중 파일). 규칙·상수·단계는
  `voxel-world/CLAUDE.md`(설계도) → `ROADMAP.md`(단계) → `HANDOFF.md`(일지) 순으로 읽고,
  충돌 시 그쪽 문서가 이 문서보다 우선한다.
- `soccer/` — "반대항축구": 20인 온라인 탑뷰 축구 (진행 중, 다중 파일: `index.html` + 공유 `game-core.js` + 도트 캐릭터 `sprites.js`.
  **Node.js 서버 `soccer/server/` 는 2단계에서 만든다** — 아직 없다. npm 의존성은 `ws` 하나 예정).
  같은 감독 문서 체계(`soccer/CLAUDE.md` → `ROADMAP.md` → `HANDOFF.md`)이고 그쪽 문서가 우선한다.
- `event-price/` — 경조사(결혼·장례·돌잔치) 가격비교 플랫폼 시제품, 가제 "참가격"(소비자원 업무표장이라 공개 전 교체).
  **모바일 앱형**(하단 탭 바, PWA: manifest+sw+icons) `index.html` 하나 + **파이썬 수집기 `build_data.py`**(참가격·e하늘의 화면용 JSON 호출, fly-brain처럼 데이터 블록 주입).
  같은 감독 문서 체계(`event-price/CLAUDE.md` → `ROADMAP.md` → `HANDOFF.md`)이고 그쪽 문서가 우선한다.
  데이터 전략 정본은 `docs/event-price-data-strategy.md`.

각 앱은 폴더 하나에 `index.html` 한 개가 전부다(voxel-world·soccer만 예외). 서로 코드를 공유하지 않으며,
공유 라이브러리·번들러·패키지 매니저·CDN 의존성이 없다(soccer 서버의 `ws`만 예외).

## 실행 및 검증

빌드 단계가 없다. `.claude/launch.json`의 `static-server` 설정
(`python -m http.server 8765`, 워크스페이스 루트 기준)으로 정적 서버를 띄운다.

```bash
python -m http.server 8765
```

- http://localhost:8765/game-2048/
- http://localhost:8765/pomodoro-todo/
- http://localhost:8765/particle-playground/
- http://localhost:8765/mood-log/
- http://localhost:8765/fly-brain/
- http://localhost:8765/namsan-rpg/ (모바일 모드로 볼 것, `?debug=1`이면 `window.NS` 훅)
- http://localhost:8765/couple-rpg/ (모바일 모드, `?debug=1` 훅, 비밀번호는 코드의 `PASSWORD`)
- http://localhost:8765/event-price/
- http://localhost:8765/voxel-world/?debug=1
- http://localhost:8765/soccer/ (연습장. 온라인은 2단계에서 `cd soccer/server && npm start` → http://localhost:8080/)

테스트 스위트, 린터, 타입 체커가 없다. 변경 검증은 브라우저에서 직접 구동해
콘솔 에러 확인 + 조작 테스트로 한다. `file://`로 직접 열어도 동작하도록 작성돼
있으므로(아래 `store` 참고) 그 경로도 깨뜨리지 말 것.

## 모든 앱이 공유하는 규칙

파일 구조가 동일하다. `<head>`에 `<style>`, `</body>` 직전에 즉시실행 함수
(IIFE) 하나로 감싼 `<script>`. 전역 스코프에 아무것도 노출하지 않는다.
새 기능도 별도 파일로 분리하지 말고 같은 파일 안에 유지한다.

- **UI 언어는 한국어**이고 `<html lang="ko">`, 주석도 한국어다.
- 색상은 `:root`의 CSS 커스텀 프로퍼티로 정의하고 하드코딩하지 않는다.
  폰트 스택은 `'Segoe UI', Pretendard, sans-serif`.
- 모든 조작은 **마우스/키보드와 터치 양쪽 경로**를 갖는다. 입력 핸들러를
  추가할 때 한쪽만 구현하면 안 된다.
- 상태 변경 시 **전체 재렌더**가 기본이다(2048은 `.tile` 노드를 전부 제거 후
  재생성, 뽀모도로는 `todoList.innerHTML = ''` 후 재구성). 부분 DOM 갱신 최적화는
  이 코드베이스의 스타일이 아니다.

### `store` 래퍼 (중요)

`game-2048`, `pomodoro-todo`, `mood-log`는 `localStorage`를 직접 부르지 않고 try/catch로
감싼 `store.get` / `store.set`을 쓴다. `file://`이나 쿠키 차단 환경에서
`localStorage` 접근이 예외를 던져도 앱 전체가 멈추지 않게 하려는 의도다.
**새로운 영속 상태도 반드시 `store`를 통해야 한다.**

사용 중인 키: `2048_best`, `pomo_sessions`, `pomo_activeTask`, `pomo_todos`,
`mood_me`, `mood_partner`, `mood_profile`, `namsan_save`, `namsan_bgm`, `cs_*`(couple-rpg 전용 접두사), `vx_*`(voxel-world 전용 접두사), `soc_*`(soccer 전용 접두사).
`file://`에서는 모든 앱이 같은 localStorage 네임스페이스를 쓰므로 접두사가 충돌 방지 수단이다.

## 앱별 구조

### game-2048

- 보드는 4×4 숫자 배열(`grid`). `move(direction)`은 방향별 회전 횟수만큼
  `rotateGridCW`로 그리드를 돌린 뒤 **모든 행을 왼쪽으로 밀고**(`slideRowLeft`)
  다시 돌려놓는다. 즉 이동/병합 로직은 `slideRowLeft` 한 곳에만 존재하므로
  병합 규칙 변경은 그 함수만 고치면 된다.
- 배경 격자(`.cell`)는 CSS grid이고, 실제 타일은 그 위에 `position: absolute`로
  올린다. `getCellRect()`의 `gap = 10, pad = 10` 상수는 CSS의
  `#board { gap: 10px; padding: 10px }`와 **손으로 동기화된 값**이다. 한쪽만
  바꾸면 타일이 어긋난다.
- 보드 크기가 뷰포트 기반(`min(420px, 90vw)`)이라 `resize`에서 `render()`를
  다시 호출해 타일 좌표를 재계산한다.
- `won` 플래그는 2048 달성 오버레이를 한 번만 띄우고 즉시 해제되며, 게임은
  계속 진행된다.

### pomodoro-todo

- `DURATIONS`(focus 25분 / short 5분 / long 15분)가 타이머와 SVG 진행 링을
  동시에 구동한다. 링은 `strokeDasharray = 원주`로 두고 `strokeDashoffset`을
  남은 비율로 조절하는 방식이다.
- `setInterval(tick, 1000)` 기반이라 백그라운드 탭 스로틀링/드리프트에
  취약하다. 정확도가 요구되면 종료 시각 기준으로 다시 설계해야 한다.
- 집중 세션이 끝나면 자동으로 짧은 휴식으로 전환하고, 활성 작업이 지정돼
  있으면 그 할 일의 `pomoCount`를 올린다. 할 일 텍스트 클릭 = 활성 작업 토글.
- 알림은 `Notification` 권한이 있을 때만 쓰고, 없으면 `document.title`을
  3초간 바꾸는 방식으로 폴백한다.

### particle-playground

- 전체 화면 캔버스 하나. 매 프레임 지우지 않고 `rgba(5,5,10,0.18)` 반투명
  사각형을 덮어 그려서 잔상(트레일)을 만든다. 배경색을 바꾸면 이 값도 같이
  바꿔야 잔상이 정상 동작한다.
- 파티클은 단순 객체 배열이며 수명이 다하거나 화면 밖으로 나가면 `splice`로
  제거하고, 4000개 상한을 강제한다.
- 모드(폭죽/트레일/오비트)는 `spawn()`의 **초기 속도 계산에만** 영향을 준다.
  새 모드 추가는 `modes` 배열과 `spawn()`의 분기만 건드리면 된다.
- 이 앱만 영속 상태가 없다(`store` 미사용).

### mood-log

- 프로필은 `PROFILES` 배열에 고정된 두 개(`me`, `partner`)이고, 프로필마다
  `store` 키 하나(`mood_<id>`)에 기록 배열 전체를 JSON으로 저장한다. 마지막 선택
  프로필은 `mood_profile`. 프로필을 바꾸면 `load()`로 배열을 통째로 다시 읽는다.
- 기록은 날짜(`YYYY-MM-DD`)당 한 건이며 같은 날짜 저장은 덮어쓴다. 눈금 값은
  `SCALES`에 정의된 이산값만 허용한다(기분 -3~+3, 수면 3~8, 통증 0~10 짝수,
  에너지 1~5). 눈금을 바꾸면 JSON 가져오기의 `snap()`이 가장 가까운 값으로 맞춘다.
- 날짜 계산은 `Date` 로컬 시간 기준 문자열 비교(`addDays`, `todayStr`)만 쓴다.
  타임존 변환이나 `Date.parse`를 쓰지 말 것 — 자정 경계에서 하루가 밀린다.
- 패턴 힌트(`renderPatterns`)는 최근 28일 창에서 단순 평균 차이와 연속 구간만 본다.
  진단이 아니라는 문구를 항상 마지막에 붙인다. 통계 기법을 더하더라도 이 문구는 유지.
- 인쇄(`@media print`)는 진료실 제출용이다. 입력 폼·탭·도구 버튼을 숨기고 요약·패턴·
  기록만 남긴다. 새 섹션을 추가하면 인쇄에 포함할지 결정해야 한다.
- 주간·월간 통계(`periods`, `renderStats`)는 주를 월요일 시작으로 잡고, 진행 중인
  기간의 분모는 오늘까지의 날 수다. 그래프 기간(14/30/90일)과 통계 단위(주/월)는
  `chartDays`, `statsKind` 메모리 상태일 뿐 `store`에 남기지 않는다.
- **APK 브리지**: `window.AndroidBridge`(`saveFile`, `copyText`, `print`)가 있으면
  내보내기·복사·인쇄를 그쪽으로 보낸다. 없으면 브라우저 경로. 브리지 메서드를 바꾸면
  `android-mood-log/java/.../MainActivity.java`의 `Bridge` 클래스도 같이 바꿔야 한다.

### fly-brain

다른 앱과 달리 **파이썬 파이프라인이 앞에 붙는다**. `index.html`은 단독 실행되지만, 그 안의
`<script id="fly-data" type="application/json">` 블록은 `build_app.py`가 채운다.

- `model/` — Shiu et al. 2024(Nature) 저장소(`philshiu/Drosophila_brain_model`)의 clone.
  FlyWire v630 커넥톰(127,400뉴런, 1,470만 연결 쌍)이 parquet로 들어 있어 별도 계정이 필요 없다.
  `.gitignore`로 제외되므로 없으면 `git clone --depth 1 https://github.com/philshiu/Drosophila_brain_model model`.
- 실행 환경은 conda env `flybrain`(`C:\Users\User\anaconda3\envs\flybrain`, Brian2 2.5.1).
  `model/environment.yml`로 만들고 `pip install "setuptools<70"`을 추가해야 `pkg_resources` 오류가 안 난다.
  C++ 컴파일러가 없어 numpy 백엔드로 돌며 1회(1초 시뮬레이션)에 코어당 약 50초.
- **`run_multi.py --trials 10 --procs 4`** 가 지금 쓰는 파이프라인이다(약 20분). 설탕·쓴맛·물·더듬이(JON)
  네 가지 자극을 각각 전뇌에 넣고, 네 결과의 합집합 부분 회로를 `results/multi_summary.json`으로 낸다
  (1,295뉴런 / 60,079연결 / 1.2MB). 뉴런 ID 목록은 논문 노트북에서 뽑아 `results/neuron_lists.json`에 있다.
  `run_sugar.py`는 설탕 30회 단독 실행용으로 남겨 둔 옛 스크립트다. 같은 이름의 parquet가 있으면
  시뮬레이션은 건너뛰고 분석·내보내기만 다시 한다.
- `build_app.py`(인자 없으면 `results/multi_summary.json`) → `index.html`의 데이터 블록 교체.
  **앱의 수치를 바꾸려면 parquet를 지우고 다시 돌린 뒤 이 스크립트를 다시 실행**한다.
- 전뇌 모델 실측값(자극 200Hz): 설탕 → MN9 왼쪽 93.1 / 오른쪽 63.1Hz, 물 → 33.6 / 13.9Hz,
  **쓴맛 단독 → 0Hz**(주둥이 안 나옴), 더듬이 → aBN1 70.4Hz(닦기 회로). 이 값들이 화면 동작의 근거다.
- 브라우저 LIF(`stepLive`)는 `model.py`의 식·상수를 그대로 옮겼다. 한 가지 비직관적 규칙: Brian2는
  `(unless refractory)`가 붙은 변수에 **불응기 중 시냅스 증분(`g += w`)을 적용하지 않는다.** 이 검사를
  빼면 발화율이 약 30% 높아진다(Brian2와 직접 대조해 확인).
- 화면 구성: 기능 아이콘 8개 / 무대(SVG) / 뇌 회로(canvas) / 조작부 / 통계 / 래스터 / 설명 / 패널들.
  무대는 **탭 판정**(`tapDetector`: 8px·350ms 이내)으로만 먹이를 놓고, `touch-action: pan-y`라 모바일
  스크롤을 막지 않는다. 초파리 좌표계는 원점 = 발 밑 중앙(`GROUND` y=262), 기본 왼쪽 보기, `scale(dir,1)`로
  반전, 혀 끝이 닿는 자리는 `MOUTH_DX`=114. **주둥이 길이는 MN9 발화율/70Hz, 닦기는 aBN1·DN 발화율로만
  정해진다** — "먹느냐/거부하느냐/닦느냐"는 전적으로 뇌 계산 결과다.
- **광고 구조**(구조만, 실제 광고 코드는 미삽입): 아이콘 8개 중 앞 3개(각설탕·쓴맛·간지럽히기)는 무료,
  나머지 5개는 `showRewardedAd()`를 거쳐야 열리고 해제 기록은 `localStorage`의 `fly_unlocks`에 24시간 저장된다.
  `window.adBreak`(H5 Games Ads)가 있으면 그것을 쓰고, 없으면 5초 카운트다운 모달로 대신 동작한다.
  실제 게재는 `<head>`의 주석 블록을 푸는 것으로 시작한다. **AdSense 승인·겸직허가 전까지는 켜지 않는다.**
- 퍼즐 후보는 **MN9로 가는 흥분성 시냅스 수 × 설탕 발화율**(영향력) 상위 6개 + 방해용 6개로 짠다.
  실측: 영향력 상위 2개를 끄면 MN9 19Hz(성공), 3개면 4Hz, 1개면 46Hz(실패), 영향력 낮은 3개면 70Hz(실패).
  퍼즐 실행 중에는 속도를 ×1로 올리고 판정은 **실제 시간** 기준이다(뇌 시간으로 재면 ×0.25에서 24초가 걸린다).
- 소리는 두 모드(`crackle` 챠라락 / `music` 연주)와 끄기. 첫 클릭 뒤에만 울리고(브라우저 정책),
  틱 묶음 28개를 미리 만들어 두고 **프레임당 노드 1개**만 재생한다(뉴런마다 만들면 실제 브라우저에서 렉).
- 영속 상태: `fly_unlocks`, `fly_puzzle_best`. 애니메이션은 `requestAnimationFrame` + IntersectionObserver라
  탭이 숨겨지거나 화면 밖이면 멈춘다(자동화로 검증할 때 프레임을 직접 돌려야 하는 이유).

### namsan-rpg

모바일 세로 화면 전용(가로 11타일 고정, 세로는 남는 높이만큼, 정수 배율). 캔버스에는 맵·사람만 그리고
대화창·HUD·가상 패드·건물 이름표는 DOM이라 한글이 또렷하다. 그림은 전부 코드 안에 있다: 사람은 `SPR`의
16×16 글자 도안 하나를 `pal`(피부·머리·옷·바지·신발·포인트)로 색만 바꿔 여섯 친구·동네 사람·남궁진까지
만들고, 타일은 `buildAtlas`의 `fillRect` 함수, 아이템은 `ICONS`. 외부 파일은 `icons/`(홈 화면 아이콘),
`manifest.webmanifest`, `photos/`(실사 연출용)뿐이다.

- **맵**은 `MAPS`의 문자열 배열. 글자 하나 = `TILES`의 타일 하나, `solid`면 못 지나가고 `over`면 바닥 위에
  겹쳐 그린다(겹침 타일의 바닥은 같은 줄 왼쪽의 가장 가까운 걸을 수 있는 타일, 없으면 맵 `base`).
  줄 길이가 다르면 로드 시 `console.error`. 출구는 `exits`(밟는 칸 → 도착 맵·좌표, 도착 칸은 반드시
  출구가 아닌 칸), `signs`는 `'x,y'` 키의 간판 글, `labels`는 건물 이름표(`exit: true`면 노란색).
  동네는 실제 사진 기준: 삼창슈퍼(차양 골목 모퉁이)·하이틴(연두 건물, 장식)·만화방·학교 언덕 램프(축대+흰 울타리+
  경비실)·은하탕(붉은 벽돌+벽화)·은행·상일이집·피자헛·피씨방.
- **사람 배치**: 맵별 고정 NPC는 `NPCS`, 플레이 중이 아닌 친구는 `HOME` 자리. 퀘스트가 `friendPos`/`npcPos`/
  `hideNpc`로 덮어쓴다(여럿이 피자헛에 모일 땐 공용 `PIZZA_SEATS`). 계산대(`solid && over`) 너머의 사람에게도
  말을 건다.
- **퀘스트**는 `QUESTS[친구id]` 객체 하나: `start`, `init(q)`, `goal(q)`(HUD 한 줄), `hint(q)`(메뉴),
  `intro()`, `ents(mapId)`, `marks()`(느낌표), `npcTalk`/`friendTalk`, `interact(mapId,x,y,tile)`, `onGoal`,
  `onEnter`. 대본은 `await say(이름, 글)` / `await ask(이름, 글, [선택지])`. 끝나면 `finishQuest()`.
  **진행 상태는 전부 `S.q`에 두어야 저장·이어하기가 된다.** 컷신 중 이동 잠금은 `S.lock`(대화 중은 `S.busy`).
  여섯 이야기: 철우(공 찾기→골→은하탕 목격담), 영채(남궁진 소개팅 탈출 — 선택지 4번 중 3번 재치, 실패해도
  다시 말 걸면 재도전), 상일(영채 초상화→집 책상, 보답이 영채 퀘스트의 복선), 현식(스타 3:1 — 공격은 병력 1
  소모, 병력 3이면 「늑대의 포효」로 승리), 민(샐러드 12단 쌓기), 창길(은행 이자 퀴즈→"오늘은 내가 쏜다").
- **공 차기**(철우)는 `tryMove`의 특례: 공 쪽으로 걸으면 한 칸 굴러가고 나도 따라간다. 골망 타일 `n`에
  들어가면 `quest.onGoal`. 구석에 끼면 축구부 1학년이 되돌려 준다.
- **실제 사진 연출**: `photos/`의 `super.jpg`(삼창슈퍼)·`comics.jpg`(만화방 거리)·`hill.jpg`(학교 언덕)·
  `bath.jpg`(은하탕)·`school.jpg`(엔딩용, 없으면 hill로 대체)를 `showPhoto(키, 설명, ms)`가 보여준다.
  시점: 철우=은하탕 입장 3초, 상일·민=완료 직후 3초, 엔딩 닫은 뒤 5초. 파일이 없으면 안내 카드로 대체되어
  앱은 안 죽는다.
- **미니게임**: 샐러드 쌓기 `playStack(단수)` — 캔버스 오버레이 `#mg`, 탭/Z로 얹고 X로 포기, 실패해도
  다시 도전. `?debug=1`이면 `NS.MG.forceWin()`/`NS.MG.dbg()`로 자동화 검증.
- **미니맵** `#mini`: 맵 윤곽(어두움=벽) + 출구 노랑 + 친구 초록 + 나 흰 점멸. 이름표 레이어는 `#labels`.
- **배경음악** `bgm1.mp3`(평화로운 피아노 브금)→`bgm2.mp3`(A hisa – Dreamin’) 2곡 순환: 첫 입력 뒤 재생(자동재생 정책), HUD의 🔊 버튼으로 켜고 끄며
  설정은 `namsan_bgm`에 저장. 탭이 숨겨지면 일시정지.
- 저장은 `store` 키 `namsan_save` 하나(완료한 친구·현재 친구·맵·좌표·`S.q`). 친구를 바꾸면 이전 친구의
  진행은 버린다(퀘스트가 짧아서 의도한 설계). 엔딩은 1명만 완료해도 열리고, 완료한 친구의 대사만 진짜
  이야기로 바뀐다. 크레딧 문구는 스크립트 맨 위 `FINAL_MESSAGE`·`ERA`·`MAKER`.
- 대사 문자열 안 줄바꿈은 반드시 백슬래시 n 이스케이프로 쓴다(진짜 줄바꿈을 넣으면 구문 오류).
  숨은 탭에서는 rAF가 멈추므로 자동화 검증은 `?debug=1`의 `NS.tick(now)`으로 프레임을 돌린다.
  서비스 워커는 일부러 안 넣었다(글을 고친 뒤 옛 캐시가 남는 혼란 방지). 홈 화면 추가는 manifest만으로 된다.

### couple-rpg

namsan-rpg 엔진을 그대로 복제해 만든 두 번째 도트 RPG. 엔진 규칙(`MAPS`/`TILES`/`QUESTS` 계약, `S.q` 저장,
`S.lock` 컷신 잠금, DOM 이름표 `#labels`, 미니맵 `#mini`, `showPhoto`, `?debug=1`의 `NS` 훅)은 namsan-rpg 절과
같고, 다른 점만 적는다.

- **친구 6명 대신 장면(챕터) 7개**: `CHAPTERS`가 순서를 정의하고 `QUESTS.c1~c7`이 대본. 앞 장면을 끝내야
  다음이 열린다(`chapterState`). 장면마다 시점 인물(`hero`)이 다르고, `S.heroSpr`로 예복(cwTux/sjDress) 등
  스프라이트만 덮어쓸 수 있다. 여성 단발 도안은 `SPR_F`(남성 `SPR`에서 얼굴 줄만 교체), 팔레트에
  `female: true`를 주면 그 도안을 쓴다. 상대 배치는 각 장면의 `friendPos`가 정하고 `spr`도 지정 가능.
- **미니게임**: `playDrone(링 수)`(탭=상승 플래피형), `playRhythm(라벨, 시도, 필요성공)`(금색 구간 타이밍 —
  색소폰·축가 겸용), 나머지(달래기·저녁 메뉴·집값 1년)는 `ask()` 선택지 루프다. `NS.MG.forceWin()`으로 검증.
- **비밀번호 잠금**: 시작 시 4자리 키패드(`PASSWORD` 상수, 기본 0316). 통과하면 `cs_unlock` 저장.
  키패드는 `buildPad` 공용(상담 비밀번호도 같은 것).
- **사진**: `photos/`에 `wedding`(결혼식 장면)·`card`(엔딩) 슬롯. 공개 저장소에 원본이 그대로 올라가지 않게
  `photos/encode_photo.py`로 XOR(.bin)을 만들면 `showPhoto`가 먼저 그것을 찾고, 없으면 jpg → 안내 카드 순.
- **마음결 CBT 상담(엔딩 특전)**: counsel-chat(마음톡)과 같은 Deno 프록시로 `{ mode: 'cbt', messages }`를
  보내고 SSE를 스트리밍한다(`CARE_PROXY`). 프로필은 수지/철우 둘뿐, 각자 4자리 비밀번호(SHA-256 해시를
  `cs_pw_*`에 저장, 분실 시 localStorage에서 지우는 수밖에 없음), 대화는 `cs_chat_*`에 저장하고 최근 40개를
  같이 보내 이어진다. 위기 단어면 109 핫라인 카드를 끼운다. 텍스트 입력 중에는 게임 키를 먹지 않게
  keydown 최상단에서 TEXTAREA/INPUT을 건너뛴다.
- 배포는 비공개 링크: 랜딩 페이지·README에 올리지 않는다.

### android-mood-log (APK 셸)

`mood-log/index.html`을 WebView로 감싼 안드로이드 앱. Gradle 없이
`build.ps1`(aapt2 → javac → d8 → zipalign → apksigner)로 빌드하며, 실행 시
`mood-log/index.html`을 `assets/`로 복사하므로 **웹과 APK의 원본은 항상 같은 파일**이다.
네트워크 권한이 없고, JSON 저장/불러오기는 시스템 문서 선택기(SAF)로 처리한다.
기록은 WebView의 localStorage에 남으므로 앱을 지우면 기록도 사라진다(JSON 백업 안내 필수).
`build/`, `dist/`, `assets/`, `debug.keystore`는 커밋하지 않는다(폴더 안 `.gitignore`).

### voxel-world (다중 파일, 감독 문서 체계)

이 저장소의 공유 규칙 중 "단일 파일", "전역 노출 금지"(→ `window.VX` 하나만 허용),
"전체 재렌더"는 이 앱에 적용하지 않는다. 나머지(한국어, `:root` 변수, 양쪽 입력 경로, `store`,
`file://` 동작)는 그대로다. 세션을 시작하면 `voxel-world/CLAUDE.md` §0의 의식대로
`HANDOFF.md` 맨 위 항목과 `ROADMAP.md`의 "현재 단계"를 먼저 읽는다. 한 세션에 한 단계,
완료 조건은 실측값으로만 체크하며, 조건을 낮춰서 통과시키지 않는다.

### soccer (다중 파일 + Node.js 서버, 감독 문서 체계)

voxel-world와 같은 체계·같은 규칙이다(키보드 + 터치 양쪽 경로 포함 — PC와 모바일 브라우저가 같은 페이지를 쓴다).
전역은 `SoccerCore` 하나, 서버(`soccer/server/`)는 Node.js + `ws`를 쓴다. 경기 시뮬레이션은
`soccer/game-core.js` 한 파일을 브라우저와 서버가 공유하므로 **물리를 한쪽에만 고치면 안 된다**
(같은 파일이라 자동으로 일치하지만, `game-core.js` 밖에 물리 계산을 두는 순간 어긋난다).
`node_modules/`, `deploy.local.json`, `*.pem`은 커밋하지 않는다.
