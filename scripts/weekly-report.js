/**
 * 사장님용 주간 성과 보고서 — 업주 보고서(clientReport) 엔진 재사용.
 *
 * 방문자 14일 + 최근 글 6편의 실검색 순위를 재서 HTML 한 장으로 만듭니다.
 * ⚠️ AI 0원. 다만 글 6편 × 실검색이라 APIHUB 하루 한도를 6칸 씁니다.
 * ⚠️ 서버가 아니라 파일로 만듭니다 — 배포 없이도 볼 수 있게.
 *
 * 쓰는 법:  node scripts/weekly-report.js            ← 골든(man_is_best)
 *          node scripts/weekly-report.js 다른아이디
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const fs = require("fs");
const path = require("path");
const clientReport = require("../src/clientReport");

(async () => {
  const blogId = process.argv[2] || "man_is_best";
  console.log(`■ ${blogId} — 방문자와 최근 글 순위를 재는 중… (글 6편, 10초쯤 걸립니다)`);

  const data = await clientReport.collect(blogId, {
    posts: 6,
    storeName: blogId === "man_is_best" ? "골든 블로그" : blogId,
    note: "",
  });

  const html = clientReport.render({ data, createdAt: Date.now() });
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const out = `C:\\Users\\Admin\\Desktop\\포스팅 자료\\제안\\주간보고-${blogId}-${day}.html`;
  fs.writeFileSync(out, html, "utf8");

  const exposed = data.posts.filter((p) => p.rank != null);
  console.log(`\n발행 ${data.posts.length}편 · 검색 노출 확인 ${exposed.length}편`);
  for (const p of data.posts) {
    console.log(`  ${p.rank != null ? String(p.rank).padStart(2) + "위" : "30위밖"}  ${p.title.slice(0, 40)}`);
  }
  if (data.visitors) {
    const sum = data.visitors.reduce((a, v) => a + v.count, 0);
    console.log(`최근 2주 방문 ${sum.toLocaleString()}명`);
  }
  console.log(`\n보고서: ${out}`);
})();
