// 통합검색 네비게이터 — 이 키워드에서 블로그가 몇 번째 자리에 있는지.
//
// ⚠️ 왜 필요한가
// 키워드를 고를 때 검색량만 보면 안 됩니다. 검색량이 많아도 **블로그가 화면
// 한참 아래에 있으면** 아무도 안 봅니다. 위에 광고·쇼핑·인플루언서가 깔려 있으면
// 1등을 해도 스크롤 세 번 내려야 나옵니다.
// 그래서 "블로그가 어디서부터 시작하는지"를 재서 보여줍니다.
//
// ⚠️ 클래스 이름으로 찾지 않습니다.
// 네이버는 화면 구조를 자주 바꿉니다. 예전에 쓰던 sp_nreview, lst_total,
// power_link 같은 이름은 지금 페이지에 **하나도 없습니다**(실제로 세어봤습니다).
// 대신 **링크 주소**로 판별합니다. blog.naver.com은 10년째 blog.naver.com입니다.
//   blog.naver.com  → 블로그        (실측 107개)
//   in.naver.com    → 인플루언서     (실측 29개)
//   cafe.naver.com  → 카페          (실측 18개)
// 그리고 **화면 위치**(픽셀)로 잽니다. 이것도 구조가 바뀌어도 안 변합니다.

(() => {
  "use strict";

  const q = new URLSearchParams(location.search).get("query");
  if (!q || !q.trim()) return;
  if (window.__wsNav) return;
  window.__wsNav = true;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /**
   * 무엇을 무엇으로 볼지.
   * ⚠️ 순서가 중요합니다. 위에서부터 먼저 맞는 것을 씁니다.
   * in.naver.com이 blog보다 먼저 와야 합니다 — 인플루언서 글도 블로그 주소를
   * 함께 갖고 있는 경우가 있어서, 뒤에 두면 전부 블로그로 세어집니다.
   */
  const KINDS = [
    { id: "ad", label: "광고", host: /(^|\.)(adcr\.naver\.com|ader\.naver\.com|saedu\.naver\.com)$/, color: "#b0201f" },
    { id: "shop", label: "쇼핑", host: /(^|\.)(shopping\.naver\.com|smartstore\.naver\.com|brand\.naver\.com)$/, color: "#d97706" },
    { id: "influencer", label: "인플루언서", host: /(^|\.)in\.naver\.com$/, color: "#7c3aed" },
    { id: "cafe", label: "카페", host: /(^|\.)cafe\.naver\.com$/, color: "#0891b2" },
    { id: "kin", label: "지식iN", host: /(^|\.)kin\.naver\.com$/, color: "#059669" },
    { id: "news", label: "뉴스", host: /(^|\.)(n\.news\.naver\.com|news\.naver\.com)$/, color: "#475569" },
    { id: "video", label: "동영상", host: /(^|\.)(tv\.naver\.com|clip\.naver\.com|m\.tv\.naver\.com)$/, color: "#db2777" },
    { id: "blog", label: "블로그", host: /(^|\.)(blog\.naver\.com|m\.blog\.naver\.com)$/, color: "#0b8f4d" },
  ];

  function kindOf(href) {
    let host;
    try { host = new URL(href, location.href).hostname.toLowerCase(); } catch { return null; }
    for (const k of KINDS) if (k.host.test(host)) return k;
    return null;
  }

  /** 화면 맨 위에서 이 요소까지의 거리(px). */
  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY;

  /**
   * 검색 결과를 훑어서 무엇이 어디에 있는지 모읍니다.
   *
   * ⚠️ 링크 하나하나가 아니라 **덩어리**로 셉니다. 같은 글의 제목·썸네일·
   * 블로그이름이 전부 링크라 그냥 세면 3배로 부풀려집니다.
   * 같은 주소는 한 번만 세고, 세로 위치가 40px 안쪽이면 같은 줄로 봅니다.
   */
  function scan() {
    const main = document.querySelector("#main_pack") || document.body;
    const seen = new Set();
    const seenBox = new Set();
    const items = [];

    for (const a of main.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (!/^https?:/i.test(href)) continue;
      const kind = kindOf(href);
      if (!kind) continue;
      // 화면에 안 보이는 링크는 빼야 합니다(숨은 메뉴 등).
      const rect = a.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;

      // ⚠️ 처음엔 물음표 뒤를 떼고 중복을 걸렀습니다. 그랬더니 광고 3개가
      // adcr.naver.com/adcr 하나로 뭉쳐서 **광고 1개**로 셌습니다.
      // 광고 주소는 물음표 뒤만 다릅니다. 주소는 통째로 봐야 합니다.
      if (seen.has(href)) continue;
      seen.add(href);

      // 같은 글의 제목·썸네일·블로그이름이 전부 링크입니다. 그냥 세면 3배가 됩니다.
      // 그래서 **담고 있는 칸**을 기준으로 한 번만 셉니다.
      const boxEl = a.closest("li, article, [data-cr-area], .fake-item") || a.parentElement;
      if (boxEl) {
        if (seenBox.has(boxEl)) continue;
        seenBox.add(boxEl);
      }

      items.push({
        kind,
        href,
        top: Math.round(topOf(a)),
        text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        el: a,
      });
    }

    items.sort((x, y) => x.top - y.top);
    return items;
  }

  /** 같은 종류가 연달아 나오면 한 구역으로 묶습니다. */
  function blocks(items) {
    const out = [];
    for (const it of items) {
      const last = out[out.length - 1];
      // 350px 넘게 떨어지면 다른 구역으로 봅니다.
      if (last && last.kind.id === it.kind.id && it.top - last.end < 350) {
        last.end = it.top;
        last.count++;
        last.items.push(it);
      } else {
        out.push({ kind: it.kind, start: it.top, end: it.top, count: 1, items: [it] });
      }
    }
    return out;
  }

  chrome.storage.sync.get(["blogId"], (cfg) => {
    const myId = String((cfg && cfg.blogId) || "").trim().toLowerCase();

    // 네이버가 결과를 늦게 그립니다. 몇 번 다시 재봅니다.
    let tries = 0;
    const timer = setInterval(() => {
      const items = scan();
      if (items.length >= 5 || ++tries > 6) {
        clearInterval(timer);
        if (items.length) draw(items, myId);
      }
    }, 800);
  });

  function draw(items, myId) {
    const bs = blocks(items);
    const firstBlog = bs.find((b) => b.kind.id === "blog");
    const above = firstBlog ? bs.filter((b) => b.start < firstBlog.start) : bs;
    const screen = Math.max(1, window.innerHeight);

    // 내 글이 있나
    const mine = myId
      ? items.filter((it) => {
          try { return new URL(it.href, location.href).pathname.toLowerCase().includes("/" + myId); }
          catch { return false; }
        })
      : [];

    // 내 글에 표시를 답니다 — 눈으로 바로 찾히게.
    for (const m of mine) {
      const box = m.el.closest("li, div");
      if (box && !box.querySelector(".ws-nav-mine")) {
        const tag = document.createElement("span");
        tag.className = "ws-nav-mine";
        tag.textContent = "내 글";
        m.el.parentElement && m.el.parentElement.insertBefore(tag, m.el);
      }
    }

    const box = document.createElement("div");
    box.className = "ws-nav";

    const scrolls = firstBlog ? (firstBlog.start / screen) : null;
    const verdict = !firstBlog
      ? { t: "블로그 결과가 안 보입니다", d: "이 키워드는 블로그로 노리기 어렵습니다.", c: "bad" }
      : scrolls < 1
        ? { t: "블로그가 첫 화면에 있습니다", d: "스크롤 없이 보입니다. 노려볼 만합니다.", c: "good" }
        : scrolls < 2.5
          ? { t: `블로그까지 ${scrolls.toFixed(1)}화면 내려야 합니다`, d: "한두 번 내리면 나옵니다.", c: "mid" }
          : { t: `블로그까지 ${scrolls.toFixed(1)}화면 내려야 합니다`, d: "위에 다른 게 너무 많습니다. 1등을 해도 잘 안 보입니다.", c: "bad" };

    box.innerHTML = `
      <div class="ws-nav-h">
        <b>「${esc(q)}」 이 키워드, 블로그로 될까?</b>
        <button class="ws-nav-x" title="닫기">✕</button>
      </div>

      <div class="ws-nav-verdict ${verdict.c}">
        <div class="t">${esc(verdict.t)}</div>
        <div class="d">${esc(verdict.d)}</div>
      </div>

      ${above.length ? `
      <div class="ws-nav-sub">블로그 위에 있는 것</div>
      <div class="ws-nav-chips">
        ${above.map((b) => `<button class="ws-nav-chip" data-go="${b.start}"
          style="border-color:${b.kind.color};color:${b.kind.color}">
          ${esc(b.kind.label)} ${b.count}</button>`).join("")}
      </div>` : `<div class="ws-nav-sub">블로그가 맨 위에 있습니다.</div>`}

      <div class="ws-nav-sub">바로 가기</div>
      <div class="ws-nav-chips">
        ${bs.filter((b) => b.count >= 2).map((b) => `<button class="ws-nav-chip" data-go="${b.start}"
          style="border-color:${b.kind.color};color:${b.kind.color}">
          ${esc(b.kind.label)} ${b.count}</button>`).join("")}
      </div>

      ${myId ? (mine.length ? `
        <div class="ws-nav-mine-box">
          <b>내 글이 ${mine.length}개 있습니다</b>
          ${mine.slice(0, 3).map((m) => `<div class="ws-nav-row">
            <button class="ws-nav-chip" data-go="${m.top}">여기</button>
            <span>${esc(m.text || "(제목 없음)")}</span></div>`).join("")}
        </div>` : `
        <div class="ws-nav-mine-box none">
          <b>이 키워드에 내 글이 안 보입니다</b>
          <span>첫 화면에 없다는 뜻입니다. 더 아래에 있을 수도 있습니다.</span>
        </div>`) : `
        <div class="ws-nav-mine-box none">
          <span>확장 설정에 블로그 아이디를 넣으시면 내 글을 찾아 표시해 드립니다.</span>
        </div>`}

      <div class="ws-nav-note">
        화면에 보이는 것만 셉니다. 더 내리면 결과가 늘어납니다.
        광고는 네이버가 사람마다 다르게 보여줘서 개수가 달라질 수 있습니다.
      </div>`;

    const host = document.querySelector("#main_pack") || document.body;
    host.insertBefore(box, host.firstChild);

    box.querySelector(".ws-nav-x").onclick = () => box.remove();
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      window.scrollTo({ top: Math.max(0, +b.dataset.go - 90), behavior: "smooth" });
    });
  }
})();
