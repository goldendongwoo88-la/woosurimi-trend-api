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
async function callClaude({ system, messages, maxTokens = 2000, temperature = 0.8, timeoutMs } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
  if (!Array.isArray(messages) || !messages.length) throw new Error("messages가 비어 있습니다.");

  const res = await fetchWithTimeout(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages,
    }),
  }, timeoutMs);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(explain(res.status, errText));
  }
  const data = await res.json();
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

module.exports = { callClaude, isConfigured, getModel, extractJson, explain, checkCredit };
