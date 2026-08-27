// 네이버 블로그로 넘기기 — 생성한 글을 붙여넣기 한 번으로 올릴 수 있게 다듬습니다.
//
// ⚠️ 먼저 분명히 해둘 것: **네이버 블로그에는 글쓰기 API가 없습니다.**
//
// 예전에는 네이버 오픈API에 블로그 글쓰기가 있었지만 2020년에 종료됐습니다.
// 지금은 외부 프로그램이 네이버 블로그에 글을 직접 발행할 수 있는 공식 방법이
// 존재하지 않습니다.
//
// 남은 방법은 두 가지인데, 하나는 쓰지 않습니다.
//
//   ❌ 자동 로그인해서 브라우저를 조종하는 방법
//      네이버 아이디와 비밀번호를 프로그램에 저장해야 합니다. 계정을 통째로
//      맡기는 셈이고, 네이버 이용약관에도 어긋나며, 캡차가 뜨면 어차피 멈춥니다.
//      계정이 잠길 위험까지 감수할 만한 이득이 없습니다.
//
//   ✅ 붙여넣기 한 번으로 끝내는 방법  ← 이걸 만듭니다
//      글을 스마트에디터가 알아먹는 서식으로 바꿔서 클립보드에 담고,
//      글쓰기 창을 열어줍니다. 사용자는 Ctrl+V 한 번만 누르면 됩니다.
//      제목·본문·태그가 각각 다른 칸에 들어가야 하므로 셋으로 나눠 담습니다.
//
// 결국 사람이 눌러야 하는 건 붙여넣기 세 번입니다. 완전 자동은 아니지만,
// 계정을 넘기지 않고 할 수 있는 최선입니다.

const { callClaude, extractJson } = require("./claudeClient");

/**
 * 대화 전체에서 발행할 글만 뽑아 정리합니다.
 *
 * 프롬프트 스킬들이 0~7단계로 진행되기 때문에, 마지막 응답에는 본문 말고도
 * 제목 후보 45개, 팩트체크 표, 이미지 프롬프트 같은 게 잔뜩 섞여 있습니다.
 * 그걸 사람이 골라내게 하면 붙여넣기보다 그 작업이 더 오래 걸립니다.
 *
 * 규칙으로 뽑아내려고도 해봤는데, 스킬마다 출력 모양이 달라서 번번이 어긋났습니다.
 * 그래서 Claude에게 한 번 더 물어 정리하게 합니다. 20초쯤 더 걸리지만 확실합니다.
 */
async function preparePost(conversationText, { hint = "" } = {}) {
  const system = `당신은 블로그 발행을 돕는 편집자입니다.

주어진 대화 기록에서 **실제로 발행할 글만** 골라내 정리하는 일을 합니다.

대화에는 발행할 글 말고도 이런 것들이 섞여 있습니다. 전부 버리세요.
- 제목 후보 목록 (45개, 50개 같은 것)
- 정보 수집 결과, 출처 링크 목록
- 팩트체크 표
- 이미지 생성 프롬프트, 손글씨 멘트 지시
- 인포그래픽 설계
- 단계 안내 문구 ("2단계로 넘어가겠습니다" 같은)
- 작성자 자신에게 하는 말

남길 것은 오직 **독자가 읽을 글**입니다.

반드시 JSON만 출력하세요. 앞뒤에 설명을 붙이지 마세요.

{
  "title": "제목 하나. 제목 후보가 여럿이면 가장 좋은 것 하나만 고르세요",
  "tags": ["태그", "다섯에서", "열개", "사이"],
  "blocks": [
    { "type": "h2", "text": "소제목" },
    { "type": "p", "text": "본문 문단" },
    { "type": "quote", "text": "인용하거나 강조할 한 줄" },
    { "type": "image", "text": "여기에 들어갈 사진 설명 (실제 이미지는 사용자가 넣습니다)" },
    { "type": "hr" }
  ]
}

blocks 규칙:
- 본문 순서 그대로 담습니다.
- 한 문단은 p 하나입니다. 문단을 합치거나 쪼개지 마세요.
- 원문에 소제목이 있으면 h2로 담습니다.
- 사진이 들어갈 자리가 원문에 표시돼 있으면 image 블록으로 자리만 남깁니다.
- 마크다운 기호(**, ##, - )는 전부 제거하고 순수한 글만 담으세요.
- 원문 문장을 바꾸지 마세요. 다듬지도 마세요. 그대로 옮기는 게 일입니다.`;

  const user = `아래 대화에서 발행할 글을 뽑아 정리해 주세요.${hint ? `\n\n참고: ${hint}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━
${conversationText.slice(0, 60000)}
━━━━━━━━━━━━━━━━━━━━━━━━

JSON만 출력하세요.`;

  const reply = await callClaude({
    feature: "블로그 내보내기",
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.2, // 옮겨 적는 일이라 창의성이 필요 없습니다
    timeoutMs: 180000,
  });

  const data = extractJson(reply);
  if (!data || !data.blocks) {
    throw new Error("발행할 글을 찾지 못했습니다. 글이 다 완성된 뒤에 눌러주세요.");
  }

  return {
    title: String(data.title || "").trim(),
    tags: Array.isArray(data.tags) ? data.tags.map((s) => String(s).replace(/^#/, "").trim()).filter(Boolean) : [],
    blocks: data.blocks.filter((b) => b && b.type),
  };
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 스마트에디터에 붙여넣을 HTML.
 *
 * ⚠️ 스마트에디터는 붙여넣은 HTML 중 일부만 받아들입니다. 클래스나 style 속성을
 * 잔뜩 붙여봐야 대부분 지워집니다. 그래서 태그를 최소한으로만 씁니다.
 * h2, p, blockquote, hr 정도면 서식이 살아서 들어갑니다.
 */
function toHtml(post) {
  const out = [];
  for (const b of post.blocks) {
    const text = esc(b.text || "");
    if (b.type === "h2") out.push(`<h2>${text}</h2>`);
    else if (b.type === "h3") out.push(`<h3>${text}</h3>`);
    else if (b.type === "quote") out.push(`<blockquote><p>${text}</p></blockquote>`);
    else if (b.type === "hr") out.push(`<hr>`);
    else if (b.type === "image") {
      // 실제 이미지는 사용자가 넣습니다. 자리만 눈에 띄게 표시해 둡니다.
      out.push(`<p>[ 사진 자리 — ${text} ]</p>`);
    } else out.push(`<p>${text}</p>`);
  }
  return out.join("\n");
}

/** 서식 없이 글만. HTML 붙여넣기가 막힌 곳을 위한 예비입니다. */
function toPlain(post) {
  const out = [];
  for (const b of post.blocks) {
    if (b.type === "hr") { out.push("─────────────"); continue; }
    if (b.type === "image") { out.push(`[ 사진 자리 — ${b.text || ""} ]`); continue; }
    if (b.type === "h2" || b.type === "h3") { out.push("", b.text || "", ""); continue; }
    if (b.type === "quote") { out.push(`❝ ${b.text || ""}`); continue; }
    out.push(b.text || "");
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 태그는 네이버에서 쉼표나 엔터로 구분해 넣습니다. */
function toTagLine(post) {
  return post.tags.map((t) => `#${t}`).join(" ");
}

/** 글 길이 — 네이버 홈판은 보통 1500자 이상을 선호한다고들 합니다. */
function stats(post) {
  const plain = toPlain(post);
  const chars = plain.replace(/\s/g, "").length;
  return {
    chars,
    withSpaces: plain.length,
    paragraphs: post.blocks.filter((b) => b.type === "p").length,
    headings: post.blocks.filter((b) => b.type === "h2" || b.type === "h3").length,
    images: post.blocks.filter((b) => b.type === "image").length,
    tags: post.tags.length,
  };
}

/**
 * 글쓰기 창 주소.
 * 블로그 아이디를 알면 그 사람 글쓰기 창으로, 모르면 공용 주소로 보냅니다.
 */
function writeUrl(blogId) {
  const id = String(blogId || "").trim();
  return id
    ? `https://blog.naver.com/${encodeURIComponent(id)}?Redirect=Write`
    : `https://blog.naver.com/GoBlogWrite.naver`;
}

module.exports = { preparePost, toHtml, toPlain, toTagLine, stats, writeUrl };
