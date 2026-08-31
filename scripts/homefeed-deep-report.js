/**
 * homefeed-deep.json 을 읽어 경쟁 vs 사장님 비교표를 냅니다.
 *
 * ⚠️ 표본이 적은 항목은 평균만 보면 한 편에 휘둘립니다. 그래서 중앙값을 같이 냅니다.
 * ⚠️ 본문 HTML을 못 읽은 글(bodyOk=false)은 구조·강조 통계에서 뺍니다 — 0으로 세면
 *    "강조를 안 쓴다"는 엉뚱한 결론이 납니다.
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data", "homefeed-deep.json");
const raw = JSON.parse(fs.readFileSync(DATA, "utf8"));
const rows = Object.values(raw.byUrl || {});

const isMine = (r) => r.group === "사장님";
const mine = rows.filter(isMine);
const comp = rows.filter((r) => !isMine(r));

const num = (arr) => arr.filter((x) => typeof x === "number" && !Number.isNaN(x));
function stat(arr) {
  const a = num(arr);
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return {
    n: a.length,
    평균: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10,
    중앙: s[Math.floor(s.length / 2)],
    최소: s[0],
    최대: s[s.length - 1],
  };
}
const pct = (arr, f) => {
  const a = arr.filter((r) => r != null);
  if (!a.length) return null;
  return Math.round((a.filter(f).length / a.length) * 100);
};

function line(label, cs, ms, unit = "") {
  const f = (o) => (o ? `평균 ${o.평균}${unit} (중앙 ${o.중앙}${unit}, ${o.최소}~${o.최대})` : "—");
  console.log(`  ${label.padEnd(16)} 경쟁 ${f(cs).padEnd(42)} | 사장님 ${f(ms)}`);
}
function lineP(label, c, m) {
  console.log(`  ${label.padEnd(16)} 경쟁 ${String(c ?? "—").padStart(3)}%${" ".repeat(38)}| 사장님 ${String(m ?? "—").padStart(3)}%`);
}

console.log(`\n${"=".repeat(100)}`);
console.log(`홈판 상위노출 심층 비교 — 경쟁 ${comp.length}편 vs 사장님 ${mine.length}편`);
console.log(`${"=".repeat(100)}`);

// 블로그별 표본
console.log("\n[표본]");
const byBlog = {};
for (const r of rows) (byBlog[r.blogId] ||= []).push(r);
for (const [id, v] of Object.entries(byBlog)) {
  console.log(`  ${id.padEnd(16)} ${String(v.length).padStart(2)}편  (${v[0].group})`);
}

console.log("\n[1] 제목");
line("길이(자)", stat(comp.map((r) => r.hooks.len)), stat(mine.map((r) => r.hooks.len)), "자");
const HOOKS = ["따옴표", "말줄임", "숫자", "가격", "전언체", "정체숨기기", "감정어", "반전", "소거법", "zip모음", "질문형", "괄호"];
for (const h of HOOKS) lineP(h, pct(comp.map((r) => r.hooks), (x) => x[h]), pct(mine.map((r) => r.hooks), (x) => x[h]));
line("물음표(개)", stat(comp.map((r) => r.hooks.물음표)), stat(mine.map((r) => r.hooks.물음표)));

console.log("\n[2] 본문 분량");
line("공백포함(자)", stat(comp.map((r) => r.글자수_공백포함)), stat(mine.map((r) => r.글자수_공백포함)), "자");
line("공백제외(자)", stat(comp.map((r) => r.글자수_공백제외)), stat(mine.map((r) => r.글자수_공백제외)), "자");

console.log("\n[3] 구성 요소 (본문 HTML 읽힌 글만)");
const cOk = comp.filter((r) => r.bodyOk);
const mOk = mine.filter((r) => r.bodyOk);
line("사진(장)", stat(cOk.map((r) => r.사진)), stat(mOk.map((r) => r.사진)), "장");
line("소제목(개)", stat(cOk.map((r) => r.소제목)), stat(mOk.map((r) => r.소제목)), "개");
line("표(개)", stat(cOk.map((r) => r.표)), stat(mOk.map((r) => r.표)), "개");
line("영상(개)", stat(cOk.map((r) => r.영상)), stat(mOk.map((r) => r.영상)), "개");
line("링크카드(개)", stat(cOk.map((r) => r.링크카드)), stat(mOk.map((r) => r.링크카드)), "개");
line("구분선(개)", stat(cOk.map((r) => r.구분선)), stat(mOk.map((r) => r.구분선)), "개");
line("스티커(개)", stat(cOk.map((r) => r.스티커)), stat(mOk.map((r) => r.스티커)), "개");
line("태그(개)", stat(comp.map((r) => r.태그수)), stat(mine.map((r) => r.태그수)), "개");
lineP("표 있는 글", pct(cOk, (r) => r.표 > 0), pct(mOk, (r) => r.표 > 0));
lineP("영상 있는 글", pct(cOk, (r) => r.영상 > 0), pct(mOk, (r) => r.영상 > 0));
lineP("소제목 있는글", pct(cOk, (r) => r.소제목 > 0), pct(mOk, (r) => r.소제목 > 0));

console.log("\n[4] 흐름·체류 장치");
lineP("Q&A 있음", pct(comp, (r) => r.flow.qna > 0), pct(mine, (r) => r.flow.qna > 0));
lineP("목차 있음", pct(comp, (r) => r.flow.목차), pct(mine, (r) => r.flow.목차));
lineP("결론먼저", pct(comp, (r) => r.flow.결론먼저), pct(mine, (r) => r.flow.결론먼저));
lineP("정형도입", pct(comp, (r) => r.flow.정형도입), pct(mine, (r) => r.flow.정형도입));
line("도입부(자)", stat(comp.map((r) => r.flow.introLen)), stat(mine.map((r) => r.flow.introLen)), "자");

console.log("\n[5] 강조 표시 (본문 HTML 읽힌 글만)");
const em = (arr, k) => stat(arr.map((r) => r.emphasis && r.emphasis[k]));
for (const k of ["굵게", "밑줄", "형광", "색", "글자크기종류"]) line(k, em(cOk, k), em(mOk, k), "회");
// 1,000자당 강조 밀도 — 글 길이가 다르면 절대 횟수 비교는 왜곡됩니다.
const dens = (arr) => stat(arr.filter((r) => r.emphasis && r.글자수_공백포함 > 300)
  .map((r) => Math.round(((r.emphasis.굵게 + r.emphasis.형광 + r.emphasis.색) / r.글자수_공백포함) * 1000 * 10) / 10));
line("1000자당강조", dens(cOk), dens(mOk), "회");

console.log("\n[6] 문단 리듬");
line("문단수", stat(cOk.map((r) => r.para && r.para.문단수)), stat(mOk.map((r) => r.para && r.para.문단수)), "개");
line("문단평균(자)", stat(cOk.map((r) => r.para && r.para.평균)), stat(mOk.map((r) => r.para && r.para.평균)), "자");
line("문단최대(자)", stat(cOk.map((r) => r.para && r.para.최대)), stat(mOk.map((r) => r.para && r.para.최대)), "자");

console.log("\n[7] 경쟁 제목 실물 (상위 20)");
comp.slice(0, 20).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${r.title}`));

console.log("\n[8] 사장님 제목 실물");
mine.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${r.title}`));

console.log("\n[9] 경쟁 도입부 실물 (상위 12)");
comp.slice(0, 12).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${r.flow.intro.slice(0, 110)}`));

console.log("\n[10] 사장님 도입부 실물");
mine.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${r.flow.intro.slice(0, 110)}`));

if ((raw.skipped || []).length) {
  console.log(`\n[못 받은 글] ${raw.skipped.length}건 — 통계에서 제외됨`);
}
