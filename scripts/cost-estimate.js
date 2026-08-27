/**
 * AI 값이 얼마나 나가는지 실제 프롬프트 크기로 계산합니다.
 *
 * ⚠️ 감으로 말하면 안 됩니다. plans.js에 "원고 1건에 70~100원"이라고
 * 적어뒀는데, 실제로 프롬프트를 재보니 큰 스킬은 **330원**이었습니다.
 * 3~4배 틀린 값으로 요금제를 짜고 있었습니다.
 *
 * ⚠️ 여기 값은 Sonnet 4.5 기준입니다. 모델을 바꾸면 다시 계산해야 합니다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 100만 토큰당 달러 (Anthropic 공개가, Sonnet 4.5)
const PRICE = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 };
const USD = 1380;   // 원/달러 — 대략입니다

// 한글은 글자당 토큰이 영어보다 많습니다. 1.5로 잡습니다.
const tok = (chars) => Math.round(chars * 1.5);

// 스킬 프롬프트 크기 재기
const M = { exports: {} };
const ctx = {
  require: (id) => require(id.startsWith(".") ? path.join(__dirname, "..", "src", id) : id),
  module: M, exports: M.exports, __dirname: path.join(__dirname, "..", "src"), console, process,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "promptStudio.js"), "utf8") +
  "\nmodule.exports.loadSkillPrompt = loadSkillPrompt;", ctx);
const load = M.exports.loadSkillPrompt;

/**
 * ⚠️ 큰 스킬 다섯은 **불러오지 않습니다.** 사장님 명령입니다.
 * 크기는 알아야 하니 **파일 크기만** 잽니다(fs.statSync). 내용은 안 읽습니다.
 * 덧대는 부분(homefeedPatch)은 작은 스킬에서 잰 평균으로 더합니다.
 */
const SKIP = require("../src/promptStudio").SKIP_IN_TOOLING;
const dir = path.join(__dirname, "..", "src", "promptSkills");
const skills = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => f.replace(".txt", ""));

// 작은 스킬 하나로 덧대는 분량을 재둡니다.
const sample = skills.find((s) => !SKIP.has(s));
const patchChars = load(sample).length - fs.statSync(path.join(dir, sample + ".txt")).size;

const sizes = skills.map((s) => {
  const raw = SKIP.has(s)
    ? Math.round(fs.statSync(path.join(dir, s + ".txt")).size / 3)  // UTF-8 한글은 글자당 3바이트
    : load(s).length - patchChars;
  return { id: s, tokens: tok(raw + patchChars), skipped: SKIP.has(s) };
}).sort((a, b) => b.tokens - a.tokens);
const big = sizes[0], small = sizes[sizes.length - 1];
const mid = sizes[Math.floor(sizes.length / 2)];

/** 한 번 부를 때 값 */
function costOnce(inTok, outTok, cached) {
  const p = cached
    ? (inTok * PRICE.cacheRead + outTok * PRICE.output) / 1e6
    : (inTok * PRICE.input + outTok * PRICE.output) / 1e6;
  return { usd: p, krw: Math.round(p * USD) };
}

console.log("\n━━ 스킬 프롬프트 크기 (부를 때마다 통째로 나갑니다) ━━");
for (const s of sizes.slice(0, 5)) console.log(`  ${s.id.padEnd(20)} ${s.tokens.toLocaleString().padStart(8)} 토큰${s.skipped ? "  (파일 크기로만 잼 — 안 부름)" : ""}`);
console.log(`  ${"…".padEnd(20)}`);
console.log(`  ${small.id.padEnd(20)} ${small.tokens.toLocaleString().padStart(8)} 토큰 (제일 작음)`);

console.log("\n━━ 원고 1편 값 (출력 3,000토큰 가정) ━━");
console.log("                        캐시 없음      캐시 있음     아끼는 값");
for (const s of [big, mid, small]) {
  const no = costOnce(s.tokens, 3000, false);
  const yes = costOnce(s.tokens, 3000, true);
  const save = Math.round((1 - yes.krw / no.krw) * 100);
  console.log(`  ${s.id.padEnd(20)} ${(no.krw + "원").padStart(10)} ${(yes.krw + "원").padStart(12)}     ${save}%`);
}

console.log("\n━━ 다른 기능들 ━━");
const others = [
  ["홈판 제목 뽑기", 2000, 1200],
  ["홈판 본문 다듬기", 3000, 4000],
  ["자동 서식(강조)", 3000, 2500],
  ["자동 썸네일(사진 12장)", 3500, 800],
  ["자료 조사", 6000, 3000],
];
for (const [name, i, o] of others) {
  const c = costOnce(i, o, false);
  console.log(`  ${name.padEnd(24)} ${(c.krw + "원").padStart(8)}`);
}

console.log("\n━━ 한 달에 얼마나 드나 ━━");
const midNo = costOnce(mid.tokens, 3000, false).krw;
const midYes = costOnce(mid.tokens, 3000, true).krw;
const CASES = [
  ["사장님 혼자 (하루 5편)", 5 * 30],
  ["손님 10명 (각 하루 3편)", 10 * 3 * 30],
  ["손님 30명 (각 하루 3편)", 30 * 3 * 30],
  ["손님 100명 (각 하루 3편)", 100 * 3 * 30],
];
console.log("                            캐시 없음        캐시 있음");
for (const [label, n] of CASES) {
  console.log(`  ${label.padEnd(24)} ${((n * midNo).toLocaleString() + "원").padStart(12)} ${((n * midYes).toLocaleString() + "원").padStart(14)}`);
}

console.log("\n━━ 요금제와 견주면 ━━");
const plans = require("../src/plans");
for (const p of plans.listPlans()) {
  if (!p.price) continue;
  const credits = p.limits.aiCredits.perDay;
  // draft가 3크레딧이니 하루 최대 원고 수
  const maxDrafts = Math.floor(credits / plans.CREDIT_COST.draft);
  const monthNo = maxDrafts * 30 * midNo;
  const monthYes = maxDrafts * 30 * midYes;
  const okNo = monthNo <= p.price;
  const okYes = monthYes <= p.price;
  console.log(
    `  ${p.name.padEnd(8)} ${(p.price.toLocaleString() + "원").padStart(9)} · 하루 원고 최대 ${String(maxDrafts).padStart(2)}편 → ` +
    `원가 ${(monthNo.toLocaleString() + "원").padStart(9)} ${okNo ? "✓" : "✗ 밑짐"}  ` +
    `캐시 시 ${(monthYes.toLocaleString() + "원").padStart(8)} ${okYes ? "✓" : "✗ 밑짐"}`
  );
}

console.log("\n  ⚠️ '밑짐'은 그 요금제 손님이 크레딧을 **다 쓰면** 손해라는 뜻입니다.");
console.log("     실제로는 다 쓰는 사람이 드물지만, 한 명이라도 그러면 그 사람에게서는 잃습니다.");
