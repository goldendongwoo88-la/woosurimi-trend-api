// 숏폼용 "장면(씬) 기획안"을 자동으로 짜주는 모듈입니다. 두 가지 방식을 지원합니다.
//   1) planShortform(url, source)   — 블로그/쇼핑/여행 커넥트 "링크"를 넣으면, 그 페이지에
//      실제로 있는 사진과 본문 문장을 그대로 가져와서 장면을 짭니다 (= "링크컷" 모드).
//   2) planFromPhotos(photos, topic, source) — 사용자가 직접 고른 사진들과 한 줄 주제를
//      넣으면, 그 사진들로 장면을 짭니다 (= "자동컷" 모드). 사진마다 캡션을 직접 안 넣으면
//      AI가 사진 내용을 알아서 "본" 것처럼 지어내지 않고, 정직하게 주제 문구를 짧게 변형한
//      일반적인 문구로 채웁니다 — 이미지 인식 AI가 붙어있지 않기 때문입니다.
//
// ⚠️ 두 방식 모두 "실제 영상 파일(mp4)"이 아니라, 영상을 만들기 위한 기획(대본) 단계입니다.
// 실제 mp4는 videoRenderer.js(및 /api/shortform/render)가 만듭니다.

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

// 소스 종류(블로그/쇼핑/여행)별로 후킹 멘트와 마무리 CTA 문구 톤만 살짝 다르게 짭니다.
const HOOK_BY_SOURCE = {
  shopping: (title) => (title ? `"${title}" 이거 실화야?!` : "이 상품 실화야?!"),
  travel: (title) => (title ? `"${title}" — 여기 실화냐?!` : "요즘 다들 여기 간대요"),
  blog: (title) => (title ? `"${title}" — 요즘 이거 아세요?` : "요즘 화제인 이 이야기, 아세요?"),
};
const CTA_BY_SOURCE = {
  shopping: "지금 바로 링크 확인하고 득템하세요! (구매 링크는 설명란에 있어요)",
  travel: "자세한 여행 코스는 원문 링크에서 확인해보세요! 저장하고 나중에 또 보세요 :)",
  blog: "더 자세한 내용은 원문 링크에서 확인해보세요! 팔로우 하고 더 많은 정보 받아가세요 :)",
};
const HASHTAG_EXTRA_BY_SOURCE = {
  shopping: ["추천템", "득템"],
  travel: ["여행스타그램", "여행코스"],
  blog: [],
};

function normalizeSource(source) {
  return ["shopping", "travel"].includes(source) ? source : "blog";
}

/**
 * source: "blog" | "shopping" | "travel" — 문구 톤(후킹 멘트, CTA)만 살짝 다르게 짭니다.
 * sceneCount: 몇 개의 장면으로 나눌지 (기본 6개 — 숏폼 15~30초 분량 감안)
 */
async function planShortform(url, source = "blog", sceneCount = 6) {
  const src = normalizeSource(source);
  const page = await extractPageData(url);
  const sentences = splitSentences(page.bodyText || page.description);
  const sceneSentences = pickSceneSentences(sentences, sceneCount);
  const price = src === "shopping" ? findPrice(page.bodyText) : null;

  const hook = HOOK_BY_SOURCE[src](page.title);
  const cta = CTA_BY_SOURCE[src];

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
    source: src,
    sourceTitle: page.title,
    price,
    imagesFound: images.length,
    scenes,
    fullScript,
    hashtags: extractHashtags(page.title + " " + page.description, HASHTAG_EXTRA_BY_SOURCE[src]),
    note:
      "사진과 문장은 원문 페이지에서 실제로 가져온 것이며, AI가 새로 창작한 내용이 아니라 원문 핵심 문장을 골라 장면 순서로 배치한 초안입니다. 실제 게시 전에는 직접 검수·수정해서 쓰는 걸 권장하고, 본인 소유가 아닌 페이지의 사진을 쓸 때는 저작권/사용권을 꼭 확인해 주세요.",
  };
}

/**
 * "자동컷" 모드 — 사용자가 직접 고른 사진들로 장면을 짭니다(외부 링크 없이).
 * photos: [{ url, caption }]  — url은 이 서버에 업로드된 사진의 경로(/uploads/...), caption은 선택
 * topic: 영상 전체 주제를 한 줄로 적은 것 (필수)
 * summaryText: (선택) 본문 요약을 문단으로 붙여넣으면, 블로그 링크 모드처럼 문장 단위로 잘라서
 *              사진 순서에 맞춰 캡션으로 씁니다. 안 넣으면 사진별 caption을 쓰거나, 그마저도
 *              없으면 "주제 + 포인트 번호" 형태의 일반적인 문구로 채웁니다(내용을 지어내지 않음).
 */
function planFromPhotos(photos, topic, { source = "blog", summaryText = "" } = {}) {
  const src = normalizeSource(source);
  const cleanTopic = (topic || "").trim() || "이 콘텐츠";
  const hook = HOOK_BY_SOURCE[src](cleanTopic);
  const cta = CTA_BY_SOURCE[src];

  const summarySentences = summaryText ? pickSceneSentences(splitSentences(summaryText), Math.max(photos.length, 1)) : [];

  const middlePhotos = photos.slice(); // 모든 업로드 사진을 본문 장면으로 사용
  const scenes = [];
  scenes.push({ index: 1, role: "hook", caption: hook, image: middlePhotos[0]?.url || null });

  const bodyPhotos = middlePhotos.length > 1 ? middlePhotos.slice(1) : middlePhotos;
  bodyPhotos.forEach((photo, i) => {
    const caption =
      (photo.caption && photo.caption.trim()) ||
      summarySentences[i] ||
      `${cleanTopic} 포인트 ${i + 1}`;
    scenes.push({ index: scenes.length + 1, role: "body", caption, image: photo.url });
  });

  scenes.push({
    index: scenes.length + 1,
    role: "cta",
    caption: cta,
    image: middlePhotos[middlePhotos.length - 1]?.url || null,
  });

  const fullScript = scenes.map((s) => `[씬 ${s.index}] ${s.caption}`).join("\n\n");

  return {
    sourceUrl: null,
    source: src,
    sourceTitle: cleanTopic,
    price: null,
    imagesFound: photos.length,
    scenes,
    fullScript,
    hashtags: extractHashtags(cleanTopic, HASHTAG_EXTRA_BY_SOURCE[src]),
    note: summaryText
      ? "본문 요약으로 넣어주신 문단을 문장 단위로 잘라 사진 순서에 맞춰 캡션으로 배치했습니다. 실제 게시 전 직접 검수해서 쓰는 걸 권장합니다."
      : "사진별로 직접 입력한 캡션이 없는 장면은, AI가 사진 내용을 임의로 판단해서 지어내지 않고 주제 문구를 짧게 변형한 일반적인 문구로 채웠습니다 — 실제 게시 전에 각 장면 캡션을 직접 다듬어서 쓰는 걸 권장합니다.",
  };
}

module.exports = { planShortform, planFromPhotos, splitSentences, pickSceneSentences };
