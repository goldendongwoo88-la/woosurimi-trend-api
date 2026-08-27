/**
 * 원고 한 편에 얼마가 드는가 — 캐시를 고친 뒤 다시 계산합니다.
 *
 * ⚠️ 왜 다시 재는가
 * 예전에 "프로 29,900원 요금제가 크레딧을 다 쓰면 288,610원 든다"고 말씀드렸습니다.
 * 그 뒤로 두 가지를 고쳤습니다 — 시스템 프롬프트 캐시, 대화 캐시.
 * 값이 달라졌으니 요금제도 다시 봐야 합니다.
 *
 * ⚠️ 실측에 기댄 숫자만 씁니다. 찍은 값은 그렇다고 적어둡니다.
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */

const KRW = 1380;
// Sonnet 100만 토큰당 (달러)
const IN = 3, OUT = 15, READ = 0.30, W5 = 3.75, W1H = 6;

const won = (usd) => Math.round(usd * KRW);
const fmt = (n) => n.toLocaleString();

// 실측한 스킬 크기 (scripts 로 잰 값)
const SKILLS = { 큰것: 41654, 중간: 26436, 작은것: 6926 };
const STAGES = 7;
const OUT_PER = 2200;    // 한 단계에 AI가 쓰는 양
const USER_PER = 200;    // 사장님이 치시는 양

/**
 * 한 사람이 원고 한 편을 만들 때.
 * @param sys 스킬 크기(토큰)
 * @param cached 캐시가 살아 있나
 * @param firstUser 이 사람이 이 스킬의 캐시를 처음 만드나
 */
function onePost(sys, { cached, firstUser = true }) {
  let usd = 0;
  // ── 시스템 프롬프트 ──
  if (!cached) {
    usd += (sys * STAGES * IN) / 1e6;            // 매 단계 제값
  } else {
    if (firstUser) usd += (sys * W1H) / 1e6;     // 처음 한 번만 캐시에 씀
    usd += (sys * (firstUser ? STAGES - 1 : STAGES) * READ) / 1e6;
  }
  // ── 대화 내용 (단계마다 쌓입니다) ──
  let acc = 0;
  for (let n = 1; n <= STAGES; n++) {
    if (acc) usd += cached ? (acc * READ) / 1e6 : (acc * IN) / 1e6;
    acc += USER_PER + OUT_PER;
    if (cached) usd += ((USER_PER + OUT_PER) * W1H) / 1e6;
  }
  // ── AI가 쓴 글 (이건 절대 안 깎입니다) ──
  usd += (OUT_PER * STAGES * OUT) / 1e6;
  return usd;
}

console.log("\n원고 한 편 (7단계) — 스킬 크기별\n");
console.log("  스킬          예전(캐시없음)   지금(캐시)    아낀 값");
console.log("  ─────────────────────────────────────────────────");
for (const [name, sys] of Object.entries(SKILLS)) {
  const before = onePost(sys, { cached: false });
  const after = onePost(sys, { cached: true });
  console.log(
    `  ${name.padEnd(8)} ${fmt(sys).padStart(7)}토큰  ${(fmt(won(before)) + "원").padStart(9)}  ${(fmt(won(after)) + "원").padStart(9)}  ${(fmt(won(before - after)) + "원").padStart(8)}`
  );
}

console.log("\n\n⚠️ 손님이 여럿이면 더 쌉니다");
console.log("  캐시는 **계정 단위**입니다. 같은 스킬을 1시간 안에 여러 손님이 쓰면");
console.log("  캐시에 넣는 값은 처음 한 번만 냅니다.\n");
const sys = SKILLS.중간;
console.log("  중간 스킬(26,436토큰) 기준, 1시간 안에 원고 몇 편이 나오느냐:");
for (const n of [1, 3, 10, 30]) {
  const total = onePost(sys, { cached: true, firstUser: true }) +
                onePost(sys, { cached: true, firstUser: false }) * (n - 1);
  console.log(`    ${String(n).padStart(2)}편 → 합계 ${fmt(won(total)).padStart(6)}원 · 한 편당 ${fmt(won(total / n)).padStart(5)}원`);
}

console.log("\n\n요금제 — 실제로 정해둔 한도로 계산합니다");
console.log("  ⚠️ 예전 계산(288,610원)은 '크레딧 무제한'을 가정한 것이었습니다.");
console.log("     실제로는 plans.js에 하루 크레딧 한도가 있습니다. 그걸로 다시 봅니다.\n");

const { PLANS, CREDIT_COST } = require("../src/plans");
const perPostHot = won(onePost(SKILLS.중간, { cached: true, firstUser: false }));
const perPostCold = won(onePost(SKILLS.중간, { cached: true, firstUser: true }));
console.log(`  원고 한 편: 캐시 살아있으면 ${perPostHot}원 · 식었으면 ${perPostCold}원`);
console.log(`  (원고 한 편 = ${CREDIT_COST.draft}크레딧)\n`);

console.log("  요금제      값       하루한도   한달 최대   원가(따뜻)  원가(식음)   남는 값");
console.log("  ──────────────────────────────────────────────────────────────────────");
for (const p of Object.values(PLANS)) {
  const perDay = (p.limits.aiCredits && p.limits.aiCredits.perDay) || 0;
  if (!perDay) { console.log(`  ${p.name.padEnd(8)} ${fmt(p.price).padStart(6)}원      0        —          —          —          —`); continue; }
  const postsMonth = (perDay / CREDIT_COST.draft) * 30;
  const hot = postsMonth * perPostHot;
  const cold = postsMonth * perPostCold;
  const net = p.price * 0.967;               // 결제 수수료 3.3% 뺌
  const left = net - cold;                   // 나쁜 쪽(식은 캐시)으로 봅니다
  console.log(
    `  ${p.name.padEnd(8)} ${fmt(p.price).padStart(6)}원   ${String(perDay).padStart(4)}개   ${postsMonth.toFixed(0).padStart(5)}편   ${(fmt(Math.round(hot)) + "원").padStart(9)}  ${(fmt(Math.round(cold)) + "원").padStart(9)}  ${((left >= 0 ? "+" : "") + fmt(Math.round(left)) + "원").padStart(10)}`
  );
}

console.log("\n  ⚠️ 위는 **한도를 매일 꽉 채워 원고만 뽑는** 손님을 가정한 것입니다.");
console.log("     실제로 그런 손님은 드뭅니다. 다만 **한 명만 있어도** 그만큼 잃습니다.\n");

console.log("  마진이 남으려면 하루 크레딧이 몇 개여야 하나 (식은 캐시 기준):");
for (const p of Object.values(PLANS)) {
  if (!p.price) continue;
  const net = p.price * 0.967;
  const safeCredits = Math.floor((net / 30 / perPostCold) * CREDIT_COST.draft);
  const now = (p.limits.aiCredits && p.limits.aiCredits.perDay) || 0;
  const ok = safeCredits >= now;
  console.log(
    `    ${p.name.padEnd(8)} 지금 ${String(now).padStart(3)}개 → 본전이 ${String(safeCredits).padStart(3)}개  ${ok ? "✓ 남습니다" : `✗ ${now - safeCredits}개 초과`}` +
    (ok ? "" : `  (원고 ${(safeCredits / CREDIT_COST.draft).toFixed(1)}편/일까지)`)
  );
}

console.log("\n\n⚠️ 이 계산이 기대는 가정 — 틀리면 결론도 틀립니다");
console.log("  1. 캐시가 살아 있다 = 1시간 안에 그 스킬을 또 씁니다.");
console.log("     손님이 하루 한 편만 쓰면 매번 캐시에 새로 넣습니다. 그럼 한 편에");
console.log(`     ${won(onePost(SKILLS.중간, { cached: true, firstUser: true }))}원입니다.`);
console.log("  2. 7단계를 다 밟는다고 봤습니다. 중간에 그만두면 덜 나갑니다.");
console.log("  3. 한 단계에 2,200토큰을 쓴다고 봤습니다. 실측이 아니라 max_tokens 값입니다.");
console.log("  4. 큰 스킬 5개(intro-promo·food-review·travel-review·living-life·broadcast-issue)는");
console.log("     사장님이 부르지 말라고 하셔서 제 작업엔 안 씁니다. 다만 **손님이 쓰면** 값이 납니다.");
console.log(`     living-life 한 편이면 캐시 없을 때 ${fmt(won(onePost(SKILLS.큰것, { cached: false })))}원입니다.`);
console.log("\n  진짜 값은 Anthropic 콘솔에 있습니다. 이건 어림입니다.\n");
