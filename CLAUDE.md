# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

`C:\Claude`는 서로 독립적인 단일 파일 브라우저 앱들을 모아 둔 작업 공간이다.

- `game-2048/index.html` — 2048 퍼즐
- `pomodoro-todo/index.html` — 뽀모도로 타이머 + 할 일 목록
- `particle-playground/index.html` — 캔버스 파티클 드로잉 툴
- `mood-log/index.html` — 기분·수면·통증 일지 (본인/배우자 2프로필)
- `fly-brain/index.html` — 초파리에게 먹이 주기 🔊: 설탕·쓴맛·물·간지럼에 뇌(Shiu 2024 전뇌 LIF 모델)가 반응해 먹거나 거부하거나 닦음. 광고 잠금 구조 포함, 웹 게시용

각 앱은 폴더 하나에 `index.html` 한 개가 전부다. 서로 코드를 공유하지 않으며,
공유 라이브러리·번들러·패키지 매니저·CDN 의존성이 없다.

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
`mood_me`, `mood_partner`, `mood_profile`.

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

### android-mood-log (APK 셸)

`mood-log/index.html`을 WebView로 감싼 안드로이드 앱. Gradle 없이
`build.ps1`(aapt2 → javac → d8 → zipalign → apksigner)로 빌드하며, 실행 시
`mood-log/index.html`을 `assets/`로 복사하므로 **웹과 APK의 원본은 항상 같은 파일**이다.
네트워크 권한이 없고, JSON 저장/불러오기는 시스템 문서 선택기(SAF)로 처리한다.
기록은 WebView의 localStorage에 남으므로 앱을 지우면 기록도 사라진다(JSON 백업 안내 필수).
`build/`, `dist/`, `assets/`, `debug.keystore`는 커밋하지 않는다(폴더 안 `.gitignore`).
