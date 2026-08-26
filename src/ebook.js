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

module.exports = { outline, writeChapter, writeIntro, toHtml, VOICE };
