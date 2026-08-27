/**
 * 주제별로 갈라서 봅니다.
 *
 * ⚠️ 이걸 안 하면 잘못된 결론이 납니다.
 * 전체를 뭉쳐서 보니 "잘 되는 쪽이 소제목을 **적게** 쓴다"고 나왔습니다.
 * 그런데 잘 되는 쪽에 연예 블로그가 몰려 있습니다. 연예 글은 원래 짧고
 * 사진 위주라 소제목이 적습니다. **주제가 다른 것을 재고 있었던 겁니다.**
 *
 * 사장님은 패션·뷰티 후기를 쓰십니다. 그러니 그 주제 안에서 봐야 합니다.
 */
const fs = require("fs");
const path = require("path");

const IN = path.join(__dirname, "..", "scratch-survey.json");
const state = JSON.parse(fs.readFileSync(IN, "utf8"));

const num = (a) => a.filter((x) => typeof x === "number" && isFinite(x));
const median = (a) => { const s = num(a).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p = (a, q) => { const s = num(a).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };

const KEYS = ["chars", "paras", "paraMedian", "paraOver45", "subheads", "quotes", "sectionTitles",
  "images", "imgGapMedian", "tables", "oglinks", "innerLinks", "bold", "underline", "highlight", "colored"];

const blogs = [];
for (const [id, rows] of Object.entries(state.posts || {})) {
  if (!rows || rows.length < 3) continue;
  const info = state.blogs[id] || {};
  const b = { id, daily: info.daily || 0, topics: info.topics || [], posts: rows.length };
  for (const k of KEYS) b[k] = median(rows.map((r) => r[k]));
  const d = rows.map((r) => r.devices || {});
  for (const key of ["quoteStart", "hasQuote", "ellipsis", "number", "question"]) {
    b["t_" + key] = Math.round((d.filter((x) => x[key]).length / d.length) * 100);
  }
  b.t_len = median(d.map((x) => x.len));
  const k = (b.chars || 1) / 1000;
  b.subPer1k = +(b.subheads / k).toFixed(1);
  b.imgPer1k = +(b.images / k).toFixed(1);
  b.boldPer1k = +(b.bold / k).toFixed(1);
  blogs.push(b);
}

/** 패션·뷰티만 / 연예만 — 겹치는 블로그는 둘 다에 넣습니다. */
const groups = {
  "패션·뷰티": blogs.filter((b) => b.topics.some((t) => t === "패션" || t === "뷰티")),
  "연예": blogs.filter((b) => b.topics.includes("연예")),
};

function show(name, list) {
  if (list.length < 4) { console.log(`\n━━ ${name} — 블로그 ${list.length}개뿐이라 못 봅니다 ━━`); return; }
  list.sort((a, b) => b.daily - a.daily);
  const n = Math.max(2, Math.floor(list.length / 2));
  const top = list.slice(0, n);
  const bot = list.slice(-n);

  console.log(`\n━━━━ ${name} — 블로그 ${list.length}개 ━━━━`);
  console.log(`  위 ${top.length}개: 일 ${median(top.map((b) => b.daily)).toLocaleString()}명 · 아래 ${bot.length}개: 일 ${median(bot.map((b) => b.daily)).toLocaleString()}명`);
  console.log("\n                          위       아래     차이");

  const row = (label, key) => {
    const t = median(top.map((b) => b[key]));
    const bo = median(bot.map((b) => b[key]));
    if (t == null || bo == null) return;
    const gap = bo === 0 ? (t === 0 ? "—" : "아래는 0") : `${((t / bo - 1) * 100).toFixed(0)}%`;
    const mark = bo !== 0 && Math.abs(t / bo - 1) >= 0.3 ? " ★" : "";
    console.log(`  ${label.padEnd(20)} ${String(t).padStart(7)} ${String(bo).padStart(8)} ${String(gap).padStart(9)}${mark}`);
  };

  row("글자 수", "chars");
  row("문단 길이", "paraMedian");
  row("45자 넘는 문단%", "paraOver45");
  row("소제목", "subheads");
  row("1,000자당 소제목", "subPer1k");
  row("사진", "images");
  row("1,000자당 사진", "imgPer1k");
  row("사진 사이 글자수", "imgGapMedian");
  row("표", "tables");
  row("링크카드", "oglinks");
  row("내 블로그 링크", "innerLinks");
  row("굵게(1,000자당)", "boldPer1k");
  row("밑줄", "underline");
  row("배경색", "highlight");
  row("글자색", "colored");
  row("제목 길이", "t_len");
  row("따옴표%", "t_hasQuote");
  row("숫자%", "t_number");
  row("물음표%", "t_question");

  console.log("\n  위쪽 블로그가 실제로 쓰는 범위");
  for (const [label, key] of [["글자수", "chars"], ["소제목", "subheads"], ["사진", "images"],
    ["문단 길이", "paraMedian"], ["사진 사이 글자수", "imgGapMedian"], ["내 블로그 링크", "innerLinks"],
    ["링크카드", "oglinks"]]) {
    const a = top.map((b) => b[key]);
    console.log(`    ${label.padEnd(18)} 25% ${String(p(a, 0.25)).padStart(6)} · 중앙 ${String(median(a)).padStart(6)} · 75% ${String(p(a, 0.75)).padStart(6)}`);
  }

  console.log("\n  블로그별");
  for (const b of top) {
    console.log(`    ${b.id.padEnd(22)} 일 ${String(b.daily.toLocaleString()).padStart(7)}  ${String(b.chars).padStart(5)}자 · 소제목 ${String(b.subheads).padStart(2)} · 사진 ${String(b.images).padStart(2)} · 내링크 ${String(b.innerLinks).padStart(2)} · 문단 ${b.paraMedian}자`);
  }
}

for (const [name, list] of Object.entries(groups)) show(name, list);

// ── 소제목을 아예 안 쓰는 블로그가 있나 ──
console.log("\n━━ 소제목을 몇 개 쓰나 (블로그별, 전체) ━━");
const bySub = [...blogs].sort((a, b) => b.daily - a.daily);
for (const b of bySub) {
  const bar = "█".repeat(Math.min(20, b.subheads || 0));
  console.log(`  ${b.id.padEnd(22)} 일 ${String(b.daily.toLocaleString()).padStart(7)}  소제목 ${String(b.subheads).padStart(2)} ${bar}`);
}
