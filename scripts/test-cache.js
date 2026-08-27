/**
 * 프롬프트 캐시가 **실제로** 먹히는지 잽니다.
 *
 * ⚠️ "캐시 넣었습니다"라고 말만 하고 실제로 안 되면 아무 의미가 없습니다.
 * 두 번 부르고 두 번째에 cache_read가 잡히는지 봅니다.
 *
 * ⚠️ 값: 시스템 프롬프트 약 2,000토큰 × 2회 + 출력 10토큰 × 2회
 *    첫 번째(캐시 쓰기) 약 10원 + 두 번째(캐시 읽기) 약 1원 = **약 11원**
 */
const C = require("../src/claudeClient");

const KRW = 1380;
const money = (u) => `${Math.round(u.usd * KRW)}원`;

// 캐시가 걸리려면 1,024토큰이 넘어야 합니다. 넉넉히 만듭니다.
const SYSTEM =
  "당신은 블로그 글을 돕는 편집자입니다.\n" +
  "아래는 지침입니다. 길게 적어둡니다 — 캐시가 걸리는지 보려는 것입니다.\n" +
  Array.from({ length: 60 }, (_, i) =>
    `${i + 1}. 문단은 짧게 씁니다. 한 문단에 문장 하나만 넣습니다. ` +
    `45자를 넘기지 않습니다. 마침표를 찍으면 줄을 바꿉니다.`
  ).join("\n");

(async () => {
  if (!C.isConfigured()) { console.log("서버에 AI 열쇠가 없습니다."); process.exit(1); }

  console.log(`\n시스템 프롬프트 ${SYSTEM.length.toLocaleString()}자 (약 ${Math.round(SYSTEM.length * 1.5).toLocaleString()} 토큰)\n`);

  let pass = 0, fail = 0;
  const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

  // ── 첫 번째: 캐시에 씁니다 ──
  // ⚠️ 스킬처럼 사람이 천천히 밟는 경우를 흉내 냅니다 → 1시간 캐시
  console.log("━━ 첫 번째 (1시간 캐시에 넣기) ━━");
  try {
    await C.callClaude({ system: SYSTEM, messages: [{ role: "user", content: "안녕" }], maxTokens: 10, cache: "long" });
  } catch (e) {
    console.log("  ✗ 실패:", e.message);
    process.exit(1);
  }
  const u1 = C.getLastUsage();
  console.log(`    입력 ${u1.input} · 출력 ${u1.output} · 캐시쓰기 ${u1.cacheWrite} · 캐시읽기 ${u1.cacheRead} · ${money(u1)}`);
  ok(u1.cacheWrite > 0, "캐시에 넣었다", `${u1.cacheWrite} 토큰`);

  // ── 두 번째: 캐시를 읽어야 합니다 ──
  console.log("\n━━ 두 번째 (캐시 읽기) ━━");
  await new Promise((r) => setTimeout(r, 1500));
  try {
    await C.callClaude({ system: SYSTEM, messages: [{ role: "user", content: "반가워" }], maxTokens: 10, cache: "long" });
  } catch (e) {
    console.log("  ✗ 실패:", e.message);
    process.exit(1);
  }
  const u2 = C.getLastUsage();
  console.log(`    입력 ${u2.input} · 출력 ${u2.output} · 캐시쓰기 ${u2.cacheWrite} · 캐시읽기 ${u2.cacheRead} · ${money(u2)}`);
  ok(u2.cacheRead > 0, "캐시를 읽었다  ← 이게 핵심", `${u2.cacheRead} 토큰`);
  ok(u2.usd < u1.usd, "두 번째가 더 쌌다", `${money(u1)} → ${money(u2)}`);

  if (u2.cacheRead > 0) {
    const save = Math.round((1 - u2.usd / u1.usd) * 100);
    console.log(`\n  두 번째부터 ${save}% 쌉니다.`);
    // 실제 스킬 크기로 환산
    const skillTok = 55000, stages = 7, outPer = 2200;
    const noCache = ((skillTok * stages * 3 + outPer * stages * 15) / 1e6) * KRW;
    const withCache = ((skillTok * 3.75 + skillTok * (stages - 1) * 0.3 + outPer * stages * 15) / 1e6) * KRW;
    console.log(`  실제 스킬(55,000토큰 × 7단계)로 치면:`);
    console.log(`    캐시 없음 ${Math.round(noCache).toLocaleString()}원 → 캐시 있음 ${Math.round(withCache).toLocaleString()}원`);
  }

  const spent = u1.usd + u2.usd;
  console.log(`\n  이 시험에 쓴 값: 약 ${Math.round(spent * KRW)}원`);
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
