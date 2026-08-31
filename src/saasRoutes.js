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
const postCategory = require("./postCategory");
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
const thumbnail = require("./thumbnail");
const lineBreak = require("./lineBreak");
const spellCheck = require("./spellCheck");
const thumbAuto = require("./thumbAuto");
const thumbStrategy = require("./thumbStrategy");
// 홈판 상위 블로그가 쓰는 10가지 썸네일 틀 — 글에 맞는 것을 골라줍니다 (AI 안 씀)
const thumbPatterns = require("./thumbPatterns");
const emphasis = require("./emphasis");

// 썸네일용 사진 받기.
// ⚠️ 디스크에 안 씁니다(memoryStorage). 만들어서 바로 돌려주면 끝인 사진을
// 서버에 남길 이유가 없습니다. 남기면 지우는 일도 제 몫이 되고, 언젠가 잊습니다.
// 8MB 두 장이면 넉넉합니다. 요즘 폰 사진이 3~5MB입니다.
const multer = require("multer");
const thumbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
});

// 자동 고르기용 — 본문 사진을 여러 장 받습니다.
const thumbAutoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
});

// 로고 한 장 — 색만 뽑고 버립니다. 저장하지 않습니다.
// ⚠️ 크게 잡을 이유가 없습니다. 32×32로 줄여서 색만 셀 거라서요.
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});

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

  // ── 홈판 썸네일 ─────────────────────────────────────────
  //
  // ⚠️ 사진은 사장님이 올리신 것만 씁니다. 연예인 사진을 대신 찾아다 주는 기능은
  // 만들지 않았습니다. 저작권(찍은 사람)과 초상권(찍힌 사람)이 둘 다 걸리고,
  // 썸네일은 제일 눈에 띄는 자리라 문제가 되면 바로 걸립니다.

  // 설정값 — 화면이 크기·색을 하드코딩하지 않게 서버에서 내려줍니다.
  app.get("/api/thumb/options", (req, res) => {
    res.json({
      sizes: Object.entries(thumbnail.SIZES).map(([id, s]) => ({ id, ...s })),
      themes: Object.entries(thumbnail.THEMES).map(([id, t]) => ({ id, label: t.label, band: t.band, text: t.text })),
    });
  });

  // 제목에서 썸네일 문구 뽑기 — AI를 안 쓰니 사용량도 안 셉니다.
  //
  // ⚠️ 예전엔 제목을 잘라서만 줬습니다. 그러면 썸네일에 제목이 또 적힙니다(사장님 지적).
  // 이제 **궁금증 문구를 앞에** 놓고, 제목에서 자른 것은 뒤에 둡니다.
  app.post("/api/thumb/suggest", (req, res) => {
    const b = req.body || {};
    const title = String(b.title || "");
    const s = thumbStrategy.strategize(title, String(b.body || ""));
    const curiosity = s.captions.filter((c) => !thumbStrategy.echoesTitle(c, title));
    res.json({
      ok: true,
      suggestions: [...new Set([...curiosity, ...thumbnail.suggestText(title)])].slice(0, 6),
      curiosity,
      fromTitle: thumbnail.suggestText(title),
    });
  });

  // 제목만 보고 "어떤 썸네일 구성이 눌릴지" — AI를 안 쓰니 공짜입니다.
  // 확장·화면이 사진을 올리기 전에 미리 보여드리는 용도입니다.
  app.post("/api/thumb/strategy", (req, res) => {
    const b = req.body || {};
    const s = thumbStrategy.strategize(String(b.title || ""), String(b.body || ""));
    res.json({ ok: true, ...s, mosaic: thumbStrategy.wantsMosaic(s.composition) });
  });

  // 실제로 만들기. 사진 1장이면 한 장짜리, 2장이면 비포/애프터.
  app.post(
    "/api/thumb",
    // ⚠️ consumeOnPass를 끕니다. 한도 확인만 먼저 하고, **실제로 사진이 나왔을 때**
    // 셉니다. 처음엔 그냥 gate로 세고 실패하면 되돌리게(-1) 했는데, 되돌리는 길이
    // 하나라도 새면 사장님 하루 몫이 조용히 깎입니다. 아예 안 세는 게 맞습니다.
    usage.gate("thumb", { consumeOnPass: false }),
    thumbUpload.fields([{ name: "before", maxCount: 1 }, { name: "after", maxCount: 1 }]),
    async (req, res) => {
      const f = req.files || {};
      const before = (f.before || [])[0];
      const after = (f.after || [])[0];
      const b = req.body || {};

      if (!before && !after) {
        return res.status(400).json({ error: "사진을 한 장 이상 올려주세요." });
      }

      const text = String(b.text || "").trim();
      const sub = String(b.sub || "").trim();
      const size = String(b.size || "square");
      const theme = String(b.theme || "black");
      // 얼굴 가리기 — 직접 만들 때도 켤 수 있게. 두 장이면 오른쪽(화제의 인물 자리)을 가립니다.
      const mosaic = b.mosaic === "on" || b.mosaic === "true" || b.mosaic === true;

      // 길다고 막지는 않습니다. 줄여서라도 넣고, 대신 알려드립니다.
      const warn = [];
      if (text.replace(/\s/g, "").length > 10) {
        warn.push(`문구가 ${text.replace(/\s/g, "").length}자입니다. 8자 안팎이 모바일에서 제일 잘 읽힙니다.`);
      }

      try {
        let buf;
        let mode;
        if (before && after) {
          mode = "beforeAfter";
          buf = await thumbnail.beforeAfter({
            beforeBuf: before.buffer,
            afterBuf: after.buffer,
            text,
            sub,
            size,
            theme,
            labels:
              b.labels === "off"
                ? null
                : { left: String(b.leftLabel || "BEFORE"), right: String(b.rightLabel || "AFTER") },
            mosaicSide: mosaic ? (b.mosaicSide === "left" ? "left" : "right") : null,
          });
        } else {
          mode = "single";
          buf = await thumbnail.single({
            buf: (before || after).buffer,
            text,
            sub,
            size,
            theme,
            position: b.position === "top" ? "top" : "bottom",
            mosaic,
          });
        }
        // 사진이 실제로 나온 뒤에 셉니다.
        usage.consume(req, "thumb");
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("X-Thumb-Mode", mode);
        // 경고는 헤더로 — 본문은 이미지라 JSON을 못 실습니다. 한글은 그대로 못 넣습니다.
        res.setHeader("Access-Control-Expose-Headers", "X-Thumb-Mode, X-Thumb-Warn");
        if (warn.length) res.setHeader("X-Thumb-Warn", encodeURIComponent(warn.join(" ")));
        res.send(buf);
      } catch (e) {
        // sharp가 못 읽는 파일(HEIC 등)이면 여기로 옵니다.
        res.status(400).json({
          error: "사진을 읽지 못했습니다. JPG나 PNG로 올려주세요. (아이폰 HEIC는 아직 못 읽습니다)",
        });
      }
    }
  );

  // ── 홈판 썸네일 · 자동 ──────────────────────────────────
  //
  // 수동 버전(/api/thumb)은 사장님이 사진 두 장을 직접 고릅니다.
  // 여기서는 본문에 이미 넣으신 사진들을 전부 받아서 AI가 고릅니다.
  //
  // 사진은 두 가지로 받습니다.
  //   imageUrls — 크롬 확장에서 씁니다. 글쓰기 창의 사진은 이미 네이버에
  //               올라가 있어서 주소만 넘기면 됩니다. 다시 올릴 필요가 없습니다.
  //   파일       — 화면에서 씁니다.
  //
  // ⚠️ AI를 쓰니 크레딧을 깎습니다. 사진 12장을 읽는 값이 나갑니다.
  app.post(
    "/api/thumb/auto",
    // ⚠️ 크레딧을 미리 깎지 않습니다. 한도만 먼저 보고, **사진이 실제로 나온 뒤에**
    // 깎습니다. 안 그러면 "사진을 올려주세요" 같은 오류에도 크레딧이 나갑니다.
    // 사용량 쪽에서 같은 실수를 한 번 고쳤는데 여기서 또 했습니다.
    usage.creditGate("thumbAuto", accounts, { consumeOnPass: false }),
    thumbAutoUpload.array("photos", 12),
    async (req, res) => {
      const b = req.body || {};
      const title = String(b.title || "");
      const body = String(b.body || "");
      const size = String(b.size || "square");
      const theme = String(b.theme || "black");
      const force = b.force === "single" || b.force === "beforeAfter" ? b.force : null;
      // 모자이크는 기본이 "규칙에 맡김"입니다. 사장님이 켜고 끄실 때만 넘어옵니다.
      const mosaic = b.mosaic === "on" || b.mosaic === "true" || b.mosaic === true ? true
        : b.mosaic === "off" || b.mosaic === "false" || b.mosaic === false ? false
        : undefined;

      let buffers = (req.files || []).map((f) => f.buffer);

      // 주소로 넘어온 경우 — 우리 서버가 받아옵니다.
      if (!buffers.length && b.imageUrls) {
        let urls;
        try {
          urls = typeof b.imageUrls === "string" ? JSON.parse(b.imageUrls) : b.imageUrls;
        } catch {
          return res.status(400).json({ error: "사진 주소 목록을 읽지 못했습니다." });
        }
        if (!Array.isArray(urls) || !urls.length) {
          return res.status(400).json({ error: "본문에서 사진을 찾지 못했습니다. 사진을 먼저 넣어주세요." });
        }
        const bad = urls.filter((u) => !thumbAuto.isAllowedUrl(u));
        if (bad.length === urls.length) {
          return res.status(400).json({
            error: "네이버에 올라간 사진만 받아올 수 있습니다. 사진을 본문에 넣으면 자동으로 올라갑니다.",
          });
        }
        const good = urls.filter((u) => thumbAuto.isAllowedUrl(u)).slice(0, thumbAuto.MAX_PHOTOS);
        // ⚠️ 한꺼번에 12장을 부르면 네이버가 막습니다. 실패한 건 조용히 빼고 갑니다.
        const got = await Promise.all(
          good.map((u) => thumbAuto.fetchImage(u).catch(() => null))
        );
        buffers = got.filter(Boolean);
        if (!buffers.length) {
          return res.status(400).json({ error: "사진을 받아오지 못했습니다. 잠시 뒤에 다시 해주세요." });
        }
      }

      if (!buffers.length) {
        return res.status(400).json({ error: "사진을 올려주세요." });
      }

      try {
        const r = await thumbAuto.run(buffers, { title, body, size, theme, force, mosaic });
        // 여기까지 왔으면 썸네일이 실제로 나왔습니다. 이제 깎습니다.
        usage.chargeCredits(req, "thumbAuto");
        res.json({
          ok: true,
          plan: r.plan,
          ba: r.ba,
          strategy: r.strategy,
          considered: r.considered,
          // 사진은 본문에 JSON으로 실어야 해서 base64로 보냅니다.
          image: "data:image/jpeg;base64," + r.jpeg.toString("base64"),
          usage: req.usage,
        });
      } catch (e) {
        res.status(502).json({ error: e.message || "자동으로 고르지 못했습니다." });
      }
    }
  );

  /**
   * ── 썸네일 후보 4개 (패턴 추천) ─────────────────────────
   *
   * 홈판 상위 블로그가 실제로 쓰는 10가지 틀 중, 이 글에 맞는 것 4개를 골라 **그려서** 돌려줍니다.
   * 사장님이 그중 하나를 고르시면 됩니다.
   *
   * ⚠️ **AI를 안 씁니다. 값이 0원입니다.** 틀 고르기는 제목 낱말 규칙, 그리기는 픽셀 계산입니다.
   *    (기존 /api/thumb/auto는 AI가 사진을 고르느라 크레딧이 나갑니다 — 이건 다릅니다)
   *
   * ⚠️ page를 넘기면 다른 4개가 나옵니다(새로고침). 음수도 됩니다(되돌아가기).
   *    끝까지 가면 처음으로 돌아옵니다 — 막다른 길을 만들지 않습니다.
   *
   * ⚠️ 만들 수 없는 틀은 애초에 추천하지 않습니다(2분할은 사진 2장, 콜라주는 3장).
   *    고른 뒤에 "못 만듭니다"라고 말하는 게 제일 나쁩니다.
   */
  app.post(
    "/api/thumb/patterns",
    thumbAutoUpload.array("photos", 12),
    async (req, res) => {
      const b = req.body || {};
      const title = String(b.title || "");
      const body = String(b.body || "");
      const size = String(b.size || "square");
      const page = Number(b.page || 0) || 0;

      // 사진 받기 — 화면에서는 파일, 확장에서는 네이버 주소
      let buffers = (req.files || []).map((f) => f.buffer);
      if (!buffers.length && b.imageUrls) {
        let urls;
        try {
          urls = typeof b.imageUrls === "string" ? JSON.parse(b.imageUrls) : b.imageUrls;
        } catch {
          return res.status(400).json({ error: "사진 주소 목록을 읽지 못했습니다." });
        }
        if (!Array.isArray(urls) || !urls.length) {
          return res.status(400).json({ error: "본문에서 사진을 찾지 못했습니다. 사진을 먼저 넣어주세요." });
        }
        const good = urls.filter((u) => thumbAuto.isAllowedUrl(u)).slice(0, thumbAuto.MAX_PHOTOS);
        const got = await Promise.all(good.map((u) => thumbAuto.fetchImage(u).catch(() => null)));
        buffers = got.filter(Boolean);
      }
      if (!buffers.length) return res.status(400).json({ error: "사진을 올려주세요." });

      // 문구는 제목 분석에서 가져옵니다 — 제목을 되풀이하지 않는 궁금증 문구
      const strategy = thumbStrategy.strategize(title, body);
      const caption = (strategy.captions || [])[0] || "";
      const rec = thumbPatterns.pick(title, body, buffers.length, page);
      // 말풍선 대사 — **제목에 따옴표로 있는 말만** 씁니다. 지어낸 대사는 명예훼손이 됩니다.
      const quote = thumbPatterns.quoteOf(title);
      // 채널 표식 — 확장이 블로그 아이디를 넘겨줍니다. 없으면 안 그립니다.
      const brand = String(b.brand || "").slice(0, 20);

      // 틀마다 색을 다르게 줍니다 — 4개가 한눈에 구분되게
      const THEMES = ["black", "yellow", "red", "white"];
      const items = [];
      for (let i = 0; i < rec.items.length; i++) {
        const c = rec.items[i];
        try {
          const jpeg = await thumbnail.renderPattern(c.pattern, buffers, {
            text: caption, size, theme: THEMES[i % THEMES.length], quote, brand,
          });
          items.push({
            id: c.pattern.id,
            label: c.pattern.label,
            reason: c.reason,
            why: c.pattern.why,
            seen: c.pattern.seen,
            theme: THEMES[i % THEMES.length],
            image: "data:image/jpeg;base64," + jpeg.toString("base64"),
          });
        } catch (e) {
          // 못 그린 틀은 조용히 빼고 갑니다 — 깨진 칸을 보여주느니 3개를 보여주는 게 낫습니다
          items.push({ id: c.pattern.id, label: c.pattern.label, reason: c.reason, failed: e.message || "못 그렸습니다" });
        }
      }

      res.json({
        ok: true,
        items,
        page: rec.page,
        pages: rec.pages,
        total: rec.total,
        caption,
        strategy,
        photoCount: buffers.length,
      });
    }
  );

  // 제목만 보고 전후 비교인지 — AI를 안 쓰니 공짜입니다.
  app.post("/api/thumb/mode", (req, res) => {
    const { title, body } = req.body || {};
    res.json({ ok: true, ...thumbAuto.looksBeforeAfter(title || "", body || "") });
  });

  // ── 자동 강조·인용구·소제목 ─────────────────────────────
  //
  // ⚠️ AI가 본문을 읽고 어디를 강조할지 정합니다. 크레딧이 나갑니다.
  // 다만 **성공한 뒤에** 깎습니다 (자동 썸네일에서 배운 것).
  app.post(
    "/api/emphasis",
    usage.creditGate("emphasis", accounts, { consumeOnPass: false }),
    async (req, res) => {
      const { title, body } = req.body || {};
      try {
        const r = await emphasis.plan({ title, body });
        if (!r.ok) return res.status(400).json({ error: r.why, ...r });
        usage.chargeCredits(req, "emphasis");
        res.json({ ...r, usage: req.usage });
      } catch (e) {
        res.status(502).json({ error: e.message || "강조할 자리를 못 골랐습니다." });
      }
    }
  );

  // 실측 근거 — 화면에서 "왜 이 개수인가"를 보여줄 때 씁니다. AI를 안 써서 공짜입니다.
  app.get("/api/emphasis/rules", (req, res) => {
    res.json({
      measured: emphasis.MEASURED,
      per1000: emphasis.PER_1000,
      kinds: emphasis.KINDS,
      subheadSize: emphasis.SUBHEAD_SIZE,
    });
  });

  // ── 고객용 성과 보고서 ─────────────────────────────────
  //
  // ⚠️ 브랜드 블로그 대행 파일럿용입니다. 업주에게 링크 하나로 성적표를 보냅니다.
  // 실측만 씁니다 — 순위는 그 시각에 실제로 검색한 값, 방문자는 공개값.
  //
  // ⚠️ 만들기는 **주인만** 됩니다. 아무나 만들 수 있으면 남의 블로그로
  // 보고서를 찍어 사칭 영업을 할 수 있습니다. 보기는 링크를 아는 사람 누구나.
  const clientReport = require("./clientReport");

  const OWNER_SET = new Set(
    String(process.env.OWNER_EMAIL || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  );
  const isOwnerReq = (req) => !!(req.user && OWNER_SET.has(String(req.user.email).toLowerCase()));

  app.post("/api/report/client", async (req, res) => {
    if (!isOwnerReq(req)) return res.status(403).json({ error: "주인 계정만 보고서를 만들 수 있습니다." });
    const { blogId, storeName, note, posts, demo, placeKeywords, placeId, placePath } = req.body || {};
    try {
      const data = demo ? clientReport.demoData() : await clientReport.collect(blogId, {
        posts: Math.max(3, Math.min(10, Number(posts) || 6)),
        storeName, note,
        // 플레이스 순위 — "역삼동 칼국수,역삼역 점심" 처럼 쉼표로 최대 6개
        placeKeywords, placeId, placePath,
      });
      const id = clientReport.create(data, { owner: req.user.email });
      res.json({ ok: true, id, url: `/cr/${id}`, measured: !demo });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/cr/:id", (req, res) => {
    const item = clientReport.get(req.params.id);
    if (!item) {
      // 무료 서버는 배포마다 디스크가 지워집니다. 보고서도 사라질 수 있습니다.
      // 업주가 죽은 링크를 보게 하느니, 무슨 일인지 말해줍니다.
      return res.status(404).send(
        `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>보고서를 찾을 수 없습니다</title></head>` +
        `<body style="font-family:sans-serif;max-width:480px;margin:80px auto;padding:0 20px;line-height:1.8;color:#333">` +
        `<h2>이 보고서는 기간이 지나 정리되었습니다</h2>` +
        `<p>담당자에게 새 보고서 링크를 요청해 주세요. 수치는 전부 실측이라 언제든 다시 만들 수 있습니다.</p></body></html>`
      );
    }
    res.type("html").send(clientReport.render(item));
  });

  // ── 브랜드 설정 ────────────────────────────────────────
  //
  // ⚠️ 경쟁 서비스(adport.kr)의 "셋업 완성도 79% · 15/19 완료" 화면에서 가져온 생각입니다.
  // 설정에서 막히는 진짜 이유는 **뭘 더 해야 하는지 모르는 것**입니다.
  // 퍼센트와 목록이 그걸 없앱니다.
  //
  // ⚠️ AI를 안 씁니다. 값이 0원입니다.
  const brandKit = require("./brandKit");

  app.get("/api/brand", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    // 블로그 주소는 계정에 이미 있습니다. getBrandKit이 같이 넣어줍니다.
    res.json(brandKit.status(accounts.getBrandKit(req.user.email) || {}));
  });

  app.post("/api/brand", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    const patch = req.body || {};

    // ⚠️ 아는 열쇠만 받습니다. 아무 이름이나 받으면 계정 안에 쓰레기가 쌓이고,
    // 나중에 plan 같은 중요한 값을 덮어쓰는 길이 열립니다.
    const allowed = new Set(brandKit.ITEMS.map((i) => i.key));
    const clean = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!allowed.has(k) || k === "blogId") continue;
      // 그림은 여기로 안 받습니다. 따로 올립니다.
      if (typeof v === "string" && v.length > 2000) continue;
      clean[k] = v;
    }

    const merged = accounts.setBrandKit(req.user.email, clean);
    res.json(brandKit.status(merged || {}));
  });

  /**
   * 로고에서 브랜드색을 뽑습니다.
   *
   * ⚠️ 저쪽은 "AI 팔레트 분석"이라고 합니다. AI가 필요 없습니다.
   * 그림을 32×32로 줄이면 색이 뭉쳐집니다. 그걸 세면 끝입니다. 값이 0원입니다.
   */
  app.post("/api/brand/palette", logoUpload.single("logo"), async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다." });
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: "로고 그림을 올려주세요." });
    try {
      res.json(await brandKit.paletteFromLogo(req.file.buffer));
    } catch (e) {
      res.status(400).json({ error: "그림을 못 읽었습니다. jpg·png 로 올려주세요." });
    }
  });

  // ── 실측 기준값 ────────────────────────────────────────
  //
  // ⚠️ 숫자는 homefeedRules 한 곳에만 둡니다. 확장 프로그램에 또 적어두면
  // 언젠가 어긋나고, 어느 쪽이 맞는지 아무도 모르게 됩니다.
  // AI를 안 씁니다. 값이 0원입니다.
  app.get("/api/homefeed/rules", (req, res) => {
    const r = require("./homefeedRules");
    res.json({
      evidence: r.EVIDENCE || null,
      byTopic: (r.BODY && r.BODY.byTopic) || null,
      universal: (r.BODY && r.BODY.universal) || null,
      dontBother: (r.BODY && r.BODY.dontBother) || null,
      // 2026-08-31 메이트·홈판 실측 — 갈래별 본문 수치·제목 문법·벌어진 곳
      mate: r.MATE || null,
      // 썸네일 실측 — 홈판은 썸네일이 제목보다 먼저 보이는 자리입니다
      thumb: r.THUMB || null,
    });
  });

  // ── 내 블로그 글 목록 ───────────────────────────────────
  //
  // ⚠️ "함께 보면 좋은 글" 링크를 붙이려면 내가 뭘 썼는지 알아야 합니다.
  // AI를 안 씁니다. 네이버에서 목록만 받아옵니다. 값이 0원입니다.
  //
  // ⚠️ 지금 쓰는 글과 **주제가 가까운 것**을 위로 올립니다.
  // 아무 글이나 붙이면 읽는 사람이 안 누릅니다. 링크는 개수가 아니라 관련성입니다.
  app.post("/api/my-posts", async (req, res) => {
    const { blogId, title, exclude } = req.body || {};
    const id = naverData.parseBlogId(blogId);
    if (!id) return res.status(400).json({ error: "블로그 아이디를 확인해 주세요." });

    try {
      const r = await naverData.fetchPostList(id, { countPerPage: 30 });
      const posts = (r.posts || r.items || r || [])
        .map((p) => ({
          logNo: String(p.logNo || p.no || ""),
          title: String(p.title || "").replace(/<[^>]+>/g, "").trim(),
          url: `https://blog.naver.com/${id}/${p.logNo || p.no}`,
          at: p.addDate || p.date || null,
        }))
        .filter((p) => p.logNo && p.title);

      // 지금 쓰는 글은 뺍니다
      const skip = new Set(String(exclude || "").split(",").map((x) => x.trim()).filter(Boolean));
      const rest = posts.filter((p) => !skip.has(p.logNo));

      /**
       * 같은 갈래 4개 — 사장님 요청의 원형입니다:
       * "연예인 뷰티 글엔 뷰티 4개, 패션 글엔 패션 4개, 최근 발행 순서, 모바일 링크".
       * 갈래를 못 가리면(모름) 억지로 안 넣고, 아래 관련/최신으로 내려갑니다.
       * 순서 주의: rest는 곧 관련도순으로 재정렬되므로 **그 전에** 최근순으로 고릅니다.
       */
      const cat = postCategory.classify(title);
      const sameCategory = cat.id
        ? postCategory.pickSameCategory(rest, cat.id, { limit: 4 }).map((p) => ({
            ...p,
            url: postCategory.mobileUrl(id, p.logNo),   // 모바일 링크로 — 사장님 지정
          }))
        : [];

      // 낱말이 겹치는 만큼 점수를 줍니다. 간단하지만 아무 글이나 붙이는 것보단 훨씬 낫습니다.
      const words = String(title || "")
        .replace(/[""''"'.,!?…\-~\[\]()]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2);
      for (const p of rest) {
        p.score = words.filter((w) => p.title.includes(w)).length;
      }
      rest.sort((a, b) => b.score - a.score);

      res.json({
        ok: true,
        blogId: id,
        total: posts.length,
        // 같은 갈래가 최우선 — 뷰티 글 밑엔 뷰티, 패션 글 밑엔 패션 (최근순, 모바일 링크).
        category: cat.id ? { id: cat.id, why: cat.why } : null,
        sameCategory,
        // 겹치는 게 있는 것만 "관련"으로 봅니다. 없으면 최신 글을 줍니다.
        related: rest.filter((p) => p.score > 0).slice(0, 6),
        recent: rest.slice(0, 6),
        note: "제목에 겹치는 낱말이 많은 순입니다. AI를 안 써서 값이 안 나갑니다.",
      });
    } catch (e) {
      res.status(502).json({ error: "글 목록을 못 받았습니다. 잠시 뒤에 다시 해주세요." });
    }
  });

  // ── 줄바꿈 ─────────────────────────────────────────────
  //
  // ⚠️ AI를 안 씁니다. 그래서 사용량도 안 세고 크레딧도 안 깎습니다.
  // 자를 자리는 국어 문법으로 정해져 있어서 물어볼 필요가 없습니다.
  // 늑대플은 이걸 "AI 줄바꿈"이라고 부르는데, AI를 태우면 가끔 문장을 고쳐서
  // 돌려줍니다. 자르랬더니 내용이 바뀌면 그건 줄바꿈이 아닙니다.
  app.post("/api/linebreak", (req, res) => {
    const { body, blankLines } = req.body || {};
    if (!String(body || "").trim()) return res.status(400).json({ error: "본문을 넣어주세요." });
    const r = lineBreak.rebreak(body, { blankLines: blankLines !== false });
    if (!r.ok) return res.status(400).json({ error: r.why, lost: r.lost });
    res.json(r);
  });

  // ── 맞춤법 ─────────────────────────────────────────────
  //
  // ⚠️ AI도 안 쓰고 남의 검사기도 안 부릅니다. 그래서 사용량을 안 셉니다.
  // 규칙으로 잡으니 즉시 나오고, 사장님 글이 밖으로 안 나갑니다.
  app.post("/api/spellcheck", (req, res) => {
    const { text, body } = req.body || {};
    const t = String(text || body || "");
    if (!t.trim()) return res.status(400).json({ error: "검사할 글을 넣어주세요." });
    res.json(spellCheck.check(t));
  });

  // 어떤 규칙이 있는지 — 화면에서 "무엇을 잡아주나" 보여줄 때 씁니다.
  app.get("/api/spellcheck/rules", (req, res) => {
    res.json({
      rules: spellCheck.RULES.map((r) => ({ id: r.id, why: r.why, sure: !!r.sure })),
    });
  });

  // ── 사용량 ─────────────────────────────────────────────
  app.get("/api/usage", (req, res) => res.json(usage.summary(req)));

  console.log("[saas] 회원·요금제·진단·순위추적 라우트를 붙였습니다.");
};

module.exports.requireLogin = requireLogin;
module.exports.requireAdmin = requireAdmin;
