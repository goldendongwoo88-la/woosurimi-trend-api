/**
 * 줄바꿈을 **사장님 실제 글**로 검증합니다.
 *
 * ⚠️ 지어낸 예문으로 통과시키면 아무 의미가 없습니다.
 * scratch-paragraphs.json에 받아둔 진짜 문단 1,508개로 돌립니다.
 * 확인할 것은 둘입니다.
 *   1) 글자가 하나도 안 사라졌는가
 *   2) 자른 뒤 분포가 잘 되는 블로그에 가까워졌는가
 */
const fs = require("fs");
const path = require("path");
const LB = require("../src/lineBreak");

// ⚠️ 대조할 때도 U+200B를 빼야 합니다. 안 빼면 "486자 사라짐" 같은 헛경보가 납니다.
// 실제로 그렇게 나왔고, 확인해보니 1,278개가 전부 U+200B였습니다.
const bare = (s) => String(s).replace(/[\s​-‍﻿]/g, "");

const CACHE = path.join(__dirname, "..", "scratch-paragraphs.json");

function dist(lens) {
  const s = [...lens].sort((a, b) => a - b);
  const over = (n) => Math.round((lens.filter((x) => x > n).length / lens.length) * 100);
  return {
    n: lens.length,
    중앙: s[Math.floor(s.length / 2)],
    p90: s[Math.floor(s.length * 0.9)],
    최대: s[s.length - 1],
    "45자초과": over(45) + "%",
    "60자초과": over(60) + "%",
  };
}

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`); c ? pass++ : fail++; };

// ── 1. 손으로 만든 경우들 ────────────────────────────────
console.log("\n── 기본 동작 ──");
{
  const short = "짧은 문단입니다.";
  ok(LB.splitParagraph(short).length === 1, "짧으면 그대로 둔다", `"${LB.splitParagraph(short)[0]}"`);

  const long = "이번에 새로 산 니트를 입어봤는데 생각보다 도톰해서 겨울에도 충분히 입을 수 있을 것 같았습니다. 색은 사진보다 조금 어두운 편이었고 목 부분이 살짝 늘어나는 느낌이 있었어요.";
  const p = LB.splitParagraph(long);
  ok(p.length > 1, "긴 문단은 나뉜다", `${long.length}자 → ${p.length}조각`);
  ok(p.every((x) => x.length <= LB.LIMIT), "모든 조각이 45자 이하", p.map((x) => x.length).join("/"));
  ok(
    p.join("").replace(/\s/g, "") === long.replace(/\s/g, ""),
    "글자가 하나도 안 바뀐다"
  );
  console.log("    " + p.map((x) => `\n      ${x}`).join(""));

  // 마침표 없이 쭉 이어 쓴 글 — 한국어 블로그에서 흔합니다
  const nodot = "오늘 다녀온 카페는 분위기가 좋았어요 사진 찍기도 편했고 커피 맛도 괜찮았습니다 다만 자리가 좁아서 오래 앉아 있기는 힘들었어요";
  const q = LB.splitParagraph(nodot);
  ok(q.length > 1, "마침표가 없어도 나뉜다", `${q.length}조각`);
  ok(q.every((x) => x.length <= LB.LIMIT), "그 조각들도 45자 이하", q.map((x) => x.length).join("/"));

  // 자를 자리가 아예 없는 글자 덩어리
  const blob = "가".repeat(120);
  const r = LB.splitParagraph(blob);
  ok(r.every((x) => x.length <= LB.LIMIT), "자를 데가 없어도 45자로 끊는다", r.map((x) => x.length).join("/"));
  ok(r.join("") === blob, "그래도 글자는 그대로");

  // 짧은 꼬리가 안 생겨야 합니다
  const tail = "정말 좋았습니다. 다시 갈 생각입니다. 끝.";
  const t = LB.splitParagraph(tail);
  ok(t.every((x) => x.length >= 3 || t.length === 1), "3자짜리 꼬리 조각이 안 생긴다", t.map((x) => x.length).join("/"));
}

// ── 2. 진짜 글로 ─────────────────────────────────────────
if (!fs.existsSync(CACHE)) {
  console.log("\n(scratch-paragraphs.json이 없습니다. scripts/measure-paragraphs.js를 먼저 돌리세요)");
} else {
  const all = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  for (const [id, posts] of Object.entries(all)) {
    console.log(`\n── ${id} — 실제 글 ${posts.length}편 ──`);
    const beforeLens = [];
    const afterLens = [];
    let lostTotal = 0, failed = 0;

    for (const paras of posts) {
      const body = paras.join("\n");
      const r = LB.rebreak(body);
      if (!r.ok) { failed++; continue; }
      for (const p of paras) if (!LB.isBlank(p)) beforeLens.push(LB.visibleLen(p));
      for (const p of r.text.split("\n")) if (p.length >= 2) afterLens.push(p.length);
      // 글자가 사라졌는지 직접 한 번 더 셉니다 (rebreak이 자체 확인하지만 믿지 않습니다)
      const b = bare(paras.join(""));
      const a = bare(r.text);
      if (b !== a) lostTotal += Math.abs(b.length - a.length);
    }

    ok(failed === 0, "모든 글이 처리됨", failed ? `${failed}편 실패` : "");
    ok(lostTotal === 0, "글자가 단 하나도 안 사라짐", lostTotal ? `${lostTotal}자 어긋남` : "");
    console.log("    전:", JSON.stringify(dist(beforeLens)));
    console.log("    후:", JSON.stringify(dist(afterLens)));

    const a = dist(afterLens);
    ok(parseInt(a["60자초과"]) === 0, "자른 뒤 60자 넘는 문단 0%", a["60자초과"]);
    ok(parseInt(a["45자초과"]) <= 2, "자른 뒤 45자 넘는 문단 2% 이하", a["45자초과"]);
  }
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
