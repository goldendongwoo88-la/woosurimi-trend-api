const sharp = require("sharp");
const SP = process.argv[2];
/**
 * 사장님이 주신 예시 기준: 인물이 세로의 **약 65%**, 위아래 여백이 넉넉합니다.
 * 인물 높이 × 1.55 정도가 그 비율입니다.
 */
(async () => {
  const src = SP + "/m7.jpg";
  const m = await sharp(src).metadata();
  const 인물 = { x1: 0.42, x2: 0.65, y1: 0.35, y2: 0.90 };
  const cx = (인물.x1 + 인물.x2) / 2 * m.width;
  const cy = (인물.y1 + 인물.y2) / 2 * m.height;
  const 인물높이 = (인물.y2 - 인물.y1) * m.height;
  let h = Math.round(인물높이 / 0.65);
  let w = Math.round(h * 0.75);
  if (h > m.height) { h = m.height; w = Math.round(h * 0.75); }
  if (w > m.width) { w = m.width; h = Math.round(w / 0.75); }
  let x = Math.max(0, Math.min(Math.round(cx - w / 2), m.width - w));
  let y = Math.max(0, Math.min(Math.round(cy - h / 2), m.height - h));
  await sharp(src).extract({ left: x, top: y, width: w, height: h })
    .resize({ width: 1200 }).jpeg({ quality: 92 }).toFile(SP + "/여유65.jpg");
  console.log("여유65", w + "x" + h, "인물이 세로의 65%");
})();
