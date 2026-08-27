/**
 * 블로그 힘 판정 — 숫자를 어떻게 읽는가.
 *
 * ⚠️ 여기서 제일 조심할 것은 **아는 척**입니다.
 * 네이버는 블로그 지수를 공개하지 않습니다. 우리가 내는 건 추정입니다.
 * 모르면 "모름"이라고 해야지, 그럴듯한 숫자를 지어내면 안 됩니다.
 *
 * ⚠️ 네이버를 안 부릅니다. 값이 0원이고 할당량도 안 씁니다.
 */
const P = require("../src/blogPower");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

const wall = (median, over = {}) => ({ ok: true, median, checked: 5, hiddenCount: 0, confidence: 100, ...over });

console.log("\n━━ 모르면 모른다고 하는가 ━━");
// ⚠️ 제일 중요합니다. 못 잰 걸 "쉽다"고 하면 사장님이 헛수고를 하십니다.
{
  ok(P.judge(25000, { ok: false, why: "검색 실패" }).verdict === "모름", "검색을 못 했으면 모름");
  ok(P.judge(25000, wall(null)).verdict === "모름", "위 블로그를 하나도 못 쟀으면 모름");
  ok(P.judge(null, wall(5000)).verdict === "모름", "내 방문자를 모르면 모름  ← 견줄 게 없습니다");

  const w = P.judge(25000, wall(null, { checked: 5, hiddenCount: 5 }));
  ok(/숨/.test(w.why), "왜 모르는지 말해준다", w.why);
}

console.log("\n━━ 견주기 ━━");
{
  ok(P.judge(25000, wall(2000)).verdict === "위가 약함", "내가 12배 크면 '위가 약함'");
  ok(P.judge(25000, wall(20000)).verdict === "비슷함", "비슷하면 '비슷함'");
  ok(P.judge(25000, wall(40000)).verdict === "위가 강함", "저쪽이 1.6배면 '위가 강함'");
  ok(P.judge(2000, wall(50000)).verdict === "위가 많이 강함", "저쪽이 25배면 '위가 많이 강함'");

  const j = P.judge(25850, wall(1953));
  ok(/13\.2배/.test(j.why), "몇 배인지 숫자로 말해준다", j.why);
}

console.log("\n━━ '쉬움'이라고 예언하지 않는가 ━━");
/**
 * ⚠️ 처음엔 "쉬움 / 해볼 만함 / 어려움"이라고 했습니다. 그런데 사장님 실제 글로
 * 맞춰보니 3개 중 1개가 크게 어긋났습니다:
 *
 *   아우터 자켓 코디      벽 6,098명   → 실제 3위   맞음
 *   2기 화제 장면        벽 20,107명  → 실제 1위   모델보다 좋음
 *   캐리어로 추천하는 이유  벽 2,088명   → 실제 9위   **어긋남**
 *
 * 벽이 제일 낮은 곳에서 제일 나쁜 순위가 나왔습니다.
 * "쉬움"은 예언이고 우리는 예언을 못 합니다. 사실만 말합니다.
 */
{
  const all = [P.judge(25000, wall(1000)), P.judge(25000, wall(20000)),
               P.judge(25000, wall(50000)), P.judge(1000, wall(90000))];
  const words = all.map((a) => a.verdict).join(" ");
  ok(!/쉬움|어려움|해볼/.test(words), "'쉬움/어려움' 같은 예언 표현을 안 쓴다", words);
  ok(all.every((a) => /위가|비슷/.test(a.verdict)), "전부 '위가 어떻다'는 사실 표현", words);
}

console.log("\n━━ 못 잰 게 많으면 덜 믿으라고 하는가 ━━");
{
  const shaky = P.judge(25000, wall(3000, { checked: 5, hiddenCount: 3, confidence: 40 }));
  ok(shaky.shaky === true, "믿을 만한 정도가 낮으면 표시한다");
  ok(/숨겨서 덜 믿을/.test(shaky.why), "그 말을 사람 말로 붙여준다", shaky.why);

  const solid = P.judge(25000, wall(3000, { confidence: 100 }));
  ok(!solid.shaky, "다 쟀으면 표시 안 한다");
}

console.log("\n━━ 줄 세우기 ━━");
{
  const order = ["위가 많이 강함", "모름", "위가 약함", "비슷함", "위가 강함"]
    .sort((a, b) => P.ORDER[a] - P.ORDER[b]);
  ok(order[0] === "위가 약함", "좋은 것부터 나온다", order.join(" < "));
  ok(order[order.length - 1] === "모름", "모르는 건 맨 뒤로  ← 권할 수 없으니까요");
  const known = Object.keys(P.ORDER);
  const used = ["위가 약함", "비슷함", "위가 강함", "위가 많이 강함", "모름"];
  ok(used.every((v) => known.includes(v)), "판정 이름과 줄 세우기 표가 어긋나지 않는다");
}

console.log("\n━━ 검색할 짧은 말 뽑기 ━━");
{
  ok(P.tailWords('"예뻐서 자꾸 보네" 김고은 가을 무드 스노우피크 어패럴', 3) === "무드 스노우피크 어패럴",
     "뒤 3어절을 뽑는다  ← 앞은 후킹 문구라 아무도 검색 안 합니다", P.tailWords('"예뻐서 자꾸 보네" 김고은 가을 무드 스노우피크 어패럴', 3));
  ok(P.tailWords("짧은 제목", 3) === null, "어절이 모자라면 null");
  ok(P.tailWords("", 3) === null, "빈 제목이면 null");
  ok(!/["'“”]/.test(P.tailWords('"따옴표" 있는 긴 제목 하나 둘', 3) || ""), "따옴표를 뗀다");
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
