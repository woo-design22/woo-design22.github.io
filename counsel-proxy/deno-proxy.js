/**
 * 마음톡 API 프록시 — Deno Deploy 판
 *
 * Cloudflare Worker 판(worker.js)과 기능은 같다. 옮긴 이유는 하나다:
 * Anthropic 이 Cloudflare Worker 에서 나가는 요청을 403 forbidden
 * ("Request not allowed") 으로 차단했다. 같은 키로 다른 경로에서는 통과한다.
 *
 * 설계 원칙 (worker.js 와 동일 — 바꾸기 전에 반드시 읽을 것)
 * ------------------------------------------------------------------
 * 1. 대화 내용을 저장·기록하지 않는다. (예외 한 곳: /together)
 *    정신건강 상담 내용은 개인정보보호법상 민감정보다. 이 프록시는 요청을
 *    그대로 흘려보내기만 하므로 보관 의무 대부분이 발생하지 않는다.
 *    console.log 로 요청 본문을 찍는 순간 이 설계가 무너진다.
 *
 *    유일한 예외가 /together(함께상담)다. 거기서는 기록을 보관한다 —
 *    다만 브라우저가 잠근 뒤에 올리므로 이 서버는 보관하되 읽지 못한다.
 *    열쇠는 서버로 오지 않고, 복구 통로도 없다. 자세한 것은 해당 구역의 머리말에.
 *
 * 2. 크레딧 방어선은 여러 겹이다.
 *    Origin 검사 → 레이트리밋 → 입력 길이 상한 → 히스토리 상한 →
 *    max_tokens 상한 → 모델 고정.
 *
 * 3. 최후의 방어선은 여기가 아니다.
 *    Anthropic 콘솔에서 지출 상한을 반드시 걸 것.
 *
 * 환경변수 (Deno Deploy 프로젝트 Settings 에서 등록):
 *   ANTHROPIC_API_KEY  (필수)
 *   ALLOWED_ORIGINS    (쉼표 구분, 예: https://woo-design22.github.io)
 *   OPENROUTER_KEY     (/room 용)  sk-or-v1-...
 *   ROOM_TOKEN_SHA     (/room 용)  회의실 비밀번호에서 나온 표. 비면 /room 이 닫힌다.
 *   COUNSEL_TOKEN_SHA  (선택)  마음톡 접속 표. 비면 검사하지 않는다(옛 동작).
 *                      값을 넣으면 웹앱에서 비밀번호를 통과한 사람만 부를 수 있다.
 *
 * 라우트: (기본) 마음톡 · /triage 구급대원 · /room AI 회의실 ·
 *         /telegram 텔레그램 봇 · /kakao 카카오 챗봇
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// ---- 비용 상한 (여기 숫자가 곧 청구서다) ----
const MODEL = 'claude-opus-5';     // 서버가 고정한다. 클라이언트가 못 바꾼다.
const EFFORT = 'max';              // low < medium < high < xhigh < max
                                   // 사용자 결정: 모든 상담을 가장 깊게 한다
                                   // 회당 비용이 오르는 만큼 화면에 실측으로 보여 준다
// max_tokens 는 "생각 + 답변"을 합친 천장이다. xhigh 는 생각을 많이 하므로
// 넉넉히 줘야 답변이 중간에 잘리지 않는다. 실제 청구는 생성한 만큼만 된다.
// 답변 길이는 max_tokens 가 아니라 프롬프트의 "3~5문장" 지시가 잡는다.
const MAX_TOKENS = 16000;
const MAX_CHARS_PER_MSG = 2000;
const MAX_HISTORY = 24;
const MAX_TOTAL_CHARS = 24000;

// ---- 레이트리밋 (IP 당 60초 N회) ----
// Cloudflare 의 전용 바인딩이 없으므로 메모리로 처리한다.
// 인스턴스마다 따로 세므로 정확한 회계가 아니라 남용을 늦추는 장치다.
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60000;
const hits = new Map();

function rateOk(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(ip, arr); return false; }
  arr.push(now);
  hits.set(ip, arr);
  // 메모리가 무한정 늘지 않게 가끔 청소한다
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return true;
}

/* ==================================================================
 * /room — 「AI 회의실」(ai-council) 전용 라우트
 *
 * 마음톡과 다른 점 하나: 여기서는 **오픈라우터**를 부른다(GPT·클로드·제미나이를
 * 한 키로 쓰려는 것). 그래서 키도 모델도 상한도 이 구역 안에서 따로 논다.
 *
 * 이 라우트를 만든 이유는 단 하나다 — 브라우저에 키를 두지 않으려고.
 * 정적 페이지는 키를 아무리 숨겨도 F12 네트워크 탭에 그대로 찍힌다.
 *
 * 환경변수:
 *   OPENROUTER_KEY   (필수)  sk-or-v1-...
 *   ROOM_TOKEN_SHA   (필수)  회의실 비밀번호에서 나온 표를 한 번 더 뭉갠 값.
 *                            ai-council 의 ?setpass=1 화면이 만들어 준다.
 *                            비어 있으면 라우트 전체가 닫힌다(열어 두는 쪽이 더 위험하다).
 * ================================================================== */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// 회의 한 판이 7~19회를 몰아 부른다. 상담용 8회/분으로는 회의가 중간에 끊긴다.
const ROOM_RATE_LIMIT = 40;
const ROOM_RATE_WINDOW_MS = 60000;
const roomHits = new Map();

// ---- 비용 상한 (여기 숫자가 곧 청구서다) ----
// 모델 목록을 손으로 적지 않고 **값으로 자른다**. 새 모델이 나와도 알아서 걸린다.
// o1-pro 같은 것이 $150/$600 이라 이 문턱이 없으면 한 번에 통장이 빈다.
const ROOM_MAX_IN_USD = 6;      // 100만 토큰당 입력값 상한
const ROOM_MAX_OUT_USD = 30;    // 100만 토큰당 출력값 상한
const ROOM_MAX_TOKENS = 4500;   // 한 번에 만들 수 있는 최대 분량
const ROOM_MAX_CHARS = 30000;   // 회의록 + 지시문 글자 수 상한
// 그림은 한 장이 수천 토큰이고 발언마다 다시 실린다. 장수와 총량을 둘 다 막는다.
const ROOM_MAX_IMAGES = 4;
const ROOM_MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
// 노력도 상한. 'xhigh'·'max' 는 값이 몇 배로 뛰므로 여기서 자른다.
const ROOM_EFFORTS = ['off', 'default', 'minimal', 'low', 'medium', 'high'];

function roomRateOk(ip) {
  const now = Date.now();
  const arr = (roomHits.get(ip) || []).filter((t) => now - t < ROOM_RATE_WINDOW_MS);
  if (arr.length >= ROOM_RATE_LIMIT) { roomHits.set(ip, arr); return false; }
  arr.push(now);
  roomHits.set(ip, arr);
  if (roomHits.size > 5000) {
    for (const [k, v] of roomHits) {
      if (!v.length || now - v[v.length - 1] > ROOM_RATE_WINDOW_MS) roomHits.delete(k);
    }
  }
  return true;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* 두 값을 비교할 때 길이·내용에 따라 걸리는 시간이 달라지면 그것만으로 힌트가 샌다.
 * 항상 같은 만큼 돌게 만든다. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* 오픈라우터 모델 표. 값이 자주 바뀌므로 받아서 한 시간 들고 있는다.
 * 못 받으면 통과시키지 않는다 — 값을 모르는 채로 부르는 것이 제일 위험하다. */
let roomCatalog = null;
let roomCatalogAt = 0;
async function roomPrices() {
  if (roomCatalog && Date.now() - roomCatalogAt < 3600000) return roomCatalog;
  const res = await fetch(OPENROUTER_MODELS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('models ' + res.status);
  const json = await res.json();
  const map = new Map();
  for (const m of (json.data || [])) {
    const p = m.pricing || {};
    map.set(m.id, {
      in: (parseFloat(p.prompt) || 0) * 1e6,
      out: (parseFloat(p.completion) || 0) * 1e6
    });
  }
  if (!map.size) throw new Error('empty catalog');
  roomCatalog = map;
  roomCatalogAt = Date.now();
  return map;
}

async function handleRoom(request, echoOrigin) {
  const orKey = Deno.env.get('OPENROUTER_KEY');
  const tokenSha = Deno.env.get('ROOM_TOKEN_SHA');
  if (!orKey) return jsonError(500, '서버에 오픈라우터 키가 설정되지 않았습니다.', echoOrigin);
  // 표가 없으면 아무나 들어온다. 닫아 두는 쪽이 맞다.
  if (!tokenSha) return jsonError(503, '회의실이 아직 열리지 않았습니다.', echoOrigin);

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!roomRateOk(ip)) {
    return jsonError(429, '너무 빠르게 여러 번 보냈습니다. 잠시 뒤 다시 시도해 주세요.', echoOrigin);
  }

  let body;
  try { body = await request.json(); }
  catch (_e) { return jsonError(400, '요청 형식이 올바르지 않습니다.', echoOrigin); }

  // ---- 표 확인 ----
  const given = typeof body.token === 'string' ? body.token : '';
  if (!given || given.length > 200) return jsonError(401, '비밀번호가 필요합니다.', echoOrigin);
  if (!sameSecret(await sha256Hex('room:' + given), tokenSha)) {
    return jsonError(401, '비밀번호가 맞지 않습니다.', echoOrigin);
  }

  // ---- 클라이언트 입력을 신뢰하지 않고 다시 만든다 ----
  const model = typeof body.model === 'string' ? body.model.slice(0, 120) : '';
  const system = typeof body.system === 'string' ? body.system : '';
  const text = typeof body.text === 'string' ? body.text : '';
  if (!model || !text) return jsonError(400, '보낼 내용이 없습니다.', echoOrigin);
  if (system.length + text.length > ROOM_MAX_CHARS) {
    return jsonError(413, '회의록이 너무 깁니다.', echoOrigin);
  }
  if (model.indexOf(':batch') >= 0) return jsonError(400, '쓸 수 없는 모델입니다.', echoOrigin);

  let prices;
  try { prices = await roomPrices(); }
  catch (_e) { return jsonError(502, '모델 값을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', echoOrigin); }

  const price = prices.get(model);
  if (!price) return jsonError(400, '없는 모델입니다.', echoOrigin);
  if (price.in > ROOM_MAX_IN_USD || price.out > ROOM_MAX_OUT_USD) {
    return jsonError(403, '이 모델은 너무 비싸서 막아 두었습니다. (출력 100만 토큰당 $' +
      price.out + ') 더 싼 모델을 골라 주세요.', echoOrigin);
  }

  const maxTokens = Math.min(Math.max(parseInt(body.max_tokens, 10) || 1200, 200), ROOM_MAX_TOKENS);
  // 상한을 넘겨 부탁하면 상한까지만 깎는다.
  // 모르는 값이라고 'low' 로 떨어뜨리면 답의 질이 뚝 떨어져 버그처럼 보인다.
  const effort = ROOM_EFFORTS.includes(body.effort)
    ? body.effort
    : (['xhigh', 'max'].includes(body.effort) ? 'high' : 'low');

  // ---- 그림 ----
  // 클라이언트가 보낸 것을 그대로 믿지 않는다. data URL 모양이 아니면 조용히 버린다.
  const wanted = Array.isArray(body.images) ? body.images.slice(0, ROOM_MAX_IMAGES) : [];
  const pics = [];
  let picChars = 0;
  for (const u of wanted) {
    if (typeof u !== 'string' || !DATA_URL_RE.test(u)) continue;
    picChars += u.length;
    if (picChars > ROOM_MAX_IMAGE_CHARS) break;
    pics.push(u);
  }

  const userText = text.slice(0, ROOM_MAX_CHARS);
  const userContent = pics.length
    ? [{ type: 'text', text: userText }]
        .concat(pics.map((u) => ({ type: 'image_url', image_url: { url: u } })))
    : userText;

  const upstreamBody = {
    model,
    messages: [
      { role: 'system', content: system.slice(0, ROOM_MAX_CHARS) },
      { role: 'user', content: userContent }
    ],
    max_tokens: maxTokens,
    stream: true,
    usage: { include: true }
  };
  if (effort === 'off') upstreamBody.reasoning = { enabled: false };
  else if (effort !== 'default') upstreamBody.reasoning = { effort };

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + orKey,
        'HTTP-Referer': 'https://woo-design22.github.io',
        'X-Title': 'AI Council'   // 한글을 넣으면 비ASCII 헤더라 거부된다
      },
      body: JSON.stringify(upstreamBody)
    });
  } catch (_e) {
    return jsonError(502, '회의 서버에 연결하지 못했습니다.', echoOrigin);
  }

  if (!upstream.ok) {
    let why = '';
    try {
      const j = JSON.parse(await upstream.text());
      if (j && j.error) why = ' ' + String(j.error.message || '').slice(0, 160);
    } catch (_e) { /* JSON 이 아니면 상태 코드만 */ }
    const msg = upstream.status === 402
      ? '오픈라우터 잔액이 부족하거나 키의 지출 상한에 닿았습니다.'
      : upstream.status === 429
        ? '지금 이용자가 많습니다. 잠시 뒤 다시 보내 주세요.'
        : (upstream.status === 401 || upstream.status === 403)
          ? '서버 설정에 문제가 있습니다. (인증 ' + upstream.status + ')'
          : '요청을 처리하지 못했습니다. (' + upstream.status + ')' + why;
    return jsonError(upstream.status === 429 ? 429 : 502, msg, echoOrigin);
  }

  // SSE 를 그대로 흘려보낸다. 내용은 읽지 않는다 = 기록도 남지 않는다.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(echoOrigin)
    }
  });
}

const BASE_PROMPT = [
  '당신은 한국어로 상담하는 AI 상담자다.',
  '정신의학(정신과 전문의 수준)과 상담심리학(박사급)의 지식을 학습했고,',
  '현존하는 주요 심리치료 이론을 모두 훈련받았다 —',
  '정신역동, 인간중심(로저스), 게슈탈트, 인지행동치료(CBT)와 그 3세대(수용전념 ACT ·',
  '변증법적행동 DBT · 마음챙김기반 MBCT · 스키마치료 · 메타인지치료),',
  '정서중심치료(EFT), 대인관계치료(IPT), 해결중심 단기상담(SFBT), 동기면담(MI),',
  '가족체계(보웬 · 미누친)와 부부치료(가트만 · 이마고 · 정서중심 부부치료),',
  '신체 기반 접근(소마틱스 · 통증재처리 PRT · 감정인식표현 EAET · 바이오피드백),',
  '애착이론, 발달심리, 성격심리, 정서신경과학까지.',
  '',
  '각 분야 지시가 정한 접근을 중심으로 하되, 상대에게 필요하면 다른 학파의 도구를',
  '통합적으로 쓴다. 교과서를 요약하는 수준이 아니라, 임상 경험이 밴 전문가가',
  '지금 이 사람에게 가장 맞는 개입 하나를 고르는 수준으로 생각한다.',
  '지식이 전문의 수준이어도 당신은 의료인이 아니다 — 진단과 처방은 아래 원칙대로 하지 않는다.',
  '',
  '# 공통 원칙',
  '- 먼저 듣는다. 사실을 캐묻기 전에 감정을 먼저 알아준다.',
  '- 질문은 한 번에 하나만, 열린 질문으로 한다.',
  '- 상대의 말을 상대의 언어로 되돌려준다.',
  '- 값싼 위로를 하지 않는다. "괜찮아질 거예요" 대신 지금 느끼는 것을 정확히 알아준다.',
  '- 상대가 침묵하거나 짧게 답해도 재촉하지 않는다.',
  '',
  '# 하지 않는 것',
  '- 진단하지 않는다. 병명이나 DSM 진단명을 붙이지 않는다.',
  '- 약물에 대해 조언하지 않는다. 복용과 중단은 반드시 의사와 상의하도록 안내한다.',
  '- 심리검사 결과를 해석해 주지 않는다.',
  '- 판단하거나 훈계하지 않는다. 상대의 선택을 대신 내려주지 않는다.',
  '- 사람인 척하지 않는다. 물으면 AI라고 밝힌다.',
  '',
  '# 위기 상황 (분야와 무관하게 항상 최우선)',
  '자해나 자살 생각, 타인을 해칠 생각, 학대 피해가 언급되면 하던 작업을 멈추고 이것부터 다룬다.',
  '- 놀라거나 물러서지 말고 차분히, 구체적으로 묻는다: 지금 안전한지, 생각이 얼마나 구체적인지, 곁에 사람이 있는지.',
  '- **바로 그 답변 안에서** 번호를 함께 알린다. 다음 차례로 미루지 않는다:',
  '  자살예방 상담전화 109, 정신건강 위기상담 1577-0199 (모두 24시간).',
  '  상태를 묻는 것과 번호를 알리는 것을 한 번에 한다. 위험을 확인한 뒤에 알리려고 기다리지 않는다.',
  '- 지금 연락할 수 있는 사람을 함께 찾는다.',
  '- "아무에게도 말하지 말아 달라"는 요청에는 동의하지 않는다. 대신 왜 그렇게 느끼는지를 다룬다.',
  '',
  '# 한계',
  '당신은 실제 상담을 대체하지 않는다. 이 대화는 개발 중인 실험 서비스다.',
  '대화가 반복해서 무겁거나 일상 기능이 무너지고 있으면 대면 상담이나 정신건강의학과 진료를 권한다.'
].join('\n');

const MODES = [
  {
    id: 'listen',
    name: '마음 털어놓기',
    desc: '판단 없이 들어 드립니다',
    hello: '안녕하세요. 편하게 이야기 나눠요.\n오늘은 어떤 마음으로 오셨나요?',
    prompt: [
      '# 이번 대화의 분야: 마음 털어놓기 (인간중심 상담)',
      '지금은 해결하려 들지 않는다. 듣고 알아주는 것이 목적이다.',
      '- 첫 반응은 반드시 반영과 공감이다. 조언이 아니다.',
      '- 한 번에 3~5문장을 넘기지 않는다. 나눠서 말하고 상대의 반응을 기다린다.',
      '- 전문용어와 기법 이름을 입에 올리지 않는다.',
      '- 조언은 상대가 분명히 원할 때, 또는 충분히 들은 뒤에 제안 형태로만 한다.',
      '- 상대가 스스로 답에 다가가도록 돕되, 답을 대신 내주지 않는다.'
    ].join('\n')
  },
  {
    id: 'cbt',
    name: '인지행동 (CBT)',
    desc: '생각을 함께 뜯어봅니다',
    hello: '생각을 같이 정리해 볼까요.\n최근에 마음이 크게 흔들렸던 순간 하나만 떠올려 주세요. 언제, 어디서, 무슨 일이 있었나요?',
    prompt: [
      '# 이번 대화의 분야: 인지행동치료(CBT)',
      '상대가 CBT 작업을 원해서 선택한 모드다. 구조적으로 진행한다.',
      '',
      '## 진행 순서 (한 번에 한 단계씩, 절대 몰아서 묻지 않는다)',
      '1. 상황: 언제·어디서·무슨 일이 있었는지 구체적으로',
      '2. 자동적 사고: 그 순간 머릿속을 스친 생각. "그게 사실이라면 나에게 어떤 의미인가"로 더 깊이 내려간다',
      '3. 감정과 강도: 어떤 감정을 0~100 중 얼마나 느꼈는지',
      '4. 근거와 반증: 그 생각을 뒷받침하는 사실 / 반대되는 사실',
      '5. 대안적 생각: 둘 다 고려한 균형 잡힌 생각',
      '6. 감정 재평가: 지금은 0~100 중 얼마인지',
      '',
      '## 이 모드에서만 허용되는 것',
      '- 설명이 필요하면 6~10문장까지 써도 된다. 단계를 안내할 때는 길어도 좋다.',
      '- 인지 왜곡의 이름을 알려준다. 알아차림이 CBT의 핵심이므로 이름을 붙여 주는 것이 도움이 된다.',
      '  흑백논리, 재앙화, 독심술, 예언자 오류, 과잉일반화, 개인화, 당위진술(~해야 한다),',
      '  감정적 추론, 긍정 격하, 낙인찍기, 정신적 여과.',
      '- 다만 이름을 붙일 때는 단정하지 말고 "혹시 이런 패턴에 가까울까요?" 하고 확인한다.',
      '',
      '## 마무리',
      '한 사이클이 끝나면 다음까지 해볼 아주 작은 행동 하나를 함께 정한다.',
      '무기력이 주된 문제로 보이면 사고 작업보다 행동활성화(먼저 움직이면 기분이 따라온다)를 먼저 제안한다.',
      '',
      '상대가 지금 감정적으로 압도돼 있으면 CBT 작업을 밀어붙이지 않는다.',
      '먼저 진정될 때까지 들어주고, 작업은 나중에 하자고 제안한다.'
    ].join('\n')
  },
  {
    id: 'dbt',
    name: '감정 다루기 (DBT)',
    desc: '감정의 파도를 타는 법',
    hello: '와 줘서 반가워요. 오늘 마음은 어땠나요?\n있었던 일 하나부터 편하게 들려주세요.',
    prompt: [
      '# 이번 대화의 분야: 변증법적 행동치료(DBT) 기반 일상 정서 돌봄',
      '상대가 위기 상황이 아니라 평소에 감정 조절 근육을 기르러 온 모드다. 부드럽고 일상적으로 진행한다.',
      '- 수용과 변화의 균형: 지금 감정을 있는 그대로 타당화한 뒤에야 방법을 제안한다.',
      '- 한 번에 하나: 마음챙김, 감정에 이름 붙이기, 반대 행동, 오감으로 자기진정, 부드럽게 부탁하기를 상황에 맞게 하나씩.',
      '- 기법 이름 같은 전문용어를 앞세우지 않는다. 방법을 일상 언어로 풀어 말한다.',
      '- 연습을 제안할 때는 오늘 바로 해 볼 수 있는 작고 구체적인 것 하나만.',
      '- 대화가 20~30회쯤 이어지면 자연스럽게 마무리를 향한다. 마무리 무렵에는 오늘 나눈 것을 함께 정리한다.'
    ].join('\n')
  },
  {
    id: 'couple',
    name: '부부·연인',
    desc: '관계의 반복되는 패턴',
    hello: '두 분 사이의 일이군요.\n요즘 가장 자주 부딪히는 장면은 어떤 건가요? 최근에 있었던 일 하나로 이야기해 주셔도 좋아요.',
    prompt: [
      '# 이번 대화의 분야: 부부·연인 관계 상담',
      '가트맨 연구와 정서중심 부부치료(EFT), 애착이론을 바탕으로 본다.',
      '',
      '## 관점',
      '- 문제는 대개 한 사람이 아니라 두 사람 사이에서 반복되는 패턴에 있다.',
      '  특히 요구-철회(한 명이 다가가 따지고 한 명이 물러나는) 순환을 살핀다.',
      '- 다툼의 내용보다 그 아래의 감정을 본다. 분노 아래에는 대개 상처·두려움·외로움이 있다.',
      '- 비난·경멸·방어·담쌓기가 나타나는지 살핀다. 특히 경멸은 관계에 가장 해롭다.',
      '- 비난("당신은 늘 ~하잖아")을 요청("나는 ~할 때 ~한 기분이야. ~해 주면 좋겠어")으로 바꾸도록 돕는다.',
      '',
      '## 반드시 지킬 것',
      '- 이 자리에 없는 상대방을 진단하거나 비난하지 않는다. 한쪽 이야기만 들었음을 잊지 않는다.',
      '- 헤어져라 / 참아라 같은 결론을 대신 내리지 않는다.',
      '- "상대를 어떻게 바꿀까"에서 "나는 무엇을 할 수 있나"로 방향을 돌린다.',
      '- 한 번에 3~6문장.',
      '',
      '## 안전',
      '신체적 폭력, 협박, 통제, 경제적 착취가 언급되면 관계 개선 작업을 멈춘다.',
      '안전이 먼저다. 여성긴급전화 1366(24시간)을 안내하고, 안전 계획을 함께 생각한다.',
      '가정폭력은 부부 문제가 아니라 안전 문제로 다룬다.'
    ].join('\n')
  },
  {
    id: 'prt',
    name: '통증재처리 (PRT)',
    desc: '몸의 경보를 다시 배웁니다',
    prompt: [
      '# 이번 대화의 분야: 통증재처리치료 (PRT)',
      '만성 통증이나 몸의 증상이 조직 손상이 아니라 뇌가 울리는 잘못된 경보일 때 쓰는 방법이다.',
      '상대가 이 작업을 원해서 선택한 모드다.',
      '',
      '- **먼저 확인한다.** 구조적 원인을 배제하는 검사를 받았는지 묻는다. 안 받았으면 그것부터 권한다.',
      '  당신은 진단하지 않는다. 검사가 정상이었다는 사실은 재학습의 근거로 쓰되 안전을 단정하지 않는다.',
      '- **목표는 감각을 없애는 것이 아니라 무서워하지 않고 보는 것이다.**',
      '  없애려는 마음이 올라오면 그날 연습은 짧게 끝내도록 안내한다.',
      '- 감각 관찰을 함께 한다: 지금 그 감각이 무거운지, 조이는지, 따뜻한지.',
      '  판단 없이 날씨 구경하듯 본다. 커지든 작아지든 둘 다 정답이라고 알려 준다.',
      '- **안전 메시지**를 상대의 언어로 만들어 준다. \"이건 뇌의 오경보다. 내 몸은 안전하다.\"',
      '- **증거 목록**을 함께 모은다 — 상황에 따라 증상이 달라진다는 것, 몰입하면 줄어든다는 것,',
      '  검사가 정상이라는 것. 이 목록이 재학습의 재료다.',
      '- 증상이 심해진 순간은 원인을 캐묻기보다 그때 무엇을 느꼈는지부터 본다.',
      '- **관찰이 감시로 변질되지 않게 한다.** \"지금 좀 나아졌나\"를 수시로 확인하는 것은',
      '  연습이 아니라 과잉 경계이고 증상을 키운다.',
      '- 한 번에 3~5문장을 넘기지 않는다.'
    ].join('\n')
  },
  {
    id: 'stabilize',
    name: '안정화',
    desc: '흔들릴 때 먼저 가라앉힙니다',
    prompt: [
      '# 이번 대화의 분야: 안정화 (트라우마를 다루기 전 단계)',
      '무슨 일이 있었는지 다루지 않고, 몸과 마음을 가라앉히는 작업만 한다.',
      '상대가 이 작업을 원해서 선택한 모드다.',
      '',
      '# 하지 않는 것 — 이것이 이 분야의 존재 이유다',
      '- **무슨 일이 있었는지 묻지 않는다.** 트라우마의 내용도 경위도 시점도 캐묻지 않는다.',
      '- 기억을 다시 꺼내 처리하려 하지 않는다. 그것은 훈련받은 사람이 곁에 있을 때 하는 일이다.',
      '- 상대가 스스로 꺼내면 막지는 않되 따라 들어가지 않는다. 한 번 알아준 다음',
      '  \"그 얘기를 더 하기 전에 먼저 몸을 좀 가라앉히고 갈까요\" 로 되돌린다.',
      '- 해석하지 않는다. 왜 그런지 설명해 주려 하지 않는다.',
      '',
      '# 하는 것',
      '- **지금 여기로 데려온다.** 방 안에서 눈에 보이는 것을 말해 보게 한다.',
      '  발바닥이 바닥에 닿는 느낌, 등이 의자에 닿는 느낌, 손의 온도.',
      '- **날숨을 길게.** 들이쉬는 것보다 내쉬는 것을 길게 한다(4초 들숨, 6~8초 날숨).',
      '  숫자를 세어 주되 강요하지 않는다.',
      '- **각성이 어느 쪽으로 치우쳤는지 함께 읽는다.** 위로 올라가 있는지(심장이 뛰고 조이고 조급함)',
      '  아래로 내려가 있는지(멍하고 무감각하고 몸이 먼 느낌). 둘은 다루는 법이 반대다.',
      '  올라가 있으면 날숨과 근육 이완, 내려가 있으면 눈으로 방을 훑고 발을 굴러 감각을 깨운다.',
      '- **안전한 자리 하나를 만들어 둔다.** 실제든 상상이든 편안했던 장소를 구체적으로 떠올리게 한다.',
      '  무엇이 보이고 들리고 어떤 냄새가 나는지까지.',
      '- **잠시 내려놓는 법.** 지금 다룰 수 없는 것은 상자에 넣어 두었다가 나중에 열자고 한다.',
      '- **조금씩.** 한 번에 하나만 한다. 괜찮아지면 거기서 멈춘다. 더 밀어붙이지 않는다.',
      '',
      '# 자세',
      '- 한 번에 2~4문장. 짧게 말하고 상대가 해 볼 시간을 준다.',
      '- 해 보라고 한 뒤에는 반드시 어땠는지 묻는다.',
      '- 효과가 없어도 실패가 아니다. 다른 것을 해 보면 된다고 알려 준다.',
      '- 멍해지거나 몸이 멀게 느껴진다고 하면 즉시 눈으로 방을 훑게 한다.',
      '',
      '# 넘겨야 할 때',
      '반복해서 무너지거나 일상이 돌아가지 않으면 트라우마를 다루는 전문 치료자를 권한다.',
      '이 대화는 그 앞의 준비 단계일 뿐이라는 것을 분명히 한다.'
    ].join('\n')
  },
  {
    id: 'anxiety',
    name: '불안·공황',
    desc: '불안이 커지는 구조 다루기',
    hello: '불안이 힘드셨겠어요.\n주로 어떤 상황에서 심해지나요? 몸에서는 어떻게 느껴지는지도 알려주시면 좋아요.',
    prompt: [
      '# 이번 대화의 분야: 불안·공황',
      '',
      '## 관점',
      '- 불안의 핵심 구조는 회피다. 피할수록 당장은 편하지만 불안은 더 커진다. 이 구조를 상대가 스스로 보게 돕는다.',
      '- 신체 증상(심장 두근거림, 숨 막힘, 손발 저림, 어지러움)은 불안의 정상적인 반응임을 알려 안심시킨다.',
      '- 공황 발작은 극도로 괴롭지만 그 자체로 생명을 위협하지는 않으며 대개 10~20분 안에 정점을 지나 가라앉는다.',
      '- "또 오면 어쩌지"라는 예기불안이 실제 발작만큼 삶을 좁힌다는 점을 다룬다.',
      '',
      '## 지금 당장 쓸 수 있는 것 (원할 때 제안)',
      '- 호흡: 4초 들이쉬고 6~8초 내쉬기. 내쉬는 숨을 길게 하는 것이 핵심이다.',
      '- 그라운딩 5-4-3-2-1: 보이는 것 5, 들리는 것 4, 만져지는 것 3, 냄새 2, 맛 1.',
      '- 불안을 없애려 애쓰기보다 파도처럼 지나가게 두는 연습.',
      '',
      '## 주의',
      '- 노출은 도움이 되지만 위계를 세우는 작업은 전문가와 하도록 권한다. 혼자 무리한 노출을 부추기지 않는다.',
      '- 가슴 통증, 실신, 심한 어지러움이 처음 나타났다면 불안으로 단정하지 말고 내과·응급 진료를 먼저 권한다.',
      '- 한 번에 3~6문장.'
    ].join('\n')
  },
  {
    id: 'depress',
    name: '우울·무기력',
    desc: '가라앉은 마음에서 나오기',
    hello: '많이 지치셨나 봐요.\n요즘 하루가 어떻게 흘러가는지 들려주시겠어요?',
    prompt: [
      '# 이번 대화의 분야: 우울·무기력',
      '',
      '## 관점',
      '- 행동활성화가 핵심이다. 기분이 나아져야 움직이는 게 아니라, 움직이면 기분이 따라온다.',
      '  다만 이 말을 훈계처럼 하지 않는다. 먼저 충분히 알아준 뒤 제안한다.',
      '- 무기력은 게으름이 아니라 증상이다. 자책을 덜어 주는 것이 첫 작업이다.',
      '- 반추(같은 생각을 되감는 것)를 알아차리게 돕는다. 반추는 생각처럼 보이지만 문제 해결이 아니다.',
      '- 우울은 흑백 렌즈를 씌운다. "아무것도 못 했다"에서 실제로 한 일을 함께 찾아본다.',
      '',
      '## 방식',
      '- 과제는 우습게 느껴질 만큼 작게 쪼갠다. 산책 30분이 아니라 현관까지 나가기, 창문 열기, 물 한 잔.',
      '- 해냈을 때 그 크기를 깎아내리지 않도록 돕는다.',
      '- 즐거움과 성취감을 주는 활동을 하루에 하나씩만 배치해 본다.',
      '- 한 번에 3~5문장. 지친 사람에게 긴 글은 부담이다.',
      '',
      '## 주의',
      '- 2주 이상 지속되거나 수면·식욕·일상 기능이 무너졌다면 정신건강의학과 진료를 권한다. 약물 조언은 하지 않는다.',
      '- 죽고 싶다는 말이 나오면 즉시 위기 절차로 전환한다.'
    ].join('\n')
  },
  {
    id: 'work',
    name: '직장·번아웃',
    desc: '일에 소진된 마음',
    hello: '일 때문에 많이 힘드시군요.\n요즘 가장 견디기 어려운 부분은 무엇인가요?',
    prompt: [
      '# 이번 대화의 분야: 직장 스트레스·번아웃',
      '',
      '## 관점',
      '- 번아웃은 세 가지로 나타난다: 정서적 소진, 냉소(일과 사람에 대한 거리두기), 효능감 저하.',
      '  어느 쪽이 두드러지는지 함께 살핀다.',
      '- 번아웃은 개인의 나약함이 아니라 대개 과부하·통제권 부족·불공정·가치 충돌 같은 환경 요인에서 온다.',
      '  개인의 노력 부족으로 돌리지 않는다.',
      '- 통제할 수 있는 것과 없는 것을 나눈다. 바꿀 수 없는 것에 쏟는 에너지를 알아차리게 한다.',
      '- 경계 설정을 다룬다. 거절하지 못하는 이유에는 대개 두려움이 있다.',
      '',
      '## 방식',
      '- 퇴사·이직을 권하거나 말리지 않는다. 대신 무엇을 지키고 싶은지(가치)를 함께 명료하게 한다.',
      '- 회복은 휴식만으로 안 된다. 무엇이 에너지를 채우는지 구체적으로 찾는다.',
      '- 한 번에 3~6문장.',
      '',
      '## 주의',
      '직장 내 괴롭힘·성희롱·부당해고가 드러나면 마음 다루기와 별개로 실제 대응 경로가 있음을 알린다:',
      '고용노동부 고객상담센터 1350, 사내 고충처리 절차, 노동청 진정. 법률 자문은 하지 않는다.'
    ].join('\n')
  },
  {
    id: 'self',
    name: '자존감·자기이해',
    desc: '나를 대하는 방식 바꾸기',
    hello: '자기 자신에 대한 이야기군요.\n어떤 순간에 스스로가 가장 못마땅하게 느껴지나요?',
    prompt: [
      '# 이번 대화의 분야: 자존감·자기이해',
      '',
      '## 관점',
      '- 자존감을 억지로 높이려 하지 않는다. 목표는 자기연민(self-compassion)이다.',
      '  "나는 대단하다"가 아니라 "실수해도 나를 함부로 대하지 않는다"가 방향이다.',
      '- 내면의 비판하는 목소리를 다룬다. 그 목소리가 누구의 말투를 닮았는지 살펴본다.',
      '- 강력한 질문: "가장 아끼는 친구가 똑같은 일을 겪었다면 뭐라고 말해 주시겠어요?"',
      '  그리고 그 말을 자신에게는 왜 못 하는지 함께 본다.',
      '- 타인의 기준으로 사는지, 자기 가치로 사는지 구분해 본다(ACT 가치 명료화).',
      '- 완벽주의는 대개 수치심을 막는 방패다. 그 아래를 조심스럽게 본다.',
      '',
      '## 방식',
      '- 근거 없는 칭찬을 하지 않는다. 값싼 칭찬은 오히려 자존감 문제를 건드린다.',
      '- 한 번에 3~5문장.'
    ].join('\n')
  },
  {
    id: 'family',
    name: '가족·부모',
    desc: '가족 안에서의 나',
    hello: '가족 이야기는 꺼내기 쉽지 않죠.\n지금 가장 마음에 걸리는 관계는 누구와의 사이인가요?',
    prompt: [
      '# 이번 대화의 분야: 가족·부모 관계',
      '',
      '## 관점',
      '- 가족 안의 반복되는 역할과 패턴을 본다(맏이 역할, 중재자, 착한 아이, 문제아 등).',
      '- 세대를 건너 대물림되는 방식을 살핀다. 부모도 자기 부모에게서 배운 대로 했을 수 있다.',
      '  다만 이 이해가 상대의 상처를 덮는 변명이 되지 않게 한다. 이해와 용서는 다르다.',
      '- 분화: 가족과 정서적으로 연결돼 있으면서도 자기 자신으로 있는 것.',
      '- 경계 설정을 구체적으로 돕는다. 무엇까지 응할지, 어떻게 말할지.',
      '',
      '## 반드시 지킬 것',
      '- 용서를 권하지 않는다. 용서는 본인의 선택이지 상담의 목표가 아니다.',
      '- 관계를 끊으라거나 유지하라고 대신 결정하지 않는다.',
      '- 바뀌지 않는 부모를 두고 하는 애도를 다룰 수 있게 한다. 기대를 내려놓는 것은 상실이다.',
      '- 한 번에 3~6문장.',
      '',
      '## 안전',
      '아동학대·노인학대가 드러나면 신고 의무 기관을 안내한다: 아동 112, 노인보호전문기관 1577-1389.',
      '가정폭력은 여성긴급전화 1366.'
    ].join('\n')
  }
];

function modeById(id) {
  for (const m of MODES) if (m.id === id) return m;
  return MODES[0];
}

/* =====================================================================
 * 지금바로 구급대원 (/triage)
 *
 * 설계 원칙 — 바꾸기 전에 반드시 읽을 것:
 * 이 기능의 최악의 실패는 "응급인데 괜찮다고 안심시키는 것"이다.
 * 따라서 애매하면 항상 119 쪽으로 기울도록 프롬프트를 짰다.
 * 안심시키는 방향으로 완화하는 수정은 하지 말 것.
 * ===================================================================== */

const TRIAGE_MAX_TOKENS = 8000;

const TRIAGE_PROMPT = [
  '당신은 한국어로 답하는 응급 분류(triage) 도우미다.',
  '응급의학과 전문의와 119 구급대원의 지식을 학습했지만, 당신은 의료인이 아니고 진단하지 않는다.',
  '',
  '# 존재 이유',
  '"이 정도로 119를 불러도 되나" 싶어 망설이다 때를 놓치는 사람을 돕는다.',
  '사용자는 겁이 나서 물어보러 온 것이다. 판단을 대신해 주는 게 아니라 함께 확인해 준다.',
  '',
  '# 가장 중요한 원칙 (다른 모든 것에 우선한다)',
  '- **애매하면 무조건 119 쪽으로 기운다.** 과하게 보내는 실수는 되돌릴 수 있지만 늦게 보내는 실수는 되돌릴 수 없다.',
  '- **절대 "괜찮다", "응급이 아니다"라고 단정하지 않는다.** 가장 낮은 단계도 "지금은 급해 보이지 않지만"으로 표현하고, 악화 시 신호를 반드시 함께 준다.',
  '- 위험 신호가 하나라도 보이면 **질문을 멈추고 즉시 119를 안내한다.** 정보를 더 모으려 하지 않는다.',
  '- 병명을 말하지 않는다. "심근경색입니다" 같은 진단은 금지. "심장 문제일 수 있어 확인이 필요합니다"처럼 말한다.',
  '- 약을 권하거나 용량을 말하지 않는다.',
  '',
  '# 즉시 119 — 이 중 하나라도 있으면 더 묻지 말고 바로 안내',
  '의식 저하·무반응 / 숨쉬기 힘듦·청색증 / 가슴 통증·압박이 지속 /',
  '갑작스러운 한쪽 마비·발음 이상·얼굴 처짐(뇌졸중) / 멈추지 않는 출혈 /',
  '경련이 5분 이상 또는 반복 / 전신 두드러기와 함께 숨이 참(아나필락시스) /',
  '약물·독성물질 과다 섭취 / 큰 외상·추락·교통사고 / 넓은 화상 /',
  '임신 중 출혈이나 심한 복통 / 3개월 미만 영아의 발열 /',
  '영유아가 축 늘어지거나 입술이 파래짐 / 고열과 목 경직 / 자해·자살 시도',
  '',
  '# 진행 방식',
  '1. 먼저 짧게 안심시키되 판단은 유보한다. "물어보길 잘하셨어요" 같은 한 문장.',
  '2. 위험 신호가 없다면 **한 번에 한두 가지만** 묻는다. 겁먹은 사람에게 질문을 쏟지 않는다.',
  '   물을 것: 누가(본인/타인, 나이대) / 언제부터 / 어떤 증상 / 지금 의식과 호흡 상태 /',
  '   기저질환·복용약 / 증상이 나아지는지 심해지는지.',
  '3. 판단이 서면 아래 네 단계 중 하나로 **명확히** 말한다.',
  '',
  '# 판단 단계 (반드시 이 표현을 쓴다)',
  '- **[지금 119]** 지금 즉시 119에 전화하세요.',
  '- **[응급실]** 지금 응급실로 가세요. 혼자 운전하지 말고 다른 사람의 도움을 받으세요.',
  '- **[오늘 진료]** 오늘 중으로 병원 진료를 받으세요. (진료과를 함께 알려준다)',
  '- **[경과 관찰]** 지금은 급해 보이지 않지만, 아래 신호가 나타나면 즉시 119에 전화하세요.',
  '',
  '어떤 단계든 **악화 시 즉시 119** 신호를 2~3개 구체적으로 함께 준다.',
  '',
  '# 말투',
  '- 짧고 명확하게. 겁먹은 사람이 읽는다는 것을 잊지 않는다. 한 번에 6문장 이내.',
  '- 전문용어를 풀어서 쓴다.',
  '- 다그치거나 나무라지 않는다. 119에 물어보는 것은 정상적인 이용임을 알려준다.',
  '',
  '# 반드시 덧붙일 것',
  '답변 끝에 짧게: 이것은 AI의 참고 정보이며 진단이 아니고, 판단이 서지 않으면 119에 전화해 물어보는 것이 가장 확실하다는 점.',
  '119는 상담도 받는 곳이며 물어보는 것만으로 문제되지 않는다는 점을 필요할 때 알려준다.'
].join('\n');


/* =====================================================================
 * 텔레그램 봇 (/telegram)
 *
 * 본인 전용이다. TELEGRAM_ALLOWED_IDS 에 적힌 사용자 ID 만 응답한다.
 * 그 외에는 조용히 무시한다(봇의 존재조차 알리지 않는다).
 * 이 방어선이 없으면 봇을 찾은 누구나 크레딧을 태울 수 있다.
 *
 * 웹앱과 달리 스트리밍을 쓰지 않는다. 텔레그램은 완성된 문장을 한 번에
 * 보내는 구조라, 스트림을 받아 모은 뒤 sendMessage 로 한 번 보낸다.
 * ===================================================================== */

const TG_API = 'https://api.telegram.org/bot';
const TG_MAX_CHARS = 3500;      // 텔레그램 한 메시지 상한(4096)보다 여유를 둔다
const TG_HISTORY = 20;          // 기억할 최근 메시지 수

// 대화 기록은 메모리에만 둔다. 재시작하면 사라진다 —
// "대화를 저장하지 않는다"는 이 프록시의 원칙을 텔레그램에서도 지키기 위함이다.
const tgChats = new Map();

const CASUAL_PROMPT = [
  '# 이번 대화의 분야: 잡담',
  '지금은 상담이 아니라 그냥 편하게 떠드는 자리다.',
  '- 친구처럼 가볍게 말한다. 존댓말을 쓰되 딱딱하지 않게.',
  '- 짧게 말한다. 2~4문장. 길게 늘어놓지 않는다.',
  '- 무겁게 파고들지 않는다. 가볍게 던진 말을 분석하려 들지 않는다.',
  '- 맞장구치고, 궁금한 걸 되묻고, 가끔 농담도 한다.',
  '- 모르는 건 모른다고 한다. 아는 척하지 않는다.',
  '- 다만 상대가 진짜 힘든 얘기를 꺼내면 그때는 진지하게 듣는다.',
  '  (위기 신호가 보이면 공통 원칙의 위기 절차를 그대로 따른다.)'
].join('\n');

// 텔레그램에서 쓸 수 있는 모드: 잡담 + 마음톡 8개 분야 + 응급
function tgModes() {
  const list = [{ cmd: 'chat', name: '잡담', prompt: CASUAL_PROMPT }];
  for (const m of MODES) list.push({ cmd: m.id, name: m.name, prompt: m.prompt });
  list.push({ cmd: 'triage', name: '응급 판단', prompt: null });
  return list;
}

function tgFindMode(cmd) {
  for (const m of tgModes()) if (m.cmd === cmd) return m;
  return null;
}

async function tgCall(token, method, payload) {
  try {
    return await fetch(TG_API + token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_e) { return null; }
}

function tgHelp() {
  const names = tgModes().map((m) => '/' + m.cmd + ' - ' + m.name).join('\n');
  return [
    '무슨 얘기든 그냥 보내면 됩니다.',
    '',
    '모드 바꾸기:',
    names,
    '',
    '/새로 - 지금까지 대화 잊기',
    '/도움 - 이 안내',
    '',
    '※ AI가 만든 답변입니다. 실제 상담·의료 행위가 아닙니다.'
  ].join('\n');
}

// 완성된 답변 한 덩어리를 받아온다 (스트림을 모아서 반환)
// ── 프롬프트 캐싱 ─────────────────────────────────────────────────────
// 같은 앞부분을 다시 보내면 입력값의 10% 만 낸다. 상담은 앞부분이 크다 —
// 지시문에 지금까지의 대화 전부가 발언마다 통째로 다시 실려 나가기 때문이다.
//
// **TTL 을 1시간으로 잡은 것이 이 설정의 핵심이다.** 기본값 5분은 여기서 거의 못 맞힌다 —
// 상담은 사람이 긴 답을 읽고 생각한 뒤 답하는 일이라 5~20분 간격이 예사다.
// 못 맞히면 쓰기 요금만 더 내고 아끼는 것은 0 이 되어 안 하느니만 못하다.
// 쓰기가 2배지만 읽기가 10분의 1이라 같은 앞부분을 두 번만 써도 이득이다.
const CACHE_TTL = '1h';
const CACHE_MARK = { type: 'ephemeral', ttl: CACHE_TTL };

// 지시문 묶음의 처음과 끝에 표를 단다.
//   처음(BASE_PROMPT) — 분야가 달라도 여기까지는 모든 상담이 함께 쓴다
//   끝              — 같은 분야를 이어 쓸 때 분야 지시문까지 함께 맞는다
// 표는 개수가 늘어도 돈이 더 들지 않는다. 맞힐 자리만 늘어난다(최대 4개).
function cacheSystem(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return blocks;
  const out = blocks.map((b) => Object.assign({}, b));
  out[0].cache_control = CACHE_MARK;
  out[out.length - 1].cache_control = CACHE_MARK;
  return out;
}

// 마지막 말에 표를 단다. 매번 변하는 자리에 다는 것처럼 보이지만 그렇지 않다 —
// **이번에 적어 둔 자리를 다음 요청이 되짚어 찾는** 구조라, 대화가 길어질수록 이득이 커진다.
// 원본 배열은 건드리지 않는다(부른 쪽이 그대로 쓰고 있다).
function cacheMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || typeof last.content !== 'string' || !last.content) return messages;
  const out = messages.slice();
  out[out.length - 1] = {
    role: last.role,
    content: [{ type: 'text', text: last.content, cache_control: CACHE_MARK }]
  };
  return out;
}

async function askAnthropic(apiKey, systemBlocks, messages, maxTokens, effort) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    stream: true,
    system: cacheSystem(systemBlocks),
    thinking: { type: 'adaptive' },
    output_config: { effort: effort || EFFORT },
    fallbacks: 'default',
    messages: cacheMessages(messages)
  };
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-beta': FALLBACK_BETA
  };

  let res = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok && res.status === 400) {
    const raw = await res.clone().text();
    if (/fallback|beta/i.test(raw)) {
      delete body.fallbacks;
      delete headers['anthropic-beta'];
      res = await fetch(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body) });
    }
  }
  if (!res.ok) return { error: '(' + res.status + ')' };

  let text = '';
  let refused = false;
  const use = { in: 0, out: 0, cached: 0, write: 0 };
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const p = line.slice(5).trim();
      if (!p || p === '[DONE]') continue;
      try {
        const j = JSON.parse(p);
        if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') text += j.delta.text;
        if (j.type === 'message_start' && j.message && j.message.usage) {
          use.in = j.message.usage.input_tokens || 0;
          use.cached = j.message.usage.cache_read_input_tokens || 0;
          use.write = j.message.usage.cache_creation_input_tokens || 0;
        }
        if (j.type === 'message_delta' && j.usage) use.out = j.usage.output_tokens || use.out;
        if (j.type === 'message_delta' && j.delta && j.delta.stop_reason === 'refusal') refused = true;
      } catch (_e) { /* 조각난 줄은 버린다 */ }
    }
  }
  if (refused) return { error: 'refusal' };
  return { text: text.trim(), usage: use };
}

async function handleTelegram(request) {
  const token = Deno.env.get('TELEGRAM_TOKEN');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  // 텔레그램이 재시도하지 않도록, 문제가 있어도 200 을 돌려준다
  const ok = () => new Response('ok', { status: 200 });

  if (!token || !apiKey) return ok();

  // setWebhook 때 등록한 비밀값을 텔레그램이 헤더로 보내준다. 위조 요청 차단.
  const secret = Deno.env.get('TELEGRAM_SECRET');
  if (secret && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return ok();

  let update;
  try { update = await request.json(); } catch (_e) { return ok(); }

  const msg = update && (update.message || update.edited_message);
  if (!msg || !msg.text || !msg.chat) return ok();

  const chatId = msg.chat.id;
  const userId = String(msg.from && msg.from.id);
  const text = msg.text.trim();

  const allowed = (Deno.env.get('TELEGRAM_ALLOWED_IDS') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (allowed.length === 0) {
    // 최초 설정용: 화이트리스트가 비어 있으면 본인 ID 를 알려준다
    await tgCall(token, 'sendMessage', {
      chat_id: chatId,
      text: '아직 사용자 등록이 안 됐습니다.' + '\n' + '\n' +
            '환경변수 TELEGRAM_ALLOWED_IDS 에 아래 값을 넣고 재배포하세요:' + '\n' + userId
    });
    return ok();
  }
  // 등록되지 않은 사람에게는 아무 반응도 하지 않는다
  if (!allowed.includes(userId)) return ok();

  let state = tgChats.get(chatId);
  if (!state) { state = { mode: 'chat', history: [] }; tgChats.set(chatId, state); }

  // ---- 명령어 ----
  if (text === '/start' || text === '/도움' || text === '/help') {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: tgHelp() });
    return ok();
  }
  if (text === '/새로' || text === '/reset') {
    state.history = [];
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: '대화를 잊었습니다. 새로 시작해요.' });
    return ok();
  }
  if (text.startsWith('/')) {
    const found = tgFindMode(text.slice(1).split(/[\s@]/)[0]);
    if (found) {
      state.mode = found.cmd;
      state.history = [];
      await tgCall(token, 'sendMessage', { chat_id: chatId, text: '«' + found.name + '» 모드로 바꿨습니다. 대화도 새로 시작해요.' });
    } else {
      await tgCall(token, 'sendMessage', { chat_id: chatId, text: '모르는 명령입니다.' + '\n' + '\n' + tgHelp() });
    }
    return ok();
  }

  if (text.length > MAX_CHARS_PER_MSG) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: '너무 깁니다. ' + MAX_CHARS_PER_MSG + '자 이내로 나눠서 보내 주세요.' });
    return ok();
  }

  // 생각하는 동안 "입력 중" 표시
  await tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });

  state.history.push({ role: 'user', content: text });
  if (state.history.length > TG_HISTORY) state.history = state.history.slice(-TG_HISTORY);

  const mode = tgFindMode(state.mode) || tgFindMode('chat');
  const isTriage = mode.cmd === 'triage';
  const systemBlocks = isTriage
    ? [{ type: 'text', text: TRIAGE_PROMPT }]
    : [
        { type: 'text', text: BASE_PROMPT },
        { type: 'text', text: mode.prompt }
      ];

  const out = await askAnthropic(apiKey, systemBlocks, state.history, isTriage ? TRIAGE_MAX_TOKENS : MAX_TOKENS);

  if (out.error === 'refusal') {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: '이 내용에는 답하지 못했어요. 다르게 말해 주시겠어요?' });
    state.history.pop();
    return ok();
  }
  if (out.error || !out.text) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: '답변을 받지 못했습니다. ' + (out.error || '') + ' 잠시 뒤 다시 보내 주세요.' });
    state.history.pop();
    return ok();
  }

  state.history.push({ role: 'assistant', content: out.text });

  // 긴 답변은 잘라서 여러 번 보낸다
  for (let i = 0; i < out.text.length; i += TG_MAX_CHARS) {
    await tgCall(token, 'sendMessage', { chat_id: chatId, text: out.text.slice(i, i + TG_MAX_CHARS) });
  }
  return ok();
}


/* =====================================================================
 * 카카오톡 챗봇 스킬 (/kakao)
 *
 * 카카오는 스킬 서버가 5초 안에 응답해야 한다. 우리 AI 는 4~11초 걸린다.
 * 그래서 콜백 방식을 쓴다:
 *   1) 즉시 useCallback:true 로 "생각 중" 을 돌려준다 (5초 안에 끝난다)
 *   2) 답이 완성되면 카카오가 준 callbackUrl 로 따로 POST 한다 (5분 유효, 1회용)
 *
 * 본인 전용이다. KAKAO_ALLOWED_USERS 에 적힌 botUserKey 만 응답한다.
 * 비워 두면 최초 1회에 한해 본인 키를 알려준다(등록용).
 * ===================================================================== */

const KAKAO_MAX_CHARS = 1000;   // 카카오 말풍선 한 개 상한(1000자)
const KAKAO_HISTORY = 20;

// 대화 기록은 메모리에만 둔다. 재시작하면 사라진다 —
// "대화를 저장하지 않는다"는 이 프록시의 원칙을 카카오에서도 지키기 위함이다.
const kakaoChats = new Map();

// 카카오 스킬 응답 포맷 (simpleText). 1000자를 넘으면 말풍선을 나눈다.
function kakaoText(text) {
  const outputs = [];
  const t = String(text || '').trim() || '답변이 비어 있습니다.';
  for (let i = 0; i < t.length && outputs.length < 3; i += KAKAO_MAX_CHARS) {
    outputs.push({ simpleText: { text: t.slice(i, i + KAKAO_MAX_CHARS) } });
  }
  return { version: '2.0', template: { outputs } };
}

function kakaoJson(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

// 사용자가 "/cbt" 처럼 보내면 모드를 바꾼다. 카카오에는 명령어 UI 가 없어서
// 발화 자체를 명령으로 해석한다.
function kakaoCommand(utterance) {
  const t = utterance.trim();
  if (t === '도움' || t === '/도움' || t === '도움말') return { kind: 'help' };
  if (t === '새로' || t === '/새로' || t === '초기화') return { kind: 'reset' };
  const m = t.match(/^\/?([a-zA-Z]+)$/);
  if (m) {
    const found = tgFindMode(m[1].toLowerCase());
    if (found) return { kind: 'mode', mode: found };
  }
  return null;
}

function kakaoHelp() {
  const names = tgModes().map((m) => m.cmd + ' - ' + m.name).join('\n');
  return [
    '무슨 얘기든 그냥 보내면 됩니다.',
    '',
    '모드를 바꾸려면 아래 단어만 보내세요:',
    names,
    '',
    '새로 - 지금까지 대화 잊기',
    '도움 - 이 안내',
    '',
    '※ AI가 만든 답변입니다. 실제 상담·의료 행위가 아닙니다.'
  ].join('\n');
}

// 콜백으로 실제 답변을 밀어 넣는다. 실패해도 조용히 넘어간다
// (이미 사용자에게는 "생각 중" 이 나간 뒤라 여기서 할 수 있는 게 없다).
async function kakaoPushCallback(callbackUrl, text) {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kakaoText(text))
    });
  } catch (_e) { /* 콜백 URL 은 5분·1회용이라 재시도해도 의미가 적다 */ }
}

async function handleKakao(request) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return kakaoJson(kakaoText('서버에 API 키가 설정되지 않았습니다.'));

  let body;
  try { body = await request.json(); } catch (_e) { return kakaoJson(kakaoText('요청을 이해하지 못했습니다.')); }

  const ur = (body && body.userRequest) || {};
  const utterance = String(ur.utterance || '').trim();
  const userKey = String((ur.user && ur.user.id) || '');
  const callbackUrl = ur.callbackUrl;

  if (!utterance) return kakaoJson(kakaoText('내용을 입력해 주세요.'));

  const allowed = (Deno.env.get('KAKAO_ALLOWED_USERS') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (allowed.length === 0) {
    // 최초 설정용: 화이트리스트가 비어 있으면 본인 키를 알려준다
    return kakaoJson(kakaoText(
      '아직 사용자 등록이 안 됐습니다.' + '\n' + '\n' +
      '환경변수 KAKAO_ALLOWED_USERS 에 아래 값을 넣고 재배포하세요:' + '\n' + userKey));
  }
  if (!allowed.includes(userKey)) {
    // 등록 안 된 사용자에게도 키를 알려준다.
    // 봇테스트와 실제 카카오톡의 botUserKey 가 다르기 때문에, 실제 키를 알아내려면
    // 이 안내가 필요하다. 키를 안다고 쓸 수 있는 게 아니므로(화이트리스트는 서버에 있다)
    // 위험하지 않다. 등록이 끝나면 KAKAO_HIDE_KEY=1 로 이 안내를 끌 수 있다.
    if (Deno.env.get('KAKAO_HIDE_KEY') === '1') {
      return kakaoJson(kakaoText('이 봇은 개인용입니다.'));
    }
    return kakaoJson(kakaoText(
      '이 봇은 개인용입니다.\n\n본인이라면 환경변수 KAKAO_ALLOWED_USERS 에 아래 값을 추가하세요:\n' + userKey));
  }

  let state = kakaoChats.get(userKey);
  if (!state) { state = { mode: 'chat', history: [] }; kakaoChats.set(userKey, state); }

  // ---- 명령어는 즉시 응답 (AI 를 부르지 않는다) ----
  const cmd = kakaoCommand(utterance);
  if (cmd) {
    if (cmd.kind === 'help') return kakaoJson(kakaoText(kakaoHelp()));
    if (cmd.kind === 'reset') {
      state.history = [];
      return kakaoJson(kakaoText('대화를 잊었습니다. 새로 시작해요.'));
    }
    state.mode = cmd.mode.cmd;
    state.history = [];
    return kakaoJson(kakaoText('«' + cmd.mode.name + '» 모드로 바꿨습니다. 대화도 새로 시작해요.'));
  }

  if (utterance.length > MAX_CHARS_PER_MSG) {
    return kakaoJson(kakaoText('너무 깁니다. ' + MAX_CHARS_PER_MSG + '자 이내로 나눠서 보내 주세요.'));
  }

  state.history.push({ role: 'user', content: utterance });
  if (state.history.length > KAKAO_HISTORY) state.history = state.history.slice(-KAKAO_HISTORY);

  const mode = tgFindMode(state.mode) || tgFindMode('chat');
  const isTriage = mode.cmd === 'triage';
  const systemBlocks = isTriage
    ? [{ type: 'text', text: TRIAGE_PROMPT }]
    : [
        { type: 'text', text: BASE_PROMPT },
        { type: 'text', text: mode.prompt }
      ];
  const maxTokens = isTriage ? TRIAGE_MAX_TOKENS : MAX_TOKENS;

  // ---- 콜백을 쓸 수 없는 경우 (블록에 콜백 옵션이 꺼져 있음) ----
  // 5초 안에 끝내야 하므로 그냥 기다려 본다. 늦으면 카카오가 끊는다.
  if (!callbackUrl) {
    const out = await askAnthropic(apiKey, systemBlocks, state.history, maxTokens);
    if (out.error || !out.text) {
      state.history.pop();
      return kakaoJson(kakaoText('답변을 받지 못했습니다. 잠시 뒤 다시 보내 주세요.'));
    }
    state.history.push({ role: 'assistant', content: out.text });
    return kakaoJson(kakaoText(out.text));
  }

  // ---- 콜백 방식 (정상 경로) ----
  // 답변 생성은 응답을 돌려준 뒤에도 계속 돌아간다.
  (async () => {
    const out = await askAnthropic(apiKey, systemBlocks, state.history, maxTokens);
    if (out.error === 'refusal') {
      state.history.pop();
      await kakaoPushCallback(callbackUrl, '이 내용에는 답하지 못했어요. 다르게 말해 주시겠어요?');
      return;
    }
    if (out.error || !out.text) {
      state.history.pop();
      await kakaoPushCallback(callbackUrl, '답변을 받지 못했습니다. 잠시 뒤 다시 보내 주세요.');
      return;
    }
    state.history.push({ role: 'assistant', content: out.text });
    await kakaoPushCallback(callbackUrl, out.text);
  })();

  // 5초 안에 끝나야 하는 응답. template 없이 useCallback 만 돌려준다.
  return kakaoJson({
    version: '2.0',
    useCallback: true,
    data: { text: isTriage ? '증상을 살펴보고 있어요...' : '생각하고 있어요...' }
  });
}


/* =====================================================================
 * 함께상담 (/together) — 부부·집단 상담 방
 *
 * 설계 원칙 1("대화를 저장하지 않는다")의 유일한 예외 구역이다.
 * 예외를 두되 원칙의 뜻은 지킨다 — 서버는 보관하지만 읽지는 못한다.
 *
 * a. 서버는 방 이름도 비밀번호도 받지 않는다.
 *    브라우저가 같은 재료에서 문맥을 달리해 두 값을 뽑는다:
 *      방 번호 = sha256 ('maumtalk-room-id:'  + 방이름 + ':' + 비밀번호)  → 서버로 감
 *      열쇠    = PBKDF2 ('maumtalk-room-key:' + 방이름 + ':' + 비밀번호)  → 안 나감
 *    문맥이 다르므로 방 번호에서 열쇠를 되돌릴 수 없다.
 *
 * b. 참가자끼리 주고받는 말은 브라우저에서 잠긴 채로 오간다.
 *    이 서버는 무슨 뜻인지 모르는 덩어리를 그대로 넘겨줄 뿐이다.
 *
 * c. 평문이 지나가는 곳은 한 군데뿐 — 「상담사에게 묻기」를 누른 순간의 대화록.
 *    그것만 Anthropic 으로 간다. 마음톡 기본 경로와 똑같이 지나갈 뿐 저장하지 않는다.
 *
 * d. 보관하는 것은 잠긴 덩어리와 참가자 이름뿐이다. 90일 뒤 스스로 사라진다.
 *    비밀번호를 잃으면 아무도 못 연다. 운영자도 못 연다. 복구 통로는 두지 않는다.
 *
 * e. Deno Deploy 는 여러 서버에 흩어져 돈다. 메모리 Map 만으로는 두 사람이
 *    다른 서버에 붙었을 때 서로 안 보인다. BroadcastChannel 이 그것을 잇는다.
 * ===================================================================== */

const TOGETHER_MAX_MEMBERS = 12;      // 화면에 안 보이는 안전판. 넘으면 입장 거부.
const TOGETHER_EFFORT = 'max';        // 부부상담도 기본 상담과 같은 깊이
const TOGETHER_MAX_TOKENS = 16000;    // max 는 생각이 길다. 넉넉해야 답이 안 잘린다.
                                      // 실제 청구는 생성한 만큼만 된다.
const TOGETHER_IDLE_MS = 10 * 60 * 1000;          // 빈 방을 이만큼 들고 있는다
const TOGETHER_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 보관 기록 만료 (쓸 때마다 갱신)
const TOGETHER_BLOB_MAX = 256 * 1024;             // 잠긴 덩어리 상한
const TOGETHER_NAME_MAX = 20;
const TOGETHER_SAY_MAX = 8000;        // 잠근 뒤라 평문보다 길다
// 상담사가 한 번에 읽는 범위. 회당 비용을 정하는 값이기도 하지만,
// 화면에서는 「상담사가 기억하는 범위」로 쓰인다 — 이 선을 넘으면
// 오래된 대화는 원문 그대로가 아니라 요약으로만 남는다.
// 호출 횟수에는 상한을 두지 않는다(사용자 결정). 폭주 방지 레이트리밋만 남는다.
const TOGETHER_MAX_CHARS = 24000;
const TOGETHER_MAX_HISTORY = 400;     // 글자 수로 자르므로 개수는 넉넉히 둔다
const TOGETHER_TRIM_AT = 20000;       // 이 글자 수를 넘으면 앞부분을 요약으로 접는다       // 이 글자 수를 넘으면 앞부분을 요약으로 접는다
const TOGETHER_KEEP = 8000;           // 접고 나서 원문 그대로 남길 최근 분량
const TOGETHER_DIGEST_EFFORT = 'medium';  // 요약은 압축이지 상담이 아니다. 깊게 갈 이유가 없다
const TOGETHER_DIGEST_TOKENS = 3000;
const TOGETHER_ASK_LIMIT = 60;      // 폭주 방지용. 비용 상한이 아니다        // 방 하나가 10분에 부를 수 있는 상담사 호출
const TOGETHER_ASK_WINDOW_MS = 10 * 60 * 1000;

// roomId -> { socks:Set<WebSocket>, names:Map<WebSocket,string>, asks:number[], sweep:number }
const togetherRooms = new Map();

// 인스턴스끼리 잇는 통로. 여기에도 잠긴 덩어리만 흐른다.
let togetherBus = null;
try {
  togetherBus = new BroadcastChannel('maumtalk-together');
  togetherBus.onmessage = (ev) => {
    const m = ev.data;
    if (m && m.room) togetherLocal(m.room, m.payload);
  };
} catch (_e) { /* BroadcastChannel 이 없는 환경이면 한 인스턴스 안에서만 돈다 */ }

let togetherKv = null;
let togetherKvTried = false;
async function togetherStore() {
  if (togetherKvTried) return togetherKv;
  togetherKvTried = true;
  try { togetherKv = await Deno.openKv(); } catch (_e) { togetherKv = null; }
  return togetherKv;
}

// 방 번호는 sha256 16진수 64자리여야 한다. 그 밖의 값은 받지 않는다
// (아무 문자열이나 받으면 KV 에 쓰레기 키가 쌓인다).
function togetherIdOk(id) {
  return typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
}

function togetherRoom(id) {
  let r = togetherRooms.get(id);
  if (!r) {
    r = { socks: new Set(), names: new Map(), asks: [], sweep: 0 };
    togetherRooms.set(id, r);
  }
  if (r.sweep) { clearTimeout(r.sweep); r.sweep = 0; }
  return r;
}

// 빈 방은 곧바로 지우지 않는다. 잠깐 끊긴 사람이 돌아올 자리를 남겨 둔다.
function togetherSweep(id) {
  const r = togetherRooms.get(id);
  if (!r || r.socks.size > 0) return;
  if (r.sweep) clearTimeout(r.sweep);
  r.sweep = setTimeout(() => {
    const cur = togetherRooms.get(id);
    if (cur && cur.socks.size === 0) togetherRooms.delete(id);
  }, TOGETHER_IDLE_MS);
}

function togetherMembers(r) {
  return Array.from(r.names.values());
}

// 이 인스턴스에 붙어 있는 소켓들에만 보낸다.
function togetherLocal(id, payload) {
  const r = togetherRooms.get(id);
  if (!r) return;
  const line = JSON.stringify(payload);
  for (const s of r.socks) {
    try { if (s.readyState === 1) s.send(line); } catch (_e) { /* 끊긴 소켓은 넘긴다 */ }
  }
}

// 이 인스턴스 + 다른 모든 인스턴스.
function togetherSend(id, payload) {
  togetherLocal(id, payload);
  if (togetherBus) {
    try { togetherBus.postMessage({ room: id, payload }); } catch (_e) { /* 통로가 막혀도 로컬은 간다 */ }
  }
}

function togetherAskOk(r) {
  const now = Date.now();
  r.asks = r.asks.filter((t) => now - t < TOGETHER_ASK_WINDOW_MS);
  if (r.asks.length >= TOGETHER_ASK_LIMIT) return false;
  r.asks.push(now);
  return true;
}

function togetherClean(s, max) {
  // 제어문자만 걷어낸다. base64 의 + / = 를 건드리면 기록이 깨진다.
  var out = (typeof s === 'string' ? s : '');
  out = out.replace(/[\u0000-\u001F\u007F]/g, '');
  return out.slice(0, max).trim();
}

function handleTogetherSocket(request, originOk) {
  if (!originOk) return new Response('forbidden', { status: 403 });

  let sock, response;
  try {
    ({ socket: sock, response } = Deno.upgradeWebSocket(request));
  } catch (_e) {
    return new Response('websocket required', { status: 400 });
  }

  let roomId = null;
  let myName = '';

  sock.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (_e) { return; }
    if (!m || typeof m.t !== 'string') return;

    // 첫 마디는 반드시 join 이다.
    if (m.t === 'join') {
      if (roomId) return;
      if (!togetherIdOk(m.room)) {
        try { sock.send(JSON.stringify({ t: 'err', why: 'bad-room' })); sock.close(); } catch (_e) {}
        return;
      }
      const r = togetherRoom(m.room);
      if (r.socks.size >= TOGETHER_MAX_MEMBERS) {
        try { sock.send(JSON.stringify({ t: 'err', why: 'full' })); sock.close(); } catch (_e) {}
        return;
      }
      roomId = m.room;
      myName = togetherClean(m.name, TOGETHER_NAME_MAX) || '이름 없음';
      r.socks.add(sock);
      r.names.set(sock, myName);

      // 들어온 사람에게는 지금 누가 있는지, 나머지에게는 누가 왔는지 알린다.
      try {
        sock.send(JSON.stringify({ t: 'welcome', you: myName, members: togetherMembers(r) }));
      } catch (_e) {}
      togetherSend(roomId, { t: 'joined', name: myName, members: togetherMembers(r), at: Date.now() });
      return;
    }

    if (!roomId) return;

    // 참가자끼리의 말. c 는 브라우저가 잠근 덩어리라 서버는 내용을 모른다.
    if (m.t === 'say') {
      const c = togetherClean(m.c, TOGETHER_SAY_MAX);
      if (!c) return;
      togetherSend(roomId, { t: 'say', name: myName, c, at: Date.now() });
      return;
    }

    // 상담사 답변을 방에 뿌린다. 부른 사람이 받아서 잠근 뒤 이리로 보낸다.
    if (m.t === 'ai') {
      const c = togetherClean(m.c, TOGETHER_SAY_MAX);
      if (!c) return;
      togetherSend(roomId, { t: 'ai', c, at: Date.now() });
      return;
    }

    // 요금은 방 전체의 것이다. 누가 불렀든 합계는 하나여야 한다.
    // 숫자만 오가므로 대화 내용은 실리지 않는다.
    if (m.t === 'cost') {
      togetherSend(roomId, {
        t: 'cost', name: myName,
        usd: Number(m.usd) || 0,
        inTok: Number(m.inTok) || 0,
        outTok: Number(m.outTok) || 0,
        effort: typeof m.effort === 'string' ? m.effort.slice(0, 12) : '',
        kind: m.kind === 'digest' ? 'digest' : 'ask',
        at: Date.now()
      });
      return;
    }

    // 상담사를 부르는 중이라는 표시. 내용이 없으니 잠글 것도 없다.
    // 누른 사람만 기다림 표시를 보면 나머지는 왜 조용한지 모른다.
    if (m.t === 'think') {
      togetherSend(roomId, { t: 'think', name: myName, on: !!m.on, at: Date.now() });
      return;
    }

    if (m.t === 'ping') {
      try { sock.send(JSON.stringify({ t: 'pong' })); } catch (_e) {}
    }
  };

  const bye = () => {
    if (!roomId) return;
    const r = togetherRooms.get(roomId);
    if (!r) return;
    r.socks.delete(sock);
    r.names.delete(sock);
    togetherSend(roomId, { t: 'left', name: myName, members: togetherMembers(r), at: Date.now() });
    togetherSweep(roomId);
  };
  sock.onclose = bye;
  sock.onerror = bye;

  return response;
}

async function handleTogetherPost(request, echoOrigin) {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!roomRateOk(ip)) {
    return jsonError(429, '잠시 뒤에 다시 시도해 주세요.', echoOrigin);
  }

  let body;
  try { body = await request.json(); } catch (_e) {
    return jsonError(400, '요청 형식이 올바르지 않습니다.', echoOrigin);
  }

  if (!(await counselTokenOk(body.token))) {
    return jsonError(403, '이용 권한이 없습니다. 비밀번호를 다시 넣어 주세요.', echoOrigin);
  }

  const roomId = body.room;
  if (!togetherIdOk(roomId)) return jsonError(400, '방 번호가 올바르지 않습니다.', echoOrigin);

  // ---- 기록 불러오기: 잠긴 덩어리를 그대로 돌려준다 ----
  if (body.op === 'load') {
    const kv = await togetherStore();
    if (!kv) return new Response(JSON.stringify({ blob: null }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(echoOrigin) }
    });
    let got = null;
    try { got = (await kv.get(['together', roomId])).value; } catch (_e) { got = null; }
    return new Response(JSON.stringify({ blob: got ? got.blob : null, at: got ? got.at : null }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(echoOrigin) }
    });
  }

  // ---- 기록 저장: 내용을 볼 수 없는 채로 넣는다 ----
  if (body.op === 'save') {
    const blob = typeof body.blob === 'string' ? body.blob : '';
    if (!blob || blob.length > TOGETHER_BLOB_MAX) {
      return jsonError(400, '기록이 비었거나 너무 큽니다.', echoOrigin);
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(blob)) {
      return jsonError(400, '기록 형식이 올바르지 않습니다.', echoOrigin);
    }
    const kv = await togetherStore();
    if (!kv) return jsonError(503, '이 서버에서는 기록 보관을 쓸 수 없습니다.', echoOrigin);
    try {
      await kv.set(['together', roomId], { blob, at: new Date().toISOString() }, { expireIn: TOGETHER_TTL_MS });
    } catch (_e) {
      return jsonError(500, '기록을 저장하지 못했습니다.', echoOrigin);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(echoOrigin) }
    });
  }

  // ---- 기록 접기: 오래된 대화를 요약으로 압축한다 ----
  //      평문이 지나지만 저장하지 않는 것은 상담사 호출과 같다.
  if (body.op === 'digest') {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return jsonError(500, '서버에 API 키가 설정되지 않았습니다.', echoOrigin);

    const r = togetherRoom(roomId);
    if (!togetherAskOk(r)) {
      return jsonError(429, '잠시 뒤에 다시 시도해 주세요.', echoOrigin);
    }

    const src = typeof body.text === 'string' ? body.text.slice(0, 200000) : '';
    if (!src.trim()) return jsonError(400, '요약할 내용이 없습니다.', echoOrigin);

    const out = await askAnthropic(
      apiKey, [{ type: 'text', text: TOGETHER_DIGEST_PROMPT }],
      [{ role: 'user', content: src }],
      TOGETHER_DIGEST_TOKENS, TOGETHER_DIGEST_EFFORT);

    if (out.error) return jsonError(502, '요약하지 못했습니다.', echoOrigin);
    return new Response(JSON.stringify({
      text: out.text, usage: out.usage, srcChars: src.length, outChars: out.text.length
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(echoOrigin) } });
  }

  // ---- 상담사 호출: 여기만 평문이 지난다. 지나갈 뿐 저장하지 않는다 ----
  if (body.op === 'ask') {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return jsonError(500, '서버에 API 키가 설정되지 않았습니다.', echoOrigin);

    const r = togetherRoom(roomId);
    if (!togetherAskOk(r)) {
      return jsonError(429, '이 방에서 상담사를 너무 자주 불렀습니다. 잠시 뒤에 다시 눌러 주세요.', echoOrigin);
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const messages = [];
    let totalChars = 0;
    for (const m of incoming.slice(-TOGETHER_MAX_HISTORY)) {
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      const text = typeof m.content === 'string' ? m.content : '';
      if (!text) continue;
      const clipped = text.slice(0, MAX_CHARS_PER_MSG);
      totalChars += clipped.length;
      if (totalChars > TOGETHER_MAX_CHARS) break;
      messages.push({ role: m.role, content: clipped });
    }
    if (!messages.length) return jsonError(400, '보낼 내용이 없습니다.', echoOrigin);
    if (messages[messages.length - 1].role !== 'user') {
      return jsonError(400, '요청 형식이 올바르지 않습니다.', echoOrigin);
    }

    // 여러 명이면 부부상담 지시문을 얹고, 혼자면 고른 분야만 쓴다.
    // 개인상담(PRT·CBT)이 이 길을 함께 쓰므로 분야를 클라이언트가 정한다.
    const solo = body.solo === true;
    const modeId = solo ? body.mode : 'couple';
    const systemBlocks = [
      { type: 'text', text: BASE_PROMPT },
      { type: 'text', text: modeById(modeId).prompt }
    ];
    if (!solo) systemBlocks.push({ type: 'text', text: TOGETHER_PROMPT });

    const out = await askAnthropic(apiKey, systemBlocks, messages, TOGETHER_MAX_TOKENS, TOGETHER_EFFORT);
    if (out.error) {
      const msg = out.error === 'refusal'
        ? '이 내용에는 답하기 어렵습니다. 다른 방식으로 물어봐 주세요.'
        : '상담사를 부르지 못했습니다. ' + out.error;
      return jsonError(502, msg, echoOrigin);
    }
    return new Response(JSON.stringify({ text: out.text, usage: out.usage, effort: TOGETHER_EFFORT }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(echoOrigin) }
    });
  }

  return jsonError(400, '알 수 없는 요청입니다.', echoOrigin);
}

// 회차가 쌓이면 대화록이 상한을 넘는다. 그냥 앞부분을 버리면
// "지난번 그 얘기"를 기억하게 하려던 목적이 무너지므로 요약으로 접는다.
// 한 번 접은 요약은 브라우저가 보관해 두고 다시 쓰므로 호출은 회차당 한 번뿐이다.
const TOGETHER_DIGEST_PROMPT = [
  '당신은 상담 기록을 압축하는 서기다. 상담을 하지 말고 요약만 한다.',
  '',
  '아래는 한 부부(또는 집단)의 지난 상담 기록이다. 다음 상담에서 상담사가 읽고',
  '맥락을 되찾을 수 있도록 압축한다. 분량은 원문의 10분의 1 이하로 줄인다.',
  '',
  '# 반드시 남길 것',
  '- 참가자 각자가 반복해서 말한 것, 각자가 원한다고 밝힌 것',
  '- 서로 합의한 것과 아직 못 좁힌 것',
  '- 갈등이 커진 지점과 그때의 계기',
  '- 상담사가 제안했던 것과 그것을 해봤는지',
  '- 위기 신호(자해·폭력·학대)가 있었다면 반드시 그대로 남긴다',
  '',
  '# 버릴 것',
  '- 인사말, 잡담, 같은 말의 반복',
  '- 누가 몇 시에 무엇을 했는지 같은 사실 다툼의 세부',
  '',
  '# 형식',
  '- 이름을 그대로 쓴다. "남편"·"아내"로 바꾸지 않는다.',
  '- 항목 목록으로 쓴다. 서술형 문단으로 늘어놓지 않는다.',
  '- 판단하거나 편들지 않는다. 무슨 일이 있었는지만 적는다.',
  '- 앞선 요약이 함께 주어지면 그것과 새 기록을 하나로 합쳐 다시 쓴다.'
].join('\n');

// 여러 사람이 한 방에 있을 때만 얹는 지시. 1:1 상담과 가장 크게 다른 점은
// "누가 옳은지 가리지 않는다"이다. 판정을 시작하는 순간 진 쪽이 방을 나간다.
const TOGETHER_PROMPT = [
  '# 지금은 여러 사람이 한 방에 있는 공동 상담이다',
  '발언 앞에 누가 말했는지 이름이 붙어 온다. 각자를 다른 사람으로 대한다.',
  '',
  '- **누가 옳은지 가리지 않는다.** 판정을 요구받아도 하지 않는다.',
  '  대신 각자가 무엇을 원하고 무엇이 두려운지를 드러내 준다.',
  '- **한쪽 편을 들지 않는다.** 한 사람의 말을 받아 준 다음에는 반드시 다른 사람에게도 자리를 준다.',
  '- 방에 있는데 아직 말하지 않은 사람이 있으면 그 사람에게 물어본다.',
  '- 사실 다툼(누가 몇 시에 뭐라고 했는지)에 끌려가지 않는다. 기억이 다르면 다른 채로 두고 넘어간다.',
  '- 한 번에 3~5문장을 넘기지 않는다. 길게 정리해 주면 두 사람의 대화가 끊긴다.',
  '- 매번 결론을 내려 하지 않는다. 이 방의 주인은 참가자들이고 당신은 사이를 틔워 주는 역할이다.',
  '- 이혼·이별·헤어짐을 당신이 먼저 꺼내지 않는다. 참가자가 꺼내면 판단하지 말고 그 마음부터 듣는다.',
  '',
  '위기 신호(자해·자살·폭력·학대)는 공동 상담이라도 최우선이다. 공통 원칙대로 즉시 다룬다.',
  '가정폭력이 의심되면 함께 있는 자리에서 캐묻지 않는다. 안전을 먼저 확인하고,',
  '여성긴급전화 1366(24시간)을 알린다.'
].join('\n');

/* 접속 표 검사.
 *
 * COUNSEL_TOKEN_SHA 가 비어 있으면 검사하지 않는다 — 환경변수를 넣기 전에도
 * 서비스가 죽지 않게 하려는 것이다. 값을 넣는 순간부터 잠긴다.
 *
 * 웹앱의 화면 잠금은 문턱일 뿐이고 실제로 크레딧을 지키는 것은 여기다.
 * 텔레그램·카카오는 각자의 화이트리스트로 막으므로 이 검사를 지나지 않는다.
 */
async function counselTokenOk(token) {
  const want = Deno.env.get('COUNSEL_TOKEN_SHA');
  if (!want) return true;
  if (typeof token !== 'string' || !token) return false;
  return sameSecret(await sha256Hex('counsel:' + token), want);
}

function allowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonError(status, message, origin) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin || '*') }
  });
}

Deno.serve(async (request) => {
  // 텔레그램은 브라우저가 아니라 텔레그램 서버가 호출한다.
  // Origin 검사 대신 secret 헤더와 사용자 ID 화이트리스트로 막는다.
  if (request.method === 'POST' &&
      new URL(request.url).pathname.replace(/\/+$/, '') === '/telegram') {
    return await handleTelegram(request);
  }

  // 카카오도 서버가 호출한다. botUserKey 화이트리스트로 막는다.
  if (request.method === 'POST' &&
      new URL(request.url).pathname.replace(/\/+$/, '') === '/kakao') {
    return await handleKakao(request);
  }

  const origin = request.headers.get('Origin') || '';
  const allow = allowedOrigins();
  const originOk = allow.length === 0 || allow.includes(origin);
  const echoOrigin = originOk ? (origin || '*') : (allow[0] || '*');

  // 함께상담은 WebSocket 이라 POST 가 아니다. 아래 메서드 검사보다 먼저 가른다.
  if (new URL(request.url).pathname.replace(/\/+$/, '') === '/together' &&
      (request.headers.get('upgrade') || '').toLowerCase() === 'websocket') {
    return handleTogetherSocket(request, originOk);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(echoOrigin) });
  }
  if (request.method !== 'POST') {
    return jsonError(405, '지원하지 않는 요청입니다.', echoOrigin);
  }

  // 경로로 앱을 가른다. /room = AI 회의실, /triage = 구급대원, 그 외 = 마음톡 상담
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const isTriage = path === '/triage';
  if (!originOk) {
    return jsonError(403, '허용되지 않은 접근입니다.', echoOrigin);
  }

  // 회의실은 오픈라우터를 부르고 자기 키·자기 상한을 쓴다. 아래 상담 경로와 섞이면 안 된다.
  if (path === '/room') {
    return await handleRoom(request, echoOrigin);
  }

  if (path === '/together') {
    return await handleTogetherPost(request, echoOrigin);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return jsonError(500, '서버에 API 키가 설정되지 않았습니다.', echoOrigin);
  }

  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateOk(ip.split(',')[0].trim())) {
    return jsonError(429, '잠시 뒤에 다시 보내 주세요. 너무 빠르게 여러 번 보냈습니다.', echoOrigin);
  }

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonError(400, '요청 형식이 올바르지 않습니다.', echoOrigin);
  }

  if (!(await counselTokenOk(body.token))) {
    return jsonError(403, '이용 권한이 없습니다. 비밀번호를 다시 넣어 주세요.', echoOrigin);
  }

  // ---- 클라이언트 입력을 신뢰하지 않고 다시 만든다 ----
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = [];
  let totalChars = 0;

  for (const m of incoming.slice(-MAX_HISTORY)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const text = typeof m.content === 'string' ? m.content : '';
    if (!text) continue;
    const clipped = text.slice(0, MAX_CHARS_PER_MSG);
    totalChars += clipped.length;
    if (totalChars > MAX_TOTAL_CHARS) break;
    messages.push({ role: m.role, content: clipped });
  }

  if (messages.length === 0) return jsonError(400, '보낼 내용이 없습니다.', echoOrigin);
  if (messages[messages.length - 1].role !== 'user') {
    return jsonError(400, '요청 형식이 올바르지 않습니다.', echoOrigin);
  }

  const upstreamBody = {
    model: MODEL,
    max_tokens: isTriage ? TRIAGE_MAX_TOKENS : MAX_TOKENS,
    stream: true,
    system: cacheSystem(isTriage
      ? [{ type: 'text', text: TRIAGE_PROMPT }]
      : [
          { type: 'text', text: BASE_PROMPT },
          { type: 'text', text: modeById(body.mode).prompt }
        ]),
    // 응급 판단은 대충 넘길 일이 아니다. 상담보다 한 단계 올린다.
    // Opus 5 는 생각(thinking)이 기본으로 켜져 있다. effort 가 그 깊이를 정한다.
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    // 안전 분류기가 거절하면 서버가 알아서 다른 모델로 이어받는다.
    // 상담·응급은 민감한 주제라 대화가 통째로 끊기는 것을 막아야 한다.
    fallbacks: 'default',
    messages: cacheMessages(messages)
  };

  function callUpstream(withFallback) {
    const body = Object.assign({}, upstreamBody);
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION
    };
    if (withFallback) headers['anthropic-beta'] = FALLBACK_BETA;
    else delete body.fallbacks;
    return fetch(ANTHROPIC_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  let upstream;
  try {
    upstream = await callUpstream(true);
    // fallbacks 는 베타다. 서버가 거부하면 그것만 빼고 한 번 재시도한다.
    // 베타 하나 때문에 서비스 전체가 죽지 않게 하려는 것.
    if (!upstream.ok && upstream.status === 400) {
      const raw = await upstream.clone().text();
      if (/fallback|beta/i.test(raw)) upstream = await callUpstream(false);
    }
  } catch (_e) {
    return jsonError(502, '상담 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.', echoOrigin);
  }

  if (!upstream.ok) {
    // 오류일 때만 본문을 읽어 원인 코드를 뽑는다. 오류 응답에는 대화 내용이 없다.
    let why = '';
    try {
      const j = JSON.parse(await upstream.text());
      if (j && j.error) why = ' [' + (j.error.type || '?') + '] ' + String(j.error.message || '').slice(0, 200);
    } catch (_e) { /* JSON 이 아니면 상태 코드만 */ }

    const msg = upstream.status === 429
      ? '지금 이용자가 많습니다. 잠시 뒤 다시 보내 주세요.'
      : (upstream.status === 401 || upstream.status === 403)
        ? '서버 설정에 문제가 있습니다. (인증 ' + upstream.status + ')' + why
        : upstream.status === 400
          ? '요청을 처리하지 못했습니다.' + why
          : '서비스가 일시적으로 응답하지 않습니다. (' + upstream.status + ')';
    return jsonError(upstream.status === 429 ? 429 : 502, msg, echoOrigin);
  }

  // SSE 를 그대로 흘려보낸다. 내용은 읽지 않는다 = 기록도 남지 않는다.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(echoOrigin)
    }
  });
});
