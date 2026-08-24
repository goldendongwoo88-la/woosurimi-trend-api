// 숏폼 자막 "디자인 템플릿" 5종입니다. 폰트는 프로젝트에 있는 한글 폰트 하나만 쓰지만,
// 글자색/박스색/위치/두께를 서로 다르게 조합해서 캡컷 같은 앱의 "템플릿 고르기"와
// 비슷한 느낌을 내도록 했습니다. force_style은 ffmpeg subtitles(libass) 필터에 그대로
// 전달되는 ASS 스타일 값입니다(색상은 &HAABBGGRR 형식 — 보통 색상 표기와 순서가 반대).

const FONT_NAME = "Woosurimi Caption KR";

// ⚠️ ASS 스타일의 함정: BorderStyle=3(불투명 박스)일 때 박스 배경색은 BackColour가
// 아니라 OutlineColour 필드로 정해집니다(BackColour는 BorderStyle=1일 때 그림자
// 색으로만 쓰입니다). 그래서 아래 템플릿들은 박스색을 OutlineColour에 넣습니다.

const TEMPLATES = [
  {
    id: "bold-black",
    label: "볼드 블랙",
    description: "흰 글씨 + 검은 반투명 박스, 화면 아래쪽 — 어디에나 무난하게 잘 어울려요",
    moodKeywords: ["세일", "할인", "핫딜", "특가", "정보", "리뷰", "후기"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=20,PrimaryColour=&H00FFFFFF,` +
      "BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0,Alignment=2,MarginV=140",
  },
  {
    id: "soft-cream",
    label: "감성 크림",
    description: "짙은 글씨 + 따뜻한 크림색 박스, 화면 아래쪽 — 카페/여행/일상 브이로그에 잘 어울려요",
    moodKeywords: ["카페", "감성", "여행", "일상", "브이로그", "힐링", "하루"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=20,PrimaryColour=&H00303030,` +
      "BorderStyle=3,OutlineColour=&HB0E8F0F5,Outline=1,Shadow=0,Alignment=2,MarginV=140",
  },
  {
    id: "neon-pink",
    label: "네온 핑크",
    description: "핑크색 글씨 + 박스 없이 테두리만, 화면 아래쪽 — 트렌디하고 힙한 콘텐츠에 잘 어울려요",
    moodKeywords: ["숏폼", "챌린지", "트렌드", "밈", "힙", "스타일", "패션"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=22,PrimaryColour=&H00AA5AFF,OutlineColour=&H00201020,` +
      "BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=160",
  },
  {
    id: "vivid-yellow-top",
    label: "비비드 옐로우(상단)",
    description: "노란 글씨 + 검은 박스, 화면 위쪽 — 세일/이벤트처럼 눈에 확 띄어야 할 때 잘 어울려요",
    moodKeywords: ["이벤트", "오픈", "런칭", "신상", "인기", "대박", "쇼핑"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=21,PrimaryColour=&H0000D6FF,` +
      "BorderStyle=3,OutlineColour=&H99000000,Outline=1,Shadow=0,Alignment=8,MarginV=80",
  },
  {
    id: "clean-blue",
    label: "클린 블루",
    description: "흰 글씨 + 차분한 블루 박스, 화면 아래쪽 — 제품 소개/정보성 콘텐츠에 잘 어울려요",
    moodKeywords: ["가격", "스펙", "비교", "추천", "가이드", "정리"],
    forceStyle:
      `FontName=${FONT_NAME},FontSize=19,PrimaryColour=&H00FFFFFF,` +
      "BorderStyle=3,OutlineColour=&HA0783C1E,Outline=1,Shadow=0,Alignment=2,MarginV=140",
  },
];

function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
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
