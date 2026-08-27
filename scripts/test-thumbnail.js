/**
 * 썸네일 눈으로 확인하기.
 * ⚠️ 사진은 만들어 씁니다. 남의 사진을 받아오지 않습니다.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const T = require("../src/thumbnail");

const OUT = path.join(__dirname, "..", "scratch-thumbs");

// 인물 사진 흉내 — 위쪽에 얼굴, 아래쪽에 어두운 배경.
function fakePortrait(hue) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">' +
    `<rect width="900" height="1200" fill="hsl(${hue},30%,18%)"/>` +
    `<ellipse cx="450" cy="400" rx="215" ry="275" fill="hsl(${hue},45%,74%)"/>` +
    `<rect y="780" width="900" height="420" fill="hsl(${hue},38%,32%)"/>` +
    "</svg>";
  return sharp(Buffer.from(svg)).png().toBuffer();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const before = await fakePortrait(25);
  const after = await fakePortrait(330);

  const cases = [
    ["비포애프터", () => T.beforeAfter({ beforeBuf: before, afterBuf: after, text: "이건 못 참지", sub: "카리나 메이크업" })],
    ["비포애프터-라벨없이", () => T.beforeAfter({ beforeBuf: before, afterBuf: after, text: "달라진 눈매", labels: null })],
    ["한장-노랑", () => T.single({ buf: after, text: "역대급 미모", theme: "yellow" })],
    ["한장-위쪽띠", () => T.single({ buf: after, text: "이 립 뭐예요", theme: "red", position: "top" })],
    ["긴문구-줄어드나", () => T.single({ buf: after, text: "아주아주아주 긴 문구가 들어오면" })],
    ["문구없이", () => T.single({ buf: after, text: "" })],
    ["세로형", () => T.beforeAfter({ beforeBuf: before, afterBuf: after, text: "화장 전후", size: "tall" })],
  ];

  for (const [name, fn] of cases) {
    const buf = await fn();
    const file = path.join(OUT, name + ".jpg");
    fs.writeFileSync(file, buf);
    const m = await sharp(buf).metadata();
    console.log(`  ${name.padEnd(20)} ${m.width}x${m.height}  ${Math.round(buf.length / 1024)}KB`);
  }

  console.log("\n문구 제안:");
  for (const t of [
    '"착해진 아이라인" 카리나 메이크업 핵심은 이것',
    "무대에서 노출 사고날뻔한 5세대 걸그룹... 코디가 밉다",
    "출근룩 이거 하나로 끝냈습니다",
  ]) {
    console.log(`  ${t}\n    → ${JSON.stringify(T.suggestText(t))}`);
  }
  console.log("\n" + OUT);
})().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
