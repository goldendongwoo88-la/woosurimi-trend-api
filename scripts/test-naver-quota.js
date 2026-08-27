/**
 * 네이버 오픈API 한도 — 다 쓴 걸 기억하고, 자정에 잊는가.
 *
 * ⚠️ 왜 필요한가
 * /api/keyword/status 가 "search: true, ready: true" 라고 답했습니다.
 * 그런데 실제로 부르면 429였습니다: "일별 사용량 한도가 초과하였습니다."
 * 화면은 준비됐다고 하는데 눌러보면 빈칸이 나옵니다.
 *
 * 크레딧이 0인데 "AI 준비됨"이라고 하던 것과 같은 종류입니다.
 * **열쇠가 있는 것**과 **지금 쓸 수 있는 것**은 다릅니다.
 *
 * ⚠️ 네이버를 실제로 부르지 않습니다. 값이 0원이고 할당량도 안 씁니다.
 */
const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

/** 실제 파일에서 한도 기억 부분만 떼어내 돌립니다. 베껴 적으면 언젠가 어긋납니다. */
function loadQuota(nowMs) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "naverBlogSearch.js"), "utf8");
  const grab = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(`원본에서 ${what}를 못 찾았습니다`);
    return m[0];
  };
  const parts =
    grab(/let quota = [\s\S]*?;/, "quota") +
    grab(/const kstDay[\s\S]*?;/, "kstDay") +
    grab(/function noteQuota[\s\S]*?\n}/, "noteQuota") +
    grab(/function quotaStatus[\s\S]*?\n}/, "quotaStatus");
  // 날짜를 갈아끼울 수 있게 Date.now 를 넘겨받습니다.
  return new Function("__now", `const Date_now = Date.now; ${
    nowMs ? "Date.now = () => __now;" : ""
  } ${parts} return { noteQuota, quotaStatus, restore: () => { Date.now = Date_now; } };`)(nowMs);
}

console.log("\n━━ 한도를 넘기면 기억하는가 ━━");
{
  const q = loadQuota();
  ok(q.quotaStatus().exhausted === false, "처음엔 안 막힘");

  q.noteQuota(429, '{"error":{"errorCode":429,"message":"일별 사용량 한도가 초과하였습니다."}}');
  const s = q.quotaStatus();
  ok(s.exhausted === true, "429를 만나면 막혔다고 기억한다");
  ok(!!s.note && /자정/.test(s.note), "언제 풀리는지 알려준다", s.note);
  ok(!!s.at, "언제 막혔는지도 남긴다");
  q.restore();
}

console.log("\n━━ 한도가 아닌 오류는 무시하는가 ━━");
// ⚠️ 서버가 잠깐 500을 줬다고 "하루 다 썼다"고 하면 안 됩니다.
// 멀쩡한데 하루 종일 못 쓰게 됩니다.
{
  const q = loadQuota();
  q.noteQuota(500, "Internal Server Error");
  ok(q.quotaStatus().exhausted === false, "500은 한도가 아니다");
  q.noteQuota(401, "Unauthorized");
  ok(q.quotaStatus().exhausted === false, "401도 한도가 아니다");
  q.noteQuota(404, "Not Found");
  ok(q.quotaStatus().exhausted === false, "404도 한도가 아니다");
  q.restore();
}
{
  // 429가 아니어도 본문에 '한도'가 있으면 잡아야 합니다.
  const q = loadQuota();
  q.noteQuota(400, '{"message":"일별 사용량 한도가 초과하였습니다."}');
  ok(q.quotaStatus().exhausted === true, "상태코드가 달라도 '한도'라는 말이 있으면 잡는다");
  q.restore();
}

console.log("\n━━ 날이 바뀌면 잊는가 ━━");
// ⚠️ 안 잊으면 자정이 지나도 "안 됩니다"라고 말하게 됩니다.
// 실제로는 되는데 못 쓰게 막는 셈입니다.
{
  const day1 = Date.parse("2026-08-27T15:00:00+09:00");
  const q = loadQuota(day1);
  q.noteQuota(429, "일별 사용량 한도가 초과하였습니다.");
  ok(q.quotaStatus().exhausted === true, "같은 날엔 계속 막힘");
  q.restore();

  // 다음 날로 넘깁니다 — 같은 기억을 가진 채로.
  const q2 = loadQuota(day1);
  q2.noteQuota(429, "일별 사용량 한도가 초과하였습니다.");
  Date.now = () => Date.parse("2026-08-28T09:00:00+09:00");
  ok(q2.quotaStatus().exhausted === false, "날이 바뀌면 스스로 잊는다  ← 안 잊으면 영영 막힙니다");
  q2.restore();
}
{
  // 한국 자정 기준인지. UTC로 끊으면 아침 9시에 풀립니다.
  const q = loadQuota(Date.parse("2026-08-27T23:30:00+09:00"));
  q.noteQuota(429, "한도");
  ok(q.quotaStatus().exhausted === true, "한국 밤 11시 30분엔 아직 막힘");
  Date.now = () => Date.parse("2026-08-28T00:30:00+09:00");
  ok(q.quotaStatus().exhausted === false, "한국 자정을 넘기면 풀린다  ← UTC로 끊으면 아침 9시가 됩니다");
  q.restore();
}

console.log("\n━━ 크론 식이 진짜 도는가 ━━");
// ⚠️ 예전 식은 캐시 유효기간(분)을 그대로 넣었습니다. 6시간이면 `*/360 * * * *`.
// 터지지는 않습니다 — cron.validate 가 true 를 줍니다.
// 그런데 분 칸은 0~59라서 맞는 분이 0 하나뿐입니다. 6시간이 아니라 **한 시간마다** 돕니다.
// 조용히 6배 자주 도는 게 터지는 것보다 나쁩니다.
{
  const minutesMatching = (step) => { const o = []; for (let m = 0; m < 60; m++) if (m % step === 0) o.push(m); return o; };
  ok(cron.validate("*/360 * * * *") === true, "옛 식은 '유효'하다고 나온다 (그래서 못 알아챘습니다)");
  ok(minutesMatching(360).length === 1, "그런데 실제로 맞는 분은 1개뿐 — 매시 0분", "[" + minutesMatching(360) + "]");

  // 새 방식: TTL 을 어떻게 바꿔도 유효해야 합니다.
  const warmHours = (ttlMs) => Math.max(1, Math.min(12, Math.round(ttlMs / 3600000 / 2) || 1));
  const broken = [];
  for (const h of [0.25, 0.5, 1, 2, 3, 6, 12, 24, 48]) {
    const expr = `0 */${warmHours(h * 3600000)} * * *`;
    if (!cron.validate(expr)) broken.push(`${h}시간 → ${expr}`);
  }
  ok(broken.length === 0, "새 식은 TTL 을 0.25~48시간 어디로 둬도 유효하다", broken.join(", ") || "9가지 확인");
  ok(warmHours(6 * 3600000) === 3, "6시간 캐시면 3시간마다 예열 (캐시보다 자주)", warmHours(6 * 3600000) + "시간");
}

console.log("\n━━ 호출 횟수가 실제로 줄었는가 ━━");
{
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "opportunityFinder.js"), "utf8");
  ok(/OPPORTUNITY_OVERFETCH \|\| 1\.5/.test(src), "후보를 limit×1.5 로 줄였다 (예전 ×3)");
  ok(!/slice\(0, limit \* 3\)/.test(src), "옛 ×3 이 안 남아 있다");

  const idx = fs.readFileSync(path.join(__dirname, "..", "src", "index.js"), "utf8");
  ok(/BLOG_TOPICS_TTL_MS \|\| 6 \* 60 \* 60 \* 1000/.test(idx), "캐시가 6시간이다 (예전 10분)");
  ok(!/cron\.schedule\(`\*\/\$\{Math\.max\(1, Math\.round\(BLOG_TOPICS_TTL_MS/.test(idx),
     "분으로 크론 식 만드는 옛 코드가 사라졌다");
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
