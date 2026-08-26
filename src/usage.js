/**
 * 사용량 제한.
 *
 * ⚠️ 이 파일이 없으면 요금제가 그냥 장식입니다. 무료 회원이 프로 기능을 다 쓰는데
 * 아무도 안 막으면 돈을 낼 이유가 없습니다. **화면에서 감추는 것과 실제로 막는 것은 다릅니다.**
 * 그래서 제한은 반드시 서버에서 겁니다. 화면 버튼을 회색으로 만드는 걸로는 부족합니다.
 *
 * ⚠️ 저장은 메모리 + 파일입니다. 무료 서버가 재시작하면 그날 사용량이 초기화됩니다.
 * 즉 재시작을 노리면 무료로 더 쓸 수 있습니다. 알고도 이렇게 둡니다.
 *   - 재시작은 우리가 배포할 때나 일어나고, 손님이 마음대로 일으킬 수 없습니다.
 *   - 여기서 새는 건 우리 서버 품이지 현금이 아닙니다(AI 크레딧만 예외).
 *   - AI 크레딧은 실제로 돈이 나가므로 **계정 파일에 함께 기록**해서 재시작에도 남깁니다.
 * 유료 회원이 늘어서 이게 문제가 되면 그때 DB를 붙입니다. 지금 붙이면 과합니다.
 */

const fs = require("fs");
const path = require("path");
const { getPlan, CREDIT_COST } = require("./plans");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "usage.json");

// key = `${who}:${feature}:${YYYY-MM-DD}` → 횟수
let daily = {};
// key = `${who}:${feature}` → [타임스탬프]  (분당 제한용, 메모리에만)
const minuteLog = new Map();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    daily = raw.daily || {};
  } catch {
    daily = {};
  }
  pruneOldDays();
}

let saveTimer = null;
function save() {
  // 요청마다 파일을 쓰면 느립니다. 2초 모아서 한 번 씁니다.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify({ daily }, null, 0));
    } catch (e) {
      console.warn("[usage] 저장 실패:", e.message);
    }
  }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

/** 어제 이전 기록은 버립니다. 안 그러면 파일이 계속 커집니다. */
function pruneOldDays() {
  const today = todayStr();
  let removed = 0;
  for (const k of Object.keys(daily)) {
    if (!k.endsWith(`:${today}`)) {
      delete daily[k];
      removed++;
    }
  }
  if (removed) save();
}

function todayStr() {
  // ⚠️ 한국 시간 기준으로 하루를 끊습니다. 서버가 UTC면 오전 9시에 초기화돼서
  // 손님이 "아침에 갑자기 횟수가 찼다"고 느낍니다.
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

load();
// 하루가 바뀌면 정리합니다.
setInterval(pruneOldDays, 30 * 60 * 1000).unref?.();

/** 로그인한 사람은 이메일로, 비회원은 IP로 셉니다. */
function identityOf(req) {
  if (req.user && req.user.email) return `u:${req.user.email}`;
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "unknown";
  return `ip:${ip}`;
}

/**
 * 쓸 수 있는지 확인만 합니다(차감 안 함).
 * 반환: { allowed, used, limit, why, resetHint }
 */
function check(req, feature) {
  const who = identityOf(req);
  const planId = req.user ? req.user.plan : "free";
  const limit = getPlan(planId).limits[feature];
  if (!limit) return { allowed: true };

  // 분당 제한
  if (limit.perMinute != null) {
    const key = `${who}:${feature}`;
    const now = Date.now();
    const log = (minuteLog.get(key) || []).filter((t) => now - t < 60000);
    minuteLog.set(key, log);
    if (log.length >= limit.perMinute) {
      const waitSec = Math.ceil((60000 - (now - log[0])) / 1000);
      return {
        allowed: false,
        used: log.length,
        limit: limit.perMinute,
        unit: "분",
        why: `분당 ${limit.perMinute}회까지 쓸 수 있습니다. ${waitSec}초 뒤에 다시 해주세요.`,
        upgrade: planId === "free",
      };
    }
    return { allowed: true, used: log.length, limit: limit.perMinute, unit: "분" };
  }

  // 하루 제한
  if (limit.perDay != null) {
    const key = `${who}:${feature}:${todayStr()}`;
    const used = daily[key] || 0;
    if (used >= limit.perDay) {
      return {
        allowed: false,
        used,
        limit: limit.perDay,
        unit: "일",
        why:
          limit.perDay === 0
            ? "이 기능은 유료 이용권이 필요합니다."
            : `오늘 ${limit.perDay}회를 다 쓰셨습니다. 내일 다시 열립니다.`,
        upgrade: true,
      };
    }
    return { allowed: true, used, limit: limit.perDay, unit: "일" };
  }

  return { allowed: true };
}

/** 실제로 한 번 썼다고 기록합니다. */
function consume(req, feature, n = 1) {
  const who = identityOf(req);
  const planId = req.user ? req.user.plan : "free";
  const limit = getPlan(planId).limits[feature];
  if (!limit) return;

  if (limit.perMinute != null) {
    const key = `${who}:${feature}`;
    const log = minuteLog.get(key) || [];
    for (let i = 0; i < n; i++) log.push(Date.now());
    minuteLog.set(key, log);
    return;
  }
  if (limit.perDay != null) {
    const key = `${who}:${feature}:${todayStr()}`;
    daily[key] = (daily[key] || 0) + n;
    save();
  }
}

/**
 * 익스프레스 미들웨어. 라우트 앞에 끼워서 씁니다.
 *   app.post("/api/x", gate("diagnose"), handler)
 * 통과하면 req.usage에 남은 횟수가 들어갑니다.
 */
function gate(feature, { consumeOnPass = true } = {}) {
  return (req, res, next) => {
    const r = check(req, feature);
    if (!r.allowed) {
      return res.status(429).json({
        error: r.why,
        limit: r.limit,
        used: r.used,
        unit: r.unit,
        upgrade: r.upgrade ? "/pricing.html" : undefined,
      });
    }
    if (consumeOnPass) consume(req, feature);
    req.usage = { feature, used: (r.used || 0) + (consumeOnPass ? 1 : 0), limit: r.limit, unit: r.unit };
    next();
  };
}

/**
 * AI 크레딧 — 이건 실제로 돈이 나가므로 계정에 기록합니다.
 * accounts.updateUser를 주입받아서 씁니다(순환 참조를 피하려고).
 */
function creditGate(action, accounts) {
  const cost = CREDIT_COST[action] || 1;
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "로그인이 필요합니다.", login: "/login.html" });
    }
    const limit = getPlan(req.user.plan).limits.aiCredits;
    const perDay = limit ? limit.perDay : 0;
    if (perDay <= 0) {
      return res.status(402).json({
        error: "AI 기능은 유료 이용권이 필요합니다.",
        upgrade: "/pricing.html",
      });
    }
    const key = `u:${req.user.email}:aiCredits:${todayStr()}`;
    const used = daily[key] || 0;
    if (used + cost > perDay) {
      return res.status(429).json({
        error: `오늘 AI 크레딧을 다 쓰셨습니다. (${used}/${perDay}, 이 작업은 ${cost} 필요)`,
        used,
        limit: perDay,
        cost,
        upgrade: "/pricing.html",
      });
    }
    daily[key] = used + cost;
    save();
    req.usage = { feature: "aiCredits", used: used + cost, limit: perDay, cost };
    next();
  };
}

/** 지금 남은 양을 한눈에 — 화면 상단에 계속 띄워둘 용도. */
function summary(req) {
  const planId = req.user ? req.user.plan : "free";
  const plan = getPlan(planId);
  const who = identityOf(req);
  const out = { plan: planId, planName: plan.name, items: {} };
  for (const [feature, limit] of Object.entries(plan.limits)) {
    if (limit && limit.perDay != null) {
      const used = daily[`${who}:${feature}:${todayStr()}`] || 0;
      out.items[feature] = { used, limit: limit.perDay, left: Math.max(0, limit.perDay - used), unit: "일" };
    } else if (limit && limit.perMinute != null) {
      const log = (minuteLog.get(`${who}:${feature}`) || []).filter((t) => Date.now() - t < 60000);
      out.items[feature] = { used: log.length, limit: limit.perMinute, left: Math.max(0, limit.perMinute - log.length), unit: "분" };
    } else if (typeof limit === "number") {
      out.items[feature] = { limit };
    }
  }
  return out;
}

module.exports = { gate, creditGate, check, consume, summary, identityOf, todayStr };
