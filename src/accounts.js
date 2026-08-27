/**
 * 회원 · 로그인 · 이용권.
 *
 * ⚠️ 결제는 우리가 직접 받지 않습니다. 사주 쪽과 같은 이유입니다.
 *   1) 카드번호를 우리 서버에 두지 않습니다. 털려도 잃을 게 없습니다.
 *   2) 환불·분쟁을 스마트스토어가 대신 처리합니다. 혼자 하면 이게 제일 힘듭니다.
 *   3) 스마트스토어 상품은 네이버 검색에 잡힙니다. 덤입니다.
 * 흐름: 스마트스토어에서 결제 → 사장님이 이용권 코드 발급 → 손님이 사이트에서 등록.
 *
 * ⚠️ 무료 서버는 재배포하면 디스크가 비워집니다. 그래서 회원 정보를 파일에만 두면
 * 배포 한 번에 손님이 전부 날아갑니다. 실제로 사주 쪽에서 겪었습니다.
 * 대책 두 가지를 같이 둡니다:
 *   - ACCOUNTS_SEED_JSON 환경변수로 계정을 다시 심을 수 있게 합니다.
 *   - 이용권 코드는 **파일이 아니라 서명으로** 검증합니다(아래 issueLicense 참고).
 *     그래서 디스크가 날아가도 손님이 가진 코드는 그대로 살아 있습니다.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "accounts.json");

const COOKIE_NAME = "wsu";
const COOKIE_DAYS = 90;

// 서명 비밀키. 없으면 프로세스마다 새로 만들어지고, 재시작 시 로그인이 풀립니다.
// 운영에서는 반드시 환경변수로 고정해야 합니다.
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.AUTH_SECRET) {
  console.warn("[accounts] AUTH_SECRET이 없습니다. 재시작하면 모든 로그인과 이용권이 무효가 됩니다.");
}

// ── 저장소 ────────────────────────────────────────────────
let store = { users: {}, sessions: {} };

function load() {
  try {
    store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    store = { users: {}, sessions: {} };
  }
  if (!store.users) store.users = {};
  if (!store.sessions) store.sessions = {};

  // 디스크가 비워졌을 때를 대비한 재주입
  if (process.env.ACCOUNTS_SEED_JSON) {
    try {
      const seed = JSON.parse(process.env.ACCOUNTS_SEED_JSON);
      for (const u of seed) if (u.email && !store.users[normEmail(u.email)]) store.users[normEmail(u.email)] = u;
    } catch (e) {
      console.warn("[accounts] ACCOUNTS_SEED_JSON을 읽지 못했습니다:", e.message);
    }
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn("[accounts] 저장 실패:", e.message);
  }
}

load();

const normEmail = (e) => String(e || "").trim().toLowerCase();

// ── 비밀번호 ──────────────────────────────────────────────
// scrypt를 씁니다. bcrypt를 쓰려면 패키지를 더 깔아야 하는데, node 기본 crypto로 충분합니다.
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  // 길이가 다르면 timingSafeEqual이 던집니다. 먼저 막습니다.
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── 서명 ──────────────────────────────────────────────────
function sign(payloadObj) {
  const body = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function unsign(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// ── 요청 제한 ─────────────────────────────────────────────
// 비밀번호를 기계로 때려보는 걸 막습니다.
const loginAttempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const log = (loginAttempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  loginAttempts.set(ip, log);
  return log.length >= 10;
}
function noteAttempt(ip) {
  const log = loginAttempts.get(ip) || [];
  log.push(Date.now());
  loginAttempts.set(ip, log);
}

// ── 가입 · 로그인 ─────────────────────────────────────────
function signup({ email, password, name, blogId }) {
  const e = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, why: "이메일 형식이 아닙니다." };
  if (String(password || "").length < 8) return { ok: false, why: "비밀번호는 8자 이상이어야 합니다." };
  if (store.users[e]) return { ok: false, why: "이미 가입된 이메일입니다." };

  store.users[e] = {
    email: e,
    name: String(name || "").slice(0, 40) || e.split("@")[0],
    password: hashPassword(password),
    blogId: blogId || null,
    plan: "free",
    planUntil: null,
    createdAt: new Date().toISOString(),
    // 블덱스가 쓰는 방식 — 출석·포인트로 붙잡아 둡니다.
    points: 0,
    streak: 0,
    lastSeenDate: null,
    licenses: [],
  };
  save();
  return { ok: true, user: publicUser(store.users[e]) };
}

/**
 * 주인 계정은 파일이 아니라 **환경변수로** 살립니다.
 *
 * ⚠️ 왜 이게 필요한가 — 실제로 사장님이 로그인을 못 하는 일이 생겼습니다.
 * 무료 서버는 재배포할 때마다 디스크가 비워집니다. 제가 코드를 고쳐 올릴 때마다
 * accounts.json이 지워지고, 가입해둔 계정이 통째로 사라집니다.
 * 사장님은 방금 만든 아이디로 로그인했는데 "비밀번호가 맞지 않습니다"를 봤습니다.
 * 틀린 게 아니라 계정 자체가 없었던 겁니다.
 *
 * OWNER_EMAIL + OWNER_PASSWORD가 맞으면, 기록이 없어도 그 자리에서 다시 만듭니다.
 * 환경변수는 재배포해도 남으므로 사장님은 두 번 다시 가입할 필요가 없습니다.
 *
 * ⚠️ 이건 주인 계정만 해결합니다. **손님 계정은 여전히 재배포 때 날아갑니다.**
 * 돈을 받기 시작하면 그때는 진짜 저장소(디스크나 DB)를 붙여야 합니다.
 * 지금 손님이 없어서 미뤄둔 것이지, 해결된 게 아닙니다.
 */
function ensureOwner(email, password) {
  const e = normEmail(email);
  if (!isOwner(e)) return null;
  const want = process.env.OWNER_PASSWORD;
  if (!want || String(password) !== want) return null;

  if (!store.users[e]) {
    store.users[e] = {
      email: e,
      name: (process.env.OWNER_NAME || e.split("@")[0]).slice(0, 40),
      password: hashPassword(want),
      blogId: process.env.OWNER_BLOG_ID || null,
      plan: "biz",
      planUntil: null,
      createdAt: new Date().toISOString(),
      points: 0,
      streak: 0,
      lastSeenDate: null,
      licenses: [],
    };
    save();
    console.log(`[accounts] 주인 계정을 환경변수로 복구했습니다: ${e}`);
  }
  return store.users[e];
}

function login({ email, password, ip }) {
  if (tooManyAttempts(ip)) return { ok: false, why: "시도가 너무 많습니다. 10분 뒤에 다시 해주세요." };
  // 주인 계정이 사라졌으면 먼저 되살립니다.
  ensureOwner(email, password);
  const u = store.users[normEmail(email)];
  // 아이디가 없는 경우와 비밀번호가 틀린 경우를 같은 문구로 답합니다.
  // 다르게 답하면 어떤 이메일이 가입돼 있는지 알려주는 셈이 됩니다.
  if (!u || !verifyPassword(password, u.password)) {
    noteAttempt(ip);
    return { ok: false, why: "이메일 또는 비밀번호가 맞지 않습니다." };
  }
  return { ok: true, token: sign({ e: u.email, t: Date.now() }), user: publicUser(u) };
}

/** 쿠키의 토큰으로 사용자를 찾습니다. 없으면 null (= 비회원). */
function userFromToken(token) {
  const p = unsign(token);
  if (!p || !p.e) return null;
  // 90일이 지난 토큰은 버립니다.
  if (p.t && Date.now() - p.t > COOKIE_DAYS * 86400000) return null;
  return store.users[p.e] || null;
}

function publicUser(u) {
  if (!u) return null;
  return {
    email: u.email,
    name: u.name,
    blogId: u.blogId || null,
    plan: effectivePlan(u),
    planUntil: u.planUntil || null,
    points: u.points || 0,
    streak: u.streak || 0,
  };
}

/**
 * 기간이 지난 유료 플랜은 자동으로 무료로 떨어집니다.
 *
 * ⚠️ 주인 계정은 예외입니다.
 * 사장님이 사장님한테 이용권 코드를 발급해서 등록하는 건 말이 안 됩니다.
 * 그런데 지금 구조가 정확히 그랬습니다 — 관리자 비밀번호로 코드를 뽑아서
 * 본인이 등록해야 AI 기능이 열렸습니다. 게다가 그 비밀번호가 서버에 없으면
 * 사장님조차 자기가 만든 기능을 못 씁니다.
 *
 * OWNER_EMAIL에 적힌 계정은 항상 최상위 플랜으로 봅니다.
 * 쉼표로 여러 개 적을 수 있습니다(사장님·사모님).
 */
function isOwner(email) {
  const list = String(process.env.OWNER_EMAIL || "")
    .split(",")
    .map((s) => normEmail(s))
    .filter(Boolean);
  return list.includes(normEmail(email));
}

function effectivePlan(u) {
  if (!u) return "free";
  if (isOwner(u.email)) return "biz";
  if (u.plan && u.plan !== "free") {
    if (!u.planUntil) return u.plan;
    if (new Date(u.planUntil).getTime() > Date.now()) return u.plan;
    return "free";
  }
  return "free";
}

function updateUser(email, patch) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  Object.assign(u, patch);
  save();
  return publicUser(u);
}

/**
 * 출석 — 하루 한 번 들어오면 포인트를 줍니다.
 * 블덱스가 이걸로 사람을 매일 부릅니다. 붙잡아두는 값이 싸게 먹힙니다.
 */
function touchDaily(email) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (u.lastSeenDate === today) return { already: true, streak: u.streak, points: u.points };

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  u.streak = u.lastSeenDate === yesterday ? (u.streak || 0) + 1 : 1;
  u.lastSeenDate = today;
  // 연속 출석이 길수록 더 줍니다. 최대 하루 30점.
  const gained = Math.min(30, 10 + (u.streak - 1) * 2);
  u.points = (u.points || 0) + gained;
  save();
  return { already: false, gained, streak: u.streak, points: u.points };
}

function addPoints(email, n, why) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  u.points = Math.max(0, (u.points || 0) + n);
  save();
  return u.points;
}

// ── 이용권 코드 ───────────────────────────────────────────
/**
 * 코드를 **서명으로** 만듭니다. 발급 목록을 파일에 안 적어도 검증이 됩니다.
 * 무료 서버 디스크가 날아가도 손님 코드가 계속 통하는 이유가 이겁니다.
 *
 * 형태: WSU-<plan>-<base32 서명>
 * 담기는 것: 플랜, 개월 수, 발급 일련번호(중복 사용 방지용)
 */
function issueLicense({ plan, months = 1, memo = "" }) {
  const nonce = crypto.randomBytes(6).toString("hex");
  // ⚠️ 발급 시각을 서명에 넣으면 안 됩니다. 검증할 때 그 시각을 알 수 없어서
  // 서명을 다시 만들 수가 없고, 결과적으로 **발급한 코드가 전부 거부됩니다.**
  // 처음에 Date.now()를 넣었다가 이 문제를 만났습니다. 서명 대상은 코드 문자열에서
  // 되읽을 수 있는 값(플랜·개월·nonce)만으로 제한합니다.
  const payload = { p: plan, m: months, n: nonce, i: null };
  const token = sign(payload);
  // 사람이 옮겨 적을 수 있게 짧게 줄입니다. 원문은 서버가 다시 만들 수 있습니다.
  const short = crypto.createHmac("sha256", SECRET).update(token).digest("hex").slice(0, 12).toUpperCase();
  return {
    code: `WSU-${plan.toUpperCase()}-${months}M-${nonce.toUpperCase()}-${short}`,
    plan,
    months,
    memo,
    issuedAt: new Date().toISOString(),
  };
}

/** 코드가 진짜인지 확인합니다. 서명을 다시 계산해서 맞춰봅니다. */
function verifyLicense(code) {
  const s = String(code || "").trim().toUpperCase();
  const m = s.match(/^WSU-([A-Z0-9]+)-(\d+)M-([A-F0-9]{12})-([A-F0-9]{12})$/);
  if (!m) return { ok: false, why: "코드 형식이 맞지 않습니다." };
  const [, planUp, monthsStr, nonceUp, short] = m;
  const plan = planUp.toLowerCase();
  const months = Number(monthsStr);
  const nonce = nonceUp.toLowerCase();
  const token = sign({ p: plan, m: months, n: nonce, i: null });
  // ⚠️ 발급 시각 i가 서명에 들어가면 검증 때 재현할 수 없습니다.
  // 그래서 검증용 서명에는 i를 넣지 않습니다. issueLicense도 같은 규칙을 씁니다.
  const expected = crypto.createHmac("sha256", SECRET).update(token).digest("hex").slice(0, 12).toUpperCase();
  if (expected !== short) return { ok: false, why: "확인되지 않는 코드입니다." };
  return { ok: true, plan, months, nonce };
}

/** 코드를 계정에 붙입니다. 같은 코드를 두 번 쓰지 못하게 막습니다. */
function redeemLicense(email, code) {
  const u = store.users[normEmail(email)];
  if (!u) return { ok: false, why: "로그인이 필요합니다." };

  const v = verifyLicense(code);
  if (!v.ok) return v;

  const used = (u.licenses || []).some((l) => l.code === String(code).trim().toUpperCase());
  if (used) return { ok: false, why: "이미 등록한 코드입니다." };
  // 다른 사람이 쓴 코드도 막아야 합니다.
  for (const other of Object.values(store.users)) {
    if (other.email === u.email) continue;
    if ((other.licenses || []).some((l) => l.code === String(code).trim().toUpperCase()))
      return { ok: false, why: "이미 사용된 코드입니다." };
  }

  // 남은 기간이 있으면 이어붙입니다. 손님이 손해 보면 안 됩니다.
  const base =
    u.planUntil && new Date(u.planUntil).getTime() > Date.now() ? new Date(u.planUntil) : new Date();
  base.setMonth(base.getMonth() + v.months);

  u.plan = v.plan;
  u.planUntil = base.toISOString();
  u.licenses = [...(u.licenses || []), { code: String(code).trim().toUpperCase(), at: new Date().toISOString() }];
  save();
  return { ok: true, user: publicUser(u) };
}

/**
 * 크롬 확장에 붙여넣을 토큰. 쿠키와 같은 형식이라 검증 코드를 따로 만들 필요가 없습니다.
 * ⚠️ 이건 사실상 비밀번호입니다. 남에게 보여주면 계정이 통째로 넘어갑니다.
 * 그래서 화면에도 그렇게 적어둡니다.
 */
function issueToken(email) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  return sign({ e: u.email, t: Date.now() });
}

function listUsers() {
  return Object.values(store.users).map(publicUser);
}

/**
 * 브랜드 설정 읽기·쓰기.
 *
 * ⚠️ listUsers()로 꺼내 쓰면 안 됩니다. 그건 publicUser를 거쳐서
 * **brandKit이 빠진 채로** 나옵니다. 그걸 모르고 쓰면 늘 빈 값이 나오는데,
 * 저장은 되는 것처럼 보여서 원인을 찾기 어렵습니다. 실제로 그렇게 짤 뻔했습니다.
 *
 * ⚠️ 그렇다고 사용자 원본을 통째로 내주지도 않습니다.
 * 비밀번호 해시가 같이 나갑니다. 필요한 것만 주고받습니다.
 */
function getBrandKit(email) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  return { ...(u.brandKit || {}), blogId: u.blogId || null };
}

function setBrandKit(email, patch) {
  const u = store.users[normEmail(email)];
  if (!u) return null;
  u.brandKit = { ...(u.brandKit || {}), ...patch };
  save();
  return { ...u.brandKit, blogId: u.blogId || null };
}

module.exports = {
  getBrandKit, setBrandKit,
  COOKIE_NAME,
  COOKIE_DAYS,
  signup,
  login,
  userFromToken,
  publicUser,
  effectivePlan,
  updateUser,
  touchDaily,
  addPoints,
  issueLicense,
  verifyLicense,
  redeemLicense,
  issueToken,
  listUsers,
};
