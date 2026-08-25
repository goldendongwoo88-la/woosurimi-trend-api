// 인스타그램(Meta) 계정 연동 — OAuth 로그인으로 페이지 액세스 토큰을 받아
// data/instagram-accounts.json에 저장합니다. 그 토큰으로 나중에 카드뉴스/릴스를
// 자동 게시(instagramPublish.js, 다음 단계에서 작성)할 수 있게 됩니다.
//
// ⚠️ Render 무료 플랜은 디스크가 영구 저장이 아닙니다 — 서버가 재배포되거나
// (알려진 문제로) 크래시 후 재시작되면 이 파일에 저장된 연동 정보가 사라질 수
// 있습니다. 그러면 "인스타그램 연결하기"를 다시 눌러서 재연동해야 합니다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DATA_DIR = path.join(__dirname, "..", "data");
const ACCOUNTS_FILE = path.join(DATA_DIR, "instagram-accounts.json");

// state(CSRF 토큰) 저장용 — 서버 메모리에만 두고, 5분 지나면 버립니다.
const pendingStates = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;

function isConfigured() {
  return !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET && process.env.PUBLIC_BASE_URL);
}

function getRedirectUri() {
  return `${process.env.PUBLIC_BASE_URL}/api/instagram/callback`;
}

function loadAccounts() {
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
}

function getAccount(igUsername) {
  const accounts = loadAccounts();
  return accounts[igUsername] || null;
}

function listAccounts() {
  const accounts = loadAccounts();
  // 액세스 토큰은 목록 응답에 노출하지 않습니다.
  return Object.values(accounts).map(({ pageAccessToken, ...rest }) => rest);
}

// 1) "인스타그램 연결하기" 버튼이 이동할 Meta 로그인 URL을 만듭니다.
function getAuthUrl() {
  if (!isConfigured()) throw new Error("FB_APP_ID/FB_APP_SECRET/PUBLIC_BASE_URL이 설정되어 있지 않습니다.");
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());
  for (const [key, ts] of pendingStates) {
    if (Date.now() - ts > STATE_TTL_MS) pendingStates.delete(key);
  }

  const scope = [
    "instagram_basic",
    "instagram_content_publishing",
    "pages_show_list",
    "pages_read_engagement",
    "business_management",
  ].join(",");

  const params = new URLSearchParams({
    client_id: process.env.FB_APP_ID,
    redirect_uri: getRedirectUri(),
    scope,
    response_type: "code",
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

function checkState(state) {
  if (!state || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

async function graphGet(pathAndQuery) {
  const res = await fetch(`${GRAPH_URL}${pathAndQuery}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Graph API 오류: ${data.error?.message || res.status}`);
  }
  return data;
}

// 2) 콜백에서 받은 code로 로그인 완료 처리 — 페이지 액세스 토큰 + 인스타그램
//    비즈니스 계정 ID를 찾아서 저장합니다.
//    이렇게 얻은 "페이지 액세스 토큰"은 장기 사용자 토큰에서 파생된 것이라
//    별도 갱신 없이 계속 쓸 수 있습니다 (사용자가 비밀번호를 바꾸거나 앱 연동을
//    끊지 않는 한 만료되지 않음).
async function handleCallback(code, state) {
  if (!checkState(state)) throw new Error("state 값이 유효하지 않습니다(만료되었거나 위조된 요청).");

  // code → 단기 사용자 토큰
  const shortLived = await graphGet(
    `/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(
      getRedirectUri()
    )}&client_secret=${process.env.FB_APP_SECRET}&code=${encodeURIComponent(code)}`
  );

  // 단기 → 장기(약 60일) 사용자 토큰
  const longLived = await graphGet(
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&fb_exchange_token=${shortLived.access_token}`
  );
  const userAccessToken = longLived.access_token;

  // 이 사용자가 관리하는 페이지 목록(+페이지별 액세스 토큰)
  const pagesRes = await graphGet(`/me/accounts?access_token=${userAccessToken}`);
  const pages = pagesRes.data || [];
  if (!pages.length) {
    throw new Error("연결된 Facebook 페이지를 찾지 못했습니다. 인스타그램 계정에 페이지가 연결되어 있는지 확인해주세요.");
  }

  const connected = [];
  for (const page of pages) {
    const detail = await graphGet(
      `/${page.id}?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${page.access_token}`
    );
    const igAccount = detail.instagram_business_account;
    if (!igAccount) continue; // 이 페이지엔 연결된 인스타그램 비즈니스 계정이 없음

    const record = {
      igUsername: igAccount.username,
      igBusinessAccountId: igAccount.id,
      profilePictureUrl: igAccount.profile_picture_url || null,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      connectedAt: new Date().toISOString(),
    };

    const accounts = loadAccounts();
    accounts[igAccount.username] = record;
    saveAccounts(accounts);
    connected.push({ igUsername: record.igUsername, pageName: record.pageName });
  }

  if (!connected.length) {
    throw new Error("연결된 페이지는 찾았지만, 인스타그램 비즈니스 계정이 연결된 페이지가 없습니다.");
  }
  return connected;
}

module.exports = { isConfigured, getAuthUrl, handleCallback, loadAccounts, getAccount, listAccounts };
