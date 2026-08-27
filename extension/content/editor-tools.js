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

  /**
   * ⚠️ 어느 창에 붙일지 정하기 — 이것 때문에 막대가 아예 안 보였습니다.
   *
   * 네이버 글쓰기 화면은 주소가 blog.naver.com/아이디?Redirect=Write 인데
   * 실제 편집기는 그 안의 iframe(PostWriteForm.naver)에 들어 있습니다.
   * 콘텐츠 스크립트는 두 창 모두에서 돌지만,
   *   - 바깥 창: 주소도 안 맞고 .se-content도 없어서 그냥 지나감
   *   - iframe : 조건이 맞아서 막대를 그림 → **iframe 안에 갇혀 보이지 않음**
   * 결과적으로 사장님 화면에는 아무것도 안 떴습니다.
   *
   * 둘 다 blog.naver.com이라 같은 출처입니다. 그래서 iframe 안에서도
   * 바깥 창의 document를 만질 수 있습니다. 막대는 항상 바깥 창에 붙입니다.
   * 혹시 접근이 막히면(출처가 다르면) 그냥 자기 창에 붙입니다 — 없는 것보단 낫습니다.
   */
  function hostDocument() {
    try {
      if (window.top && window.top !== window && window.top.document.body) {
        return window.top.document;
      }
    } catch {
      // 다른 출처라 못 만지는 경우. 자기 창에 붙입니다.
    }
    return document;
  }

  const HOST = hostDocument();

  // ⚠️ 여기에 "이미 실행됐으면 나간다"는 깃발을 두면 안 됩니다. 제가 그렇게 했다가
  // 막대가 아예 안 뜨는 버그를 만들었습니다.
  //
  // 스크립트는 바깥 창과 iframe 양쪽에서 돕니다. 보통 바깥 창이 먼저입니다.
  //   1) 바깥 창 — 깃발을 꽂음. 그런데 주소도 안 맞고 .se-content도 없어서
  //                 정작 아무것도 안 그림
  //   2) iframe  — 깃발을 보고 "이미 누가 했군" 하고 그냥 나감
  // 결국 아무도 안 그립니다. 실제로 이 상태로 배포됐습니다.
  //
  // 중복은 깃발이 아니라 **실제로 붙였는지**로 막습니다.
  // 두 창이 같은 HOST를 보므로 start()의 getElementById 검사 하나면 충분합니다.

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

  /**
   * 본문에 **실제로 입력된 글자**만 모읍니다.
   *
   * ⚠️ 원래는 편집기 전체(.se-main-container)의 innerText를 그대로 셌습니다.
   * 그랬더니 17자 쓴 글이 **102자**로 나왔습니다. 늑대플은 17자로 맞게 셌고요.
   *
   * 무엇이 더 세어졌냐면:
   *   - 안내 문구(placeholder) — "나를 돌아보는 회고, 뜻밖의 발견을 기다립니다. #모두의회고"
   *   - "애드포스트 노출 영역" 같은 편집기 안내 표시가 두 줄
   *   - 제목 칸의 "제목" 안내 문구
   * 전부 사장님이 쓴 글이 아닙니다. 글자 수는 발행 분량을 가늠하는 숫자인데
   * 안 쓴 글자가 섞이면 그 판단이 통째로 어긋납니다.
   *
   * 그래서 **글 문단(se-text-paragraph)만** 골라서, 안내 문구는 빼고 셉니다.
   */
  function getBodyText() {
    const root = getEditorRoot();
    if (!root) return "";

    // ⚠️ 여기서 한 번 더 좁혔습니다.
    // 사진 15장·링크 4개가 있는 글에서 1,435자로 나왔는데 늑대플은 779자였습니다.
    // 사진 캡션과 링크카드(oglink) 안의 제목·설명까지 세고 있었기 때문입니다.
    // 그건 네이버가 자동으로 채워 넣은 글자지 사장님이 쓴 글이 아닙니다.
    // 사진 4장만 넣어도 수백 자가 부풀려집니다.
    //
    // 글 컴포넌트와 인용구만 셉니다. 인용구는 소제목 역할이라 본문이 맞습니다.
    const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
    let nodes = [...root.querySelectorAll(".se-text-paragraph")].filter(
      (n) => !n.closest(SKIP)
    );

    // 문단을 못 찾으면(구조가 바뀌었으면) 예전 방식으로 물러섭니다.
    if (!nodes.length) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll(".se-documentTitle, .se-placeholder").forEach((n) => n.remove());
      return (clone.innerText || "").replace(/​/g, "").trim();
    }

    const parts = [];
    for (const n of nodes) {
      // 제목 칸은 본문이 아닙니다.
      if (n.closest(".se-documentTitle")) continue;
      // 안내 문구 자체이거나 안내 문구를 품고 있으면 건너뜁니다.
      if (n.classList.contains("se-placeholder") || n.closest(".se-placeholder")) continue;

      const clone = n.cloneNode(true);
      clone.querySelectorAll(".se-placeholder").forEach((x) => x.remove());
      // 네이버는 빈 문단에 보이지 않는 글자(U+200B)를 넣어둡니다. 그것도 빼야 합니다.
      const t = (clone.innerText || "").replace(/​/g, "");
      if (t.trim()) parts.push(t);
    }
    // ⚠️ 문단을 줄바꿈으로 이으면 그 줄바꿈도 글자로 세어집니다.
    // 늑대플과 공백포함이 26자 차이 났는데, 문단이 26개라 줄바꿈 26개가 그대로 그 차이였습니다.
    // 줄바꿈은 사장님이 친 글자가 아니니 세면 안 됩니다.
    // 그래서 세는 쪽은 문단 배열을 그대로 쓰고(getBodyParts), 이어붙인 글은
    // AI에 넘길 때만 씁니다. 그쪽은 문단 구분이 있어야 하니까요.
    return parts.join("\n").trim();
  }

  /** 세기 전용 — 줄바꿈을 넣지 않은 문단 배열. */
  function getBodyParts() {
    const joined = getBodyText();
    return joined ? joined.split("\n") : [];
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
  /**
   * 화면 아래쪽 가로 막대.
   *
   * ⚠️ 자리를 세 번 옮겼습니다. 그 이유를 남겨둡니다.
   *   1) 오른쪽 위 가로 — 네이버 에디터 도구줄을 가렸습니다. 사장님이 "엄청 불편"하다고.
   *   2) 오른쪽 세로 — 안 가리지만 글 쓰는 손과 멀었습니다.
   *   3) 아래 가로  — 지금. 네이버 글감 바 바로 위입니다.
   *
   * 위쪽은 절대 안 됩니다. 네이버가 도구를 거기 두기 때문에 무엇을 올려도 가립니다.
   * 아래는 글감 바 하나만 피하면 되고, 눈이 본문에서 조금만 내려오면 닿습니다.
   */
  const bar = HOST.createElement("div");
  bar.id = "ws-tools-dock";
  bar.innerHTML = `
    <div class="ws-dock-counts">
      <span class="ws-dock-num" title="공백 제외 글자 수"><b id="ws-c-nospace">0</b>자</span>
      <span class="ws-dock-sub">
        <span>공백포함 <b id="ws-c-all">0</b></span>
        <span>사진 <b id="ws-c-img">0</b></span>
        <span>영상 <b id="ws-c-vid">0</b></span>
        <span>링크 <b id="ws-c-link">0</b></span>
      </span>
    </div>
    <div class="ws-dock-acts">
      <button data-act="hometitle" class="ws-dock-btn primary" title="제목을 홈판용으로 고칩니다">홈판 제목</button>
      <button data-act="homebody" class="ws-dock-btn primary" title="본문을 소제목 6개로 나눕니다">홈판 본문</button>
      <button data-act="topic" class="ws-dock-btn" title="이 글이 이 블로그 주제에 맞는지">주제</button>
      <button data-act="audit" class="ws-dock-btn" title="문제가 될 만한 표현 찾기">표현 검사</button>
      <button data-act="keyword" class="ws-dock-btn" title="지금 누가 상위에 있는지">키워드</button>
      <button data-act="font" class="ws-dock-btn" title="글꼴·크기를 본문 전체에 한 번에">폰트</button>
      <button data-act="image" class="ws-dock-btn" title="사진 너비를 한 번에 맞춥니다">사진</button>
      <button data-act="linebreak" class="ws-dock-btn" title="긴 문단을 45자 이하로 자릅니다">줄바꿈</button>
      <button data-act="spell" class="ws-dock-btn" title="블로그에서 자주 틀리는 말 찾기">맞춤법</button>
      <button data-act="thumb" class="ws-dock-btn" title="홈판용 썸네일 만들기">썸네일</button>
      <button data-act="table" class="ws-dock-btn" title="표 넣기">표</button>
      <button data-act="word" class="ws-dock-btn" title="워드로 내려받기">워드</button>
      <button data-act="toggle" class="ws-dock-min" title="접기">▾</button>
    </div>
  `;

  const panel = HOST.createElement("div");
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
    // 문단을 이어붙인 글이 아니라 문단 하나씩 세야 줄바꿈이 안 섞입니다.
    const parts = getBodyParts();
    const m = countMedia();
    const all = parts.reduce((n, p) => n + p.length, 0);
    const nospace = parts.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
    setText("ws-c-all", all.toLocaleString());
    setText("ws-c-nospace", nospace.toLocaleString());
    setText("ws-c-img", m.images);
    setText("ws-c-vid", m.videos);
    setText("ws-c-link", m.links);

    // 네이버에서 잘 먹히는 분량대를 색으로 알려줍니다. 공백 제외 기준입니다.
    const el = HOST.getElementById("ws-c-nospace");
    if (el) el.style.color = nospace >= 1200 ? "#4ade80" : nospace >= 600 ? "#fbbf24" : "#9ca3af";
  }

  const setText = (id, v) => {
    const el = HOST.getElementById(id);
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
              ⚠ 본문에 없는 말: <b>${esc(x.invented.join(", "))}</b>
              <button class="ws-apply" data-fill="${esc(x.invented.join(", "))}" data-for="${esc(x.text)}">본문에 넣기</button></div>` : ""}
            ${x.repeats && x.repeats.length ? `<div class="ws-row warn" style="margin:5px 0 0">
              같은 말이 두 번: <b>${esc(x.repeats.map((r) => r.word + " ×" + r.times).join(", "))}</b>
              <span class="ws-dim">— 저품질 사유는 아니지만 자리가 아깝습니다</span></div>` : ""}
            <button class="ws-apply" data-apply="${esc(x.text)}">이걸로 바꾸기</button>
          </div>`).join("")}
        <p class="ws-dim">제목이 약속한 내용은 본문에 반드시 있어야 합니다.
          들어왔다가 바로 나가면 조회수는 올라도 블로그가 상합니다.</p>
      `);

      panel.querySelectorAll("[data-apply]").forEach((b) =>
        b.addEventListener("click", () => applyTitle(b.dataset.apply))
      );
      panel.querySelectorAll("[data-fill]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          askToFill(b.dataset.fill, b.dataset.for);
        })
      );
    } catch (e) {
      showPanel(`<h4>홈판 제목</h4><div class="ws-row bad">${esc(e.message)}</div>
        <p class="ws-dim">우수리미에 로그인하고 이용권이 있어야 쓸 수 있는 기능입니다.</p>`);
    }
  }

  /** 고른 제목을 제목 칸에 넣습니다. */
  /**
   * 고른 제목을 제목 칸에 넣습니다.
   *
   * ⚠️ 여기서 크게 한 번 틀렸습니다. 원래는 이랬습니다:
   *
   *     ok = el.dispatchEvent(new ClipboardEvent("paste", ...));
   *     if (!ok) { ...실패 처리... }
   *     panel.hidden = true;   // ok면 성공으로 간주
   *
   * `dispatchEvent`는 **이벤트가 취소되지 않았으면 true**를 돌려줍니다.
   * 아무도 그 이벤트를 처리하지 않아도 true입니다. 게다가 브라우저는 보안상
   * 사람이 만들지 않은 붙여넣기 이벤트의 clipboardData를 대체로 무시합니다.
   * 그래서 **아무 일도 안 일어났는데 성공이라고 창을 닫고** 있었습니다.
   * 사장님이 "이걸로 바꾸기를 눌러도 제목이 안 바뀐다"고 하신 게 이것입니다.
   *
   * 고친 원칙: **바꾼 뒤에 다시 읽어서 확인한다.**
   * 넣는 방법을 여러 개 시도하되, 매번 제목을 되읽어 실제로 바뀌었는지 봅니다.
   * 다 실패하면 성공한 척하지 않고 복사해 드리고 그렇게 말합니다.
   */
  async function applyTitle(text) {
    const findTitleEl = () =>
      document.querySelector(".se-documentTitle .se-text-paragraph") ||
      document.querySelector(".se-documentTitle [contenteditable='true']") ||
      document.querySelector("#subject");

    const el = findTitleEl();
    if (!el) {
      navigator.clipboard.writeText(text).catch(() => {});
      return showPanel(`<h4>홈판 제목</h4><div class="ws-row warn">
        제목 칸을 찾지 못했습니다. 복사해 뒀으니 직접 붙여넣어 주세요.</div>`);
    }

    const want = String(text).trim();
    const original = getTitle();
    const norm = (s) => String(s || "").replace(/[\s​]/g, "");

    // 옛 에디터는 그냥 input입니다. 이건 확실히 먹습니다.
    if ("value" in el && el.tagName === "INPUT") {
      el.value = want;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      panel.hidden = true;
      return;
    }

    /**
     * ⚠️ 제목이 통째로 사라진 걸 두 번 고쳤는데 두 번 다 못 고쳤습니다.
     * 세 번째입니다. 이번엔 원인을 제대로 찾았습니다.
     *
     * 스마트에디터의 제목은 이렇게 생겼습니다:
     *   <p class="se-text-paragraph"><span class="se-ff-... se-fs-...">글자</span></p>
     *
     * 제가 `el.textContent = 새제목`을 썼습니다. 이러면 **안에 있던 span이
     * 통째로 날아가고** 맨 글자만 남습니다. 에디터는 그 span 구조를 기준으로
     * 문서를 관리하기 때문에, 구조가 깨진 걸 발견하면 자기 모델로 되돌립니다.
     * 그 과정에서 제목이 빈칸이 됩니다.
     *
     * 게다가 저는 **넣자마자 바로** 확인했습니다. 그때는 글자가 들어가 있으니
     * "성공"으로 보고 창을 닫았습니다. 에디터가 되돌리는 건 그 다음 순간입니다.
     * 그래서 오류도 안 뜨고 제목만 사라졌습니다. 사장님이 보신 게 이것입니다.
     *
     * 두 가지를 고쳤습니다.
     *   1) textContent를 아예 안 씁니다. execCommand("insertText")만 씁니다.
     *      이건 사람이 타자 친 것과 같은 경로라 에디터가 스스로 span을 만듭니다.
     *   2) 확인을 **기다렸다가** 합니다. 에디터가 정리할 시간을 주고 나서 봅니다.
     */
    // rAF는 안 씁니다 — 안 보이는 탭에서는 영원히 안 옵니다(settleEditor 설명 참고).
    const settle = settleEditor;

    /** 사람이 타자 친 것과 같은 경로로 넣습니다. (공용 함수 setEditableText 참고) */
    const typeIn = (value) => setEditableText(el, value);

    /** 붙여넣기 흉내 — execCommand가 막힌 브라우저용. */
    function pasteIn(value) {
      try {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const dt = new DataTransfer();
        dt.setData("text/plain", value);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        return true;
      } catch {
        return false;
      }
    }

    for (const way of [typeIn, pasteIn]) {
      way(want);
      // ⚠️ 여기가 핵심입니다. 바로 보지 말고 에디터가 정리할 때까지 기다립니다.
      await settle();
      if (norm(getTitle()) === norm(want)) {
        panel.hidden = true;
        scheduleCount();
        return;
      }
      // 안 됐습니다. 빈칸이 됐으면 원래 제목을 되돌려 놓고 다음 방법으로.
      if (!norm(getTitle())) {
        typeIn(original);
        await settle();
      }
    }

    // 여기까지 왔으면 정말 안 된 겁니다. 된 척하지 않습니다.
    // 마지막으로 한 번 더 — 지금 비어 있으면 무슨 일이 있어도 되돌립니다.
    if (!norm(getTitle()) && original) {
      typeIn(original);
      await settle();
    }
    const lost = !norm(getTitle()) && !!original;

    navigator.clipboard.writeText(want).catch(() => {});
    showPanel(`<h4>홈판 제목</h4>
      <div class="ws-row ${lost ? "bad" : "warn"}">제목을 자동으로 바꾸지 못했습니다.
        ${lost
          ? "<b>원래 제목도 되돌리지 못했습니다.</b> 아래에 원래 제목을 적어뒀으니 다시 넣어주세요."
          : "<b>원래 제목은 그대로 뒀습니다.</b>"}
        새 제목을 복사해 뒀으니 제목 칸을 클릭하고 전체 선택(Ctrl+A) 후 Ctrl+V를 눌러주세요.</div>
      <div class="ws-preview"><pre>${esc(want)}</pre></div>
      ${lost ? `<div style="font-size:11.5px;opacity:.8;margin-top:6px">원래 제목</div>
        <div class="ws-preview"><pre>${esc(original)}</pre></div>` : ""}`);
  }

  // ── 제목이 약속한 내용을 본문에 채우기 ────────────────
  //
  // ⚠️ 제목에 "4방향"이 있는데 본문에 없으면, 들어온 사람이 그 대목을 못 찾고 나갑니다.
  // 그렇다고 AI가 "4방향으로 그렸습니다"를 지어내면 **글 전체가 거짓**이 됩니다.
  // 제목만 낚시였던 것보다 나쁩니다.
  //
  // 그래서 길을 셋으로 엽니다. 사실은 반드시 밖에서 들어옵니다.
  //   1) 사장님이 아신다  → 적어주시면 본문 알맞은 자리에 엮음
  //   2) 모르신다        → 자료를 찾아와서 출처와 함께 보여주고, 고르시면 엮음
  //   3) 자료도 없다      → 본문은 그대로 두고 그 말이 빠진 제목을 쓰시게 안내
  function askToFill(missing, forTitle) {
    showPanel(`
      <h4>본문에 넣기</h4>
      <p class="ws-dim">제목이 약속한 <b>${esc(missing)}</b>가 본문에 없습니다.
        들어온 사람이 그 대목을 못 찾으면 바로 나갑니다.</p>
      <div class="ws-row warn" style="margin:6px 0">
        <b>지어내지 않습니다.</b> 아시는 내용을 적어주시거나, 모르시면 찾아드립니다.
      </div>
      <textarea id="ws-fact" rows="3" placeholder="예: 아이라인을 눈꼬리·앞머리·아래·위 네 방향으로 얇게 그렸다"
        style="width:100%;padding:9px;font:inherit;font-size:13px;border:1px solid #e6e8ed;border-radius:8px;resize:vertical"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="ws-apply" id="ws-fact-go" style="margin-top:0">이 내용으로 채우기</button>
        <button class="ws-apply" id="ws-fact-find" style="margin-top:0">모르겠어요 · 찾아보기</button>
      </div>
      <p class="ws-dim">찾아보기는 뉴스와 상위 블로그를 읽어 출처와 함께 보여드립니다.</p>
    `);

    panel.querySelector("#ws-fact-go").onclick = () =>
      doFill(missing, panel.querySelector("#ws-fact").value.trim());
    panel.querySelector("#ws-fact-find").onclick = () => findFacts(missing, forTitle);
  }

  /** 자료를 찾아옵니다. 출처를 그대로 보여줘야 사장님이 확인하실 수 있습니다. */
  async function findFacts(missing, forTitle) {
    const topic = (getTitle() || forTitle || "").slice(0, 40);
    showPanel(`<h4>자료 찾는 중</h4><p>뉴스와 상위 블로그를 읽고 있습니다… 30초쯤 걸립니다.</p>`);
    try {
      const d = await server("/api/research", { topic, angle: missing });
      showPanel(`
        <h4>찾은 것</h4>
        ${d.facts && d.facts.length ? `
          <p class="ws-dim">자료에서 확인된 사실입니다. 쓸 것을 고르세요.</p>
          ${d.facts.map((f, i) => `
            <label class="ws-fact-row">
              <input type="checkbox" data-fact="${esc(f.text)}" ${i < 3 ? "checked" : ""}>
              <span>${esc(f.text)} <em>[${f.source}]</em></span>
            </label>`).join("")}
        ` : `<div class="ws-row warn">확인된 사실을 못 찾았습니다.</div>`}
        ${d.missing && d.missing.length ? `<div class="ws-row warn">
          자료에도 없어서 사장님이 확인하셔야 하는 것: ${esc(d.missing.join(", "))}</div>` : ""}
        <div style="margin-top:9px">
          <button class="ws-apply" id="ws-fact-use">고른 것으로 본문 채우기</button>
        </div>
        <details class="ws-preview" style="margin-top:9px"><summary>출처 ${(d.sources || []).length}건 보기</summary>
          <div style="font-size:12px;line-height:1.8">
            ${(d.sources || []).map((s) => `[${s.n}] (${esc(s.kind)}) ${s.url
              ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`
              : esc(s.title)}`).join("<br>")}
          </div></details>
        <p class="ws-dim">${esc(d.note || "")}</p>
      `);
      const use = panel.querySelector("#ws-fact-use");
      if (use) use.onclick = () => {
        const picked = [...panel.querySelectorAll("[data-fact]:checked")].map((c) => c.dataset.fact);
        if (!picked.length) return alert("넣을 것을 하나 이상 고르세요.");
        doFill(missing, picked.join("\n"));
      };
    } catch (e) {
      showPanel(`<h4>자료 찾기</h4><div class="ws-row bad">${esc(e.message)}</div>
        <p class="ws-dim">자료를 못 찾으면 본문은 그대로 두고, 그 말이 빠진 제목을 고르시는 편이 안전합니다.</p>`);
    }
  }

  async function doFill(missing, facts) {
    if (!facts) return alert("넣을 내용을 적거나 골라주세요.");
    showPanel(`<h4>본문에 넣는 중</h4><p>알맞은 자리를 찾고 있습니다… 30초쯤 걸립니다.</p>`);
    try {
      const d = await server("/api/body-fill", {
        body: getBodyText(),
        title: getTitle(),
        missing: [missing],
        facts,
      });
      lastBody = d.body;
      showPanel(`
        <h4>본문에 넣었습니다</h4>
        <div class="ws-stats">
          <span>분량 <b>${d.before.chars.toLocaleString()}</b> → <b class="ws-up">${d.after.chars.toLocaleString()}</b>자</span>
        </div>
        ${d.where ? `<p class="ws-dim">넣은 자리: ${esc(d.where)}</p>` : ""}
        ${d.added && d.added.length ? `<div class="ws-subheads">
          ${d.added.map((a) => `<div>${esc(a)}</div>`).join("")}</div>` : ""}
        ${d.invented && d.invented.length ? `<div class="ws-row bad">
          ⚠ 주신 내용에도 없던 말이 섞였습니다: <b>${esc(d.invented.join(", "))}</b> — 꼭 확인하세요.</div>` : ""}
        <button class="ws-apply" id="ws-copy-body">채운 본문 복사</button>
        <details class="ws-preview"><summary>전체 보기</summary><pre>${esc(d.body)}</pre></details>
        <p class="ws-dim">${esc(d.note)}</p>
      `);
      const btn = panel.querySelector("#ws-copy-body");
      if (btn) btn.onclick = () => navigator.clipboard.writeText(lastBody).then(() => (btn.textContent = "복사됐습니다"));
    } catch (e) {
      showPanel(`<h4>본문에 넣기</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
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

      /**
       * ⚠️ 이 화면을 다시 만든 이유
       * 사장님이 "이게 무슨 말인지 이해가 안 된다"고 하셨습니다. 맞는 말씀입니다.
       * 숫자, 경고, 목록, 안내가 라벨 없이 그냥 붙어 있었습니다. 목록을 보고
       * "이걸 넣는다는 건가, 지운다는 건가" 하시게 만든 건 제 잘못입니다.
       *
       * 이제 세 덩어리에 번호와 제목을 붙이고, **무엇이 자동이고 무엇이 안내인지**
       * 각 덩어리 첫 줄에 적습니다.
       */

      // 새로 쓴 말이 어느 문장에 있는지 찾아둡니다 — "확인하세요"만으로는 못 찾습니다.
      const spots = (d.invented || []).map((w) => {
        const at = d.body.indexOf(w);
        if (at < 0) return { w, ctx: "" };
        const from = Math.max(0, at - 30);
        const to = Math.min(d.body.length, at + w.length + 30);
        return {
          w,
          ctx: (from ? "…" : "") + d.body.slice(from, at) +
               `<b style="color:#f87171">${esc(w)}</b>` +
               d.body.slice(at + w.length, to) + (to < d.body.length ? "…" : ""),
        };
      });

      showPanel(`
        <h4>홈판 본문 — 다 됐습니다</h4>

        <div class="ws-stats">
          <span>소제목 <b>${d.before.subheads}</b> → <b class="ws-up">${d.after.subheads}</b>개</span>
          <span>사진 자리 <b class="ws-up">${d.after.photoSlots}</b>곳</span>
          <span>분량 <b>${keep}%</b></span>
        </div>

        <button class="ws-apply" id="ws-copy-body" style="margin:12px 0 4px">
          다듬은 본문 복사하기
        </button>
        <p class="ws-dim" style="margin:0 0 14px">
          복사한 다음 본문을 <b>전체 선택(Ctrl+A) 후 Ctrl+V</b> 하시면 됩니다.
          에디터를 제가 자동으로 바꾸지는 않습니다 — 한 번 덮어쓰면 되돌릴 수가 없어서요.
        </p>

        <div class="ws-sec">
          <div class="ws-sec-h">1 · 새 소제목 ${d.subheads.length}개
            <span class="ws-sec-tag auto">넣어뒀습니다</span></div>
          <p class="ws-sec-p">아래 문장들이 <b>이미 다듬은 본문 안에 들어가 있습니다.</b>
            글 사이사이에 소제목으로 놓였습니다. 따로 하실 일은 없습니다.</p>
          <div class="ws-subheads">
            ${d.subheads.map((s, i) => `<div><b>${i + 1}</b> ${esc(s)}</div>`).join("")}
          </div>
        </div>

        ${spots.length ? `
        <div class="ws-sec warn-sec">
          <div class="ws-sec-h">2 · 사실인지 봐주실 곳 ${spots.length}군데
            <span class="ws-sec-tag check">확인 필요</span></div>
          <p class="ws-sec-p">AI가 <b>원래 본문에 없던 말</b>을 새로 썼습니다.
            지어낸 것일 수 있으니 맞는 내용인지 보시고, 아니면 그 부분만 지우세요.</p>
          ${spots.map((s) => `
            <div class="ws-spot">
              <div class="ws-spot-w">"${esc(s.w)}"</div>
              ${s.ctx ? `<div class="ws-spot-c">${s.ctx}</div>` : ""}
            </div>`).join("")}
        </div>` : `
        <div class="ws-sec">
          <div class="ws-sec-h">2 · 사실 확인
            <span class="ws-sec-tag ok">이상 없음</span></div>
          <p class="ws-sec-p">원래 본문에 없던 말이 섞이지 않았습니다.</p>
        </div>`}

        ${d.suggestions && d.suggestions.length ? `
        <div class="ws-sec">
          <div class="ws-sec-h">3 · 더 쓰시면 좋을 것
            <span class="ws-sec-tag note">안내만</span></div>
          <p class="ws-sec-p"><b>자동으로 안 들어갑니다.</b> 아래는 "이런 내용이 더 있으면
            글이 좋아진다"는 제안입니다. 쓰실지는 사장님이 정하세요.</p>
          <ul class="ws-sug">${d.suggestions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        </div>` : ""}

        <details class="ws-preview" style="margin-top:12px">
          <summary>다듬은 본문 전체 보기</summary><pre>${esc(d.body)}</pre></details>
        <p class="ws-dim">${esc(d.note)}</p>
        <p class="ws-dim"><b>[사진: …]</b> 라고 적힌 자리에는 실제 사진을 넣으시면 됩니다.</p>
      `);
      const btn = panel.querySelector("#ws-copy-body");
      if (btn) btn.addEventListener("click", () => {
        navigator.clipboard.writeText(lastBody).then(() => {
          btn.textContent = "복사됐습니다 — 이제 본문에 Ctrl+V 하세요";
          setTimeout(() => (btn.textContent = "다듬은 본문 복사하기"), 2600);
        }).catch(() => { btn.textContent = "복사에 실패했습니다"; });
      });
    } catch (e) {
      showPanel(`<h4>홈판 본문</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 주제 적합도 ───────────────────────────────────────
  //
  // ⚠️ 블로그를 주제별로 나눠 운영할 때 쓰는 기능입니다.
  // 홈피드는 "이 블로그는 무슨 블로그인가"를 판단해 그 주제에 관심 있는 사람에게
  // 밀어줍니다. 패션 블로그에 예능 글을 올리면 패션 보러 온 사람에게 가고,
  // 그 사람은 안 누릅니다. 안 누르면 그게 나쁜 신호로 쌓입니다.
  //
  // AI를 안 쓰기 때문에 이용권 없이도 됩니다. 즉시 답합니다.
  async function checkTopic() {
    const title = getTitle();
    if (!title) {
      return showPanel(`<h4>주제</h4><div class="ws-row warn">제목을 먼저 쓰신 뒤에 눌러주세요.</div>`);
    }
    const { blogTopic } = await chrome.storage.sync.get(["blogTopic"]);
    showPanel(`<h4>주제</h4><p>보는 중입니다…</p>`);
    try {
      const d = await server("/api/topic-fit", {
        title,
        body: getBodyText().slice(0, 1200),
        blogTopic: blogTopic || undefined,
      });

      const badge =
        d.fits === true ? `<span class="ws-chip">맞습니다</span>`
        : d.fits === false ? `<span class="ws-chip dim" style="background:#fdeceb;color:#a02c2c">다른 블로그로</span>`
        : "";

      showPanel(`
        <h4>주제 ${badge}</h4>
        <div class="ws-stats">
          <span>이 글은 <b>${esc(d.topic || "판정 못 함")}</b></span>
          ${d.confidence === "mixed" ? `<span>${esc(d.runnerUp || "")}도 섞임</span>` : ""}
        </div>
        <div class="ws-row ${d.fits === false ? "warn" : "good"}">${esc(d.advice || d.why)}</div>
        ${d.matched && d.topic && d.matched[d.topic] && d.matched[d.topic].length
          ? `<p class="ws-dim">걸린 말: ${esc(d.matched[d.topic].join(", "))}</p>` : ""}
        ${!blogTopic ? `
          <p class="ws-dim">이 블로그의 주제를 정해두면 "맞다/아니다"로 알려드립니다.</p>
          <div class="ws-topics">
            ${(d.topics || []).map((t) => `<button class="ws-apply" data-settopic="${esc(t)}">${esc(t)} 블로그로 설정</button>`).join("")}
          </div>` : `
          <p class="ws-dim">이 블로그는 <b>${esc(blogTopic)}</b>으로 설정돼 있습니다.
            <button class="ws-apply" data-settopic="">바꾸기</button></p>`}
      `);

      panel.querySelectorAll("[data-settopic]").forEach((b) =>
        b.addEventListener("click", async () => {
          await chrome.storage.sync.set({ blogTopic: b.dataset.settopic });
          checkTopic();
        })
      );
    } catch (e) {
      showPanel(`<h4>주제</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 사진 너비 맞추기 ──────────────────────────────────
  //
  // ⚠️ 여기서부터는 **사장님 글을 직접 건드립니다.** 세는 기능과 성격이 다릅니다.
  // 스마트에디터는 내부 상태로 문서를 관리해서, DOM만 바꾸면 화면에는 반영돼도
  // 발행하면 원래대로 돌아갑니다. 그래서 되는지 안 되는지를 **바꾼 뒤에 다시 세어**
  // 확인하고, 안 먹었으면 안 먹었다고 말합니다. 된 척하면 사장님이 발행하고 나서 압니다.
  function resizeImages() {
    const root = getEditorRoot();
    if (!root) {
      return showPanel(`<h4>사진 너비</h4><div class="ws-row warn">본문을 찾지 못했습니다.</div>`);
    }
    const imgs = [...root.querySelectorAll(".se-image-resource")];
    if (!imgs.length) {
      return showPanel(`<h4>사진 너비</h4><div class="ws-row warn">본문에 사진이 없습니다.</div>`);
    }

    showPanel(`
      <h4>사진 너비 맞추기</h4>
      <p class="ws-dim">본문 사진 <b>${imgs.length}장</b>의 너비를 한 번에 맞춥니다.
        크기가 제각각이면 읽는 흐름이 끊깁니다.</p>
      <div class="ws-widths">
        ${[600, 700, 800, 900, "원본"].map((w) =>
          `<button class="ws-apply" data-width="${w}">${w === "원본" ? "원본대로" : w + "px"}</button>`
        ).join("")}
      </div>
      <p class="ws-dim">네이버 본문 폭이 보통 700~900px입니다. 그보다 크게 잡아도 화면에선 줄어듭니다.</p>
    `);

    panel.querySelectorAll("[data-width]").forEach((b) =>
      b.addEventListener("click", () => {
        const w = b.dataset.width;
        let done = 0;
        for (const img of imgs) {
          try {
            if (w === "원본") {
              img.style.removeProperty("width");
              img.style.removeProperty("max-width");
            } else {
              img.style.setProperty("width", w + "px", "important");
              img.style.setProperty("max-width", "100%", "important");
            }
            // 스마트에디터는 감싸는 요소에도 폭을 들고 있습니다. 같이 맞춰야 합니다.
            const holder = img.closest(".se-module-image, .se-component-content");
            if (holder && w !== "원본") holder.style.setProperty("width", w + "px", "important");
            else if (holder) holder.style.removeProperty("width");
            done++;
          } catch {}
        }
        showPanel(`
          <h4>사진 너비</h4>
          <div class="ws-row ${done ? "good" : "bad"}">${done}장에 적용했습니다.</div>
          <p class="ws-dim"><b>발행 전에 미리보기로 꼭 확인하세요.</b>
            스마트에디터가 자체 크기를 다시 씌우는 경우가 있어서, 화면에 반영돼도
            발행하면 원래대로 돌아갈 수 있습니다. 그러면 에디터의 사진 크기 조절을 쓰셔야 합니다.</p>
        `);
        scheduleCount();
      })
    );
  }

  // ── 글꼴·크기 일괄 ────────────────────────────────────
  function applyFont() {
    const root = getEditorRoot();
    if (!root) {
      return showPanel(`<h4>폰트</h4><div class="ws-row warn">본문을 찾지 못했습니다.</div>`);
    }
    const paras = [...root.querySelectorAll(".se-text-paragraph")]
      .filter((p) => !p.closest(".se-documentTitle"));
    if (!paras.length) {
      return showPanel(`<h4>폰트</h4><div class="ws-row warn">본문 문단을 찾지 못했습니다.</div>`);
    }

    // ⚠️ 네이버가 실제로 쓰는 글꼴 이름만 넣습니다. 없는 이름을 넣으면
    // 화면에선 바뀐 것처럼 보이는데 발행하면 기본 글꼴로 돌아갑니다.
    const FONTS = ["나눔고딕", "나눔명조", "나눔스퀘어", "마루 부리", "기본"];
    const SIZES = [15, 16, 19, 24];

    showPanel(`
      <h4>글꼴·크기 한 번에</h4>
      <p class="ws-dim">본문 문단 <b>${paras.length}개</b>에 적용합니다. 제목은 건드리지 않습니다.</p>
      <div class="ws-dim" style="margin-top:8px">글꼴</div>
      <div class="ws-widths">
        ${FONTS.map((f) => `<button class="ws-apply" data-font="${f}">${f}</button>`).join("")}
      </div>
      <div class="ws-dim" style="margin-top:10px">크기</div>
      <div class="ws-widths">
        ${SIZES.map((s) => `<button class="ws-apply" data-size="${s}">${s}px</button>`).join("")}
      </div>
      <p class="ws-dim">모바일에서는 16px 안팎이 읽기 편합니다.</p>
    `);

    const applyTo = (fn, label) => {
      let done = 0;
      paras.forEach((p) => { try { fn(p); done++; } catch {} });
      showPanel(`
        <h4>폰트</h4>
        <div class="ws-row ${done ? "good" : "bad"}">${label} — 문단 ${done}개에 적용했습니다.</div>
        <p class="ws-dim"><b>발행 전에 미리보기로 확인하세요.</b>
          에디터가 자체 서식을 다시 씌우면 발행할 때 원래대로 돌아갈 수 있습니다.</p>
      `);
    };

    panel.querySelectorAll("[data-font]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = b.dataset.font;
        applyTo((p) => {
          if (f === "기본") p.style.removeProperty("font-family");
          else p.style.setProperty("font-family", f, "important");
        }, f);
      })
    );
    panel.querySelectorAll("[data-size]").forEach((b) =>
      b.addEventListener("click", () => {
        const s = b.dataset.size;
        applyTo((p) => p.style.setProperty("font-size", s + "px", "important"), s + "px");
      })
    );
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

  // ── 줄바꿈 ─────────────────────────────────────────────
  //
  // ⚠️ 서버를 안 부릅니다. 자를 자리는 국어 문법으로 정해져 있어서
  // 물어볼 필요가 없습니다. 인터넷이 끊겨도 됩니다.
  //
  // ⚠️ 기준은 실제로 세어본 값입니다.
  // 일 74,094명 오는 블로그는 60자 넘는 문단을 아예 안 씁니다(0%).
  // 사장님 블로그는 26%가 60자를 넘습니다. 45자를 한계로 잡았습니다.
  const BREAK_LIMIT = 45;
  const BREAK_TARGET = 22;
  const INVIS = /[\s​-‍⁠﻿]/g;
  const visLen = (s) => String(s || "").replace(INVIS, "").length;

  const HARD_END = [
    /([.!?]|\.{2,}|…)(\s+)/g,
    /((?:습니다|입니다|합니다|됩니다|했어요|해요|예요|이에요|에요|네요|더라고요|거든요|잖아요|세요|겠어요|았어요|었어요)[.!?]?)(\s+)/g,
  ];
  // ⚠️ 이 목록은 src/lineBreak.js의 SOFT와 **글자 하나까지 같아야** 합니다.
  // 다르면 확장에서 본 결과와 화면에서 본 결과가 달라집니다. 사장님은 어느 쪽을
  // 믿어야 할지 모르게 됩니다. scripts/test-linebreak-parity.js가 매번 대조합니다.
  const SOFT_END = [
    [/((?:는데|은데|ㄴ데|지만|아서|어서|여서|니까|으니까|면서|거나|든지|더니|길래|는지|던데|테니|라서|다가|자마자)[,]?)(\s+)/g, 8],
    [/(,)(\s+)/g, 6],
    [/((?:에서|으로|에게|한테|부터|까지|보다|처럼|만큼|대신|위해|통해)[,]?)(\s+)/g, 5],
    [/((?:하고|되고|이고|보며|하며|되며|하면|되면|이면)[,]?)(\s+)/g, 3],
  ];

  /** 문단 하나를 45자 이하 조각들로 자릅니다. 글자는 하나도 안 바꿉니다. */
  function breakOne(text) {
    const t = String(text || "").replace(INVIS, " ").replace(/\s+/g, " ").trim();
    if (!t || t.length <= BREAK_LIMIT) return t ? [t] : [];

    const hard = new Set();
    for (const re of HARD_END) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t))) hard.add(m.index + m[1].length);
    }
    const soft = new Map();
    for (const [re, sc] of SOFT_END) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t))) {
        const p = m.index + m[1].length;
        if (!soft.has(p) || soft.get(p) < sc) soft.set(p, sc);
      }
    }
    let m;
    const sp = /(\S)(\s+)/g;
    while ((m = sp.exec(t))) {
      const p = m.index + 1;
      if (!soft.has(p)) soft.set(p, 1);
    }

    const out = [];
    let start = 0;
    while (start < t.length) {
      if (t.length - start <= BREAK_LIMIT) { out.push(t.slice(start).trim()); break; }
      const near = (p) => Math.abs(p - start - BREAK_TARGET);
      const inRange = (p) => p > start + 8 && p - start <= BREAK_LIMIT;
      let pick = null;
      const h = [...hard].filter(inRange);
      if (h.length) pick = h.reduce((a, b) => (near(b) < near(a) ? b : a));
      else {
        const s = [...soft.entries()].filter(([p]) => inRange(p));
        if (s.length) {
          pick = s.reduce((a, b) => (b[1] !== a[1] ? (b[1] > a[1] ? b : a) : near(b[0]) < near(a[0]) ? b : a))[0];
        } else pick = start + BREAK_LIMIT;
      }
      const piece = t.slice(start, pick).trim();
      if (piece) out.push(piece);
      start = pick;
      while (start < t.length && /\s/.test(t[start])) start++;
    }
    return out.filter(Boolean);
  }

  function runLineBreak() {
    const root = getEditorRoot();
    if (!root) return showPanel(`<h4>줄바꿈</h4><div class="ws-row warn">본문을 찾지 못했습니다.</div>`);

    const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
    const nodes = [...root.querySelectorAll(".se-text-paragraph")].filter(
      (n) => !n.closest(SKIP) && !n.closest(".se-documentTitle") && !n.closest(".se-placeholder")
    );

    const long = [];
    for (const n of nodes) {
      const t = (n.innerText || "").replace(/​/g, "").trim();
      if (visLen(t) <= BREAK_LIMIT) continue;
      const pieces = breakOne(t);
      if (pieces.length > 1) long.push({ node: n, text: t, pieces });
    }

    const total = nodes.filter((n) => visLen((n.innerText || "")) >= 2).length;
    if (!long.length) {
      return showPanel(`<h4>줄바꿈</h4>
        <div class="ws-row good">고칠 게 없습니다. 문단 ${total}개가 전부 ${BREAK_LIMIT}자 이하입니다.</div>
        <p class="ws-note">일 74,094명 오는 블로그(니들의연애가중계)를 12편 세어보니
        60자 넘는 문단이 <b>0%</b>였습니다. 지금 사장님 글도 그 모양입니다.</p>`);
    }

    const pct = Math.round((long.length / Math.max(1, total)) * 100);
    showPanel(`<h4>줄바꿈 — 긴 문단 ${long.length}개</h4>
      <p class="ws-note">문단 ${total}개 중 <b>${pct}%</b>가 ${BREAK_LIMIT}자를 넘습니다.
      일 74,094명 오는 블로그는 이 비율이 <b>1%</b>입니다(실제로 12편 세어본 값입니다).</p>
      <div id="ws-lb-list">${long.map((L, i) => `
        <div class="ws-row" data-lb="${i}">
          <div style="font-size:11px;opacity:.6;margin-bottom:4px">${visLen(L.text)}자 → ${L.pieces.length}줄</div>
          <div style="opacity:.55;text-decoration:line-through;margin-bottom:6px">${esc(L.text)}</div>
          <div>${L.pieces.map((p) => `<div>${esc(p)}</div>`).join("")}</div>
          <button class="ws-mini" data-lbfix="${i}" style="margin-top:6px">이 문단만 고치기</button>
        </div>`).join("")}</div>
      <button class="ws-mini" id="ws-lb-all" style="margin-top:10px">전부 고치기 (${long.length}개)</button>
      <button class="ws-mini" id="ws-lb-copy" style="margin-top:10px">고친 본문 복사</button>`);

    // 한 문단이 실패해도 나머지는 살아야 합니다. 실패한 문단은 원문 그대로 둡니다.
    // ⚠️ 넣는 일과 확인하는 일은 replaceParagraph에 맡깁니다.
    // 예전에 여기서 직접 넣고 **바로** 확인했는데, 그러면 에디터가 되돌리기 전이라
    // 항상 "성공"으로 보입니다. 제목을 그렇게 날려먹었습니다.
    const fixOne = (L) => replaceParagraph(L.node, L.pieces.join("\n"), { expect: L.pieces[0] });

    panel.querySelectorAll("[data-lbfix]").forEach((b) => {
      b.addEventListener("click", async () => {
        const L = long[+b.dataset.lbfix];
        b.disabled = true;
        b.textContent = "고치는 중…";
        const done = await fixOne(L);
        b.textContent = done ? "고쳤습니다" : "편집기가 안 받네요 — 원문 그대로 뒀습니다";
        if (done) scheduleCount();
      });
    });

    panel.querySelector("#ws-lb-all").addEventListener("click", async (e) => {
      // 뒤에서부터 고칩니다. 앞에서 고치면 뒤 문단의 자리가 밀립니다.
      e.target.disabled = true;
      e.target.textContent = "고치는 중…";
      let done = 0, failed = 0;
      for (let i = long.length - 1; i >= 0; i--) ((await fixOne(long[i])) ? done++ : failed++);
      e.target.textContent = failed
        ? `${done}개 고쳤습니다 · ${failed}개는 원문 그대로 뒀습니다`
        : `${done}개 전부 고쳤습니다`;
      scheduleCount();
    });

    panel.querySelector("#ws-lb-copy").addEventListener("click", (e) => {
      const text = getBodyParts()
        .flatMap((p) => (visLen(p) > BREAK_LIMIT ? breakOne(p) : [p]))
        .join("\n");
      navigator.clipboard.writeText(text).then(() => (e.target.textContent = "복사됐습니다"));
    });
  }

  // ── 맞춤법 ─────────────────────────────────────────────
  //
  // ⚠️ 줄바꿈은 규칙을 여기에도 복사해뒀지만, 맞춤법은 **서버를 부릅니다.**
  // 줄바꿈 규칙은 20줄이라 복사해도 대조가 되는데, 맞춤법은 규칙이 계속 늘어납니다.
  // 두 벌을 두면 언젠가 반드시 어긋납니다. 줄바꿈에서 이미 56개가 어긋났습니다.
  // 맞춤법은 인터넷이 끊기면 못 쓰는 대신, 규칙이 한 군데만 있습니다.
  async function runSpell() {
    const body = getBodyText();
    if (!body.trim()) {
      return showPanel(`<h4>맞춤법</h4><div class="ws-row warn">본문이 비어 있습니다.</div>`);
    }
    showPanel(`<h4>맞춤법</h4><p>${body.length.toLocaleString()}자를 살펴보는 중입니다…</p>`);
    try {
      const r = await server("/api/spellcheck", { text: body });
      if (!r.issues.length) {
        return showPanel(`<h4>맞춤법</h4>
          <div class="ws-row good">틀린 데를 못 찾았습니다. 규칙 ${r.ruleCount}가지로 봤습니다.</div>
          <p class="ws-note">블로그에서 실제로 자주 나오는 틀린 말만 봅니다.
          모든 오류를 잡지는 못합니다.</p>`);
      }

      const sure = r.issues.filter((i) => i.sure);
      const maybe = r.issues.filter((i) => !i.sure);
      const card = (i, n) => `
        <div class="ws-row ${i.sure ? "bad" : "warn"}">
          <div style="margin-bottom:5px">
            <span style="opacity:.6">${esc(i.around.before)}</span><b
              style="color:#f87171;text-decoration:line-through">${esc(i.found)}</b><span
              style="opacity:.6">${esc(i.around.after)}</span>
          </div>
          <div style="margin-bottom:5px"><b style="color:#4ade80">${esc(i.suggest)}</b></div>
          <div style="font-size:11.5px;opacity:.75">${i.why}</div>
          ${i.sure ? `<button class="ws-mini" data-sp="${n}" style="margin-top:6px">이것만 고치기</button>` : ""}
        </div>`;

      showPanel(`<h4>맞춤법 — ${r.issues.length}건</h4>
        ${sure.length ? `<p class="ws-note"><b>확실한 것 ${sure.length}건</b> · 참고 ${maybe.length}건</p>` : ""}
        ${r.issues.map((i, n) => card(i, n)).join("")}
        ${sure.length ? `<button class="ws-mini" id="ws-sp-all" style="margin-top:10px">확실한 것 ${sure.length}건 전부 고치기</button>` : ""}
        <p class="ws-note" style="margin-top:10px">
          빨간 것은 어떤 문장에서도 틀린 말이라 바로 고쳐도 됩니다.
          노란 것은 <b>앞뒤를 봐야</b> 압니다 — 읽어보고 직접 정하세요.
        </p>`);

      // ⚠️ 문단 하나씩 바꿉니다. 편집기 전체를 갈아끼우면 사진·링크가 다 날아갑니다.
      // 넣고 확인하고 실패하면 되돌리는 일은 replaceParagraph에 맡깁니다.
      async function applyFix(found, suggest) {
        const root = getEditorRoot();
        if (!root) return false;
        const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
        const nodes = [...root.querySelectorAll(".se-text-paragraph")].filter(
          (n) => !n.closest(SKIP) && !n.closest(".se-documentTitle") && !n.closest(".se-placeholder")
        );
        let done = false;
        for (const n of nodes) {
          const t = (n.innerText || "").replace(/​/g, "");
          if (!t.includes(found)) continue;
          const want = t.split(found).join(suggest);
          if (await replaceParagraph(n, want, { expect: suggest })) done = true;
        }
        return done;
      }

      panel.querySelectorAll("[data-sp]").forEach((b) => {
        b.addEventListener("click", async () => {
          const i = r.issues[+b.dataset.sp];
          b.disabled = true;
          b.textContent = "고치는 중…";
          const done = await applyFix(i.found, i.suggest);
          b.textContent = done ? "고쳤습니다" : "편집기가 안 받네요 — 원문 그대로";
          if (done) scheduleCount();
        });
      });

      const allBtn = panel.querySelector("#ws-sp-all");
      if (allBtn) allBtn.addEventListener("click", async () => {
        allBtn.disabled = true;
        allBtn.textContent = "고치는 중…";
        let done = 0, failed = 0;
        for (const i of sure) ((await applyFix(i.found, i.suggest)) ? done++ : failed++);
        allBtn.textContent = failed ? `${done}건 고쳤습니다 · ${failed}건 실패` : `${done}건 전부 고쳤습니다`;
        scheduleCount();
      });
    } catch (e) {
      showPanel(`<h4>맞춤법</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  // ── 홈판 썸네일 ───────────────────────────────────────
  //
  // ⚠️ 여기서 썸네일까지 만들지는 않습니다. 사진을 골라야 하는데, 글쓰기 창에
  // 파일 선택 창을 띄우면 편집기가 포커스를 잃고 사장님이 쓰던 자리를 놓칩니다.
  // 대신 **제목을 들고** 썸네일 화면을 엽니다. 가서 문구가 이미 뽑혀 있습니다.
  /**
   * 본문에 들어 있는 사진들의 주소를 모읍니다.
   *
   * ⚠️ 사진을 본문에 넣으면 네이버가 **바로 서버에 올립니다.** 발행 전이라도요.
   * 그래서 주소만 넘기면 우리 서버가 받아올 수 있습니다. 다시 올릴 필요가 없습니다.
   *
   * ⚠️ 스티커·이모티콘·링크카드 미리보기는 뺍니다. 그건 사장님 사진이 아닙니다.
   * 그리고 작은 것도 뺍니다 — 썸네일로 쓰기엔 뭉개집니다.
   */
  function collectPhotoUrls() {
    const root = getEditorRoot();
    if (!root) return [];
    const SKIP = ".se-sticker, .se-oglink, .se-material, .se-placesMap";
    const out = [];
    for (const img of root.querySelectorAll(".se-image-resource, .se-component.se-image img")) {
      if (img.closest(SKIP)) continue;
      // 아직 올라가는 중이면 blob: 이나 data: 입니다. 그건 우리가 못 받습니다.
      const src = img.getAttribute("data-src") || img.src || "";
      if (!/^https:\/\//i.test(src)) continue;
      // 네이버가 붙이는 크기 지시(?type=w80)를 떼야 원본이 옵니다.
      const clean = src.split("?")[0];
      // 화면에서 너무 작게 나오는 건 아이콘일 가능성이 큽니다.
      if (img.naturalWidth && img.naturalWidth < 200) continue;
      if (!out.includes(clean)) out.push(clean);
    }
    return out;
  }

  async function openThumb() {
    const title = getTitle();
    const body = getBodyText();
    const urls = collectPhotoUrls();
    const cfg = await new Promise((r) => chrome.storage.sync.get(["server"], r));
    const base = (cfg.server || "https://woosurimi-trend-api.onrender.com").replace(/\/+$/, "");

    const modeInfo = /전후|비포|애프터|before|after|비교|바뀐|달라진|변화|변신|민낯/i.test(title)
      ? { kind: "beforeAfter", label: "비포 / 애프터", note: "제목이 전후 비교라서 두 장을 짝지어 붙입니다." }
      : { kind: "single", label: "한 장", note: "인물 사진 중에 제일 눈에 걸릴 한 장을 고릅니다." };

    if (!urls.length) {
      return showPanel(`<h4>홈판 썸네일</h4>
        <div class="ws-row warn">본문에서 사진을 못 찾았습니다.</div>
        <p class="ws-note">사진을 본문에 넣으면 자동으로 고를 수 있습니다.
        아직 올라가는 중이면 잠깐 기다렸다 다시 눌러주세요.</p>
        <button class="ws-mini" id="ws-th-manual" style="margin-top:8px">직접 고르기 (수동)</button>`);
    }

    showPanel(`<h4>홈판 썸네일</h4>
      <p class="ws-note">본문에서 사진 <b>${urls.length}장</b>을 찾았습니다.</p>
      <div class="ws-row">
        <div style="margin-bottom:6px"><b>자동</b> — ${modeInfo.label}</div>
        <div style="font-size:11.5px;opacity:.75;margin-bottom:8px">${modeInfo.note}</div>
        <button class="ws-mini" id="ws-th-auto">AI가 골라주기</button>
        <button class="ws-mini" id="ws-th-flip" style="margin-left:6px">${
          modeInfo.kind === "beforeAfter" ? "한 장으로" : "비포/애프터로"
        }</button>
      </div>
      <div class="ws-row">
        <div style="margin-bottom:6px"><b>수동</b> — 직접 고르기</div>
        <div style="font-size:11.5px;opacity:.75;margin-bottom:8px">사진을 직접 올리고 문구도 직접 정합니다.</div>
        <button class="ws-mini" id="ws-th-manual">직접 만들기</button>
      </div>
      <div id="ws-th-out"></div>`);

    let force = modeInfo.kind;
    const flip = panel.querySelector("#ws-th-flip");
    if (flip) flip.addEventListener("click", () => {
      force = force === "beforeAfter" ? "single" : "beforeAfter";
      flip.textContent = force === "beforeAfter" ? "한 장으로" : "비포/애프터로";
    });

    panel.querySelector("#ws-th-manual").addEventListener("click", () => {
      window.open(`${base}/thumb.html${title ? "?title=" + encodeURIComponent(title) : ""}`, "_blank", "noopener");
    });

    const autoBtn = panel.querySelector("#ws-th-auto");
    if (autoBtn) autoBtn.addEventListener("click", async () => {
      autoBtn.disabled = true;
      autoBtn.textContent = "사진을 보는 중…";
      const out = panel.querySelector("#ws-th-out");
      out.innerHTML = `<p class="ws-note">사진 ${urls.length}장을 AI가 하나씩 봅니다. 20~40초 걸립니다.</p>`;
      try {
        const r = await server("/api/thumb/auto", { imageUrls: urls, title, body, force });
        const p = r.plan;
        out.innerHTML = `
          <div class="ws-row good">
            <img src="${r.image}" alt="만들어진 썸네일"
              style="width:100%;max-width:260px;border-radius:9px;display:block;margin-bottom:8px" />
            <div style="font-size:11.5px;opacity:.8;margin-bottom:6px">${esc(p.why)}</div>
            ${p.warn.map((w) => `<div style="font-size:11.5px;color:#fbbf24;margin-bottom:4px">⚠ ${esc(w)}</div>`).join("")}
            <a class="ws-mini" href="${r.image}" download="홈판썸네일.jpg"
              style="display:inline-block;text-decoration:none">내려받기</a>
            <button class="ws-mini" id="ws-th-again" style="margin-left:6px">다시 고르기</button>
          </div>`;
        const again = out.querySelector("#ws-th-again");
        if (again) again.addEventListener("click", () => { autoBtn.disabled = false; autoBtn.click(); });
      } catch (e) {
        out.innerHTML = `<div class="ws-row bad">${esc(e.message)}</div>`;
      } finally {
        autoBtn.disabled = false;
        autoBtn.textContent = "AI가 골라주기";
      }
    });
  }

  /**
   * 문단 하나의 글자를 바꿉니다. **에디터를 통해서** 바꿉니다.
   *
   * ⚠️ 이 함수가 왜 있는지 — 제목을 세 번 날려먹고 배운 것입니다.
   *
   * 1) `el.textContent = 새글`을 쓰면 안 됩니다.
   *    스마트에디터의 문단은 <p><span class="se-ff-...">글자</span></p> 구조인데,
   *    textContent를 넣으면 그 span이 날아갑니다. 에디터는 구조가 깨진 걸 발견하면
   *    자기 모델로 되돌리고, 그 과정에서 **글이 빈칸이 됩니다.**
   *    execCommand("insertText")는 사람이 타자 친 것과 같은 경로라 span이 유지됩니다.
   *
   * 2) 넣자마자 확인하면 안 됩니다.
   *    그 순간에는 글자가 들어가 있습니다. 에디터가 되돌리는 건 **다음 순간**입니다.
   *    그래서 "성공"이라고 창을 닫고, 사장님 화면에서는 글이 사라집니다.
   *    한 프레임 + 280ms를 기다렸다가 봅니다.
   *
   * 3) 실패하면 원래대로 돌려놓습니다.
   *    되는 척하다가 사장님 글을 날리는 것보다, 안 된다고 말하는 게 낫습니다.
   *
   * @returns {Promise<boolean>} 정말 바뀌었는지
   */
  // ⚠️ requestAnimationFrame을 쓰면 안 됩니다.
  // 화면에 안 보이는 탭에서는 브라우저가 그림을 안 그리기 때문에 rAF가
  // **영원히 안 옵니다.** 사장님이 고치는 중에 다른 탭으로 넘어가면
  // 버튼이 "고치는 중…"에서 멈춘 채 안 돌아옵니다. 실제로 확인했습니다.
  // 그냥 시간으로 기다립니다. 300ms면 에디터가 정리하기에 충분합니다.
  const settleEditor = () => new Promise((r) => setTimeout(r, 300));

  /**
   * 편집기 칸의 글자를 바꿉니다. **span을 살려두면서.**
   *
   * ⚠️ 이걸 알아내는 데 세 번 실패했습니다. 브라우저에서 직접 재보고 알았습니다.
   *
   * 스마트에디터의 칸은 이렇게 생겼습니다:
   *   <p class="se-text-paragraph"><span class="se-ff-... se-fs32">글자</span></p>
   * 에디터는 저 span을 기준으로 문서를 관리합니다. span이 없어지면 구조가 깨졌다고
   * 보고 자기 모델로 되돌리는데, 그 과정에서 **글이 빈칸이 됩니다.**
   *
   * 실제로 재본 것:
   *   el.textContent = 새글                        → span 사라짐 ✗
   *   문단 전체 선택 + execCommand("insertText")    → span 사라짐 ✗   ← 이것도 안 됩니다
   *   span 안쪽만 선택 + execCommand("insertText")  → span 사라짐 ✗   ← 이것도요
   *
   * 왜냐면 브라우저는 **span이 빈 순간 그 span을 치워버립니다.**
   * 글자를 전부 선택해서 바꾸면 반드시 한 번은 비게 됩니다.
   *
   * 그래서 **한 번도 안 비게** 합니다:
   *   1) 끝에 커서를 두고 새 글자를 **붙입니다**  → "원래글새글" (span 유지)
   *   2) 앞쪽 원래 글자만 골라서 지웁니다          → "새글"     (span 유지)
   * 둘 다 execCommand라 에디터가 자기 명령으로 인식하고 모델도 같이 갱신합니다.
   *
   * 이게 막히면 텍스트 노드의 값만 직접 바꿉니다 — 구조는 안 건드리는 방식입니다.
   */
  function setEditableText(el, want) {
    const value = String(want);
    try {
      // 글자를 담고 있는 그릇 — 보통 span, 없으면 칸 자체.
      const host = el.querySelector("span") || el;
      const before = host.textContent || "";
      const sel = window.getSelection();

      if (before.length) {
        // 1) 끝에 붙이기
        el.focus();
        const r1 = document.createRange();
        r1.selectNodeContents(host);
        r1.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r1);
        if (!document.execCommand("insertText", false, value)) throw new Error("insert 실패");

        // 2) 앞쪽 옛 글자만 지우기
        // ⚠️ 붙이면서 텍스트 노드가 쪼개질 수 있습니다. 글자 수로 자리를 찾습니다.
        const spot = charOffset(host, before.length);
        if (!spot) throw new Error("지울 자리를 못 찾음");
        const r2 = document.createRange();
        r2.setStart(host.firstChild && host.firstChild.nodeType === 3 ? host.firstChild : spot.node, 0);
        r2.setEnd(spot.node, spot.offset);
        sel.removeAllRanges();
        sel.addRange(r2);
        document.execCommand("delete");
      } else {
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(host);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand("insertText", false, value);
      }

      if ((el.innerText || "").replace(/​/g, "").trim() === value.trim()) return true;
    } catch {}

    // 물러서기 — 텍스트 노드 값만 바꿉니다. 구조를 안 건드리니 span이 삽니다.
    try {
      const host = el.querySelector("span") || el;
      const tn = [...host.childNodes].find((n) => n.nodeType === 3);
      if (tn) {
        tn.nodeValue = value;
      } else {
        host.appendChild(document.createTextNode(value));
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return (el.innerText || "").replace(/​/g, "").trim() === value.trim();
    } catch {
      return false;
    }
  }

  /** 그릇 안에서 n번째 글자가 어느 텍스트 노드의 몇 번째인지 찾습니다. */
  function charOffset(host, n) {
    let left = n;
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node;
    let last = null;
    while ((node = walk.nextNode())) {
      last = node;
      if (left <= node.length) return { node, offset: left };
      left -= node.length;
    }
    return last ? { node: last, offset: last.length } : null;
  }

  async function replaceParagraph(el, want, { expect } = {}) {
    const originalHtml = el.innerHTML;
    const originalText = (el.innerText || "").replace(/​/g, "");
    const norm = (s) => String(s || "").replace(/[\s​]/g, "");
    const target = expect != null ? expect : want;

    // ⚠️ span을 살려서 바꿉니다. 그냥 전체 선택 후 넣으면 span이 사라지고
    // 에디터가 글을 통째로 지웁니다 (setEditableText 설명 참고).
    if (!setEditableText(el, want)) {
      el.innerHTML = originalHtml;
      return false;
    }

    await settleEditor();

    const now = (el.innerText || "").replace(/​/g, "");
    // 넣으려던 게 들어갔으면 성공. 줄바꿈처럼 여러 문단으로 쪼개진 경우도 있어서
    // 첫 조각이 보이면 된 것으로 봅니다.
    if (norm(now).includes(norm(target)) || norm(now) === norm(want)) return true;

    // 실패 — 원래대로. 특히 **빈칸이 됐으면 반드시** 되돌립니다.
    try {
      el.innerHTML = originalHtml;
      await settleEditor();
      if (!norm(el.innerText || "") && originalText) {
        // innerHTML로도 안 돌아왔으면 다시 넣습니다.
        setEditableText(el, originalText);
      }
    } catch {}
    return false;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ── 시작 ──────────────────────────────────────────────
  function start() {
    if (!isWritePage()) return;
    if (HOST.getElementById("ws-tools-dock")) return;
    HOST.body.appendChild(bar);
    HOST.body.appendChild(panel);

    bar.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "hometitle") homeTitle();
      else if (act === "homebody") homeBody();
      else if (act === "topic") checkTopic();
      else if (act === "font") applyFont();
      else if (act === "image") resizeImages();
      else if (act === "audit") runAudit();
      else if (act === "keyword") runKeyword();
      else if (act === "linebreak") runLineBreak();
      else if (act === "spell") runSpell();
      else if (act === "thumb") openThumb();
      else if (act === "table") insertTable();
      else if (act === "word") downloadWord();
      else if (act === "toggle") {
        bar.classList.toggle("ws-dock-collapsed");
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
    if (HOST.getElementById("ws-tools-dock") || ++tries > 20) return clearInterval(iv);
    start();
  }, 700);
})();
