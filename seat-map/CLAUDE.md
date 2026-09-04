# CLAUDE.md — 앉을 자리 (설계도)

이 폴더에서 일할 때 먼저 읽는 문서. 세션을 시작하면 **`HANDOFF.md` 맨 위 항목**과
**`ROADMAP.md`의 「현재 단계」**를 읽고 시작한다.

정본의 순서: **사양서(`~/Downloads/앉을자리-사양서.md`) → 이 문서 → `ROADMAP.md` → `HANDOFF.md`**.
사양서와 이 문서가 어긋나면 사양서가 옳다. 어긋난 자리를 발견하면 `docs/DECISIONS.md`에 적는다.
작업 공간 루트의 `C:\Claude\CLAUDE.md`와 충돌하면 **이 문서가 우선**한다.

---

## 0. 한 줄

출발지·도착지·시각을 넣으면 가능한 경로를 **「서서 가는 시간이 짧은 순」으로** 정렬해 보여준다.
네이버·카카오는 빠른 순으로 정렬한다. 이 서비스는 다르게 정렬한다 — 그게 존재 이유의 전부다.

주 사용자는 **어르신·교통약자**다. 무릎이 아픈 사람, 짐이 많은 사람, 임산부.
이들에게 결정 변수는 소요시간이 아니라 **서 있는 시간**이다.

---

## 1. 이 프로젝트에만 적용되는 규칙

작업 공간의 「단일 파일 `index.html`」 규칙은 여기 적용하지 않는다(`voxel-world`·`soccer`와 같다).
나머지 공통 규칙은 그대로 지킨다 — 한국어 UI/주석, `:root` CSS 변수, **마우스·키보드와 터치 양쪽 경로**,
`store` 래퍼, `file://`에서도 동작, 번들러·패키지 매니저·CDN 의존성 없음.

추가로:

- **전역은 모듈마다 하나씩만**: `SeatModel` · `SeatTransfer` · `SeatInterp` · `SeatSim` ·
  `SeatQuery` · `SeatRoute` · `SeatLoads` · `SeatGeo`.
  UMD 껍데기(`module.exports` / `root.X`)를 써서 **브라우저와 Node에서 같은 파일이 돈다.**
- **`engine/`은 순수 함수만.** DOM·네트워크·`Date` 참조 금지. 같은 입력이면 어디서 돌려도 같은 값.
  이 규칙이 깨지는 순간 단위 테스트가 거짓말을 하기 시작한다.
- **파이썬은 표준 라이브러리만.** `pip install`이 필요하면 크론에 못 건다.
- **계산은 전부 클라이언트에서.** 서버는 정적 파일만 서빙한다(사양서 2.3 — APK 전환 때 다시 짜지 않으려고).

---

## 2. 구조

```
seat-map/
  engine/                    순수 계산 (브라우저 + Node 공용)
    seat-model.js            착석 확률·서서 가는 시간·정렬·화면 문구   ★핵심 자산
    transfer.js              환승 노드·이름 정규화·방향 라벨·도보 시간
    interp.js                30분/1시간 격자 → 10분 보간
    query.js                 필터 조합 → 시계열 한 줄
    route.js                 **경로 탐색·정렬**                    ★이 서비스의 본체
    loads.js                 구간 → 「그 차에 몇 명 타 있나」        ★가장 조심할 자리
    geocode.js               주소·지명·정류장 → 좌표 (로컬 + 온라인)
    sim-seoul.js             실데이터 없을 때의 폴백 (OD 방식)
  index.html                 **길찾기** — 출발·도착 → 언제 → 경로 목록 → 상세
  explore.html               자료 살펴보기 (필터 + 좌석 배치도 + 그래프)
  tests/
    seat-model.test.js       모델 성질 시험
    validate.test.js         사양서 10장 검증 기준 (SIM/REAL 자동 전환)
    query.test.js            필터 축이 각각 살아 있는지 (실데이터 필요)
    ui.test.js               화면 조작부가 연결돼 있는지 (핸들러 삭제 사고 방지) → D-50
    route.test.js            길찾기 — 사양서 M2 검증 케이스 (그래프 필요)
    geocode.test.js          장소 찾기·도보 (인터넷 없이 — 받아 둔 표본으로)
  pipeline/                  파이썬 수집기 (표준 라이브러리만)
    common.py                키·HTTP·저장·요일·분산 역산
    config.json              엔드포인트와 파라미터 (verified 표시)
    fetch_open_files.py      **인증키 없이** 받는 파일 데이터    ★가장 먼저 돌린다
    build_congestion.py      혼잡도 원천 → congestion.json
    build_datasets.py        승하차·버스 → 필터용 데이터셋 + facets
    build_graph.py           **길찾기 그래프** (노드·노선 순번)
    collect_subway_daily.py  지하철 승하차 일일 크론 (키 필요)
    fetch_tdata_section.py   T-DATA 구간별 재차인원 (키 필요)
    parse_tdata.py           스키마 파서·정규화·요일별 집계
    keys.json                ← 커밋하지 않는다
  data/                      raw/ 와 logs/ 는 커밋하지 않는다
  docs/DECISIONS.md          판단 기록
  docs/DATA_SOURCES.md       출처·키 상태·신청 절차
  ROADMAP.md / HANDOFF.md
```

`index.html`이 **길찾기**다. 자료 살펴보기는 `explore.html`로 옮겼다.
**대문·소개 페이지를 만들지 않는다** — 접속하면 바로 출발지·도착지 입력이다(사양서 2.2).

---

## 3. 절대 흔들면 안 되는 수치

| 값 | 자리 | 근거 |
|---|---|---|
| 지하철 1칸 좌석 54 / 정원 160 | `seat-model.js VEHICLES` | 54/160 = 34% = 「좌석 만석」 임계값 (사양서 4.1) |
| `k = 좌석수 × 0.11` | `pBoard` | 재차 = 좌석일 때 정확히 0.5 |
| `α = 0.55` | `ALPHA_DEFAULT` | 경쟁 계수. **유일한 미지수** — 피드백 루프가 학습해 덮어쓴다 |
| 한 정거장 상한 0.92 | `P_STOP_CAP` | 사양서 5.2 |
| 정렬 1순위 = `standingMinutes` | `SORT_KEY` | 소요시간이 **아니다** |
| 모르는 구간 = 서서 간다 | `route.js evaluate` | 반대로 하면 **자료 없는 노선이 1등**을 한다 |
| 승객 0명 = 안 다닌다 | `loads.js` | 「텅 빈 좌석」이 아니다 — 실제로 08시에 심야버스가 1위였다 |
| 「앉을 확률」 = **탈 때 바로** | `route.js leg.pSeated = pBoard` | 「가다가라도」로 쓰면 만원 열차가 34%로 나온다 → D-33 |
| 혼잡도는 **방향별**로 | `loads.js dirName()` | 4호선 미아 08시 상선 15% / 하선 103% — 일곱 배다 → D-34 |
| 방향 라벨은 **자료로 판정** | `build_graph.py detect_directions` | 규칙을 박았더니 1호선이 반대·2호선은 내선/외선 → D-36 |
| 버스 승객은 **월 총계 ÷ 날짜** | `build_datasets.py days_in_month` | 안 나누면 30배 — 간선버스가 전부 0%가 된다 → D-47 |
| 접미사는 `re.sub`, `rstrip` 금지 | `build_graph.py` | `'서울역역'.rstrip('역')` = `'서울'` → D-48 |
| 도보 우회계수 1.3 | `transfer.js WALK_DETOUR` | 직선거리를 그대로 나누면 도보 시간을 **짧게 속인다** |
| 버스도 **왕복을 두 방향으로** | `build_graph.py split_round_trip` | 한 줄로 두면 출근 쏠림이 평준화돼 전부 100%가 된다 → D-51 |
| 근처 노드에 **지하철 자리를 남긴다** | `route.js nearbyMixed` | 거리만으로 자르면 드문 쪽(역)이 늘 진다 → D-52 |
| 가장 빠른 길의 **1.6배 / +25분**까지만 | `route.js prune` | 서서 0분이라고 201분짜리를 1위로 놓았다 → D-53 |
| 버스 요일 계수는 **시간대별** | `loads.js dayFactors` | 하루 평균은 토 0.76인데 08시는 0.43이다 → D-54 |
| ctx 를 골라 담아 넘기지 않는다 | `loads.js makeLoadFor` | 골라 담으면 나중에 넣는 기능이 조용히 굶는다 → D-55 |

**좌석 54와 정원 160을 따로 고치면 34% 임계값이 깨진다.** 단위 테스트가 이 짝을 검사한다.

---

## 4. 이미 겪은 버그 — 다시 만들지 말 것 (사양서 6.2)

프로토타입에서 실제로 터진 것들이고, 지금은 **테스트가 지키고 있다.**

| # | 증상 | 막는 장치 |
|---|---|---|
| ① | 같은 노선 반대 방향으로 갈아타는 경로가 1위 | `transferCandidates` — 같은 `routeId`는 방향 무관 전부 제외 |
| ② | 지하철역 `월곡`과 정류장 `월곡역`이 다른 노드 | `clusterStops` 150m 좌표 클러스터링(정답) + `canonStopName`(임시방편) |
| ③ | 재차인원이 물리적으로 틀림(6호선 피크 7%) | `odLoads` — OD 배분으로 인원 보존. 폴백 코드에만 해당 |
| ④ | 방향 라벨이 뒤집힘(신내행/응암순환행) | `directionsOf` — 라벨을 저장하지 않고 배열에서 파생 |
| ⑤ | 정렬 키와 배지 문구가 어긋남 | `SORT_KEY`와 `SORT_BADGE`를 한 자리에 두고 테스트가 대조 |

---

## 5. UI 규칙 (사양서 7장)

- 버튼 최소 높이 **52px**, 주요 버튼 **64px**. 화면당 주요 버튼은 **하나**.
- 기본 글자 **17px 이상**, 「큰 글씨」 토글로 1.18배(설정 저장).
- **착석 확률은 퍼센트로 말한다** — 「앉을 확률 92% · 웬만하면 앉아 갑니다」.
  다섯 단계(`SeatModel.SEAT_LEVELS`: 80/60/40/20% 경계)이고 색은 다섯 가지다 → D-31.
  **색만으로 정보를 전달하지 않는다** — 숫자와 문구가 항상 함께 나간다.
- 흐린 회색 본문 금지. 키보드 포커스 표시, `prefers-reduced-motion` 존중.
- **전문용어 금지.** 「혼잡도 76%」 대신 **「23자리 가운데 4자리 비어 있습니다」**(`describeSeats`).
- 보간값에는 반드시 출처 문구를 붙인다(`SeatInterp.noteFor()`). 사양서 3.3 — **UI에서 속이지 말 것.**
- 장소 등록은 **기기 안에만**(`store`). 서버 전송 없음을 화면에 명시한다.
- 출발지·도착지는 **주소·건물·역·정류장 아무거나** 받는다. 로컬(정류장 8,886곳)이 먼저 즉시 뜨고
  온라인 주소 검색이 뒤에 보태진다 — **인터넷이 없어도 앱이 죽지 않는 순서**다.
  온라인 검색을 쓰면 **출처를 화면에 밝힌다**(`SeatGeo.ATTRIBUTION`, OpenStreetMap 이용약관).

---

## 6. 실행과 검증

테스트 프레임워크를 설치하지 않는다. Node 기본 러너와 파이썬 자체 시험만 쓴다.

자료가 없으면 먼저 만든다(**인증키 필요 없음**, 몇 분 걸린다):

```bash
cd C:\Claude\seat-map && python pipeline/fetch_open_files.py && python pipeline/build_congestion.py && python pipeline/build_datasets.py && python pipeline/build_graph.py
```

```bash
cd C:\Claude\seat-map
node --test tests/*.test.js          # 111개 (모델·버그 방지·검증·필터·길찾기·장소 찾기)
python pipeline/parse_tdata.py --selftest   # 스키마 파서 (키 불필요)
python pipeline/collect_subway_daily.py --probe   # 키가 있을 때
```

`node --test tests/`처럼 폴더만 주면 윈도우에서 모듈 경로로 오해한다. **파일 목록을 준다.**

검증 테스트는 `data/subway/congestion.json`이 있으면 **REAL**, 없으면 **SIM** 모드로 돌고
실행할 때마다 어느 쪽인지 찍는다. **SIM 통과는 현실을 증명하지 않는다** — 폴백이 목표대로
보정돼 있고 모델이 그 값을 제대로 읽는다는 뜻뿐이다.

---

## 7. 방어선 (사양서 11장)

네이버·카카오는 3개월이면 따라 만든다. 이미 혼잡도 데이터는 붙어 있다. 방어선은 둘뿐이다.

1. **구간 누적 착석확률 로직** — 「이 역이 붐비나」가 아니라 「내가 A에서 타서 B까지 가는 동안 앉을 수 있나」
2. **실측 피드백으로 학습한 α** — 하차 시점 「앉으셨나요? 예/아니오」 한 번. 노선·시간대·요일별로 학습

**피드백 기능(M4)을 후순위로 미루지 말 것.** 시간이 지날수록 정확해지는 구조가 곧 해자다.
