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
    throw new Error(`Claude API 오류(${res.status}): ${errText.slice(0, 300)}`);
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

module.exports = { callClaude, isConfigured, getModel, extractJson };
