/**
 * 소스에 날글자 NUL(U+0000)이 박힌 걸 이스케이프로 바꿉니다.
 *
 * ⚠️ cacheKey의 구분자로 NUL을 쓴 건 뜻으로는 맞습니다 — 글 안에 절대 안 나오는
 * 글자라 구분자로 안전합니다. 그런데 **파일에 날글자로 두면 안 됩니다.**
 * 편집기·검색 도구가 그 파일을 텍스트가 아니라 이진 파일로 봅니다.
 * 실제로 grep이 "binary file matches"만 뱉고 내용을 안 보여줬습니다.
 */
const fs = require("fs");
const path = require("path");

const NUL = String.fromCharCode(0);
const target = path.join(__dirname, "..", "extension", "content", "editor-tools.js");
const src = fs.readFileSync(target, "utf8");
const count = src.split(NUL).length - 1;

if (!count) {
  console.log("날글자 NUL 없음 — 고칠 게 없습니다.");
  process.exit(0);
}

const fixed = src.split(NUL).join("\\u0000");
fs.writeFileSync(target, fixed);
const after = fs.readFileSync(target, "utf8").split(NUL).length - 1;
console.log(`날글자 NUL ${count}개 → ${after}개`);

// 고친 뒤에도 문법이 맞는지 바로 확인합니다.
try {
  new Function(fs.readFileSync(target, "utf8"));
  console.log("문법 OK");
} catch (e) {
  console.error("문법이 깨졌습니다:", e.message);
  process.exit(1);
}
