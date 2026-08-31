// 제휴 링크 관리 — 명령줄
//
//   node scripts/affiliate.js add <콘텐츠ID> <쿠팡링크> [제품명] [채널]
//   node scripts/affiliate.js block <콘텐츠ID>            붙여넣을 문구 뽑기
//   node scripts/affiliate.js report <정산CSV경로>        쿠팡 리포트 반영
//   node scripts/affiliate.js top                        많이 번 순
const fs = require("fs");
const A = require("../src/affiliateLink");

const [cmd, ...rest] = process.argv.slice(2);
const won = (n) => (+n || 0).toLocaleString() + "원";

try {
  if (cmd === "add") {
    const [contentId, url, product = "", channel = ""] = rest;
    const r = A.register({ contentId, url, product, channel });
    console.log("\n등록했습니다.");
    console.log("  콘텐츠 :", r.contentId, "(subId로 심었습니다)");
    console.log("  제품   :", r.product || "(없음)");
    console.log("  추적링크:", r.url);
    console.log("\n이 링크로 들어온 구매는 정산 리포트에서 이 콘텐츠 것으로 잡힙니다.\n");

  } else if (cmd === "block") {
    const rows = A.forContent(rest[0]);
    if (!rows.length) return console.log("그 콘텐츠에 걸린 링크가 없습니다.");
    for (const r of rows) {
      console.log(`\n── ${r.product || "(제품명 없음)"} · ${r.channel || "채널 미지정"} ──`);
      const b = A.block(r);
      console.log(typeof b === "string" ? b : `[본문]\n${b.post}\n\n[댓글]\n${b.comment}`);
    }
    console.log();

  } else if (cmd === "report") {
    const csv = fs.readFileSync(rest[0], "utf8");
    const out = A.applyReport(csv);
    console.log(`\n리포트 합계 ${won(out.total)} 중 ${out.matched}건을 콘텐츠에 연결했습니다.`);
    if (out.unmatched.length) {
      console.log(`\n⚠️ 연결 못한 ${out.unmatched.length}건 (subId가 우리 장부에 없음):`);
      out.unmatched.slice(0, 5).forEach((u) => console.log(`   ${u.subId} — ${won(u.amount)}`));
      console.log("   → 손으로 만든 링크이거나, subId 없이 뿌린 링크입니다.");
    }
    console.log();

  } else if (cmd === "top") {
    const rows = A.top(10);
    if (!rows.length) return console.log("아직 정산 반영된 수익이 없습니다.");
    console.log("\n많이 번 순\n");
    rows.forEach((r, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${won(r.revenue).padStart(12)}  ${r.product || "(제품명 없음)"}`);
      console.log(`    콘텐츠 ${r.contentId} · ${r.channel || "-"} · 주문 ${r.orders}건`);
    });
    console.log();

  } else {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 7).join("\n").replace(/^\/\/ ?/gm, ""));
  }
} catch (e) {
  console.error("실패:", e.message);
  process.exit(1);
}
