/**
 * 상세페이지 섹션 → 세로 PNG 렌더 (결정론 0원, 브라우저 없이)
 *
 * 왜 만드나: 상세페이지 팩토리(8491)의 렌더는 브라우저 캔버스에서만 돌아가서, 한 장 만들 때마다
 * 사람이 클릭해야 합니다. 크몽 대행을 하려면 포트폴리오·배치 제작을 명령 한 줄로 돌릴 수 있어야 해서
 * 같은 섹션 구조(buildSections)를 서버 쪽에서 PNG로 떨구는 경로를 따로 냅니다.
 *
 * ⚠️ 한글은 fontkit으로 글자를 길(path)로 바꿔 그립니다 — librsvg가 한글 폰트를 못 찾는 환경에서도
 * 같은 그림이 나오게 하려는 것으로, make-book-cover.js와 같은 방식입니다.
 *
 * 사용법: node scripts/render-detail-page.mjs <상품메모.json | 메모배열.json> <출력폴더>
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
// fontkit은 CJS라 ESM에서 default 내보내기가 없습니다 — createRequire로 가져옵니다.
import { createRequire } from "node:module";
const fontkit = createRequire(import.meta.url)("fontkit");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FACTORY = path.resolve(HERE, "..", "..", "golden-detail-factory", "src", "sections.js");
const { buildSections } = await import(pathToFileURL(FACTORY).href);

const FONT = fontkit.openSync(path.join(HERE, "..", "assets", "fonts", "NotoSansKR-Bold.ttf"));
const UPM = FONT.unitsPerEm;

const W = 860;                  // 스마트스토어 상세 이미지 표준 폭
const PAD = 56;
const INNER = W - PAD * 2;

const INK = "#16191d";
const MUTED = "#6b7280";
const BRAND = "#1f7a55";
const LINE = "#e5e7eb";
const SOFT = "#f5f7f6";

// 폰트에 글리프가 없는 기호는 두부(□)로 나옵니다. 자주 쓰이는 것만 대체 문자로 풀고,
// 대체가 없으면 아예 지웁니다 — 셀러가 "℃"를 써 넣어도 상세페이지가 깨지지 않게 합니다.
const SUBS = { "℃": "°C", "℉": "°F", "㎡": "m2", "㎏": "kg", "㎝": "cm", "㎖": "ml", "ℓ": "L", "✓": "", "※": "", "→": "-", "±": "+-" };
function sanitize(t) {
  let out = "";
  for (const ch of String(t == null ? "" : t)) {
    if (FONT.hasGlyphForCodePoint(ch.codePointAt(0))) { out += ch; continue; }
    out += SUBS[ch] != null ? SUBS[ch] : "";
  }
  return out;
}

function measure(t, size) {
  let w = 0;
  for (const ch of sanitize(t)) w += FONT.glyphForCodePoint(ch.codePointAt(0)).advanceWidth * (size / UPM);
  return w;
}
function glyphs(t, x, y, size, fill, opacity) {
  const s = size / UPM;
  let cx = x, out = "";
  const op = opacity != null ? ` opacity="${opacity}"` : "";
  for (const ch of sanitize(t)) {
    const g = FONT.glyphForCodePoint(ch.codePointAt(0));
    if (ch !== " ") {
      const d = g.path.scale(s, -s).translate(cx, y).toSVG();
      if (d) out += `<path d="${d}" fill="${fill}"${op}/>`;
    }
    cx += g.advanceWidth * s;
  }
  return out;
}
function txt(t, x, y, size, fill, { anchor = "start", opacity } = {}) {
  const w = measure(t, size);
  const sx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return glyphs(t, sx, y, size, fill, opacity);
}
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

/**
 * 섹션 하나를 그립니다. 높이를 미리 알 수 없어서 "그리면서 y를 늘리는" 방식으로 만들고,
 * 최종 높이를 돌려받아 전체 캔버스 높이를 정합니다.
 */
function drawSection(sec, y0) {
  let y = y0;
  let svg = "";
  const heading = (t, size = 30) => {
    for (const ln of wrap(t, size, INNER)) { y += size * 1.15; svg += txt(ln, PAD, y, size, INK); }
    y += size * 0.5;
  };
  const body = (t, size = 19, color = INK, op) => {
    for (const ln of wrap(t, size, INNER)) { y += size * 1.55; svg += txt(ln, PAD, y, size, color, { opacity: op }); }
  };

  switch (sec.type) {
    case "hero": {
      const top = y;
      y += 30;
      const size = measure(sec.headline, 40) > INNER ? 32 : 40;
      heading(sec.headline, size);
      y += 6;
      body(sec.sub, 20, MUTED);
      y += 34;
      svg = `<rect x="0" y="${top}" width="${W}" height="${y - top}" fill="${SOFT}"/>`
        + `<rect x="0" y="${top}" width="${W}" height="6" fill="${BRAND}"/>` + svg;
      break;
    }
    case "empathy": {
      y += 20;
      heading(sec.title, 26);
      for (const p of sec.points) {
        y += 34;
        svg += `<circle cx="${PAD + 6}" cy="${y - 7}" r="4" fill="${BRAND}"/>` + txt(p, PAD + 22, y, 19, INK, { opacity: 0.85 });
      }
      y += 26;
      break;
    }
    case "features": {
      y += 24;
      heading(sec.title, 26);
      for (const it of sec.items) {
        y += 16;
        const lines = wrap(it.text, 19, INNER - 56);
        const boxTop = y;
        let ty = y;
        for (const ln of lines) { ty += 30; svg += txt(ln, PAD + 52, ty, 19, INK); }
        const boxH = ty - boxTop + 18;
        svg = svg.slice(0, svg.length - 0); // (순서 유지용 — 아래 배경을 먼저 깔 수 없어 원으로 표시)
        svg += `<circle cx="${PAD + 22}" cy="${boxTop + 22}" r="15" fill="${BRAND}"/>`
          + txt(String(it.no), PAD + 22, boxTop + 29, 17, "#ffffff", { anchor: "middle" });
        y = boxTop + boxH;
      }
      y += 24;
      break;
    }
    case "compare": {
      y += 24;
      heading(sec.title, 26);
      y += 10;
      const colW = [INNER * 0.36, INNER * 0.32, INNER * 0.32];
      const hdrTop = y;
      y += 34;
      svg += `<rect x="${PAD}" y="${hdrTop}" width="${INNER}" height="44" fill="${BRAND}"/>`;
      ["항목", "우리 상품", "일반 제품"].forEach((h, i) => {
        const x = PAD + colW.slice(0, i).reduce((a, b) => a + b, 0) + 14;
        svg += txt(h, x, y, 17, "#ffffff");
      });
      y = hdrTop + 44;
      for (const r of sec.rows) {
        const rowTop = y;
        const cells = [r.point, r.ours, r.others];
        const hs = cells.map((c, i) => wrap(c, 17, colW[i] - 28).length);
        const rowH = Math.max(...hs) * 26 + 20;
        svg += `<rect x="${PAD}" y="${rowTop}" width="${INNER}" height="${rowH}" fill="none" stroke="${LINE}"/>`;
        cells.forEach((c, i) => {
          const x = PAD + colW.slice(0, i).reduce((a, b) => a + b, 0) + 14;
          wrap(c, 17, colW[i] - 28).forEach((ln, k) => {
            svg += txt(ln, x, rowTop + 28 + k * 26, 17, i === 1 ? BRAND : INK);
          });
        });
        y = rowTop + rowH;
      }
      y += 30;
      break;
    }
    case "spec": {
      y += 24;
      heading(sec.title, 26);
      y += 8;
      for (const r of sec.rows) {
        const rowTop = y;
        const vLines = wrap(r.v, 17, INNER - 220);
        const rowH = Math.max(1, vLines.length) * 26 + 18;
        svg += `<rect x="${PAD}" y="${rowTop}" width="${INNER}" height="${rowH}" fill="none" stroke="${LINE}"/>`
          + `<rect x="${PAD}" y="${rowTop}" width="180" height="${rowH}" fill="${SOFT}"/>`
          + txt(r.k, PAD + 16, rowTop + 27, 17, MUTED);
        vLines.forEach((ln, k) => { svg += txt(ln, PAD + 200, rowTop + 27 + k * 26, 17, INK); });
        y = rowTop + rowH;
      }
      y += 30;
      break;
    }
    case "offer": {
      const top = y;
      y += 26;
      heading(sec.title, 26);
      if (sec.price) { y += 12; svg += txt(`${sec.price}`, PAD, y + 20, 34, BRAND); y += 32; }
      if (sec.benefit) body(sec.benefit, 19, INK, 0.9);
      y += 30;
      svg = `<rect x="0" y="${top}" width="${W}" height="${y - top}" fill="${SOFT}"/>` + svg;
      break;
    }
    case "trust": {
      y += 24;
      heading(sec.title, 26);
      for (const p of sec.promises) {
        y += 34;
        // ✓·※ 같은 기호는 한글 폰트에 글리프가 없어 두부(□)로 나옵니다 — 선으로 직접 그립니다.
        svg += `<path d="M${PAD} ${y - 9} l6 6 l11 -13" fill="none" stroke="${BRAND}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
          + txt(p, PAD + 30, y, 19, INK);
      }
      y += 14;
      body(String(sec.note || "").replace(/^※\s*/, ""), 15, MUTED);
      y += 26;
      break;
    }
    case "policy": {
      y += 24;
      heading(sec.title, 26);
      y += 8;
      body("배송", 17, BRAND);
      body(sec.shipping, 17, INK, 0.85);
      y += 10;
      body("교환 · 환불", 17, BRAND);
      body(sec.exchange, 17, INK, 0.85);
      y += 30;
      break;
    }
    case "cta": {
      const top = y;
      y += 40;
      const t = sec.text;
      const size = measure(t, 30) > INNER - 80 ? 24 : 30;
      svg += `<rect x="${PAD}" y="${y - 14}" width="${INNER}" height="76" rx="10" fill="${BRAND}"/>`
        + txt(t, W / 2, y + 34, size, "#ffffff", { anchor: "middle" });
      y += 90;
      svg = `<rect x="0" y="${top}" width="${W}" height="${y - top}" fill="#ffffff"/>` + svg;
      break;
    }
    default:
      break;
  }
  return { svg, y };
}

async function renderOne(memo, outFile, { sample = false } = {}) {
  // 메모 해석(문자열 배열 "용량: 500ml" / "항목 | 우리 | 일반" 포함)은 전부 buildSections가 합니다.
  // 여기서 같은 파싱을 또 하면 두 곳이 어긋납니다 — 원본 한 곳만 고치면 되게 둡니다.
  const { sections, product } = buildSections(memo);
  // 메모에 넣었는데 섹션이 안 나오면 조용히 넘어가지 않고 멈춥니다. 원인은 둘 중 하나입니다:
  // 메모 형식이 틀렸거나("용량 500ml"처럼 콜론 누락), sections.js의 해석이 바뀌었거나.
  for (const [key, type, label, hint] of [
    ["specs", "spec", "스펙표", '"항목: 값" 형식인지'],
    ["compare", "compare", "비교표", '"항목 | 우리 | 일반" 형식인지'],
  ]) {
    if (memo[key]?.length && !sections.some((s) => s.type === type)) {
      throw new Error(`${label}가 비었습니다 — 메모의 ${key} 줄이 ${hint} 확인하세요 (그래도 안 되면 sections.js의 해석 변경)`);
    }
  }
  let y = 0;
  let parts = "";
  for (const sec of sections) {
    const r = drawSection(sec, y);
    parts += r.svg;
    y = r.y;
  }
  const H = Math.ceil(y + (sample ? 66 : 40));

  // 샘플 배지 — 가상 상품으로 만든 시안을 실제 상품 광고로 오인하면 표시광고법 문제가 됩니다.
  // 그림에 박아 넣어서 잘라내기 전에는 지워지지 않게 합니다.
  const badgeText = "SAMPLE · 샘플 시안 (가상 상품)";
  const badgeSvg = sample
    ? `<rect x="${W - PAD - (measure(badgeText, 15) + 32)}" y="18" width="${measure(badgeText, 15) + 32}" height="34" rx="17" fill="#b91c1c"/>`
      + txt(badgeText, W - PAD - 16, 40, 15, "#ffffff", { anchor: "end" })
      + txt("이 페이지는 서비스 구성을 보여주기 위한 샘플입니다. 실제 판매 상품이 아닙니다.", PAD, H - 42, 14, "#b91c1c")
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${parts}
  ${badgeSvg}
  ${txt("이 상세페이지는 판매자가 제공한 사실 정보만으로 제작되었습니다.", PAD, H - 18, 13, MUTED, { opacity: 0.8 })}
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(outFile, png);
  const st = await sharp(png).stats();
  const flat = st.channels.every((c) => c.stdev < 1);
  console.log(`  ${flat ? "✗ 잉크 없음!" : "✓"} ${path.basename(outFile)} — ${W}x${H}, ${(png.length / 1024).toFixed(1)}KB (${product}, ${sections.length}섹션)`);
  return !flat;
}

const argv = process.argv.slice(2);
const sample = argv.includes("--sample");
const [memoPath, outDir] = argv.filter((a) => !a.startsWith("--"));
if (!memoPath || !outDir) {
  console.error("사용법: node scripts/render-detail-page.mjs <메모.json> <출력폴더> [--sample]");
  console.error("  --sample : 가상 상품 시안임을 알리는 SAMPLE 배지를 그림에 박습니다 (포트폴리오용)");
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(memoPath, "utf8"));
const memos = Array.isArray(input) ? input : [input];
fs.mkdirSync(outDir, { recursive: true });
let ok = true;
for (const [i, memo] of memos.entries()) {
  const safe = String(memo.product || `상품${i + 1}`).replace(/[\\/:*?"<>|]/g, "");
  try {
    ok = (await renderOne(memo, path.join(outDir, `${String(i + 1).padStart(2, "0")}_${safe}.png`), { sample })) && ok;
  } catch (e) {
    // 한 건이 틀렸다고 나머지까지 버리지 않습니다 — 배치로 10건씩 돌리는 게 이 도구의 목적입니다.
    console.error(`  ✗ ${safe}: ${e.message}`);
    ok = false;
  }
}
if (!ok) process.exitCode = 1;
