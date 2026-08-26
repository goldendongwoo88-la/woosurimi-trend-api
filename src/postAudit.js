// 글 진단 — 발행하기 전에 이 글이 괜찮은지 봐줍니다.
//
// ⚠️ 먼저 솔직히 해둘 것
//
// 판다랭크나 블라이 같은 곳은 "블로그 지수"를 점수로 보여줍니다. 그런데
// **네이버의 실제 검색 순위 알고리즘은 공개된 적이 없습니다.** 그런 도구들이 내는
// 숫자도 결국 겉으로 관찰되는 것들로 추정한 값입니다.
//
// 그래서 여기서는 "당신의 블로그 지수는 78점입니다" 같은 말을 하지 않습니다.
// 대신 **확실히 아는 것만** 봅니다:
//
//   - 글자 수, 소제목 수, 이미지 수 같은 셀 수 있는 것
//   - 키워드가 제목·첫 문단·소제목에 들어 있는지
//   - 같은 표현을 반복하는지
//   - 광고법에 걸릴 만한 과장 표현이 있는지
//
// 이건 전부 계산으로 확인되는 사실이고, 고치면 실제로 나아지는 것들입니다.
// 추정한 숫자로 겁주는 대신, 고칠 수 있는 것을 짚어주는 쪽을 택했습니다.

// ─────────────────────────────────────────────────────────────
// 광고법·심의에서 문제가 되는 표현들
//
// 표시광고법과 각 분야 심의 기준에서 실제로 지적되는 것들입니다.
// 블로그가 저품질로 떨어지는 것보다, 이런 표현 때문에 신고당하는 게 더 아픕니다.
// ─────────────────────────────────────────────────────────────
const RISKY = [
  // 최상급 — 객관적 근거 없이 쓰면 부당광고입니다
  { re: /최고(?!급)/g, kind: "최상급", why: "근거 없는 최상급 표현은 부당광고로 봅니다", fix: "'제가 써본 것 중에는' 처럼 개인 경험으로" },
  { re: /최상|최강|국내\s*최|업계\s*최/g, kind: "최상급", why: "근거 없는 최상급 표현", fix: "구체적인 비교 대상과 근거를 함께" },
  { re: /1\s*위|일\s*위|넘버\s*원|No\.?\s*1/gi, kind: "순위 주장", why: "출처 없는 순위 주장은 부당광고", fix: "'○○ 기준 1위' 처럼 출처를 밝히거나 삭제" },
  { re: /100\s*%|백\s*퍼센트|무조건|절대/g, kind: "절대적 표현", why: "예외 없음을 단정하면 문제가 됩니다", fix: "'대부분', '제 경우에는' 으로" },

  // 효능·효과 — 특히 건강기능식품·화장품에서 위험
  { re: /완치|치료(?!제)|낫는다|없애준다|제거해\s*줍니다/g, kind: "의학적 효능", why: "의약품이 아닌 것에 치료 효과를 말하면 약사법 위반", fix: "'도움이 될 수 있다' 정도로" },
  { re: /부작용\s*(이\s*)?없|안전이\s*보장|100\s*%\s*안전/g, kind: "안전성 단정", why: "부작용 없음 단정은 금지", fix: "삭제하거나 '개인차가 있습니다' 추가" },
  { re: /다이어트\s*효과|살이\s*빠[진지]|체중\s*감량\s*효과/g, kind: "체중 감량 효능", why: "식품에 체중 감량 효능 표현은 금지", fix: "개인 경험으로 서술하고 효능 단정은 피하기" },

  // 금전
  { re: /수익\s*보장|원금\s*보장|손해\s*(가\s*)?없|확정\s*수익/g, kind: "수익 보장", why: "수익 보장 표현은 유사수신·부당광고 위험", fix: "삭제" },

  // 대가성 미표시 — 이게 제일 흔하게 걸립니다
  { re: /내돈내산/g, kind: "대가성 확인 필요", why: "협찬을 받았다면 내돈내산 표기는 기만광고입니다", fix: "실제 본인 돈으로 산 게 맞는지 확인" },
];

/** 협찬 표기가 있는지 — 없으면 알려줍니다. */
const SPONSORED_MARK = /(협찬|제공\s*받아|무상\s*으?로?\s*제공|원고료|소정의\s*(수수료|대가)|광고\s*포함|유료\s*광고)/;

/** 네이버 블로그에서 잘 안 먹히는 것들 */
const FILLER = [
  /여러분/g, /안녕하세요[,.\s]*여러분/g,
];

// ─────────────────────────────────────────────────────────────
// 도구
// ─────────────────────────────────────────────────────────────

/** 태그를 걷어내고 순수한 글만 남깁니다. */
function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|div|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const noSpace = (s) => String(s || "").replace(/\s/g, "");

/** 어절 단위로 쪼갭니다. 한국어는 띄어쓰기가 곧 어절입니다. */
function words(s) {
  return String(s || "").split(/\s+/).filter(Boolean);
}

/**
 * 키워드가 몇 번 나오는지 셉니다.
 *
 * ⚠️ 한국어는 조사가 붙어서 "제주도가", "제주도를", "제주도에서" 가 전부 다른 글자입니다.
 * 그냥 문자열로 세면 실제보다 적게 나옵니다. 그래서 키워드 뒤에 조사가 붙은 것까지
 * 함께 셉니다.
 */
function countKeyword(text, keyword) {
  const k = String(keyword || "").trim();
  if (!k) return 0;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 키워드 + (조사 또는 경계)
  const re = new RegExp(escaped, "gi");
  return (String(text).match(re) || []).length;
}

/** 문단으로 나눕니다. */
function paragraphs(text) {
  return String(text).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
}

/** 문장으로 나눕니다. */
function sentences(text) {
  return String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

/**
 * 어미가 얼마나 단조로운지 봅니다.
 *
 * 같은 어미가 계속 반복되면 기계가 쓴 글처럼 읽힙니다. 사람이 쓴 글은
 * "~해요", "~더라고요", "~거든요", "~네요" 가 섞입니다.
 */
function endingVariety(text) {
  const ends = sentences(text)
    .map((s) => s.replace(/[.!?]+$/, "").slice(-4))
    .filter(Boolean);
  if (ends.length < 5) return { unique: ends.length, total: ends.length, ratio: 1, worst: null, worstCount: 0 };

  const counts = new Map();
  for (const e of ends) counts.set(e, (counts.get(e) || 0) + 1);
  let worst = null, worstCount = 0;
  for (const [e, c] of counts) if (c > worstCount) { worst = e; worstCount = c; }

  return {
    unique: counts.size,
    total: ends.length,
    ratio: counts.size / ends.length,
    worst,
    worstCount,
  };
}

/** 같은 어미가 연달아 몇 번이나 나오는지 — 이게 제일 눈에 띕니다. */
function longestEndingRun(text) {
  const ends = sentences(text).map((s) => s.replace(/[.!?]+$/, "").slice(-3));
  let best = 1, cur = 1, bestEnd = ends[0] || "";
  for (let i = 1; i < ends.length; i++) {
    if (ends[i] && ends[i] === ends[i - 1]) {
      cur++;
      if (cur > best) { best = cur; bestEnd = ends[i]; }
    } else cur = 1;
  }
  return { run: best, ending: bestEnd };
}

// ─────────────────────────────────────────────────────────────
// 진단
// ─────────────────────────────────────────────────────────────

/**
 * @param {object} input
 * @param {string} input.title 제목
 * @param {string} input.body 본문 (HTML이어도 되고 순수 글이어도 됩니다)
 * @param {string[]} [input.tags]
 * @param {string} [input.keyword] 노리는 키워드
 * @param {number} [input.images] 이미지 개수 (자리표시 포함)
 */
function audit({ title = "", body = "", tags = [], keyword = "", images = null }) {
  const text = stripHtml(body);
  const titleText = String(title).trim();

  const charsNoSpace = noSpace(text).length;
  const chars = text.length;
  const paras = paragraphs(text);
  const sents = sentences(text);
  const wordCount = words(text).length;

  // 소제목 — HTML의 h 태그를 세거나, 순수 글이면 짧은 독립 줄을 소제목으로 봅니다.
  const htmlHeadings = (String(body).match(/<h[23][^>]*>/gi) || []).length;
  const guessedHeadings = htmlHeadings || paras.filter((p) => p.length <= 30 && !/[.!?]$/.test(p)).length;

  const imageCount = images != null
    ? images
    : (String(body).match(/<img|\[\s*사진\s*자리/gi) || []).length;

  const checks = [];
  const add = (id, label, ok, level, detail, fix) =>
    checks.push({ id, label, ok, level, detail, fix });

  // ── 길이 ──
  // 네이버 상위 노출 글을 보면 공백 제외 1500자 이상이 대부분입니다.
  if (charsNoSpace >= 1500) {
    add("length", "글 길이", true, "good", `공백 제외 ${charsNoSpace.toLocaleString()}자 — 넉넉합니다`);
  } else if (charsNoSpace >= 1000) {
    add("length", "글 길이", false, "warn",
      `공백 제외 ${charsNoSpace.toLocaleString()}자 — 조금 짧습니다`,
      `${(1500 - charsNoSpace).toLocaleString()}자쯤 더 쓰면 좋습니다. 경험담이나 구체적인 상황을 한 단락 늘려보세요.`);
  } else {
    add("length", "글 길이", false, "bad",
      `공백 제외 ${charsNoSpace.toLocaleString()}자 — 많이 짧습니다`,
      `상위 노출 글은 대개 1500자가 넘습니다. ${(1500 - charsNoSpace).toLocaleString()}자쯤 더 필요합니다.`);
  }

  // ── 제목 ──
  const titleLen = titleText.length;
  if (!titleText) {
    add("title", "제목", false, "bad", "제목이 없습니다", "제목을 넣어주세요.");
  } else if (titleLen < 15) {
    add("title", "제목 길이", false, "warn", `${titleLen}자 — 짧습니다`,
      "25~40자 사이가 검색에도 잘 걸리고 클릭도 잘 됩니다. 궁금하게 만드는 말을 붙여보세요.");
  } else if (titleLen > 45) {
    add("title", "제목 길이", false, "warn", `${titleLen}자 — 깁니다`,
      "검색 결과에서 뒷부분이 잘립니다. 40자 안쪽으로 줄이고 중요한 말을 앞으로 옮기세요.");
  } else {
    add("title", "제목 길이", true, "good", `${titleLen}자 — 적당합니다`);
  }

  // ── 키워드 ──
  if (keyword) {
    const inTitle = countKeyword(titleText, keyword) > 0;
    const firstPara = paras[0] || "";
    const inFirst = countKeyword(firstPara, keyword) > 0;
    const total = countKeyword(text, keyword);

    // ⚠️ 비율만 보면 짧은 글에서 엉뚱한 판정이 납니다.
    // "제주도 카페"처럼 두 어절짜리 키워드가 스무 어절짜리 글에 한 번 나오면
    // 계산상 4.5%가 되어 '너무 많다'고 나옵니다. 실제로는 한 번뿐인데요.
    // 그래서 키워드가 차지하는 어절 수만큼 나눠서 보고, 횟수가 적으면 아예
    // 과다 판정을 하지 않습니다.
    const kwWords = words(keyword).length || 1;
    const density = wordCount ? ((total * kwWords) / wordCount) * 100 : 0;

    add("kw-title", "제목에 키워드", inTitle, inTitle ? "good" : "bad",
      inTitle ? `제목에 '${keyword}'가 들어 있습니다` : `제목에 '${keyword}'가 없습니다`,
      inTitle ? null : "검색에서 가장 크게 작용하는 자리입니다. 제목에 꼭 넣으세요.");

    add("kw-first", "첫 문단에 키워드", inFirst, inFirst ? "good" : "warn",
      inFirst ? "첫 문단에 들어 있습니다" : "첫 문단에 없습니다",
      inFirst ? null : "글이 무엇에 관한 것인지 첫 문단에서 드러나야 합니다.");

    if (total === 0) {
      add("kw-count", "키워드 빈도", false, "bad", `본문에 '${keyword}'가 한 번도 안 나옵니다`,
        "본문 곳곳에 자연스럽게 넣어주세요.");
    } else if (total >= 5 && density > 4) {
      add("kw-count", "키워드 빈도", false, "bad",
        `${total}번 (${density.toFixed(1)}%) — 너무 많습니다`,
        "같은 말을 억지로 반복하면 오히려 검색에서 밀립니다. 비슷한 말로 바꿔 쓰세요.");
    } else if (total < 3) {
      add("kw-count", "키워드 빈도", false, "warn",
        `${total}번 — 적습니다`,
        "본문에 세 번 정도는 자연스럽게 나오는 게 좋습니다.");
    } else if (density < 0.5) {
      add("kw-count", "키워드 빈도", false, "warn",
        `${total}번 (${density.toFixed(1)}%) — 적습니다`,
        "본문에 두세 번 더 자연스럽게 넣어보세요.");
    } else {
      add("kw-count", "키워드 빈도", true, "good", `${total}번 (${density.toFixed(1)}%) — 적당합니다`);
    }
  }

  // ── 구조 ──
  if (guessedHeadings >= 3) {
    add("headings", "소제목", true, "good", `${guessedHeadings}개 — 잘 나뉘어 있습니다`);
  } else {
    add("headings", "소제목", false, "warn", `${guessedHeadings}개 — 적습니다`,
      "소제목 세 개 이상으로 나누면 읽기도 쉽고 검색에도 유리합니다.");
  }

  // 문단 길이 — 모바일에서 벽처럼 보이면 이탈합니다
  const longParas = paras.filter((p) => noSpace(p).length > 300);
  if (longParas.length) {
    add("para", "문단 길이", false, "warn",
      `${longParas.length}개 문단이 300자를 넘습니다`,
      "휴대폰에서는 글자 벽처럼 보입니다. 두세 문장마다 줄을 바꿔주세요.");
  } else {
    add("para", "문단 길이", true, "good", `평균 ${Math.round(charsNoSpace / (paras.length || 1))}자 — 읽기 좋습니다`);
  }

  // ── 이미지 ──
  if (imageCount >= 5) {
    add("image", "이미지", true, "good", `${imageCount}장 — 넉넉합니다`);
  } else if (imageCount >= 1) {
    add("image", "이미지", false, "warn", `${imageCount}장 — 적습니다`,
      "5장 이상 넣으면 체류 시간이 늘고 검색에도 유리합니다.");
  } else {
    add("image", "이미지", false, "bad", "이미지가 없습니다",
      "네이버는 이미지가 있는 글을 선호합니다. 최소 3~5장은 넣어주세요.");
  }

  // ── 문장 ──
  const variety = endingVariety(text);
  const run = longestEndingRun(text);
  if (run.run >= 4) {
    add("ending", "어미 반복", false, "warn",
      `'${run.ending}' 로 끝나는 문장이 ${run.run}번 연달아 나옵니다`,
      "기계가 쓴 글처럼 읽힙니다. '~더라고요', '~거든요', '~네요' 를 섞어보세요.");
  } else if (variety.ratio < 0.35 && variety.total >= 8) {
    add("ending", "어미 반복", false, "warn",
      `문장 끝맺음이 단조롭습니다 (${variety.unique}종류 / ${variety.total}문장)`,
      "말투를 몇 가지 섞으면 훨씬 자연스러워집니다.");
  } else {
    add("ending", "어미 반복", true, "good", `끝맺음이 다양합니다 (${variety.unique}종류)`);
  }

  const longSents = sents.filter((s) => noSpace(s).length > 90);
  if (longSents.length >= 3) {
    add("sentence", "문장 길이", false, "warn",
      `90자 넘는 긴 문장이 ${longSents.length}개 있습니다`,
      "한 문장에 한 가지만 담으면 훨씬 잘 읽힙니다.");
  } else {
    add("sentence", "문장 길이", true, "good", "문장 길이가 적당합니다");
  }

  // ── 태그 ──
  const tagList = (tags || []).map((s) => String(s).replace(/^#/, "").trim()).filter(Boolean);
  if (tagList.length >= 5 && tagList.length <= 15) {
    add("tags", "태그", true, "good", `${tagList.length}개 — 적당합니다`);
  } else if (tagList.length < 5) {
    add("tags", "태그", false, "warn", `${tagList.length}개 — 적습니다`, "5~15개 사이가 좋습니다.");
  } else {
    add("tags", "태그", false, "warn", `${tagList.length}개 — 많습니다`,
      "너무 많으면 관련 없는 태그로 보입니다. 15개 안쪽으로 줄이세요.");
  }

  // ── 위험한 표현 ──
  const risks = [];
  const haystack = `${titleText}\n${text}`;
  for (const r of RISKY) {
    const found = haystack.match(r.re);
    if (found && found.length) {
      risks.push({
        kind: r.kind,
        words: [...new Set(found)].slice(0, 5),
        count: found.length,
        why: r.why,
        fix: r.fix,
      });
    }
  }
  if (risks.length) {
    add("risk", "표현 위험", false, "bad",
      `${risks.length}가지 유형, 총 ${risks.reduce((a, r) => a + r.count, 0)}곳`,
      "아래 목록을 확인하고 고쳐주세요. 저품질보다 신고가 더 아픕니다.");
  } else {
    add("risk", "표현 위험", true, "good", "문제가 될 만한 표현이 없습니다");
  }

  // 협찬 표기 — 상품 관련 글로 보이는데 표기가 없으면 알려줍니다
  const looksCommercial = /(제품|상품|구매|후기|리뷰|가격|할인|추천\s*템|써봤)/.test(haystack);
  if (looksCommercial && !SPONSORED_MARK.test(haystack)) {
    add("sponsor", "대가성 표기", false, "warn",
      "상품 관련 글로 보이는데 협찬 표기가 없습니다",
      "협찬·제공받은 글이라면 반드시 밝혀야 합니다. 본인 돈으로 산 것이면 그냥 두셔도 됩니다.");
  }

  // ── 종합 ──
  const bad = checks.filter((c) => !c.ok && c.level === "bad").length;
  const warn = checks.filter((c) => !c.ok && c.level === "warn").length;
  const good = checks.filter((c) => c.ok).length;

  // ⚠️ 이건 네이버 지수가 아닙니다. 위에서 확인한 항목을 몇 개나 통과했는지일 뿐입니다.
  const score = Math.round((good / checks.length) * 100);

  let grade, summary;
  if (bad === 0 && warn <= 1) { grade = "좋음"; summary = "이대로 올리셔도 좋습니다."; }
  else if (bad === 0) { grade = "무난"; summary = "몇 군데만 다듬으면 더 좋아집니다."; }
  else if (bad <= 2) { grade = "손볼 곳 있음"; summary = "빨간 항목부터 고쳐보세요."; }
  else { grade = "많이 손봐야 함"; summary = "빨간 항목이 여러 개입니다. 하나씩 고쳐보세요."; }

  return {
    score, grade, summary,
    counts: { good, warn, bad, total: checks.length },
    stats: {
      chars, charsNoSpace, words: wordCount,
      paragraphs: paras.length, sentences: sents.length,
      headings: guessedHeadings, images: imageCount,
      tags: tagList.length,
      titleLength: titleLen,
      avgParagraph: Math.round(charsNoSpace / (paras.length || 1)),
      endingVariety: variety.unique,
    },
    checks,
    risks,
    // 근거를 밝힙니다. 무엇을 봤고 무엇을 안 봤는지.
    disclaimer:
      "네이버의 실제 검색 순위 알고리즘은 공개되어 있지 않습니다. 이 점수는 '네이버 지수'가 아니라, " +
      "위에 나열된 확인 가능한 항목을 몇 개나 통과했는지입니다. 고치면 실제로 나아지는 것들만 담았습니다.",
  };
}

module.exports = { audit, stripHtml, countKeyword, endingVariety };
