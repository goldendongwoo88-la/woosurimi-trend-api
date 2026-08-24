// 블로그 글 / 브랜드(쇼핑) 커넥트 링크를 넣으면, 그 페이지에 실제로 있는 사진과 본문
// 문장을 가지고 숏폼용 "장면(씬) 기획안"을 자동으로 짜주는 모듈입니다.
//
// ⚠️ 여기서 만드는 건 "실제 영상 파일(mp4)"이 아니라, 영상을 만들기 위한 기획 단계입니다
// — 어떤 사진을 몇 번째 장면에 쓰고, 그 장면에서 어떤 자막/멘트를 읽을지 짜주는 대본입니다.
// 사진과 문장은 전부 원문 페이지에서 실제로 가져온 것이라 가짜로 지어낸 내용이 아닙니다.
// AI가 문장을 새로 창작하는 게 아니라, 원문에서 핵심 문장을 골라 장면 순서대로 배치하는
// 방식이라 — 실제 촬영/제작 전에 사람이 한 번 다듬어서 쓰는 걸 추천합니다.

const { extractPageData } = require("./pageExtractor");

function splitSentences(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickSceneSentences(sentences, count) {
  const usable = sentences.filter((s) => s.length >= 10 && s.length <= 90);
  if (usable.length >= count) return usable.slice(0, count);
  // 적당한 길이 문장이 부족하면 짧더라도 있는 대로 채웁니다.
  return sentences.filter((s) => s.length >= 4).slice(0, count);
}

function extractHashtags(text, extra = []) {
  const words = text.match(/[가-힣]{2,6}/g) || [];
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const tags = [...new Set([...extra, ...sorted])].slice(0, 8);
  return tags.map((t) => `#${t}`);
}

function findPrice(text) {
  const m = (text || "").match(/[\d,]{3,}\s*원/);
  return m ? m[0] : null;
}

/**
 * source: "blog" | "shopping" — 문구 톤(후킹 멘트, CTA)만 살짝 다르게 짭니다.
 * sceneCount: 몇 개의 장면으로 나눌지 (기본 6개 — 숏폼 15~30초 분량 감안)
 */
async function planShortform(url, source = "blog", sceneCount = 6) {
  const page = await extractPageData(url);
  const sentences = splitSentences(page.bodyText || page.description);
  const sceneSentences = pickSceneSentences(sentences, sceneCount);
  const price = source === "shopping" ? findPrice(page.bodyText) : null;

  const hook =
    source === "shopping"
      ? (page.title ? `"${page.title}" 이거 실화야?!` : "이 상품 실화야?!")
      : (page.title ? `"${page.title}" — 요즘 이거 아세요?` : "요즘 화제인 이 이야기, 아세요?");

  const cta =
    source === "shopping"
      ? "지금 바로 링크 확인하고 득템하세요! (구매 링크는 설명란에 있어요)"
      : "더 자세한 내용은 원문 링크에서 확인해보세요! 팔로우 하고 더 많은 정보 받아가세요 :)";

  // 씬 1은 항상 오프닝 후킹, 마지막 씬은 항상 CTA로 고정하고, 그 사이를 본문 문장으로 채웁니다.
  const middleCount = Math.max(sceneCount - 2, 1);
  const middleSentences =
    sceneSentences.length > 0
      ? sceneSentences.slice(0, middleCount)
      : [page.description || "원문에서 핵심 문장을 찾지 못했어요 — 원문을 직접 확인해 주세요."];

  const images = page.images && page.images.length ? page.images : [];
  const pickImage = (idx) => (images.length ? images[idx % images.length] : null);

  const scenes = [];
  scenes.push({ index: 1, role: "hook", caption: hook, image: pickImage(0) });
  middleSentences.forEach((sentence, i) => {
    scenes.push({ index: scenes.length + 1, role: "body", caption: sentence, image: pickImage(i + 1) });
  });
  scenes.push({
    index: scenes.length + 1,
    role: "cta",
    caption: price ? `${cta}\n가격: ${price}` : cta,
    image: pickImage(scenes.length),
  });

  const fullScript = scenes.map((s) => `[씬 ${s.index}] ${s.caption}`).join("\n\n");

  return {
    sourceUrl: url,
    source,
    sourceTitle: page.title,
    price,
    imagesFound: images.length,
    scenes,
    fullScript,
    hashtags: extractHashtags(page.title + " " + page.description, source === "shopping" ? ["추천템", "득템"] : []),
    note:
      "사진과 문장은 원문 페이지에서 실제로 가져온 것이며, AI가 새로 창작한 내용이 아니라 원문 핵심 문장을 골라 장면 순서로 배치한 초안입니다. 실제 게시 전에는 직접 검수·수정해서 쓰는 걸 권장하고, 본인 소유가 아닌 페이지의 사진을 쓸 때는 저작권/사용권을 꼭 확인해 주세요.",
  };
}

module.exports = { planShortform };
