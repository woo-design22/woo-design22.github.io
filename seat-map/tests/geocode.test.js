/* 장소 찾기 시험 — 주소·지명·정류장을 좌표로 바꾸는 부분.
   **인터넷을 쓰지 않는다** — 온라인 응답은 실제로 받아 둔 표본을 그대로 넣어 검사한다.
   engine/ 이 네트워크를 안 부르게 설계한 이유가 이것이다(CLAUDE.md §1). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Geo = require('../engine/geocode.js');
const T = require('../engine/transfer.js');

const D = path.join(__dirname, '..', 'data');
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const NODES = load(path.join(D, 'graph', 'nodes.json'));
const ROUTES = load(path.join(D, 'graph', 'routes.json'));
const graph = NODES && ROUTES ? { nodes: NODES.nodes, routes: ROUTES.routes } : null;
const t = (name, fn) => test(name, { skip: !graph && '그래프 없음' }, fn);

/* 2026-09-04 에 실제로 받아 둔 Photon 응답(서울특별시 성북구 종암로 128). */
const PHOTON_SAMPLE = {
  features: [
    { properties: { name: '탕화쿵푸 종암사거리점', street: '종암로', housenumber: '128', district: '성북구' },
      geometry: { coordinates: [127.03360, 37.60149] } },
    { properties: { name: '혜조약국', street: '종암로21길', housenumber: '128', district: '돈암1동' },
      geometry: { coordinates: [127.03048, 37.60351] } },
    { properties: { name: '부산어딘가', street: '어딘가로', housenumber: '1', city: '부산' },
      geometry: { coordinates: [126.5312, 33.4996] } }        // 제주 — 서비스권(D-88) 밖이라 걸러져야 한다
  ]
};
const NOMINATIM_SAMPLE = [
  { lat: '37.6044400', lon: '127.0376400', display_name: '하월곡동, 월곡2동, 성북구, 서울특별시, 02740, 대한민국' },
  { lat: '33.4996', lon: '126.5312', display_name: '제주시, 대한민국' }   // 서비스권 밖(D-88)
];

// ── 온라인 응답 정규화 ────────────────────────────────────────────────────
test('Photon 응답에서 서울 밖은 걸러낸다', () => {
  const got = Geo.fromPhoton(PHOTON_SAMPLE);
  assert.strictEqual(got.length, 2, '부산 결과가 안 걸러졌다');
  got.forEach(g => assert.ok(Geo.inSeoul(g.lat, g.lon)));
});

test('번지가 있으면 주소를 제목으로 올린다', () => {
  const got = Geo.fromPhoton(PHOTON_SAMPLE);
  // 「종암로 128」을 쳤는데 제목이 「탕화쿵푸 종암사거리점」이면 엉뚱한 데를 찾은 것처럼 보인다.
  assert.strictEqual(got[0].name, '종암로 128');
  assert.ok(got[0].detail.includes('탕화쿵푸'), '가게 이름은 부연으로 남아야 한다');
});

test('Nominatim 응답도 같은 모양으로 바뀌고 서비스권 밖은 빠진다', () => {
  const got = Geo.fromNominatim(NOMINATIM_SAMPLE);
  assert.strictEqual(got.length, 1);
  assert.strictEqual(got[0].name, '하월곡동');
  assert.ok(Math.abs(got[0].lat - 37.60444) < 1e-4);
});

test('빈 응답·깨진 응답에도 죽지 않는다', () => {
  assert.deepStrictEqual(Geo.fromPhoton(null), []);
  assert.deepStrictEqual(Geo.fromPhoton({}), []);
  assert.deepStrictEqual(Geo.fromNominatim(null), []);
  assert.deepStrictEqual(Geo.fromNominatim([{}]), []);
});

test('검색 주소에 사용자가 친 글자가 안전하게 들어간다', () => {
  const u = Geo.photonUrl('종로 1가 & 2가');
  assert.ok(u.indexOf(' ') < 0 && u.indexOf('&q=') > 0, '띄어쓰기·기호가 그대로 들어가면 주소가 깨진다');
  assert.ok(Geo.nominatimUrl('가').indexOf('countrycodes=kr') > 0);
});

// ── 로컬 + 합치기 ─────────────────────────────────────────────────────────
t('로컬 검색은 인터넷 없이 즉시 된다', () => {
  const got = Geo.local(graph, '월곡', 5);
  assert.ok(got.length);
  assert.strictEqual(got[0].name, '월곡역');
  assert.strictEqual(got[0].source, 'local');
  assert.ok(got[0].detail.includes('지하철'));
});

t('주소·상호가 정류장보다 위에 온다 (2026-09-04 지시)', () => {
  // 「국립중앙박물관」을 쳤을 때 그 앞 버스정류장이 먼저 나오면 안 된다.
  const local = Geo.local(graph, '월곡', 3);
  const merged = Geo.merge(local, Geo.fromPhoton(PHOTON_SAMPLE), 12);
  assert.strictEqual(merged[0].source, 'online', '주소가 정류장보다 아래로 밀렸다');
  assert.ok(merged.some(m => m.source === 'local'), '정류장이 통째로 사라졌다');
  assert.ok(merged.length >= local.length);
});

t('친 이름과 정확히 맞는 역은 주소보다 위다 — 「교대」', () => {
  // 주소를 먼저 올렸더니 「교대」에 「서초대로 지하294」라는 도로 주소가 1등이 됐다.
  const local = Geo.local(graph, '교대', 5);
  const online = [{ name: '서초대로 지하294', detail: '주소 · 서초구',
                    lat: 37.4935, lon: 127.0145, source: 'online' }];
  const merged = Geo.merge(local, online, 12, '교대');
  assert.strictEqual(merged[0].name, '교대역', `1등이 ${merged[0].name} 다`);
  assert.strictEqual(merged[0].source, 'local');
  assert.ok(merged.some(m => m.source === 'online'), '주소가 사라졌다');
});

t('실제 사례 — 「국립중앙박물관」에서 정류장이 먼저 나오지 않는다', () => {
  const local = Geo.local(graph, '국립중앙박물관', 5);
  const online = [{ name: '국립중앙박물관', detail: '서빙고로 137 · 서빙고동',
                    lat: 37.52395, lon: 126.98032, source: 'online' }];
  const merged = Geo.merge(local, online, 12, '국립중앙박물관');
  assert.strictEqual(merged[0].source, 'online');
  assert.strictEqual(merged[0].name, '국립중앙박물관');
});

t('같은 곳이 두 번 나오지 않고, 알맹이는 우리가 아는 쪽을 남긴다', () => {
  const local = Geo.local(graph, '월곡', 1);
  const fake = [{ name: '월곡역', detail: '주소', lat: local[0].lat + 0.0005, lon: local[0].lon, source: 'online' }];
  const merged = Geo.merge(local, fake, 12);
  assert.strictEqual(merged.length, 1, '250m 안의 같은 이름은 하나로 봐야 한다');
  assert.strictEqual(merged[0].source, 'local',
    '자리는 위쪽을 쓰되 좌표·부연은 우리가 아는 쪽이 낫다');
  assert.ok(merged[0].detail.includes('지하철'));
});

t('인터넷이 죽어도 로컬만으로 답이 나온다', () => {
  const merged = Geo.merge(Geo.local(graph, '강남', 5), [], 12);
  assert.ok(merged.length, '온라인이 빈 배열이면 아무것도 안 나온다 — 그러면 오프라인에서 앱이 죽는다');
});

// ── 갈 수 있는 곳인가 ─────────────────────────────────────────────────────
t('서비스권 밖이면 이유를 말해 준다 (부산은 이제 안이다 — D-88)', () => {
  const jeju = { lat: 33.4996, lon: 126.5312 };
  assert.ok((Geo.reason(graph, jeju) || '').includes('서비스 지역'));
  // 부산은 광역시 확장으로 서비스권 — 「밖」 이유가 나오면 안 된다(정류장 유무 이유는 허용).
  const busan = { lat: 35.1796, lon: 129.0756 };
  assert.ok(!(Geo.reason(graph, busan) || '').includes('서비스 지역'));
  assert.strictEqual(Geo.reason(graph, Geo.local(graph, '월곡', 1)[0]), null);
});

t('고른 좌표에서 탈 수 있는 정류장이 나온다', () => {
  const p = { lat: 37.60149, lon: 127.03360 };        // 종암로 128
  const pts = Geo.accessPoints(graph, p, 900, 12);
  assert.ok(pts.length >= 3, `${pts.length}곳 — 서울 한복판인데 너무 적다`);
  assert.ok(pts[0].meters < 400);
  assert.ok(pts[0].meters <= pts[pts.length - 1].meters, '가까운 순이 아니다');
});

// ── 도보 (사양서 6.3) ─────────────────────────────────────────────────────
test('도보 시간은 직선거리가 아니라 실제로 도는 거리로 잡는다', () => {
  const straight = 500;
  assert.ok(T.walkDistance(straight) > straight);
  const normal = T.walkMinutes(straight, 'normal');
  const slow = T.walkMinutes(straight, 'vslow');
  // 500m 직선이면 실제로는 650m, 보통 걸음으로 9분. 직선으로 계산하면 6.9분이라 2분을 속인다.
  assert.ok(normal > 8 && normal < 10, `${normal.toFixed(1)}분 — 상식 범위를 벗어났다`);
  assert.ok(slow > normal * 1.9, '아주 느린 걸음은 두 배 가까이 걸려야 한다');
});

// ── 상호로 찾기 (D-99) ────────────────────────────────────────────────────
test('상호 + 동 이름으로 찾는다 (「미아동 내과」)', () => {
  Geo.setPoi([
    ['미아연세내과의원', 37.6265, 127.0256, '서울특별시 강북구 미아동 202-11', '병의원'],
    ['강남정형외과의원', 37.4980, 127.0276, '서울특별시 강남구 역삼동 1-1', '병의원'],
    ['미아온누리약국', 37.6260, 127.0250, '서울특별시 강북구 미아동 300', '약국']
  ]);
  const got = Geo.poiSearch('미아동 내과', 5);
  assert.ok(got.length >= 1, '「미아동 내과」로 아무것도 못 찾았다');
  assert.strictEqual(got[0].name, '미아연세내과의원');
  // 지번주소로도 찾힌다 — OSM 이 못 하던 바로 그 일(D-98)
  const addr = Geo.poiSearch('미아동 202-11', 5);
  assert.strictEqual(addr[0].name, '미아연세내과의원');
  // 딴 동네 같은 업종은 안 나온다
  assert.ok(!got.some(x => x.name === '강남정형외과의원'));
  // 목록이 없으면 조용히 빈 손 (자료 미배포 상태에서도 앱은 돈다)
  Geo.setPoi(null);
  assert.deepStrictEqual(Geo.poiSearch('미아동 내과', 5), []);
});

test('동 이름이 어긋난 온라인 주소는 뒤로 민다 (D-99)', () => {
  const loc = [{ name: '미아연세내과의원', detail: '병의원 · 서울특별시 강북구 미아동 202-11',
                 lat: 37.6265, lon: 127.0256, source: 'poi' }];
  const on = [{ name: '삼양로27길 95', detail: '202 · 삼각산동', lat: 37.6136, lon: 127.0299, source: 'online' },
              { name: '삼양로27길 19', detail: '202 · 삼각산동', lat: 37.6151, lon: 127.0298, source: 'online' }];
  const got = Geo.merge(loc, on, 12, '미아동 202-11');
  assert.strictEqual(got[0].name, '미아연세내과의원', '지번을 아는 장소가 먼저 와야 한다');
  assert.strictEqual(got.length, 3, '어긋난 주소도 지우지는 않는다');
});

/* ── 동명이 전국에 있을 때 기준점을 지킨다 (D-117, 2026-09-10 사용자 지적) ──────
   실제로 겪은 것: 월곡동에서 「중구청」을 치면 **처음엔 서울이 1위였다가 1초 뒤
   온라인 주소가 합쳐지면서 대전 중구청역이 1위로 올라갔다.** 그대로 고르면
   서울 안에서 갈 길이 대전까지 KTX 를 타는 경로가 된다. */
test('합칠 때도 기준점을 본다 — 딴 권역 동명은 앞으로 당기지 않는다', () => {
  const 서울 = { lat: 37.6065, lon: 127.0388 };          // 월곡동
  const local = [
    { name: '중구청앞.덕수중학교', lat: 37.5640, lon: 126.9976, source: 'local' },
    { name: '중구청역', lat: 36.3273, lon: 127.4213, source: 'local' },   // 대전 — 이름은 통째로 맞는다
  ];
  const online = [
    { name: '중구청', detail: '대전 중구', lat: 36.3271, lon: 127.4215, source: 'online' },
  ];
  const got = Geo.merge(local, online, 12, '중구청', 서울);
  assert.strictEqual(got[0].name, '중구청앞.덕수중학교',
    '기준점이 서울인데 딴 권역(대전)이 1위다 — 고르면 KTX 경로가 나온다');
  /* 지우지는 않는다 — 정말 대전에 가려는 사람도 있다. 다만 온라인 주소가 같은 자리의
     로컬(대전 중구청역)과 합쳐지는 것은 정상이다(중복 제거) — 자리로 남아 있으면 된다. */
  assert.ok(got.some(x => Math.abs(x.lat - 36.327) < 0.01), '대전 것이 목록에서 통째로 사라졌다');
});

test('기준점이 없으면 예전대로 이름이 맞는 것을 앞에 둔다', () => {
  const local = [
    { name: '중구청앞.덕수중학교', lat: 37.5640, lon: 126.9976, source: 'local' },
    { name: '중구청역', lat: 36.3273, lon: 127.4213, source: 'local' },
  ];
  const got = Geo.merge(local, [], 12, '중구청');      // near 없음
  assert.strictEqual(got[0].name, '중구청역', '기준점이 없을 때의 규칙까지 바뀌었다');
});
