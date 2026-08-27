/**
 * 대화 캐시가 **진짜로** 먹히는지 API에 물어봅니다.
 *
 * ⚠️ 앞선 시험(test-msg-cache.js)은 "표시를 제대로 붙였나"만 봅니다.
 * 표시를 붙여도 API가 안 받아주면 아무 의미가 없습니다. 실제로 걸어봅니다.
 *
 * ⚠️ 7단계를 사람이 밟는 걸 흉내 냅니다. 대화가 늘어날수록
 * 캐시로 읽는 양이 늘어나야 합니다. 안 늘어나면 안 먹히는 것입니다.
 *
 * ⚠️ 값: 약 40원. 시스템 프롬프트를 일부러 작게(2,000토큰) 잡았습니다.
 */
const C = require("../src/claudeClient");
const KRW = 1380;

const SYSTEM =
  "당신은 블로그 글을 돕는 편집자입니다. 아래 지침을 따릅니다.\n" +
  Array.from({ length: 70 }, (_, i) =>
    `${i + 1}. 문단은 짧게 씁니다. 한 문단에 문장 하나만 넣습니다. 마침표를 찍으면 줄을 바꿉니다.`
  ).join("\n");

// 사장님이 처음에 넣으실 만한 긴 입력 — 여기가 캐시에 걸려야 합니다.
const FIRST = "아래 글을 다듬어 주세요.\n\n" +
  Array.from({ length: 60 }, (_, i) =>
    `${i + 1}번째 문단입니다. 가을 코트를 하나 샀는데 색이 베이지라 밝고 원단이 도톰해서 겨울에도 입을 만했습니다.`
  ).join("\n");

(async () => {
  if (!C.isConfigured()) { console.log("서버에 AI 열쇠가 없습니다."); process.exit(1); }

  console.log(`\n시스템 ${SYSTEM.length.toLocaleString()}자 · 첫 입력 ${FIRST.length.toLocaleString()}자\n`);

  let pass = 0, fail = 0, spent = 0;
  const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

  const conv = [];
  const seen = [];

  const step = async (say, label) => {
    conv.push({ role: "user", content: say });
    let reply;
    try {
      reply = await C.callClaude({
        system: SYSTEM, messages: conv, maxTokens: 40, cache: "long", feature: "대화캐시 시험",
      });
    } catch (e) { console.log("  ✗ 실패:", e.message); process.exit(1); }
    const u = C.getLastUsage();
    spent += u.usd;
    seen.push(u);
    console.log(`  ${label}  입력 ${u.input} · 캐시쓰기 ${u.cacheWrite} · 캐시읽기 ${u.cacheRead} · ${Math.round(u.usd * KRW * 100) / 100}원`);
    conv.push({ role: "assistant", content: reply });
    return u;
  };

  console.log("━━ 7단계 흉내 (한 단계씩 이어서) ━━");
  const u1 = await step(FIRST, "1단계");
  await new Promise((r) => setTimeout(r, 1200));
  const u2 = await step("좋습니다. 다음 단계로 소제목을 뽑아주세요.", "2단계");
  await new Promise((r) => setTimeout(r, 1200));
  const u3 = await step("그중 첫 번째로 본문을 써주세요.", "3단계");

  console.log("\n━━ 확인 ━━");
  ok(u1.cacheWrite > 0, "1단계에서 캐시에 넣었다", `${u1.cacheWrite} 토큰`);
  ok(u2.cacheRead > 0, "2단계에서 캐시를 읽었다", `${u2.cacheRead} 토큰`);

  // ⚠️ 여기가 핵심입니다. 시스템만 캐시하면 읽는 양이 **안 늘어납니다.**
  // 대화까지 캐시해야 단계가 갈수록 읽는 양이 늘어납니다.
  ok(u3.cacheRead > u2.cacheRead,
     "3단계는 2단계보다 더 많이 읽었다  ← 대화까지 캐시된 증거",
     `${u2.cacheRead} → ${u3.cacheRead} 토큰`);

  // 대화가 캐시 안 됐다면 input(제값 내는 토큰)이 계속 늘었을 것입니다.
  ok(u3.input < 200,
     "제값 내는 토큰이 거의 없다  ← 대화가 캐시로 넘어갔다는 뜻",
     `1단계 ${u1.input} → 2단계 ${u2.input} → 3단계 ${u3.input}`);

  console.log(`\n  이 시험에 쓴 값: 약 ${Math.round(spent * KRW)}원`);
  console.log(`  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
