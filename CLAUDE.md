# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

`C:\Claude`는 서로 독립적인 단일 파일 브라우저 앱들을 모아 둔 작업 공간이다.

- `game-2048/index.html` — 2048 퍼즐
- `pomodoro-todo/index.html` — 뽀모도로 타이머 + 할 일 목록
- `particle-playground/index.html` — 캔버스 파티클 드로잉 툴
- `mood-log/index.html` — 기분·수면·통증 일지 (본인/배우자 2프로필)
- `fly-brain/index.html` — 초파리에게 먹이 주기 🔊: 설탕·쓴맛·물·간지럼에 뇌(Shiu 2024 전뇌 LIF 모델)가 반응해 먹거나 거부하거나 닦음. 광고 잠금 구조 포함, 웹 게시용
- `counsel-chat/index.html` — 「마음톡」: AI 상담 대화. 분야 8개(마음 털어놓기·CBT·부부연인·불안공황·
  우울무기력·직장번아웃·자존감·가족부모). `counsel-proxy`로 호출, 위기 단어면 핫라인 카드
- `counsel-proxy/` — 마음톡·마음결·구급대원이 **함께 쓰는 Deno/Cloudflare 프록시**.
  API 키를 브라우저에 노출하지 않으려는 것. 웹 말고 **텔레그램·카카오톡 채널**도 여기로 붙는다
- `emergency-chat/index.html` — 「지금바로 구급대원」: 지금 응급인지 물어보는 문진. 프록시의 `/triage`
- `sand-mix/index.html` — 「샌드믹스」: 모래 색섞기 퍼즐 (테트리스 + 모래 물리 + 색 혼합)
- `shade-map/index.html` — 「그늘 지도」: 지금 어디가 그늘인가. 태양 위치 계산 + OSM 건물 높이로
  그림자를 그리고, 그늘을 따라가는 길찾기까지. 이 저장소에서 가장 큰 단일 앱(2,651줄)
- `namsan-rpg/index.html` — 「남산중 6인방」: 친구들에게 선물하는 모바일 세로 화면 도트 RPG. 여섯 친구를 한 명씩 골라
  각자의 작은 목표를 이루고, 여섯이 다 끝나면 엔딩. 웹 게시용(GitHub Pages 링크로 전달)
- `couple-rpg/index.html` — 「철우와 수지」: 아내에게 선물하는 두 사람의 이야기 도트 RPG (namsan-rpg 엔진 재사용).
  일곱 장면을 순서대로 플레이. 4자리 비밀번호 잠금, 엔딩 특전으로 마음결 CBT 상담 내장. 비공개 링크 운영(랜딩 미게재)
- `europe-rpg/index.html` — 「우리가족 유럽여행」: 부모님·동생과 다녀온 여행을 일곱 장면으로 만든 세 번째 도트 RPG.
  장면마다 아주 쉬운 미니게임(탭 하나)과 실제 사진 한 장. 4자리 잠금(코드의 `PASSWORD`), 복구 코드, 보상함(추억 사진).
  웹 게시용 — https://woo-design22.github.io/europe-rpg/ (대문 미게재)
- `iso-faces/index.html` — 「격리실의 얼굴들」: 머리만 남은 사람이 몸을 얻었다 빼앗기는 SF 단편을
  **1인칭 3D RPG**로 옮긴 것. 원작 전문을 받아 아홉 장(章)으로 쪼개고 장마다 퀘스트 하나 + 미니게임을 붙였다.
  **three.js 없이 WebGL2를 직접 부른다**(집 규칙의 CDN·ESM 금지를 그대로 지키려고). 웹 게시 가능.
- `lucky-day/index.html` — 「운수 좋은 날」 첫 문단 3D. 현진건(1924, **공유저작물**)의 **첫 문단 하나만**
  입력으로 세운 79초짜리 절차적 장면. 눈→비, 동소문, 인력거와 김 첨지, 전차, 동광학교, 삯.
  자막은 전부 원문 그대로. iso-faces와 같이 **WebGL2 직접 호출**. 게임이 아니라 보는 것(재생·되감기만).
- `love-rpg/index.html` — 「봄날, 두 사람」: **판매용 데모** (couple-rpg 재스킨, 가상 커플 민준·서연 5장면).
  체험판 비밀번호 0000(잠금 화면에 표시), 상담 기능 제거, 사진 폴백 카드가 광고 문구, 선택·엔딩 화면에
  「나의 이야기로 만들기」 주문 패널(`ORDER_URL` 상수가 비면 "준비 중" 토스트). 저장 접두사 `lv_*`.
  주문 정보 포맷은 `docs/order-schema.md`, 주문 접수 카카오봇은 `counsel-proxy/order-bot.js`(별도 Deno 프로젝트,
  Haiku + 일일 상한, 완성 주문 JSON은 텔레그램으로 전달). 판매 기획 정본은 `docs/custom-game-business.md`(비공개).
- `retire-rpg/index.html` — 「아버지의 정복」: **판매용 데모 2호** (europe-rpg 재스킨, 경찰관의 정년퇴임 7장).
  연애물과 구조를 일부러 다르게 잡았다 — **장면 = 장소가 아니라 연도**(1988→2026)이고, 같은 파출소 한 곳이
  `setEra(연도)`로 벽·바닥·집기까지 다시 칠해져 시대가 바뀐다(무전기→브라운관→LCD, 누런 장판→흰 타일).
  6장까지는 아버지, **7장에서 딸로 시점이 바뀌고** 보상함이 사진첩이 아니라 **아버지 사물함**이다.
  체험 비밀번호 0000, 저장 접두사 `rt_*`. 빌드 스크립트 `retire-rpg/build_retire.py`.
- `goth-rpg/index.html` — 「고트전설」: **판매용 데모 3호** (europe-rpg 재스킨, 고전 판타지 7장).
  왕자의 망명과 귀환이라는 보편 뼈대만 쓰고 **왕국·인물·지명은 전부 새로 지었다**
  (특정 상용 작품의 설정을 옮기지 않는다 — 공개 데모라 반드시 지킬 것).
  주인공이 소년→청년→왕으로 자라며 `S.heroSpr`가 바뀌고, 1장과 7장이 같은 왕좌의 방이다.
  성·폐허·숲·마을·고개·성문 타일을 새로 그렸다. 체험 비밀번호 0000, 저장 접두사 `gt_*`.
  빌드 스크립트 `goth-rpg/build_goth.py`.
- **여섯 도트 RPG(`namsan-rpg`·`couple-rpg`·`europe-rpg`·`love-rpg`·`retire-rpg`·`goth-rpg`)는 같은 엔진을 공유한다.**
  공통 틀의 정본은 `docs/dot-rpg-engine.md`. **게임을 만들거나 고치면 대사집을 반드시 함께 낸다** —
  `python tools/extract_script.py <폴더>` 가 `<폴더>/대사집.txt` 를 만든다(다섯 게임 공용).
  공통 틀의 정본은 `docs/dot-rpg-engine.md` — 새 도트 RPG를 만들기 전에 반드시 먼저 읽는다.
- `voxel-world/` — 복셀 샌드박스 (진행 중, 다중 파일). 규칙·상수·단계는
  `voxel-world/CLAUDE.md`(설계도) → `ROADMAP.md`(단계) → `HANDOFF.md`(일지) 순으로 읽고,
  충돌 시 그쪽 문서가 이 문서보다 우선한다.
- `soccer/` — "반대항축구": 20인 온라인 탑뷰 축구 (진행 중, 다중 파일: `index.html` + 공유 `game-core.js` + 도트 캐릭터 `sprites.js`.
  **Node.js 서버 `soccer/server/`** — `server.js`(정적 + WebSocket 경기 서버) · `loadtest.js`(사람 없이 흐름 재현) · npm 의존성은 `ws` 하나.
  혼자 하기는 서버 없이 되고(`file://` 포함), 여러 명이서 하기는 `cd soccer/server && npm start` → http://localhost:8080/).
  같은 감독 문서 체계(`soccer/CLAUDE.md` → `ROADMAP.md` → `HANDOFF.md`)이고 그쪽 문서가 우선한다.
- `poster-editable/` — 공익 포스터를 미리캔버스에서 요소별로 움직일 수 있게 재구성한 것.
  웹앱이 아니라 **파이썬 빌드 도구**(`src/build_all.py` → `out/*.pdf|pptx`)
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
- http://localhost:8765/counsel-chat/ (프록시가 살아 있어야 대화가 된다)
- http://localhost:8765/emergency-chat/
- http://localhost:8765/sand-mix/
- http://localhost:8765/shade-map/ (외부 무료 서버를 여러 개 부른다 — 느리거나 막힐 수 있다)
- http://localhost:8765/namsan-rpg/ (모바일 모드로 볼 것, `?debug=1`이면 `window.NS` 훅)
- http://localhost:8765/couple-rpg/ (모바일 모드, `?debug=1` 훅, 비밀번호는 코드의 `PASSWORD`)
- http://localhost:8765/europe-rpg/ (모바일 모드, `?debug=1` 훅, 비밀번호는 코드의 `PASSWORD`)
- http://localhost:8765/love-rpg/ (판매 데모, 비밀번호 0000, `?debug=1` 훅)
- http://localhost:8765/retire-rpg/ (판매 데모, 비밀번호 0000, `?debug=1`이면 `NS.setEra`·`NS.eraYear`)
- http://localhost:8765/goth-rpg/ (판매 데모, 비밀번호 0000, `?debug=1` 훅)
- http://localhost:8765/iso-faces/ (`?debug=1`이면 `window.BD` 훅)
- http://localhost:8765/lucky-day/ (`?debug=1`이면 `window.LD` 훅)
- http://localhost:8765/event-price/
- http://localhost:8765/voxel-world/?debug=1
- http://localhost:8765/soccer/ (혼자 하기 = 인공지능과 2:2. 온라인은 2단계에서 `cd soccer/server && npm start` → http://localhost:8080/)

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
`mood_me`, `mood_partner`, `mood_profile`, `counsel_*`(마음톡), `emg_*`(구급대원), `sandmix_*`, `shade_*`, `fly_*`(fly-brain), `namsan_save`, `namsan_bgm`, `cs_*`(couple-rpg 전용 접두사), `eu_*`(europe-rpg 전용 접두사), `lv_*`(love-rpg 전용 접두사), `rt_*`(retire-rpg 전용 접두사), `gt_*`(goth-rpg 전용 접두사), `luck_bgm`(lucky-day 소리 켜짐), `vx_*`(voxel-world 전용 접두사), `soc_*`(soccer 전용 접두사).
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
  실제 게재는 `<head>`의 주석 블록을 푸는 것으로 시작한다. **승인 전까지는 켜지 않는다.**
- 퍼즐 후보는 **MN9로 가는 흥분성 시냅스 수 × 설탕 발화율**(영향력) 상위 6개 + 방해용 6개로 짠다.
  실측: 영향력 상위 2개를 끄면 MN9 19Hz(성공), 3개면 4Hz, 1개면 46Hz(실패), 영향력 낮은 3개면 70Hz(실패).
  퍼즐 실행 중에는 속도를 ×1로 올리고 판정은 **실제 시간** 기준이다(뇌 시간으로 재면 ×0.25에서 24초가 걸린다).
- 소리는 두 모드(`crackle` 챠라락 / `music` 연주)와 끄기. 첫 클릭 뒤에만 울리고(브라우저 정책),
  틱 묶음 28개를 미리 만들어 두고 **프레임당 노드 1개**만 재생한다(뉴런마다 만들면 실제 브라우저에서 렉).
- 영속 상태: `fly_unlocks`, `fly_puzzle_best`. 애니메이션은 `requestAnimationFrame` + IntersectionObserver라
  탭이 숨겨지거나 화면 밖이면 멈춘다(자동화로 검증할 때 프레임을 직접 돌려야 하는 이유).

### counsel-chat (마음톡) · counsel-proxy · emergency-chat

셋이 한 덩어리다. **API 키는 절대 브라우저에 두지 않는다** — 앱은 프록시만 부르고, 키는 프록시(서버) 환경변수에만 있다.

**프록시 (`counsel-proxy/`) — 이 시스템의 심장.** 같은 코드가 두 판 있다:
`worker.js`(Cloudflare, 428줄) / `deno-proxy.js`(Deno Deploy, 958줄 — **운영 중인 것**).
Deno로 옮긴 이유가 파일 머리에 적혀 있다: **Anthropic이 Cloudflare Worker에서 나가는 요청을
403으로 차단**해서다(같은 키가 다른 경로에선 통과). 운영 주소는
`https://stormy-cuttlefish-2376.woo-design22.deno.net`.

- **설계 원칙 1 — 대화를 절대 저장·기록하지 않는다.** 상담 내용은 민감정보라 흘려보내기만 한다.
  텔레그램·카카오의 대화 기억도 메모리(Map)에만 있어 재시작하면 사라진다.
  **`console.log`로 요청 본문을 찍는 순간 이 설계가 무너진다** — 디버깅할 때도 찍지 말 것.
- **설계 원칙 2 — 크레딧 방어선은 여러 겹.** Origin 검사(`ALLOWED_ORIGINS`) → IP 레이트리밋(60초 8회,
  메모리라 근사치) → 입력 상한(메시지 2,000자 / 히스토리 24개 / 총 24,000자) → `max_tokens` 8,000 →
  **모델 서버 고정**(`claude-opus-5`, `effort: high`, `thinking: adaptive` — 클라이언트가 못 바꾼다).
  최후의 방어선은 코드가 아니라 **Anthropic 콘솔의 지출 상한**이다(README §0, 반드시 먼저 걸 것).
- **Claude API 호출**(`askAnthropic`): SSE 스트리밍으로 받아 모으고, `BASE_PROMPT`에
  `cache_control: ephemeral`(프롬프트 캐싱), `fallbacks: 'default'` + beta 헤더를 쓰되
  400이 나면 그 둘을 빼고 1회 재시도. `stop_reason: 'refusal'`은 별도 처리해 사용자에게 완곡하게 알린다.
- **라우트**: (기본 POST) 웹 상담 · `/triage` 구급대원 · `/telegram` 텔레그램 봇 · `/kakao` 카카오 챗봇.

**상담 프롬프트 구조**: 공통 `BASE_PROMPT`(상담 원칙·하지 않는 것·위기 대응 — 자살예방 109,
위기상담 1577-0199를 답변 안에서 즉시 알린다) + 분야별 `MODES` 프롬프트를 겹쳐 보낸다.
분야 목록은 **판마다 다른 게 정상**이다:
웹 마음톡 8개(listen·cbt·couple·anxiety·depress·work·self·family),
프록시 9개(+dbt), 텔레그램·카카오는 잡담(chat)+9개+응급(triage)=11개.
counsel-chat 안에 "worker.js의 MODES와 같이 고칠 것" 주석이 있다 — 분야를 추가하면 양쪽을 같이 본다.

**텔레그램 봇 (`/telegram`)**: 웹훅 방식. `TELEGRAM_TOKEN` + `TELEGRAM_SECRET`(위조 차단 헤더 검사) +
`TELEGRAM_ALLOWED_IDS` 화이트리스트 — **미등록 사용자에게는 존재조차 알리지 않는다**(조용히 200).
화이트리스트가 비어 있으면 최초 1회 본인 ID를 알려준다(등록용). 문제가 있어도 200을 돌려준다
(텔레그램의 재시도 폭주 방지). 스트리밍 없이 완성문을 3,500자씩 잘라 보낸다. 기억은 최근 20개.

**카카오톡 챗봇 (`/kakao`)**: 카카오 비즈니스 채널의 스킬 서버로 등록돼 있다. 핵심 제약:
**카카오는 5초 안에 응답해야 하는데 AI는 4~11초 걸린다.** 그래서 콜백 방식이다 —
① 즉시 `useCallback: true` + "생각하고 있어요..."를 돌려주고(5초 안), ② 답이 완성되면 카카오가 준
`callbackUrl`(5분 유효·1회용)로 따로 POST 한다. 콜백 실패는 조용히 넘어간다(재시도 무의미).
응답은 `{version:'2.0', template:{outputs:[{simpleText}]}}` 포맷, 말풍선 1,000자 상한이라 최대 3개로 나눈다.
카카오엔 명령 UI가 없어 **발화 자체를 명령으로 해석한다**: "도움"/"새로"/모드id("cbt" 등).
`KAKAO_ALLOWED_USERS`(botUserKey) 화이트리스트 — 비어 있으면 최초 1회 본인 키를 알려주고,
등록 후 `KAKAO_HIDE_KEY=1`이면 그 안내를 끈다. 기억은 최근 20개.

**환경변수 전체** (Deno Deploy Settings): `ANTHROPIC_API_KEY`(필수) · `ALLOWED_ORIGINS` ·
`TELEGRAM_TOKEN` · `TELEGRAM_SECRET` · `TELEGRAM_ALLOWED_IDS` · `KAKAO_ALLOWED_USERS` · `KAKAO_HIDE_KEY`.

**웹 앱 쪽**:
- `counsel-chat`: `PROXY_URL`이 채워져 있으면 프록시 모드(방문자는 키 없이 씀), 비우면 방문자가
  자기 키를 넣는 직통 모드(`counsel_key`). 위기 단어(`CRISIS_WORDS`)가 보이면 `HOTLINES` 카드를
  대화에 끼운다 — couple-rpg 마음결도 같은 프록시·같은 방식. 이 장치를 빼지 말 것.
- `emergency-chat`(지금바로 구급대원): `/triage`를 쓴다. 프롬프트 대원칙 — **"애매하면 무조건 119 쪽으로
  기운다. 절대 '괜찮다'고 단정하지 않는다. 위험 신호가 보이면 질문을 멈추고 즉시 119."** 병명 진단 금지.
  `RED_FLAGS`에 걸리면 앱 쪽에서도 119 카드를 먼저 띄운다. 이 문구들을 완화하지 말 것.
- `store` 키: `counsel_*`(consent/key/messages/mode/model), `emg_*`(consent/messages).
  `*_consent`는 첫 사용 동의 기록 — 지우면 동의 화면이 다시 뜬다.

### sand-mix (샌드믹스)

테트리스 조작 + 모래 물리 + 색 혼합을 합친 퍼즐. 캔버스 하나에 전부 그린다.

- 조각(`SHAPES`)이 바닥에 닿으면 **모래 알갱이로 흩어진다**(`dissolvePiece`) → `simSand`가 매 프레임 떨어뜨린다.
- 같은 색 모래가 좌우로 이어지면 지워진다(`clearScan`). 다른 색이 닿으면 `MIX` 규칙으로 섞여 새 색이 된다.
- `SIM_STEPS`·`FALL_RAMP_*`가 난이도 곡선이다. 모래 시뮬레이션은 프레임당 여러 번 도는 것을 전제로 쓰였다.
- **배경음악·효과음을 음원 파일 없이 웹오디오로 만든다**(`MELODY`/`BASS`/`BPM`/`midiToFreq`/`scheduleBgmStep`).
  브라우저 자동재생 정책 때문에 첫 입력 뒤에만 소리가 난다(`ensureAudio`/`resumeAudio`).
- `HEADLESS` 플래그가 있어 자동화로 시뮬레이션만 돌릴 수 있다.
- `store` 키: `sandmix_best`, `sandmix_settings`.

### shade-map (그늘 지도)

이 저장소에서 가장 큰 단일 앱(2,651줄, 함수 96개). 지금 시각 태양 위치로 건물 그림자를 그리고,
그늘이 많은 길을 찾아 준다. 코드 안 한국어 주석이 이미 촘촘하니 **고치기 전에 그 주석부터 읽을 것.**

- **외부 서비스가 많고 전부 무료 공용 서버다**: Overpass(건물, 미러 여러 개) · OSM API · CARTO 베이스맵 ·
  Nominatim/Photon(주소 검색) · OSRM(도보 폴백) · Transitous(대중교통) · ODsay(국내 대중교통).
  **몰리면 막힌다.** 그래서 미러 순회·타임아웃(`FETCH_TIMEOUT`/`ROUTE_TIMEOUT`)·세대 번호로 옛 응답 폐기가 들어 있다.
- **건물 높이는 대부분 추정값**이다(`estimateHeight`): 태그가 있으면 그대로, 없으면 바닥 면적으로 층수를 추정한다.
  한국 아파트 12~25층 가정이 들어 있다. 그림자 길이가 이상하면 여기부터 본다.
- **성능 규칙**: 건물 꼭짓점 화면 좌표는 **지도를 움직일 때만** 다시 계산한다(`buildWindows`).
  시각만 바뀔 때 재투영하면 건물 1,500개 × 꼭짓점 10개라 재생이 버벅인다.
- **그림자 그리기**: 바닥면이 쓸고 간 영역을 한 레이어에 모아 한 번에 얹는다.
  감김 방향을 통일하지 않으면 nonzero 채우기에서 상쇄돼 구멍이 생긴다(실측 있음).
  건물 바닥면을 도려내지 않는다 — 도려내면 그림자가 건물에서 한 겹 떠 보인다.
- **길찾기**는 A*(`astar`/`buildGraph`)이고, 최단 경로는 순수 길이 기준, 계단 페널티는 그늘 경로에만 준다.
  출발·도착 스냅은 연결 성분 기준(고립된 단지 내부 길에 붙어 "경로 없음"이 나오지 않게).
- **출처 표시(OSM/CARTO/Transitous/ODsay)는 이용약관 사항이다.** 지우지 말 것.
- `store` 키: `shade_view`, `shade_seen`, `shade_odsay`.

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

namsan-rpg 엔진을 그대로 복제해 만든 두 번째 도트 RPG. 공유하는 엔진 규칙(`MAPS`/`TILES`/`QUESTS` 계약,
`S.q` 저장, `S.lock` 컷신 잠금, DOM 이름표 `#labels`, 미니맵 `#mini`, `showPhoto`, `?debug=1`의 `NS` 훅)은
`docs/dot-rpg-engine.md`에 정리돼 있다. 여기에는 다른 점만 적는다.

- **친구 6명 대신 장면(챕터) 7개**: `CHAPTERS`가 순서를 정의하고 `QUESTS.c1~c7`이 대본. 앞 장면을 끝내야
  다음이 열린다(`chapterState`). 장면마다 시점 인물(`hero`)이 다르고, `S.heroSpr`로 예복(cwTux/sjDress) 등
  스프라이트만 덮어쓸 수 있다. 여성 단발 도안은 `SPR_F`(남성 `SPR`에서 얼굴 줄만 교체), 팔레트에
  `female: true`를 주면 그 도안을 쓴다. 상대 배치는 각 장면의 `friendPos`가 정하고 `spr`도 지정 가능.
- **미니게임**: `playDrone(링 수)`(탭=상승 플래피형), `playRhythm(라벨, 시도, 필요성공)`(금색 구간 타이밍 —
  색소폰·축가 겸용), 나머지(달래기·저녁 메뉴·집값 1년)는 `ask()` 선택지 루프다. `NS.MG.forceWin()`으로 검증.
- **비밀번호 잠금**: 시작 시 4자리 키패드(`PASSWORD` 상수). 통과하면 `cs_unlock` 저장.
  키패드는 `buildPad` 공용(상담 비밀번호도 같은 것).
- **사진**: `photos/`에 `wedding`(결혼식 장면)·`card`(엔딩) 슬롯. 공개 저장소에 원본이 그대로 올라가지 않게
  `photos/encode_photo.py`로 XOR(.bin)을 만들면 `showPhoto`가 먼저 그것을 찾고, 없으면 jpg → 안내 카드 순.
- **마음결 CBT 상담(엔딩 특전)**: counsel-chat(마음톡)과 같은 Deno 프록시로 `{ mode: 'cbt', messages }`를
  보내고 SSE를 스트리밍한다(`CARE_PROXY`). 프로필은 수지/철우 둘뿐, 각자 4자리 비밀번호(SHA-256 해시를
  `cs_pw_*`에 저장, 분실 시 localStorage에서 지우는 수밖에 없음), 대화는 `cs_chat_*`에 저장하고 최근 40개를
  같이 보내 이어진다. 위기 단어면 109 핫라인 카드를 끼운다. 텍스트 입력 중에는 게임 키를 먹지 않게
  keydown 최상단에서 TEXTAREA/INPUT을 건너뛴다.
- 배포는 비공개 링크: 랜딩 페이지·README에 올리지 않는다.

### europe-rpg

couple-rpg와 같은 챕터형(`CHAPTERS` + `QUESTS.c1~c7`). 공통 엔진은 `docs/dot-rpg-engine.md`를 보고,
다른 점만 적는다. 시점 인물은 일곱 장면 모두 설수지(장녀)다.

- **부모님도 하실 수 있는 난이도**가 설계 제약이다: 조작은 화면 탭 하나로 통일, 지금 누를 순간엔 화면 테두리가
  금색으로 빛나고 소리가 나며, 안내 문구는 캔버스가 아니라 `#mgInfo`(DOM 큰 글씨)로 나온다. **실패 화면이 없다** —
  못 맞혀도 이야기는 이어지고 25초가 지나면 자동으로 넘어간다. 맵은 벽 없이 트여 있고 목표는 늘 시작 지점 한두 걸음 거리.
- **미니게임 5개**: `playPhoto`(해 뜰 때 탭) · `playCrowd`(연타로 인파 헤치기) · `playTrain`(꾹 눌러 달리고 떼면 정차) ·
  `playPick`(셋 중 하나) · `playRamen`(익으면 탭). 공통 손가락 안내는 `mgGhost`.
- **하늘(에펠탑 맵 전용)**: 맵에 `sky: true`가 있으면 배경을 검정(`#0e0d1a`)이 아니라 하늘로 칠한다.
  `S.weather`가 `'rain'`→`'clear'`로 바뀌면 잿빛 하늘·빗줄기가 파란 하늘·해로 바뀐다(1장 인트로에서 전환).
  하늘 타일은 `'~'`(solid, 그림 없음)이고, **에펠탑은 타일이 아니라 `drawTower`가 월드 좌표에 한 덩어리로 그린다** —
  타일로 쪼개면 타일 경계마다 끊겨 보였다.
- **복구 코드**: 장면 선택 화면 맨 아래 흐린 입력란(`#restoreBox`, 평소 투명도 22%). 게임 비밀번호와 같은 4자리를
  넣으면 일곱 장면과 보상함이 전부 완료 상태로 복구된다. 「처음부터」를 실수로 누른 경우를 위한 것이고,
  사용법은 엔딩 크레딧 마지막에 안내로 나온다.
- **장면 아이콘**: 선택 화면 썸네일은 인물 도안이 아니라 `CHAP_ICONS`의 장소 아이콘 7개(에펠탑·유리 피라미드·
  꼬마열차·기차·신라면·이정표·비행기)다. 일곱 장면이 모두 같은 시점 인물이라 도안을 쓰면 구분이 안 됐다.
- **사진**: `photos/`에 `eiffel`·`louvre`·`versailles`·`gare`·`jungfrau`·`swiss` 6장. couple-rpg와 같은 XOR `.bin` 방식.
- 대문(랜딩)에는 아직 올리지 않았다. 주소를 아는 사람만 들어간다.

### iso-faces (격리실의 얼굴들)

소설 전문을 받아 게임으로 옮긴 첫 작업물. 도트 RPG 셋과 달리 **1인칭 3D**이고 엔진도 공유하지 않는다
(`docs/dot-rpg-engine.md`는 여기 적용되지 않는다). 파일 하나, 외부 의존 0, `file://`에서도 돈다.
대문(랜딩) **문학** 섹션에 올라가 있다.

- **설계 원칙: 조작할 수 있는 범위가 곧 서사다.** 1장은 코밖에 없어 시선이 ±0.6rad로 갇히고,
  2장은 눈동자로 커서를 **초당 1픽셀** 민다. 3장에서 몸이 붙으면 이동·달리기·뛰기가 통째로 열리고,
  8장에서 다시 빼앗긴다. 이 열림/닫힘을 약하게 만들면 작품이 무너진다.
- **아홉 장**: `SETUP[id]`/`TICK[id]` 짝 + `ACT.go(id)`. 도트 RPG의 `QUESTS[친구id]`와 같은 자리다.
  HUD 한 줄 목표는 `hud(장, 목표, 부연)` / `hudDone()`.
- **미니게임 3개**(`MG.open(def)` 규약: `setup·tick·press·draw·done`) — 「냄새 맡기」·「교감」·「기억」.
  2장의 홍채 조작은 전용 CRT 화면이라 장 자체로 돌아간다.
  **실패 화면이 없다** — 원작에 실패가 없기 때문. 못 맞히면 다시 올 뿐이다.
  「교감」(5장)은 **이길 수 없게 설계했다**: 성공할수록 갈망 증가폭이 커져 12회쯤에서 막힌다(실측).
  이 곡선을 완만하게 고치면 소설의 논지가 사라진다.
  **3장의 커넥터 접속에는 타이밍 게임을 두지 않는다** — 몸을 얻는 가장 중요한 순간이
  손가락 시험으로 바뀌면 장면이 죽는다. 저절로 꽂히고, 목·척추·신경이 한 줄씩 지나갈 뿐이다.
- **머리통은 진짜 머리 모양이어야 한다.** 공 하나로는 사람으로 안 보인다.
  `HEAD_RINGS`(턱→정수리 수평 단면 15줄) + `headBump()`(눈두덩·눈구멍·광대·관자놀이·코·인중·입술·턱·목덜미)로
  깎고, 귀·눈알·목 그루터기를 붙인다. 정점색이 재질을 나른다(**r=살, g=머리칼, b=입술**).
  **200개를 개별 draw로 그리면 그게 곧 렉이다** — 메시는 하나만 만들고 `HEADS` 프로그램으로 인스턴싱한다
  (인스턴스마다 회전·크기·살빛·머리칼 양). 동공만 `EYES` 프로그램으로 따로 굴린다.
  WebGL2에 baseInstance가 없어서 **방마다 VAO를 따로 만들어 오프셋으로 구간을 나눈다**(`HEAD_SETS`),
  `roomNear()`로 문에서 26m 밖인 방은 통째로 건너뛴다.
- **광량이 감정선이다**: `mood(lightMul, fogMul)`로 장마다 밝기·안개를 민다.
  실측 평균 밝기 격리실 33 → 복도 75 안팎. 이 대비가 "닭장 같은 공간이 아닌 곳"이다.
  **알베도를 낮춰 어둡게 만들지 말 것** — 화면이 죽는다. 어둠은 광량과 안개로만 만든다.
- **프레임이 그림보다 우선이다**: `renderScale`이 최근 프레임 시간을 보고 해상도를 0.58~1.0으로 자동 조절한다.
  기기 픽셀비는 1.6에서 자른다. 광원 정렬(`pickLights`)은 카메라가 0.6m 넘게 움직였을 때만 다시 한다.
- **길 안내**: 30초(`STUCK_SEC`) 넘게 목표를 못 찾으면 `#guide`가 뜬다 — 목표 쪽으로 도는 화살표 + 거리 +
  `ACT.hintText` 한 줄. 목표가 바뀌면(`hud()` 호출) 타이머가 처음부터. 인용문을 읽는 동안은 세지 않는다.
- **글자가 화자를 가른다**: 화자의 서술은 명조(`--serif`), 우주선의 방송·시스템은 산세리프 넓은 자간.
  섞으면 누가 말하는지 사라진다. 안내 글자는 작게 두지 말 것(실측으로 키웠다).
  **아무 키나 화면을 누르면 글이 빨리 사라진다**(`hurryText`) — 이미 읽은 사람을 기다리게 하지 않는다.
- **연출 지연은 `after(초, fn)`** — 루프에서 돈다. `setTimeout`을 쓰면 탭이 가려졌을 때 연출이 어긋난다.
  남아 있는 `setTimeout`은 소리·CSS 전환용뿐이다.
- 영속 상태 없음(`store` 미사용). `?debug=1`이면 `window.BD` — `go/state/tp/skill/cursor/interact/frame`,
  화면을 볼 수 없을 때 쓰는 `probe()`(픽셀 통계), `mgs()`/`hud()`/`ended()`/`raw()`.

### lucky-day (운수 좋은 날 — 첫 문단 3D)

소설 **첫 문단 하나**만 입력으로 세운 79초짜리 3D 장면. iso-faces가 "전문 → 게임"이라면 이쪽은
"한 문단 → 영상"이라 플레이가 없고 재생·되감기·자유 시점만 있다. 파일 하나, 외부 의존 0, `file://`에서도 돈다.

- **three.js를 안 쓴다** — iso-faces와 같은 이유(CDN·ESM 금지). 셰이더 셋: 본체(램버트+반구광+젖은
  노면+안개), 하늘(전체화면 삼각형에 시선 광선), 비/눈(인스턴싱 줄기).
- **좌표계**: X = 동소문(-62) → 동광학교(+56), Y = 위, Z = 길 건너. 단위는 미터.
- **변환 스택 `MS`의 규칙**: 스택에는 이동·회전과 `scaleU`(균일 크기)만 넣는다. **축마다 다른 크기는
  반드시 `part()`에서** 준다. 그래야 스택의 위쪽 3×3이 회전(×균일배율)뿐이라 법선 행렬을
  `회전 × (1/크기)`로 정확히 구할 수 있다. 균일 크기는 셰이더의 `normalize()`가 흡수한다.
- **감김 방향**: 바깥면이 반시계(CCW)여야 뒷면 컬링에 안 잘린다. `cyl`/`cone`/`sph`가 한 번 뒤집혀
  있었고(법선만 맞고 감김이 반대), **가는 기둥에서는 티가 안 나고 납작한 것(동전)에서만** 드러났다.
  새 형상을 넣으면 납작한 원판으로 확인할 것.
- **회전축을 눕힌 뒤의 회전에 주의**: 바퀴는 `rotX(90°)`로 굴대를 Z에 눕히므로, 구르는 회전은 그
  안쪽 좌표계의 **`rotY`**다. `rotZ`를 쓰면 축이 세로가 되어 턴테이블처럼 돈다(실제로 그랬다).
- **사람**: 머리 하나가 키의 1/6.8. 팔다리는 두 마디로 꺾이고, 옷은 겹쳐 입힌다(저고리+바지+두루마기,
  또는 치마+짧은 저고리, 또는 양복). `WHO`의 `skirt`/`western`/`hat`/`coat`/`h`가 차림을 정한다.
  **이목구비는 카메라에서 10m 안쪽일 때만** 그린다(`fine`) — 한 사람에 마흔 번 가까이 그린다.
  사람은 언제나 제 좌표계의 **+Z를 바라본다**. 인력거 손님도 같은 함수의 `seated` 자세다.
- **손처럼 카메라와 그림이 같이 봐야 하는 자리는 상수로 적지 말고 같은 변환으로 구한다.**
  삯 컷의 `HAND`는 `RECV` 자세의 어깨→팔꿈치→손 사슬을 `MS`로 한 번 돌려 좌표를 읽는다.
  손으로 계산해 적어 두었더니 팔 각도를 고치는 순간 카메라가 팔뚝만 비췄다.
- **카메라 금기**: 컷의 `|z|`는 8.5를 넘지 않는다. 한옥 줄 앞면이 z=±9.5라 넘으면 벽 속으로 들어간다.
- **화면 비율**: 컷은 16:9 기준. 세로 화면에서는 4:3 띠에만 그리고 위아래를 검게 두며, 16:9보다 좁으면
  세로 화각을 키워 **가로 화각을 기준값으로 유지**한다. 띠는 자막·조작부를 뺀 나머지의 한가운데에 두고
  `--film-top`/`--film-h`로 DOM 글자에 알려 준다.
- **시각이 유일한 상태다.** `rickshawAt`·`headAt`·`kimAt`·`handAt`·`cameraAt` 모두 t만 받는다.
  전역 누적값을 쓰면 되감기에서 어긋난다.
- **젖음은 가까운 데서만**(26~72m 페이드). 멀리까지 켜면 지면이 스쳐 보이는 각도에서 모아레가 뒤덮는다.
  안개 거리는 카메라 높이에 비례해 늘린다 — 안 그러면 부감 컷이 통째로 회색이 된다.
- **소리(`BGM`)**: 음원 파일 없이 그 자리에서 합성한다. 가야금 흉내는 **카플러스-스트롱**(잡음을 지연선에
  넣고 이웃과 평균 내며 되먹임), 거기에 낮은 드론과 아주 옅은 빗소리 결. 5음 음계에 쉼이 많은 32걸음
  도막이고, 밀도·크기는 `level(t)`가 장면 시각으로 정한다. 동전이 떨어질 때 `accent()`로 한 음.
  브라우저 정책상 **첫 조작 뒤에야** `AudioContext`를 만든다. 켜짐은 `store`의 `luck_bgm`.
  **예약이 밀렸을 때 몰아서 쏟지 말 것** — 지나간 시각으로 예약하면 그 음들이 한꺼번에 터진다.
  `nextStep`이 현재보다 뒤면 지금으로 당기고, 한 틱에 예약할 걸음 수도 막아 둔다(실측: 안 막으면
  3초 공백 뒤 16초치가 한꺼번에 나갔다).
- 영속 상태는 `luck_bgm` 하나. `?debug=1`이면 `window.LD` — `seek(t)`가 프레임을 **동기로 한 장** 그리고,
  `bgm(t, playing)`은 숨은 탭에서 멈춘 소리 예약을 직접 돌려 `probe()`(버퍼 RMS·걸음 수)를 돌려준다.
- **성능은 시간이 아니라 드로우 콜로 본다.** 병행 세션이 돌면 이 기계는 유휴 대비 6~8배 느려져
  프레임 시간이 무의미해진다(순수 CPU 기준선으로 부하를 먼저 재라). 실측 드로우 콜 187~389개,
  삼각형 30~51k — 이 범위를 크게 넘지 않으면 정상이다.
- **자막은 전부 원문 그대로다.** 지어낸 문장을 섞지 말 것. `SCRIPT`의 `m` 필드가 "이 구절 → 화면의 무엇"
  대응표이고 화면의 📖 버튼이 그대로 보여 준다.

### android-* (APK 셸 4개)

웹앱을 WebView로 감싼 안드로이드 앱이 네 개 있고 **구조가 전부 같다**:
`android-mood-log`(`com.woodesign.moodlog`) · `android-counsel`(`.counsel`) ·
`android-sandmix`(`.sandmix`) · `android-particle`(`.particle`).
새로 만들 때는 가장 가까운 것을 복사해 패키지명·앱 이름·복사해 올 웹앱 경로만 바꾼다.

아래 설명은 `android-mood-log` 기준이고 나머지도 같다.
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
