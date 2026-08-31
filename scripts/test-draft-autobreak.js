/**
 * 원고를 넣을 때 **긴 문단이 자동으로 잘리는지** 확인합니다. (AI 0원)
 *
 * ⚠️ 왜 이 시험이 필요한가:
 * 줄바꿈 도구는 예전부터 있었지만 **버튼이라 안 눌렸습니다.** 실측(2026-08-31)에서
 * 사장님 글은 문단 중앙 41자, 45자 넘는 문단이 43%였습니다. 벤치마킹은 16~24자에 0~7%.
 * 그래서 원고를 넣는 자리(draft-insert.js)에서 코드가 알아서 자르게 했습니다.
 * 지침에만 적어두면 원고는 계속 그대로 나옵니다.
 *
 * ⚠️ 자르면 안 되는 경우가 있습니다. 그걸 지키는지가 이 시험의 절반입니다.
 *   · 서식 표기가 반쪽만 남는 경우 ([강조]…가 조각 사이에서 끊김)
 *   · 굵게 표시(marks)가 두 조각에 걸치는 경우 — 걸치면 서식이 조용히 사라집니다
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  — " + e : ""}`); c ? pass++ : fail++; };

const EXT = path.join(__dirname, "..", "extension", "content");

/** 확장 파일에서 코드 한 토막을 떼어내 돌립니다 (parity 시험과 같은 방식). */
function extract(file, startMark, endMark, tail, sandbox = {}) {
  const src = fs.readFileSync(path.join(EXT, file), "utf8");
  const a = src.indexOf(startMark);
  const b = src.indexOf(endMark);
  if (a < 0 || b < 0 || b <= a) {
    console.error(`✗ ${file}에서 코드를 못 찾았습니다 (${startMark} … ${endMark}). 이름이 바뀌었나요?`);
    process.exit(1);
  }
  const ctx = { module: {}, console, ...sandbox };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + "\n" + tail, ctx);
  return ctx.module.exports;
}

// 1) 자르는 함수
const breakOne = extract("editor-tools.js", "const BREAK_LIMIT", "function runLineBreak", "module.exports = breakOne;");

// 2) 원고 넣기 쪽의 자동 자르기 판단
const splitLongText = extract(
  "draft-insert.js",
  "const B = typeof window",
  "const blocksOut = [];",
  "module.exports = splitLongText;",
  { window: { __wsBreak: { breakOne, BREAK_LIMIT: 45, BREAK_TARGET: 22 } } }
);

const LONG =
  "어제 인천공항 출국길에서 포착된 모습인데요 입고 있던 자켓 가격이 무려 800만원대라는 " +
  "이야기가 나오면서 더 화제가 되고 있는 상황이라 팬들 반응도 뜨겁습니다";

(async () => {
  console.log("\n[1] 긴 문단은 잘린다");
  const out = splitLongText({ kind: "text", text: LONG });
  ok(out.length > 1, "여러 조각으로 잘렸다", `${out.length}조각`);
  ok(out.every((b) => b.text.length <= 45), "모든 조각이 45자 이하", out.map((b) => b.text.length).join("/"));
  ok(out.every((b) => b.kind === "text"), "조각도 전부 본문 문단이다");

  // 글자가 바뀌면 안 됩니다 — 자를 뿐입니다.
  const strip = (s) => s.replace(/\s/g, "");
  ok(strip(out.map((b) => b.text).join("")) === strip(LONG), "글자는 하나도 안 바뀌었다  ← 제일 중요");

  console.log("\n[2] 짧은 문단·본문 아닌 것은 그대로 둔다");
  ok(splitLongText({ kind: "text", text: "짧은 문장이에요." }).length === 1, "45자 이하는 안 자른다");
  ok(splitLongText({ kind: "subhead", text: LONG }).length === 1, "소제목은 안 자른다");
  ok(splitLongText({ kind: "photo", text: LONG }).length === 1, "사진 자리는 안 자른다");
  ok(splitLongText({ kind: "text", text: "" }).length === 1, "빈 문단에서 안 터진다");

  console.log("\n[3] 자르면 서식이 깨지는 경우는 안 자른다  ← 절반의 목적");
  // 표기가 조각 사이에서 끊기는 경우
  const marked = { kind: "text", text: LONG.slice(0, 40) + "[강조]" + LONG.slice(40) + "[/강조]" };
  const r1 = splitLongText(marked);
  const balanced = (s) => (s.split("[강조]").length - 1) === (s.split("[/강조]").length - 1);
  ok(r1.length === 1 || r1.every((b) => balanced(b.text)),
    "서식 표기가 반쪽만 남는 문단은 자르지 않는다", `${r1.length}조각`);

  // 굵게 표시가 두 조각에 걸치는 경우
  const spanMark = LONG.slice(30, 60);          // 자를 자리를 가로지르는 긴 표시
  const r2 = splitLongText({ kind: "text", text: LONG, marks: [spanMark] });
  ok(r2.length === 1, "굵게 표시가 조각에 걸치면 자르지 않는다  (걸치면 서식이 조용히 사라짐)");

  // 한 조각 안에 들어가는 표시는 자르되, 그 조각만 표시를 들고 간다
  const inner = "800만원대";
  const r3 = splitLongText({ kind: "text", text: LONG, marks: [inner] });
  ok(r3.length > 1, "한 조각 안에 들어가는 표시면 자른다", `${r3.length}조각`);
  const holders = r3.filter((b) => (b.marks || []).includes(inner));
  ok(holders.length === 1 && holders[0].text.includes(inner),
    "표시는 그 글자가 실제로 있는 조각만 들고 간다");
  ok(r3.filter((b) => (b.marks || []).length === 0).length === r3.length - 1,
    "나머지 조각은 빈 표시 목록을 갖는다  (엉뚱한 곳에 굵게 방지)");

  console.log("\n[4] 자르는 규칙이 줄바꿈 버튼과 같은가");
  const viaButton = breakOne(LONG);
  const viaInsert = splitLongText({ kind: "text", text: LONG }).map((b) => b.text);
  ok(JSON.stringify(viaButton) === JSON.stringify(viaInsert),
    "버튼으로 자른 결과와 넣을 때 자른 결과가 같다", `${viaButton.length}조각`);

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
