/**
 * 숏폼 "효과팩(effect pack)" — 캡컷 자동컷에서 보이는 편집 스타일을 재현한 묶음입니다.
 *
 * ⚠️ 기존 videoTemplates.js와 역할이 다릅니다. 헷갈리기 쉬워서 적어둡니다.
 *   · videoTemplates = **글자** 디자인 (자막 색·박스·크기)
 *   · videoEffects   = **화면** 디자인 (사진 액자, 움직임, 색보정, 장면 전환, 컷 속도)
 * 둘은 따로 고를 수 있습니다. "볼드 블랙 자막 + 포토카드 화면" 같은 조합이 됩니다.
 *
 * ⚠️ 이 값들은 사장님이 주신 캡컷 자동컷 영상 3편을 프레임 단위로 실측해서 뽑았습니다.
 *   · 누하우스(안마의자) 편 — 하얀 포토카드 + 같은 사진을 흐리게 깐 배경, 살짝 기울임
 *   · 신발 편 — 밝은 배경 위 하얀 카드, 컷이 1.29초 간격으로 규칙적(음악 박자에 맞춤)
 *   · 선글라스 편 — 꽉 찬 화면 + 강한 채도, 빠른 줌, 흐림/번쩍 전환
 * 컷 간격은 ffmpeg 장면 검출로 실제 측정한 값입니다(아래 paceSec).
 *
 * ⚠️ 여기서는 ffmpeg를 직접 부르지 않습니다. 값만 정의하고, 실제 필터 조립은
 * videoRenderer.js가 합니다. 그래야 효과를 추가할 때 렌더러를 안 건드려도 됩니다.
 */

// 장면과 장면 사이 전환 효과입니다. ffmpeg xfade가 실제로 지원하는 이름만 씁니다
// (이 빌드에서 지원 여부를 직접 확인한 것들입니다 — 없는 이름을 쓰면 렌더가 통째로
// 실패합니다).
const SAFE_TRANSITIONS = new Set([
  "fade", "fadeblack", "fadewhite", "dissolve", "pixelize", "radial",
  "slideleft", "slideright", "slideup", "slidedown",
  "smoothleft", "smoothright", "circleopen", "circleclose",
  "hblur", "zoomin", "squeezeh", "squeezev", "coverleft", "revealleft",
  "wipeleft", "diagtl", "hlslice",
]);

const EFFECTS = [
  {
    id: "clean-zoom",
    label: "클린 줌 (기본)",
    description: "사진이 화면을 꽉 채우고 천천히 확대·축소돼요. 어떤 소재에도 무난한 기본값입니다.",
    moodKeywords: ["정보", "리뷰", "후기", "설명", "가이드", "정리"],
    frame: "full",
    grade: null,
    motion: { maxZoom: 1.18, driftRatio: 0.07 },
    tiltDeg: 0,
    transitions: ["fade"],
    transitionSec: 0.35,
    paceSec: 3.2,
    // ⚠️ 기본 효과만 하드컷을 유지합니다. 지금까지 만든 영상과 결과가 달라지면 안 되고,
    // 크로스페이드는 전 구간 재인코딩이라 메모리를 많이 씁니다(Render 512MB).
    useTransition: false,
  },
  {
    id: "photocard-drift",
    label: "포토카드 드리프트",
    description:
      "하얀 폴라로이드 카드 + 같은 사진을 흐리게 깐 배경. 카드가 장면마다 반대로 살짝 기울어요. " +
      "매장·제품 소개나 감성 브이로그에 잘 어울립니다.",
    moodKeywords: ["감성", "카페", "일상", "브이로그", "매장", "인테리어", "소개", "힐링"],
    frame: "photocard",
    // 배경을 흐리게 깔면 전체가 칙칙해 보여서, 카드 안 사진만 살짝 채도를 올립니다.
    grade: "eq=saturation=1.06:contrast=1.03",
    motion: { maxZoom: 1.08, driftRatio: 0.035 },
    tiltDeg: 1.6,
    transitions: ["fade", "dissolve"],
    transitionSec: 0.42,
    paceSec: 2.8,
    useTransition: true,
  },
  {
    id: "whitecard-pop",
    label: "화이트카드 팝",
    description:
      "밝은 배경 위에 하얀 카드가 그림자와 함께 톡톡 넘어가요. 컷이 짧고 규칙적이라 " +
      "제품컷을 빠르게 넘길 때 좋습니다.",
    moodKeywords: ["제품", "쇼핑", "신상", "패션", "가격", "언박싱", "추천"],
    frame: "whitecard",
    grade: "eq=contrast=1.06:saturation=1.12:brightness=0.03",
    motion: { maxZoom: 1.05, driftRatio: 0.02 },
    tiltDeg: 0.9,
    // 좌우로 번갈아 밀어내서 "카드를 넘기는" 느낌을 만듭니다.
    transitions: ["slideleft", "slideright"],
    transitionSec: 0.28,
    // ⚠️ 신발 편에서 실측한 컷 간격이 1.29초였습니다. 다만 나레이션이 들어가면 그보다
    // 길어질 수밖에 없어서(말이 안 끝납니다), 나레이션이 없을 때만 이 리듬이 살아납니다.
    paceSec: 1.9,
    useTransition: true,
  },
  {
    id: "vivid-punch",
    label: "비비드 펀치",
    description:
      "화면을 꽉 채우고 색을 강하게, 줌도 빠르게. 전환은 흐림·번쩍으로 치고 나갑니다. " +
      "시선을 붙잡아야 하는 후킹 구간에 어울려요.",
    moodKeywords: ["세일", "할인", "핫딜", "특가", "이벤트", "대박", "챌린지", "트렌드"],
    frame: "full",
    grade: "eq=contrast=1.16:saturation=1.34:brightness=0.02,unsharp=5:5:0.6",
    motion: { maxZoom: 1.3, driftRatio: 0.09 },
    tiltDeg: 0,
    transitions: ["hblur", "fadewhite", "zoomin", "pixelize"],
    transitionSec: 0.22,
    paceSec: 2.2,
    useTransition: true,
  },
  {
    id: "film-strip",
    label: "필름 스트립",
    description:
      "위아래 검은 띠(시네마틱 레터박스) + 차분한 색. 느리게 줌해서 무게감 있게 보입니다. " +
      "인터뷰·스토리텔링·사주 같은 진중한 소재에 어울려요.",
    moodKeywords: ["이야기", "사주", "운세", "인터뷰", "다큐", "회고", "비밀", "진실"],
    frame: "letterbox",
    grade: "eq=contrast=1.1:saturation=0.74:brightness=-0.02",
    motion: { maxZoom: 1.12, driftRatio: 0.05 },
    tiltDeg: 0,
    transitions: ["fadeblack", "dissolve"],
    transitionSec: 0.5,
    paceSec: 3.6,
    useTransition: true,
  },
  {
    id: "soft-bloom",
    label: "소프트 블룸",
    description:
      "살짝 부드럽게 번지는 빛 + 은은한 원형 전환. 뷰티·웨딩·감성 소재에 잘 맞아요.",
    moodKeywords: ["뷰티", "화장품", "웨딩", "꽃", "선물", "따뜻", "위로", "힐링"],
    frame: "full",
    // unsharp의 amount를 음수로 주면 오히려 부드러워집니다(블러와 달리 디테일만 눌러줌).
    grade: "eq=brightness=0.05:saturation=1.1:contrast=0.97,unsharp=3:3:-0.5",
    motion: { maxZoom: 1.14, driftRatio: 0.05 },
    tiltDeg: 0,
    transitions: ["circleopen", "fade", "circleclose"],
    transitionSec: 0.45,
    paceSec: 3.0,
    useTransition: true,
  },
];

const DEFAULT_EFFECT_ID = "clean-zoom";

function getEffect(id) {
  return EFFECTS.find((e) => e.id === id) || EFFECTS.find((e) => e.id === DEFAULT_EFFECT_ID);
}

/**
 * 장면 경계마다 쓸 전환 효과 이름을 돌려줍니다.
 *
 * ⚠️ 한 영상에서 전환을 하나만 쓰면 단조롭고, 매번 다르게 쓰면 정신없습니다.
 * 그래서 효과팩마다 2~4개를 정해두고 순서대로 돌려 씁니다.
 *
 * @param {object} effect getEffect()가 돌려준 효과팩
 * @param {number} boundaryIndex 0이면 1번째→2번째 장면 사이
 */
function transitionAt(effect, boundaryIndex) {
  const list = (effect && effect.transitions) || ["fade"];
  const name = list[boundaryIndex % list.length];
  // 혹시 목록에 오타가 있어도 렌더 전체가 죽지 않게 안전한 기본값으로 떨어뜨립니다.
  return SAFE_TRANSITIONS.has(name) ? name : "fade";
}

/** 장면마다 카드를 기울일 각도(도). 방향을 번갈아 줘서 손으로 놓은 느낌을 냅니다. */
function tiltAt(effect, sceneIndex) {
  const deg = (effect && effect.tiltDeg) || 0;
  if (!deg) return 0;
  return sceneIndex % 2 === 0 ? deg : -deg;
}

/**
 * 대본 내용을 보고 어울리는 효과팩 순서를 매깁니다.
 * videoTemplates.recommendTemplates와 같은 방식이라 결과를 나란히 쓰기 좋습니다.
 */
function recommendEffects(scenes = []) {
  const text = scenes.map((s) => (typeof s === "string" ? s : s.caption || "")).join(" ");
  const scored = EFFECTS.map((e) => ({
    id: e.id,
    label: e.label,
    description: e.description,
    frame: e.frame,
    paceSec: e.paceSec,
    score: e.moodKeywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0),
  }));
  // 점수가 같으면 원래 순서(기본값이 앞)를 유지합니다 — sort 안정성에 기대지 않고 명시합니다.
  return scored
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => b.score - a.score || a._i - b._i)
    .map(({ _i, ...rest }) => rest);
}

module.exports = {
  EFFECTS,
  DEFAULT_EFFECT_ID,
  SAFE_TRANSITIONS,
  getEffect,
  transitionAt,
  tiltAt,
  recommendEffects,
};
