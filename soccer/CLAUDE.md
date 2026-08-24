# soccer — 감독 문서 1: 설계도

2000년 온라인 축구 게임(탑뷰 2D, 개성 스킬, 3:3~10:10, 반칙 없음)을 본뜬 **20인 온라인 축구**. PC 브라우저(키보드)와
모바일 브라우저(터치)에서 같은 `index.html`로 실행하고, 서버는 Node.js 하나다. 이 저장소의 다른 앱과 달리 **파일 여러 개 + 서버 + npm 의존성 1개(`ws`)** 를 가지며,
**이 문서의 규칙이 루트 `CLAUDE.md`보다 우선**한다. 루트 규칙 중 유지하는 것: 한국어 UI·주석, `:root` CSS 변수,
폰트 스택 `'Segoe UI', Pretendard, sans-serif`, 마우스/키보드 + 터치 양쪽 경로, `store` 래퍼, `file://`에서 연습장 모드 동작.

## 0. 감독 문서 체계 — 세션 시작 시 가장 먼저 읽을 것

| 문서 | 역할 | 누가 언제 고치나 |
|---|---|---|
| `CLAUDE.md` (이 문서) | 설계도. 파일 구성, 프로토콜, 구조 상수, 규칙 | 설계가 바뀔 때. 코드보다 **먼저** |
| `ROADMAP.md` | 9단계(+선택 1) 체크리스트. 완료 조건·확인 방법 | 단계 완료 시 체크. 조건 변경은 §0.2 |
| `HANDOFF.md` | 세션 인수인계 일지. 최신이 맨 위 | 세션이 끝날 때마다 |

세션 의식과 문서 수정 규칙은 `voxel-world/CLAUDE.md` §0.1·§0.2와 **동일**하다. 요점만 다시 적는다.

- 한 세션에 한 단계. HANDOFF 맨 위 항목 + ROADMAP "현재 단계"를 먼저 읽는다.
- 완료 조건은 **실측값**으로만 체크한다. 통과시키려고 조건을 낮추는 것은 사용자 확인 없이는 금지.
- 오류의 원인이 코드면 코드만, 설계면 이 문서를 먼저, 순서면 ROADMAP을 고치고 전부 HANDOFF에 기록한다.
- 게임플레이 튜닝 수치(속도·쿨다운·마찰 등)의 **정본은 `game-core.js`의 `TUNING`·`CHARACTERS` 객체**다. 이 문서엔 구조 상수만 둔다. 문서와 코드에 같은 숫자를 두 번 적지 않는다.

## 1. 범위

**목표**: 방(최대 20명, 팀당 1~10명) · 탑뷰 2D 경기(드리블 킥·패스·슛·감아차기·발차기, 자동 골키퍼) · 캐릭터 6종 × 필살기 1개 · RPG형 추적 카메라 · 전후반·득점·킥오프 ·
로비(방 목록·생성·팀·준비·채팅) · 경기 중 난입 허용 · **접속 시 지연 측정으로 느린 유저 거부** · 경기 중 지연 감시·퇴장 · 재접속 ·
부하 테스트로 20명 검증 · Lightsail 서울 배포 · PC 키보드 + **모바일 터치(같은 페이지)** · 윈도우 바탕화면 실행.

**범위 밖** (이유): 필드 플레이어 봇/AI(사용자 결정: 사람이 없으면 빈자리로 둔다 — 골키퍼만 예외로 자동) · 안드로이드 APK(모바일은 브라우저로, 필요하면 추후) ·
계정·비밀번호(보안 책임 회피, 닉네임만) · 오프사이드·반칙·스로인(벽으로 대체) · 길드·랭킹 · 관전.

**법적 경계**: 원작 이름·캐릭터·스킬명·그림체·효과음을 쓰지 않는다. 메커닉(탑뷰·스킬·인원·반칙 없음)만 가져온다.
표시 이름 **"반대항축구"** (2026-08-24 사용자 확정, 띄어쓰기 없이). 학교 반대항 경기의 "반 전원 출전" 기억을 20인 난전과 연결한 이름이다.
이 이름이 세계관을 정한다: **팀 = ○반**, 캐릭터 = 반 친구 유형, 휘슬 = 체육 선생님. 캐릭터·필살기 이름은 §5.3 표가 정본이다.

## 2. 기술 결정 — 바꾸려면 이 문서를 먼저 고친다

- **클라이언트** = `index.html` + 공유 `game-core.js` + 그림 전용 `sprites.js`. 캔버스 2D, 키보드 + 터치(가상 조이스틱·버튼, 같은 `keys` 맵에 키 코드를 넣는 방식) 입력, 브라우저(크롬/엣지/모바일 크롬·사파리) 실행. 번들러·CDN 없음.
- **물리는 등속**(2026-08-24 사용자 지시): 가속·감속·마찰이 없다. 선수는 입력 즉시 최고 속도, 떼면 즉시 정지. 공은 찬 속도로 정해진 거리(`range`)만큼 가고 멈춘다.
- **서버** = Node.js LTS(22 이상) + `ws`(유일한 npm 의존성). 정적 파일(`index.html`, `game-core.js`)도 같은 프로세스의 `http` 모듈이 서빙한다. 포트 하나.
- **시뮬레이션은 한 번만 쓴다.** `game-core.js`는 UMD 래퍼로 브라우저에선 `window.SoccerCore`, Node에선 `module.exports`. 서버가 돌리는 `step()`과 연습장 모드가 돌리는 `step()`이 **같은 함수**다. 이 덕분에 나중에 "내 캐릭터 예측"(선택 10단계)을 넣을 수 있다.
- **서버 권위**: 클라이언트는 입력만 보낸다. 위치·득점·쿨다운은 전부 서버가 정한다. 클라이언트는 스냅샷을 보간해서 그릴 뿐이다(1차는 예측 없음).
- **전역은 `SoccerCore` 하나**(`game-core.js`가 만든다). `index.html`의 IIFE는 `SoccerCore.debug`만 덧붙인다.
- **`fetch` 금지**는 연습장 모드(`file://`)에 한한다. 온라인 모드는 WebSocket만 쓴다. 서버 URL은 페이지 origin에서 유도(`ws://` ↔ `wss://`는 `location.protocol`로 결정).
- **스냅샷·입력은 바이너리**(`DataView`), 나머지 메시지는 JSON 텍스트. 인코딩/디코딩 함수는 `game-core.js`에 두고 양쪽이 공유한다.
- **봇 없음.** 빈 슬롯은 비어 있다. 경기 중 나가면 슬롯이 비고 경기는 계속된다.
- **호스팅**: AWS Lightsail 서울(ap-northeast-2), Linux, $7/월(1GB·2vCPU·40GB·전송 2TB, 첫 3개월 무료), 고정 IP. 0단계 테스트는 개발 PC + Cloudflare 퀵 터널.
- **저장**: 클라이언트는 `store`로 `soc_nick`, `soc_settings`만. 서버는 디스크 저장 없음(프로세스 재시작 = 방 초기화).

## 3. 구조 상수

| 상수 | 값 | 비고 |
|---|---|---|
| `PROTOCOL_VERSION` | 정수, `game-core.js` 상단 | 클라이언트 `hello.v`와 다르면 4002로 거부 |
| `TICK_HZ` | 20 | 서버 틱 = 50ms. 연습장 모드도 동일 |
| `SNAPSHOT_EVERY` | 1 | 틱마다 스냅샷. 2단계 서버에서 도입 예정(지금은 코드에 없다) |
| `INTERP_MS` | 기본 100, 설정 50~150 | 클라이언트 렌더 시각 = 서버 시각 − INTERP_MS. 연습장은 로컬이라 50 고정 |
| `INPUT_HZ` | 20 | 틱마다 입력 1개. 서버는 초당 30개 초과 시 버림 — 2단계에서 도입 |
| 경기장 | 1200 × 800 단위, 원점 좌상단 | **전체가 보이지 않는다.** 카메라가 플레이어를 따라간다(§7 시야) |
| 시야 | 보이는 **넓이** 고정: PC 230,400(16:9에서 640×360) · 터치 195,000(812×375에서 650×300). 가로 300~880 · 세로 최소 288 | 화면이 커도 더 보이지 않는다 — 온라인 공평성. 클라이언트 전용 |
| 골대 | 폭 200(y 300~500), 깊이 40 | 공 중심이 골라인을 골대 안에서 넘으면 득점. **입구 판정은 골라인을 넘는 순간의 y**(이동 후 y로 보면 강슛이 기둥 밖을 지나고도 골이 된다). **들고 있는 공은 골라인을 넘지 못한다** — 득점하려면 반드시 차야 한다 |
| 경계 | 벽(반발) | 아웃·스로인·코너 없음 |
| 반지름 | 선수 14, 공 6 | 골키퍼도 14 |
| 골키퍼 | 진영마다 1명 자동 | x 는 골라인에서 24 고정. y 는 **`state.tick` 만의 사인 함수**(주기 3초·진폭 86, 좌우 위상 π 차이) — 공·선수와 무관하다. 닿은 공은 잡지 않고 튕겨낸다 |
| 인원 | 방 최대 20, 팀당 `teamSize` 1~10 | 슬롯 id 0~19, 팀 0 = 왼쪽 시작 |
| 전반 길이 `halfSec` | 90 / 150 / 300 | 방 생성 시 선택. 하프타임 5초, 킥오프 정지 2초, 종료 화면 10초 |
| 경기 단계 `phase` | `lobby → kickoff(2초) → play → half(5초) → kickoff(2초) → play → end(10초) → lobby` | 후반에 진영 교대 |
| 득점 직후 | `play → goal(1.2초, 공은 골망 안에서 계속 구름) → kickoff(0.8초, 위치 초기화) → play` | 합계 2초 정지 |
| 지연 게이트 | 핑 8개 × 100ms 간격, 중앙값 ≤ 100ms, 상위 10% ≤ 160ms, 응답 제한 1000ms | `server/config.json` `gate` |
| 경기 중 감시 | 2초마다 핑, 최근 10개 중앙값 > 150ms 또는 3회 연속 무응답 → 퇴장 | `config.json` `inMatch` |
| 재접속 | 끊긴 슬롯 15초 보존, 토큰으로 복귀 | |
| 제한 | IP당 접속 3, 방 20개, 닉네임 2~12자, 채팅 200자·초당 5개, 텍스트 프레임 2KB, 바이너리 8B | 초과 시 4005 |
| 종료 코드 | 4001 NET_SLOW · 4002 VERSION · 4003 ROOM_FULL · 4004 KICKED · 4005 RATE_LIMIT · 4006 DUP_IP | 클라이언트는 코드별 한국어 문구 |

## 4. 파일 구성

```
soccer/
  CLAUDE.md  ROADMAP.md  HANDOFF.md
  index.html          클라이언트: CSS(:root 변수), 캔버스 렌더, 입력, 로비 UI, 보간, WebSocket, 연습장 모드, SoccerCore.debug
  game-core.js        공유: TUNING, CHARACTERS, createState, step, 득점·단계 전이, encode/decodeSnapshot, encode/decodeInput, hashState
  sprites.js          클라이언트 전용: 도트 캐릭터 그리기(window.SoccerSprite). 없으면 index.html 이 원으로 폴백
  server/
    server.js         http 정적 서빙 + ws. 접속 게이트, 방·슬롯, 틱 루프, 입력 수집, 스냅샷 브로드캐스트, 감시, /stats
    config.json       port, gate, inMatch, limits
    package.json      dependencies: { ws }. scripts: start, loadtest
    loadtest.js       가짜 클라이언트 N명 × 방 M개. --delay 로 인위 지연(게이트 검증)
    soccer.service    systemd 유닛 (Restart=always)
    deploy.ps1        scp + ssh 재시작. 키 경로는 deploy.local.json(커밋 금지)
    make-shortcut.ps1 바탕화면 바로가기: msedge --app=http://<서버>/ (8단계)
    .gitignore        node_modules/, deploy.local.json
  tools/
    headless-probe.js 검증 도구. 헤드리스 크롬을 DevTools 프로토콜로 붙여 실제 fps·스냅샷 Hz·키보드 경로를 재고 HUD 포함 PNG 를 저장
```

규칙:
- `game-core.js`는 **DOM·WebSocket·Node API를 참조하지 않는다.** 순수 계산만. 시간도 인자로 받는다(`Date.now()` 금지 — 결정성).
- `step(state, inputsBySlot)`은 `state`를 제자리에서 갱신하고 이벤트 배열을 반환한다(`play`·`goal`·`kickoff`·`half`·`end`·`lobby`·`kick`·`backkick`·`hit`·`shoot`·`curve`·`pass`·`dribble`·`ult`·`keeperSave`). 같은 입력 → 같은 `hashState`.
  반환 배열은 **매 틱 재사용**되므로 보관하려면 복사해야 한다.
- 핫루프(틱·인코딩·렌더)에서 객체 생성 금지. 스냅샷 `Uint8Array` 는 호출자가 재사용 버퍼를 넘긴다(`encodeSnapshot(state, ms, buf)`).
  `DataView` 는 매 호출 새로 만든다 — 버퍼 길이가 인원수에 따라 바뀌기 때문이다(20명 기준 1틱 1개, 측정상 무시 가능).
- 서버는 클라이언트를 믿지 않는다: 모든 수신값을 범위 검사하고 어긋나면 버린다(끊지 않음). 프레임 크기 초과·속도 초과만 4005로 끊는다.
- `console.error` 0 기준. 서버 로그는 `console.log` JSON 한 줄(`{t, ev, ...}`).

## 5. 게임 규칙과 캐릭터

### 5.1 조작 (2026-08-24 사용자 지시로 전면 개편)

| 동작 | 키 | 터치 버튼 | 비고 |
|---|---|---|---|
| 이동 | 방향키 | 왼쪽 아래 가상 조이스틱 | 등속. 방향만 쓴다 |
| 드리블 킥 | **W** | 드리블 | 짧게 차기. **꾹 누르면 잡을 때마다 반복** |
| 슛 / 발차기 | **D** | 슛·발차기(가장 큼) | 공 있으면 충전 슛, 없으면 즉시 발차기 |
| 뒷발차기 | **S** | 뒷발 | **공을 가진 상태에서도** 쓴다. 뒤로 참 |
| 감아차기 | **Q**(왼쪽) / **E**(오른쪽) | 감아◀ / 감아▶ | 꾹 누를수록 많이 휜다 |
| 패스 | **Z** | 패스 | 시야 ±45° 안 가장 가까운 팀원 |
| 필살기 | **A** | 필살(왼쪽, 만충 시 빛남) | 게이지 만충에서만 |
| 미니맵 토글 / 디버그 | M / F3 | — | |

WASD 이동은 W·S·A·D 가 전부 동작 키라서 쓰지 않는다. **기존 C 태클은 없어졌다** — 발차기(D)가 그 역할을 한다.
터치는 기기 자동 감지(`maxTouchPoints`), `?touch=1/0` 으로 강제. 세로 화면이면 "가로로 돌리세요" 안내.
버튼은 `keys` 맵에 키 코드를 넣으므로 입력 경로가 키보드와 완전히 같다.

### 5.2 규칙

- **이동**: 등속. 입력 방향 × `maxSpeed`(캐릭터 배율), 떼면 즉시 0. 대각선도 같은 속도.
- **공 소유(드리블)**: 공이 선수 반지름 + 10 안에 들어오면 그 선수의 `owner`가 되고 진행 방향 앞 18단위에 붙어 같이 움직인다.
- **드리블 킥(W)**: 공을 앞으로 짧게 찬다(속도 320, 거리 64 → 발 앞 82에서 정지). 꾹 누르면 다시 잡을 때마다 또 찬다(약 0.3초 간격).
  공만 빠르고 선수는 그대로라 **평균 전진 속도는 걷기와 같다** — 수비를 벗기는 용도지 가속 수단이 아니다.
- **공의 이동**: 찬 순간의 속도로 등속, `range`가 0이 되면 멈춘다. 벽에 맞으면 속도는 그대로 방향만 반사되고 남은 거리가 60%(골망 안 30%)로 준다.
- **슛(D)**: 누른 시간 0~0.6초로 속도 350~750(캐릭터 shot 배율). 자동 조준 없음. 거리 2200.
- **감아차기(Q/E)**: 속도 480(캐릭터 shot 배율)·거리 1400 으로 나가되 **매 틱 방향이 회전**한다(`ball.spin`). 충전 0~0.6초 → 회전율 0.008~0.048 rad/틱,
  총 회전은 `turnMax` 1.9rad(109°)에서 끊는다(없으면 공이 되돌아온다). Q = 화면 왼쪽(반시계), E = 오른쪽. 벽에 맞으면 회전이 절반으로 죽는다.
- **발차기(D, 공 없을 때) / 뒷발차기(S)**: 앞(반지름 44·±55°) / 뒤(38·±55°) — 반지름에 캐릭터 `kickRange` 배율이 곱해진다 — 부채꼴 안의 상대를 **기절 0.6초 + 넉백**시킨다.
  D 를 꾹 누르고 있으면 쿨다운마다 반복된다(연타와 성능이 같다).
  뒷발차기는 공을 가진 채로도 쓸 수 있고, 그때 공은 뒤로 나간다(속도 400·거리 320).
- **차는 사람도 멈춘다**: 발차기·슛·뒷발차기 모두 시전자가 **0.15초(3틱) 정지**한다(사용자 지시). 쿨다운 앞차기 0.8초 / 뒷발차기 1.0초.
  **기절(0.6초) < 쿨다운(0.8초)** 이어야 한 명이 상대를 영구히 눕혀 둘 수 없다. 여기에 더해 깨어난 뒤 0.4초 **기절 면역**이 붙는다. 이 부등식을 깨지 말 것.
- **골키퍼(자동)**: 진영마다 하나, 골라인 앞 x=24 고정. y 는 `state.tick` 만의 사인 함수(주기 3초, 진폭 86 → y 314~486, 좌우 위상 π 차이)라
  **공·선수와 전혀 무관하게 주기적으로 왕복**한다(사용자 지시). 닿은 공은 **잡지 않고 튕겨낸다**(속도 560·거리 760, 골라인 반대쪽으로 강제).
  막는 반지름은 30(팔을 뻗은 판정, 판정 폭 76 = 골대 폭의 38%), 몸통 반지름은 14. 빠른 공이 뚫지 않도록 이동 선분으로 스윕 판정한다.
  실측 방어율: 근거리 강슛 37% · 원거리 강슛 44% · 약한 슛 50%.
- **득점 후**: 실점 팀 킥오프, 2초 정지. **하프타임**: 진영 교대. 동점 허용(연장 없음).
- **난입**: `play` 중에도 인원이 적은 팀으로 들어갈 수 있다. 자기 진영 기본 위치에 등장.
- **팀 이름**: 방 생성 시 두 팀의 반 번호(1~12반)를 고른다. 기본 1반 vs 2반. 득점판·채팅·종료 화면 모두 "3반 2 : 1 7반" 형식.

### 5.3 캐릭터 6종과 필살기(A)

게이지는 시간이 지나면 찬다(45초 만충). 득점하면 **실점한 팀에 더 많이** 준다(+8초 vs +2초) — 이긴 팀이 더 강해지는 눈덩이를 막는다.
발차기에 맞아도 +3초. 수치의 정본은 `CHARACTERS`이고, 판정은 전부 서버의 `step` 안에서만 일어난다(난수 없음).

| 캐릭터 | 속도 | 슛 | 발차기 | 필살기 | 효과 |
|---|---|---|---|---|---|
| 체육부장형 | 1.00 | 1.00 | 1.00 | 집합 호루라기 | 반경 200 안 상대 전원 1.2초 기절 (즉발) |
| 에이스형 | 1.00 | 1.25 | 0.90 | 대포알 | **다음 슛 한 발**이 1.55배 + 골키퍼 관통 (5초 안에 쏴야 함). 자기 진영 골키퍼는 못 뚫는다 |
| 전학생형 | 0.95 | 1.00 | 1.00 | 슬쩍 이동 | 바라보는 쪽으로 240 순간이동(공도 함께) |
| 덩치형 | 0.85 | 1.10 | 1.40 | 황소 돌진 | 3초간 기절 면역 + 1.45배 속도, 닿은 상대 기절 |
| 육상부형 | 1.15 | 0.85 | 0.90 | 전력 질주 | 5초간 1.6배 속도(공을 몰 때는 1.25배) |
| 장난꾸러기형 | 1.00 | 0.95 | 1.00 | 미끄러운 잔디 | 5초간 **발동한 자리** 반경 190 안 상대 0.6배 속도 |

「발차기」 열은 `CHARACTERS[].kickRange` — 발차기 판정 반지름에 곱해진다(덩치형은 44 → 61.6).
득점·하프타임 리셋 때 **발동 중이던 필살기 효과는 지워진다**(게이지는 유지). 기절 면역은 `stunPlayer` 한 곳에서만 판정한다.

### 5.4 캐릭터 스프라이트 (`sprites.js`)

캐릭터 그림은 `sprites.js`가 그린다. **클라이언트 전용**이라 서버·시뮬레이션과 무관하고, 파일이 없거나 깨지면
`index.html`의 `fallbackDraw`(원 + 방향 삼각형)로 자동 폴백한다. 화풍은 **도트 픽셀아트 3/4 시점**(24×26 격자를
오프스크린 캔버스에 굽고 정수배 확대). `namsan-rpg`의 도안 방식과 같은 계열이다.

계약: `window.SoccerSprite = { STYLE, CHARACTERS, draw(ctx, o) }`.
`o = { x, y(발 밑 중앙), r(화면상 충돌 반지름), charId(0~5, 6=골키퍼), team, facing(라디안, 0=오른쪽),
motion('idle'|'run'|'kick'|'backkick'|'stun'|'ult'), t(초), phase(0~1), hasBall, ultActive, charge(0~1) }`.
**순수 함수여야 한다** — 내부에 난수·현재시각·가변 전역 금지(같은 `o` → 같은 그림).
캐시 키는 `charId|team|view|pose|frame`(크기는 정수 배율이라 키에 없다) — 결정적이면 어떤 키 조합이든 무방하다.

## 6. 프로토콜

텍스트 프레임은 JSON `{ t: '종류', ... }`, 바이너리 프레임은 첫 바이트가 종류다.

**C→S (텍스트)**: `hello {v, nick, token?}` · `pong {id}` · `room.list` · `room.create {name, teamSize, halfSec}` · `room.join {id}` · `room.leave` ·
`team {team}` · `char {id}` · `ready {on}` · `start` · `chat {text}`
**C→S (바이너리, 6B)**: `[0x01, seq u16 LE, buttons u8, dx i8, dy i8]` — buttons 비트: 0 패스(Z) 1 슛·발차기(D) 2 드리블(W) 3 감아차기왼쪽(Q) 4 감아차기오른쪽(E) 5 뒷발차기(S) 6 필살기(A). dx,dy는 −127~127 → −1~1 (방향만 쓴다).
**S→C (텍스트)**: `ping {id}` · `welcome {slotToken, rtt, p90, serverTime}` · `reject {code, msg, rtt?, p90?, limit?}`(이후 close) ·
`rooms {list}` · `room {state}`(방 전체 상태: 설정, 단계, 슬롯별 nick/team/char/ready/connected) · `match {phase, score, clock}` ·
`event {kind, ...}`(goal/skill/half/end/join/leave) · `chat {from, text}` · `kick {code, msg}`(이후 close)
**S→C (바이너리, 스냅샷)**: `[0x02, tick u32, serverMs u32, phase u8, scoreA u8, scoreB u8, clock u16, ballX i16, ballY i16, ballVx i16, ballVy i16, owner u8,
keeperY0 i16, keeperY1 i16, keeperFlags u8, n u8, n × (slot u8, x i16, y i16, vx i16, vy i16, facing u8, state u8, ult u8, motion u8)]` — 헤더 29B + 선수당 13B.
좌표·속도는 ×4 고정소수, facing 0~255 = 0~2π. `ult` = 필살기 게이지 0~255. `motion` = 하위 4비트 동작(0 idle 1 run 2 kick 3 backkick 4 stun 5 ult) + 상위 4비트 충전 0~15.
keeperFlags 비트0/1 = 골키퍼 0/1 이 방금 공을 튕겨냄(이펙트용). phase 바이트: 하위 7비트 단계(0 lobby 1 kickoff 2 play 3 goal 4 half 5 end), 비트7 = 후반.
state 비트: 0 공 소유 1 발차기 중 2 기절 3 충전 중 4 필살기 발동 중 5 뒷발차기 6 필살기 만충 7 팀.
20명 기준 **289바이트**, 20Hz → 1인당 5.8KB/s, 한 방 약 0.9Mbps.

**접속 절차**: open → 서버 `ping`×8(100ms 간격) → 클라이언트 즉시 `pong` → 서버가 RTT 중앙값·p90 계산 → 통과면 `welcome`, 아니면 `reject{code:'NET_SLOW'}` + close 4001.
`hello`는 첫 `ping` 전에 보낸다(버전 검사가 먼저: 불일치면 4002). 통과 후에만 `room.*`을 받는다.
**시계 동기**: 클라이언트는 `ping/pong` 쌍으로 `offset = serverMs + rtt/2 − localMs` 중앙값을 유지하고, 렌더 시각 = `localMs + offset − INTERP_MS`.

## 7. `SoccerCore.debug` (클라이언트) / `/stats` (서버) — 검증 API

```
debug.stats()        → { fps, frameMs, mode:'practice'|'online'|'idle', rtt, p90, interpMs, snapshotHz, snapshotBytes, buffered, slot, room,
                         touch, sprite, cam:{x,y,worldW,worldH,scale}, drawn, ult, motion, tick, phase, tickMsAvg, tickMsMax }
debug.state()        → 최신 스냅샷(디코딩된 것)의 사본(JSON) / debug.hash() → 로컬 state 의 hashState (연습장)
debug.events()       → 이번 경기의 이벤트 로그 [{tick, kind, team, slot, side, name}] (최대 800)
debug.setInput({slot, dx, dy, buttons}, ticks) → Promise   키보드 없이 입력 주입 (slot 생략 = 내 슬롯)
debug.run(ticks)     → 동기로 틱을 돌리고 그동안의 이벤트를 반환 (숨겨진 탭에서도 동작)
debug.practice({char, dummies, halfSec}) → 연습장 시작 (허수아비 = 움직이지 않는 상대, 봇 아님)
debug.setBall(x,y,vx,vy,range,spin) / debug.setPlayer(slot,x,y,facing) / debug.fillUlt(slot)  상태 직접 세팅 (연습장)
debug.raw()          → 서버측 원본 state(보간 전). spin·range 처럼 스냅샷에 없는 값 확인용
debug.camera()       → { x, y, worldW, worldH, scale }  /  debug.minimap(on)  /  debug.clearInput(slot)
debug.touch(on)      → 터치 UI 강제 on/off  /  debug.readInput() → 지금 눌린 입력 {dx, dy, buttons}
debug.renderOnce(n) → {msPerFrame} / debug.renderAt(offsetMs, base) / debug.screenshot(offsetMs) → dataURL (배경색 합성)
debug.resize()       / debug.selfTest(seed, ticks) → {hash, goals, events, ticks}
debug.connect(url?) / debug.disconnect() / debug.latencyProbe() → 2단계
GET /stats           → { rooms:[{id, players, phase, tickP95Ms, bytesOutPerSec}], connections, uptimeSec, rejected:{NET_SLOW, VERSION, ...} }
loadtest.js --rooms M --players N --delay D --seconds S → 콘솔에 수신 스냅샷 Hz·바이트·거부 코드 집계
index.html?selftest=1 → 페이지가 자가 검사(해시·100틱·렌더·store) 결과 JSON 을 #debug 에 쓴다. 헤드리스 --dump-dom 으로 file:// 검증
```

### 7.1 시야와 카메라 (클라이언트 전용)

경기장 전체를 보여주지 않는다(2026-08-24 사용자 지시). 카메라가 내 선수를 따라간다.

- **보이는 넓이(면적)를 고정한다.** 세로만 고정하면 화면비가 극단일 때 무너진다 — 세로 폰(375×812)에서 가로 138단위(선수 5명 폭)만 보이고,
  32:9 초광각에서는 경기장의 75%가 보여 불공평했다. 그래서 넓이 기준으로 바꿨다:

  ```
  scale = sqrt(캔버스폭 × 캔버스높이 / VIEW_AREA)      // 넓이 고정
  sMax  = min(캔버스폭 / VIEW_W_MIN, 캔버스높이 / VIEW_H_MIN)   // 이보다 크면 너무 조금 보인다
  sMin  = 캔버스폭 / VIEW_W_MAX                                  // 이보다 작으면 너무 많이 보인다(공평성)
  scale = sMin > sMax ? sMin : clamp(scale, sMin, sMax)          // 충돌하면 공평성 우선
  ```

  `VIEW_AREA_PC` 230400 · `VIEW_AREA_TOUCH` 195000 · `VIEW_W_MAX` 880 · `VIEW_W_MIN` 300 · `VIEW_H_MIN` 288(골대 폭 200 + 여유 44씩).
  폰이 PC보다 15% 덜 보는 이유: 화면이 작아 같은 넓이를 보여 주면 선수가 각(角)으로 3.6배 작아진다. 공평성 손해는 없다(폰이 **덜** 본다).
  캔버스 크기는 device px 라서 분자·분모가 같이 dpr 배가 된다 → 보이는 월드 넓이는 **dpr 과 무관**하다(레티나에서 더 보이지 않는다).
  실측: 1920×1080·1366×768 → 640×360 / 21:9 → 742×311 / 32:9 → 880×248 / 4:3 → 554×416 / 폰 가로 → 650×300 / 폰 세로 → 300×650.
- 데드존 ±46×34 월드 단위를 벗어나야 카메라가 움직이고, `1 - exp(-dt/0.10)` 로 부드럽게 따라간다(프레임률 무관).
- 골망(깊이 40)까지 포함해 경기장 밖이 보이지 않게 클램프한다.
- 좁은 시야를 보완하는 장치 — 없으면 공을 찾을 수 없다: **미니맵**(우상단, 양 팀 점·공·골대·카메라 사각형, M 키로 토글),
  **화면 밖 공 화살표**(가장자리에 방향 + 거리).
- 화면 밖 선수는 그리지 않는다(`onScreen`, 여유 80). `stats().drawn` 으로 확인.

## 8. 실행·검증 환경

- 로컬: `cd soccer/server && npm install && npm start` → `http://localhost:8080/`. 연습장만이면 루트 정적 서버 `http://localhost:8765/soccer/` 또는 `file://`.
  **포트 주의**: 8765가 이미 쓰이고 있으면 `launch.json`의 autoPort가 다른 포트를 잡는다(실행 결과에 뜬 포트를 쓸 것). 문서의 8765는 기본값 표기다.
- 두 명 테스트: 브라우저 탭 2개(같은 PC). 지인 테스트: 개발 PC에서 서버 + `cloudflared tunnel --url http://localhost:8080`(계정 불필요, `https://*.trycloudflare.com` URL, wss 자동).
- 20명 검증: `loadtest.js`. 게이트 검증: `--delay 200`(거부돼야 함) / `--delay 30`(통과). 실제 LTE 체감은 9단계에서 사람으로.
- 콘솔 에러·경고 0, 서버 `console.error` 0.
- **인앱 브라우저의 한계(1단계에서 확인)**: 탭이 숨김 상태라 `requestAnimationFrame`·`resize` 이벤트가 멈추고 스크린샷이 안 된다.
  그래서 ① 기능 검사는 `debug.run()`(동기)으로, ② fps·키보드·전체 화면 캡처는 `node tools/headless-probe.js <URL> chrome [png]`로,
  ③ `file://` 는 `msedge --headless=new --dump-dom "file:///C:/Claude/soccer/index.html?selftest=1"` 로 잰다.
  ④ 모바일 화면은 `PROBE_SIZE=812,375 PROBE_SKIP_KEYS=1 node tools/headless-probe.js "<URL>&touch=1" chrome phone.png`,
  터치 입력 경로는 합성 `PointerEvent`(pointerType 'touch')를 `#stickZone`·`.tbtn` 에 dispatch 한 뒤 `debug.readInput()` 으로 확인한다.
  실제 손가락 체감(멀티터치·감도)은 사용자가 폰 브라우저에서 `http://<PC IP>:8765/soccer/` 로 접속해 본다.
  인앱 브라우저에서 `getImageData` 로 픽셀을 읽으면 `willReadFrequently` 경고가 뜨는데 이는 측정 코드 탓이므로 새 탭에서 콘솔을 다시 본다.
- Node 는 이 PC 에 `C:\Program Files\nodejs\node.exe` 로 설치돼 있다(v24). Claude Code 셸에는 PATH 가 안 실려 있을 수 있으니 전체 경로로 부른다.

## 9. 배포 (7단계)

Lightsail 서울, Ubuntu 24.04, $7 플랜, 고정 IP 연결, 방화벽 22·80. NodeSource로 Node LTS. `/opt/soccer`에 `scp`, `npm ci --omit=dev`,
`setcap 'cap_net_bind_service=+ep' $(which node)`로 비루트 80 포트, `systemd` 유닛 `Restart=always`, 로그 `journalctl -u soccer`.
`deploy.ps1`: 파일 복사 → `systemctl restart soccer` → `/stats` 200 확인. HTTPS는 도메인이 생기면 Caddy 리버스 프록시(`wss` 자동).
가입·카드·인스턴스 생성·키 다운로드는 **사용자가 직접** 한다. 저는 명령과 설정 파일을 준비한다.

## 10. git

- 브랜치 `feat/soccer`. 분기 기준은 사용자 결정(현재 최신은 `feat/mood-log`).
- 커밋: 코드 `feat(soccer): N단계 — 제목`, 문서 `docs(soccer): ...`, 수정 `fix(soccer): ...`. ROADMAP 체크·HANDOFF 항목은 코드와 같은 커밋.
- `node_modules/`, `deploy.local.json`, `*.pem`은 절대 커밋하지 않는다.
- 커밋·푸시는 사용자가 지시할 때만.
