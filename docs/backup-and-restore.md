# 다른 컴퓨터에서 이어서 작업하기

이 작업 공간의 "지식"은 세 곳에 나뉘어 있다. 옮길 것은 사실상 두 가지다.

| 무엇 | 어디 | 옮기는 법 |
|---|---|---|
| 앱 전부 + `CLAUDE.md` + `docs/` | GitHub (공개) | `git clone` — 이것만으로 자동화가 된다 |
| Claude 기억 파일 | `%USERPROFILE%\.claude\projects\C--Claude\memory\` | **손으로 복사** (git 밖, 비공개 유지) |
| 대화 기록 `.jsonl` | `%USERPROFILE%\.claude\projects\C--Claude\` | 옮겨도 새 컴퓨터의 Claude는 읽지 않는다. 백업만 원하면 폴더째 복사 |

## 새 컴퓨터 절차

```bash
git clone https://github.com/woo-design22/woo-design22.github.io.git Claude
```

1. 위처럼 받는다 (저장소 옛 이름 mini-web-apps 주소도 아직 리다이렉트된다).
2. 그 폴더에서 Claude Code를 켠다 → `CLAUDE.md`를 자동으로 읽는다. 이게 자동화의 전부다.
   - 앱 17개의 구조·규칙: `CLAUDE.md`
   - 도트 RPG 새로 만들기: `docs/dot-rpg-engine.md`
   - 상담·카카오·텔레그램 시스템: `CLAUDE.md`의 counsel 절 + `counsel-proxy/README.md`
3. (선택) 기억 폴더 `memory\`를 USB·개인 클라우드로 복사해 같은 경로에 놓는다.
   개인 메모이므로 **공개 저장소에 넣지 않는다.**

## 새 컴퓨터에서 안 되는 것 (계정·비밀 때문)

- **프록시 재배포**: `ANTHROPIC_API_KEY` 등 환경변수는 Deno Deploy 프로젝트에만 있다.
  코드는 저장소에 있으니 새 프로젝트에 `deno-proxy.js`를 올리고 환경변수를 다시 넣으면 된다
  (`counsel-proxy/README.md`의 절차대로, 지출 상한부터).
- **카카오 챗봇 설정**: 카카오 비즈니스 채널 관리자에서 스킬 서버 주소가 프록시를 가리킨다.
  주소가 바뀌면 거기서 바꿔야 한다.
- **텔레그램 웹훅**: `setWebhook`으로 등록한 주소도 마찬가지.
- **GitHub 푸시 권한**: 새 컴퓨터에서 `gh auth login` 또는 git 자격증명 등록.
- **fly-brain의 `model/`**: 커밋 안 되는 대용량. `git clone --depth 1 https://github.com/philshiu/Drosophila_brain_model model`
- **couple-rpg·europe-rpg 사진 원본**: 저장소엔 XOR `.bin`만 있다. 원본 jpg는 로컬에만.

## 대화 기록 백업 (원하면)

`%USERPROFILE%\.claude\projects\C--Claude\*.jsonl` 이 대화 원문이다(세션당 1파일, 총 ~10MB).
개인 클라우드에 폴더째 복사하면 된다. 단, 새 컴퓨터의 Claude가 이 파일로 기억을 되살리지는
않는다 — 지식은 위의 `CLAUDE.md`·`docs/`·`memory\`가 담는다.
