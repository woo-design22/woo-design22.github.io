/* 반대항축구 기능 대조표 — 틱 주파수를 바꿔도 **초·단위 거리**는 같아야 한다.
   game-core 만으로 돌린다(헤드리스). 인자로 잴 game-core.js 경로를 준다. */
const core = require(process.argv[2]);
const T = core.TUNING, C = core.C, B = core.BTN, HZ = C.TICK_HZ;
const R = {}, sec = t => +(t / HZ).toFixed(3), r0 = v => Math.round(v);

function mk(opts) {
  return core.createState(Object.assign({ halfSec: 120, field: 'school' }, opts || {}));
}
function play(s) { core.startMatch(s); s.phase = 2; s.phaseTimer = 0; return s; }
function inps(n) { const a = []; for (let i = 0; i < n; i++) a.push({ dx: 0, dy: 0, buttons: 0 }); return a; }
function run(s, i, n) { const ev = []; for (let k = 0; k < n; k++) for (const e of core.step(s, i)) ev.push(e); return ev; }
function away(s, slot) { const p = s.players[slot]; if (p) { p.x = -5000; p.y = -5000; } }

R['틱 주파수'] = HZ;

// ── 이동 ──────────────────────────────────────────────────────────────────
{ const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  s.players[0].x = 300; s.players[0].y = 400;
  i[0].dx = 1; run(s, i, HZ); R['걷기 1초'] = r0(s.players[0].x - 300); }
{ const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  s.players[0].x = 300; s.players[0].y = 400;
  i[0].dx = 1; i[0].dy = 1; run(s, i, HZ);
  R['대각선 1초'] = r0(Math.hypot(s.players[0].x - 300, s.players[0].y - 400));
  R['대각선 방향(도)'] = r0(s.players[0].facing * 180 / Math.PI); }
{ const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  s.players[0].x = 200; s.players[0].y = 400;
  i[0].dx = 1; i[0].buttons = B.SPRINT; run(s, i, HZ); R['달리기 1초'] = r0(s.players[0].x - 200);
  let t = HZ; while (s.players[0].stam > 0 && t < HZ * 20) { core.step(s, i); t++; }
  R['체력 바닥까지(초)'] = sec(t);
  const x1 = s.players[0].x; run(s, i, HZ); R['지친 뒤 1초'] = r0(s.players[0].x - x1); }
{ const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  s.players[0].stam = 0; let t = 0;
  while (s.players[0].stam < T.player.staminaMax && t < HZ * 30) { core.step(s, i); t++; }
  R['체력 만충까지(초)'] = sec(t); }

// ── 공 차기 ───────────────────────────────────────────────────────────────
function kickTest(btn, chargeTicks) {
  const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  const p = s.players[0]; p.x = 100; p.y = 400; p.facing = 0;
  s.ball.owner = 0; s.ball.x = 100 + T.ball.carryOffset; s.ball.y = 400;
  i[0].buttons = btn;
  if (chargeTicks) { run(s, i, chargeTicks); i[0].buttons = 0; run(s, i, 1); }
  else { run(s, i, 1); i[0].buttons = 0; }
  const b = s.ball, sp = Math.hypot(b.vx, b.vy), y0 = b.y;
  away(s, 0);
  let t = 0, dist = 0, px = b.x, py = b.y;
  while (b.range > 0 && t < HZ * 6) { core.step(s, i); t++; dist += Math.hypot(b.x - px, b.y - py); px = b.x; py = b.y; }
  return { 속도: r0(sp), 이동거리: r0(dist), 옆으로: r0(b.y - y0), 걸린시간: sec(t) };
}
R['슛'] = kickTest(B.KICK, 0);
R['감아차기(꽉)'] = kickTest(B.CURVE_R, T.curve.chargeTicks + 2);
R['감아차기(톡)'] = kickTest(B.CURVE_R, 1);
R['드리블(꽉)'] = kickTest(B.DRIBBLE, T.dribble.chargeTicks + 2);
R['드리블(톡)'] = kickTest(B.DRIBBLE, 1);

// ── 논스톱 슛 ─────────────────────────────────────────────────────────────
{ const s = mk(); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  const p = s.players[0]; p.x = 400; p.y = 400; p.facing = 0;
  s.ball.owner = -1; s.ball.x = 400 + T.ball.carryOffset; s.ball.y = 400;
  i[0].buttons = B.KICK; const ev = run(s, i, 2);
  R['논스톱 발동'] = ev.some(e => e.kind === 'volley');
  R['논스톱 속도'] = r0(Math.hypot(s.ball.vx, s.ball.vy)); }

// ── 발차기·방귀 판정 ──────────────────────────────────────────────────────
function hitBox(useFart) {
  const hits = [];
  for (let ux = -120; ux <= 120; ux += 6) for (let vy = -78; vy <= 78; vy += 6) {
    const s = mk({ halfSec: 300 }); core.addPlayer(s, 0, 0, 0); core.addPlayer(s, 1, 1, 0); play(s);
    const i = inps(2);
    s.players[0].x = 600; s.players[0].y = 400; s.players[0].facing = 0;
    s.players[1].x = 600 + ux; s.players[1].y = 400 + vy;
    s.ball.owner = -1; s.ball.x = 1100; s.ball.y = 100;
    i[0].buttons = useFart ? B.FART : B.KICK;
    run(s, i, T.kick.hitTick + 2);
    if (s.players[1].stunT > 0) hits.push([ux, vy]);
  }
  if (!hits.length) return null;
  const xs = hits.map(h => h[0]), ys = hits.map(h => h[1]);
  return { 앞뒤: [Math.min.apply(null, xs), Math.max.apply(null, xs)],
           좌우: [Math.min.apply(null, ys), Math.max.apply(null, ys)], 맞은칸: hits.length };
}
R['앞차기 범위'] = hitBox(false);
R['방귀 범위'] = hitBox(true);

// ── 기절·쿨다운 ───────────────────────────────────────────────────────────
{ const s = mk({ halfSec: 300 }); core.addPlayer(s, 0, 0, 0); core.addPlayer(s, 1, 1, 0); play(s);
  const i = inps(2);
  s.players[0].x = 600; s.players[0].y = 400; s.players[0].facing = 0;
  s.players[1].x = 630; s.players[1].y = 400;
  s.ball.owner = -1; s.ball.x = 1100; s.ball.y = 100;
  i[0].buttons = B.KICK; run(s, i, T.kick.hitTick + 1);
  R['기절(초)'] = sec(s.players[1].stunT + T.kick.hitTick + 1 - (T.kick.hitTick + 1));
  R['기절 설정(초)'] = sec(T.player.stunTicks);
  R['앞차기 쿨(초)'] = sec(T.kick.cdTicks);
  R['방귀 쿨(초)'] = sec(T.kick.fartCdTicks);
  R['동작 길이(초)'] = sec(T.kick.animTicks); }

// ── 필살기 ────────────────────────────────────────────────────────────────
{ const s = mk({ halfSec: 300 }); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  let t = 0; while (s.players[0].ult < T.ult.fullTicks && t < HZ * 90) { core.step(s, i); t++; }
  R['필살기 만충(초)'] = sec(t); }
R['필살기 지속(초)'] = core.CHARACTERS.map(c => sec(c.ult.durTicks)).join('/');

// ── 경기 흐름 ─────────────────────────────────────────────────────────────
{ const s = mk({ halfSec: 2 }); core.addPlayer(s, 0, 0, 0); core.addPlayer(s, 1, 1, 0);
  core.startMatch(s); const i = inps(2); const seq = [];
  for (let t = 0; t < HZ * 60; t++) {
    let stop = false;
    for (const e of core.step(s, i)) {
      if (e.kind === 'half') seq.push('하프' + s.half);
      if (e.kind === 'end') { seq.push('종료(하프' + s.half + ')'); stop = true; }
    }
    if (stop) break;
  }
  R['0:0 진행'] = seq.join(' → '); }
{ const s = mk({ halfSec: 300, friendly: true }); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  away(s, 0);
  s.ball.owner = -1; s.ball.x = -8; s.ball.y = s.goalY0 + 12; s.ball.vx = -60; s.ball.range = 30; s.ball.range0 = 30;
  run(s, i, 12); R['대기 운동장 점수'] = s.score.join(':'); }
{ const s = mk({ halfSec: 300 }); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1);
  away(s, 0);
  s.ball.owner = -1; s.ball.x = -8; s.ball.y = s.goalY0 + 12; s.ball.vx = -60; s.ball.range = 30; s.ball.range0 = 30;
  const ev = run(s, i, 12); R['정식 경기 골'] = ev.filter(e => e.kind === 'goal').length + '골 ' + s.score.join(':'); }

// ── 골키퍼 ────────────────────────────────────────────────────────────────
{ let saves = 0, goals = 0;
  for (let k = 0; k < 24; k++) {
    const s = mk({ halfSec: 300 }); core.addPlayer(s, 0, 0, 0); play(s); const i = inps(1); away(s, 0);
    run(s, i, Math.round(k * HZ / 8));
    s.ball.owner = -1; s.ball.x = 300; s.ball.y = 400; s.ball.vx = -T.shoot.speed; s.ball.vy = 0;
    s.ball.range = 400; s.ball.range0 = 400;
    const ev = run(s, i, HZ * 2);
    if (ev.some(e => e.kind === 'keeperSave')) saves++;
    if (ev.some(e => e.kind === 'goal')) goals++;
  }
  R['골키퍼 24번 중'] = '선방 ' + saves + ' / 골 ' + goals; }

// ── 소유·기록 ─────────────────────────────────────────────────────────────
R['소유 반지름'] = T.ball.possessRadius;
R['드리블 붙는 거리'] = T.ball.carryOffset;
R['프로토콜'] = core.PROTOCOL_VERSION;
console.log(JSON.stringify(R, null, 1));
