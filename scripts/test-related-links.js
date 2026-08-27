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

console.log("\n━━ 임시저장이 우리 버튼을 누르지 않는가 ━━");
// ⚠️ 실제로 겪은 일입니다. 흉내 편집기에서 잡았습니다.
//
// saveDraft()는 "저장"이라는 **글자**로 버튼을 찾습니다. 네이버가 구조를 바꿔도
// 글자는 안 바뀌니까요. 그런데 마무리 패널에도 "임시저장" 버튼을 넣었더니,
// 그걸 먼저 집어서 **자기가 자기를 눌렀습니다.** 네이버 저장은 한 번도 안 눌렸는데
// ok:true 를 돌려줬습니다. 사장님은 저장된 줄 아셨을 겁니다.
//
// ⚠️ 이건 **글자만 확인하는** 시험입니다. 진짜 동작은 브라우저에서 봐야 합니다.
// 그래도 이 줄이 지워지는 건 막아줍니다.
const di = fs.readFileSync(require("path").join(__dirname, "..", "extension", "content", "draft-insert.js"), "utf8");
const saveFn = di.slice(di.indexOf("async function saveDraft"));
ok(/#ws-tools-panel/.test(saveFn) && /#ws-tools-dock/.test(saveFn),
   "saveDraft가 우리 화면 요소를 건너뛴다");
ok(/발행\|게시\|공개/.test(saveFn), "발행·게시·공개는 절대 안 누른다");

console.log("\n━━ 세는 용도와 붙이는 용도가 갈라져 있는가 ━━");
// ⚠️ 1.25.0 사고의 재발 방지. 안내 문구 문단을 글자 수에서 빼는 건 맞지만,
// 빈 편집기에선 그게 유일한 진짜 문단이라 붙일 자리까지 없애면
// "본문 문단을 찾지 못했습니다"가 됩니다. 제목만 들어가고 본문이 안 들어갑니다.
{
  ok(/function bodyParagraphs\(\{ includeGuide = false \}/.test(di),
     "bodyParagraphs 에 includeGuide 스위치가 있다");
  const pb = di.slice(di.indexOf("async function pasteBody"), di.indexOf("async function insert"));
  ok(/bodyParagraphs\(\{ includeGuide: true \}\)/.test(pb),
     "붙일 자리는 안내 문단 포함으로 찾는다");
  ok(/copied: true/.test(pb),
     "자리를 못 찾아도 복사는 해준다 — 빈손으로 안 끝낸다");
  const ie = di.slice(di.indexOf("function isEmpty"), di.indexOf("async function pasteBody"));
  ok(/bodyParagraphs\(\)/.test(ie) && !/includeGuide: true/.test(ie),
     "셀 때는 안내 문단을 뺀다 (기본값)");
}

console.log("\n━━ 진짜 Ctrl+V 통로가 안전한가 ━━");
// ⚠️ 디버거 통로는 브라우저가 직접 키를 누르는 힘입니다. 두 가지만 지키면 안전합니다.
//   1) 보내는 키가 **붙여넣기(V) 하나뿐**이다 — 발행 버튼을 누를 힘으로 쓰지 않는다.
//   2) 클립보드에 **담긴 것을 확인한 뒤에만** 키를 보낸다 — 순서가 뒤집히면
//      엉뚱한 옛 클립보드 내용이 사장님 글에 붙습니다.
{
  const bg = fs.readFileSync(require("path").join(__dirname, "..", "extension", "background.js"), "utf8");
  const pp = bg.slice(bg.indexOf("async function pressPaste"), bg.indexOf("chrome.runtime.onMessage"));
  ok(/KeyV/.test(pp), "보내는 키가 V다");
  ok(!/Enter|Return|Tab|click|Mouse/.test(pp), "엔터·클릭 같은 다른 신호는 없다");
  ok(/debugger\.detach/.test(pp), "쓰고 나서 바로 떨어진다 (detach)");

  const pb2 = di.slice(di.indexOf("async function pasteBody"), di.indexOf("async function insert"));
  const wAt = pb2.indexOf("clipboard.writeText");
  const kAt = pb2.indexOf("pressPaste");
  ok(wAt >= 0 && kAt > wAt, "클립보드에 담은 뒤에만 키를 보낸다");
  ok(/clipOk/.test(pb2) && /if \(clipOk\)/.test(pb2), "담기 실패면 키를 안 보낸다");

  const ab = di.slice(di.indexOf("async function appendBlock"), di.indexOf("async function saveDraft"));
  const wAt2 = ab.indexOf("clipboard.writeText");
  const kAt2 = ab.indexOf("pressPaste");
  ok(wAt2 >= 0 && kAt2 > wAt2, "함께보기도 담은 뒤에만 키를 보낸다");

  const mf = JSON.parse(fs.readFileSync(require("path").join(__dirname, "..", "extension", "manifest.json"), "utf8"));
  ok(mf.permissions.includes("debugger"), "manifest에 debugger 권한이 있다");
}

console.log("\n━━ 같은 갈래 4개가 진짜로 이어졌는가 ━━");
// ⚠️ 분류기(postCategory)만 만들어두고 파이프라인에 연결 안 된 채 며칠 있었습니다.
// "만들었다"와 "연결됐다"는 다릅니다. 연결 지점을 글자로 확인합니다.
{
  const pc = require("../src/postCategory");
  const c = (t) => pc.classify(t).id;
  ok(c("카리나 무대 메이크업 달라진 점") === "연예인 뷰티", "카리나 메이크업 → 연예인 뷰티");
  ok(c("장원영 가을 코트 코디 정리") === "연예인 패션", "장원영 코트 → 연예인 패션");
  ok(c("카리나 열애설 입장문 정리") === "연예인 가십", "열애설 → 연예인 가십");
  ok(c("삼성전자 주가 오늘 왜 올랐나") === "경제", "주가 → 경제");
  ok(c("오늘 하늘이 예뻤다") === null, "모르면 모른다고 한다 (억지로 안 넣음)");

  const sr = fs.readFileSync(require("path").join(__dirname, "..", "src", "saasRoutes.js"), "utf8");
  const mp = sr.slice(sr.indexOf('"/api/my-posts"'));
  ok(/pickSameCategory\(/.test(mp), "my-posts가 같은 갈래 고르기를 부른다");
  ok(/mobileUrl\(/.test(mp), "같은 갈래 링크는 모바일 주소다");
  ok(/sameCategory/.test(mp.slice(0, 3000)), "응답에 sameCategory가 실린다");

  const et = fs.readFileSync(require("path").join(__dirname, "..", "extension", "content", "editor-tools.js"), "utf8");
  const rl = et.slice(et.indexOf("async function relatedLinks"));
  ok(/d\.sameCategory/.test(rl), "확장이 같은 갈래를 최우선으로 쓴다");
  ok(/bySame \? 4 : 2/.test(rl), "같은 갈래면 4개를 미리 고른다 (아니면 실측 중앙값 2개)");
  ok(/인용구/.test(rl.slice(0, rl.indexOf("runFormat"))), "머리말을 인용구로 바꾸는 단계가 있다");
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
