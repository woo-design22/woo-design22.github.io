/* 반대항축구 온라인 서버 — 정적 파일 + WebSocket 경기 서버 (감독 문서 §2·§6)
   실행: cd soccer/server && npm install && npm start   →  http://localhost:8080/

   설계 요점
   - 시뮬레이션은 `../game-core.js` 를 **그대로 require** 한다. 브라우저와 같은 파일이라 물리가 갈라지지 않는다.
   - 서버 권위: 클라이언트는 입력만 보낸다. 위치·득점·쿨다운은 전부 여기서 정한다.
   - 방마다 20Hz 틱 루프를 돌리고 매 틱 바이너리 스냅샷을 뿌린다.
   - 접속 절차(§6): hello → ping×8 → 지연 판정 → welcome / reject(4001).
   - 경기 중에도 2초마다 핑을 재서 느려지면 퇴장(4004). */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const core = require('../game-core.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

// ── 설정 (§3 지연 게이트·제한) ────────────────────────────────────────────
const CFG = {
  gate: { pings: 8, everyMs: 100, medianMs: 100, p90Ms: 160, replyMs: 1000 },
  inMatch: { everyMs: 2000, keep: 10, medianMs: 150, missLimit: 3, quietMs: 12000 },
  // perIp: 같은 주소에서의 동시 접속 상한. **로컬(127.0.0.1)은 면제**한다 — 같은 PC 에서 탭 두 개로 붙는 것과
  //          loadtest 가 막히면 안 된다. 공인 IP 에는 그대로 적용된다(환경변수 MAX_PER_IP 로 조절).
  limits: { perIp: Number(process.env.MAX_PER_IP || 4), rooms: 20, nickMin: 2, nickMax: 12, chatLen: 200, chatPerSec: 5, textBytes: 2048, binBytes: 8 },
  roomEmptyMs: 30000,
  tickHz: core.C.TICK_HZ
};
// 종료 코드 (§3)
const CLOSE = { NET_SLOW: 4001, VERSION: 4002, ROOM_FULL: 4003, KICKED: 4004, RATE_LIMIT: 4005, DUP_IP: 4006 };

const stats = { started: Date.now(), connections: 0, rejected: { NET_SLOW: 0, VERSION: 0, ROOM_FULL: 0, KICKED: 0, RATE_LIMIT: 0, DUP_IP: 0 } };

// ── 정적 파일 ─────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(statsSnapshot(), null, 1));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }   // 경로 탈출 차단
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('없는 파일'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache, must-revalidate' });
    res.end(buf);
  });
});

// ── 방 ────────────────────────────────────────────────────────────────────
let nextRoomId = 1, nextConnId = 1;
const rooms = new Map();      // id → room
const conns = new Map();      // id → conn
const ipCount = new Map();

function makeRoom(opts, hostConn) {
  const teamSize = clampInt(opts.teamSize, 1, 10, 2);
  const room = {
    id: String(nextRoomId++),
    name: String(opts.name || '').slice(0, 20) || (hostConn.nick + '의 방'),
    teamSize,
    halfSec: [90, 180, 300].includes(opts.halfSec) ? opts.halfSec : 180,
    classes: [clampInt(opts.classA, 1, 12, 1), clampInt(opts.classB, 1, 12, 2)],
    pass: typeof opts.pass === 'string' && opts.pass.length ? String(opts.pass).slice(0, 12) : null,
    hostId: hostConn.id,
    members: [],            // conn.id 순서 (입장 순)
    phase: 'lobby',         // lobby | playing
    state: null, inputs: null, timer: null, tick0: 0, tickCount: 0, tickMs: [],
    emptyAt: 0
  };
  rooms.set(room.id, room);
  return room;
}
function roomBrief(r) {
  return { id: r.id, name: r.name, teamSize: r.teamSize, halfSec: r.halfSec, lock: !!r.pass,
    players: r.members.length, cap: r.teamSize * 2, phase: r.phase,
    classes: r.classes, host: (conns.get(r.hostId) || {}).nick || '' };
}
function roomFull(r) {
  return {
    id: r.id, name: r.name, teamSize: r.teamSize, halfSec: r.halfSec, lock: !!r.pass,
    classes: r.classes, hostId: r.hostId, phase: r.phase, cap: r.teamSize * 2,
    members: r.members.map(id => {
      const c = conns.get(id);
      return c ? { id: c.id, nick: c.nick, team: c.team, char: c.char, ready: c.ready, slot: c.slot, host: c.id === r.hostId, rtt: c.rtt } : null;
    }).filter(Boolean)
  };
}
function teamCount(r, team) {
  let n = 0;
  for (const id of r.members) { const c = conns.get(id); if (c && c.team === team) n++; }
  return n;
}
function canStart(r) {
  if (r.phase !== 'lobby') return '이미 경기 중입니다';
  if (r.members.length !== r.teamSize * 2) return '인원이 다 차야 시작할 수 있습니다 (' + r.members.length + '/' + (r.teamSize * 2) + ')';
  if (teamCount(r, 0) !== r.teamSize || teamCount(r, 1) !== r.teamSize) return '양 팀 인원이 같아야 합니다';
  for (const id of r.members) { const c = conns.get(id); if (c && !c.ready) return '모두 준비해야 시작할 수 있습니다'; }
  return null;
}

// ── 경기 루프 ─────────────────────────────────────────────────────────────
function startMatch(r) {
  const st = core.createState({ halfSec: r.halfSec });
  // 팀별로 슬롯을 나눠 준다: 팀0 = 0..teamSize-1, 팀1 = 10..10+teamSize-1
  let n0 = 0, n1 = 0;
  for (const id of r.members) {
    const c = conns.get(id);
    if (!c) continue;
    c.slot = c.team === 0 ? n0++ : 10 + n1++;
    core.addPlayer(st, c.slot, c.team, c.char);
  }
  core.startMatch(st);
  r.state = st;
  r.inputs = new Array(core.C.MAX_PLAYERS).fill(null).map(() => ({ dx: 0, dy: 0, buttons: 0 }));
  r.phase = 'playing';
  r.tick0 = Date.now(); r.tickCount = 0; r.tickMs = [];
  broadcast(r, { t: 'room', state: roomFull(r) });
  broadcast(r, { t: 'match.start' });
  const snapBuf = new Uint8Array(core.snapshotSize(st));
  // **드리프트 보정 루프**. setInterval(50ms) 만 쓰면 노드 타이머가 늦어 실측 16.3Hz 밖에 안 나온다(2026-08-25 확인).
  // 다음 틱 시각을 누적해서 계산하고, 늦었으면 한 번에 여러 틱을 따라잡는다(최대 5틱 = 0.25초).
  const stepMs = 1000 / CFG.tickHz;
  let nextAt = Date.now() + stepMs;
  const loop = () => {
    if (!r.timer) return;
    let guard = 0;
    while (Date.now() >= nextAt && guard++ < 5) { tickOnce(); nextAt += stepMs; }
    if (Date.now() - nextAt > stepMs * 20) nextAt = Date.now() + stepMs;   // 너무 밀리면 포기하고 현재로 맞춘다
    r.timer = setTimeout(loop, Math.max(0, Math.round(nextAt - Date.now())));
  };
  const tickOnce = () => {
    const t0 = process.hrtime.bigint();
    // 이번 틱 입력 모으기
    for (let s = 0; s < core.C.MAX_PLAYERS; s++) { r.inputs[s].dx = 0; r.inputs[s].dy = 0; r.inputs[s].buttons = 0; }
    for (const id of r.members) {
      const c = conns.get(id);
      if (!c || c.slot < 0) continue;
      const i = r.inputs[c.slot];
      i.dx = c.input.dx; i.dy = c.input.dy; i.buttons = c.input.buttons;
    }
    let ev;
    try { ev = core.step(r.state, r.inputs); }
    catch (e) { console.error('[step]', e); stopMatch(r, '오류'); return; }
    r.tickCount++;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    r.tickMs.push(ms); if (r.tickMs.length > 1200) r.tickMs.shift();
    // 이벤트는 텍스트로, 스냅샷은 바이너리로
    for (const e of ev) {
      if (e.kind === 'lobby') { stopMatch(r, '종료'); return; }
      // table/mom 은 하프타임·종료에만 실린다(상황판). 매 틱 나가는 값이 아니라 크기 걱정이 없다.
      broadcast(r, { t: 'event', kind: e.kind, team: e.team, slot: e.slot, side: e.side, name: e.name,
                     score: e.score, table: e.table, mom: e.mom, scorer: e.scorer });
    }
    const bytes = core.encodeSnapshot(r.state, Date.now() >>> 0, snapBuf);
    broadcastBin(r, bytes);
  };
  r.timer = setTimeout(loop, stepMs);
}
function stopMatch(r, why) {
  if (r.timer) { clearTimeout(r.timer); r.timer = null; }
  r.phase = 'lobby'; r.state = null;
  for (const id of r.members) { const c = conns.get(id); if (c) { c.ready = false; c.slot = -1; } }
  broadcast(r, { t: 'match.end', why: why || '' });
  broadcast(r, { t: 'room', state: roomFull(r) });
}

// ── 전송 도우미 ───────────────────────────────────────────────────────────
function send(c, obj) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj)); }
function sendBin(c, buf) { if (c.ws.readyState === 1) c.ws.send(buf, { binary: true }); }
function broadcast(r, obj) { const s = JSON.stringify(obj); for (const id of r.members) { const c = conns.get(id); if (c && c.ws.readyState === 1) c.ws.send(s); } }
function broadcastBin(r, buf) { for (const id of r.members) { const c = conns.get(id); if (c && c.ws.readyState === 1) c.ws.send(buf, { binary: true }); } }
function kick(c, code, msg) {
  stats.rejected[nameOfCode(code)] = (stats.rejected[nameOfCode(code)] || 0) + 1;
  send(c, { t: 'kick', code: nameOfCode(code), msg });
  try { c.ws.close(code, msg.slice(0, 80)); } catch (e) {}
}
function nameOfCode(code) { for (const k in CLOSE) if (CLOSE[k] === code) return k; return 'KICKED'; }
function clampInt(v, lo, hi, dflt) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt; }
function median(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }
function pct(a, p) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; }

function statsSnapshot() {
  const rs = [];
  for (const r of rooms.values()) {
    rs.push({ id: r.id, name: r.name, players: r.members.length, phase: r.phase,
      tickP95Ms: r.tickMs.length ? Math.round(pct(r.tickMs, 0.95) * 1000) / 1000 : 0,
      ticks: r.tickCount });
  }
  return { uptimeSec: Math.round((Date.now() - stats.started) / 1000), connections: conns.size,
    totalConnections: stats.connections, rooms: rs, rejected: stats.rejected, protocol: core.PROTOCOL_VERSION };
}

// ── 방 나가기 / 정리 ──────────────────────────────────────────────────────
function leaveRoom(c, silent) {
  const r = rooms.get(c.roomId);
  c.roomId = null; c.team = 0; c.char = 0; c.ready = false; c.slot = -1;
  if (!r) return;
  const i = r.members.indexOf(c.id);
  if (i >= 0) r.members.splice(i, 1);
  if (r.phase === 'playing' && r.state && c.slot >= 0) core.removePlayer(r.state, c.slot);
  if (!r.members.length) { r.emptyAt = Date.now(); if (r.timer) { clearTimeout(r.timer); r.timer = null; r.phase = 'lobby'; } return; }
  if (r.hostId === c.id) r.hostId = r.members[0];                   // 방장 승계
  if (r.phase === 'playing') {
    const alive = r.members.filter(id => conns.get(id));
    if (alive.length < 1) stopMatch(r, '인원 없음');
  }
  if (!silent) broadcast(r, { t: 'room', state: roomFull(r) });
}
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) if (!r.members.length && r.emptyAt && now - r.emptyAt > CFG.roomEmptyMs) rooms.delete(id);
}, 5000);

// ── WebSocket ─────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const n = (ipCount.get(ip) || 0) + 1;
  ipCount.set(ip, n);
  stats.connections++;

  const c = {
    id: nextConnId++, ws, ip, nick: '', roomId: null, team: 0, char: 0, ready: false, slot: -1,
    input: { dx: 0, dy: 0, buttons: 0 }, seq: -1,
    stage: 'hello',                 // hello → gate → ok
    gate: { sent: 0, ids: new Map(), rtts: [], timer: null, timeout: null },
    rtt: 0, rttHist: [], missed: 0, pingAt: 0, pingId: 0, monTimer: null,
    chatTimes: []
  };
  conns.set(c.id, c);

  const localIp = (ip === '127.0.0.1' || ip === '::1' || ip === '');
  if (!localIp && n > CFG.limits.perIp) { kick(c, CLOSE.DUP_IP, '같은 주소에서 접속이 너무 많습니다'); return; }

  const helloTimer = setTimeout(() => { if (c.stage === 'hello') kick(c, CLOSE.RATE_LIMIT, 'hello 없음'); }, 5000);

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) { onBinary(c, data); return; }
      if (data.length > CFG.limits.textBytes) { kick(c, CLOSE.RATE_LIMIT, '메시지가 너무 큽니다'); return; }
      let m;
      try { m = JSON.parse(data.toString('utf8')); } catch (e) { return; }   // 잘못된 JSON 은 조용히 버린다
      if (!m || typeof m.t !== 'string') return;
      onText(c, m, helloTimer);
    } catch (e) { console.error('[msg]', e); }
  });

  ws.on('close', () => {
    clearTimeout(helloTimer);
    if (c.gate.timer) clearInterval(c.gate.timer);
    if (c.gate.timeout) clearTimeout(c.gate.timeout);
    if (c.monTimer) clearInterval(c.monTimer);
    leaveRoom(c);
    conns.delete(c.id);
    ipCount.set(ip, Math.max(0, (ipCount.get(ip) || 1) - 1));
  });
  ws.on('error', () => {});
});

function onText(c, m, helloTimer) {
  // 1) hello — 버전 확인 뒤 지연 측정 시작
  if (m.t === 'hello') {
    if (c.stage !== 'hello') return;
    clearTimeout(helloTimer);
    if (m.v !== core.PROTOCOL_VERSION) { kick(c, CLOSE.VERSION, '새 버전이 있습니다. F5로 새로고침하세요'); return; }
    let nick = String(m.nick || '').trim().slice(0, CFG.limits.nickMax);
    if (nick.length < CFG.limits.nickMin) { kick(c, CLOSE.RATE_LIMIT, '아이디는 ' + CFG.limits.nickMin + '~' + CFG.limits.nickMax + '자입니다'); return; }
    c.nick = nick;
    c.stage = 'gate';
    startGate(c);
    return;
  }
  if (m.t === 'pong') {
    const t = c.gate.ids.get(m.id);
    if (t !== undefined) { c.gate.ids.delete(m.id); c.gate.rtts.push(Date.now() - t); }
    else if (c.pingId && m.id === c.pingId) {
      c.rtt = Date.now() - c.pingAt; c.missed = 0; c.lastPongAt = Date.now();
      c.rttHist.push(c.rtt); if (c.rttHist.length > CFG.inMatch.keep) c.rttHist.shift();
    }
    return;
  }
  if (c.stage !== 'ok') return;

  switch (m.t) {
    case 'room.list':
      send(c, { t: 'rooms', list: [...rooms.values()].map(roomBrief) });
      break;
    case 'room.create': {
      if (c.roomId) leaveRoom(c);
      if (rooms.size >= CFG.limits.rooms) { send(c, { t: 'error', msg: '방이 너무 많습니다' }); break; }
      const r = makeRoom(m, c);
      joinRoom(c, r);
      break;
    }
    case 'room.join': {
      const r = rooms.get(String(m.id));
      if (!r) { send(c, { t: 'error', msg: '없는 방입니다' }); break; }
      if (r.pass && String(m.pass || '') !== r.pass) { send(c, { t: 'error', msg: '비밀번호가 틀렸습니다', field: 'pass' }); break; }
      if (r.members.length >= r.teamSize * 2) { send(c, { t: 'error', msg: '방이 가득 찼습니다' }); break; }
      if (c.roomId) leaveRoom(c);
      joinRoom(c, r);
      break;
    }
    case 'room.leave':
      leaveRoom(c);
      send(c, { t: 'left' });
      break;
    case 'team': {
      const r = rooms.get(c.roomId); if (!r || r.phase !== 'lobby') break;
      const team = m.team ? 1 : 0;
      if (teamCount(r, team) >= r.teamSize && c.team !== team) { send(c, { t: 'error', msg: '그 팀은 자리가 없습니다' }); break; }
      c.team = team; c.ready = false;
      broadcast(r, { t: 'room', state: roomFull(r) });
      break;
    }
    case 'char': {
      const r = rooms.get(c.roomId); if (!r || r.phase !== 'lobby') break;
      c.char = clampInt(m.id, 0, 5, 0);
      broadcast(r, { t: 'room', state: roomFull(r) });
      break;
    }
    case 'ready': {
      const r = rooms.get(c.roomId); if (!r || r.phase !== 'lobby') break;
      c.ready = !!m.on;
      broadcast(r, { t: 'room', state: roomFull(r) });
      break;
    }
    case 'start': {
      const r = rooms.get(c.roomId); if (!r) break;
      if (r.hostId !== c.id) { send(c, { t: 'error', msg: '방장만 시작할 수 있습니다' }); break; }
      const why = canStart(r);
      if (why) { send(c, { t: 'error', msg: why }); break; }
      startMatch(r);
      break;
    }
    case 'chat': {
      const r = rooms.get(c.roomId); if (!r) break;
      const now = Date.now();
      c.chatTimes = c.chatTimes.filter(t => now - t < 1000);
      if (c.chatTimes.length >= CFG.limits.chatPerSec) break;      // 초과는 조용히 버린다
      c.chatTimes.push(now);
      const text = String(m.text || '').slice(0, CFG.limits.chatLen);
      if (!text.trim()) break;
      broadcast(r, { t: 'chat', from: c.nick, text });
      break;
    }
  }
}

// 지연 게이트: ping 8개를 100ms 간격으로 보내고 중앙값·상위10% 로 판정한다
function startGate(c) {
  const g = c.gate;
  g.timer = setInterval(() => {
    if (g.sent >= CFG.gate.pings) { clearInterval(g.timer); g.timer = null; return; }
    const id = ++g.sent;
    g.ids.set(id, Date.now());
    send(c, { t: 'ping', id });
  }, CFG.gate.everyMs);
  g.timeout = setTimeout(() => finishGate(c), CFG.gate.pings * CFG.gate.everyMs + CFG.gate.replyMs);
}
function finishGate(c) {
  if (c.stage !== 'gate') return;
  if (c.gate.timer) { clearInterval(c.gate.timer); c.gate.timer = null; }
  const rtts = c.gate.rtts;
  const med = median(rtts), p90 = pct(rtts, 0.9);
  const missing = CFG.gate.pings - rtts.length;
  if (missing > 0 || med > CFG.gate.medianMs || p90 > CFG.gate.p90Ms) {
    send(c, { t: 'reject', code: 'NET_SLOW', msg: '네트워크 오류 — 지연이 커서 접속할 수 없습니다',
      rtt: med, p90, missing, limit: { median: CFG.gate.medianMs, p90: CFG.gate.p90Ms } });
    stats.rejected.NET_SLOW++;
    try { c.ws.close(CLOSE.NET_SLOW, 'NET_SLOW'); } catch (e) {}
    return;
  }
  c.stage = 'ok';
  c.rtt = med;
  send(c, { t: 'welcome', nick: c.nick, rtt: med, p90, serverTime: Date.now(), protocol: core.PROTOCOL_VERSION });
  send(c, { t: 'rooms', list: [...rooms.values()].map(roomBrief) });
  startMonitor(c);
}
// 접속 뒤에도 계속 지연을 재서 나빠지면 퇴장시킨다.
// **경기 중일 때만** 퇴장시킨다 — 로비나 방에서 잠깐 다른 창을 보는 것으로 쫓아내면 안 된다.
// (2026-08-25: 탭을 옮긴 사이 6초 만에 '응답이 없어 퇴장'이 떴다. 브라우저가 숨은 탭을 얼리면
//  핑에 답할 수 없는데, 그 사이 3번 놓치는 것만으로 끊겼다.)
function startMonitor(c) {
  c.lastPongAt = Date.now();
  c.monTimer = setInterval(() => {
    if (c.ws.readyState !== 1) return;
    const r = c.roomId ? rooms.get(c.roomId) : null;
    const playing = !!(r && r.phase === 'playing');
    if (playing) {
      if (Date.now() - c.lastPongAt > CFG.inMatch.quietMs) {
        kick(c, CLOSE.KICKED, '응답이 없어 퇴장되었습니다'); return;
      }
      if (c.rttHist.length >= 4 && median(c.rttHist) > CFG.inMatch.medianMs) {
        kick(c, CLOSE.KICKED, '지연이 커서 퇴장되었습니다 (중앙값 ' + median(c.rttHist) + 'ms)');
        return;
      }
    } else {
      c.rttHist.length = 0;   // 경기가 아닐 때 잰 값은 판정에 쓰지 않는다
    }
    c.pingId = (c.pingId % 65535) + 1;
    c.pingAt = Date.now();
    send(c, { t: 'ping', id: c.pingId });
  }, CFG.inMatch.everyMs);
}

function joinRoom(c, r) {
  c.roomId = r.id;
  c.ready = false;
  c.team = teamCount(r, 0) <= teamCount(r, 1) ? 0 : 1;
  r.members.push(c.id);
  r.emptyAt = 0;
  send(c, { t: 'joined', id: r.id });
  broadcast(r, { t: 'room', state: roomFull(r) });
}

function onBinary(c, data) {
  if (c.stage !== 'ok') return;
  if (data.length > CFG.limits.binBytes) { kick(c, CLOSE.RATE_LIMIT, '입력 프레임이 큽니다'); return; }
  if (data.length !== core.INPUT_BYTES || data[0] !== 0x01) return;
  const inp = core.decodeInput(new Uint8Array(data));
  if (!inp) return;
  // 시퀀스가 뒤로 간 것은 버린다(재전송·순서 뒤바뀜)
  const d = (inp.seq - c.seq) & 0xffff;
  if (c.seq >= 0 && (d === 0 || d > 32768)) return;
  c.seq = inp.seq;
  c.input.dx = inp.dx; c.input.dy = inp.dy; c.input.buttons = inp.buttons;
}

server.listen(PORT, () => {
  console.log('반대항축구 서버 — http://localhost:' + PORT + '/  (프로토콜 v' + core.PROTOCOL_VERSION + ')');
});
