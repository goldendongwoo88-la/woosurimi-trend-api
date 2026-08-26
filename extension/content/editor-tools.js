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
    const { serverUrl } = await chrome.storage.sync.get(["serverUrl"]);
    const base = (serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
    const res = await fetch(base + pathname, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `서버 오류 ${res.status}`);
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
      if (act === "audit") runAudit();
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
