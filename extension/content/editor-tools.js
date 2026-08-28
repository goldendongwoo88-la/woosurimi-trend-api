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
      <button data-act="thumb" class="ws-dock-btn primary" title="홈판용 썸네일 만들기">썸네일</button>
      <button data-act="paste" class="ws-dock-btn primary" title="클로드에서 복사한 원고를 통째로 넣습니다">원고 붙이기</button>
      <button data-act="format" class="ws-dock-btn primary" title="소제목·인용구·강조를 자동으로 넣습니다">자동 서식</button>
      <button data-act="finish" class="ws-dock-btn primary" title="기준값과 견줘보고 임시저장까지">마무리</button>
      <button data-act="links" class="ws-dock-btn primary" title="내 블로그 글 중 관련 있는 것을 본문 끝에 붙입니다">함께보기</button>
      <button data-act="topic" class="ws-dock-btn" title="이 글이 이 블로그 주제에 맞는지">주제</button>
      <button data-act="audit" class="ws-dock-btn" title="문제가 될 만한 표현 찾기">표현 검사</button>
      <button data-act="keyword" class="ws-dock-btn" title="지금 누가 상위에 있는지">키워드</button>
      <button data-act="font" class="ws-dock-btn" title="글꼴·크기를 본문 전체에 한 번에">폰트</button>
      <button data-act="image" class="ws-dock-btn" title="사진 너비를 한 번에 맞춥니다">사진</button>
      <button data-act="linebreak" class="ws-dock-btn" title="긴 문단을 45자 이하로 자릅니다">줄바꿈</button>
      <button data-act="spell" class="ws-dock-btn" title="블로그에서 자주 틀리는 말 찾기">맞춤법</button>
      <button data-act="table" class="ws-dock-btn" title="표 넣기">표</button>
      <button data-act="word" class="ws-dock-btn" title="워드로 내려받기">워드</button>
      <button data-act="toggle" class="ws-dock-min" title="접기">▾</button>
    </div>
  `;

  const panel = HOST.createElement("div");
  panel.id = "ws-tools-panel";
  panel.hidden = true;

  /**
   * 패널을 마우스로 끌어 옮길 수 있게 합니다.
   *
   * ⚠️ 사장님이 "홈판 본문 화면이 본문을 가려서 포스팅하기 어렵다"고 하셨습니다.
   * 실제로 그렇습니다 — 오른쪽에 고정돼 있는데 글은 가운데에 있습니다.
   * 결과를 보면서 본문을 고쳐야 하는데 그 본문이 안 보입니다.
   *
   * ⚠️ 옮긴 자리를 **기억합니다.** 매번 옮기게 하면 그것도 일입니다.
   *
   * ⚠️ 화면 밖으로는 못 나가게 막습니다. 한 번 밖으로 나가면
   * 다시 잡을 방법이 없어서 확장을 다시 깔아야 합니다.
   */
  const POS_KEY = "wsPanelPos";

  function clampToScreen(x, y) {
    const w = panel.offsetWidth || 340;
    const h = panel.offsetHeight || 300;
    // 머리 부분은 항상 보이게 둡니다. 아래로 다 넘어가면 못 잡습니다.
    return {
      x: Math.max(8, Math.min(x, window.innerWidth - Math.min(w, 120))),
      y: Math.max(8, Math.min(y, window.innerHeight - 44)),
    };
  }

  function placePanel(x, y) {
    const p = clampToScreen(x, y);
    panel.style.left = p.x + "px";
    panel.style.top = p.y + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    return p;
  }

  function restorePos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const { x, y } = JSON.parse(raw);
      if (typeof x === "number" && typeof y === "number") placePanel(x, y);
    } catch {}
  }

  /**
   * ⚠️ 처음 버전은 마우스를 떼도 패널이 계속 따라다녔습니다. 사장님이 겪으셨습니다.
   *
   * 원인 — 네이버 편집기는 **iframe** 입니다. 마우스를 편집기 위에서 떼면
   * "뗐다(mouseup)"는 신호가 iframe 안으로 들어가고, 제 코드가 듣고 있던
   * 바깥 창에는 영영 안 옵니다. 신호를 못 받았으니 계속 끌고 있는 줄 압니다.
   *
   * 고침 두 겹:
   *   1) 포인터 캡처 — 손잡이가 포인터를 붙잡으면, 커서가 어느 프레임 위에
   *      있든 move/up 신호가 전부 손잡이로 옵니다. iframe 문제가 사라집니다.
   *   2) 그래도 놓치면 — 움직임 신호에 buttons(지금 눌린 버튼)가 실려 옵니다.
   *      0이면 이미 뗀 것이니 그 자리에서 멈춥니다. 두 번째 안전핀입니다.
   */
  function startDrag(e) {
    // 버튼·입력칸을 누른 거면 옮기지 않습니다. 안 그러면 체크박스를 못 누릅니다.
    if (e.target.closest("button, input, textarea, select, a, label")) return;
    const grip = e.currentTarget;
    const r = panel.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    panel.classList.add("ws-dragging");

    const finish = (x, y) => {
      const p = placePanel(x - dx, y - dy);
      panel.classList.remove("ws-dragging");
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      try { grip.releasePointerCapture(e.pointerId); } catch {}
      try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
    };
    const move = (ev) => {
      // ⚠️ 버튼을 뗐는데 move 가 오면(신호를 놓친 경우) 여기서 멈춥니다.
      if (ev.buttons === 0) return finish(ev.clientX, ev.clientY);
      placePanel(ev.clientX - dx, ev.clientY - dy);
    };
    const up = (ev) => finish(ev.clientX, ev.clientY);

    try { grip.setPointerCapture(e.pointerId); } catch {}
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
    e.preventDefault();
  }

  function showPanel(html) {
    // ⚠️ 버전을 화면에 박습니다. "고쳤는데 그대로예요"의 절반은 크롬이 옛 파일로
    // 돌고 있던 것이었습니다. 캡처 한 장으로 어느 판인지 알 수 있어야 합니다.
    let ver = "";
    try { ver = chrome.runtime.getManifest().version; } catch {}
    panel.innerHTML =
      `<div class="ws-panel-grip" title="여기를 잡고 끌면 옮길 수 있습니다">⠿ 끌어서 옮기기${ver ? `<span style="float:right;opacity:.55;font-weight:400">v${ver}</span>` : ""}</div>` +
      `<button class="ws-panel-close" title="닫기">✕</button>${html}`;
    panel.hidden = false;
    panel.querySelector(".ws-panel-close").onclick = () => (panel.hidden = true);
    // ⚠️ mousedown 이 아니라 pointerdown 이어야 합니다. 포인터 캡처는 포인터 계열
    // 신호에서만 됩니다. mousedown 으로 잡으면 pointerId 가 없어서 캡처가 안 걸리고,
    // iframe 위에서 떼면 또 계속 따라다닙니다.
    panel.querySelector(".ws-panel-grip").onpointerdown = startDrag;
    restorePos();
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

  // ── 한 번 뽑은 건 다시 안 뽑습니다 ─────────────────────
  //
  // ⚠️ 사장님이 "홈판 제목을 두 번째 눌러도 또 분석한다"고 하셨습니다.
  // 글이 그대로인데 10초를 또 기다리시고, AI 크레딧도 또 나갔습니다.
  //
  // 글 내용으로 열쇠를 만듭니다. 글자를 한 자라도 고치면 열쇠가 달라져서
  // 새로 뽑습니다. 안 고쳤으면 아까 것을 그대로 보여드립니다.
  // 새로 뽑고 싶으실 땐 "새로 뽑기" 버튼이 있습니다.
  const CACHE = new Map();

  /** 글 내용을 짧은 열쇠로 줄입니다. 전체를 열쇠로 쓰면 메모리가 아깝습니다. */
  function cacheKey(kind, ...parts) {
    const s = kind + "\u0000" + parts.join("\u0000");
    // 간단한 해시 두 개를 붙여 씁니다. 하나만 쓰면 서로 다른 글이 같은 값이 되기 쉽습니다.
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = ((a ^ c) * 0x01000193) >>> 0;
      b = ((b + c) * 31 + i) >>> 0;
    }
    return `${kind}:${s.length}:${a.toString(36)}:${b.toString(36)}`;
  }

  // ── 서버 호출 ─────────────────────────────────────────

  /**
   * 토큰이 없거나 낡았으면 **스스로 받아옵니다.**
   *
   * ⚠️ 왜 필요한가 — 사장님이 토큰을 계속 다시 넣고 계셨습니다.
   * 확장을 새 폴더에 풀어 다시 로드하면 크롬이 **다른 확장으로 취급**해서
   * chrome.storage 가 통째로 비워집니다. 오늘 버전을 네 번 보내드렸으니
   * 네 번 지워진 겁니다. 사장님 잘못이 아니라 갱신 방식의 문제입니다.
   *
   * 배경 일꾼은 우리 도메인 권한이 있어서 로그인 쿠키를 실어 보낼 수 있습니다.
   * 우수리미에 로그인만 돼 있으면 토큰을 조용히 받아 저장합니다.
   * (설정 화면의 "토큰 자동으로 받기" 버튼과 같은 길입니다 — 이제 버튼을
   * 안 눌러도 필요할 때 알아서 다녀옵니다.)
   */
  async function fetchTokenQuietly() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "syncToken" }, (res) => {
          // 응답이 없어도(배경 일꾼이 잠들었어도) 죽지 않고 그냥 없다고 합니다.
          if (chrome.runtime.lastError || !res || !res.ok) return resolve(null);
          const token = res.data && res.data.token;
          if (!token) return resolve(null);
          chrome.storage.sync.set({ wsToken: token }, () => resolve(token));
        });
      } catch { resolve(null); }
    });
  }

  async function server(pathname, body, { retried = false } = {}) {
    // ⚠️ 저장소 키 이름을 다른 파일과 맞춰야 합니다.
    // 처음에 serverUrl로 읽었는데 설정 화면은 server로 저장합니다.
    // 그러면 사장님이 서버 주소를 바꿔도 반영이 안 되고, 왜 안 되는지도 알 수 없습니다.
    const { server: serverUrl, wsToken } = await chrome.storage.sync.get(["server", "wsToken"]);
    const base = (serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");

    // 토큰이 아예 없으면 부르기 전에 먼저 받아봅니다. 실패해도 일단 진행합니다 —
    // 토큰 없이도 되는 기능(줄바꿈·맞춤법 등)까지 막으면 안 됩니다.
    let token = wsToken;
    if (!token && !retried) token = (await fetchTokenQuietly()) || "";

    const headers = { "content-type": "application/json" };
    // ⚠️ 도메인이 달라 쿠키가 안 실립니다. 토큰을 머리글에 넣습니다.
    if (token) headers["x-ws-token"] = token;
    const res = await fetch(base + pathname, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        // 토큰이 낡았을 수도 있습니다. 한 번만 새로 받아서 다시 해봅니다.
        if (!retried) {
          const fresh = await fetchTokenQuietly();
          if (fresh) return server(pathname, body, { retried: true });
        }
        throw new Error(
          "이용권 확인이 안 됩니다. 우수리미 사이트에 한 번 로그인해 주세요 — " +
          "로그인돼 있으면 토큰은 제가 알아서 받아옵니다."
        );
      }
      if (res.status === 402)
        throw new Error("이 기능은 유료 이용권이 필요합니다.");
      throw new Error(data.message || data.error || `서버 오류 ${res.status}`);
    }
    return data;
  }

  /** 값이 안 나가는 조회용. 기준값처럼 안 바뀌는 것은 한 번만 받아 씁니다. */
  let rulesCache = null;
  async function serverGet(pathname) {
    if (pathname === "/api/homefeed/rules" && rulesCache) return rulesCache;
    const { server: serverUrl } = await chrome.storage.sync.get(["server"]);
    const base = (serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
    const res = await fetch(base + pathname);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 ${res.status}`);
    if (pathname === "/api/homefeed/rules") rulesCache = data;
    return data;
  }

  // ── 함께 보면 좋은 글 ─────────────────────────────────
  //
  // ⚠️ AI를 안 부릅니다. 값이 0원입니다.
  // 내 블로그 글 목록을 받아서 제목에 겹치는 낱말이 많은 순으로 보여드립니다.
  //
  // ⚠️ 실측: 상위 블로그는 자기 글 링크가 중앙값 2개, 하위는 0개였습니다.
  // 다만 **협찬 글은 예외**입니다 — 광고주가 다른 글로 보내는 링크를
  // 허락하지 않는 경우가 많습니다. 사장님이 알려주신 것입니다.
  // 그래서 협찬으로 보이면 미리 골라두지 않고 먼저 여쭙니다.

  /** 협찬 글로 보이는가. 확실히 아는 게 아니라 **여쭤보려고** 보는 것입니다. */
  const SPONSOR = /협찬|제공\s*받아|제공받았|원고료|소정의\s*(수수료|대가)|대가를\s*받아|업체로부터|체험단|서포터즈|무상\s*제공/;
  function looksSponsored(body) {
    const m = String(body || "").match(SPONSOR);
    return m ? m[0].replace(/\s+/g, " ") : null;
  }

  /** 내 블로그 아이디. 설정에 넣어두신 게 먼저, 없으면 주소에서 찾습니다. */
  async function myBlogId() {
    const { blogId } = await chrome.storage.sync.get(["blogId"]);
    if (blogId && String(blogId).trim()) return String(blogId).trim();
    const q = new URLSearchParams(location.search).get("blogId");
    if (q) return q;
    const seg = location.pathname.split("/").filter(Boolean)[0];
    if (seg && !/^(PostWriteForm|postwrite)/i.test(seg)) return seg;
    return "";
  }

  let linkPicks = [];   // 화면에서 고른 것

  async function relatedLinks() {
    const title = getTitle();
    const body = getBodyText();
    if (!title.trim() && body.length < 30)
      return showPanel(`<p>제목이나 본문을 조금 쓰신 뒤에 눌러주세요. 무슨 글인지 알아야 관련 글을 고를 수 있습니다.</p>`);

    const id = await myBlogId();
    if (!id)
      return showPanel(
        `<p><b>블로그 아이디를 모릅니다.</b></p>
         <p class="ws-dim">확장 프로그램 설정에서 블로그 아이디를 한 번 넣어주시면 계속 씁니다.</p>`
      );

    showPanel(`<p>내 글 목록을 받는 중…</p>`);
    let d;
    try {
      d = await server("/api/my-posts", { blogId: id, title });
    } catch (e) {
      return showPanel(`<p class="ws-err">${esc(e.message)}</p>`);
    }

    /**
     * ⚠️ 같은 갈래가 최우선입니다 — 사장님 규칙:
     * "연예인 뷰티 글엔 뷰티 4개, 패션 글엔 패션 4개, 최근 발행 순, 모바일 링크."
     * 서버가 갈래를 못 가리면(sameCategory 없음) 예전처럼 관련/최신으로 갑니다.
     */
    const bySame = !!(d.sameCategory && d.sameCategory.length);
    const list = bySame ? d.sameCategory
               : (d.related && d.related.length ? d.related : d.recent) || [];
    const byRelevance = !bySame && !!(d.related && d.related.length);
    if (!list.length)
      return showPanel(`<p>붙일 만한 글을 못 찾았습니다. (<b>${esc(id)}</b>에서 ${d.total || 0}편을 봤습니다)</p>`);

    const spon = looksSponsored(body);

    // ⚠️ 협찬 글이면 **아무것도 미리 안 고릅니다.** 사장님이 정하실 일입니다.
    // 같은 갈래로 왔으면 4개(사장님 지정), 아니면 실측 중앙값대로 2개를 미리 고릅니다.
    linkPicks = spon ? [] : list.slice(0, bySame ? 4 : 2).map((p) => p.logNo);

    showPanel(`
      <h4>함께 보면 좋은 글</h4>
      ${
        spon
          ? `<p class="ws-warn">이 글에 <b>"${esc(spon)}"</b>가 있습니다. 협찬 글로 보입니다.<br>
             <span class="ws-dim">협찬 글은 광고주가 다른 글로 보내는 링크를 막는 경우가 많아서, 미리 고르지 않았습니다.
             넣으실 거면 직접 골라주세요.</span></p>`
          : bySame
          ? `<p class="ws-dim">이 글을 <b>${esc(d.category && d.category.id)}</b> 갈래로 봤습니다.
             같은 갈래의 <b>최근 글 ${list.length}개</b>(모바일 링크)를 골라뒀습니다 — 갈래가 다르면 체크를 바꿔주세요.</p>`
          : `<p class="ws-dim">상위 블로그는 자기 글 링크가 중앙값 <b>2개</b>였습니다. 하위는 0개였습니다.
             ${byRelevance ? "제목에 겹치는 낱말이 많은 순입니다." : "겹치는 낱말이 없어서 <b>최근 글</b>을 보여드립니다."}</p>`
      }
      <ul class="ws-links">
        ${list
          .map(
            (p) => `<li>
              <label>
                <input type="checkbox" value="${esc(p.logNo)}" ${linkPicks.includes(p.logNo) ? "checked" : ""}>
                <span>${esc(p.title)}</span>
                ${p.score ? `<em class="ws-dim">겹치는 낱말 ${p.score}개</em>` : ""}
              </label>
            </li>`
          )
          .join("")}
      </ul>
      <div class="ws-btnrow">
        <button id="ws-link-add" class="ws-dock-btn primary">고른 것 본문 끝에 넣기</button>
        <button id="ws-link-copy" class="ws-dock-btn">복사만 하기</button>
      </div>
      <p class="ws-dim" id="ws-link-msg">주소를 한 줄에 하나씩 넣습니다. 그래야 네이버가 링크 카드로 바꿔줍니다.</p>
    `);

    const boxes = [...panel.querySelectorAll(".ws-links input")];
    const sync = () => { linkPicks = boxes.filter((b) => b.checked).map((b) => b.value); };
    boxes.forEach((b) => (b.onchange = sync));

    const block = () => {
      const chosen = list.filter((p) => linkPicks.includes(p.logNo));
      if (!chosen.length) return "";
      return ["함께 보면 좋은 글", ...chosen.map((p) => `${p.title}\n${p.url}`)].join("\n\n");
    };
    const msg = (t, cls = "ws-dim") => {
      const el = panel.querySelector("#ws-link-msg");
      if (el) { el.className = cls; el.innerHTML = t; }
    };

    panel.querySelector("#ws-link-add").onclick = async (e) => {
      sync();
      const text = block();
      if (!text) return msg("고른 글이 없습니다.", "ws-warn");
      const I = window.__wsInsert;
      if (!I || !I.appendBlock) return msg("넣기 도구를 못 불러왔습니다. 확장을 다시 설치해 보세요.", "ws-err");
      e.target.disabled = true;
      msg("본문 끝에 넣는 중…");
      const r = await I.appendBlock(text);
      e.target.disabled = false;
      if (r.ok) {
        // 머리말("함께 보면 좋은 글")을 인용구로 — 사장님 지정 모양입니다.
        // 실패해도 링크는 이미 들어갔으니 조용히 넘어갑니다 (모양만 수동으로 바꾸시면 됨).
        try {
          const F = window.__wsFormat;
          const head = [...document.querySelectorAll(".se-text-paragraph")]
            .reverse().find((p) => (p.innerText || "").trim() === "함께 보면 좋은 글");
          if (F && F.setParagraphStyle && head) await F.setParagraphStyle(head, "인용구");
        } catch {}
        msg(`✅ ${linkPicks.length}개를 본문 끝에 넣었습니다 (머리말은 인용구로).`);
        updateCounts();
      }
      else msg(`${esc(r.why)}`, r.copied ? "ws-warn" : "ws-err");
    };

    panel.querySelector("#ws-link-copy").onclick = async () => {
      sync();
      const text = block();
      if (!text) return msg("고른 글이 없습니다.", "ws-warn");
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
        ]);
        msg("✅ 복사했습니다. 본문 맨 끝을 누르고 Ctrl+V 하세요.");
      } catch {
        // ⚠️ 다른 창을 보고 계시면 클립보드 쓰기가 영영 안 끝납니다. 되는 척하지 않습니다.
        msg("복사를 못 했습니다. 이 창을 한 번 누르시고 다시 해주세요.", "ws-warn");
      }
    };
  }

  // ── 마무리 점검 ───────────────────────────────────────
  //
  // ⚠️ AI를 안 부릅니다. 값이 0원입니다.
  // 재는 건 세는 일입니다. 세는 걸 AI한테 시키면 값도 나가고 틀리기까지 합니다.
  //
  // ⚠️ 기준값을 여기 적어두지 않습니다. 서버(homefeedRules)에서 받아 씁니다.
  // 양쪽에 적어두면 언젠가 어긋나고, 그때 어느 쪽이 맞는지 아무도 모릅니다.

  /**
   * 지금 글을 잽니다. 편집기 안을 **문서 순서대로** 훑습니다.
   * 순서가 어긋나면 사진 사이 글자 수가 엉뚱하게 나옵니다.
   */
  function measurePost() {
    const root = getEditorRoot();
    if (!root) return null;

    const SKIP = ".se-documentTitle, .se-placeholder";
    const nodes = [...root.querySelectorAll(".se-text-paragraph, .se-image-resource, .se-oglink, .se-video")]
      .filter((n) => !n.closest(SKIP));

    // 본문 글자 크기의 중앙값을 먼저 구합니다. 소제목은 그보다 확실히 큽니다.
    // ⚠️ "38px이면 소제목"이라고 못 박으면 안 됩니다. 사장님이 본문 크기를
    // 19로 쓰시면 소제목이 30일 수도 있습니다. **상대적으로** 봐야 합니다.
    const sizes = [];
    for (const n of nodes) {
      if (!n.classList.contains("se-text-paragraph")) continue;
      const t = (n.innerText || "").trim();
      if (!t) continue;
      const px = parseFloat(getComputedStyle(n.querySelector("span") || n).fontSize) || 0;
      if (px) sizes.push(px);
    }
    sizes.sort((a, b) => a - b);
    const bodyPx = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 16;

    const paras = [];      // 글자 있는 문단만
    const gaps = [];       // 사진과 사진 사이 글자 수
    let images = 0, subheads = 0, run = 0, seenImage = false;

    for (const n of nodes) {
      if (n.classList.contains("se-text-paragraph")) {
        const t = (n.innerText || "").replace(/[\s​]/g, "");
        if (!t) continue;
        const px = parseFloat(getComputedStyle(n.querySelector("span") || n).fontSize) || bodyPx;
        // 본문보다 1.25배 넘게 크고 짧으면 소제목으로 봅니다.
        if (px >= bodyPx * 1.25 && t.length <= 45) { subheads++; continue; }
        paras.push(t.length);
        run += t.length;
      } else if (n.classList.contains("se-image-resource")) {
        images++;
        // 첫 사진 앞은 도입부라 간격으로 안 셉니다.
        if (seenImage) gaps.push(run);
        seenImage = true;
        run = 0;
      }
    }

    const chars = paras.reduce((a, b) => a + b, 0);
    const mid = (arr) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    // 굵게 — 서로 다른 덩이 개수를 셉니다.
    const bold = root.querySelectorAll("b, strong").length;

    return {
      chars,
      subheads,
      images,
      imgGap: mid(gaps),
      paraLen: mid(paras),
      over45: paras.length ? Math.round((paras.filter((n) => n > 45).length / paras.length) * 100) : 0,
      boldPer1k: chars ? +((bold / chars) * 1000).toFixed(1) : 0,
      paras: paras.length,
    };
  }

  /** 내 글로 가는 링크카드 개수. 남의 글 링크는 안 셉니다 — 실측한 건 '내 글' 링크입니다. */
  function countOwnLinks(myId) {
    const root = getEditorRoot();
    if (!root || !myId) return 0;
    const id = String(myId).toLowerCase();
    let n = 0;
    for (const el of root.querySelectorAll(".se-oglink")) {
      const a = el.querySelector("a[href]");
      const href = (a && a.getAttribute("href")) || el.innerText || "";
      if (href.toLowerCase().includes(`blog.naver.com/${id}`)) n++;
    }
    return n;
  }

  async function finishCheck() {
    const body = getBodyText();
    if (body.length < 100)
      return showPanel(`<p>본문이 너무 짧습니다. 조금 더 쓰신 뒤에 눌러주세요.</p>`);

    showPanel(`<p>재는 중…</p>`);
    let R;
    try {
      R = await serverGet("/api/homefeed/rules");
    } catch (e) {
      return showPanel(`<p class="ws-err">기준값을 못 받았습니다. ${esc(e.message)}</p>`);
    }

    const m = measurePost();
    if (!m) return showPanel(`<p class="ws-err">본문을 못 찾았습니다.</p>`);

    const id = await myBlogId();
    const own = countOwnLinks(id);
    const spon = looksSponsored(body);

    // 주제 고르기 — 제목과 본문으로 짐작하고, 틀리면 바꾸실 수 있게 둡니다.
    const guess = /연예|방송|가십|드라마|아이돌|배우|가수|아이유|스포츠/.test(getTitle() + body.slice(0, 300))
      ? "연예·방송" : "패션·뷰티";

    const render = (topic) => {
      const g = R.byTopic[topic];
      const u = R.universal;

      // 재본 값 vs 기준. 넘거나 모자라면 어느 쪽인지도 말합니다.
      const rows = [
        { k: "글자 수", got: m.chars, lo: g.chars.min, hi: g.chars.max, unit: "자" },
        { k: "소제목", got: m.subheads, lo: g.subheads.min, hi: g.subheads.max, unit: "개" },
        { k: "사진", got: m.images, lo: g.images.min, hi: g.images.max, unit: "장" },
        { k: "사진 사이 글자", got: m.imgGap, lo: g.imgGap.min, hi: g.imgGap.max, unit: "자" },
        { k: "문단 길이", got: m.paraLen, lo: 0, hi: u.paraLen.top + 4, unit: "자",
          note: `잘 되는 쪽 ${u.paraLen.top}자 / 덜 되는 쪽 ${u.paraLen.bottom}자` },
        { k: "45자 넘는 문단", got: m.over45, lo: 0, hi: Math.max(u.over45.top, g.over45.top) + 2, unit: "%" },
        { k: "굵게 (1,000자당)", got: m.boldPer1k, lo: u.bold.top - 1.5, hi: 99, unit: "번",
          note: `잘 되는 쪽 ${u.bold.top}번 / 덜 되는 쪽 ${u.bold.bottom}번` },
      ];

      const bad = rows.filter((r) => r.got < r.lo || r.got > r.hi);

      // ⚠️ 4.1 - 1.5 는 2.5999999999999996 이 됩니다. 컴퓨터가 소수를 그렇게 셉니다.
      // 화면에 그대로 나가면 사장님이 보시기에 그냥 고장난 것으로 보입니다.
      const num = (n) => (Number.isInteger(n) ? n : Math.round(n * 10) / 10);

      return `
        <h4>마무리 점검</h4>
        <p class="ws-dim">${esc(R.evidence ? R.evidence.method : "")}</p>
        <div class="ws-btnrow">
          ${["패션·뷰티", "연예·방송"].map((t) =>
            `<button class="ws-dock-btn ${t === topic ? "primary" : ""}" data-topic="${t}">${t}</button>`).join("")}
        </div>
        <table class="ws-check">
          ${rows.map((r) => {
            const off = r.got < r.lo || r.got > r.hi;
            const arrow = !off ? "✓" : r.got < r.lo ? "▲ 더" : "▼ 덜";
            return `<tr class="${off ? "off" : ""}">
              <td>${esc(r.k)}</td>
              <td class="num"><b>${num(r.got)}</b>${esc(r.unit)}</td>
              <td class="want">${r.hi === 99 ? `${num(r.lo)}${r.unit} 이상` : `${num(r.lo)}~${num(r.hi)}${r.unit}`}</td>
              <td class="mark">${arrow}</td>
            </tr>${r.note ? `<tr class="sub"><td colspan="4" class="ws-dim">${esc(r.note)}</td></tr>` : ""}`;
          }).join("")}
          <tr class="${spon ? "" : own < u.ownLinks.top ? "off" : ""}">
            <td>내 글 링크</td>
            <td class="num"><b>${own}</b>개</td>
            <td class="want">${spon ? "협찬은 예외" : `${u.ownLinks.top}개`}</td>
            <td class="mark">${spon ? "—" : own >= u.ownLinks.top ? "✓" : "▲ 더"}</td>
          </tr>
        </table>
        ${spon
          ? `<p class="ws-warn">협찬 글로 보입니다 ("${esc(spon)}"). 내 글 링크는 안 세었습니다.</p>`
          : own < u.ownLinks.top
            ? `<p class="ws-dim">→ <b>함께보기</b> 버튼으로 내 글 링크를 붙이실 수 있습니다.</p>` : ""}
        ${R.dontBother ? `<p class="ws-dim">안 넣어도 되는 것: ${esc(Object.keys(R.dontBother).join(", "))} — 상위 블로그 중앙값이 0이었습니다.</p>` : ""}
        <p class="${bad.length ? "ws-warn" : ""}">${
          bad.length
            ? `기준을 벗어난 것 <b>${bad.length}가지</b>: ${esc(bad.map((r) => r.k).join(", "))}`
            : "✅ 모두 기준 안에 있습니다."
        }</p>
        <div class="ws-btnrow">
          <button id="ws-save" class="ws-dock-btn primary">임시저장</button>
        </div>
        <p class="ws-dim" id="ws-save-msg">발행은 안 누릅니다. 임시저장만 합니다.</p>
      `;
    };

    const wire = (topic) => {
      showPanel(render(topic));
      panel.querySelectorAll("[data-topic]").forEach((b) => (b.onclick = () => wire(b.dataset.topic)));
      panel.querySelector("#ws-save").onclick = async (e) => {
        const I = window.__wsInsert;
        const msg = (t, cls = "ws-dim") => {
          const el = panel.querySelector("#ws-save-msg");
          if (el) { el.className = cls; el.textContent = t; }
        };
        if (!I || !I.saveDraft) return msg("저장 도구를 못 불러왔습니다.", "ws-err");
        e.target.disabled = true;
        msg("저장하는 중…");
        const r = await I.saveDraft();
        e.target.disabled = false;
        msg(r.ok ? `✅ 임시저장을 눌렀습니다. (${r.label})` : r.why, r.ok ? "ws-dim" : "ws-warn");
      };
    };
    wire(guess);
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
  async function homeTitle(force) {
    const title = getTitle();
    if (!title) {
      return showPanel(`<h4>홈판 제목</h4><div class="ws-row warn">
        제목을 먼저 쓰신 뒤에 눌러주세요.</div>`);
    }
    const body = getBodyText();

    // ⚠️ 사장님이 "두 번째 눌러도 또 분석한다"고 하셨습니다. 맞습니다.
    // 글이 그대로인데 10초를 또 기다리게 하고, AI 크레딧도 또 나갑니다.
    // 글이 안 바뀌었으면 아까 것을 그대로 보여드립니다.
    const key = cacheKey("title", title, body);
    const hit = !force && CACHE.get(key);
    if (hit) return renderTitles(hit, true);

    showPanel(`<h4>홈판 제목</h4><p>본문 ${body.length.toLocaleString()}자를 읽고 만드는 중입니다… 10초쯤 걸립니다.</p>`);
    try {
      const d = await server("/api/title-rewrite", { title, body: body.slice(0, 1500), count: 5 });
      CACHE.set(key, d);
      renderTitles(d, false);
    } catch (e) {
      showPanel(`<h4>홈판 제목</h4><div class="ws-row bad">${esc(e.message)}</div>
        <p class="ws-note">잠시 뒤에 다시 눌러주세요.</p>`);
    }
  }

  function renderTitles(d, cached) {
    {
      const dev = (o) =>
        [o.quoteStart && "따옴표", o.ellipsis && "말줄임표", o.curiosity && "궁금증", o.number && "숫자"]
          .filter(Boolean).map((x) => `<span class="ws-chip">${x}</span>`).join("") || `<span class="ws-chip dim">장치 없음</span>`;

      showPanel(`
        <h4>홈판 제목 후보</h4>
        ${cached ? `<div class="ws-row" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
          <span style="font-size:11.5px;opacity:.8">아까 뽑아둔 것입니다. 글이 그대로라 다시 안 돌렸습니다.</span>
          <button class="ws-mini" id="ws-title-again">새로 뽑기</button>
        </div>` : ""}
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
      const again = panel.querySelector("#ws-title-again");
      if (again) again.addEventListener("click", () => homeTitle(true));
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
    /**
     * ⚠️ 이 화면을 다시 만든 이유
     * 사장님이 "무슨 말인지 이해가 잘 안 된다"고 하셨습니다. 맞는 말씀입니다.
     *
     * 화면에 "제목이 약속한 **4**가 본문에 없습니다"라고 떴습니다.
     * '4'만 덩그러니 보여주니 그게 제목의 어느 부분인지 알 수가 없습니다.
     * 이제 **제목을 통째로 보여주고 그 말에 표시**합니다. 눈으로 바로 찾힙니다.
     * 그리고 무엇을 하라는 건지 한 줄로 먼저 적습니다.
     */
    const title = getTitle() || forTitle || "";
    // 제목에서 그 말을 찾아 색칠합니다.
    const marked = missing && title.includes(missing)
      ? esc(title).split(esc(missing)).join(
          `<b style="background:#fde9c8;color:#8a5a10;padding:1px 3px;border-radius:3px">${esc(missing)}</b>`)
      : esc(title);

    showPanel(`
      <h4>제목에 쓴 말이 본문에 없습니다</h4>

      <div class="ws-sec warn-sec">
        <div class="ws-sec-h">지금 제목</div>
        <div style="font-size:13.5px;line-height:1.7">${marked}</div>
        <p class="ws-sec-p" style="margin:8px 0 0">
          표시한 <b>"${esc(missing)}"</b>가 본문 어디에도 없습니다.
          이 말을 보고 들어온 사람이 본문에서 그 대목을 못 찾으면 바로 나갑니다.
          그건 클릭이 아니라 이탈이고, 홈피드는 그걸 봅니다.
        </p>
      </div>

      <div class="ws-sec">
        <div class="ws-sec-h">어떻게 하시겠어요?</div>
        <p class="ws-sec-p"><b>지어내지 않습니다.</b> 사실은 사장님이 주시거나 제가 찾아옵니다.</p>

        <div class="ws-choice">
          <div class="ws-choice-n">1</div>
          <div class="ws-choice-b">
            <div class="ws-choice-t">내용을 알고 계세요</div>
            <div class="ws-choice-d">아래에 적어주시면 본문 알맞은 자리에 넣어드립니다.</div>
            <textarea id="ws-fact" rows="3"
              placeholder="예) 아이라인을 눈꼬리·앞머리·아래·위 네 방향으로 얇게 그렸다"
              style="width:100%;margin-top:7px;padding:9px;font:inherit;font-size:13px;border:1px solid #e6e8ed;border-radius:8px;resize:vertical"></textarea>
            <button class="ws-apply" id="ws-fact-go" style="margin-top:7px">적은 내용으로 본문 채우기</button>
          </div>
        </div>

        <div class="ws-choice">
          <div class="ws-choice-n">2</div>
          <div class="ws-choice-b">
            <div class="ws-choice-t">모르시겠어요</div>
            <div class="ws-choice-d">뉴스와 상위 블로그를 읽어서 <b>출처와 함께</b> 보여드립니다.
              그중에서 고르시면 본문에 넣습니다. 30초쯤 걸립니다.</div>
            <button class="ws-apply" id="ws-fact-find" style="margin-top:7px">자료 찾아보기</button>
          </div>
        </div>

        <div class="ws-choice">
          <div class="ws-choice-n">3</div>
          <div class="ws-choice-b">
            <div class="ws-choice-t">그 말을 뺀 제목을 쓰세요</div>
            <div class="ws-choice-d">본문에 없는 걸 제목이 약속하는 것보다 낫습니다.
              앞 화면에서 다른 제목 후보를 고르시면 됩니다.</div>
            <button class="ws-apply" id="ws-fact-back" style="margin-top:7px">제목 후보로 돌아가기</button>
          </div>
        </div>
      </div>
    `);

    panel.querySelector("#ws-fact-go").onclick = () =>
      doFill(missing, panel.querySelector("#ws-fact").value.trim());
    panel.querySelector("#ws-fact-find").onclick = () => findFacts(missing, forTitle);
    panel.querySelector("#ws-fact-back").onclick = () => homeTitle();
  }

  /** 자료를 찾아옵니다. 출처를 그대로 보여줘야 사장님이 확인하실 수 있습니다. */
  async function findFacts(missing, forTitle, customTopic) {
    const topic = (customTopic || getTitle() || forTitle || "").slice(0, 40);
    showPanel(`<h4>자료 찾는 중</h4>
      <p>뉴스와 상위 블로그를 읽고 있습니다… 30초쯤 걸립니다.</p>
      <p class="ws-note">찾는 말: <b>${esc(topic)}</b></p>`);
    try {
      const d = await server("/api/research", { topic, angle: missing });
      const facts = d.facts || [];

      // ⚠️ 자료를 못 찾았을 때 "없습니다"만 띄우면 사장님이 무엇을 고쳐야 할지
      // 알 수가 없습니다. **무엇으로 찾아봤는지** 보여드리고, 직접 검색어를
      // 바꿔볼 수 있게 칸을 둡니다.
      if (!facts.length) {
        return showPanel(`
          <h4>쓸 만한 자료를 못 찾았습니다</h4>
          <div class="ws-sec warn-sec">
            <div class="ws-sec-h">이렇게 찾아봤습니다</div>
            <div style="font-size:12.5px;line-height:1.9">
              ${(d.tried || [esc(topic)]).map((t) => `· ${esc(t)}`).join("<br>")}
            </div>
          </div>
          <div class="ws-sec">
            <div class="ws-sec-h">검색어를 바꿔보시겠어요?</div>
            <p class="ws-sec-p">제목 그대로는 잘 안 나옵니다.
              <b>사람 이름이나 제품 이름</b>처럼 짧고 널리 쓰이는 말이 잘 나옵니다.</p>
            <input id="ws-res-q" type="text" value="${esc(topic)}"
              style="width:100%;padding:9px;font:inherit;font-size:13px;border:1px solid #e6e8ed;border-radius:8px" />
            <button class="ws-apply" id="ws-res-again" style="margin-top:7px">이 말로 다시 찾기</button>
          </div>
          <div class="ws-sec">
            <div class="ws-sec-h">아니면</div>
            <p class="ws-sec-p">자료가 없으면 본문은 그대로 두고,
              <b>"${esc(missing)}"가 빠진 제목</b>을 쓰시는 편이 안전합니다.</p>
            <button class="ws-apply" id="ws-res-back">제목 후보로 돌아가기</button>
          </div>
        `), wire();
      }

      showPanel(`
        <h4>찾았습니다 — ${facts.length}가지</h4>
        <div class="ws-sec">
          <div class="ws-sec-h">넣을 것을 고르세요
            <span class="ws-sec-tag check">복수 선택</span></div>
          <p class="ws-sec-p">자료에서 <b>실제로 확인된 것</b>만 있습니다. 지어낸 건 없습니다.
            대괄호 숫자는 아래 출처 번호입니다.</p>
          <label class="ws-fact-row" style="border-bottom:1px solid #eef0f3;padding-bottom:7px;margin-bottom:5px">
            <input type="checkbox" id="ws-fact-all" checked>
            <span><b>전부 고르기</b></span>
          </label>
          ${facts.map((f, i) => `
            <label class="ws-fact-row">
              <input type="checkbox" data-fact="${esc(f.text)}" ${i < 3 ? "checked" : ""}>
              <span>${esc(f.text)} <em>[${f.source}]</em></span>
            </label>`).join("")}
        </div>
        ${d.missing && d.missing.length ? `<div class="ws-sec warn-sec">
          <div class="ws-sec-h">자료에도 없는 것 <span class="ws-sec-tag check">확인 필요</span></div>
          <p class="ws-sec-p">이건 못 찾았습니다. 쓰시려면 사장님이 확인하셔야 합니다.</p>
          <div style="font-size:12.5px;line-height:1.8">${d.missing.map((m) => `· ${esc(m)}`).join("<br>")}</div>
        </div>` : ""}
        <button class="ws-apply" id="ws-fact-use" style="margin-top:4px">고른 것으로 본문 채우기</button>
        <details class="ws-preview" style="margin-top:9px"><summary>출처 ${(d.sources || []).length}건 보기</summary>
          <div style="font-size:12px;line-height:1.8">
            ${(d.sources || []).map((s) => `[${s.n}] (${esc(s.kind)}) ${s.url
              ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`
              : esc(s.title)}`).join("<br>")}
          </div></details>
        <p class="ws-dim">${esc(d.note || "")}</p>
      `);

      // 전부 고르기 — 하나라도 끄면 같이 풀립니다.
      const all = panel.querySelector("#ws-fact-all");
      const boxes = [...panel.querySelectorAll("[data-fact]")];
      const sync = () => { all.checked = boxes.every((b) => b.checked); };
      all.onchange = () => boxes.forEach((b) => (b.checked = all.checked));
      boxes.forEach((b) => b.addEventListener("change", sync));
      sync();

      panel.querySelector("#ws-fact-use").onclick = () => {
        const picked = boxes.filter((b) => b.checked).map((b) => b.dataset.fact);
        if (!picked.length) return alert("넣을 것을 하나 이상 고르세요.");
        doFill(missing, picked.join("\n"));
      };
    } catch (e) {
      showPanel(`<h4>자료 찾기</h4><div class="ws-row bad">${esc(e.message)}</div>
        <p class="ws-dim">자료를 못 찾으면 본문은 그대로 두고, 그 말이 빠진 제목을 고르시는 편이 안전합니다.</p>`);
    }

    function wire() {
      const again = panel.querySelector("#ws-res-again");
      if (again) again.onclick = () =>
        findFacts(missing, forTitle, panel.querySelector("#ws-res-q").value.trim());
      const back = panel.querySelector("#ws-res-back");
      if (back) back.onclick = () => homeTitle();
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

  async function homeBody(force) {
    const body = getBodyText();
    if (body.length < 200) {
      return showPanel(`<h4>홈판 본문</h4><div class="ws-row warn">
        본문이 ${body.length}자입니다. 200자 이상 쓰신 뒤에 눌러주세요.</div>`);
    }
    // 글이 그대로면 아까 것을 그대로 보여드립니다 (제목과 같은 이유).
    const key = cacheKey("body", getTitle(), body);
    const hit = !force && CACHE.get(key);
    if (hit) { lastBody = hit.body; return renderBody(hit, true); }

    showPanel(`<h4>홈판 본문</h4><p>${body.length.toLocaleString()}자를 여섯 토막으로 나누는 중입니다…
      30초에서 1분쯤 걸립니다. 창을 닫지 마세요.</p>`);
    try {
      const d = await server("/api/body-rewrite", { body, title: getTitle() });
      CACHE.set(key, d);
      lastBody = d.body;
      renderBody(d, false);
    } catch (e) {
      showPanel(`<h4>홈판 본문</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  function renderBody(d, cached) {
    {
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
        ${cached ? `<div class="ws-row" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
          <span style="font-size:11.5px;opacity:.8">아까 다듬어둔 것입니다. 글이 그대로라 다시 안 돌렸습니다.</span>
          <button class="ws-mini" id="ws-body-again">새로 다듬기</button>
        </div>` : ""}

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
            <span class="ws-sec-tag check">고르면 넣어드립니다</span></div>
          <p class="ws-sec-p">고르신 것만 <b>자료를 찾아서</b> 본문에 넣습니다.
            찾은 자료에 없으면 안 넣습니다 — <b>지어내지 않습니다.</b></p>
          <label class="ws-fact-row" style="border-bottom:1px solid #eef0f3;padding-bottom:7px;margin-bottom:5px">
            <input type="checkbox" id="ws-sug-all">
            <span><b>전부 고르기</b></span>
          </label>
          ${d.suggestions.map((s, i) => `
            <label class="ws-fact-row">
              <input type="checkbox" data-sug="${esc(s)}">
              <span>${esc(s)}</span>
            </label>`).join("")}
          <button class="ws-apply" id="ws-sug-go" style="margin-top:8px">고른 것 본문에 넣기</button>
          <p class="ws-dim" style="margin:7px 0 0">
            자료를 찾는 데 고른 개수만큼 시간이 걸립니다. 하나에 30초쯤입니다.</p>
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
      const again = panel.querySelector("#ws-body-again");
      if (again) again.addEventListener("click", () => homeBody(true));

      // ── 더 쓰시면 좋을 것 — 골라서 한 번에 넣기 ──
      const sugAll = panel.querySelector("#ws-sug-all");
      if (sugAll) {
        const boxes = [...panel.querySelectorAll("[data-sug]")];
        sugAll.onchange = () => boxes.forEach((b) => (b.checked = sugAll.checked));
        boxes.forEach((b) => b.addEventListener("change", () => {
          sugAll.checked = boxes.every((x) => x.checked);
        }));
        panel.querySelector("#ws-sug-go").onclick = () => {
          const picked = boxes.filter((b) => b.checked).map((b) => b.dataset.sug);
          if (!picked.length) return alert("넣을 것을 하나 이상 고르세요.");
          fillSuggestions(picked);
        };
      }
    }
  }

  /**
   * 고른 제안들을 자료로 채워 본문에 넣습니다.
   *
   * ⚠️ 제안은 "이런 내용이 더 있으면 좋다"는 말이지 **내용 자체가 아닙니다.**
   * 그냥 넣으면 "카리나가 이 메이크업을 한 구체적인 일정이나 행사명"이라는
   * 문장이 본문에 박힙니다. 그건 글이 아닙니다.
   * 그래서 제안마다 **자료를 찾아서** 실제 사실을 채운 뒤에 넣습니다.
   * 자료에 없으면 그 제안은 건너뜁니다. 지어내지 않습니다.
   */
  async function fillSuggestions(picked) {
    const title = getTitle();
    const found = [];
    const skipped = [];

    for (let i = 0; i < picked.length; i++) {
      const s = picked[i];
      showPanel(`<h4>자료 찾는 중 (${i + 1}/${picked.length})</h4>
        <p>${esc(s)}</p>
        <p class="ws-note">찾은 것 ${found.length}가지 · 못 찾은 것 ${skipped.length}가지</p>`);
      try {
        const d = await server("/api/research", { topic: title, angle: s });
        const facts = (d.facts || []).slice(0, 3);
        if (facts.length) found.push({ ask: s, facts, sources: d.sources || [] });
        else skipped.push({ ask: s, why: "자료에서 확인된 사실이 없었습니다." });
      } catch (e) {
        skipped.push({ ask: s, why: e.message });
      }
    }

    if (!found.length) {
      return showPanel(`<h4>넣을 것을 못 찾았습니다</h4>
        <div class="ws-sec warn-sec">
          <p class="ws-sec-p">고르신 ${picked.length}가지 모두 자료에서 확인이 안 됐습니다.
            <b>확인 안 된 걸 넣으면 글 전체가 거짓이 됩니다.</b> 그래서 안 넣었습니다.</p>
          <div style="font-size:12.5px;line-height:1.8">
            ${skipped.map((x) => `· ${esc(x.ask)}<br><span style="opacity:.7">&nbsp;&nbsp;${esc(x.why)}</span>`).join("<br>")}
          </div>
        </div>
        <p class="ws-dim">사장님이 아시는 내용이면 직접 적어 넣으실 수 있습니다.</p>`);
    }

    // 찾은 것을 보여주고, 확인하신 뒤에 넣습니다.
    showPanel(`
      <h4>이만큼 찾았습니다</h4>
      <div class="ws-sec">
        <div class="ws-sec-h">넣을 내용 <span class="ws-sec-tag check">확인하고 넣으세요</span></div>
        <p class="ws-sec-p">자료에서 확인된 것만 있습니다. 빼실 게 있으면 체크를 풀어주세요.</p>
        ${found.map((g) => `
          <div style="margin-bottom:10px">
            <div style="font-size:12px;opacity:.7;margin-bottom:4px">${esc(g.ask)}</div>
            ${g.facts.map((f) => `
              <label class="ws-fact-row">
                <input type="checkbox" data-fact="${esc(f.text)}" checked>
                <span>${esc(f.text)} <em>[${f.source}]</em></span>
              </label>`).join("")}
          </div>`).join("")}
      </div>
      ${skipped.length ? `<div class="ws-sec warn-sec">
        <div class="ws-sec-h">못 찾아서 뺀 것 ${skipped.length}가지</div>
        <div style="font-size:12.5px;line-height:1.8">${skipped.map((x) => `· ${esc(x.ask)}`).join("<br>")}</div>
      </div>` : ""}
      <button class="ws-apply" id="ws-sugfill-go">본문에 넣기</button>
    `);

    panel.querySelector("#ws-sugfill-go").onclick = () => {
      const picked2 = [...panel.querySelectorAll("[data-fact]:checked")].map((c) => c.dataset.fact);
      if (!picked2.length) return alert("넣을 것을 하나 이상 고르세요.");
      doFill(found.map((g) => g.ask).join(", "), picked2.join("\n"));
    };
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
  /**
   * 워드로 내려받기 — 글과 사진만, 화면 부스러기 없이.
   *
   * ⚠️ 처음 판은 편집기 화면을 통째로 복제해 담았습니다. 그랬더니 워드에
   * "대표사진 삭제", "AI 활용 설정", "스마트렌즈 분석" 같은 **편집기 단추
   * 글자까지** 들어가고, 사진은 네이버 로그인 주소라 전부 "표시할 수 없음"으로
   * 깨졌습니다 (2026-08-28 사장님 실사용에서 확인).
   *
   * 그래서 거르는 게 아니라 **골라 담습니다**: 글 문단(.se-text-paragraph)과
   * 사진만. 단추·안내 문구는 문단 밖에 살아서 자연히 안 담깁니다.
   * 사진은 이 화면(로그인 상태)에서 받아 **파일 안에 심어서** 어디서 열어도 보입니다.
   */
  async function downloadWord() {
    const title = getTitle() || "블로그 원고";
    const root = getEditorRoot();
    if (!root) return showPanel(`<div class="ws-row warn">본문을 찾지 못했습니다.</div>`);

    showPanel(`<h4>워드로 내려받기</h4><div class="ws-row">글과 사진을 모으는 중…</div>`);

    const parts = [];
    let imgOk = 0, imgFail = 0;
    const comps = root.querySelectorAll(":scope .se-component, :scope > div");
    // 컴포넌트 단위가 안 잡히는 판도 있어 실패하면 문단 전체로 갑니다.
    const list = comps.length ? [...comps] : [root];

    for (const comp of list) {
      if (comp.closest(".se-documentTitle")) continue;

      // 사진 — 로그인된 이 화면에서 받아 파일 안에 심습니다.
      for (const img of comp.querySelectorAll("img.se-image-resource, .se-image-resource")) {
        const src = img.currentSrc || img.src;
        if (!src) continue;
        try {
          const blob = await fetch(src, { credentials: "include" }).then((r) => {
            if (!r.ok) throw new Error(r.status);
            return r.blob();
          });
          const dataUri = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          });
          parts.push(`<p><img src="${dataUri}" style="max-width:100%"></p>`);
          imgOk++;
        } catch {
          parts.push(`<p>[사진: 여기 — 내려받지 못해 자리만 남깁니다]</p>`);
          imgFail++;
        }
      }

      // 글 문단 — 안내 문구(글감)는 빼고, 인용구는 인용 모양으로.
      const I = window.__wsInsert;
      for (const p of comp.querySelectorAll(".se-text-paragraph")) {
        const t = (p.innerText || "").trim();
        if (!t) continue;
        // 글감 안내 문구는 원고가 아닙니다 (draft-insert의 판별과 같은 결).
        if (/(기다립니다|남겨보세요|기록해\s*보세요|들려주세요|적어보세요)\.?\s*#/.test(t)) continue;
        const isQuote = !!p.closest(".se-quotation");
        // 굵게 등 서식은 살리되, 네이버 잡동사니 속성은 워드가 알아서 무시합니다.
        parts.push(isQuote ? `<blockquote>${p.innerHTML}</blockquote>` : `<p>${p.innerHTML}</p>`);
      }
    }

    if (!parts.length) {
      return showPanel(`<h4>워드로 내려받기</h4><div class="ws-row warn">담을 글을 못 찾았습니다.</div>`);
    }

    const html =
      `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
      `<title>${esc(title)}</title>` +
      `<style>body{font-family:'Malgun Gothic',sans-serif;line-height:1.7}` +
      `blockquote{border-left:3px solid #999;margin:12px 0;padding:6px 14px;color:#444}</style>` +
      `</head><body><h1>${esc(title)}</h1>${parts.join("\n")}</body></html>`;

    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60)}.doc`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);

    showPanel(`<h4>워드로 내려받기</h4>
      <div class="ws-row good">내려받았습니다 — 문단과 사진만 담았습니다.</div>
      <p class="ws-dim">사진 ${imgOk}장은 파일 안에 심어서 어디서 열어도 보입니다.${imgFail ? ` ${imgFail}장은 못 받아 자리만 남겼습니다.` : ""}<br>
      워드가 "제한된 보기"로 열면 위쪽 <b>편집 사용</b>을 눌러주세요.</p>`);
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

  // ── 클로드 원고 붙이기 ────────────────────────────────
  //
  // ⚠️ 왜 만들었나
  // 사장님은 Claude Pro Max 구독을 쓰십니다. claude.ai나 Claude Code에서 원고를 쓰면
  // **API 값이 0원**입니다. 우수리미 사이트에서 뽑으면 한 편에 740원씩 나갑니다.
  // 그런데 클로드에서 쓰면 편집기로 옮기는 게 손일이었습니다.
  // 그 손일을 없애면 공짜로 쓰면서 손도 안 갑니다.
  //
  // ⚠️ 이 기능은 AI를 안 부릅니다. 값이 0원입니다.
  /**
   * 원고를 붙여넣을 칸을 띄웁니다.
   *
   * ⚠️ 왜 필요한가 — 사장님이 "클립보드를 못 읽었습니다"를 보셨습니다.
   * 그때 저는 "다시 눌러주세요"라고만 했는데, **다시 눌러도 안 됩니다.**
   * 막힌 이유가 그대로니까요. 브라우저가 클립보드 읽기를 막는 경우가 여럿입니다:
   *   · 창이 포커스를 잃었을 때 (다른 탭에서 복사하고 오면 자주 그렇습니다)
   *   · 권한 물음을 한 번 거절했을 때
   *   · 네이버 편집기가 iframe 안이라 권한이 안 넘어올 때
   *
   * 칸을 주고 Ctrl+V 하시게 하면 **권한이 아예 필요 없습니다.** 항상 됩니다.
   * 발행큐에서 "서식 복사" 누르고 오시는 흐름도 이걸로 풀립니다.
   */
  function askPasteBox(why) {
    showPanel(`
      <h4>원고 붙이기</h4>
      ${why ? `<div class="ws-row warn">${esc(why)}</div>` : ""}
      <p class="ws-note">아래 칸을 누르고 <b>Ctrl+V</b> 하세요. 붙이시면 바로 읽습니다.</p>
      <textarea id="ws-pd-box" placeholder="여기에 Ctrl+V"
        style="width:100%;min-height:120px;padding:10px;border:1px solid #d7dae0;border-radius:8px;
               font:inherit;font-size:13px;line-height:1.6;resize:vertical"></textarea>
      <p class="ws-dim" style="margin:6px 0 0">클로드나 발행큐에서 원고를 복사한 뒤 여기에 붙이시면 됩니다.</p>
    `);
    const box = panel.querySelector("#ws-pd-box");
    box.focus();
    const take = () => {
      // 붙여넣기 직후엔 값이 아직 안 들어와 있습니다. 다음 순간에 읽습니다.
      setTimeout(() => {
        const v = box.value || "";
        if (v.trim().length >= 50) showDraft(v);
      }, 60);
    };
    box.addEventListener("paste", take);
    box.addEventListener("input", take);
  }

  async function pasteDraft() {
    const P = window.__wsDraft;
    const I = window.__wsInsert;
    if (!P || !I) {
      return showPanel(`<h4>원고 붙이기</h4><div class="ws-row bad">
        도구를 못 불러왔습니다. 확장을 다시 설치해 보세요.</div>`);
    }

    // ⚠️ 클립보드는 사용자가 누른 직후에만 읽을 수 있습니다. 버튼 누른 흐름에서 바로 읽습니다.
    // 되면 제일 편하고, 안 되면 칸을 드립니다. 되는 척하지 않습니다.
    let raw = "";
    try {
      // 창이 뒤에 있으면 읽기가 막힙니다. 먼저 앞으로 부릅니다.
      try { window.focus(); } catch {}
      raw = await navigator.clipboard.readText();
    } catch {
      return askPasteBox("클립보드를 못 읽었습니다. 브라우저가 막았습니다.");
    }
    if (!raw || raw.trim().length < 50) {
      return askPasteBox("복사된 글이 없거나 너무 짧습니다.");
    }
    showDraft(raw);
  }

  /** 원고를 읽어 무엇을 넣을지 보여줍니다. 클립보드로 왔든 칸으로 왔든 여기로 모입니다. */
  function showDraft(raw) {
    const P = window.__wsDraft;
    const I = window.__wsInsert;
    const draft = P.parse(raw);
    const s = draft.stats;
    const state = I.isEmpty();

    showPanel(`
      <h4>원고를 이렇게 넣겠습니다</h4>
      <div class="ws-stats">
        <span>본문 <b>${s.chars.toLocaleString()}</b>자</span>
        <span>문단 <b>${s.paras}</b></span>
        <span>소제목 <b class="ws-up">${s.subheads}</b></span>
        <span>인용구 <b class="ws-up">${s.quotes}</b></span>
        <span>사진자리 <b class="ws-up">${s.photos}</b></span>
        <span>굵게 <b>${s.marks}</b></span>
      </div>

      <div class="ws-sec">
        <div class="ws-sec-h">제목</div>
        <div style="font-size:13.5px;font-weight:600">${esc(draft.title) || '<span class="ws-dim">(못 찾았습니다)</span>'}</div>
      </div>

      ${!state.empty ? `
      <div class="ws-sec warn-sec">
        <div class="ws-sec-h">잠깐 — 본문에 글이 있어 보입니다
          <span class="ws-sec-tag check">확인 필요</span></div>
        <p class="ws-sec-p">지금 <b>${state.chars.toLocaleString()}자</b>${state.media ? `, 사진·링크 ${state.media}개` : ""}로 셌습니다.
          <b>덮어쓰면 되돌릴 수 없습니다.</b></p>
        ${state.sample && state.sample.length ? `
        <p class="ws-sec-p" style="margin-top:6px">제가 글이라고 본 것:</p>
        <ul style="margin:4px 0 0 16px;padding:0;font-size:12.5px;color:#5a5f6b">
          ${state.sample.map((t) => `<li>${esc(t)}${t.length >= 40 ? "…" : ""}</li>`).join("")}
        </ul>
        <p class="ws-sec-p" style="margin-top:6px">
          ⚠️ 이게 <b>사장님이 쓰신 글이 아니라 네이버가 띄운 안내 문구</b>라면
          아래 <b>그래도 넣기</b>를 눌러주세요. 제가 잘못 센 것입니다.</p>` : ""}
      </div>` : ""}

      <div class="ws-sec">
        <div class="ws-sec-h">문단 길이 확인
          <span class="ws-sec-tag ${s.over45 <= 10 ? "ok" : "check"}">${s.over45}%</span></div>
        <p class="ws-sec-p">45자 넘는 문단이 <b>${s.over45}%</b>입니다.
          잘 되는 블로그는 1~5%입니다. 중앙 ${s.paraMedian}자.</p>
      </div>

      <button class="ws-apply" id="ws-pd-go" style="margin:10px 0 4px;font-size:13px;padding:8px 14px">넣기</button>
      ${!state.empty ? `
      <button class="ws-dock-btn" id="ws-pd-force"
        style="margin:10px 0 4px 6px;font-size:12.5px;padding:8px 12px">그래도 넣기</button>` : ""}
      <p class="ws-dim" style="margin:2px 0 0">
        제목은 자동으로 넣습니다. 본문은 편집기가 안 받으면 <b>복사해 드리고 Ctrl+V</b>를 부탁드립니다 —
        억지로 밀어넣다 글이 뭉개지는 것보다 그게 확실합니다.
      </p>
      <label style="display:block;margin-top:8px;font-size:12px;color:#5a5f6b">
        <input type="checkbox" id="ws-pd-save" checked style="width:auto"> 다 넣고 <b>임시저장</b>까지
      </label>
      <div id="ws-pd-out"></div>
    `);

    const go = panel.querySelector("#ws-pd-go");
    const forceBtn = panel.querySelector("#ws-pd-force");

    /**
     * @param force 사장님이 "그래도 넣기"를 직접 누르셨는가.
     *
     * ⚠️ 제 판정이 틀릴 수 있어서 둔 길입니다. 실제로 네이버 안내 문구를
     * 사장님 글로 잘못 세서 넣기를 막은 적이 있습니다(27자 사건).
     * 그때 사장님은 지울 글도 없는데 아무것도 못 하셨습니다.
     */
    const run = (btn, force) => async () => {
      if (go) go.disabled = true;
      if (forceBtn) forceBtn.disabled = true;
      const out = panel.querySelector("#ws-pd-out");
      const say = (m) => { btn.textContent = m; out.innerHTML = `<div class="ws-row">${esc(m)}</div>`; };

      const r = await I.insert(draft, say, { force });
      if (!r.ok) {
        // ⚠️ 본문 자동 넣기는 접었습니다(draft-insert.js 설명 참고).
        // 대신 깨끗하게 다듬어 클립보드에 담아드리고, Ctrl+V 한 번 하시게 합니다.
        // 편집기가 붙여넣기를 스스로 처리하면 문단이 정확히 나뉩니다.
        out.innerHTML = r.copied ? `
          <div class="ws-sec">
            <div class="ws-sec-h">이제 두 단계만 하시면 됩니다
              <span class="ws-sec-tag auto">복사해 뒀습니다</span></div>
            <p class="ws-sec-p">
              <b>1.</b> 본문 칸을 클릭하고 <b>Ctrl+V</b><br>
              <b>2.</b> 아래 <b>자동 서식</b> 버튼<br>
              그러면 소제목·인용구·굵게가 들어가고 임시저장까지 합니다.
            </p>
            <button class="ws-apply" id="ws-pd-fmt">붙여넣었어요 — 서식 넣기</button>
          </div>
          ${r.done.length ? `<div class="ws-row good">${r.done.map(esc).join(" · ")}는 넣었습니다.</div>` : ""}
          ${/\(진단:/.test(r.why || "") ? `<p class="ws-dim">${esc((r.why.match(/\(진단:[^)]+\)/) || [""])[0])} — 이 문구를 캡처해 주시면 원인을 좁힐 수 있습니다.</p>` : ""}
        ` : `<div class="ws-row bad">${esc(r.why)}</div>`;
        go.textContent = "다시";
        go.disabled = false;
        /**
         * ⚠️ 여기가 사장님을 가뒀던 버그입니다.
         * 시작할 때 두 버튼을 다 잠그는데, 실패하면 **넣기만 다시 살렸습니다.**
         * "그래도 넣기"는 회색인 채로 죽어 있었습니다 — 탈출구를 만들어놓고
         * 문을 잠근 셈입니다. 거절된 다음이야말로 그 버튼이 필요한 순간인데요.
         */
        if (forceBtn) forceBtn.disabled = false;
        const fb = out.querySelector("#ws-pd-fmt");
        /**
         * ⚠️ 예전엔 여기서 runFormat()(일반 자동 서식, ■를 찾음)을 불렀습니다.
         * 그런데 붙여넣은 본문에는 ■가 이미 벗겨져 있어서 아무것도 안 입혀졌습니다
         * (2026-08-28 실사용에서 확인). 원고(draft)가 소제목·인용구·굵게 위치를
         * 이미 아니까, 그 지식으로 입히는 applyStructure를 부릅니다.
         */
        if (fb) fb.addEventListener("click", async () => {
          /**
           * ⚠️ 본문이 비어 있으면 서식 넣기가 헛돕니다("0군데 완료·8군데 실패").
           * 사장님이 Ctrl+V 전에 이 버튼을 누르는 일이 실제로 두 번 있었습니다 —
           * 순서 실수는 사람이 아니라 화면이 막아야 합니다.
           */
          const now = I.isEmpty();
          if (now.empty) {
            fb.textContent = "붙여넣었어요 — 서식 넣기";
            out.insertAdjacentHTML("beforeend",
              `<div class="ws-row warn">본문이 아직 비어 있습니다. <b>본문 칸을 클릭하고 Ctrl+V</b> 먼저 해주세요 — 글자가 보이면 그때 이 버튼입니다.</div>`);
            return;
          }
          fb.disabled = true;
          fb.textContent = "서식 넣는 중…";
          const st = await I.applyStructure(draft, (m) => (fb.textContent = m));
          let saved = null;
          if (panel.querySelector("#ws-pd-save") && panel.querySelector("#ws-pd-save").checked) {
            fb.textContent = "임시저장 중…";
            saved = await I.saveDraft();
          }
          fb.textContent = `서식 ${st.done.length}군데 넣었습니다`;
          out.insertAdjacentHTML("beforeend", `
            <div class="ws-row ${st.failed.length ? "warn" : "good"}">
              서식 <b>${st.done.length}군데</b> 완료${st.failed.length ? ` · ${st.failed.length}군데 실패` : ""}
              ${saved ? (saved.ok ? " · 임시저장됨" : ` · ${esc(saved.why)}`) : ""}
            </div>
            ${st.failed.length ? `<div class="ws-dim" style="font-size:11.5px">${st.failed.map((f) => esc(f.what)).join(", ")}는 직접 해주세요.</div>` : ""}`);
          scheduleCount();
        });
        return;
      }

      let saved = null;
      if (panel.querySelector("#ws-pd-save").checked) {
        say("임시저장 중…");
        saved = await I.saveDraft();
      }

      go.textContent = `${r.done.length}군데 넣었습니다`;
      scheduleCount();
      out.innerHTML = `
        <div class="ws-row ${r.failed.length ? "warn" : "good"}">
          <b>${r.done.length}군데 넣었습니다.</b>${r.failed.length ? ` ${r.failed.length}군데는 못 넣었습니다.` : ""}
        </div>
        ${saved ? `<div class="ws-row ${saved.ok ? "good" : "warn"}">
          ${saved.ok ? "임시저장했습니다." : esc(saved.why)}</div>` : ""}
        ${r.photoSlots ? `<div class="ws-sec">
          <div class="ws-sec-h">사진 ${r.photoSlots}곳 <span class="ws-sec-tag check">직접 넣으세요</span></div>
          <p class="ws-sec-p">본문에 <b>[사진: 무엇]</b> 이라고 적어뒀습니다.
            어떤 사진인지는 사장님만 아시니 제가 대신 못 넣습니다.
            그 자리를 눌러 사진으로 바꿔주세요.</p>
        </div>` : ""}
        ${r.failed.length ? `<div class="ws-sec warn-sec">
          <div class="ws-sec-h">못 넣은 것</div>
          <p class="ws-sec-p">이건 직접 하셔야 합니다. 되는 척하지 않겠습니다.</p>
          <div style="font-size:12px;line-height:1.8">
            ${r.failed.map((f) => `· ${esc(f.what)}<br><span style="opacity:.7">&nbsp;&nbsp;${esc(f.why)}</span>`).join("<br>")}
          </div>
        </div>` : ""}`;
    };

    // 두 버튼이 같은 일을 합니다. 다른 건 force 하나뿐입니다.
    if (go) go.addEventListener("click", run(go, false));
    if (forceBtn) forceBtn.addEventListener("click", run(forceBtn, true));

    /**
     * ⚠️ 빈 편집기면 **묻지 않고 바로** 넣습니다 (사장님 요청, 2026-08-28 —
     * "저 화면 안 뜨고 바로 붙여지게"). 빈 문서에 넣는 건 잃을 게 없어서 안전합니다.
     * 글이 이미 있으면 덮어쓰기 = 되돌릴 수 없으므로, 그때만 확인을 받습니다.
     * 패널은 그대로 떠서 진행 상황·결과를 보여줍니다 — 조용히 사라지는 게 아니라
     * "넣는 중 → 넣었습니다"로 바뀝니다.
     */
    if (state.empty && go) go.click();
  }

  // ── 자동 서식 (소제목·인용구·강조) ─────────────────────
  //
  // ⚠️ 이 기능은 **사장님 글에 직접 손을 댑니다.** 그래서 두 가지를 지킵니다.
  //   1) 무엇을 할지 먼저 보여드리고, 누르셔야 넣습니다. 몰래 안 바꿉니다.
  //   2) 하나가 실패해도 나머지는 넣습니다. 그리고 뭐가 안 됐는지 말합니다.
  //
  // ⚠️ 소제목은 글자 크기가 아니라 **문단 스타일**입니다.
  // 클로드 원고를 붙여넣으면 "■ 소제목"이 그냥 본문으로 들어갑니다.
  // 편집기 왼쪽 위 드롭다운에서 골라야 진짜 소제목이 됩니다. 그걸 대신 눌러줍니다.
  async function runFormat() {
    const F = window.__wsFormat;
    if (!F) {
      return showPanel(`<h4>자동 서식</h4><div class="ws-row bad">
        서식 도구를 못 불러왔습니다. 확장을 다시 설치해 보세요.</div>`);
    }

    const body = getBodyText();
    const title = getTitle();
    if (body.replace(/\s/g, "").length < 150) {
      return showPanel(`<h4>자동 서식</h4><div class="ws-row warn">
        본문이 짧습니다. 150자 이상 쓰신 뒤에 눌러주세요.</div>`);
    }

    // 글이 그대로면 아까 것을 씁니다 (제목·본문과 같은 이유).
    const key = cacheKey("fmt", title, body);
    const hit = CACHE.get(key);
    if (hit) return renderFormat(hit, true);

    showPanel(`<h4>자동 서식</h4><p>본문 ${body.length.toLocaleString()}자를 읽고
      강조할 자리를 고르는 중입니다… 10초쯤 걸립니다.</p>`);
    try {
      const d = await server("/api/emphasis", { title, body });
      CACHE.set(key, d);
      renderFormat(d, false);
    } catch (e) {
      showPanel(`<h4>자동 서식</h4><div class="ws-row bad">${esc(e.message)}</div>`);
    }
  }

  function renderFormat(d, cached) {
    const kindColor = { bold: "#17181c", underline: "#1a4ba0", highlight: "#8a5a10", color: "#b0201f" };
    const total = d.marks.length + d.quotes.length + d.subheads.length;

    showPanel(`
      <h4>자동 서식 — ${total}군데</h4>
      ${cached ? `<div class="ws-row" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <span style="font-size:11.5px;opacity:.8">아까 골라둔 것입니다. 글이 그대로라 다시 안 돌렸습니다.</span>
        <button class="ws-mini" id="ws-fmt-again">새로 고르기</button>
      </div>` : ""}

      <div class="ws-stats">
        <span>소제목 <b class="ws-up">${d.subheads.length}</b></span>
        <span>인용구 <b class="ws-up">${d.quotes.length}</b></span>
        <span>강조 <b class="ws-up">${d.marks.length}</b></span>
        <span>본문 <b>${d.chars.toLocaleString()}</b>자</span>
      </div>

      <button class="ws-apply" id="ws-fmt-go" style="margin:10px 0 4px;font-size:13px;padding:8px 14px">
        전부 넣기 (${total}군데)
      </button>
      <p class="ws-dim" style="margin:0 0 14px">
        하나씩 넣습니다. 실패한 것은 건너뛰고 뭐가 안 됐는지 알려드립니다.
      </p>

      ${d.subheads.length ? `
      <div class="ws-sec">
        <div class="ws-sec-h">1 · 소제목 ${d.subheads.length}개
          <span class="ws-sec-tag auto">문단 스타일</span></div>
        <p class="ws-sec-p">원고의 <b>■ 표시</b>가 붙은 줄입니다. 붙여넣기만 하면 그냥 본문이라,
          편집기 드롭다운에서 <b>소제목</b>으로 바꿔줍니다. 글자 크기 ${d.subheadSize}로 나옵니다.</p>
        <div class="ws-subheads">
          ${d.subheads.map((s, i) => `<div><b>${i + 1}</b> ${esc(s.text)}</div>`).join("")}
        </div>
      </div>` : ""}

      ${d.quotes.length ? `
      <div class="ws-sec">
        <div class="ws-sec-h">2 · 인용구 ${d.quotes.length}개
          <span class="ws-sec-tag auto">문단 스타일</span></div>
        <p class="ws-sec-p">스크롤하다 눈이 멈추는 자리입니다. 글에서 딱 기억할 한 줄만 씁니다.</p>
        ${d.quotes.map((q) => `<div style="padding:7px 0;border-bottom:1px solid #f0f1f4">
          <div style="font-size:13px;font-weight:600">${esc(q.text)}</div>
          <div style="font-size:11.5px;opacity:.7;margin-top:2px">${esc(q.why)}</div>
        </div>`).join("")}
      </div>` : ""}

      ${d.marks.length ? `
      <div class="ws-sec">
        <div class="ws-sec-h">3 · 강조 ${d.marks.length}군데</div>
        <p class="ws-sec-p">잘 되는 블로그를 세어보니 1,000자에
          굵게 ${d.measured.winner.bold} · 밑줄 ${d.measured.winner.underline} ·
          배경색 ${d.measured.winner.highlight} · 글자색 ${d.measured.winner.color}번입니다.
          그 비율로 맞췄습니다.</p>
        ${d.marks.map((m) => `<div style="padding:6px 0;border-bottom:1px solid #f0f1f4">
          <span style="font-size:10.5px;font-weight:700;color:${kindColor[m.kind]};
            border:1px solid ${kindColor[m.kind]};border-radius:4px;padding:1px 5px">${esc(m.label)}</span>
          <b style="margin-left:6px">${esc(m.text)}</b>
          <div style="font-size:11.5px;opacity:.7;margin-top:2px">${esc(m.why)}</div>
        </div>`).join("")}
      </div>` : ""}

      ${d.dropped && d.dropped.length ? `
      <details style="margin-top:10px">
        <summary class="ws-dim" style="cursor:pointer;font-size:12px">
          AI가 줬지만 뺀 것 ${d.dropped.length}개</summary>
        <div style="font-size:11.5px;line-height:1.8;margin-top:6px;opacity:.8">
          ${d.dropped.slice(0, 8).map((x) => `· "${esc(x.phrase)}" — ${esc(x.why)}`).join("<br>")}
        </div>
      </details>` : ""}

      <div id="ws-fmt-out"></div>
    `);

    const again = panel.querySelector("#ws-fmt-again");
    if (again) again.addEventListener("click", () => { CACHE.delete(cacheKey("fmt", getTitle(), getBodyText())); runFormat(); });

    panel.querySelector("#ws-fmt-go").addEventListener("click", (e) => applyFormat(d, e.target));
  }

  /** 실제로 넣습니다. 하나씩, 확인하면서. */
  async function applyFormat(d, btn) {
    const F = window.__wsFormat;
    const out = panel.querySelector("#ws-fmt-out");
    btn.disabled = true;

    const root = getEditorRoot();
    if (!root) { out.innerHTML = `<div class="ws-row bad">본문을 못 찾았습니다.</div>`; return; }

    const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
    const paras = () => [...root.querySelectorAll(".se-text-paragraph")].filter(
      (n) => !n.closest(SKIP) && !n.closest(".se-documentTitle") && !n.closest(".se-placeholder")
    );

    const done = [];
    const failed = [];
    let step = 0;
    const totalSteps = d.subheads.length + d.quotes.length + d.marks.length;
    const tick = (what) => {
      step++;
      btn.textContent = `넣는 중… ${step}/${totalSteps}`;
      out.innerHTML = `<div class="ws-row">${esc(what)}</div>`;
    };

    // ── 1. 소제목 ──
    // ⚠️ 문단 스타일을 바꾸면 화면 구조가 바뀝니다. 그래서 매번 다시 찾습니다.
    for (const s of d.subheads) {
      tick(`소제목: ${s.text}`);
      const p = paras().find((n) => F.norm(n.innerText || "").includes(F.norm(s.text)));
      if (!p) { failed.push({ what: `소제목 "${s.text}"`, why: "본문에서 그 줄을 못 찾았습니다" }); continue; }
      const okk = await F.setParagraphStyle(p, "소제목");
      okk ? done.push(`소제목: ${s.text}`) : failed.push({ what: `소제목 "${s.text}"`, why: "편집기가 안 바꿔줬습니다" });
    }

    // ── 2. 인용구 ──
    for (const q of d.quotes) {
      tick(`인용구: ${q.text.slice(0, 20)}…`);
      const p = paras().find((n) => F.norm(n.innerText || "").includes(F.norm(q.text)));
      if (!p) { failed.push({ what: `인용구 "${q.text.slice(0, 20)}…"`, why: "본문에서 그 문장을 못 찾았습니다" }); continue; }
      const okk = await F.setParagraphStyle(p, "인용구");
      okk ? done.push(`인용구: ${q.text.slice(0, 20)}…`) : failed.push({ what: `인용구 "${q.text.slice(0, 20)}…"`, why: "편집기가 안 바꿔줬습니다" });
    }

    // ── 3. 강조 ──
    for (const m of d.marks) {
      tick(`${m.label}: ${m.text}`);
      const p = paras().find((n) => F.norm(n.innerText || "").includes(F.norm(m.text)));
      if (!p) { failed.push({ what: `${m.label} "${m.text}"`, why: "본문에서 그 글자를 못 찾았습니다" }); continue; }
      const r = await F.applyMark(p, m.text, m.kind);
      r.ok ? done.push(`${m.label}: ${m.text}`) : failed.push({ what: `${m.label} "${m.text}"`, why: r.why });
    }

    btn.textContent = `${done.length}군데 넣었습니다`;
    scheduleCount();

    out.innerHTML = `
      <div class="ws-row ${failed.length ? "warn" : "good"}">
        <b>${done.length}군데 넣었습니다.</b>
        ${failed.length ? ` ${failed.length}군데는 못 넣었습니다.` : ""}
      </div>
      ${failed.length ? `
        <div class="ws-sec warn-sec">
          <div class="ws-sec-h">못 넣은 것</div>
          <p class="ws-sec-p">이건 <b>직접 넣으셔야</b> 합니다. 되는 척하지 않겠습니다.</p>
          <div style="font-size:12px;line-height:1.8">
            ${failed.map((f) => `· ${esc(f.what)}<br><span style="opacity:.7">&nbsp;&nbsp;${esc(f.why)}</span>`).join("<br>")}
          </div>
        </div>` : ""}`;
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
      // ⚠️ 크기 지시(?type=w80)를 떼면 안 됩니다. 실제로 받아보니 **404**가 났습니다.
      // 네이버는 그 부분이 있어야 사진을 줍니다. 서버가 받을 때 더 큰 크기로
      // 바꿔서 요청합니다(thumbAuto.biggerUrl). 여기서는 주소를 그대로 넘깁니다.
      const clean = src;
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

  // ⚠️ setEditableText / charOffset은 format-tools.js로 옮겼습니다.
  // 원고 붙이기(draft-insert.js)도 같은 함수가 필요한데 여기 있으면 못 씁니다.
  // 실제로 그것 때문에 원고 넣기가 통째로 실패했습니다 — F.setEditableText is not a function.
  const setEditableText = (el, want) => window.__wsFormat.setEditableText(el, want);

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
      else if (act === "paste") pasteDraft();
      else if (act === "format") runFormat();
      else if (act === "links") relatedLinks();
      else if (act === "finish") finishCheck();
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
