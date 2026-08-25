// "AI 카드뉴스 생성" 기능입니다. 주제를 넣으면 Claude API로 페이지별 제목/본문을 짜고,
// sharp(SVG 오버레이 방식)로 각 페이지를 실제 PNG 카드 이미지로 렌더링합니다.
//
// 렌더링 방식: ffmpeg-static 빌드에는 drawtext 필터가 없어서(videoRenderer.js 참고)
// 영상 자막은 libass(subtitles 필터)로 우회했지만, 카드뉴스는 제목/본문/뱃지처럼
// 레이아웃이 복잡해서 자막 필터로는 한계가 있습니다. 대신 sharp가 쓰는 librsvg로
// SVG를 직접 그려서 PNG로 뽑습니다 — 프로젝트에 있는 한글 폰트 하나(NotoSansKR-Bold)를
// base64로 SVG에 직접 embed해서, 서버 OS에 폰트가 따로 설치되어 있지 않아도 항상
// 같은 모양으로 렌더링되게 했습니다(로컬에서 실제로 렌더 테스트 후 확인함).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const claudeClient = require("./claudeClient");

const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const FONT_B64 = fs.readFileSync(FONT_PATH).toString("base64");
const FONT_FAMILY = "WoosurimiCardFont";
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

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 실제 폰트 메트릭 없이 글자 수 기준으로 줄바꿈합니다(videoRenderer.js의
// wrapCaptionLines와 같은 방식 — 이 프로젝트 전체에서 쓰는 근사치 줄바꿈 규칙).
function wrapByChars(text, maxCharsPerLine) {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// wrapByChars + 줄 수 상한. 원래는 그냥 slice(0, maxLines)로 잘랐는데, 그러면 마지막
// 줄이 통째로 사라져도 화면에 아무 표시가 없어서(예: "…중요해요." 문장이 조용히
// 없어짐) 사용자가 카드 이미지를 다운로드하기 전까진 눈치채기 어려웠습니다. 잘렸으면
// 마지막 줄 끝에 "…"을 붙여서 최소한 "여기서 더 있다"는 걸 알 수 있게 합니다.
function wrapByCharsCapped(text, maxCharsPerLine, maxLines) {
  const lines = wrapByChars(text, maxCharsPerLine);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = last.endsWith("…") ? last : `${last.replace(/[.,!?~]+$/, "")}…`;
  return kept;
}

function tspanLines(lines, x, startDy, lineHeight) {
  return lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? startDy : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
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

/**
 * topic: 카드뉴스 주제(필수)
 * pageCount: 3~8 (기본 6)
 * 반환: { pages: [{role,title,body}], note }
 */
async function generatePlan({ topic, pageCount = 6 } = {}) {
  const cleanTopic = (topic || "").trim();
  if (!cleanTopic) throw new Error("주제를 입력해 주세요.");
  const count = Math.min(Math.max(Number(pageCount) || 6, 3), 8);

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
async function photoBackgroundBuffer(imagePath, style, w, h) {
  const cropped = await sharp(imagePath).resize(w, h, { fit: "cover", position: "attention" }).png().toBuffer();
  const scrimSvg = Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="${style.scrim}" />
    </svg>`);
  return sharp(cropped).composite([{ input: scrimSvg, top: 0, left: 0 }]).png().toBuffer();
}

// 아래 4개의 build*Overlay 함수가 각 레이아웃의 실제 그리기 로직입니다. 전부 같은
// 시그니처(page, style, w, h, pageIndex, totalPages, topic)를 받아 SVG 오버레이
// Buffer를 돌려줍니다 — @font-face 임베드 부분만 공통으로 뽑아서 재사용합니다.
function fontFaceStyle() {
  return `
        @font-face {
          font-family: '${FONT_FAMILY}';
          src: url(data:font/ttf;base64,${FONT_B64}) format('truetype');
        }
        text { font-family: '${FONT_FAMILY}'; }`;
}

// [기본] 스택형 — 제목/본문을 role에 따라 위/중앙/왼쪽에 쌓아 올리는 기존 레이아웃.
function buildStackOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const pad = Math.round(w * 0.09);
  const isCover = page.role === "cover";
  const isOutro = page.role === "outro";

  const titleSize = isCover ? Math.round(w * 0.09) : Math.round(w * 0.058);
  const bodySize = isCover ? Math.round(w * 0.04) : Math.round(w * 0.038);
  const titleMaxChars = isCover ? 9 : 12;
  const bodyMaxChars = 17;

  const titleLines = wrapByChars(page.title, titleMaxChars);
  const bodyLines = wrapByCharsCapped(page.body, bodyMaxChars, 8); // 카드 한 장을 넘치게 채우지 않도록 상한

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
  const maxTextWidth = w - pad * 2;

  // 상단 카테고리 태그(필과 accentColor로 알약 모양). 한글은 폭이 거의 정사각형이라
  // (라틴 알파벳보다 넓음) 글자당 폭을 넉넉하게(0.98 * fontSize) 잡아서 텍스트가
  // 알약 밖으로 삐져나오지 않게 합니다.
  const tagText = topic.length > 14 ? topic.slice(0, 14) + "…" : topic;
  const tagFontSize = Math.round(w * 0.026);
  const tagPaddingX = Math.round(tagFontSize * 0.9);
  const tagWidth = Math.round(tagText.length * tagFontSize * 0.98) + tagPaddingX * 2;
  const tagHeight = Math.round(tagFontSize * 2.1);
  const tagY = Math.round(h * 0.07);

  const footerText = `${pageIndex + 1} / ${totalPages}`;
  const footerSize = Math.round(w * 0.028);

  // 콘텐츠 장 배경에 큼직한 반투명 순번 숫자를 깔아서(제목/본문 뒤쪽) 빈 여백을
  // 채우고 카드뉴스다운 디자인 포인트를 줍니다.
  const ghostNumber =
    !isCover && !isOutro
      ? `<text x="${w - pad * 0.6}" y="${h - Math.round(h * 0.08)}" font-size="${Math.round(w * 0.34)}" font-weight="bold" fill="${style.accentColor}" opacity="0.12" text-anchor="end">${pageIndex}</text>`
      : "";

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <style>
        @font-face {
          font-family: '${FONT_FAMILY}';
          src: url(data:font/ttf;base64,${FONT_B64}) format('truetype');
        }
        text { font-family: '${FONT_FAMILY}'; }
      </style>
      ${ghostNumber}
      <rect x="${pad}" y="${tagY}" rx="${tagHeight / 2}" ry="${tagHeight / 2}" width="${tagWidth}" height="${tagHeight}" fill="${style.accentColor}" opacity="0.92" />
      <text x="${pad + tagPaddingX}" y="${tagY + tagHeight * 0.68}" font-size="${tagFontSize}" fill="#ffffff">${escapeXml(tagText)}</text>

      <text x="${titleX}" y="${titleY}" font-size="${titleSize}" font-weight="bold" fill="${style.titleColor}" text-anchor="${titleAnchor}" style="max-width:${maxTextWidth}px">
        ${tspanLines(titleLines, titleX, 0, titleLineHeight)}
      </text>

      <text x="${bodyX}" y="${bodyY}" font-size="${bodySize}" fill="${style.bodyColor}" text-anchor="${bodyAnchor}">
        ${tspanLines(bodyLines, bodyX, 0, bodyLineHeight)}
      </text>

      <text x="${w - pad}" y="${h - Math.round(h * 0.05)}" font-size="${footerSize}" fill="${style.bodyColor}" text-anchor="end" opacity="0.8">${escapeXml(footerText)}</text>
    </svg>`);
}

// [배너형] 상단에 accentColor 띠(배너)를 깔고 그 안에 제목을, 띠 아래 여백에 본문을 둡니다.
// 팔레트마다 accentColor 밝기가 달라서, 띠 위 글자색은 pickContrastText로 자동 결정합니다.
function buildBannerOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const pad = Math.round(w * 0.08);
  const isCover = page.role === "cover";
  const isOutro = page.role === "outro";

  const bandHeight = Math.round(h * (isCover ? 0.42 : isOutro ? 0.3 : 0.32));
  const bandTextColor = pickContrastText(style.accentColor);

  const titleSize = isCover ? Math.round(w * 0.08) : Math.round(w * 0.062);
  const titleLines = wrapByChars(page.title, isCover ? 10 : 11);
  const titleLineHeight = Math.round(titleSize * 1.25);
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleY = Math.round((bandHeight - titleBlockHeight) / 2 + titleLineHeight * 0.8);

  const bodySize = Math.round(w * 0.04);
  const bodyLines = wrapByCharsCapped(page.body, 17, 7);
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
      <style>${fontFaceStyle()}</style>
      <rect x="0" y="0" width="${w}" height="${bandHeight}" fill="${style.accentColor}" />
      <text x="${pad}" y="${titleY}" font-size="${titleSize}" font-weight="bold" fill="${bandTextColor}">
        ${tspanLines(titleLines, pad, 0, titleLineHeight)}
      </text>
      <text x="${pad}" y="${bodyY}" font-size="${bodySize}" fill="${style.bodyColor}">
        ${tspanLines(bodyLines, pad, 0, bodyLineHeight)}
      </text>
      <text x="${pad}" y="${h - Math.round(h * 0.045)}" font-size="${footerSize}" fill="${style.accentColor}" opacity="0.9">${escapeXml(topicTag)}</text>
      <text x="${w - pad}" y="${h - Math.round(h * 0.045)}" font-size="${footerSize}" fill="${style.bodyColor}" text-anchor="end" opacity="0.7">${escapeXml(footerText)}</text>
    </svg>`);
}

// [에디토리얼 센터형] 제목·본문을 화면 정중앙에 정렬하고, 가운데에 짧은 구분선을 둔
// 매거진 스타일. 하단의 점(dot) 줄이 페이지 번호 대신 진행 상태를 보여줍니다.
function buildEditorialCenterOverlay(page, style, w, h, pageIndex, totalPages, topic) {
  const isCover = page.role === "cover";
  const cx = Math.round(w / 2);

  const titleSize = isCover ? Math.round(w * 0.085) : Math.round(w * 0.065);
  const titleLines = wrapByChars(page.title, isCover ? 8 : 9);
  const titleLineHeight = Math.round(titleSize * 1.3);

  const bodySize = Math.round(w * 0.036);
  const bodyLines = wrapByCharsCapped(page.body, 15, 6);
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
      <style>${fontFaceStyle()}</style>
      <text x="${cx}" y="${titleY}" font-size="${titleSize}" font-weight="bold" fill="${style.titleColor}" text-anchor="middle">
        ${tspanLines(titleLines, cx, 0, titleLineHeight)}
      </text>
      <rect x="${cx - dividerWidth / 2}" y="${dividerY}" width="${dividerWidth}" height="3" fill="${style.accentColor}" />
      <text x="${cx}" y="${bodyY}" font-size="${bodySize}" fill="${style.bodyColor}" text-anchor="middle">
        ${tspanLines(bodyLines, cx, 0, bodyLineHeight)}
      </text>
      <text x="${cx}" y="${Math.round(h * 0.92)}" font-size="${Math.round(w * 0.026)}" fill="${style.bodyColor}" text-anchor="middle" opacity="0.7">${escapeXml(handleText)}</text>
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

  const chipSize = Math.round(w * 0.09);
  const chipX = frameInset + Math.round(w * 0.02);
  const chipY = frameInset + Math.round(w * 0.02);
  const chipTextColor = pickContrastText(style.accentColor);

  const titleSize = isCover ? Math.round(w * 0.095) : Math.round(w * 0.07);
  const titleLines = wrapByCharsCapped(page.title, isCover ? 8 : 10, 4);
  const titleLineHeight = Math.round(titleSize * 1.22);

  // 본문이 3~5문장(콘텐츠 장 기준)까지 나올 수 있어서, 3줄까지만 허용하면 마지막
  // 문장이 자주 통째로 잘려나갔습니다(예: "...중요해요." 소실). 6줄까지 넉넉히
  // 허용하고, 그만큼 아래쪽 여백(bottomPad)을 줄여서 카드 안에 다 들어오게 합니다.
  const bodySize = Math.round(w * 0.033);
  const bodyLines = wrapByCharsCapped(page.body, 19, 6);
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
      <style>${fontFaceStyle()}</style>
      <rect x="${frameInset}" y="${frameInset}" width="${w - frameInset * 2}" height="${h - frameInset * 2}" fill="none" stroke="${style.accentColor}" stroke-width="${Math.round(w * 0.006)}" />
      <rect x="0" y="${h - scrimHeight}" width="${w}" height="${scrimHeight}" fill="url(#bottomScrim)" />
      <rect x="${chipX}" y="${chipY}" width="${chipSize}" height="${chipSize}" fill="${style.accentColor}" />
      <text x="${chipX + chipSize / 2}" y="${chipY + chipSize * 0.68}" font-size="${Math.round(chipSize * 0.5)}" font-weight="bold" fill="${chipTextColor}" text-anchor="middle">${pageIndex + 1}</text>
      <text x="${pad}" y="${titleY}" font-size="${titleSize}" font-weight="bold" fill="#ffffff">
        ${tspanLines(titleLines, pad, 0, titleLineHeight)}
      </text>
      <text x="${pad}" y="${bodyY}" font-size="${bodySize}" fill="#eaeaea">
        ${tspanLines(bodyLines, pad, 0, bodyLineHeight)}
      </text>
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
  const bg = resolvedInput ? await photoBackgroundBuffer(resolvedInput, style, w, h) : gradientBackgroundSvg(style, w, h);
  const overlay = buildOverlaySvg(page, style, layoutId, w, h, pageIndex, totalPages, topic);
  return sharp(bg).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
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
  getStyles,
  getLayouts,
  getAspectRatios,
  recommendStyles,
  getGeneratorStatus,
  generatePlan,
  renderCardNewsSet,
};
