/**
 * 확장 프로그램 버튼 하나를 누르면 얼마 나가는가.
 *
 * ⚠️ 실제 파일에서 시스템 프롬프트 크기와 maxTokens 를 꺼내 계산합니다.
 * 손으로 적으면 코드가 바뀔 때 어긋납니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */
const fs = require("fs");
const path = require("path");

const KRW = 1380;
const IN = 3, OUT = 15, READ = 0.3, WRITE = 3.75;   // 100만 토큰당 달러 (Sonnet)
const TOK = (chars) => Math.round(chars * 1.05);     // 한글은 글자당 대략 1토큰

// 화면에 보이던 실제 글 — 공백 제외 921자 / 포함 1,184자
const BODY_CHARS = 1184;

/** 파일에서 시스템 프롬프트 길이를 실제로 재봅니다. */
function sysChars(file) {
  const p = path.join(__dirname, "..", "src", file + ".js");
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p, "utf8");
  // const SYSTEM = `...`  형태를 찾습니다
  const m = s.match(/const SYSTEM\s*=\s*`([\s\S]*?)`;/);
  if (m) return m[1].length;
  // 인라인으로 system: `...` 을 넘기는 경우
  const m2 = s.match(/system:\s*`([\s\S]*?)`/);
  if (m2) return m2[1].length;
  return null;
}

function maxTokens(file) {
  const p = path.join(__dirname, "..", "src", file + ".js");
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p, "utf8");
  const m = s.match(/maxTokens:\s*(\d+)/);
  return m ? Number(m[1]) : 2000;
}

/**
 * 한 번 부르는 값.
 * @param outRatio 실제 출력이 maxTokens 의 몇 할쯤 되는지. 보통 다 안 씁니다.
 */
function cost({ sys, input, max, cached, outRatio = 0.6, images = 0 }) {
  const sysTok = TOK(sys);
  // 사진은 한 장에 대략 200토큰입니다 (400px 기준).
  const inTok = TOK(input) + images * 200;
  const outTok = Math.round(max * outRatio);
  const usd =
    (cached ? sysTok * READ : sysTok * WRITE) / 1e6 +
    (inTok * IN) / 1e6 +
    (outTok * OUT) / 1e6;
  return Math.round(usd * KRW);
}

const BUTTONS = [
  // ⚠️ 처음에 "제목만 보낸다"고 적었는데 **틀렸습니다.**
  // 코드를 열어보니 본문을 1,500자까지 같이 보냅니다 — 본문에 있는 사실로만
  // 궁금증을 만들라고 시키려고요. 화면에도 "본문 1,248자를 읽고"라고 뜹니다.
  { name: "홈판 제목", file: "titleRewrite", input: 1500,
    what: "제목 + 본문 앞 1,500자를 보냅니다." },
  { name: "홈판 본문", file: "bodyRewrite", input: BODY_CHARS,
    what: "본문을 통째로 보내고 다시 받습니다. 제일 큽니다." },
  { name: "썸네일 (수동)", file: null, input: 0,
    what: "AI를 안 씁니다. 사장님이 고른 사진에 글자만 얹습니다." },
  { name: "썸네일 (자동)", file: "thumbAuto", input: 300, images: 12,
    what: "사진 12장을 AI가 눈으로 봅니다. 한 장에 200토큰씩." },
  { name: "자동 서식(강조)", file: "emphasis", input: BODY_CHARS,
    what: "본문을 읽고 강조할 자리를 고릅니다." },
  // ⚠️ 주제·표현 검사는 **AI를 안 씁니다.** 처음에 AI 쓰는 걸로 잘못 넣었습니다.
  // 코드를 열어보니 callClaude 가 한 번도 없습니다. 규칙으로만 판정합니다.
  { name: "주제", file: null, input: 0,
    what: "AI를 안 씁니다. 낱말로 어느 주제인지 가립니다." },
  { name: "표현 검사", file: null, input: 0,
    what: "AI를 안 씁니다. 문제 될 표현 목록으로 찾습니다." },
  { name: "자료 찾기", file: "research", input: 300,
    what: "찾은 자료를 정리합니다." },
];

const FREE = [
  ["글자수·사진·링크 세기", "브라우저가 셉니다"],
  ["썸네일 (수동)", "사진에 글자만 얹습니다"],
  ["줄바꿈", "국어 문법으로 자릅니다. AI를 태우면 오히려 내용이 바뀝니다"],
  ["맞춤법", "자주 틀리는 말 목록으로 찾습니다"],
  ["함께보기", "내 글 목록을 받아 제목이 겹치는 순으로 고릅니다"],
  ["마무리 점검", "글자·소제목·사진을 세서 기준과 견줍니다"],
  ["폰트 / 사진 크기 / 표 / 워드", "편집기를 조작할 뿐입니다"],
  ["키워드", "네이버 검색광고 API — 무료입니다"],
  ["주제 / 표현 검사", "규칙으로 판정합니다. AI를 안 씁니다"],
];

console.log(`\n확장 프로그램 버튼 — 한 번 누르면 얼마 나가는가`);
console.log(`(화면에 보이던 실제 글 기준: 공백 포함 ${BODY_CHARS.toLocaleString()}자)\n`);
console.log(`  버튼               처음    두 번째부터   왜`);
console.log(`  ${"─".repeat(76)}`);

let firstSum = 0, cachedSum = 0;
const missing = [];
for (const b of BUTTONS) {
  if (!b.file) {
    console.log(`  ${b.name.padEnd(16)} ${"0원".padStart(6)}  ${"0원".padStart(9)}    ${b.what}`);
    continue;
  }
  const sys = sysChars(b.file);
  const max = maxTokens(b.file);
  // ⚠️ 못 재면 조용히 넘어가면 안 됩니다. 값을 모르는 채로 "다 합쳐 얼마"를 내면
  // 그 합계가 거짓말이 됩니다. 크게 알리고 합계에서 뺐다고 말합니다.
  if (sys == null) {
    console.log(`  ${b.name.padEnd(16)} ${"?".padStart(6)}  ${"?".padStart(9)}    ⚠️ 프롬프트를 못 찾았습니다 (${b.file}.js) — 아래 합계에서 빠졌습니다`);
    missing.push(b.name);
    continue;
  }
  const a = cost({ sys, input: b.input, max, cached: false, images: b.images || 0 });
  const c = cost({ sys, input: b.input, max, cached: true, images: b.images || 0 });
  firstSum += a; cachedSum += c;
  console.log(`  ${b.name.padEnd(16)} ${(a + "원").padStart(6)}  ${(c + "원").padStart(9)}    ${b.what}`);
}

console.log(`  ${"─".repeat(76)}`);
console.log(`  AI 쓰는 것 다 누르면 ${(firstSum + "원").padStart(4)}   ${(cachedSum + "원").padStart(6)}`);
if (missing.length) console.log(`  ⚠️ 못 잰 것 ${missing.length}개(${missing.join(", ")})는 위 합계에 안 들어 있습니다.`);

console.log(`\n\n값이 아예 안 나가는 버튼\n`);
for (const [n, why] of FREE) console.log(`  · ${n.padEnd(26)} ${why}`);

console.log(`\n\n글 한 편에 보통 이렇게 씁니다\n`);
const typical = ["홈판 제목", "홈판 본문", "자동 서식(강조)"];
let t = 0;
for (const name of typical) {
  const b = BUTTONS.find((x) => x.name === name);
  const sys = sysChars(b.file);
  const c = cost({ sys, input: b.input, max: maxTokens(b.file), cached: true, images: b.images || 0 });
  t += c;
  console.log(`  ${name.padEnd(16)} ${(c + "원").padStart(6)}`);
}
console.log(`  ${"─".repeat(24)}`);
console.log(`  한 편에            ${(t + "원").padStart(6)}`);
console.log(`  하루 3편이면        ${(t * 3 + "원").padStart(6)}`);
console.log(`  한 달(90편)이면    ${((t * 90).toLocaleString() + "원").padStart(8)}`);

console.log(`
⚠️ 어림입니다. 진짜 값은 Anthropic 콘솔에 있습니다.
   · "두 번째부터"는 같은 버튼을 1시간 안에 또 누를 때입니다(캐시).
   · 출력이 정해둔 최대치의 6할쯤 나온다고 봤습니다. 글이 길면 더 나갑니다.
   · 본문이 길수록 비쌉니다. 위 숫자는 ${BODY_CHARS.toLocaleString()}자 기준입니다.
`);
