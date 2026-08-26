// 숏폼 자막 "디자인 템플릿" 5종입니다. 폰트는 프로젝트에 있는 한글 폰트 하나만 쓰지만,
// 글자색/박스색/위치/두께를 서로 다르게 조합해서 캡컷 같은 앱의 "템플릿 고르기"와
// 비슷한 느낌을 내도록 했습니다. force_style은 ffmpeg subtitles(libass) 필터에 그대로
// 전달되는 ASS 스타일 값입니다(색상은 &HAABBGGRR 형식 — 보통 색상 표기와 순서가 반대).

const FONT_NAME = "Woosurimi Caption KR";

// ⚠️ ASS 스타일의 함정: BorderStyle=3(불투명 박스)일 때 박스 배경색은 BackColour가
// 아니라 OutlineColour 필드로 정해집니다(BackColour는 BorderStyle=1일 때 그림자
// 색으로만 쓰입니다). 그래서 아래 템플릿들은 박스색을 OutlineColour에 넣습니다.
//
// 자막은 두 겹으로 들어갑니다:
//   - forceStyle : 장면마다 바뀌는 하단 멘트(구어체 설명) — Alignment=2(하단 중앙)
//   - hookStyle  : 영상 내내 상단에 고정으로 떠 있는 후킹 문구 — Alignment=6(상단 중앙)
// ⚠️ 여기서 쓰는 Alignment는 ASS v4+ 넘패드 방식(8=상단중앙)이 아니라 구식 SSA 방식
// 입니다. 실제로 찍어보니 8은 "중앙-왼쪽"으로 나왔고, 상단 중앙은 6이었습니다
// (SSA: 1~3=하단, 5~7=상단, 9~11=중앙).
// 유튜브 쇼츠에서 흔히 쓰는 "상단 후킹 + 하단 자막" 구성을 그대로 따른 것입니다.
// 상단 후킹은 스크롤을 멈추게 하는 역할이라 하단 멘트보다 글자를 크고 두껍게 씁니다.

// ⚠️ 크기/위치 숫자의 기준: ffmpeg가 .srt를 내부적으로 .ass로 바꿀 때 기준 해상도를
// PlayResY=288로 잡고, libass가 그걸 실제 영상 높이(1280)로 확대합니다. 즉 실제 픽셀
// ≈ 값 × (1280/288) ≈ 값 × 4.44 입니다. 아래 숫자들은 사장님이 주신 참고 쇼츠 2편을
// 프레임 단위로 실측한 값(후킹 글자 ~70px, 하단 자막 ~50px, 후킹 위쪽 여백 ~130px,
// 하단 자막 아래 여백 ~300px)을 이 배율로 되돌려 계산한 것입니다.
const HOOK_FONT_SIZE = 16; // ≈ 71px
const HOOK_MARGIN_V = 29; // ≈ 129px (화면 위에서부터)
const BODY_FONT_SIZE = 12; // ≈ 53px
const BODY_MARGIN_V = 68; // ≈ 302px (화면 아래에서부터)

// 상단 후킹 문구 기본형: 굵은 흰 글씨 + 두꺼운 검은 테두리(어떤 사진 위에서도 잘 보임).
const HOOK_BASE = `FontName=${FONT_NAME},FontSize=${HOOK_FONT_SIZE},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=1,Alignment=6,MarginV=${HOOK_MARGIN_V}`;

// ⚠️ 강조색 — 요즘 한국 숏폼의 가장 큰 특징입니다.
//
// 참고하신 릴스들을 다시 보니, 자막 한 줄을 통째로 같은 색으로 쓰는 경우가 거의
// 없습니다. 핵심 단어 한둘만 색을 바꿔서 눈이 거기에 먼저 가게 만듭니다.
// 소리를 끄고 보는 사람이 많아서, 색이 바뀐 단어만 훑어도 내용이 전달되게 하는
// 장치입니다.
//
// libass는 자막 안에서 {\c&HBBGGRR&} 로 색을 바꿀 수 있습니다. 대본에 *별표*로
// 표시된 부분을 이 색으로 바꿔서 넣습니다(videoRenderer의 applyEmphasis).
const ACCENT = {
  "bold-black": "&H0000E0FF",   // 노랑 — 검은 박스 위에서 가장 잘 보입니다
  "soft-cream": "&H004466DD",   // 벽돌색 — 크림 배경에 어울리는 따뜻한 대비
  "neon-pink": "&H00FFFF00",    // 하늘색 — 핑크 글씨와 보색
  "vivid-yellow": "&H00FFFFFF", // 흰색 — 노란 글씨 사이에서 튀게
  "clean-blue": "&H0000E0FF",   // 노랑
};

const TEMPLATES = [
  {
    id: "bold-black",
    label: "볼드 블랙",
    description: "흰 글씨 + 검은 반투명 박스, 화면 아래쪽 — 어디에나 무난하게 잘 어울려요",
    moodKeywords: ["세일", "할인", "핫딜", "특가", "정보", "리뷰", "후기"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=${BODY_FONT_SIZE},Bold=1,PrimaryColour=&H00FFFFFF,` +
      `BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0,Alignment=2,MarginV=${BODY_MARGIN_V}`,
    hookStyle: HOOK_BASE,
  },
  {
    id: "soft-cream",
    label: "감성 크림",
    description: "짙은 글씨 + 따뜻한 크림색 박스, 화면 아래쪽 — 카페/여행/일상 브이로그에 잘 어울려요",
    moodKeywords: ["카페", "감성", "여행", "일상", "브이로그", "힐링", "하루"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=${BODY_FONT_SIZE},Bold=1,PrimaryColour=&H00303030,` +
      `BorderStyle=3,OutlineColour=&HB0E8F0F5,Outline=1,Shadow=0,Alignment=2,MarginV=${BODY_MARGIN_V}`,
    // 크림 톤에 맞춰 상단 후킹도 따뜻한 아이보리 글씨로.
    hookStyle: `FontName=${FONT_NAME},FontSize=${HOOK_FONT_SIZE},Bold=1,PrimaryColour=&H00F0F6FA,OutlineColour=&H00202020,BorderStyle=1,Outline=1.4,Shadow=1,Alignment=6,MarginV=${HOOK_MARGIN_V}`,
  },
  {
    id: "neon-pink",
    label: "네온 핑크",
    description: "핑크색 글씨 + 박스 없이 테두리만, 화면 아래쪽 — 트렌디하고 힙한 콘텐츠에 잘 어울려요",
    moodKeywords: ["숏폼", "챌린지", "트렌드", "밈", "힙", "스타일", "패션"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=${BODY_FONT_SIZE},Bold=1,PrimaryColour=&H00AA5AFF,OutlineColour=&H00201020,` +
      `BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=${BODY_MARGIN_V}`,
    hookStyle: `FontName=${FONT_NAME},FontSize=${HOOK_FONT_SIZE},Bold=1,PrimaryColour=&H00AA5AFF,OutlineColour=&H00201020,BorderStyle=1,Outline=1.4,Shadow=1,Alignment=6,MarginV=${HOOK_MARGIN_V}`,
  },
  {
    id: "vivid-yellow",
    label: "비비드 옐로우",
    description: "노란 글씨 + 검은 박스 — 세일/이벤트처럼 눈에 확 띄어야 할 때 잘 어울려요",
    moodKeywords: ["이벤트", "오픈", "런칭", "신상", "인기", "대박", "쇼핑"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=${BODY_FONT_SIZE},Bold=1,PrimaryColour=&H0000D6FF,` +
      `BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0,Alignment=2,MarginV=${BODY_MARGIN_V}`,
    // 상단 후킹도 노란 글씨로 통일해서 강한 대비를 유지합니다.
    hookStyle: `FontName=${FONT_NAME},FontSize=${HOOK_FONT_SIZE},Bold=1,PrimaryColour=&H0000D6FF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.4,Shadow=1,Alignment=6,MarginV=${HOOK_MARGIN_V}`,
  },
  {
    id: "clean-blue",
    label: "클린 블루",
    description: "흰 글씨 + 차분한 블루 박스, 화면 아래쪽 — 제품 소개/정보성 콘텐츠에 잘 어울려요",
    moodKeywords: ["가격", "스펙", "비교", "추천", "가이드", "정리"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=${BODY_FONT_SIZE},Bold=1,PrimaryColour=&H00FFFFFF,` +
      `BorderStyle=3,OutlineColour=&HA0783C1E,Outline=1,Shadow=0,Alignment=2,MarginV=${BODY_MARGIN_V}`,
    hookStyle: HOOK_BASE,
  },
];

function _getTemplateRaw(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

/** 템플릿에 강조색을 붙여서 돌려줍니다. */
function getTemplate(id) {
  const tpl = _getTemplateRaw(id);
  return { ...tpl, accent: ACCENT[tpl.id] || "&H0000E0FF" };
}

// bgmLibrary.recommendBgm과 같은 방식으로, 대본 키워드를 보고 5개 템플릿을 어울리는
// 순서로 정렬해서 돌려줍니다.
function recommendTemplates(scenes = []) {
  const text = scenes.map((s) => s.caption || "").join(" ");
  const scored = TEMPLATES.map((t) => {
    const score = t.moodKeywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
    return { id: t.id, label: t.label, description: t.description, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

module.exports = { TEMPLATES, getTemplate, recommendTemplates };
