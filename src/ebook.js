/**
 * 전자책 만들기.
 *
 * ⚠️ 전자책은 재고도 배송도 없고 한 번 만들면 계속 팔립니다. 그런데 그래서
 * 아무나 만들고, 그래서 대부분 안 팔립니다. 차이는 하나뿐입니다 —
 * **그 사람만 아는 게 들어 있는가.**
 *
 * 그래서 이 모듈은 "AI야 전자책 써줘"가 아닙니다. 쓰는 사람이 실제로 아는 것을
 * 재료로 받아서, 그것만 가지고 씁니다. 재료가 없으면 지어내지 말라고 못을 박습니다.
 * 지어낸 전자책은 한 번은 팔려도 환불과 악평으로 돌아옵니다.
 *
 * ⚠️ 장별로 따로 씁니다. 한 번에 쓰라고 하면 뒤로 갈수록 내용이 묽어지고,
 * 하나가 실패하면 통째로 날아갑니다.
 */

const { callClaude, isConfigured, extractJson } = require("./claudeClient");

const VOICE = `
[문체]
· 읽는 사람에게 말하듯 씁니다. 강의록이 아니라 편지에 가깝게요.
· 한 문단은 3~5문장. 길면 화면에서 벽처럼 보입니다.
· 전문 용어를 쓰면 바로 옆에 뜻을 풀어주세요.
· "~할 수 있습니다"보다 "~하세요"가 낫습니다. 사는 사람은 답을 원합니다.

[하지 말 것]
· 원론적인 소리로 분량을 채우지 마세요. "꾸준함이 중요합니다" 같은 말이요.
  그건 돈 내고 볼 이유가 없습니다.
· **확인 안 된 숫자를 지어내지 마세요.** 이게 제일 중요합니다.
  "평균 30% 상승" 같은 걸 만들어내면 그 한 줄 때문에 책 전체가 의심받습니다.
  근거가 있는 숫자만 쓰고, 없으면 숫자 없이 쓰세요.
· 수익을 약속하지 마세요. "월 300 보장" 같은 말은 표시광고법에 걸립니다.
· 남의 저작물을 그대로 옮기지 마세요.
`.trim();

/**
 * 목차를 짭니다.
 *
 * ⚠️ 목차가 곧 상품 설명입니다. 사는 사람은 목차를 보고 결정합니다.
 * 그래서 목차부터 사람이 확인하고 고칠 수 있게 따로 뺐습니다.
 */
async function outline({ topic, audience, material = "", chapters = 8 } = {}) {
  if (!isConfigured()) {
    const e = new Error("AI가 연결되지 않았습니다."); e.status = 503; throw e;
  }
  if (!String(topic || "").trim()) {
    const e = new Error("무엇에 대한 책인지 알려주세요."); e.status = 400; throw e;
  }

  const data = await callClaude({
    system:
      "한국에서 팔리는 실용 전자책의 목차를 짭니다.\n\n" +
      "⚠️ 목차가 곧 상품 설명입니다. 사는 사람은 목차만 보고 결정합니다.\n" +
      "  나쁜 예: '1장 블로그란 무엇인가' — 돈 내고 볼 이유가 없습니다\n" +
      "  좋은 예: '1장 왜 내 글은 3일 만에 뒤로 밀리는가' — 겪은 사람이 아는 문제\n\n" +
      "⚠️ 각 장은 **하나의 구체적인 문제**를 해결해야 합니다.\n" +
      "  개론 → 각론 순서로 늘어놓지 마세요. 급한 것부터 놓습니다.\n\n" +
      VOICE + "\n\n" +
      '{"title":"책 제목","subtitle":"부제","promise":"이 책을 읽으면 무엇이 달라지는지 한 줄",' +
      '"chapters":[{"title":"장 제목","points":["다룰 것1","다룰 것2","다룰 것3"]}]} JSON만 출력하세요.',
    messages: [{
      role: "user",
      content:
        `주제: ${topic}\n` +
        `읽을 사람: ${audience || "이 주제를 처음 시작하는 사람"}\n` +
        `장 수: ${chapters}개\n\n` +
        (material
          ? `⚠️ 아래는 글쓴이가 실제로 아는 것입니다. **이 안에서만** 목차를 짜세요.\n` +
            `여기 없는 내용을 지어내서 장을 만들지 마세요.\n\n${material}`
          : `⚠️ 재료가 주어지지 않았습니다. 일반적인 목차를 짜되, ` +
            `구체적인 수치나 사례는 넣지 마세요. 글쓴이가 채울 자리로 남겨두세요.`),
    }],
    maxTokens: 2500,
    temperature: 0.8,
  });

  const parsed = extractJson(data);
  if (!parsed || !Array.isArray(parsed.chapters) || !parsed.chapters.length) {
    throw new Error("목차를 만들지 못했습니다. 한 번 더 눌러주세요.");
  }
  return {
    title: String(parsed.title || topic).trim(),
    subtitle: String(parsed.subtitle || "").trim(),
    promise: String(parsed.promise || "").trim(),
    chapters: parsed.chapters.map((c) => ({
      title: String(c.title || "").trim(),
      points: (Array.isArray(c.points) ? c.points : []).map((p) => String(p).trim()).filter(Boolean),
    })).filter((c) => c.title),
  };
}

/**
 * 지어낸 약어 풀이를 찾아냅니다.
 *
 * ⚠️ 숫자 검사만으로는 부족했습니다. 실제로 이런 문장이 두 권 모두에서 나왔습니다.
 *   1권: "D.I.A. 기준입니다. Depth(깊이), Image(시각 자료), Action(행동 유도)의 약자인데"
 *   2권: "AEO 시대가 왔습니다. AI Engine Optimization."
 * 둘 다 틀렸습니다. D.I.A.는 Deep Intent Analysis이고 AEO는 Answer Engine Optimization입니다.
 *
 * 그럴듯하게 지어낸 약어 풀이는 숫자보다 더 위험합니다. 아는 사람이 보면
 * 바로 알아보고, 그 순간 책 전체가 아마추어가 됩니다.
 * 그래서 약어 옆에 영어 풀이가 붙으면 미리 정해둔 정답과 대조합니다.
 */
const TERMS = {
  "D.I.A": "Deep Intent Analysis",
  "DIA": "Deep Intent Analysis",
  "AEO": "Answer Engine Optimization",
  "SEO": "Search Engine Optimization",
  "C-Rank": "Creator Rank",
  "CTR": "Click Through Rate",
  "CPC": "Cost Per Click",
};

/**
 * ⚠️ 처음 짠 정규식은 반대로 동작했습니다 — 틀린 걸 통과시키고 맞는 걸 잡았어요.
 * "Depth(깊이)"는 괄호 때문에, "AI Engine"은 AI가 소문자로 안 이어져서 안 걸렸고,
 * 정작 맞게 쓴 문장은 '약자'라는 단어 하나 때문에 걸렸습니다.
 *
 * 그래서 규칙을 단순하게 바꿨습니다. 약어 뒤 80자를 통째로 떼어내서
 *   (1) 풀이처럼 보이는 게 있는가 — 영어 낱말 두 개 이상, 또는 '약자/약어'
 *   (2) 있다면 정답이 그 안에 들어 있는가
 * 두 가지만 봅니다. 정답이 없으면 지적합니다.
 */
function checkTerms(text) {
  const bad = [];
  const s = String(text);

  for (const [abbr, right] of Object.entries(TERMS)) {
    const esc = abbr.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    const re = new RegExp(esc, "g");
    for (const m of s.matchAll(re)) {
      const after = s.slice(m.index, m.index + 90);

      // 풀이가 붙어 있는가?
      const hasEnglishGloss = /[A-Za-z]{3,}(?:[\s(),]+[A-Za-z]{3,}){1,3}/.test(
        after.slice(abbr.length)
      );
      const saysAbbrev = /약자|약어|줄임말|의\s*뜻은/.test(after);
      if (!hasEnglishGloss && !saysAbbrev) continue;   // 그냥 약어만 쓴 것 — 문제 없음

      // 정답이 그 안에 있으면 맞게 쓴 것입니다.
      const flat = after.replace(/\s+/g, " ").toLowerCase();
      if (flat.includes(right.toLowerCase())) continue;

      // 정답의 첫 낱말만 맞아도 봐줍니다 ("Deep Intent"까지만 쓴 경우)
      const firstTwo = right.split(" ").slice(0, 2).join(" ").toLowerCase();
      if (firstTwo && flat.includes(firstTwo)) continue;

      bad.push({
        abbr,
        wrote: after.slice(abbr.length).replace(/\s+/g, " ").trim().slice(0, 46),
        should: right,
      });
    }
  }

  // 같은 지적이 여러 번 나오지 않게 합칩니다
  const seen = new Set();
  return bad.filter((b) => {
    const k = b.abbr;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 정확한 뜻을 프롬프트에 못 박아둘 문구. 재료에 붙여서 씁니다. */
const TERM_NOTE = `
[약어 — 지어내지 마세요]
확실하지 않으면 **풀어쓰지 말고 약어 그대로 두세요.** 지어낸 풀이는 숫자보다 위험합니다.
· D.I.A. = Deep Intent Analysis (네이버의 문서 의도 분석 모델)
  ⚠️ "Detail, Image, Action"이나 "Depth, Image, Action"이 아닙니다. 그렇게 쓰지 마세요.
· D.I.A.+ = D.I.A.의 확장 모델
· C-Rank = 블로그(출처) 단위의 신뢰도 평가
· AEO = Answer Engine Optimization (답변 엔진 최적화)
  ⚠️ "AI Engine Optimization"이 아닙니다.
`.trim();

/**
 * 근거 없는 숫자를 찾아냅니다.
 *
 * ⚠️ 프롬프트에 "숫자를 지어내지 마세요"라고 못을 박아도 뚫립니다.
 * 실제로 첫 책에서 "방문자 200명으로 월 80만원 버는 사람도 있습니다",
 * "클릭 단가는 50원 정도입니다" 같은 문장이 나왔습니다. 재료에 없는 숫자입니다.
 *
 * 파는 책입니다. 지어낸 숫자 하나가 들통나면 책 전체가 의심받고,
 * 수익을 암시하는 숫자는 표시광고법 문제까지 됩니다.
 * 그래서 막는 걸로 끝내지 않고 **재료와 대조해서 잡아냅니다.**
 */
function checkNumbers(text, material) {
  // 돈·비율·배수처럼 사실 주장이 되는 숫자만 봅니다.
  // 장 번호나 "세 가지" 같은 건 문제가 아닙니다.
  const found = [...new Set(
    [...String(text).matchAll(/[\d,]+(?:\.\d+)?\s*(?:%|배|원|만원|억|천만|달러)/g)]
      .map((m) => m[0].replace(/\s/g, ""))
  )];

  const mat = String(material).replace(/\s/g, "");
  const suspects = [];
  for (const n of found) {
    if (mat.includes(n)) continue;                     // 재료에 그대로 있음
    const bare = n.replace(/[,]/g, "");
    if (mat.includes(bare)) continue;
    // 재료의 숫자에서 계산으로 나올 수 있는 것(예: 136만/560만 = 0.24원)은
    // 여기서 가려낼 수 없습니다. 그래서 "의심"이라고만 하고 사람이 보게 합니다.
    suspects.push(n);
  }
  return suspects;
}

/**
 * 근거 없는 숫자를 걷어냅니다.
 *
 * ⚠️ 숫자를 다른 숫자로 바꾸지 않습니다. 그것도 지어내는 겁니다.
 * 숫자를 빼고 문장이 살아 있게 고칩니다.
 * "클릭 단가는 50원 정도입니다" → "클릭 단가가 낮은 편입니다"
 */
async function stripUnsourcedNumbers(text, suspects, material) {
  if (!suspects.length) return { text, fixed: 0 };
  try {
    const out = await callClaude({
      system:
        "글에서 근거 없는 숫자만 걷어냅니다.\n\n" +
        "⚠️ 숫자를 **다른 숫자로 바꾸지 마세요.** 그것도 지어내는 겁니다.\n" +
        "   숫자를 빼되 문장의 뜻은 살리세요.\n" +
        "   예) '클릭 단가는 50원 정도입니다' → '클릭 단가가 낮은 편입니다'\n" +
        "   예) '방문자 200명으로 월 80만원 버는 사람도 있습니다'\n" +
        "       → '방문자가 적어도 수익이 잘 나오는 경우가 있습니다'\n\n" +
        "⚠️ 아래 [근거 있는 숫자]에 들어 있는 값은 건드리지 마세요.\n\n" +
        '{"fixes":[{"before":"원래 문장","after":"고친 문장"}]} JSON만 출력하세요.',
      messages: [{
        role: "user",
        content:
          `[근거 있는 숫자 — 이건 그대로 두세요]\n${material.slice(0, 4000)}\n\n` +
          `[근거를 못 찾은 숫자]\n${suspects.join(", ")}\n\n` +
          `[글]\n${text}`,
      }],
      maxTokens: 3000,
      temperature: 0.3,
    });
    const map = (extractJson(out) || {}).fixes || [];
    let fixed = 0, t = text;
    for (const f of map) {
      const before = String(f.before || "").trim();
      const after = String(f.after || "").trim();
      if (before && after && t.includes(before)) { t = t.split(before).join(after); fixed++; }
    }
    return { text: t, fixed };
  } catch {
    return { text, fixed: 0 };   // 못 고쳐도 원고는 살립니다. 대신 의심 목록을 남깁니다.
  }
}

/** 한 장을 씁니다. */
async function writeChapter(book, index, { material = "", words = 1800 } = {}) {
  if (!isConfigured()) {
    const e = new Error("AI가 연결되지 않았습니다."); e.status = 503; throw e;
  }
  const ch = book.chapters[index];
  if (!ch) throw new Error("그런 장이 없습니다.");

  const others = book.chapters
    .map((c, i) => `${i + 1}. ${c.title}${i === index ? "  ← 지금 쓸 장" : ""}`)
    .join("\n");

  return callClaude({
    system:
      `"${book.title}"이라는 전자책의 한 장을 씁니다.\n\n` +
      VOICE + "\n\n" +
      "⚠️ 다른 장에서 다룰 내용까지 끌어오지 마세요. 이 장의 몫만 씁니다.\n" +
      "⚠️ 소제목은 대괄호로 감쌉니다. 예) [첫 세 줄이 전부입니다]\n" +
      "⚠️ 구체적인 예시를 최소 두 개 넣으세요. 원론만 있으면 돈 낸 사람이 화납니다.",
    messages: [{
      role: "user",
      content:
        `[책 전체 목차]\n${others}\n\n` +
        `[이번 장]\n${ch.title}\n` +
        (ch.points.length ? `다룰 것:\n${ch.points.map((p) => "· " + p).join("\n")}\n` : "") +
        (material ? `\n[글쓴이가 아는 것 — 여기 있는 것만 쓰세요]\n${material}\n` : "") +
        `\n${words}자 안팎으로 써 주세요.`,
    }],
    maxTokens: Math.max(3000, Math.round(words * 2.4)),
    temperature: 0.82,
    timeoutMs: 150000,
  });
}

/** 머리말 — 사는 사람이 미리보기로 보는 부분이라 여기서 승부가 납니다. */
async function writeIntro(book, { material = "" } = {}) {
  return callClaude({
    system:
      "전자책의 머리말을 씁니다.\n\n" + VOICE + "\n\n" +
      "⚠️ 머리말은 미리보기로 공개되는 부분입니다. 여기서 살지 말지가 갈립니다.\n" +
      "  · 읽는 사람이 지금 겪고 있는 문제를 먼저 짚으세요\n" +
      "  · 이 책이 무엇을 해주고 **무엇은 못 해주는지** 분명히 하세요\n" +
      "  · 과장하지 마세요. 과장한 머리말은 환불로 돌아옵니다\n" +
      "⚠️ 소제목은 대괄호로 감쌉니다.",
    messages: [{
      role: "user",
      content:
        `제목: ${book.title}\n부제: ${book.subtitle}\n약속: ${book.promise}\n\n` +
        `목차:\n${book.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}\n` +
        (material ? `\n[글쓴이가 아는 것]\n${material}\n` : "") +
        `\n900자 안팎으로.`,
    }],
    maxTokens: 2000,
    temperature: 0.85,
  });
}

/**
 * 다 쓴 원고를 읽을 수 있는 파일로.
 *
 * ⚠️ PDF로 바로 만들지 않고 HTML로 냅니다. 브라우저에서 열어
 * Ctrl+P → PDF 저장하면 되고, 그래야 사장님이 내용을 고칠 수 있습니다.
 * PDF로 굳혀버리면 오타 하나 고치는 데도 전부 다시 만들어야 합니다.
 */
function toHtml(book, parts) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const render = (text) => String(text || "").split(/\n{2,}/).map((para) => {
    const m = para.trim().match(/^\[(.+?)\]\s*$/);
    if (m) return `<h3>${esc(m[1])}</h3>`;
    return `<p>${esc(para.trim()).replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(book.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;600&display=swap">
<style>
  :root{--ink:#1E1B16;--ink2:#4A4335;--ink3:#8A7F6B;--line:#DED6C6;--paper:#FCFAF5;--gold:#8A6A1F}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"IBM Plex Sans KR",-apple-system,sans-serif;font-size:16px;line-height:2}
  .book{max-width:680px;margin:0 auto;padding:60px 24px 100px}
  .cover{text-align:center;padding:90px 0 70px;border-bottom:3px double var(--line);margin-bottom:50px}
  .cover h1{font-family:"Noto Serif KR",serif;font-size:34px;font-weight:700;
    line-height:1.4;margin:0 0 14px;letter-spacing:-.02em}
  .cover .sub{color:var(--ink2);font-size:16px;margin:0 0 26px}
  .cover .promise{display:inline-block;border:1px solid var(--line);border-radius:4px;
    padding:12px 20px;font-size:14px;color:var(--gold);max-width:30em;line-height:1.75}
  h2{font-family:"Noto Serif KR",serif;font-size:25px;font-weight:700;margin:56px 0 8px;
    padding-top:36px;border-top:1px solid var(--line);letter-spacing:-.02em;line-height:1.45}
  h2 .no{display:block;font-family:"IBM Plex Sans KR";font-size:12px;color:var(--gold);
    letter-spacing:.2em;margin-bottom:10px;font-weight:600}
  h3{font-family:"Noto Serif KR",serif;font-size:18px;font-weight:700;margin:34px 0 10px}
  p{margin:0 0 17px;color:var(--ink2)}
  .toc{background:#fff;border:1px solid var(--line);border-radius:4px;padding:26px 30px;margin-bottom:40px}
  .toc h3{margin:0 0 14px;font-size:16px}
  .toc ol{margin:0;padding-left:20px}
  .toc li{margin-bottom:7px;font-size:14.5px;color:var(--ink2)}
  footer{margin-top:70px;padding-top:24px;border-top:1px solid var(--line);
    font-size:12.5px;color:var(--ink3);line-height:1.9}
  @media print{
    body{background:#fff;font-size:11pt}
    .book{max-width:none;padding:0}
    h2{page-break-before:always;page-break-after:avoid}
    .cover{page-break-after:always}
    h3{page-break-after:avoid}
    p{orphans:3;widows:3}
    @page{margin:20mm 18mm}
  }
</style></head><body>
<div class="book">
  <div class="cover">
    <h1>${esc(book.title)}</h1>
    ${book.subtitle ? `<p class="sub">${esc(book.subtitle)}</p>` : ""}
    ${book.promise ? `<div class="promise">${esc(book.promise)}</div>` : ""}
  </div>

  <div class="toc">
    <h3>차례</h3>
    <ol>${book.chapters.map((c) => `<li>${esc(c.title)}</li>`).join("")}</ol>
  </div>

  ${parts.intro ? `<div>${render(parts.intro)}</div>` : ""}

  ${book.chapters.map((c, i) => `
    <h2><span class="no">${String(i + 1).padStart(2, "0")}</span>${esc(c.title)}</h2>
    ${parts.chapters[i] ? render(parts.chapters[i]) : `<p style="color:var(--ink3)">(아직 안 썼습니다)</p>`}
  `).join("")}

  <footer>
    이 책의 내용은 작성 시점의 정보이며, 플랫폼 정책과 알고리즘은 수시로 바뀝니다.<br>
    수익은 개인의 실행과 여건에 따라 달라지며 어떤 결과도 보장하지 않습니다.
  </footer>
</div>
</body></html>`;
}

module.exports = {
  outline, writeChapter, writeIntro, toHtml, VOICE,
  checkNumbers, stripUnsourcedNumbers,
  checkTerms, TERMS, TERM_NOTE,
};
