/**
 * 마음톡 API 프록시 — Deno Deploy 판
 *
 * Cloudflare Worker 판(worker.js)과 기능은 같다. 옮긴 이유는 하나다:
 * Anthropic 이 Cloudflare Worker 에서 나가는 요청을 403 forbidden
 * ("Request not allowed") 으로 차단했다. 같은 키로 다른 경로에서는 통과한다.
 *
 * 설계 원칙 (worker.js 와 동일 — 바꾸기 전에 반드시 읽을 것)
 * ------------------------------------------------------------------
 * 1. 대화 내용을 절대 저장·기록하지 않는다.
 *    정신건강 상담 내용은 개인정보보호법상 민감정보다. 이 프록시는 요청을
 *    그대로 흘려보내기만 하므로 보관 의무 대부분이 발생하지 않는다.
 *    console.log 로 요청 본문을 찍는 순간 이 설계가 무너진다.
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
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// ---- 비용 상한 (여기 숫자가 곧 청구서다) ----
const MODEL = 'claude-opus-5';     // 서버가 고정한다. 클라이언트가 못 바꾼다.
const EFFORT = 'high';             // low < medium < high < xhigh < max
                                   // xhigh 는 체감 차이 대비 비용이 커서 high 로 둔다
// max_tokens 는 "생각 + 답변"을 합친 천장이다. xhigh 는 생각을 많이 하므로
// 넉넉히 줘야 답변이 중간에 잘리지 않는다. 실제 청구는 생성한 만큼만 된다.
// 답변 길이는 max_tokens 가 아니라 프롬프트의 "3~5문장" 지시가 잡는다.
const MAX_TOKENS = 8000;
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

const BASE_PROMPT = [
  '당신은 한국어로 상담하는 심리상담사다. 인간중심상담(로저스), 인지행동치료(CBT),',
  '수용전념치료(ACT), 해결중심 단기상담(SFBT), 동기면담(MI), 정서중심치료(EFT),',
  '애착이론과 발달심리를 모두 훈련받았다.',
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
async function askAnthropic(apiKey, systemBlocks, messages, maxTokens) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    stream: true,
    system: systemBlocks,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    fallbacks: 'default',
    messages
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
        if (j.type === 'message_delta' && j.delta && j.delta.stop_reason === 'refusal') refused = true;
      } catch (_e) { /* 조각난 줄은 버린다 */ }
    }
  }
  if (refused) return { error: 'refusal' };
  return { text: text.trim() };
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
    ? [{ type: 'text', text: TRIAGE_PROMPT, cache_control: { type: 'ephemeral' } }]
    : [
        { type: 'text', text: BASE_PROMPT, cache_control: { type: 'ephemeral' } },
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
    return kakaoJson(kakaoText('이 봇은 개인용입니다.'));
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
    ? [{ type: 'text', text: TRIAGE_PROMPT, cache_control: { type: 'ephemeral' } }]
    : [
        { type: 'text', text: BASE_PROMPT, cache_control: { type: 'ephemeral' } },
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

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(echoOrigin) });
  }
  if (request.method !== 'POST') {
    return jsonError(405, '지원하지 않는 요청입니다.', echoOrigin);
  }

  // 경로로 앱을 가른다. /triage = 구급대원, 그 외 = 마음톡 상담
  const isTriage = new URL(request.url).pathname.replace(/\/+$/, '') === '/triage';
  if (!originOk) {
    return jsonError(403, '허용되지 않은 접근입니다.', echoOrigin);
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
    system: isTriage
      ? [{ type: 'text', text: TRIAGE_PROMPT, cache_control: { type: 'ephemeral' } }]
      : [
          { type: 'text', text: BASE_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: modeById(body.mode).prompt }
        ],
    // 응급 판단은 대충 넘길 일이 아니다. 상담보다 한 단계 올린다.
    // Opus 5 는 생각(thinking)이 기본으로 켜져 있다. effort 가 그 깊이를 정한다.
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    // 안전 분류기가 거절하면 서버가 알아서 다른 모델로 이어받는다.
    // 상담·응급은 민감한 주제라 대화가 통째로 끊기는 것을 막아야 한다.
    fallbacks: 'default',
    messages
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
