/**
 * 통합검색 네비게이터의 **판별 규칙**을 진짜 네이버 HTML로 시험합니다.
 *
 * ⚠️ 네이버 검색 화면은 브라우저 도구에서 막혀 있어 직접 못 엽니다.
 * 대신 실제로 받아둔 HTML에서 링크를 뽑아 kindOf()를 돌립니다.
 * 화면 위치(px)는 브라우저에서만 잴 수 있어 여기서는 안 봅니다.
 *
 * ⚠️ 클래스 이름으로 안 찾는 이유도 여기서 확인합니다.
 * 예전 도구들이 쓰던 sp_nreview, lst_total, power_link는 지금 페이지에
 * 하나도 없습니다. 링크 주소는 그대로입니다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "extension", "content", "search-nav.js");
const js = fs.readFileSync(SRC, "utf8");

// KINDS와 kindOf만 떼어내 돌립니다.
const start = js.indexOf("  const KINDS = [");
const end = js.indexOf("  /** 화면 맨 위에서");
if (start < 0 || end < 0) {
  console.error("search-nav.js에서 KINDS/kindOf를 못 찾았습니다.");
  process.exit(1);
}
const ctx = { module: {}, console, location: { href: "https://search.naver.com/search.naver?query=x" }, URL };
vm.createContext(ctx);
vm.runInContext(js.slice(start, end) + "\nmodule.exports = { KINDS, kindOf };", ctx);
const { kindOf } = ctx.module.exports;

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

console.log("\n── 주소로 뭘 뭐라고 보는가 ──");
const CASES = [
  ["https://blog.naver.com/man_is_best/224391863205", "블로그"],
  ["https://m.blog.naver.com/man_is_best/224391863205", "블로그"],
  ["https://in.naver.com/beauty/contents/internal/1234", "인플루언서"],
  ["https://cafe.naver.com/joonggonara/1234", "카페"],
  ["https://kin.naver.com/qna/detail.naver?d1id=1", "지식iN"],
  ["https://n.news.naver.com/article/001/000", "뉴스"],
  ["https://shopping.naver.com/x", "쇼핑"],
  ["https://smartstore.naver.com/x", "쇼핑"],
  ["https://adcr.naver.com/adcr?x=1", "광고"],
  ["https://tv.naver.com/v/123", "동영상"],
  ["https://clip.naver.com/x", "동영상"],
  ["https://www.google.com/", null],
  ["https://namu.wiki/w/x", null],
  ["https://search.pstatic.net/img.png", null],
];
for (const [url, want] of CASES) {
  const got = kindOf(url);
  ok((got ? got.label : null) === want, `${url.slice(0, 52)}`, `→ ${got ? got.label : "안 셈"}`);
}

console.log("\n── 순서가 맞는가 (인플루언서가 블로그보다 먼저) ──");
{
  const ids = ctx.module.exports.KINDS.map((k) => k.id);
  ok(ids.indexOf("influencer") < ids.indexOf("blog"),
    "인플루언서를 블로그보다 먼저 본다", ids.join(" > "));
}

// ── 진짜 네이버 HTML로 ──
const SAVED = process.argv[2];
if (SAVED && fs.existsSync(SAVED)) {
  console.log("\n── 실제 검색 결과 HTML로 ──");
  const h = fs.readFileSync(SAVED, "utf8");
  const urls = [...h.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const uniq = [...new Set(urls.map((u) => u.split("?")[0]))];
  const tally = {};
  for (const u of uniq) {
    const k = kindOf(u);
    if (k) tally[k.label] = (tally[k.label] || 0) + 1;
  }
  console.log("  링크 " + uniq.length.toLocaleString() + "개 중 알아본 것:");
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(12)} ${n}개`);
  }
  ok((tally["블로그"] || 0) >= 5, "블로그 결과를 찾았다", (tally["블로그"] || 0) + "개");

  console.log("\n  (참고) 옛 도구들이 쓰던 클래스 이름이 지금 남아 있나:");
  for (const cls of ["sp_nreview", "lst_total", "power_link", "api_subject_bx", "sc_new"]) {
    const n = (h.match(new RegExp(cls, "g")) || []).length;
    console.log(`    ${cls.padEnd(18)} ${n}회 ${n ? "" : "← 사라졌습니다"}`);
  }
} else {
  console.log("\n(저장된 검색 HTML 경로를 인자로 주면 실제 결과로도 확인합니다)");
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
