/**
 * /api/thumb를 실제로 두드려봅니다.
 * ⚠️ Windows curl은 한글 폼 필드를 깨뜨립니다(전에 겪었습니다). 그래서 node로 부릅니다.
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://localhost:3999";
const OUT = path.join(__dirname, "..", "scratch-thumbs");

function portrait(hue) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200">` +
    `<rect width="900" height="1200" fill="hsl(${hue},30%,18%)"/>` +
    `<ellipse cx="450" cy="400" rx="215" ry="275" fill="hsl(${hue},45%,74%)"/>` +
    `<rect y="780" width="900" height="420" fill="hsl(${hue},38%,32%)"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function post(fields, files) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [k, buf] of Object.entries(files)) {
    fd.append(k, new Blob([buf], { type: "image/jpeg" }), k + ".jpg");
  }
  const res = await fetch(BASE + "/api/thumb", { method: "POST", body: fd });
  return res;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const a = await portrait(25);
  const b = await portrait(330);
  let pass = 0, fail = 0;
  const ok = (cond, label, extra = "") => {
    console.log(`  ${cond ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
    cond ? pass++ : fail++;
  };

  // 1) 두 장 → 비포/애프터
  let r = await post({ text: "이건 못 참지", sub: "카리나 메이크업", theme: "black", size: "square" }, { before: a, after: b });
  ok(r.status === 200, "두 장 → 200", `(${r.status})`);
  ok(r.headers.get("x-thumb-mode") === "beforeAfter", "비포/애프터로 인식", r.headers.get("x-thumb-mode") || "");
  if (r.status === 200) {
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(OUT, "api-두장.jpg"), buf);
    const m = await sharp(buf).metadata();
    ok(m.width === 1200 && m.height === 1200, "1200x1200", `${m.width}x${m.height}`);
    ok(m.format === "jpeg", "jpeg로 나옴", m.format);
  }

  // 2) 한 장만
  r = await post({ text: "역대급 미모", theme: "yellow" }, { after: b });
  ok(r.status === 200 && r.headers.get("x-thumb-mode") === "single", "한 장 → single", `(${r.status})`);
  if (r.status === 200) fs.writeFileSync(path.join(OUT, "api-한장.jpg"), Buffer.from(await r.arrayBuffer()));

  // 3) 사진 없이 → 400, 그리고 하루 몫이 안 깎여야 합니다
  const before = await fetch(BASE + "/api/usage").then((x) => x.json());
  r = await post({ text: "사진없음" }, {});
  ok(r.status === 400, "사진 없이 → 400", `(${r.status})`);
  const after = await fetch(BASE + "/api/usage").then((x) => x.json());
  ok(
    before.items.thumb.used === after.items.thumb.used,
    "실패했을 때 하루 몫이 안 깎임",
    `${before.items.thumb.used} → ${after.items.thumb.used}`
  );

  // 4) 사진이 아닌 파일 → 400
  r = await post({ text: "깨진파일" }, { after: Buffer.from("이건 사진이 아닙니다") });
  ok(r.status === 400, "사진 아닌 파일 → 400", `(${r.status})`);

  // 5) 긴 문구 → 만들어는 주되 경고
  r = await post({ text: "아주아주아주 긴 문구가 들어오면 어떻게 되나" }, { after: b });
  const w = r.headers.get("x-thumb-warn");
  ok(r.status === 200, "긴 문구도 만들어짐", `(${r.status})`);
  ok(!!w, "경고 헤더 있음", w ? decodeURIComponent(w) : "없음");

  // 6) 한도까지 쓰면 429
  const u = await fetch(BASE + "/api/usage").then((x) => x.json());
  const left = u.items.thumb.left;
  console.log(`\n  (남은 ${left}장을 다 써서 429가 나오는지 봅니다)`);
  let last;
  for (let i = 0; i <= left; i++) last = await post({ text: "한도" }, { after: b });
  ok(last.status === 429, "한도를 넘기면 429", `(${last.status})`);
  if (last.status === 429) {
    const j = await last.json();
    ok(!!j.upgrade, "요금제 안내가 같이 옴", j.upgrade || "");
  }

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
