// 제휴 링크 관리 — "어느 영상이 얼마 벌었나"를 알기 위한 장치 (2026-09-02)
//
// ⚠️ 왜 인포크링크를 안 쓰나
// 영상 33편 분석에서 다들 인포크링크를 씁니다. 그런데 **공개 API가 없습니다.**
// 남의 서비스에 링크를 맡기면 우리 장부는 영영 반쪽입니다 —
// "이번 달 32만원 들어왔다"는 알아도 "어느 영상이 벌었나"는 모릅니다.
//
// ⚠️ 그래서 쿠팡 파트너스의 subId를 씁니다.
// 쿠팡 링크에 subId를 붙이면 **정산 리포트에 그 값이 그대로 찍혀 나옵니다.**
// 우리는 거기에 **콘텐츠 ID(gw_analytics 장부의 id)**를 넣습니다.
// 그러면 리포트를 가져오는 것만으로 "c-abc123 영상이 3만 2천원 벌었다"가 됩니다.
// 인포크링크가 해주는 일(모아보기)은 우리가 하고, 추적은 인포크가 못 하는 것까지 합니다.
//
// ⚠️ 대가성 문구는 법적 필수입니다(공정위 심사지침).
// 빼먹으면 과태료 대상입니다. 그래서 링크를 만들 때 **항상 같이** 나갑니다.
// 문구를 지우고 링크만 쓰는 경로를 만들지 않았습니다.

const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "..", "data");
const FILE = path.join(DATA, "affiliate-links.json");

/** 공정위 경제적 이해관계 표시 — threadShop.js와 같은 문구를 씁니다. 갈라지면 안 됩니다. */
const DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

const load = () => {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
};
const save = (rows) => {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 1), "utf8");
};

/**
 * subId는 쿠팡이 영문·숫자와 일부 기호만 받습니다.
 * 우리 콘텐츠 ID는 이미 영숫자라 대개 그대로 통과하지만, 방어적으로 씻어냅니다.
 */
const cleanSubId = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);

/**
 * 쿠팡 링크에 subId를 붙입니다.
 *
 * ⚠️ 이미 subId가 있으면 덮어쓰지 않습니다. 사장님이 손으로 만든 링크를
 * 이 함수가 조용히 바꿔버리면, 그 링크로 들어온 수익이 엉뚱한 콘텐츠에 붙습니다.
 */
function withSubId(url, subId) {
  const sid = cleanSubId(subId);
  if (!url || !sid) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.get("subId")) u.searchParams.set("subId", sid);
    return u.toString();
  } catch {
    // URL로 파싱이 안 되는 짧은 링크(예: link.coupang.com/a/xxxx)도 있습니다.
    if (/[?&]subId=/.test(url)) return url;
    return url + (url.includes("?") ? "&" : "?") + "subId=" + sid;
  }
}

/**
 * 링크 한 건 등록.
 *
 * @param {object} o
 * @param {string} o.contentId  gw_analytics 장부의 콘텐츠 id — 이게 subId가 됩니다
 * @param {string} o.url        쿠팡 파트너스에서 만든 원본 링크
 * @param {string} [o.product]  제품명 (사람이 알아보려고)
 * @param {string} [o.channel]  youtube|instagram|threads|clip|tiktok|facebook|kakao
 * @param {number} [o.price]    가격 (수익 추정용)
 */
function register({ contentId, url, product = "", channel = "", price = null, note = "" }) {
  if (!contentId) throw new Error("contentId가 있어야 추적이 됩니다. 장부의 콘텐츠 id를 넣으세요.");
  if (!url) throw new Error("쿠팡 링크가 없습니다.");

  const rows = load();
  const subId = cleanSubId(contentId);
  const tracked = withSubId(url, subId);

  /**
   * 같은 콘텐츠면 갱신합니다.
   *
   * ⚠️ 2026-09-01 수정: 전에는 **contentId와 제품명이 둘 다 같을 때만** 갱신했습니다.
   * 그래서 제품명을 정확한 이름으로 고쳐 다시 등록하니 옛 행이 그대로 남아 중복이 났습니다
   * (실측: 2건 등록했는데 4건이 쌓임). 정산 대조 때 같은 subId가 두 줄로 잡히면 매출이 흐려집니다.
   * contentId 하나가 콘텐츠 하나이므로 **contentId만으로 찾습니다.**
   */
  const i = rows.findIndex((r) => r.contentId === contentId);
  const rec = {
    contentId, subId, product, channel,
    url: tracked, originalUrl: url,
    price: price == null ? null : +price,
    note,
    createdAt: rows[i]?.createdAt || Date.now(),
    updatedAt: Date.now(),
    revenue: rows[i]?.revenue ?? 0,     // 정산 반영분 누적
    orders: rows[i]?.orders ?? 0,
  };
  if (i >= 0) rows[i] = rec; else rows.push(rec);
  save(rows);
  return rec;
}

/**
 * 플랫폼별로 붙여넣을 블록을 만듭니다.
 *
 * ⚠️ 플랫폼마다 링크가 먹히는 자리가 다릅니다 —
 * 인스타는 본문에 링크가 안 걸려서 프로필/댓글로 보내야 하고,
 * 유튜브는 설명란, 스레드는 댓글이 관행입니다. 그래서 안내 문구가 다릅니다.
 */
function block(rec, channel = rec.channel) {
  const d = DISCLOSURE;
  switch (channel) {
    case "youtube":
      return `${d}\n\n▼ ${rec.product || "제품"} 보러가기\n${rec.url}`;
    case "instagram":
      return `${d}\n\n제품은 프로필 링크에서 확인하실 수 있어요.\n(링크: ${rec.url})`;
    case "threads":
      // 스레드는 본문에 링크를 넣으면 도달이 떨어집니다. 댓글에 답니다.
      return { post: d, comment: `${rec.product || "제품"} 링크\n${rec.url}` };
    case "clip":
    case "tiktok":
      return `${d}\n\n${rec.product || "제품"} → ${rec.url}`;
    default:
      return `${d}\n\n${rec.url}`;
  }
}

/** 콘텐츠 하나에 걸린 링크들 */
const forContent = (contentId) => load().filter((r) => r.contentId === contentId);

/**
 * 쿠팡 정산 리포트를 장부에 반영합니다.
 *
 * ⚠️ 쿠팡 파트너스는 리포트를 CSV로 내려줍니다. 컬럼 이름이 개편마다 바뀌어서
 * 이름을 고정하지 않고 **subId처럼 생긴 열**과 **금액처럼 생긴 열**을 찾아 씁니다.
 * 못 찾으면 조용히 0으로 처리하지 않고 알려줍니다 — 틀린 숫자보다 없는 게 낫습니다.
 *
 * @param {string} csvText 쿠팡 파트너스에서 받은 리포트 원문
 * @returns {{matched, unmatched, total, rows}} 반영 결과
 */
function applyReport(csvText) {
  const lines = String(csvText).split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("리포트가 비어 있습니다.");

  /**
   * CSV 한 줄 쪼개기 — 따옴표 안의 쉼표를 지켜야 합니다.
   *
   * ⚠️ 처음엔 l.split(",")로 했다가 실측에서 터졌습니다.
   * 쿠팡은 금액을 "12,400"처럼 **따옴표 안에 쉼표를 넣어** 내려줍니다.
   * 단순 split이면 열이 통째로 밀려서, 주문수 칸에 날짜 숫자가 들어가
   * "주문 40,521,802건" 같은 값이 나왔습니다. 수익 귀속이 조용히 틀어집니다.
   */
  const split = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // "" 는 따옴표 한 개를 뜻합니다(CSV 규칙).
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]);

  /**
   * 열 찾기 — 날짜 열을 먼저 걸러냅니다.
   *
   * ⚠️ 실측에서 터진 부분입니다. "주문수"를 찾으려고 /주문/으로 봤더니
   * **"주문일"이 먼저 걸려서 날짜(20260901)를 주문 건수로 읽었습니다.**
   * 두 줄이면 40,521,802건이 됩니다. 금액 열도 "정산일" 때문에 같은 사고가 납니다.
   * 그래서 날짜처럼 생긴 이름은 후보에서 뺍니다.
   */
  const DATE_LIKE = /일자|날짜|일시|date|시각/i;
  const findCol = (re) => head.findIndex((h) => re.test(h) && !DATE_LIKE.test(h) && !/일$/.test(h));

  const cSub = findCol(/sub_?id|서브\s*아이디|추적/i);
  const cAmt = findCol(/커미션|수수료|commission|정산금|수익금|수익$/i);
  const cOrd = findCol(/주문수|주문건|건수|order.?count|수량/i);

  if (cSub < 0) throw new Error(`리포트에서 subId 열을 못 찾았습니다. 열 이름: ${head.join(" | ")}`);
  if (cAmt < 0) throw new Error(`리포트에서 수수료 열을 못 찾았습니다. 열 이름: ${head.join(" | ")}`);

  const rows = load();
  const byId = new Map(rows.map((r) => [r.subId, r]));
  let matched = 0, total = 0;
  const unmatched = [];

  for (const line of lines.slice(1)) {
    const c = split(line);
    const sub = cleanSubId(c[cSub]);
    const amt = Number(String(c[cAmt] || "").replace(/[^\d.-]/g, "")) || 0;
    const ord = cOrd >= 0 ? Number(String(c[cOrd] || "").replace(/[^\d]/g, "")) || 0 : 0;
    if (!sub) continue;
    total += amt;
    const r = byId.get(sub);
    if (!r) { unmatched.push({ subId: sub, amount: amt }); continue; }
    r.revenue = (r.revenue || 0) + amt;
    r.orders = (r.orders || 0) + ord;
    r.settledAt = Date.now();
    matched++;
  }
  save(rows);
  return { matched, unmatched, total, rows: rows.filter((r) => r.revenue > 0) };
}

/** 많이 번 순 — 어떤 소재가 실제로 팔렸는지 봅니다. */
function top(n = 10) {
  return load()
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}

module.exports = {
  DISCLOSURE, register, block, forContent, applyReport, top,
  withSubId, load, FILE,
};
