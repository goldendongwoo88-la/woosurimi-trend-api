// 쇼츠 소재 찾기 — 명령줄에서 바로.
// 사용: node scripts/find-shorts-source.js "키워드" ["키워드2" …] [--shorts] [--top 8]
//
// 효율(조회수÷구독자)이 높은 소재 = 구독자 없이도 유튜브가 밀어준 소재.
// 우리는 구독자가 없으니 이런 걸 찾아야 합니다.
//
// ⚠️ 쇼츠(--shorts)는 키워드를 **여러 개** 주십시오.
// 유튜브 일반 검색에는 쇼츠가 안 섞여서, 검색 화면의 "4분 미만" 필터를 써야 합니다.
// 그 페이지는 키워드 하나당 3~8건이 천장입니다. 여러 키워드를 훑어 합치는 게 맞습니다.
const { findSourcesMulti } = require("../src/shortsSourceFinder");

const args = process.argv.slice(2);
const keywords = [];
let shortsOnly = false;
let inspectTop = 8;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--shorts") { shortsOnly = true; continue; }
  if (a === "--top") { inspectTop = Number(args[++i]) || 8; continue; }
  if (a.startsWith("--")) continue;
  keywords.push(a);
}

if (!keywords.length) {
  console.log('사용: node scripts/find-shorts-source.js "키워드" ["키워드2" …] [--shorts] [--top 8]');
  console.log('예:   node scripts/find-shorts-source.js "다이소 추천템" "주방 살림템" "생활 꿀템" --shorts');
  process.exit(1);
}

const bar = (n) => "█".repeat(Math.min(20, Math.round(n * 2)));

(async () => {
  console.log(`\n키워드 ${keywords.length}개 훑는 중… (키워드당 상위 ${inspectTop}개 정밀 조회)\n`);
  const r = await findSourcesMulti(keywords, { inspectTop, shortsOnly });

  for (const k of r.perKeyword) {
    console.log(`  ${k.keyword.padEnd(14)} ${k.error ? "실패: " + k.error : `새 소재 ${k.found}건`}`);
  }
  console.log();

  if (!r.results.length) {
    console.log("건진 게 없습니다. 키워드를 바꾸거나 더 넣어보세요.");
    return;
  }

  r.results.forEach((v, i) => {
    const eff = v.efficiency === null ? "  ?  " : String(v.efficiency).padStart(5);
    console.log(`${String(i + 1).padStart(2)}. [효율 ${eff}] ${bar(v.efficiency || 0)}  (${v.keyword})`);
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
