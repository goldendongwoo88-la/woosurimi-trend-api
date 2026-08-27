/**
 * 링크카드와 내 블로그 링크를 **제대로** 셉니다.
 *
 * ⚠️ 처음에 이렇게 셌습니다:
 *   링크카드 = "se-oglink"가 HTML에 몇 번 나오나  →  24개
 *   내 링크  = "blog.naver.com"이 몇 번 나오나     →  6개
 * 둘 다 틀렸습니다. 실제로 뜯어보니:
 *   - 링크카드 하나에 se-oglink가 여러 번 들어갑니다 (se-component se-oglink,
 *     se-section-oglink, se-module-oglink…) → 24가 아니라 3개
 *   - 카드 하나에 링크가 두 번 들어갑니다 (썸네일 + 글자) → 6이 아니라 3개
 *
 * 이걸 모르고 "잘 되는 블로그는 내 링크를 21개 넣는다"고 말씀드릴 뻔했습니다.
 * 실제로는 3개입니다. 21개를 넣으라고 했으면 글이 링크 밭이 됐을 겁니다.
 */
const naver = require("../src/naverBlogData");
const fetchLib = require("../src/blogFetch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 링크카드 개수 — 컴포넌트 단위로 셉니다. */
function countOglinks(html) {
  return (html.match(/class="[^"]*\bse-component\b[^"]*\bse-oglink\b[^"]*"/g) || []).length;
}

/** 내 블로그 글로 가는 링크 — 같은 주소는 한 번만. */
function countOwnLinks(html, id) {
  const set = new Set();
  for (const m of html.matchAll(/href="([^"]*blog\.naver\.com[^"]*)"/gi)) {
    const u = m[1].split("?")[0];
    if (u.toLowerCase().includes("/" + id.toLowerCase() + "/")) set.add(u);
  }
  return set.size;
}

/** 남의 블로그·사이트로 가는 링크카드 */
function countOtherLinks(html, id) {
  const set = new Set();
  for (const m of html.matchAll(/<a[^>]+class="[^"]*se-oglink[^"]*"[^>]*href="([^"]+)"/gi)) {
    const u = m[1].split("?")[0];
    if (!u.toLowerCase().includes("/" + id.toLowerCase() + "/")) set.add(u);
  }
  return set.size;
}

const TARGETS = [
  ["suzin_y", 47247, "연예"],
  ["nuelfashion", 41181, "패션"],
  ["sso965", 36196, "패션"],
  ["hnluv1004", 29301, "연예"],
  ["masung_xoxo", 27818, "연예"],
  ["pepekjin", 22876, "패션"],
  ["longtimeknowsee", 12694, "패션"],
  ["hewtbylvv", 11291, "패션"],
  ["beauyonce", 3055, "뷰티(아래쪽)"],
  ["lovedarl2", 3401, "패션(아래쪽)"],
  ["gazii", 3690, "패션(아래쪽)"],
  ["man_is_best", 21018, "사장님"],
];

(async () => {
  console.log("블로그               일방문   글  링크카드  내글링크  남의링크");
  console.log("─".repeat(66));
  const rows = [];
  for (const [id, daily, tag] of TARGETS) {
    let list;
    try {
      const r = await naver.fetchPostList(id, { countPerPage: 10 });
      list = (r.posts || r.items || r || []).slice(0, 4);
    } catch { console.log(`  ${id.padEnd(20)} 목록 실패`); continue; }

    const og = [], own = [], other = [];
    for (const p of list) {
      try {
        const post = await fetchLib.fetchPost(`https://m.blog.naver.com/${id}/${p.logNo || p.no}`);
        const h = post.bodyHtml || "";
        if (!h) continue;
        og.push(countOglinks(h));
        own.push(countOwnLinks(h, id));
        other.push(countOtherLinks(h, id));
      } catch {}
      await sleep(900);
    }
    if (!og.length) { console.log(`  ${id.padEnd(20)} 글을 못 읽음`); continue; }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const r = { id, daily, tag, og: med(og), own: med(own), other: med(other), n: og.length };
    rows.push(r);
    console.log(`  ${id.padEnd(20)} ${String(daily.toLocaleString()).padStart(7)} ${String(r.n).padStart(3)} ${String(r.og).padStart(8)} ${String(r.own).padStart(9)} ${String(r.other).padStart(9)}  ${tag}`);
  }

  const top = rows.filter((r) => r.daily >= 10000 && r.tag !== "사장님");
  const bot = rows.filter((r) => r.daily < 10000 && r.tag !== "사장님");
  const me = rows.find((r) => r.tag === "사장님");
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  console.log("\n━━ 정리 ━━");
  console.log(`  일 1만 이상 (${top.length}개):  링크카드 ${med(top.map((r) => r.og))} · 내 글 링크 ${med(top.map((r) => r.own))} · 남의 링크 ${med(top.map((r) => r.other))}`);
  console.log(`  일 1만 미만 (${bot.length}개):  링크카드 ${med(bot.map((r) => r.og))} · 내 글 링크 ${med(bot.map((r) => r.own))} · 남의 링크 ${med(bot.map((r) => r.other))}`);
  if (me) console.log(`  사장님:              링크카드 ${me.og} · 내 글 링크 ${me.own} · 남의 링크 ${me.other}`);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
