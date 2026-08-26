// 글 진단 — 네이버가 실제로 보는 것에 맞춰서.
//
// ⚠️ 처음 만든 버전이 틀린 게 여러 개였습니다. 무엇이 틀렸고 왜 그랬는지 남겨둡니다.
//
//   1) 키워드를 하나만 받았습니다.
//      "px 화장품, 군대 px 화장품 추천" 처럼 쉼표로 여러 개를 넣으면 그 문자열
//      통째로 찾아서 "제목에 키워드가 없다"고 했습니다. 제목에 멀쩡히 있는데도요.
//
//   2) 키워드 빈도를 비율(%)로 봤습니다.
//      네이버 D.I.A.가 보는 건 비율이 아니라 **횟수**입니다. 본문에 3~5회가 기준입니다.
//      비율로 보면 글이 길수록 더 많이 넣어야 하는 것처럼 나오는데, 그건 사실과 다릅니다.
//
//   3) 소제목을 아무 짧은 줄이나 세었습니다.
//      2,131자 글에서 소제목 159개가 나왔습니다. 말이 안 됩니다. 순수 텍스트로는
//      소제목과 짧은 문단을 구별할 방법이 없는데 구별할 수 있는 척했습니다.
//
//   4) 첫 문단 키워드를 '주의'로 띄웠습니다.
//      권장 사항이지 필수가 아닙니다. 첫 문단에 없어도 상위 노출 잘 됩니다.
//
// ─────────────────────────────────────────────────────────────
// 네이버가 실제로 보는 것 (2026년 기준)
//
// C-Rank — 블로그 단위. 이 블로그가 그 분야에서 얼마나 전문적인가.
//   주제 집중도(카테고리 3개 이내), 발행 꾸준함(주 2~3회), 이웃 소통, 원본 비율.
//   ⚠️ 글 하나로는 잴 수 없습니다. 그래서 여기서 점수로 매기지 않고 설명만 합니다.
//
// D.I.A. / D.I.A.+ — 글 단위. 이 글이 검색한 사람에게 얼마나 쓸모 있는가.
//   글자 수 1,500자 이상, 제목에 키워드 1회, 본문에 키워드 3~5회,
//   원본 이미지 5장 이상, 소제목 구조, 표·목록 활용, 체류 2분 이상.
//   이건 글 하나로 잴 수 있습니다.
//
// 홈피드(홈판) — 검색과 아예 다른 로직입니다. 추천 알고리즘이라
//   리트리버(후보 고르기) → 랭커(순위 매기기) 2단계로 돕니다.
//   랭커는 "클릭은 높은데 금방 나가는 글"을 걸러냅니다. 즉 CTR보다 **체류시간과
//   반응**이 중요합니다. 짧은 문단, 시각적 구분, 질문형 전개가 체류를 늘립니다.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 광고법·심의에서 실제로 지적되는 표현
// 저품질로 떨어지는 것보다 신고당하는 게 더 아픕니다.
// ─────────────────────────────────────────────────────────────
// ⚠️ 오탐을 줄이려고 두 가지를 바꿨습니다.
//
//  1) 패턴을 좁혔습니다. 예전엔 '절대'나 '일 위' 같은 흔한 말이 그대로 걸려서,
//     멀쩡한 글에 빨간불이 켜졌습니다. '절대'는 뒤에 부정어가 올 때만,
//     순위는 숫자 1 앞뒤가 글자가 아닐 때만 잡습니다.
//
//  2) **걸린 문장을 그대로 보여줍니다.** 단어만 보여주면 정말 문제인지 아닌지
//     판단할 수가 없습니다. 어차피 규칙으로 100% 가려낼 수는 없으니,
//     사람이 보고 판단할 수 있게 근거를 함께 내놓는 편이 낫습니다.
const RISKY = [
  { re: /최고(?!급|령|참|위원|경영|의결|조|점|치|속)/g, kind: "최상급",
    why: "근거 없는 최상급 표현은 부당광고로 봅니다",
    fix: "'제가 써본 것 중에는' 처럼 개인 경험으로" },
  { re: /최상급?(?!층)|최강|국내\s*최[고대]|업계\s*최[고대]/g, kind: "최상급",
    why: "근거 없는 최상급 표현",
    fix: "구체적인 비교 대상과 근거를 함께" },
  // 앞뒤가 숫자·글자가 아닐 때만. "2026년 1위"는 잡고 "제일 위쪽"은 안 잡습니다.
  { re: /(?<![0-9가-힣])1\s*위(?![0-9])|넘버\s*원|\bNo\.?\s*1\b/gi, kind: "순위 주장",
    why: "출처 없는 순위 주장은 부당광고",
    fix: "'○○ 기준 1위' 처럼 출처를 밝히거나 삭제" },
  // '절대'는 부정어가 따라올 때만. "절대적인 기준" 같은 건 안 잡습니다.
  { re: /100\s*%(?!\s*(면세|충전|환급))|백\s*퍼센트|무조건|절대\s*(안|않|없|못|불가)/g,
    kind: "절대적 표현",
    why: "예외 없음을 단정하면 문제가 됩니다",
    fix: "'대부분', '제 경우에는' 으로" },
  { re: /완치|말끔히\s*낫|없애\s*줍니다|제거해\s*줍니다|치료\s*효과/g, kind: "의학적 효능",
    why: "의약품이 아닌 것에 치료 효과를 말하면 약사법 위반",
    fix: "'도움이 될 수 있다' 정도로" },
  { re: /부작용\s*(이|은)?\s*없|안전이\s*보장|100\s*%\s*안전/g, kind: "안전성 단정",
    why: "부작용 없음 단정은 금지",
    fix: "삭제하거나 '개인차가 있습니다' 추가" },
  { re: /다이어트\s*효과|살이\s*빠[진지]|체중\s*감량\s*효과/g, kind: "체중 감량 효능",
    why: "식품에 체중 감량 효능 표현은 금지",
    fix: "개인 경험으로 서술하고 효능 단정은 피하기" },
  { re: /수익\s*보장|원금\s*보장|확정\s*수익|손실\s*(이|은)?\s*없/g, kind: "수익 보장",
    why: "수익 보장 표현은 유사수신·부당광고 위험",
    fix: "삭제" },
];

// 협찬·대가성 표기.
// ⚠️ 처음엔 몇 개만 넣어서, 표기를 해둔 글에도 "표기가 없다"고 나왔습니다.
// 실제로 쓰이는 문구를 최대한 넓게 담습니다. 빠뜨려서 잘못 지적하는 쪽이
// 몇 개 놓치는 쪽보다 훨씬 나쁩니다.
const SPONSORED_MARK = new RegExp([
  "협찬", "제공\\s*받", "지원\\s*받", "무상\\s*으?로?\\s*제공", "무료로\\s*제공",
  "원고료", "소정의\\s*(수수료|대가|원고료|금액)", "일정\\s*(액|금액)의\\s*수수료",
  "수수료를\\s*(받|제공)", "대가를\\s*(받|지급)", "커미션",
  "광고\\s*(포함|입니다)", "유료\\s*광고", "홍보성?\\s*(글|콘텐츠|포스팅)",
  "파트너스", "쿠팡\\s*파트너스", "제휴\\s*(링크|마케팅)", "어필리에이트",
  "체험단", "서포터즈", "리뷰어", "업체\\s*(로부터|에서)\\s*(제공|지원)",
  "제작비", "\\bAD\\b", "\\bPR\\b", "sponsored",
].join("|"), "i");

// 내돈내산은 위험 표현이 아니라 '확인해보시라'는 안내로 따로 뺐습니다.
// 진짜 본인 돈으로 샀으면 아무 문제 없는 말인데 빨간불이 켜지면 곤란합니다.
const SELF_PURCHASE = /내돈내산/;

// ─────────────────────────────────────────────────────────────
// 글 손질
// ─────────────────────────────────────────────────────────────

function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|div|li|blockquote|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const noSpace = (s) => String(s || "").replace(/\s/g, "");
const words = (s) => String(s || "").split(/\s+/).filter(Boolean);
const paragraphs = (t) => String(t).split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

function sentences(text) {
  return String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

/**
 * 키워드 여러 개를 받습니다.
 *
 * ⚠️ 이걸 안 해서 "px 화장품, 군대 px 화장품 추천"을 통째로 찾다가
 * 제목에 멀쩡히 있는 키워드를 못 찾았습니다.
 * 쉼표·슬래시·줄바꿈으로 나눕니다. 띄어쓰기로는 안 나눕니다
 * ("제주도 카페"는 두 어절이지만 하나의 키워드니까요).
 */
function splitKeywords(input) {
  if (Array.isArray(input)) input = input.join(",");
  return String(input || "")
    .split(/[,/\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5); // 다섯 개를 넘으면 어차피 어느 것에도 집중이 안 됩니다
}

/**
 * 키워드가 몇 번 나오는지.
 *
 * ⚠️ 한국어는 조사가 붙습니다("제주도가", "제주도를"). 그리고 띄어쓰기도 제각각이라
 * "px화장품"과 "px 화장품"이 섞여 나옵니다. 둘 다 같은 것으로 세야 합니다.
 * 그래서 공백을 지운 상태로 비교합니다.
 */
function countKeyword(text, keyword) {
  const hay = noSpace(text).toLowerCase();
  const needle = noSpace(keyword).toLowerCase();
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * 소제목 세기.
 *
 * ⚠️ 여기가 가장 크게 틀렸던 곳입니다. 짧은 줄을 전부 소제목으로 세어서
 * 2,131자 글에 소제목 159개가 나왔습니다.
 *
 * 진실은 이렇습니다. **순수 텍스트만 보고는 소제목과 짧은 문단을 구별할 수 없습니다.**
 * 네이버 에디터에서 복사하면 소제목도 그냥 한 줄 텍스트로 넘어오거든요.
 *
 * 그래서 구별할 수 있는 척하지 않습니다.
 *   - HTML의 h 태그나 마크다운 ## 처럼 **표시가 있으면** 정확히 셉니다.
 *   - 표시가 없으면 **모른다고 말합니다.** 짐작해서 틀린 숫자를 보여주느니 낫습니다.
 */
function countHeadings(rawBody) {
  const html = String(rawBody || "");

  // 1) HTML 태그
  const hTags = (html.match(/<h[1-6][^>]*>/gi) || []).length;
  if (hTags) return { count: hTags, how: "html", certain: true };

  const text = stripHtml(html);

  // 2) 마크다운 ## 또는 흔히 쓰는 소제목 표시
  const marked = text.split("\n").filter((line) => {
    const l = line.trim();
    return /^#{1,4}\s+\S/.test(l)                  // ## 소제목
      || /^[■▶●◆★☑✔]\s*\S/.test(l)                // ■ 소제목
      || /^【[^】]{1,30}】\s*$/.test(l)              // 【소제목】
      || /^\[[^\]]{1,30}\]\s*$/.test(l)             // [소제목]
      || /^<[^>]{1,30}>\s*$/.test(l);               // <소제목>
  }).length;

  if (marked) return { count: marked, how: "marked", certain: true };

  return { count: null, how: "unknown", certain: false };
}

/** 표나 목록을 썼는지 — D.I.A.가 가산점을 준다고 알려진 요소입니다. */
function hasStructure(rawBody) {
  const html = String(rawBody || "");
  const text = stripHtml(html);
  return {
    table: /<table|<tr/i.test(html) || /\|.+\|.+\|/.test(text),
    list: /<[ou]l|<li/i.test(html) || /^\s*[-*·•]\s+\S/m.test(text) || /^\s*\d+[.)]\s+\S/m.test(text),
    video: /<iframe|<video|youtu\.?be|youtube\.com|tv\.naver/i.test(html),
  };
}

function endingVariety(text) {
  const ends = sentences(text).map((s) => s.replace(/[.!?]+$/, "").slice(-4)).filter(Boolean);
  if (ends.length < 5) return { unique: ends.length, total: ends.length, ratio: 1 };
  const counts = new Map();
  for (const e of ends) counts.set(e, (counts.get(e) || 0) + 1);
  return { unique: counts.size, total: ends.length, ratio: counts.size / ends.length };
}

function longestEndingRun(text) {
  const ends = sentences(text).map((s) => s.replace(/[.!?]+$/, "").slice(-3));
  let best = 1, cur = 1, bestEnd = ends[0] || "";
  for (let i = 1; i < ends.length; i++) {
    if (ends[i] && ends[i] === ends[i - 1]) { cur++; if (cur > best) { best = cur; bestEnd = ends[i]; } }
    else cur = 1;
  }
  return { run: best, ending: bestEnd };
}

// ─────────────────────────────────────────────────────────────
// 진단
// ─────────────────────────────────────────────────────────────

function audit({ title = "", body = "", tags = [], keyword = "", images = null }) {
  const text = stripHtml(body);
  const titleText = String(title).trim();

  const charsNoSpace = noSpace(text).length;
  const paras = paragraphs(text);
  const sents = sentences(text);
  const wordCount = words(text).length;
  const keywords = splitKeywords(keyword);

  const heads = countHeadings(body);
  const struct = hasStructure(body);
  const imageCount = images != null && images !== ""
    ? Number(images)
    : (String(body).match(/<img|\[\s*사진|\[\s*이미지/gi) || []).length;

  const checks = [];
  const add = (id, label, ok, level, detail, fix, group) =>
    checks.push({ id, label, ok, level, detail, fix, group });

  // 세 갈래로 나눠서 봅니다. 검색과 홈피드는 보는 게 다르니까요.
  const SEARCH = "검색 노출";
  const FEED = "홈피드 · 체류시간";
  const SAFE = "안전";

  // ══ 검색 노출 (D.I.A.) ══════════════════════════════════

  // 글자 수 — 1,500자가 기준입니다.
  if (charsNoSpace >= 1500) {
    add("length", "글 길이", true, "good", `공백 제외 ${charsNoSpace.toLocaleString()}자 — 기준(1,500자)을 넘었습니다`, null, SEARCH);
  } else if (charsNoSpace >= 1000) {
    add("length", "글 길이", false, "warn",
      `공백 제외 ${charsNoSpace.toLocaleString()}자 — 기준에 ${(1500 - charsNoSpace).toLocaleString()}자 모자랍니다`,
      "겪은 상황을 한 단락 더 풀어 쓰면 금방 채워집니다.", SEARCH);
  } else {
    add("length", "글 길이", false, "bad",
      `공백 제외 ${charsNoSpace.toLocaleString()}자 — 기준(1,500자)에 ${(1500 - charsNoSpace).toLocaleString()}자 모자랍니다`,
      "D.I.A.가 보는 기본 조건입니다. 짧으면 다른 게 좋아도 밀립니다.", SEARCH);
  }

  // 제목 길이
  const titleLen = titleText.length;
  if (!titleText) {
    add("title", "제목", false, "bad", "제목이 없습니다", "제목을 넣어주세요.", SEARCH);
  } else if (titleLen < 15) {
    add("title", "제목 길이", false, "warn", `${titleLen}자 — 짧습니다`,
      "25~40자가 검색 결과에서 안 잘리면서 궁금하게 만들 수 있는 길이입니다.", SEARCH);
  } else if (titleLen > 45) {
    add("title", "제목 길이", false, "warn", `${titleLen}자 — 깁니다`,
      "검색 결과에서 뒤가 잘립니다. 중요한 말을 앞으로 옮기세요.", SEARCH);
  } else {
    add("title", "제목 길이", true, "good", `${titleLen}자 — 적당합니다`, null, SEARCH);
  }

  // ── 키워드 ──
  // ⚠️ 비율이 아니라 횟수로 봅니다. D.I.A. 기준이 본문 3~5회입니다.
  const kwReport = [];
  if (keywords.length) {
    for (const kw of keywords) {
      const inTitle = countKeyword(titleText, kw);
      const inBody = countKeyword(text, kw);
      const inFirst = countKeyword(paras[0] || "", kw) > 0;
      kwReport.push({ keyword: kw, title: inTitle, body: inBody, first: inFirst });
    }

    const missingInTitle = kwReport.filter((k) => k.title === 0);
    const mainKw = kwReport[0];

    if (!missingInTitle.length) {
      add("kw-title", "제목에 키워드", true, "good",
        keywords.length === 1
          ? `제목에 '${keywords[0]}'이(가) 있습니다`
          : `키워드 ${keywords.length}개가 모두 제목에 있습니다`, null, SEARCH);
    } else if (missingInTitle.length === keywords.length) {
      add("kw-title", "제목에 키워드", false, "bad",
        `제목에 ${missingInTitle.map((k) => `'${k.keyword}'`).join(", ")}이(가) 없습니다`,
        "검색에서 가장 크게 작용하는 자리입니다. 최소 하나는 제목에 넣으세요.", SEARCH);
    } else {
      // 대표 키워드 하나만 제목에 있어도 괜찮습니다. 여러 개를 다 넣으면 오히려 어색해집니다.
      add("kw-title", "제목에 키워드", true, "good",
        `'${kwReport.find((k) => k.title > 0).keyword}'이(가) 제목에 있습니다` +
        ` (${missingInTitle.map((k) => k.keyword).join(", ")}는 없지만 괜찮습니다)`, null, SEARCH);
    }

    // 본문 횟수 — 대표 키워드 기준
    //
    // ⚠️ 3~5회가 권장이지만 통과는 7회까지 시켜줍니다. 6회 썼다고 빨간불을 켜면
    // 멀쩡한 글을 고치게 만드는 꼴이라서요. 다만 6~7회일 때 "적당합니다 (기준 3~5회)"라고
    // 하면 앞뒤가 안 맞습니다. 통과시키되 위쪽에 가까워졌다고 정확히 말합니다.
    const b = mainKw.body;
    if (b >= 3 && b <= 5) {
      add("kw-body", "본문 키워드 횟수", true, "good",
        `'${mainKw.keyword}' ${b}번 — 적당합니다 (권장 3~5회)`, null, SEARCH);
    } else if (b === 6 || b === 7) {
      add("kw-body", "본문 키워드 횟수", true, "good",
        `'${mainKw.keyword}' ${b}번 — 권장(3~5회)보다 조금 많지만 괜찮습니다`,
        "더 늘리지는 마세요. 8회를 넘어가면 남용으로 봅니다.", SEARCH);
    } else if (b === 0) {
      add("kw-body", "본문 키워드 횟수", false, "bad",
        `본문에 '${mainKw.keyword}'이(가) 한 번도 안 나옵니다`,
        "제목과 본문이 따로 놀면 검색에서 밀립니다. 본문에 서너 번 자연스럽게 넣으세요.", SEARCH);
    } else if (b < 3) {
      add("kw-body", "본문 키워드 횟수", false, "warn",
        `'${mainKw.keyword}' ${b}번 — 기준(3~5회)보다 적습니다`,
        `${3 - b}번쯤 더 넣으면 좋습니다. 소제목이나 마무리에 자연스럽게요.`, SEARCH);
    } else {
      add("kw-body", "본문 키워드 횟수", false, "warn",
        `'${mainKw.keyword}' ${b}번 — 기준(3~5회)보다 많습니다`,
        "같은 말을 억지로 반복하면 오히려 밀립니다. 비슷한 말로 바꿔 쓰세요.", SEARCH);
    }
  }

  // 소제목 — 모르면 모른다고 합니다.
  if (heads.certain) {
    if (heads.count >= 3) {
      add("headings", "소제목", true, "good", `${heads.count}개 — 잘 나뉘어 있습니다`, null, SEARCH);
    } else {
      add("headings", "소제목", false, "warn", `${heads.count}개 — 적습니다`,
        "소제목 3개 이상으로 나누면 D.I.A.의 구조 점수와 체류시간이 함께 올라갑니다.", SEARCH);
    }
  } else {
    add("headings", "소제목", true, "info",
      "소제목이 몇 개인지 알 수 없습니다",
      "순수 텍스트로는 소제목과 짧은 문단을 구별할 수 없어요. 소제목 앞에 ## 를 붙이거나 네이버 에디터에서 서식째로 붙여넣으시면 정확히 세어 드립니다.", SEARCH);
  }

  // 이미지 — 5장이 기준입니다.
  if (imageCount >= 5) {
    add("image", "이미지", true, "good", `${imageCount}장 — 기준(5장)을 넘었습니다`, null, SEARCH);
  } else if (imageCount >= 1) {
    add("image", "이미지", false, "warn", `${imageCount}장 — 기준(5장)보다 적습니다`,
      "직접 찍은 사진일수록 좋습니다. 퍼온 이미지는 원본 점수에 도움이 안 됩니다.", SEARCH);
  } else {
    add("image", "이미지", false, "bad", "이미지가 없습니다",
      "D.I.A.는 원본 이미지 5장 이상을 기준으로 봅니다. 직접 찍은 사진이면 더 좋습니다.", SEARCH);
  }

  // 표·목록·영상 — 있으면 가산점
  const extras = [];
  if (struct.list) extras.push("목록");
  if (struct.table) extras.push("표");
  if (struct.video) extras.push("영상");
  if (extras.length) {
    add("struct", "표·목록·영상", true, "good", `${extras.join("·")}을(를) 썼습니다`, null, SEARCH);
  } else {
    add("struct", "표·목록·영상", false, "info", "표·목록·영상이 없습니다",
      "목록이나 표를 하나만 넣어도 읽기 쉬워지고 D.I.A. 구조 점수에 보탬이 됩니다. 영상은 가산점이 큽니다.", SEARCH);
  }

  // ══ 홈피드 · 체류시간 ═══════════════════════════════════
  //
  // 홈피드 랭커는 "클릭은 높은데 금방 나가는 글"을 걸러냅니다.
  // 그래서 여기서는 읽다가 도망가지 않게 만드는 요소를 봅니다.

  const longParas = paras.filter((p) => noSpace(p).length > 300);
  const avgPara = Math.round(charsNoSpace / (paras.length || 1));
  if (longParas.length) {
    add("para", "문단 길이", false, "warn",
      `${longParas.length}개 문단이 300자를 넘습니다 (평균 ${avgPara}자)`,
      "휴대폰에서 글자 벽처럼 보이면 바로 나갑니다. 두세 문장마다 줄을 바꿔주세요.", FEED);
  } else if (avgPara <= 120) {
    add("para", "문단 길이", true, "good", `평균 ${avgPara}자 — 휴대폰에서 읽기 좋습니다`, null, FEED);
  } else {
    add("para", "문단 길이", true, "good", `평균 ${avgPara}자 — 무난합니다`, null, FEED);
  }

  // 읽는 데 걸리는 시간 — 체류 2분이 기준입니다.
  // 한국어는 분당 500~600자쯤 읽습니다. 사진을 보는 시간도 조금 얹습니다.
  const readSec = Math.round((charsNoSpace / 550) * 60 + imageCount * 3);
  if (readSec >= 120) {
    add("dwell", "예상 읽는 시간", true, "good",
      `약 ${Math.floor(readSec / 60)}분 ${readSec % 60}초 — 기준(2분)을 넘습니다`, null, FEED);
  } else {
    add("dwell", "예상 읽는 시간", false, "warn",
      `약 ${Math.floor(readSec / 60)}분 ${readSec % 60}초 — 기준(2분)보다 짧습니다`,
      "홈피드는 체류시간을 크게 봅니다. 글을 늘리거나 사진을 더 넣으면 올라갑니다.", FEED);
  }

  // 질문형 전개 — 읽는 사람을 붙잡아 둡니다.
  const questions = (text.match(/[?？]/g) || []).length;
  if (questions >= 2) {
    add("question", "질문형 전개", true, "good", `물음표 ${questions}개 — 읽는 사람에게 말을 걸고 있습니다`, null, FEED);
  } else {
    add("question", "질문형 전개", false, "info", `물음표 ${questions}개`,
      "중간중간 '이런 적 있으시죠?' 같은 질문을 던지면 끝까지 읽는 비율이 올라갑니다.", FEED);
  }

  // 어미 반복
  const variety = endingVariety(text);
  const run = longestEndingRun(text);
  if (run.run >= 4) {
    add("ending", "어미 반복", false, "warn",
      `'${run.ending}' 로 끝나는 문장이 ${run.run}번 연달아 나옵니다`,
      "기계가 쓴 글처럼 읽힙니다. 2026년 네이버는 AI가 쓴 글인지 실제 경험인지를 문맥으로 판별합니다.", FEED);
  } else if (variety.ratio < 0.35 && variety.total >= 8) {
    add("ending", "어미 반복", false, "warn",
      `끝맺음이 단조롭습니다 (${variety.unique}종류 / ${variety.total}문장)`,
      "'~더라고요', '~거든요', '~네요'를 섞으면 사람이 쓴 글처럼 읽힙니다.", FEED);
  } else {
    add("ending", "어미 반복", true, "good", `끝맺음이 다양합니다 (${variety.unique}종류)`, null, FEED);
  }

  const longSents = sents.filter((s) => noSpace(s).length > 90);
  if (longSents.length >= 3) {
    add("sentence", "문장 길이", false, "warn", `90자 넘는 문장이 ${longSents.length}개 있습니다`,
      "한 문장에 한 가지만 담으면 훨씬 잘 읽힙니다.", FEED);
  } else {
    add("sentence", "문장 길이", true, "good", "문장 길이가 적당합니다", null, FEED);
  }

  // 태그
  const tagList = (Array.isArray(tags) ? tags : String(tags).split(/[,\s]+/))
    .map((s) => String(s).replace(/^#/, "").trim()).filter(Boolean);
  if (tagList.length >= 5 && tagList.length <= 15) {
    add("tags", "태그", true, "good", `${tagList.length}개 — 적당합니다`, null, FEED);
  } else if (tagList.length < 5) {
    add("tags", "태그", false, "warn", `${tagList.length}개 — 적습니다`,
      "5~15개가 적당합니다. 홈피드 후보를 고를 때 태그도 단서로 씁니다.", FEED);
  } else {
    add("tags", "태그", false, "warn", `${tagList.length}개 — 많습니다`,
      "관련 없는 태그가 섞이면 오히려 엉뚱한 사람에게 노출됩니다.", FEED);
  }

  // ══ 안전 ════════════════════════════════════════════════
  const risks = [];
  const haystack = `${titleText}\n${text}`;

  /** 걸린 자리가 들어 있는 문장을 잘라냅니다. 어디가 문제인지 보여줘야 판단이 됩니다. */
  const contextAt = (idx, len) => {
    const from = Math.max(0, haystack.lastIndexOf("\n", idx) + 1);
    let s = haystack.slice(from, idx);
    const cut = Math.max(s.lastIndexOf(". "), s.lastIndexOf("! "), s.lastIndexOf("? "));
    if (cut > 0) s = s.slice(cut + 2);
    const rest = haystack.slice(idx + len);
    const endM = rest.match(/^[\s\S]{0,80}?([.!?\n]|$)/);
    const tail = endM ? endM[0] : rest.slice(0, 60);
    const before = s.length > 40 ? "…" + s.slice(-40) : s;
    return (before + haystack.substr(idx, len) + tail).replace(/\s+/g, " ").trim();
  };

  for (const r of RISKY) {
    const hits = [];
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(haystack)) !== null) {
      hits.push({ word: m[0].trim(), where: contextAt(m.index, m[0].length) });
      if (r.re.lastIndex === m.index) r.re.lastIndex++; // 빈 매치 무한루프 방지
      if (hits.length >= 6) break;
    }
    if (hits.length) {
      risks.push({
        kind: r.kind,
        words: [...new Set(hits.map((h) => h.word))].slice(0, 5),
        // ⚠️ 문장을 함께 보여줍니다. 규칙으로 100% 가려낼 수는 없으니
        // 사람이 보고 판단할 수 있게 근거를 내놓는 게 맞습니다.
        hits: hits.slice(0, 4),
        count: hits.length, why: r.why, fix: r.fix,
      });
    }
  }

  if (risks.length) {
    add("risk", "표현 위험", false, "bad",
      `${risks.length}가지 유형, ${risks.reduce((a, r) => a + r.count, 0)}곳에서 걸렸습니다`,
      "아래에 걸린 문장을 그대로 붙여뒀습니다. 보시고 정말 문제인지 판단해 주세요. 규칙으로 잡는 거라 멀쩡한 표현이 걸릴 수도 있습니다.", SAFE);
  } else {
    add("risk", "표현 위험", true, "good", "문제가 될 만한 표현이 없습니다", null, SAFE);
  }

  // 대가성 표기.
  //
  // ⚠️ 여기서 한 번 크게 틀렸습니다. 예전엔 '후기'나 '가격' 같은 단어가 하나만 있어도
  // "협찬 표기가 없다"고 경고했습니다. 그래서 전세 계약 정보글에까지 빨간불이 켜졌습니다.
  //
  // 근본적으로 **협찬을 받았는지는 글쓴이만 압니다.** 글만 봐서는 알 수 없는 걸
  // 규칙으로 단정하려 한 게 잘못이었습니다. 그래서 두 가지로 나눕니다:
  //
  //   1) 뭔가 받았다는 말이 글에 있는데 표기가 없다 → 진짜 위험. 경고합니다.
  //   2) 그냥 상품 이야기가 나온다 → 알 수 없음. 점수를 깎지 않고 알림만 남깁니다.
  const hasMark = SPONSORED_MARK.test(haystack);

  // 받은 정황인데 **정식 표기 문구는 아닌** 말들.
  //
  // ⚠️ "제품을 제공받아 작성했습니다"는 그 자체가 이미 표기라서 여기 넣으면 안 됩니다.
  // 여기 담을 건 받은 건 분명한데 흘리듯 적어서 표기 구실을 못 하는 말들입니다.
  // "사장님이 서비스로 주셨어요" 같은 문장이요. 공정위는 이걸 표기로 안 봅니다.
  const RECEIVED = /(무료로\s*(받|주)|공짜로\s*(받|주)|서비스로\s*(받|주|줬)|그냥\s*주[셨셔]|선물로\s*받아)/;

  // 상업성 신호. 하나로는 아무 뜻도 없어서 **셋 이상** 모였을 때만 봅니다.
  const COMMERCE_SIGNALS = [
    /제품|상품/, /구매|주문|결제/, /가격|원대|만원/, /할인|쿠폰|특가/,
    /리뷰|후기/, /브랜드|입점/, /배송|택배/, /사용\s*감|써\s*봤|발라\s*봤/,
  ];
  const signalCount = COMMERCE_SIGNALS.filter((re) => re.test(haystack)).length;

  if (hasMark) {
    const m = haystack.match(SPONSORED_MARK);
    add("sponsor", "대가성 표기", true, "good",
      `표기가 있습니다 ("${m[0]}")`, null, SAFE);
  } else if (RECEIVED.test(haystack)) {
    const got = haystack.match(RECEIVED);
    add("sponsor", "대가성 표기", false, "bad",
      `"${got[0]}"이라는 말이 있는데 대가성 표기를 못 찾았습니다`,
      "받으셨다면 반드시 밝혀야 합니다. 표시광고법 위반이라 과태료가 나올 수 있어요. " +
      "표기를 하셨는데 여기서 못 잡았다면 알려주세요 — 문구를 추가하겠습니다.", SAFE);
  } else if (signalCount >= 3) {
    // ⚠️ level "info"라 점수를 깎지 않습니다. 확인해 드릴 방법이 없는 걸
    // 감점하면, 본인 돈으로 산 사람이 매번 억울해집니다.
    add("sponsor", "대가성 표기", true, "info",
      "상품 이야기가 있는 글입니다",
      "협찬이나 제공받은 것이면 표기해 주세요. 본인 돈으로 사신 거면 그냥 두시면 됩니다. " +
      "이건 글만 봐서는 알 수 없어서 점수에 넣지 않았습니다.", SAFE);
  }

  // 내돈내산은 따로. 진짜면 아무 문제 없는 말이라 빨간불을 켜지 않습니다.
  if (SELF_PURCHASE.test(haystack) && hasMark) {
    add("selfbuy", "내돈내산 표기", false, "warn",
      "'내돈내산'과 협찬 표기가 같이 있습니다",
      "협찬을 받았는데 내돈내산이라고 쓰면 기만광고가 됩니다. 둘 중 하나는 지워주세요.", SAFE);
  }

  // ══ 점수 ════════════════════════════════════════════════
  //
  // ⚠️ info는 점수에서 뺍니다. "모르겠다"거나 "있으면 좋다" 정도인 것을
  // 통과/실패로 세면 점수가 실제보다 나쁘게 나옵니다.
  const scored = checks.filter((c) => c.level !== "info");
  const bad = scored.filter((c) => !c.ok && c.level === "bad").length;
  const warn = scored.filter((c) => !c.ok && c.level === "warn").length;
  const good = scored.filter((c) => c.ok).length;
  const score = scored.length ? Math.round((good / scored.length) * 100) : 0;

  let grade, summary;
  if (bad === 0 && warn <= 1) { grade = "좋음"; summary = "이대로 올리셔도 좋습니다."; }
  else if (bad === 0) { grade = "무난"; summary = "몇 군데만 다듬으면 더 좋아집니다."; }
  else if (bad <= 2) { grade = "손볼 곳 있음"; summary = "빨간 항목부터 고쳐보세요."; }
  else { grade = "많이 손봐야 함"; summary = "빨간 항목이 여러 개입니다. 하나씩 고쳐보세요."; }

  return {
    score, grade, summary,
    counts: { good, warn, bad, total: scored.length, info: checks.length - scored.length },
    stats: {
      charsNoSpace, chars: text.length, words: wordCount,
      paragraphs: paras.length, sentences: sents.length,
      headings: heads.count, headingsCertain: heads.certain,
      images: imageCount, tags: tagList.length,
      titleLength: titleLen, avgParagraph: avgPara,
      endingVariety: variety.unique,
      readSeconds: readSec,
      hasList: struct.list, hasTable: struct.table, hasVideo: struct.video,
    },
    keywords: kwReport,
    checks,
    risks,
    // 글 하나로는 잴 수 없는 것을 숨기지 않고 알려줍니다.
    crank: {
      title: "블로그 단위 평가 (C-Rank)는 글 하나로 잴 수 없습니다",
      items: [
        "한 분야에 글이 쌓여야 전문성을 인정받습니다 (같은 카테고리 50개 이상)",
        "카테고리를 3개 안쪽으로 좁히는 게 유리합니다",
        "주 2~3회 꾸준히가 몰아서 많이 쓰는 것보다 낫습니다",
        "댓글 답글과 이웃 소통도 평가에 들어갑니다",
        "예전에 쓴 저품질 글이 남아 있으면 블로그 전체를 끌어내립니다",
      ],
    },
    disclaimer:
      "네이버의 실제 순위 알고리즘은 공개되어 있지 않습니다. 이 점수는 '네이버 지수'가 아니라, " +
      "공개된 D.I.A.·홈피드 기준(글자 수 1,500자, 본문 키워드 3~5회, 이미지 5장, 체류 2분 등)에 " +
      "비춰 확인 가능한 항목을 몇 개나 통과했는지입니다.",
  };
}

module.exports = { audit, stripHtml, countKeyword, splitKeywords, countHeadings, endingVariety };
