/**
 * 스레드 쇼핑 글 만들기.
 *
 * ⚠️ 영상 250편을 분석했을 때, 진입장벽이 가장 낮았던 방법이 이겁니다.
 * 사진 한 장과 짧은 글이 전부입니다. 편집도, 구독자도, 자본금도 필요 없습니다.
 *
 * ⚠️ 그런데 그 영상들이 가르치는 방식에는 문제가 하나 있었습니다.
 * "샤오홍슈에서 사진 가져와서 쓰세요, 국가 간 법적 이슈가 없어서 안 걸립니다."
 * 남의 사진입니다. 사장님은 채널을 다섯 개 키워두셨고, 두 분 다 10년 넘은
 * 인플루언서입니다. 몇 만원 벌자고 걸 판돈이 아닙니다.
 * 그래서 이 도구는 **직접 찍은 사진**만 받습니다.
 *
 * ⚠️ 그리고 스레드에서 광고처럼 쓰면 바로 죽습니다. 생활에서 쓰는 말이어야 합니다.
 * "다 들뜨고 건조해서 미칠 것 같았음" 같은 결이요. 그게 프롬프트의 핵심입니다.
 */

const { callClaude, isConfigured, extractJson } = require("./claudeClient");
const { generateCaptionFromImage } = require("./imageCaption");

// 쿠팡파트너스가 요구하는 문구. 없으면 수익을 안 주고, 이미 받은 것도 몰수될 수 있습니다.
const COUPANG_MARK =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

const STYLE = `
[스레드에서 먹히는 글]

⚠️ 광고처럼 쓰면 그 순간 죽습니다. 사람들이 광고를 귀신같이 알아봅니다.
생활에서 쓰는 말로, 혼잣말하듯 쓰세요.

좋은 예:
  "다 들뜨고 건조해서 미칠 것 같았는데"
  "올리브영 갔다가 그냥 집어왔는데 이게 물건이네"
  "이거 나만 몰랐던 거야?"

나쁜 예:
  "이 제품은 뛰어난 보습력을 자랑합니다"
  "지금 구매하시면 할인됩니다"
  "강력 추천드립니다!"

[형식]
· 3~6줄. 길면 안 읽습니다.
· 한 줄에 한 호흡. 줄바꿈을 아끼지 마세요.
· 마지막 줄은 여운이나 질문으로. 댓글이 달려야 퍼집니다.
· 해시태그를 본문에 쑤셔 넣지 마세요. 스레드에서는 오히려 광고처럼 보입니다.

[하지 말 것]
· 효능을 단정하지 마세요 — "주름이 없어집니다" 금지 (화장품법 위반)
· 최고·1위·100% 금지 (표시광고법)
· 가격을 단정하지 마세요. 자주 바뀝니다. "만원대" 정도로.
`.trim();

/**
 * 사진을 보고 스레드 글을 씁니다.
 *
 * @param {string[]} imagePaths 직접 찍은 사진들
 * @param {object} opts
 * @param {string} opts.note    직접 써본 느낌 (있으면 글이 훨씬 좋아집니다)
 * @param {string} opts.product 제품 이름 (모르면 사진에서 읽어냅니다)
 * @param {boolean} opts.affiliate 쿠팡 링크를 달 것인가 → 광고 표기가 붙습니다
 */
async function fromPhotos(imagePaths, { note = "", product = "", affiliate = true } = {}) {
  if (!isConfigured()) {
    const e = new Error("AI가 연결되지 않았습니다.");
    e.status = 503;
    throw e;
  }
  if (!imagePaths || !imagePaths.length) {
    const e = new Error("사진을 한 장 이상 올려주세요.");
    e.status = 400;
    throw e;
  }

  // 사진에서 무엇이 보이는지 먼저 읽습니다.
  // ⚠️ 한 장이라도 실패하면 나머지로 계속합니다. 사진 하나 때문에 전체가 죽으면 안 됩니다.
  const seen = [];
  for (const p of imagePaths.slice(0, 4)) {
    try {
      const c = await generateCaptionFromImage(p, product, note);
      if (c) seen.push(c);
    } catch { /* 이 사진은 건너뜁니다 */ }
  }

  const data = await callClaude({
    system:
      "스레드(Threads)에 올릴 짧은 글을 쓰는 사람입니다.\n\n" +
      STYLE + "\n\n" +
      '{"posts":[{"text":"글 본문","why":"이 글이 먹힐 것 같은 이유 한 줄"}]} JSON만 출력하세요.\n' +
      "서로 결이 다른 글 3개를 주세요. 하나는 정보형, 하나는 경험담, 하나는 질문형으로요.",
    messages: [{
      role: "user",
      content:
        (product ? `제품: ${product}\n` : "") +
        (seen.length ? `사진에서 보이는 것:\n${seen.map((s) => "· " + s).join("\n")}\n\n` : "") +
        (note ? `직접 써본 느낌 (이게 글의 중심입니다):\n${note}\n\n` : "") +
        `이 사진들로 스레드 글 3개를 써 주세요.` +
        (note ? "" : "\n\n⚠️ 직접 써본 느낌이 없으니, 사진에서 보이는 것만 가지고 쓰세요. 써보지 않은 걸 써본 것처럼 쓰지 마세요."),
    }],
    maxTokens: 1800,
    temperature: 0.95,
  });

  const parsed = extractJson(data) || {};
  const posts = (Array.isArray(parsed.posts) ? parsed.posts : [])
    .map((p) => ({
      text: String(p.text || "").trim(),
      why: String(p.why || "").trim(),
    }))
    .filter((p) => p.text)
    .slice(0, 4);

  if (!posts.length) throw new Error("글을 만들지 못했습니다. 한 번 더 눌러주세요.");

  return {
    posts,
    seen,
    // ⚠️ 댓글에 넣을 것. 본문에 링크를 넣으면 스레드가 노출을 줄입니다.
    comment: affiliate
      ? `${COUPANG_MARK}\n\n👉 (여기에 쿠팡파트너스 링크)`
      : "",
    reminder: affiliate
      ? "링크를 다실 거면 광고 표기를 반드시 함께 넣으세요. 없으면 쿠팡이 수익을 지급하지 않고, 이미 받은 것도 몰수될 수 있습니다."
      : "",
  };
}

/**
 * 사진 없이 제품 이름만으로.
 *
 * ⚠️ 사진이 없으면 글이 확실히 약해집니다. 그래도 막지는 않습니다 —
 * 급할 때가 있으니까요. 대신 지어내지 않도록 못을 박습니다.
 */
async function fromProduct({ product, note = "", affiliate = true } = {}) {
  if (!isConfigured()) {
    const e = new Error("AI가 연결되지 않았습니다.");
    e.status = 503;
    throw e;
  }
  if (!String(product || "").trim()) {
    const e = new Error("제품 이름을 넣어주세요.");
    e.status = 400;
    throw e;
  }

  const data = await callClaude({
    system:
      "스레드(Threads)에 올릴 짧은 글을 쓰는 사람입니다.\n\n" +
      STYLE + "\n\n" +
      "⚠️ 사진이 없습니다. 그래서 **확인되지 않은 것을 쓰면 안 됩니다.**\n" +
      "성분·용량·가격·효능처럼 확인 못 한 건 아예 빼세요.\n" +
      "제품 이름과 사용자가 알려준 것만 가지고 쓰세요.\n\n" +
      '{"posts":[{"text":"글 본문","why":"이 글이 먹힐 것 같은 이유 한 줄"}]} JSON만 출력하세요. 3개를 주세요.',
    messages: [{
      role: "user",
      content: `제품: ${product}\n` + (note ? `\n직접 써본 느낌:\n${note}` : ""),
    }],
    maxTokens: 1800,
    temperature: 0.95,
  });

  const parsed = extractJson(data) || {};
  const posts = (Array.isArray(parsed.posts) ? parsed.posts : [])
    .map((p) => ({ text: String(p.text || "").trim(), why: String(p.why || "").trim() }))
    .filter((p) => p.text).slice(0, 4);
  if (!posts.length) throw new Error("글을 만들지 못했습니다.");

  return {
    posts, seen: [],
    comment: affiliate ? `${COUPANG_MARK}\n\n👉 (여기에 쿠팡파트너스 링크)` : "",
    reminder: affiliate
      ? "링크를 다실 거면 광고 표기를 반드시 함께 넣으세요."
      : "",
  };
}

module.exports = { fromPhotos, fromProduct, COUPANG_MARK, STYLE };
