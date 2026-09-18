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

const STYLES = [
  {
    id: "hotdeal-flash", category: "쇼핑·리뷰",
    label: "핫딜 속보형",
    desc: "빠른 컷 + 굵은 흰카드 자막. 세일·특가·신상처럼 '지금 사야 하는' 소재에 강합니다.",
    effect: "whitecard-pop", template: "bold-black", bgm: "upbeat-pop",
    voice: "golden", seconds: 15, intro: false,
    fits: ["shopping"],
    keywords: ["세일", "할인", "특가", "핫딜", "쿠폰", "최저가", "품절", "오늘만", "마감", "이벤트"],
  },
  {
    id: "emotional-vlog", category: "감성·브이로그",
    label: "감성 브이로그형",
    desc: "사진이 천천히 흐르고 크림색 자막이 얹힙니다. 일상·여행·카페 글에 잘 맞습니다.",
    effect: "photocard-drift", template: "soft-cream", bgm: "emotional-vlog",
    voice: "chasurimi", seconds: 28, intro: true,
    fits: ["travel", "blog"],
    keywords: ["여행", "카페", "하루", "일상", "산책", "풍경", "감성", "휴식", "바다", "노을"],
  },
  {
    id: "viral-review", category: "쇼핑·리뷰",
    label: "터지는 리뷰형",
    desc: "채도 높은 화면 + 네온핑크 자막. 솔직후기·내돈내산처럼 반응을 노리는 글에 씁니다.",
    effect: "vivid-punch", template: "neon-pink", bgm: "trendy-hiphop",
    voice: "golden", seconds: 15, intro: false,
    fits: ["shopping", "blog"],
    keywords: ["후기", "리뷰", "내돈내산", "솔직", "써봤", "비교", "실화", "대박", "역대급"],
  },
  {
    id: "info-cardnews", category: "정보·설명",
    label: "정보 카드뉴스형",
    desc: "차분한 줌 + 파란 자막. 설명이 많은 정보성 글을 또박또박 전달합니다.",
    effect: "clean-zoom", template: "clean-blue", bgm: "calm-piano",
    voice: "golden", seconds: 28, intro: false,
    fits: ["blog", "news"],
    keywords: ["방법", "정리", "총정리", "이유", "차이", "기준", "신청", "조건", "꿀팁", "가이드"],
  },
  {
    id: "film-mood", category: "감성·브이로그",
    label: "필름 감성형",
    desc: "위아래 레터박스 + 느린 컷. 사진이 예쁜 글을 영화처럼 보이게 합니다.",
    effect: "film-strip", template: "soft-cream", bgm: "emotional-vlog",
    voice: "chasurimi", seconds: 28, intro: true,
    fits: ["travel", "blog"],
    keywords: ["기록", "추억", "여운", "필름", "빈티지", "분위기", "겨울", "가을", "사진"],
  },
  {
    id: "news-briefing", category: "뉴스·이슈",
    label: "뉴스 브리핑형",
    desc: "군더더기 없는 화면 + 굵은 검정 자막. 속보·이슈를 빠르게 전달합니다.",
    effect: "clean-zoom", template: "bold-black", bgm: "trendy-hiphop",
    voice: "golden", seconds: 15, intro: false,
    fits: ["news"],
    keywords: ["속보", "발표", "논란", "확정", "공개", "입장", "해명", "소식", "화제", "결국"],
  },
  {
    id: "product-focus", category: "쇼핑·리뷰",
    label: "제품 소개형",
    desc: "하얀 포토카드 액자 + 노란 강조 자막. 물건 하나를 또렷하게 보여줍니다.",
    effect: "photocard-drift", template: "vivid-yellow", bgm: "bright-acoustic",
    voice: "golden", seconds: 15, intro: false,
    fits: ["shopping"],
    keywords: ["제품", "구성", "스펙", "사이즈", "색상", "재질", "성분", "가격", "배송", "구매"],
  },
  {
    id: "dreamy-mood", category: "감성·브이로그",
    label: "몽환 무드형",
    desc: "부드럽게 번지는 화면 + 크림 자막. 뷰티·인테리어처럼 분위기가 중요한 글에 씁니다.",
    effect: "soft-bloom", template: "soft-cream", bgm: "calm-piano",
    voice: "chasurimi", seconds: 28, intro: false,
    fits: ["blog", "shopping"],
    keywords: ["뷰티", "화장품", "피부", "향", "인테리어", "조명", "홈카페", "포근", "부드러"],
  },
  {
    id: "punch-shorts", category: "뉴스·이슈",
    label: "강조 쇼츠형",
    desc: "가장 빠르고 센 조합. 흩뿌린 사진으로 시작해 끝까지 몰아칩니다.",
    effect: "vivid-punch", template: "vivid-yellow", bgm: "upbeat-pop",
    voice: "golden", seconds: 15, intro: true,
    fits: ["shopping", "news", "blog"],
    keywords: ["충격", "반전", "주의", "실수", "금지", "꼭", "무조건", "top", "순위", "best"],
  },
  {
    id: "calm-explain", category: "정보·설명",
    label: "차분 설명형",
    desc: "천천히 번지는 화면 + 파란 자막. 길고 어려운 내용을 편하게 읽어줍니다.",
    effect: "soft-bloom", template: "clean-blue", bgm: "bright-acoustic",
    voice: "golden", seconds: 28, intro: false,
    fits: ["blog", "news"],
    keywords: ["건강", "관절", "혈당", "수면", "운동", "재테크", "정책", "세금", "보험", "연금"],
  },
];

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

const CATEGORIES = ["추천", "쇼핑·리뷰", "감성·브이로그", "뉴스·이슈", "정보·설명"];

module.exports = { STYLES, CATEGORIES, guessSource, rankStyles, getStyle, validateStyles };
