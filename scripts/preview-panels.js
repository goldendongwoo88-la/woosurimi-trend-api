/**
 * 확장 화면을 브라우저에서 눈으로 보려고 미리보기 페이지를 만듭니다.
 *
 * ⚠️ 확장은 네이버 글쓰기 창에서만 뜹니다. 거기서 확인하려면 매번 설치하고
 * 글을 써야 합니다. 그래서 화면 조각만 떼어다 그려봅니다.
 * 확장 코드의 **원본 템플릿을 그대로** 씁니다 — 베껴 쓰면 실제와 달라집니다.
 *
 * ⚠️ 처음엔 템플릿을 브라우저로 넘겨 거기서 그리게 했습니다.
 * 템플릿 안에 백틱과 ${}가 겹겹이 있어서 계속 문법이 깨졌습니다.
 * **여기(Node)에서 미리 그려서** 순수 HTML만 내보냅니다. 브라우저는 그리기만 합니다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(ROOT, "extension", "content", "editor-tools.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "extension", "content", "panel.css"), "utf8");

/**
 * showPanel(`…`) 한 덩어리의 템플릿 원문을 떼어냅니다.
 * 백틱 짝을 세면서 끝을 찾습니다 — 안쪽 템플릿에도 백틱이 있습니다.
 */
function grab(marker) {
  const at = js.indexOf(marker);
  if (at < 0) throw new Error(`못 찾음: ${marker}`);
  const open = js.lastIndexOf("showPanel(`", at);
  if (open < 0) throw new Error(`showPanel을 못 찾음: ${marker}`);
  const start = open + "showPanel(`".length;
  let i = start;
  let depth = 0;
  while (i < js.length) {
    const c = js[i];
    if (c === "\\") { i += 2; continue; }
    if (c === "$" && js[i + 1] === "{") { depth++; i += 2; continue; }
    if (c === "}" && depth > 0) { depth--; i++; continue; }
    if (c === "`" && depth === 0) return js.slice(start, i);
    i++;
  }
  throw new Error("끝 백틱을 못 찾음");
}

// 화면에 넣을 가짜 값들 — 실제와 같은 모양으로.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const missing = "4방향";
const title = '"착해진 아이라인 눈매에 여전한 존재감" 카리나 메이크업 4방향';
const marked = title.includes(missing)
  ? esc(title).split(esc(missing)).join(
      `<b style="background:#fde9c8;color:#8a5a10;padding:1px 3px;border-radius:3px">${esc(missing)}</b>`)
  : esc(title);
const topic = "카리나 메이크업";
const d = {
  tried: ["카리나 메이크업 → 0건", "존재감 카리나 메이크업 → 0건", "(블로그) 카리나 메이크업 → 1건"],
  missing: ["카리나가 실제로 쓴 아이라이너 제품명", "촬영 날짜"],
  sources: [
    { n: 1, kind: "블로그", title: "카리나 메이크업 근황 변화, 추구미 민낯에서 사방트임?", url: "https://blog.naver.com/x/1" },
    { n: 2, kind: "블로그", title: "에스파 카리나 메이크업 스모키에 그린섀도우", url: "https://blog.naver.com/x/2" },
  ],
  note: "자료에 없는 것은 넣지 않았습니다.",
};
const facts = [
  { text: "아이라인을 눈꼬리 쪽으로만 얇게 빼는 방식이 최근 무대에서 자주 보였다", source: 1 },
  { text: "언더라인에 펄 섀도우를 소량 올려 눈매를 크게 보이게 했다", source: 1 },
  { text: "립은 채도가 낮은 누드 톤으로 맞춰 전체 인상을 정돈했다", source: 2 },
  { text: "피부는 세미매트로 표현해 조명 아래에서 번들거림을 줄였다", source: 2 },
];

const SCOPE = { esc, missing, title, marked, topic, d, facts };

/** 템플릿을 여기서 그려 순수 HTML로 만듭니다. */
function render(tpl) {
  const names = Object.keys(SCOPE);
  const fn = new Function(...names, "return `" + tpl.replace(/\\/g, "\\\\") + "`;");
  return fn(...names.map((n) => SCOPE[n]));
}

const PANELS = [
  ["본문에 넣기 — 제목이 약속한 말이 본문에 없을 때", "<h4>제목에 쓴 말이 본문에 없습니다</h4>"],
  ["자료를 못 찾았을 때 — 무엇으로 찾았는지 보여주고 다시 시도", "<h4>쓸 만한 자료를 못 찾았습니다</h4>"],
  ["자료를 찾았을 때 — 복수 선택 + 전부 고르기", "<h4>찾았습니다 — ${facts.length}가지</h4>"],
];

const parts = [];
for (const [label, marker] of PANELS) {
  try {
    parts.push(`<h2>${label}</h2>\n<div class="ws-panel-wrap"><div id="ws-tools-panel">${render(grab(marker))}</div></div>`);
  } catch (e) {
    parts.push(`<h2>${label}</h2><div class="ws-panel-wrap" style="color:#b0201f">그리지 못했습니다: ${esc(e.message)}</div>`);
    console.error(`  ✗ ${label}: ${e.message}`);
  }
}

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>확장 화면 미리보기</title>
<style>
body{background:#e9ebef;padding:24px;font-family:'Malgun Gothic',system-ui,sans-serif;max-width:520px;margin:0 auto}
h2{font-size:13.5px;color:#5a5f6b;margin:26px 0 8px;font-weight:600}
.ws-panel-wrap{background:#fff;border-radius:12px;padding:16px;box-shadow:0 6px 24px rgba(0,0,0,.13)}
#ws-tools-panel{color:#17181c;font-size:13px;line-height:1.6}
#ws-tools-panel h4{margin:0 0 10px;font-size:15px}
${css}
</style></head><body>
${parts.join("\n")}
</body></html>`;

const out = path.join(ROOT, "public", "preview-panels.html");
fs.writeFileSync(out, html);
console.log("만들었습니다:", out);
