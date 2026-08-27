/**
 * 자동 썸네일을 끝까지 돌려봅니다 — AI가 실제로 사진을 고르는지.
 *
 * ⚠️ 사진은 만들어 씁니다. 남의 사진을 받아오지 않습니다.
 * 대신 **AI가 구분할 수 있게** 다르게 만듭니다:
 *   0 글자만 있는 캡처   — 골라선 안 됨
 *   1 인물 전신(작게)    — 얼굴이 작아서 불리해야 함
 *   2 인물 얼굴(칙칙)    — 비포 후보
 *   3 제품만            — 골라선 안 됨
 *   4 인물 얼굴(화사)    — 애프터 후보 / 한 장 모드의 정답
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const T = require("../src/thumbAuto");
const { isConfigured } = require("../src/claudeClient");

const OUT = path.join(__dirname, "..", "scratch-auto");

function svg(w, h, inner) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${inner}</svg>`);
}
const png = (b) => sharp(b).png().toBuffer();

// 0 — 글자만 있는 캡처
const shot = () => png(svg(900, 700,
  `<rect width="900" height="700" fill="#ffffff"/>` +
  [...Array(9)].map((_, i) => `<rect x="70" y="${70 + i * 62}" width="${520 + (i % 3) * 90}" height="20" fill="#c9ced6"/>`).join("")));

// 1 — 인물 전신 (얼굴이 아주 작음)
const full = () => png(svg(900, 1400,
  `<rect width="900" height="1400" fill="#2b3550"/>` +
  `<circle cx="450" cy="200" r="66" fill="#e8c4a8"/>` +
  `<rect x="356" y="280" width="188" height="420" rx="34" fill="#8a4a52"/>` +
  `<rect x="386" y="700" width="128" height="520" rx="26" fill="#39405a"/>`));

// 2 / 4 — 얼굴 클로즈업. 색만 다르게 해서 비포/애프터가 되게.
const face = (skin, bg, lip, glow) => png(svg(900, 1100,
  `<rect width="900" height="1100" fill="${bg}"/>` +
  `<ellipse cx="450" cy="470" rx="270" ry="330" fill="${skin}"/>` +
  `<ellipse cx="450" cy="120" rx="290" ry="150" fill="#241c1a"/>` +
  `<ellipse cx="350" cy="430" rx="52" ry="26" fill="#ffffff"/><circle cx="350" cy="430" r="20" fill="#2a1d16"/>` +
  `<ellipse cx="550" cy="430" rx="52" ry="26" fill="#ffffff"/><circle cx="550" cy="430" r="20" fill="#2a1d16"/>` +
  `<ellipse cx="450" cy="640" rx="76" ry="34" fill="${lip}"/>` +
  (glow ? `<ellipse cx="450" cy="470" rx="270" ry="330" fill="#fff" opacity="0.10"/>` : "")));

// 3 — 제품만
const item = () => png(svg(900, 900,
  `<rect width="900" height="900" fill="#f2efe9"/>` +
  `<rect x="360" y="240" width="180" height="420" rx="24" fill="#1c1c22"/>` +
  `<rect x="392" y="196" width="116" height="60" rx="14" fill="#c9a227"/>`));

(async () => {
  if (!isConfigured()) {
    console.log("ANTHROPIC_API_KEY가 없어서 AI 부분은 건너뜁니다.");
    console.log("규칙 부분만 확인합니다.\n");
  }
  fs.mkdirSync(OUT, { recursive: true });

  const photos = [await shot(), await full(), await face("#c8ab98", "#3a3a44", "#8a5f5a", false),
                  await item(), await face("#f0d3bd", "#5b3f6e", "#c8455c", true)];
  const LABEL = ["글자캡처", "인물전신", "얼굴(칙칙)", "제품", "얼굴(화사)"];
  photos.forEach((b, i) => fs.writeFileSync(path.join(OUT, `${i}-${LABEL[i]}.png`), b));

  let pass = 0, fail = 0;
  const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

  // ── 규칙만 (AI 없이) ──
  console.log("── 줄이기 ──");
  const { photos: prepped, dropped } = await T.prepare(photos);
  ok(prepped.length === 5 && !dropped.length, "5장 모두 읽힘");
  const kb = prepped.map((p) => Math.round((p.b64.length * 3) / 4 / 1024));
  ok(kb.every((k) => k < 60), "AI에 보낼 크기가 장당 60KB 미만", kb.join("/") + "KB");

  if (!isConfigured()) { console.log(`\n  통과 ${pass} · 실패 ${fail}`); return; }

  // ── 한 장 모드 ──
  console.log("\n── 한 장 고르기 ──");
  const single = await T.run(photos, {
    title: '"착해진 아이라인" 카리나 메이크업 핵심은 이것',
    body: "이번 무대에서 카리나의 아이라인이 훨씬 얇아졌습니다. 언더라인에 펄을 살짝 올려 눈이 더 커 보였어요. 세미매트 피부와 누드 립을 더하니 힘 뺀 듯 정돈된 무드가 살아났습니다.",
  });
  fs.writeFileSync(path.join(OUT, "결과-한장.jpg"), single.jpeg);
  console.log(`    고른 사진: ${single.plan.pick}번 (${LABEL[single.plan.pick]})`);
  console.log(`    문구: "${single.plan.text}"${single.plan.sub ? " · " + single.plan.sub : ""}`);
  console.log(`    이유: ${single.plan.why}`);
  ok(single.plan.mode === "single", "한 장 모드로 만듦");
  ok([2, 4].includes(single.plan.pick), "얼굴 사진을 골랐다 (글자캡처·제품이 아님)", `${single.plan.pick}번`);
  ok(!single.plan.invented.length, "본문에 없는 말을 안 지어냄",
    single.plan.invented.join(", ") || "없음");
  const vis = single.plan.text.replace(/\s/g, "").length;
  ok(vis > 0 && vis <= 12, "문구가 12자 이하", vis + "자");

  // ── 비포/애프터 모드 ──
  console.log("\n── 비포 / 애프터 고르기 ──");
  const ba = await T.run(photos, {
    title: "카리나 메이크업 비포 애프터, 이렇게 달라졌습니다",
    body: "화장 전에는 피부 톤이 칙칙하고 입술 색도 흐렸습니다. 화장 후에는 피부가 화사해지고 립 컬러가 또렷해졌어요.",
  });
  fs.writeFileSync(path.join(OUT, "결과-비포애프터.jpg"), ba.jpeg);
  console.log(`    비포 ${ba.plan.before}번(${LABEL[ba.plan.before]}) / 애프터 ${ba.plan.after}번(${LABEL[ba.plan.after]})`);
  console.log(`    문구: "${ba.plan.text}"`);
  console.log(`    이유: ${ba.plan.why}`);
  ok(ba.ba.yes, "제목에서 전후 비교로 인식");
  if (ba.plan.mode === "beforeAfter") {
    ok(ba.plan.before !== ba.plan.after, "서로 다른 두 장을 골랐다");
    ok([2, 4].includes(ba.plan.before) && [2, 4].includes(ba.plan.after),
      "둘 다 얼굴 사진", `${ba.plan.before},${ba.plan.after}번`);
    ok(ba.plan.after === 4, "화사한 쪽을 애프터로 놨다", `애프터 ${ba.plan.after}번`);
  } else {
    ok(true, "짝이 안 맞아서 한 장으로 물러섰다 (억지로 안 만듦)", ba.plan.warn.join(" "));
  }

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  console.log(`  만든 사진: ${OUT}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
