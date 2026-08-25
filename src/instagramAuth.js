// 인스타그램(Meta) 계정 연동 — OAuth 로그인으로 페이지 액세스 토큰을 받아
// 저장합니다. 그 토큰으로 instagramPublish.js가 카드뉴스/릴스를 자동 게시합니다.
//
// 연동 정보를 두 군데에서 읽습니다:
//   1) 환경변수 IG_ACCOUNTS_JSON  ← 영구 보관용(권장)
//   2) data/instagram-accounts.json 파일  ← 방금 연동한 직후의 임시 보관
//
// ⚠️ 왜 환경변수까지 필요한가: Render 무료 플랜은 디스크가 영구 저장이 아니라서,
// 재배포하거나 서버가 재시작되면 (1)번이 없을 경우 파일에 저장된 연동 정보가
// 통째로 사라집니다. 실제로 배포 한 번에 날아가는 걸 확인했습니다.
// 다행히 페이지 액세스 토큰은 만료되지 않으므로, 연동 직후 안내 화면에 나오는
// JSON을 Render 환경변수 IG_ACCOUNTS_JSON에 한 번만 넣어두면 그 뒤로는 재배포와
// 재시작을 넘어서 계속 유지됩니다.

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

// 환경변수에 넣어둔 영구 연동 정보를 읽습니다.
function loadAccountsFromEnv() {
  const raw = process.env.IG_ACCOUNTS_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("IG_ACCOUNTS_JSON 값을 JSON으로 읽지 못했습니다 — 무시하고 파일만 씁니다.");
    return {};
  }
}

function loadAccountsFromFile() {
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  } catch {
    return {};
  }
}

// 파일에 방금 연동한 값이 있으면 그걸 우선합니다(재연동으로 토큰을 갱신한 경우).
function loadAccounts() {
  return { ...loadAccountsFromEnv(), ...loadAccountsFromFile() };
}

// 파일 저장은 "이번 서버가 살아있는 동안" 쓰기 위한 임시 보관입니다. 읽기 전용
// 파일시스템이라 실패하더라도 연동 자체는 성공한 것이므로 죽이지 않습니다.
function saveAccounts(accounts) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
  } catch (e) {
    console.warn(`연동 정보를 파일에 저장하지 못했습니다: ${e.message}`);
  }
}

// Render 환경변수 IG_ACCOUNTS_JSON에 그대로 붙여넣을 수 있는 한 줄 JSON을 만듭니다.
function getAccountsJson() {
  return JSON.stringify(loadAccounts());
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
    // ⚠️ Meta 대시보드의 권한 목록에는 "instagram_content_publishing"으로 표시되지만,
    // 실제 OAuth scope 문자열은 끝의 "ing"이 없는 instagram_content_publish 입니다.
    "instagram_content_publish",
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

module.exports = {
  isConfigured,
  getAuthUrl,
  handleCallback,
  loadAccounts,
  getAccount,
  listAccounts,
  getAccountsJson,
};
