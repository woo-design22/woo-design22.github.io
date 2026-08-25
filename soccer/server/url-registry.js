/* url-registry.js — "지금 게임 서버 주소" 게시판 (Deno Deploy 용, 무료)
 *
 * 왜 필요한가
 *   Cloudflare 빠른 터널은 켤 때마다 주소가 바뀐다. 대문(GitHub Pages)은 정적이라 그 주소를 알 수 없다.
 *   그래서 **주소를 적어 두는 고정된 자리**를 하나 만든다. 터널을 켤 때 스크립트가 여기에 새 주소를 적고,
 *   게임 페이지는 여기를 읽어 자동으로 그 주소에 붙는다. 사람이 주소를 복사해 옮길 필요가 없다.
 *
 * 저장소
 *   Deno KV 를 쓰되, **붙어 있지 않으면 메모리로 자동 전환**한다.
 *   (KV 를 안 붙이면 `Deno.openKv()` 가 던져서 앱 자체가 안 뜨는 문제가 있었다 — 2026-08-25 실제로 겪음.)
 *   - KV 있음  : 재시작·다중 인스턴스에도 주소가 유지된다. **이쪽을 권한다.**
 *   - 메모리   : 앱이 잠들거나 인스턴스가 바뀌면 주소를 잊는다. 그때는 터널을 다시 켜면 복구된다.
 *   지금 어느 쪽인지는 `GET /` 응답의 `store` 로 확인한다.
 *
 * 배포 (한 번만)
 *   1) https://dash.deno.com → New Playground
 *   2) 이 파일 내용을 통째로 붙여넣고 Save & Deploy
 *   3) Settings → Environment Variables 에 `WRITE_KEY` 를 아무 긴 문자열로 추가
 *   4) (권장) Settings 에서 **KV 데이터베이스를 이 앱에 연결(Attach)** 하고 다시 Deploy
 *   5) 받은 주소(https://무엇무엇.deno.dev)를 알려 주면 게임 페이지에 넣는다
 *
 * 쓰는 법
 *   주소 적기 :  POST /  { "url": "https://...trycloudflare.com", "key": "<WRITE_KEY>" }
 *   주소 읽기 :  GET  /   →  { "url": "...", "at": 1724570000000, "ageSec": 12, "stale": false, "store": "kv" }
 *   끄기      :  POST /  { "url": "", "key": "<WRITE_KEY>" }
 *
 * 안전 장치
 *   - 쓰기는 WRITE_KEY 를 아는 쪽만 가능하다(내 PC 스크립트).
 *   - 읽기는 누구나 가능하지만, 나오는 것은 그 순간의 터널 주소뿐이다. 방 비밀번호가 실제 차단 수단이다.
 *   - 30분 넘게 갱신이 없으면 `stale: true` 로 표시한다. 서버가 꺼졌는데 옛 주소로 붙는 것을 막기 위해서다.
 */

const KEY = ['soccer', 'serverUrl'];
const STALE_MS = 30 * 60 * 1000;

// KV 가 없으면 메모리로 떨어진다. 앱이 아예 안 뜨는 것보다 낫다.
let kv = null;
try {
  kv = await Deno.openKv();
} catch (err) {
  console.warn('KV 없음 — 메모리로 동작합니다. 대시보드에서 KV 를 연결하면 더 안정적입니다.', String(err?.message || err));
}
let mem = null;

async function readRec() {
  if (kv) return (await kv.get(KEY)).value;
  return mem;
}
async function writeRec(rec) {
  if (kv) await kv.set(KEY, rec);
  else mem = rec;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const store = kv ? 'kv' : 'memory';

  if (req.method === 'GET') {
    const rec = await readRec();
    if (!rec || !rec.url) return json({ url: '', at: 0, ageSec: 0, stale: true, store });
    const age = Date.now() - rec.at;
    return json({ url: rec.url, at: rec.at, ageSec: Math.round(age / 1000), stale: age > STALE_MS, store });
  }

  if (req.method === 'POST') {
    const want = Deno.env.get('WRITE_KEY');
    if (!want) return json({ error: 'WRITE_KEY 환경변수가 없습니다', store }, 500);
    let body;
    try { body = await req.json(); } catch { return json({ error: '잘못된 JSON', store }, 400); }
    if (body?.key !== want) return json({ error: '키가 틀립니다', store }, 403);
    const url = String(body?.url ?? '').trim();
    if (url && !/^https:\/\/[a-z0-9.-]+/i.test(url)) return json({ error: 'https 주소만 받습니다', store }, 400);
    await writeRec({ url, at: Date.now() });
    return json({ ok: true, url, store });
  }

  return json({ error: '지원하지 않는 메서드', store }, 405);
});
