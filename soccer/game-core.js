/* game-core.js — 반대항축구 공유 시뮬레이션.
   브라우저에서는 window.SoccerCore, Node에서는 module.exports 로 같은 코드가 돈다.
   의존: 없음. DOM·WebSocket·Node API·Date.now() 참조 금지 — 같은 입력이면 어디서 돌려도 같은 결과(결정성)여야 한다.
   구조 상수는 CLAUDE.md §3과 같아야 하고, 게임플레이 수치의 정본은 이 파일의 TUNING·CHARACTERS 다.

   물리 모델(2026-08-24 사용자 지시):
   - 가속 없음. 선수는 입력 즉시 최고 속도, 떼면 즉시 정지.
   - 공은 찬 순간의 속도로 정해진 거리(range)만큼 등속으로 굴러간 뒤 멈춘다. 마찰 없음.
   - 감아차기는 속도 크기를 유지한 채 매 틱 방향만 회전시킨다(spin). 꾹 누를수록 회전율이 크다.
   - 발차기(D)는 상대를 기절시키는 공격, 방귀(S)는 공을 그대로 둔 채 주변을 정사각형으로 치는 공격이다.
     슛과 방귀는 시전자가 0.15초, 발차기는 0.10초 멈춘다 — 이 정지가 역공을 허용하는 타이밍이다.
   - 골키퍼는 공·선수와 무관하게 tick 만의 함수로 좌우 왕복하고, 닿은 공을 멀리 튕겨낸다.
   - 필살기(A)는 시간이 지나며 차는 게이지로 발동하며 캐릭터마다 효과가 다르다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SoccerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 경기장 4종 — 넓어질수록 사람이 적어 보이므로 관중 수도 넓이에 비례해 늘린다(클라이언트 §7.2).
     세로:가로 비율은 대체로 유지하고, 골대는 세로의 25%(GOAL_RATIO×2)로 함께 커진다. */
  var FIELDS = [
    { id: 'town',  name: '동네 축구장',   w: 1000, h: 660,  crowd: 0.55 },
    { id: 'school', name: '학교 축구장',  w: 1200, h: 800,  crowd: 0.75 },
    { id: 'pro',   name: '프로리그 축구장', w: 1500, h: 1000, crowd: 0.90 },
    { id: 'world', name: '월드컵 축구장', w: 1800, h: 1200, crowd: 1.00 }
  ];
  function fieldOf(id) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].id === id) return FIELDS[i];
    return FIELDS[1];   // 기본은 학교 축구장(예전 크기)
  }
  var PROTOCOL_VERSION = 16;   // 16: 틱 30Hz   // 15: 경기장 4종·연장·논스톱 슛·캐릭터 9종

  // ── 구조 상수 (CLAUDE.md §3) ─────────────────────────────────────────────
  var C = {
    // 2026-08-26: 20 → **40Hz**. 틱 단위 수치를 전부 **정확히 2배**로 올려 실제 시간은 그대로 뒀다.
    // 30Hz 도 검토했지만 0.05초(1.5틱)·0.25초(7.5틱)가 정수가 안 돼 네 값이 17ms 씩 어긋났다.
    // 40 은 20 의 정수배라 **반올림이 하나도 없다**(대조표 28개 항목 전부 일치).
    // 서버가 더 자주 계산하니 입력 대기(평균 25 → 12.5ms)와 보간 버퍼(60 → 30ms)가 함께 줄어든다.
    // **새 수치를 넣을 때는 초 단위로 생각하고 ×40** 할 것.
    TICK_HZ: 40, DT: 1 / 40,
    FIELD_W: 1200, FIELD_H: 800,
    GOAL_Y0: 300, GOAL_Y1: 500, GOAL_DEPTH: 40,   // 기본(학교) 값. 실제 경기는 state.goalY0/Y1 을 쓴다
    GOAL_RATIO: 0.125,   // 골대 반폭 = 경기장 세로 × 이 값. 경기장이 커져도 골대 비율은 같다
    PLAYER_R: 18, BALL_R: 6,     // 2026-08-25 4차 지시로 14 → 18. 서로 때리기 쉬워지고 그림도 같이 커진다
    MAX_PLAYERS: 20,
    KICKOFF_TICKS: 80,    // 경기 시작·후반 시작 킥오프 정지 2초
    GOAL_TICKS: 48,       // 득점 후 세리머니 1.2초 (공은 골망 안에서 계속 구른다)
    REKICKOFF_TICKS: 32,  // 득점 후 킥오프 정지 0.8초 (세리머니와 합쳐 2초)
    HALF_SEC: 120,        // 전·후반 각 2분 (2026-08-26 — 3분은 골이 너무 많아 늘어졌다)
    EXTRA_SEC: 30,        // 연장 전·후반 각 30초. 그래도 동점이면 무승부로 끝낸다
    HALF_TICKS: 200,      // 하프타임 5초
    END_TICKS: 400        // 종료 화면 10초
  };
  var PHASE = { LOBBY: 0, KICKOFF: 1, PLAY: 2, GOAL: 3, HALF: 4, END: 5 };
  var PHASE_NAME = ['lobby', 'kickoff', 'play', 'goal', 'half', 'end'];

  // 입력 buttons 비트 (CLAUDE.md §6). 키: Z 패스 · D 슛/발차기 · W 드리블 · Q/E 감아차기 · S 방귀 · A 필살기 · 왼쪽 시프트 달리기
  var BTN = { PASS: 1, KICK: 2, DRIBBLE: 4, CURVE_L: 8, CURVE_R: 16, FART: 32, ULT: 64, SPRINT: 128 };
  var BTN_MASK = 255;
  // 스냅샷 state 비트
  var ST = { HAS_BALL: 1, KICKING: 2, STUNNED: 4, CHARGING: 8, ULT_ON: 16, FART: 32, ULT_READY: 64, TEAM: 128 };
  // 스냅샷 motion 하위 4비트
  var MOTION = { IDLE: 0, RUN: 1, KICK: 2, FART: 3, STUN: 4, ULT: 5 };
  var MOTION_NAME = ['idle', 'run', 'kick', 'fart', 'stun', 'ult'];
  var KEEPER_OWNER = 100;   // (예약) ball.owner 가 100 + side 면 골키퍼 소유. 현재 골키퍼는 잡지 않고 튕겨내기만 한다.

  // ── 게임플레이 튜닝 — 정본. 문서에 복사하지 않는다 ────────────────────────
  var TUNING = {
    player: {
      maxSpeed: 168,      // 단위/초. 입력 즉시 이 속도, 떼면 즉시 0 (캐릭터 speed 배율). 220 → 185 → 160 → 168 (6차 지시로 5% 상향)
      stunTicks: 80,      // 발차기에 맞으면 2초 기절 (2026-08-25 사용자 지시)
      stunImmuneTicks: 0, // **폐지**(2026-08-25 4차 지시: "타격범위에 있으면 무조건 기절"). 아래 경고를 반드시 읽을 것
      // 8차 지시: **맞아도 밀리지 않는다.** 두 값을 0 으로 두어 넉백을 껐다(코드 경로와 해시 항목은 그대로 남긴다).
      knockback: 0,       // 맞은 선수가 밀려나는 속도
      knockTicks: 0,      // 밀려나는 시간
      touchCdTicks: 10,   // 공을 뺏긴 직후 다시 잡을 수 없는 시간 0.25초
      // 달리기(왼쪽 시프트, 2026-08-25 사용자 지시). 눈금을 200 으로 잡아 정수만으로 세밀하게 조절한다.
      sprintMul: 1.5,     // 달릴 때 속도 배율 (220 → 330)
      sprintCarryMul: 1.25, // 공을 몰고 달릴 때는 덜 빠르다 (220 → 275) — 몰고 들어가 넣는 게 너무 쉬워지지 않게
      staminaMax: 400,    // 체력 상한(눈금). 40Hz 로 올리면서 2배 — 닳는 시간은 그대로 2초
      staminaDrain: 5,    // 달리는 동안 틱마다 −5 → 2초면 바닥 (더 빨리 닳게, 2차 지시)
      staminaRegen: 1,    // 달리지 않으면 틱마다 +1 → 10초면 만충 (더 천천히 회복, 2차 지시)
      staminaResume: 120,  // 바닥난 뒤에는 30%까지 차야 다시 달릴 수 있다(1씩 남은 체력으로 깜빡이는 것 방지)
      tiredMul: 0.72      // **바닥난 뒤 회복 전까지는 걷기보다도 느리다**(220 → 158). 회복하면 원래대로
    },
    // ⚠ 기절 2초 > 쿨다운 0.6초 인데 **기절 면역까지 없앴다**(4차 지시). 즉 한 명이 상대를 계속 눕혀 둘 수 있다.
    // 되돌리려면 stunImmuneTicks 를 올리면 된다. 사용자 확인 없이 되살리지 말 것.
    kick: {
      freezeTicks: 2,     // 발차기 시전자 정지 0.05초 (4차 지시로 2 → 1)
      // **슛과 방귀는 정지가 더 길다** — 3차 지시 "딜레이 1.3배". 2 × 1.3 = 2.6 이지만 틱은 정수라 3틱(0.15초)으로 올림했다.
      // 이 정지가 "쏘는 순간 역공당하는" 타이밍 싸움을 만든다.
      shootFreezeTicks: 4,   // 슛 0.10초 (4차 지시로 3 → 2)
      fartFreezeTicks: 4,    // 방귀 0.10초 (4차 지시로 3 → 2)
      animTicks: 10,      // 동작 0.25초
      hitTick: 10,         // 누른 그 틱에 바로 판정한다(animTicks 와 같아야 한다)(kickT === animTicks)
      cdTicks: 24,        // 앞차기 쿨다운 0.6초 — 헛치면 손해
      fartCdTicks: 16,    // 방귀 쿨다운 0.4초 (10차 지시로 16 → 8. 앞차기 0.6초보다 짧다)
      range: 56,          // 앞차기 판정 반지름 (48 → 68 로 넓혔다가 7차 지시로 56 으로 되돌림)
      coneDeg: 60,        // 앞차기 판정 반각 (55 → 70 → 60)
      // 방귀(S)는 **공을 차지 않는 순수 타격기**이고 판정이 **바라보는 방향의 뒤쪽 정사각형**이다.
      // (4차 지시로 "선수 중심 사방" → "뒤쪽만"으로 바뀌었다. 클라이언트가 같은 사각형을 그대로 그린다.)
      // 앞모서리가 선수 중심을 지나고 뒤로 한 변만큼 뻗는다: 뒤 방향 0~2×fartHalf, 옆 방향 ±fartHalf.
      // 맞은 상대가 공을 갖고 있었으면 그 공이 넘어온다(빼앗기).
      // 8차 지시로 **면적을 15% 줄였다**: 한 변에 √0.85 = 0.9220 을 곱해 48 → 44.26 (넓이 96² → 88.5²  = 85%).
      fartHalf: 44.26,    // 정사각형 반변. 캐릭터 kickRange 배율이 곱해진다(덩치형 62)
      // **앞차기도 정사각형이다**(2026-08-26 지시). 부채꼴은 어디까지 맞는지 눈으로 알 수 없었다.
      // 뒷모서리가 선수 중심을 지나고 앞으로 2×kickHalf 만큼 뻗으며 옆으로 ±kickHalf.
      // 옛 부채꼴(반지름 56 · ±60°)의 넓이 3,284 와 비슷하게 맞춘 값이다(4 × 28.7² = 3,294).
      kickHalf: 28.7,
      // **논스톱 슛**(2026-08-26): 공을 잡지 않은 채 D 를 눌렀을 때, 발 앞 아주 좁은 범위에
      // 굴러오는 공이 있으면 그대로 강하게 차 낸다. 발차기 범위보다 훨씬 좁아야 '타이밍 기술'이 된다.
      volleyR: 26,        // 논스톱 판정 반지름 (앞차기 네모 앞길이 57 의 절반 이하)
      volleyMul: 1.3      // 그때 공이 이만큼 세게 나간다
    },
    ball: {
      possessRadius: 28,  // 선수 중심에서 이 거리 안이면 소유 (선수 반지름 18 + 10)
      carryOffset: 22,    // 드리블 중 공이 붙는 거리(바라보는 방향 앞)
      kickCdTicks: 10,    // 찬 사람이 곧바로 다시 잡지 못하는 시간 0.25초
      bounceRangeKeep: 0.6, // 벽에 맞으면 남은 거리가 이 비율로 준다
      // **공은 굴러가며 느려진다**(2026-08-25 7차 지시로 완전 등속을 버렸다).
      // 9차 지시로 곡선을 바꿨다: 남은 거리 비율의 **제곱근**에 비례한다 = 실제 공처럼 **일정한 감속도**.
      // 선형(`slowMin + (1-slowMin)·frac`)이면 끝에서 속도가 slowMin 인 채로 뚝 끊겨 "갑자기 멈추는" 느낌이 났다.
      // √ 곡선은 끝에서 0 에 수렴하므로 멈추는 순간이 매끄럽다. slowMin 은 마지막 한 틱이 무한히 늘어지지 않게 두는 바닥값.
      // `range` 는 여전히 "총 이동 거리"이므로 **날아가는 거리는 하나도 안 바뀌고 속도 곡선만 바뀐다**.
      slowMin: 0.06
    },
    // W: 누른 시간만큼 멀리 찬다(3차 지시). 톡 치면 아주 짧게(발 앞), 꾹 누르면 길게 치고 달린다.
    // 거리는 충전의 `rangePow` 제곱에 비례한다. 2.0 이면 짧게 누를 때 너무 안 나가서 6차 지시로 1.35 로 낮추고
    // 최소·최대 거리도 함께 올렸다(8 → 24, 300 → 360).
    dribble: { minSpeed: 260, maxSpeed: 460, minRange: 24, maxRange: 360, chargeTicks: 24, rangePow: 1.35,
               spinMax: 0.030, turnMax: 0.9 },   // 감아차기와 같이 누르면 짧게 휜다(감아차기의 절반 남짓)
    pass:    { speed: 420, coneDeg: 45, lead: 0.25, rangePad: 40, rangeNoTarget: 400 },
    // D: **충전 없는 한 번 누르기**(5차 지시). 세기도 거리도 항상 같다 — 누르는 순간 나간다.
    shoot:   { speed: 640, range: 400 },   // 6차 지시: 경기장 가로 1200 의 정확히 1/3
    // Q/E: 속도는 직선 슛보다 느리고 거리는 슛보다 조금 길다.
    // turnMax 로 총 회전을 끊는다 — 없으면 최대 충전 시 공이 되돌아온다. 2차 지시로 더 휘게(1.9 → 2.7rad = 155°).
    // 거리는 **슛과 같다**(10차 지시). 슛 거리를 바꾸면 이 값도 같이 바꿔야 한다.
    curve:   { speed: 480, range: 480, chargeTicks: 24, spinMin: 0.010, spinMax: 0.052, turnMax: 2.0 },
    keeper: {
      x: 24, r: 18,       // r = 몸통(선수 반지름과 맞춘다)
      saveR: 30,          // 찬 공을 막는 반지름. 판정 폭 (30+6+2)×2 = 76 → 골대 폭 200의 38%
      stealR: 52,         // **몰고 들어오는 공**을 걷어내는 반지름. 찬 공보다 넓다 —
                          // 안 그러면 골문 앞에서 몰고 들어가는 것이 지배 전략이 된다(인공지능 2:2 에서 3분 15골)
      periodSec: 3.0,     // 주기 왕복(최고 180u/s). 좌우 골키퍼는 위상 π 차이(서로 반대편)
      amp: 86,            // y 314~486 — 몸통이 골대 기둥에 정확히 닿는 최대 진폭(반폭 100 − 반지름 14)
      hitPad: 2,          // 접촉 판정 여유
      outSpeed: 560, outRange: 760, outCdTicks: 8   // 튕겨낸 공
    },
    ult: {
      fullTicks: 1800,    // 45초에 만충 (게이지 = 틱)
      goalScored: 80,     // 득점한 팀 +2초
      goalConceded: 320,  // 실점한 팀 +8초 — 이긴 팀이 더 강해지는 눈덩이를 막는다
      hitBonus: 120       // 발차기에 맞으면 맞은 쪽 +3초 (역전 여지)
    }
  };

  // ── 캐릭터 6종 — 반 친구 유형. 필살기는 A 하나(게이지식) ────────────────
  // **걷는 속도(speed)는 6종 모두 1.00 으로 같다**(2026-08-25 7차 지시). 속도 차이는 필살기(질주·돌진)에서만 난다.
  // ultKind: 'stunWave' 광역 기절 · 'power' 강슛+골키퍼 관통 · 'blink' 순간이동 · 'charge' 무적 돌진 · 'dash' 질주 · 'slow' 감속 장판
  var CHARACTERS = [
    { id: 0, key: 'captain',  name: '체육부장형',   speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '집합 호루라기', kind: 'stunWave', radius: 200, stunTicks: 48, durTicks: 24 } },
    { id: 1, key: 'ace',      name: '에이스형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '대포알',       kind: 'power',    shotMul: 1.55, durTicks: 200, oneShot: true } },
    { id: 2, key: 'transfer', name: '전학생형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '슬쩍 이동',    kind: 'blink',    dist: 240, durTicks: 24 } },
    { id: 3, key: 'big',      name: '덩치형',       speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '황소 돌진',    kind: 'charge',   speedMul: 1.45, stunTicks: 32, durTicks: 120 } },
    { id: 4, key: 'runner',   name: '육상부형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '전력 질주',    kind: 'dash',     speedMul: 1.60, carryMul: 1.25, durTicks: 200 } },
    { id: 5, key: 'prank',    name: '장난꾸러기형', speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '미끄러운 잔디', kind: 'slow',    radius: 190, speedMul: 0.60, durTicks: 200 } },
    { id: 6, key: 'basket',   name: '농구부형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '덩크 슛',      kind: 'power',    shotMul: 1.40, durTicks: 240, oneShot: true } },
    { id: 7, key: 'rocker',   name: '밴드부형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '고음 지르기',  kind: 'stunWave', radius: 160, stunTicks: 40, durTicks: 24 } },
    { id: 8, key: 'swimmer',  name: '수영부형',     speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '물살 가르기',  kind: 'blink',    dist: 200, durTicks: 24 } }
  ];

  // 포메이션: 왼쪽 진영 기준 좌표. 팀 안에서 슬롯 순서대로 배정. 0번이 중앙 공격수.
  var FORMATION = [
    [460, 400], [330, 260], [330, 540], [200, 400], [480, 200],
    [480, 600], [200, 220], [200, 580], [110, 400], [560, 400]
  ];

  var DT = C.DT, TAU = Math.PI * 2;

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function normAngle(a) { a = a % TAU; if (a < 0) a += TAU; return a; }
  function angleDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

  // mulberry32 — 자가 검사용 시드 난수 (시뮬레이션 본체에서는 쓰지 않는다)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── 상태 ─────────────────────────────────────────────────────────────────
  function newStats() {
    var a = new Array(C.MAX_PLAYERS);
    for (var i = 0; i < C.MAX_PLAYERS; i++) a[i] = { g: 0, a: 0, s: 0, d: 0, k: 0 };
    return a;
  }
  /* 결정적 수비 — **우리 진영 3분의 1 안에서** 상대의 공을 끊었을 때만 센다.
     아무 데서나 때려 흘린 것까지 세면 발차기 연타가 곧 수비 기록이 되어 숫자가 의미를 잃는다
     (실측 3분 3:3 — 제한 없음 11개 → 우리 진영 절반 18개 → 우리 진영 3분의 1 로 좁혔다). */
  function noteDefence(state, slot) {
    var p = state.players[slot];
    if (!p) return;
    var third = state.W / 3;   // 우리 진영 3분의 1 안 — 여기서 끊어야 '결정적'이다
    var own = sideOf(state, p.team) === 0 ? state.ball.x < third : state.ball.x > state.W - third;
    if (own) note(state, slot, 'd');
  }
  function note(state, slot, key) {
    if (slot == null || slot < 0 || slot >= C.MAX_PLAYERS) return;
    if (!state.stats) state.stats = newStats();
    state.stats[slot][key]++;
  }
  /* 상황판에 실어 보낼 표. 지금 뛰고 있는 선수 중 기록이 있는 사람만 담는다. */
  function statTable(state) {
    var out = [];
    if (!state.stats) return out;
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var st = state.stats[i], p = state.players[i];
      if (!st || (!st.g && !st.a && !st.s && !st.d && !st.k)) continue;
      out.push({ slot: i, team: p ? p.team : -1, g: st.g, a: st.a, s: st.s, d: st.d, k: st.k });
    }
    return out;
  }
  /* MOM — **승패와 무관하게** 가장 잘한 선수를 뽑는다(2026-08-26 지시).
     골 10점 · 도움 6점 · 유효슈팅 2점 · 결정적 수비 2점 · 기절 0.25점. 같으면 골 많은 쪽. */
  function pickMom(state) {
    var t = statTable(state), best = null, bestV = -1;
    for (var i = 0; i < t.length; i++) {
      var r = t[i];
      // 골이 확실히 앞서도록 무겁게 준다. 기절은 발차기 연타로 수십 개가 쌓여서 0.25 만 센다
      // (실측: 같은 무게로 두면 골 2개 + 기절 36개가 골 3개를 이겼다).
      var v = r.g * 10 + r.a * 6 + r.s * 2 + r.d * 2 + r.k * 0.25;
      if (v > bestV || (v === bestV && best && r.g > best.g)) { bestV = v; best = r; }
    }
    return best ? { slot: best.slot, team: best.team, g: best.g, a: best.a, s: best.s, d: best.d, k: best.k, score: bestV } : null;
  }
  function createState(opts) {
    opts = opts || {};
    var halfSec = opts.halfSec || C.HALF_SEC;   // 전·후반 각 2분(2026-08-26). 세리머니·킥오프 정지 중에는 clock 이 줄지 않는다
    var F = fieldOf(opts.field);
    var players = new Array(C.MAX_PLAYERS);
    for (var i = 0; i < C.MAX_PLAYERS; i++) players[i] = null;
    return {
      tick: 0,
      phase: PHASE.LOBBY,
      phaseTimer: 0,
      half: 1,
      halfTicks: halfSec * C.TICK_HZ,
      clock: halfSec * C.TICK_HZ,   // 이번 하프에 남은 틱 (PLAY 중에만 줄어든다)
      score: [0, 0],
      kickoffTeam: 0,
      // 경기장 크기는 방마다 다르다(§3). C.FIELD_* 는 기본값일 뿐이고 계산은 전부 state.W/H 로 한다.
      // 대기 운동장은 **점수가 없다**(2026-08-26 지시). 공은 그대로 두되 골대에 넣어도 아무 일도 없다.
      friendly: !!opts.friendly,
      field: F.id, W: F.w, H: F.h,
      goalY0: F.h / 2 - F.h * C.GOAL_RATIO, goalY1: F.h / 2 + F.h * C.GOAL_RATIO,
      ball: { x: F.w / 2, y: F.h / 2, vx: 0, vy: 0, range: 0, spin: 0, spinLeft: 0, pierce: 0,
              owner: -1, lastKicker: -1, assist: -1, kickCd: 0, keeperCd: 0 },
      keepers: [{ side: 0, y: F.h / 2, hitT: 0 }, { side: 1, y: F.h / 2, hitT: 0 }],
      players: players,
      // 경기 기록 — 슬롯마다 { g 골, s 유효슈팅, d 결정적 수비 }.
      // 하프타임·종료 때 이벤트에 실어 보내 상황판을 띄운다(스냅샷에는 넣지 않는다 — 매 틱 보낼 값이 아니다).
      stats: newStats(),
      events: []
    };
  }
  function keeperX(W, side) { return side === 0 ? TUNING.keeper.x : W - TUNING.keeper.x; }
  // 골키퍼 y 는 tick 만의 함수 — 공·선수와 무관하게 주기적으로 왕복한다(사용자 지시).
  function keeperY(H, tick, side) {
    var K = TUNING.keeper;
    var w = TAU / (K.periodSec * C.TICK_HZ);
    // 진폭도 경기장 세로에 맞춰 늘린다(기본 800 기준)
    return H / 2 + K.amp * (H / 800) * Math.sin(w * tick + (side === 0 ? 0 : Math.PI));
  }

  function createPlayer(slot, team, charId) {
    var ch = CHARACTERS[charId] || CHARACTERS[0];
    return {
      slot: slot, team: team, char: ch.id,
      x: C.FIELD_W / 2, y: C.FIELD_H / 2, vx: 0, vy: 0,
      facing: team === 0 ? 0 : Math.PI,
      prevButtons: 0,
      stam: TUNING.player.staminaMax, stamLock: 0,   // 달리기 체력 / 1이면 바닥나서 잠김
      charge: 0, chargeKind: 0,   // charge 는 **표시용**(둘 중 큰 쪽). chargeKind: 0 없음 2 감아왼쪽 3 감아오른쪽 4 드리블
      // 드리블(W)과 감아차기(Q/E)는 **따로** 충전된다 — 동시에 눌러 "휘는 드리블"을 만들 수 있다.
      // 공이 없어도 미리 모아 둘 수 있다(2026-08-25 지시). 공을 잡는 순간 그대로 쓴다.
      chargeD: 0, chargeQ: 0, curveSide: 0,
      kickLatch: 0,               // 슛을 쏜 D 는 손을 뗄 때까지 발차기로 이어지지 않는다
      kickT: 0, kickKind: 0,      // 0 없음 1 앞차기·슛 2 방귀
      kickCd: 0, freezeT: 0,
      stunT: 0, immuneT: 0, touchCd: 0, knockT: 0, knockDir: 0,
      ult: 0, ultT: 0, ultAnimT: 0, ultX: 0, ultY: 0
    };
  }

  // 어느 팀이 어느 쪽(0 왼쪽, 1 오른쪽)인가. 후반엔 교대.
  // 하프 1·3(연장 전반)은 처음 진영, 2·4 는 바꾼 진영. 홀수 하프 = 처음 그대로.
  function sideOf(state, team) { return (state.half % 2 === 1) ? team : 1 - team; }
  function teamOnSide(state, side) { return (state.half % 2 === 1) ? side : 1 - side; }

  // FORMATION 좌표는 기본 경기장(1200×800) 기준이라 실제 크기에 맞춰 늘린다.
  function formationSpot(W, H, side, index, isKickoff) {
    var f = FORMATION[index % FORMATION.length];
    var sx = W / 1200, sy = H / 800;
    var fx = f[0] * sx, fy = f[1] * sy;
    if (index >= FORMATION.length) fy = clamp(fy + 60 * sy * Math.floor(index / FORMATION.length), 60, H - 60);
    if (isKickoff && index === 0) fx = W / 2 - 15;  // 킥오프 팀 공격수는 공 바로 옆
    return [side === 0 ? fx : W - fx, fy];
  }

  function placePlayer(state, p, index, isKickoff) {
    var side = sideOf(state, p.team);
    var spot = formationSpot(state.W, state.H, side, index, isKickoff);
    p.x = spot[0]; p.y = spot[1]; p.vx = 0; p.vy = 0;
    p.facing = side === 0 ? 0 : Math.PI;
    p.stunT = 0; p.immuneT = 0; p.charge = 0; p.chargeKind = 0; p.chargeD = 0; p.chargeQ = 0; p.curveSide = 0; p.kickLatch = 0; p.touchCd = 0; p.knockT = 0;
    p.stam = TUNING.player.staminaMax; p.stamLock = 0;   // 킥오프마다 체력은 만충
    p.kickT = 0; p.kickKind = 0; p.freezeT = 0; p.kickCd = 0;
    // 발동 중이던 필살기 효과도 지운다(게이지 p.ult 는 유지) — 안 지우면 감속 장판이 상대 킥오프까지 남는다
    p.ultT = 0; p.ultAnimT = 0; p.ultX = 0; p.ultY = 0;
  }

  function teamIndexOf(state, p) {
    var idx = 0;
    for (var s = 0; s < p.slot; s++) { var q = state.players[s]; if (q && q.team === p.team) idx++; }
    return idx;
  }

  function resetBall(state) {
    var b = state.ball;
    b.x = state.W / 2; b.y = state.H / 2; b.vx = 0; b.vy = 0; b.range = 0; b.range0 = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
    b.owner = -1; b.lastKicker = -1; b.assist = -1; b.kickCd = 0; b.keeperCd = 0;
  }

  function resetPositions(state) {
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p) continue;
      placePlayer(state, p, teamIndexOf(state, p), p.team === state.kickoffTeam);
    }
    resetBall(state);
    state.keepers[0].hitT = 0; state.keepers[1].hitT = 0;
  }

  function addPlayer(state, slot, team, charId) {
    if (slot < 0 || slot >= C.MAX_PLAYERS || state.players[slot]) return null;
    var p = createPlayer(slot, team, charId);
    state.players[slot] = p;
    placePlayer(state, p, teamIndexOf(state, p), false);  // 난입: 자기 진영 기본 위치
    return p;
  }

  function removePlayer(state, slot) {
    var p = state.players[slot];
    if (!p) return false;
    if (state.ball.owner === slot) state.ball.owner = -1;
    state.players[slot] = null;
    return true;
  }

  function startMatch(state) {
    state.half = 1;
    state.score[0] = 0; state.score[1] = 0;
    state.stats = newStats();
    state.clock = state.halfTicks;
    state.kickoffTeam = 0;
    resetPositions(state);
    for (var s = 0; s < C.MAX_PLAYERS; s++) if (state.players[s]) { state.players[s].ult = 0; state.players[s].ultT = 0; state.players[s].ultAnimT = 0; }
    state.phase = PHASE.KICKOFF;
    state.phaseTimer = C.KICKOFF_TICKS;
  }

  // ── 필살기 ───────────────────────────────────────────────────────────────
  function ultOf(p) { return CHARACTERS[p.char].ult; }
  function ultReady(p) { return p.ult >= TUNING.ult.fullTicks; }
  function ultActive(p, kind) { return p.ultT > 0 && ultOf(p).kind === kind; }

  // 장난꾸러기형의 감속 장판: 상대가 깔아 둔 장판(발동 지점 고정) 안이면 느려진다.
  function slowFactor(state, p) {
    var f = 1;
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var q = state.players[s];
      if (!q || q.team === p.team || q.ultT <= 0) continue;
      var u = ultOf(q);
      if (u.kind !== 'slow') continue;
      if (Math.hypot(q.ultX - p.x, q.ultY - p.y) <= u.radius) f = Math.min(f, u.speedMul);
    }
    return f;
  }

  function activateUlt(state, p, ev) {
    var u = ultOf(p);
    p.ult = 0;
    p.ultT = u.durTicks;
    p.ultAnimT = 12;
    p.ultX = p.x; p.ultY = p.y;   // 장판류는 발동 지점에 고정된다
    ev.push({ kind: 'ult', slot: p.slot, team: p.team, char: p.char, name: u.name, ultKind: u.kind });
    if (u.kind === 'stunWave') {
      for (var s = 0; s < C.MAX_PLAYERS; s++) {
        var q = state.players[s];
        if (!q || q.team === p.team || q.stunT > 0) continue;
        if (ultActive(q, 'charge')) continue;   // 돌진 중인 덩치형은 기절 면역
        if (Math.hypot(q.x - p.x, q.y - p.y) > u.radius) continue;
        stunPlayer(state, q, u.stunTicks, Math.atan2(q.y - p.y, q.x - p.x), ev, p.slot);
      }
    } else if (u.kind === 'blink') {
      var nx = clamp(p.x + Math.cos(p.facing) * u.dist, C.PLAYER_R, state.W - C.PLAYER_R);
      var ny = clamp(p.y + Math.sin(p.facing) * u.dist, C.PLAYER_R, state.H - C.PLAYER_R);
      p.x = nx; p.y = ny;
      if (state.ball.owner === p.slot) { var pos = carryPos(p); state.ball.x = pos[0]; state.ball.y = pos[1]; clampCarried(state, state.ball); }
    }
  }

  function stunPlayer(state, v, ticks, dir, ev, bySlot) {
    var T = TUNING.player;
    // 기절 면역은 4차 지시로 폐지했다 — 판정 안에 있으면 무조건 기절한다.
    // 유일한 예외는 덩치형 필살기 「황소 돌진」이다(그 필살기의 존재 이유가 무적이라 남겨 두었다).
    if (T.stunImmuneTicks > 0 && v.immuneT > 0) return;
    if (ultActive(v, 'charge')) return;
    v.stunT = ticks; v.touchCd = T.touchCdTicks; v.charge = 0; v.chargeKind = 0; v.chargeD = 0; v.chargeQ = 0;
    v.knockT = T.knockTicks; v.knockDir = dir;
    v.kickT = 0; v.kickKind = 0; v.freezeT = 0;
    v.ult = Math.min(TUNING.ult.fullTicks, v.ult + TUNING.ult.hitBonus);
    if (state.ball.owner === v.slot) {
      var b = state.ball;
      // 기록: 공을 몰던 상대를 때려 떨어뜨렸으면 결정적 수비 하나
      var by = state.players[bySlot];
      if (by && by.team !== v.team) noteDefence(state, bySlot);
      b.owner = -1; b.lastKicker = v.slot; b.kickCd = TUNING.ball.kickCdTicks;
      b.vx = Math.cos(dir) * 120; b.vy = Math.sin(dir) * 120; b.range = 60; b.range0 = 60; b.spin = 0; b.spinLeft = 0;
    }
    // 기록: 상대를 기절시킨 횟수. **한 번에 세 명을 눕히면 3개**다(호출이 사람마다 한 번씩 온다).
    var stunner = state.players[bySlot];
    if (stunner && stunner.team !== v.team) note(state, bySlot, 'k');
    ev.push({ kind: 'hit', slot: bySlot, victim: v.slot });
  }

  // ── 선수 (등속: 가속·감속 없음) ──────────────────────────────────────────
  function updatePlayer(state, p, inp, ev) {
    var T = TUNING.player, K = TUNING.kick, ch = CHARACTERS[p.char];
    var buttons = inp ? inp.buttons : 0;
    var pressed = buttons & ~p.prevButtons;   // 이번 틱에 새로 눌린 버튼
    var released = p.prevButtons & ~buttons;  // 이번 틱에 뗀 버튼
    p.prevButtons = buttons;

    if (p.touchCd > 0) p.touchCd--;
    if (p.immuneT > 0) p.immuneT--;
    if (p.kickCd > 0) p.kickCd--;
    if (p.kickT > 0) p.kickT--;
    if (p.freezeT > 0) p.freezeT--;
    if (p.ultT > 0) p.ultT--;
    if (p.ultAnimT > 0) p.ultAnimT--;

    var b = state.ball, mine = b.owner === p.slot;
    // 8차 지시: **방귀·킥 동작 중에는 어떤 이동도 회전도 없다.** 정지 판정을 동작 타이머(kickT) 전체로 넓혔다.
    // `freezeT` 는 동작이 끝난 뒤에도 남는 여운(발차기 1틱 / 슛·방귀 2틱)이라 그대로 둔다.
    var frozen = p.freezeT > 0 || p.kickT > 0;

    // 이동 방향을 먼저 구한다 — 달리기 판정에 "실제로 움직이는가"가 필요하다.
    // 서버는 클라이언트를 믿지 않는다: NaN·Infinity 하나로 좌표와 해시가 영구 파손된다
    var mdx = 0, mdy = 0, moving = false;
    if (p.stunT === 0 && !frozen && inp) {
      var dx = inp.dx, dy = inp.dy;
      if (!isFinite(dx)) dx = 0;
      if (!isFinite(dy)) dy = 0;
      var len = Math.hypot(dx, dy);
      if (len > 0.05 && isFinite(len)) { mdx = dx / len; mdy = dy / len; moving = true; }   // 방향만 쓴다
    }

    // 달리기(왼쪽 시프트): 체력을 쓰며 빨라지고, 바닥나면 다시 걷는 속도로 돌아간다.
    // 움직이지 않거나 기절·정지 중이면 체력은 회복된다.
    var sprinting = moving && p.stam > 0 && p.stamLock === 0 && (buttons & BTN.SPRINT) !== 0;
    if (sprinting) {
      p.stam -= T.staminaDrain;
      if (p.stam <= 0) { p.stam = 0; p.stamLock = 1; }
    } else {
      p.stam += T.staminaRegen;
      if (p.stam >= T.staminaMax) p.stam = T.staminaMax;
      if (p.stamLock === 1 && p.stam >= T.staminaResume) p.stamLock = 0;
    }

    var speedMul = ch.speed * slowFactor(state, p);
    // 달리기와 필살기 속도 효과는 곱하지 않고 **더 큰 쪽만** 쓴다(겹치면 좁은 시야에서 화면 밖으로 튀어나간다)
    var boost = sprinting ? (mine ? T.sprintCarryMul : T.sprintMul) : (p.stamLock === 1 ? T.tiredMul : 1);
    if (ultActive(p, 'dash')) boost = Math.max(boost, mine ? ultOf(p).carryMul : ultOf(p).speedMul);
    if (ultActive(p, 'charge')) boost = Math.max(boost, ultOf(p).speedMul);
    var maxSpeed = T.maxSpeed * speedMul * boost;
    p.vx = 0; p.vy = 0;

    if (p.stunT > 0) {
      p.stunT--;
      if (p.stunT === 0) {
        p.immuneT = T.stunImmuneTicks;   // 깨어나면 잠깐 무적
        // 기절 중 누르고 있던 버튼을 **깨어나는 즉시** 한 번 먹인다(2026-08-26 지시).
        // 눌린 것을 '새로 눌림'으로 다시 보게 하려고 이전 상태를 지운다.
        p.prevButtons = 0;
      }
      if (p.knockT > 0) { p.knockT--; p.vx = Math.cos(p.knockDir) * T.knockback; p.vy = Math.sin(p.knockDir) * T.knockback; }
      p.x = clamp(p.x + p.vx * DT, C.PLAYER_R, state.W - C.PLAYER_R);
      p.y = clamp(p.y + p.vy * DT, C.PLAYER_R, state.H - C.PLAYER_R);
      return;
    }

    if (!frozen && inp) {
      if (moving) {
        p.vx = mdx * maxSpeed; p.vy = mdy * maxSpeed;
        // **동작 중에는 방향이 고정된다**(6차 지시): 발차기·방귀·슛 동작이 끝날 때까지 몸이 돌지 않는다.
        // 안 그러면 방귀를 뀐 뒤 몸을 돌릴 때 화면의 판정 사각형이 같이 돌아 "판정이 움직이는" 것처럼 보인다.
        if (p.kickT === 0) p.facing = normAngle(Math.atan2(mdy, mdx));
      }

      // 필살기 (A)
      if ((pressed & BTN.ULT) && ultReady(p)) activateUlt(state, p, ev);

      // ── 충전은 **공이 없어도** 모인다(2026-08-25 지시). 드리블(W)과 감아차기(Q/E)가 서로 독립이다. ──
      var holdD = (buttons & BTN.DRIBBLE) !== 0;
      var holdQ = (buttons & (BTN.CURVE_L | BTN.CURVE_R)) !== 0;
      // 뗀 그 틱에는 지우지 않는다 — 아래에서 그 값으로 공을 차기 때문이다.
      if (holdD) { if (p.chargeD < TUNING.dribble.chargeTicks) p.chargeD++; }
      else if (!(released & BTN.DRIBBLE)) p.chargeD = 0;
      if (holdQ) {
        p.curveSide = (buttons & BTN.CURVE_L) ? -1 : 1;
        if (p.chargeQ < TUNING.curve.chargeTicks) p.chargeQ++;
      } else if (!(released & (BTN.CURVE_L | BTN.CURVE_R))) p.chargeQ = 0;
      // 화면에 그릴 게이지는 둘 중 큰 쪽(둘 다 상한이 chargeTicks 로 같다)
      p.charge = p.chargeD > p.chargeQ ? p.chargeD : p.chargeQ;
      p.chargeKind = p.chargeD >= p.chargeQ ? (p.chargeD ? 4 : 0) : (p.curveSide < 0 ? 2 : 3);

      // 슛으로 쓴 D 는 손을 뗄 때까지 발차기로 이어지지 않는다.
      // (예전에는 D 를 누른 채 슛을 쏘면 쿨다운이 끝나는 순간 같은 손가락이 발차기를 내서
      //  "슛을 쐈는데 앞의 상대가 기절"하는 것처럼 보였다 — 2026-08-25 사용자 신고.)
      if (!(buttons & BTN.KICK)) p.kickLatch = 0;

      // 방귀 (S) — 공을 가진 상태에서도 쓴다. 공은 그대로 두고 주변을 정사각형으로 친다
      if ((pressed & BTN.FART) && p.kickCd === 0) {
        startKick(state, p, 2, ev);
      // 슛 (D, 공이 있을 때) — 충전 없음, 누르는 순간 일정한 세기
      } else if (mine && (pressed & BTN.KICK)) {
        kickShoot(state, p, ev);
        startKick(state, p, 3, ev);              // 3 = 공만 차는 동작(사람을 때리지 않는다)
        p.kickLatch = 1;
      // 앞차기 (D, 공이 없을 때) — 꾹 누르면 쿨다운마다 반복(연타와 같은 성능).
      // 단 **발 앞 좁은 범위에 공이 굴러오면 논스톱 슛**이 먼저 나간다.
      } else if ((buttons & BTN.KICK) && !mine && !p.kickLatch && p.kickCd === 0) {
        if (kickVolley(state, p, ev)) startKick(state, p, 3, ev);   // 공만 차는 동작(사람은 안 때린다)
        else startKick(state, p, 1, ev);
      // 패스 (Z)
      } else if (mine && (pressed & BTN.PASS)) {
        kickPass(state, p, ev);
      // 드리블 킥 (W 뗄 때). 감아차기를 같이 모아 뒀으면 **짧게 휘는 드리블**이 된다
      } else if (mine && (released & BTN.DRIBBLE)) {
        kickDribble(state, p, p.chargeD, p.chargeQ, p.curveSide, ev);
        p.chargeQ = 0;                           // 감아차기 충전은 드리블에 쓰였다
      // 감아차기 (Q/E 뗄 때) — 드리블을 같이 누르고 있지 않을 때만 단독 감아차기
      } else if (mine && (released & (BTN.CURVE_L | BTN.CURVE_R)) && !holdD && p.chargeQ > 0) {
        kickCurve(state, p, p.curveSide || 1, ev);
        startKick(state, p, 3, ev);
      }
      if (released & (BTN.CURVE_L | BTN.CURVE_R)) p.chargeQ = 0;
      if (released & BTN.DRIBBLE) p.chargeD = 0;
    } else if (!inp) {
      p.charge = 0; p.chargeKind = 0; p.chargeD = 0; p.chargeQ = 0;
    }

    p.x = clamp(p.x + p.vx * DT, C.PLAYER_R, state.W - C.PLAYER_R);
    p.y = clamp(p.y + p.vy * DT, C.PLAYER_R, state.H - C.PLAYER_R);
  }

  // 동작 시작: 시전자 정지 + 판정용 타이머.
  // kind 1 앞차기(사람을 때린다) / 2 방귀(사람을 때린다) / **3 공을 차는 동작(슛·감아차기 — 사람은 안 때린다)**.
  // 3 을 따로 둔 이유: 슛을 쐈는데 앞에 있던 상대가 발차기에 맞아 기절하는 게 이상하다는 6차 지시.
  function startKick(state, p, kind, ev) {
    var K = TUNING.kick;
    // 발차기·방귀를 쓰면 모아 둔 감아차기·드리블 게이지는 사라진다(2026-08-26 지시).
    if (kind === 1 || kind === 2) { p.charge = 0; p.chargeKind = 0; p.chargeD = 0; p.chargeQ = 0; }
    p.kickT = K.animTicks; p.kickKind = kind;
    p.freezeT = kind === 2 ? K.fartFreezeTicks : (kind === 3 ? K.shootFreezeTicks : K.freezeTicks);
    p.kickCd = kind === 2 ? K.fartCdTicks : K.cdTicks;
    p.vx = 0; p.vy = 0;
    // 방귀는 공을 차지 않는다 — 공을 든 채로도 타격만 하고 공은 그대로 갖고 있는다.
    ev.push({ kind: kind === 2 ? 'fart' : 'kick', slot: p.slot });
  }

  // 발차기 판정 — 동작 시작 다음 틱에 한 번만 (결정적)
  function kickHits(state, ev) {
    var K = TUNING.kick;
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var a = state.players[i];
      if (!a || a.kickT !== K.hitTick) continue;
      if (a.kickKind === 3) continue;          // 공을 차는 동작(슛·감아차기)은 사람을 때리지 않는다
      var fart = a.kickKind === 2;
      var mul = CHARACTERS[a.char].kickRange;
      var half = (fart ? K.fartHalf : K.kickHalf) * mul;   // 정사각형 반변 — 방귀는 뒤, 앞차기는 앞
      for (var j = 0; j < C.MAX_PLAYERS; j++) {
        var v = state.players[j];
        if (!v || v.team === a.team || v.stunT > 0) continue;
        if (ultActive(v, 'charge')) continue;    // 돌진 중엔 기절하지 않는다
        var vdx = v.x - a.x, vdy = v.y - a.y, dir;
        // **앞차기도 방귀도 정사각형이다.** 바라보는 방향을 축으로 놓고 앞뒤(uu)·좌우(vv)로 잰다.
        // 클라이언트가 그리는 사각형과 **완전히 같은 식**이다(§5.2). 어긋나면 안 된다.
        var cf = Math.cos(a.facing), sf = Math.sin(a.facing);
        var uu = vdx * cf + vdy * sf;            // 앞뒤(+가 앞)
        var vv = -vdx * sf + vdy * cf;           // 좌우
        if (Math.abs(vv) > half) continue;
        if (fart) {
          if (uu > 0 || uu < -2 * half) continue;
          dir = normAngle(a.facing + Math.PI);   // 넉백은 뒤로
        } else {
          if (uu < 0 || uu > 2 * half) continue;
          dir = a.facing;
        }
        var hadBall = state.ball.owner === v.slot;
        stunPlayer(state, v, TUNING.player.stunTicks, dir, ev, a.slot);
        // 방귀로 공을 가진 상대를 맞히면 그 공이 내게 넘어온다.
        // stunPlayer 가 면역·돌진으로 튕겨냈으면 owner 가 그대로라 빼앗기지 않는다.
        if (fart && hadBall && state.ball.owner < 0) {
          var b = state.ball, pos = carryPos(a);
          b.owner = a.slot; b.lastKicker = a.slot; b.kickCd = 0;
          b.x = pos[0]; b.y = pos[1]; b.vx = 0; b.vy = 0; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
          clampCarried(state, b);
          a.touchCd = 0;
          noteDefence(state, a.slot);                                 // 기록: 우리 진영에서 끊었을 때만
          ev.push({ kind: 'steal', slot: a.slot, victim: v.slot });
        }
      }
    }
  }

  // 덩치형 황소 돌진: 발동 중 몸에 닿은 상대를 기절시킨다
  function chargeHits(state, ev) {
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var a = state.players[i];
      if (!a || !ultActive(a, 'charge')) continue;
      var u = ultOf(a), reach = C.PLAYER_R * 2 + 6;
      for (var j = 0; j < C.MAX_PLAYERS; j++) {
        var v = state.players[j];
        if (!v || v.team === a.team || v.stunT > 0) continue;
        if (Math.hypot(v.x - a.x, v.y - a.y) > reach) continue;
        stunPlayer(state, v, u.stunTicks, Math.atan2(v.y - a.y, v.x - a.x), ev, a.slot);
      }
    }
  }

  // 선수끼리·선수-골키퍼가 겹치지 않게 밀어낸다 (슬롯 순서 고정 → 결정적). 골키퍼는 밀리지 않는다.
  // **선수는 사람·골키퍼·공에 닿아도 밀리지 않는다**(2026-08-25 3차 지시). 서로 겹쳐 지나갈 수 있고,
  // 밀려나는 것은 오직 발차기·방귀에 맞았을 때의 넉백뿐이다(`stunPlayer`). 여기서는 경기장 밖으로만 못 나가게 한다.
  function separatePlayers(state) {
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var a = state.players[i]; if (!a) continue;
      a.x = clamp(a.x, C.PLAYER_R, state.W - C.PLAYER_R); a.y = clamp(a.y, C.PLAYER_R, state.H - C.PLAYER_R);
    }
  }

  // ── 골키퍼: 공·선수와 무관하게 tick 만의 함수로 왕복한다 ──────────────────
  function updateKeepers(state) {
    for (var k = 0; k < 2; k++) {
      var g = state.keepers[k];
      g.y = keeperY(state.H, state.tick, k);
      if (g.hitT > 0) g.hitT--;
    }
  }

  // 공이 골키퍼에 닿으면 멀리 튕겨낸다. 공이 **이동한 뒤** 호출하며, 한 틱에 37단위씩 나아가는
  // 강슛이 골키퍼를 뚫고 지나가지 않도록 이동 선분과 원의 최단거리로 판정한다(스윕 충돌).
  function keeperSave(state, prevX, prevY, ev) {
    var K = TUNING.keeper, b = state.ball;
    if (b.keeperCd > 0) { b.keeperCd--; return; }
    // 몰고 들어오는 공도 걷어낸다(2026-08-25). 단 **공격당하는 쪽 골키퍼만** — 자기 진영 골키퍼까지
    // 자기 팀 드리블을 뺏으면 수비가 공을 몰고 나올 수가 없다.
    var carrier = b.owner >= 0 ? state.players[b.owner] : null;
    if (b.owner >= 0 && !carrier) return;
    var stealSide = carrier ? (1 - sideOf(state, carrier.team)) : -1;
    var hitR = (carrier ? K.stealR : K.saveR) + C.BALL_R + K.hitPad;
    // 관통(대포알)은 **찬 사람이 공격하는 쪽 골키퍼**만 통과한다. 자기 진영 골키퍼까지 통과하면 빗나간 공이 자책골이 된다.
    var pierceSide = -1;
    if (b.pierce && b.lastKicker >= 0 && state.players[b.lastKicker]) {
      pierceSide = 1 - sideOf(state, state.players[b.lastKicker].team);
    }
    for (var k = 0; k < 2; k++) {
      if (k === pierceSide) continue;
      if (carrier && k !== stealSide) continue;
      var gx = keeperX(state.W, k), gy = state.keepers[k].y;
      // 선분 (prev → 현재) 위에서 골키퍼 중심에 가장 가까운 점
      var sx = b.x - prevX, sy = b.y - prevY, len2 = sx * sx + sy * sy;
      var t = len2 > 0 ? clamp(((gx - prevX) * sx + (gy - prevY) * sy) / len2, 0, 1) : 0;
      var cx = prevX + sx * t, cy = prevY + sy * t;
      if (Math.hypot(cx - gx, cy - gy) > hitR) continue;
      // 튕겨내는 방향: 골키퍼 중심 → 접촉점. 단 골대 쪽으로는 보내지 않는다(경기장 안쪽 성분 강제).
      var dx = cx - gx, dy = cy - gy, d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = k === 0 ? 1 : -1; dy = 0; d = 1; }
      var ux = dx / d, uy = dy / d;
      var inward = k === 0 ? 1 : -1;
      if (ux * inward < 0.45) {                 // 골라인 쪽이면 앞쪽으로 꺾어 준다
        ux = inward * 0.75; uy = uy >= 0 ? 0.66 : -0.66;
        var n = Math.hypot(ux, uy); ux /= n; uy /= n;
      }
      var shooter = b.lastKicker;                                   // 아래에서 지워지므로 먼저 잡아 둔다
      if (carrier) carrier.touchCd = TUNING.player.touchCdTicks;   // 뺏긴 선수는 바로 다시 못 잡는다
      b.x = gx + ux * (hitR + 1); b.y = gy + uy * (hitR + 1);
      b.vx = ux * K.outSpeed; b.vy = uy * K.outSpeed;
      b.range = K.outRange; b.range0 = K.outRange; b.spin = 0; b.spinLeft = 0; b.owner = -1; b.lastKicker = -1;
      b.kickCd = 0; b.keeperCd = K.outCdTicks;
      state.keepers[k].hitT = 6;
      // 기록: 골키퍼가 막았다 = 골문으로 갔다는 뜻이므로 **찬 선수에게 유효슈팅** 하나.
      // (몰고 들어오다 뺏긴 것은 슈팅이 아니므로 세지 않는다.)
      if (!carrier && shooter >= 0 && state.players[shooter] && sideOf(state, state.players[shooter].team) !== k) note(state, shooter, 's');
      ev.push({ kind: 'keeperSave', side: k, steal: carrier ? 1 : 0, shooter: carrier ? -1 : shooter });
      return;
    }
  }

  // ── 공 ───────────────────────────────────────────────────────────────────
  function carryPos(p) {
    return [p.x + Math.cos(p.facing) * TUNING.ball.carryOffset, p.y + Math.sin(p.facing) * TUNING.ball.carryOffset];
  }

  // 들고 있는 공은 경기장 안에 둔다 — **단 골대 입구 폭 안에서는 골라인을 넘어간다**(2026-08-25 사용자 지시:
  // "공을 가지고 골대로 들어가도 넣을 수 있게"). 즉 몰고 골문으로 들어가면 득점이다.
  // 그래서 골키퍼가 **몰고 오는 공도 걷어내도록** 바꿨다(keeperSave) — 그것이 유일한 방어 수단이다.
  function clampCarried(state, b) {
    var R = C.BALL_R, W = state.W, D = C.GOAL_DEPTH;
    b.y = clamp(b.y, R, state.H - R);
    if (b.y > state.goalY0 + R && b.y < state.goalY1 - R) b.x = clamp(b.x, -D + R, W + D - R);
    else b.x = clamp(b.x, R, W - R);
  }

  // 소유를 풀고 속도·거리·회전을 준다. 찬 사람은 잠깐 다시 못 잡는다.
  function releaseBall(state, p, dir, speed, range, spin, pierce) {
    var b = state.ball, pos = carryPos(p);
    b.x = pos[0]; b.y = pos[1];
    b.vx = Math.cos(dir) * speed; b.vy = Math.sin(dir) * speed;
    b.range = range; b.range0 = range; b.spin = spin || 0; b.spinLeft = 0; b.pierce = pierce ? 1 : 0;
    // 어시스트: **직전에 공을 찬 사람이 우리 팀의 다른 선수면** 그 사람을 후보로 남긴다.
    // 상대가 중간에 찼으면 자연히 -1 이 되어 끊긴다(팀이 다르므로).
    var prev = b.lastKicker, prevP = prev >= 0 ? state.players[prev] : null;
    b.assist = (prevP && prev !== p.slot && prevP.team === p.team) ? prev : -1;
    b.owner = -1; b.lastKicker = p.slot; b.kickCd = TUNING.ball.kickCdTicks;
    p.charge = 0; p.chargeKind = 0;
    clampCarried(state, b);
  }

  function kickPass(state, p, ev) {
    var P = TUNING.pass, cone = P.coneDeg * Math.PI / 180;
    var best = null, bestD = Infinity;
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var q = state.players[s];
      if (!q || q === p || q.team !== p.team) continue;
      var ang = Math.atan2(q.y - p.y, q.x - p.x);
      if (Math.abs(angleDiff(p.facing, ang)) > cone) continue;
      var d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    var dir, range;
    if (best) {
      var t = bestD / P.speed * P.lead;  // 받는 사람 움직임을 조금 앞질러 준다
      var tx = best.x + best.vx * t, ty = best.y + best.vy * t;
      dir = normAngle(Math.atan2(ty - p.y, tx - p.x));
      range = Math.max(0, Math.hypot(tx - p.x, ty - p.y) - TUNING.ball.carryOffset + P.rangePad);
    } else { dir = p.facing; range = P.rangeNoTarget; }
    releaseBall(state, p, dir, P.speed, range, 0, 0);
    ev.push({ kind: 'pass', slot: p.slot, to: best ? best.slot : -1 });
  }

  // 충전이 없다: 누르면 항상 같은 속도·같은 거리로 나간다(5차 지시). 캐릭터 shot 배율과 대포알만 세기를 바꾼다.
  /* 논스톱 슛 — 공을 잡지 않은 채 발 앞의 굴러오는 공을 그대로 찬다.
     범위 안에 없으면 false 를 돌려 평범한 앞차기로 넘어간다. */
  function kickVolley(state, p, ev) {
    var K = TUNING.kick, S = TUNING.shoot, b = state.ball;
    if (b.owner >= 0) return false;                     // 누군가 몰고 있으면 논스톱이 아니다
    if (b.kickCd > 0 && b.lastKicker === p.slot) return false;
    var fx = p.x + Math.cos(p.facing) * TUNING.ball.carryOffset;
    var fy = p.y + Math.sin(p.facing) * TUNING.ball.carryOffset;
    if (Math.hypot(b.x - fx, b.y - fy) > K.volleyR) return false;
    var mul = CHARACTERS[p.char].shot * K.volleyMul * (ultActive(p, 'power') ? ultOf(p).shotMul : 1);
    releaseBall(state, p, p.facing, S.speed * mul, S.range * K.volleyMul, 0, 0);
    ev.push({ kind: 'volley', slot: p.slot });
    return true;
  }
  function kickShoot(state, p, ev) {
    var S = TUNING.shoot, ch = CHARACTERS[p.char];
    var boosted = ultActive(p, 'power');
    var mul = ch.shot * (boosted ? ultOf(p).shotMul : 1);
    releaseBall(state, p, p.facing, S.speed * mul, S.range, 0, boosted ? 1 : 0);
    if (boosted && ultOf(p).oneShot) { p.ultT = 0; p.ultAnimT = 0; }   // 대포알은 한 발만
    ev.push({ kind: 'shoot', slot: p.slot, speed: Math.round(S.speed * mul), pierce: boosted });
  }
  function kickCurve(state, p, sign, ev) {
    var Q = TUNING.curve, ch = CHARACTERS[p.char];
    var k = clamp((p.chargeQ || 0) / Q.chargeTicks, 0, 1);
    var spin = (Q.spinMin + (Q.spinMax - Q.spinMin) * k) * sign;
    releaseBall(state, p, p.facing, Q.speed * ch.shot, Q.range, spin, 0);
    state.ball.spinLeft = Q.turnMax;   // 총 회전량 상한 — 넘으면 직선으로 편다
    ev.push({ kind: 'curve', slot: p.slot, power: k, dir: sign });
  }

  // 누른 시간(0~chargeTicks)에 따라 속도·거리가 늘어난다. 톡 치면 발 앞, 꾹 누르면 앞으로 길게 친다.
  // 드리블 킥. chargeD 가 거리, chargeQ 가 휘는 정도를 정한다(둘은 서로 다른 버튼의 누른 시간이다).
  // 감아차기를 같이 모아 두었으면 **짧게 휘는 드리블**이 된다 — 수비 한 명을 감아 넘기는 용도.
  function kickDribble(state, p, chargeD, chargeQ, side, ev) {
    var D = TUNING.dribble, Q = TUNING.curve;
    var k = clamp(chargeD / D.chargeTicks, 0, 1);
    var speed = D.minSpeed + (D.maxSpeed - D.minSpeed) * k;
    var range = D.minRange + (D.maxRange - D.minRange) * Math.pow(k, D.rangePow);
    var kq = clamp((chargeQ || 0) / Q.chargeTicks, 0, 1);
    var spin = kq > 0 ? (Q.spinMin + (D.spinMax - Q.spinMin) * kq) * (side || 1) : 0;
    releaseBall(state, p, p.facing, speed, range, spin, 0);
    if (spin) state.ball.spinLeft = D.turnMax;   // 감아차기보다 훨씬 짧게만 휜다
    ev.push({ kind: 'dribble', slot: p.slot, charge: Math.round(k * 100), curve: Math.round(kq * 100) });
  }

  function inNet(state, b) { return b.x < 0 || b.x > state.W; }

  // 벽·골망 처리. 속도 크기는 유지하고 방향만 반사한다. 반환값 = 반사 횟수 (남은 거리 감소용).
  // wasInNet: 이동 전에 이미 골망 안이었나(한 틱에 벽을 뚫는 빠른 공을 골망 진입과 구분). bounce=false 면 밀어 넣기만.
  // prevX/prevY: 이동 전 위치. 주면 골라인을 **넘는 순간**의 y 로 입구를 판정한다.
  // (이동이 끝난 뒤의 y 로 판정하면 한 틱에 최대 72단위 움직이는 강슛이 기둥 바깥을 지나고도 골이 된다)
  function clampBall(state, b, bounce, wasInNet, prevX, prevY) {
    var R = C.BALL_R, W = state.W, H = state.H, D = C.GOAL_DEPTH, e = bounce ? 1 : 0, n = 0;
    var Y0 = state.goalY0 + R, Y1 = state.goalY1 - R;
    if (wasInNet) {
      // 골망 안: 그물은 부드럽다(반사 뒤 남은 거리는 moveBall 이 크게 줄인다). 골라인 쪽으로 다시 나오지 못한다.
      if (b.y < Y0) { b.y = Y0; b.vy = -b.vy * e; n++; } else if (b.y > Y1) { b.y = Y1; b.vy = -b.vy * e; n++; }
      if (b.x < W / 2) {
        if (b.x < -D + R) { b.x = -D + R; b.vx = -b.vx * e; n++; } else if (b.x > -R) { b.x = -R; b.vx = -b.vx * e; n++; }
      } else {
        if (b.x > W + D - R) { b.x = W + D - R; b.vx = -b.vx * e; n++; } else if (b.x < W + R) { b.x = W + R; b.vx = -b.vx * e; n++; }
      }
      return n;
    }
    // 골라인(벽면 x = R / W-R)을 이번 틱에 넘었다면 그 교차점의 y 로 판정한다
    var mouthY = b.y;
    if (prevX !== undefined && b.x !== prevX) {
      var line = b.x < R ? R : (b.x > W - R ? W - R : null);
      if (line !== null) {
        var t = (line - prevX) / (b.x - prevX);
        if (t >= 0 && t <= 1) mouthY = prevY + (b.y - prevY) * t;
      }
    }
    var inMouth = mouthY > Y0 && mouthY < Y1;   // 골대 입구 폭 안이면 골라인을 넘어 골망으로 들어간다
    if (!inMouth) {
      if (b.x < R) { b.x = R; b.vx = -b.vx * e; n++; } else if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * e; n++; }
    } else {
      // 골망으로 들어간 첫 틱에도 뒷그물 밖으로 나가지 않게 잡아 준다
      if (b.x < -D + R) { b.x = -D + R; b.vx = -b.vx * e; n++; }
      else if (b.x > W + D - R) { b.x = W + D - R; b.vx = -b.vx * e; n++; }
      b.y = clamp(b.y, Y0, Y1);
    }
    if (b.y < R) { b.y = R; b.vy = -b.vy * e; n++; } else if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * e; n++; }
    return n;
  }

  // 등속 이동: 남은 거리(range)만큼만 간다. spin 이 있으면 방향이 매 틱 회전한다(감아차기).
  function moveBall(state, b) {
    if (b.range <= 0) { b.vx = 0; b.vy = 0; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0; return; }
    var wasInNet = inNet(state, b);
    var sp = Math.hypot(b.vx, b.vy);
    if (sp === 0) { b.range = 0; b.spin = 0; b.spinLeft = 0; return; }
    if (b.spin) {
      if (b.spinLeft > 0) {
        var turn = Math.abs(b.spin) > b.spinLeft ? (b.spin > 0 ? b.spinLeft : -b.spinLeft) : b.spin;
        b.spinLeft -= Math.abs(turn);
        var c = Math.cos(turn), s = Math.sin(turn);
        var nx = b.vx * c - b.vy * s, ny = b.vx * s + b.vy * c;
        b.vx = nx; b.vy = ny;
      } else b.spin = 0;
    }
    // 남은 거리에 따라 실제 속도가 준다(7차 지시). 총 이동 거리는 range 그대로다.
    var frac = b.range0 > 0 ? clamp(b.range / b.range0, 0, 1) : 1;
    var ease = TUNING.ball.slowMin + (1 - TUNING.ball.slowMin) * Math.sqrt(frac);   // 일정 감속도
    var move = Math.min(sp * ease * DT, b.range);
    var prevX = b.x, prevY = b.y;
    b.x += b.vx / sp * move; b.y += b.vy / sp * move;
    b.range -= move;
    var bounces = clampBall(state, b, true, wasInNet, prevX, prevY);
    for (var i = 0; i < bounces; i++) { b.range *= wasInNet ? 0.3 : TUNING.ball.bounceRangeKeep; b.spin *= 0.5; }
    if (b.range < 1) { b.range = 0; b.vx = 0; b.vy = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0; }
  }

  function updateBall(state) {
    var b = state.ball;
    if (b.kickCd > 0) b.kickCd--;
    if (b.owner >= 0) {
      var p = state.players[b.owner];
      if (!p) { b.owner = -1; moveBall(state, b); return; }
      var pos = carryPos(p);
      b.x = pos[0]; b.y = pos[1]; b.vx = p.vx; b.vy = p.vy; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
      clampCarried(state, b);
    } else moveBall(state, b);
  }

  function possession(state) {
    var b = state.ball;
    if (b.owner >= 0) return;
    var best = -1, bestD = TUNING.ball.possessRadius;
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p || p.stunT > 0 || p.touchCd > 0) continue;
      if (b.kickCd > 0 && s === b.lastKicker) continue;
      var d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best >= 0) {
      b.owner = best; b.kickCd = 0; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
      var pos = carryPos(state.players[best]);   // 잡는 순간 발 앞으로 (한 틱 지연 없이)
      b.x = pos[0]; b.y = pos[1]; b.vx = 0; b.vy = 0;
      clampCarried(state, b);
    }
  }

  function goalCheck(state, ev) {
    if (state.friendly) return;   // 대기 운동장: 골이 없다
    var b = state.ball;
    if (b.x >= 0 && b.x <= state.W) return;
    // 왼쪽 골(x<0)은 왼쪽 진영 팀이 지킨다 → 오른쪽 팀 득점
    var side = b.x < 0 ? 1 : 0;
    var team = teamOnSide(state, side);
    state.score[team]++;
    state.kickoffTeam = 1 - team;
    state.phase = PHASE.GOAL; state.phaseTimer = C.GOAL_TICKS;
    if (b.owner >= 0) { b.owner = -1; b.range = 0; b.vx = 0; b.vy = 0; }
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p) continue;
      var g = p.team === team ? TUNING.ult.goalScored : TUNING.ult.goalConceded;
      p.ult = Math.min(TUNING.ult.fullTicks, p.ult + g);
    }
    // 기록: 넣은 선수에게 골 하나와 유효슈팅 하나. 자책골(내 팀 골대)은 아무에게도 주지 않는다.
    var sc = state.players[b.lastKicker];
    if (sc && sc.team === team) {
      note(state, b.lastKicker, 'g'); note(state, b.lastKicker, 's');
      var as = b.assist >= 0 ? state.players[b.assist] : null;
      if (as && as.team === team && b.assist !== b.lastKicker) note(state, b.assist, 'a');
    }
    ev.push({ kind: 'goal', team: team, scorer: b.lastKicker, score: [state.score[0], state.score[1]] });
  }

  // ── 단계·시계 ─────────────────────────────────────────────────────────────
  function advancePhase(state, ev) {
    switch (state.phase) {
      case PHASE.PLAY:
        if (--state.clock <= 0) {
          state.clock = 0;
          // 1하프 끝 → 하프타임. 2하프 끝에 동점이면 연장(3·4하프 각 30초). 4하프 끝나면 동점이어도 무승부로 끝낸다.
          var tied = state.score[0] === state.score[1];
          var goExtra = (state.half === 2 && tied) || state.half === 3;
          if (state.half === 1 || goExtra) {
            state.phase = PHASE.HALF; state.phaseTimer = C.HALF_TICKS;
            ev.push({ kind: 'half', half: state.half, next: state.half + 1,
                      score: [state.score[0], state.score[1]], table: statTable(state) });
          } else {
            state.phase = PHASE.END; state.phaseTimer = C.END_TICKS;
            ev.push({ kind: 'end', score: [state.score[0], state.score[1]], table: statTable(state), mom: pickMom(state) });
          }
        }
        return;
      case PHASE.LOBBY:
        return;
    }
    if (--state.phaseTimer > 0) return;
    switch (state.phase) {
      case PHASE.KICKOFF:
        state.phase = PHASE.PLAY; ev.push({ kind: 'play' }); break;
      case PHASE.GOAL:
        resetPositions(state);
        state.phase = PHASE.KICKOFF; state.phaseTimer = C.REKICKOFF_TICKS; ev.push({ kind: 'kickoff', team: state.kickoffTeam }); break;
      case PHASE.HALF:
        state.half++;
        // 연장(3·4하프)은 30초씩. 킥오프는 하프마다 번갈아.
        state.clock = (state.half >= 3 ? C.EXTRA_SEC * C.TICK_HZ : state.halfTicks);
        state.kickoffTeam = (state.half - 1) % 2;
        resetPositions(state);
        state.phase = PHASE.KICKOFF; state.phaseTimer = C.KICKOFF_TICKS;
        ev.push({ kind: 'kickoff', team: state.kickoffTeam, half: state.half }); break;
      case PHASE.END:
        state.phase = PHASE.LOBBY; ev.push({ kind: 'lobby' }); break;
    }
  }

  // inputs: 슬롯별 {dx, dy, buttons} 또는 비어 있음. 반환: 이번 틱의 이벤트 배열(재사용됨 — 복사해서 보관할 것).
  function step(state, inputs) {
    var ev = state.events; ev.length = 0;
    state.tick++;
    var play = state.phase === PHASE.PLAY;
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p) continue;
      if (play && p.ult < TUNING.ult.fullTicks) p.ult++;   // 필살기 게이지는 시간이 지나면 찬다
      updatePlayer(state, p, play && inputs ? inputs[s] : null, ev);
    }
    updateKeepers(state);
    separatePlayers(state);
    if (play) {
      kickHits(state, ev);
      chargeHits(state, ev);
    }
    var prevX = state.ball.x, prevY = state.ball.y;
    updateBall(state);
    if (play) {
      keeperSave(state, prevX, prevY, ev);
      possession(state);
      goalCheck(state, ev);
    }
    advancePhase(state, ev);
    return ev;
  }

  // ── 해시 (결정성 검증) ───────────────────────────────────────────────────
  function q(v) { return Math.round(v * 1000) | 0; }
  function hashState(state) {
    var h = 0x811c9dc5;
    function mix(n) {
      n |= 0;
      for (var i = 0; i < 4; i++) { h ^= (n >>> (i * 8)) & 255; h = Math.imul(h, 0x01000193); }
    }
    var b = state.ball;
    mix(state.tick); mix(state.phase); mix(state.phaseTimer); mix(state.half); mix(state.clock);
    mix(state.score[0]); mix(state.score[1]); mix(state.kickoffTeam);
    mix(q(b.x)); mix(q(b.y)); mix(q(b.vx)); mix(q(b.vy)); mix(q(b.range)); mix(q(b.range0)); mix(q(b.spin * 1000)); mix(q(b.spinLeft * 100)); mix(b.pierce);
    mix(b.owner); mix(b.lastKicker); mix(b.kickCd); mix(b.keeperCd);
    for (var k = 0; k < 2; k++) { mix(q(state.keepers[k].y)); mix(state.keepers[k].hitT); }
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p) { mix(-1); continue; }
      mix(p.slot); mix(p.team); mix(p.char);
      mix(q(p.x)); mix(q(p.y)); mix(q(p.vx)); mix(q(p.vy)); mix(q(p.facing));
      mix(p.prevButtons); mix(p.charge); mix(p.chargeKind);
      mix(p.kickT); mix(p.kickKind); mix(p.kickCd); mix(p.freezeT);
      mix(p.stunT); mix(p.immuneT); mix(p.touchCd); mix(p.knockT); mix(q(p.knockDir));
      mix(p.stam); mix(p.stamLock);
      mix(p.ult); mix(p.ultT); mix(p.ultAnimT); mix(q(p.ultX)); mix(q(p.ultY));
    }
    return h >>> 0;
  }

  // ── 인코딩 (CLAUDE.md §6) ────────────────────────────────────────────────
  // 입력 6바이트: [0x01, seq u16 LE, buttons u8, dx i8, dy i8]  (dx,dy: -127~127 → -1~1)
  var INPUT_BYTES = 6;
  function i8(v) { return Math.round(clamp(v, -1, 1) * 127) & 255; }
  /* 입력 6B: [0x01, seq u16 LE, buttons u8, dx i8, dy i8]
     **인자 차례가 바이트 차례와 같아야 한다**(seq, buttons, dx, dy).
     2026-08-26 까지 선언이 (seq, dx, dy, buttons) 였는데 부르는 쪽은 둘 다
     (seq, buttons, dx, dy) 로 넘기고 있었다 → 온라인에서 **좌우 입력이 세로로 가고
     버튼이 가로 이동이 되는** 버그가 났다. 연습장은 이 함수를 안 거쳐서 멀쩡했다. */
  function encodeInput(seq, buttons, dx, dy, out) {
    var u8 = out || new Uint8Array(INPUT_BYTES);
    u8[0] = 0x01;
    u8[1] = seq & 255; u8[2] = (seq >> 8) & 255;
    u8[3] = buttons & BTN_MASK;
    u8[4] = i8(dx); u8[5] = i8(dy);
    return u8;
  }
  function decodeInput(u8) {
    if (!u8 || u8.length < INPUT_BYTES || u8[0] !== 0x01) return null;
    var dx = u8[4] > 127 ? u8[4] - 256 : u8[4], dy = u8[5] > 127 ? u8[5] - 256 : u8[5];
    return { seq: u8[1] | (u8[2] << 8), buttons: u8[3] & BTN_MASK, dx: clamp(dx / 127, -1, 1), dy: clamp(dy / 127, -1, 1) };
  }

  // 스냅샷: 헤더 29B + 선수당 13B (CLAUDE.md §6)
  // 선수 13B: slot u8, x i16, y i16, vx i16, vy i16, facing u8, state u8, ult u8, motion u8
  //   motion 바이트: 하위 4비트 동작(MOTION), 상위 4비트 충전 0~15
  // 헤더 30B: … 28 인원수 + **29 경기장 번호**(FIELDS 색인). 경기장 크기가 방마다 달라서
  // 클라이언트가 스냅샷만 보고도 골대·골키퍼 위치를 알 수 있어야 한다.
  var SNAP_HEADER = 30, SNAP_PLAYER = 13;
  function snapshotSize(state) {
    var n = 0;
    for (var s = 0; s < C.MAX_PLAYERS; s++) if (state.players[s]) n++;
    return SNAP_HEADER + SNAP_PLAYER * n;
  }
  function f4(v) { return clamp(Math.round(v * 4), -32768, 32767); }
  function motionOf(p) {
    if (p.stunT > 0) return MOTION.STUN;
    if (p.ultAnimT > 0) return MOTION.ULT;
    if (p.kickT > 0) return p.kickKind === 2 ? MOTION.FART : MOTION.KICK;   // kind 1·3 은 같은 발차기 그림
    if (Math.hypot(p.vx, p.vy) > 1) return MOTION.RUN;
    return MOTION.IDLE;
  }
  function encodeSnapshot(state, serverMs, out) {
    var size = snapshotSize(state);
    var u8 = (out && out.length >= size) ? out : new Uint8Array(size);
    var dv = new DataView(u8.buffer, u8.byteOffset, size);
    var b = state.ball;
    dv.setUint8(0, 0x02);
    dv.setUint32(1, state.tick >>> 0, true);
    dv.setUint32(5, (serverMs || 0) >>> 0, true);
    // 하프가 4개(연장 포함)라 1비트로는 모자란다 → 하위 4비트 단계 + 4~5비트 하프(0~3)
    dv.setUint8(9, (state.phase & 15) | (((state.half - 1) & 3) << 4));
    dv.setUint8(10, Math.min(255, state.score[0]));
    dv.setUint8(11, Math.min(255, state.score[1]));
    dv.setUint16(12, Math.min(65535, state.clock), true);
    dv.setInt16(14, f4(b.x), true); dv.setInt16(16, f4(b.y), true);
    dv.setInt16(18, f4(b.vx), true); dv.setInt16(20, f4(b.vy), true);
    dv.setUint8(22, b.owner < 0 ? 255 : b.owner);
    dv.setInt16(23, f4(state.keepers[0].y), true); dv.setInt16(25, f4(state.keepers[1].y), true);
    dv.setUint8(27, (state.keepers[0].hitT > 0 ? 1 : 0) | (state.keepers[1].hitT > 0 ? 2 : 0));
    var n = 0, off = SNAP_HEADER;
    for (var s = 0; s < C.MAX_PLAYERS; s++) {
      var p = state.players[s];
      if (!p) continue;
      n++;
      var flags = (p.team ? ST.TEAM : 0) | (b.owner === s ? ST.HAS_BALL : 0) | (p.kickT > 0 ? ST.KICKING : 0) |
                  (p.stunT > 0 ? ST.STUNNED : 0) | (p.charge > 0 ? ST.CHARGING : 0) |
                  (p.ultT > 0 ? ST.ULT_ON : 0) | (p.kickKind === 2 && p.kickT > 0 ? ST.FART : 0) |
                  (ultReady(p) ? ST.ULT_READY : 0);
      dv.setUint8(off, s);
      dv.setInt16(off + 1, f4(p.x), true); dv.setInt16(off + 3, f4(p.y), true);
      dv.setInt16(off + 5, f4(p.vx), true); dv.setInt16(off + 7, f4(p.vy), true);
      dv.setUint8(off + 9, Math.round(normAngle(p.facing) / TAU * 256) & 255);
      dv.setUint8(off + 10, flags);
      // 선수 레코드를 13B 로 유지하려고 한 바이트를 나눠 쓴다: 하위 4비트 필살기 게이지, 상위 4비트 체력
      dv.setUint8(off + 11, Math.min(15, Math.round(p.ult / TUNING.ult.fullTicks * 15)) |
                            (Math.min(15, Math.round(p.stam / TUNING.player.staminaMax * 15)) << 4));
      dv.setUint8(off + 12, (motionOf(p) & 15) | (Math.min(15, Math.round(p.charge / TUNING.curve.chargeTicks * 15)) << 4));
      off += SNAP_PLAYER;
    }
    dv.setUint8(28, n);
    var fi = 0; for (var q = 0; q < FIELDS.length; q++) if (FIELDS[q].id === state.field) fi = q;
    dv.setUint8(29, fi);
    return u8.length === size ? u8 : u8.subarray(0, size);
  }
  function decodeSnapshot(u8) {
    if (!u8 || u8.length < SNAP_HEADER || u8[0] !== 0x02) return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var phaseByte = dv.getUint8(9);
    var n = dv.getUint8(28);
    if (u8.length < SNAP_HEADER + SNAP_PLAYER * n) return null;
    var kf = dv.getUint8(27);
    var F = FIELDS[dv.getUint8(29)] || FIELDS[1];
    var W = F.w, H = F.h;
    var snap = {
      field: F.id, W: W, H: H, goalY0: H / 2 - H * C.GOAL_RATIO, goalY1: H / 2 + H * C.GOAL_RATIO,
      tick: dv.getUint32(1, true), serverMs: dv.getUint32(5, true),
      phase: phaseByte & 15, phaseName: PHASE_NAME[phaseByte & 15] || 'lobby', half: ((phaseByte >> 4) & 3) + 1,
      score: [dv.getUint8(10), dv.getUint8(11)], clock: dv.getUint16(12, true),
      ball: { x: dv.getInt16(14, true) / 4, y: dv.getInt16(16, true) / 4, vx: dv.getInt16(18, true) / 4, vy: dv.getInt16(20, true) / 4, owner: dv.getUint8(22) },
      keepers: [
        { side: 0, x: keeperX(W, 0), y: dv.getInt16(23, true) / 4, save: !!(kf & 1) },
        { side: 1, x: keeperX(W, 1), y: dv.getInt16(25, true) / 4, save: !!(kf & 2) }
      ],
      players: []
    };
    if (snap.ball.owner === 255) snap.ball.owner = -1;
    var off = SNAP_HEADER;
    for (var i = 0; i < n; i++) {
      var flags = dv.getUint8(off + 10), mb = dv.getUint8(off + 12);
      snap.players.push({
        slot: dv.getUint8(off), team: (flags & ST.TEAM) ? 1 : 0,
        x: dv.getInt16(off + 1, true) / 4, y: dv.getInt16(off + 3, true) / 4,
        vx: dv.getInt16(off + 5, true) / 4, vy: dv.getInt16(off + 7, true) / 4,
        facing: dv.getUint8(off + 9) / 256 * TAU,
        flags: flags,
        ult: (dv.getUint8(off + 11) & 15) / 15,                 // 0~1 필살기 게이지 (4비트)
        stam: (dv.getUint8(off + 11) >> 4) / 15,                // 0~1 달리기 체력 (4비트)
        motion: mb & 15, motionName: MOTION_NAME[mb & 15] || 'idle',
        charge: (mb >> 4) / 15                                  // 0~1 충전
      });
      off += SNAP_PLAYER;
    }
    return snap;
  }

  /* ── 연습장용 인공지능 (2026-08-25 사용자 지시: 혼자 하면 2:2) ─────────────
     **`step()` 안에서는 절대 부르지 않는다.** 입력을 만들어 주는 것뿐이라 서버 권위와 결정성에 영향이 없다.
     난수를 쓰지 않고 `state.tick` 과 좌표만 본다 — 같은 상태면 같은 입력이 나온다. */
  var AI = (function () {
    var mem = [];
    function reset() { mem.length = 0; }
    function memOf(slot) { return mem[slot] || (mem[slot] = { ch: 0 }); }
    function nearestFoe(state, p) {
      var best = null, bd = Infinity;
      for (var s = 0; s < C.MAX_PLAYERS; s++) {
        var q = state.players[s];
        if (!q || q.team === p.team || q.stunT > 0) continue;
        var d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = q; }
      }
      return { p: best, d: bd };
    }
    // 우리 팀에서 공에 가장 가까운 사람인가 (동률이면 슬롯 번호가 작은 쪽 — 결정적)
    function isClosest(state, p) {
      var b = state.ball, myD = Math.hypot(b.x - p.x, b.y - p.y);
      for (var s = 0; s < C.MAX_PLAYERS; s++) {
        var q = state.players[s];
        if (!q || q.team !== p.team || q === p || q.stunT > 0) continue;
        var d = Math.hypot(b.x - q.x, b.y - q.y);
        if (d < myD || (d === myD && q.slot < p.slot)) return false;
      }
      return true;
    }
    /* 팀 안에서의 역할. 2 = 수비(팀마다 하나 보장), 0 = 공격, 1 = 중원. */
    function roleOf(state, slot) {
      var me = state.players[slot];
      if (!me) return 1;
      var mates = [];
      for (var s = 0; s < C.MAX_PLAYERS; s++) {
        var q = state.players[s];
        if (q && q.team === me.team) mates.push(s);
      }
      if (mates.length <= 1) return 1;                 // 혼자면 중원(수비만 하면 공격을 못 한다)
      if (slot === mates[mates.length - 1]) return 2;  // 팀의 마지막 슬롯 = 수비 담당
      return mates.indexOf(slot) % 2 === 0 ? 0 : 1;
    }
    function think(state, slot) {
      var out = { dx: 0, dy: 0, buttons: 0 };
      var p = state.players[slot];
      if (!p || state.phase !== PHASE.PLAY || p.stunT > 0) { memOf(slot).ch = 0; return out; }
      var b = state.ball, T = TUNING;
      var att = 1 - sideOf(state, p.team);              // 내가 공격하는 쪽
      var goalX = att === 0 ? 0 : state.W, goalY = state.H / 2;
      var myGoalX = att === 0 ? state.W : 0;           // 내가 지키는 골대
      /* 성향 3종 — 같은 인공지능이 다 몰려다니지 않게 슬롯마다 역할을 준다(2026-08-26 지시).
         0 공격형: 앞으로 나가 있고 멀리서도 슛한다. 수비 가담이 적다.
         1 중원형: 예전 그대로. 공을 쫓고 연결한다.
         2 수비형: 우리 진영을 지킨다. 공이 우리 쪽으로 넘어와야 달려든다. */
      /* 팀마다 **수비 하나는 반드시** 둔다(2026-08-26 지시) — 그 팀에서 슬롯이 가장 큰 인공지능이 수비다.
         사람이 섞여 있으면 사람은 세지 않는다. 나머지는 슬롯 차례대로 공격형·중원형이 번갈아 온다. */
      var role = roleOf(state, slot);
      var ROLE = [{ up: 0.80, home: 0.62, shootAt: 360, chase: 0.55, lane: 150 },
                  { up: 0.55, home: 0.45, shootAt: 300, chase: 1.00, lane: 90 },
                  { up: 0.30, home: 0.20, shootAt: 250, chase: 0.75, lane: 55 }][role];
      var lane = (slot % 2 === 0 ? -1 : 1) * ROLE.lane;   // 위/아래로 갈라서되 성향마다 폭이 다르다
      var m = memOf(slot), tx, ty, sprint = false;

      if (b.owner === slot) {
        // 내가 공을 갖고 있다 — 골대로 몰고 가다가 사거리에 들면 충전 슛
        var dg = Math.hypot(goalX - p.x, goalY - p.y);
        var foe = nearestFoe(state, p);
        if (dg < ROLE.shootAt) {
          if (m.ch < 9) { m.ch++; out.buttons |= BTN.KICK; } else m.ch = 0;   // 9틱 충전 후 놓기 = 슛
          tx = goalX; ty = goalY;
        } else {
          m.ch = 0;
          if (foe.p && foe.d < 70 && state.tick % 7 === 0) out.buttons |= BTN.PASS;   // 붙으면 패스
          tx = goalX; ty = goalY + (p.y - goalY) * 0.35 + lane * 0.3;
          sprint = p.stam > T.player.staminaMax * 0.45 && foe.d > 60;
        }
      } else if (b.owner >= 0 && state.players[b.owner] && state.players[b.owner].team === p.team) {
        // 팀원이 갖고 있다 — 앞쪽으로 벌려서 받을 자리를 잡는다
        m.ch = 0;
        var mate = state.players[b.owner];
        tx = mate.x + (goalX - mate.x) * ROLE.up; ty = clamp(mate.y + lane, 80, state.H - 80);
        sprint = p.stam > T.player.staminaMax * 0.6;
      } else if (b.owner >= 0) {
        // 상대가 갖고 있다 — 가장 가까운 한 명만 달려들고 나머지는 골문 앞을 지킨다
        m.ch = 0;
        var car = state.players[b.owner];
        // 수비형은 공이 우리 진영 가까이 올 때만 달려든다 — 셋이 한꺼번에 몰리지 않게.
        var farFromHome = Math.hypot(car.x - myGoalX, car.y - goalY);
        var willChase = isClosest(state, p) && (role !== 2 || farFromHome < 520);
        if (willChase) {
          tx = car.x + car.vx * 0.25; ty = car.y + car.vy * 0.25;   // 가는 앞을 자른다
          var d = Math.hypot(car.x - p.x, car.y - p.y);
          if (d < T.kick.range * 0.95) out.buttons |= BTN.KICK;     // 사거리에 들면 발차기로 기절
          sprint = p.stam > T.player.staminaMax * 0.35 && d > 60;
        } else if (Math.hypot(car.x - myGoalX, car.y - goalY) < 420) {
          // 우리 진영까지 밀렸으면 둘째도 붙는다 — 공 든 상대와 우리 골대 사이 70 (슛 길목)
          var ux = myGoalX - car.x, uy = goalY - car.y, ul = Math.hypot(ux, uy) || 1;
          tx = car.x + ux / ul * 70; ty = car.y + uy / ul * 70;
          if (Math.hypot(car.x - p.x, car.y - p.y) < T.kick.range * 0.95) out.buttons |= BTN.KICK;
        } else {
          // 멀리 있으면 남은 상대를 맡는다(2:2 라 한 명씩)
          var mark = null, md = Infinity;
          for (var s2 = 0; s2 < C.MAX_PLAYERS; s2++) {
            var o = state.players[s2];
            if (!o || o.team === p.team || o === car) continue;
            var od = Math.hypot(o.x - myGoalX, o.y - goalY);
            if (od < md) { md = od; mark = o; }
          }
          if (mark) { tx = mark.x + (myGoalX - mark.x) * 0.28; ty = mark.y + (goalY - mark.y) * 0.28; }
          else { tx = myGoalX + (b.x - myGoalX) * 0.4; ty = clamp(goalY + (b.y - goalY) * 0.6 + lane * 0.35, 80, state.H - 80); }
        }
      } else {
        // 주인 없는 공
        m.ch = 0;
        // 공격형은 자기 진영 깊숙한 공은 주우러 가지 않는다(그 자리는 수비형 몫).
        var mine2 = isClosest(state, p) &&
          (role !== 0 || Math.hypot(b.x - myGoalX, b.y - goalY) > 300);
        if (mine2) { tx = b.x; ty = b.y; sprint = p.stam > T.player.staminaMax * 0.4; }
        else { tx = myGoalX + (b.x - myGoalX) * (0.25 + ROLE.home); ty = clamp(b.y + lane * 0.7, 80, state.H - 80); }
      }

      var vx = tx - p.x, vy = ty - p.y, len = Math.hypot(vx, vy);
      if (len > 6) { out.dx = vx / len; out.dy = vy / len; }
      if (sprint && len > 40) out.buttons |= BTN.SPRINT;
      return out;
    }
    return { reset: reset, think: think };
  })();

  // ── 자가 검사 (결정성·물리 수치) ──────────────────────────────────────────
  // 같은 seed·ticks 면 브라우저·Node 어디서든 같은 hash 가 나와야 한다.
  function selfTest(seed, ticks) {
    var state = createState({ halfSec: 150 });
    addPlayer(state, 0, 0, 0); addPlayer(state, 1, 0, 1); addPlayer(state, 2, 1, 2); addPlayer(state, 3, 1, 3);
    addPlayer(state, 4, 0, 4); addPlayer(state, 5, 1, 5);
    startMatch(state);
    // 선수들을 중앙에 모아 공 소유가 자주 일어나게 한다 — 슛·감아차기·패스까지 해시에 섞인다
    var spots = [[560, 400], [640, 400], [580, 340], [620, 460], [520, 440], [660, 360]];
    for (var i = 0; i < 6; i++) { state.players[i].x = spots[i][0]; state.players[i].y = spots[i][1]; }
    var r = rng(seed || 1), inputs = [], goals = 0, events = 0, kinds = {};
    for (var s = 0; s < 6; s++) inputs[s] = { dx: 0, dy: 0, buttons: 0 };
    for (var t = 0; t < (ticks || 600); t++) {
      if (t % 7 === 0) {
        for (s = 0; s < 6; s++) {
          inputs[s].dx = Math.floor(r() * 3) - 1; inputs[s].dy = Math.floor(r() * 3) - 1;
          var b = 0, x = r();
          if (x < 0.12) b = BTN.PASS;
          else if (x < 0.30) b = BTN.KICK;
          else if (x < 0.42) b = BTN.DRIBBLE;
          else if (x < 0.52) b = BTN.CURVE_L;
          else if (x < 0.62) b = BTN.CURVE_R;
          else if (x < 0.72) b = BTN.FART;
          else if (x < 0.78) b = BTN.ULT;
          inputs[s].buttons = b;
        }
      }
      var ev = step(state, inputs);
      events += ev.length;
      for (var i = 0; i < ev.length; i++) { kinds[ev[i].kind] = (kinds[ev[i].kind] || 0) + 1; if (ev[i].kind === 'goal') goals++; }
    }
    return { hash: hashState(state), goals: goals, events: events, ticks: state.tick, kinds: kinds };
  }

  // 경기장 중앙에서 speed·range·spin 으로 찬 공의 궤적 (감아차기 검증용)
  function ballTravel(speed, range, angle, spin, startX, startY) {
    var a = angle || 0;
    var b = { x: startX != null ? startX : C.FIELD_W / 2, y: startY != null ? startY : C.FIELD_H / 2,
              vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              range: range, spin: spin || 0, spinLeft: spin ? TUNING.curve.turnMax : 0, pierce: 0, owner: -1 };
    // moveBall 이 경기장 크기를 쓰므로 기본 경기장으로 가짜 state 를 하나 만든다(검증 도구 전용)
    var fake = { W: C.FIELD_W, H: C.FIELD_H, goalY0: C.GOAL_Y0, goalY1: C.GOAL_Y1 };
    var x0 = b.x, y0 = b.y;
    var t = 0, dist = 0, px = b.x, py = b.y, a0 = a, aLast = a, lateral = 0;
    while (b.range > 0 && t < 60) {
      moveBall(fake, b); t += DT;
      dist += Math.hypot(b.x - px, b.y - py); px = b.x; py = b.y;
      if (b.vx || b.vy) aLast = Math.atan2(b.vy, b.vx);
      // 처음 방향의 직선에서 옆으로 벗어난 거리(부호 있음) — 얼마나 휘었는지 눈에 보이는 값
      var lx = b.x - x0, ly = b.y - y0;
      var off = -Math.sin(a0) * lx + Math.cos(a0) * ly;
      if (Math.abs(off) > Math.abs(lateral)) lateral = off;
    }
    return { seconds: Math.round(t * 100) / 100, distance: Math.round(dist),
             finalX: Math.round(b.x), finalY: Math.round(b.y),
             bendDeg: Math.round(angleDiff(a0, aLast) * 180 / Math.PI),
             lateral: Math.round(lateral) };
  }

  return {
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    C: C, PHASE: PHASE, PHASE_NAME: PHASE_NAME, BTN: BTN, BTN_MASK: BTN_MASK, ST: ST,
    MOTION: MOTION, MOTION_NAME: MOTION_NAME, KEEPER_OWNER: KEEPER_OWNER,
    TUNING: TUNING, CHARACTERS: CHARACTERS,
    createState: createState, addPlayer: addPlayer, removePlayer: removePlayer, startMatch: startMatch, resetPositions: resetPositions,
    step: step, hashState: hashState, sideOf: sideOf, teamOnSide: teamOnSide, keeperX: keeperX, keeperY: keeperY,
    ultReady: ultReady, ultOf: ultOf, AI: AI,
    INPUT_BYTES: INPUT_BYTES, encodeInput: encodeInput, decodeInput: decodeInput,
    FIELDS: FIELDS, fieldOf: fieldOf,
    encodeSnapshot: encodeSnapshot, decodeSnapshot: decodeSnapshot, snapshotSize: snapshotSize,
    selfTest: selfTest, sim: { ballTravel: ballTravel, rng: rng }
  };
});
