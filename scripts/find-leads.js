/**
 * 대행 영업부 — 손님이 될 가게 찾기.
 *
 * ⚠️ 어떤 가게가 우리 손님인가 (셋 다 맞아야 합니다)
 *   1) 순위가 4~30위 — 아예 없는 가게(관심 없음)도, 1~3위(아쉬울 게 없음)도 아닌,
 *      "보이는데 손님을 뺏기는" 가게. 올려줄 여지가 있고 아쉬움도 있습니다.
 *   2) 방문리뷰가 있다 — 장사가 실제로 되고 있고, 가게를 돌보는 주인이라는 뜻.
 *   3) 블로그리뷰가 위쪽 가게들보다 눈에 띄게 적다 — 정확히 우리가 채워줄 수 있는 빈칸.
 *
 * ⚠️ 영업 멘트에 지어낸 숫자를 쓰지 않습니다. 이 스크립트가 그 시각에 실제로
 * 검색해서 잰 값만 씁니다. 시세 조사 결과 대행 시장가는 월 10만~30만원대입니다
 * (전화영업으로 "월 몇만원 1년 계약"을 파는 곳들은 사기성 경고가 많습니다 — 아이보스).
 * 우리는 실측 보고서로 그 반대편에 섭니다.
 *
 * ⚠️ AI 0원. 네이버 공개 화면만 읽습니다. 키워드 사이 800ms.
 *
 * 쓰는 법:
 *   node scripts/find-leads.js "역삼동"                      ← 기본 메뉴 8종으로
 *   node scripts/find-leads.js "역삼동" "칼국수,파스타,초밥"  ← 메뉴 직접
 */

const fs = require("fs");
const path = require("path");
const { fetchPlaceList } = require("../src/placeRank");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 동네 상권에서 흔하고, 검색도 많이 하는 메뉴들.
const DEFAULT_MENUS = ["맛집", "칼국수", "파스타", "고기집", "초밥", "카페", "브런치", "국밥"];

const OUT_DIR = "C:\\Users\\Admin\\Desktop\\포스팅 자료\\제안";

(async () => {
  const town = (process.argv[2] || "").trim();
  if (!town) {
    console.log('쓰는 법: node scripts/find-leads.js "동네이름" ["메뉴1,메뉴2,…"]');
    process.exit(1);
  }
  const menus = (process.argv[3] ? process.argv[3].split(",") : DEFAULT_MENUS)
    .map((s) => s.trim()).filter(Boolean).slice(0, 12);

  console.log(`\n■ ${town} — 메뉴 ${menus.length}개로 손님이 될 가게를 찾습니다…\n`);

  const leads = [];
  for (let i = 0; i < menus.length; i++) {
    if (i) await sleep(800);
    const kw = `${town} ${menus[i]}`;
    const r = await fetchPlaceList(kw);
    if (!r.ok) { console.log(`  "${kw}" → 못 읽음 (${r.error})`); continue; }

    // 위쪽(1~3위)의 블로그리뷰 — 이 동네·메뉴의 "벽 높이"입니다.
    const top3 = r.items.slice(0, 3);
    const wall = top3.length
      ? Math.round(top3.reduce((a, b) => a + (b.blogReviews || 0), 0) / top3.length)
      : null;

    let found = 0;
    for (const b of r.items) {
      if (b.rank < 4 || b.rank > 30) continue;               // 1) 올려줄 여지가 있는 자리
      if (!b.visitorReviews || b.visitorReviews < 30) continue; // 2) 실제로 장사되는 가게
      if (wall == null) continue;
      const gapOk = (b.blogReviews || 0) < wall * 0.4;        // 3) 블로그가 약한 게 원인일 후보
      if (!gapOk) continue;
      leads.push({
        kw, town, menu: menus[i],
        rank: b.rank, name: b.name, category: b.category,
        visitorReviews: b.visitorReviews, blogReviews: b.blogReviews || 0,
        wall, saveCountRaw: b.saveCountRaw,
      });
      found++;
    }
    console.log(`  "${kw}" → 후보 ${found}곳 (1~3위 블로그리뷰 평균 ${wall ?? "?"}개)`);
  }

  // 같은 가게가 여러 키워드에서 걸리면 제일 좋은(순위 높은) 건만 남깁니다.
  const best = new Map();
  for (const l of leads) {
    const k = l.name;
    if (!best.has(k) || best.get(k).rank > l.rank) best.set(k, l);
  }
  const rows = [...best.values()].sort((a, b) => a.rank - b.rank);

  if (!rows.length) {
    console.log("\n조건에 맞는 가게가 없습니다. 다른 동네나 메뉴로 다시 돌려보세요.");
    return;
  }

  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const lines = [
    `${town} 영업 리드 — ${day} 실측`,
    `기준: 4~30위 + 방문리뷰 30개 이상 + 블로그리뷰가 상위 3곳 평균의 40% 미만`,
    `(전부 그 시각에 네이버에서 실제로 검색한 값입니다. 지어낸 숫자 없음)`,
    "",
    ...rows.map((l, i) => [
      `${i + 1}. ${l.name} [${l.category}]`,
      `   "${l.kw}" ${l.rank}위 · 방문리뷰 ${l.visitorReviews.toLocaleString()} · 블로그리뷰 ${l.blogReviews.toLocaleString()} (상위 3곳 평균 ${l.wall.toLocaleString()})`,
      `   영업 멘트: "사장님, 지금 '${l.kw}' 검색하면 ${l.rank}번째에 나오세요.`,
      `   위에 있는 집들은 블로그 글이 평균 ${l.wall.toLocaleString()}개인데 사장님 가게는 ${l.blogReviews.toLocaleString()}개예요.`,
      `   이 차이를 매주 정직한 글로 메꾸고, 순위가 어떻게 움직이는지 주간 보고서로 보내드려요."`,
      "",
    ].join("\n")),
    "⚠️ 잊지 말 것: 가짜 방문 후기 금지. 업주가 준 실제 사진·정보로만 씁니다.",
    "⚠️ 시장가 참고: 플레이스 관리 대행은 월 10만~30만원대가 보통입니다.",
  ].join("\n");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `리드-${town}-${day}.txt`);
  fs.writeFileSync(file, lines, "utf8");

  console.log(`\n■ 손님 후보 ${rows.length}곳:`);
  for (const l of rows.slice(0, 10)) {
    console.log(`  ${String(l.rank).padStart(2)}위  ${l.name} — 방문 ${l.visitorReviews} vs 블로그 ${l.blogReviews} (벽 ${l.wall})`);
  }
  console.log(`\n영업 자료 저장: ${file}`);
})();
