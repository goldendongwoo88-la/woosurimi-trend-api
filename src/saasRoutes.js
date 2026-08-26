/**
 * 유료 서비스 라우트 묶음 — 회원, 요금제, 진단, 순위추적, 관리자.
 *
 * index.js가 이미 1,700줄이라 여기에 따로 뺐습니다.
 * index.js에서 `require("./saasRoutes")(app)` 한 줄로 붙습니다.
 */

const accounts = require("./accounts");
const plans = require("./plans");
const usage = require("./usage");
const blogIndex = require("./blogIndex");
const rankTracker = require("./rankTracker");
const naverData = require("./naverBlogData");

// ── 쿠키 ──────────────────────────────────────────────────
// cookie-parser를 새로 깔지 않고 직접 읽습니다. 쿠키 하나만 쓰면 이걸로 충분합니다.
function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function setAuthCookie(res, token) {
  const maxAge = accounts.COOKIE_DAYS * 86400;
  // ⚠️ Secure를 항상 켜면 localhost(http)에서 로그인이 안 됩니다.
  // 배포 환경에서만 켭니다.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${accounts.COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
  );
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `${accounts.COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// ── 관리자 ────────────────────────────────────────────────
function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD;
  // ⚠️ 비밀번호를 안 정해두면 관리자 화면이 통째로 열립니다. 그래서 막습니다.
  if (!want) return false;
  const given = req.headers["x-admin-password"] || req.query.pw || (req.body && req.body.pw);
  return given === want;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({
      error: process.env.ADMIN_PASSWORD
        ? "관리자 비밀번호가 맞지 않습니다."
        : "서버에 ADMIN_PASSWORD가 설정되지 않아 관리자 기능을 쓸 수 없습니다.",
    });
  }
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다.", login: "/login.html" });
  next();
}

module.exports = function attachSaas(app) {
  // 모든 요청에 req.user를 채웁니다. 없으면 null(비회원).
  app.use((req, res, next) => {
    const token = readCookie(req, accounts.COOKIE_NAME);
    const u = token ? accounts.userFromToken(token) : null;
    req.user = u ? accounts.publicUser(u) : null;
    next();
  });

  // ── 회원 ───────────────────────────────────────────────
  app.post("/api/auth/signup", (req, res) => {
    const { email, password, name, blogId } = req.body || {};
    const r = accounts.signup({ email, password, name, blogId: naverData.parseBlogId(blogId) });
    if (!r.ok) return res.status(400).json({ error: r.why });
    const l = accounts.login({ email, password, ip: req.ip });
    if (l.ok) setAuthCookie(res, l.token);
    res.json({ ok: true, user: r.user });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip;
    const r = accounts.login({ email, password, ip });
    if (!r.ok) return res.status(401).json({ error: r.why });
    setAuthCookie(res, r.token);
    // 로그인할 때 출석을 찍습니다.
    const daily = accounts.touchDaily(r.user.email);
    res.json({ ok: true, user: r.user, daily });
  });

  app.post("/api/auth/logout", (req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user, usage: usage.summary(req) });
  });

  app.post("/api/auth/blog", requireLogin, (req, res) => {
    const id = naverData.parseBlogId((req.body || {}).blogId);
    if (!id) return res.status(400).json({ error: "블로그 주소나 아이디를 확인해 주세요." });
    const u = accounts.updateUser(req.user.email, { blogId: id });
    res.json({ ok: true, user: u });
  });

  // ── 요금제 · 이용권 ────────────────────────────────────
  app.get("/api/plans", (req, res) => {
    res.json({
      plans: plans.listPlans(),
      comparison: plans.comparison(),
      creditCost: plans.CREDIT_COST,
      // 결제는 스마트스토어에서 받습니다. 링크는 환경변수로 넣습니다.
      storeUrl: process.env.STORE_URL || null,
      current: req.user ? req.user.plan : "free",
    });
  });

  app.post("/api/license/redeem", requireLogin, (req, res) => {
    const r = accounts.redeemLicense(req.user.email, (req.body || {}).code);
    if (!r.ok) return res.status(400).json({ error: r.why });
    res.json({ ok: true, user: r.user });
  });

  // 사장님이 스마트스토어 주문을 확인하고 코드를 뽑는 곳
  app.post("/api/admin/license/issue", requireAdmin, (req, res) => {
    const { plan = "pro", months = 1, memo = "", count = 1 } = req.body || {};
    if (!plans.PLANS[plan] || plan === "free")
      return res.status(400).json({ error: "발급할 수 없는 플랜입니다." });
    const n = Math.min(50, Math.max(1, Number(count) || 1));
    const codes = [];
    for (let i = 0; i < n; i++) codes.push(accounts.issueLicense({ plan, months: Number(months) || 1, memo }));
    res.json({ ok: true, codes });
  });

  app.get("/api/admin/users", requireAdmin, (req, res) => {
    const list = accounts.listUsers();
    const paying = list.filter((u) => u.plan !== "free");
    res.json({
      total: list.length,
      paying: paying.length,
      // 이번 달 예상 매출 — 사장님이 제일 먼저 볼 숫자입니다.
      mrr: paying.reduce((sum, u) => sum + (plans.getPlan(u.plan).price || 0), 0),
      users: list.sort((a, b) => (a.plan === "free" ? 1 : -1)),
    });
  });

  // ── 블로그 진단 ────────────────────────────────────────
  app.post("/api/blog-index", usage.gate("diagnose"), async (req, res) => {
    const id = naverData.parseBlogId((req.body || {}).blogId);
    if (!id) return res.status(400).json({ error: "블로그 주소나 아이디를 확인해 주세요." });

    // 무료는 최근 3개만, 유료는 더 깊게 봅니다. 이게 유료로 넘어갈 이유가 됩니다.
    const planId = req.user ? req.user.plan : "free";
    const sampleSize = planId === "free" ? 3 : planId === "light" ? 7 : 12;

    try {
      const r = await blogIndex.diagnose(id, { sampleSize });
      if (!r.ok) return res.status(404).json({ error: r.why });
      res.json({ ...r, usage: req.usage, sampleSize, plan: planId });
    } catch (e) {
      console.error("[blog-index]", e.message);
      res.status(502).json({ error: "네이버에서 정보를 가져오지 못했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // 글 하나가 검색에 뜨는지 — 누락 확인
  app.post("/api/post-exposure", usage.gate("postCheck"), async (req, res) => {
    const { postUrl } = req.body || {};
    const p = naverData.parsePostUrl(postUrl);
    if (!p) return res.status(400).json({ error: "블로그 글 주소를 정확히 넣어주세요." });
    try {
      const list = await naverData.fetchPostList(p.blogId, { countPerPage: 30 });
      const post = list.posts.find((x) => x.logNo === p.logNo);
      if (!post)
        return res.status(404).json({ error: "최근 30개 글에서 찾지 못했습니다. 오래된 글은 확인이 어렵습니다." });
      const r = await blogIndex.checkExposure(p.blogId, post);
      res.json({ ok: true, result: r, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "확인에 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // 키워드 하나로 상위 30위 보기
  app.post("/api/keyword-ranking", usage.gate("keyword"), async (req, res) => {
    const kw = String((req.body || {}).keyword || "").trim();
    if (!kw) return res.status(400).json({ error: "키워드를 입력해 주세요." });
    try {
      const r = await naverData.searchBlogRanking(kw, { limit: 30 });
      res.json({ ...r, keyword: kw, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "검색에 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // ── 순위 추적 ──────────────────────────────────────────
  app.get("/api/rank/list", requireLogin, (req, res) => {
    const items = rankTracker.listFor(req.user.email);
    res.json({ items, limit: plans.getPlan(req.user.plan).limits.rankKeywords });
  });

  app.post("/api/rank/add", requireLogin, async (req, res) => {
    const limit = plans.getPlan(req.user.plan).limits.rankKeywords;
    if (rankTracker.countFor(req.user.email) >= limit) {
      return res.status(429).json({
        error: `${plans.getPlan(req.user.plan).name} 플랜은 ${limit}개까지 등록할 수 있습니다.`,
        upgrade: "/pricing.html",
      });
    }
    const r = rankTracker.add({ owner: req.user.email, ...(req.body || {}) });
    if (!r.ok) return res.status(400).json({ error: r.why });
    // 등록하자마자 한 번 재봅니다. 빈 화면을 보여주면 안 됩니다.
    try {
      await rankTracker.checkOne(r.item);
    } catch {}
    res.json({ ok: true, item: rankTracker.decorate(r.item) });
  });

  app.delete("/api/rank/:id", requireLogin, (req, res) => {
    const r = rankTracker.remove(req.user.email, req.params.id);
    if (!r.ok) return res.status(400).json({ error: r.why });
    res.json({ ok: true });
  });

  app.post("/api/rank/refresh", requireLogin, usage.gate("postCheck"), async (req, res) => {
    try {
      const r = await rankTracker.runFor(req.user.email);
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(502).json({ error: "새로고침에 실패했습니다." });
    }
  });

  // 첫 화면에 띄울 공개 통계 — 블라이의 "최근 누락 검출"과 같은 자리
  app.get("/api/drop-stats", (req, res) => {
    res.json(rankTracker.publicDropStats());
  });

  // ── 사용량 ─────────────────────────────────────────────
  app.get("/api/usage", (req, res) => res.json(usage.summary(req)));

  console.log("[saas] 회원·요금제·진단·순위추적 라우트를 붙였습니다.");
};

module.exports.requireLogin = requireLogin;
module.exports.requireAdmin = requireAdmin;
