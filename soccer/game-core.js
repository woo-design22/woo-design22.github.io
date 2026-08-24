/* game-core.js — 반대항축구 공유 시뮬레이션.
   브라우저에서는 window.SoccerCore, Node에서는 module.exports 로 같은 코드가 돈다.
   의존: 없음. DOM·WebSocket·Node API·Date.now() 참조 금지 — 같은 입력이면 어디서 돌려도 같은 결과(결정성)여야 한다.
   구조 상수는 CLAUDE.md §3과 같아야 하고, 게임플레이 수치의 정본은 이 파일의 TUNING·CHARACTERS 다.

   물리 모델(2026-08-24 사용자 지시):
   - 가속 없음. 선수는 입력 즉시 최고 속도, 떼면 즉시 정지.
   - 공은 찬 순간의 속도로 정해진 거리(range)만큼 등속으로 굴러간 뒤 멈춘다. 마찰 없음.
   - 감아차기는 속도 크기를 유지한 채 매 틱 방향만 회전시킨다(spin). 꾹 누를수록 회전율이 크다.
   - 발차기(D)·뒷발차기(S)는 공을 차는 동시에 상대를 기절시키는 공격이고, 시전자는 0.15초 멈춘다.
   - 골키퍼는 공·선수와 무관하게 tick 만의 함수로 좌우 왕복하고, 닿은 공을 멀리 튕겨낸다.
   - 필살기(A)는 시간이 지나며 차는 게이지로 발동하며 캐릭터마다 효과가 다르다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SoccerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROTOCOL_VERSION = 3;

  // ── 구조 상수 (CLAUDE.md §3) ─────────────────────────────────────────────
  var C = {
    TICK_HZ: 20, DT: 1 / 20,
    FIELD_W: 1200, FIELD_H: 800,
    GOAL_Y0: 300, GOAL_Y1: 500, GOAL_DEPTH: 40,
    PLAYER_R: 14, BALL_R: 6,
    MAX_PLAYERS: 20,
    KICKOFF_TICKS: 40,    // 경기 시작·후반 시작 킥오프 정지 2초
    GOAL_TICKS: 24,       // 득점 후 세리머니 1.2초 (공은 골망 안에서 계속 구른다)
    REKICKOFF_TICKS: 16,  // 득점 후 킥오프 정지 0.8초 (세리머니와 합쳐 2초)
    HALF_TICKS: 100,      // 하프타임 5초
    END_TICKS: 200        // 종료 화면 10초
  };
  var PHASE = { LOBBY: 0, KICKOFF: 1, PLAY: 2, GOAL: 3, HALF: 4, END: 5 };
  var PHASE_NAME = ['lobby', 'kickoff', 'play', 'goal', 'half', 'end'];

  // 입력 buttons 비트 (CLAUDE.md §6). 키: Z 패스 · D 슛/발차기 · W 드리블 · Q/E 감아차기 · S 뒷발차기 · A 필살기
  var BTN = { PASS: 1, KICK: 2, DRIBBLE: 4, CURVE_L: 8, CURVE_R: 16, BACKKICK: 32, ULT: 64 };
  var BTN_MASK = 127;
  // 스냅샷 state 비트
  var ST = { HAS_BALL: 1, KICKING: 2, STUNNED: 4, CHARGING: 8, ULT_ON: 16, BACKKICK: 32, ULT_READY: 64, TEAM: 128 };
  // 스냅샷 motion 하위 4비트
  var MOTION = { IDLE: 0, RUN: 1, KICK: 2, BACKKICK: 3, STUN: 4, ULT: 5 };
  var MOTION_NAME = ['idle', 'run', 'kick', 'backkick', 'stun', 'ult'];
  var KEEPER_OWNER = 100;   // (예약) ball.owner 가 100 + side 면 골키퍼 소유. 현재 골키퍼는 잡지 않고 튕겨내기만 한다.

  // ── 게임플레이 튜닝 — 정본. 문서에 복사하지 않는다 ────────────────────────
  var TUNING = {
    player: {
      maxSpeed: 220,      // 단위/초. 입력 즉시 이 속도, 떼면 즉시 0 (캐릭터 speed 배율)
      stunTicks: 12,      // 발차기에 맞으면 0.6초 기절
      stunImmuneTicks: 8, // 기절에서 깨어난 뒤 0.4초는 다시 기절하지 않는다 (연속 잠금 방지)
      knockback: 200,     // 맞은 선수가 밀려나는 속도
      knockTicks: 3,      // 밀려나는 시간 0.15초 (그 뒤 정지)
      touchCdTicks: 5     // 공을 뺏긴 직후 다시 잡을 수 없는 시간
    },
    // 기절(12) < 쿨다운(16) 이어야 한 명이 상대를 영구히 묶어 둘 수 없다. 이 부등식을 깨지 말 것.
    kick: {
      freezeTicks: 3,     // 시전자 정지 0.15초 (사용자 지시)
      animTicks: 5,       // 발차기 동작 0.25초
      hitTick: 4,         // 동작 시작 다음 틱(kickT === 4)에 판정이 한 번 일어난다
      cdTicks: 16,        // 앞차기 쿨다운 0.8초 — 헛치면 손해
      backCdTicks: 20,    // 뒷발차기 쿨다운 1.0초 (공을 든 채로도 쓰므로 더 길다)
      range: 44,          // 앞차기 판정 반지름 (선수 반지름 14 + 30)
      coneDeg: 55,        // 앞차기 판정 반각
      backRange: 38, backConeDeg: 55
    },
    ball: {
      possessRadius: 24,  // 선수 중심에서 이 거리 안이면 소유 (선수 반지름 14 + 10)
      carryOffset: 18,    // 드리블 중 공이 붙는 거리(바라보는 방향 앞)
      kickCdTicks: 5,     // 찬 사람이 곧바로 다시 잡지 못하는 시간
      bounceRangeKeep: 0.6 // 벽에 맞으면 남은 거리가 이 비율로 준다 (속도는 그대로)
    },
    dribble: { speed: 320, range: 64 },                       // W: 짧게 차기 — 발 앞 18 + 64 = 82 앞에서 멈춘다
    pass:    { speed: 420, coneDeg: 45, lead: 0.25, rangePad: 40, rangeNoTarget: 400 },
    shoot:   { minSpeed: 350, maxSpeed: 750, chargeTicks: 12, range: 2200 },   // D: 0~0.6초 충전
    // Q/E: 속도는 직선 슛보다 느리고 거리는 비슷하다(1400 ≈ 필드 종단).
    // turnMax 로 총 회전을 1.9rad(109°)에서 끊는다 — 없으면 최대 충전 시 공이 되돌아온다.
    curve:   { speed: 480, range: 1400, chargeTicks: 12, spinMin: 0.008, spinMax: 0.048, turnMax: 1.9 },
    backkick: { speed: 400, range: 320 },
    keeper: {
      x: 24, r: 14,       // r = 몸통(선수와 겹치지 않게 밀어내는 반지름)
      saveR: 30,          // 팔을 뻗어 막는 반지름. 판정 폭 (30+6+2)×2 = 76 → 골대 폭 200의 38%
      periodSec: 3.0,     // 주기 왕복(최고 180u/s). 좌우 골키퍼는 위상 π 차이(서로 반대편)
      amp: 86,            // y 314~486 — 몸통이 골대 기둥에 정확히 닿는 최대 진폭(반폭 100 − 반지름 14)
      hitPad: 2,          // 접촉 판정 여유
      outSpeed: 560, outRange: 760, outCdTicks: 4   // 튕겨낸 공
    },
    ult: {
      fullTicks: 900,     // 45초에 만충 (게이지 = 틱)
      goalScored: 40,     // 득점한 팀 +2초
      goalConceded: 160,  // 실점한 팀 +8초 — 이긴 팀이 더 강해지는 눈덩이를 막는다
      hitBonus: 60        // 발차기에 맞으면 맞은 쪽 +3초 (역전 여지)
    }
  };

  // ── 캐릭터 6종 — 반 친구 유형. 필살기는 A 하나(게이지식) ────────────────
  // ultKind: 'stunWave' 광역 기절 · 'power' 강슛+골키퍼 관통 · 'blink' 순간이동 · 'charge' 무적 돌진 · 'dash' 질주 · 'slow' 감속 장판
  var CHARACTERS = [
    { id: 0, key: 'captain',  name: '체육부장형',   speed: 1.00, shot: 1.00, kickRange: 1.00,
      ult: { name: '집합 호루라기', kind: 'stunWave', radius: 200, stunTicks: 24, durTicks: 12 } },
    // 대포알은 시간이 아니라 "다음 슛 한 발"을 강화한다. 5초 안에 쏘지 않으면 사라진다.
    { id: 1, key: 'ace',      name: '에이스형',     speed: 1.00, shot: 1.25, kickRange: 0.90,
      ult: { name: '대포알',       kind: 'power',    shotMul: 1.55, durTicks: 100, oneShot: true } },
    { id: 2, key: 'transfer', name: '전학생형',     speed: 0.95, shot: 1.00, kickRange: 1.00,
      ult: { name: '슬쩍 이동',    kind: 'blink',    dist: 240, durTicks: 12 } },
    { id: 3, key: 'big',      name: '덩치형',       speed: 0.85, shot: 1.10, kickRange: 1.40,
      ult: { name: '황소 돌진',    kind: 'charge',   speedMul: 1.45, stunTicks: 16, durTicks: 60 } },
    // 질주는 공을 몰고 있을 때는 배율이 낮다(carryMul) — 혼자 필드를 종단해 버리지 못하게
    { id: 4, key: 'runner',   name: '육상부형',     speed: 1.15, shot: 0.85, kickRange: 0.90,
      ult: { name: '전력 질주',    kind: 'dash',     speedMul: 1.60, carryMul: 1.25, durTicks: 100 } },
    // 장판은 발동한 자리에 고정된다(시전자를 따라다니지 않는다)
    { id: 5, key: 'prank',    name: '장난꾸러기형', speed: 1.00, shot: 0.95, kickRange: 1.00,
      ult: { name: '미끄러운 잔디', kind: 'slow',    radius: 190, speedMul: 0.60, durTicks: 100 } }
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
  function createState(opts) {
    opts = opts || {};
    var halfSec = opts.halfSec || 150;
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
      ball: { x: C.FIELD_W / 2, y: C.FIELD_H / 2, vx: 0, vy: 0, range: 0, spin: 0, spinLeft: 0, pierce: 0,
              owner: -1, lastKicker: -1, kickCd: 0, keeperCd: 0 },
      keepers: [{ side: 0, y: C.FIELD_H / 2, hitT: 0 }, { side: 1, y: C.FIELD_H / 2, hitT: 0 }],
      players: players,
      events: []
    };
  }
  function keeperX(side) { return side === 0 ? TUNING.keeper.x : C.FIELD_W - TUNING.keeper.x; }
  // 골키퍼 y 는 tick 만의 함수 — 공·선수와 무관하게 주기적으로 왕복한다(사용자 지시).
  function keeperY(tick, side) {
    var K = TUNING.keeper;
    var w = TAU / (K.periodSec * C.TICK_HZ);
    return C.FIELD_H / 2 + K.amp * Math.sin(w * tick + (side === 0 ? 0 : Math.PI));
  }

  function createPlayer(slot, team, charId) {
    var ch = CHARACTERS[charId] || CHARACTERS[0];
    return {
      slot: slot, team: team, char: ch.id,
      x: C.FIELD_W / 2, y: C.FIELD_H / 2, vx: 0, vy: 0,
      facing: team === 0 ? 0 : Math.PI,
      prevButtons: 0,
      charge: 0, chargeKind: 0,   // 0 없음 1 슛 2 감아차기왼쪽 3 감아차기오른쪽
      kickT: 0, kickKind: 0,      // 0 없음 1 앞차기 2 뒷발차기
      kickCd: 0, freezeT: 0,
      stunT: 0, immuneT: 0, touchCd: 0, knockT: 0, knockDir: 0,
      ult: 0, ultT: 0, ultAnimT: 0, ultX: 0, ultY: 0
    };
  }

  // 어느 팀이 어느 쪽(0 왼쪽, 1 오른쪽)인가. 후반엔 교대.
  function sideOf(state, team) { return state.half === 1 ? team : 1 - team; }
  function teamOnSide(state, side) { return state.half === 1 ? side : 1 - side; }

  function formationSpot(side, index, isKickoff) {
    var f = FORMATION[index % FORMATION.length];
    var fx = f[0], fy = f[1];
    if (index >= FORMATION.length) fy = clamp(fy + 60 * Math.floor(index / FORMATION.length), 60, C.FIELD_H - 60);
    if (isKickoff && index === 0) fx = C.FIELD_W / 2 - 15;  // 킥오프 팀 공격수는 공 바로 옆
    return [side === 0 ? fx : C.FIELD_W - fx, fy];
  }

  function placePlayer(state, p, index, isKickoff) {
    var side = sideOf(state, p.team);
    var spot = formationSpot(side, index, isKickoff);
    p.x = spot[0]; p.y = spot[1]; p.vx = 0; p.vy = 0;
    p.facing = side === 0 ? 0 : Math.PI;
    p.stunT = 0; p.immuneT = 0; p.charge = 0; p.chargeKind = 0; p.touchCd = 0; p.knockT = 0;
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
    b.x = C.FIELD_W / 2; b.y = C.FIELD_H / 2; b.vx = 0; b.vy = 0; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
    b.owner = -1; b.lastKicker = -1; b.kickCd = 0; b.keeperCd = 0;
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
      var nx = clamp(p.x + Math.cos(p.facing) * u.dist, C.PLAYER_R, C.FIELD_W - C.PLAYER_R);
      var ny = clamp(p.y + Math.sin(p.facing) * u.dist, C.PLAYER_R, C.FIELD_H - C.PLAYER_R);
      p.x = nx; p.y = ny;
      if (state.ball.owner === p.slot) { var pos = carryPos(p); state.ball.x = pos[0]; state.ball.y = pos[1]; clampCarried(state.ball); }
    }
  }

  function stunPlayer(state, v, ticks, dir, ev, bySlot) {
    var T = TUNING.player;
    if (v.immuneT > 0) return;              // 방금 깨어난 선수는 다시 눕히지 못한다
    if (ultActive(v, 'charge')) return;     // 황소 돌진 중에는 기절하지 않는다(면역 규칙은 여기 한 곳에만 둔다)
    v.stunT = ticks; v.touchCd = T.touchCdTicks; v.charge = 0; v.chargeKind = 0;
    v.knockT = T.knockTicks; v.knockDir = dir;
    v.kickT = 0; v.kickKind = 0; v.freezeT = 0;
    v.ult = Math.min(TUNING.ult.fullTicks, v.ult + TUNING.ult.hitBonus);
    if (state.ball.owner === v.slot) {
      var b = state.ball;
      b.owner = -1; b.lastKicker = v.slot; b.kickCd = TUNING.ball.kickCdTicks;
      b.vx = Math.cos(dir) * 120; b.vy = Math.sin(dir) * 120; b.range = 60; b.spin = 0; b.spinLeft = 0;
    }
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

    var speedMul = ch.speed * slowFactor(state, p);
    if (ultActive(p, 'dash')) speedMul *= (state.ball.owner === p.slot ? ultOf(p).carryMul : ultOf(p).speedMul);
    if (ultActive(p, 'charge')) speedMul *= ultOf(p).speedMul;
    var maxSpeed = T.maxSpeed * speedMul;
    p.vx = 0; p.vy = 0;

    if (p.stunT > 0) {
      p.stunT--;
      if (p.stunT === 0) p.immuneT = T.stunImmuneTicks;   // 깨어나면 잠깐 무적
      if (p.knockT > 0) { p.knockT--; p.vx = Math.cos(p.knockDir) * T.knockback; p.vy = Math.sin(p.knockDir) * T.knockback; }
      p.x = clamp(p.x + p.vx * DT, C.PLAYER_R, C.FIELD_W - C.PLAYER_R);
      p.y = clamp(p.y + p.vy * DT, C.PLAYER_R, C.FIELD_H - C.PLAYER_R);
      return;
    }

    var frozen = p.freezeT > 0;
    var b = state.ball, mine = b.owner === p.slot;

    if (!frozen && inp) {
      // 서버는 클라이언트를 믿지 않는다: NaN·Infinity 하나로 좌표와 해시가 영구 파손된다
      var dx = inp.dx, dy = inp.dy;
      if (!isFinite(dx)) dx = 0;
      if (!isFinite(dy)) dy = 0;
      var len = Math.hypot(dx, dy);
      if (len > 0.05 && isFinite(len)) {
        dx /= len; dy /= len;   // 방향만 쓴다 — 속도는 항상 maxSpeed
        p.vx = dx * maxSpeed; p.vy = dy * maxSpeed;
        p.facing = normAngle(Math.atan2(dy, dx));
      }

      // 필살기 (A)
      if ((pressed & BTN.ULT) && ultReady(p)) activateUlt(state, p, ev);

      // 뒷발차기 (S) — 공을 가진 상태에서도 쓸 수 있다
      if ((pressed & BTN.BACKKICK) && p.kickCd === 0) {
        startKick(state, p, 2, ev);
      // 앞차기 / 슛 (D)
      } else if ((buttons & BTN.KICK) && !mine && p.kickCd === 0) {
        startKick(state, p, 1, ev);            // 공이 없으면 누르는 즉시 발차기. 꾹 누르면 쿨다운마다 반복(연타와 같은 성능)
      } else if (mine && (buttons & BTN.KICK)) {
        p.chargeKind = 1;
        if (p.charge < TUNING.shoot.chargeTicks) p.charge++;
      } else if (mine && (released & BTN.KICK) && p.chargeKind === 1) {
        kickShoot(state, p, ev);
        startKick(state, p, 1, ev);
      // 감아차기 (Q 왼쪽 / E 오른쪽) — 공이 있을 때만
      } else if (mine && (buttons & (BTN.CURVE_L | BTN.CURVE_R))) {
        p.chargeKind = (buttons & BTN.CURVE_L) ? 2 : 3;
        if (p.charge < TUNING.curve.chargeTicks) p.charge++;
      } else if (mine && (released & (BTN.CURVE_L | BTN.CURVE_R)) && (p.chargeKind === 2 || p.chargeKind === 3)) {
        kickCurve(state, p, p.chargeKind === 2 ? -1 : 1, ev);
        startKick(state, p, 1, ev);
      // 패스 (Z)
      } else if (mine && (pressed & BTN.PASS)) {
        kickPass(state, p, ev);
      // 드리블 킥 (W) — 누르고 있으면 잡을 때마다 다시 찬다
      } else if (mine && (buttons & BTN.DRIBBLE)) {
        kickDribble(state, p, ev);
      }
      if (!mine || !(buttons & (BTN.KICK | BTN.CURVE_L | BTN.CURVE_R))) { p.charge = 0; p.chargeKind = 0; }
    } else if (!inp) {
      p.charge = 0; p.chargeKind = 0;
    }

    p.x = clamp(p.x + p.vx * DT, C.PLAYER_R, C.FIELD_W - C.PLAYER_R);
    p.y = clamp(p.y + p.vy * DT, C.PLAYER_R, C.FIELD_H - C.PLAYER_R);
  }

  // 발차기 동작 시작: 본인 0.15초 정지 + 판정용 타이머. kind 1 앞차기 / 2 뒷발차기
  function startKick(state, p, kind, ev) {
    var K = TUNING.kick;
    p.kickT = K.animTicks; p.kickKind = kind;
    p.freezeT = K.freezeTicks;
    p.kickCd = kind === 2 ? K.backCdTicks : K.cdTicks;
    p.vx = 0; p.vy = 0;
    if (kind === 2 && state.ball.owner === p.slot) kickBack(state, p, ev);
    ev.push({ kind: kind === 2 ? 'backkick' : 'kick', slot: p.slot });
  }

  // 발차기 판정 — 동작 시작 다음 틱에 한 번만 (결정적)
  function kickHits(state, ev) {
    var K = TUNING.kick;
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var a = state.players[i];
      if (!a || a.kickT !== K.hitTick) continue;
      var back = a.kickKind === 2;
      var dir = back ? normAngle(a.facing + Math.PI) : a.facing;
      var range = (back ? K.backRange : K.range) * CHARACTERS[a.char].kickRange;
      var cone = (back ? K.backConeDeg : K.coneDeg) * Math.PI / 180;
      for (var j = 0; j < C.MAX_PLAYERS; j++) {
        var v = state.players[j];
        if (!v || v.team === a.team || v.stunT > 0) continue;
        if (ultActive(v, 'charge')) continue;    // 돌진 중엔 기절하지 않는다
        var d = Math.hypot(v.x - a.x, v.y - a.y);
        if (d > range) continue;
        if (d > 0.001 && Math.abs(angleDiff(dir, Math.atan2(v.y - a.y, v.x - a.x))) > cone) continue;
        stunPlayer(state, v, TUNING.player.stunTicks, dir, ev, a.slot);
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
  function separatePlayers(state) {
    var ps = state.players, R2 = C.PLAYER_R * 2;
    for (var i = 0; i < C.MAX_PLAYERS; i++) {
      var a = ps[i]; if (!a) continue;
      for (var j = i + 1; j < C.MAX_PLAYERS; j++) {
        var b = ps[j]; if (!b) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.hypot(dx, dy);
        if (d >= R2) continue;
        if (d < 0.001) { dx = 1; dy = 0; d = 1; }
        var push = (R2 - d) / 2;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
      for (var k = 0; k < 2; k++) {
        var gx = keeperX(k), gy = keeperY(state.tick, k);
        var kx = a.x - gx, ky = a.y - gy, kd = Math.hypot(kx, ky), need = C.PLAYER_R + TUNING.keeper.r;
        if (kd >= need) continue;
        if (kd < 0.001) { kx = 1; ky = 0; kd = 1; }
        a.x += kx / kd * (need - kd); a.y += ky / kd * (need - kd);
      }
      a.x = clamp(a.x, C.PLAYER_R, C.FIELD_W - C.PLAYER_R); a.y = clamp(a.y, C.PLAYER_R, C.FIELD_H - C.PLAYER_R);
    }
  }

  // ── 골키퍼: 공·선수와 무관하게 tick 만의 함수로 왕복한다 ──────────────────
  function updateKeepers(state) {
    for (var k = 0; k < 2; k++) {
      var g = state.keepers[k];
      g.y = keeperY(state.tick, k);
      if (g.hitT > 0) g.hitT--;
    }
  }

  // 공이 골키퍼에 닿으면 멀리 튕겨낸다. 공이 **이동한 뒤** 호출하며, 한 틱에 37단위씩 나아가는
  // 강슛이 골키퍼를 뚫고 지나가지 않도록 이동 선분과 원의 최단거리로 판정한다(스윕 충돌).
  function keeperSave(state, prevX, prevY, ev) {
    var K = TUNING.keeper, b = state.ball;
    if (b.keeperCd > 0) { b.keeperCd--; return; }
    if (b.owner >= 0) return;                  // 소유 중인 공은 골키퍼가 건드리지 않는다(득점은 clampCarried 가 막는다)
    var hitR = K.saveR + C.BALL_R + K.hitPad;
    // 관통(대포알)은 **찬 사람이 공격하는 쪽 골키퍼**만 통과한다. 자기 진영 골키퍼까지 통과하면 빗나간 공이 자책골이 된다.
    var pierceSide = -1;
    if (b.pierce && b.lastKicker >= 0 && state.players[b.lastKicker]) {
      pierceSide = 1 - sideOf(state, state.players[b.lastKicker].team);
    }
    for (var k = 0; k < 2; k++) {
      if (k === pierceSide) continue;
      var gx = keeperX(k), gy = state.keepers[k].y;
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
      b.x = gx + ux * (hitR + 1); b.y = gy + uy * (hitR + 1);
      b.vx = ux * K.outSpeed; b.vy = uy * K.outSpeed;
      b.range = K.outRange; b.spin = 0; b.spinLeft = 0; b.owner = -1; b.lastKicker = -1;
      b.kickCd = 0; b.keeperCd = K.outCdTicks;
      state.keepers[k].hitT = 6;
      ev.push({ kind: 'keeperSave', side: k });
      return;
    }
  }

  // ── 공 ───────────────────────────────────────────────────────────────────
  function carryPos(p) {
    return [p.x + Math.cos(p.facing) * TUNING.ball.carryOffset, p.y + Math.sin(p.facing) * TUNING.ball.carryOffset];
  }

  // 들고 있는 공은 항상 경기장 안이다. **이걸 빼면 공을 몰고 골망으로 걸어 들어가 득점할 수 있다** —
  // 선수 x 상한은 1186 인데 공은 발 앞 18 이라 1204 가 되어 골라인(1200)을 넘어 버린다(검증에서 98% 득점).
  // 득점하려면 반드시 차야 한다.
  function clampCarried(b) {
    b.x = clamp(b.x, C.BALL_R, C.FIELD_W - C.BALL_R);
    b.y = clamp(b.y, C.BALL_R, C.FIELD_H - C.BALL_R);
  }

  // 소유를 풀고 속도·거리·회전을 준다. 찬 사람은 잠깐 다시 못 잡는다.
  function releaseBall(state, p, dir, speed, range, spin, pierce) {
    var b = state.ball, pos = carryPos(p);
    b.x = pos[0]; b.y = pos[1];
    b.vx = Math.cos(dir) * speed; b.vy = Math.sin(dir) * speed;
    b.range = range; b.spin = spin || 0; b.spinLeft = 0; b.pierce = pierce ? 1 : 0;
    b.owner = -1; b.lastKicker = p.slot; b.kickCd = TUNING.ball.kickCdTicks;
    p.charge = 0; p.chargeKind = 0;
    clampCarried(b);
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

  function kickShoot(state, p, ev) {
    var S = TUNING.shoot, ch = CHARACTERS[p.char];
    var k = p.charge / S.chargeTicks;
    var boosted = ultActive(p, 'power');
    var mul = ch.shot * (boosted ? ultOf(p).shotMul : 1);
    var speed = (S.minSpeed + (S.maxSpeed - S.minSpeed) * k) * mul;
    releaseBall(state, p, p.facing, speed, S.range, 0, boosted ? 1 : 0);
    if (boosted && ultOf(p).oneShot) { p.ultT = 0; p.ultAnimT = 0; }   // 대포알은 한 발만
    ev.push({ kind: 'shoot', slot: p.slot, power: k, pierce: boosted });
  }

  // 감아차기: 속도 크기는 그대로 두고 매 틱 방향만 회전시킨다. sign -1 = 화면 왼쪽(반시계), +1 = 오른쪽.
  function kickCurve(state, p, sign, ev) {
    var Q = TUNING.curve, ch = CHARACTERS[p.char];
    var k = p.charge / Q.chargeTicks;
    var spin = (Q.spinMin + (Q.spinMax - Q.spinMin) * k) * sign;
    releaseBall(state, p, p.facing, Q.speed * ch.shot, Q.range, spin, 0);
    state.ball.spinLeft = Q.turnMax;   // 총 회전량 상한 — 넘으면 직선으로 편다
    ev.push({ kind: 'curve', slot: p.slot, power: k, dir: sign });
  }

  function kickDribble(state, p, ev) {
    var D = TUNING.dribble;
    releaseBall(state, p, p.facing, D.speed, D.range, 0, 0);
    ev.push({ kind: 'dribble', slot: p.slot });
  }

  function kickBack(state, p, ev) {
    var B = TUNING.backkick;
    var dir = normAngle(p.facing + Math.PI);
    var b = state.ball;
    b.x = p.x + Math.cos(dir) * TUNING.ball.carryOffset; b.y = p.y + Math.sin(dir) * TUNING.ball.carryOffset;
    b.vx = Math.cos(dir) * B.speed; b.vy = Math.sin(dir) * B.speed;
    b.range = B.range; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
    b.owner = -1; b.lastKicker = p.slot; b.kickCd = TUNING.ball.kickCdTicks;
    p.charge = 0; p.chargeKind = 0;
    clampCarried(b);
  }

  function inNet(b) { return b.x < 0 || b.x > C.FIELD_W; }

  // 벽·골망 처리. 속도 크기는 유지하고 방향만 반사한다. 반환값 = 반사 횟수 (남은 거리 감소용).
  // wasInNet: 이동 전에 이미 골망 안이었나(한 틱에 벽을 뚫는 빠른 공을 골망 진입과 구분). bounce=false 면 밀어 넣기만.
  // prevX/prevY: 이동 전 위치. 주면 골라인을 **넘는 순간**의 y 로 입구를 판정한다.
  // (이동이 끝난 뒤의 y 로 판정하면 한 틱에 최대 72단위 움직이는 강슛이 기둥 바깥을 지나고도 골이 된다)
  function clampBall(b, bounce, wasInNet, prevX, prevY) {
    var R = C.BALL_R, W = C.FIELD_W, H = C.FIELD_H, D = C.GOAL_DEPTH, e = bounce ? 1 : 0, n = 0;
    var Y0 = C.GOAL_Y0 + R, Y1 = C.GOAL_Y1 - R;
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
  function moveBall(b) {
    if (b.range <= 0) { b.vx = 0; b.vy = 0; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0; return; }
    var wasInNet = inNet(b);
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
    var move = Math.min(sp * DT, b.range);
    var prevX = b.x, prevY = b.y;
    b.x += b.vx / sp * move; b.y += b.vy / sp * move;
    b.range -= move;
    var bounces = clampBall(b, true, wasInNet, prevX, prevY);
    for (var i = 0; i < bounces; i++) { b.range *= wasInNet ? 0.3 : TUNING.ball.bounceRangeKeep; b.spin *= 0.5; }
    if (b.range < 1) { b.range = 0; b.vx = 0; b.vy = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0; }
  }

  function updateBall(state) {
    var b = state.ball;
    if (b.kickCd > 0) b.kickCd--;
    if (b.owner >= 0) {
      var p = state.players[b.owner];
      if (!p) { b.owner = -1; moveBall(b); return; }
      var pos = carryPos(p);
      b.x = pos[0]; b.y = pos[1]; b.vx = p.vx; b.vy = p.vy; b.range = 0; b.spin = 0; b.spinLeft = 0; b.pierce = 0;
      clampCarried(b);
    } else moveBall(b);
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
      clampCarried(b);
    }
  }

  function goalCheck(state, ev) {
    var b = state.ball;
    if (b.x >= 0 && b.x <= C.FIELD_W) return;
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
    ev.push({ kind: 'goal', team: team, scorer: b.lastKicker, score: [state.score[0], state.score[1]] });
  }

  // ── 단계·시계 ─────────────────────────────────────────────────────────────
  function advancePhase(state, ev) {
    switch (state.phase) {
      case PHASE.PLAY:
        if (--state.clock <= 0) {
          state.clock = 0;
          if (state.half === 1) { state.phase = PHASE.HALF; state.phaseTimer = C.HALF_TICKS; ev.push({ kind: 'half', score: [state.score[0], state.score[1]] }); }
          else { state.phase = PHASE.END; state.phaseTimer = C.END_TICKS; ev.push({ kind: 'end', score: [state.score[0], state.score[1]] }); }
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
        state.half = 2; state.clock = state.halfTicks; state.kickoffTeam = 1;
        resetPositions(state);
        state.phase = PHASE.KICKOFF; state.phaseTimer = C.KICKOFF_TICKS; ev.push({ kind: 'kickoff', team: 1, half: 2 }); break;
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
    mix(q(b.x)); mix(q(b.y)); mix(q(b.vx)); mix(q(b.vy)); mix(q(b.range)); mix(q(b.spin * 1000)); mix(q(b.spinLeft * 100)); mix(b.pierce);
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
      mix(p.ult); mix(p.ultT); mix(p.ultAnimT); mix(q(p.ultX)); mix(q(p.ultY));
    }
    return h >>> 0;
  }

  // ── 인코딩 (CLAUDE.md §6) ────────────────────────────────────────────────
  // 입력 6바이트: [0x01, seq u16 LE, buttons u8, dx i8, dy i8]  (dx,dy: -127~127 → -1~1)
  var INPUT_BYTES = 6;
  function i8(v) { return Math.round(clamp(v, -1, 1) * 127) & 255; }
  function encodeInput(seq, dx, dy, buttons, out) {
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
  var SNAP_HEADER = 29, SNAP_PLAYER = 13;
  function snapshotSize(state) {
    var n = 0;
    for (var s = 0; s < C.MAX_PLAYERS; s++) if (state.players[s]) n++;
    return SNAP_HEADER + SNAP_PLAYER * n;
  }
  function f4(v) { return clamp(Math.round(v * 4), -32768, 32767); }
  function motionOf(p) {
    if (p.stunT > 0) return MOTION.STUN;
    if (p.ultAnimT > 0) return MOTION.ULT;
    if (p.kickT > 0) return p.kickKind === 2 ? MOTION.BACKKICK : MOTION.KICK;
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
    dv.setUint8(9, (state.phase & 127) | (state.half === 2 ? 128 : 0));
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
                  (p.ultT > 0 ? ST.ULT_ON : 0) | (p.kickKind === 2 && p.kickT > 0 ? ST.BACKKICK : 0) |
                  (ultReady(p) ? ST.ULT_READY : 0);
      dv.setUint8(off, s);
      dv.setInt16(off + 1, f4(p.x), true); dv.setInt16(off + 3, f4(p.y), true);
      dv.setInt16(off + 5, f4(p.vx), true); dv.setInt16(off + 7, f4(p.vy), true);
      dv.setUint8(off + 9, Math.round(normAngle(p.facing) / TAU * 256) & 255);
      dv.setUint8(off + 10, flags);
      dv.setUint8(off + 11, Math.min(255, Math.round(p.ult / TUNING.ult.fullTicks * 255)));
      dv.setUint8(off + 12, (motionOf(p) & 15) | (Math.min(15, Math.round(p.charge / TUNING.shoot.chargeTicks * 15)) << 4));
      off += SNAP_PLAYER;
    }
    dv.setUint8(28, n);
    return u8.length === size ? u8 : u8.subarray(0, size);
  }
  function decodeSnapshot(u8) {
    if (!u8 || u8.length < SNAP_HEADER || u8[0] !== 0x02) return null;
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var phaseByte = dv.getUint8(9);
    var n = dv.getUint8(28);
    if (u8.length < SNAP_HEADER + SNAP_PLAYER * n) return null;
    var kf = dv.getUint8(27);
    var snap = {
      tick: dv.getUint32(1, true), serverMs: dv.getUint32(5, true),
      phase: phaseByte & 127, phaseName: PHASE_NAME[phaseByte & 127] || 'lobby', half: (phaseByte & 128) ? 2 : 1,
      score: [dv.getUint8(10), dv.getUint8(11)], clock: dv.getUint16(12, true),
      ball: { x: dv.getInt16(14, true) / 4, y: dv.getInt16(16, true) / 4, vx: dv.getInt16(18, true) / 4, vy: dv.getInt16(20, true) / 4, owner: dv.getUint8(22) },
      keepers: [
        { side: 0, x: keeperX(0), y: dv.getInt16(23, true) / 4, save: !!(kf & 1) },
        { side: 1, x: keeperX(1), y: dv.getInt16(25, true) / 4, save: !!(kf & 2) }
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
        ult: dv.getUint8(off + 11) / 255,                      // 0~1 게이지
        motion: mb & 15, motionName: MOTION_NAME[mb & 15] || 'idle',
        charge: (mb >> 4) / 15                                  // 0~1 충전
      });
      off += SNAP_PLAYER;
    }
    return snap;
  }

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
          else if (x < 0.72) b = BTN.BACKKICK;
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
    var x0 = b.x, y0 = b.y;
    var t = 0, dist = 0, px = b.x, py = b.y, a0 = a, aLast = a, lateral = 0;
    while (b.range > 0 && t < 60) {
      moveBall(b); t += DT;
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
    ultReady: ultReady, ultOf: ultOf,
    INPUT_BYTES: INPUT_BYTES, encodeInput: encodeInput, decodeInput: decodeInput,
    encodeSnapshot: encodeSnapshot, decodeSnapshot: decodeSnapshot, snapshotSize: snapshotSize,
    selfTest: selfTest, sim: { ballTravel: ballTravel, rng: rng }
  };
});
