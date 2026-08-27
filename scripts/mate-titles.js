/**
 * 오늘 쓸 메이트식 제목 추천 — 골든(뷰티)·차수리미(패션)용.
 *
 * 쓰는 법:  node scripts/mate-titles.js          ← 뷰티 10 + 패션 10
 *          node scripts/mate-titles.js beauty   ← 한 갈래만
 * AI 0원. 실시간 소재(네이트·뉴스1·구글트렌드)까지 반영합니다.
 */
const { suggest } = require("../src/mateTitles");
const { collect } = require("../src/hotIssues");

(async () => {
  const only = process.argv[2];
  let hot = null;
  try { hot = await collect(); } catch {}

  if (hot && hot.hotNames.length) {
    console.log("지금 랭킹에 오른 이름:", hot.hotNames.slice(0, 6).map((h) => h.name).join(", "));
  }
  for (const area of ["beauty", "fashion"]) {
    if (only && only !== area) continue;
    const r = suggest(area, hot, 10);
    console.log(`\n━━ ${area === "beauty" ? "뷰티 (골든)" : "패션 (차수리미)"} ━━`);
    r.items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2)}. ${it.title}\n      └ ${it.why}`));
  }
  console.log("\n※ 제목은 약속입니다 — 본문이 그 약속을 지켜야 홈판이 뜹니다 (실측: 소제목 6개 구성).");
})();
