// 키워드 하나를 깊이 들여다보기.
//
// 기존 opportunityFinder는 "카테고리를 고르면 좋은 키워드를 찾아준다"였습니다.
// 그런데 실제로 글을 쓸 때는 반대 방향이 더 자주 필요합니다.
// **이미 쓰려는 키워드가 있는데, 이게 쓸 만한 키워드인가?**
//
// 그걸 보려면 두 숫자를 함께 봐야 합니다.
//   검색량 — 몇 명이나 이 말을 검색하는가 (수요)
//   문서 수 — 이미 글이 몇 개나 있는가 (공급)
//
// 검색량만 보면 큰 키워드에 뛰어들었다가 묻힙니다. 문서 수만 보면 아무도 안 찾는
// 키워드를 잡습니다. 둘의 비율이 실제로 쓸 만한지를 말해줍니다.

const { getRelatedKeywords } = require("./naverKeywordTool");
const { getBlogPostCount, getTodayPostCount } = require("./naverBlogSearch");

/** 네이버가 주는 경쟁정도를 우리말로. */
const COMP_LABEL = { 높음: "높음", 중간: "보통", 낮음: "낮음" };

function hasAdKeys() {
  return !!(process.env.NAVER_AD_API_KEY && process.env.NAVER_AD_SECRET_KEY && process.env.NAVER_AD_CUSTOMER_ID);
}
function hasSearchKeys() {
  return !!(process.env.NAVER_APIHUB_KEY_ID && process.env.NAVER_APIHUB_KEY_SECRET);
}

/**
 * 기회 점수 — 검색량 대비 문서가 얼마나 적은가.
 *
 * ⚠️ 이 값은 절대적인 기준이 아닙니다. 분야마다 문서가 쌓이는 속도가 달라서,
 * 맛집 키워드의 1.0과 B2B 키워드의 1.0은 뜻이 다릅니다. 같은 분야 안에서
 * 여러 키워드를 견줄 때 쓰는 값으로 봐주세요.
 */
function opportunityScore(searchVolume, docCount) {
  if (!searchVolume) return 0;
  // 문서가 아예 없을 수도 있어서 1을 더해 나눗셈이 터지지 않게 합니다.
  return searchVolume / (docCount + 1);
}

function gradeOf(score, searchVolume) {
  // 검색량 자체가 너무 적으면 점수가 높아도 의미가 없습니다.
  if (searchVolume < 100) {
    return { grade: "너무 작음", tone: "gray", advice: "검색하는 사람이 거의 없습니다. 글을 써도 유입이 안 붙습니다." };
  }
  if (score >= 1.0) return { grade: "황금", tone: "gold", advice: "찾는 사람은 많은데 글이 적습니다. 지금 쓰면 상위에 걸릴 가능성이 큽니다." };
  if (score >= 0.3) return { grade: "좋음", tone: "green", advice: "해볼 만합니다. 글을 정성껏 쓰면 자리를 잡을 수 있습니다." };
  if (score >= 0.1) return { grade: "보통", tone: "amber", advice: "경쟁이 있습니다. 남들이 안 다룬 각도로 써야 밀리지 않습니다." };
  return { grade: "포화", tone: "red", advice: "이미 글이 아주 많습니다. 더 좁은 키워드로 바꾸는 걸 권합니다." };
}

/** 오늘 올라온 글 수로 그 키워드가 지금 뜨거운지 봅니다. */
function heatOf(todayCount) {
  if (todayCount == null) return null;
  if (todayCount >= 50) return { level: "매우 뜨거움", note: "오늘만 50개 넘게 올라왔습니다. 지금 화제인 만큼 경쟁도 치열합니다." };
  if (todayCount >= 15) return { level: "뜨거움", note: "오늘 여러 글이 올라왔습니다. 속도가 중요합니다." };
  if (todayCount >= 3) return { level: "보통", note: "꾸준히 글이 올라오는 키워드입니다." };
  return { level: "조용함", note: "오늘 올라온 글이 거의 없습니다. 경쟁이 덜합니다." };
}

/**
 * 키워드 하나를 진단합니다.
 *
 * @param {string} keyword
 * @param {object} [opts]
 * @param {number} [opts.relatedLimit] 연관 키워드를 몇 개까지 함께 볼지
 */
async function inspect(keyword, { relatedLimit = 12 } = {}) {
  const kw = String(keyword || "").trim();
  if (!kw) throw new Error("키워드를 입력해 주세요.");

  const missing = [];
  if (!hasAdKeys()) missing.push("검색광고 API (검색량)");
  if (!hasSearchKeys()) missing.push("API HUB (블로그 문서 수)");
  if (missing.length === 2) {
    const err = new Error(`네이버 API 키가 없어 조회할 수 없습니다: ${missing.join(", ")}`);
    err.code = "no_keys";
    throw err;
  }

  // ── 검색량과 연관 키워드 ──
  let related = [];
  let self = null;
  if (hasAdKeys()) {
    try {
      related = await getRelatedKeywords(kw);
      // 네이버는 띄어쓰기를 없애서 돌려주므로 그것끼리 맞춰봅니다.
      const flat = kw.replace(/\s+/g, "");
      self = related.find((r) => String(r.keyword).replace(/\s+/g, "") === flat) || null;
    } catch (e) {
      // 연관 키워드를 못 가져와도 문서 수는 볼 수 있으니 계속 갑니다.
      related = [];
      self = null;
      var relatedError = e.message;
    }
  }

  const pc = self ? Number(self.monthlyPcQcCnt) || 0 : 0;
  const mo = self ? Number(self.monthlyMobileQcCnt) || 0 : 0;
  const total = pc + mo;

  // ── 문서 수 ──
  let docCount = null, todayCount = null, todayApprox = false, searchError = null;
  if (hasSearchKeys()) {
    try {
      /**
       * ⚠️ getTodayPostCount 는 **숫자가 아니라 { count, approximate } 를 돌려줍니다.**
       * 그걸 모르고 숫자처럼 썼습니다. 두 가지가 틀어졌습니다:
       *
       *   1) 화면에 "오늘 글 [object Object]건" 이 떴습니다. 눈에 바로 보이는 고장입니다.
       *   2) **열기 판정이 언제나 틀렸습니다.** {count:80} >= 50 은 거짓입니다.
       *      객체는 숫자와 못 견줍니다. 그래서 오늘 80개가 올라온 뜨거운 키워드도
       *      "조용함 — 경쟁이 덜합니다"로 나왔습니다. 정반대로 말한 겁니다.
       *
       * 2번이 훨씬 나쁩니다. 화면이 깨진 건 바로 알지만, 이건 그럴듯하게 틀립니다.
       * (opportunityFinder 는 처음부터 .count 로 제대로 꺼내 쓰고 있었습니다)
       */
      const [docs, today] = await Promise.all([
        getBlogPostCount(kw),
        getTodayPostCount(kw).catch(() => null),
      ]);
      docCount = docs;
      todayCount = today && typeof today === "object" ? today.count : today;
      todayApprox = !!(today && today.approximate);
    } catch (e) {
      searchError = e.message;
    }
  }

  const score = docCount != null ? opportunityScore(total, docCount) : null;
  const grade = score != null ? gradeOf(score, total) : null;

  // ── 연관 키워드도 같이 봐줍니다 ──
  // ⚠️ 연관 키워드마다 문서 수를 조회하면 요청이 수십 번 나갑니다.
  // 검색량 상위 몇 개만 골라서 봅니다.
  const picks = related
    .filter((r) => String(r.keyword).replace(/\s+/g, "") !== kw.replace(/\s+/g, ""))
    .map((r) => ({
      keyword: r.keyword,
      pc: Number(r.monthlyPcQcCnt) || 0,
      mobile: Number(r.monthlyMobileQcCnt) || 0,
      total: (Number(r.monthlyPcQcCnt) || 0) + (Number(r.monthlyMobileQcCnt) || 0),
      competition: COMP_LABEL[r.compIdx] || r.compIdx || null,
    }))
    .filter((r) => r.total >= 100)
    .sort((a, b) => b.total - a.total)
    .slice(0, relatedLimit);

  if (hasSearchKeys() && picks.length) {
    const counts = await Promise.all(
      picks.map((r) => getBlogPostCount(r.keyword).catch(() => null))
    );
    picks.forEach((r, i) => {
      r.docs = counts[i];
      r.score = counts[i] != null ? opportunityScore(r.total, counts[i]) : null;
      r.grade = r.score != null ? gradeOf(r.score, r.total).grade : null;
    });
    // 기회가 좋은 순으로 다시 정렬합니다. 검색량 순보다 이쪽이 쓸모 있습니다.
    picks.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  return {
    keyword: kw,
    volume: self ? { pc, mobile: mo, total } : null,
    competition: self ? (COMP_LABEL[self.compIdx] || self.compIdx || null) : null,
    docs: docCount,
    todayDocs: todayCount,
    // 100개를 다 채웠으면 실제로는 더 많다는 뜻입니다. 숨기면 사장님이 적은 줄 압니다.
    todayDocsApprox: todayApprox,
    score: score != null ? Math.round(score * 100) / 100 : null,
    ...(grade || {}),
    heat: heatOf(todayCount),
    related: picks,
    // 무엇을 못 봤는지 숨기지 않습니다.
    limits: [
      !hasAdKeys() ? "검색광고 API 키가 없어 검색량을 못 봤습니다." : null,
      !hasSearchKeys() ? "API HUB 키가 없어 블로그 문서 수를 못 봤습니다." : null,
      hasAdKeys() && !self ? "네이버 키워드도구에 이 키워드의 검색량 자료가 없습니다. 너무 길거나 드문 키워드일 수 있습니다." : null,
      typeof relatedError !== "undefined" ? `연관 키워드 조회 실패: ${relatedError}` : null,
      searchError ? `문서 수 조회 실패: ${searchError}` : null,
    ].filter(Boolean),
    note:
      "기회 점수는 검색량을 문서 수로 나눈 값입니다. 분야마다 글이 쌓이는 속도가 달라서 " +
      "절대적인 기준은 아니고, 같은 분야 안에서 여러 키워드를 견줄 때 쓰는 값입니다.",
  };
}

/** 키가 있는지 화면에 알려주기 위한 상태. */
function status() {
  /**
   * ⚠️ 예전엔 **열쇠가 있는지만** 봤습니다. 그래서 하루 한도를 다 쓴 날에도
   * "search: true, ready: true" 라고 답했습니다. 화면은 준비됐다고 하는데
   * 눌러보면 문서 수가 빈칸으로 나왔습니다.
   *
   * 크레딧이 0인데 "AI 준비됨"이라고 하던 것과 같은 종류입니다.
   * **열쇠가 있는 것**과 **지금 쓸 수 있는 것**은 다릅니다.
   */
  const q = require("./naverBlogSearch").quotaStatus();
  const searchUsable = hasSearchKeys() && !q.exhausted;

  return {
    ad: hasAdKeys(),
    search: hasSearchKeys(),
    // 지금 실제로 쓸 수 있나 — 화면은 이걸 봐야 합니다.
    searchUsable,
    quota: q,
    ready: hasAdKeys() || searchUsable,
    ...(q.exhausted ? { warning: q.note } : {}),
    guide: {
      ad: {
        what: "월간 검색량과 연관 키워드",
        where: "네이버 검색광고 (searchad.naver.com) → 도구 → API 관리",
        keys: ["NAVER_AD_API_KEY", "NAVER_AD_SECRET_KEY", "NAVER_AD_CUSTOMER_ID"],
        cost: "무료",
      },
      search: {
        what: "블로그 문서 수와 오늘 올라온 글 수",
        where: "네이버 클라우드 플랫폼 (NAVER API HUB) → 검색 API 신청",
        keys: ["NAVER_APIHUB_KEY_ID", "NAVER_APIHUB_KEY_SECRET"],
        cost: "일정량 무료",
      },
    },
  };
}

module.exports = { inspect, status, opportunityScore, gradeOf };
