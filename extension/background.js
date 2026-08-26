// 확장의 배후 일꾼. 화면(content script, popup)이 서버에 직접 말을 걸지 않고
// 전부 여기를 거칩니다.
//
// ⚠️ 왜 굳이 한 번 더 거치냐면:
// 1) 콘텐츠 스크립트는 네이버 페이지 안에서 도니까 CORS·CSP에 걸립니다.
//    여기(서비스 워커)는 확장 권한으로 도니까 그런 제약이 없습니다.
// 2) 초대 코드를 한 군데서만 다룹니다. 여러 곳에 흩어지면 새는 곳이 생깁니다.
// 3) 원고 쓰기는 1분 가까이 걸립니다. 팝업은 닫히면 죽어버리는데,
//    여기서 돌리면 팝업을 닫아도 살아남습니다.

const DEFAULT_SERVER = "https://woosurimi-trend-api.onrender.com";

async function cfg() {
  const s = await chrome.storage.sync.get(["server", "code"]);
  return {
    server: (s.server || DEFAULT_SERVER).replace(/\/+$/, ""),
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    return;
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
