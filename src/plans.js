/**
 * 요금제.
 *
 * ⚠️ 가격을 왜 이렇게 잡았는지 근거를 남깁니다. 나중에 올릴 때 필요합니다.
 *
 * 2026-08-27 기준 경쟁사 실제 가격 (직접 확인):
 *   판다랭크   무료 / 19,800 / 39,600 / 99,000   (VAT 포함, 연간결제 2개월 무료)
 *   블라이     무료 / 50,000 / 100,000           (VAT 포함)
 *   블로그매트릭스     44,000 / 77,000 / 132,000
 *   Mirra      $0 / $19 / $49 / $99 / $199       (크레딧제, 초과분 $0.05/크레딧)
 *
 * 우리 사정:
 *   - 후기 0개. 아무도 우리를 모릅니다. 5만원짜리는 안 팔립니다.
 *   - 대신 사장님에게 인스타 42.8만 팔로워가 있습니다. 유입은 만들 수 있습니다.
 *   - 그러니 **싸게 많이 받아서 후기를 쌓는 것**이 지금 국면의 목표입니다.
 *
 * 그래서 판다랭크 입문가(19,800) 아래로 들어갑니다. 후기가 50개쯤 쌓이면
 * 라이트 19,900 / 프로 39,900으로 올립니다. 그때는 올릴 근거가 생깁니다.
 *
 * ⚠️ 크레딧 원가 감각 — 밑지고 팔면 안 됩니다.
 * AI 원고 1건에 Claude API 비용이 대략 70~100원 듭니다. 프로 29,900원에
 * 원고를 무제한으로 주면 100건 쓰는 사람 한 명한테 1만원을 잃습니다.
 * 그래서 **분석은 넉넉하게, AI 생성은 크레딧으로** 나눕니다.
 * 분석은 우리 서버 품만 들고 돈이 안 나갑니다.
 */

const PLANS = {
  free: {
    id: "free",
    name: "무료",
    price: 0,
    blurb: "내 블로그 상태부터 확인해 보세요",
    limits: {
      diagnose: { perDay: 3 },        // 블로그 진단
      postCheck: { perDay: 5 },       // 글 노출·누락 확인
      keyword: { perMinute: 1 },      // 키워드 분석 (판다랭크와 같은 방식)
      rankKeywords: 3,                // 순위 추적 등록 키워드 수
      rankPosts: 1,                   // 순위 추적 등록 글 수
      // 경쟁 글 비교 — 글을 5편씩 받아오느라 무겁습니다. 따로 셉니다.
      // 무료는 하루 1번. 한 번 써보면 값어치를 알게 되고, 그게 결제 이유가 됩니다.
      compare: { perDay: 1 },
      thumb: { perDay: 5 },        // 홈판 썸네일 만들기
      aiCredits: { perDay: 0 },       // AI 생성 — 무료는 없음
    },
    features: { ads: true, alert: false, academy: false, bulk: false },
  },

  light: {
    id: "light",
    name: "라이트",
    price: 12900,
    blurb: "혼자 블로그 한 개를 제대로 굴리는 분",
    limits: {
      diagnose: { perDay: 30 },
      postCheck: { perDay: 100 },
      keyword: { perMinute: 10 },
      rankKeywords: 20,
      rankPosts: 10,
      compare: { perDay: 5 },
      thumb: { perDay: 60 },        // 홈판 썸네일 만들기
      aiCredits: { perDay: 10 },
    },
    features: { ads: false, alert: true, academy: true, bulk: false },
  },

  pro: {
    id: "pro",
    name: "프로",
    price: 29900,
    recommended: true,
    blurb: "글로 돈을 버는 단계. 대부분 이걸 씁니다",
    limits: {
      diagnose: { perDay: 100 },
      postCheck: { perDay: 500 },
      keyword: { perMinute: 30 },
      rankKeywords: 100,
      rankPosts: 50,
      compare: { perDay: 20 },
      thumb: { perDay: 200 },        // 홈판 썸네일 만들기
      aiCredits: { perDay: 40 },
    },
    features: { ads: false, alert: true, academy: true, bulk: true },
  },

  biz: {
    id: "biz",
    name: "비즈니스",
    price: 69000,
    blurb: "블로그 여러 개 · 대행사 · 팀",
    limits: {
      diagnose: { perDay: 400 },
      postCheck: { perDay: 2000 },
      keyword: { perMinute: 60 },
      rankKeywords: 500,
      rankPosts: 200,
      compare: { perDay: 80 },
      thumb: { perDay: 800 },        // 홈판 썸네일 만들기
      aiCredits: { perDay: 120 },
    },
    features: { ads: false, alert: true, academy: true, bulk: true },
  },
};

/**
 * AI 기능별 크레딧 값.
 * ⚠️ 실제 API 비용에 비례해서 매깁니다. 감으로 매기면 어딘가에서 밑집니다.
 */
const CREDIT_COST = {
  draft: 3,          // 블로그 원고 생성 (제일 비쌉니다)
  rewrite: 2,        // 원고 다시 쓰기
  title: 1,          // 제목 뽑기
  outline: 1,        // 목차 잡기
  improve: 2,        // 글 고쳐쓰기
  cardnews: 3,       // 카드뉴스
  shortform: 4,      // 숏폼 대본 + 렌더
};

function getPlan(id) {
  return PLANS[id] || PLANS.free;
}

function limitOf(planId, key) {
  return getPlan(planId).limits[key];
}

function listPlans() {
  return Object.values(PLANS);
}

/** 화면에 표로 뿌릴 비교 데이터 */
function comparison() {
  const rows = [
    { key: "diagnose", label: "블로그 진단", fmt: (l) => `일 ${l.diagnose.perDay}회` },
    { key: "postCheck", label: "글 노출·누락 확인", fmt: (l) => `일 ${l.postCheck.perDay}회` },
    { key: "keyword", label: "키워드 분석", fmt: (l) => `분당 ${l.keyword.perMinute}회` },
    { key: "rankKeywords", label: "순위 추적 키워드", fmt: (l) => `${l.rankKeywords}개` },
    { key: "rankPosts", label: "순위 추적 글", fmt: (l) => `${l.rankPosts}개` },
    { key: "compare", label: "경쟁 글 비교", fmt: (l) => `일 ${l.compare.perDay}회` },
    { key: "thumb", label: "홈판 썸네일", fmt: (l) => `일 ${l.thumb.perDay}장` },
    { key: "aiCredits", label: "AI 크레딧", fmt: (l) => (l.aiCredits.perDay ? `일 ${l.aiCredits.perDay}` : "없음") },
  ];
  return {
    plans: listPlans().map((p) => ({ id: p.id, name: p.name, price: p.price, recommended: !!p.recommended })),
    rows: rows.map((r) => ({
      label: r.label,
      values: listPlans().map((p) => r.fmt(p.limits)),
    })),
    extras: [
      { label: "광고 없이 이용", values: listPlans().map((p) => (p.features.ads ? "—" : "○")) },
      { label: "순위 변동 알림", values: listPlans().map((p) => (p.features.alert ? "○" : "—")) },
      { label: "대량 분석", values: listPlans().map((p) => (p.features.bulk ? "○" : "—")) },
    ],
  };
}

module.exports = { PLANS, CREDIT_COST, getPlan, limitOf, listPlans, comparison };
