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
 *
 * ⚠️ 2026-08-27에 실제 프롬프트 크기를 재고 다시 매겼습니다.
 * 그전 값은 감으로 매긴 것이었고 **3~4배 틀렸습니다.**
 * (scripts/cost-estimate.js 로 언제든 다시 잽니다)
 *
 * 잰 값 (Sonnet 4.5, 1달러 1,380원):
 *   스킬 프롬프트 한 번    8,766 ~ 64,619 토큰
 *   한 단계 (캐시 켠 상태)  약 70원
 *   원고 한 편 (7단계)     약 740원   ← 캐시 없으면 1,913원
 *
 * ⚠️ 여기 적혀 있던 "프로 288,610원/월" 은 **틀린 숫자였습니다.** 두 가지가 잘못됐습니다.
 *   1) 크레딧을 무제한으로 쓴다고 봤습니다. 실제로는 아래 aiCredits.perDay 한도가 있습니다.
 *   2) 캐시를 안 건 상태로 계산했습니다. 그 뒤 시스템 프롬프트와 대화를 둘 다 캐시에 겁니다.
 *
 * 2026-08-27 다시 계산 (scripts/cost-model.js — 언제든 다시 돌립니다):
 *   원고 한 편   캐시 살아있으면 555원 · 식었으면 763원   (예전엔 1,294원)
 *
 *   요금제      값        하루한도   한달 최대   원가(식은 캐시)   남는 값
 *   라이트    12,900원     10개       27편        20,809원       -8,335원
 *   프로      29,900원     40개      109편        83,236원      -54,323원
 *   비즈니스   69,000원    120개      327편       249,709원     -182,986원
 *
 * ⚠️ 이건 **한도를 매일 꽉 채워 원고만 뽑는 손님**을 가정한 것입니다.
 * 그런 손님은 드물지만, 한 명만 있어도 그만큼 잃습니다.
 *
 * 본전이 되는 하루 크레딧:  라이트 5개 · 프로 13개 · 비즈니스 32개
 *
 * ⚠️ 예전 결론("원고 생성은 이 가격대에서 팔 수 없다")은 **이제 반은 틀렸습니다.**
 * 캐시를 걸고 나니 프로 13크레딧 = 하루 원고 1.2편까지는 남습니다.
 * 하루 한 편은 블로그 하는 사람에게 자연스러운 속도라, 팔 수 있는 상품이 됩니다.
 * 예전엔 6크레딧(원고 0.5편)이라 상품이 안 됐습니다.
 *
 * ⚠️ 다만 지금 한도(프로 40개)는 여전히 너무 높습니다. 손님 받기 전에 정하셔야 합니다.
 * 고를 수 있는 길:
 *   1) 한도를 본전선으로 내림 (프로 40 → 13). 제일 단순하지만 상품이 약해 보입니다.
 *   2) 한도는 두고 **원고만** 따로 셈 (분석은 넉넉히, 원고는 하루 1~2편)
 *   3) 초과분을 따로 받음 (Mirra가 크레딧당 $0.05로 하는 방식)
 *
 * ⚠️ 값은 제가 정할 일이 아닙니다. 숫자만 올려둡니다.
 * 분석 기능(진단·순위추적·키워드·줄바꿈·맞춤법)은 AI를 안 써서 원가가 0원입니다.
 * 거기는 얼마든지 넉넉하게 주셔도 됩니다.
 */
/**
 * 1 크레딧 = 약 70원 원가로 잡습니다 (스킬 한 단계 값).
 * 아래 숫자는 실제 원가를 70으로 나눈 값입니다.
 *
 * ⚠️ 캐시를 걸고 다시 재보니 실제로는 한 크레딧에 약 50원입니다
 * (원고 한 편 555원 ÷ 11크레딧). 70원은 **넉넉하게 잡은 값**이라 그대로 둡니다.
 * 원가를 낮게 잡았다가 모자라는 것보다, 높게 잡아두는 쪽이 안전합니다.
 *
 * ⚠️ 출력(AI가 쓴 글)은 **캐시로 못 깎습니다.** 원고 한 편 555원 중 319원이 출력입니다.
 * 그래서 아무리 캐시를 잘 걸어도 이 아래로는 안 내려갑니다.
 */
const KRW_PER_CREDIT = 70;

const CREDIT_COST = {
  // 원고 한 편은 7단계를 밟습니다. 740원 ÷ 70 ≈ 11
  // ⚠️ 3이었습니다. 실제 원가의 4분의 1로 받고 있었습니다.
  draft: 11,
  rewrite: 6,        // 다시 쓰기 — 프롬프트는 같고 단계가 적습니다
  title: 1,          // 제목 뽑기 — 33원. 제일 쌉니다
  outline: 1,        // 목차 잡기
  improve: 3,        // 글 고쳐쓰기 — 95원
  cardnews: 3,       // 카드뉴스
  shortform: 4,      // 숏폼 대본 + 렌더
  // 썸네일 자동 고르기 — 사진 12장을 AI가 눈으로 봅니다.
  // 사진 한 장 읽는 비용이 400px 기준 200토큰쯤이라 12장이면 2,400토큰입니다.
  // 글 한 편 쓰는 것(draft)보다는 싸고 제목 뽑기보다는 비쌉니다.
  thumbAuto: 2,
  // 자동 강조 — 본문을 통째로 읽고 강조할 자리를 고릅니다.
  // 사진을 안 봐서 썸네일보다 쌉니다.
  emphasis: 1,
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

module.exports = { PLANS, CREDIT_COST, KRW_PER_CREDIT, getPlan, limitOf, listPlans, comparison };
