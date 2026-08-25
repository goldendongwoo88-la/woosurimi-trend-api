// 숏폼용 "장면(씬) 기획안"을 자동으로 짜주는 모듈입니다. 두 가지 방식을 지원합니다.
//   1) planShortform(url, source)   — 블로그/쇼핑/여행 커넥트 "링크"를 넣으면, 그 페이지에
//      실제로 있는 사진과 본문 문장을 그대로 가져와서 장면을 짭니다 (= "링크컷" 모드).
//   2) planFromPhotos(photos, topic, source) — 사용자가 직접 고른 사진들과 한 줄 주제를
//      넣으면, 그 사진들로 장면을 짭니다 (= "자동컷" 모드). 사진마다 캡션을 직접 안 넣으면,
//      이제는 이미지 인식 AI(Claude Vision, imageCaption.js)가 사진을 실제로 보고 —
//      본문 요약(summaryText)을 함께 넣어줬다면 그 본문 내용과도 자연스럽게 이어지도록 —
//      캡션을 자동으로 만들어줍니다. 서버에 ANTHROPIC_API_KEY가 없거나 실패하면(에러로
//      죽지 않고) 예전처럼 정직하게 주제 문구를 짧게 변형한 일반적인 문구로 대신 채웁니다.
//
// ⚠️ 두 방식 모두 "실제 영상 파일(mp4)"이 아니라, 영상을 만들기 위한 기획(대본) 단계입니다.
// 실제 mp4는 videoRenderer.js(및 /api/shortform/render)가 만듭니다.

const path = require("path");
const { extractPageData } = require("./pageExtractor");
const { generateCaptionFromImage } = require("./imageCaption");
const { isConfigured: isVisionConfigured } = require("./claudeClient");
const { writeShortformScript, toConversational, shorten, buildTemplateHook } = require("./shortformScriptWriter");

const PUBLIC_DIR = path.join(__dirname, "..", "public");

// 숏폼은 너무 짧으면 내용이 안 들어오고, 너무 길면 이탈합니다. 장면 수에 맞춰 장면당
// 길이를 정해서 전체가 대략 10~25초(목표 ~20초)에 들어오게 합니다. 실제로는 AI 성우
// 나레이션이 이 값보다 길면 그 장면이 자동으로 늘어나므로(목소리가 잘리면 안 되니까),
// 여기 값은 "나레이션이 없을 때의 기준 길이"에 가깝습니다.
const TARGET_TOTAL_SECONDS = 20;
// AI 성우 나레이션을 켜면 장면 길이가 "그 문장을 다 읽는 시간"까지 자동으로 늘어납니다.
// 자막 한 줄(최대 22자)을 읽는 데 대략 3초쯤 걸리므로, 장면이 너무 많으면 나레이션을
// 켰을 때 영상이 40초를 훌쩍 넘어가 버립니다(실제로 12장면일 때 47초가 나왔습니다).
// 그래서 사진이 아무리 많아도 장면 수는 이 값까지만 씁니다 — 7장면 × 약 3.4초 ≈ 24초로
// 목표 구간(10~25초) 안에 들어옵니다(8장면으로 재보니 28초가 나와서 7로 낮췄습니다).
const MAX_SCENES = 7;
function recommendDuration(sceneCount) {
  const raw = TARGET_TOTAL_SECONDS / Math.max(sceneCount, 1);
  return Math.round(Math.min(Math.max(raw, 1.8), 3.2) * 10) / 10;
}

function splitSentences(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 문장 앞에 "20:08" 같은 읽는시간/시각 표시가 실수로 붙어 들어온 경우 잘라냅니다
// (네이버 모바일 블로그 본문을 긁을 때, 시간 표시 다음 문단이 붙어서 하나로 잡히는
// 경우가 있습니다).
function stripLeadingTimestamp(s) {
  return s.replace(/^\d{1,2}:\d{2}\s*/, "").trim();
}

// 한글/영문 글자가 거의 없는(숫자·기호뿐인) "문장"은 의미 있는 내용이 아니라서 뺍니다.
function isMostlyNoise(s) {
  const letters = s.replace(/[^가-힣a-zA-Z]/g, "");
  return letters.length < 4;
}

function normalizeForCompare(s) {
  return (s || "").replace(/[\s"'“”‘’.,!?~\-·:()[\]]/g, "").toLowerCase();
}

// 글 제목을 그대로 반복하는 "문장"(제목이 본문 맨 위에 큰 글씨 헤딩으로 또 들어있는
// 경우가 흔함)을 본문 씬으로 쓰면, 오프닝 씬과 내용이 거의 똑같아져서 어색합니다.
function isTitleEcho(sentence, title) {
  const normSentence = normalizeForCompare(sentence);
  const normTitle = normalizeForCompare(title);
  if (!normSentence || !normTitle || normTitle.length < 4) return false;
  return normSentence.includes(normTitle) || normTitle.includes(normSentence);
}

function pickSceneSentences(sentences, count, title = "") {
  const cleaned = sentences
    .map(stripLeadingTimestamp)
    .filter((s) => s && !isMostlyNoise(s) && !isTitleEcho(s, title));

  const usable = cleaned.filter((s) => s.length >= 10 && s.length <= 90);
  if (usable.length >= count) return usable.slice(0, count);
  // 적당한 길이 문장이 부족하면 짧더라도 있는 대로 채웁니다.
  return cleaned.filter((s) => s.length >= 4).slice(0, count);
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
// 마무리 멘트도 참고 영상 톤(낭독체·짧은 문장 조각)에 맞춰 짧게 씁니다.
const CTA_BY_SOURCE = {
  shopping: "링크는 설명란에 있음",
  travel: "코스는 원문에 다 있음",
  blog: "자세한 건 원문에 있음",
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
 * sceneCountOverride: 장면 수를 직접 지정하고 싶을 때만 넘기세요. 안 넘기면, 원문에
 *   실제로 있던 사진 수에 맞춰 자동으로 정합니다(최소 6장면, 최대 12장면 — 렌더링이
 *   지원하는 장면 상한과 동일). 사진이 많은 글일수록 "본문 사진을 최대한 다 써서"
 *   더 풍성한 영상이 되도록 하기 위함입니다.
 */
async function planShortform(url, source = "blog", sceneCountOverride = null) {
  const src = normalizeSource(source);
  const page = await extractPageData(url);
  const images = page.images && page.images.length ? page.images : [];
  const sceneCount = sceneCountOverride || Math.min(Math.max(images.length, 6), MAX_SCENES);

  const sentences = splitSentences(page.bodyText || page.description);
  const sceneSentences = pickSceneSentences(sentences, sceneCount, page.title);
  const price = src === "shopping" ? findPrice(page.bodyText) : null;

  const cta = CTA_BY_SOURCE[src];

  // 원문 문장을 그대로 자막으로 쓰지 않고, "친구한테 말해주듯" 구어체 숏폼 대본으로
  // 다시 씁니다. 상단 고정 후킹 문구(hook)와 장면별 하단 멘트(lines)를 함께 받습니다.
  const script = await writeShortformScript({
    title: page.title,
    bodyText: page.bodyText || page.description,
    sentences: sceneSentences,
    sceneCount,
    source: src,
  });

  const hookText = script.hook || HOOK_BY_SOURCE[src](page.title);

  // 대본 줄 수가 장면 수보다 모자라면, 남는 장면은 원문 문장을 구어체로 다듬어 채웁니다
  // (빈 자막으로 두면 그 장면만 휑하게 지나가서 어색합니다).
  const lines = script.lines.slice(0, sceneCount);
  for (let i = lines.length; i < sceneCount; i++) {
    const fallback = sceneSentences[i] ? shorten(toConversational(sceneSentences[i]), 30) : "";
    lines.push(fallback);
  }
  // 마지막 줄은 항상 자연스러운 마무리(CTA)로 덮어씁니다.
  lines[lines.length - 1] = price ? `${cta} (${price})` : cta;

  const pickImage = (idx) => (images.length ? images[idx % images.length] : null);

  const scenes = lines.map((line, i) => ({
    index: i + 1,
    role: i === 0 ? "hook" : i === lines.length - 1 ? "cta" : "body",
    caption: line,
    image: pickImage(i),
  }));

  const fullScript = [`[상단 고정] ${hookText}`, ...scenes.map((s) => `[씬 ${s.index}] ${s.caption}`)].join("\n\n");

  const recommendedDurationPerScene = recommendDuration(scenes.length);

  return {
    sourceUrl: url,
    source: src,
    sourceTitle: page.title,
    hookText, // 영상 내내 화면 상단에 고정으로 붙는 후킹 문구
    scriptGeneratedBy: script.generatedBy,
    scriptNote: script.note,
    price,
    imagesFound: images.length,
    sourceImages: images, // 씬 에디터에서 "다른 사진으로 교체"할 때 고를 수 있는 원문 사진 후보 전체
    scenes,
    fullScript,
    recommendedDurationPerScene,
    hashtags: extractHashtags(page.title + " " + page.description, HASHTAG_EXTRA_BY_SOURCE[src]),
    note:
      "사진과 문장은 원문 페이지에서 실제로 가져온 것이며, AI가 새로 창작한 내용이 아니라 원문 핵심 문장을 골라 장면 순서로 배치한 초안입니다. 실제 게시 전에는 직접 검수·수정해서 쓰는 걸 권장하고, 본인 소유가 아닌 페이지의 사진을 쓸 때는 저작권/사용권을 꼭 확인해 주세요.",
  };
}

/**
 * "자동컷" 모드 — 사용자가 직접 고른 사진들로 장면을 짭니다(외부 링크 없이).
 * photos: [{ url, caption }]  — url은 이 서버에 업로드된 사진의 경로(/uploads/...), caption은 선택
 * topic: 영상 전체 주제를 한 줄로 적은 것 (필수)
 * summaryText: (선택) 본문 요약을 문단으로 붙여넣으면, 사진 순서에 맞춰 문장을 매칭해서
 *              이미지 인식 AI에게 "본문 맥락"으로 함께 전달합니다.
 *
 * 사진 한 장당 캡션을 정하는 우선순위:
 *   1) 사용자가 그 사진에 직접 입력한 caption이 있으면 그대로 사용
 *   2) 없으면 이미지 인식 AI(Claude Vision)가 그 사진을 실제로 보고, 근처 본문 문장(있으면)과
 *      자연스럽게 이어지는 캡션을 새로 씀 — ANTHROPIC_API_KEY가 서버에 설정돼 있어야 동작
 *   3) AI가 못 쓰면(키 없음/일시 오류) 매칭된 본문 문장을 그대로 사용
 *   4) 그마저도 없으면 "주제 + 포인트 번호" 형태의 일반적인 문구로 채움(내용을 지어내지 않음)
 */
async function planFromPhotos(photos, topic, { source = "blog", summaryText = "" } = {}) {
  const src = normalizeSource(source);
  const cleanTopic = (topic || "").trim() || "이 콘텐츠";
  const hook = HOOK_BY_SOURCE[src](cleanTopic);
  const cta = CTA_BY_SOURCE[src];

  const summarySentences = summaryText ? pickSceneSentences(splitSentences(summaryText), Math.max(photos.length, 1)) : [];

  const middlePhotos = photos.slice(); // 모든 업로드 사진을 본문 장면으로 사용
  const scenes = [];
  scenes.push({ index: 1, role: "hook", caption: hook, image: middlePhotos[0]?.url || null });

  const bodyPhotos = middlePhotos.length > 1 ? middlePhotos.slice(1) : middlePhotos;
  let userCount = 0;
  let aiVisionCount = 0;
  let summaryOnlyCount = 0;
  let genericCount = 0;

  for (let i = 0; i < bodyPhotos.length; i++) {
    const photo = bodyPhotos[i];
    const userCaption = (photo.caption && photo.caption.trim()) || "";
    const matchedSentence = summarySentences[i] || "";
    let caption = userCaption;

    if (caption) {
      userCount++;
    } else if (photo.url) {
      const localPath = path.join(PUBLIC_DIR, photo.url.replace(/^\/+/, ""));
      const aiCaption = await generateCaptionFromImage(localPath, cleanTopic, matchedSentence || summaryText);
      if (aiCaption) {
        caption = aiCaption;
        aiVisionCount++;
      }
    }

    if (!caption && matchedSentence) {
      caption = matchedSentence;
      summaryOnlyCount++;
    }
    if (!caption) {
      caption = `${cleanTopic} 포인트 ${i + 1}`;
      genericCount++;
    }

    scenes.push({ index: scenes.length + 1, role: "body", caption, image: photo.url });
  }

  scenes.push({
    index: scenes.length + 1,
    role: "cta",
    caption: cta,
    image: middlePhotos[middlePhotos.length - 1]?.url || null,
  });

  const fullScript = scenes.map((s) => `[씬 ${s.index}] ${s.caption}`).join("\n\n");

  const noteParts = [];
  if (userCount) noteParts.push(`직접 입력한 캡션 ${userCount}장`);
  if (aiVisionCount) {
    noteParts.push(
      `AI가 사진을 실제로 보고${summaryText ? " 본문 내용과 자연스럽게 이어지도록" : ""} 자동 생성한 캡션 ${aiVisionCount}장`
    );
  }
  if (summaryOnlyCount) noteParts.push(`본문 문장을 그대로 배치한 캡션 ${summaryOnlyCount}장`);
  if (genericCount) noteParts.push(`일반 문구로 채운 캡션 ${genericCount}장`);
  let note = noteParts.length ? `사진별 캡션 구성: ${noteParts.join(", ")}입니다.` : "";
  if (genericCount && !isVisionConfigured()) {
    note += " 서버에 ANTHROPIC_API_KEY를 등록하면, 일반 문구 대신 AI가 사진을 직접 보고 캡션을 자동으로 만들어줍니다.";
  }
  note += " 실제 게시 전에는 각 장면 캡션을 직접 검수·수정해서 쓰는 걸 권장합니다.";

  return {
    sourceUrl: null,
    source: src,
    sourceTitle: cleanTopic,
    hookText: buildTemplateHook(cleanTopic), // 자동컷은 원문 글이 없으니 주제를 그대로 상단 문구로 씁니다
    price: null,
    imagesFound: photos.length,
    sourceImages: photos.map((p) => p.url).filter(Boolean), // 씬 에디터에서 다른 업로드 사진으로 바꿔 쓸 수 있게 전체 목록도 같이 줍니다
    scenes,
    fullScript,
    recommendedDurationPerScene: recommendDuration(scenes.length),
    hashtags: extractHashtags(cleanTopic, HASHTAG_EXTRA_BY_SOURCE[src]),
    note: note.trim(),
  };
}

module.exports = { planShortform, planFromPhotos, splitSentences, pickSceneSentences };
