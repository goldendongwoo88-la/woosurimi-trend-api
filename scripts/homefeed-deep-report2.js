const fs = require("fs");
const path = require("path");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "homefeed-deep-v2.json"), "utf8"));
const rows = Object.values(raw.byUrl || {});
const mine = rows.filter((r) => r.group === "사장님");
const comp = rows.filter((r) => r.group !== "사장님");

function stat(arr) {
  const a = arr.filter((x) => typeof x === "number" && !Number.isNaN(x));
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return { n: a.length, 평균: Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10, 중앙: s[Math.floor(s.length / 2)], 최소: s[0], 최대: s[s.length - 1] };
}
const pct = (arr, f) => (arr.length ? Math.round((arr.filter(f).length / arr.length) * 100) : null);
const F = (o) => (o ? `평균 ${o.평균} (중앙 ${o.중앙}, ${o.최소}~${o.최대}, n=${o.n})` : "측정불가");
const L = (label, c, m) => console.log(`  ${label.padEnd(15)} 경쟁 ${F(c).padEnd(44)}| 사장님 ${F(m)}`);
const P = (label, c, m) => console.log(`  ${label.padEnd(15)} 경쟁 ${String(c ?? "—").padStart(3)}%${" ".repeat(40)}| 사장님 ${String(m ?? "—").padStart(3)}%`);

console.log(`\n${"=".repeat(96)}\n실측 비교 v2 — 경쟁 ${comp.length}편 / 사장님 ${mine.length}편\n${"=".repeat(96)}`);

console.log("\n[1] 제목 후킹");
L("길이(자)", stat(comp.map((r) => r.hooks.len)), stat(mine.map((r) => r.hooks.len)));
for (const h of ["따옴표시작", "따옴표포함", "말줄임", "숫자", "가격", "전언체", "정체숨기기", "감정어", "반전", "브랜드제품", "헤어", "후기"])
  P(h, pct(comp.map((r) => r.hooks), (x) => x[h]), pct(mine.map((r) => r.hooks), (x) => x[h]));

console.log("\n[2] 분량");
L("공백포함", stat(comp.map((r) => r.글자수_공백포함)), stat(mine.map((r) => r.글자수_공백포함)));
L("공백제외", stat(comp.map((r) => r.글자수_공백제외)), stat(mine.map((r) => r.글자수_공백제외)));

console.log("\n[3] 도입부 (화면상 첫 문단)");
L("첫문단자수", stat(comp.map((r) => r.도입부_첫문단자수)), stat(mine.map((r) => r.도입부_첫문단자수)));
P("정형도입", pct(comp, (r) => r.정형도입), pct(mine, (r) => r.정형도입));

console.log("\n[4] 구성 요소");
const cO = comp.filter((r) => r.bodyOk), mO = mine.filter((r) => r.bodyOk);
for (const k of ["사진", "소제목", "표", "영상", "링크카드", "구분선", "스티커"]) L(k, stat(cO.map((r) => r[k])), stat(mO.map((r) => r[k])));
P("표 있음", pct(cO, (r) => r.표 > 0), pct(mO, (r) => r.표 > 0));
P("영상 있음", pct(cO, (r) => r.영상 > 0), pct(mO, (r) => r.영상 > 0));
P("소제목 있음", pct(cO, (r) => r.소제목 > 0), pct(mO, (r) => r.소제목 > 0));
L("태그(측정된것만)", stat(comp.map((r) => r.태그수)), stat(mine.map((r) => r.태그수)));

console.log("\n[5] 체류 장치");
P("Q&A 있음", pct(comp, (r) => r.qna > 0), pct(mine, (r) => r.qna > 0));
P("목차 있음", pct(comp, (r) => r.목차), pct(mine, (r) => r.목차));
P("결론먼저", pct(comp, (r) => r.결론먼저), pct(mine, (r) => r.결론먼저));

console.log("\n[6] 문단 리듬");
for (const k of ["문단수", "문단평균", "문단중앙", "문단최대", "긴문단비율"]) L(k, stat(cO.map((r) => r[k])), stat(mO.map((r) => r[k])));

console.log("\n[7] 강조");
for (const k of ["굵게", "밑줄", "형광"]) L(k, stat(cO.map((r) => r.emphasis && r.emphasis[k])), stat(mO.map((r) => r.emphasis && r.emphasis[k])));
const dens = (a) => stat(a.filter((r) => r.emphasis && r.글자수_공백포함 > 300).map((r) => Math.round((r.emphasis.굵게 / r.글자수_공백포함) * 1000 * 10) / 10));
L("1000자당굵게", dens(cO), dens(mO));

console.log("\n[8] 블로그별 핵심 지표");
const by = {};
for (const r of rows) (by[r.blogId] ||= []).push(r);
console.log("  블로그          n  제목자수 본문(공백포함) 사진 소제목 문단평균 굵게 첫문단자수");
for (const [id, v] of Object.entries(by)) {
  const g = (f) => { const s = stat(v.map(f)); return s ? String(s.중앙).padStart(5) : "    —"; };
  console.log(`  ${id.padEnd(14)} ${String(v.length).padStart(2)} ${g((r) => r.hooks.len)} ${g((r) => r.글자수_공백포함).padStart(10)} ${g((r) => r.사진)} ${g((r) => r.소제목)} ${g((r) => r.문단평균)} ${g((r) => r.emphasis && r.emphasis.굵게)} ${g((r) => r.도입부_첫문단자수)}`);
}

console.log("\n[9] 경쟁 도입 첫 문단 실물");
comp.slice(0, 16).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${(r.도입문단[0] || "(없음)").slice(0, 95)}`));
console.log("\n[10] 사장님 도입 첫 문단 실물");
mine.forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [${r.blogId}] ${(r.도입문단[0] || "(없음)").slice(0, 95)}`));
if ((raw.skipped || []).length) console.log(`\n[못 받은 글] ${raw.skipped.length}건`);
