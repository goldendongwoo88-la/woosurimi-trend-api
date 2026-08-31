// 쇼츠 소재 찾기 — 명령줄에서 바로.
// 사용: node scripts/find-shorts-source.js "키워드" [--shorts] [--top 8]
//
// 효율(조회수÷구독자)이 높은 소재 = 구독자 없이도 유튜브가 밀어준 소재.
// 우리는 구독자가 없으니 이런 걸 찾아야 합니다.
const { findSources } = require("../src/shortsSourceFinder");

const args = process.argv.slice(2);
const keyword = args.find((a) => !a.startsWith("--"));
const shortsOnly = args.includes("--shorts");
const topIdx = args.indexOf("--top");
const inspectTop = topIdx >= 0 ? Number(args[topIdx + 1]) || 8 : 8;

if (!keyword) {
  console.log('사용: node scripts/find-shorts-source.js "키워드" [--shorts] [--top 8]');
  process.exit(1);
}

const bar = (n) => "█".repeat(Math.min(20, Math.round(n * 2)));

(async () => {
  console.log(`\n"${keyword}" 소재 찾는 중… (상위 ${inspectTop}개 정밀 조회)\n`);
  const r = await findSources(keyword, { inspectTop, shortsOnly });

  console.log(`검색 ${r.searched}개 → 정밀 조회 ${r.checked}개\n`);
  if (!r.results.length) return console.log(r.note);

  r.results.forEach((v, i) => {
    const eff = v.efficiency === null ? "  ?  " : String(v.efficiency).padStart(5);
    console.log(`${String(i + 1).padStart(2)}. [효율 ${eff}] ${bar(v.efficiency || 0)}`);
    console.log(`    ${v.title.slice(0, 60)}`);
    console.log(`    ${v.channel} · 조회 ${v.views.toLocaleString()} · 구독 ${v.subs.toLocaleString()} · ${v.duration}초`);
    if (v.remake) {
      console.log(`    재각색: ${v.remake.ready ? "◎ 적기" : "△ 대기"} (${v.remake.days}일 전, 하루 ${v.remake.perDay.toLocaleString()}회) — ${v.remake.why}`);
    }
    for (const f of v.copyright) {
      const mark = f.level === "good" ? "✅" : f.level === "danger" ? "🚫" : "  ";
      console.log(`    ${mark} ${f.why}`);
    }
    console.log(`    ${v.url}\n`);
  });

  console.log(r.note);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
