/**
 * 스토어 스크린샷 1280×800 — SVG 로 그려서 PNG 로 뽑습니다.
 *
 * ⚠️ 실제 화면 흉내입니다. 실제 UI 요소(막대 버튼 이름·패널 문구)만 쓰고
 * 없는 기능이나 과장된 수치를 그리지 않습니다 — 스토어 심사도 그걸 봅니다.
 */
const sharp = require("sharp");
const path = require("path");

const W = 1280, H = 800;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const FONT = `font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif"`;

function frame(title, subtitle, body) {
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#eef1ee"/>
  <text x="70" y="92" ${FONT} font-size="40" font-weight="800" fill="#1d2a22">${esc(title)}</text>
  <text x="70" y="132" ${FONT} font-size="19" fill="#5c6862">${esc(subtitle)}</text>
  ${body}
  </svg>`;
}

/** 화면 아래 도구 막대 — 실제 버튼 이름 그대로 */
function dock(y) {
  const btns = [
    ["홈판 제목", 1], ["홈판 본문", 1], ["썸네일", 1], ["원고 붙이기", 1],
    ["자동 서식", 1], ["마무리", 1], ["함께보기", 1],
    ["주제", 0], ["표현 검사", 0], ["키워드", 0], ["폰트", 0], ["줄바꿈", 0], ["맞춤법", 0],
  ];
  let x = 300, out = `<rect x="60" y="${y}" width="1160" height="72" rx="10" fill="#1e2124"/>` +
    `<text x="86" y="${y + 44}" ${FONT} font-size="21" font-weight="800" fill="#fff">1,254</text>` +
    `<text x="150" y="${y + 44}" ${FONT} font-size="13" fill="#9aa0a6">자  ·  사진 15  ·  링크 2</text>`;
  for (const [name, primary] of btns) {
    const w = name.length * 14 + 30;
    if (x + w > 1200) break;
    out += `<rect x="${x}" y="${y + 15}" width="${w}" height="42" rx="8" fill="${primary ? "#0b8f4d" : "#33383d"}"/>` +
      `<text x="${x + w / 2}" y="${y + 42}" ${FONT} font-size="14.5" font-weight="700" fill="#fff" text-anchor="middle">${esc(name)}</text>`;
    x += w + 8;
  }
  return out;
}

/** 편집기 흉내 — 글 몇 줄 */
function editor(y, lines) {
  let out = `<rect x="60" y="${y}" width="1160" height="${lines.length * 44 + 40}" rx="12" fill="#ffffff" stroke="#dde2dd"/>`;
  lines.forEach((l, i) => {
    const [txt, style] = l;
    const size = style === "h" ? 26 : 17;
    const weight = style === "h" ? 800 : 400;
    const color = style === "h" ? "#111" : style === "mark" ? "#0b6b3c" : "#333";
    out += `<text x="100" y="${y + 52 + i * 44}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}">${esc(txt)}</text>`;
  });
  return out;
}

/** 패널 흉내 */
function panel(x, y, w, title, rows) {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${rows.length * 40 + 86}" rx="14" fill="#fff" stroke="#d8dcd8"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="34" rx="14" fill="#f4f6f4"/>` +
    `<text x="${x + 16}" y="${y + 23}" ${FONT} font-size="12.5" fill="#8b909c">⠿ 끌어서 옮기기</text>` +
    `<text x="${x + 16}" y="${y + 64}" ${FONT} font-size="18" font-weight="800" fill="#111">${esc(title)}</text>`;
  rows.forEach((r, i) => {
    const [label, val, good] = r;
    const yy = y + 96 + i * 40;
    out += `<text x="${x + 16}" y="${yy}" ${FONT} font-size="15" fill="#333">${esc(label)}</text>` +
      `<text x="${x + w - 18}" y="${yy}" ${FONT} font-size="15" font-weight="700" fill="${good ? "#0b6b3c" : "#8a5c11"}" text-anchor="end">${esc(val)}</text>`;
  });
  return out;
}

const shots = [
  ["shot-1.png", frame(
    "글쓰기 창을 떠나지 않습니다",
    "네이버 블로그 편집기 아래에 도구 막대가 붙습니다 — 쓰던 흐름 그대로",
    editor(180, [
      ["가을 코트, 이렇게 고르면 실패가 없습니다", "h"],
      ["올해 가을엔 코트를 하나 샀습니다.", "t"],
      ["색은 베이지로 골랐어요.", "t"],
      ["생각보다 도톰했습니다.", "t"],
      ["겨울에도 충분히 입겠더라고요.", "t"],
    ]) + dock(660)
  )],
  ["shot-2.png", frame(
    "쓰고 나면 성적을 확인합니다",
    "실측 기준(상위 블로그 27곳 · 글 162편 분석)과 내 글을 비교합니다",
    editor(180, [
      ["가을 코트, 이렇게 고르면 실패가 없습니다", "h"],
      ["올해 가을엔 코트를 하나 샀습니다.", "t"],
      ["색은 베이지로 골랐어요.", "t"],
    ]) + panel(720, 200, 460, "마무리 점검", [
      ["글자 수", "1,254자 ✓", 1],
      ["소제목", "8개 ✓", 1],
      ["사진", "15장 ✓", 1],
      ["45자 넘는 문단", "1% ✓", 1],
      ["내 글 링크", "2개 ✓", 1],
    ]) + dock(660)
  )],
  ["shot-3.png", frame(
    "발행은 당신이 누릅니다",
    "자동 발행 기능이 없습니다 — 계정을 프로그램에 맡기지 않는 것이 원칙입니다",
    editor(180, [
      ["원고 붙이기 · 자동 서식 · 함께보기", "h"],
      ["AI 원고를 서식까지 살려 옮기고,", "t"],
      ["소제목·인용구·강조를 한 번에 넣고,", "t"],
      ["내 블로그의 관련 글 링크를 붙입니다.", "t"],
      ["마지막 발행 버튼만 직접 누르시면 됩니다.", "mark"],
    ]) + dock(660)
  )],
];

(async () => {
  for (const [name, svg] of shots) {
    const out = path.join(__dirname, name);
    await sharp(Buffer.from(svg)).png().toFile(out);
    const m = await sharp(out).metadata();
    console.log(`✓ ${name}  ${m.width}×${m.height}`);
  }
})();
