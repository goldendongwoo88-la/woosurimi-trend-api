/**
 * 본문 자동 강조 — 어디를 굵게·밑줄·배경색·글자색으로 할지 AI가 정합니다.
 *
 * ⚠️ 얼마나 강조할지를 지어내지 않았습니다. 실제로 세어봤습니다.
 * 그리고 **한 번 틀렸다가 고쳤습니다.**
 *
 * 처음에는 블로그 두 개만 보고 이렇게 정했습니다:
 *   1,000자당  굵게 9 · 밑줄 6 · 배경색 4 · 글자색 3
 * 자료를 넓혀보니 그 두 개 중 하나(nidle_831)가 **예외**였습니다.
 * 그 블로그만 밑줄과 배경색을 많이 썼습니다.
 *
 * 다시 잰 값 (검색상위 블로그 27개 글 162편 + 네이버 인기글 78편):
 *   1,000자당      두 자료
 *   굵게            3.4 ~ 7.2
 *   밑줄               0        ← 둘 다 중앙값 0
 *   배경색              0        ← 둘 다 중앙값 0
 *   글자색            0 ~ 4
 *
 * **밑줄과 배경색은 거의 아무도 안 씁니다.**
 * 글자색은 **덜 되는 쪽이 훨씬 많이** 씁니다 (연예에서 위 7 · 아래 87).
 * 사장님 블로그는 35.6이었습니다. 색이 많으면 오히려 아마추어로 보입니다.
 *
 * 그래서 **굵게가 주력**입니다. 다 강조하면 아무것도 강조가 안 됩니다.
 *
 * ⚠️ AI가 글자를 지어내면 안 됩니다.
 * 강조할 말은 **본문에 그대로 있는 것**이어야 합니다. 한 글자라도 다르면
 * 편집기에서 찾을 수가 없고, 엉뚱한 데 강조가 들어갑니다.
 * 그래서 돌려받은 말이 본문에 실제로 있는지 하나하나 대조합니다.
 */

const { callClaude, isConfigured, extractJson } = require("./claudeClient");

/**
 * 실측값.
 *
 * ⚠️ 2026-08-27에 다시 쟀습니다. 처음 값은 **블로그 한 개**(nidle_831)에서
 * 나온 것이었습니다. 그 블로그는 밑줄 9.1, 배경색 6.7을 썼는데,
 * 자료를 넓혀보니 **그게 예외였습니다.**
 *
 *   A. 검색 상위 블로그 27개 · 글 162편
 *   B. 네이버 주제별 인기글 78편
 *
 *   1,000자당      A(잘되는쪽)   B(네이버인기글)
 *   굵게              4.1        3.4~7.2
 *   밑줄               0            0        ← 둘 다 0
 *   배경색              0            0        ← 둘 다 0
 *   글자색              0(위)/87(아래)  0~4
 *
 * **밑줄과 배경색은 거의 아무도 안 씁니다.** 두 자료 모두 중앙값 0입니다.
 * 글자색은 **덜 되는 쪽이 훨씬 많이** 씁니다 (연예에서 위 7 · 아래 87).
 * 사장님 블로그는 35.6이었습니다. 색을 많이 쓰면 오히려 아마추어로 보입니다.
 *
 * 그래서 **굵게 위주**로 바꿨습니다. 나머지는 아주 조금만 씁니다.
 */
const MEASURED = {
  source: "검색상위 블로그 27개(글 162편) + 네이버 주제별 인기글 78편",
  measuredAt: "2026-08-27",
  perThousand: { bold: [3.4, 7.2], underline: 0, highlight: 0, color: [0, 4] },
  note: "밑줄·배경색은 두 자료 모두 중앙값 0. 글자색은 덜 되는 쪽이 더 많이 씀.",
  // 처음에 쓰던 값 — 어디서 왔는지 남겨둡니다.
  old: { source: "nidle_831 한 개", bold: 12.8, underline: 9.1, highlight: 6.7, color: 5.3 },
};

/**
 * 1,000자당 몇 개를 넣을지.
 *
 * ⚠️ 굵게가 주력입니다. 밑줄·배경색은 **글 전체에 한두 번**만 씁니다 —
 * 실측은 0이지만, 아예 못 쓰게 하면 정말 중요한 한 줄을 표시할 방법이 없습니다.
 * 그래서 0은 아니되 아주 적게 둡니다.
 */
const PER_1000 = { bold: 5, underline: 0.6, highlight: 0.6, color: 1 };

/** 아무리 긴 글이어도 이 이상은 안 합니다. */
const HARD_CAP = { bold: 22, underline: 3, highlight: 2, color: 5 };

const KINDS = {
  bold: { label: "굵게", why: "제일 눈에 띄고 부담이 없습니다. 핵심어에 씁니다." },
  underline: { label: "밑줄", why: "굵게와 겹쳐도 되고, 문장 단위로 긋기 좋습니다." },
  highlight: { label: "배경색", why: "제일 세게 튑니다. 글에서 딱 하나 기억할 것에만." },
  color: { label: "글자색", why: "가격·수치처럼 눈으로 찾아야 하는 것에." },
};

/** 소제목 글자 크기 — 사장님이 38로 정하셨습니다. */
const SUBHEAD_SIZE = 38;

/**
 * 원고에서 소제목으로 쓴 표시들.
 *
 * ⚠️ 사장님이 클로드 원고를 편집기에 붙여넣으면 **소제목이 그냥 본문으로** 들어갑니다.
 * 편집기의 소제목은 글자 크기가 아니라 **문단 스타일**(본문/소제목/인용구)이라
 * 붙여넣기로는 안 따라옵니다. 사람이 드롭다운에서 골라줘야 합니다.
 *
 * 그래서 원고에서 소제목 자리를 알아보고 그 문단만 스타일을 바꿔줍니다.
 * 아래는 제가 원고에 쓰는 표시들입니다.
 */
const SUBHEAD_MARKS = [
  /^\s*■\s*/,            // ■ 패키지 첫인상
  /^\s*\[소제목\]\s*/,    // [소제목] ...
  /^\s*#{2,3}\s+/,        // ## 제목
  /^\s*▶\s*/,
  /^\s*◆\s*/,
  /^\s*●\s*/,
];

/** 소제목 표시가 붙은 줄인지 보고, 표시를 뗀 글자를 돌려줍니다. */
function asSubhead(line) {
  const t = String(line || "").trim();
  for (const re of SUBHEAD_MARKS) {
    if (re.test(t)) {
      const clean = t.replace(re, "").trim();
      // ⚠️ 표시만 있고 글자가 없거나, 문장처럼 긴 것은 소제목이 아닙니다.
      if (clean.length >= 3 && clean.length <= 45) return clean;
    }
  }
  return null;
}

const SYSTEM = `당신은 네이버 블로그 글에서 **강조할 자리**를 고르는 편집자입니다.

무엇을 강조하나 (중요한 순서):
1. 제품명·브랜드명 — 읽는 사람이 검색할 말입니다
2. 가격·용량·기간·수치 — 눈으로 찾는 정보입니다 ("2주", "12,900원", "300ml")
3. 제목이 약속한 것의 답 — 제목을 보고 들어온 사람이 찾는 대목입니다
4. 판정·결론 — "재구매 의사 있음", "정사이즈 사세요" 같은 한 줄
5. 남들과 다른 점 — "다른 제품과 달리 ~"

무엇을 강조하면 안 되나:
- 문장 전체. 강조는 **짧아야** 합니다. 2~15자.
- 흔한 말 ("좋았어요", "추천합니다", "그래서")
- 이미 소제목에 있는 말 — 두 번 강조하면 소제목이 죽습니다
- 한 문단에 세 군데 넘게. 그 문단이 통째로 시끄러워집니다

⚠️ **본문에 있는 글자를 그대로 가져오세요.**
띄어쓰기, 조사, 부호까지 똑같아야 합니다. 한 글자라도 다르면 못 찾습니다.
요약하거나 다듬지 마세요. 복사해 온다고 생각하세요.

⚠️ **다 강조하면 아무것도 강조가 안 됩니다.**
블로그 105곳(글 240편)을 세어보니 1,000자에 **굵게 3~7번**입니다.
그리고 **밑줄과 배경색은 거의 아무도 안 씁니다** — 두 자료 모두 중앙값 0입니다.
글자색은 오히려 **덜 되는 블로그가 훨씬 많이** 씁니다. 색이 많으면 아마추어로 보입니다.

그러니 **굵게를 주력으로** 쓰세요. 밑줄·배경색은 글 전체에 한 번 있을까 말까입니다.
정말 딱 하나 기억시킬 것이 있을 때만 쓰세요.

반드시 JSON만 답하세요.`;

/**
 * 강조할 자리를 고릅니다.
 * @returns {{ok, marks, targets, stats, dropped, warnings}}
 */
async function plan({ title = "", body = "" } = {}) {
  const text = String(body || "");
  const chars = text.replace(/[\s​]/g, "").length;
  if (chars < 150) return { ok: false, why: "본문이 짧습니다. 150자 이상 쓰신 뒤에 해주세요." };
  if (!isConfigured()) return { ok: false, why: "서버에 ANTHROPIC_API_KEY가 없어서 이 기능을 못 씁니다." };

  const k = chars / 1000;
  const targets = {};
  for (const key of Object.keys(PER_1000)) {
    targets[key] = Math.max(1, Math.min(HARD_CAP[key], Math.round(PER_1000[key] * k)));
  }

  const prompt =
    `글 제목: ${title || "(없음)"}\n\n` +
    `본문 (${chars}자):\n${text.slice(0, 6000)}\n\n` +
    `이 글에서 강조할 자리를 고르세요.\n` +
    `개수 기준 (이 글 길이에 맞춘 값입니다):\n` +
    `  굵게 ${targets.bold}개 · 밑줄 ${targets.underline}개 · 배경색 ${targets.highlight}개 · 글자색 ${targets.color}개\n` +
    `이보다 적어도 됩니다. 강조할 만한 게 없으면 억지로 채우지 마세요.\n\n` +
    `그리고 인용구로 뽑을 문장을 1~3개 고르세요.\n\n` +
    `JSON만 답하세요:\n` +
    `{\n` +
    `  "marks": [\n` +
    `    {"text": "본문에서 그대로 복사한 말", "kind": "bold|underline|highlight|color", "why": "왜 여기인지 짧게"}\n` +
    `  ],\n` +
    `  "quotes": [\n` +
    `    {"text": "인용구로 뽑을 문장 (본문에 그대로 있는 것, 15~50자)", "why": "왜 이 문장인지 짧게"}\n` +
    `  ]\n` +
    `}`;

  let parsed;
  try {
    const raw = await callClaude({
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 3000,
      temperature: 0.3,
      timeoutMs: 120000,
    });
    parsed = extractJson(raw);
  } catch (e) {
    return { ok: false, why: `강조할 자리를 못 골랐습니다: ${e.message}` };
  }

  return validate(parsed, { text, targets, chars });
}

/**
 * AI가 돌려준 것을 본문과 대조합니다.
 *
 * ⚠️ 이게 없으면 안 됩니다. AI는 자주 말을 다듬어서 돌려줍니다 —
 * 본문이 "2주 정도 써보게 됐습니다"인데 "2주 사용"이라고 주는 식입니다.
 * 그러면 편집기에서 못 찾고, 못 찾은 걸 모른 채로 "강조했습니다"라고 말하게 됩니다.
 */
function validate(parsed, { text, targets, chars }) {
  const marks = [];
  const dropped = [];
  const seen = new Set();
  const used = { bold: 0, underline: 0, highlight: 0, color: 0 };

  for (const m of (parsed && parsed.marks) || []) {
    const phrase = String(m.text || "").trim();
    const kind = KINDS[m.kind] ? m.kind : "bold";

    if (!phrase) continue;
    if (phrase.length < 2) { dropped.push({ phrase, why: "너무 짧습니다" }); continue; }
    if (phrase.length > 30) { dropped.push({ phrase, why: "너무 깁니다 (30자 넘음)" }); continue; }

    // 본문에 그대로 있는가 — 제일 중요한 검사입니다.
    const at = text.indexOf(phrase);
    if (at < 0) {
      dropped.push({ phrase, why: "본문에 이 글자가 그대로 없습니다 (AI가 다듬은 듯)" });
      continue;
    }
    // 여러 번 나오면 어디를 강조할지 알 수 없습니다.
    const times = text.split(phrase).length - 1;
    if (times > 3) {
      dropped.push({ phrase, why: `본문에 ${times}번 나옵니다. 어디인지 특정할 수 없습니다` });
      continue;
    }

    const key = phrase.toLowerCase();
    if (seen.has(key)) { dropped.push({ phrase, why: "같은 말이 이미 있습니다" }); continue; }

    if (used[kind] >= targets[kind]) {
      dropped.push({ phrase, why: `${KINDS[kind].label}는 ${targets[kind]}개까지입니다` });
      continue;
    }

    seen.add(key);
    used[kind]++;
    marks.push({
      text: phrase,
      kind,
      label: KINDS[kind].label,
      why: String(m.why || "").slice(0, 80),
      at,
      times,
    });
  }

  // 본문에 나오는 순서대로 — 편집기에서 위에서부터 훑으며 넣기 좋습니다.
  marks.sort((a, b) => a.at - b.at);

  // ── 인용구 ──
  // ⚠️ 강조와 같은 검사를 합니다. 본문에 그대로 없으면 편집기에서 못 찾습니다.
  const quotes = [];
  for (const q of (parsed && parsed.quotes) || []) {
    const phrase = String(q.text || "").trim();
    if (phrase.length < 10 || phrase.length > 60) {
      if (phrase) dropped.push({ phrase, why: "인용구는 15~50자여야 합니다" });
      continue;
    }
    const at = text.indexOf(phrase);
    if (at < 0) { dropped.push({ phrase, why: "인용구가 본문에 그대로 없습니다" }); continue; }
    if (quotes.length >= 3) { dropped.push({ phrase, why: "인용구는 3개까지입니다" }); continue; }
    quotes.push({ text: phrase, why: String(q.why || "").slice(0, 80), at });
  }
  quotes.sort((a, b) => a.at - b.at);

  // ── 소제목 ──
  // ⚠️ AI한테 안 물어봅니다. 원고에 표시(■, [소제목])가 이미 있어서
  // 낱말로 알 수 있습니다. 물어보면 돈만 나가고 더 틀립니다.
  const subheads = [];
  for (const line of text.split("\n")) {
    const clean = asSubhead(line);
    if (clean) subheads.push({ raw: line.trim(), text: clean });
  }

  const warnings = [];
  if (!marks.length) warnings.push("강조할 자리를 하나도 못 찾았습니다.");
  if (dropped.length > marks.length) {
    warnings.push(`AI가 준 것 중 ${dropped.length}개를 뺐습니다. 본문에 그대로 없는 말이 많았습니다.`);
  }

  return {
    ok: marks.length > 0 || quotes.length > 0 || subheads.length > 0,
    marks,
    quotes,
    subheads,
    dropped,
    targets,
    used,
    chars,
    subheadSize: SUBHEAD_SIZE,
    measured: MEASURED,
    warnings,
    note:
      "강조할 말은 본문에 그대로 있는 것만 씁니다. AI가 다듬어서 준 말은 뺐습니다. " +
      "편집기에서 못 찾으면 그 자리는 건너뜁니다.",
  };
}

module.exports = { plan, validate, KINDS, MEASURED, PER_1000, SUBHEAD_SIZE, asSubhead, SUBHEAD_MARKS };
