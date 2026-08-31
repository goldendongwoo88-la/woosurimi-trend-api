/**
 * 전자책 표지 + 판매 썸네일 생성 — 결정론(0원). AI 호출 없음.
 *
 * 왜 필요한가: 크몽·유페이퍼는 표지 이미지 없이는 사실상 안 팔립니다. 등록 화면에서
 * 가장 먼저 눈에 들어오는 게 표지라서, 원고가 아무리 좋아도 여기서 걸러집니다.
 *
 * ⚠️ 한글 글자를 어떻게 그리나: sharp가 쓰는 librsvg는 이 PC의 한글 폰트를 못 찾는
 * 경우가 있어서 <text>를 쓰면 글자가 통째로 빕니다. 그래서 cardNewsGenerator.js와 같은
 * 방식으로 **fontkit으로 글자를 길(path)로 바꿔서** 그립니다 — 폰트가 파일로 박혀 있어
 * 어느 환경에서도 같은 그림이 나옵니다.
 *
 * 사용법:
 *   node scripts/make-book-cover.js <초안.json> <출력폴더> [--author 이름]
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fontkit = require("fontkit");

const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const FONT = fontkit.openSync(FONT_PATH);
const UPM = FONT.unitsPerEm;

// 폰트에 없는 기호는 두부(□)로 나옵니다 — 대체가 있으면 바꾸고, 없으면 지웁니다.
const SUBS = { "℃": "°C", "℉": "°F", "✓": "", "※": "", "→": "-" };
function sanitize(t) {
  let out = "";
  for (const ch of String(t == null ? "" : t)) {
    if (FONT.hasGlyphForCodePoint(ch.codePointAt(0))) { out += ch; continue; }
    out += SUBS[ch] != null ? SUBS[ch] : "";
  }
  return out;
}

function measure(text, size) {
  let w = 0;
  for (const ch of sanitize(text)) w += FONT.glyphForCodePoint(ch.codePointAt(0)).advanceWidth * (size / UPM);
  return w;
}

// 글자마다 <path> 하나씩 — 여러 글자를 한 path에 이어붙이면 첫 글자만 렌더되는 문제가 있습니다.
function glyphs(text, x, y, size, fill, opacity) {
  const s = size / UPM;
  let cx = x;
  let out = "";
  const op = opacity != null ? ` opacity="${opacity}"` : "";
  for (const ch of sanitize(text)) {
    const g = FONT.glyphForCodePoint(ch.codePointAt(0));
    if (ch !== " ") {
      const d = g.path.scale(s, -s).translate(cx, y).toSVG();
      if (d) out += `<path d="${d}" fill="${fill}"${op}/>`;
    }
    cx += g.advanceWidth * s;
  }
  return out;
}

function text(t, x, y, size, fill, { anchor = "start", opacity } = {}) {
  const w = measure(t, size);
  const sx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return glyphs(t, sx, y, size, fill, opacity);
}

// 낱말 단위로 실제 폭을 재서 줄바꿈합니다. 한 낱말이 통째로 넘치면 글자 단위로 자릅니다.
function wrap(str, size, maxW) {
  const words = String(str || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (measure(next, size) <= maxW) { cur = next; continue; }
    if (cur) lines.push(cur);
    if (measure(w, size) <= maxW) { cur = w; continue; }
    let chunk = "";
    for (const ch of w) {
      if (measure(chunk + ch, size) > maxW) { lines.push(chunk); chunk = ch; }
      else chunk += ch;
    }
    cur = chunk;
  }
  if (cur) lines.push(cur);
  return lines;
}

// 제목이 몇 줄이든 상자 안에 들어오도록 글자 크기를 줄여가며 맞춥니다.
function fitLines(str, maxW, maxLines, startSize, minSize) {
  let size = startSize;
  for (; size > minSize; size -= 2) {
    const lines = wrap(str, size, maxW);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: minSize, lines: wrap(str, minSize, maxW).slice(0, maxLines) };
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const INK = "#0e1116";
const GOLD = "#d4af37";
const PAPER = "#f4f1ea";

/** 세로 표지 (전자책 표준 3:4) */
function coverSvg({ w, h, title, subtitle, author, badge, hooks = [] }) {
  const pad = Math.round(w * 0.1);
  const inner = w - pad * 2;

  const t = fitLines(title, inner, 4, Math.round(w * 0.115), Math.round(w * 0.055));
  const lineH = Math.round(t.size * 1.28);
  const titleTop = Math.round(h * 0.3);
  const titleSvg = t.lines.map((ln, i) => text(ln, pad, titleTop + i * lineH, t.size, PAPER)).join("");
  const titleBottom = titleTop + (t.lines.length - 1) * lineH;

  const subSize = Math.round(w * 0.038);
  const subLines = wrap(subtitle || "", subSize, inner).slice(0, 3);
  const subTop = titleBottom + Math.round(t.size * 1.1);
  const subSvg = subLines.map((ln, i) => text(ln, pad, subTop + i * Math.round(subSize * 1.55), subSize, PAPER, { opacity: 0.72 })).join("");

  const badgeSize = Math.round(w * 0.033);
  const badgeW = measure(badge, badgeSize) + badgeSize * 1.6;
  const badgeY = Math.round(h * 0.17);

  // 아래쪽 여백에 "이 책에서 다루는 것" 3줄. 표지만 보고도 살지 말지 판단이 서게 합니다.
  const hookSize = Math.round(w * 0.032);
  const hookTop = Math.round(h * 0.66);
  const hookLabel = text("이 책에서 다루는 것", pad, hookTop, Math.round(w * 0.028), GOLD, { opacity: 0.85 });
  // 한 줄에 통째로 들어가는 훅을 우선 고릅니다 — 문장이 중간에 잘리면 오히려 조잡해 보입니다.
  const hookW = inner - hookSize * 1.2;
  const fits = hooks.filter((s) => measure(s, hookSize) <= hookW);
  const chosen = (fits.length >= 3 ? fits : [...fits, ...hooks.filter((s) => !fits.includes(s))]).slice(0, 3);
  const hookSvg = chosen.map((raw, i) => {
    const y = hookTop + Math.round(hookSize * 2.0) + i * Math.round(hookSize * 1.9);
    // 그래도 넘치면 말줄임표로 끝맺습니다.
    let line = raw;
    if (measure(line, hookSize) > hookW) {
      while (line.length > 4 && measure(line + "…", hookSize) > hookW) line = line.slice(0, -1);
      line = line.replace(/[\s,·—-]+$/, "") + "…";
    }
    return `<rect x="${pad}" y="${y - Math.round(hookSize * 0.62)}" width="${Math.round(hookSize * 0.2)}" height="${Math.round(hookSize * 0.7)}" fill="${GOLD}"/>`
      + text(line, pad + Math.round(hookSize * 0.75), y, hookSize, PAPER, { opacity: 0.8 });
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#141a22"/><stop offset="60%" stop-color="${INK}"/><stop offset="100%" stop-color="#05070a"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${Math.round(w * 0.022)}" height="${h}" fill="${GOLD}"/>
  <rect x="${pad}" y="${badgeY - badgeSize}" width="${Math.round(badgeW)}" height="${Math.round(badgeSize * 2)}" rx="${badgeSize}" fill="${GOLD}"/>
  ${text(badge, pad + badgeSize * 0.8, badgeY + badgeSize * 0.36, badgeSize, INK)}
  ${titleSvg}
  <rect x="${pad}" y="${titleBottom + Math.round(t.size * 0.5)}" width="${Math.round(inner * 0.22)}" height="${Math.max(3, Math.round(h * 0.005))}" fill="${GOLD}"/>
  ${subSvg}
  ${hookLabel}
  ${hookSvg}
  ${text(author, pad, h - Math.round(h * 0.075), Math.round(w * 0.042), GOLD)}
  <!-- ${esc(title)} -->
</svg>`;
}

/** 판매 목록용 가로 썸네일 (크몽 카드) */
function thumbSvg({ w, h, title, promise, badge }) {
  const pad = Math.round(w * 0.07);
  const inner = w - pad * 2;
  const t = fitLines(title, inner, 3, Math.round(w * 0.085), Math.round(w * 0.042));
  const lineH = Math.round(t.size * 1.26);
  const top = Math.round(h * 0.36);
  const titleSvg = t.lines.map((ln, i) => text(ln, pad, top + i * lineH, t.size, PAPER)).join("");
  const bottom = top + (t.lines.length - 1) * lineH;

  const pSize = Math.round(w * 0.031);
  const pLines = wrap(promise || "", pSize, inner).slice(0, 2);
  const pSvg = pLines.map((ln, i) => text(ln, pad, bottom + Math.round(t.size * 0.95) + i * Math.round(pSize * 1.5), pSize, GOLD, { opacity: 0.95 })).join("");

  const bSize = Math.round(w * 0.028);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${INK}"/>
  <rect x="0" y="${h - Math.round(h * 0.014)}" width="${w}" height="${Math.round(h * 0.014)}" fill="${GOLD}"/>
  ${text(badge, pad, Math.round(h * 0.2), bSize, GOLD)}
  ${titleSvg}
  ${pSvg}
</svg>`;
}

async function main() {
  const argv = process.argv.slice(2);
  const [draftPath, outDir] = argv.filter((a) => !a.startsWith("--"));
  const ai = argv.indexOf("--author");
  const author = ai >= 0 && argv[ai + 1] ? argv[ai + 1] : "우수리미";
  if (!draftPath || !outDir) {
    console.error("사용법: node scripts/make-book-cover.js <초안.json> <출력폴더> [--author 이름]");
    process.exit(1);
  }

  const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  const b = draft.book || {};
  const title = b.title || "제목 없음";
  const chapters = (draft.parts && draft.parts.chapters) || [];
  const badge = `전자책 · ${chapters.length}장`;

  // 표지 하단 훅: 목차 소주제(points) 중 앞의 것들을 씁니다. 장 제목보다 구체적이라
  // "무엇을 알게 되는가"가 바로 보입니다.
  const hooks = (b.chapters || []).flatMap((c) => c.points || []).filter(Boolean);

  fs.mkdirSync(outDir, { recursive: true });

  const jobs = [
    ["07_표지_1200x1600.png", coverSvg({ w: 1200, h: 1600, title, subtitle: b.subtitle, author, badge, hooks })],
    ["08_크몽썸네일_1000x800.png", thumbSvg({ w: 1000, h: 800, title, promise: b.promise, badge })],
  ];
  for (const [name, svg] of jobs) {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(path.join(outDir, name), png);
    const m = await sharp(png).stats();
    // 잉크 확인: 전부 같은 색이면 글자가 안 그려진 것이라 바로 잡아냅니다.
    const flat = m.channels.every((c) => c.stdev < 1);
    console.log(`  ${flat ? "✗ 글자 없음!" : "✓"} ${name} (${(png.length / 1024).toFixed(1)}KB)`);
    if (flat) process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
