// 확장의 배후 일꾼. 화면(content script, popup)이 서버에 직접 말을 걸지 않고
// 전부 여기를 거칩니다.
//
// ⚠️ 왜 굳이 한 번 더 거치냐면:
// 1) 콘텐츠 스크립트는 네이버 페이지 안에서 도니까 CORS·CSP에 걸립니다.
//    여기(서비스 워커)는 확장 권한으로 도니까 그런 제약이 없습니다.
// 2) 초대 코드를 한 군데서만 다룹니다. 여러 곳에 흩어지면 새는 곳이 생깁니다.
// 3) 원고 쓰기는 1분 가까이 걸립니다. 팝업은 닫히면 죽어버리는데,
//    여기서 돌리면 팝업을 닫아도 살아남습니다.

// 배포 서버 (기본값)
const DEFAULT_SERVER = "https://woosurimi-trend-api.onrender.com";

// 로컬 블로그 서버 주소 (개발 중일 때)
const LOCAL_SERVER = "http://localhost:8485";

async function cfg() {
  const s = await chrome.storage.sync.get(["server", "code", "useLocal"]);

  // useLocal 플래그가 true면 로컬 서버 사용 (개발 모드)
  const server = s.useLocal ? LOCAL_SERVER : (s.server || DEFAULT_SERVER);

  return {
    server: server.replace(/\/+$/, ""),
    code: s.code || "",
  };
}

/**
 * 서버 부르기.
 *
 * ⚠️ 무료 서버는 15분 안 쓰면 잠듭니다. 깨우는 데 30~50초가 걸리는데,
 * 그동안 사용자는 "고장 났나" 싶어집니다. 그래서 타임아웃을 넉넉히 주고,
 * 실패해도 "서버 오류"가 아니라 무슨 일인지 알아들을 수 있게 말합니다.
 */
async function call(path, body, { timeout = 180000 } = {}) {
  const { server, code } = await cfg();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(server + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Access-Code": code },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("서버가 이상한 답을 보냈습니다. 주소가 맞는지 설정에서 확인해 주세요."); }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("접속 코드가 맞지 않습니다. 설정에서 다시 넣어주세요.");
      }
      throw new Error(data.message || data.error || `서버가 ${res.status}로 답했습니다.`);
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("서버가 너무 오래 걸립니다. 잠들어 있었다면 한 번 더 눌러주세요 — 두 번째는 빠릅니다.");
    }
    if (e instanceof TypeError) {
      throw new Error("서버에 닿지 못했습니다. 인터넷 연결이나 설정의 서버 주소를 확인해 주세요.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const HANDLERS = {
  write: (p) => call("/api/ext/write", p),
  parse: (p) => call("/api/ext/parse", p, { timeout: 90000 }),
  photo: (p) => call("/api/ext/photo", p),
  product: (p) => call("/api/ext/product", p),
  keywords: (p) => call("/api/ext/keywords", p, { timeout: 90000 }),
  audit: (p) => call("/api/post-audit", p, { timeout: 60000 }),
  ping: () => call("/api/ext/ping", {}, { timeout: 120000 }),
};

/**
 * 이용권 토큰을 알아서 받아옵니다.
 *
 * ⚠️ 왜 필요한가 — 사장님이 "왜 자꾸 로그인이 풀리냐"고 물으셨습니다.
 * 풀린 게 아닙니다. 확장을 지우고 다시 넣으면 크롬이 **다른 확장으로 취급**해서
 * 저장해둔 설정(토큰 포함)이 통째로 사라집니다. 제가 버전을 올릴 때마다
 * 사장님은 토큰을 다시 넣어야 했습니다.
 *
 * 확장은 우리 도메인에 대한 권한이 있어서, 배경 스크립트에서 부르면
 * **브라우저에 남아 있는 로그인 쿠키가 함께 실립니다.**
 * 그래서 사이트에 로그인만 돼 있으면 토큰을 손으로 옮길 필요가 없습니다.
 *
 * 손으로 넣은 토큰이 있으면 그걸 먼저 씁니다. 사모님 PC처럼 다른 계정을
 * 쓰시는 경우를 덮어쓰면 안 되니까요.
 */
async function fetchTokenFromSession() {
  const { server } = await chrome.storage.sync.get(["server"]);
  const base = (server || DEFAULT_SERVER).replace(/\/+$/, "");
  const res = await fetch(base + "/api/auth/token", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(
      res.status === 401
        ? "우수리미에 로그인돼 있지 않습니다. 사이트에서 로그인한 뒤 다시 눌러주세요."
        : data.error || `토큰을 못 받았습니다 (${res.status})`
    );
  }
  await chrome.storage.sync.set({ wsToken: data.token });
  return { token: data.token };
}

/**
 * 진짜 Ctrl+V — 원고 자동 붙이기의 마지막 조각.
 *
 * ⚠️ 왜 이 길인가: 네이버 편집기는 확장이 흉내 낸 붙여넣기(합성 이벤트)를
 * 무시합니다. 실측으로 확인한 사실입니다. 그래서 지금까지는 "복사해 뒀으니
 * Ctrl+V 해주세요"가 한계였습니다. 디버거 통로로 보내는 키는 **브라우저가
 * 직접 누르는 키**라 편집기가 사람 입력과 구별하지 못합니다.
 *
 * ⚠️ 붙는 동안 화면 위에 "…디버깅을 시작했습니다" 노란 띠가 잠깐 떴다
 * 사라집니다. 크롬이 붙이는 안내라 못 없앱니다 — 고장이 아닙니다.
 *
 * ⚠️ 이 통로로는 **붙여넣기 키 하나만** 보냅니다. 발행·게시·공개를 누르는
 * 데 쓰지 않습니다 — 그건 원칙이고, 코드에도 그 키만 있습니다.
 */
async function pressPaste(tabId, { useCommands = false } = {}) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    const key = { modifiers: 2, key: "v", code: "KeyV", windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 };
    /**
     * ⚠️ 2차 경로(useCommands): 그냥 키만 보내면 일부 화면에서 붙여넣기로
     * 이어지지 않는 경우가 있습니다 (실제로 겪음 — 복사는 됐는데 안 붙음).
     * commands:["paste"]는 "이 키는 붙여넣기 명령"이라고 편집기에 직접
     * 지시하는 크롬 공식 방법입니다. 1차(그냥 키)가 안 먹었을 때만 씁니다 —
     * 처음부터 둘 다 쓰면 두 번 붙을 수 있습니다.
     */
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent",
      { type: "keyDown", ...key, ...(useCommands ? { commands: ["paste"] } : {}) });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
  } finally {
    // 띠를 바로 걷습니다. 실패해도(이미 떨어졌어도) 상관없습니다.
    try { await chrome.debugger.detach(target); } catch {}
  }
}

/**
 * 골든 블로그 플로어(로컬 8485)에서 원고를 받아옵니다.
 *
 * ⚠️ 왜 배경을 거치나 — 실측으로 확인한 사실입니다.
 * 네이버 글쓰기는 **https**인데 플로어는 **http://localhost**입니다. https 화면에서
 * http를 부르면 크롬이 통째로 막습니다(mixed content). 콘텐츠 스크립트에서 바로 부르면
 * "Failed to fetch"만 나오고 아무 일도 안 일어납니다 — 통합 복사 마무리가 조용히
 * 죽어 있던 원인이 이것이었습니다.
 *
 * 배경(서비스 워커)은 확장 자신의 자리에서 돌아서 이 제한을 받지 않습니다.
 * 그래서 플로어에 말을 거는 일은 전부 여기를 지나갑니다.
 */
async function floorFetch(pathname) {
  const base = "http://localhost:8485";
  const res = await fetch(base + pathname, { cache: "no-store" });
  if (!res.ok) throw new Error(`플로어가 ${res.status}로 답했습니다.`);
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
  }

  /**
   * 무인 모드 결과 보고. 확장이 화면 없이 붙여넣기를 끝낸 뒤 편집국에 알립니다.
   * 바깥에서는 화면을 못 보므로 이게 유일한 확인 수단입니다.
   */
  if (msg.type === "wsuFloorPost") {
    fetch(LOCAL_SERVER + String(msg.path || ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.body || {}),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "floorGet") {
    // 플로어가 안 떠 있으면 실패가 정상입니다 — 부르는 쪽에서 조용히 넘어갑니다.
    floorFetch(String(msg.path || ""))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "fetchImage") {
    /**
     * 워드 내려받기용 사진 받기 (1.27.17).
     *
     * ⚠️ 왜 배경에서 받나: 네이버 본문 사진은 pstatic.net(다른 도메인)에 삽니다.
     * 콘텐츠 스크립트의 fetch는 페이지와 같은 CORS 제약을 받아서 전부 막혔고,
     * 그래서 워드 파일에 사진이 하나도 안 들어갔습니다. 배경은 host_permissions로
     * 이 제약을 안 받습니다. (플로어 호출을 배경으로 돌린 것과 같은 이유입니다.)
     *
     * ⚠️ 서비스 워커에는 FileReader가 없습니다 — arrayBuffer→base64로 직접 바꿉니다.
     */
    (async () => {
      const r = await fetch(String(msg.url || ""), { credentials: "include" });
      if (!r.ok) throw new Error(`사진 서버가 ${r.status}로 답했습니다.`);
      const blob = await r.blob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return `data:${blob.type || "image/jpeg"};base64,${btoa(bin)}`;
    })()
      .then((dataUri) => sendResponse({ ok: true, dataUri }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "uiClick") {
    // 진짜 클릭 — 편집기 위 아무 좌표나. clickPaste에서 검증된 통로의 낱개판.
    // 소제목 드롭다운처럼 "클릭 → 화면 변화 확인 → 다음 클릭"이 필요한 흐름에 씁니다.
    //
    // ⚠️ clicks:3 (세 번 클릭)은 **그 줄을 통째로 고르는** 데 씁니다 (사진 넣기).
    //    자리표시 줄을 골라두면 사진이 그 자리를 대신하며 들어가서, 글자를 따로 안 지워도 됩니다.
    //    DOM에서 손으로 지우면 편집기 모델에는 글자가 남아 저장할 때 되살아납니다.
    const t3 = _sender && _sender.tab && _sender.tab.id;
    if (!t3) { sendResponse({ ok: false, message: "탭을 못 찾았습니다." }); return; }
    (async () => {
      const target = { tabId: t3 };
      await chrome.debugger.attach(target, "1.3");
      try {
        // 사람이 세 번 누를 때처럼 clickCount를 1,2,3으로 올려 보냅니다.
        // 한 번에 clickCount:3만 보내면 편집기가 줄 선택으로 안 받는 경우가 있습니다.
        const times = Math.min(3, Math.max(1, Number(msg.clicks) || 1));
        for (let n = 1; n <= times; n++) {
          const m = { x: msg.x, y: msg.y, button: "left", clickCount: n };
          await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...m });
          await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...m });
        }
      } finally {
        try { await chrome.debugger.detach(target); } catch {}
      }
    })()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "clickPaste") {
    /**
     * 진짜 클릭 + Ctrl+V 를 한 호흡에.
     *
     * ⚠️ 왜: 네이버 편집기는 자기만의 커서를 따로 굴려서, 코드로 세운 커서로는
     * 붙여넣기를 무시합니다 (실측 진단: "키는 들어갔는데 편집기가 안 받음").
     * **마우스가 실제로 그 자리를 눌러야** 편집기 커서가 서고, 그다음 키가 먹습니다.
     * 사람이 손으로 클릭+Ctrl+V 하면 되는 이유가 바로 이것입니다 — 그걸 그대로 재현합니다.
     */
    const tabId2 = _sender && _sender.tab && _sender.tab.id;
    if (!tabId2) { sendResponse({ ok: false, message: "탭을 못 찾았습니다." }); return; }
    (async () => {
      const target = { tabId: tabId2 };
      await chrome.debugger.attach(target, "1.3");
      try {
        const m = { x: msg.x, y: msg.y, button: "left", clickCount: 1 };
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...m });
        await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...m });
        await new Promise((r) => setTimeout(r, 200));   // 편집기가 커서를 세울 짬
        const key = { modifiers: 2, key: "v", code: "KeyV", windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86 };
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyDown", ...key });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
      } finally {
        try { await chrome.debugger.detach(target); } catch {}
      }
    })()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "pressPaste") {
    const tabId = _sender && _sender.tab && _sender.tab.id;
    if (!tabId) { sendResponse({ ok: false, message: "탭을 못 찾았습니다." }); return; }
    pressPaste(tabId, { useCommands: !!msg.commands })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  if (msg.type === "syncToken") {
    fetchTokenFromSession()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, message: err.message }));
    return true;
  }

  const fn = HANDLERS[msg.type];
  if (!fn) return;

  fn(msg.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, message: err.message }));

  return true; // 비동기로 답하겠다는 표시. 이걸 빼면 응답이 그냥 사라집니다.
});

// 처음 깔았을 때 설정 화면을 한 번 열어줍니다.
// 접속 코드를 안 넣으면 아무것도 안 되는데, 그걸 모른 채 헤매면 곤란합니다.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});
