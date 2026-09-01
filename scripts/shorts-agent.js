// 쇼핑 쇼츠 에이전트 — 한 줄로 돌립니다.
//
//   node scripts/shorts-agent.js "다이소 추천템" "주방 살림템" [--want 3] [--days 90]
//
// 뜨는 영상 찾기 → 제작 방식 분석 → 팔 제품 뽑기 → 쿠팡 확인 → 기획서까지.
// 쿠팡 키가 없으면 "확인 못 함"으로 표시하고 멈춥니다. 없는 걸 있다고 하지 않습니다.
const fs = require("fs");
const path = require("path");
try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch {}
const agent = require("../src/shortsAgent");

const args = process.argv.slice(2);
const keywords = [];
let want = 3, days = 90;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--want") { want = Number(args[++i]) || 3; continue; }
  if (args[i] === "--days") { days = Number(args[++i]) || 90; continue; }
  if (!args[i].startsWith("--")) keywords.push(args[i]);
}
if (!keywords.length) {
  console.log('사용: node scripts/shorts-agent.js "키워드" ["키워드2"] [--want 3] [--days 90]');
  process.exit(1);
}

(async () => {
  const r = await agent.run(keywords, { want, days });
  console.log();
  if (!r.ok) { console.log("멈춤 (" + r.stage + "):", r.error); process.exit(0); }

  for (const p of r.products) {
    console.log("━".repeat(58));
    console.log(`■ ${p.product}   (효율 ${p.efficiency} · 조회 ${p.views.toLocaleString()} · 구독 ${(p.subs||0).toLocaleString()})`);
    console.log(`  근거: ${p.fromTitle.slice(0, 50)}`);
    console.log(`  쿠팡: ${p.coupang?.sellable === null ? "확인 못 함 — " + p.coupang.why : (p.coupang?.sellable ? "팔 수 있음" : "못 찾음")}`);
    console.log(`  길이: ${p.targetSeconds}초 · 소재 클립 ${p.stock?.clips ?? 0}개`);
    console.log("  제목 후보 (공식 점수순):");
    p.titles.slice(0, 5).forEach((t, i) => console.log(`    ${i + 1}. ${t.title}  (${t.chars}자)`));
  }
  console.log("━".repeat(58));
  console.log("\n막힌 곳:");
  r.blocked.forEach(b => console.log("  ·", b));
  console.log("\n" + r.note);

  const out = path.join(__dirname, "..", "data", `shorts-agent-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(r, null, 1), "utf8");
  console.log("\n저장:", path.basename(out));
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
