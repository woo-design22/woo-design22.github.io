/* ============================================================================
   반대항축구 — 캐릭터 스프라이트 「도트(픽셀아트) 3/4 시점」 (채택 화풍, 2026-08-24)
   ----------------------------------------------------------------------------
   · 24×26 픽셀 격자에 프로그램으로 도안을 찍고, 오프스크린 캔버스에 1배로 구운 뒤
     imageSmoothingEnabled=false 로 정수배 확대해서 그린다(도트가 뭉개지지 않는다).
   · 시점은 5종(정면·정면3/4·측면·후면3/4·후면)이고 좌우 반전으로 8방향을 채운다.
   · 캐릭터 6종 + 골키퍼(charId 6). 색뿐 아니라 키·머리 크기·어깨너비·다리 길이가
     전부 달라서 실루엣만으로 구분된다.
   · 순수 함수: Math.random / Date.now / 외부 가변 상태를 쓰지 않는다.
     같은 o → 같은 그림. (프레임 캐시는 결정적 키로만 관리한다)
   ========================================================================== */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  /* ── 0. 격자 상수 ────────────────────────────────────────────────────────
     GW×GH 격자. BASE 행이 발바닥, 마지막 행은 외곽선용 여백.
     가로 중심은 CX 열. (CX, BASE+1) 이 o.x, o.y 에 오도록 그린다. */
  // 격자 가로를 24 → 30 으로 넓혔다(2026-08-25): 발차기 발끝이 격자 밖으로 나가 잘리던 문제.
  // 모든 좌표가 CX 기준 상대값이라 CX 만 같이 옮기면 그림은 그대로다. draw() 의 −CX*S 정렬도 자동으로 맞는다.
  var GW = 30, GH = 26, BASE = 24, CX = 15;
  // 2026-08-25 3차 지시: **납작한 종이 캐릭터**. 타격 판정(반지름 14 원)이 그림과 어긋나 헷갈린다는 지적에 따라
  // ① 테두리를 종이 오린 듯한 밝은 색으로 ② 명암을 거의 없애 평평하게 ③ 세로로 눌러 발밑 판정에 가깝게 그린다.
  var OUTLINE = '#fbf3e0';           // 종이 오림 테두리(따뜻한 흰색)
  var FLAT_SHADE = 0.22;             // 명암 세기(1 = 예전 입체감, 0 = 완전 평면)
  // 2026-08-25 4차 지시: "좀 더 정사각형에 가까운 모습". 도안은 그대로 두고 **그릴 때만** 가로로 늘리고 세로로 눌러
  // 실루엣의 가로:세로를 1에 가깝게 만든다. 이러면 그림 폭이 충돌 지름(2×PLAYER_R)과 거의 같아져 판정이 눈에 맞는다.
  var FLATTEN = 0.62;                // 세로 눌림
  var WIDEN = 1.45;                  // 가로 늘림

  /* ── 1. 색 도구 ─────────────────────────────────────────────────────────
     색을 하드코딩하지 않고 기준색에서 명암을 계산한다. 결과는 캐시(결정적). */
  var shadeCache = {};
  function shade(hex, amt) {
    amt *= FLAT_SHADE;               // 종이라서 거의 평평하다
    var key = hex + '|' + amt;
    var hit = shadeCache[key];
    if (hit) return hit;
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var to = amt >= 0 ? 255 : 0, a = amt >= 0 ? amt : -amt;
    r = Math.round(r + (to - r) * a);
    g = Math.round(g + (to - g) * a);
    b = Math.round(b + (to - b) * a);
    var out = '#' + (((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1));
    shadeCache[key] = out;
    return out;
  }

  /* ── 2. 유니폼 ──────────────────────────────────────────────────────────
     상의 = 팀색, 하의 = 흰색, 양말 = 팀색. 잔디 위에서 상·하·발 세 띠로 나뉘어
     멀리서도 사람 형태가 읽힌다. 골키퍼는 양 팀색·잔디색 모두와 대비되는 색. */
  var TEAM_KIT = [
    { main: '#3f84f6', shorts: '#eef2fa', sock: '#3f84f6', trim: '#ffffff', deep: '#17307a' },
    { main: '#ef4b4b', shorts: '#fbeeee', sock: '#ef4b4b', trim: '#ffffff', deep: '#7a1717' }
  ];
  var KEEPER_KIT = [
    { main: '#f5d033', shorts: '#33343f', sock: '#f5d033', trim: '#17307a', deep: '#8a6c00' },
    { main: '#2ad3c2', shorts: '#33343f', sock: '#2ad3c2', trim: '#7a1717', deep: '#0c6b62' }
  ];

  /* ── 3. 캐릭터 체형표 ───────────────────────────────────────────────────
     h(총 키) = headH + neck + torsoH + shortsH + thighH + sockH + shoeH
     가로 폭은 전부 홀수(중심 열 CX 에 맞추기 위해).                        */
  var BODY = [
    /* 0 체육부장형 — 균형형·리더. 머리띠 + 호루라기, 어깨가 벌어진 다부진 체형 */
    { key: 'captain', h: 23, headW: 9, headH: 8, hairH: 3, neck: 1, torsoH: 5,
      shoulderW: 11, torsoW: 9, shortsH: 3, thighH: 2, sockH: 2, shoeH: 2,
      legW: 3, footW: 3, armW: 2, hair: 'crop', num: '4',
      skin: '#e8b183', hairC: '#3a2a1c', shoe: '#26272f', acc: '#ffc22e', tag: 'whistle' },

    /* 1 에이스형 — 슛이 강함. 긴 머리 + 완장, 흰 축구화, 등번호 10 */
    { key: 'ace', h: 23, headW: 9, headH: 8, hairH: 3, neck: 1, torsoH: 5,
      shoulderW: 9, torsoW: 7, shortsH: 3, thighH: 2, sockH: 2, shoeH: 2,
      legW: 3, footW: 3, armW: 2, hair: 'long', num: '10',
      skin: '#f2c69c', hairC: '#5c3418', shoe: '#f4f6fb', acc: '#ffd34a', tag: 'band' },

    /* 2 전학생형 — 순간이동. 목이 길고 마른 장신, 안경 + 단정한 가르마 */
    { key: 'transfer', h: 24, headW: 7, headH: 7, hairH: 3, neck: 2, torsoH: 6,
      shoulderW: 7, torsoW: 7, shortsH: 3, thighH: 2, sockH: 2, shoeH: 2,
      legW: 2, footW: 3, armW: 2, hair: 'neat', num: '7',
      skin: '#f6dcc0', hairC: '#2b3140', shoe: '#31344a', acc: '#e6edf7', tag: 'glasses' },

    /* 3 덩치형 — 느리고 강함. 어깨가 두 배, 짧은 스포츠머리 */
    { key: 'big', h: 24, headW: 9, headH: 8, hairH: 2, neck: 1, torsoH: 6,
      shoulderW: 13, torsoW: 9, shortsH: 3, thighH: 2, sockH: 2, shoeH: 2,
      legW: 4, footW: 5, armW: 3, armOut: 1, hair: 'buzz', num: '5',
      skin: '#d99b6a', hairC: '#2a2118', shoe: '#1f212a', acc: '#98a3b5', tag: 'none' },

    /* 4 육상부형 — 가장 빠름. 가늘고 긴 다리, 러닝셔츠 + 헤드밴드 */
    { key: 'runner', h: 23, headW: 7, headH: 7, hairH: 2, neck: 1, torsoH: 5,
      shoulderW: 9, torsoW: 7, shortsH: 3, thighH: 3, sockH: 2, shoeH: 2,
      legW: 2, footW: 3, armW: 2, hair: 'headband', num: '9',
      skin: '#cf9256', hairC: '#171b24', shoe: '#f6f8fc', acc: '#ff7a2f', tag: 'tank' },

    /* 5 장난꾸러기형 — 방해. 작고 통통, 큰 머리에 삐친 머리, 능글맞은 웃음 */
    { key: 'prank', h: 21, headW: 9, headH: 9, hairH: 3, neck: 0, torsoH: 5,
      shoulderW: 9, torsoW: 9, shortsH: 3, thighH: 1, sockH: 1, shoeH: 2,
      legW: 3, footW: 3, armW: 2, hair: 'spike', num: '2',
      skin: '#f7cfa2', hairC: '#4a2a12', shoe: '#2e2836', acc: '#77e07d', tag: 'grin' },

    /* 6 골키퍼 — 밝은 대비 유니폼 + 장갑 + 모자 */
    { key: 'keeper', h: 23, headW: 9, headH: 8, hairH: 3, neck: 1, torsoH: 5,
      shoulderW: 11, torsoW: 9, shortsH: 3, thighH: 2, sockH: 2, shoeH: 2,
      legW: 3, footW: 3, armW: 3, hair: 'cap', num: '1',
      skin: '#ecbd93', hairC: '#241a12', shoe: '#26272f', acc: '#f2f5fa', tag: 'gloves' }
  ];

  /* 3×5 숫자 도안(등번호). 행마다 3비트, 최상위 비트가 왼쪽 열. */
  var DIGITS = {
    '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7],
    '3': [7, 1, 7, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7],
    '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7],
    '9': [7, 5, 7, 1, 7]
  };

  /* ── 4. 방향(8) → 시점(5) + 좌우 반전 ───────────────────────────────────
     facing 0 = 화면 오른쪽, +PI/2 = 화면 아래. 기본 도안은 "오른쪽 보기". */
  var VIEW_OF   = ['side', 'dside', 'down', 'dside', 'side', 'uside', 'up', 'uside'];
  var MIRROR_OF = [false,  false,   false,  true,    true,   true,    false, false];

  /* 발차기 때 발이 가는 자리 — 엉덩이 기준, 다리 길이의 배수.
     dy 가 +면 아래(카메라 쪽), −면 위(화면 안쪽). */
  var KICKT  = { down: [1.05, 0.55], dside: [1.20, 0.35], side: [1.40, 0.10],
                 uside: [1.05, -0.20], up: [0.55, -0.60] };
  var SQUASH = { down: 1.0, dside: 0.88, side: 0.70, uside: 0.88, up: 1.0 };
  var FACE_DX = { down: 0, dside: 1, side: 2, uside: 1, up: 0 };

  /* ── 5. 픽셀 버퍼 ───────────────────────────────────────────────────────*/
  var buf = new Array(GW * GH);

  function clearBuf() { for (var i = 0; i < buf.length; i++) buf[i] = null; }
  function px(x, y, c) {
    if (!c) return;
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= GW || y >= GH) return;
    buf[y * GW + x] = c;
  }
  function rc(x, y, w, h, c) {
    if (!c || w <= 0 || h <= 0) return;
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) px(x + i, y + j, c);
  }
  /* 모서리를 깎은 덩어리 — 머리·몸통을 각지지 않게 한다. */
  function blob(x, y, w, h, c, ins0, ins1) {
    for (var j = 0; j < h; j++) {
      var ins = j === 0 ? ins0 : (j === h - 1 ? ins1 : 0);
      rc(x + ins, y + j, w - ins * 2, 1, c);
    }
  }
  /* 굵은 선(팔·다리). t0~t1 구간만 칠해 반바지·양말 구간색을 입힌다. */
  function limb(x0, y0, x1, y1, w, c, t0, t1) {
    if (!c) return;
    var dx = x1 - x0, dy = y1 - y0;
    var n = Math.max(Math.abs(dx), Math.abs(dy), 1) * 2;
    var o = (w - 1) >> 1;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (t < t0 || t > t1) continue;
      rc(Math.round(x0 + dx * t) - o, Math.round(y0 + dy * t) - o, w, w, c);
    }
  }

  /* ── 6. 자세 ────────────────────────────────────────────────────────────*/
  function getPose(pose, f) {
    var s = {
      dy: 0, lean: 0, hdx: 0, hdy: 0,
      liftL: 0, liftR: 0, legDxL: 0, legDxR: 0,
      armL: 0, armR: 0, armUp: 0,
      kick: 0, ext: 0,
      eyes: 0                       // 0 보통 1 감음 2 뒤집힘 3 부릅뜸
    };
    if (pose === 'run') {
      if (f === 0)      { s.liftL = 3; s.legDxL = 2;  s.legDxR = -2; s.armL = -2; s.armR = 2;  s.dy = -1; }
      else if (f === 1) { s.legDxL = 1; s.legDxR = -1; s.armL = -1; s.armR = 1; }
      else if (f === 2) { s.liftR = 3; s.legDxR = 2;  s.legDxL = -2; s.armL = 2;  s.armR = -2; s.dy = -1; }
      else              { s.legDxL = -1; s.legDxR = 1; s.armL = 1;  s.armR = -1; }
    } else if (pose === 'idle') {
      if (f === 1) s.dy = 1;                    // 숨쉬기
      s.legDxL = -1; s.legDxR = 1;
    } else if (pose === 'kick' || pose === 'fart') {
      var back = pose === 'fart';                 // 방귀는 몸을 앞으로 숙이고 뒤로 힘을 준다
      s.kick = back ? -1 : 1;
      s.ext = f === 0 ? -0.4 : f === 1 ? 1 : 0.5;   // 당김 → 임팩트 → 마무리
      s.lean = back ? 1 : -1;
      s.hdx = back ? 1 : -1;
      s.armL = back ? 2 : -2; s.armR = back ? -2 : 2;
      s.legDxL = back ? 1 : -1;
      s.eyes = 3;
      if (f === 1) s.dy = -1;
    } else if (pose === 'stun') {
      s.lean = f === 0 ? 1 : -1;
      s.hdx = f === 0 ? 1 : -1;
      s.hdy = 1; s.dy = 1;
      s.armUp = 1; s.armL = f === 0 ? 1 : -1; s.armR = f === 0 ? -1 : 1;
      s.liftL = 1; s.legDxL = -2; s.legDxR = 2;
      s.eyes = 2;
    } else if (pose === 'ult') {
      if (f === 0) { s.dy = 1; s.liftL = 1; s.liftR = 1; s.legDxL = -2; s.legDxR = 2; s.armL = -1; s.armR = -1; }
      else { s.dy = -1; s.armUp = 1; s.legDxL = -2; s.legDxR = 2; }
      s.eyes = 3;
    }
    return s;
  }
  function frameCount(pose) {
    return pose === 'run' ? 4 : (pose === 'kick' || pose === 'fart') ? 3 : 2;
  }
  // t 에 캐릭터별 위상차를 더해 부른다 — 여러 명이 한 화면에 있어도 걸음이 겹치지 않는다.
  function frameOf(pose, t, phase) {
    if (pose === 'run')  return Math.floor(t * 11) & 3;
    if (pose === 'stun') return Math.floor(t * 9) & 1;
    if (pose === 'kick' || pose === 'fart') return phase < 0.3 ? 0 : phase < 0.62 ? 1 : 2;
    if (pose === 'ult')  return phase < 0.45 ? 0 : 1;
    return Math.floor(t * 2.2) & 1;
  }

  /* ── 7. 머리 ────────────────────────────────────────────────────────────*/
  function drawHead(view, m, kit, s, hy) {
    var hw = m.headW, hh = m.headH, hairH = m.hairH;
    var hx = CX - (hw >> 1) + s.hdx;
    hy += s.hdy;
    var skin = m.skin, skinD = shade(skin, -0.17), skinX = shade(skin, -0.32);
    var hair = m.hairC, hairL = shade(hair, 0.30);
    var back = (view === 'up' || view === 'uside');
    var side = (view === 'side');
    var fdx = FACE_DX[view];
    var ins0 = hw >= 9 ? 2 : 1;
    var eyeC = '#231f2e', white = '#fbfcff';

    // 두상
    blob(hx, hy, hw, hh, back ? hair : skin, ins0, 1);
    if (!back) {
      rc(hx + hw - 1, hy + hairH, 1, hh - hairH - 1, skinD);    // 오른쪽 그늘
      rc(hx + 1, hy + hh - 1, hw - 2, 1, skinD);                // 턱
    }

    // 머리카락
    if (back) {
      blob(hx, hy, hw, hh - 1, hair, ins0, 0);
      blob(hx, hy, hw, 1, hairL, ins0, ins0);
    } else if (side || view === 'dside') {
      var bw = side ? hw - 2 : hw - 3;                          // 뒤통수 덮는 폭
      blob(hx, hy, hw, hairH, hair, ins0, 0);
      rc(hx, hy + hairH, bw, hh - hairH - 1, hair);
      blob(hx, hy, hw, 1, hairL, ins0, ins0);
      px(hx + hw, hy + hh - 3, skin);                           // 코
    } else {
      blob(hx, hy, hw, hairH, hair, ins0, 0);
      blob(hx, hy, hw, 1, hairL, ins0, ins0);
      px(hx, hy + hairH, hair); px(hx + hw - 1, hy + hairH, hair);   // 구레나룻
    }

    // 머리 모양별 특징
    var st = m.hair;
    if (st === 'long') {
      rc(hx - 1, hy + hairH, 1, hh - hairH, hair);
      rc(hx + hw, hy + hairH, 1, hh - hairH, hair);
      if (back) { rc(hx + (hw >> 1) - 1, hy + hh - 1, 3, 2, hair); px(CX + s.hdx, hy + hh + 1, m.acc); }
    } else if (st === 'crop' || st === 'headband') {
      rc(hx - 1, hy + hairH - 1, hw + 2, 1, m.acc);             // 머리띠 / 헤드밴드
      if (st === 'headband') { px(hx - 1, hy + hairH, m.acc); px(hx - 2, hy + hairH + 1, m.acc); }
    } else if (st === 'neat') {
      rc(hx + hw - 3, hy, 1, hairH, hairL);                     // 가르마
    } else if (st === 'buzz') {
      blob(hx, hy, hw, 1, hairL, ins0, ins0);
    } else if (st === 'spike') {
      px(hx + 1, hy - 1, hair); px(hx + 3, hy - 2, hair); px(hx + 3, hy - 1, hair);
      px(hx + 6, hy - 1, hair); px(hx + hw - 1, hy - 2, hair); px(hx + hw - 1, hy - 1, hair);
    } else if (st === 'cap') {
      blob(hx, hy, hw, hairH - 1, kit.deep, ins0, 0);           // 모자
      blob(hx, hy, hw, 1, shade(kit.deep, 0.3), ins0, ins0);
      rc(hx + 1, hy + hairH - 2, hw - 2, 1, kit.main);          // 팀 밝은색 띠
      rc(hx - 1, hy + hairH - 1, hw + 2, 1, shade(kit.deep, -0.3));   // 챙
    }

    if (!back && st !== 'long') { px(hx - 1, hy + hh - 3, skin); px(hx + hw, hy + hh - 3, skinX); }

    if (back) return;

    /* 이목구비 — 머리가 9칸이면 2×2 눈, 7칸이면 1×2 눈 */
    var eyeY = hy + hh - 4 + (hw >= 9 ? 0 : 1);
    var big = hw >= 9;
    var ex1 = hx + (big ? 2 : 1) + fdx, ex2 = hx + hw - (big ? 4 : 2);
    var ew = big ? 2 : 1;

    function eye(x, wid, tall) {
      if (s.eyes === 2) {                                      // 기절: 하얗게 뒤집힘
        rc(x, eyeY, wid, tall, white); px(x, eyeY, eyeC); px(x + wid - 1, eyeY + tall - 1, eyeC);
      } else if (s.eyes === 1) {
        rc(x, eyeY + tall - 1, wid, 1, skinX);
      } else {
        rc(x, eyeY, wid, tall, eyeC);
        px(x, eyeY, white);                                    // 반짝임
      }
    }
    var eh = s.eyes === 3 ? 2 : (big ? 2 : 2);
    if (m.tag === 'glasses') {                                 // 안경(전학생)
      var lens = '#cfe1f5', frm = '#59627a';
      if (!side) { rc(ex1, eyeY, 2, 2, lens); px(ex1, eyeY + 1, eyeC); px(ex1 - 1, eyeY, frm); }
      rc(ex2, eyeY, 2, 2, lens); px(ex2 + 1, eyeY + 1, eyeC); px(ex2 + 2, eyeY, frm);
      if (!side) rc(ex1 + 2, eyeY, ex2 - ex1 - 2, 1, frm);      // 콧대
    } else {
      if (!side) eye(ex1, ew, eh);
      eye(ex2, ew, eh);
    }
    if (s.eyes === 3) {                                        // 눈썹
      if (!side) rc(ex1, eyeY - 1, ew, 1, hair);
      rc(ex2, eyeY - 1, ew, 1, hair);
    }

    // 입
    var mx = hx + (hw >> 1) + fdx, my = hy + hh - 1;
    if (m.tag === 'grin') { rc(mx - 1, my, 3, 1, eyeC); px(mx + 1, my - 1, eyeC); }
    else if (s.eyes === 2) px(mx, my, eyeC);
    else if (s.eyes === 3) rc(mx, my, 2, 1, eyeC);
    else px(mx, my, shade(skin, -0.42));
  }

  /* ── 8. 몸통 ────────────────────────────────────────────────────────────*/
  function drawTorso(view, m, kit, s, ty) {
    var sq = SQUASH[view];
    var sw = Math.max(3, (Math.round(m.shoulderW * sq) | 1));
    var tw = Math.max(3, (Math.round(m.torsoW * sq) | 1));
    var th = m.torsoH, lean = s.lean;
    var main = kit.main, dark = shade(main, -0.30), light = shade(main, 0.24);
    var back = (view === 'up' || view === 'uside');
    var sx = CX - (sw >> 1) + lean, tx = CX - (tw >> 1) + lean;

    blob(sx, ty, sw, 2, main, 1, 0);                 // 어깨
    rc(tx, ty + 2, tw, th - 2, main);                // 몸통
    blob(sx, ty, sw, 1, light, 1, 1);                // 윗면 하이라이트
    rc(tx + tw - 1, ty + 2, 1, th - 2, dark);        // 오른쪽 그늘
    px(sx + sw - 1, ty + 1, dark);
    rc(tx, ty + th - 1, tw, 1, dark);                // 밑단

    if (m.tag === 'tank') {                          // 러닝셔츠: 어깨가 드러난다
      rc(sx, ty, 2, 2, m.skin);
      rc(sx + sw - 2, ty, 2, 2, shade(m.skin, -0.17));
      rc(sx + 2, ty, sw - 4, 1, m.acc);
    }
    if (m.tag === 'gloves') rc(sx, ty + 1, sw, 1, kit.trim);   // 골키퍼 어깨선

    if (back) {
      var str = m.num, n = str.length, dw = n * 3 + (n - 1);
      if (tw >= dw && th >= 6) {
        var bx = CX - (dw >> 1) + lean, by = ty + 1;
        for (var i = 0; i < n; i++) {
          var rows = DIGITS[str.charAt(i)];
          if (!rows) continue;
          for (var r = 0; r < 5; r++) {
            var bits = rows[r];
            for (var c = 0; c < 3; c++) if (bits & (4 >> c)) px(bx + i * 4 + c, by + r, kit.trim);
          }
        }
      } else {
        rc(tx + 1, ty + 2, tw - 2, 1, kit.trim);     // 좁으면 등줄 한 줄
      }
    } else {
      rc(CX - 1 + lean, ty, 3, 1, kit.trim);         // 칼라
      px(CX + lean, ty + 1, kit.trim);
      if (m.tag === 'whistle') {                     // 호루라기 끈 + 몸통
        px(CX - 2 + lean, ty + 1, kit.trim); px(CX + 2 + lean, ty + 1, kit.trim);
        rc(CX - 1 + lean, ty + 2, 2, 1, m.acc);
      }
      if (m.tag === 'band') rc(tx + 1, ty + 2, tw - 2, 1, kit.trim);
      if (m.tag === 'grin') rc(tx + 1, ty + th - 2, tw - 2, 1, shade(main, -0.12));
    }
    return { sx: sx, sw: sw, tx: tx, tw: tw };
  }

  /* 팔 하나. dirSign −1 왼쪽 / +1 오른쪽, swing +가 앞. */
  function drawArm(view, m, kit, s, ty, x, dirSign, swing, far) {
    var len = m.torsoH + 2;
    var skin = far ? shade(m.skin, -0.24) : m.skin;
    var main = far ? shade(kit.main, -0.24) : kit.main;
    var ex, ey;
    if (s.armUp) { ex = x + dirSign * 2 + swing; ey = ty - len + 2; }
    else { ex = x + swing * 0.8; ey = ty + len; }
    var sleeve = m.tag === 'gloves' ? 0.9 : m.tag === 'tank' ? 0 : 0.4;
    limb(x, ty + 1, ex, ey, m.armW, skin, 0, 1);
    if (sleeve > 0) limb(x, ty + 1, ex, ey, m.armW, main, 0, sleeve);
    if (m.tag === 'band' && dirSign < 0) limb(x, ty + 1, ex, ey, m.armW, m.acc, 0.4, 0.58);
    var hw = m.tag === 'gloves' ? m.armW : m.armW;
    var hc = m.tag === 'gloves' ? (far ? shade('#f4f6fa', -0.24) : '#f4f6fa') : skin;
    rc(Math.round(ex) - ((hw - 1) >> 1), Math.round(ey) - 1, hw, 2, hc);
    if (m.tag === 'gloves') px(Math.round(ex) - ((hw - 1) >> 1), Math.round(ey) - 1, kit.main);
  }

  /* 다리 하나: 엉덩이 → 발목을 잇고 반바지·양말·신발 구간색을 입힌다. */
  function drawLeg(m, kit, hx, hy, ax, ay, footDx, bigFoot, far) {
    var skin = far ? shade(m.skin, -0.24) : m.skin;
    var shorts = far ? shade(kit.shorts, -0.20) : kit.shorts;
    var sock = far ? shade(kit.sock, -0.22) : kit.sock;
    var shoe = far ? shade(m.shoe, -0.20) : m.shoe;
    var tot = m.shortsH + m.thighH + m.sockH;
    limb(hx, hy, ax, ay, m.legW, skin, 0, 1);
    limb(hx, hy, ax, ay, m.legW, shorts, 0, m.shortsH / tot);
    limb(hx, hy, ax, ay, m.legW, sock, 1 - m.sockH / tot, 1);
    var fw = m.footW + (bigFoot ? 1 : 0);
    rc(Math.round(ax) - ((fw - 1) >> 1) + footDx, Math.round(ay) + 1, fw, m.shoeH, shoe);
  }

  /* ── 9. 한 프레임 그리기 ────────────────────────────────────────────────*/
  function paint(view, m, kit, s) {
    var top = BASE - m.h + 1;
    var hy = top + s.dy;
    var ty = top + m.headH + m.neck + s.dy;
    var sy = ty + m.torsoH;                       // 엉덩이
    var ankle = BASE - m.shoeH;
    var legLen = ankle - sy;
    var back = (view === 'up' || view === 'uside');
    var sq = SQUASH[view];
    var kv = KICKT[view];
    var isSide = (view === 'side');

    var spread = isSide ? 1
      : Math.max(1, Math.round(((m.torsoW - m.legW) >> 1) * sq));
    var hxL = CX - spread + s.lean, hxR = CX + spread + s.lean;

    var axL = hxL + s.legDxL, ayL = ankle - s.liftL;
    var axR = hxR + s.legDxR, ayR = ankle - s.liftR;
    var bigFootR = false;

    if (s.kick !== 0) {
      // 서 있는 발 위치 → 차는 자리로 보간한다. ext<0(준비)면 반대쪽으로 당긴다.
      var u = Math.abs(s.ext);
      var sgn = s.ext < 0 ? -s.kick : s.kick;
      var tgx = hxR + kv[0] * legLen * sgn;
      var tgy = sy + kv[1] * legLen * (s.ext < 0 ? 0.9 : 1);
      axR = Math.round(hxR + (tgx - hxR) * u);
      ayR = Math.round(ankle + (tgy - ankle) * u);
      bigFootR = (view === 'down' || view === 'dside') && s.ext > 0;
    }

    var footDx = isSide ? 1 : (view === 'dside' || view === 'uside') ? 1 : 0;
    var kickFootDx = s.kick > 0 ? footDx + 1 : s.kick < 0 ? -1 : footDx;

    // 먼 다리 → 가까운 다리 → 엉덩이 → 몸통 → 팔 → 목 → 머리
    drawLeg(m, kit, hxL, sy, axL, ayL, back ? 0 : -footDx, false, !back && (isSide || view === 'dside'));
    drawLeg(m, kit, hxR, sy, axR, ayR, kickFootDx, bigFootR, false);

    var hipW = Math.max(3, (Math.round(m.torsoW * sq) | 1));
    rc(CX - (hipW >> 1) + s.lean, sy, hipW, m.shortsH - 1, kit.shorts);
    rc(CX - (hipW >> 1) + s.lean, sy + m.shortsH - 2, hipW, 1, shade(kit.shorts, -0.16));
    // 캐릭터 고유색 허리띠 — 팀색·유니폼이 같아도 어느 방향에서든 누구인지 구분된다(2026-08-25)
    rc(CX - (hipW >> 1) + s.lean, sy, hipW, 1, m.acc);

    // 먼 팔은 몸통 뒤, 가까운 팔은 몸통 앞
    var out = m.armOut || 0;
    var swPre = Math.max(3, (Math.round(m.shoulderW * sq) | 1));
    var sxPre = CX - (swPre >> 1) + s.lean;
    if (isSide) drawArm(view, m, kit, s, ty, CX - 2 + s.lean, -1, s.armL, true);
    else        drawArm(view, m, kit, s, ty, sxPre - out, -1, s.armL, back);

    var ti = drawTorso(view, m, kit, s, ty);

    if (isSide) drawArm(view, m, kit, s, ty, CX + 1 + s.lean, 1, s.armR, false);
    else        drawArm(view, m, kit, s, ty, ti.sx + ti.sw - m.armW + out, 1, s.armR, false);

    if (m.neck > 0) rc(CX - 1 + s.hdx, ty - m.neck, 3, m.neck, shade(m.skin, -0.22));

    drawHead(view, m, kit, s, hy);
  }

  /* 버퍼 → 캔버스. 빈 칸이지만 이웃이 찍혀 있으면 외곽선을 넣는다. */
  function flush() {
    var cv = document.createElement('canvas');
    cv.width = GW; cv.height = GH;
    var g = cv.getContext('2d');
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        var i = y * GW + x, c = buf[i];
        if (!c) {
          var near = (x > 0 && buf[i - 1]) || (x < GW - 1 && buf[i + 1]) ||
                     (y > 0 && buf[i - GW]) || (y < GH - 1 && buf[i + GW]);
          if (!near) continue;
          c = OUTLINE;
        }
        g.fillStyle = c;
        g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  var cache = {};
  function bake(charId, team, view, pose, frame) {
    var key = charId + '|' + team + '|' + view + '|' + pose + '|' + frame;
    var hit = cache[key];
    if (hit) return hit;
    var m = BODY[charId];
    var kit = (charId === 6 ? KEEPER_KIT : TEAM_KIT)[team];
    clearBuf();
    paint(view, m, kit, getPose(pose, frame));
    cache[key] = flush();
    return cache[key];
  }

  /* ── 10. 벡터 장식(굽지 않는다) ─────────────────────────────────────────*/
  function ellipse(ctx, x, y, rx, ry, c) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  }
  function ring(ctx, x, y, rx, ry, c, lw) {
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
  }

  /* ── 11. 공개 함수 ──────────────────────────────────────────────────────*/
  /* ── 사람이 그린 캐릭터 그림 (chars/*.png) ────────────────────────────────
     있으면 도트 대신 이것을 그린다. 파일이 없거나 아직 안 왔으면 **도트로 그린다**(폴백을 없애지 말 것).
     그림은 앞을 보고 선 정사각형 256×256 이라 회전시키지 않는다 — 왼쪽을 볼 때만 좌우로 뒤집는다.
     발밑 판정 원반은 그림이 있든 없든 그대로 그린다. 그 원이 곧 판정이다.
     골키퍼(charId 6)는 그림이 없어 늘 도트로 그려진다. */
  var PHOTO_POSE = { idle: '', run: '-run', kick: '-kick', fart: '-fart', stun: '-stun', ult: '-goal' };
  var PHOTO_SCALE = 3.2;    // 그림 한 변 = 반지름 × 이 값 (사람 키 ≈ 3.0r, 어깨 폭 ≈ 판정 지름)
  var photoCache = {}, photoOK = (typeof Image !== "undefined");
  function photoOf(key, pose) {
    if (!photoOK || !key) return null;
    var name = key + (PHOTO_POSE[pose] || "");
    var im = photoCache[name];
    if (im === undefined) {
      im = new Image();
      im.src = "chars/" + name + ".png";
      photoCache[name] = im;
      return null;
    }
    return (im.complete && im.naturalWidth > 0) ? im : null;
  }
  function draw(ctx, o) {
    var charId = o.charId | 0;
    if (charId < 0 || charId > 6) charId = 0;
    var team = o.team ? 1 : 0;
    var r = o.r || 14;
    var t = o.t || 0, phase = o.phase || 0;
    var m = BODY[charId];
    var kit = (charId === 6 ? KEEPER_KIT : TEAM_KIT)[team];

    var S = Math.max(1, Math.round(r * 3.3 / GH));
    var x = Math.round(o.x), y = Math.round(o.y);

    var d = ((Math.round((o.facing || 0) / TAU * 8) % 8) + 8) % 8;
    var view = VIEW_OF[d], mirror = MIRROR_OF[d];

    var pose = o.motion || 'idle';
    if (pose !== 'run' && pose !== 'kick' && pose !== 'fart' &&
        pose !== 'stun' && pose !== 'ult') pose = 'idle';
    var f = frameOf(pose, t + charId * 0.137, phase) % frameCount(pose);   // 캐릭터마다 걸음 위상차
    // 그림은 팀에 상관없이 똑같이 생겼다 — 발밑 원반을 팀 색으로 칠해야 아군·적군이 구분된다.
    // 골키퍼 그림은 아직 없어서 덩치형 그림을 빌려 쓴다(chars/keeper.png 를 넣으면 그 줄만 바꾸면 된다).
    var ph = photoOf(charId === 6 ? 'big' : m.key, pose);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // **타격 판정 원반** — 반지름 r 이 곧 충돌 반지름(PLAYER_R)이다. 그림이 아니라 이 원이 판정이다.
    ellipse(ctx, x, y - r * 0.04, r, r * 0.42, 'rgba(0,0,0,0.30)');
    if (ph) {
      ctx.globalAlpha = 0.62;
      ellipse(ctx, x, y - r * 0.04, r * 0.94, r * 0.40, kit.main);
      ctx.globalAlpha = 1;
      ring(ctx, x, y - r * 0.04, r, r * 0.42, 'rgba(255,255,255,0.55)', Math.max(1.5, r * 0.10));
    } else {
      ring(ctx, x, y - r * 0.04, r, r * 0.42, 'rgba(255,255,255,0.30)', Math.max(1, r * 0.07));
    }

    if (o.hasBall) {
      ring(ctx, x, y - r * 0.05, r * 1.15, r * 0.42, shade(kit.main, 0.38), Math.max(1.5, r * 0.09));
      ring(ctx, x, y - r * 0.05, r * 1.15, r * 0.42, 'rgba(255,255,255,0.5)', Math.max(1, r * 0.04));
    }

    if (o.ultActive) {
      var pulse = 0.5 + 0.5 * Math.sin(t * 7);
      ring(ctx, x, y - r * 0.05, r * (1.25 + pulse * 0.35), r * (0.48 + pulse * 0.13),
           'rgba(255,214,102,' + (0.78 - pulse * 0.38).toFixed(3) + ')', Math.max(2, r * 0.12));
      ctx.fillStyle = 'rgba(255,238,166,0.9)';
      for (var i = 0; i < 4; i++) {
        var ph = (t * 1.6 + i * 0.25) % 1;
        var ax = x + Math.cos(i * 2.2 + t * 3) * r * 0.95;
        var ay = y - ph * r * 2.7;
        var sz = Math.max(2, Math.round(r * 0.16 * (1 - ph)));
        ctx.fillRect(Math.round(ax), Math.round(ay), sz, sz);
      }
    }

    if (ph) {
      var F = r * PHOTO_SCALE;
      ctx.imageSmoothingEnabled = true;
      ctx.translate(x, y + r * 0.06);          // 발이 판정 원반 위에 놓이게 살짝 내린다
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(ph, -F / 2, -F, F, F);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
    } else {
      var img = bake(charId, team, view, pose, f);
      ctx.translate(x, y);
      if (mirror) ctx.scale(-1, 1);
      ctx.drawImage(img, -CX * S * WIDEN, -(BASE + 1) * S * FLATTEN, GW * S * WIDEN, GH * S * FLATTEN);   // 납작하고 넓적하게
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    if (o.charge > 0) {
      var k = o.charge > 1 ? 1 : o.charge;
      var col = k < 0.5 ? '#ffe89a' : k < 0.85 ? '#fb923c' : '#f87171';
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, r * 0.13);
      ctx.beginPath();
      ctx.arc(x, y - r * 0.05, r * 1.45, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx.stroke();
      var fl = 0.5 + 0.5 * Math.sin(t * 22), sz2 = Math.max(2, Math.round(r * 0.13));
      ctx.fillStyle = col;
      for (var j = 0; j < 3; j++) {
        var aa = (o.facing || 0) + (j - 1) * 0.5, rr = r * (1.45 + fl * 0.3);
        ctx.fillRect(Math.round(x + Math.cos(aa) * rr), Math.round(y - r * 0.05 + Math.sin(aa) * rr), sz2, sz2);
      }
    }

    if (pose === 'stun') {
      var hyPix = y - m.h * S - r * 0.16;
      ctx.fillStyle = '#ffe066';
      for (var q = 0; q < 3; q++) {
        var a2 = t * 5 + q * (TAU / 3);
        var sxp = Math.round(x + Math.cos(a2) * r * 0.8);
        var syp = Math.round(hyPix + Math.sin(a2) * r * 0.24);
        var ss = Math.max(3, Math.round(r * 0.16)), th = Math.max(1, Math.round(ss / 3));
        ctx.fillRect(sxp - (ss >> 1), syp - (th >> 1), ss, th);
        ctx.fillRect(sxp - (th >> 1), syp - (ss >> 1), th, ss);
      }
    }

    ctx.restore();
  }

  global.SoccerSprite = {
    STYLE: '손그림 캐릭터(chars/*.png). 파일이 없으면 납작한 종이 도트로 폴백',
    CHARACTERS: [
      { id: 0, key: 'captain',  name: '체육부장형',   look: '뾰족한 남색 머리, 목에 건 호루라기, 야무진 눈매' },
      { id: 1, key: 'ace',      name: '에이스형',     look: '갈색 포니테일, 주황 머리끈, 단정한 유니폼' },
      { id: 2, key: 'transfer', name: '전학생형',     look: '동그란 안경과 가방을 멘 전학 첫날 차림' },
      { id: 3, key: 'big',      name: '덩치형',       look: '떡 벌어진 몸집에 짧은 스포츠머리, 느긋한 표정' },
      { id: 4, key: 'runner',   name: '육상부형',     look: '노란 머리에 주황 머리띠, 소매 없는 러닝셔츠' },
      { id: 5, key: 'prank',    name: '장난꾸러기형', look: '머리 위로 묶은 상투와 주황 띠, 장난기 어린 웃음' }
    ],
    draw: draw
  };
})(typeof window !== 'undefined' ? window : this);
