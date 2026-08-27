/**
 * 확장(breakOne)과 서버(splitParagraph)가 **같은 결과**를 내는지 확인합니다.
 *
 * ⚠️ 같은 규칙이 두 군데 있습니다. 확장은 인터넷 없이도 돌아야 해서 서버를
 * 안 부르고, 서버는 화면에서 쓰려고 따로 있습니다. 어쩔 수 없이 둘입니다.
 * 둘이 어긋나면 "확장에서는 3줄인데 화면에서는 4줄"이 됩니다.
 * 그러면 사장님은 어느 쪽을 믿어야 할지 모릅니다. 그래서 매번 대조합니다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const LB = require("../src/lineBreak");

// 확장 파일에서 breakOne과 그 부속만 떼어냅니다.
const src = fs.readFileSync(path.join(__dirname, "..", "extension", "content", "editor-tools.js"), "utf8");
const start = src.indexOf("const BREAK_LIMIT");
const end = src.indexOf("function runLineBreak");
if (start < 0 || end < 0) {
  console.error("확장에서 breakOne 부분을 못 찾았습니다. 이름이 바뀌었나요?");
  process.exit(1);
}
const ctx = { module: {}, console };
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + "\nmodule.exports = breakOne;", ctx);
const breakOne = ctx.module.exports;

/**
 * ⚠️ 예전에는 받아둔 글 파일이 없으면 그냥 통과시켰습니다.
 * 그러면 확장을 만들 때 **아무것도 검사 안 하고 지나갑니다.** 가드 구실을 못 합니다.
 * 실제로 그 상태로 빌드가 통과했습니다. 그래서 붙박이 예문을 둡니다.
 * 받아둔 글이 있으면 그것까지 함께 봅니다.
 */
const BUILTIN = [[
  "이번에 새로 산 니트를 입어봤는데 생각보다 도톰해서 겨울에도 충분히 입을 수 있을 것 같았습니다. 색은 사진보다 조금 어두운 편이었고 목 부분이 살짝 늘어나는 느낌이 있었어요.",
  "카리나가 이번 무대에서 보여준 메이크업은 평소보다 아이라인이 훨씬 얇아졌고 대신 언더라인에 펄을 살짝 올려서 눈이 더 커 보이는 효과를 냈습니다",
  "이 제품을 한 달 정도 써보니까 처음엔 발림성이 별로라고 생각했는데 시간이 지날수록 피부에 붙는 느낌이 좋아져서 지금은 매일 쓰고 있어요",
  "* 출처 : Heroes for Children, BTSSNS(인스타그램), JTBC",
  "* 출처: 김윤주 인스타그램, 권정열 인스타그램, KBS(사장님귀는당나귀귀), 윤쥬르(유튜브), 네이버",
  "집에서 카리나 아이라인을 따라 하고 싶다면 블랙 라이너 대신 소프트한 브라운이나 그레이 톤부터 시작해보세요. 언더라인은 끝까지 채우기보다 경계를 면봉으로 살짝 흐려주면 훨씬 자연스러운 눈매가 완성돼요.",
  "데일리룩으로 크롭 재킷을 소화하고 싶다면 하이웨이스트 와이드 팬츠나 롱스커트로 하체 비중을 키워 균형을 맞추고, 안에 크롭 니트나 캐미솔을 레이어드하면 급하게 팔을 들어도 걱정 없는 코디가 완성돼요.",
  "짧은 문장.",
  "또",
  "가".repeat(150),
  "오늘 다녀온 카페는 분위기가 좋았어요 사진 찍기도 편했고 커피 맛도 괜찮았습니다 다만 자리가 좁아서 오래 앉아 있기는 힘들었어요",
]];

const CACHE = path.join(__dirname, "..", "scratch-paragraphs.json");
const all = { 붙박이예문: BUILTIN };
if (fs.existsSync(CACHE)) Object.assign(all, JSON.parse(fs.readFileSync(CACHE, "utf8")));
else console.log("  (받아둔 실제 글이 없어 붙박이 예문으로만 대조합니다)");
/**
 * ⚠️ 결과만 비교해서는 부족합니다.
 * 쉼표 점수를 6에서 2로 일부러 바꿔놓고 돌렸는데 **11개 전부 통과**했습니다.
 * 예문이 그 규칙을 건드리지 않으면 차이가 안 드러나기 때문입니다.
 * 그래서 규칙표 자체를 글자 단위로 맞춰봅니다. 이건 못 빠져나갑니다.
 */
function ruleTable(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const end = text.indexOf("];", at);
  // ⚠️ 이름(SOFT / SOFT_END)은 서로 달라도 됩니다. 규칙 내용만 봅니다.
  // 처음에 이름까지 같이 비교해서 "항상 다르다"고 나왔습니다.
  return text.slice(at + marker.length, end)
    .replace(/\/\/[^\n]*/g, "")          // 주석 제거
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, "")                 // 공백·줄바꿈 무시
    .replace(/[{}\[\],]/g, "|")           // 배열/객체 표기 차이 흡수
    .replace(/re:|score:/g, "")
    .replace(/\|+/g, "|");
}

{
  const srvSrc = fs.readFileSync(path.join(__dirname, "..", "src", "lineBreak.js"), "utf8");
  const a = ruleTable(srvSrc, "const SOFT = [");
  const b = ruleTable(src, "const SOFT_END = [");
  if (!a || !b) {
    console.error("  ✗ 규칙표를 못 찾았습니다. 이름이 바뀌었나요?");
    process.exit(1);
  }
  if (a !== b) {
    console.error("  ✗ 서버와 확장의 규칙표가 다릅니다.");
    console.error("    서버: " + a.slice(0, 220));
    console.error("    확장: " + b.slice(0, 220));
    console.error("    src/lineBreak.js의 SOFT와 extension의 SOFT_END를 같게 맞춰주세요.");
    process.exit(1);
  }
  console.log("  ✓ 규칙표가 글자까지 똑같습니다");
}

let same = 0, diff = 0;
const examples = [];

for (const posts of Object.values(all)) {
  for (const paras of posts) {
    for (const p of paras) {
      const a = LB.splitParagraph(p);
      const b = breakOne(p);
      if (JSON.stringify(a) === JSON.stringify(b)) same++;
      else {
        diff++;
        if (examples.length < 3) examples.push({ p, 서버: a, 확장: b });
      }
    }
  }
}

console.log(`\n  문단 ${same + diff}개 대조`);
console.log(`  같음 ${same} · 다름 ${diff}`);
if (diff) {
  console.log("\n  다른 것 예시:");
  for (const e of examples) {
    console.log(`\n    원문: ${e.p.slice(0, 70)}`);
    console.log(`    서버: ${JSON.stringify(e.서버)}`);
    console.log(`    확장: ${JSON.stringify(e.확장)}`);
  }
}
process.exit(diff ? 1 : 0);
