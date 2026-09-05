/* T-DATA 구간 실측으로 버스의 요일×시간 계수를 만든다 (D-64).
   node pipeline/build_tdata_calib.js
   입력: data/raw/tdata/TPSS_재차인원_노선_구간.csv  (fetch_tdata_file.py 가 받는다)
   출력: data/bus/tdata-calib.json

   왜 노드인가 — 계수의 분모(무보정 모델 유량)를 실제 엔진(sim-seoul.odLoads)과 똑같이
   만들어야 하기 때문이다. 파이썬으로 다시 쓰면 두 구현이 어긋나는 순간 계수가 거짓말을 한다.

   방법
   ① 원본의 시간 귀속은 「운행 출발 시각」이다 — 4시에 출발한 버스가 6시에 지나는 구간도
      전부 4시로 적혀, 그대로 쓰면 새벽이 3~6배 부풀고 심야가 꺼진다(첫 대조에서 실측).
      정류장순서 × 2.0분(인가 운행소요시간 대조 실측치)만큼 앞으로 밀어 통과 시각으로 되돌린다.
   ② 무보정 모델 유량(odLoads, 요일계수 없이)과의 비율을 종류×요일×시간으로 집계한다.
   ③ 토요일은 실측이 없다 — 지하철 실측의 「토요일이 평일↔일요일 사이 어디쯤인가」로 보간.
   ④ 표본이 얇은 칸은 null — loads.js 가 지하철 차용 계수로 물러난다. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SIM = require(path.join(ROOT, 'engine', 'sim-seoul.js'));
const L = require(path.join(ROOT, 'engine', 'loads.js'));

const CSV = path.join(ROOT, 'data', 'raw', 'tdata', 'TPSS_재차인원_노선_구간.csv');
const OUT = path.join(ROOT, 'data', 'bus', 'tdata-calib.json');
const MIN_PER_STOP = 2.0;
const DECAY = { village: 5, branch: 6, trunk: 6, night: 6, circular: 5, express: 20 };
const MIN_VOL = 300;
const DOW = ['sunday', 'weekday', 'weekday', 'weekday', 'weekday', 'weekday', 'saturday'];

if (!fs.existsSync(CSV)) {
  console.log('원본이 없다: ' + CSV + ' — python pipeline/fetch_tdata_file.py 를 먼저 돌린다');
  process.exit(0);
}
const RT = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'graph', 'routes.json'), 'utf8')).routes;
const RD = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'subway', 'ride.json'), 'utf8'));

// (노선ID, 정류장ID) → 방향 안 위치
const posOf = new Map();
for (const r of RT) {
  if (r.kind === 'subway') continue;
  r.stops.forEach(ids => ids.forEach((sid, k) => posOf.set(r.id + '|' + sid, k)));
}

// ── CSV 읽기 + 통과 시각 재배치 ──────────────────────────────────────────
const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
const lines = text.split(/\r?\n/);
const head = lines[0].split(',');
const sumIdx = [];
for (let h = 0; h < 24; h++) sumIdx.push(head.indexOf('재차인원합' + String(h).padStart(2, '0') + 'H'));
if (sumIdx.some(i => i < 0)) throw new Error('재차인원합 열을 못 찾았다 — 파일 형식이 바뀌었다');

const byDate = {};                                   // 기준일 → routeId → stopId → [24]
let matched = 0, missed = 0;
for (let li = 1; li < lines.length; li++) {
  if (!lines[li]) continue;
  const r = lines[li].split(',');
  const date = r[0], rid = r[1], stop = r[2];
  const pos = posOf.get(rid + '|' + stop);
  if (pos === undefined) { missed++; continue; }
  matched++;
  const shift = pos * MIN_PER_STOP / 60, lo = Math.floor(shift), frac = shift - lo;
  const vals = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) {
    const v = r[sumIdx[h]];
    if (!v) continue;
    const x = parseFloat(v);
    if (h + lo < 24) vals[h + lo] += x * (1 - frac);
    if (frac > 0 && h + lo + 1 < 24) vals[h + lo + 1] += x * frac;
  }
  ((byDate[date] = byDate[date] || {})[rid] = byDate[date][rid] || {})[stop] = vals;
}
console.log('구간 맞춤 ' + matched.toLocaleString() + ' · 그래프에 없어 버림 ' + missed);

// 기준일 → 요일 구분 (윤년 포함해 Date 로)
const dayOf = d => DOW[new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)).getDay()];

// ── 종류×요일×시간 집계 ─────────────────────────────────────────────────
const table = {};                                    // kind → day → [24 {meas, model}]
const usedDates = { weekday: [], saturday: [], sunday: [] };
for (const date in byDate) {
  const day = dayOf(date);
  usedDates[day].push(date);
  for (const r of RT) {
    if (r.kind === 'subway') continue;
    const meas = byDate[date][r.id]; if (!meas) continue;
    const f = path.join(ROOT, 'data', 'bus', 'routes',
      r.name.replace(/[^0-9A-Za-z가-힣_-]/g, '_') + '.json');
    if (!fs.existsSync(f)) continue;
    const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const by = {}; doc.stops.forEach(s => { by[s.stopId] = s; });
    const slot = ((table[r.kind] = table[r.kind] || {})[day] =
      table[r.kind][day] || Array.from({ length: 24 }, () => ({ meas: 0, model: 0 })));
    r.stops.forEach(ids => {
      for (let h = 0; h < 24; h++) {
        const on = ids.map(i => (by[i] ? by[i].on[h] : 0));
        const off = ids.map(i => ((by[i] ? by[i].off[h] : 0)) + 0.0001);
        const od = SIM.odLoads({ boardings: on, attract: off, decayStops: DECAY[r.kind] || 6 });
        for (let k = 0; k < ids.length; k++) {
          const sid = ids[k]; if (meas[sid] === undefined) continue;
          slot[h].model += od.loads[k];
          if (h === 0) for (let hh = 0; hh < 24; hh++) slot[hh].meas += meas[sid][hh];
        }
      }
    });
  }
}

// 토요일 실측이 없으면 지하철 비율로 보간
const tb = L.dayFactors(RD);
const satW = h => {
  const i = h - (tb ? tb.hour0 : 5);
  if (!tb || i < 0 || i >= tb.slots) return 0.6;
  const wd = tb.weekday[i], sa = tb.saturday[i], su = tb.sunday[i];
  if (wd === su) return 0.6;
  return Math.max(0, Math.min(1, (sa - su) / (wd - su)));
};
const factors = {};
for (const kind in table) {
  factors[kind] = {};
  for (const day of ['weekday', 'saturday', 'sunday']) {
    const slot = table[kind][day];
    if (!slot) continue;
    factors[kind][day] = slot.map(s =>
      s.model > MIN_VOL ? +Math.max(0.25, Math.min(2.5, s.meas / s.model)).toFixed(3) : null);
  }
  if (!factors[kind].saturday && factors[kind].weekday && factors[kind].sunday) {
    factors[kind].saturday = factors[kind].weekday.map((w, h) => {
      const su = factors[kind].sunday[h];
      if (w === null || su === null) return null;
      return +(su + (w - su) * satW(h)).toFixed(3);
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify({
  source: 'T-DATA TPSS_재차인원_노선_구간 (data_id 25 파일판, 월 1회 갱신)',
  dates: usedDates,
  method: '재차인원합을 통과 시각으로 재배치(정류장순서×' + MIN_PER_STOP + '분) 후 무보정 모델 유량과의 비율. '
        + '토요일 실측이 없으면 지하철 실측의 평일↔일요일 위치로 보간. null 칸은 지하철 차용으로 물러남',
  caveat: '표본 날짜가 적을수록 그날의 특이(개학·날씨)가 계수에 섞인다 — 달이 갈수록 파일을 다시 받아 다듬는다',
  factors: factors,
}, null, 1));
console.log('저장: data/bus/tdata-calib.json  (표본일: ' +
  Object.entries(usedDates).map(([d, a]) => d + ' ' + a.length + '일').join(' · ') + ')');
