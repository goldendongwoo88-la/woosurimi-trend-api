// 해외 쇼츠 저작권 판별 — 명령줄
//
//   node scripts/rights-check.js <유튜브주소 또는 영상ID> [...]
//   node scripts/rights-check.js --cc "kitchen gadget"      크리에이티브 커먼즈만 찾기
//
// ⚠️ 이 도구는 "써도 된다"는 허가를 주지 않습니다. 위험 신호를 보여줄 뿐입니다.
const path = require("path");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
const { check, findCC } = require("../src/shortsRightsCheck");

const args = process.argv.slice(2);
const ccIdx = args.indexOf("--cc");

const MARK = { green: "🟢 써도 됨", yellow: "🟡 확인 필요", red: "🔴 쓰지 마세요" };
const LEV = { good: "✅", warn: "⚠️ ", danger: "🚫" };

(async () => {
  if (ccIdx >= 0) {
    const kw = args[ccIdx + 1];
    if (!kw) { console.log('사용: node scripts/rights-check.js --cc "키워드"'); process.exit(1); }
    console.log(`\n"${kw}" 크리에이티브 커먼즈 영상 찾는 중…\n`);
    const rows = await findCC(kw);
    if (!rows.length) return console.log("CC 영상이 없습니다. 키워드를 바꿔보세요.");
    rows.forEach((v, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${v.title.slice(0, 56)}`);
      console.log(`    ${v.channel} · ${v.duration}초 · ${v.url}`);
    });
    console.log("\n이 영상들은 원작자가 재사용을 허락한 것입니다. 그래도 출처는 밝히십시오.");
    return;
  }

  const targets = args.filter((a) => !a.startsWith("--"));
  if (!targets.length) {
    console.log("사용: node scripts/rights-check.js <유튜브주소> [...]");
    console.log('     node scripts/rights-check.js --cc "키워드"');
    process.exit(1);
  }

  for (const t of targets) {
    console.log("\n" + "━".repeat(58));
    const r = await check(t);
    if (!r.ok) { console.log("판별 실패:", r.error); continue; }
    console.log(`${MARK[r.verdict]}   (위험도 ${r.score})`);
    console.log(`\n${r.meta.title.slice(0, 56)}`);
    console.log(`${r.meta.channel} · 조회 ${r.meta.views.toLocaleString()} · 구독 ${r.meta.subs.toLocaleString()} · ${r.meta.duration}초`);
    console.log(`라이선스: ${r.meta.license}`);
    console.log("\n[신호]");
    for (const s of r.signals) console.log(`  ${LEV[s.level] || "  "} ${s.why}`);
    console.log(`\n→ ${r.advice}`);
  }
  console.log("\n" + "━".repeat(58));
  console.log("⚠️ 이 판정은 법적 판단이 아닙니다. 확실한 길은 원작자 허락이나 크리에이티브 커먼즈뿐입니다.");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
