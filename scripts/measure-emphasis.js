/**
 * 잘 되는 블로그가 **강조를 얼마나 쓰는지** 잽니다.
 *
 * ⚠️ 자동 강조 기능을 만들려는데 "몇 군데를 강조해야 하나"는 근거가 저한테 없습니다.
 * 감으로 정하면 온통 굵은 글씨가 되거나, 있으나 마나 한 수준이 됩니다.
 * 강조가 너무 많으면 아무것도 강조가 안 됩니다. 그 선을 재봅니다.
 *
 * ⚠️ 네이버가 막습니다. 하나씩 사이를 두고 받아옵니다.
 */
const naver = require("../src/naverBlogData");
const fetchLib = require("../src/blogFetch");
const fs = require("fs");
const path = require("path");

const BLOGS = [
  ["nidle_831", "잘 되는 쪽 (일 74,094명)"],
  ["man_is_best", "사장님 블로그 (일 21,018명)"],
];
const PER_BLOG = 10;
const CACHE = path.join(__dirname, "..", "scratch-emphasis.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 본문 HTML에서 강조가 어떻게 쓰였는지 셉니다. */
function analyze(bodyHtml) {
  if (!bodyHtml) return null;
  const text = bodyHtml.replace(/<[^>]+>/g, " ").replace(/[\s​]+/g, " ").trim();
  const chars = text.length;
  if (chars < 200) return null;

  const count = (re) => (bodyHtml.match(re) || []).length;

  // 네이버 편집기가 실제로 쓰는 표시들입니다.
  const bold = count(/<(b|strong)[\s>]/gi) + count(/font-weight:\s*(bold|[6-9]00)/gi);
  const underline = count(/<u[\s>]/gi) + count(/text-decoration:[^;"]*underline/gi);
  const highlight = count(/background-color:\s*(?!transparent|rgba\(0,\s*0,\s*0,\s*0\))/gi);
  const colored = count(/(?<!background-)color:\s*(?!inherit)/gi);
  // 글자 크기 — se-fs32 처럼 클래스로 들어갑니다.
  const sizes = {};
  for (const m of bodyHtml.matchAll(/se-fs(\d+)/g)) {
    sizes[m[1]] = (sizes[m[1]] || 0) + 1;
  }
  // 인용구(소제목 자리)
  const quotes = count(/se-quotation/gi);

  return { chars, bold, underline, highlight, colored, quotes, sizes };
}

function stats(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return {
    n: s.length,
    중앙: s[Math.floor(s.length / 2)],
    평균: +(nums.reduce((a, b) => a + b, 0) / s.length).toFixed(1),
    최소: s[0],
    최대: s[s.length - 1],
  };
}

(async () => {
  const all = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  for (const [id, label] of BLOGS) {
    console.log(`\n━━ ${label} — ${id} ━━`);
    let posts;
    try {
      const list = await naver.fetchPostList(id, { countPerPage: 30 });
      posts = (list.posts || list.items || list || []).slice(0, PER_BLOG);
    } catch (e) {
      console.log("  글 목록을 못 받았습니다:", e.message);
      continue;
    }
    if (!posts.length) { console.log("  글이 없습니다."); continue; }

    const rows = [];
    let blocked = 0;
    for (const p of posts) {
      const url = `https://m.blog.naver.com/${id}/${p.logNo || p.no}`;
      try {
        const r = await fetchLib.fetchPost(url);
        const a = analyze(r.bodyHtml);
        if (a) rows.push(a); else blocked++;
      } catch { blocked++; }
      await sleep(900);
    }
    all[id] = rows;
    fs.writeFileSync(CACHE, JSON.stringify(all));

    console.log(`  읽은 글 ${rows.length}편 (못 읽음 ${blocked}편)`);
    if (!rows.length) continue;

    const per1000 = (key) => rows.map((r) => +((r[key] / r.chars) * 1000).toFixed(2));
    console.log(`  글 길이: 중앙 ${stats(rows.map((r) => r.chars)).중앙}자`);
    console.log("");
    console.log("  강조 개수 (글 한 편당)");
    for (const [key, name] of [["bold", "굵게"], ["underline", "밑줄"], ["highlight", "배경색"], ["colored", "글자색"], ["quotes", "인용구(소제목)"]]) {
      const s = stats(rows.map((r) => r[key]));
      console.log(`    ${name.padEnd(14)} 중앙 ${String(s.중앙).padStart(3)}  평균 ${String(s.평균).padStart(5)}  (${s.최소}~${s.최대})`);
    }
    console.log("");
    console.log("  1,000자당 강조 (길이 보정)");
    for (const [key, name] of [["bold", "굵게"], ["underline", "밑줄"], ["highlight", "배경색"], ["colored", "글자색"]]) {
      const s = stats(per1000(key));
      console.log(`    ${name.padEnd(14)} 중앙 ${String(s.중앙).padStart(5)}  평균 ${String(s.평균).padStart(5)}`);
    }
    // 글자 크기 — 소제목에 몇을 쓰는지
    const sizeTally = {};
    for (const r of rows) for (const [k, v] of Object.entries(r.sizes)) sizeTally[k] = (sizeTally[k] || 0) + v;
    const top = Object.entries(sizeTally).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (top.length) {
      console.log("");
      console.log("  쓰는 글자 크기 (많은 순)");
      console.log("    " + top.map(([k, v]) => `${k}px ${v}회`).join(" · "));
    }
  }
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
