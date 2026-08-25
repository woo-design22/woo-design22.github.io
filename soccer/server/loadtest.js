/* loadtest.js — 서버 흐름을 사람 없이 재현하는 검증 도구 (감독 문서 §7)
   사용:
     node loadtest.js                          기본: 방 1개 × 4명(2:2), 비밀번호 방, 전 과정 확인
     node loadtest.js --players 6              6명(3:3)
     node loadtest.js --rooms 3 --players 6    방 3개 동시
     node loadtest.js --delay 200              pong 을 200ms 늦춰 지연 게이트 거부를 확인
     node loadtest.js --drop 1                 pong 1개를 안 보내 무응답 거부를 확인
     node loadtest.js --delayAfter 200         입장 뒤부터 늦춰 경기 중 퇴장을 확인
     node loadtest.js --port 8080 --seconds 6
   출력은 항목별 실측값이다. 사람이 눈으로 보고 판단하지 않게 숫자로 찍는다. */
'use strict';
const WebSocket = require('ws');
const core = require('../game-core.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 8080));
// --url 로 원격(터널) 주소를 직접 줄 수 있다. 배포 뒤 같은 검사를 그대로 돌리기 위해서다.
const URL = arg('url', '');
const WS_URL = URL ? URL.replace(/^http/, 'ws').replace(/\/$/, '') + '/' : ('ws://127.0.0.1:' + PORT + '/');
const PLAYERS = Number(arg('players', 4));
const ROOMS = Number(arg('rooms', 1));
const DELAY = Number(arg('delay', 0));
const DELAY_AFTER = Number(arg('delayAfter', 0));
const DROP = Number(arg('drop', 0));
const SECONDS = Number(arg('seconds', 6));
const PASS = arg('pass', '1234');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(nick) {
  const c = {
    nick, ws: null, welcomed: false, rejected: null, kicked: null, room: null, roomId: null,
    snaps: 0, snapBytes: 0, events: [], chats: [], errors: [], drops: 0, phase: null, afterJoin: false,
    firstSnapAt: 0, lastSnapAt: 0
  };
  c.ws = new WebSocket(WS_URL);
  c.ws.on('open', () => c.ws.send(JSON.stringify({ t: 'hello', v: core.PROTOCOL_VERSION, nick })));
  c.ws.on('message', (data, isBinary) => {
    if (isBinary) {
      c.snaps++; c.snapBytes = data.length;
      const now = Date.now();
      if (!c.firstSnapAt) c.firstSnapAt = now;
      c.lastSnapAt = now;
      return;
    }
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    switch (m.t) {
      case 'ping': {
        const wait = (c.afterJoin ? DELAY_AFTER : DELAY);
        if (DROP && c.drops < DROP && !c.afterJoin) { c.drops++; break; }   // 응답을 아예 안 보낸다
        const reply = () => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify({ t: 'pong', id: m.id })); };
        if (wait > 0) setTimeout(reply, wait); else reply();
        break;
      }
      case 'welcome': c.welcomed = true; c.rtt = m.rtt; c.p90 = m.p90; break;
      case 'reject': c.rejected = m; break;
      case 'kick': c.kicked = m; break;
      case 'rooms': c.rooms = m.list; break;
      case 'joined': c.roomId = m.id; break;
      case 'room': c.room = m.state; break;
      case 'match.start': c.phase = 'playing'; break;
      case 'match.end': c.phase = 'lobby'; break;
      case 'event': c.events.push(m.kind); break;
      case 'chat': c.chats.push(m.from + ': ' + m.text); break;
      case 'error': c.errors.push(m.msg); break;
    }
  });
  c.ws.on('close', (code) => { c.closeCode = code; });
  c.ws.on('error', () => {});
  c.send = o => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); };
  return c;
}
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(30); } return false; };

async function runRoom(idx) {
  const cs = [];
  for (let i = 0; i < PLAYERS; i++) cs.push(client('테스트' + (idx * PLAYERS + i + 1)));
  const ok = await waitFor(() => cs.every(c => c.welcomed || c.rejected || c.closeCode), 4000);

  const rejected = cs.filter(c => c.rejected);
  if (rejected.length) {
    return { 방: idx + 1, 결과: '지연 게이트 거부', 거부수: rejected.length + '/' + cs.length,
      예시: { code: rejected[0].rejected.code, rtt: rejected[0].rejected.rtt, p90: rejected[0].rejected.p90, missing: rejected[0].rejected.missing },
      닫힘코드: cs.map(c => c.closeCode).filter(Boolean) };
  }
  if (!ok) return { 방: idx + 1, 결과: '핸드셰이크 실패', 상태: cs.map(c => ({ w: c.welcomed, r: !!c.rejected, close: c.closeCode })) };

  // 방장이 비밀번호 방을 만들고 나머지가 들어온다
  const host = cs[0];
  host.send({ t: 'room.create', name: '테스트방' + (idx + 1), teamSize: PLAYERS / 2, halfSec: 90, pass: PASS, classA: 3, classB: 7 });
  await waitFor(() => host.roomId, 2000);
  const rid = host.roomId;
  const wrongPass = { tried: false, blocked: false };
  if (cs.length > 1) {
    cs[1].send({ t: 'room.join', id: rid, pass: 'xxxx' });      // 틀린 비밀번호
    wrongPass.tried = true;
    await sleep(250);
    wrongPass.blocked = cs[1].errors.some(e => e.includes('비밀번호'));
  }
  for (let i = 1; i < cs.length; i++) cs[i].send({ t: 'room.join', id: rid, pass: PASS });
  await waitFor(() => cs.every(c => c.roomId === rid), 2000);
  cs.forEach(c => { c.afterJoin = true; });

  // 팀을 반씩 나누고 캐릭터를 고르고 준비
  cs.forEach((c, i) => { c.send({ t: 'team', team: i % 2 }); c.send({ t: 'char', id: i % 6 }); });
  await sleep(200);
  // 인원이 다 차기 전에 시작을 눌러 본다(막혀야 한다)
  const earlyStart = { tried: false, blocked: false };
  cs.forEach(c => { c.send({ t: 'ready', on: false }); });
  await sleep(150);
  host.errors.length = 0;
  host.send({ t: 'start' }); earlyStart.tried = true;
  await sleep(250);
  earlyStart.blocked = host.errors.length > 0;
  const earlyMsg = host.errors[0] || '';

  cs.forEach(c => c.send({ t: 'ready', on: true }));
  await waitFor(() => host.room && host.room.members.every(m => m.ready), 2000);
  // 방장이 아닌 사람이 시작을 눌러 본다(막혀야 한다)
  const notHost = { tried: false, blocked: false };
  if (cs.length > 1) {
    cs[1].errors.length = 0;
    cs[1].send({ t: 'start' }); notHost.tried = true;
    await sleep(250);
    notHost.blocked = cs[1].errors.some(e => e.includes('방장'));
  }
  host.errors.length = 0;
  host.send({ t: 'start' });
  const started = await waitFor(() => cs.every(c => c.phase === 'playing'), 2000);

  // 조금 움직여 본다
  const t0 = Date.now();
  const buf = new Uint8Array(core.INPUT_BYTES);
  let seq = 0;
  const inputTimer = setInterval(() => {
    seq = (seq + 1) & 0xffff;
    cs.forEach((c, i) => {
      const dx = Math.cos((Date.now() / 500) + i), dy = Math.sin((Date.now() / 500) + i);
      core.encodeInput(seq, (Date.now() % 1500 < 120) ? core.BTN.KICK : 0, dx, dy, buf);
      if (c.ws.readyState === 1) c.ws.send(buf, { binary: true });
    });
  }, 50);
  host.send({ t: 'chat', text: '테스트 채팅' });
  await sleep(SECONDS * 1000);
  clearInterval(inputTimer);

  const dur = (host.lastSnapAt - host.firstSnapAt) / 1000;
  const hz = dur > 0 ? host.snaps / dur : 0;
  const out = {
    방: idx + 1,
    결과: started ? '경기 시작됨' : '시작 실패',
    입장: cs.filter(c => c.roomId === rid).length + '/' + cs.length,
    틀린비번_막힘: wrongPass.blocked,
    미준비_시작막힘: earlyStart.blocked ? ('예 ("' + earlyMsg + '")') : '아니오',
    방장아님_시작막힘: notHost.blocked,
    스냅샷: { 개수: host.snaps, 크기B: host.snapBytes, Hz: Math.round(hz * 10) / 10 },
    이벤트: [...new Set(host.events)].join(','),
    채팅수신: host.chats.length,
    퇴장: cs.filter(c => c.kicked).map(c => c.kicked.msg)
  };
  cs.forEach(c => { try { c.ws.close(); } catch (e) {} });
  return out;
}

(async () => {
  const results = [];
  for (let i = 0; i < ROOMS; i++) results.push(await runRoom(i));
  console.log(JSON.stringify({ 설정: { 주소: WS_URL, PLAYERS, ROOMS, DELAY, DELAY_AFTER, DROP, SECONDS }, 결과: results }, null, 1));
  await sleep(300);
  process.exit(0);
})();
