// 쇼핑쇼츠 하루 한 번 — 오늘 만들 것을 정해서 파일로 떨굽니다 (2026-09-02)
//
//   node scripts/daily.js [--want 5] [--month 11] [--date 20260902]
//
// 끝나면 output/daily/YYYYMMDD.md 에 기획서가 생깁니다.
// 병목은 하나만 말합니다. "열심히 하고 있습니다"는 안 씁니다.

require("dotenv").config();
const P = require("../src/dailyPipeline");

const a = process.argv.slice(2);
const opt = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };

const 아이콘 = { done: "✅", running: "🔄", wait_approval: "🔶", wait_integration: "🔌", queued: "⬜" };

(async () => {
  const r = await P.run({
    want: Number(opt("--want", 5)),
    month: opt("--month") ? Number(opt("--month")) : null,
    date: opt("--date", undefined),
  });

  console.log(`\n■ 오늘의 쇼핑쇼츠 — ${r.date}\n`);
  if (!r.ok) { console.log("멈춤:", r.병목); return; }

  for (const s of r.steps) console.log(`  ${아이콘[s.상태] || "·"} ${s.단계.padEnd(24)} ${s.내용}`);

  console.log(`\n  선정 ${r.요약.선정}건 · 쿠팡 판매가능 ${r.요약.판매가능}건 · 대본 발행가능 ${r.요약.발행가능대본}건`);
  console.log(`\n■ 병목\n  ${r.병목}\n`);

  console.log("■ 오늘 만들 것");
  for (const [i, p] of r.picks.entries()) {
    const g = p.기획;
    console.log(`  ${i + 1}. [${p.등급}] ${p.제품} — 수수료 ${(g.수수료.rate * 100).toFixed(0)}% · ${g.대본.hookType} 훅 · 댓글에 "${g.대본.ctaKeyword}"`);
  }
  console.log(`\n  기획서: ${r.저장}\n`);

  /** 🔌 는 우리가 못 뚫습니다. 사장님이 뭘 해주셔야 하는지 정확히 적습니다. */
  const 막힘 = r.steps.filter((s) => s.상태 === "wait_integration");
  if (막힘.length) {
    console.log("■ 사장님이 해주셔야 뚫리는 것");
    for (const s of 막힘) console.log(`  🔌 ${s.단계} — ${s.내용}`);
    console.log("");
  }
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
