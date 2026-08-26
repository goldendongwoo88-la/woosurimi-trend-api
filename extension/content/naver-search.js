// 네이버에서 뭔가 검색하면, 결과 위에 그 키워드의 검색량과 연관 키워드를 얹습니다.
//
// ⚠️ 키워드를 고르는 순간은 도구를 켤 때가 아니라 **검색해볼 때**입니다.
// 그때 눈앞에 숫자가 있어야 씁니다. 따로 창을 열어야 하면 결국 안 봅니다.

(() => {
  "use strict";

  const q = new URLSearchParams(location.search).get("query");
  if (!q || !q.trim()) return;
  if (window.__wsSearchLoaded) return;
  window.__wsSearchLoaded = true;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 결과 목록 맨 위에 끼워 넣습니다. 네이버가 화면 구조를 자주 바꿔서
  // 붙일 자리를 여러 개 준비해두고, 하나도 없으면 그냥 포기합니다.
  function anchor() {
    return document.querySelector("#main_pack") ||
           document.querySelector(".main_pack") ||
           document.querySelector("#content") ||
           null;
  }

  const host = anchor();
  if (!host) return;

  const box = document.createElement("div");
  box.className = "ws-kwbox";
  box.innerHTML = `<div class="ws-kwh">🔑 우수리미 · 「${esc(q)}」 키워드</div>
                   <div style="font-size:12px;color:#9ca3af">불러오는 중…</div>`;
  host.insertBefore(box, host.firstChild);

  chrome.runtime.sendMessage({ type: "keywords", payload: { seed: q } }, (res) => {
    if (!res || !res.ok) {
      // ⚠️ 여기서 시끄럽게 굴면 안 됩니다. 사장님은 검색하러 온 거지
      // 우리 도구를 쓰러 온 게 아닙니다. 조용히 지웁니다.
      box.remove();
      return;
    }
    const list = (res.data.keywords || []).slice(0, 12);
    if (!list.length) { box.remove(); return; }

    const hasVolume = list.some((k) => k.total != null);
    const num = (v) => (v == null ? "—" : Number(v).toLocaleString());
    const lvClass = { 쉬움: "ws-lv-easy", 보통: "ws-lv-mid", 어려움: "ws-lv-hard" };

    box.innerHTML = `
      <div class="ws-kwh">🔑 우수리미 · 「${esc(q)}」 연관 키워드</div>
      <table>
        <thead><tr>
          <th>키워드</th>
          ${hasVolume ? "<th>PC</th><th>모바일</th><th>합계</th><th>경쟁</th>" : "<th>메모</th>"}
        </tr></thead>
        <tbody>
          ${list.map((k) => `
            <tr>
              <td>${esc(k.keyword)}</td>
              ${hasVolume ? `
                <td>${num(k.pc)}</td>
                <td>${num(k.mobile)}</td>
                <td><b>${num(k.total)}</b></td>
                <td><span class="ws-lv ${lvClass[k.level] || "ws-lv-mid"}">${esc(k.level || "—")}</span></td>
              ` : `<td>${esc(k.hint || "")}</td>`}
            </tr>`).join("")}
        </tbody>
      </table>
      <div class="ws-note">${esc(res.data.note || "")}</div>`;
  });
})();
