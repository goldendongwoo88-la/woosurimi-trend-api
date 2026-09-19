/**
 * 스타일 프리셋 10종 — "화면효과 + 자막디자인 + 배경음악 + 목소리 + 길이"를 한 묶음으로.
 *
 * 왜 묶었나: 따로 고르게 하면 네 가지를 매번 골라야 하고, 조합이 6×5×5×3 = 450가지라
 * 뭘 골라야 할지 알 수가 없습니다. 실제로 잘 나오는 조합만 10개로 추려서 이름을 붙였습니다.
 * 사장님은 "핫딜 속보형" 하나만 고르면 네 가지가 한 번에 정해집니다.
 *
 * URL을 넣으면 아래 fits/keywords를 보고 그 글에 어울리는 6개를 골라 자동으로 만듭니다.
 *
 * ⚠️ effect / template 값은 goldencut_effects.py의 EFFECTS / TEMPLATES에 실제로 있는
 * id여야 합니다. bgm은 src/bgmLibrary.js의 트랙 id입니다. 아래 validateStyles()가
 * 서버 시작 때 이걸 확인하므로, 오타가 있으면 조용히 이상하게 도는 대신 바로 알려줍니다.
 */

// ⚠️ 스타일 표는 여기에 두지 않습니다. goldencut/styles.json 한 벌만 둡니다.
// 자바스크립트와 파이썬이 같은 값을 따로 들고 있으면 반드시 어긋납니다 (CLAUDE.md 6번).
const { styles: STYLES, categories: JSON_CATEGORIES } = require("../styles.json");

/** 소재 종류(블로그/뉴스/상품/여행)를 URL만 보고 짐작합니다. */
function guessSource(url = "") {
  const u = String(url).toLowerCase();
  if (/(smartstore|shopping\.naver|coupang|11st|gmarket|auction|ssg|lotteon|brand\.naver|ohou|aliexpress)/.test(u)) return "shopping";
  if (/(news|article|newsis|yna\.co|chosun|joongang|donga|hankyung|mk\.co|sbs|kbs|mbc|ytn|khan|hani|edaily|mt\.co|inews24)/.test(u)) return "news";
  if (/(triple|tripadvisor|myrealtrip|yanolja|goodchoice|agoda|booking\.com|klook)/.test(u)) return "travel";
  return "blog";
}

/**
 * 이 글에 어울리는 스타일을 점수 순으로 정렬합니다.
 *
 * 점수: 소재 종류가 맞으면 +3, 자막·제목에 스타일 키워드가 나올 때마다 +2.
 * 같은 점수면 STYLES에 적어둔 순서를 따릅니다(위에 있을수록 무난한 조합).
 *
 * ⚠️ 뽑을 때 화면 효과가 겹치지 않게 한 번 걸러냅니다. 안 그러면 추천 6개가
 * 자막 색만 다르고 화면은 똑같아 보여서, 고를 이유가 없어집니다.
 */
function rankStyles(text = "", source = "blog", count = 6) {
  const hay = String(text).toLowerCase();
  const scored = STYLES.map((s, i) => {
    let score = 0;
    if (s.fits.includes(source)) score += 3;
    for (const k of s.keywords) if (hay.includes(k.toLowerCase())) score += 2;
    return { style: s, score, order: i };
  }).sort((a, b) => b.score - a.score || a.order - b.order);

  const picked = [];
  const usedEffects = new Set();
  // 1차: 화면 효과가 안 겹치는 것부터
  for (const { style } of scored) {
    if (picked.length >= count) break;
    if (usedEffects.has(style.effect)) continue;
    picked.push(style);
    usedEffects.add(style.effect);
  }
  // 2차: 그래도 모자라면 점수 순으로 마저 채웁니다(효과 6종뿐이라 7개 이상 요청 시).
  for (const { style } of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(style)) picked.push(style);
  }
  return picked;
}

function getStyle(id) {
  return STYLES.find((s) => s.id === id) || null;
}

/** 서버 시작 때 프리셋 값이 엔진에 실제로 있는 id인지 확인합니다. */
function validateStyles(effectIds = [], templateIds = [], bgmIds = []) {
  const problems = [];
  for (const s of STYLES) {
    if (effectIds.length && !effectIds.includes(s.effect)) problems.push(`${s.id}: 화면효과 '${s.effect}' 없음`);
    if (templateIds.length && !templateIds.includes(s.template)) problems.push(`${s.id}: 자막템플릿 '${s.template}' 없음`);
    if (bgmIds.length && !bgmIds.includes(s.bgm)) problems.push(`${s.id}: 배경음악 '${s.bgm}' 없음`);
  }
  return problems;
}

const CATEGORIES = JSON_CATEGORIES;

module.exports = { STYLES, CATEGORIES, guessSource, rankStyles, getStyle, validateStyles };
