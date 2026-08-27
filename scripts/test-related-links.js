/**
 * "함께 보면 좋은 글" — 협찬 판별과 붙일 글자 만들기를 시험합니다.
 *
 * ⚠️ 협찬 판별을 틀리면 두 가지로 손해입니다.
 *   못 잡으면  — 협찬 글에 링크가 들어가서 광고주와 문제가 생깁니다.
 *   헛잡으면  — 협찬도 아닌 글에서 링크를 안 넣어 상위노출을 놓칩니다.
 * 그래서 양쪽을 다 재봅니다.
 *
 * ⚠️ AI를 안 씁니다. 값이 0원입니다.
 */

// editor-tools.js 안의 규칙을 그대로 옮겨옵니다. 어긋나면 아래 시험이 잡습니다.
const SPONSOR = /협찬|제공\s*받아|제공받았|원고료|소정의\s*(수수료|대가)|대가를\s*받아|업체로부터|체험단|서포터즈|무상\s*제공/;
const looksSponsored = (b) => { const m = String(b || "").match(SPONSOR); return m ? m[0].replace(/\s+/g, " ") : null; };

function block(chosen) {
  if (!chosen.length) return "";
  return ["함께 보면 좋은 글", ...chosen.map((p) => `${p.title}\n${p.url}`)].join("\n\n");
}

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

console.log("\n━━ 협찬 글은 잡아야 합니다 ━━");
// ⚠️ **어떤 낱말로** 잡았는지는 시험하지 않습니다.
// 한 문장에 협찬 표시가 둘이면(예: "업체로부터 … 제공받아") 앞엣것이 잡힙니다.
// 둘 다 맞는 답인데 하나만 정답이라고 해두면, 시험이 코드를 괴롭힐 뿐입니다.
// 진짜 지켜야 할 것은 두 가지입니다 — **잡았는가**, 그리고 **보여줄 낱말이 본문에 실제로 있는가**.
// 화면에 없는 낱말을 "이게 있습니다"라고 띄우면 사장님이 본문에서 찾다가 못 찾습니다.
[
  "업체로부터 제품을 제공받아 작성한 후기입니다.",
  "소정의 원고료를 받고 작성했습니다.",
  "이 포스팅은 협찬을 받았습니다.",
  "체험단으로 참여했습니다.",
  "브랜드 서포터즈 활동 중입니다.",
  "소정의 대가를 받아 작성되었습니다.",
  "제품을 무상 제공 받았습니다.",
  "업체로부터  제공 받아 썼어요",   // 띄어쓰기가 이상해도
].forEach((body) => {
  const got = looksSponsored(body);
  // 띄어쓰기는 하나로 줄여서 보여주므로, 본문도 같은 기준으로 견줍니다.
  const inBody = got && body.replace(/\s+/g, " ").includes(got);
  ok(!!got && !!inBody, got ? `"${got}"` : "못 잡음", `← ${body.slice(0, 24)}…`);
});

console.log("\n━━ 협찬이 아닌 글은 놔둬야 합니다 ━━");
console.log("  (사장님 규칙: 연예인 뷰티·패션 정보성, 경제·주식·코인, 내돈내산은 링크 넣어도 됩니다)");
[
  "김고은 가을 코트 스타일링 정리해봤습니다.",
  "내돈내산으로 사서 두 달 써본 후기입니다.",
  "삼성전자 주가가 오늘 왜 올랐는지 정리합니다.",
  "카리나 데일리 메이크업 따라해봤어요.",
  "비트코인 반감기가 뭔지 쉽게 풀어봅니다.",
  "제가 직접 돈 주고 산 제품입니다.",
  "이 옷은 작년에 산 건데 아직도 잘 입어요.",
].forEach((body) => ok(looksSponsored(body) === null, `안 잡음`, `← ${body.slice(0, 26)}…`));

console.log("\n━━ 붙일 글자 모양 ━━");
const posts = [
  { logNo: "111", title: "김고은 가을 코트 3가지", url: "https://blog.naver.com/me/111" },
  { logNo: "222", title: "가을 코트 색 고르는 법", url: "https://blog.naver.com/me/222" },
];
const text = block(posts);
console.log(text.split("\n").map((l) => "    │ " + (l || "")).join("\n"));

ok(text.startsWith("함께 보면 좋은 글"), "머리말이 맨 위에");
ok(text.split("\n").filter((l) => l.startsWith("http")).length === 2, "주소 2개");
// ⚠️ 이게 핵심입니다. 주소가 **한 줄에 홀로** 있어야 네이버가 링크 카드로 바꿉니다.
// 글자 뒤에 붙여 놓으면 그냥 파란 글씨로 남습니다.
ok(
  text.split("\n").filter((l) => l.includes("http")).every((l) => /^https?:\/\/\S+$/.test(l.trim())),
  "주소가 한 줄에 홀로 있다  ← 링크 카드가 되려면 반드시"
);
ok(block([]) === "", "하나도 안 골랐으면 빈 글자");

console.log("\n━━ 규칙이 원본과 같은가 ━━");
// ⚠️ 여기서 베껴 쓴 규칙이 실제 코드와 어긋나면 이 시험은 거짓말이 됩니다.
// 실제 파일에서 정규식을 꺼내 글자 그대로 맞춰봅니다.
const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "..", "extension", "content", "editor-tools.js"), "utf8");
const m = src.match(/const SPONSOR = (\/.+\/);/);
ok(!!m, "원본에서 규칙을 찾았다");
if (m) ok(m[1] === SPONSOR.toString(), "시험이 쓰는 규칙 = 실제 코드의 규칙", m[1] === SPONSOR.toString() ? "" : `\n      실제: ${m[1]}\n      시험: ${SPONSOR}`);

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
