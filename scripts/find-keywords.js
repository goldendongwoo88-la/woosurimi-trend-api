#!/usr/bin/env node
/**
 * 내 블로그가 **이길 수 있는** 키워드를 찾아줍니다.
 *
 *   node scripts/find-keywords.js --seed="가을 코트"
 *   node scripts/find-keywords.js --seed="카리나" --id=man_is_best --n=8
 *
 * ⚠️ 흔한 방식과 다릅니다.
 * 보통은 "검색량 ÷ 문서 수"가 높으면 기회 키워드라고 합니다.
 * 그런데 문서가 적어도 **위에 있는 5개가 전부 대형 블로그면** 못 이깁니다.
 * 반대로 문서가 많아도 위가 약하면 비집고 들어갑니다.
 *
 * 문서 수는 "몇 명이 썼나"이고, 알고 싶은 건 "누가 위에 있나"입니다.
 * 그래서 상위 블로그의 **일 방문자 수를 실제로 가져와** 내 것과 견줍니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 * ⚠️ 오늘 한도가 찬 오픈API를 안 씁니다. 검색광고 API와 공개 검색만 씁니다.
 */

const P = require("../src/blogPower");
const { getRelatedKeywords } = require("../src/naverKeywordTool");

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const line = (n = 72) => "─".repeat(n);
const num = (n) => (n == null ? "-" : n.toLocaleString());

async function myBlogId() {
  const given = arg("id", "");
  if (given) return require("../src/naverBlogData").parseBlogId(given);
  try {
    const kit = require("../src/accounts").getBrandKit(process.env.OWNER_EMAIL);
    if (kit && kit.blogId) return kit.blogId;
  } catch {}
  return process.env.OWNER_BLOG_ID || "";
}

(async () => {
  const seed = arg("seed", "");
  if (!seed) {
    console.log(`\n무슨 주제로 찾을지 알려주세요.\n`);
    console.log(`    node scripts/find-keywords.js --seed="가을 코트"\n`);
    process.exit(1);
  }
  const id = await myBlogId();
  if (!id) {
    console.log(`\n블로그 아이디를 모릅니다. --id=내아이디 를 붙이거나 /brand.html 에 넣어주세요.\n`);
    process.exit(1);
  }
  const want = Math.max(3, Math.min(15, Number(arg("n", 8)) || 8));

  // ── 1. 내 힘 ──
  console.log(`\n내 블로그 힘부터 잽니다 — ${id}`);
  const me = await P.myPower(id, { samplePosts: 3 });
  if (!me.visitorsKnown) {
    console.log(`\n⚠️ ${me.note}`);
    console.log(`   방문자 수를 모르면 "이길 수 있나"를 판정할 수 없습니다.`);
    console.log(`   그래도 검색량과 벽 높이는 보여드립니다.\n`);
  } else {
    console.log(`  일 방문자 ${num(me.visitors)}명 · 최근 글 ${me.tested}편 중 10위 안 ${me.top10}편`);
  }

  // ── 2. 연관 키워드 + 검색량 (검색광고 API — 오늘도 됩니다) ──
  console.log(`\n"${seed}" 로 연관 키워드를 받습니다…`);

  /**
   * ⚠️ 검색광고 열쇠는 **실서버(Render)에만** 있습니다. 그게 맞습니다 —
   * 사장님 컴퓨터에 비밀을 복사해두면 언젠가 실수로 새어 나갑니다.
   *
   * 그래서 내 컴퓨터에 열쇠가 없으면 **실서버에 물어봅니다.**
   * 서버가 이미 열쇠를 갖고 있으니 우리는 결과만 받으면 됩니다.
   */
  const SERVER = arg("server", process.env.WOOSURIMI_SERVER || "https://woosurimi-trend-api.onrender.com");
  let pool = [];
  try {
    const rel = await getRelatedKeywords(seed);
    pool = (rel || []).map((r) => ({
      keyword: String(r.relKeyword || r.keyword || "").trim(),
      volume: (Number(r.monthlyPcQcCnt) || 0) + (Number(r.monthlyMobileQcCnt) || 0),
      comp: r.compIdx || null,
    }));
  } catch (e) {
    console.log(`  (내 컴퓨터엔 열쇠가 없어서 실서버에 물어봅니다)`);
    try {
      const res = await fetch(`${SERVER.replace(/\/+$/, "")}/api/keyword/inspect?q=${encodeURIComponent(seed)}`, {
        signal: AbortSignal.timeout(90000),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.message || j.error);
      pool = (j.related || []).map((r) => ({ keyword: r.keyword, volume: r.total, comp: r.competition }));
      // 씨앗 자체도 후보에 넣습니다 — 정작 그게 제일 좋을 수 있습니다.
      if (j.volume && j.volume.total) pool.unshift({ keyword: j.keyword, volume: j.volume.total, comp: j.competition });
    } catch (e2) {
      console.log(`\n연관 키워드를 못 받았습니다: ${e2.message}`);
      console.log(`  · 실서버가 자고 있으면 30초쯤 뒤에 다시 해보세요.`);
      console.log(`  · 다른 서버면 --server=주소 를 붙이세요.\n`);
      process.exit(1);
    }
  }

  pool = pool
    .filter((r) => r.keyword && r.volume >= 100)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, want);

  if (!pool.length) {
    console.log(`\n검색량 100회 넘는 연관 키워드가 없습니다. 다른 말로 해보세요.\n`);
    process.exit(0);
  }

  // ── 3. 키워드마다 벽 높이 ──
  console.log(`\n${pool.length}개를 하나씩 재봅니다 (키워드당 6번쯤 두드립니다 — 좀 걸립니다)\n`);
  console.log(line());
  const rows = [];
  for (const k of pool) {
    process.stdout.write(`  ${k.keyword.slice(0, 20).padEnd(22)} 월 ${String(num(k.volume)).padStart(8)}회  `);
    const wall = await P.wallHeight(k.keyword, { topN: 5, myBlogId: id });
    const j = P.judge(me.visitors, wall);
    console.log(`${j.verdict}${wall.alreadyMine && wall.alreadyMine.length ? `  (내 글 ${wall.alreadyMine[0]}위)` : ""}`);
    rows.push({ ...k, wall, judge: j });
  }
  console.log(line());

  // ── 4. 정리 ──
  // ⚠️ 검색량만으로 줄 세우면 안 됩니다. 검색량 10만짜리라도 못 이기면 소용없습니다.
  // 이길 수 있는 것들 안에서 검색량 순으로 봅니다.
  const winnable = rows
    .filter((r) => ["위가 약함", "비슷함"].includes(r.judge.verdict))
    .sort((a, b) => P.ORDER[a.judge.verdict] - P.ORDER[b.judge.verdict] || b.volume - a.volume);

  const already = rows.filter((r) => r.wall.alreadyMine && r.wall.alreadyMine.length);
  const hard = rows.filter((r) => ["위가 강함", "위가 많이 강함"].includes(r.judge.verdict));
  const unknown = rows.filter((r) => r.judge.verdict === "모름");

  if (winnable.length) {
    console.log(`\n■ 큰 블로그가 아직 안 차지한 자리\n`);
    for (const r of winnable) {
      if (r.wall.alreadyMine && r.wall.alreadyMine.length) continue;
      console.log(`  ${r.keyword}`);
      console.log(`     월 ${num(r.volume)}회 검색 · 위에 있는 블로그 중앙 ${num(r.wall.median)}명`);
      console.log(`     ${r.judge.verdict} — ${r.judge.why}`);
      console.log("");
    }
  }

  if (already.length) {
    console.log(`■ 이미 내 글이 위에 있는 키워드 — 새로 쓰지 마세요\n`);
    for (const r of already) console.log(`  ${r.keyword}  (${r.wall.alreadyMine.join(", ")}위)`);
    console.log(`\n  → 같은 키워드로 또 쓰면 내 글끼리 밀어냅니다. 그 글을 손보는 게 낫습니다.\n`);
  }

  if (hard.length) {
    console.log(`■ 위에 나보다 큰 블로그가 있는 키워드\n`);
    for (const r of hard) {
      console.log(`  ${r.keyword.padEnd(22)} 월 ${num(r.volume)}회 · ${r.judge.why}`);
    }
    console.log("");
  }

  if (unknown.length) {
    console.log(`■ 판정 못 한 키워드\n`);
    for (const r of unknown) console.log(`  ${r.keyword.padEnd(22)} ${r.judge.why}`);
    console.log("");
  }

  // ⚠️ 이 도구가 뭘 모르는지 반드시 같이 말합니다.
  console.log(line());
  console.log(`
⚠️ 이 도구가 하는 말과 못 하는 말

  하는 말 : "지금 위에 있는 블로그가 나보다 크냐 작냐" — 이건 실제로 잰 값입니다.
  못 하는 말: "쓰면 몇 위에 오른다" — 이건 예언이고, 우리는 못 합니다.

  사장님 실제 글로 맞춰봤더니 3개 중 1개가 크게 어긋났습니다:
    아우터 자켓 코디     벽 6,098명   → 실제 3위   맞음
    2기 화제 장면       벽 20,107명  → 실제 1위   모델보다 좋음
    캐리어로 추천하는 이유 벽 2,088명   → 실제 9위   어긋남

  **벽이 제일 낮은 곳에서 제일 나쁜 순위가 나왔습니다.**
  네이버는 방문자 수 말고도 주제 적합도·최신성·C-Rank를 봅니다. 그건 못 잽니다.

  그래도 쓸모는 있습니다 — "큰 블로그가 아직 안 온 자리"를 찾아주니까요.
  거기서 이길지는 글이 좋아야 정해집니다.

  · 네이버는 블로그 지수를 공개하지 않습니다. 위 판정은 추정입니다.
  · 방문자 수를 숨긴 블로그는 못 잽니다. "믿을 만한 정도"가 낮으면 덜 믿으세요.
  · 오늘 한 번 잰 값입니다. 순위는 날마다 바뀝니다.
`);
})().catch((e) => { console.error("\n터졌습니다:", e.message); process.exit(1); });
