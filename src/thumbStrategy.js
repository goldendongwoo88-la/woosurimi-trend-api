/**
 * 썸네일 전략 — 제목을 읽어 **어떤 썸네일이 더 눌릴지**를 정합니다.
 *
 * ⚠️ 사장님 요청 (2026-08-28): 지금은 썸네일 문구가 제목과 똑같아서 궁금증이
 * 안 생깁니다. 그리고 제목 상황(연예인 이름 유무·비교·전후 등)에 따라
 * 얼굴/모자이크/2명 비교 같은 구성이 다르게 먹힙니다. 그걸 규칙으로 정합니다.
 *
 * ⚠️ AI를 안 씁니다. 값이 0원입니다. 제목 낱말만 봅니다.
 *
 * 반환:
 *   composition — 썸네일 구성 유형(아래 COMPOSITIONS 중 하나)
 *   mosaicWho   — 모자이크할 대상(있으면). "누구인지 가려 궁금하게"
 *   captions    — 제목과 **겹치지 않는** 궁금증 문구 후보(짧은 순)
 *   celebs      — 제목에서 찾은 연예인 이름
 *   why         — 왜 이 구성인지 (사장님께 보여줄 한 줄)
 */

// 자주 오르내리는 이름. mate-keywords 은행이 있으면 그걸 우선 씁니다(더 최신).
let CELEB_BANK = [
  "카리나", "장원영", "제니", "전지현", "신민아", "한소희", "고윤정", "김지원", "츠키", "유나",
  "김연아", "안유진", "윈터", "아이유", "수지", "태연", "지수", "김고은", "한지민", "송혜교",
  "손예진", "김태리", "박보영", "박은빈", "차은우", "뷔", "정국", "지민", "박보검", "변우석",
  "강호동", "유재석", "신동엽", "김희철", "이효리", "제시", "화사", "선미",
];
try {
  const bank = require("../data/mate-keywords.json");
  if (bank && Array.isArray(bank.celebs) && bank.celebs.length) {
    CELEB_BANK = [...new Set([...bank.celebs.map((c) => c.word), ...CELEB_BANK])];
  }
} catch {}

const COMPOSITIONS = {
  FACE_HOOK: "얼굴 + 궁금증 문구",          // 이름 1명, 그 얼굴 크게 + 다른 각도 문구
  MOSAIC_ONE: "얼굴 모자이크(정체 가림)",    // 이름 없음/약함 — 누구? 로 끌기
  COMPARE_TWO: "두 명 비교",                 // 이름 2명 — 나란히
  COMPARE_MOSAIC: "두 명 중 1명만 모자이크", // 이름 2명, 주인공 가려 궁금하게
  BEFORE_AFTER: "전/후 두 장",              // 변화·전후
};

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const hasCeleb = (t, n) =>
  n.length >= 2 ? t.includes(n) : new RegExp(`(^|[^가-힣])${n}([^가-힣]|$)`).test(t);

// "여배우·남배우·여자 연예인·그 아이돌" 처럼 **이름 없이 가리키는** 사람.
// 이름 1명 + 이런 지칭이 같이 나오면: 이름은 보여주고, 지칭 대상은 모자이크로 궁금하게.
// (사장님 예: "강호동이 이쁘다던 여배우" → 강호동 얼굴 + 여배우 모자이크)
const GENERIC_SUBJECTS = [
  "여배우", "남배우", "여자 연예인", "남자 연예인", "여자연예인", "남자연예인",
  "여자 아이돌", "남자 아이돌", "여돌", "남돌", "그 배우", "그 아이돌",
  "여자친구", "그녀", "아내", "와이프", "남편", "전 여친", "전 남친",
];
const findGenericSubject = (t) => GENERIC_SUBJECTS.find((g) => t.includes(g)) || null;

/**
 * 낱말 미끼 — 제목에 이 낱말이 있으면 "그게 뭔데?"로 끌 수 있습니다.
 * 앞에 있는 것이 더 센 미끼입니다(먼저 씁니다).
 */
const BAITS = [
  // 머리·시술 — "나도 저렇게 말하면 되나" 가 제일 강하게 걸립니다
  [/펌|단발|커트|염색|머리/, "미용실서 뭐라고?"],
  [/시술|필러|보톡스|리프팅/, "어디서 했길래"],
  // 몸
  [/다이어트|감량|식단|운동/, "어떻게 뺐길래"],
  [/피부|모공|잡티|주름/, "이게 화장이라고?"],
  // 화장품 — 낱말을 그대로 넣어 "이 OO 뭐예요?"
  [/쿠션|파데|파운데이션|베이스|립|틴트|섀도|아이라인|마스카라|크림|세럼|앰플|선크림|향수/, null],
  // 옷·소품
  [/가방|코트|원피스|니트|신발|구두|운동화|청바지|재킷|모자|목걸이|귀걸이|시계|룩/, "이거 어디 거?"],
];

/** 제목에서 숫자 미끼를 뽑습니다 — 가격·개수·연차는 그 자체가 훅입니다. */
function numberHooks(t) {
  const out = [];
  // ⚠️ "40분 만에"처럼 **제목이 직접 쓴 표현**이면 그대로 씁니다 (제일 센 훅입니다).
  // 제목에 '만에'가 없으면 아래에서 숫자만 던집니다 — 없는 말을 지어내지 않으려고.
  const fast = t.match(/(\d+)\s*(초|분|시간|일|주|개월|년)\s*만에/);
  if (fast) out.push(`${fast[1]}${fast[2]} 만에`);

  const price = t.match(/(\d[\d,]*)\s*(만원|천원|원)/);
  if (price) out.push(`${price[1]}${price[2]}인데?`);
  const count = t.match(/(\d+)\s*(가지|개|종)/);
  if (count) out.push(`딱 ${count[1]}${count[2]}`);
  const years = t.match(/(\d+)\s*(년차|년|개월|주|일)/);
  if (years) out.push(`${years[1]}${years[2]} 해보니`);
  // ⚠️ 시간은 "40분 만에"처럼 쓰고 싶지만, "3시간 고민한" 제목에 "3시간 만에"를 붙이면
  // 제목이 안 한 말(빨리 해냈다)을 하게 됩니다. 숫자만 던져서 궁금하게 둡니다.
  const hours = t.match(/(\d+)\s*(시간|분)/);
  if (hours) out.push(`${hours[1]}${hours[2]}?`);
  return out;
}

/**
 * 제목에서 "궁금증 문구" 후보를 뽑습니다.
 * 제목이 이미 말한 걸 반복하지 않도록, 제목의 **결론이 아니라 미끼**가 되는 조각을 찾습니다.
 *
 * ⚠️ 순서가 곧 우선순위입니다(짧은 순으로 줄 세우지 않습니다).
 * 처음엔 짧은 순으로 정렬했더니 "이게 실화?" 같은 **아무 데나 붙는 문구**가 늘 1등이 됐습니다.
 * 제목에서 실제로 건져 올린 것(따옴표·숫자·제품 낱말)이 위로 와야 합니다.
 *
 * ⚠️ 마지막 보편 문구는 **정말 아무것도 못 건졌을 때만** 씁니다.
 * 구성이 모자이크면 그림과 맞는 "누구게요?"를 쓰는 게 보편 문구보다 훨씬 낫습니다.
 */
function curiosityCaptions(title, celebs, { composition = null, mosaicWho = null } = {}) {
  const t = norm(title);
  const out = [];

  // 1) 제목 안의 따옴표 대사 — 사람들이 실제로 반응한 말일 때가 많음
  for (const m of t.matchAll(/["'"']([^"'"']{2,12})["'"']/g)) out.push(m[1].trim());

  // 2) 물음표로 끝나는 조각
  const q = t.match(/([가-힣A-Za-z0-9 ]{2,12})\?/);
  if (q) out.push(q[1].trim() + "?");

  // 3) 숫자 미끼 — 가격·개수·기간
  out.push(...numberHooks(t));

  // 4) 낱말 미끼
  for (const [re, phrase] of BAITS) {
    const m = t.match(re);
    if (!m) continue;
    if (phrase) out.push(phrase);
    else {
      const word = m[0];
      out.push(word.length <= 4 ? `이 ${word} 뭐예요?` : "이거 뭐 썼길래");
    }
  }

  // 5) 그림(구성)과 짝이 맞는 문구 — 가린 그림에는 "누구게요?"가 제일 잘 붙습니다
  if (composition === COMPOSITIONS.MOSAIC_ONE) out.push("누구게요?");
  if (composition === COMPOSITIONS.COMPARE_MOSAIC) {
    if (mosaicWho && !celebs.includes(mosaicWho)) out.push(`${mosaicWho} 누구?`);
    out.push("누가 더?", "오른쪽은 누구?");
  }
  if (composition === COMPOSITIONS.BEFORE_AFTER) out.push("같은 사람?");

  // 6) 그래도 없으면 보편 미끼
  out.push(celebs.length ? "이게 실화?" : "다들 놀란 이유");

  // 제목과 거의 같은 건 뺍니다(반복 금지).
  const tKey = t.replace(/[^가-힣A-Za-z0-9]/g, "");
  return [...new Set(out.map(norm))]
    .filter((c) => c && c.replace(/[^가-힣A-Za-z0-9]/g, "") !== tKey)
    .filter((c) => c.length >= 2 && c.length <= 12)
    .slice(0, 4);
}

/**
 * 썸네일 문구가 **제목을 그대로 되풀이하는지** 봅니다.
 *
 * ⚠️ 사장님 지적의 핵심입니다(2026-08-28): 썸네일에 제목을 다시 써 놓으면
 * 같은 말을 두 번 읽는 것이라 궁금증이 안 생깁니다.
 * 제목에서 **낱말을 빌려오는 것**은 괜찮습니다(본문에 없는 말을 지어내지 않으려면
 * 오히려 그래야 합니다). 제목 **거의 전체**를 옮겨 적는 것이 문제입니다.
 * 그래서 "제목과 같다"의 기준을 길이 70%로 둡니다.
 */
function echoesTitle(text, title) {
  const key = (s) => String(s || "").replace(/[^가-힣A-Za-z0-9]/g, "");
  const c = key(text);
  const t = key(title);
  if (!c || !t) return false;
  if (c === t) return true;
  return t.includes(c) && c.length >= Math.ceil(t.length * 0.7);
}

/**
 * 이 구성이 **모자이크를 쓰는 구성인지**. 그리기 쪽(thumbnail.js)이 이걸 보고
 * 얼굴 자리를 가릴지 정합니다.
 */
function wantsMosaic(composition) {
  return composition === COMPOSITIONS.MOSAIC_ONE || composition === COMPOSITIONS.COMPARE_MOSAIC;
}

function strategize(title, body = "") {
  const t = norm(title);
  // ⚠️ 이름 순서는 **제목에 나온 순서**로 맞춥니다. 은행(CELEB_BANK)에 적힌 순서로 두면
  // "뒤에 나온 사람을 가린다"는 아래 규칙이 엉뚱한 사람을 가립니다.
  const celebs = CELEB_BANK.filter((n) => hasCeleb(t, n)).sort((a, b) => t.indexOf(a) - t.indexOf(b));
  const isBeforeAfter = /전후|비포|애프터|before|after|바뀐|달라진|변화|변신|민낯|쌩얼|전\/후/i.test(t);

  let composition, mosaicWho = null, why;

  if (isBeforeAfter) {
    composition = COMPOSITIONS.BEFORE_AFTER;
    why = "제목이 변화·전후라 두 장을 짝지어 붙이면 대비가 큽니다.";
  } else if (celebs.length >= 2) {
    // 두 명 — "누가 주인공?" 를 숨기면 더 눌립니다 (사장님 예: 강호동 보여주고 여배우 모자이크)
    composition = COMPOSITIONS.COMPARE_MOSAIC;
    mosaicWho = celebs[celebs.length - 1]; // 제목 뒤쪽(대개 화제의 인물)을 가림
    why = `두 명(${celebs.join(", ")}) 중 뒤에 나온 '${mosaicWho}'를 모자이크해 "누구?"로 끌면 클릭이 올라갑니다.`;
  } else if (celebs.length === 1 && findGenericSubject(t)) {
    // 이름 1명 + 지칭 1명 — 이름은 보여주고 지칭 대상을 가려 궁금하게 (사장님 예시)
    composition = COMPOSITIONS.COMPARE_MOSAIC;
    mosaicWho = findGenericSubject(t);
    why = `'${celebs[0]}'는 얼굴로 보여주고, '${mosaicWho}'는 모자이크해 "누구?"로 끕니다.`;
  } else if (celebs.length === 1) {
    composition = COMPOSITIONS.FACE_HOOK;
    why = `이름(${celebs[0]})이 곧 썸네일이라 얼굴을 크게, 문구는 제목과 다른 각도로.`;
  } else {
    // 이름이 없으면 정체를 가려 궁금하게
    composition = COMPOSITIONS.MOSAIC_ONE;
    why = "제목에 이름이 없어 얼굴 일부를 가려 '누구지?'로 끕니다.";
  }

  return {
    composition,
    mosaicWho,
    celebs,
    // 구성이 정해진 뒤에 문구를 뽑습니다 — 그림과 문구가 따로 놀지 않게.
    captions: curiosityCaptions(t, celebs, { composition, mosaicWho }),
    why,
  };
}

module.exports = { strategize, echoesTitle, wantsMosaic, COMPOSITIONS, curiosityCaptions };
