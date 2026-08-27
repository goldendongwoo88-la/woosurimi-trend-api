// Anthropic Claude API 공용 클라이언트입니다. "AI 자동화 글쓰기"(blogWriter.js)와
// "맞춤형 글쓰기 프롬프트"(promptStudio.js)가 같은 API 키/모델 설정을 함께 씁니다.
//
// ⚠️ 서버에 ANTHROPIC_API_KEY가 없으면 isConfigured()가 false를 돌려주고, 이걸 부르는
// 쪽에서 (AI 성우 TTS와 같은 원칙으로) 에러로 죽는 대신 "키가 없어서 이 기능은 지금
// 못 쓴다"는 걸 사용자에게 안내하도록 되어 있습니다.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getModel() {
  return DEFAULT_MODEL;
}

// 기본 45초로는 부족한 요청이 있습니다 — "맞춤형 글쓰기 프롬프트"의 긴 클로드 스킬 카드
// (방송이슈·연예인 가십 등)는 시스템 프롬프트가 수만 자인 데다 제목 45~50개를 한 번에
// 뽑기 때문에, 실제로 45초를 넘겨 중간에 끊기는 걸 확인했습니다. 호출하는 쪽에서
// timeoutMs를 올려 잡을 수 있게 두고, 기본값만 유지합니다.
async function fetchWithTimeout(url, opts = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * API 오류를 사람이 읽을 수 있는 말로 바꿉니다.
 *
 * ⚠️ 예전에는 이렇게 던졌습니다:
 *   Claude API 오류(400): {"type":"error","error":{"type":"invalid_request_error",
 *   "message":"Your credit balance is too low to access the Anthropic API..."}}
 * 이게 그대로 손님 화면에 떴습니다. 영어 JSON 덩어리를 보고 뭘 어쩌라는 건지
 * 알 수가 없습니다. 무엇보다 **무엇을 해야 풀리는지**가 안 보입니다.
 *
 * 실제로 크레딧이 떨어져서 이 오류가 났습니다. 그때 알았습니다.
 */
function explain(status, raw) {
  let msg = "";
  try { msg = (JSON.parse(raw).error || {}).message || ""; } catch { msg = String(raw || ""); }

  if (/credit balance is too low|insufficient.*credit/i.test(msg)) {
    return "AI 크레딧이 떨어졌습니다. 사장님이 Anthropic 계정에서 충전하셔야 다시 됩니다. (콘솔 → Plans & Billing)";
  }
  if (status === 401 || /authentication|invalid x-api-key/i.test(msg)) {
    return "AI 열쇠(API 키)가 맞지 않습니다. 서버의 ANTHROPIC_API_KEY를 확인해 주세요.";
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return "AI가 지금 몰려 있습니다. 30초쯤 뒤에 다시 해주세요.";
  }
  if (status === 529 || /overloaded/i.test(msg)) {
    return "AI 쪽이 잠깐 붐빕니다. 조금 뒤에 다시 해주세요.";
  }
  if (/max_tokens|too long|context.*length/i.test(msg)) {
    return "글이 너무 깁니다. 조금 줄여서 다시 해주세요.";
  }
  return `AI를 못 불렀습니다 (${status}). ${msg.slice(0, 160)}`;
}

/** 크레딧이 남아 있는지 실제로 두드려 봅니다. 아주 짧게 물어서 값이 거의 안 나갑니다. */
async function checkCredit(timeoutMs = 12000) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, why: "서버에 AI 열쇠가 없습니다." };
  try {
    await callClaude({ messages: [{ role: "user", content: "." }], maxTokens: 1, timeoutMs });
    return { ok: true };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

/**
 * messages: [{ role: "user" | "assistant", content: "..." }]
 * system: (선택) 시스템 프롬프트
 * 반환: 어시스턴트가 만든 텍스트(string)
 */
/**
 * 시스템 프롬프트가 길면 **캐시**를 겁니다.
 *
 * ⚠️ 이게 왜 중요한가 — 돈이 여기서 나갑니다.
 * 스킬 프롬프트를 재보니 8,766토큰(fashion-review)에서
 * 64,619토큰(intro-promo)까지 됩니다. 그걸 **부를 때마다 통째로** 보냅니다.
 * 원고 한 편에 큰 스킬은 330원쯤 나갑니다.
 *
 * 그런데 이 프롬프트는 **매번 똑같습니다.** 손님이 열 명이면 똑같은 6만 토큰을
 * 열 번 보내고 열 번 값을 냅니다.
 *
 * 캐시를 걸면:
 *   처음 한 번  — 값의 1.25배 (캐시에 넣는 값)
 *   그 뒤 5분간 — 값의 0.1배  ← 10분의 1
 * 손님이 몰릴수록 더 아낍니다.
 *
 * ⚠️ 1,024토큰(약 700자)보다 짧으면 캐시가 안 걸립니다. 그럴 땐 그냥 보냅니다.
 */
const CACHE_MIN_CHARS = 800;

/**
 * ⚠️ 기본 캐시는 **5분**만 삽니다. 그런데 스킬은 7단계를 사람이 하나씩 밟습니다.
 * 제목 45개를 읽고 고르는 데만 5분이 넘어갑니다. 그러면 캐시가 죽고
 * 6만 토큰을 다시 제값 주고 보냅니다.
 *
 * 1시간짜리 캐시를 씁니다. 넣는 값이 2배지만(5분짜리는 1.25배), 7단계를
 * 30분에 걸쳐 밟으면 훨씬 쌉니다.
 *
 * ⚠️ 이건 베타 기능이라 안 될 수도 있습니다. 안 되면 5분짜리로 물러섭니다.
 * 여기서 실패하면 모든 AI 기능이 멈추기 때문에, 반드시 되돌아갈 길을 둡니다.
 */
const LONG_TTL_HEADER = "extended-cache-ttl-2025-04-11";
let longTtlWorks = true;   // 한 번 거절당하면 끕니다

/**
 * ⚠️ 1시간 캐시가 늘 이득인 게 아닙니다. 계산해봤습니다.
 * (55,000토큰 프롬프트, 입력 쪽만, 1달러 1,380원)
 *
 *   부르는 횟수   캐시없음    5분캐시    1시간캐시
 *      1번          228원      285원       455원   ← 5분이 171원 쌈
 *      7번        1,594원      421원       592원   ← 5분이 171원 쌈
 *
 * 1시간 캐시는 **넣는 값이 2배**(5분은 1.25배)라 항상 171원을 더 냅니다.
 *
 * 그런데 5분 캐시는 **5분 안에 다 불러야** 저 값입니다.
 * 7단계를 30분에 걸쳐 밟으면 5분 캐시는 계속 죽습니다:
 *   5분캐시가 매번 죽으면  1,992원
 *   1시간캐시로 살아있으면   592원   ← 1,400원 차이
 *
 * 그래서 **부르는 방식으로 골라야** 합니다.
 *   한 번 부르고 마는 것 (제목 뽑기, 자동 서식, 썸네일) → 5분
 *   사람이 천천히 밟는 것 (스킬 7단계)                → 1시간
 *
 * ⚠️ 다른 대화창(증권사 에이전트)이 짚어준 것입니다.
 * 거기는 2~3분 간격 배치라 5분이 맞고, 여기는 손님이 띄엄띄엄 불러서 다릅니다.
 * 같은 캐시라도 쓰는 방식이 다르면 답이 다릅니다.
 */
function buildSystem(system, cacheMode) {
  if (!system) return {};
  const text = String(system);
  if (text.length < CACHE_MIN_CHARS) return { system: text };
  const cc = cacheMode === "long" && longTtlWorks
    ? { type: "ephemeral", ttl: "1h" }
    : { type: "ephemeral" };
  return { system: [{ type: "text", text, cache_control: cc }] };
}

/** 마지막 호출에서 캐시가 얼마나 먹혔는지 — 화면에서 보여줄 때 씁니다. */
let lastUsage = null;
function getLastUsage() { return lastUsage; }

async function callClaude({ system, messages, maxTokens = 2000, temperature = 0.8, timeoutMs, cache, feature } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
  if (!Array.isArray(messages) || !messages.length) throw new Error("messages가 비어 있습니다.");

  const res = await fetchWithTimeout(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // 1시간 캐시는 베타라 머리글이 필요합니다. 5분짜리는 안 붙입니다.
      ...(cache === "long" && longTtlWorks ? { "anthropic-beta": LONG_TTL_HEADER } : {}),
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...buildSystem(system, cache),
      messages,
    }),
  }, timeoutMs);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // ⚠️ 1시간 캐시가 거절당하면 **한 번만** 5분짜리로 다시 해봅니다.
    // 여기서 그냥 죽으면 AI 기능이 통째로 멈춥니다. 베타 기능 하나 때문에요.
    if (cache === "long" && longTtlWorks && /ttl|beta|cache_control/i.test(errText)) {
      longTtlWorks = false;
      console.warn("[claude] 1시간 캐시를 못 써서 5분짜리로 물러섭니다.");
      return callClaude({ system, messages, maxTokens, temperature, timeoutMs, cache: "short", feature });
    }
    throw new Error(explain(res.status, errText));
  }
  const data = await res.json();

  // ⚠️ 얼마나 썼는지 기록해 둡니다. 캐시가 정말 먹히는지 눈으로 봐야 압니다.
  // 안 그러면 "캐시 넣었습니다"라고 말만 하고 실제로는 안 될 수 있습니다.
  const u = data.usage || {};
  lastUsage = {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    at: Date.now(),
  };
  lastUsage.cached = lastUsage.cacheRead > 0;
  // 값 어림잡기 (Sonnet 기준, 100만 토큰당 입력 $3 / 출력 $15 / 캐시읽기 $0.30 / 캐시쓰기 $3.75)
  lastUsage.usd = +(
    (lastUsage.input * 3 + lastUsage.output * 15 + lastUsage.cacheRead * 0.3 + lastUsage.cacheWrite * 3.75) / 1e6
  ).toFixed(4);

  // ⚠️ 여기 한 군데에서 기록하면 **모든 기능이 자동으로** 잡힙니다.
  // 기능마다 따로 적으면 언젠가 하나를 빠뜨리고, 그러면 그 기능만 값이 안 보입니다.
  // 안 보이는 기능이 하필 제일 비싼 기능일 수 있습니다.
  try { require("./spend").record(feature, lastUsage); } catch {}

  return (data.content || []).map((b) => b.text || "").join("\n");
}

// Claude가 ```json ... ``` 코드블록으로 감싸서 줄 때가 있어서, 있으면 벗겨내고 파싱합니다.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude 응답에서 JSON을 찾지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1));
}

module.exports = { callClaude, isConfigured, getModel, extractJson, explain, checkCredit, getLastUsage, buildSystem };
