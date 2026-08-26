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
const competitorCompare = require("./competitorCompare");
const celebFinder = require("./celebFinder");
const sharePage = require("./sharePage");
const homefeedAudit = require("./homefeedAudit");
const titleRewrite = require("./titleRewrite");

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
  // /login.html은 회원 기능 이전의 옛 화면이라 로그인이 안 됩니다. /join.html로 보냅니다.
  if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다.", login: "/join.html" });
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

  // ── 진단 결과 공유 ─────────────────────────────────────
  // ⚠️ 지금 이 사업의 병목은 기능이 아니라 **아무도 사이트를 모른다**는 것입니다.
  // 블로거는 지수가 잘 나오면 자랑하고 못 나오면 하소연합니다. 둘 다 남에게 보여줍니다.
  // 그때 보여줄 주소를 만들어 줍니다.
  app.post("/api/share", async (req, res) => {
    const id = naverData.parseBlogId((req.body || {}).blogId);
    if (!id) return res.status(400).json({ error: "블로그 아이디를 확인해 주세요." });
    try {
      // 공유용은 가볍게 — 노출 검사는 3건만 합니다. 안 그러면 공유 버튼 누를 때마다 10초씩 걸립니다.
      const r = await blogIndex.diagnose(id, { sampleSize: 3 });
      if (!r.ok) return res.status(404).json({ error: r.why });
      const s = sharePage.create(r, { owner: req.user ? req.user.email : null });
      if (!s.ok) return res.status(400).json({ error: s.why });
      res.json({ ok: true, url: s.url, id: s.id });
    } catch (e) {
      res.status(502).json({ error: "공유 링크를 만들지 못했습니다." });
    }
  });

  // 서버에서 HTML을 완성해 내려보냅니다. 자바스크립트로 그리면 카카오톡·네이버가
  // 빈 페이지로 봐서 미리보기에 아무것도 안 뜹니다. 공유가 목적인데 그러면 안 됩니다.
  app.get("/d/:id", (req, res) => {
    const item = sharePage.get(req.params.id);
    if (!item) {
      return res
        .status(404)
        .type("html")
        .send(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>없는 링크입니다</title><link rel="stylesheet" href="/assets/ws.css"></head><body>
<div class="wrap" style="max-width:420px;text-align:center;padding-top:80px">
<h1>없는 링크입니다</h1><p class="lede">지워졌거나 주소가 잘못됐습니다.</p>
<a href="/blog-index.html"><button>내 블로그 진단해보기</button></a></div></body></html>`);
    }
    item.views = (item.views || 0) + 1;
    const baseUrl = process.env.PUBLIC_BASE_URL || "";
    res.type("html").send(sharePage.render(item, { baseUrl }));
  });

  app.delete("/api/share/:id", (req, res) => {
    const r = sharePage.remove(req.params.id, req.user ? req.user.email : null);
    if (!r.ok) return res.status(400).json({ error: r.why });
    res.json({ ok: true });
  });

  // ── 경쟁 글 비교 ───────────────────────────────────────
  // ⚠️ 글을 5편씩 받아오느라 6초쯤 걸립니다. 무료는 하루 1번만 열어둡니다.
  // 한 번 써보면 값어치를 알게 되고, 그게 결제 이유가 됩니다.
  app.post("/api/compare", usage.gate("compare"), async (req, res) => {
    const { keyword, myUrl } = req.body || {};
    const planId = req.user ? req.user.plan : "free";
    // 무료는 3편, 유료는 5~8편까지 봅니다.
    const topN = planId === "free" ? 3 : planId === "light" ? 5 : 8;
    try {
      const r = await competitorCompare.compare({ keyword, myUrl, topN });
      if (!r.ok) return res.status(r.blocked ? 503 : 400).json({ error: r.why });
      res.json({ ...r, usage: req.usage, plan: planId, topN });
    } catch (e) {
      console.error("[compare]", e.message);
      res.status(502).json({ error: "비교에 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // ── 홈피드 진단 ────────────────────────────────────────
  // ⚠️ 경쟁 서비스는 전부 검색 노출만 봅니다. 그런데 지금 네이버 트래픽은
  // 홈피드에서 더 많이 옵니다. 여기가 우리만 하는 것입니다.
  app.post("/api/homefeed", usage.gate("compare"), async (req, res) => {
    const { blogId, rivalId } = req.body || {};
    const planId = req.user ? req.user.plan : "free";
    // 본문을 여는 게 느립니다. 무료는 얕게, 유료는 깊게 봅니다.
    const deep = planId === "free" ? 3 : planId === "light" ? 5 : 8;
    const sample = planId === "free" ? 30 : 60;
    try {
      if (rivalId) {
        // 비교는 두 배로 무겁습니다. 유료만 열어둡니다.
        if (planId === "free") {
          return res.status(402).json({
            error: "두 블로그 비교는 이용권이 필요합니다.",
            upgrade: "/pricing.html",
          });
        }
        const r = await homefeedAudit.versus(blogId, rivalId, { deep, sample });
        if (!r.ok) return res.status(400).json({ error: r.why });
        return res.json({ ...r, usage: req.usage, plan: planId });
      }
      const r = await homefeedAudit.audit(blogId, { deep, sample });
      if (!r.ok) return res.status(404).json({ error: r.why });
      res.json({ ...r, usage: req.usage, plan: planId });
    } catch (e) {
      console.error("[homefeed]", e.message);
      res.status(502).json({ error: "진단에 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // 제목 다시 쓰기 — 진단이 "말줄임표가 3%뿐"이라고만 하면 아무도 안 고칩니다.
  // 진단과 고침 사이를 잇습니다. AI를 쓰므로 크레딧을 씁니다.
  app.post("/api/title-rewrite", usage.creditGate("title", accounts), async (req, res) => {
    const { title, body, count } = req.body || {};
    try {
      const r = await titleRewrite.rewrite({
        title,
        body,
        count: Math.min(6, Math.max(3, Number(count) || 5)),
      });
      if (!r.ok) return res.status(400).json({ error: r.why });
      res.json({ ...r, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "제목을 만들지 못했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // ── 연예인 소재 찾기 ───────────────────────────────────
  app.post("/api/celeb/mine", usage.gate("keyword"), async (req, res) => {
    const { name, categories } = req.body || {};
    try {
      const r = await celebFinder.mine(name, {
        categories: Array.isArray(categories) && categories.length ? categories : ["beauty", "fashion"],
      });
      if (!r.ok) return res.status(400).json({ error: r.why });
      res.json({ ...r, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "네이버에서 소재를 가져오지 못했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  app.get("/api/celeb/sources", (req, res) => res.json({ sources: celebFinder.SOURCES }));

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
