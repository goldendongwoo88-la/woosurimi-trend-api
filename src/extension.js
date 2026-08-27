/**
 * 크롬 확장이 부르는 것들.
 *
 * ⚠️ 화면에 보여줄 글이 아니라 **네이버 에디터에 그대로 들어갈 글**을 만듭니다.
 * 그래서 마크다운(`##`, `**굵게**`)을 쓰면 안 됩니다. 스마트에디터는 그걸
 * 서식으로 알아듣지 못하고 별표를 그대로 찍어버립니다.
 *
 * 대신 문단을 종류별로 쪼갠 목록(blocks)으로 돌려줍니다:
 *   { type: "h3" | "p" | "quote" | "image" | "hr", text }
 * 확장이 이걸 에디터가 알아듣는 HTML로 바꿔서 넣습니다.
 */

const { callClaude, isConfigured, extractJson } = require("./claudeClient");
const postAudit = require("./postAudit");
const { getRelatedKeywords } = require("./naverKeywordTool");
const { extractPageData } = require("./pageExtractor");

// ────────────────────────────────────────────────────────────
// 글쓰기 규칙
//
// ⚠️ 이 규칙들은 제가 지어낸 게 아니라, 네이버 검색 로직(D.I.A.·홈피드)을
// 뜯어보고 진단 도구에 넣어둔 기준과 **같은 것**입니다. 진단은 이렇게 하라 해놓고
// 글은 다르게 쓰면, 우리가 쓴 글이 우리 진단에서 떨어집니다.
// ────────────────────────────────────────────────────────────
const RULES = `
[뼈대] ⚠️ 분량은 글자를 세서 맞추는 게 아니라 **이 뼈대를 지키면 저절로** 맞습니다.
  여는 문단 2개
  소제목 5개 — 각 소제목마다 문단 3~4개
  마무리 문단 2개
  → 문단이 총 20개 안팎 나옵니다. 이게 곧 2,000자입니다.
  ⚠️ 문단 수를 줄이지 마세요. 소제목 3개에 문단 2개씩 쓰면 1,200자밖에 안 나와서
  검색 노출 기준(1,500자)에 미달합니다. 실제로 그렇게 나온 적이 있습니다.
[문단] 한 문단 3~4문장, 100자 안팎.
  ⚠️ 한 문단이 한두 문장으로 끝나면 글이 앙상해집니다.
  다만 5문장을 넘으면 휴대폰에서 벽처럼 보이니 거기서 끊습니다.
[제목] 30자 안팎. 노리는 키워드를 정확히 한 번 넣습니다. 두 번 넣으면 오히려 손해입니다.
[본문 키워드] 노리는 키워드를 본문에 정확히 3~5회.
  ⚠️ 비율이 아니라 횟수입니다. 그리고 **많을수록 나쁩니다.**
  8회 넣었다가 남용으로 걸린 적이 있습니다. 5회를 넘기지 마세요.
  글이 길어져도 횟수는 그대로입니다. 억지로 끼워 넣어 문장이 어색해지면
  차라리 3회에서 멈추세요.
[사진] 5장 이상 들어갈 자리를 표시합니다. 어떤 사진인지 구체적으로 적어주세요.
[체류시간] 첫 세 문장 안에서 "이 글에 뭐가 있는지" 알 수 있어야 합니다.
  글 중간에 표나 목록을 하나 넣으면 눈이 쉬어갑니다.
[어미] '~습니다'만 반복하지 마세요. '~해요', '~죠', '~거든요'를 섞습니다.
[태그] 10개 안팎.
`.trim();

const FORBIDDEN = `
[절대 쓰지 말 것 — 광고법에 걸립니다]
  최고, 1위, 유일한, 100%, 완벽, 무조건, 절대(부정문 제외),
  효과 보장, 부작용 없음, 치료/완치/개선(의약품이 아닌 것에)
[지어내지 말 것]
  가격, 영업시간, 주소, 전화번호, 날짜, 통계 숫자.
  모르면 그 문장을 아예 쓰지 말고, 정말 필요하면 "확인 필요"라고 적어주세요.
  ⚠️ 이게 제일 중요합니다. 그럴듯하게 지어낸 숫자 하나가 블로그 신뢰를 통째로 무너뜨립니다.
`.trim();

const SHAPE = `
반드시 아래 JSON 하나만 출력하세요. 설명도, 코드블록 표시도 붙이지 마세요.
{
  "title": "제목",
  "blocks": [
    { "type": "p",     "text": "여는 문단" },
    { "type": "image", "text": "어떤 사진인지 설명" },
    { "type": "h3",    "text": "소제목" },
    { "type": "p",     "text": "문단" },
    { "type": "quote", "text": "강조하고 싶은 한 줄" }
  ],
  "tags": ["태그1", "태그2"]
}
type은 p·h3·image·quote·hr 다섯 가지만 씁니다.
`.trim();

const TONES = {
  후기형: "직접 가보고 써보고 겪은 사람의 말투. '갔더니', '먹어보니', '써보니'. 좋았던 점만 늘어놓지 말고 아쉬웠던 점도 한두 개 솔직하게 적어주세요. 그래야 진짜 후기로 읽힙니다.",
  정보형: "묻는 사람에게 차근차근 알려주는 말투. 궁금해할 순서대로 풀어주세요.",
  추천형: "여러 개를 비교해서 골라주는 말투. 각각 어떤 사람에게 맞는지 짚어주세요.",
  일상형: "친한 사람에게 이야기하듯 편한 말투. 정보보다 이야기가 앞섭니다.",
};

function need() {
  if (!isConfigured()) {
    const e = new Error("AI가 아직 연결되지 않았습니다. 서버 설정을 확인해 주세요.");
    e.status = 503;
    throw e;
  }
}

/**
 * AI가 돌려준 걸 다듬습니다.
 *
 * ⚠️ AI는 시킨 대로만 하지 않습니다. 마크다운을 섞거나, type을 엉뚱하게 쓰거나,
 * blocks 대신 그냥 긴 글을 줄 때가 있습니다. 그걸 그대로 에디터에 넣으면
 * 별표와 우물 정 자가 본문에 박힙니다. 여기서 전부 걸러냅니다.
 */
function clean(raw) {
  const ok = new Set(["p", "h3", "h2", "image", "quote", "hr"]);
  const blocks = [];

  for (const b of Array.isArray(raw.blocks) ? raw.blocks : []) {
    let type = String(b && b.type || "p").toLowerCase();
    if (type === "h2") type = "h3";
    if (!ok.has(type)) type = "p";

    let text = String(b && b.text || "")
      .replace(/\*\*(.+?)\*\*/g, "$1")   // **굵게** → 굵게
      .replace(/^#{1,6}\s*/, "")          // ## 소제목 → 소제목
      .replace(/^[-*]\s+/gm, "· ")        // - 목록 → · 목록
      .trim();

    if (type === "hr") { blocks.push({ type: "hr", text: "" }); continue; }
    if (!text) continue;
    blocks.push({ type, text });
  }

  // blocks가 통째로 없으면 마지막 수단: 줄바꿈으로 쪼갭니다.
  if (!blocks.length && typeof raw.body === "string") {
    for (const para of raw.body.split(/\n{2,}/)) {
      const t = para.trim();
      if (t) blocks.push({ type: "p", text: t });
    }
  }

  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .map((t) => String(t).replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 15);

  return { title: String(raw.title || "").trim(), blocks, tags };
}

/** 진단에 넘길 수 있게 blocks를 한 덩어리 HTML로 만듭니다. 소제목을 세려면 서식이 필요합니다. */
function blocksToHtml(blocks) {
  return blocks.map((b) => {
    if (b.type === "h3" || b.type === "h2") return `<h3>${b.text}</h3>`;
    if (b.type === "quote") return `<blockquote>${b.text}</blockquote>`;
    if (b.type === "hr") return "<hr>";
    if (b.type === "image") return "";   // 사진 자리는 글자 수에 안 넣습니다
    return `<p>${b.text}</p>`;
  }).join("\n");
}

/** 만든 글을 우리 진단으로 한 번 걸러봅니다. */
function selfCheck(draft, keyword) {
  try {
    return postAudit.audit({
      title: draft.title,
      body: blocksToHtml(draft.blocks),
      tags: draft.tags,
      keyword: keyword || "",
      images: draft.blocks.filter((b) => b.type === "image").length,
    });
  } catch {
    return null;   // 진단이 실패해도 원고는 나가야 합니다.
  }
}

/** 사진 자리를 뺀 실제 글자 수(공백 제외). 진단이 세는 것과 같은 기준입니다. */
function charCount(blocks) {
  return blocks.filter((b) => b.type !== "image" && b.type !== "hr")
    .map((b) => b.text).join("").replace(/\s/g, "").length;
}

/**
 * 짧으면 늘립니다.
 *
 * ⚠️ 1,500자는 검색 노출의 최저선이라 못 넘기면 글을 쓴 의미가 없습니다.
 * 그런데 AI에게 "2,000자로 써라"라고 하면 오히려 짧아집니다 — 실제로 목표를
 * 1,500에서 2,000으로 올렸더니 1,416자에서 1,238자로 줄었습니다.
 * 글자를 셀 줄 모르니 숫자를 키워봐야 소용없고, 오히려 조심스러워집니다.
 *
 * 그래서 세라고 하지 않고, **모자란 만큼 어디를 늘릴지 짚어서** 다시 시킵니다.
 * 이건 AI가 할 수 있는 일입니다.
 */
const MIN_CHARS = 1500;

async function expandIfShort(draft, topic) {
  const now = charCount(draft.blocks);
  if (now >= MIN_CHARS) return { draft, expanded: 0 };

  // 소제목별로 얼마나 쓰였는지 세서, 얇은 데를 짚어줍니다.
  const sections = [];
  let cur = null;
  for (const b of draft.blocks) {
    if (b.type === "h3" || b.type === "h2") {
      cur = { title: b.text, chars: 0, paras: 0 };
      sections.push(cur);
    } else if (cur && b.type === "p") {
      cur.chars += b.text.replace(/\s/g, "").length;
      cur.paras++;
    }
  }
  const thin = sections.filter((s) => s.chars < 300).map((s) => s.title);

  let out;
  try {
    out = await jsonFromClaude({
      system:
        "이미 쓴 네이버 블로그 글을 더 두툼하게 만듭니다.\n\n" +
        "⚠️ 있는 문단을 지우거나 고치지 마세요. **문단을 더하기만** 합니다.\n" +
        "⚠️ 같은 말을 다르게 반복해서 늘리지 마세요. 그건 읽는 사람이 바로 알아챕니다.\n" +
        "   대신 실제로 궁금해할 것을 더합니다 — 언제 가면 좋은지, 주의할 점,\n" +
        "   누구에게 맞고 누구에겐 안 맞는지, 직접 겪은 구체적인 장면.\n" +
        "⚠️ 없는 사실(가격·시간·주소·숫자)을 지어내지 마세요.\n" +
        "⚠️ 노리는 키워드를 더 넣지 마세요. 이미 충분히 들어가 있습니다.\n\n" +
        SHAPE + "\n\n" +
        "blocks에는 **글 전체**를 담아주세요. 원래 문단은 그대로 두고 사이사이 더한 것입니다.",
      user:
        `주제: ${topic}\n` +
        `지금 ${now}자인데 ${MIN_CHARS}자를 넘겨야 합니다. ${MIN_CHARS - now}자 이상 더 필요합니다.\n` +
        (thin.length ? `특히 이 소제목들이 얇습니다: ${thin.join(", ")}\n` : "") +
        `\n지금 글:\n${JSON.stringify({ title: draft.title, blocks: draft.blocks, tags: draft.tags })}`,
      maxTokens: 8000,
      temperature: 0.8,
    });
  } catch {
    return { draft, expanded: 0 };   // 못 늘려도 원고는 나갑니다.
  }

  const bigger = clean(out);
  // ⚠️ 늘리랬는데 줄여서 돌아오는 경우가 있습니다. 그럼 원래 걸 씁니다.
  if (!bigger.blocks.length || charCount(bigger.blocks) <= now) return { draft, expanded: 0 };

  return {
    draft: { ...draft, blocks: bigger.blocks, title: bigger.title || draft.title },
    expanded: charCount(bigger.blocks) - now,
  };
}

/**
 * 광고법에 걸리는 문장만 골라서 고칩니다.
 *
 * ⚠️ 시스템 프롬프트로 "최고·1위·100% 쓰지 마라"라고 못을 박아도 뚫립니다.
 * 실제로 "커피 맛으로는 여기가 최고"라는 문장이 그대로 나왔습니다. 사람이 쓰듯
 * 자연스럽게 쓰라고 시키면, 사람이 흔히 쓰는 저 표현이 딸려 나오는 겁니다.
 *
 * 그래서 막는 걸로 끝내지 않고 **나온 걸 잡아냅니다.** 우리 진단이 이미 어느
 * 문장인지 알고 있으니, 그 문장만 따로 떼어 고쳐달라고 합니다. 글 전체를 다시
 * 쓰게 하면 멀쩡한 부분까지 바뀌고 시간도 배로 듭니다.
 *
 * 고치지 못해도 원고는 그대로 나갑니다. 진단에 빨간불이 남아 있으니
 * 사장님이 보고 판단하시면 됩니다. 조용히 사라지는 것보다 낫습니다.
 */
async function repairRisks(draft, audit) {
  const hits = [];
  for (const r of (audit && audit.risks) || []) {
    for (const h of r.hits || []) {
      if (h.where && !hits.some((x) => x.where === h.where)) {
        hits.push({ where: h.where, word: h.word, why: r.why, fix: r.fix });
      }
    }
  }
  if (!hits.length) return { draft, repaired: 0 };

  let map;
  try {
    const out = await jsonFromClaude({
      system:
        "네이버 블로그 글에서 광고법에 걸리는 표현만 고칩니다.\n\n" +
        "⚠️ 문장의 뜻과 말투는 그대로 두고, 걸린 표현만 바꿉니다. " +
        "글을 더 좋게 만들려 하지 마세요. 그건 제 일이 아닙니다.\n" +
        "⚠️ 없는 사실을 넣지 마세요.\n\n" +
        "예) '여기가 최고' → '제가 가본 곳 중에는 여기가 제일 좋았어요'\n" +
        "예) '1위 맛집' → '많이들 찾는 맛집'\n\n" +
        '{ "fixes": [ { "before": "원래 문장", "after": "고친 문장" } ] } 형태의 JSON만 출력하세요.',
      user: hits.map((h, i) =>
        `${i + 1}) 문장: ${h.where}\n   걸린 말: ${h.word} — ${h.why}\n   방향: ${h.fix}`
      ).join("\n\n"),
      maxTokens: 2000,
      temperature: 0.4,
    });
    map = Array.isArray(out.fixes) ? out.fixes : [];
  } catch {
    return { draft, repaired: 0 };
  }

  let n = 0;
  const blocks = draft.blocks.map((b) => {
    let text = b.text;
    for (const f of map) {
      const before = String(f.before || "").trim();
      const after = String(f.after || "").trim();
      // ⚠️ 진단이 준 '문장'은 잘려 있을 수 있어서 통째로는 안 맞을 때가 있습니다.
      // 정확히 들어 있을 때만 바꿉니다. 어설프게 맞춰 바꾸면 엉뚱한 데를 건드립니다.
      if (before && after && text.includes(before)) {
        text = text.split(before).join(after);
        n++;
      }
    }
    return text === b.text ? b : { ...b, text };
  });

  return { draft: { ...draft, blocks }, repaired: n };
}

async function jsonFromClaude({ system, user, maxTokens = 6000, temperature = 0.85 }) {
  const text = await callClaude({
    feature: "확장프로그램",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens,
    temperature,
    timeoutMs: 150000,
  });
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 답을 알아듣지 못했습니다. 한 번 더 눌러주세요.");
  }
  return parsed;
}

// ────────────────────────────────────────────────────────────
// 주제로 쓰기
// ────────────────────────────────────────────────────────────
async function write({ topic, keyword = "", tone = "후기형" } = {}) {
  need();
  if (!String(topic || "").trim()) {
    const e = new Error("무엇에 대해 쓸지 알려주세요.");
    e.status = 400;
    throw e;
  }

  const kw = String(keyword || "").trim() || String(topic).trim();

  const draft = clean(await jsonFromClaude({
    system:
      "당신은 네이버 블로그를 오래 해온 한국인 블로거입니다. 검색에 잘 걸리면서도 " +
      "사람이 읽기 좋은 글을 씁니다.\n\n" +
      "가장 중요한 것: AI가 쓴 티가 나면 안 됩니다. 도입부에 '오늘은 ~에 대해 알아보겠습니다' " +
      "같은 상투적인 문장을 쓰지 마세요. 모든 문단을 같은 길이로 맞추지 마세요. " +
      "사람은 그렇게 쓰지 않습니다.\n\n" +
      RULES + "\n\n" + FORBIDDEN + "\n\n" + SHAPE,
    user:
      `주제: ${topic}\n` +
      `노리는 키워드: ${kw}\n` +
      `말투: ${tone} — ${TONES[tone] || TONES.후기형}\n\n` +
      `이 주제로 네이버 블로그 글 한 편을 써주세요.`,
  }));

  if (!draft.blocks.length) throw new Error("원고를 만들지 못했습니다. 한 번 더 눌러주세요.");

  // 만들고 → 짧으면 늘리고 → 진단하고 → 걸린 것만 고치고 → 다시 진단.
  //
  // ⚠️ 늘리는 걸 먼저 합니다. 고친 다음에 늘리면 새로 더한 문단에
  // 또 금지어가 섞여 들어와도 아무도 안 봅니다.
  const { draft: full, expanded } = await expandIfShort(draft, topic);
  const first = selfCheck(full, kw);
  const { draft: fixed, repaired } = await repairRisks(full, first);
  return {
    ...fixed,
    expanded,
    repaired,
    audit: repaired ? selfCheck(fixed, kw) : first,
  };
}

// ────────────────────────────────────────────────────────────
// 가진 원고 정리하기
//
// ⚠️ 새로 쓰는 게 아니라 **나누기만** 합니다. 남이 쓴 글을 AI가 마음대로
// 고쳐놓으면 그건 더 이상 그 사람 글이 아닙니다.
// ────────────────────────────────────────────────────────────
async function parse({ text } = {}) {
  need();
  const raw = String(text || "").trim();
  if (raw.length < 30) {
    const e = new Error("원고가 너무 짧습니다.");
    e.status = 400;
    throw e;
  }

  const draft = clean(await jsonFromClaude({
    system:
      "주어진 글을 네이버 에디터에 넣을 수 있게 나누는 일만 합니다.\n\n" +
      "⚠️ 문장을 고치거나 새로 쓰지 마세요. 원문 그대로 두고 **나누기만** 합니다.\n" +
      "  - 제목처럼 보이는 첫 줄 → title\n" +
      "  - 소제목처럼 보이는 짧은 줄 → h3\n" +
      "  - 나머지 → p\n" +
      "  - #으로 시작하는 줄 → tags\n" +
      "글자를 바꾸는 건 마크다운 기호(**, ##, -)를 떼는 것까지만 허용합니다.\n\n" +
      SHAPE,
    user: raw.slice(0, 20000),
    temperature: 0.2,
    maxTokens: 8000,
  }));

  if (!draft.blocks.length) throw new Error("원고를 나누지 못했습니다.");
  return { ...draft, audit: selfCheck(draft, "") };
}

// ────────────────────────────────────────────────────────────
// 상품 링크로 리뷰 쓰기
// ────────────────────────────────────────────────────────────
async function product({ url, note = "" } = {}) {
  need();
  if (!String(url || "").trim()) {
    const e = new Error("상품 링크를 넣어주세요.");
    e.status = 400;
    throw e;
  }

  // ⚠️ 상품 페이지를 못 읽어도 글은 나와야 합니다. 다만 그때는
  // 값을 지어내지 않도록 AI에게 확실히 못을 박습니다.
  let page = null;
  try {
    page = await extractPageData(url);
  } catch { /* 못 읽으면 링크만 가지고 씁니다 */ }

  const known = page
    ? `상품 페이지에서 읽어온 것:\n제목: ${page.title || "(없음)"}\n` +
      `설명: ${(page.description || "").slice(0, 500)}\n` +
      `본문: ${(page.bodyText || "").slice(0, 2000)}`
    : "⚠️ 상품 페이지를 읽지 못했습니다. 링크와 아래 사용기만 가지고 쓰세요. " +
      "가격·용량·성분처럼 확인 못 한 것은 절대 쓰지 마세요.";

  const draft = clean(await jsonFromClaude({
    system:
      "네이버 블로그에 상품 리뷰를 쓰는 한국인 블로거입니다.\n\n" +
      "⚠️ 페이지에서 읽어온 것과 사용자가 직접 알려준 것만 씁니다. " +
      "가격·용량·성분·배송비는 확인된 것만 쓰고, 없으면 그 이야기를 아예 빼세요.\n" +
      "⚠️ 좋은 점만 쓰면 광고로 읽힙니다. 아쉬운 점을 한두 개는 꼭 넣어주세요.\n" +
      "⚠️ 글 맨 끝에 대가성 표기 문단을 넣으세요. 협찬이면 그렇게, 직접 샀으면 그렇게 " +
      "적을 수 있도록 '[여기에 협찬/구매 여부를 적어주세요]'라고 표시해 두세요.\n\n" +
      RULES + "\n\n" + FORBIDDEN + "\n\n" + SHAPE,
    user:
      `상품 링크: ${url}\n\n${known}\n\n` +
      (note ? `직접 써본 이야기(이게 글의 중심입니다):\n${note}\n\n` : "") +
      `이 상품 리뷰 글을 써주세요.`,
  }));

  if (!draft.blocks.length) throw new Error("리뷰를 만들지 못했습니다.");

  // ⚠️ 상품 리뷰는 광고법에 제일 자주 걸립니다. 여기야말로 수선 단계가 필요합니다.
  const first = selfCheck(draft, "");
  const { draft: fixed, repaired } = await repairRisks(draft, first);
  return {
    ...fixed,
    repaired,
    sourceRead: !!page,
    audit: repaired ? selfCheck(fixed, "") : first,
  };
}

// ────────────────────────────────────────────────────────────
// 키워드 찾기
//
// ⚠️ 네이버 검색광고 키가 있으면 진짜 검색량을 줍니다. 없으면 AI가 후보만 냅니다.
// 그때 숫자를 지어내면 안 됩니다. 사장님이 그 숫자를 믿고 키워드를 고르니까요.
// 없으면 없다고 말합니다.
// ────────────────────────────────────────────────────────────
function levelOf(total, comp) {
  if (comp === "높음") return "어려움";
  if (comp === "낮음") return "쉬움";
  if (total != null && total >= 30000) return "어려움";
  if (total != null && total <= 3000) return "쉬움";
  return "보통";
}

async function keywords({ seed } = {}) {
  const s = String(seed || "").trim();
  if (!s) {
    const e = new Error("기준 키워드를 넣어주세요.");
    e.status = 400;
    throw e;
  }

  try {
    const rows = await getRelatedKeywords(s);
    if (rows && rows.length) {
      // 검색량이 많은 순으로 보여줍니다. 네이버가 주는 순서는 관련도 순이라
      // 정작 노릴 만한 게 아래쪽에 묻힙니다.
      const list = rows.map((r) => {
        const pc = r.monthlyPcQcCnt;
        const mobile = r.monthlyMobileQcCnt;
        const total = (pc == null && mobile == null) ? null : (pc || 0) + (mobile || 0);
        return { keyword: r.keyword, pc, mobile, total, level: levelOf(total, r.compIdx) };
      });
      list.sort((a, b) => (b.total || 0) - (a.total || 0));
      return {
        keywords: list.slice(0, 25),
        note: "네이버 검색광고 기준 월 검색량입니다. 합계가 크면서 경쟁이 '쉬움'인 것이 노리기 좋습니다.",
      };
    }
  } catch { /* 키가 없거나 실패하면 아래로 */ }

  if (!isConfigured()) {
    return { keywords: [], note: "네이버 검색광고 키가 없어 검색량을 가져오지 못했습니다." };
  }

  const data = await jsonFromClaude({
    system:
      "한국 네이버 블로그 키워드를 찾아주는 도우미입니다.\n\n" +
      "⚠️ 검색량 숫자를 지어내지 마세요. 숫자를 넣을 수 있는 자리가 없습니다. " +
      "왜 이 키워드가 쓸만한지 짧은 메모만 답니다.\n\n" +
      '{ "keywords": [ { "keyword": "...", "hint": "한 줄 메모" } ] } 형태의 JSON만 출력하세요.',
    user:
      `기준 키워드: ${s}\n\n` +
      `이 키워드로 블로그를 쓴다면 함께 노려볼 만한 연관 키워드 20개를 뽑아주세요. ` +
      `너무 큰 것보다 경쟁이 덜한 긴 키워드를 섞어주세요.`,
    maxTokens: 2500,
    temperature: 0.7,
  });

  return {
    keywords: (Array.isArray(data.keywords) ? data.keywords : [])
      .map((k) => ({ keyword: String(k.keyword || "").trim(), hint: String(k.hint || "").trim() }))
      .filter((k) => k.keyword)
      .slice(0, 25),
    note: "⚠️ 검색량은 없습니다 — 네이버 검색광고 키를 넣으시면 실제 숫자가 나옵니다. 지금은 AI가 고른 후보입니다.",
  };
}

module.exports = { write, parse, product, keywords, clean, blocksToHtml };
