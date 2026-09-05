/* 화면의 조작부가 **실제로 연결돼 있는지** 검사한다.

   ★ 이 시험이 있는 이유 ★
   index.html 을 고치다 코드 덩어리를 통째로 지운 적이 **두 번** 있다.
   한 번은 편집 바(`openPick`·`setEdTime`), 한 번은 「다음」·「길 찾기」 버튼의 클릭 핸들러.
   문법은 멀쩡하고 시험도 다 통과하는데 **버튼만 아무 반응이 없었다** — 사용자가 발견했다.
   브라우저 없이도 잡을 수 있는 것들만 정적으로 본다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SCRIPT = HTML.slice(HTML.lastIndexOf('<script>'), HTML.lastIndexOf('</script>'));
const MARKUP = HTML.slice(0, HTML.indexOf('<script src='));

/* 눌러도 아무 일이 없으면 안 되는 것들. fillTime 처럼 다른 함수가 대신 걸어 주는 것은
   그 함수에 넘겨지는지로 본다. */
const WIRED_BY = {
  hourH: 'fillTime', hourM: 'fillTime',
  edH: 'fillTime', edM: 'fillTime',
  sH: 'fillTime', sM: 'fillTime',
  fromQ: 'hookSearch', toQ: 'hookSearch',
  fromList: 'hookSearch', toList: 'hookSearch',
  edQ: 'attachSearch', edList: 'attachSearch',
  sQ: 'attachSearch', sList: 'attachSearch',
};
/* 값을 보여 주기만 하는 자리(핸들러가 없어도 된다) */
const PASSIVE = new Set([
  'title', 'bootNote', 'places', 'listNote', 'results', 'detail', 'attrib',
  'editBar', 'viaSlots', 'viaAdd', 'edPick', 'sPick', 'seatWhere', 'seatList',
  'slotFrom', 'slotTo', 'slotSTo', 'step1', 'step2', 'step3', 'step4', 'step5',
  'lb-day', 'lb-step', 'lb-mode',
]);

function idsIn(markup) {
  const out = [];
  const re = /<(button|select|input|a)\b[^>]*\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(markup))) out.push({ tag: m[1], id: m[2] });
  return out;
}

test('조작할 수 있는 자리는 모두 연결돼 있다 (핸들러가 지워지면 잡힌다)', () => {
  const controls = idsIn(MARKUP).filter(c => !PASSIVE.has(c.id));
  assert.ok(controls.length >= 12, `조작부를 ${controls.length}개밖에 못 찾았다 — 검사가 헛돈다`);
  const missing = [];
  for (const c of controls) {
    const q = `\\$\\('${c.id}'\\)`;
    // ① 바로 걸기 — $('x').addEventListener(...)
    const direct = new RegExp(`${q}[^\\n]*addEventListener`).test(SCRIPT);
    // ② 변수에 담아 걸기 — var d=$('x'); … d.addEventListener(...)
    const held = new RegExp(`(?:var|let|const)\\s+(\\w+)\\s*=\\s*${q}`).exec(SCRIPT);
    const viaVar = held && new RegExp(`\\b${held[1]}\\.addEventListener`).test(SCRIPT);
    // ③ 다른 함수가 대신 걸어 주기 — fillTime($('x'), …) / hookSearch('x', …)
    const w = WIRED_BY[c.id];
    const viaFn = !!w && new RegExp(`${w}\\([^;]*'${c.id}'`).test(SCRIPT);
    if (!direct && !viaVar && !viaFn) missing.push(`${c.tag}#${c.id}`);
  }
  assert.strictEqual(missing.join(', '), '', `핸들러가 없는 조작부: ${missing.join(', ')}`);
});

test('화면을 넘기는 버튼이 살아 있다', () => {
  // 실제로 지워졌던 것들 — 이름을 박아 둔다
  for (const id of ['next1', 'next2', 'back', 'tab1', 'tab3', 'addVia', 'edFrom', 'edTo', 'sTo', 'here']) {
    assert.ok(new RegExp(`\\$\\('${id}'\\)\\.addEventListener`).test(SCRIPT),
      `${id} 의 클릭 핸들러가 없다`);
  }
});

test('스크립트가 쓰는 이름이 모두 선언돼 있다 (엄격 모드에서 예외가 난다)', () => {
  // setEdTime 이 선언 없이 쓰이던 적이 있다 — 그때 시각을 바꾸면 조용히 멈췄다
  const used = new Set();
  let m;
  const re = /\b(set(?:Step|Ed|Seat)Time|renderEditBar|renderSeatable|findRoutes|openPick|closePick|movePickUnder|attachSearch|hookSearch|fillTime|preloadBus|draw)\b/g;
  while ((m = re.exec(SCRIPT))) used.add(m[1]);
  for (const name of used) {
    const declared = new RegExp(`(?:var|let|const)\\s+${name}\\s*=`).test(SCRIPT)
                  || new RegExp(`function\\s+${name}\\s*\\(`).test(SCRIPT);
    assert.ok(declared, `${name} 을 쓰는데 선언이 없다 — 엄격 모드에서 예외가 난다`);
  }
  assert.ok(used.size >= 8, `검사한 이름이 ${used.size}개뿐 — 검사가 헛돈다`);
});

test('다섯 화면이 모두 있고 go() 가 전부 다룬다', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(MARKUP.includes(`id="step${n}"`), `step${n} 이 없다`);
  }
  assert.ok(/\[1, ?2, ?3, ?4, ?5\]\.forEach/.test(SCRIPT), 'go() 가 다섯 화면을 다 감추지 않는다');
});

test('engine 파일이 모두 불러와진다', () => {
  for (const f of ['interp', 'seat-model', 'transfer', 'sim-seoul', 'route', 'loads', 'geocode']) {
    assert.ok(HTML.includes(`engine/${f}.js`), `engine/${f}.js 를 안 부른다`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'engine', `${f}.js`)), `engine/${f}.js 가 없다`);
  }
});

test('살펴보기 화면도 같은 검사를 통과한다', () => {
  const ex = fs.readFileSync(path.join(__dirname, '..', 'explore.html'), 'utf8');
  const exScript = ex.slice(ex.lastIndexOf('<script>'));
  for (const id of ['mSubway', 'mBus', 'measure', 'line', 'station', 'bigText']) {
    assert.ok(exScript.includes(`'${id}'`), `explore.html 의 ${id} 가 연결돼 있지 않다`);
  }
});

test('가다가 앉는 예측은 100% 라고 쓰지 않고, 몇 정거장·몇 분 뒤인지 말한다 (D-66)', () => {
  // 예측 퍼센트는 전부 pctLater() 를 거쳐야 한다 — 반올림 100 을 99 로 자르는 문
  assert.ok(/function pctLater\(p\)\{ return Math\.min\(99/.test(SCRIPT), 'pctLater 가 없다');
  const later = SCRIPT.match(/(그럴 가능성|앉아 갈 가능성|앉게 될 가능성)[^;]{0,120}/g) || [];
  assert.ok(later.length >= 3, `가다가 문구를 ${later.length}곳밖에 못 찾았다`);
  for (const chunk of later)
    assert.ok(chunk.indexOf('pctLater(') >= 0, `pctLater 를 안 거친 곳: ${chunk.slice(0, 80)}`);
  assert.ok(SCRIPT.indexOf("정거장 · 약 ") >= 0, '몇 정거장·몇 분 뒤 표기가 없다');
});
