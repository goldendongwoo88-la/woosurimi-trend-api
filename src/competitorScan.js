// 상위 노출 글 뜯어보기.
//
// 판다랭크와 블라이 둘 다 있는 기능인데 우리에겐 없었습니다.
// "글자 수를 1500자 이상 쓰세요" 같은 일반론보다, **지금 그 키워드에서 실제로 위에
// 올라와 있는 글들이 어떻게 생겼는지**가 훨씬 쓸모 있습니다.
//
// 같은 1500자라도 맛집 키워드와 IT 키워드는 상위 글의 평균이 다릅니다. 남들이 실제로
// 어떻게 쓰고 있는지를 보고 거기에 맞추는 게 맞습니다.
//
// ⚠️ 볼 수 있는 것과 못 보는 것
// 네이버 블로그 검색 API는 제목·요약·작성자·날짜·링크만 줍니다. 본문 전체는 안 줍니다.
// 그래서 "상위 글 평균 글자 수"는 알 수 없습니다. 대신 제목에서 읽을 수 있는 것들
// (길이, 키워드 위치, 숫자 사용, 후킹 패턴)과 작성 시기를 봅니다.
// 알 수 없는 걸 그럴듯하게 추정해서 내놓지 않습니다.

const { getBlogPostCount } = require("./naverBlogSearch");

const BASE_URL = "https://naverapihub.apigw.ntruss.com";
const PATH = "/search/v1/blog";

function hasKeys() {
  return !!(process.env.NAVER_APIHUB_KEY_ID && process.env.NAVER_APIHUB_KEY_SECRET);
}

/** 네이버가 검색어에 <b> 태그를 씌워서 주므로 걷어냅니다. */
function clean(s) {
  return String(s || "")
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

/** "20260824" → "2026-08-24" */
function fmtDate(s) {
  const t = String(s || "");
  return t.length === 8 ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : t;
}

function daysAgo(yyyymmdd) {
  const t = String(yyyymmdd || "");
  if (t.length !== 8) return null;
  const d = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
  const kstToday = new Date(Date.now() + 9 * 3600000);
  const today = Date.UTC(kstToday.getUTCFullYear(), kstToday.getUTCMonth(), kstToday.getUTCDate());
  return Math.round((today - d) / 86400000);
}

/**
 * 제목에서 읽어낼 수 있는 것들.
 *
 * 상위 글 제목을 열 개쯤 모아놓고 보면 그 키워드에서 통하는 패턴이 보입니다.
 * 어떤 키워드는 숫자를 넣은 제목이 많고("카페 3곳"), 어떤 키워드는 질문형이 많습니다.
 */
function titleFeatures(title) {
  const t = clean(title);
  return {
    length: t.length,
    hasNumber: /\d/.test(t),
    hasQuestion: /[?？]|까요|나요|일까|인가/.test(t),
    hasBracket: /[[\](){}【】]/.test(t),
    hasReview: /(후기|리뷰|솔직|내돈내산|다녀온|써본)/.test(t),
    hasRecommend: /(추천|best|BEST|top|TOP|모음|정리)/.test(t),
    hasYear: /20\d\d/.test(t),
  };
}

/**
 * 상위 노출 글을 가져와 패턴을 뽑습니다.
 *
 * @param {string} keyword
 * @param {object} [opts]
 * @param {number} [opts.count] 몇 개까지 볼지 (최대 30)
 */
async function scan(keyword, { count = 20 } = {}) {
  const kw = String(keyword || "").trim();
  if (!kw) throw new Error("키워드를 입력해 주세요.");
  if (!hasKeys()) {
    const err = new Error("네이버 API HUB 키가 없어 상위 글을 볼 수 없습니다.");
    err.code = "no_keys";
    throw err;
  }

  const display = Math.min(30, Math.max(5, count));
  // sort=sim 이 관련도순(= 대체로 상위 노출 순)입니다. date는 최신순이라 다릅니다.
  const url = `${BASE_URL}${PATH}?query=${encodeURIComponent(kw)}&display=${display}&sort=sim`;

  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": process.env.NAVER_APIHUB_KEY_ID,
      "X-NCP-APIGW-API-KEY": process.env.NAVER_APIHUB_KEY_SECRET,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`블로그 검색 API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const items = (data.items || []).map((it) => {
    const title = clean(it.title);
    return {
      title,
      link: it.link,
      blogName: clean(it.bloggername),
      blogLink: it.bloggerlink,
      date: fmtDate(it.postdate),
      daysAgo: daysAgo(it.postdate),
      summary: clean(it.description),
      features: titleFeatures(title),
      // 제목 맨 앞에 키워드가 있는지 — 검색에서 유리하다고들 합니다.
      keywordAtStart: title.replace(/\s/g, "").startsWith(kw.replace(/\s/g, "")),
      keywordInTitle: title.replace(/\s/g, "").includes(kw.replace(/\s/g, "")),
    };
  });

  if (!items.length) {
    return { keyword: kw, total: data.total || 0, items: [], patterns: null, advice: ["이 키워드로 올라온 글이 없습니다. 아주 새로운 키워드이거나 검색어가 너무 깁니다."] };
  }

  // ── 패턴 뽑기 ──
  const n = items.length;
  const pct = (v) => Math.round((v / n) * 100);
  const lens = items.map((i) => i.features.length).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)];

  const patterns = {
    count: n,
    title: {
      min: lens[0],
      max: lens[lens.length - 1],
      median,
      avg: Math.round(lens.reduce((a, b) => a + b, 0) / n),
    },
    keywordInTitle: pct(items.filter((i) => i.keywordInTitle).length),
    keywordAtStart: pct(items.filter((i) => i.keywordAtStart).length),
    hasNumber: pct(items.filter((i) => i.features.hasNumber).length),
    hasQuestion: pct(items.filter((i) => i.features.hasQuestion).length),
    hasBracket: pct(items.filter((i) => i.features.hasBracket).length),
    hasReview: pct(items.filter((i) => i.features.hasReview).length),
    hasRecommend: pct(items.filter((i) => i.features.hasRecommend).length),
    freshness: {
      within7: items.filter((i) => i.daysAgo != null && i.daysAgo <= 7).length,
      within30: items.filter((i) => i.daysAgo != null && i.daysAgo <= 30).length,
      within365: items.filter((i) => i.daysAgo != null && i.daysAgo <= 365).length,
      oldest: Math.max(...items.map((i) => i.daysAgo ?? 0)),
    },
  };

  // ── 그래서 어떻게 쓰라는 건지 ──
  const advice = [];

  advice.push(`상위 ${n}개 글의 제목은 ${patterns.title.min}~${patterns.title.max}자이고 가운데값이 ${median}자입니다. 그 언저리로 맞추세요.`);

  if (patterns.keywordAtStart >= 50) {
    advice.push(`${patterns.keywordAtStart}%가 제목을 '${kw}'로 시작합니다. 앞에 두는 게 이 키워드에서는 통하는 방식입니다.`);
  } else if (patterns.keywordInTitle >= 70) {
    advice.push(`${patterns.keywordInTitle}%가 제목에 '${kw}'를 넣었습니다. 맨 앞은 아니어도 제목 안에는 꼭 넣으세요.`);
  }

  if (patterns.hasNumber >= 50) {
    advice.push(`${patterns.hasNumber}%가 제목에 숫자를 씁니다("3곳", "5가지" 같은). 숫자를 넣은 제목이 잘 먹히는 키워드입니다.`);
  }
  if (patterns.hasReview >= 50) {
    advice.push(`${patterns.hasReview}%가 후기·리뷰 형태입니다. 정보 나열보다 직접 겪은 이야기가 먹힙니다.`);
  }
  if (patterns.hasRecommend >= 50) {
    advice.push(`${patterns.hasRecommend}%가 추천·모음 형태입니다. 여러 개를 묶어 비교해주는 글을 찾는 사람이 많습니다.`);
  }
  if (patterns.hasQuestion >= 35) {
    advice.push(`${patterns.hasQuestion}%가 질문형 제목입니다. 궁금증을 던지는 제목이 통합니다.`);
  }

  const f = patterns.freshness;
  if (f.within7 >= n * 0.4) {
    advice.push(`상위 글의 ${f.within7}개가 최근 일주일 안에 올라온 글입니다. 새 글이 빨리 치고 올라오는 키워드라 지금 쓰면 기회가 있습니다.`);
  } else if (f.within365 <= n * 0.3) {
    advice.push(`상위 글 대부분이 1년도 더 된 글입니다. 오래된 글이 자리를 지키고 있어서 새로 들어가기는 어렵지만, 그만큼 내용이 낡았을 수 있으니 최신 정보로 승부해볼 만합니다.`);
  }

  return {
    keyword: kw,
    total: data.total || 0,
    items,
    patterns,
    advice,
    limits: [
      "네이버 검색 API는 본문 전체를 주지 않습니다. 그래서 상위 글의 실제 글자 수·이미지 수는 알 수 없습니다.",
      "여기 보이는 순서는 검색 관련도순이고, 실제 검색 결과 화면의 순서와 완전히 같지는 않습니다.",
    ],
  };
}

module.exports = { scan, hasKeys, titleFeatures };
