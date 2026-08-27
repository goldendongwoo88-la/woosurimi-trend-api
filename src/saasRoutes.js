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
const notify = require("./notify");
const bodyRewrite = require("./bodyRewrite");
const topicFit = require("./topicFit");
const suggestTopics = require("./suggestTopics");
const research = require("./research");

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
  //
  // ⚠️ 크롬 확장은 blog.naver.com에서 우리 서버를 부릅니다. 도메인이 다르면
  // 쿠키가 안 실립니다. 억지로 실으려면 CORS에 credentials를 열어야 하는데,
  // 그러면 아무 사이트나 손님 계정으로 우리 API를 부를 수 있게 됩니다(CSRF).
  // 그래서 확장은 **머리글에 토큰을 실어** 보냅니다. 쿠키를 안 쓰니 CSRF가 없습니다.
  app.use((req, res, next) => {
    const header = req.headers["x-ws-token"];
    const token = header || readCookie(req, accounts.COOKIE_NAME);
    const u = token ? accounts.userFromToken(token) : null;
    req.user = u ? accounts.publicUser(u) : null;
    next();
  });

  // 확장에 붙여넣을 토큰을 내줍니다. 로그인한 사람만.
  app.post("/api/auth/token", requireLogin, (req, res) => {
    const t = accounts.issueToken(req.user.email);
    res.json({ ok: true, token: t, note: "크롬 확장 설정에 붙여넣으세요. 남에게 보여주면 계정이 넘어갑니다." });
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

  /**
   * 설정 점검 — 무엇이 빠졌는지 알려줍니다.
   *
   * ⚠️ 값은 절대 내보내지 않습니다. **설정됐는지 여부만** 참/거짓으로 알려줍니다.
   * 값을 보여주면 이 주소를 아는 누구나 우리 비밀번호를 읽게 됩니다.
   * 그래서 길이조차 안 알려줍니다 — 길이도 단서가 됩니다.
   */
  app.get("/api/setup-status", (req, res) => {
    const has = (k) => !!String(process.env[k] || "").trim();
    const items = [
      { key: "AUTH_SECRET", set: has("AUTH_SECRET"), need: "필수",
        why: "없으면 서버가 다시 뜰 때마다 로그인이 풀리고 이미 판 이용권이 전부 무효가 됩니다." },
      { key: "OWNER_EMAIL", set: has("OWNER_EMAIL"), need: "필수",
        why: "사장님 계정을 이용권 없이 통과시킵니다. 여기 없으면 사장님도 AI 기능을 못 씁니다." },
      { key: "OWNER_PASSWORD", set: has("OWNER_PASSWORD"), need: "필수",
        why: "무료 서버는 배포할 때마다 계정 파일이 지워집니다. 이게 있어야 사장님 계정이 되살아납니다." },
      { key: "ADMIN_PASSWORD", set: has("ADMIN_PASSWORD"), need: "손님 받을 때",
        why: "손님에게 팔 이용권 코드를 발급하는 화면(/boss.html)이 열립니다." },
      { key: "ANTHROPIC_API_KEY", set: has("ANTHROPIC_API_KEY"), need: "AI 기능",
        why: "제목·본문 보완, 원고 생성이 이 키로 돌아갑니다." },
      { key: "OWNER_NAME", set: has("OWNER_NAME"), need: "선택", why: "화면에 표시할 이름입니다." },
      { key: "STORE_URL", set: has("STORE_URL"), need: "선택", why: "요금제 화면의 스마트스토어 링크입니다." },
      { key: "NOTIFY_WEBHOOK_URL", set: has("NOTIFY_WEBHOOK_URL"), need: "선택",
        why: "순위 변동을 슬랙·디스코드로도 보냅니다." },
    ];
    const missing = items.filter((i) => !i.set && i.need === "필수");
    res.json({
      ready: missing.length === 0,
      missing: missing.map((m) => m.key),
      items,
      // 지금 로그인한 사람이 주인으로 인식되는지 — 이게 제일 궁금한 부분입니다.
      you: req.user ? { email: req.user.email, plan: req.user.plan } : null,
    });
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

  // 본문 다시 나누기 — 소제목 6개로 쪼개고 사진 자리를 잡습니다.
  // ⚠️ 사장님이 직접 쓴 글에 손대는 일이라 크레딧을 더 씁니다(원고 수준).
  app.post("/api/body-rewrite", usage.creditGate("rewrite", accounts), async (req, res) => {
    const { body, title } = req.body || {};
    try {
      const r = await bodyRewrite.rewrite({ body, title });
      if (!r.ok) return res.status(400).json({ error: r.why, shrunk: !!r.shrunk });
      res.json({ ...r, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "다듬는 데 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // 주제 적합도 — 이 글을 어느 블로그, 어느 주제로 걸어야 하나.
  // ⚠️ AI를 안 씁니다. 낱말로 판정해서 즉시 답합니다. 글 쓸 때마다 부르는 기능이라
  // 빨라야 하고, 매번 API 비용이 나가면 안 됩니다. 그래서 사용량도 안 셉니다.
  app.post("/api/topic-fit", (req, res) => {
    const { title, body, blogTopic } = req.body || {};
    if (!String(title || "").trim()) return res.status(400).json({ error: "제목을 넣어주세요." });
    const r = blogTopic
      ? topicFit.fitsBlog(title, body || "", blogTopic)
      : topicFit.classify(title, body || "");
    res.json({ ok: true, ...r, topics: Object.keys(topicFit.TOPICS) });
  });

  // 블로그 전체 주제 순도
  app.post("/api/topic-purity", usage.gate("diagnose"), async (req, res) => {
    const id = naverData.parseBlogId((req.body || {}).blogId);
    const blogTopic = (req.body || {}).blogTopic || "패션·미용";
    if (!id) return res.status(400).json({ error: "블로그 주소나 아이디를 확인해 주세요." });
    try {
      let posts = [];
      for (let page = 1; posts.length < 90 && page <= 3; page++) {
        const l = await naverData.fetchPostList(id, { page, countPerPage: 30 });
        if (!l.posts.length) break;
        posts = posts.concat(l.posts);
        await new Promise((r) => setTimeout(r, 350));
      }
      const seen = new Set();
      posts = posts.filter((p) => !seen.has(p.logNo) && seen.add(p.logNo));
      if (!posts.length) return res.status(404).json({ error: "글을 찾지 못했습니다." });

      // 주제별 분포도 함께 — "무엇이 섞여 있나"를 보여줘야 판단이 됩니다.
      const spread = {};
      for (const p of posts) {
        const k = topicFit.classify(p.title).topic || "모름";
        spread[k] = (spread[k] || 0) + 1;
      }
      const r = topicFit.purityOf(posts.map((p) => p.title), blogTopic);
      res.json({ ok: true, blogId: id, blogTopic, ...r, spread, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "확인에 실패했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // ── 추천 검색어 (오늘 뭘 쓸까) ─────────────────────────
  // ⚠️ 네이버를 여러 번 두들기는 기능이라 키워드 한도를 씁니다.
  app.post("/api/suggest-topics", usage.gate("keyword"), async (req, res) => {
    const { seeds, topic } = req.body || {};
    const planId = req.user ? req.user.plan : "free";
    // 문서 수까지 확인하는 개수 — 무료는 얕게. 하나당 요청이 한 번씩 더 나갑니다.
    const depth = planId === "free" ? 4 : planId === "light" ? 8 : 12;
    try {
      const r = await suggestTopics.suggest({ seeds, topic, depth });
      if (!r.ok) return res.status(400).json({ error: r.why });
      res.json({ ...r, plan: planId, usage: req.usage });
    } catch (e) {
      console.error("[suggest-topics]", e.message);
      res.status(502).json({ error: "추천 검색어를 가져오지 못했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  app.get("/api/suggest-topics/seeds", (req, res) =>
    res.json({ seeds: suggestTopics.SEEDS })
  );

  // 자료 조사 — 내가 모르는 것을 찾아서 글 뼈대로
  // ⚠️ 뉴스·블로그를 여러 번 읽고 AI까지 부르는 무거운 기능입니다.
  app.post("/api/research", usage.creditGate("draft", accounts), async (req, res) => {
    const { topic, angle } = req.body || {};
    if (!String(topic || "").trim())
      return res.status(400).json({ error: "무엇을 찾을지 알려주세요." });
    const planId = req.user ? req.user.plan : "free";
    const newsCount = planId === "biz" ? 12 : 8;
    const blogCount = planId === "free" ? 2 : 3;
    try {
      const r = await research.research({ topic, angle, newsCount, blogCount });
      if (!r.ok) return res.status(400).json({ error: r.why, warnings: r.warnings });
      res.json({ ...r, usage: req.usage });
    } catch (e) {
      console.error("[research]", e.message);
      res.status(502).json({ error: "자료를 모으지 못했습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // 제목이 약속한 내용을 본문에 채워 넣기
  // ⚠️ 사실은 밖에서 들어와야 합니다(사장님이 적어주시거나 자료 조사로 찾아온 것).
  // 이 라우트는 받은 사실을 본문에 엮는 일만 합니다.
  app.post("/api/body-fill", usage.creditGate("rewrite", accounts), async (req, res) => {
    const { body, title, missing, facts } = req.body || {};
    try {
      const r = await bodyRewrite.fillMissing({ body, title, missing, facts });
      if (!r.ok)
        return res.status(400).json({ error: r.why, needFacts: !!r.needFacts, shrunk: !!r.shrunk });
      res.json({ ...r, usage: req.usage });
    } catch (e) {
      res.status(502).json({ error: "채워 넣지 못했습니다. 잠시 뒤에 다시 해주세요." });
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

  // ── 알림 ───────────────────────────────────────────────
  app.get("/api/notify", requireLogin, (req, res) => {
    res.json({
      items: notify.listFor(req.user.email),
      unread: notify.unreadCount(req.user.email),
    });
  });

  app.post("/api/notify/read", requireLogin, (req, res) => {
    const n = notify.markRead(req.user.email, (req.body || {}).id || null);
    res.json({ ok: true, marked: n, unread: notify.unreadCount(req.user.email) });
  });

  app.delete("/api/notify", requireLogin, (req, res) => {
    notify.clear(req.user.email);
    res.json({ ok: true });
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
