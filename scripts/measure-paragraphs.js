/**
 * 잘 되는 블로그의 **문단 길이**를 잽니다.
 *
 * ⚠️ 줄바꿈 기능을 만들려는데 "한 문단 몇 자가 좋다"는 근거가 저한테 없습니다.
 * 추측으로 45자 같은 숫자를 박아넣으면 그게 그대로 사장님 글의 규칙이 됩니다.
 * 그래서 실제로 잘 되는 글을 열어서 세어봅니다.
 *
 * ⚠️ 네이버가 막습니다. 한꺼번에 20개를 부르면 403이 섞여 나오고,
 * 그러면 "문단이 짧다"는 엉뚱한 결론이 납니다(전에 겪었습니다).
 * 하나씩, 사이를 두고 받아옵니다.
 */
const naver = require("../src/naverBlogData");
const fetchLib = require("../src/blogFetch");
const fs = require("fs");
const CACHE = require("path").join(__dirname, "..", "scratch-paragraphs.json");

const BLOGS = [
  ["nidle_831", "잘 되는 쪽 (일 74,094명)"],
  ["man_is_best", "사장님 블로그 (일 21,018명)"],
];
const PER_BLOG = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    n: s.length,
    평균: Math.round(nums.reduce((a, b) => a + b, 0) / s.length),
    중앙: at(0.5),
    p25: at(0.25),
    p75: at(0.75),
    p90: at(0.9),
    최대: s[s.length - 1],
  };
}

/** 본문 HTML에서 문단을 뽑습니다. 사진·링크카드는 문단이 아닙니다. */
function paragraphsOf(bodyHtml) {
  if (!bodyHtml) return [];
  const out = [];
  // se-text-paragraph 하나가 화면에서 한 문단입니다.
  const re = /<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(bodyHtml))) {
    const t = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    if (t) out.push(t);
  }
  return out;
}

(async () => {
  for (const [id, label] of BLOGS) {
    console.log(`\n━━ ${label} — ${id} ━━`);
    let list;
    try {
      list = await naver.fetchPostList(id, { countPerPage: 30 });
    } catch (e) {
      console.log("  글 목록을 못 받았습니다:", e.message);
      continue;
    }
    const posts = (list.posts || list.items || list || []).slice(0, PER_BLOG);
    if (!posts.length) {
      console.log("  글이 없습니다.", JSON.stringify(list).slice(0, 200));
      continue;
    }

    const raw = [];         // 문단 원문 — 파일로 남겨서 다시 안 받아오게
    const lens = [];        // 문단 하나하나의 글자 수
    const perPost = [];     // 글 하나당 문단 수
    let blocked = 0, read = 0;

    for (const p of posts) {
      const logNo = p.logNo || p.logNo0 || p.no;
      const url = `https://m.blog.naver.com/${id}/${logNo}`;
      try {
        const r = await fetchLib.fetchPost(url);
        const paras = paragraphsOf(r.bodyHtml);
        // ⚠️ 본문을 못 읽은 글은 빼야 합니다. 0으로 세면 평균이 통째로 내려갑니다.
        if (!paras.length) { blocked++; continue; }
        read++;
        perPost.push(paras.length);
        raw.push(paras);
        for (const t of paras) lens.push(t.length);
      } catch {
        blocked++;
      }
      await sleep(900);
    }

    console.log(`  읽은 글 ${read}편 (못 읽음 ${blocked}편)`);
    const all = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
    all[id] = raw;
    fs.writeFileSync(CACHE, JSON.stringify(all));

    // ⚠️ 빈 문단(줄 사이 여백)이 70%가 넘습니다. 그걸 같이 세면 "중앙값 1자"라는
    // 쓸모없는 숫자가 나옵니다. 글자가 있는 문단만 따로 봅니다.
    const real = lens.filter((x) => x >= 2);
    const R = stats(real);
    const blankPct = Math.round(((lens.length - real.length) / lens.length) * 100);
    console.log(`  빈 줄 비율: ${blankPct}%  (글자 있는 문단 ${real.length}개)`);
    console.log(`  ▶ 글자 있는 문단만: 중앙 ${R.중앙}  평균 ${R.평균}  25%~75% ${R.p25}~${R.p75}  90% ${R.p90}  최대 ${R.최대}`);
    const over = (n) => Math.round((real.filter((x) => x > n).length / real.length) * 100);
    console.log(`  ▶ 45자 넘는 문단 ${over(45)}%  ·  60자 넘는 문단 ${over(60)}%  ·  80자 넘는 문단 ${over(80)}%`);
    if (!lens.length) { console.log("  잴 게 없습니다."); continue; }
    const L = stats(lens);
    const P = stats(perPost);
    console.log(`  문단 길이(자):  중앙 ${L.중앙}  평균 ${L.평균}  25%~75% ${L.p25}~${L.p75}  90% ${L.p90}  최대 ${L.최대}`);
    console.log(`  글당 문단 수:   중앙 ${P.중앙}  평균 ${P.평균}  25%~75% ${P.p25}~${P.p75}`);

    // 구간별로 몇 개인지 — 어디에 몰려 있는지 봐야 규칙을 정할 수 있습니다.
    const bins = [[0,20],[21,40],[41,60],[61,80],[81,120],[121,9999]];
    console.log("  길이 분포:");
    for (const [a, b] of bins) {
      const c = lens.filter((x) => x >= a && x <= b).length;
      const pct = Math.round((c / lens.length) * 100);
      console.log(`    ${String(a).padStart(3)}~${b === 9999 ? "  +" : String(b).padStart(3)}자  ${String(pct).padStart(3)}%  ${"█".repeat(Math.round(pct / 2))}`);
    }
  }
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
