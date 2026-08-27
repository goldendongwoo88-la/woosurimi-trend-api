/**
 * 실패했을 때 크레딧이 나가는지 봅니다.
 *
 * ⚠️ 이걸 왜 따로 시험하냐면 — 같은 실수를 두 번 했습니다.
 * 첫 번째는 사용량(gate)에서, 두 번째는 자동 썸네일 크레딧에서.
 * 둘 다 "통과하면 바로 깎고, 그 뒤에 400을 내는" 구조였습니다.
 * 사장님은 아무것도 못 받고 하루 몫만 잃습니다. 앞으로는 여기서 걸립니다.
 */
const usage = require("../src/usage");

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

// 가짜 요청/응답
function mkReq(email = "test@x.com", plan = "pro") {
  return { user: { email, plan }, headers: {}, ip: "1.2.3.4" };
}
function mkRes() {
  const r = { code: 0, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const creditsOf = (req) => (usage.summary(req).items.aiCredits || {}).used || 0;

console.log("\n── 크레딧을 미리 깎지 않는가 ──");
{
  const req = mkReq("nocharge@x.com");
  const before = creditsOf(req);

  // consumeOnPass를 끈 게이트 — 통과해도 안 깎여야 합니다.
  const gate = usage.creditGate("thumbAuto", null, { consumeOnPass: false });
  let passed = false;
  gate(req, mkRes(), () => { passed = true; });
  ok(passed, "게이트를 통과한다");
  ok(creditsOf(req) === before, "통과만 했을 뿐 아직 안 깎였다", `${before} → ${creditsOf(req)}`);

  // 여기서 일이 실패했다고 치고 그냥 끝냅니다 — 여전히 안 깎여야 합니다.
  ok(creditsOf(req) === before, "실패로 끝나도 크레딧이 그대로다", `${creditsOf(req)}`);

  // 성공했을 때만 깎습니다.
  usage.chargeCredits(req, "thumbAuto");
  ok(creditsOf(req) === before + 2, "성공하면 2가 깎인다", `${before} → ${creditsOf(req)}`);
}

console.log("\n── 옛 방식(consumeOnPass 기본)은 그대로 동작하는가 ──");
{
  const req = mkReq("normal@x.com");
  const before = creditsOf(req);
  const gate = usage.creditGate("title", null);
  gate(req, mkRes(), () => {});
  ok(creditsOf(req) === before + 1, "기본은 통과 즉시 깎인다 (기존 기능 그대로)", `${before} → ${creditsOf(req)}`);
}

console.log("\n── 한도를 넘기면 막는가 ──");
{
  const req = mkReq("broke@x.com", "light");
  const perDay = require("../src/plans").getPlan("light").limits.aiCredits.perDay;
  // 한도까지 채웁니다
  for (let i = 0; i < perDay; i++) usage.chargeCredits(req, "title");
  const res = mkRes();
  let called = false;
  usage.creditGate("thumbAuto", null, { consumeOnPass: false })(req, res, () => { called = true; });
  ok(!called && res.code === 429, "다 쓰면 429로 막는다", `${res.code}`);
  ok(res.body && res.body.cost === 2, "이 작업에 몇 개 필요한지 알려준다", `${res.body && res.body.cost}`);
}

console.log("\n── 로그인 안 했으면 ──");
{
  const req = { user: null, headers: {}, ip: "9.9.9.9" };
  const res = mkRes();
  let called = false;
  usage.creditGate("thumbAuto", null, { consumeOnPass: false })(req, res, () => { called = true; });
  ok(!called && res.code === 401, "401로 막고 가입 화면을 알려준다", res.body && res.body.login);
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
