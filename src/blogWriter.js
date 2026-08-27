// "AI 자동화 글쓰기" 기능입니다. 주제 카테고리 8종(맛집 후기/여행 후기/정보성 글/소개·홍보글/
// IT·상품리뷰/비즈니스·경제/뷰티·패션/일상·취미)별로 실시간 트렌드 주제를 보여주고, 주제를
// 고르면 초안(제목+본문+이미지)을 자동으로 짜줍니다.
//
// ⚠️ 카테고리 이름과 실제로 연결된 데이터 소스가 항상 1:1로 딱 맞는 건 아닙니다. "정보성 글"은
// 구글 트렌드 실시간 인기 검색어를 그대로 쓰고, 나머지는 네이버 검색 데이터 기반 "기회 키워드"
// (검색은 많은데 아직 블로그 글이 적은 키워드, opportunityFinder.js)를 씁니다. 다만 "소개/홍보글"
// 처럼 정확히 맞는 시드 키워드가 없는 카테고리는, 없는 데이터를 지어내는 대신 뜻이 가장 가까운
// 기존 키워드 분야로 대신 채우고 그 사실을 note에 그대로 안내합니다(CATEGORY_DATA_SOURCES 참고).
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
// 상위 글의 분량·구성을 보고 그에 맞춰 쓰기 위해. 순환 참조는 없습니다
// (competitorCompare는 blogFetch·postAudit·naverBlogData만 씁니다).
const competitorCompare = require("./competitorCompare");
const { extractPageData } = require("./pageExtractor");

const CATEGORIES = [
  {
    id: "food_review",
    label: "맛집 후기",
    description: "검색은 많은데 아직 블로그 글이 적은 맛집·먹거리 관련 '기회 키워드'예요.",
  },
  {
    id: "travel_review",
    label: "여행 후기",
    description: "국내·해외 여행 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
  {
    id: "info_post",
    label: "정보성 글",
    description: "지금 대한민국에서 실시간으로 가장 많이 검색되는 화제 이슈예요.",
  },
  {
    id: "intro_promo",
    label: "소개/홍보글",
    description:
      "공간·인테리어·라이프스타일 관련 '기회 키워드'예요 — '소개/홍보글'에 정확히 맞는 실시간 데이터가 없어서, 뜻이 가장 가까운 분야로 대신 채웠어요.",
  },
  {
    id: "it_review",
    label: "IT·상품리뷰",
    description: "IT 기기·자동차·생활가전 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
  {
    id: "biz_economy",
    label: "비즈니스/경제",
    description: "재테크·경제·세금 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
  {
    id: "beauty_fashion",
    label: "뷰티/패션",
    description: "패션·미용 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
  {
    id: "daily_hobby",
    label: "일상/취미",
    description: "반려동물·육아·요리·건강·운동 등 일상 관련 키워드 중, 찾는 사람은 많은데 글은 아직 적은 주제예요.",
  },
];

function getCategories() {
  return CATEGORIES;
}

// 카테고리 → 실제 데이터 소스 매핑입니다.
//   - "trends": 구글 트렌드 대한민국 실시간 인기 검색어(cache.js) 그대로
//   - "opportunity": opportunityFinder.js의 CATEGORY_SEEDS 중 지정한 시드들을 합쳐서 씀
//   - "trends_plus_opportunity": 트렌드 실시간 검색어 + 지정 시드의 기회 키워드를 함께 보여줌
//   - substituted: true인 카테고리는, 화면에 보이는 카테고리 이름과 실제 시드 키워드 분야가
//     정확히 일치하지 않는다는 뜻입니다(없는 데이터를 지어내지 않기 위한 대체) — note에 안내됩니다.
const CATEGORY_DATA_SOURCES = {
  food_review: { type: "opportunity", seeds: ["맛집"] },
  travel_review: { type: "opportunity", seeds: ["국내여행", "세계여행"] },
  info_post: { type: "trends_plus_opportunity", seeds: ["사회/정치"] },
  intro_promo: { type: "opportunity", seeds: ["인테리어/DIY", "원예/재배"], substituted: true },
  it_review: { type: "opportunity", seeds: ["IT/컴퓨터", "자동차", "상품리뷰"] },
  biz_economy: { type: "opportunity", seeds: ["비즈니스/경제"] },
  beauty_fashion: { type: "opportunity", seeds: ["패션/미용"] },
  daily_hobby: { type: "opportunity", seeds: ["반려동물", "육아/결혼", "요리/레시피", "건강/의학", "스포츠"] },
};

// 기회 점수가 이 목록 평균보다 눈에 띄게 높은(1.5배 이상) 상위 몇 개만 "급상승" 배지를
// 붙입니다 — 화면을 예쁘게 꾸미려고 아무 데나 무작위로 붙이는 게 아니라, 실제로 검색량 대비
// 글이 부족해서 "지금 쓰면 눈에 띌 가능성이 높은" 키워드라는 실제 신호에 근거합니다.
function markOpportunityHot(items, maxHot = 3) {
  if (!items.length) return items.map((it) => ({ ...it, hot: false }));
  const avg = items.reduce((sum, it) => sum + it.opportunityScore, 0) / items.length;
  let hotCount = 0;
  return items.map((it) => {
    const hot = hotCount < maxHot && it.opportunityScore > avg * 1.5;
    if (hot) hotCount++;
    return { ...it, hot };
  });
}

async function getOpportunityTopics(seeds, limit) {
  const results = await Promise.all(seeds.map((s) => findOpportunities(s, limit, "all").catch(() => [])));
  const merged = results.flat().sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, limit);
  const withHot = markOpportunityHot(merged);
  return withHot.map((it) => ({
    topic: it.keyword,
    meta: `월 검색 ${it.monthlySearchVolume.toLocaleString()}건 · 글 ${it.blogPostCountLabel}개`,
    hot: it.hot,
  }));
}

async function getTrendsTopics(limit) {
  const data = cache.getLatest();
  if (!data) {
    return {
      note: "아직 실시간 인기 검색어를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.",
      generatedAt: null,
      items: [],
    };
  }
  return {
    note: "구글 트렌드 대한민국 실시간 인기 검색어입니다(공식 공개 RSS). 네이버 자체 '홈판 유력' 순위는 외부에 공개되지 않아서, 그 대신 실시간성이 가장 비슷한 이 데이터를 씁니다.",
    generatedAt: data.fetchedAt,
    items: data.items.slice(0, limit).map((it, i) => ({ topic: it.term, meta: it.approxTraffic || null, hot: i < 3 })),
  };
}

// 카테고리별로 "실제 데이터 기반" 실시간 트렌드 주제 목록을 만듭니다.
async function getTrendTopics(categoryId, limit = 20) {
  const src = CATEGORY_DATA_SOURCES[categoryId];
  if (!src) {
    throw new Error(`등록되지 않은 카테고리입니다: "${categoryId}". 사용 가능: ${CATEGORIES.map((c) => c.id).join(", ")}`);
  }

  if (src.type === "trends") {
    return getTrendsTopics(limit);
  }

  if (src.type === "trends_plus_opportunity") {
    const trendsPart = await getTrendsTopics(Math.ceil(limit / 2));
    const remaining = Math.max(limit - trendsPart.items.length, 0);
    const oppItems = remaining ? await getOpportunityTopics(src.seeds, remaining) : [];
    return {
      note:
        "앞부분은 구글 트렌드 대한민국 실시간 인기 검색어, 뒷부분은 네이버 검색 데이터 기반 사회·시사 관련 '기회 키워드'입니다(둘 다 실제 데이터이며 지어낸 내용은 아닙니다).",
      generatedAt: new Date().toISOString(),
      items: [...trendsPart.items, ...oppItems],
    };
  }

  // type === "opportunity"
  const items = await getOpportunityTopics(src.seeds, limit);
  const catLabel = CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId;
  const note = src.substituted
    ? `"${catLabel}"에 정확히 맞는 실시간 데이터가 없어서, 뜻이 가장 가까운 네이버 검색 데이터 기반 키워드(${src.seeds.join(
        ", "
      )} 분야)로 대신 채웠습니다 — 실제 검색량 데이터이며 지어낸 내용은 아닙니다.`
    : "네이버 검색 데이터를 기반으로, 검색은 많은데 아직 블로그 글이 적은 '기회 키워드'입니다.";
  return { note, generatedAt: new Date().toISOString(), items };
}

// ===================== Claude API (실제 문장 생성) =====================

function writerConfigured() {
  return claudeClient.isConfigured();
}

function getWriterStatus() {
  return { ready: writerConfigured(), model: claudeClient.getModel() };
}

const CATEGORY_TONE = {
  food_review: "직접 먹어본 듯한 맛집 후기 블로그 글 — 메뉴/가격, 맛과 분위기, 웨이팅·주차 팁, 추천 대상 순서",
  travel_review: "직접 다녀온 듯한 여행 후기/정보 블로그 글 — 기본 정보, 방문 경험, 함께 가기 좋은 곳, 추천 대상 순서",
  info_post: "지금 화제가 된 이슈를 다루는 정보성 블로그 글 — 궁금증을 자극하는 후킹, 사실관계 요약, 반응/전망 순서",
  intro_promo: "장소·서비스·공간을 소개하는 홍보성 블로그 글 — 핵심 특징 소개, 이용 방법/포인트, 실제 이용 팁, 추천 대상 순서",
  it_review: "제품을 실제로 써본 듯한 IT·상품 리뷰 블로그 글 — 스펙/가격, 사용 경험, 비교, 추천 대상 순서",
  biz_economy: "경제·재테크 이슈를 다루는 정보성 블로그 글 — 핵심 개념 설명, 최근 이슈 요약, 실생활 영향, 확인해볼 점 순서",
  beauty_fashion: "뷰티·패션 트렌드를 다루는 정보성 블로그 글 — 트렌드 소개, 특징/포인트, 활용 팁, 추천 대상 순서",
  daily_hobby: "일상생활 꿀팁·취미를 다루는 블로그 글 — 상황 공감, 노하우/팁, 직접 해본 경험, 마무리 조언 순서",
};

/**
 * 경쟁 글 실측치를 프롬프트에 얹습니다.
 *
 * ⚠️ 원래는 소제목 4개, 길이 지정 없이 통으로 썼습니다. 그러면 주제가 뭐든 같은 모양이
 * 나오고, 그 자리에서 이미 이기고 있는 글들과 형태가 어긋납니다.
 * 상위 글 평균이 2,254자인데 1,200자를 써주면 그냥 짧은 글입니다.
 *
 * ⚠️ 다만 "이 길이로 쓰면 1위가 된다"는 게 아닙니다. 상위 글들이 그 정도 분량으로
 * 쓰고 있다는 사실을 알려주는 것뿐이고, 그 이상 약속하면 거짓말이 됩니다.
 * 그래서 프롬프트에도 '기준'이 아니라 '지금 상위에 있는 글들의 모습'이라고 적습니다.
 */
function benchmarkBlock(bench) {
  if (!bench) return "";
  const bits = [];
  if (bench.chars) bits.push(`본문 길이 약 ${bench.chars.toLocaleString()}자`);
  if (bench.headings) bits.push(`소제목 ${bench.headings}개`);
  if (bench.images) bits.push(`사진 ${bench.images}장`);
  if (bench.keywordCount) bits.push(`본문에서 핵심 키워드 ${bench.keywordCount}번 정도 사용`);
  if (!bits.length) return "";
  return (
    `\n[지금 이 키워드로 상위에 있는 글들의 모습]\n` +
    bits.map((b) => `- ${b}`).join("\n") +
    (bench.keywordInTitleRate >= 60 ? `\n- ${bench.keywordInTitleRate}%가 제목에 핵심 키워드를 넣었습니다` : "") +
    (bench.mapRate >= 60 ? `\n- ${bench.mapRate}%가 지도를 넣었습니다 (본문에 지도 넣을 자리를 표시해 주세요)` : "") +
    `\n이건 상위 노출의 원인이 아니라 그 자리 글들의 공통점입니다. ` +
    `분량과 구성을 여기에 맞춰 주시되, 채우려고 같은 말을 반복하지는 마세요. ` +
    `할 말이 모자라면 억지로 늘리는 대신 ✏️ 표시로 남겨두세요.\n`
  );
}

/**
 * 한 꼭지가 얼마나 채워져야 하는지를 **글자 수가 아니라 뼈대로** 알려줍니다.
 *
 * ⚠️ 여기에 이유가 있습니다. "500자 안팎으로 쓰세요"라고 지시하면 모델이 잘 안 늘립니다.
 * 실측했더니 1,899자를 목표로 잡았는데 1,371자만 나왔습니다(28% 부족).
 * 전자책을 만들 때도 똑같은 일을 겪었고, 그때는 **무엇을 담아야 하는지 항목으로 나눠주니**
 * 분량이 따라왔습니다. 사람도 "500자 쓰세요"보다 "이 네 가지를 다루세요"가 쉽습니다.
 */
function sectionSkeleton(perSection) {
  // 한국어 한 문장이 대략 45자쯤 됩니다. 필요한 문장 수를 역산해서 항목으로 나눕니다.
  const sentences = Math.max(4, Math.round(perSection / 45));
  const beats = Math.min(5, Math.max(3, Math.round(sentences / 2.5)));
  return (
    `이 소제목 아래를 ${beats}개의 이야기 덩어리로 채우세요. ` +
    `각 덩어리는 서로 다른 내용이어야 합니다 — 예: 무엇인지 / 어떤 점이 좋은지 / ` +
    `주의할 점 / 누구에게 맞는지 / 실제로 어떻게 하면 되는지. ` +
    `전체 ${sentences}문장 이상. 같은 말을 바꿔 쓰며 늘리지 말고, ` +
    `할 말이 모자라면 그 자리를 ✏️(직접 확인 후 채워주세요: ...) 로 남기세요.`
  );
}

async function callClaude(topic, cat, imageCount, bench = null) {
  // 상위 글이 소제목을 몇 개 쓰는지 알면 그걸 따르고, 모르면 4개로 둡니다.
  const sectionCount = bench && bench.headings ? Math.min(8, Math.max(3, bench.headings)) : 4;
  const targetChars = bench && bench.chars ? bench.chars : null;
  // 소제목 하나가 맡을 분량 — 이렇게 나눠줘야 전체 길이가 맞습니다.
  const perSection = targetChars ? Math.round((targetChars * 0.8) / sectionCount) : null;

  const prompt =
    `당신은 네이버 블로그에 올릴 "${CATEGORY_TONE[cat]}" 글을 쓰는 한국어 블로그 작가입니다.\n` +
    `주제: "${topic}"\n` +
    benchmarkBlock(bench) +
    `\n아래 JSON 형식으로만 응답하세요(다른 설명 없이 JSON 객체 하나만):\n` +
    `{\n` +
    `  "title": "클릭하고 싶어지는 블로그 제목 (30자 내외)",\n` +
    `  "intro": "두세 문장의 도입부(후킹)",\n` +
    `  "sections": [ { "heading": "소제목", "body": "${
      perSection ? sectionSkeleton(perSection) : "3~5문장 본문"
    }" } 총 ${sectionCount}개 ],\n` +
    `  "cta": "마무리 인사말 겸 CTA 한두 문장",\n` +
    `  "hashtags": ["#해시태그", ... 5~6개]\n` +
    `}\n\n` +
    `⚠️ 아주 중요한 규칙: 당신은 이 주제에 대한 실시간/최신 정보나 이 특정 장소·제품에 대한 실제 경험이 없습니다. ` +
    `정확한 가격, 정확한 날짜/영업시간, 구체적인 수치·통계, 실제로 가보거나 써본 것처럼 단정하는 구체적 디테일은 ` +
    `"지어내지 말고", 그 자리에 "✏️(직접 확인 후 채워주세요: 예상되는 내용)" 형태로 표시해서 사용자가 실제 정보로 ` +
    `채워 넣을 자리를 명확히 남겨두세요. 일반적으로 알려진 상식 수준의 설명, 글의 흐름, 문장력은 자유롭게 잘 써도 됩니다.`;

  // ⚠️ maxTokens가 2000으로 고정돼 있었습니다. 한국어는 글자당 토큰이 많이 들어서
  // 2,000토큰으로는 1,300자쯤에서 잘립니다. 상위 글에 맞춰 2,200자를 쓰라고 시켜놓고
  // 정작 그만큼 쓸 자리를 안 준 셈이라, 응답이 중간에 끊겨 JSON 파싱까지 실패합니다.
  // 목표 분량에 맞춰 늘려 잡습니다.
  const maxTokens = targetChars
    ? Math.min(8000, Math.max(2000, Math.round(targetChars * 2.2)))
    : 2000;

  // ⚠️ 제한시간 기본값이 45초입니다. maxTokens를 4,000 넘게 올려놓고 45초를 그대로 두면
  // 생성이 끝나기 전에 끊깁니다. 실제로 "This operation was aborted"가 났고,
  // 템플릿으로 대체되면서 409자짜리 빈 껍데기가 나왔습니다.
  // 긴 글을 시켰으면 기다릴 시간도 같이 줘야 합니다.
  const timeoutMs = Math.min(150000, Math.max(45000, maxTokens * 30));

  const text = await claudeClient.callClaude({
    feature: "블로그 원고",
    messages: [{ role: "user", content: prompt }],
    maxTokens,
    temperature: 0.8,
    timeoutMs,
  });
  const parsed = claudeClient.extractJson(text);

  if (!parsed.title || !Array.isArray(parsed.sections)) {
    throw new Error("Claude 응답 형식이 예상과 달랐습니다.");
  }
  return parsed;
}

// ===================== "링크로 콘텐츠 만들기" — 원문 URL 내용 기반 초안 =====================
// 위 callClaude는 주제 키워드 하나만 주고 Claude가 처음부터 창작하게 하는 방식이라 구체적
// 사실이 ✏️ 로 많이 비워집니다. 여기는 pageExtractor로 실제 원문(제목/설명/본문)을 먼저
// 가져온 뒤, 그 진짜 내용을 Claude에게 "요약·재구성"만 시키는 방식이라 실제 사실을 그대로
// 활용할 수 있어 빈칸이 훨씬 적습니다(원문을 그대로 베끼지 말라고 명시적으로 지시함).

function splitSentences(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function callClaudeFromUrl(pageData, cat) {
  const sectionCount = 4;
  const context = [
    `원문 제목: ${pageData.title || "(제목 없음)"}`,
    pageData.description ? `원문 요약: ${pageData.description}` : "",
    pageData.bodyText ? `원문 본문 발췌:\n${pageData.bodyText.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt =
    `당신은 네이버 블로그에 올릴 "${CATEGORY_TONE[cat]}" 글을 쓰는 한국어 블로그 작가입니다.\n` +
    `아래는 실제 원문 페이지에서 가져온 내용입니다. 이 내용에 담긴 사실을 바탕으로 블로그 글을 쓰세요 ` +
    `(원문 문장을 그대로 베끼지 말고, 자연스러운 당신만의 문장으로 요약·재구성해 주세요):\n\n${context}\n\n` +
    `아래 JSON 형식으로만 응답하세요(다른 설명 없이 JSON 객체 하나만):\n` +
    `{\n` +
    `  "title": "클릭하고 싶어지는 블로그 제목 (30자 내외)",\n` +
    `  "intro": "두세 문장의 도입부(후킹)",\n` +
    `  "sections": [ { "heading": "소제목", "body": "3~5문장 본문" } 총 ${sectionCount}개 ],\n` +
    `  "cta": "마무리 인사말 겸 CTA 한두 문장",\n` +
    `  "hashtags": ["#해시태그", ... 5~6개]\n` +
    `}\n\n` +
    `⚠️ 중요: 위 원문에 실제로 나온 사실(가격/날짜/스펙 등)은 자유롭게 활용해서 재구성해도 됩니다. ` +
    `다만 원문에 없는 구체적 사실은 지어내지 말고 "✏️(확인 후 채워주세요)" 형태로 표시하세요.`;

  const text = await claudeClient.callClaude({
    feature: "블로그 원고",
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

// Claude API 없이(또는 실패 시) 원문에서 실제로 뽑아온 문장으로 섹션을 채웁니다 — 지어내는
// ✏️ 틀 대신, shortformPlanner.js의 링크컷 모드와 같은 원칙(원문 사실 그대로 사용)입니다.
function buildTemplateContentFromUrl(pageData, cat) {
  const sentences = splitSentences(pageData.bodyText || pageData.description).filter((s) => s.length >= 8);
  const list = SECTION_TEMPLATES[cat] || SECTION_TEMPLATES.info_post;
  const perSection = Math.max(Math.ceil(sentences.length / list.length), 1);
  const cleanTopic = pageData.title || "(원문 제목을 찾지 못했어요)";

  const sections = list.map((s, i) => {
    const chunk = sentences.slice(i * perSection, (i + 1) * perSection).join(" ");
    return {
      heading: s.heading(cleanTopic),
      body: chunk || `✏️ ${s.hint(cleanTopic)} (원문에서 관련 문장을 찾지 못해 직접 채워주세요)`,
    };
  });

  return {
    title: cleanTopic,
    intro: pageData.description || sentences[0] || "✏️ 도입부를 적어주세요",
    sections,
    cta: CTA_BY_CATEGORY[cat],
    hashtags: extractHashtags(cleanTopic),
  };
}

// ===================== 템플릿 기반 대체(폴백) =====================

const TITLE_BY_CATEGORY = {
  food_review: (topic) => `"${topic}" 직접 가본 솔직 후기 (웨이팅·가격 정보)`,
  travel_review: (topic) => `"${topic}" 가기 전에 꼭 알아야 할 것들`,
  info_post: (topic) => `"${topic}" 요즘 왜 이렇게 화제일까? (총정리)`,
  intro_promo: (topic) => `"${topic}" 이런 곳이에요 (특징 총정리)`,
  it_review: (topic) => `"${topic}" 사기 전에 이것부터 확인하세요`,
  biz_economy: (topic) => `"${topic}" 지금 꼭 알아야 하는 이유`,
  beauty_fashion: (topic) => `"${topic}" 요즘 트렌드 총정리`,
  daily_hobby: (topic) => `"${topic}" 이렇게 해보니 확실히 다르네요`,
};
const INTRO_BY_CATEGORY = {
  food_review: (topic) => `"${topic}" 직접 다녀와서 먹어본 솔직한 후기를 이 글에 담아볼게요.`,
  travel_review: (topic) =>
    `"${topic}" 여행을 계획 중이신가요? 실제로 다녀온 경험과 알아두면 좋은 정보를 이 글에 담아볼게요.`,
  info_post: (topic) =>
    `요즘 "${topic}"이(가) 실시간 검색어에 오를 만큼 화제예요. 왜 이렇게 관심을 받고 있는지, 이 글에서 정리해볼게요.`,
  intro_promo: (topic) => `"${topic}"이(가) 궁금하신 분들을 위해, 핵심 특징과 이용 팁을 이 글에 정리해볼게요.`,
  it_review: (topic) => `"${topic}" 구매를 고민하고 계신가요? 실제 사용 후기와 비교 포인트를 이 글에서 정리해드릴게요.`,
  biz_economy: (topic) => `"${topic}"에 대해 궁금해하시는 분들이 많아서, 핵심만 이 글에 정리해볼게요.`,
  beauty_fashion: (topic) => `요즘 "${topic}"이(가) 화제인 이유, 이 글에서 트렌드와 포인트를 정리해볼게요.`,
  daily_hobby: (topic) => `"${topic}", 저도 직접 해보고 느낀 점을 이 글에 솔직하게 담아볼게요.`,
};
const CTA_BY_CATEGORY = {
  food_review: "실제 방문하시면 후기 댓글로 알려주세요! 저장해두고 다음에 또 참고하세요 :)",
  travel_review: "실제 다녀오시면 후기 댓글로 알려주세요! 저장해두고 여행 갈 때 다시 참고하세요 :)",
  info_post: "여기까지 읽어주셔서 감사해요! 도움이 되셨다면 이웃추가하고 다음 글도 받아보세요 :)",
  intro_promo: "궁금한 점은 댓글로 남겨주세요! 도움이 되셨다면 저장하고 주변에도 공유해주세요 :)",
  it_review: "구매 결정에 도움이 되셨길 바라요! 궁금한 점은 댓글로 남겨주세요 :)",
  biz_economy: "여기까지 읽어주셔서 감사해요! 정확한 판단은 본인 상황에 맞게 추가로 확인해보시는 걸 권해요.",
  beauty_fashion: "여기까지 읽어주셔서 감사해요! 도움이 되셨다면 이웃추가하고 다음 글도 받아보세요 :)",
  daily_hobby: "여기까지 읽어주셔서 감사해요! 도움이 되셨다면 저장해두고 따라해보세요 :)",
};

const SECTION_TEMPLATES = {
  food_review: [
    { heading: (t) => `1. "${t}" 기본 정보`, hint: (t) => `위치, 가격대, 영업시간·웨이팅 정보를 적어주세요` },
    { heading: () => `2. 실제로 먹어보니`, hint: () => `대표 메뉴, 맛, 양, 분위기를 적어주세요` },
    { heading: () => `3. 주차·웨이팅 팁`, hint: () => `주차 가능 여부, 웨이팅 피하는 시간대 등 실용 팁을 적어주세요` },
    { heading: () => `4. 이런 분께 추천해요`, hint: () => `어떤 사람에게, 어떤 상황에 추천하는지 적어주세요` },
  ],
  travel_review: [
    { heading: (t) => `1. "${t}" 기본 정보`, hint: (t) => `위치, 가는 방법, 운영시간·요금 등 "${t}"의 기본 정보를 적어주세요` },
    { heading: () => `2. 실제로 가보니`, hint: () => `직접 가서 느낀 점, 분위기, 사진 찍기 좋은 포인트를 적어주세요` },
    { heading: () => `3. 함께 가면 좋은 곳`, hint: () => `근처에 같이 들르면 좋은 장소나 맛집을 적어주세요` },
    { heading: () => `4. 이런 분께 추천해요`, hint: () => `어떤 사람에게, 어떤 시기에 추천하는지 적어주세요` },
  ],
  info_post: [
    { heading: () => `1. 무슨 일이길래`, hint: () => `핵심 사실관계(누가, 언제, 무엇을)를 적어주세요` },
    { heading: () => `2. 왜 화제가 됐을까`, hint: () => `화제가 된 배경이나 이유를 적어주세요` },
    { heading: () => `3. 반응은 어땠나`, hint: () => `실제 반응이나 여론, 관련 통계를 적어주세요` },
    { heading: () => `4. 앞으로는`, hint: () => `전망이나 마무리 생각을 적어주세요` },
  ],
  intro_promo: [
    { heading: (t) => `1. "${t}" 소개`, hint: () => `무엇을 하는 곳/서비스인지, 핵심 특징을 적어주세요` },
    { heading: () => `2. 이용 방법·포인트`, hint: () => `이용 방법, 가격, 예약 방법 등을 적어주세요` },
    { heading: () => `3. 실제 이용해보니`, hint: () => `직접 이용해본 경험이나 강점을 적어주세요` },
    { heading: () => `4. 이런 분께 추천해요`, hint: () => `어떤 사람/상황에 추천하는지 적어주세요` },
  ],
  it_review: [
    { heading: (t) => `1. "${t}" 스펙/가격`, hint: () => `가격, 구성, 주요 스펙을 적어주세요` },
    { heading: () => `2. 실제 사용해보니`, hint: () => `장점, 아쉬운 점을 솔직하게 적어주세요` },
    { heading: () => `3. 이런 제품과 비교하면`, hint: () => `비슷한 다른 제품과 비교했을 때 차별점을 적어주세요` },
    { heading: () => `4. 이런 분께 추천해요`, hint: () => `어떤 사람에게 추천하는지, 구매 링크는 어디인지 적어주세요` },
  ],
  biz_economy: [
    { heading: (t) => `1. "${t}" 핵심 개념`, hint: () => `기본 개념이나 최근 이슈 요약을 적어주세요` },
    { heading: () => `2. 왜 지금 중요할까`, hint: () => `최근 배경이나 변화를 적어주세요` },
    { heading: () => `3. 나에게 미치는 영향`, hint: () => `실생활·재정에 미치는 영향을 적어주세요` },
    { heading: () => `4. 확인해볼 점`, hint: () => `직접 확인하거나 준비해야 할 것들을 적어주세요` },
  ],
  beauty_fashion: [
    { heading: (t) => `1. "${t}" 요즘 트렌드`, hint: () => `트렌드 배경이나 특징을 적어주세요` },
    { heading: () => `2. 핵심 포인트`, hint: () => `구체적인 스타일링/제품 포인트를 적어주세요` },
    { heading: () => `3. 활용 팁`, hint: () => `직접 따라 할 수 있는 팁을 적어주세요` },
    { heading: () => `4. 이런 분께 추천해요`, hint: () => `어떤 사람에게 어울리는지 적어주세요` },
  ],
  daily_hobby: [
    { heading: (t) => `1. "${t}" 시작하게 된 이유`, hint: () => `상황이나 계기를 적어주세요` },
    { heading: () => `2. 직접 해보니`, hint: () => `실제로 해본 경험과 노하우를 적어주세요` },
    { heading: () => `3. 꿀팁`, hint: () => `초보자가 알면 좋은 팁을 적어주세요` },
    { heading: () => `4. 마무리`, hint: () => `소감이나 다음에 시도해볼 것을 적어주세요` },
  ],
};

// 사람이 실제 정보(가격/위치/후기 등)만 채우면 되는 "본문 뼈대"입니다.
function buildSections(topic, categoryId) {
  const fillIn = (hint) => `✏️ ${hint} (실제로 경험했거나 조사한 내용을 2~4문장으로 채워주세요)`;
  const list = SECTION_TEMPLATES[categoryId] || SECTION_TEMPLATES.info_post;
  return list.map((s) => ({ heading: s.heading(topic), body: fillIn(s.hint(topic)) }));
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
 * topic: 글 주제(카테고리 트렌드 목록에서 고르거나 직접 입력) — sourceUrl이 있으면 무시됩니다.
 * category: CATEGORIES에 있는 id 중 하나 (food_review/travel_review/info_post/intro_promo/
 *           it_review/biz_economy/beauty_fashion/daily_hobby)
 * mode: "text" | "text_images" — 이미지 포함 여부
 * images: [{url}] — 업로드된 이미지 목록(선택). mode가 text_images인데 images가 없으면
 *         이미지 없이 "이미지를 첨부해 주세요"라는 안내만 넣습니다(가짜 이미지를 지어내지 않음).
 * sourceUrl: (선택, "링크로 콘텐츠 만들기" 기능용) 넣으면 그 원문 페이지에서 실제 제목/본문을
 *            가져와 그 내용을 바탕으로 초안을 씁니다. mode가 text_images인데 사용자가 이미지를
 *            안 올렸으면, 원문 페이지에 실제로 있던 사진을 대신 씁니다.
 */
async function generateDraft({
  topic,
  category,
  mode = "text",
  images = [],
  sourceUrl,
  // 이 키워드로 상위에 있는 글들을 먼저 보고, 그 분량·구성에 맞춰 씁니다.
  // 비워두면 예전처럼 그냥 씁니다(느려지지 않습니다).
  benchmarkKeyword = null,
} = {}) {
  const cat = CATEGORIES.some((c) => c.id === category) ? category : "info_post";

  if (sourceUrl) {
    let pageData;
    try {
      pageData = await extractPageData(sourceUrl);
    } catch (err) {
      throw new Error(`링크에서 내용을 가져오지 못했습니다: ${err.message}`);
    }
    const cleanTopic = pageData.title || sourceUrl;
    const usedOwnImages = mode === "text_images" && images.length > 0;
    const effectiveImages = usedOwnImages ? images : (mode === "text_images" ? (pageData.images || []).slice(0, 8).map((url) => ({ url })) : []);
    const imageNote =
      mode === "text_images" && !usedOwnImages && effectiveImages.length
        ? " 이미지는 원문 페이지에 실제로 있던 사진을 그대로 가져왔어요 — 본인 소유가 아니라면 게시 전에 사용 권한을 꼭 확인해 주세요."
        : "";

    if (writerConfigured()) {
      try {
        const content = await callClaudeFromUrl(pageData, cat);
        return assembleDraft(
          cleanTopic,
          cat,
          content,
          mode,
          effectiveImages,
          `Claude API로 원문 링크의 실제 내용을 요약·재구성해 만든 초안입니다. ✏️ 표시는 원문에 없는 구체적 사실이라 비워둔 자리입니다.${imageNote}`
        );
      } catch (err) {
        console.error("[blogWriter] URL 기반 Claude 호출 실패, 원문 발췌로 대체합니다:", err.message);
        const content = buildTemplateContentFromUrl(pageData, cat);
        return assembleDraft(
          cleanTopic,
          cat,
          content,
          mode,
          effectiveImages,
          `Claude API 호출에 실패해서(${err.message}) 원문에서 실제로 가져온 문장으로 대신 채웠습니다.${imageNote}`
        );
      }
    }

    const content = buildTemplateContentFromUrl(pageData, cat);
    return assembleDraft(
      cleanTopic,
      cat,
      content,
      mode,
      effectiveImages,
      `서버에 ANTHROPIC_API_KEY가 없어서, 원문 링크에서 실제로 가져온 문장으로 초안을 채웠습니다(창작이 아닙니다).${imageNote} README를 참고해 Claude API 키를 등록하면 더 자연스러운 문장으로 재구성됩니다.`
    );
  }

  const cleanTopic = (topic || "").trim();
  if (!cleanTopic) throw new Error("주제를 입력하거나 링크를 넣어주세요.");

  if (writerConfigured()) {
    try {
      // 상위 글을 먼저 보고 그 모양에 맞춰 씁니다.
      // ⚠️ 여기서 실패해도 글쓰기는 계속돼야 합니다. 네이버가 막혔다고 원고를 못 받으면
      // 손님 입장에서는 그냥 고장 난 겁니다. 벤치마크는 있으면 더 좋은 부가정보입니다.
      let bench = null;
      if (benchmarkKeyword) {
        try {
          const r = await competitorCompare.compare({ keyword: benchmarkKeyword, topN: 3 });
          if (r.ok) bench = r.bench;
        } catch (e) {
          console.warn("[blogWriter] 경쟁 글을 못 봤습니다. 그냥 씁니다:", e.message);
        }
      }

      const content = await callClaude(cleanTopic, cat, images.length, bench);
      return assembleDraft(
        cleanTopic,
        cat,
        content,
        mode,
        images,
        (bench
          ? `지금 "${benchmarkKeyword}"로 상위에 있는 글 ${
              bench.chars ? `평균 ${bench.chars.toLocaleString()}자` : ""
            }에 맞춰 분량과 소제목 수를 잡았습니다. 상위 노출을 보장하는 건 아니고, 그 자리 글들의 모습을 따른 것입니다. `
          : "") +
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
