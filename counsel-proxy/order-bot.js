/**
 * 이야기공방 주문봇 — 카카오톡 채널로 게임 주문 정보를 받아 주는 Deno 서버
 *
 * 마음톡 프록시(deno-proxy.js)와 별개의 Deno Deploy 프로젝트로 배포한다.
 * 상담봇은 본인 전용(화이트리스트)이지만, 주문봇은 **모르는 손님을 상대**하므로
 * 비용 구조가 다르다: 싼 모델 + 짧은 답 + 사용자별 일일 상한으로 막는다.
 *
 * 흐름 (docs/order-schema.md 의 정본을 따른다):
 *   손님 "주문" → 인터뷰(한 번에 질문 하나) → 요약 확인 → <ORDER>{JSON}</ORDER>
 *   → 서버가 JSON 을 떼어 판매자 텔레그램으로 전송, 손님에겐 접수 안내만 보인다.
 *
 * 원칙 (deno-proxy.js 와 동일):
 *   - 대화를 서버에 저장하지 않는다(메모리뿐, 재시작하면 사라진다).
 *     주문 내용은 완성된 JSON 하나만 텔레그램으로 나간다.
 *   - console.log 로 대화 본문을 찍지 않는다.
 *   - 최후의 방어선은 Anthropic 콘솔의 지출 상한이다.
 *
 * 환경변수 (Deno Deploy Settings):
 *   ANTHROPIC_API_KEY   필수
 *   TELEGRAM_TOKEN      주문 수신용 (마음톡 봇과 같은 토큰을 써도 된다)
 *   ORDER_NOTIFY_CHAT   주문 JSON 을 받을 텔레그램 chat id (본인 ID)
 *
 * 카카오 등록 절차는 파일 끝의 주석 참고.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// ---- 비용 상한 (여기 숫자가 곧 청구서다) ----
// 인터뷰는 "다음 질문 하나"만 만들면 되므로 Haiku 로 충분하다.
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 900;             // 질문은 짧다. 마지막 JSON 출력만 길다.
const MAX_CHARS_PER_MSG = 1500;     // 손님 입력 상한 (장면 사연이 들어오므로 여유)
const MAX_HISTORY = 60;             // 인터뷰가 길다 (질문 ~25개 왕복)
const DAILY_LIMIT = 80;             // 사용자별 하루 메시지 상한 — 인터뷰 1.5회 분량
const RATE_LIMIT = 6;               // IP 당 60초 6회
const RATE_WINDOW_MS = 60000;

const KAKAO_MAX_CHARS = 1000;

// ---- 인터뷰 지능 ----
const ORDER_PROMPT = [
  '당신은 「이야기공방」의 주문 접수 도우미다. 이야기공방은 고객의 실제 이야기(커플·프러포즈·부모님',
  '환갑·정년 기념·자서전)를 받아 직접 플레이하는 도트 게임으로 만들어 주는 곳이다.',
  '고객은 카카오톡 채널로 말을 걸어왔다. 당신의 일은 제작에 필요한 정보를 빠짐없이,',
  '기분 좋게 받아 내는 것이다.',
  '',
  '# 대화 원칙',
  '- 한 번에 질문 하나만 한다. 답이 짧아도 재촉하지 않는다.',
  '- 답변은 2~4문장. 카카오톡 말풍선이므로 길게 쓰지 않는다.',
  '- 고객의 이야기에 짧게 반응해 준다("아, 자판기 커피로 시작된 거네요!"). 다만 과하게 늘어놓지 않는다.',
  '- 뭘 적어야 할지 모르는 고객에게는 예시를 하나 들어 준다.',
  '- 게임을 아직 안 해 본 고객에게는 데모 링크를 안내한다: (채널 소개글의 「봄날, 두 사람」)',
  '',
  '# 받아야 하는 정보 (이 순서대로. * 는 필수)',
  '1* 게임 유형: 커플/프러포즈/부모님(환갑·칠순·금혼)/정년·명퇴/친구/자서전/기타',
  '2* 받는 분 (호칭 포함)',
  '3  전달하고 싶은 날짜',
  '4* 게임 잠금 비밀번호 4자리 (숫자 4개인지 확인)',
  '5  게임 제목 (없으면 "제작자가 제안"으로)',
  '6* 등장인물 2~6명 — 각각: 이름/관계/성격 한 줄/겉모습(머리·옷 색 하나라도)/말버릇',
  '7* 장소 5~7곳 — 각각: 이름/의미 한 줄/사진 제공 여부',
  '8* 장면 3~7개, 시간순 — 각각: 언제어디서/무슨 일(3~5문장)/꼭 들어갈 대사/톤(뭉클·코믹·담백·맡김)/미니게임(넣기·빼기·맡김)',
  '9  미니게임 취향: 퍼즐/박자/비행/선택지/쌓기/맡김',
  '10* 엔딩 메시지 (2~4줄, 크레딧에 그대로 나감) + 만든 사람 표기',
  '11 음악: 기본 제공 / 직접 준비(권리 있는 음원만)',
  '12* 동의 5개: 초상(실명·사진 당사자 동의)/민감정보 미포함/타인 저작물 불가 이해/수정 3회/전달 방식·사진 2주 후 삭제',
  '13* 연락처 (채널 대화명 또는 이메일)',
  '',
  '# 규칙',
  '- 비밀번호가 숫자 4자리가 아니면 다시 받는다.',
  '- 장면이 3개 미만이면 "짧아도 좋으니 하나만 더"라고 권한다. 7개를 넘으면 프리미엄 상담으로 안내하고 7개까지만 받는다.',
  '- 사진 파일은 지금 받지 않는다. "접수 후 이 채널 1:1 대화로 보내 주시면 됩니다"라고 안내한다.',
  '- 유명 가수의 가사, 남의 캐릭터·상표를 넣어 달라는 요청은 정중히 불가를 알리고 대안(곡 제목 언급, 비슷한 분위기)을 제안한다.',
  '- 주민번호·주소·계좌 같은 민감정보가 들어오면 받지 말고 지워 달라고 안내한다.',
  '- 진행 상황을 가끔 알려 준다: "이제 절반 왔어요! 다음은 장면 이야기예요."',
  '',
  '# 마무리',
  '필수 항목이 다 차면: ① 전체 요약을 보여주고 "이대로 접수할까요?"를 묻는다.',
  '② 고객이 확인하면, 답변 맨 끝에 아래 형식으로 주문서를 붙인다 (고객에게는 보이지 않는다):',
  '<ORDER>{"version":1,"type":"...","recipient":"...","deadline":null,"password":"....","title":null,',
  '"characters":[{"name":"...","relation":"...","personality":"...","look":"...","catchphrase":"..."}],',
  '"places":[{"name":"...","meaning":"...","photo":true}],',
  '"scenes":[{"when_where":"...","what":"...","must_include":["..."],"tone":"warm|comic|plain|any","minigame":"yes|no|auto"}],',
  '"minigame_prefs":["..."],"ending":{"message":"...","photo":false,"maker":"..."},',
  '"music":"default","consents":{"portrait":true,"no_sensitive":true,"no_ip":true,"revisions":true,"delivery":true},',
  '"contact":"...","note":null}</ORDER>',
  '③ JSON 은 반드시 한 줄, 유효한 JSON. 고객이 안 준 선택 항목은 null.',
  '④ <ORDER> 는 고객이 최종 확인한 뒤 딱 한 번만 출력한다.',
  '',
  '# 하지 않는 것',
  '- 가격 흥정·결제. "결제와 일정은 접수 후 채널 1:1 대화로 안내드려요"라고만 한다.',
  '- 제작 기간 확약. "보통 영업일 5~7일"까지만.',
  '- 주문과 무관한 잡담이 길어지면 부드럽게 인터뷰로 돌아온다.',
  '- 사람인 척하지 않는다. 물으면 AI 접수 도우미라고 밝힌다.'
].join('\n');

const HELLO = [
  '안녕하세요, 이야기공방입니다 🌸',
  '두 분(또는 가족·친구)의 실제 이야기를 직접 플레이하는 도트 게임으로 만들어 드려요.',
  '',
  '· 데모 게임을 먼저 보고 싶으시면 "데모"',
  '· 바로 주문 정보를 남기시려면 "주문"',
  '· 진행 중 대화를 지우려면 "새로"',
  '라고 보내 주세요.'
].join('\n');

// ---- 상태 (메모리뿐 — 저장하지 않는다) ----
const chats = new Map();     // userKey -> { history: [], day: 'YYYY-MM-DD', count: n }
const hits = new Map();      // ip -> [ts]

function rateOk(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) { if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k); }
  return true;
}

function today() { return new Date().toISOString().slice(0, 10); }

// ---- 카카오 응답 도우미 (deno-proxy.js 와 같은 방식) ----
function kakaoText(text) {
  const outputs = [];
  const t = String(text || '').trim() || '답변이 비어 있습니다.';
  for (let i = 0; i < t.length && outputs.length < 3; i += KAKAO_MAX_CHARS) {
    outputs.push({ simpleText: { text: t.slice(i, i + KAKAO_MAX_CHARS) } });
  }
  return { version: '2.0', template: { outputs } };
}
function kakaoJson(payload) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
async function kakaoPushCallback(callbackUrl, text) {
  try {
    await fetch(callbackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kakaoText(text)) });
  } catch (_e) { /* 콜백 URL 은 5분·1회용 */ }
}

// ---- Claude 호출 (스트리밍 불필요 — 완성문을 콜백으로 보낸다) ----
async function askClaude(apiKey, messages) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS,
      system: [{ type: 'text', text: ORDER_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages
    })
  });
  if (!res.ok) return { error: '(' + res.status + ')' };
  const j = await res.json();
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (j.stop_reason === 'refusal') return { error: 'refusal' };
  return { text: text.trim() };
}

// ---- 완성된 주문서를 판매자에게 전달 ----
async function notifySeller(orderJson, userKey) {
  const token = Deno.env.get('TELEGRAM_TOKEN');
  const chat = Deno.env.get('ORDER_NOTIFY_CHAT');
  if (!token || !chat) return false;
  const head = '🌸 새 주문 접수 (' + today() + ')\nuserKey(카카오 1:1 대조용): ' + userKey + '\n\n';
  // 텔레그램 한 메시지 상한(4096)에 맞춰 나눈다
  const body = head + orderJson;
  try {
    for (let i = 0; i < body.length; i += 3500) {
      await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: body.slice(i, i + 3500) })
      });
    }
    return true;
  } catch (_e) { return false; }
}

// ---- 본 처리 ----
async function handleOrder(request) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return kakaoJson(kakaoText('서버 설정이 아직 안 됐습니다.'));

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  if (!rateOk(ip)) return kakaoJson(kakaoText('잠시 뒤에 다시 보내 주세요.'));

  let body;
  try { body = await request.json(); } catch (_e) { return kakaoJson(kakaoText('요청을 이해하지 못했습니다.')); }
  const ur = (body && body.userRequest) || {};
  const utterance = String(ur.utterance || '').trim();
  const userKey = String((ur.user && ur.user.id) || '');
  const callbackUrl = ur.callbackUrl;
  if (!utterance) return kakaoJson(kakaoText('내용을 입력해 주세요.'));
  if (utterance.length > MAX_CHARS_PER_MSG) return kakaoJson(kakaoText('한 번에 ' + MAX_CHARS_PER_MSG + '자까지만 보낼 수 있어요. 나눠서 보내 주세요.'));

  // 명령
  if (['안녕', '안녕하세요', 'hi', '시작', '도움', '도움말'].includes(utterance)) return kakaoJson(kakaoText(HELLO));
  if (['새로', '초기화', '/새로'].includes(utterance)) { chats.delete(userKey); return kakaoJson(kakaoText('대화를 지웠습니다. "주문"이라고 보내면 처음부터 시작해요.')); }
  if (utterance === '데모') return kakaoJson(kakaoText('데모 게임 「봄날, 두 사람」입니다. 체험판 비밀번호는 0000이에요.\n(채널 소개글의 링크에서 열어 보세요)\n\n다 보시고 "주문"이라고 보내 주시면 시작합니다!'));

  // 사용자별 일일 상한
  let st = chats.get(userKey);
  if (!st || st.day !== today()) st = { history: [], day: today(), count: 0 };
  if (st.count >= DAILY_LIMIT) return kakaoJson(kakaoText('오늘 대화가 많았어요! 내일 이어서 해요. (작성하시던 내용이 걱정되면 채널 1:1 대화로 남겨 주세요)'));
  st.count++;

  st.history.push({ role: 'user', content: utterance });
  if (st.history.length > MAX_HISTORY) st.history = st.history.slice(-MAX_HISTORY);
  chats.set(userKey, st);

  const finish = async () => {
    const out = await askClaude(apiKey, st.history);
    if (out.error || !out.text) { st.history.pop(); return '답변을 만들지 못했어요. 잠시 뒤 다시 보내 주세요.'; }
    let text = out.text;
    // 주문서 블록 추출 → 판매자 전송 → 고객 화면에서는 제거
    const m = text.match(/<ORDER>([\s\S]*?)<\/ORDER>/);
    if (m) {
      let ok = false;
      try { JSON.parse(m[1]); ok = true; } catch (_e) { /* 깨진 JSON 은 그대로 두면 다음 턴에 재시도된다 */ }
      if (ok) {
        const sent = await notifySeller(m[1].trim(), userKey);
        text = text.replace(m[0], '').trim();
        text += sent
          ? '\n\n📋 접수 완료! 결제와 일정은 이 채널 1:1 대화로 곧 안내드릴게요. 사진도 그때 보내 주시면 됩니다. 감사합니다 🌸'
          : '\n\n접수 내용을 전달하는 데 문제가 생겼어요. 채널 1:1 대화로 "접수 확인 부탁드려요"라고 남겨 주세요.';
      }
    }
    st.history.push({ role: 'assistant', content: out.text });   // 봇 기억에는 원문(JSON 포함) 유지
    return text;
  };

  if (!callbackUrl) {
    const text = await finish();
    return kakaoJson(kakaoText(text));
  }
  (async () => { await kakaoPushCallback(callbackUrl, await finish()); })();
  return kakaoJson({ version: '2.0', useCallback: true, data: { text: '적고 있어요…' } });
}

Deno.serve(async (request) => {
  if (request.method === 'POST' && new URL(request.url).pathname.replace(/\/+$/, '') === '/order') {
    return await handleOrder(request);
  }
  return new Response('ok', { status: 200 });
});

/* =====================================================================
 * 카카오톡 채널 등록 절차 (한 번만)
 *
 * 0. ⚠️ 겸직허가 전에는 채널을 '비공개'로 두고 본인 테스트만 한다.
 *    가격 표시·결제 유도도 하지 않는다 (docs/custom-game-business.md §0).
 *
 * 1. Deno Deploy 에 이 파일로 새 프로젝트를 만든다 (마음톡 프록시와 별도).
 *    Settings 에 환경변수 3개: ANTHROPIC_API_KEY / TELEGRAM_TOKEN / ORDER_NOTIFY_CHAT.
 *    ORDER_NOTIFY_CHAT = 마음톡 텔레그램 봇에서 내 chat id (봇에 아무 말이나 보내면
 *    미등록 안내에 ID가 나온다. 이미 등록돼 있으면 TELEGRAM_ALLOWED_IDS 의 그 값).
 *
 * 2. business.kakao.com → 카카오톡 채널 만들기 (예: "이야기공방").
 *    프로필 소개글에 데모 링크를 적는다: https://woo-design22.github.io/love-rpg/
 *
 * 3. i.kakao.com (카카오 i 오픈빌더) → 봇 만들기 → 위 채널과 연결.
 *
 * 4. 봇 설정 → 스킬 → 새 스킬:
 *    URL = https://<프로젝트이름>.deno.dev/order
 *
 * 5. 시나리오 → 폴백 블록 → 응답 추가 → 스킬데이터 → 위 스킬 선택.
 *    (폴백 블록 = 어떤 발화든 이 스킬로 들어온다)
 *    봇 설정 → AI 챗봇 전환/콜백 설정에서 **Callback 사용 신청**을 켠다.
 *    콜백 승인 전에도 동작은 하지만, 답이 5초를 넘으면 잘린다.
 *
 * 6. 배포 탭 → 배포. 채널 관리자센터에서 채널 공개(겸직허가 후).
 *
 * 7. 손님 흐름: 채널 추가 → "주문" → 인터뷰 → 접수 → 내 텔레그램에 JSON 도착
 *    → love-rpg 템플릿 복제 → JSON 주입 제작 (docs/order-schema.md).
 * ===================================================================== */
