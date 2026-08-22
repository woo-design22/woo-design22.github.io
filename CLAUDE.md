# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

`C:\Claude`는 서로 독립적인 단일 파일 브라우저 앱들을 모아 둔 작업 공간이다.

- `game-2048/index.html` — 2048 퍼즐
- `pomodoro-todo/index.html` — 뽀모도로 타이머 + 할 일 목록
- `particle-playground/index.html` — 캔버스 파티클 드로잉 툴

각 앱은 폴더 하나에 `index.html` 한 개가 전부다. 서로 코드를 공유하지 않으며,
공유 라이브러리·번들러·패키지 매니저·CDN 의존성이 없다. Git 저장소도 아니다.

## 실행 및 검증

빌드 단계가 없다. `.claude/launch.json`의 `static-server` 설정
(`python -m http.server 8765`, 워크스페이스 루트 기준)으로 정적 서버를 띄운다.

```bash
python -m http.server 8765
```

- http://localhost:8765/game-2048/
- http://localhost:8765/pomodoro-todo/
- http://localhost:8765/particle-playground/

테스트 스위트, 린터, 타입 체커가 없다. 변경 검증은 브라우저에서 직접 구동해
콘솔 에러 확인 + 조작 테스트로 한다. `file://`로 직접 열어도 동작하도록 작성돼
있으므로(아래 `store` 참고) 그 경로도 깨뜨리지 말 것.

## 세 앱이 공유하는 규칙

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

`game-2048`과 `pomodoro-todo`는 `localStorage`를 직접 부르지 않고 try/catch로
감싼 `store.get` / `store.set`을 쓴다. `file://`이나 쿠키 차단 환경에서
`localStorage` 접근이 예외를 던져도 앱 전체가 멈추지 않게 하려는 의도다.
**새로운 영속 상태도 반드시 `store`를 통해야 한다.**

사용 중인 키: `2048_best`, `pomo_sessions`, `pomo_activeTask`, `pomo_todos`.

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
