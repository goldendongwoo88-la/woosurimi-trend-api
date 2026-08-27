/**
 * 가짜 스마트에디터를 만들어 서식 넣기를 시험합니다.
 *
 * ⚠️ 진짜 네이버 글쓰기 창은 브라우저 도구에서 못 엽니다.
 * 그래서 **같은 구조**로 흉내 냅니다:
 *   - 문단이 <p class="se-text-paragraph"><span class="se-ff-...">글</span></p>
 *   - 왼쪽 위에 본문/소제목/인용구 드롭다운
 *   - span이 사라지면 문단을 비워버리는 감시자 (진짜 편집기가 하는 일)
 *
 * ⚠️ 이걸로 확인되는 것과 안 되는 것을 분명히 해둡니다.
 *   확인됨 — 글자 범위를 찾아 선택하는가, execCommand가 먹는가,
 *            드롭다운을 찾아 눌러 스타일이 바뀌는가, 실패를 실패라고 하는가
 *   확인 안 됨 — 진짜 네이버 편집기의 드롭다운 생김새.
 *            그건 사장님이 한 번 눌러보셔야 압니다.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const fmtJs = fs.readFileSync(path.join(ROOT, "extension", "content", "format-tools.js"), "utf8");
const parseJs = fs.readFileSync(path.join(ROOT, "extension", "content", "draft-parser.js"), "utf8");
const insertJs = fs.readFileSync(path.join(ROOT, "extension", "content", "draft-insert.js"), "utf8");

const PARAS = [
  ["p", "요즘 환절기 지나가면서 샤워하고 나면 피부가 당기는 느낌이 심해졌는데, 씻는 것과 보습을 따로 챙기는 게 귀찮아서 째피 핑크라인(소프트 리셋 + 글로우 업)을 2주 정도 써보게 됐습니다."],
  ["p", "■ 패키지 첫인상, 그리고 왜 이 제품을 쓰게 됐는지"],
  ["p", "핑크색 바디에 노란 펌프, 레트로한 번개 로고까지 — 욕실에 그냥 올려만 놔도 예쁜 오브제 같은 디자인이라 첫인상부터 좋았어요."],
  ["p", "■ 2주 써본 결과"],
  ["p", "가격은 두 개 세트로 29,800원이었고 용량은 각각 300ml입니다. 다른 바디워시와 달리 씻고 난 뒤 10분이 지나도 당김이 없었어요. 저는 재구매 의사 있습니다."],
  ["p", "씻고 나면 당기는 그 느낌, 아시죠. 그게 없어진 게 제일 컸습니다."],
];

const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>서식 넣기 시험대</title>
<style>
body{margin:0;font-family:'Malgun Gothic',system-ui,sans-serif;background:#f5f6f8;color:#17181c}
.bar{background:#fff;border-bottom:1px solid #e0e2e7;padding:8px 14px;display:flex;gap:10px;
 align-items:center;position:sticky;top:0;z-index:10}
.dd{position:relative}
.dd-btn{border:1px solid #d6d9e0;background:#fff;border-radius:6px;padding:5px 26px 5px 11px;
 font:inherit;font-size:13px;cursor:pointer;min-width:82px;text-align:left}
.dd-menu{display:none;position:absolute;top:100%;left:0;background:#fff;border:1px solid #d6d9e0;
 border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.12);min-width:110px;z-index:20}
.dd.open .dd-menu{display:block}
.dd-menu button{display:block;width:100%;border:0;background:none;text-align:left;
 padding:8px 14px;font:inherit;font-size:13px;cursor:pointer}
.dd-menu button:hover{background:#f2f4f7}
.se-main-container{max-width:720px;margin:22px auto;background:#fff;padding:28px 32px;
 border:1px solid #e6e8ed;border-radius:8px;min-height:420px}
.se-text-paragraph{margin:0 0 14px;font-size:16px;line-height:1.8;outline:none}
.se-component.se-sectionTitle .se-text-paragraph{font-size:38px;font-weight:700;line-height:1.4;margin:26px 0 12px}
.se-component.se-quotation .se-text-paragraph{font-size:19px;font-weight:600;line-height:1.6;
 border-left:4px solid #17181c;padding-left:16px;margin:22px 0}
#log{max-width:720px;margin:0 auto 40px;font-size:13px;line-height:1.8}
.row{padding:6px 0;border-bottom:1px solid #e6e8ed}
.ok{color:#0b8f4d}.no{color:#b0201f}
button.run{padding:8px 16px;border-radius:7px;border:1px solid #0b8f4d;background:#0b8f4d;
 color:#fff;font:inherit;cursor:pointer}
</style></head><body>

<div class="bar">
  <div class="dd" id="styleDd">
    <button class="dd-btn" id="styleBtn">본문</button>
    <div class="dd-menu">
      <button data-style="본문">본문</button>
      <button data-style="소제목">소제목</button>
      <button data-style="인용구">인용구</button>
    </div>
  </div>
  <span style="font-size:12px;color:#8a8f9a">← 진짜 편집기와 같은 드롭다운</span>
  <span style="flex:1"></span>
  <button class="run" id="runPaste" style="background:#1a4ba0;border-color:#1a4ba0">원고 붙이기 시험</button>
  <button class="run" id="run">서식 시험</button>
  <button class="dd-btn" id="saveBtn" style="margin-left:8px">저장</button>
</div>

<div class="se-main-container" id="editor" contenteditable="true">
${PARAS.map(([, t]) => `<div class="se-component se-text"><p class="se-text-paragraph"><span class="se-ff-nanumgothic se-fs16">${t}</span></p></div>`).join("\n")}
</div>

<div id="log"></div>

<script>
// ── 가짜 편집기의 드롭다운 동작 ──
const dd = document.getElementById("styleDd");
let caretPara = null;
document.getElementById("editor").addEventListener("focusin", () => {});
document.addEventListener("selectionchange", () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  let n = sel.getRangeAt(0).startContainer;
  while (n && n.nodeType !== 1) n = n.parentNode;
  const p = n && n.closest && n.closest(".se-text-paragraph");
  if (p) caretPara = p;
});
document.getElementById("styleBtn").addEventListener("click", () => dd.classList.toggle("open"));
for (const b of dd.querySelectorAll("[data-style]")) {
  b.addEventListener("click", () => {
    dd.classList.remove("open");
    if (!caretPara) return;
    const comp = caretPara.closest(".se-component");
    if (!comp) return;
    comp.className = "se-component " + ({ "본문": "se-text", "소제목": "se-sectionTitle", "인용구": "se-quotation" }[b.dataset.style]);
    document.getElementById("styleBtn").textContent = b.dataset.style;
  });
}

// ── 진짜 편집기처럼: 엔터를 치면 제대로 된 문단을 만듭니다 ──
// ⚠️ 이걸 안 해두면 제 코드를 공정하게 시험할 수 없습니다.
// 맨 contenteditable은 엔터를 쳐도 <div>나 <br>만 생기는데,
// 스마트에디터는 .se-component > p.se-text-paragraph > span 을 만듭니다.
// 그 차이 때문에 "안 된다"고 나오면 제 코드가 아니라 시험대가 틀린 겁니다.
new MutationObserver(() => {
  const ed = document.getElementById("editor");
  for (const node of [...ed.children]) {
    if (node.classList && node.classList.contains("se-component")) continue;
    // 엉뚱하게 생긴 덩어리를 제대로 된 문단으로 바꿔줍니다
    const txt = node.textContent || "";
    const comp = document.createElement("div");
    comp.className = "se-component se-text";
    comp.innerHTML = '<p class="se-text-paragraph"><span class="se-ff-nanumgothic se-fs16"></span></p>';
    comp.querySelector("span").textContent = txt;
    node.replaceWith(comp);
  }
}).observe(document.getElementById("editor"), { childList: true });

// ── 진짜 편집기처럼: span이 사라지면 문단을 비웁니다 ──
new MutationObserver(() => {
  for (const p of document.querySelectorAll(".se-text-paragraph")) {
    if (!p.querySelector("span") && (p.innerText || "").trim()) {
      // 서식(b/u/font)은 span 안에 들어가므로 괜찮습니다.
      // span 자체가 없어졌을 때만 문제입니다.
      p.innerHTML = '<span class="se-ff-nanumgothic se-fs16"></span>';
    }
  }
}).observe(document.getElementById("editor"), { childList: true, subtree: true });
</script>

<script>${fmtJs}</script>
<script>${parseJs}</script>
<script>${insertJs}</script>

<script>
const log = document.getElementById("log");
let pass = 0, fail = 0;
const say = (c, l, e = "") => {
  log.insertAdjacentHTML("beforeend",
    '<div class="row"><span class="' + (c ? "ok" : "no") + '">' + (c ? "\\u2713" : "\\u2717") + '</span> ' + l + (e ? ' <code>' + e + '</code>' : '') + '</div>');
  c ? pass++ : fail++;
};

// 가짜 저장 버튼 — 누르면 숫자가 올라갑니다 (네이버가 하는 것과 같게)
let saveCount = 0;
document.getElementById("saveBtn").addEventListener("click", () => {
  saveCount++;
  document.getElementById("saveBtn").textContent = "저장 " + saveCount;
});

document.getElementById("runPaste").onclick = async () => {
  log.innerHTML = "";
  const P = window.__wsDraft, I = window.__wsInsert;
  say(!!P && !!I, "원고 도구가 올라왔다");
  if (!P || !I) return;

  // 편집기를 비웁니다 (새 글에서 시작하는 상황)
  document.getElementById("editor").innerHTML =
    '<div class="se-component se-text"><p class="se-text-paragraph"><span class="se-ff-nanumgothic se-fs16"></span></p></div>';
  await new Promise(r => setTimeout(r, 300));
  say(I.isEmpty().empty, "편집기가 비어 있다고 알아본다");

  const RAW = [
    "### 4단계: 본문 작성",
    "",
    "# 당김이 없어졌어요 - 째피 핑크라인 바디워시 2주 솔직 후기",
    "",
    "요즘 환절기 지나가면서 샤워하고 나면 피부가 당기는 느낌이 심해졌습니다.",
    "",
    "[사진 1: 째피 핑크라인 패키지]",
    "",
    "■ 패키지 첫인상",
    "",
    "핑크색 바디에 노란 펌프, 레트로한 번개 로고까지.",
    "",
    "■ 2주 써본 결과",
    "",
    "가격은 두 개 세트로 **29,800원**이었고 용량은 각각 **300ml**입니다.",
    "",
    "> 다른 바디워시와 달리 씻고 난 뒤 10분이 지나도 당김이 없었어요.",
    "",
    "저는 **재구매 의사 있습니다**.",
    "",
    "### 5단계: 팩트체크",
    "- 가격 확인 필요"
  ].join(String.fromCharCode(10));

  const draft = P.parse(RAW);
  say(draft.stats.subheads === 2, "소제목 2개를 찾았다", draft.stats.subheads + "개");
  say(draft.stats.quotes === 1, "인용구 1개", draft.stats.quotes + "개");
  say(draft.stats.photos === 1, "사진 자리 1곳", draft.stats.photos + "곳");
  say(draft.stats.marks === 3, "굵게 3개", draft.stats.marks + "개");

  const r = await I.insert(draft, () => {});
  say(r.ok, "넣기가 끝났다", r.ok ? (r.done.length + "군데") : r.why);
  if (!r.ok) return;

  const body = document.getElementById("editor").innerText;
  say(body.includes("환절기"), "본문이 들어갔다");
  say(!body.includes("5단계"), "팩트체크는 안 들어갔다");
  say(!body.includes("**"), "** 표시가 글자로 안 남았다");
  say(body.includes("[사진: 째피 핑크라인 패키지]"), "사진 자리가 글자로 남았다");

  const titleP = document.querySelector(".se-documentTitle .se-text-paragraph") || document.getElementById("t");
  say(titleP && titleP.innerText.includes("당김이 없어졌어요"), "제목이 들어갔다",
    titleP ? titleP.innerText.slice(0, 34) : "");

  const secs = document.querySelectorAll(".se-component.se-sectionTitle").length;
  const quos = document.querySelectorAll(".se-component.se-quotation").length;
  say(secs === 2, "소제목 스타일 2개가 실제로 걸렸다", secs + "개");
  say(quos === 1, "인용구 스타일 1개가 걸렸다", quos + "개");
  say(/<b[\s>]|font-weight/i.test(document.getElementById("editor").innerHTML), "굵게가 HTML에 들어갔다");

  // 임시저장
  const sv = await I.saveDraft();
  say(sv.ok, "저장 버튼을 찾아 눌렀다", sv.ok ? sv.label : sv.why);
  say(saveCount === 1, "저장이 한 번 눌렸다", saveCount + "번");

  // 글이 있을 때는 막아야 합니다
  const st = I.isEmpty();
  say(!st.empty, "이제 편집기가 비어있지 않다고 본다", st.chars + "자");
  const r2 = await I.insert(draft, () => {});
  say(!r2.ok && r2.needsConfirm, "글이 있으면 덮어쓰지 않고 멈춘다", r2.why ? r2.why.slice(0, 40) : "");

  log.insertAdjacentHTML("beforeend",
    '<div class="row" style="margin-top:10px"><b>통과 ' + pass + ' · 실패 ' + fail + '</b></div>');
};

document.getElementById("run").onclick = async () => {
  log.innerHTML = "";
  const F = window.__wsFormat;
  say(!!F, "서식 도구가 올라왔다");
  if (!F) return;

  const paras = () => [...document.querySelectorAll(".se-text-paragraph")];

  // 1) 드롭다운을 찾는가
  say(!!F.findStyleDropdown(), "문단 스타일 드롭다운을 찾았다",
    F.findStyleDropdown() ? F.findStyleDropdown().textContent.trim() : "");

  // 2) 소제목으로 바꾸는가
  const sub = paras().find(p => p.innerText.includes("패키지 첫인상"));
  const r1 = await F.setParagraphStyle(sub, "소제목");
  say(r1, "소제목으로 바꿨다");
  say(sub.closest(".se-component").classList.contains("se-sectionTitle"),
    "실제로 소제목 스타일이 됐다", sub.closest(".se-component").className);
  say(!!sub.querySelector("span"), "span이 살아있다");
  say(sub.innerText.includes("패키지 첫인상"), "글자가 그대로다");

  // 3) 인용구
  const q = paras().find(p => p.innerText.includes("씻고 나면 당기는 그 느낌"));
  const r2 = await F.setParagraphStyle(q, "인용구");
  say(r2, "인용구로 바꿨다");
  say(q.closest(".se-component").classList.contains("se-quotation"),
    "실제로 인용구 스타일이 됐다", q.closest(".se-component").className);

  // 4) 강조 — 굵게/밑줄/글자색/배경색
  const target = paras().find(p => p.innerText.includes("29,800원"));
  for (const [phrase, kind, label] of [
    ["29,800원", "highlight", "배경색"],
    ["300ml", "bold", "굵게"],
    ["재구매 의사 있습니다", "underline", "밑줄"],
    ["씻고 난 뒤 10분이 지나도", "color", "글자색"],
  ]) {
    const before = target.innerText;
    const r = await F.applyMark(target, phrase, kind);
    say(r.ok, label + ' "' + phrase + '" 넣었다', r.ok ? "" : r.why);
    say(target.innerText === before, label + " 넣어도 글자가 안 바뀐다");
  }

  // 5) 없는 글자는 없다고 하는가
  const r3 = await F.applyMark(target, "본문에 절대 없는 문장입니다", "bold");
  say(!r3.ok && /못 찾/.test(r3.why), "없는 글자는 없다고 말한다", r3.why);

  // 6) 서식이 실제로 HTML에 들어갔나
  const h = target.innerHTML;
  say(/<b|font-weight/i.test(h), "굵게가 HTML에 들어갔다");
  say(/<u|underline/i.test(h), "밑줄이 HTML에 들어갔다");
  say(/background-color|bgcolor/i.test(h), "배경색이 HTML에 들어갔다");
  say(/color:|<font/i.test(h), "글자색이 HTML에 들어갔다");
  say(!!target.querySelector("span"), "강조 넣은 뒤에도 span이 살아있다");

  log.insertAdjacentHTML("beforeend",
    '<div class="row" style="margin-top:10px"><b>통과 ' + pass + ' \\u00b7 실패 ' + fail + '</b></div>');
};
</script>
</body></html>`;

const out = path.join(ROOT, "public", "preview-format.html");
fs.writeFileSync(out, html);
console.log("만들었습니다:", out);
