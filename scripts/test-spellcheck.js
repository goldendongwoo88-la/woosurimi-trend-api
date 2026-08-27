/**
 * 맞춤법 검사 시험.
 *
 * ⚠️ 두 가지를 봅니다.
 *   1) 틀린 말을 잡는가
 *   2) **맞는 말을 안 건드리는가**  ← 이게 더 중요합니다.
 *      맞춤법 도구가 멀쩡한 문장에 빨간 줄을 그으면 아무도 안 씁니다.
 */
const S = require("../src/spellCheck");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => { console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`); c ? pass++ : fail++; };

// ── 잡아야 하는 것 ───────────────────────────────────────
console.log("\n── 틀린 말을 잡는가 ──");
const SHOULD_CATCH = [
  ["그때 참 잘됬어요", "됐"],
  ["내일 봬요가 아니라 뵈요라고 썼습니다", "봬요"],
  ["몇일 동안 고민했어요", "며칠"],
  ["오랫만에 만났습니다", "오랜만"],
  ["진짜 어의없네요", "어이없"],
  ["역활이 중요합니다", "역할"],
  ["희안하게 잘 맞아요", "희한하"],
  ["설레임이 가득한 하루", "설렘"],
  ["갯수를 세어봤습니다", "개수"],
  ["금새 다 팔렸어요", "금세"],
  ["이거 어떻해요", "어떡해"],
  ["왠만하면 참으세요", "웬만"],
  ["웬지 기분이 좋네요", "왠지"],
  ["여기 있읍니다", "있습니다"],
  ["그러면 않되죠", "안 되"],
  ["할수있어요", "할 수"],
  ["갈것같아요", "것 같"],
  ["내일 갈께요", "갈게요"],
  ["제가 할께", "할게"],
  ["빨리 낳으세요", "나으세요"],
  ["김치를 담궈 먹어요", "담가"],
  ["문을 잠궈 주세요", "잠가"],
  ["몇번이나 물어봤어요", "몇 번"],
];
for (const [text, want] of SHOULD_CATCH) {
  const r = S.check(text);
  const hit = r.issues.some((i) => i.suggest.includes(want)) || r.fixed.includes(want);
  ok(hit, `"${text}"`, hit ? `→ ${r.issues.map((i) => i.suggest).join(", ")}` : `${want}을(를) 못 잡음`);
}

// ── 절대 건드리면 안 되는 것 ─────────────────────────────
console.log("\n── 맞는 말을 안 건드리는가 ──");
const SHOULD_PASS = [
  "선생님께 여쭤봤어요",          // ㄹ 받침이 아님 → 께 그대로
  "부모님께서 오셨습니다",
  "어머니께요? 네 그렇습니다",
  "오랫동안 기다렸어요",          // 오랫동안은 맞는 말
  "그렇게 하면 됩니다",
  "어떻게 하면 좋을까요",         // 어떻게는 맞는 말
  "여기 있습니다",
  "얼마나 춥던지 손이 얼었어요",   // -던지(과거 회상)는 맞음
  "안되는 일은 없습니다",         // 붙여쓰기가 맞는 경우도 있음 — sure:false라 고치진 않음
  "학생으로서 할 일을 했습니다",
  "한 번 더 해볼게요",
  "한번 해볼까요",
  "이번 주에 며칠 쉽니다",
  "개수가 몇 개인가요",
  "설렘이 가득했어요",
  "눈에 띄는 색이었어요",
  "빨간색을 띠고 있어요",
];
for (const text of SHOULD_PASS) {
  const r = S.check(text);
  const bad = r.issues.filter((i) => i.sure);
  ok(bad.length === 0 && !r.changed, `"${text}"`,
    bad.length ? `잘못 잡음: ${bad.map((i) => i.found + "→" + i.suggest).join(", ")}` : "");
}

// ── 받침 계산 ────────────────────────────────────────────
console.log("\n── 받침 계산 ──");
ok(S.finalOf("할") === "ㄹ", "'할'의 받침은 ㄹ", S.finalOf("할"));
ok(S.finalOf("님") === "ㅁ", "'님'의 받침은 ㅁ", S.finalOf("님"));
ok(S.finalOf("가") === "", "'가'는 받침 없음", JSON.stringify(S.finalOf("가")));
ok(S.finalOf("A") === null, "한글이 아니면 null");

// ── 진짜 글로 (헛경보가 얼마나 나오나) ───────────────────
const CACHE = path.join(__dirname, "..", "scratch-paragraphs.json");
if (fs.existsSync(CACHE)) {
  console.log("\n── 실제 블로그 글에서 ──");
  const all = JSON.parse(fs.readFileSync(CACHE, "utf8"));
  for (const [id, posts] of Object.entries(all)) {
    const text = posts.flat().join("\n");
    const r = S.check(text);
    const byRule = {};
    for (const i of r.issues) byRule[i.id] = (byRule[i.id] || 0) + 1;
    console.log(`  ${id}: ${text.length.toLocaleString()}자 · 확실 ${r.sureCount}건 · 참고 ${r.maybeCount}건`);
    const top = Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) console.log("    " + top.map(([k, v]) => `${k} ${v}`).join(" · "));
    for (const i of r.issues.filter((x) => x.sure).slice(0, 4)) {
      console.log(`    → ${i.around.before}[${i.found}]${i.around.after}`.replace(/\n/g, " "));
      console.log(`       ${i.suggest} — ${i.why}`);
    }
  }
} else {
  console.log("\n(scratch-paragraphs.json이 없어 실제 글 검사는 건너뜁니다)");
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
