/**
 * 플레이스 순위 확인 — 음식점 대행의 일일 도구.
 *
 * 쓰는 법:
 *   node scripts/place-rank.js "역삼동 칼국수"                        ← 그 동네 판세만 보기
 *   node scripts/place-rank.js "역삼동 칼국수" "심가네칼국수"          ← 우리 매장 순위까지
 *   node scripts/place-rank.js --store data/clients/골목집.json       ← 매장 파일로 키워드 전부
 *
 * 매장 파일 모양 (data/clients/*.json):
 *   { "storeName": "골목집 칼국수", "placeId": "", "path": "restaurant",
 *     "keywords": ["역삼동 칼국수", "역삼역 점심"], "blogId": "" }
 *
 * ⚠️ AI 0원. 네이버 공개 화면만 읽습니다.
 */

const fs = require("fs");
const path = require("path");
const { fetchPlaceList, findRank, trackStore } = require("../src/placeRank");

function bar(rank) {
  if (rank == null) return "—";
  if (rank <= 3) return "★".repeat(4 - rank) + `  ${rank}위`;
  return `${rank}위`;
}

(async () => {
  const args = process.argv.slice(2);

  // ── 매장 파일 방식 ──
  const si = args.indexOf("--store");
  if (si >= 0) {
    const file = args[si + 1];
    if (!file || !fs.existsSync(file)) {
      console.log("매장 파일이 없습니다:", file || "(경로 없음)");
      process.exit(1);
    }
    const c = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`\n■ ${c.storeName} — 키워드 ${c.keywords.length}개 확인 중…`);
    const t = await trackStore({ name: c.storeName, placeId: c.placeId, keywords: c.keywords, path: c.path });
    for (const r of t.rows) {
      if (r.error) { console.log(`  "${r.keyword}" → 확인 실패: ${r.error}`); continue; }
      console.log(`  "${r.keyword}" → ${r.rank != null ? r.rank + "위" : "50위 밖"} (노출 ${r.sampled}개 중${r.total ? ", 전체 " + r.total + "곳" : ""})`);
      if (r.rank != null) console.log(`      방문리뷰 ${r.visitorReviews ?? "?"} · 블로그리뷰 ${r.blogReviews ?? "?"} · 저장 ${r.saveCountRaw ?? "?"}`);
    }
    console.log(`\n※ PC 지도 검색·위치 미지정 기준입니다. 가게 근처에서 검색하는 손님에게는 순서가 다를 수 있습니다.`);
    return;
  }

  // ── 키워드 (+상호) 방식 ──
  const [kw, name] = args;
  if (!kw) {
    console.log('쓰는 법: node scripts/place-rank.js "역삼동 칼국수" ["상호"]  또는  --store 매장파일.json');
    process.exit(1);
  }

  if (name) {
    const r = await findRank(kw, { name, top: 10 });
    if (!r.ok) { console.log("확인 실패:", r.error); process.exit(1); }
    console.log(`\n"${r.keyword}" — ${name}: ${r.rank != null ? `${r.rank}위` : "50위 안에 없음"}  (광고 ${r.adCount}개는 순위에서 제외)`);
    if (r.matched) console.log(`  ${r.matched.name} · 방문리뷰 ${r.matched.visitorReviews ?? "?"} · 블로그리뷰 ${r.matched.blogReviews ?? "?"} · 저장 ${r.matched.saveCountRaw ?? "?"}`);
    console.log(`\n상위 ${r.top.length}곳:`);
    for (const b of r.top) console.log(`  ${bar(b.rank).padEnd(8)} ${b.name} [${b.category}] · 방문 ${b.visitorReviews ?? "?"} · 블로그 ${b.blogReviews ?? "?"} · 저장 ${b.saveCountRaw ?? "?"}`);
  } else {
    const r = await fetchPlaceList(kw);
    if (!r.ok) { console.log("확인 실패:", r.error); process.exit(1); }
    console.log(`\n"${r.keyword}" 판세 — 노출 ${r.items.length}곳${r.total ? " / 전체 " + r.total + "곳" : ""} (광고 ${r.adNames.length}개 제외)`);
    for (const b of r.items.slice(0, 10)) {
      console.log(`  ${String(b.rank).padStart(2)}위  ${b.name} [${b.category}] · 방문 ${b.visitorReviews ?? "?"} · 블로그 ${b.blogReviews ?? "?"} · 저장 ${b.saveCountRaw ?? "?"}`);
    }
  }
  console.log(`\n※ PC 지도 검색·위치 미지정 기준. 잰 시각: ${new Date().toLocaleString("ko-KR")}`);
})();
