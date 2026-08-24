/* headless-probe.js — 검증 도구. 헤드리스 브라우저를 DevTools 프로토콜로 붙여 "보이는 페이지"에서
   실제 rAF fps·스냅샷 Hz·키보드 입력 경로를 재고, 필요하면 HUD 포함 전체 화면을 PNG 로 저장한다.
   Claude Code 의 인앱 브라우저 탭은 숨김 상태라 rAF 가 멈추므로(1단계에서 확인), 화면 성능 수치는 이 도구로 잰다.
   사용:  node tools/headless-probe.js <URL> [chrome|edge] [스크린샷 저장 경로]
   예:    node tools/headless-probe.js "http://localhost:8080/?debug=1" chrome shot.png
   창 크기: 환경변수 PROBE_SIZE=폭,높이 (기본 1280,800). 폰 가로 화면은 PROBE_SIZE=812,375 + URL 에 &touch=1
   PROBE_SKIP_KEYS=1 이면 키보드 검사를 건너뛴다(터치 화면 캡처 전용일 때).
   주의:  엣지 헤드리스는 페이지를 숨김으로 취급해 fps 가 0 으로 나온다(2026-08-24 확인). 크롬을 쓸 것.
   의존: Node 22+ (내장 WebSocket). 브라우저 경로는 이 PC 기준 고정. */
const { spawn } = require('child_process');
const http = require('http');
const url = process.argv[2] || 'http://localhost:8080/?debug=1';
const port = 9333;
const exe = process.argv[3] === 'edge' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edge = spawn(exe, [
  '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + process.env.TEMP + '\\edge-fps-probe',
  '--no-first-run', '--no-default-browser-check', '--window-size=' + (process.env.PROBE_SIZE || '1280,800'), 'about:blank'
], { stdio: 'ignore' });
const skipKeys = process.env.PROBE_SKIP_KEYS === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function getJSON(u) { return new Promise((res, rej) => http.get(u, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej)); }
(async () => {
  let targets = null;
  for (let i = 0; i < 40 && !targets; i++) { await sleep(250); try { targets = await getJSON('http://127.0.0.1:' + port + '/json'); } catch (e) {} }
  if (!targets) throw new Error('엣지 디버그 포트에 연결 실패');
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r; };
  await send('Page.enable', {});
  await send('Page.bringToFront', {});
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url });
  await sleep(1500);
  await send('Page.bringToFront', {});
  const hasCore = await evalJS('typeof SoccerCore');
  if (hasCore !== 'object') throw new Error('SoccerCore 없음: ' + JSON.stringify(hasCore));
  await evalJS('SoccerCore.debug.practice({ char: 1, dummies: 3, halfSec: 150 }); SoccerCore.debug.setInput({ slot: 0, dx: 1, dy: 0.3 }, 200); true');
  await sleep(1000);  // 워밍업
  const samples = [];
  for (let i = 0; i < 5; i++) { await sleep(1000); samples.push(await evalJS('JSON.stringify(SoccerCore.debug.stats())')); }
  const parsed = samples.map(s => JSON.parse(s));
  console.log(JSON.stringify({ visibility: await evalJS('document.visibilityState'), samples: parsed.map(p => ({ fps: p.fps, frameMs: p.frameMs, tick: p.tick, snapshotHz: p.snapshotHz, buffered: p.buffered, tickMsAvg: p.tickMsAvg, tickMsMax: p.tickMsMax })) }, null, 1));
  // 진짜 키보드 이벤트 → 입력 경로 검증 (방향키 이동 → W 드리블 → D 슛 → Q 감아차기 → S 뒷발 → A 필살기)
  if (!skipKeys) {
    const VK = { ArrowRight: 39, ArrowUp: 38, KeyZ: 90, KeyW: 87, KeyD: 68, KeyS: 83, KeyQ: 81, KeyE: 69, KeyA: 65 };
    const key = async (type, code, keyName) => send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: VK[code] });
    const tap = async (code, name, holdMs) => { await key('keyDown', code, name); await sleep(holdMs || 90); await key('keyUp', code, name); };
    const reset = async () => { await evalJS('SoccerCore.debug.setPlayer(0, 500, 400, 0); SoccerCore.debug.setBall(500, 400, 0, 0); true'); await sleep(160); };
    const evOf = async k => JSON.parse(await evalJS(`JSON.stringify(SoccerCore.debug.events().filter(e => e.kind === ${JSON.stringify(k)}).length)`));
    await evalJS('SoccerCore.debug.practice({ char: 0, dummies: 1, halfSec: 150 }); SoccerCore.debug.run(40); SoccerCore.debug.setPlayer(1, 1000, 700); true');
    const kb = {};
    await reset();
    await key('keyDown', 'ArrowRight', 'ArrowRight'); await sleep(600); await key('keyUp', 'ArrowRight', 'ArrowRight'); await sleep(120);
    const afterMove = JSON.parse(await evalJS('JSON.stringify(SoccerCore.debug.state().players[0])'));
    kb.moved600ms = Math.round(afterMove.x - 500); kb.hasBall = !!(afterMove.flags & 1);
    await reset(); await tap('KeyW', 'w'); await sleep(300);
    kb.dribble = await evOf('dribble');
    kb.ballAhead = JSON.parse(await evalJS('JSON.stringify(Math.round(SoccerCore.debug.state().ball.x - SoccerCore.debug.state().players[0].x))'));
    await reset(); await tap('KeyD', 'd', 700); await sleep(200);
    kb.shoot = await evOf('shoot');
    kb.shootSpeed = JSON.parse(await evalJS('JSON.stringify(Math.round(Math.hypot(SoccerCore.debug.raw().ball.vx, SoccerCore.debug.raw().ball.vy)))'));
    await reset(); await tap('KeyQ', 'q', 700); await sleep(200);
    kb.curve = await evOf('curve');
    kb.spin = JSON.parse(await evalJS('JSON.stringify(Math.round(SoccerCore.debug.raw().ball.spin * 10000) / 10000)'));
    await reset(); await tap('KeyS', 's'); await sleep(300);
    kb.backkick = await evOf('backkick');
    await evalJS('SoccerCore.debug.fillUlt(0); true'); await sleep(120);
    await tap('KeyA', 'a'); await sleep(200);
    kb.ult = await evOf('ult');
    console.log(JSON.stringify({ keyboard: kb }));
  }
  // HUD 포함 전체 화면 캡처 (선택: 4번째 인자 = 저장 경로)
  if (process.argv[4]) {
    await evalJS(`
      var d = SoccerCore.debug, B = SoccerCore.BTN;
      d.practice({ char: 1, dummies: 3, halfSec: 150 }); d.run(40);
      // 골대 앞 장면: 내 선수가 공을 몰고 슛 충전, 상대 하나는 발차기 중, 하나는 기절
      d.setPlayer(0, 980, 400, 0); d.setBall(980, 400, 0, 0); d.run(1);
      d.setInput({ slot: 0, buttons: B.KICK }, 10); d.run(9);
      d.setPlayer(1, 1060, 330, Math.PI); d.setInput({ slot: 1, buttons: B.KICK }, 1);
      d.setPlayer(2, 900, 470, 0); d.setPlayer(3, 1040, 470, Math.PI);
      d.fillUlt(0); d.run(1);
      if (d.stats().touch) {
        var z = document.getElementById('stickZone'), r = z.getBoundingClientRect();
        z.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: r.left + 110, clientY: r.top + r.height - 90, bubbles: true }));
        z.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: r.left + 152, clientY: r.top + r.height - 118, bubbles: true }));
        document.getElementById('bKick').classList.add('on');
      }
      true`);
    await sleep(200);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(process.argv[4], Buffer.from(shot.result.data, 'base64'));
    console.log('screenshot saved:', process.argv[4]);
  }
  ws.close(); edge.kill();
})().catch(e => { console.error('실패:', e.message); edge.kill(); process.exit(1); });
