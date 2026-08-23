# 마음톡 API 프록시 배포

API 키를 브라우저에 노출하지 않고 상담 앱을 공개하기 위한 Cloudflare Worker다.
**Node.js 없이 브라우저만으로 배포할 수 있다.**

---

## 0. 먼저 할 일 — 지출 상한 (건너뛰지 말 것)

코드로 막는 것과 별개로 **청구액 자체에 천장**을 둔다. 이게 최후의 방어선이다.

1. https://console.anthropic.com → **Settings → Limits**
2. 워크스페이스 또는 키 단위로 **월 지출 상한**을 설정한다 (처음엔 $5~10 권장)
3. **Auto-reload를 끈다.** 켜 두면 크레딧이 떨어질 때마다 자동 충전돼 상한이 무의미해진다

프록시를 만들 전용 워크스페이스를 따로 파고 그 워크스페이스 키만 쓰면,
사고가 나도 피해가 그 워크스페이스 안에서 끝난다.

---

## 1. Worker 만들기

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Start with Hello World** → **Deploy**
2. 배포되면 **Edit code**(또는 </> 버튼) → 편집기가 열린다
3. 기존 내용을 모두 지우고 [`worker.js`](worker.js) 내용을 그대로 붙여 넣기 → **Deploy**
4. 주소를 적어 둔다: `https://<이름>.<계정>.workers.dev`

## 2. 비밀 키 넣기

Worker → **Settings** → **Variables and Secrets** → **Add**

| 이름 | 타입 | 값 |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret** | `sk-ant-...` |
| `ALLOWED_ORIGINS` | Text | `https://woo-design22.github.io` |

`ANTHROPIC_API_KEY`는 **반드시 Secret**으로. Text로 넣으면 대시보드에 그대로 보인다.

`ALLOWED_ORIGINS`는 앱을 올린 주소만 넣는다(쉼표로 여러 개).
**비워 두면 아무 사이트에서나 호출된다** — 반드시 채울 것.

## 3. 레이트리밋 붙이기

Worker → **Settings** → **Bindings** → **Add** → **Rate limiting**

| 항목 | 값 |
|---|---|
| Variable name | `RATE_LIMITER` |
| Namespace ID | `1001` |
| Limit | `8` |
| Period | `60` (10 또는 60만 가능) |

붙이지 않아도 워커는 동작하지만, **그만큼 방어선이 하나 빠진다.**

## 4. 앱 연결

[`../counsel-chat/index.html`](../counsel-chat/index.html) 위쪽의 `PROXY_URL`에 주소를 넣는다.

```js
const PROXY_URL = 'https://maeumtalk-proxy.내계정.workers.dev';
```

이 한 줄만 채우면 앱이 **프록시 모드**로 바뀐다 — 방문자에게 키 입력칸이 사라지고,
설정의 키·모델 항목도 감춰진다. 비워 두면 예전처럼 본인 키를 쓰는 **개인 모드**다.
APK는 개인 모드로 두는 게 맞다(자기 폰에서 자기 키를 쓰는 구조).

## 5. 웹앱 올리기

GitHub 저장소 → **Settings → Pages** → Source를 `main` 브랜치로 →
`https://<계정>.github.io/mini-web-apps/counsel-chat/`

이 주소가 3단계의 `ALLOWED_ORIGINS`와 **정확히 일치**해야 한다(끝 슬래시 없이 도메인만).

---

## 방어선 정리

요청 하나가 통과하려면 이 여섯 개를 모두 지나야 한다.

| # | 방어선 | 막는 것 |
|---|---|---|
| 1 | Origin 검사 | 다른 사이트에서 갖다 쓰기 |
| 2 | 레이트리밋 (IP당 60초 8회) | 자동 스크립트 남용 |
| 3 | 메시지 2,000자 상한 | 긴 입력으로 토큰 태우기 |
| 4 | 히스토리 24개 / 전체 24,000자 | 대화 누적 비용 폭증 |
| 5 | `max_tokens` 700 고정 | 긴 답변 유도 |
| 6 | 모델 서버 고정 (Sonnet 5) | 비싼 모델 강제 |

모델·시스템프롬프트·토큰 상한은 **서버가 정하고 클라이언트 값은 버린다.**
사용자가 요청 본문에 `model`이나 `system`을 끼워 넣어도 무시된다(검증 완료).

## 개인정보 설계 — 바꾸기 전에 읽을 것

**대화 내용을 저장·기록하지 않는다.** 정신건강 상담 내용은 개인정보보호법상
**민감정보**라 저장하는 순간 별도 동의·암호화 보관·보유기간 고지 의무가 생긴다.
이 워커는 요청을 그대로 흘려보내기만 해서 그 의무 대부분이 발생하지 않는다.

- 업스트림 응답 본문을 **읽지 않고** 스트림째 전달한다
- 오류도 **상태 코드만** 보고 판단한다
- `console.log`로 요청 본문을 찍는 순간 이 설계가 무너진다 — 절대 추가하지 말 것

## 알아 둘 것

- **curl로 테스트하면 403이 뜬다.** Origin 헤더가 없으면 막도록 돼 있다. 정상 동작이다.
- 레이트리밋은 Cloudflare **위치별**로 집계된다. 정확한 회계 수단이 아니라 남용을 늦추는 장치다.
- 무료 한도는 하루 10만 요청. 이 앱 규모에서 먼저 닿는 건 Cloudflare가 아니라 **Anthropic 크레딧**이다.

## 검증

`_test.html`을 정적 서버로 열면 워커 로직을 브라우저에서 그대로 돌려 볼 수 있다
(가짜 env·fetch 주입). Origin 차단, 레이트리밋, 길이 상한, 클라이언트 덮어쓰기 차단,
preflight, 키 미설정까지 확인한다.

---

# 대안: Deno Deploy (Cloudflare 가 막혔을 때)

## 왜 옮기나

2026-08-23 실측: 같은 API 키로

- 일반 서버에서 Anthropic 직접 호출 → **401** (도달 성공, 키만 없어서 거부)
- **Cloudflare Worker 를 거쳐 호출 → 403 `forbidden: Request not allowed`** (5회 연속 동일)

키가 틀렸다면 401 이 온다. 403 `Request not allowed` 는 Anthropic 이 **요청 출처 자체를
거부**할 때 나오는 응답이다. Smart Placement 로 실행 위치를 바꿔도 동일했다.
즉 코드·키·설정 문제가 아니라 **Cloudflare Worker 의 이그레스가 차단된 것**이다.

`worker.js` 는 그대로 두었다. 나중에 Anthropic 쪽 정책이 바뀌면 다시 쓸 수 있다.

## 배포 (브라우저만으로, Node.js 불필요)

1. https://dash.deno.com → **GitHub 계정으로 로그인** (무료)
2. **New Playground** 클릭 → 브라우저 편집기가 열린다
3. 기본 코드를 모두 지우고 [`deno-proxy.js`](deno-proxy.js) 내용을 붙여 넣기
4. **Save & Deploy**
5. 주소를 적어 둔다: `https://<이름>.deno.dev`

## 환경변수

프로젝트 화면 → **Settings → Environment Variables**

| 이름 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` 전체 |
| `ALLOWED_ORIGINS` | `https://woo-design22.github.io` |

넣은 뒤 **재배포**해야 반영된다. (Cloudflare 와 마찬가지로 변수만 저장하면 적용되지 않는다.)

## 앱 연결

[`../counsel-chat/index.html`](../counsel-chat/index.html) 의 `PROXY_URL` 을 deno.dev 주소로 바꾼다.

```js
const PROXY_URL = 'https://마음톡프록시이름.deno.dev';
```

## Cloudflare 판과 다른 점

| | worker.js (Cloudflare) | deno-proxy.js (Deno) |
|---|---|---|
| 환경변수 | `env.X` | `Deno.env.get('X')` |
| 진입점 | `export default { fetch }` | `Deno.serve(handler)` |
| 레이트리밋 | 전용 바인딩 (`RATE_LIMITER`) | **메모리 기반** (`RATE_LIMIT` 상수) |
| 클라이언트 IP | `CF-Connecting-IP` | `x-forwarded-for` |

레이트리밋이 메모리 기반이라 **인스턴스마다 따로 센다.** 정확한 회계가 아니라 남용을
늦추는 장치다. 다른 다섯 겹의 방어선과 Anthropic 콘솔의 지출 상한이 실제 안전망이다.

## 검증

브라우저에서 `Deno.serve`/`Deno.env` 를 훅으로 바꿔 전 경로를 확인했다 (2026-08-23):

정상 요청 200·SSE·`no-store` · 업스트림 모델/토큰 고정 · 클라이언트 덮어쓰기 차단 ·
분야 8개 프롬프트 · mode 주입 차단 · 외부 Origin 403 · preflight 204 · GET 405 ·
길이 상한(40개×3000자 → 12개·24000자) · 빈 요청 400 · assistant 로 끝나는 대화 400 ·
레이트리밋 9번째 차단 · 키 미설정 500 — 전부 통과.

---

# 텔레그램 봇 (/telegram)

본인 전용 챗봇. 승인 절차도 시간 제한도 없어서 가장 빨리 붙는다.

## 왜 카카오톡이 아닌가

카카오 챗봇의 스킬 서버는 **5초 안에 응답**해야 하는데, 실측한 응답 시간은
일반 대화 4초 / CBT 11초다. 콜백 방식으로 우회는 가능하지만 구현이 한 단계
복잡해지고, 오픈빌더 승인에 약 3일이 걸리며 일반 채널로 통과되는지도 불확실하다.
텔레그램은 그 세 가지가 모두 없다.

## 만들기

1. 텔레그램에서 **@BotFather** 검색 → `/newbot` → 이름과 아이디 입력
2. 받은 **토큰**을 적어 둔다 (`123456:ABC-...` 형태)
3. Deno Deploy → Settings → Environment Variables 에 등록:

| 이름 | 값 |
|---|---|
| `TELEGRAM_TOKEN` | BotFather 가 준 토큰 |
| `TELEGRAM_SECRET` | 아무 임의 문자열 (위조 요청 차단용) |
| `TELEGRAM_ALLOWED_IDS` | 본인 텔레그램 사용자 ID (아래 참고) |

4. 재배포
5. 웹훅 등록 — 브라우저 주소창에 아래를 붙여 넣고 한 번 열면 된다:

```
https://api.telegram.org/bot<토큰>/setWebhook?url=https://<프로젝트>.deno.net/telegram&secret_token=<시크릿>
```

`{"ok":true}` 가 뜨면 성공.

## 내 사용자 ID 알아내기

`TELEGRAM_ALLOWED_IDS` 를 **비워 둔 채로** 봇에게 아무 말이나 보내면
봇이 본인 ID 를 알려준다. 그 값을 환경변수에 넣고 재배포하면 끝이다.

## 명령어

- `/chat` 잡담(기본) · `/listen` `/cbt` `/couple` `/anxiety` `/depress` `/work` `/self` `/family` · `/triage` 응급 판단
- `/새로` 대화 초기화 · `/도움` 안내

## 보안

- `TELEGRAM_ALLOWED_IDS` 에 없는 사용자는 **응답하지 않는다**(봇의 존재도 알리지 않는다).
  이 방어선이 없으면 봇을 찾은 누구나 크레딧을 태울 수 있다.
- `TELEGRAM_SECRET` 헤더가 맞지 않는 요청도 무시한다.
- 어떤 경우에도 200 을 돌려준다 — 텔레그램이 실패로 보고 재시도하는 것을 막기 위함.

## 대화 기록

메모리에만 둔다(최근 20개). 인스턴스가 재시작되면 사라진다.
"대화를 저장하지 않는다"는 이 프록시의 원칙을 텔레그램에서도 지키기 위한 선택이다.

## 검증 (2026-08-24)

미등록 사용자 무시 · 위조 secret 차단 · 잡담 모드 · 대화 기억 · 모드 전환 ·
응급 모드 프롬프트 교체 · 대화 초기화 · 도움말 · 긴 입력 차단 ·
긴 답변 분할 전송 · 웹앱 경로 정상 — 11개 항목 전부 통과.

---

# 카카오톡 챗봇 (/kakao)

## 5초 벽을 넘는 방법

카카오 스킬 서버는 **5초 안에 응답**해야 하는데 우리 AI 는 4~11초 걸린다.
그래서 콜백을 쓴다:

1. 즉시 `{"version":"2.0","useCallback":true,"data":{"text":"생각하고 있어요..."}}` 반환
   (**`template` 필드를 넣으면 안 된다** — 넣으면 콜백이 동작하지 않는다)
2. 답이 완성되면 요청에 담겨 온 `userRequest.callbackUrl` 로 스킬 응답 포맷을 POST
   (**5분 유효, 1회용**)

블록에 콜백 옵션이 꺼져 있어 `callbackUrl` 이 없으면 동기 응답으로 자동 전환된다
(5초를 넘기면 카카오가 끊는다).

## 챗봇 관리자센터 설정

**① 스킬 등록** — 스킬 목록 → 스킬 생성

| 항목 | 값 |
|---|---|
| 스킬명 | `마음톡` |
| URL | `https://<프로젝트>.deno.net/kakao` |
| 헤더 | 없음 |

**② 블록 연결** — 시나리오 → 폴백 블록 → 스킬로 `마음톡` 지정 →
파라미터 설정에서 **콜백 사용을 켠다** (이걸 켜야 `callbackUrl` 이 들어온다).

폴백 블록에 붙이는 이유: 사용자가 무슨 말을 하든 AI 가 받게 하려면
정해진 발화에만 반응하는 일반 블록이 아니라 폴백이어야 한다.

**③ 환경변수** — Deno Deploy Settings

| 이름 | 값 |
|---|---|
| `KAKAO_ALLOWED_USERS` | 본인 botUserKey (아래 참고) |

**④ 배포** — 왼쪽 `배포` 메뉴에서 봇 배포 → 채널 연결

## 내 botUserKey 알아내기

`KAKAO_ALLOWED_USERS` 를 **비워 둔 채로** 봇에게 말을 걸면 본인 키를 알려준다.
그 값을 환경변수에 넣고 재배포하면 끝이다.

## 명령어

카카오에는 명령어 UI 가 없어서 발화 자체를 명령으로 해석한다.

- `chat` 잡담(기본) · `listen` `cbt` `couple` `anxiety` `depress` `work` `self` `family` · `triage` 응급
- `새로` 대화 초기화 · `도움` 안내

명령어는 AI 를 부르지 않고 즉시 응답한다(비용 0).

## 제약

- 카카오 말풍선은 한 개당 **1000자** 상한이라 긴 답변은 최대 3개로 나눠 보낸다.
- 대화 기록은 메모리에만 둔다(최근 20개). 재시작하면 사라진다.
- `KAKAO_ALLOWED_USERS` 에 없는 사용자에게는 "개인용입니다"만 답한다.

## 검증 (2026-08-24)

미등록 차단 · 즉시응답에 template 없음 · 콜백 POST 형식 · 대화 기억 ·
모드 전환(AI 호출 0) · 응급 프롬프트 교체 · 도움말·초기화 ·
1000자 말풍선 분할(3개) · 콜백 없을 때 동기 전환 · API 오류 시 콜백 안내 ·
웹앱 경로 정상 — 11개 항목 전부 통과.
