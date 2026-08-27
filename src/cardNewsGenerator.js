// "AI 카드뉴스 생성" 기능입니다. 주제를 넣으면 Claude API로 페이지별 제목/본문을 짜고,
// sharp(SVG 오버레이 방식)로 각 페이지를 실제 PNG 카드 이미지로 렌더링합니다.
//
// 렌더링 방식(중요, 실제로 겪은 문제 기록): 처음에는 SVG의 @font-face로 폰트를
// base64 embed해서 <text> 태그로 그렸는데, 로컬(Windows)에서는 잘 됐지만 실제
// 배포 환경(Render, Linux)에서는 librsvg가 embed된 폰트를 인식하지 못해 한글이
// 전부 깨진 16진수 코드 박스로 나오는 문제가 있었습니다(서버에 시스템 폰트/폰트
// 설정이 없어서로 추정). 그래서 fontkit(Adobe/foliojs, PDFKit이 쓰는 라이브러리)로
// 폰트 파일(NotoSansKR-Bold.ttf)의 글자 윤곽선을 직접 SVG <path>로 뽑아서 그리는
// 방식으로 바꿨습니다 — 이러면 시스템 폰트·fontconfig에 전혀 의존하지 않아서 어떤
// 서버 환경에서도 동일하게 렌더링됩니다(실제로 Render 배포본에서 재현 후 이
// 방식으로 고쳐서 확인함).
//
// ⚠️ 실제로 겪은 함정 두 가지:
// 1) 여러 글자의 path 데이터를 하나의 <path d="..."> 로 이어붙이면 첫 글자만
//    보이고 나머지는 사라지는 렌더링 버그가 있었습니다(librsvg의 다중 서브패스
//    처리 문제로 추정). 그래서 글자마다 별도의 <path> 엘리먼트로 그립니다
//    (glyphPaths 참고).
// 2) 처음에 opentype.js를 썼는데, 이 폰트의 일부 한글 글자("방","하","세","서" 등)를
//    엉뚱한 글리프(동그라미, 사람 아이콘 모양)로 잘못 매핑하는 버그가 있었습니다
//    (cmap 파싱 이슈로 추정). fontkit으로 바꾸니 같은 문장이 정확히 렌더링됨을
//    확인했습니다.
// 둘 다 실제로 렌더링해서 눈으로 확인한 뒤 고친 것입니다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const fontkit = require("fontkit");
const claudeClient = require("./claudeClient");
const { extractPageData } = require("./pageExtractor");

const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
// ⚠️ 처음에는 opentype.js를 썼는데, 이 폰트의 일부 한글 글자(예: "방","하","세","서")를
// 엉뚱한 글리프(동그라미, 사람 아이콘 모양 등)로 잘못 매핑하는 버그가 있었습니다
// (실제로 렌더링해서 발견 — cmap 파싱 이슈로 추정). fontkit(Adobe/foliojs, PDFKit이
// 쓰는 라이브러리)으로 바꾸니 같은 문장이 정확히 렌더링되는 걸 확인해서 교체했습니다.
const FONT_OBJ = fontkit.openSync(FONT_PATH);
const RENDERS_DIR = path.join(__dirname, "..", "public", "renders", "cardnews");

const ASPECT_RATIOS = {
  "4:5": { w: 1080, h: 1350, label: "4:5 (인스타 카드뉴스 기본)" },
  "1:1": { w: 1080, h: 1080, label: "1:1 (정사각형)" },
  "9:16": { w: 1080, h: 1920, label: "9:16 (스토리·릴스)" },
  "16:9": { w: 1920, h: 1080, label: "16:9 (가로형)" },
};

// 카드 디자인 스타일 5종 — videoTemplates.js의 자막 템플릿과 같은 방식으로, 주제
// 키워드를 보고 어울리는 순서로 추천도 해줍니다.
const CARD_STYLES = [
  {
    id: "midnight-purple",
    label: "미드나잇 퍼플",
    description: "짙은 남색·보라 그라디언트 + 흰 글씨 — 트렌드/IT/비즈니스 주제에 잘 어울려요",
    moodKeywords: ["트렌드", "비즈니스", "마케팅", "전략", "IT", "테크", "정보"],
    bgFrom: "#1b1436",
    bgTo: "#3a1f5c",
    titleColor: "#ffffff",
    bodyColor: "#d8cdf0",
    accentColor: "#a97bff",
    scrim: "rgba(10,6,25,0.55)",
  },
  {
    id: "cream-editorial",
    label: "크림 에디토리얼",
    description: "따뜻한 크림 배경 + 짙은 글씨 — 카페/여행/라이프스타일 소개에 잘 어울려요",
    moodKeywords: ["카페", "여행", "감성", "일상", "소개", "가이드", "리스트"],
    bgFrom: "#f5ecdf",
    bgTo: "#ead9bd",
    titleColor: "#2b1f14",
    bodyColor: "#5a4a35",
    accentColor: "#b5713a",
    scrim: "rgba(245,236,223,0.72)",
  },
  {
    id: "bold-mono",
    label: "볼드 모노",
    description: "검정 배경 + 노란/흰 글씨, 강한 대비 — 이슈/랭킹/후킹형 콘텐츠에 잘 어울려요",
    moodKeywords: ["랭킹", "이슈", "화제", "TOP", "충격", "속보", "논란"],
    bgFrom: "#0a0a0a",
    bgTo: "#1c1c1c",
    titleColor: "#ffffff",
    bodyColor: "#f4d34d",
    accentColor: "#f4d34d",
    scrim: "rgba(0,0,0,0.55)",
  },
  {
    id: "soft-pastel",
    label: "소프트 파스텔",
    description: "핑크·민트 파스텔 그라디언트 + 짙은 글씨 — 뷰티/육아/감성 콘텐츠에 잘 어울려요",
    moodKeywords: ["뷰티", "육아", "감성", "힐링", "추천", "꿀팁"],
    bgFrom: "#ffd9e6",
    bgTo: "#cdeee0",
    titleColor: "#3a2233",
    bodyColor: "#5c4653",
    accentColor: "#ff7fa8",
    scrim: "rgba(255,255,255,0.55)",
  },
  {
    id: "clean-corporate",
    label: "클린 코퍼레이트",
    description: "흰 배경 + 파란 포인트 — 공지/제도/정보성 콘텐츠에 잘 어울려요",
    moodKeywords: ["공지", "제도", "지원금", "신청", "안내", "정리", "비교"],
    bgFrom: "#ffffff",
    bgTo: "#eef3fb",
    titleColor: "#132a4a",
    bodyColor: "#3c4a5e",
    accentColor: "#2f6fed",
    scrim: "rgba(255,255,255,0.75)",
  },
];

function getStyles() {
  return CARD_STYLES.map(({ id, label, description }) => ({ id, label, description }));
}

function getStyle(id) {
  return CARD_STYLES.find((s) => s.id === id) || CARD_STYLES[0];
}

function getAspectRatios() {
  return Object.entries(ASPECT_RATIOS).map(([id, v]) => ({ id, label: v.label, width: v.w, height: v.h }));
}

// 레이아웃(구성) 4종 x 색상 팔레트(CARD_STYLES) 5종 = 실제로 다르게 보이는 템플릿 20개.
// Mirr 같은 서비스의 "템플릿 갤러리"처럼, 색만 다른 게 아니라 텍스트 배치 자체가
// 다른 구성을 여러 개 만들어서 조합했습니다. 각 레이아웃의 실제 그리기 로직은
// LAYOUT_BUILDERS(아래)에 있습니다.
const LAYOUTS = [
  {
    id: "stack",
    label: "스택형",
    description: "제목·본문을 왼쪽으로 쌓아 올리는 기본 카드뉴스 구성 — 어디에나 무난해요",
  },
  {
    id: "banner",
    label: "배너형",
    description: "상단에 색이 있는 띠(배너) 안에 제목을 넣고, 그 아래 흰 여백에 본문 — 공지·안내문 느낌",
  },
  {
    id: "editorial-center",
    label: "에디토리얼 센터형",
    description: "제목·본문을 화면 중앙에 정렬하고 여백을 넉넉히 두는 매거진 스타일",
  },
  {
    id: "framed",
    label: "포스터 프레임형",
    description: "카드 테두리에 얇은 프레임을 두르고 제목을 화면 하단에 크게 앉히는 포스터 느낌",
  },
];

function getLayouts() {
  return LAYOUTS;
}

function getLayout(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

// 색 하나(hex)를 보고 그 위에 얹을 글자는 흰색이 나을지 짙은 색이 나을지 대충 판단합니다
// (배너형처럼 accentColor를 배경으로 통째로 쓸 때, 팔레트마다 밝기가 달라도 글자가
// 항상 잘 보이게 하기 위한 용도입니다 — 정확한 WCAG 대비 계산까지는 아니고 근사치입니다).
function pickContrastText(hex) {
  const m = (hex || "").replace("#", "");
  if (m.length !== 6) return "#ffffff";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

// bgmLibrary.recommendBgm / videoTemplates.recommendTemplates와 같은 방식의 추천 정렬.
function recommendStyles(topic = "") {
  const text = topic || "";
  const scored = CARD_STYLES.map((s) => {
    const score = s.moodKeywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
    return { id: s.id, label: s.label, description: s.description, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ===================== 글자를 벡터 도형(path)으로 직접 그리는 헬퍼 =====================
// 위 파일 상단 설명 참고 — 시스템 폰트/fontconfig에 의존하지 않기 위해 <text> 대신
// 이 헬퍼들로 폰트 파일의 글자 윤곽선을 SVG <path>로 직접 그립니다.

const FONT_SCALE_UNIT = FONT_OBJ.unitsPerEm || 1000;

function glyphAdvance(codePoint, fontSize) {
  return FONT_OBJ.glyphForCodePoint(codePoint).advanceWidth * (fontSize / FONT_SCALE_UNIT);
}

function measureText(text, fontSize) {
  let width = 0;
  for (const ch of text || "") width += glyphAdvance(ch.codePointAt(0), fontSize);
  return width;
}

// 글자 하나하나를 별도의 <path> 엘리먼트로 그립니다(opentype.js로 여러 글자를 한
// path에 이어붙였을 때 첫 글자만 렌더링되던 버그를 피하려고 — 파일 상단 설명 참고).
// scale(scale,-scale): 폰트 좌표계(1000 unitsPerEm, Y축 위쪽)를 픽셀 크기로 바꾸면서
// SVG의 Y축 아래쪽 방향에 맞게 뒤집습니다. translate(cx,y): 그 글자를 베이스라인
// 위치로 옮깁니다.
function glyphPaths(text, x, y, fontSize, fill, opacity) {
  const scale = fontSize / FONT_SCALE_UNIT;
  let cx = x;
  let out = "";
  const opacityAttr = opacity != null ? ` opacity="${opacity}"` : "";
  for (const ch of text || "") {
    const glyph = FONT_OBJ.glyphForCodePoint(ch.codePointAt(0));
    if (ch !== " ") {
      const d = glyph.path.scale(scale, -scale).translate(cx, y).toSVG();
      if (d) out += `<path d="${d}" fill="${fill}"${opacityAttr}/>`;
    }
    cx += glyph.advanceWidth * scale;
  }
  return out;
}

// anchor: "start"(기본) | "middle" | "end" — CSS text-anchor와 같은 의미입니다.
function alignedText(text, x, y, fontSize, fill, { anchor = "start", opacity } = {}) {
  const w = measureText(text, fontSize);
  let startX = x;
  if (anchor === "middle") startX = x - w / 2;
  else if (anchor === "end") startX = x - w;
  return glyphPaths(text, startX, y, fontSize, fill, opacity);
}

// lines(배열)를 lineHeight 간격으로 세로로 쌓아 그립니다. x/anchor는 모든 줄에 동일 적용.
function multilineText(lines, x, startY, lineHeight, fontSize, fill, opts = {}) {
  return lines.map((line, i) => alignedText(line, x, startY + i * lineHeight, fontSize, fill, opts)).join("");
}

// 실제 폰트 치수(measureText)로 줄바꿈합니다 — 예전엔 글자 수로 대충 추정했는데,
// 이제 fontkit으로 정확한 폭을 잴 수 있어서 훨씬 정밀하게 줄바꿈됩니다.
function wrapByWidth(text, fontSize, maxWidthPx) {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (measureText(candidate, fontSize) > maxWidthPx && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// wrapByWidth + 줄 수 상한. 그냥 slice(0, maxLines)로 자르면 마지막 문장이 통째로
// 조용히 사라져서(예: "...중요해요." 소실) 눈치채기 어려우니, 잘렸으면 "…"을 붙이고
// 그 "…"까지 포함해서 실제로 폭 안에 들어오도록 필요하면 더 잘라냅니다.
function wrapByWidthCapped(text, fontSize, maxWidthPx, maxLines) {
  const lines = wrapByWidth(text, fontSize, maxWidthPx);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1].replace(/[.,!?~]+$/, "");
  let candidate = `${last}…`;
  while (measureText(candidate, fontSize) > maxWidthPx && last.length > 1) {
    last = last.slice(0, -1);
    candidate = `${last}…`;
  }
  kept[maxLines - 1] = candidate;
  return kept;
}

// ===================== 1) Claude API로 페이지별 대본(plan) 짜기 =====================

function writerConfigured() {
  return claudeClient.isConfigured();
}

function getGeneratorStatus() {
  return { ready: writerConfigured(), model: claudeClient.getModel() };
}

async function callClaudeForPlan(topic, pageCount) {
  const prompt =
    `당신은 인스타그램/블로그에 올릴 "카드뉴스"(여러 장으로 이어지는 이미지 슬라이드) 대본을 쓰는 한국어 콘텐츠 작가입니다.\n` +
    `주제: "${topic}"\n` +
    `총 ${pageCount}장을 만듭니다. 1번째 장은 반드시 role="cover"(강렬한 후킹 제목, body는 짧은 부제 한 줄), ` +
    `마지막 장은 반드시 role="outro"(요약 또는 CTA 한두 문장), 나머지는 role="content"(소제목 + 핵심 내용 2~4문장)입니다.\n\n` +
    `아래 JSON 형식으로만 응답하세요(다른 설명 없이 JSON 객체 하나만):\n` +
    `{\n` +
    `  "pages": [ { "role": "cover|content|outro", "title": "각 장의 짧은 제목(12자 내외)", "body": "본문(각 장의 role에 맞는 길이)" } 총 ${pageCount}개 ]\n` +
    `}\n\n` +
    `⚠️ 아주 중요한 규칙: 당신은 이 주제에 대한 실시간/최신 정보나 실제 경험이 없습니다. 정확한 가격, 정확한 날짜/영업시간, ` +
    `구체적인 수치·통계처럼 확인이 필요한 구체적 사실은 지어내지 말고, "✏️(확인 후 채워주세요: 예상되는 내용)" 형태로 표시해서 ` +
    `사용자가 실제 정보로 채워 넣을 자리를 남겨두세요. 일반적으로 알려진 상식 수준의 설명과 문장력은 자유롭게 써도 됩니다. ` +
    `각 장의 body는 카드 이미지 한 장에 들어갈 분량이니 너무 길게 쓰지 말고, content 장은 3~5문장, cover/outro 장은 1~2문장으로 짧게 쓰세요.`;

  const text = await claudeClient.callClaude({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2200,
    temperature: 0.85,
  });
  const parsed = claudeClient.extractJson(text);
  if (!Array.isArray(parsed.pages) || !parsed.pages.length) {
    throw new Error("Claude 응답 형식이 예상과 달랐습니다.");
  }
  return parsed.pages;
}

function buildTemplatePlan(topic, pageCount) {
  const fillIn = (hint) => `✏️ ${hint} (실제로 조사하거나 경험한 내용으로 채워주세요)`;
  const pages = [];
  pages.push({ role: "cover", title: topic, body: `${topic}, 지금 꼭 알아야 할 이야기` });
  const contentCount = Math.max(pageCount - 2, 1);
  for (let i = 0; i < contentCount; i++) {
    pages.push({
      role: "content",
      title: `${i + 1}. ${fillIn("이 장의 소제목")}`,
      body: fillIn(`"${topic}"에 대한 핵심 내용을 이 장에 채워주세요`),
    });
  }
  pages.push({ role: "outro", title: "정리하면", body: fillIn("요약이나 마무리 CTA를 적어주세요") });
  return pages.slice(0, pageCount);
}

// ===================== "링크로 콘텐츠 만들기" — 원문 URL 내용 기반 대본 =====================
// blogWriter.js의 같은 기능과 같은 원칙: pageExtractor로 실제 원문(제목/본문)을 먼저 가져온
// 뒤, 그 진짜 내용을 요약·재구성해서 카드뉴스 대본을 짭니다 — 주제 키워드만 주고 처음부터
// 창작하게 하는 것보다 빈칸(✏️)이 훨씬 적습니다.

function splitSentencesForCards(text) {
  return (text || "")
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function callClaudeForPlanFromUrl(pageData, pageCount) {
  const context = [
    `원문 제목: ${pageData.title || "(제목 없음)"}`,
    pageData.description ? `원문 요약: ${pageData.description}` : "",
    pageData.bodyText ? `원문 본문 발췌:\n${pageData.bodyText.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt =
    `당신은 인스타그램/블로그에 올릴 "카드뉴스"(여러 장으로 이어지는 이미지 슬라이드) 대본을 쓰는 한국어 콘텐츠 작가입니다.\n` +
    `아래는 실제 원문 페이지에서 가져온 내용입니다. 이 내용에 담긴 사실을 바탕으로 총 ${pageCount}장짜리 카드뉴스 대본을 쓰세요 ` +
    `(원문 문장을 그대로 베끼지 말고, 자연스러운 당신만의 문장으로 요약·재구성해 주세요):\n\n${context}\n\n` +
    `1번째 장은 반드시 role="cover"(강렬한 후킹 제목, body는 짧은 부제 한 줄), ` +
    `마지막 장은 반드시 role="outro"(요약 또는 CTA 한두 문장), 나머지는 role="content"(소제목 + 핵심 내용 2~4문장)입니다.\n\n` +
    `아래 JSON 형식으로만 응답하세요(다른 설명 없이 JSON 객체 하나만):\n` +
    `{\n` +
    `  "pages": [ { "role": "cover|content|outro", "title": "각 장의 짧은 제목(12자 내외)", "body": "본문(각 장의 role에 맞는 길이)" } 총 ${pageCount}개 ]\n` +
    `}\n\n` +
    `⚠️ 중요: 위 원문에 실제로 나온 사실은 자유롭게 활용해서 재구성해도 됩니다. 다만 원문에 없는 구체적 사실은 지어내지 말고 ` +
    `"✏️(확인 후 채워주세요)" 형태로 표시하세요. 각 장의 body는 카드 이미지 한 장 분량이니 content 장은 3~5문장, cover/outro 장은 1~2문장으로 짧게 쓰세요.`;

  const text = await claudeClient.callClaude({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2200,
    temperature: 0.85,
  });
  const parsed = claudeClient.extractJson(text);
  if (!Array.isArray(parsed.pages) || !parsed.pages.length) {
    throw new Error("Claude 응답 형식이 예상과 달랐습니다.");
  }
  return parsed.pages;
}

// Claude API 없이(또는 실패 시) 원문에서 실제로 뽑아온 문장으로 페이지를 채웁니다.
function buildTemplatePlanFromUrl(pageData, pageCount) {
  const cleanTopic = pageData.title || "(원문 제목을 찾지 못했어요)";
  const sentences = splitSentencesForCards(pageData.bodyText || pageData.description).filter((s) => s.length >= 8);
  const pages = [];
  pages.push({ role: "cover", title: cleanTopic, body: pageData.description || sentences[0] || "지금 꼭 알아야 할 이야기" });

  const contentCount = Math.max(pageCount - 2, 1);
  const perPage = Math.max(Math.ceil(sentences.length / contentCount), 1);
  for (let i = 0; i < contentCount; i++) {
    const chunk = sentences.slice(i * perPage, (i + 1) * perPage).join(" ");
    pages.push({
      role: "content",
      title: `${i + 1}. 핵심 포인트`,
      body: chunk || `✏️ "${cleanTopic}"에 대한 핵심 내용을 이 장에 채워주세요`,
    });
  }
  pages.push({ role: "outro", title: "정리하면", body: "자세한 내용은 원문 링크에서 확인해보세요." });
  return pages.slice(0, pageCount);
}

/**
 * topic: 카드뉴스 주제 — sourceUrl이 있으면 무시됩니다.
 * pageCount: 3~8 (기본 6)
 * sourceUrl: (선택, "링크로 콘텐츠 만들기" 기능용) 넣으면 그 원문 페이지의 실제 제목/본문을
 *            바탕으로 대본을 씁니다.
 * 반환: { topic, pages: [{role,title,body}], note, sourceImages? }
 *   sourceImages: sourceUrl을 썼을 때만 있음 — 원문에 실제로 있던 사진 URL 목록(페이지 수만큼).
 *   렌더링할 때 이 URL들을 renderCardNewsSet의 images 배열로 그대로 넘기면 배경 사진으로 쓸 수 있습니다.
 */
async function generatePlan({ topic, pageCount = 6, sourceUrl } = {}) {
  const count = Math.min(Math.max(Number(pageCount) || 6, 3), 8);

  if (sourceUrl) {
    let pageData;
    try {
      pageData = await extractPageData(sourceUrl);
    } catch (err) {
      throw new Error(`링크에서 내용을 가져오지 못했습니다: ${err.message}`);
    }
    const cleanTopic = pageData.title || sourceUrl;
    const sourceImages = (pageData.images || []).slice(0, count);
    const imageNote = sourceImages.length
      ? " 배경 사진 후보로 원문 페이지에 실제로 있던 사진을 가져왔어요 — 본인 소유가 아니라면 사용 전에 권한을 꼭 확인해 주세요."
      : "";

    if (writerConfigured()) {
      try {
        const pages = await callClaudeForPlanFromUrl(pageData, count);
        return {
          topic: cleanTopic,
          pages,
          sourceImages,
          note: `Claude API로 원문 링크의 실제 내용을 요약·재구성해 만든 대본입니다. ✏️ 표시는 원문에 없는 구체적 사실이라 비워둔 자리입니다.${imageNote}`,
        };
      } catch (err) {
        console.error("[cardNewsGenerator] URL 기반 Claude 호출 실패, 원문 발췌로 대체합니다:", err.message);
        return {
          topic: cleanTopic,
          pages: buildTemplatePlanFromUrl(pageData, count),
          sourceImages,
          note: `Claude API 호출에 실패해서(${err.message}) 원문에서 실제로 가져온 문장으로 대신 채웠습니다.${imageNote}`,
        };
      }
    }

    return {
      topic: cleanTopic,
      pages: buildTemplatePlanFromUrl(pageData, count),
      sourceImages,
      note: `서버에 ANTHROPIC_API_KEY가 없어서, 원문 링크에서 실제로 가져온 문장으로 대본을 채웠습니다(창작이 아닙니다).${imageNote}`,
    };
  }

  const cleanTopic = (topic || "").trim();
  if (!cleanTopic) throw new Error("주제를 입력하거나 링크를 넣어주세요.");

  if (writerConfigured()) {
    try {
      const pages = await callClaudeForPlan(cleanTopic, count);
      return {
        topic: cleanTopic,
        pages,
        note: "Claude API로 실제 문장을 생성한 대본입니다. ✏️ 표시된 부분은 실시간/구체적 사실을 확인한 뒤 채워주세요.",
      };
    } catch (err) {
      console.error("[cardNewsGenerator] Claude API 호출 실패, 템플릿으로 대체합니다:", err.message);
      return {
        topic: cleanTopic,
        pages: buildTemplatePlan(cleanTopic, count),
        note: `Claude API 호출에 실패해서(${err.message}) 대신 '빈칸만 채우면 되는 대본 틀'로 만들었습니다.`,
      };
    }
  }

  return {
    topic: cleanTopic,
    pages: buildTemplatePlan(cleanTopic, count),
    note: "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않아서, 실제 문장 대신 '빈칸만 채우면 되는 대본 틀'을 만들었습니다. README를 참고해 Claude API 키를 등록하면 실제 문장으로 채워집니다.",
  };
}

// ===================== 2) 페이지 하나를 실제 PNG 이미지로 렌더링 =====================

// 사진이 없을 때: 스타일의 그라디언트만으로 배경을 만듭니다.
function gradientBackgroundSvg(style, w, h) {
  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${style.bgFrom}" />
          <stop offset="100%" stop-color="${style.bgTo}" />
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bg)" />
    </svg>`);
}

// images 배열의 각 자리는 셋 중 하나입니다: null(사진 없음), 로컬 업로드 파일 경로,
// 또는 스톡 사진 검색에서 고른 원격 이미지 URL(http로 시작). sharp는 로컬 경로/Buffer를
// 똑같이 받을 수 있어서, URL이면 여기서 미리 내려받아 Buffer로 바꿔주기만 하면 됩니다.
async function resolveImageInput(imageInput) {
  if (!imageInput) return null;
  if (!/^https?:\/\//i.test(imageInput)) return imageInput; // 로컬 업로드 파일 경로는 그대로 반환
  const res = await fetch(imageInput, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; woosurimi-trend-api/1.0)" },
  });
  if (!res.ok) throw new Error(`배경 사진을 가져오지 못했습니다 (상태 코드 ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

// 사진이 있을 때: 캔버스에 꽉 차게(cover) 크롭한 뒤, 텍스트가 잘 보이도록 스타일의
// scrim(반투명 색) 레이어를 위에 한 겹 더 깔아줍니다.
//
// applyScrim=false로 끌 수 있게 한 이유: "포스터 프레임형" 레이아웃은 하단에만
// 자기 전용 어두운 그라디언트 스크림을 이미 깔기 때문에(buildFramedOverlay 참고),
// 여기서 카드 전체에 스타일 스크림까지 겹치면(특히 크림/파스텔처럼 밝고 진한
// 스크림 팔레트일 때) 사진 전체가 뿌옇게 바래 보입니다. 실제 스톡 사진으로
// 렌더링해보고 나서 발견해서 고쳤습니다.
async function photoBackgroundBuffer(imagePath, style, w, h, applyScrim = true) {
  const cropped = await sharp(imagePath).resize(w, h, { fit: "cover", position: "attention" }).png().toBuffer();
  if (!applyScrim) return cropped;
  const scrimSvg = Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="${style.scrim}" />
    </svg>`);
  return sharp(cropped).composite([{ input: scrimSvg, top: 0, left: 0 }]).png().toBuffer();
}

// 아래 4개의 build*Overlay 함수가 각 레이아웃의 실제 그리기 로직입니다. 전부 같은
// 시그니처(page, style, w, h, pageIndex, totalPages, topic)를 받아 SVG 오버레이
// Buffer를 돌려줍니다. 텍스트는 전부 위쪽의 glyphPaths/alignedText/multilineText로
// 그립니다(시스템 폰트에 의존하지 않는 벡터 path 방식).

// [기본] 스택형 — 제목/본문을 role에 따라 위/중앙/왼쪽에 쌓아 올리는 기존 레이아웃.
function buildStackOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const pad = Math.round(w * 0.09);
  const isCover = page.role === "cover";
  const isOutro = page.role === "outro";
  const maxTextWidth = w - pad * 2;

  const titleSize = isCover ? Math.round(w * 0.09) : Math.round(w * 0.058);
  const bodySize = isCover ? Math.round(w * 0.04) : Math.round(w * 0.038);

  const titleLines = wrapByWidth(page.title, titleSize, maxTextWidth);
  const bodyLines = wrapByWidthCapped(page.body, bodySize, maxTextWidth, 8); // 카드 한 장을 넘치게 채우지 않도록 상한

  const titleLineHeight = Math.round(titleSize * 1.28);
  const bodyLineHeight = Math.round(bodySize * 1.55);

  let titleY;
  let bodyY;
  let titleAnchor = "start";
  let titleX = pad;
  const gap = Math.round(h * 0.035);
  const blockHeight = titleLines.length * titleLineHeight + gap + bodyLines.length * bodyLineHeight;

  if (isCover) {
    // 커버는 화면 세로 중앙 부근에 큼직하게, 부제는 바로 아래
    titleY = Math.round(h * 0.46);
    bodyY = titleY + titleLines.length * titleLineHeight + gap;
  } else if (isOutro) {
    // 아웃트로는 중앙 정렬로 정리하는 느낌
    titleAnchor = "middle";
    titleX = Math.round(w / 2);
    titleY = Math.round(h * 0.42);
    bodyY = titleY + titleLines.length * titleLineHeight + gap;
  } else {
    // 콘텐츠 장: 본문이 짧아도 화면 아래쪽이 휑하게 비지 않도록, 제목+본문 덩어리를
    // 화면 상단 22%~85% 사이 영역 안에서 세로 중앙 정렬합니다(내용이 길면 자연히
    // 위에서부터 채워집니다).
    const zoneTop = Math.round(h * 0.22);
    const zoneBottom = Math.round(h * 0.85);
    const zoneHeight = zoneBottom - zoneTop;
    const centeredTop = zoneTop + Math.max(0, (zoneHeight - blockHeight) / 2);
    titleY = Math.round(centeredTop + titleLineHeight * 0.85);
    bodyY = titleY + titleLines.length * titleLineHeight + gap;
  }

  const bodyX = isOutro ? Math.round(w / 2) : pad;
  const bodyAnchor = isOutro ? "middle" : "start";

  // 상단 카테고리 태그(필과 accentColor로 알약 모양). 실제 폰트 폭(measureText)으로
  // 정확히 재서, 텍스트가 알약 밖으로 삐져나오지 않게 합니다.
  const tagText = topic.length > 14 ? topic.slice(0, 14) + "…" : topic;
  const tagFontSize = Math.round(w * 0.026);
  const tagPaddingX = Math.round(tagFontSize * 0.9);
  const tagWidth = Math.round(measureText(tagText, tagFontSize)) + tagPaddingX * 2;
  const tagHeight = Math.round(tagFontSize * 2.1);
  const tagY = Math.round(h * 0.07);

  const footerText = `${pageIndex + 1} / ${totalPages}`;
  const footerSize = Math.round(w * 0.028);

  // 콘텐츠 장 배경에 큼직한 반투명 순번 숫자를 깔아서(제목/본문 뒤쪽) 빈 여백을
  // 채우고 카드뉴스다운 디자인 포인트를 줍니다.
  const ghostNumber =
    !isCover && !isOutro
      ? alignedText(String(pageIndex), w - pad * 0.6, h - Math.round(h * 0.08), Math.round(w * 0.34), style.accentColor, {
          anchor: "end",
          opacity: 0.12,
        })
      : "";

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${ghostNumber}
      <rect x="${pad}" y="${tagY}" rx="${tagHeight / 2}" ry="${tagHeight / 2}" width="${tagWidth}" height="${tagHeight}" fill="${style.accentColor}" opacity="0.92" />
      ${alignedText(tagText, pad + tagPaddingX, tagY + tagHeight * 0.68, tagFontSize, "#ffffff")}
      ${multilineText(titleLines, titleX, titleY, titleLineHeight, titleSize, style.titleColor, { anchor: titleAnchor })}
      ${multilineText(bodyLines, bodyX, bodyY, bodyLineHeight, bodySize, style.bodyColor, { anchor: bodyAnchor })}
      ${alignedText(footerText, w - pad, h - Math.round(h * 0.05), footerSize, style.bodyColor, { anchor: "end", opacity: 0.8 })}
    </svg>`);
}

// [배너형] 상단에 accentColor 띠(배너)를 깔고 그 안에 제목을, 띠 아래 여백에 본문을 둡니다.
// 팔레트마다 accentColor 밝기가 달라서, 띠 위 글자색은 pickContrastText로 자동 결정합니다.
function buildBannerOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const pad = Math.round(w * 0.08);
  const isCover = page.role === "cover";
  const isOutro = page.role === "outro";
  const maxTextWidth = w - pad * 2;

  const bandHeight = Math.round(h * (isCover ? 0.42 : isOutro ? 0.3 : 0.32));
  const bandTextColor = pickContrastText(style.accentColor);

  const titleSize = isCover ? Math.round(w * 0.08) : Math.round(w * 0.062);
  const titleLines = wrapByWidth(page.title, titleSize, maxTextWidth);
  const titleLineHeight = Math.round(titleSize * 1.25);
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleY = Math.round((bandHeight - titleBlockHeight) / 2 + titleLineHeight * 0.8);

  const bodySize = Math.round(w * 0.04);
  const bodyLines = wrapByWidthCapped(page.body, bodySize, maxTextWidth, 7);
  const bodyLineHeight = Math.round(bodySize * 1.6);
  const bodyZoneTop = bandHeight + Math.round(h * 0.06);
  const bodyZoneBottom = h - Math.round(h * 0.1);
  const bodyBlockHeight = bodyLines.length * bodyLineHeight;
  const bodyY = Math.round(bodyZoneTop + Math.max(0, (bodyZoneBottom - bodyZoneTop - bodyBlockHeight) / 2) + bodyLineHeight * 0.85);

  const footerText = `${pageIndex + 1} / ${totalPages}`;
  const footerSize = Math.round(w * 0.026);
  const topicTag = topic.length > 16 ? topic.slice(0, 16) + "…" : topic;

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${w}" height="${bandHeight}" fill="${style.accentColor}" />
      ${multilineText(titleLines, pad, titleY, titleLineHeight, titleSize, bandTextColor)}
      ${multilineText(bodyLines, pad, bodyY, bodyLineHeight, bodySize, style.bodyColor)}
      ${alignedText(topicTag, pad, h - Math.round(h * 0.045), footerSize, style.accentColor, { opacity: 0.9 })}
      ${alignedText(footerText, w - pad, h - Math.round(h * 0.045), footerSize, style.bodyColor, { anchor: "end", opacity: 0.7 })}
    </svg>`);
}

// [에디토리얼 센터형] 제목·본문을 화면 정중앙에 정렬하고, 가운데에 짧은 구분선을 둔
// 매거진 스타일. 하단의 점(dot) 줄이 페이지 번호 대신 진행 상태를 보여줍니다.
function buildEditorialCenterOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const isCover = page.role === "cover";
  const cx = Math.round(w / 2);
  const pad = Math.round(w * 0.12);
  const maxTextWidth = w - pad * 2;

  const titleSize = isCover ? Math.round(w * 0.085) : Math.round(w * 0.065);
  const titleLines = wrapByWidth(page.title, titleSize, maxTextWidth);
  const titleLineHeight = Math.round(titleSize * 1.3);

  const bodySize = Math.round(w * 0.036);
  const bodyLines = wrapByWidthCapped(page.body, bodySize, maxTextWidth, 6);
  const bodyLineHeight = Math.round(bodySize * 1.6);

  const dividerY = Math.round(h * 0.5);
  const gapAboveDivider = Math.round(h * 0.04);
  const titleY = dividerY - gapAboveDivider - (titleLines.length - 1) * titleLineHeight;
  const bodyY = dividerY + Math.round(h * 0.075);
  const dividerWidth = Math.round(w * 0.14);

  const dotSpacing = Math.round(w * 0.028);
  const dotRadius = Math.round(w * 0.007);
  const dotsStartX = cx - ((totalPages - 1) * dotSpacing) / 2;
  const dots = Array.from({ length: totalPages })
    .map(
      (_, i) =>
        `<circle cx="${Math.round(dotsStartX + i * dotSpacing)}" cy="${h - Math.round(h * 0.06)}" r="${dotRadius}" fill="${style.accentColor}" opacity="${i === pageIndex ? 1 : 0.25}" />`
    )
    .join("");

  const handleText = `# ${topic}`.slice(0, 22);

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${multilineText(titleLines, cx, titleY, titleLineHeight, titleSize, style.titleColor, { anchor: "middle" })}
      <rect x="${cx - dividerWidth / 2}" y="${dividerY}" width="${dividerWidth}" height="3" fill="${style.accentColor}" />
      ${multilineText(bodyLines, cx, bodyY, bodyLineHeight, bodySize, style.bodyColor, { anchor: "middle" })}
      ${alignedText(handleText, cx, Math.round(h * 0.92), Math.round(w * 0.026), style.bodyColor, { anchor: "middle", opacity: 0.7 })}
      ${dots}
    </svg>`);
}

// [포스터 프레임형] 카드 테두리에 얇은 프레임을 두르고, 제목을 화면 하단에 크게 앉히는
// 포스터 스타일. 사진/그라디언트 어떤 배경 위에서도 글자가 잘 보이도록 하단에 항상
// 어두운 그라디언트 스크림을 깔고 흰 글자를 씁니다.
function buildFramedOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const pad = Math.round(w * 0.09);
  const frameInset = Math.round(w * 0.035);
  const isCover = page.role === "cover";
  const maxTextWidth = w - pad * 2;

  const chipSize = Math.round(w * 0.09);
  const chipX = frameInset + Math.round(w * 0.02);
  const chipY = frameInset + Math.round(w * 0.02);
  const chipTextColor = pickContrastText(style.accentColor);

  const titleSize = isCover ? Math.round(w * 0.095) : Math.round(w * 0.07);
  const titleLines = wrapByWidthCapped(page.title, titleSize, maxTextWidth, 4);
  const titleLineHeight = Math.round(titleSize * 1.22);

  // 본문이 3~5문장(콘텐츠 장 기준)까지 나올 수 있어서, 3줄까지만 허용하면 마지막
  // 문장이 자주 통째로 잘려나갔습니다(예: "...중요해요." 소실). 6줄까지 넉넉히
  // 허용하고, 그만큼 아래쪽 여백(bottomPad)을 줄여서 카드 안에 다 들어오게 합니다.
  const bodySize = Math.round(w * 0.033);
  const bodyLines = wrapByWidthCapped(page.body, bodySize, maxTextWidth, 6);
  const bodyLineHeight = Math.round(bodySize * 1.55);

  const bottomPad = Math.round(h * 0.06);
  const bodyBlockHeight = bodyLines.length * bodyLineHeight;
  const bodyY = h - bottomPad - bodyBlockHeight + bodyLineHeight * 0.85;
  const titleGap = Math.round(h * 0.025);
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleY = bodyY - bodyLineHeight * 0.85 - titleGap - titleBlockHeight + titleLineHeight * 0.85;
  const scrimHeight = Math.round(h * 0.42);

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bottomScrim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="${frameInset}" y="${frameInset}" width="${w - frameInset * 2}" height="${h - frameInset * 2}" fill="none" stroke="${style.accentColor}" stroke-width="${Math.round(w * 0.006)}" />
      <rect x="0" y="${h - scrimHeight}" width="${w}" height="${scrimHeight}" fill="url(#bottomScrim)" />
      <rect x="${chipX}" y="${chipY}" width="${chipSize}" height="${chipSize}" fill="${style.accentColor}" />
      ${alignedText(String(pageIndex + 1), chipX + chipSize / 2, chipY + chipSize * 0.68, Math.round(chipSize * 0.5), chipTextColor, { anchor: "middle" })}
      ${multilineText(titleLines, pad, titleY, titleLineHeight, titleSize, "#ffffff")}
      ${multilineText(bodyLines, pad, bodyY, bodyLineHeight, bodySize, "#eaeaea")}
    </svg>`);
}

const LAYOUT_BUILDERS = {
  stack: buildStackOverlay,
  banner: buildBannerOverlay,
  "editorial-center": buildEditorialCenterOverlay,
  framed: buildFramedOverlay,
};

function buildOverlaySvg(page, style, layoutId, w, h, pageIndex, totalPages, topic) {
  const builder = LAYOUT_BUILDERS[layoutId] || buildStackOverlay;
  return builder(page, style, w, h, pageIndex, totalPages, topic);
}

/**
 * page: { role, title, body }
 * imagePath: (선택) 로컬 이미지 파일 경로 또는 원격 이미지 URL — 있으면 배경 사진으로 씀
 * 반환: PNG 버퍼
 */
async function renderCardImage({ page, style, layoutId, ratio, pageIndex, totalPages, topic, imagePath }) {
  const { w, h } = ASPECT_RATIOS[ratio] || ASPECT_RATIOS["4:5"];
  const resolvedInput = await resolveImageInput(imagePath);
  // 포스터 프레임형은 자체 하단 스크림이 있어서 스타일 스크림을 겹치지 않습니다(위 주석 참고).
  const bg = resolvedInput
    ? await photoBackgroundBuffer(resolvedInput, style, w, h, layoutId !== "framed")
    : gradientBackgroundSvg(style, w, h);
  const overlay = buildOverlaySvg(page, style, layoutId, w, h, pageIndex, totalPages, topic);
  return sharp(bg).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}

// 예시 문장 하나로 레이아웃×팔레트 조합을 실제로 렌더링해서 보여주는 미리보기용입니다.
// 사용자가 옵션을 고를 때마다(대본을 아직 안 만든 시점에도) 실제 결과물이 어떻게
// 생기는지 바로 확인할 수 있게, 파일로 저장하지 않고 PNG 버퍼만 즉시 돌려줍니다.
const PREVIEW_SAMPLE_PAGE = {
  role: "content",
  title: "카드뉴스 제목 예시",
  body: "이렇게 본문 내용이 들어가는 느낌이에요. 실제 대본을 만들면 이 자리에 진짜 내용이 채워져요.",
};

async function renderPreviewBuffer({ styleId = "midnight-purple", layoutId = "stack", ratio = "4:5" } = {}) {
  const style = getStyle(styleId);
  const layout = getLayout(layoutId);
  return renderCardImage({
    page: PREVIEW_SAMPLE_PAGE,
    style,
    layoutId: layout.id,
    ratio,
    pageIndex: 0,
    totalPages: 1,
    topic: "예시 주제",
    imagePath: null,
  });
}

/**
 * plan: { topic, pages: [{role,title,body}] } — generatePlan()의 결과(사용자가 수정했을 수도 있음)
 * options.styleId, options.layoutId, options.ratio
 * options.images: (선택) 페이지 순서에 맞춘 배경 소스 배열 — 각 자리는 null(그라디언트 배경),
 *   로컬 업로드 파일 경로, 또는 스톡 사진 URL(http로 시작)
 * 반환: { jobId, ratio, styleId, layoutId, pages: [{ index, url }] }
 */
async function renderCardNewsSet(plan, { styleId = "midnight-purple", layoutId = "stack", ratio = "4:5", images = [] } = {}) {
  if (!plan || !Array.isArray(plan.pages) || !plan.pages.length) {
    throw new Error("먼저 대본(plan)을 만들어 주세요.");
  }
  if (!ASPECT_RATIOS[ratio]) ratio = "4:5";
  const style = getStyle(styleId);
  const layout = getLayout(layoutId);

  const jobId = crypto.randomUUID();
  const outDir = path.join(RENDERS_DIR, jobId);
  fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (let i = 0; i < plan.pages.length; i++) {
    const buf = await renderCardImage({
      page: plan.pages[i],
      style,
      layoutId: layout.id,
      ratio,
      pageIndex: i,
      totalPages: plan.pages.length,
      topic: plan.topic || "",
      imagePath: images[i] || null,
    });
    const fileName = `page${i + 1}.png`;
    fs.writeFileSync(path.join(outDir, fileName), buf);
    results.push({ index: i, url: `/renders/cardnews/${jobId}/${fileName}` });
  }

  return { jobId, ratio, styleId: style.id, layoutId: layout.id, pages: results };
}

module.exports = {
  // ⚠️ 글자를 SVG path로 그리는 함수들입니다. 썸네일 만들 때도 같은 폰트·같은 방식이
  // 필요해서 내보냅니다. 각자 폰트를 따로 불러오면 언젠가 서로 어긋납니다.
  measureText,
  glyphPaths,
  alignedText,
  wrapByWidth,
  getStyles,
  getLayouts,
  getAspectRatios,
  recommendStyles,
  getGeneratorStatus,
  generatePlan,
  renderPreviewBuffer,
  renderCardNewsSet,
};
