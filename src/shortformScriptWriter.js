// 블로그 원문을 "숏폼 대본"으로 다시 쓰는 모듈입니다.
//
// 블로그 본문 문장을 그대로 자막으로 쓰면(예전 방식) 문어체라 숏폼에서 어색하고,
// 문장이 길어서 화면을 다 가립니다. 그래서 여기서 두 가지를 만듭니다:
//
//   1) hook  — 영상 내내 화면 "상단"에 고정으로 붙는 후킹 문구 (유튜브 쇼츠 썸네일
//              문구처럼 짧고 궁금하게. 예: "논란이라는 100만 인플루언서 '실물'")
//   2) lines — 장면마다 화면 "하단"에 바뀌면서 나오는 구어체 멘트
//              (친구한테 말해주듯이. 예: "실물 목격담이 단 1도 없었음")
//
// ANTHROPIC_API_KEY가 있으면 Claude가 원문을 읽고 실제로 다시 써주고, 없거나 실패하면
// 규칙 기반 폴백으로 최소한 문어체(~습니다)를 구어체(~해요)로 바꾸고 짧게 잘라줍니다
// (없는 내용을 지어내지는 않습니다 — 원문에 있는 문장만 다듬습니다).

const { callClaude, isConfigured, extractJson } = require("./claudeClient");

const MAX_HOOK_CHARS = 24; // 상단 후킹 문구: 두 줄 안에 들어가야 해서 짧게
// 실제 인기 쇼츠 자막은 한 줄 6~20자 수준으로 아주 짧습니다(참고 영상 분석 결과).
const MAX_LINE_CHARS = 22;

// ===================== 규칙 기반 폴백 =====================

// 블로그 문어체(~입니다/~습니다)를 숏폼 낭독체(~임/~했음/~라고 함)로 바꿉니다.
// 참고 영상들이 존댓말이 아니라 이 말투를 쓰고 있어서 거기에 맞췄습니다. 완벽한
// 변환은 아니지만, "~입니다"가 그대로 나가는 것보다는 훨씬 쇼츠다운 톤이 됩니다.
const TONE_RULES = [
  [/하였습니다/g, "했음"],
  [/되었습니다/g, "됐음"],
  [/있었습니다/g, "있었음"],
  [/없었습니다/g, "없었음"],
  [/했습니다/g, "했음"],
  [/됐습니다/g, "됐음"],
  [/합니다/g, "함"],
  [/입니다/g, "임"],
  [/됩니다/g, "됨"],
  [/있습니다/g, "있음"],
  [/없습니다/g, "없음"],
  [/같습니다/g, "같음"],
  [/드립니다/g, "드림"],
  [/습니다/g, "음"],
  [/하였/g, "했"],
  [/되었/g, "됐"],
  [/이에요\.?/g, "임"],
  [/예요\.?/g, "임"],
  [/해요\.?/g, "함"],
];

function toConversational(text) {
  let out = (text || "").trim();
  for (const [re, rep] of TONE_RULES) out = out.replace(re, rep);
  return out;
}

// 너무 긴 문장은 숏폼 자막으로 못 쓰니, 문장 앞부분만 살리고 자릅니다(어절 단위로
// 잘라서 단어가 중간에 끊기지 않게).
function shorten(text, maxChars) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const words = clean.split(" ");
  let out = "";
  for (const w of words) {
    const candidate = out ? `${out} ${w}` : w;
    if (candidate.length > maxChars) break;
    out = candidate;
  }
  return out || clean.slice(0, maxChars);
}

/**
 * 별표(*강조*)를 유지하면서 길이를 줄입니다.
 *
 * ⚠️ 그냥 자르면 여는 별표만 남는 경우가 생깁니다. 그러면 자막에 별표가 그대로
 * 찍혀서 "이번 세일 *반값" 처럼 나옵니다. 별표를 뺀 글자 수로 길이를 재고,
 * 자른 뒤 짝이 안 맞으면 남은 별표를 지웁니다.
 */
function shortenKeepingMarks(text, maxChars) {
  const s = String(text == null ? "" : text).trim();
  const visible = s.replace(/\*/g, "");
  if (visible.length <= maxChars) return s;

  // 별표를 세지 않으면서 maxChars만큼만 남깁니다.
  let out = "";
  let count = 0;
  for (const ch of s) {
    if (ch !== "*") {
      if (count >= maxChars) break;
      count++;
    }
    out += ch;
  }

  // 별표 개수가 홀수면 마지막 여는 별표를 지웁니다.
  const marks = (out.match(/\*/g) || []).length;
  if (marks % 2 === 1) out = out.replace(/\*([^*]*)$/, "$1");
  return out.trim();
}

// 제목에서 후킹 문구를 만듭니다. 블로그 제목에 흔히 붙는 군더더기(사이트명, 대괄호
// 태그 등)를 떼고 짧게 줄입니다.
function buildTemplateHook(title) {
  let t = (title || "").trim();
  t = t.replace(/\s*[:|·–—-]\s*네이버\s*블로그\s*$/i, "");
  t = t.replace(/\s*[:|·–—-]\s*[^:|·–—-]{0,20}(블로그|위키백과|뉴스)\s*$/i, "");
  t = t.replace(/^\s*\[[^\]]{0,20}\]\s*/, "");
  t = t.replace(/["'"'']/g, "");
  return shorten(t, MAX_HOOK_CHARS) || "이거 아세요?";
}

// 긴 문장을 자막 길이에 맞게 자를 때, 그냥 글자 수로 툭 자르면 "제약사 기반 고기능성
// 성분들이 대거" 처럼 말이 끊긴 채로 화면에 뜹니다. 그래서 먼저 쉼표/접속 어미 같은
// "말이 끊겨도 자연스러운 지점"에서 끊어보고, 그래도 길면 그때 글자 수로 자릅니다.
const CLAUSE_SPLIT = /[,·]|\s(?=그런데|그리고|하지만|그래서|또한|다만|특히)/;

function trimToClause(text, maxChars) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const firstClause = clean.split(CLAUSE_SPLIT)[0].trim();
  if (firstClause.length >= 6 && firstClause.length <= maxChars) return firstClause;
  return shorten(clean, maxChars);
}

function buildTemplateLines(sentences, count) {
  const out = [];
  // 이미 짧아서 자를 필요가 없는 문장을 먼저 쓰면 잘린 티가 덜 납니다.
  const ordered = [...sentences].sort((a, b) => {
    const aFits = a.length <= MAX_LINE_CHARS + 6 ? 0 : 1;
    const bFits = b.length <= MAX_LINE_CHARS + 6 ? 0 : 1;
    return aFits - bFits;
  });
  for (const s of ordered) {
    if (out.length >= count) break;
    const line = trimToClause(toConversational(s), MAX_LINE_CHARS);
    if (line.length >= 6 && !out.includes(line)) out.push(line);
  }
  return out;
}

// ===================== Claude 기반 =====================

// ⚠️ 이 말투 규칙은 사장님이 참고 영상으로 주신 실제 인기 쇼츠 2편을 프레임/자막까지
// 분석해서 뽑아낸 것입니다. 처음엔 "~해요" 구어체로 만들려 했지만, 실제 영상들은
// 구어체가 아니라 "~했음 / ~인데 / ~라고 함" 같은 **이슈블로그 낭독체 문장 조각**을
// 쓰고 있었습니다(친구한테 얘기해주듯 술술 읽히지만 존댓말은 아닌 톤). 그래서 그
// 말투를 그대로 따르도록 지시합니다.
const SYSTEM_PROMPT = `당신은 한국어 이슈/정보 숏폼(유튜브 쇼츠) 대본 작가입니다.
블로그 원문을 받아서, 영상에 얹을 자막 대본으로 다시 씁니다.

[말투 — 가장 중요]
- 존댓말(~입니다/~습니다/~해요)을 쓰지 마세요.
- 실제 인기 쇼츠처럼 "낭독체 문장 조각"으로 쓰세요. 어미 예시:
  "~했음", "~됐음", "~인데", "~지만", "~라고 함", "~더라", "~임"
- 친구한테 이슈 설명해주듯 술술 이어지게 쓰되, 문장을 완전히 끝맺지 않고
  다음 줄로 넘어가는 느낌도 좋습니다.
- 중간에 한 줄 정도는 시청자 반응처럼 반말 리액션을 넣으면 좋습니다.
  (예: "이게 말이 됨?", "설마 진짜?")

[내용 규칙]
- 원문에 실제로 있는 내용만 쓰세요. 없는 사실(가격, 날짜, 수치, 인물)을 지어내지 마세요.
- 원문 문장을 그대로 복사하지 말고, 핵심만 뽑아 짧게 새로 쓰세요.

[hook — 상단 고정 문구]
- 영상 내내 화면 위에 계속 떠 있는, 스크롤을 멈추게 하는 문구입니다.
- ${MAX_HOOK_CHARS}자 이내. 동사로 끝맺지 않는 "명사형 낚시 문구"로 쓰세요.
- 숫자나 따옴표를 넣으면 더 강해집니다.
- 좋은 예: "논란이라는 100만 인플루언서 '실물'" / "제주도에서 발견됐다는 말도 안 되는 거"

[lines — 하단 멘트]
- 장면마다 하나씩 바뀌며 나오는 자막입니다.
- 각 줄 ${MAX_LINE_CHARS}자 이내로 짧게(실제 쇼츠는 한 줄 6~20자).
- 첫 줄은 곧바로 본론으로 들어가는 도입(인사말 금지).
- 마지막 줄만 자연스러운 마무리로 씁니다.

[강조 표시 — 이게 요즘 숏폼의 핵심입니다]
- 각 줄에서 **가장 중요한 단어 하나**를 별표로 감싸 주세요. 예: 여기 진짜 *대박*이었어요
- 그 부분만 자막에서 다른 색으로 나옵니다. 소리를 끄고 보는 사람이 색 바뀐 단어만
  훑어도 내용이 전달되게 하는 장치입니다.
- 한 줄에 별표는 **한 쌍만**. 두 개 이상 넣으면 강조가 아니라 그냥 알록달록해집니다.
- 강조하면 좋은 것: 숫자, 가격, 놀라운 사실, 감정이 실린 단어(대박·충격·역대급),
  핵심 명사(반값·품절·재입고)
- 강조하지 말 것: 조사, 어미, 흔한 동사("좋아요", "있어요"), 문장 전체
- 강조할 만한 단어가 딱히 없는 줄은 별표 없이 그냥 두셔도 됩니다.
- hook에도 한 쌍 넣으면 좋습니다. 예: 논란이라는 100만 인플루언서 *'실물'*
- ⚠️ 별표는 강조 표시일 뿐이고 화면에 별표가 보이지는 않습니다. 마크다운 굵게가
  아니므로 별표를 두 개씩(**) 쓰지 마세요. 한 개씩만 씁니다.

반드시 아래 JSON 형식으로만 답하세요(설명 문장 없이):
{"hook": "...", "lines": ["...", "...", "..."]}`;

async function callClaudeForScript({ title, bodyText, sceneCount, source }) {
  const sourceHint =
    source === "shopping" ? "상품 소개" : source === "travel" ? "여행지 소개" : "정보/후기";
  const userPrompt = `아래 블로그 원문을 숏폼 대본으로 다시 써주세요.

[콘텐츠 성격] ${sourceHint}
[원문 제목] ${title || "(제목 없음)"}
[원문 본문]
${(bodyText || "").slice(0, 2500)}

lines는 정확히 ${sceneCount}개로 만들어 주세요.`;

  const raw = await callClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1500,
    temperature: 0.9,
  });
  const parsed = extractJson(raw);
  // ⚠️ 별표는 화면에 안 보이는 표시입니다. 길이를 잴 때 함께 세면 실제보다 길다고
  // 판단해서 멀쩡한 문장을 잘라냅니다. 별표를 뺀 길이로 재고, 자를 때도 짝이 맞게
  // 자릅니다(여는 별표만 남으면 자막에 별표가 그대로 찍힙니다).
  const hook = shortenKeepingMarks(String(parsed.hook || "").trim(), MAX_HOOK_CHARS);
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : [])
    .map((l) => shortenKeepingMarks(String(l || "").trim(), MAX_LINE_CHARS))
    .filter(Boolean);
  if (!hook || !lines.length) throw new Error("Claude 응답에 hook/lines가 없습니다.");
  return { hook, lines };
}

/**
 * title/bodyText: 원문에서 뽑아온 제목/본문
 * sentences: 원문에서 이미 문장 단위로 잘라둔 배열(폴백에서 씁니다)
 * sceneCount: 만들고 싶은 하단 멘트 개수
 * source: "blog" | "shopping" | "travel" — 말투 톤 힌트로만 씁니다
 *
 * 반환: { hook, lines, generatedBy, note }
 *   generatedBy: "claude" = AI가 새로 씀, "template" = 규칙 기반으로 원문 문장을 다듬음
 */
async function writeShortformScript({ title, bodyText, sentences = [], sceneCount = 6, source = "blog" } = {}) {
  if (isConfigured()) {
    try {
      const { hook, lines } = await callClaudeForScript({ title, bodyText, sceneCount, source });
      return {
        hook,
        lines,
        generatedBy: "claude",
        note: "AI가 원문을 읽고 숏폼용 구어체 대본으로 새로 썼습니다(원문에 없는 사실은 지어내지 않도록 지시했지만, 발행 전 검수는 꼭 해주세요).",
      };
    } catch (err) {
      console.error("[shortformScriptWriter] Claude 호출 실패, 규칙 기반으로 대체합니다:", err.message);
    }
  }

  return {
    hook: buildTemplateHook(title),
    lines: buildTemplateLines(sentences, sceneCount),
    generatedBy: "template",
    note: isConfigured()
      ? "AI 호출에 실패해서, 원문 문장을 구어체로 다듬어 대본을 만들었습니다."
      : "서버에 ANTHROPIC_API_KEY가 없어서, 원문 문장을 구어체로 다듬는 수준까지만 처리했습니다. 키를 등록하면 AI가 친구에게 말하듯 대본을 새로 써줍니다.",
  };
}

module.exports = { writeShortformScript, toConversational, shorten, buildTemplateHook };
