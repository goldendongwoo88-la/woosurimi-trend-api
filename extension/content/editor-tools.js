// 글쓰기 창 안에서 바로 쓰는 도구 모음.
//
// ⚠️ 왜 만들었나
// 글을 쓰다가 글자 수를 세거나 금지어를 확인하려면 매번 다른 창을 열어야 합니다.
// 돌아오면 흐름이 끊겨 있고, 몇 번 반복하면 그냥 확인을 안 하게 됩니다.
// 그래서 확인해야 할 숫자를 **에디터 위에 계속 띄워둡니다.**
//
// ⚠️ 제일 중요한 원칙: **읽기만 하는 기능과 고치는 기능을 엄격히 나눕니다.**
// 스마트에디터는 내부 상태로 문서를 관리해서, DOM을 함부로 건드리면 화면에는
// 반영돼도 발행하면 내용이 날아갑니다. 그래서
//   - 세기·검사·내려받기 → 읽기만 합니다. 절대 안 깨집니다.
//   - 넣기(표 등)      → 사람이 Ctrl+V 한 것처럼 흉내 냅니다. 그래도 안 되면 솔직히 말합니다.
// 되는 척하다가 사장님 글을 날리는 것보다, 안 된다고 말하는 게 낫습니다.

(() => {
  "use strict";

  if (window.__wsTools) return; // 프레임마다 두 번 뜨는 걸 막습니다
  window.__wsTools = true;

  const DEFAULT_SERVER = "https://woosurimi-trend-api.onrender.com";

  const isWritePage = () =>
    /PostWriteForm|postwrite/i.test(location.href) ||
    document.querySelector(".se-content, .se-documentTitle, #se-editor");

  // ── 본문 읽기 ─────────────────────────────────────────
  // ⚠️ 에디터 구조가 바뀌어도 최대한 버티도록 여러 선택자를 훑습니다.
  function getEditorRoot() {
    return (
      document.querySelector(".se-main-container") ||
      document.querySelector(".se-content") ||
      document.querySelector("#se-editor") ||
      null
    );
  }

  function getTitle() {
    const el =
      document.querySelector(".se-documentTitle .se-text-paragraph") ||
      document.querySelector(".se-documentTitle [contenteditable='true']") ||
      document.querySelector("#subject");
    if (!el) return "";
    return (el.value ?? el.innerText ?? "").trim();
  }

  function getBodyText() {
    const root = getEditorRoot();
    if (!root) return "";
    // 제목 영역은 본문에서 뺍니다. 안 그러면 글자 수가 부풀려집니다.
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".se-documentTitle").forEach((n) => n.remove());
    return (clone.innerText || "").replace(/​/g, "").trim();
  }

  function countMedia() {
    const root = getEditorRoot();
    if (!root) return { images: 0, videos: 0, links: 0, stickers: 0 };
    return {
      // 스티커·이모티콘이 img로 잡혀서 글 사진 수가 부풀려집니다. 따로 셉니다.
      images: root.querySelectorAll(".se-component.se-image img, .se-image-resource").length,
      videos: root.querySelectorAll(".se-component.se-video, .se-component.se-oglink video, video").length,
      links: root.querySelectorAll(".se-component.se-oglink, .se-link").length,
      stickers: root.querySelectorAll(".se-component.se-sticker, .se-sticker-image").length,
    };
  }

  // ── 화면 ──────────────────────────────────────────────
  const bar = document.createElement("div");
  bar.id = "ws-tools-bar";
  bar.innerHTML = `
    <div class="ws-tb-counts">
      <span class="ws-tb-item" title="공백 포함 / 공백 제외">
        <b id="ws-c-all">0</b><small>자</small>
        <em id="ws-c-nospace">0</em>
      </span>
      <span class="ws-tb-item"><b id="ws-c-img">0</b><small>사진</small></span>
      <span class="ws-tb-item"><b id="ws-c-vid">0</b><small>영상</small></span>
      <span class="ws-tb-item"><b id="ws-c-link">0</b><small>링크</small></span>
    </div>
    <div class="ws-tb-actions">
      <button data-act="hometitle" class="ws-tb-primary" title="지금 제목을 홈판에서 눈이 멈추도록 고칩니다">홈판 제목</button>
      <button data-act="homebody" class="ws-tb-primary" title="본문을 소제목 6개로 나누고 사진 자리를 잡습니다">홈판 본문</button>
      <button data-act="audit" title="문제가 될 만한 표현을 찾습니다">표현 검사</button>
      <button data-act="keyword" title="제목의 키워드 경쟁 상황을 봅니다">키워드</button>
      <button data-act="table" title="표를 넣습니다">표</button>
      <button data-act="word" title="워드 파일로 내려받습니다">워드</button>
      <button data-act="toggle" class="ws-tb-min" title="접기">—</button>
    </div>
  `;

  const panel = document.createElement("div");
  panel.id = "ws-tools-panel";
  panel.hidden = true;

  function showPanel(html) {
    panel.innerHTML = `<button class="ws-panel-close" title="닫기">✕</button>${html}`;
    panel.hidden = false;
    panel.querySelector(".ws-panel-close").onclick = () => (panel.hidden = true);
  }

  // ── 숫자 갱신 ─────────────────────────────────────────
  // ⚠️ 타자 칠 때마다 다 세면 편집기가 버벅입니다. 600ms에 한 번만 셉니다.
  let tick = null;
  function scheduleCount() {
    if (tick) return;
    tick = setTimeout(() => {
      tick = null;
      updateCounts();
    }, 600);
  }

  function updateCounts() {
    const text = getBodyText();
    const m = countMedia();
    const all = text.length;
    const nospace = text.replace(/\s/g, "").length;
    setText("ws-c-all", all.toLocaleString());
    setText("ws-c-nospace", "공백제외 " + nospace.toLocaleString());
    setText("ws-c-img", m.images);
    setText("ws-c-vid", m.videos);
    setText("ws-c-link", m.links);

    // 네이버에서 잘 먹히는 분량대를 색으로 알려줍니다.
    const el = document.getElementById("ws-c-all");
    if (el) el.style.color = all >= 1500 ? "#0b8f4d" : all >= 800 ? "#b7791f" : "#8b909c";
  }

  const setText = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };

  // ── 서버 호출 ─────────────────────────────────────────
  async function server(pathname, body) {
    // ⚠️ 저장소 키 이름을 다른 파일과 맞춰야 합니다.
    // 처음에 serverUrl로 읽었는데 설정 화면은 server로 저장합니다.
    // 그러면 사장님이 서버 주소를 바꿔도 반영이 안 되고, 왜 안 되는지도 알 수 없습니다.
    const { server: serverUrl, wsToken } = await chrome.storage.sync.get(["server", "wsToken"]);
    const base = (serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
    const headers = { "content-type": "application/json" };
    // ⚠️ 도메인이 달라 쿠키가 안 실립니다. 토큰을 머리글에 넣습니다.
    // 토큰은 확장 설정 화면에서 넣습니다. AI 기능에만 필요합니다.
    if (wsToken) headers["x-ws-token"] = wsToken;
    const res = await fetch(base + pathname, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401)
        throw new Error("확장 설정에 이용권 토큰을 넣어야 합니다. 우수리미에 로그인해서 받으세요.");
      if (res.status === 402)
        throw new Error("이 기능은 유료 이용권이 필요합니다.");
      throw new Error(data.message || data.error || `서버 오류 ${res.status}`);
    }
    return data;
  }

  // ── 표현 검사 ─────────────────────────────────────────
  async function runAudit() {
    const body = getBodyText();
    if (body.length < 30) return showPanel(`<p>본문이 너무 짧습니다. 조금 더 쓰신 뒤에 눌러주세요.</p>`);
    showPanel(`<p>검사 중입니다…</p>`);
    try {
      const m = countMedia();
      const d = await server("/api/post-audit", {
        title: getTitle(),
        body,
        images: m.images,
      });
      const items = (d.checks || []).filter((c) => c.level === "bad" || c.level === "warn");
      showPanel(`
        <h4>표현 검사</h4>
        ${items.length
          ? items.map((c) => `
              <div class="ws-row ${c.level}">
                <b>${esc(c.label || c.key)}</b>
                <div>${esc(c.message || "")}</div>
                ${c.detail ? `<div class="ws-dim">${esc(c.detail)}</div>` : ""}
              </div>`).join("")
          : `<div class="ws-row good">문제가 될 만한 표현을 찾지 못했습니다.</div>`}
        <p class="ws-dim">규정은 계속 바뀝니다. 이 검사는 참고용이고, 최종 판단은 사장님이 하셔야 합니다.</p>
      `);
    } catch (e) {
      showPanel(`<h4>표현 검사</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 키워드 ────────────────────────────────────────────
  async function runKeyword() {
    const title = getTitle();
    const guess = title.split(/[|\-–—[\]()]/)[0].trim().slice(0, 30);
    const kw = prompt("확인할 키워드", guess || "");
    if (!kw) return;
    showPanel(`<p>${esc(kw)} — 네이버에서 확인 중입니다…</p>`);
    try {
      const d = await server("/api/keyword-ranking", { keyword: kw });
      if (!d.ok) {
        return showPanel(`<h4>${esc(kw)}</h4><div class="ws-row warn">${esc(d.why || "확인하지 못했습니다.")}</div>`);
      }
      showPanel(`
        <h4>${esc(kw)} — 상위 ${d.results.length}건</h4>
        <ol class="ws-list">
          ${d.results.slice(0, 10).map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.blogId)}</a></li>`).join("")}
        </ol>
        <p class="ws-dim">이 사람들과 같은 자리를 두고 겨루게 됩니다.</p>
      `);
    } catch (e) {
      showPanel(`<h4>키워드</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 홈판 제목으로 보완 ────────────────────────────────
  //
  // ⚠️ 이걸 왜 글쓰기 창 안에 넣었나
  // 제목은 **글을 다 쓰고 나서** 고치는 게 맞습니다. 본문이 있어야 그 안에 있는
  // 사실로 궁금증을 만들 수 있고, 없는 걸 지어내지 않게 됩니다.
  // 그래서 사이트가 아니라 여기, 방금 글을 다 쓴 자리에 뒀습니다.
  //
  // ⚠️ 제목을 자동으로 바꾸지 않습니다. 후보를 보여주고 사장님이 고르십니다.
  // 제목은 글의 얼굴이라 마음대로 바꾸면 안 됩니다.
  async function homeTitle() {
    const title = getTitle();
    if (!title) {
      return showPanel(`<h4>홈판 제목</h4><div class="ws-row warn">
        제목을 먼저 쓰신 뒤에 눌러주세요.</div>`);
    }
    const body = getBodyText();
    showPanel(`<h4>홈판 제목</h4><p>본문 ${body.length.toLocaleString()}자를 읽고 만드는 중입니다… 10초쯤 걸립니다.</p>`);
    try {
      const d = await server("/api/title-rewrite", { title, body: body.slice(0, 1500), count: 5 });
      const dev = (o) =>
        [o.quoteStart && "따옴표", o.ellipsis && "말줄임표", o.curiosity && "궁금증", o.number && "숫자"]
          .filter(Boolean).map((x) => `<span class="ws-chip">${x}</span>`).join("") || `<span class="ws-chip dim">장치 없음</span>`;

      showPanel(`
        <h4>홈판 제목 후보</h4>
        <div class="ws-dim" style="margin-bottom:8px">
          지금 제목 <b>${d.original.score}/4</b> ${dev(d.original.devices)}<br>${esc(d.original.text)}
        </div>
        ${d.titles.map((x) => `
          <div class="ws-title" data-title="${esc(x.text)}">
            <div><b>${x.score}/4</b> ${dev(x.devices)}</div>
            <div class="ws-title-text">${esc(x.text)}</div>
            <div class="ws-dim">${esc(x.why)}</div>
            ${x.invented && x.invented.length ? `<div class="ws-row bad" style="margin:5px 0 0">
              ⚠ 본문에 없는 말: <b>${esc(x.invented.join(", "))}</b></div>` : ""}
            <button class="ws-apply" data-apply="${esc(x.text)}">이걸로 바꾸기</button>
          </div>`).join("")}
        <p class="ws-dim">제목이 약속한 내용은 본문에 반드시 있어야 합니다.
          들어왔다가 바로 나가면 조회수는 올라도 블로그가 상합니다.</p>
      `);

      panel.querySelectorAll("[data-apply]").forEach((b) =>
        b.addEventListener("click", () => applyTitle(b.dataset.apply))
      );
    } catch (e) {
      showPanel(`<h4>홈판 제목</h4><div class="ws-row bad">${esc(e.message)}</div>
        <p class="ws-dim">우수리미에 로그인하고 이용권이 있어야 쓸 수 있는 기능입니다.</p>`);
    }
  }

  /** 고른 제목을 제목 칸에 넣습니다. */
  function applyTitle(text) {
    const el =
      document.querySelector(".se-documentTitle .se-text-paragraph") ||
      document.querySelector(".se-documentTitle [contenteditable='true']") ||
      document.querySelector("#subject");
    if (!el) {
      navigator.clipboard.writeText(text).catch(() => {});
      return showPanel(`<h4>홈판 제목</h4><div class="ws-row warn">
        제목 칸을 찾지 못했습니다. 복사해 뒀으니 직접 붙여넣어 주세요.</div>`);
    }
    // 옛 에디터는 input이라 value를, 새 에디터는 contenteditable이라 붙여넣기를 씁니다.
    if ("value" in el && el.tagName === "INPUT") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      panel.hidden = true;
      return;
    }
    el.focus();
    // 기존 제목을 모두 선택한 뒤 갈아끼웁니다.
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    let ok = false;
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      ok = el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {}
    if (!ok) { try { ok = document.execCommand("insertText", false, text); } catch {} }
    if (!ok) {
      navigator.clipboard.writeText(text).catch(() => {});
      showPanel(`<h4>홈판 제목</h4><div class="ws-row warn">
        제목을 바로 바꾸지 못했습니다. 복사해 뒀으니 제목 칸에서 Ctrl+V를 눌러주세요.</div>`);
      return;
    }
    panel.hidden = true;
  }

  // ── 홈판 본문으로 보완 ────────────────────────────────
  //
  // ⚠️ 제목보다 훨씬 조심스러운 기능입니다. 사장님이 직접 쓴 글에 손을 댑니다.
  // 그래서 **에디터를 자동으로 갈아치우지 않습니다.** 다듬은 글을 보여주고,
  // 사장님이 읽어본 뒤에 직접 복사해 가시게 합니다.
  // 한 번 덮어쓰면 되돌릴 수가 없어서, 편한 것보다 안전한 쪽을 골랐습니다.
  let lastBody = null;

  async function homeBody() {
    const body = getBodyText();
    if (body.length < 200) {
      return showPanel(`<h4>홈판 본문</h4><div class="ws-row warn">
        본문이 ${body.length}자입니다. 200자 이상 쓰신 뒤에 눌러주세요.</div>`);
    }
    showPanel(`<h4>홈판 본문</h4><p>${body.length.toLocaleString()}자를 여섯 토막으로 나누는 중입니다…
      30초에서 1분쯤 걸립니다. 창을 닫지 마세요.</p>`);
    try {
      const d = await server("/api/body-rewrite", { body, title: getTitle() });
      lastBody = d.body;
      const keep = Math.round((d.after.chars / d.before.chars) * 100);
      showPanel(`
        <h4>홈판 본문</h4>
        <div class="ws-stats">
          <span>소제목 <b>${d.before.subheads}</b> → <b class="ws-up">${d.after.subheads}</b>개</span>
          <span>사진자리 <b class="ws-up">${d.after.photoSlots}</b>곳</span>
          <span>분량 <b>${keep}%</b> 유지</span>
        </div>
        ${d.invented.length ? `<div class="ws-row bad">
          ⚠ 원문에 없던 말이 섞였습니다: <b>${esc(d.invented.join(", "))}</b><br>
          붙여넣기 전에 그 부분을 꼭 확인하세요.</div>` : ""}
        <div class="ws-subheads">
          ${d.subheads.map((s, i) => `<div><b>${i + 1}</b> ${esc(s)}</div>`).join("")}
        </div>
        ${d.suggestions && d.suggestions.length ? `<div class="ws-row good">
          <b>더 쓰면 좋을 것</b><br>${d.suggestions.map(esc).join("<br>")}</div>` : ""}
        <button class="ws-apply" id="ws-copy-body">다듬은 본문 복사</button>
        <details class="ws-preview"><summary>다듬은 본문 보기</summary><pre>${esc(d.body)}</pre></details>
        <p class="ws-dim">${esc(d.note)}</p>
        <p class="ws-dim"><b>에디터를 자동으로 바꾸지 않습니다.</b>
          복사해서 직접 붙여넣으세요. 한 번 덮어쓰면 되돌릴 수가 없어서요.
          [사진: …] 자리에는 실제 사진을 넣으시면 됩니다.</p>
      `);
      const btn = panel.querySelector("#ws-copy-body");
      if (btn) btn.addEventListener("click", () => {
        navigator.clipboard.writeText(lastBody).then(() => {
          btn.textContent = "복사됐습니다";
          setTimeout(() => (btn.textContent = "다듬은 본문 복사"), 1200);
        }).catch(() => { btn.textContent = "복사에 실패했습니다"; });
      });
    } catch (e) {
      showPanel(`<h4>홈판 본문</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 표 넣기 ───────────────────────────────────────────
  function insertTable() {
    const cols = Number(prompt("칸을 몇 개로 할까요? (2~6)", "3"));
    if (!cols || cols < 2 || cols > 6) return;
    const rows = Number(prompt("줄은 몇 개로 할까요? (2~10)", "3"));
    if (!rows || rows < 2 || rows > 10) return;

    let html = '<table style="width:100%;border-collapse:collapse">';
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        const tag = r === 0 ? "th" : "td";
        html += `<${tag} style="border:1px solid #ddd;padding:8px">${r === 0 ? "제목" + (c + 1) : ""}</${tag}>`;
      }
      html += "</tr>";
    }
    html += "</table>";

    // 사람이 붙여넣은 것처럼 흉내 냅니다. 이게 편집기 상태를 안 깨는 유일한 방법입니다.
    const target = document.querySelector(".se-section-text [contenteditable='true'], .se-content [contenteditable='true']");
    if (!target) {
      return showPanel(`<h4>표 넣기</h4><div class="ws-row warn">
        본문 영역을 찾지 못했습니다. 본문을 한 번 클릭하신 뒤에 다시 눌러주세요.</div>`);
    }
    target.focus();
    let ok = false;
    try {
      const dt = new DataTransfer();
      dt.setData("text/html", html);
      ok = target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch {}
    if (!ok) {
      try { ok = document.execCommand("insertHTML", false, html); } catch {}
    }
    if (!ok) {
      navigator.clipboard.writeText(html).catch(() => {});
      showPanel(`<h4>표 넣기</h4><div class="ws-row warn">
        편집기에 바로 넣지 못했습니다. 표 코드를 복사해 뒀으니 본문에서 <b>Ctrl+V</b>를 눌러주세요.</div>`);
    } else {
      panel.hidden = true;
      scheduleCount();
    }
  }

  // ── 워드 내려받기 ─────────────────────────────────────
  // ⚠️ 진짜 .docx를 만들려면 별도 라이브러리가 필요합니다. 대신 워드가 열 수 있는
  // HTML을 .doc으로 저장합니다. 워드에서 정상적으로 열리고 편집됩니다.
  function downloadWord() {
    const title = getTitle() || "블로그 원고";
    const root = getEditorRoot();
    if (!root) return showPanel(`<div class="ws-row warn">본문을 찾지 못했습니다.</div>`);
    const clone = root.cloneNode(true);
    clone.querySelectorAll(".se-documentTitle").forEach((n) => n.remove());

    const html =
      `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
      `<title>${esc(title)}</title></head><body>` +
      `<h1>${esc(title)}</h1>${clone.innerHTML}</body></html>`;

    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60)}.doc`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ── 시작 ──────────────────────────────────────────────
  function start() {
    if (!isWritePage()) return;
    if (document.getElementById("ws-tools-bar")) return;
    document.body.appendChild(bar);
    document.body.appendChild(panel);

    bar.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "hometitle") homeTitle();
      else if (act === "homebody") homeBody();
      else if (act === "audit") runAudit();
      else if (act === "keyword") runKeyword();
      else if (act === "table") insertTable();
      else if (act === "word") downloadWord();
      else if (act === "toggle") {
        bar.classList.toggle("ws-collapsed");
        panel.hidden = true;
      }
    });

    updateCounts();
    // 편집기 안에서 뭔가 바뀌면 다시 셉니다.
    const root = getEditorRoot();
    if (root) new MutationObserver(scheduleCount).observe(root, { childList: true, subtree: true, characterData: true });
    document.addEventListener("keyup", scheduleCount, true);
  }

  // 에디터가 늦게 뜨는 경우가 많아서 잠깐 기다렸다가 다시 시도합니다.
  start();
  let tries = 0;
  const iv = setInterval(() => {
    if (document.getElementById("ws-tools-bar") || ++tries > 20) return clearInterval(iv);
    start();
  }, 700);
})();
