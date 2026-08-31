// 네이버 스마트에디터에 원고를 넣습니다.
//
// ⚠️ 여기가 이 확장의 심장이자 가장 깨지기 쉬운 곳입니다.
//
// 스마트에디터(SE3)는 그냥 <textarea>가 아니라, 문단·사진·인용이 각각 컴포넌트로
// 관리되는 복잡한 편집기입니다. DOM에 글자를 억지로 꽂아 넣으면 화면에는 보이지만
// 편집기 내부 상태에는 반영되지 않아서, 발행하면 빈 글이 올라갑니다.
//
// 그래서 **붙여넣기를 흉내 내는 방식**을 씁니다. 편집기는 사람이 Ctrl+V 한 것과
// 똑같이 받아들여서 자기 방식대로 컴포넌트를 만듭니다. 이게 가장 안전합니다.
//
// 그마저도 안 되는 경우를 대비해 세 단계로 물러납니다:
//   1) 붙여넣기 이벤트 (제일 좋음 — 서식이 살아서 들어감)
//   2) execCommand("insertHTML") (옛 방식이지만 아직 대부분 먹힘)
//   3) 클립보드에 담아두고 "Ctrl+V 눌러주세요" 안내 (최후)
//
// ⚠️ 그리고 **발행 버튼은 누르지 않습니다.** 내용을 채워넣기만 하고,
// 확인과 발행은 사람이 합니다. 잘못 쓴 글이 그대로 올라가는 걸 막고,
// 네이버 약관과도 부딪히지 않기 위해서입니다.

(() => {
  "use strict";

  // 글쓰기 화면이 아니면 아무것도 하지 않습니다.
  const isWritePage = () =>
    /PostWriteForm|postwrite/i.test(location.href) ||
    document.querySelector(".se-content, .se-documentTitle, #se-editor");

  // ─────────────────────────────────────────────────────────
  // 편집기 요소 찾기
  //
  // ⚠️ 선택자를 하나만 쓰면 네이버가 클래스 이름을 조금만 바꿔도 통째로 죽습니다.
  // 여러 개를 순서대로 시도하고, 그래도 못 찾으면 "못 찾았다"고 정확히 말합니다.
  // ─────────────────────────────────────────────────────────
  const TITLE_SELECTORS = [
    ".se-documentTitle .se-text-paragraph",
    ".se-documentTitle [contenteditable='true']",
    ".se-title-text [contenteditable]",
    "[data-a11y-title='제목'] [contenteditable]",
    "#subject",                      // 옛 에디터
    "input[name='subject']",
  ];

  const BODY_SELECTORS = [
    ".se-component-content .se-text-paragraph",
    ".se-section-text [contenteditable='true']",
    ".se-content [contenteditable='true']",
    ".se-main-container [contenteditable='true']",
    "#se-editor [contenteditable='true']",
    "iframe#se2_iframe",             // 옛 에디터
  ];

  function findOne(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return { el, selector: sel };
    }
    return null;
  }

  /** 진짜 글을 넣을 수 있는 곳인지 확인합니다. */
  function editableOf(el) {
    if (!el) return null;
    if (el.isContentEditable) return el;
    const inner = el.querySelector("[contenteditable='true']");
    if (inner) return inner;
    const outer = el.closest("[contenteditable='true']");
    return outer || (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? el : null);
  }

  // ─────────────────────────────────────────────────────────
  // 넣기
  // ─────────────────────────────────────────────────────────

  /** 커서를 그 요소 안 맨 끝에 둡니다. 이걸 안 하면 엉뚱한 데 붙습니다. */
  function placeCaret(el) {
    el.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* 커서를 못 옮겨도 focus만으로 되는 경우가 있습니다 */ }
  }

  /** 붙여넣기를 흉내 냅니다. 편집기가 사람이 Ctrl+V 한 것으로 받아들입니다. */
  function firePaste(el, html, plain) {
    placeCaret(el);
    try {
      const dt = new DataTransfer();
      if (html) dt.setData("text/html", html);
      dt.setData("text/plain", plain || "");
      const ev = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      // dispatchEvent가 false를 돌려주면 편집기가 기본 동작을 막고 자기가 처리한 것입니다.
      // 즉 false가 오히려 "잘 먹었다"는 뜻일 때가 많아서, 결과만으로 판단하지 않고
      // 실제로 글자가 들어갔는지 나중에 확인합니다.
      el.dispatchEvent(ev);
      return true;
    } catch {
      return false;
    }
  }

  function fireInsertHtml(el, html) {
    placeCaret(el);
    try {
      return document.execCommand("insertHTML", false, html);
    } catch {
      return false;
    }
  }

  function textLen(el) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return (el.value || "").length;
    return (el.innerText || "").replace(/\s/g, "").length;
  }

  /**
   * 실제로 넣고, 정말 들어갔는지 확인합니다.
   *
   * ⚠️ "넣었습니다"라고 말해놓고 실제로는 안 들어간 게 최악입니다.
   * 넣기 전후의 글자 수를 비교해서 정말 늘었는지 봅니다.
   */
  async function insertInto(el, { html, plain }) {
    const before = textLen(el);

    // input/textarea는 값만 넣으면 됩니다.
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.focus();
      el.value = plain;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: (el.value || "").length > 0, how: "value" };
    }

    firePaste(el, html, plain);
    await new Promise((r) => setTimeout(r, 250));
    if (textLen(el) > before) return { ok: true, how: "paste" };

    fireInsertHtml(el, html || plain.replace(/\n/g, "<br>"));
    await new Promise((r) => setTimeout(r, 250));
    if (textLen(el) > before) return { ok: true, how: "insertHTML" };

    return { ok: false, how: "failed" };
  }

  // ─────────────────────────────────────────────────────────
  // 원고를 스마트에디터가 좋아하는 HTML로
  //
  // ⚠️ 클래스나 style을 잔뜩 붙여봐야 스마트에디터가 거의 다 지웁니다.
  // 살아남는 건 h2·p·blockquote·hr 정도라 그것만 씁니다.
  // ─────────────────────────────────────────────────────────
  function toEditorHtml(blocks) {
    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return blocks.map((b) => {
      const t = esc(b.text || "");
      if (b.type === "h2" || b.type === "h3") return `<h3>${t}</h3>`;
      if (b.type === "quote") return `<blockquote><p>${t}</p></blockquote>`;
      if (b.type === "hr") return "<hr>";
      if (b.type === "image") return `<p>[ 사진 자리 — ${t} ]</p>`;
      return `<p>${t}</p>`;
    }).join("\n");
  }

  function toPlain(blocks) {
    return blocks.map((b) => {
      if (b.type === "hr") return "─────────";
      if (b.type === "image") return `[ 사진 자리 — ${b.text || ""} ]`;
      return b.text || "";
    }).join("\n\n");
  }

  // ─────────────────────────────────────────────────────────
  // 화면에 띄우는 작은 창
  // ─────────────────────────────────────────────────────────
  let panel = null;

  function say(msg, kind = "info") {
    const box = panel && panel.querySelector(".ws-msg");
    if (!box) return;
    box.className = `ws-msg ws-${kind}`;
    box.innerHTML = msg;
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "ws-panel";
    panel.innerHTML = `
      <div class="ws-head">
        <span class="ws-logo">우수리미 포스팅</span>
        <button class="ws-min" title="접기">—</button>
      </div>
      <div class="ws-body">
        <div class="ws-tabs">
          <button class="ws-tab ws-on" data-mode="topic">주제로 쓰기</button>
          <button class="ws-tab" data-mode="paste">가진 원고 넣기</button>
        </div>

        <div class="ws-pane" data-pane="topic">
          <input class="ws-in" id="ws-topic" placeholder="예: 제주도 카페 추천">
          <input class="ws-in" id="ws-kw" placeholder="노리는 키워드 (선택)">
          <select class="ws-in" id="ws-tone">
            <option value="후기형">후기형 — 직접 겪은 이야기</option>
            <option value="정보형">정보형 — 알려주는 글</option>
            <option value="추천형">추천형 — 여러 개 비교</option>
            <option value="일상형">일상형 — 편한 이야기</option>
          </select>
          <button class="ws-go" id="ws-write">✍️ 원고 만들기</button>
        </div>

        <div class="ws-pane ws-hide" data-pane="paste">
          <textarea class="ws-in ws-ta" id="ws-raw" placeholder="다른 데서 쓴 원고를 붙여넣으세요. 제목·본문·태그를 알아서 나눠서 에디터에 넣어드립니다."></textarea>
          <button class="ws-go" id="ws-parse">📥 에디터에 넣기</button>
        </div>

        <div class="ws-msg"></div>
        <div class="ws-result ws-hide">
          <div class="ws-rt" id="ws-rtitle"></div>
          <div class="ws-rm" id="ws-rmeta"></div>
          <div class="ws-btns">
            <button class="ws-go ws-half" id="ws-insert">에디터에 넣기</button>
            <button class="ws-ghost ws-half" id="ws-copy">복사</button>
          </div>
          <div class="ws-tags" id="ws-rtags"></div>
        </div>
        <div class="ws-foot">
          발행 버튼은 직접 눌러주세요. 내용만 채워드립니다.
          <a href="#" id="ws-opt">설정</a>
        </div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector(".ws-min").onclick = () => panel.classList.toggle("ws-folded");
    panel.querySelectorAll(".ws-tab").forEach((b) => (b.onclick = () => {
      panel.querySelectorAll(".ws-tab").forEach((x) => x.classList.toggle("ws-on", x === b));
      panel.querySelectorAll(".ws-pane").forEach((p) =>
        p.classList.toggle("ws-hide", p.dataset.pane !== b.dataset.mode));
    }));
    panel.querySelector("#ws-opt").onclick = (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "openOptions" });
    };
    panel.querySelector("#ws-write").onclick = writeFromTopic;
    panel.querySelector("#ws-parse").onclick = parseRaw;
    panel.querySelector("#ws-insert").onclick = () => insertCurrent();
    panel.querySelector("#ws-copy").onclick = copyCurrent;

    return panel;
  }

  // ─────────────────────────────────────────────────────────
  // 서버에 원고 부탁하기
  // ─────────────────────────────────────────────────────────
  let current = null; // { title, blocks, tags }

  function ask(type, payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, resolve);
    });
  }

  async function writeFromTopic() {
    const topic = panel.querySelector("#ws-topic").value.trim();
    if (!topic) { panel.querySelector("#ws-topic").focus(); return; }
    const btn = panel.querySelector("#ws-write");
    btn.disabled = true;
    btn.textContent = "쓰는 중… 40초쯤 걸려요";
    say("AI가 원고를 쓰고 있습니다. 창을 닫지 마세요.", "wait");

    const res = await ask("write", {
      topic,
      keyword: panel.querySelector("#ws-kw").value.trim(),
      tone: panel.querySelector("#ws-tone").value,
    });

    btn.disabled = false;
    btn.textContent = "✍️ 원고 만들기";
    if (!res || !res.ok) {
      say(`만들지 못했습니다.<br><small>${(res && res.message) || "서버에 닿지 못했습니다"}</small>`, "bad");
      return;
    }
    showResult(res.data);
  }

  async function parseRaw() {
    const raw = panel.querySelector("#ws-raw").value.trim();
    if (!raw) { panel.querySelector("#ws-raw").focus(); return; }
    const btn = panel.querySelector("#ws-parse");
    btn.disabled = true;
    btn.textContent = "정리하는 중…";
    say("원고에서 제목·본문·태그를 골라내는 중입니다.", "wait");

    const res = await ask("parse", { text: raw });
    btn.disabled = false;
    btn.textContent = "📥 에디터에 넣기";
    if (!res || !res.ok) {
      say(`정리하지 못했습니다.<br><small>${(res && res.message) || ""}</small>`, "bad");
      return;
    }
    showResult(res.data);
    insertCurrent();
  }

  function showResult(d) {
    current = d;
    const box = panel.querySelector(".ws-result");
    box.classList.remove("ws-hide");
    panel.querySelector("#ws-rtitle").textContent = d.title || "(제목 없음)";
    const chars = toPlain(d.blocks).replace(/\s/g, "").length;
    panel.querySelector("#ws-rmeta").textContent =
      `${chars.toLocaleString()}자 · 소제목 ${d.blocks.filter((b) => b.type === "h2" || b.type === "h3").length}개` +
      (d.audit ? ` · 진단 ${d.audit.score}점` : "");
    panel.querySelector("#ws-rtags").innerHTML =
      (d.tags || []).map((t) => `<span>#${t}</span>`).join("");
    say("원고가 나왔습니다. 아래 <b>에디터에 넣기</b>를 눌러주세요.", "good");
  }

  // ─────────────────────────────────────────────────────────
  // 에디터에 넣기
  // ─────────────────────────────────────────────────────────
  async function insertCurrent() {
    if (!current) { say("먼저 원고를 만들어주세요.", "bad"); return; }

    const titleFound = findOne(TITLE_SELECTORS);
    const bodyFound = findOne(BODY_SELECTORS);

    if (!bodyFound) {
      say(
        "본문 넣을 곳을 못 찾았습니다.<br>" +
        "<small>글쓰기 화면이 맞는지 확인해 주세요. 맞는데도 안 되면 아래 <b>복사</b>를 누르고 직접 붙여넣으시면 됩니다.</small>",
        "bad"
      );
      return;
    }

    let done = [];

    // 제목
    const titleEl = titleFound ? editableOf(titleFound.el) : null;
    if (titleEl && current.title) {
      const r = await insertInto(titleEl, { html: null, plain: current.title });
      done.push(r.ok ? "제목" : null);
    }

    // 본문
    const bodyEl = editableOf(bodyFound.el);
    if (bodyEl) {
      const r = await insertInto(bodyEl, {
        html: toEditorHtml(current.blocks),
        plain: toPlain(current.blocks),
      });
      done.push(r.ok ? "본문" : null);
      if (!r.ok) {
        await copyCurrent();
        say(
          "자동으로 넣지 못했습니다.<br>" +
          "<small>본문을 클립보드에 담아뒀습니다. 에디터 본문을 클릭하고 <b>Ctrl+V</b> 눌러주세요.</small>",
          "warn"
        );
        return;
      }
    }

    const ok = done.filter(Boolean);
    if (ok.length) {
      say(
        `${ok.join("·")}을(를) 넣었습니다.<br>` +
        `<small>사진을 넣으시고 내용 확인한 뒤 <b>직접 발행</b>해 주세요.` +
        (current.tags && current.tags.length ? " 태그는 아래에서 복사하시면 됩니다." : "") +
        `</small>`,
        "good"
      );
    } else {
      say("넣지 못했습니다. 복사해서 직접 붙여넣어 주세요.", "bad");
    }
  }

  async function copyCurrent() {
    if (!current) return;
    const html = toEditorHtml(current.blocks);
    const plain = toPlain(current.blocks);
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      say("클립보드에 담았습니다. 본문에서 <b>Ctrl+V</b> 하세요.", "good");
    } catch {
      say("복사하지 못했습니다.", "bad");
    }
  }

  // ─────────────────────────────────────────────────────────
  // 시작
  // ─────────────────────────────────────────────────────────
  function boot() {
    if (!isWritePage()) return;
    // 같은 페이지에 여러 번 붙지 않게 합니다(아이프레임 때문에 두 번 실행될 수 있습니다).
    if (window.__wsPostingLoaded) return;
    window.__wsPostingLoaded = true;
    /**
     * ⚠️ 2026-08-31 사장님 지시: 이 파란 창("우수리미 포스팅")을 화면에서 뺍니다.
     * 사장님의 실제 동선은 골든 블로그 플로어 → 통합 복사 → Ctrl+V라서 이 창을 안 쓰고,
     * 화면 오른쪽 위를 계속 가렸습니다. 기능은 남겨둡니다 — 팝업에서 "insertDraft"로
     * 부르면(아래 리스너) 그때만 창을 만들어 띄웁니다. 여기서 미리 만들지만 않습니다.
     */
  }

  // 스마트에디터는 늦게 뜹니다. 잠깐 기다렸다가 다시 확인합니다.
  boot();
  let tries = 0;
  const timer = setInterval(() => {
    if (window.__wsPostingLoaded || ++tries > 20) return clearInterval(timer);
    boot();
  }, 700);

  // 팝업에서 "지금 페이지에 넣어줘" 하고 부를 수 있게 열어둡니다.
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === "insertDraft") {
      current = msg.payload;
      buildPanel();
      showResult(current);
      insertCurrent().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg && msg.type === "ping") {
      sendResponse({ ok: true, write: isWritePage() });
    }
  });
})();
