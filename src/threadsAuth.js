/**
 * 스레드(Threads) 계정 연동.
 *
 * ⚠️ 어제 제가 "인스타·스레드는 앱 심사를 받아야 해서 몇 주 걸린다"고 했는데
 * 그건 **남에게 서비스로 팔 때** 이야기였습니다.
 * 메타 앱을 **개발 모드**로 두면 본인 계정에는 심사 없이 바로 게시할 수 있습니다.
 * 사장님은 본인 계정에만 올리시니 오늘 바로 됩니다. 정정합니다.
 *
 * ⚠️ 스레드는 인스타와 **완전히 다른 통로**를 씁니다. 같은 메타인데도요.
 *   인스타: graph.facebook.com  · 페이스북 페이지를 거쳐서
 *   스레드: graph.threads.net   · 스레드 계정에 직접
 * 그래서 코드를 따로 둡니다. 하나로 합치려다 두 개 다 망가지느니 낫습니다.
 *
 * ⚠️ 그리고 제일 중요한 차이 — **스레드 토큰은 60일이면 만료됩니다.**
 * 페이스북 페이지 토큰은 만료가 없는데 스레드는 다릅니다.
 * 그냥 두면 두 달 뒤에 조용히 멈춥니다. 그래서 만료가 가까우면 자동으로 갱신합니다.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const AUTH_URL = "https://threads.net/oauth/authorize";
const API = "https://graph.threads.net";
const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "threads-accounts.json");

const pendingStates = new Map();
const STATE_TTL_MS = 5 * 60 * 1000;

function isConfigured() {
  return !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET && process.env.PUBLIC_BASE_URL);
}

function getRedirectUri() {
  return `${process.env.PUBLIC_BASE_URL}/api/threads/callback`;
}

// ────────────────────────────────────────────────────────────
// 저장
//
// ⚠️ 인스타 쪽과 같은 이유로 환경변수에도 넣을 수 있게 합니다.
// 무료 서버는 재배포하면 파일이 날아가서, 연동을 다시 해야 합니다.
// ────────────────────────────────────────────────────────────
function loadFromEnv() {
  const raw = process.env.THREADS_ACCOUNTS_JSON;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("THREADS_ACCOUNTS_JSON을 JSON으로 읽지 못했습니다 — 무시하고 파일만 씁니다.");
    return {};
  }
}

function loadFromFile() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function loadAll() {
  // 파일이 최신입니다(방금 연동했을 수 있으니). 환경변수는 바탕에 깝니다.
  return { ...loadFromEnv(), ...loadFromFile() };
}

function save(accounts) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(accounts, null, 1), "utf8");
  } catch (e) {
    console.warn("스레드 연동 정보를 파일에 못 썼습니다:", e.message);
  }
}

function loadAccounts() {
  return Object.values(loadAll());
}

function getAccount(username) {
  const all = loadAll();
  if (username && all[username]) return all[username];
  const first = Object.values(all)[0];
  return first || null;
}

// ────────────────────────────────────────────────────────────
// 연동
// ────────────────────────────────────────────────────────────
function getAuthUrl() {
  if (!isConfigured()) {
    throw new Error("THREADS_APP_ID / THREADS_APP_SECRET / PUBLIC_BASE_URL 을 먼저 넣어주세요.");
  }
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now());
  for (const [k, t] of pendingStates) {
    if (Date.now() - t > STATE_TTL_MS) pendingStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID,
    redirect_uri: getRedirectUri(),
    // threads_basic 없이는 아무것도 못 합니다. 게시하려면 publish도 필요합니다.
    scope: "threads_basic,threads_content_publish",
    response_type: "code",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function call(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const m = (data.error && (data.error.message || data.error_message)) || data.raw || `HTTP ${res.status}`;
    throw new Error(`스레드: ${String(m).slice(0, 200)}`);
  }
  return data;
}

async function handleCallback(code, state) {
  if (!state || !pendingStates.has(state)) {
    throw new Error("연동 요청이 만료되었습니다. 처음부터 다시 해주세요.");
  }
  pendingStates.delete(state);

  // 1) 짧은 토큰
  const form = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID,
    client_secret: process.env.THREADS_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });
  const short = await call(`${API}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  // 2) 긴 토큰(60일)으로 바꿉니다. 짧은 토큰은 한 시간이면 끝납니다.
  const long = await call(
    `${API}/access_token?grant_type=th_exchange_token` +
    `&client_secret=${encodeURIComponent(process.env.THREADS_APP_SECRET)}` +
    `&access_token=${encodeURIComponent(short.access_token)}`
  );

  // 3) 누구인지 확인
  const me = await call(
    `${API}/v1.0/me?fields=id,username,threads_profile_picture_url` +
    `&access_token=${encodeURIComponent(long.access_token)}`
  );

  const accounts = loadAll();
  accounts[me.username] = {
    userId: me.id,
    username: me.username,
    picture: me.threads_profile_picture_url || null,
    accessToken: long.access_token,
    // ⚠️ 만료 시각을 반드시 적어둡니다. 이게 없으면 언제 갱신할지 알 수가 없어요.
    expiresAt: Date.now() + (Number(long.expires_in) || 60 * 86400) * 1000,
    linkedAt: new Date().toISOString(),
  };
  save(accounts);

  return {
    username: me.username,
    // 사장님이 환경변수에 넣어둘 수 있게 그대로 내보냅니다.
    envJson: JSON.stringify(accounts),
  };
}

/**
 * 토큰 갱신.
 *
 * ⚠️ 스레드 토큰은 60일이면 만료됩니다. 그냥 두면 두 달 뒤 조용히 멈춰요.
 * 게시하기 직전마다 확인해서, 만료가 일주일 안으로 다가왔으면 갱신합니다.
 *
 * ⚠️ 만료된 뒤에는 갱신이 안 됩니다. 다시 연동해야 해요.
 * 그래서 미리 갱신하는 게 중요합니다.
 */
async function refreshIfNeeded(account) {
  if (!account || !account.accessToken) return account;
  const left = (account.expiresAt || 0) - Date.now();
  if (left > 7 * 86400 * 1000) return account;         // 아직 넉넉합니다
  if (left <= 0) {
    throw new Error("스레드 연동이 만료되었습니다. 설정에서 다시 연동해 주세요.");
  }

  try {
    const r = await call(
      `${API}/refresh_access_token?grant_type=th_refresh_token` +
      `&access_token=${encodeURIComponent(account.accessToken)}`
    );
    const accounts = loadAll();
    const updated = {
      ...account,
      accessToken: r.access_token,
      expiresAt: Date.now() + (Number(r.expires_in) || 60 * 86400) * 1000,
      refreshedAt: new Date().toISOString(),
    };
    accounts[account.username] = updated;
    save(accounts);
    return updated;
  } catch (e) {
    // 갱신에 실패해도 아직 토큰은 살아 있습니다. 그대로 써봅니다.
    console.warn("스레드 토큰 갱신 실패:", e.message);
    return account;
  }
}

function status() {
  const accounts = loadAccounts();
  return {
    configured: isConfigured(),
    accounts: accounts.map((a) => ({
      username: a.username,
      linkedAt: a.linkedAt,
      // 며칠 남았는지 보여줍니다. 만료가 조용히 오면 곤란합니다.
      daysLeft: a.expiresAt ? Math.floor((a.expiresAt - Date.now()) / 86400000) : null,
    })),
  };
}

module.exports = {
  isConfigured, getAuthUrl, handleCallback,
  loadAccounts, getAccount, refreshIfNeeded, status,
  API,
};
