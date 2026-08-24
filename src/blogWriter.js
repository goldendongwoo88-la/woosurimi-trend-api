// "AI 자동화 글쓰기" 기능입니다. 오른쪽 화면처럼 주제별(네이버 홈판 인기 / 여행 커넥트 /
// 쇼핑 커넥트)로 실시간 트렌드 주제를 보여주고, 주제를 고르면 초안(제목+본문+이미지)을
// 자동으로 짜줍니다.
//
// 실제 문장을 새로 "창작"하는 부분은 Anthropic Claude API(ANTHROPIC_API_KEY 환경변수)로
// 만듭니다. 서버에 키가 설정되어 있지 않거나 API 호출이 실패하면, 에러로 죽지 않고
// 사실을 지어내지 않는 "빈칸(✏️)만 채우면 되는 글쓰기 틀"로 자동으로 대체됩니다(AI 성우
// TTS 연동이 키 없을 때 나레이션 없이 자동으로 대체되는 것과 같은 원칙입니다).
// Claude에게도 "모르는 구체적 사실(정확한 가격/날짜/통계 등)은 지어내지 말고 ✏️로
// 표시해 채워야 할 자리로 남겨두라"고 명시적으로 지시합니다.

const cache = require("./cache");
const { findOpportunities } = require("./opportunityFinder");
const claudeClient = require("./claudeClient");

const CATEGORIES = [
  {
    id: "naver_home",
    label: "네이버 홈판 유력",
    description: "지금 대한민국에서 실시간으로 가장 많이 검색되는 주제예요.",
  },
  {
    id: "travel_connect",
    label: "여행 커넥트",
    description: "국내·해외 여행 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
  {
    id: "shopping_connect",
    label: "쇼핑 커넥트",
    description: "상품 리뷰·패션/미용 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
];

function getCategories() {
  return CATEGORIES;
}

// 카테고리별로 "실제 데이터 기반" 실시간 트렌드 주제 목록을 만듭니다.
async function getTrendTopics(categoryId, limit = 20) {
  if (categoryId === "naver_home") {
    const data = cache.getLatest();
    if (!data) {
      return { note: "아직 실시간 인기 검색어를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.", items: [] };
    }
    return {
      note: "구글 트렌드 대한민국 실시간 인기 검색어입니다(공식 공개 RSS). 네이버 자체 '홈판 유력' 순위는 외부에 공개되지 않아서, 그 대신 실시간성이 가장 비슷한 이 데이터를 씁니다.",
      generatedAt: data.fetchedAt,
      items: data.items.slice(0, limit).map((it) => ({ topic: it.term, meta: it.approxTraffic || null })),
    };
  }

  if (categoryId === "travel_connect") {
    const [domestic, world] = await Promise.all([
      findOpportunities("국내여행", limit, "all").catch(() => []),
      findOpportunities("세계여행", limit, "all").catch(() => []),
    ]);
    const merged = [...domestic, ...world].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, limit);
    return {
      note: "네이버 검색 데이터를 기반으로, 검색은 많은데 아직 블로그 글이 적은 여행 관련 '기회 키워드'입니다.",
      generatedAt: new Date().toISOString(),
      items: merged.map((it) => ({ topic: it.keyword, meta: `월 검색 ${it.monthlySearchVolume.toLocaleString()}건 · 글 ${it.blogPostCountLabel}개` })),
    };
  }

  if (categoryId === "shopping_connect") {
    const [review, fashion] = await Promise.all([
      findOpportunities("상품리뷰", limit, "all").catch(() => []),
      findOpportunities("패션/미용", limit, "all").catch(() => []),
    ]);
    const merged = [...review, ...fashion].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, limit);
    return {
      note: "네이버 검색 데이터를 기반으로, 검색은 많은데 아직 블로그 글이 적은 쇼핑/제품 관련 '기회 키워드'입니다.",
      generatedAt: new Date().toISOString(),
      items: merged.map((it) => ({ topic: it.keyword, meta: `월 검색 ${it.monthlySearchVolume.toLocaleString()}건 · 글 ${it.blogPostCountLabel}개` })),
    };
  }

  throw new Error(`등록되지 않은 카테고리입니다: "${categoryId}". 사용 가능: ${CATEGORIES.map((c) => c.id).join(", ")}`);
}

// ===================== Claude API (실제 문장 생성) =====================

function writerConfigured() {
  return claudeClient.isConfigured();
}

function getWriterStatus() {
  return { ready: writerConfigured(), model: claudeClient.getModel() };
}

const CATEGORY_TONE = {
  naver_home: "지금 화제가 된 이슈를 다루는 정보성 블로그 글 — 궁금증을 자극하는 후킹, 사실관계 요약, 반응/전망 순서",
  travel_connect: "직접 다녀온 듯한 여행 후기/정보 블로그 글 — 기본 정보, 방문 경험, 함께 가기 좋은 곳, 추천 대상 순서",
  shopping_connect: "제품을 실제로 써본 듯한 쇼핑 리뷰 블로그 글 — 스펙/가격, 사용 경험, 비교, 추천 대상 순서",
};

async function callClaude(topic, cat, imageCount) {
  const sectionCount = 4;
  const prompt =
    `당신은 네이버 블로그에 올릴 "${CATEGORY_TONE[cat]}" 글을 쓰는 한국어 블로그 작가입니다.\n` +
    `주제: "${topic}"\n\n` +
    `아래 JSON 형식으로만 응답하세요(다른 설명 없이 JSON 객체 하나만):\n` +
    `{\n` +
    `  "title": "클릭하고 싶어지는 블로그 제목 (30자 내외)",\n` +
    `  "intro": "두세 문장의 도입부(후킹)",\n` +
    `  "sections": [ { "heading": "소제목", "body": "3~5문장 본문" } 총 ${sectionCount}개 ],\n` +
    `  "cta": "마무리 인사말 겸 CTA 한두 문장",\n` +
    `  "hashtags": ["#해시태그", ... 5~6개]\n` +
    `}\n\n` +
    `⚠️ 아주 중요한 규칙: 당신은 이 주제에 대한 실시간/최신 정보나 이 특정 장소·제품에 대한 실제 경험이 없습니다. ` +
    `정확한 가격, 정확한 날짜/영업시간, 구체적인 수치·통계, 실제로 가보거나 써본 것처럼 단정하는 구체적 디테일은 ` +
    `"지어내지 말고", 그 자리에 "✏️(직접 확인 후 채워주세요: 예상되는 내용)" 형태로 표시해서 사용자가 실제 정보로 ` +
    `채워 넣을 자리를 명확히 남겨두세요. 일반적으로 알려진 상식 수준의 설명, 글의 흐름, 문장력은 자유롭게 잘 써도 됩니다.`;

  const text = await claudeClient.callClaude({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
    temperature: 0.8,
  });
  const parsed = claudeClient.extractJson(text);

  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Claude 응답 형식이 예상과 달랐습니다.");
  }
  return parsed;
}

// ===================== 템플릿 기반 대체(폴백) =====================

const TITLE_BY_CATEGORY = {
  naver_home: (topic) => `"${topic}" 요즘 왜 이렇게 화제일까? (총정리)`,
  travel_connect: (topic) => `"${topic}" 가기 전에 꼭 알아야 할 것들`,
  shopping_connect: (topic) => `"${topic}" 사기 전에 이것부터 확인하세요`,
};
const INTRO_BY_CATEGORY = {
  naver_home: (topic) =>
    `요즘 "${topic}"이(가) 실시간 검색어에 오를 만큼 화제예요. 왜 이렇게 관심을 받고 있는지, 이 글에서 정리해볼게요.`,
  travel_connect: (topic) =>
    `"${topic}" 여행을 계획 중이신가요? 실제로 다녀온 경험과 알아두면 좋은 정보를 이 글에 담아볼게요.`,
  shopping_connect: (topic) =>
    `"${topic}" 구매를 고민하고 계신가요? 실제 사용 후기와 비교 포인트를 이 글에서 정리해드릴게요.`,
};
const CTA_BY_CATEGORY = {
  naver_home: "여기까지 읽어주셔서 감사해요! 도움이 되셨다면 이웃추가하고 다음 글도 받아보세요 :)",
  travel_connect: "실제 다녀오시면 후기 댓글로 알려주세요! 저장해두고 여행 갈 때 다시 참고하세요 :)",
  shopping_connect: "구매 결정에 도움이 되셨길 바라요! 궁금한 점은 댓글로 남겨주세요 :)",
};

// 사람이 실제 정보(가격/위치/후기 등)만 채우면 되는 "본문 뼈대"입니다.
function buildSections(topic, categoryId) {
  const fillIn = (hint) => `✏️ ${hint} (실제로 경험했거나 조사한 내용을 2~4문장으로 채워주세요)`;

  if (categoryId === "travel_connect") {
    return [
      { heading: `1. "${topic}" 기본 정보`, body: fillIn(`위치, 가는 방법, 운영시간·요금 등 "${topic}"의 기본 정보를 적어주세요`) },
      { heading: `2. 실제로 가보니`, body: fillIn(`직접 가서 느낀 점, 분위기, 사진 찍기 좋은 포인트를 적어주세요`) },
      { heading: `3. 함께 가면 좋은 곳`, body: fillIn(`근처에 같이 들르면 좋은 장소나 맛집을 적어주세요`) },
      { heading: `4. 이런 분께 추천해요`, body: fillIn(`어떤 사람에게, 어떤 시기에 추천하는지 적어주세요`) },
    ];
  }
  if (categoryId === "shopping_connect") {
    return [
      { heading: `1. "${topic}" 스펙/가격`, body: fillIn(`가격, 구성, 주요 스펙을 적어주세요`) },
      { heading: `2. 실제 사용해보니`, body: fillIn(`장점, 아쉬운 점을 솔직하게 적어주세요`) },
      { heading: `3. 이런 제품과 비교하면`, body: fillIn(`비슷한 다른 제품과 비교했을 때 차별점을 적어주세요`) },
      { heading: `4. 이런 분께 추천해요`, body: fillIn(`어떤 사람에게 추천하는지, 구매 링크는 어디인지 적어주세요`) },
    ];
  }
  return [
    { heading: `1. "${topic}" 무슨 일이길래`, body: fillIn(`핵심 사실관계(누가, 언제, 무엇을)를 적어주세요`) },
    { heading: `2. 왜 화제가 됐을까`, body: fillIn(`화제가 된 배경이나 이유를 적어주세요`) },
    { heading: `3. 반응은 어땠나`, body: fillIn(`실제 반응이나 여론, 관련 통계를 적어주세요`) },
    { heading: `4. 앞으로는`, body: fillIn(`전망이나 마무리 생각을 적어주세요`) },
  ];
}

function extractHashtags(topic) {
  const words = (topic.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).slice(0, 5);
  return [...new Set([topic.replace(/\s+/g, ""), ...words])].slice(0, 6).map((w) => `#${w}`);
}

function buildTemplateContent(cleanTopic, cat) {
  return {
    title: TITLE_BY_CATEGORY[cat](cleanTopic),
    intro: INTRO_BY_CATEGORY[cat](cleanTopic),
    sections: buildSections(cleanTopic, cat),
    cta: CTA_BY_CATEGORY[cat],
    hashtags: extractHashtags(cleanTopic),
  };
}

// ===================== 공통: 이미지 배치 + 응답 조립 =====================

function assembleDraft(cleanTopic, cat, content, mode, images, note) {
  const withImages = mode === "text_images";
  let imageCursor = 0;
  const sectionsWithImages = content.sections.map((s) => {
    const image = withImages && images[imageCursor] ? images[imageCursor++].url : null;
    return { heading: s.heading, body: s.body, image };
  });
  const thumbnailUrl = withImages && images[0] ? images[0].url : null;

  const bodyText = [
    content.intro,
    "",
    ...sectionsWithImages.flatMap((s) => [s.heading, s.body, ""]),
    content.cta,
  ].join("\n");

  return {
    topic: cleanTopic,
    category: cat,
    title: content.title,
    intro: content.intro,
    sections: sectionsWithImages,
    cta: content.cta,
    thumbnailUrl,
    imagesUsed: withImages ? Math.min(images.length, 8) : 0,
    imagesRequestedButMissing: withImages && images.length === 0,
    hashtags: content.hashtags,
    bodyText,
    note,
  };
}

/**
 * topic: 글 주제(카테고리 트렌드 목록에서 고르거나 직접 입력)
 * category: "naver_home" | "travel_connect" | "shopping_connect"
 * mode: "text" | "text_images" — 이미지 포함 여부
 * images: [{url}] — 업로드된 이미지 목록(선택). mode가 text_images인데 images가 없으면
 *         이미지 없이 "이미지를 첨부해 주세요"라는 안내만 넣습니다(가짜 이미지를 지어내지 않음).
 */
async function generateDraft({ topic, category, mode = "text", images = [] } = {}) {
  const cat = CATEGORIES.some((c) => c.id === category) ? category : "naver_home";
  const cleanTopic = (topic || "").trim();
  if (!cleanTopic) throw new Error("주제를 입력해 주세요.");

  if (writerConfigured()) {
    try {
      const content = await callClaude(cleanTopic, cat, images.length);
      return assembleDraft(
        cleanTopic,
        cat,
        content,
        mode,
        images,
        "Claude API로 실제 문장을 생성한 초안입니다. ✏️ 표시된 부분은 Claude가 실시간/구체적 사실(가격·날짜·통계 등)을 모르기 때문에 지어내지 않고 비워둔 자리이니, 실제 정보로 채운 뒤 발행해 주세요. 나머지 문장도 사실 확인 후 게시하는 걸 권장합니다."
      );
    } catch (err) {
      console.error("[blogWriter] Claude API 호출 실패, 템플릿으로 대체합니다:", err.message);
      const content = buildTemplateContent(cleanTopic, cat);
      return assembleDraft(
        cleanTopic,
        cat,
        content,
        mode,
        images,
        `Claude API 호출에 실패해서(${err.message}) 대신 '빈칸만 채우면 되는 글쓰기 틀'로 만들었습니다. API 키·네트워크 상태를 확인한 뒤 다시 시도해 보세요.`
      );
    }
  }

  const content = buildTemplateContent(cleanTopic, cat);
  return assembleDraft(
    cleanTopic,
    cat,
    content,
    mode,
    images,
    "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않아서, 실제 문장을 새로 창작하는 대신 진짜 트렌드 데이터를 바탕으로 '빈칸만 채우면 되는 글쓰기 틀'을 짰습니다. README를 참고해 Claude API 키를 등록하면 실제 문장으로 초안이 채워집니다."
  );
}

module.exports = { CATEGORIES, getCategories, getTrendTopics, generateDraft, getWriterStatus };
