const { getRelatedKeywords } = require("./naverKeywordTool");
const { getBlogPostCount, getTodayPostCount } = require("./naverBlogSearch");

// 씨앗 키워드는 실제로 많이 검색되는 "2단어 정도의 대중적인" 키워드로 골랐습니다.
// (너무 길고 구체적인 문장형 키워드는 네이버 키워드도구가 연관 키워드를 거의 못 찾아서
// 확장이 안 되는 문제가 있었습니다 — 그래서 다시 이 방식으로 돌아왔습니다.)
// "황금 키워드"는 씨앗을 억지로 좁히는 게 아니라, 씨앗에서 뽑힌 넉넉한 후보들 중에서
// opportunityScore(검색량 ÷ 블로그글수)가 높은 것을 골라내는 방식으로 찾습니다.
const CATEGORY_SEEDS = {
  "국내여행": ["국내 숙소", "온천 여행", "근교 나들이", "가을 여행지"],
  "패션/미용": ["가을 니트", "수분크림", "가을 코디", "겨울 부츠"],
  "반려동물": ["강아지 산책", "고양이 사료", "반려동물 병원비", "강아지 훈련"],
  "육아/결혼": ["이유식", "돌잔치 준비", "어린이집 적응", "웨딩 준비"],
  "맛집": ["홈카페 레시피", "혼밥 맛집", "홈파티 메뉴", "다이어트 식단"],
  "스포츠": ["러닝화 추천", "홈트레이닝", "골프 레슨", "클라이밍 초보"],
  "사회/정치": ["연말정산", "부동산 정책", "국민연금", "실업급여"],
  "IT/컴퓨터": ["노트북 추천", "무선 이어폰", "스마트폰 특가", "미니PC"],
  "자동차": ["전기차 충전", "경차 추천", "자동차보험", "중고차 시세"],
  "비즈니스/경제": ["ISA 계좌", "적금 금리", "부가세 신고", "창업 지원금"],
  "건강/의학": ["두피 관리", "면역력 음식", "허리디스크", "수면 개선"],
  "요리/레시피": ["에어프라이어 레시피", "다이어트 도시락", "자취 요리", "명절 음식"],
  "세계여행": ["유럽 여행", "동남아 여행", "일본 여행", "해외여행 준비"],
  "원예/재배": ["베란다 텃밭", "다육식물", "화분 분갈이", "공기정화식물"],
  "상품리뷰": ["무선청소기", "캠핑용품", "소형가전", "에어프라이어"],
  "인테리어/DIY": ["원룸 인테리어", "셀프 인테리어", "베란다 확장", "가구 리폼"],
};

/**
 * category의 씨앗 키워드들로 연관 키워드를 모으고,
 * 각 키워드의 (월간 검색량) ÷ (블로그 글 수 + 1) = 기회 점수로 정렬합니다.
 * 점수가 높을수록 "찾는 사람은 많은데 글은 아직 적은" 키워드입니다.
 *
 * recencyMode:
 *  - "all"（기본값): 지금까지 올라온 전체 블로그 글 수 기준
 *  - "today": 오늘(한국시간) 올라온 글 수 기준 — "요즘 막 뜨는데 아직 아무도 안 쓴" 키워드를
 *    찾는 데 더 유용하지만, 네이버 API가 날짜만 주고 시간은 안 줘서 정확히 "24시간"은 아니고
 *    "오늘 날짜로 찍힌 글"이라는 점을 감안해서 봐주세요 (getTodayPostCount 주석 참고).
 */
async function findOpportunities(category, limit = 20, recencyMode = "all") {
  const seeds = CATEGORY_SEEDS[category];
  if (!seeds) {
    throw new Error(
      `등록되지 않은 카테고리입니다: "${category}". 사용 가능한 카테고리: ${Object.keys(CATEGORY_SEEDS).join(", ")}`
    );
  }

  const seen = new Map();
  for (const seed of seeds) {
    const related = await getRelatedKeywords(seed);
    for (const item of related) {
      if (!seen.has(item.keyword)) seen.set(item.keyword, item);
    }
  }

  // 넉넉히 뽑아둔 뒤, 블로그 검색량(경쟁)까지 확인해서 최종 20개로 추립니다.
  const candidates = Array.from(seen.values()).slice(0, limit * 3);

  const results = [];
  for (const c of candidates) {
    try {
      const monthlySearchVolume = c.monthlyPcQcCnt + c.monthlyMobileQcCnt;
      let blogPostCount;
      let postCountApprox = false;

      if (recencyMode === "today") {
        const today = await getTodayPostCount(c.keyword);
        blogPostCount = today.count;
        postCountApprox = today.approximate;
      } else {
        blogPostCount = await getBlogPostCount(c.keyword);
      }

      const opportunityScore = monthlySearchVolume / (blogPostCount + 1);
      // "문서/검색" = 블로그 문서 수 ÷ 월간 검색량. 검색하는 사람 수에 비해 이미 올라온
      // 문서가 얼마나 되는지를 보는 비율이라, 이 숫자가 "낮을수록" 경쟁이 적은(글이
      // 부족한) 틈새 키워드라는 뜻입니다 — opportunityScore와 방향이 반대인 값입니다.
      const docPerSearch = monthlySearchVolume > 0 ? blogPostCount / monthlySearchVolume : null;
      results.push({
        keyword: c.keyword,
        monthlySearchVolume,
        blogPostCount,
        blogPostCountLabel: postCountApprox ? `${blogPostCount}+` : String(blogPostCount),
        docPerSearch: docPerSearch === null ? null : Math.round(docPerSearch * 100) / 100,
        recencyMode,
        competition: c.compIdx,
        opportunityScore: Math.round(opportunityScore * 100) / 100,
      });
    } catch (err) {
      // 개별 키워드 하나가 실패해도 전체를 멈추지 않고 건너뜁니다.
      console.error(`[opportunityFinder] "${c.keyword}" 처리 실패:`, err.message);
    }
  }

  results.sort((a, b) => b.opportunityScore - a.opportunityScore);
  return results.slice(0, limit);
}

module.exports = { findOpportunities, CATEGORY_SEEDS };
