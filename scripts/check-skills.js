/**
 * 스킬 프롬프트에 **새 실측값이 실제로 들어갔는지** 확인합니다.
 *
 * ⚠️ 규칙 파일만 고치고 "적용했습니다"라고 말하면 안 됩니다.
 * 스킬로 가는 길이 끊겨 있으면 사장님 글은 옛날 규칙으로 쓰입니다.
 * 실제로 프롬프트를 만들어서 그 안에 숫자가 있는지 눈으로 봅니다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src", "promptStudio.js");
const code = fs.readFileSync(SRC, "utf8");

// loadSkillPrompt는 내부 함수라 밖에서 못 부릅니다. 임시로 내보내서 씁니다.
const M = { exports: {} };
const ctx = {
  require: (id) => require(id.startsWith(".") ? path.join(__dirname, "..", "src", id) : id),
  module: M,
  exports: M.exports,
  __dirname: path.join(__dirname, "..", "src"),
  console,
  process,
};
vm.createContext(ctx);
vm.runInContext(code + "\nmodule.exports.loadSkillPrompt = loadSkillPrompt;", ctx);
const load = M.exports.loadSkillPrompt;

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

const SKILLS = fs.readdirSync(path.join(__dirname, "..", "src", "promptSkills"))
  .filter((f) => f.endsWith(".txt")).map((f) => f.replace(".txt", ""));

console.log(`\n━━ 스킬 ${SKILLS.length}개에 실측이 들어갔는지 ━━\n`);
console.log("스킬                주제        글자수         소제목      사진간격");
console.log("─".repeat(74));

const seen = { "패션·뷰티": 0, "연예·방송": 0 };
for (const skill of SKILLS) {
  let p;
  try { p = load(skill); } catch (e) { ok(false, skill, e.message); continue; }
  const topic = /연예·방송 기준/.test(p) ? "연예·방송" : "패션·뷰티";
  seen[topic]++;
  const grab = (re) => (p.match(re) || [])[1] || "?";
  console.log(
    `  ${skill.padEnd(20)} ${topic.padEnd(10)} ${grab(/글자 수: ([0-9~]+자)/).padEnd(14)} ` +
    `${grab(/소제목: ([0-9~]+개)/).padEnd(11)} ${grab(/사진 사이 글자 수: ([0-9~]+자)/)}`
  );
}

console.log("");
ok(seen["패션·뷰티"] > 0 && seen["연예·방송"] > 0,
  "주제별로 다른 값이 들어간다", `패션 ${seen["패션·뷰티"]}개 · 연예 ${seen["연예·방송"]}개`);

// 사장님이 콕 집어 말씀하신 후기 스킬 둘
console.log("\n━━ 골든 패션·뷰티 후기 스킬 ━━\n");
for (const skill of ["fashion-review", "beauty-review"]) {
  const p = load(skill);
  console.log(`  ${skill}`);
  ok(/블로그 117개/.test(p), "  블로그 27개 근거가 들어갔다");
  ok(/45자 넘게 쓰지 마세요/.test(p), "  45자 문단 금지가 들어갔다");
  ok(/비교표는 넣지 마세요/.test(p), "  표는 넣지 말라고 되어 있다");
  ok(/목차를 넣는 블로그가 하나도/.test(p), "  목차도 넣지 말라고 되어 있다");
  ok(/굵게만 쓰세요/.test(p), "  밑줄·배경색 쓰지 말라고 되어 있다");
  ok(/내 다른 글 2~3개를 링크카드로/.test(p), "  글 끝 링크 지침이 들어갔다");
  ok(/협찬 글은 브랜드 링크를 빼기 어렵/.test(p), "  협찬 글 예외가 들어갔다");
  ok(/판정을 맨 위|판정만/.test(p), "  후기는 판정을 위에 두라고 되어 있다");
  ok(!/소제목 5~6개로 나눈다/.test(p), "  옛 '소제목 6개' 지침이 사라졌다");
  ok(/970~1780자/.test(p), "  패션 글자수 범위가 맞다");
  console.log("");
}

console.log("━━ 연예 스킬 (다른 값이어야 함) ━━\n");
{
  const p = load("celeb-fashion");
  ok(/665~1100자/.test(p), "  연예는 글자수가 더 짧다 (665~1100)");
  ok(/56~101자/.test(p), "  연예는 사진 간격이 더 촘촘하다 (56~101)");
  ok(/상황 포착|장면/.test(p), "  연예는 맨 위에 장면을 두라고 되어 있다");
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
