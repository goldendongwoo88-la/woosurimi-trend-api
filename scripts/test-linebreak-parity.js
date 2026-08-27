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

const CACHE = path.join(__dirname, "..", "scratch-paragraphs.json");
if (!fs.existsSync(CACHE)) {
  console.log("scratch-paragraphs.json이 없습니다. scripts/measure-paragraphs.js를 먼저 돌리세요.");
  process.exit(0);
}

const all = JSON.parse(fs.readFileSync(CACHE, "utf8"));
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
