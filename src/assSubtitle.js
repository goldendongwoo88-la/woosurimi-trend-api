// 자막 파일을 .ass 형식으로 만듭니다.
//
// ⚠️ 왜 .srt에서 .ass로 바꿨는가
//
// 핵심 단어만 색을 바꾸는 게 요즘 한국 숏폼의 가장 큰 특징인데, .srt로는 그게 안 됩니다.
// .srt에 {\c&H0000E0FF&} 같은 색 태그를 넣어봐도 ffmpeg의 subrip 디코더가 중괄호를
// 이스케이프해 버려서 그냥 사라집니다(실제로 렌더해서 확인했습니다 — 태그가 화면에
// 찍히지도 않고 색도 안 바뀌었습니다).
//
// .ass는 그 태그가 원래 자기 문법이라 그대로 먹습니다. 대신 스타일을 파일 안에
// 직접 써야 해서, 기존 force_style 문자열을 파싱해 스타일 줄로 옮깁니다.
//
// ⚠️ 해상도를 288로 맞춘 이유
// ffmpeg가 .srt를 .ass로 바꿀 때 PlayResY를 288로 잡습니다. 지금 템플릿의 글자
// 크기·여백 숫자는 전부 그 기준으로 실측해서 정한 값입니다. 우리가 직접 .ass를
// 만들면서 해상도를 바꾸면 그 숫자들이 전부 어긋납니다. 그래서 똑같이 288로 두고
// 가로만 비율에 맞춥니다. 이렇게 하면 기존 숫자를 하나도 안 건드려도 됩니다.

const PLAY_RES_Y = 288;

/** force_style 문자열("A=1,B=2")을 객체로. */
function parseStyle(s) {
  const out = {};
  for (const part of String(s || "").split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/**
 * ASS 스타일 한 줄을 만듭니다.
 *
 * ⚠️ 정렬 번호가 형식마다 다릅니다.
 * [V4 Styles](구식 SSA)는 1~3=하단, 5~7=상단이고,
 * [V4+ Styles](ASS)는 넘패드 배치라 2=하단중앙, 8=상단중앙입니다.
 * 기존 코드는 ffmpeg가 만들어주는 파일에 얹는 방식이라 6=상단중앙이었는데,
 * 우리가 직접 [V4+]로 쓰면 8이 상단중앙입니다. 그래서 여기서 옮겨줍니다.
 */
const SSA_TO_ASS_ALIGN = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 };

function styleLine(name, forceStyle, fallback = {}) {
  const s = { ...fallback, ...parseStyle(forceStyle) };

  const rawAlign = Number(s.Alignment || 2);
  const align = SSA_TO_ASS_ALIGN[rawAlign] || rawAlign;

  const f = [
    name,                                   // Name
    s.FontName || "Sans",                   // Fontname
    s.FontSize || 12,                       // Fontsize
    s.PrimaryColour || "&H00FFFFFF",        // PrimaryColour
    s.SecondaryColour || "&H000000FF",      // SecondaryColour
    s.OutlineColour || "&H00000000",        // OutlineColour
    s.BackColour || "&H00000000",           // BackColour
    s.Bold || 0,                            // Bold
    s.Italic || 0,                          // Italic
    s.Underline || 0,                       // Underline
    s.StrikeOut || 0,                       // StrikeOut
    s.ScaleX || 100,                        // ScaleX
    s.ScaleY || 100,                        // ScaleY
    s.Spacing || 0,                         // Spacing
    s.Angle || 0,                           // Angle
    s.BorderStyle || 1,                     // BorderStyle
    s.Outline != null ? s.Outline : 1,      // Outline
    s.Shadow != null ? s.Shadow : 0,        // Shadow
    align,                                  // Alignment
    s.MarginL || 12,                        // MarginL
    s.MarginR || 12,                        // MarginR
    s.MarginV || 20,                        // MarginV
    s.Encoding || 1,                        // Encoding
  ];
  return `Style: ${f.join(",")}`;
}

/** 0.0초 → 0:00:00.00 (ASS는 소수점 두 자리까지) */
function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

/**
 * ⚠️ ASS에서 줄바꿈은 \N 입니다(대문자 N). 실제 개행 문자를 그대로 넣으면
 * 그 줄이 통째로 무시됩니다. 자막이 아예 안 나오는 원인이 되기 쉽습니다.
 */
function assText(s) {
  return String(s == null ? "" : s).replace(/\r/g, "").replace(/\n/g, "\\N");
}

/**
 * 자막 파일 하나를 만듭니다.
 *
 * @param {object} p
 * @param {number} p.width  영상 가로 (해상도 비율 맞추는 데만 씁니다)
 * @param {number} p.height 영상 세로
 * @param {Array<{name, forceStyle}>} p.styles
 * @param {Array<{start, end, style, text}>} p.events
 */
function buildAss({ width, height, styles, events }) {
  const playResX = Math.round(PLAY_RES_Y * (width / height));

  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${PLAY_RES_Y}`,
    // 0 = 위쪽 줄이 더 길게 감싸기. 자동 줄바꿈이 어색해지는 걸 줄입니다.
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, " +
      "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, " +
      "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles.map((s) => styleLine(s.name, s.forceStyle)),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const lines = events.map(
    (e) =>
      `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},${e.style},,0,0,0,,${assText(e.text)}`
  );

  return [...head, ...lines, ""].join("\n");
}

module.exports = { buildAss, styleLine, parseStyle, assTime, assText, PLAY_RES_Y };
