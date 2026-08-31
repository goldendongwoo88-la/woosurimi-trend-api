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

  // 1-b) 스마트에디터 인용구
  //
  // ⚠️ 네이버 블로그에는 h1~h6가 거의 없습니다. 스마트에디터에 '제목' 서식이
  // 따로 없어서, 사람들이 **인용구(se-quotation)를 소제목처럼** 씁니다.
  // 그래서 주소로 글을 읽어와 진단할 때 소제목이 늘 "알 수 없음"으로 나왔습니다.
  // 인용구를 세면 실제 소제목 수에 맞습니다 (실측: 인용구 9개인 글의 소제목이 9개).
  const quotes = (html.match(/class="se-component se-quotation/gi) || []).length;
  if (quotes) return { count: quotes, how: "quotation", certain: true };

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

  // ══ 2026년에 바뀐 것 ═══════════════════════════════════════
  //
  // 네이버가 2025년 말 컨퍼런스에서 검색 로직을 크게 바꿨다고 발표했고,
  // 실제로 적용되고 있습니다. 그중 글 하나로 확인할 수 있는 것만 골라 넣었습니다.
  //
  //   · 연관검색어 기능이 없어졌습니다 → 키워드를 제목에 도배하는 방식이 끝났습니다
  //   · 퀵백 클릭(들어왔다 바로 나감)에 벌점 → 체류시간이 전보다 훨씬 중요해졌습니다
  //   · 초개인화 검색 → 모두에게 같은 1등이 없어졌습니다. 대신 타겟이 뾰족할수록 유리합니다
  //   · 홈피드가 이웃 없이도 띄워줍니다 → 신규 블로그가 오래된 블로그를 이길 수 있습니다
  //   · AI 브리핑(AEO) → 소제목과 목록 구조가 있어야 요약에 뽑힙니다
  //   · 신뢰도 우선 → 지원금·의학 같은 주제는 뉴스·정부가 먼저 뜹니다. 경험담으로 우회합니다

  // ── 뾰족한 타겟 ────────────────────────────────────────────
  //
  // "30대 여성 화장품"은 이제 아무에게도 1등으로 안 뜹니다.
  // "내일 소개팅 가야 하는 30대 직장인 파운데이션"이 그 사람에게 1등으로 뜹니다.
  // 제목이 얼마나 좁혀졌는지를 봅니다.
  //
  // ⚠️ 처음엔 목록이 좁아서 "군대 px 화장품 추천"을 '넓다'고 잘못 판정했습니다.
  // 군대만큼 뾰족한 타겟이 없는데도요. 사람이 실제로 쓰는 말로 넓혔습니다.
  const TARGET_MARKS = [
    /\d+\s*(대|살|개월|주차|년차|인용|호선)/,        // 30대, 6개월, 3년차, 2인용
    /(초보|입문|처음|첫|왕초보|생초보)/,             // 초보자, 처음 가는
    /(내일|오늘|이번\s*주|주말|당일|급하게|퇴근\s*후|출근|새벽|밤에)/, // 시점
    // 처지 — 여기가 제일 넓어야 합니다. 사람들은 자기 상황으로 검색합니다.
    /(직장인|주부|학생|신혼|육아|자취|1인|커플|엄마|아빠|부부|가족)/,
    /(군대|군인|신병|훈련소|입대|전역|예비군)/,
    /(임산부|산모|수험생|취준생|사회\s*초년생|신입|은퇴|시니어|노인|어르신)/,
    /(초등|중등|고등|중학생|고등학생|유아|아기|신생아|반려[견묘동]|강아지|고양이)/,
    /(남자|여자|남성|여성)\s*\S/,                    // "남자 코디"처럼 붙어 쓰일 때만
    /(민감성|지성|건성|수부지|복합성|여드름|아토피)/, // 피부·체질
    /(을|를|은|는|이|가)\s*위한|용\b|전용/,          // ~를 위한, ~용, 전용
  ];
  const INTENT_MARKS = /(추천|비교|후기|정리|방법|가이드|순위|고르는|차이)/;

  // 의도만 있고 대상이 없으면 뾰족한 게 아닙니다. 대상을 따로 셉니다.
  const whoHits = TARGET_MARKS.filter((re) => re.test(title)).length;
  const hasIntent = INTENT_MARKS.test(title);
  const targetHits = whoHits + (hasIntent ? 1 : 0);

  if (whoHits >= 2 || (whoHits >= 1 && hasIntent)) {
    add("target", "타겟이 뾰족한가", true, "good",
      "누구를 위한 글인지 제목에서 드러납니다", null, SEARCH);
  } else if (targetHits >= 1) {
    add("target", "타겟이 뾰족한가", true, "info",
      "조금 더 좁히면 좋습니다",
      "2026년 네이버는 사람마다 다른 결과를 보여줍니다. 모두에게 1등인 자리가 없어졌어요. " +
      "대신 '누구에게' 필요한 글인지가 분명할수록 그 사람에게 1등으로 뜹니다. " +
      "나이·상황·시점 중 하나만 더 붙여보세요.", SEARCH);
  } else {
    add("target", "타겟이 뾰족한가", false, "warn",
      "제목이 넓습니다 — 누구를 위한 글인지 알기 어렵습니다",
      "예) '30대 여성 화장품' → '내일 소개팅인 30대 직장인 파운데이션'. " +
      "좁힐수록 손해 같지만, 개인화 검색에서는 오히려 그쪽이 1등으로 뜹니다.", SEARCH);
  }

  // ── 행동 키워드 ────────────────────────────────────────────
  //
  // ⚠️ 이건 상위노출이 아니라 **수익**에 직결됩니다.
  // 사람들이 들어와서 뭔가를 누를 것 같은 글이 돈이 됩니다.
  // "김치찌개 만드는 법"은 하루 1달러도 안 나오고,
  // "청년 월세 지원 신청 방법"은 클릭 단가가 몇 배입니다.
  const ACTION_WORDS = /신청|조회|다운로드|예약|접수|발급|가입|등록|환급|지원금|보조금|할인|쿠폰|특가|비교|계산|자격|대상|기간|방법/;
  const inTitleAction = ACTION_WORDS.test(title);
  if (inTitleAction) {
    add("action-kw", "행동 키워드", true, "good",
      `제목에 '${(title.match(ACTION_WORDS) || [])[0]}'이(가) 있습니다 — 광고 단가가 높은 유형입니다`,
      null, SEARCH);
  } else {
    add("action-kw", "행동 키워드", true, "info",
      "정보만 전하는 글로 보입니다",
      "수익을 노리신다면 신청·조회·발급·예약처럼 **읽고 나서 뭔가를 누를** 주제가 유리합니다. " +
      "같은 노력으로 클릭 단가가 몇 배 차이 납니다. 다만 협찬글이나 일상글이면 이 항목은 무시하셔도 됩니다.", SEARCH);
  }

  // ── 첫 세 줄 ──────────────────────────────────────────────
  //
  // 네이버 AI는 제목과 첫 세 줄, 그리고 소제목을 봅니다.
  // 여기서 "안녕하세요, 오늘 날씨가 좋네요"가 나오면 그대로 밀립니다.
  const firstLines = text.split(/\n+/).filter(Boolean).slice(0, 3).join(" ").slice(0, 200);
  const GREETING = /^(안녕하세요|반갑습니다|오랜만|안녕하십니까|여러분\s|하이|헬로)/;
  const WEATHER_TALK = /(날씨가|더위가|추위가|장마가)\s*\S{0,6}(네요|군요|이네|하네)/;
  const SELF_INTRO = /^(저는|제가)\s*\S{0,12}(입니다|이에요|예요)\s/;
  if (GREETING.test(firstLines.trim()) || WEATHER_TALK.test(firstLines) || SELF_INTRO.test(firstLines.trim())) {
    add("first3", "첫 세 줄", false, "warn",
      "인사말이나 날씨 이야기로 시작합니다",
      "네이버 AI가 제목 다음으로 보는 게 첫 세 줄입니다. 여기서 본론과 상관없는 말이 나오면 " +
      "추천에서 밀립니다. 읽는 사람 입장에서도 마찬가지고요. " +
      "**독자의 고민을 먼저 던지세요** — '내일 소개팅인데 화장 뜰까 봐 걱정이시죠?' 처럼요.", FEED);
  } else if (firstLines.length > 40) {
    add("first3", "첫 세 줄", true, "good",
      "본론으로 바로 들어갑니다", null, FEED);
  }

  // ── AI 브리핑에 걸리는 구조 ────────────────────────────────
  //
  // 네이버 AI 요약(브리핑)은 글을 통째로 읽지 않고 목차와 목록을 봅니다.
  // 줄글로만 쓰면 아예 후보에 안 오릅니다.
  const hasNumberedSteps = /(^|\n)\s*(\d+[.)단계]|첫째|둘째|셋째|하나,|둘,)/m.test(text);
  const hasBullets = /(^|\n)\s*[-·•*▶▪]/m.test(text) || /(^|\n)\s*\d+\.\s/m.test(text);
  if (hasNumberedSteps || hasBullets) {
    add("aeo", "AI 요약에 걸리는 구조", true, "good",
      hasNumberedSteps ? "단계나 순서로 정리되어 있습니다" : "목록으로 정리된 부분이 있습니다",
      null, SEARCH);
  } else {
    add("aeo", "AI 요약에 걸리는 구조", false, "warn",
      "줄글로만 되어 있습니다",
      "검색창 맨 위의 AI 요약(브리핑)은 글 전체를 읽지 않고 소제목과 목록만 봅니다. " +
      "'1단계 … 2단계 …'처럼 번호를 매기거나 항목을 나누면 거기에 뽑힐 확률이 올라갑니다.", SEARCH);
  }

  // ── 경험담으로 썼는가 ──────────────────────────────────────
  //
  // ⚠️ 네이버가 지원금·의학처럼 중요한 정보는 뉴스와 정부 사이트를 먼저 띄웁니다.
  // 블로그는 그 아래로 밀립니다. 뚫는 방법은 하나 — 내 경험으로 쓰는 것입니다.
  // 정부가 쓴 말을 그대로 옮기면 차별점이 없어서 이길 수가 없습니다.
  //
  // ⚠️ 다만 **겪지 않은 걸 겪은 척 쓰라는 게 아닙니다.** 그건 다른 문제입니다.
  // 실제로 해보고 쓰시라는 뜻입니다.
  // ⚠️ haystack은 아래에서 만들어집니다. 여기서는 제목+본문을 직접 붙여 씁니다.
  const titleAndBody = `${titleText}
${text}`;
  const EXPERIENCE = /(직접|제가|해\s*봤|가\s*봤|써\s*봤|먹어\s*봤|신청해\s*보|받아\s*보|겪|경험|후기|다녀왔|살아\s*보)/;
  const OFFICIAL_TOPIC = /(지원금|보조금|정책|제도|급여|수당|공단|보건소|질병|증상|치료|보험|세금|연말정산|청약)/;
  if (OFFICIAL_TOPIC.test(titleAndBody)) {
    if (EXPERIENCE.test(titleAndBody)) {
      add("experience", "경험담으로 썼는가", true, "good",
        "정책·의학 주제인데 직접 겪은 이야기가 들어 있습니다", null, SEARCH);
    } else {
      add("experience", "경험담으로 썼는가", false, "warn",
        "정보를 옮겨 적은 글로 보입니다",
        "이런 주제는 네이버가 뉴스와 정부 사이트를 먼저 띄워서 블로그가 밀립니다. " +
        "뚫는 방법은 하나예요 — **직접 해보고 쓰는 것**입니다. " +
        "'2026 청년지원금 신청방법 총정리'보다 '직장 다니면서 신청해보고 알게 된 것'이 이깁니다.", SEARCH);
    }
  }

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
    // ⚠️ 기준을 키워드 길이에 따라 다르게 잡습니다.
    // "애월 카페"는 본문에 다섯 번 넣어도 자연스럽지만, "전세 계약 주의사항"을
    // 다섯 번 넣으면 글이 읽히지 않습니다. 실제로 그런 글에 "부족합니다"가 떴는데,
    // 시키는 대로 늘렸다면 글이 더 나빠졌을 겁니다.
    // 긴 키워드는 네이버도 통째로만 보지 않으니 기준을 낮춥니다.
    //
    // ⚠️ 그리고 권장 상한보다 조금 넘은 건 통과시킵니다. 한 번 더 썼다고
    // 빨간불을 켜면 멀쩡한 글을 고치게 만드는 꼴이라서요. 다만 통과시키면서
    // "적당합니다"라고만 하면 앞뒤가 안 맞으니, 위쪽에 가까워졌다고 말해줍니다.
    const b = mainKw.body;
    const words = mainKw.keyword.trim().split(/\s+/).length;
    const [lo, hi] = words >= 3 ? [2, 4] : [3, 5];
    const tolerate = hi + 2;

    if (b >= lo && b <= hi) {
      add("kw-body", "본문 키워드 횟수", true, "good",
        `'${mainKw.keyword}' ${b}번 — 적당합니다 (권장 ${lo}~${hi}회)`, null, SEARCH);
    } else if (b > hi && b <= tolerate) {
      add("kw-body", "본문 키워드 횟수", true, "good",
        `'${mainKw.keyword}' ${b}번 — 권장(${lo}~${hi}회)보다 조금 많지만 괜찮습니다`,
        `더 늘리지는 마세요. ${tolerate + 1}회를 넘어가면 남용으로 봅니다.`, SEARCH);
    } else if (b === 0) {
      add("kw-body", "본문 키워드 횟수", false, "bad",
        `본문에 '${mainKw.keyword}'이(가) 한 번도 안 나옵니다`,
        "제목과 본문이 따로 놀면 검색에서 밀립니다. 본문에 서너 번 자연스럽게 넣으세요.", SEARCH);
    } else if (b < lo) {
      add("kw-body", "본문 키워드 횟수", false, "warn",
        `'${mainKw.keyword}' ${b}번 — 권장(${lo}~${hi}회)보다 적습니다`,
        `${lo - b}번쯤 더 넣으면 좋습니다. 소제목이나 마무리에 자연스럽게요.` +
        (words >= 3 ? " 긴 키워드라 기준을 낮춰 잡았습니다 — 억지로 넣지는 마세요." : ""), SEARCH);
    } else {
      add("kw-body", "본문 키워드 횟수", false, "warn",
        `'${mainKw.keyword}' ${b}번 — 권장(${lo}~${hi}회)보다 많습니다`,
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

  // ⚠️ 2026-08-31 기준 교체. 예전에는 "300자 넘으면 경고 / 평균 120자 이하면 좋음"이었는데,
  // 실측(상위 블로거 25~56곳)으로 재보니 **잘 되는 쪽 문단은 16~24자**이고 45자 초과 문단은 0~7%였습니다.
  // 옛 기준이면 사장님 글(평균 41~48자)이 "무난합니다"로 통과합니다 — 제일 큰 문제를 통과시킵니다.
  //
  // ⚠️ 단, 여기 paras는 **빈 줄** 기준으로 쪼갠 것이라 화면 문단과 다를 수 있습니다.
  // 줄바꿈이 하나도 없는 글(웹에서 긁어온 본문 등)은 통째로 1문단이 되어 평균이 수천 자로 잡힙니다.
  // 그때 "문단이 길다"고 말하면 글이 아니라 입력 방식을 탓하는 셈이라, 판정하지 않고 그 사실만 알립니다.
  const avgPara = Math.round(charsNoSpace / (paras.length || 1));
  const PARA_TARGET = 24;   // 잘 되는 쪽 상단값
  const PARA_LIMIT = 45;    // 이걸 넘는 문단은 화면에서 벽이 됨
  const longParas = paras.filter((p) => noSpace(p).length > PARA_LIMIT);
  const overRate = paras.length ? Math.round((longParas.length / paras.length) * 100) : 0;

  if (paras.length <= 1 && charsNoSpace > 400) {
    add("para", "문단 길이", true, "info",
      "줄바꿈이 없어서 문단을 셀 수 없습니다",
      "네이버 편집기에서 서식째로 복사해 붙여넣으면 문단 길이를 정확히 봐 드립니다. 지금은 판정하지 않았습니다.", FEED);
  } else if (avgPara > PARA_LIMIT || overRate > 20) {
    add("para", "문단 길이", false, "warn",
      `평균 ${avgPara}자 · ${PARA_LIMIT}자 넘는 문단이 ${overRate}%`,
      `잘 되는 블로그는 문단이 16~24자이고 ${PARA_LIMIT}자 초과가 0~7%입니다. 휴대폰 한 줄이 20자라 지금은 벽으로 보입니다. 문장 하나에 마침표 하나, 마침표에서 줄을 바꾸세요.`, FEED);
  } else if (avgPara <= PARA_TARGET) {
    add("para", "문단 길이", true, "good", `평균 ${avgPara}자 — 실측 기준(16~24자) 안에 듭니다`, null, FEED);
  } else {
    add("para", "문단 길이", true, "info", `평균 ${avgPara}자 — 나쁘진 않지만 20자 안팎이 더 좋습니다`,
      `잘 되는 쪽 중앙값은 16~24자입니다.`, FEED);
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
