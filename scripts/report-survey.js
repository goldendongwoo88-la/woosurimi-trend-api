/**
 * 재둔 값을 분석합니다. **잘 되는 쪽과 덜 되는 쪽을 갈라서** 봅니다.
 *
 * ⚠️ 평균만 내면 아무 말도 못 합니다.
 * "소제목 평균 5개"는 그래서 몇 개를 쓰라는 건지 알려주지 않습니다.
 * 방문자 수로 위·아래를 갈라서 **뭐가 다른지**를 봐야 뜻이 생깁니다.
 *
 * ⚠️ 그리고 이건 상관관계지 인과가 아닙니다.
 * "소제목이 많아서 잘 되는" 건지 "잘 되는 사람이 소제목을 많이 쓰는" 건지
 * 이 자료로는 못 가립니다. 그렇게 적겠습니다.
 */
const fs = require("fs");
const path = require("path");

const IN = path.join(__dirname, "..", "scratch-survey.json");
if (!fs.existsSync(IN)) {
  console.error("scratch-survey.json이 없습니다. scripts/survey-blogs.js를 먼저 돌리세요.");
  process.exit(1);
}
const state = JSON.parse(fs.readFileSync(IN, "utf8"));

const num = (a) => a.filter((x) => typeof x === "number" && isFinite(x));
const median = (a) => { const s = num(a).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => { const s = num(a); return s.length ? +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(1) : null; };
const p = (a, q) => { const s = num(a).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };

// 블로그별로 글들을 평균 내서 **블로그 한 개 = 한 표**로 만듭니다.
// ⚠️ 글 단위로 세면 글 많이 쓴 블로그가 결과를 좌우합니다.
const KEYS = ["chars", "paras", "paraMedian", "paraOver45", "subheads", "quotes", "sectionTitles",
  "images", "imgGapMedian", "tables", "oglinks", "innerLinks", "stickers", "videos",
  "bold", "underline", "highlight", "colored"];

const blogs = [];
for (const [id, rows] of Object.entries(state.posts || {})) {
  if (!rows || rows.length < 3) continue;
  const info = state.blogs[id] || {};
  const b = { id, daily: info.daily || 0, topics: info.topics || [], posts: rows.length };
  for (const k of KEYS) b[k] = median(rows.map((r) => r[k]));
  b.tocRate = Math.round((rows.filter((r) => r.hasToc).length / rows.length) * 100);
  // 제목 장치는 비율로
  const d = rows.map((r) => r.devices || {});
  for (const key of ["quoteStart", "hasQuote", "ellipsis", "number", "question", "curiosity"]) {
    b["t_" + key] = Math.round((d.filter((x) => x[key]).length / d.length) * 100);
  }
  b.t_len = median(d.map((x) => x.len));
  b.t_words = median(d.map((x) => x.words));
  // 1,000자당으로 보정
  const k = (b.chars || 1) / 1000;
  b.subPer1k = +(b.subheads / k).toFixed(1);
  b.imgPer1k = +(b.images / k).toFixed(1);
  b.boldPer1k = +(b.bold / k).toFixed(1);
  b.ulPer1k = +(b.underline / k).toFixed(1);
  b.hlPer1k = +(b.highlight / k).toFixed(1);
  b.colPer1k = +(b.colored / k).toFixed(1);
  blogs.push(b);
}

blogs.sort((a, b) => b.daily - a.daily);
const half = Math.max(1, Math.floor(blogs.length / 3));
const top = blogs.slice(0, half);
const bottom = blogs.slice(-half);

console.log(`\n━━━━ 블로그 ${blogs.length}개 · 글 ${blogs.reduce((n, b) => n + b.posts, 0)}편 ━━━━`);
console.log(`  잘 되는 쪽 ${top.length}개 — 일 ${median(top.map((b) => b.daily)).toLocaleString()}명 (중앙)`);
console.log(`  덜 되는 쪽 ${bottom.length}개 — 일 ${median(bottom.map((b) => b.daily)).toLocaleString()}명 (중앙)`);

function row(label, key, fmt = (v) => v) {
  const t = median(top.map((b) => b[key]));
  const bo = median(bottom.map((b) => b[key]));
  const all = median(blogs.map((b) => b[key]));
  const gap = t != null && bo != null && bo !== 0 ? ((t / bo - 1) * 100).toFixed(0) : null;
  const mark = gap == null ? "" : Math.abs(gap) >= 30 ? "  ★" : Math.abs(gap) >= 15 ? "  ·" : "";
  console.log(
    `  ${label.padEnd(20)} ${String(fmt(t)).padStart(8)} ${String(fmt(bo)).padStart(8)} ${String(fmt(all)).padStart(8)}${mark}`
  );
}

console.log("\n                          잘됨     덜됨     전체");
console.log("  ── 글의 뼈대 ──");
row("글자 수", "chars");
row("문단 수", "paras");
row("문단 길이(중앙)", "paraMedian");
row("45자 넘는 문단 %", "paraOver45");
row("소제목 개수", "subheads");
row("  └ 인용구", "quotes");
row("  └ 섹션타이틀", "sectionTitles");
row("1,000자당 소제목", "subPer1k");

console.log("\n  ── 사진 ──");
row("사진 개수", "images");
row("1,000자당 사진", "imgPer1k");
row("사진 사이 글자수", "imgGapMedian");

console.log("\n  ── 붙이는 것 ──");
row("표", "tables");
row("링크카드", "oglinks");
row("내 블로그 링크", "innerLinks");
row("스티커", "stickers");
row("동영상", "videos");
row("목차 있는 글 %", "tocRate");

console.log("\n  ── 강조 (1,000자당) ──");
row("굵게", "boldPer1k");
row("밑줄", "ulPer1k");
row("배경색", "hlPer1k");
row("글자색", "colPer1k");

console.log("\n  ── 제목 (% = 그 장치를 쓴 글 비율) ──");
row("제목 길이", "t_len");
row("제목 어절 수", "t_words");
row("따옴표로 시작", "t_quoteStart");
row("따옴표 있음", "t_hasQuote");
row("말줄임표", "t_ellipsis");
row("숫자", "t_number");
row("물음표", "t_question");
row("궁금증 낱말", "t_curiosity");

console.log("\n  ★ = 잘되는 쪽이 30% 이상 다름   · = 15% 이상");

// 상위 블로그 목록
console.log("\n━━ 잘 되는 블로그 (참고) ━━");
for (const b of top.slice(0, 12)) {
  console.log(`  ${b.id.padEnd(24)} 일 ${String(b.daily.toLocaleString()).padStart(7)}명 · ` +
    `${b.chars}자 · 소제목 ${b.subheads} · 사진 ${b.images} · 표 ${b.tables} · ${b.topics.join(",")}`);
}

// 눈에 띄는 차이만 다시 모아서
console.log("\n━━ 차이가 큰 것만 ━━");
const diffs = [];
for (const [label, key] of [
  ["글자 수", "chars"], ["소제목 개수", "subheads"], ["1,000자당 소제목", "subPer1k"],
  ["문단 길이", "paraMedian"], ["45자 넘는 문단%", "paraOver45"],
  ["사진 개수", "images"], ["사진 사이 글자수", "imgGapMedian"],
  ["표", "tables"], ["내 블로그 링크", "innerLinks"], ["링크카드", "oglinks"],
  ["굵게", "boldPer1k"], ["밑줄", "ulPer1k"], ["배경색", "hlPer1k"], ["글자색", "colPer1k"],
  ["제목 길이", "t_len"], ["따옴표 시작%", "t_quoteStart"], ["궁금증 낱말%", "t_curiosity"],
  ["숫자%", "t_number"],
]) {
  const t = median(top.map((b) => b[key]));
  const bo = median(bottom.map((b) => b[key]));
  if (t == null || bo == null) continue;
  const gap = bo === 0 ? (t === 0 ? 0 : 999) : (t / bo - 1) * 100;
  diffs.push({ label, t, bo, gap });
}
diffs.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
for (const d of diffs.slice(0, 10)) {
  const dir = d.gap > 0 ? "많음" : "적음";
  const g = d.gap === 999 ? "덜되는 쪽은 0" : `${d.gap > 0 ? "+" : ""}${d.gap.toFixed(0)}%`;
  console.log(`  ${d.label.padEnd(18)} ${String(d.t).padStart(7)} vs ${String(d.bo).padStart(7)}   ${g} ${dir}`);
}

// 분포 — "몇 개가 좋은가"에 답하려면 이게 필요합니다
console.log("\n━━ 잘 되는 쪽의 분포 (몇 개를 쓰는가) ━━");
for (const [label, key] of [["소제목", "subheads"], ["사진", "images"], ["글자수", "chars"],
  ["문단 길이", "paraMedian"], ["사진 사이 글자수", "imgGapMedian"], ["내 블로그 링크", "innerLinks"]]) {
  const a = top.map((b) => b[key]);
  console.log(`  ${label.padEnd(18)} 25% ${String(p(a, 0.25)).padStart(6)} · 중앙 ${String(median(a)).padStart(6)} · 75% ${String(p(a, 0.75)).padStart(6)} · 최대 ${String(p(a, 0.99)).padStart(6)}`);
}
