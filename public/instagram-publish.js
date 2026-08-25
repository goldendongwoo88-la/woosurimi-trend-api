// 인스타그램 자동 게시 UI — 카드뉴스(card-news.html)와 숏폼(shortform.html) 양쪽에서
// 같은 방식으로 쓸 수 있게 공용으로 뺐습니다.
//
// 쓰는 법:
//   IgPublish.mount(컨테이너엘리먼트, {
//     kind: "carousel" | "image" | "reel",
//     imageUrls: ["/renders/cardnews/xxx/page1.png", ...],   // image/carousel일 때
//     videoUrl: "/renders/xxx.mp4",                           // reel일 때
//     defaultCaption: "본문에 미리 채워둘 문구",
//   });
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function fetchAccounts() {
    const res = await fetch("/api/instagram/accounts");
    if (!res.ok) throw new Error("연동 정보를 불러오지 못했습니다.");
    return await res.json();
  }

  // 게시 잡을 3초 간격으로 확인하면서, 진행 상황을 onTick으로 알려줍니다.
  async function pollJob(jobId, onTick) {
    const started = Date.now();
    const MAX_MS = 10 * 60 * 1000;
    while (Date.now() - started < MAX_MS) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/instagram/publish-job/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "진행 상황을 확인하지 못했습니다.");
      if (onTick) onTick(data);
      if (data.status === "done") return data.result;
      if (data.status === "failed") throw new Error(data.error || "게시에 실패했습니다.");
    }
    throw new Error("시간이 너무 오래 걸려서 중단했습니다.");
  }

  async function mount(container, opts) {
    if (!container) return;
    const kind = opts.kind;
    const imageUrls = opts.imageUrls || [];
    const videoUrl = opts.videoUrl || "";

    container.innerHTML = `<div class="note" style="margin-top:0;">인스타그램 연동 정보를 확인하는 중...</div>`;

    let info;
    try {
      info = await fetchAccounts();
    } catch (e) {
      container.innerHTML = `<div class="status error">${esc(e.message)}</div>`;
      return;
    }

    if (!info.configured) {
      container.innerHTML = `<div class="note" style="margin-top:0;">⚠️ 서버에 Meta 앱 설정(FB_APP_ID 등)이 없어서 인스타그램 자동 업로드를 쓸 수 없어요.</div>`;
      return;
    }
    if (!info.accounts.length) {
      container.innerHTML = `
        <div class="note" style="margin-top:0;">
          아직 연동된 인스타그램 계정이 없어요.
          <a href="/api/instagram/connect" target="_blank" rel="noopener">인스타그램 연결하기</a>를 눌러 계정을 연결해 주세요.
        </div>`;
      return;
    }

    // 캐러셀은 인스타그램 제한상 2~10장까지만 됩니다. 초과분은 앞에서부터 10장만 씁니다.
    const willUse = kind === "carousel" ? imageUrls.slice(0, 10) : imageUrls;
    const trimmedNote =
      kind === "carousel" && imageUrls.length > 10
        ? `<div class="note">인스타그램 캐러셀은 최대 10장이라, 앞에서부터 10장만 올라갑니다 (총 ${imageUrls.length}장 중).</div>`
        : "";

    const accountOptions = info.accounts
      .map((a) => `<option value="${esc(a.igUsername)}">@${esc(a.igUsername)} · ${esc(a.pageName)}</option>`)
      .join("");

    const kindLabel = kind === "reel" ? "릴스로 올리기" : kind === "carousel" ? "캐러셀(슬라이드)로 올리기" : "게시물로 올리기";

    container.innerHTML = `
      <div class="panel">
        <div class="section-title">📤 인스타그램에 올리기</div>
        <label>올릴 계정</label>
        <select id="igAccountSelect">${accountOptions}</select>
        <label style="margin-top:10px;display:block;">본문 문구 (캡션)</label>
        <textarea id="igCaption" rows="4" style="width:100%;box-sizing:border-box;">${esc(opts.defaultCaption || "")}</textarea>
        ${trimmedNote}
        <div style="margin-top:10px;">
          <button id="igPublishBtn" type="button">${esc(kindLabel)}</button>
        </div>
        <div id="igPublishStatus"></div>
      </div>
    `;

    const btn = container.querySelector("#igPublishBtn");
    const statusEl = container.querySelector("#igPublishStatus");

    btn.addEventListener("click", async () => {
      const igUsername = container.querySelector("#igAccountSelect").value;
      const caption = container.querySelector("#igCaption").value;

      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = "올리는 중...";
      statusEl.innerHTML = `<div class="status">게시를 시작하는 중이에요...</div>`;

      const body = { igUsername, kind, caption };
      if (kind === "reel") body.videoUrl = videoUrl;
      else if (kind === "carousel") body.imageUrls = willUse;
      else body.imageUrl = willUse[0];

      try {
        const res = await fetch("/api/instagram/publish-job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const started = await res.json();
        if (!res.ok) throw new Error(started.message || "게시를 시작하지 못했습니다.");

        statusEl.innerHTML = `<div class="status">${esc(started.note || "게시 중...")}</div>`;

        const result = await pollJob(started.jobId, (data) => {
          statusEl.innerHTML = `<div class="status">${esc(data.phase || "게시 중")} — ${data.elapsedSec}초 경과</div>`;
        });

        const link = result.permalink
          ? `<a href="${esc(result.permalink)}" target="_blank" rel="noopener">인스타그램에서 보기</a>`
          : "";
        statusEl.innerHTML = `<div class="status">✅ 올라갔어요! ${link}</div>`;
      } catch (e) {
        statusEl.innerHTML = `<div class="status error">오류: ${esc(e.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  }

  window.IgPublish = { mount };
})();
