# Claude Workspace — 단일 파일 브라우저 앱 모음

빌드 도구도, 패키지 매니저도, 외부 의존성도 없는 순수 HTML/CSS/JS 앱 네 개입니다.
각 폴더에 `index.html` 하나가 전부라서 파일을 더블클릭해도 바로 돌아갑니다.

## 앱 목록

| 앱 | 설명 | 저장되는 상태 |
|---|---|---|
| [game-2048](game-2048/index.html) | 4×4 2048 퍼즐. 방향키 + 스와이프 조작 | 최고 점수 |
| [pomodoro-todo](pomodoro-todo/index.html) | 뽀모도로 타이머(25/5/15분) + 할 일 목록. 할 일별 🍅 카운트 | 세션 수, 할 일, 활성 작업 |
| [particle-playground](particle-playground/index.html) | 캔버스 파티클 드로잉. 폭죽 / 트레일 / 오비트 3가지 모드 | 없음 |
| [mood-log](mood-log/index.html) | 기분·수면·통증·에너지 일지. 본인/배우자 프로필, 14·30·90일 그래프, 주간·월간 통계, 패턴 힌트, 진료용 인쇄·복사, JSON 백업 | 프로필별 기록, 마지막 프로필 |
| [fly-brain](fly-brain/index.html) | 초파리에게 설탕 주기 🔊. 각설탕·쓴 약·물을 놓거나 더듬이를 간지럽히면, 실제 배선도로 만든 뇌 회로(1,295뉴런)가 반짝이며 소리를 내고 초파리가 먹거나 거부하거나 더듬이를 닦는다. 뉴런 외과의 퍼즐, 결과 카드 공유, 뇌 연주 모드. 아이콘 8개 중 3개는 무료, 나머지는 광고를 보면 열림 | 광고 해제 기록, 퍼즐 최고 기록 |
| [namsan-rpg](namsan-rpg/index.html) | 「남산중 6인방」— 친구들에게 선물하는 모바일 도트 RPG. 부산 남산중학교와 학교 앞 동네(급식실·매점·운동장·언덕·슈퍼·만화방·피자헛·피씨방)를 돌며 여섯 친구의 하루를 한 명씩 플레이, 여섯이 다 끝나면 엔딩. 세로 화면 + 가상 패드, PC는 방향키·Z·X | 완료한 친구, 진행 중인 친구의 위치·퀘스트 |

## 실행 방법

`index.html`을 브라우저로 바로 열어도 되지만, 로컬 서버로 띄우는 쪽을 권장합니다.
(`file://`에서는 브라우저 설정에 따라 `localStorage`가 막혀 진행 상황이 저장되지 않을 수 있습니다.)

```bash
python -m http.server 8765
```

- <http://localhost:8765/game-2048/>
- <http://localhost:8765/pomodoro-todo/>
- <http://localhost:8765/particle-playground/>
- <http://localhost:8765/mood-log/>
- <http://localhost:8765/fly-brain/>
- <http://localhost:8765/namsan-rpg/> (휴대폰 세로 화면 기준)

## 안드로이드 APK (mood-log)

`android-mood-log/build.ps1`을 실행하면 `mood-log/index.html`을 WebView로 감싼
`android-mood-log/dist/mood-log.apk`가 만들어집니다 (Android SDK build-tools 34 + JDK 17 필요,
Gradle 불필요). 디버그 키로 서명된 개인 설치용이며 스토어 배포용이 아닙니다.
기록은 앱 안에만 저장되므로 앱을 삭제하기 전에 JSON 내보내기로 백업하세요.

## 브라우저 지원

최신 Chrome / Edge / Firefox / Safari. 마우스·키보드와 터치 조작을 모두 지원하므로
모바일에서도 동작합니다. 뽀모도로의 데스크톱 알림은 `Notification` API가 있고 권한을
허용한 경우에만 동작하며, 그 외에는 탭 제목이 잠시 바뀌는 방식으로 대체됩니다.

## 기여

테스트 스위트나 린터가 없으므로, 변경 후에는 해당 앱을 브라우저에서 직접 열어
콘솔 에러가 없는지와 조작이 정상인지 확인해 주세요.
코드 스타일과 앱별 내부 구조는 [CLAUDE.md](CLAUDE.md)에 정리돼 있습니다.
