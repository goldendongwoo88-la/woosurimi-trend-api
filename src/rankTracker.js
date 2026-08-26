/**
 * 키워드 순위 추적 · 누락 감시.
 *
 * ⚠️ 이게 이 사업에서 **사람을 붙잡아 두는 기능**입니다. 이유가 분명합니다.
 * 진단은 한 번 보면 끝입니다. 궁금증이 풀리면 다시 안 옵니다.
 * 그런데 "내 글이 어제 12위였는데 오늘 8위"는 매일 확인하고 싶어집니다.
 * 블릿AI가 첫 화면에 "김포 카페 추천 12위 → 2위"를 걸어둔 이유가 이겁니다.
 * 판다랭크는 여기에 알림톡까지 붙여서 매일 앱을 열게 만듭니다.
 *
 * 하루 한 번 새벽에 등록된 것들을 돌면서 순위를 적어둡니다.
 * ⚠️ 네이버를 한꺼번에 두들기면 막힙니다. 반드시 순차로, 사이를 띄워서 돕니다.
 */

const fs = require("fs");
const path = require("path");
const { searchBlogRanking, parsePostUrl } = require("./naverBlogData");
const notify = require("./notify");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "ranks.json");

/**
 * 저장 형태:
 * {
 *   items: {
 *     "<id>": {
 *       id, owner(email), keyword, blogId, logNo, title, createdAt,
 *       history: [{ date, rank }]   // rank가 null이면 30위 안에 없음
 *     }
 *   }
 * }
 */
let store = { items: {} };

function load() {
  try {
    store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    store = { items: {} };
  }
  if (!store.items) store.items = {};
}
function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn("[rankTracker] 저장 실패:", e.message);
  }
}
load();

const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

/** 추적 등록. 플랜 한도는 라우터에서 미리 확인하고 넘어옵니다. */
function add({ owner, keyword, postUrl, title }) {
  const kw = String(keyword || "").trim();
  if (!kw) return { ok: false, why: "키워드를 입력해 주세요." };
  const p = parsePostUrl(postUrl);
  if (!p) return { ok: false, why: "블로그 글 주소를 정확히 넣어주세요. (예: blog.naver.com/아이디/2243...)" };

  // 같은 사람이 같은 키워드+글을 두 번 등록하지 못하게
  const dup = Object.values(store.items).find(
    (i) => i.owner === owner && i.keyword === kw && i.logNo === p.logNo
  );
  if (dup) return { ok: false, why: "이미 등록된 키워드입니다.", item: dup };

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const item = {
    id,
    owner,
    keyword: kw,
    blogId: p.blogId,
    logNo: p.logNo,
    title: String(title || "").slice(0, 120),
    url: `https://blog.naver.com/${p.blogId}/${p.logNo}`,
    createdAt: new Date().toISOString(),
    history: [],
  };
  store.items[id] = item;
  save();
  return { ok: true, item };
}

function remove(owner, id) {
  const it = store.items[id];
  if (!it) return { ok: false, why: "없는 항목입니다." };
  if (it.owner !== owner) return { ok: false, why: "본인이 등록한 것만 지울 수 있습니다." };
  delete store.items[id];
  save();
  return { ok: true };
}

function listFor(owner) {
  return Object.values(store.items)
    .filter((i) => i.owner === owner)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(decorate);
}

function countFor(owner) {
  return Object.values(store.items).filter((i) => i.owner === owner).length;
}

/** 화면에서 바로 쓸 수 있게 어제 대비 변화를 붙여줍니다. */
function decorate(item) {
  const h = item.history || [];
  const last = h[h.length - 1] || null;
  const prev = h[h.length - 2] || null;
  let change = null;
  if (last && prev) {
    if (last.rank == null && prev.rank == null) change = 0;
    else if (last.rank == null) change = -99; // 순위권 밖으로 나감
    else if (prev.rank == null) change = 99;  // 순위권에 새로 들어옴
    else change = prev.rank - last.rank;      // 양수 = 올라감
  }
  return {
    ...item,
    current: last ? last.rank : null,
    checkedAt: last ? last.date : null,
    change,
    best: h.reduce((b, x) => (x.rank != null && (b == null || x.rank < b) ? x.rank : b), null),
  };
}

/** 하나 검사해서 기록합니다. */
async function checkOne(item) {
  const r = await searchBlogRanking(item.keyword, { limit: 30 });
  // ⚠️ 네이버가 막았을 때는 **아무것도 기록하지 않고 그냥 나갑니다.**
  // 여기서 null을 적으면 멀쩡한 1위 글이 "순위권 밖으로 나갔다"고 기록되고,
  // 다음날 손님에게 거짓 경보가 갑니다. 실제로 개발 중에 이 일이 있었습니다.
  // 오늘 못 재면 오늘 칸을 비워두면 됩니다. 내일 다시 재면 됩니다.
  if (!r.ok) return { ok: false, why: r.why, blocked: !!r.blocked };

  const hit = r.results.find((x) => x.blogId === item.blogId && x.logNo === item.logNo);
  // 못 찾았는데 결과까지 적으면 "순위 밖"이 아니라 "모르겠다"입니다.
  // null로 적으면 다음날 손님에게 "순위권 이탈" 알림이 잘못 갑니다.
  if (!hit && r.lowConfidence) return { ok: false, why: r.why, blocked: false };
  const rank = hit ? hit.rank : null;
  const date = todayStr();

  const h = item.history || (item.history = []);
  const existing = h.find((x) => x.date === date);
  if (existing) existing.rank = rank;
  else h.push({ date, rank });
  // 90일치만 남깁니다.
  if (h.length > 90) item.history = h.slice(-90);

  return { ok: true, rank };
}

/**
 * 등록된 전체를 순차로 돌립니다.
 * ⚠️ delayMs를 줄이지 마세요. 네이버가 막으면 전체 기능이 죽습니다.
 */
async function runAll({ delayMs = 1500, max = 500 } = {}) {
  const items = Object.values(store.items).slice(0, max);
  let done = 0;
  let failed = 0;
  // 사람별로 모읍니다. 알림은 사람 단위로 나가야 하니까요.
  const byOwner = new Map();

  for (const item of items) {
    // ⚠️ decorate().current를 쓰면 안 됩니다. 그건 **가장 최근 기록**이고,
    // 오늘 이미 한 번 잰 적이 있으면 그게 오늘 값입니다.
    // checkOne이 오늘 칸을 덮어쓰므로 before와 after가 같아져서
    // **변동이 항상 0으로 나옵니다.** 실제로 20위→2위인데 알림이 안 갔습니다.
    // 비교 대상은 '오늘이 아닌 마지막 기록', 즉 어제입니다.
    const today = todayStr();
    const past = (item.history || []).filter((h) => h.date !== today);
    const yesterday = past.length ? past[past.length - 1] : null;
    const before = yesterday ? yesterday.rank : undefined;

    const r = await checkOne(item);
    if (r.ok) {
      done++;
      // before가 undefined면 비교할 어제가 없다는 뜻입니다(오늘 처음 등록).
      // 이때는 알리지 않습니다. 첫날부터 "진입했습니다"는 알림은 의미가 없습니다.
      //
      // ⚠️ notifiedOn을 함께 봅니다. 이게 없으면 하루에 두 번 돌 때 **같은 변동을
      // 두 번 알립니다.** 새벽 cron이 돌고 나서 손님이 새로고침을 누르거나,
      // 서버가 재시작돼 cron이 다시 걸리면 실제로 일어납니다.
      // 같은 소식이 두 번 오면 알림 자체를 안 믿게 됩니다.
      if (before !== undefined && before !== r.rank && item.notifiedOn !== today) {
        const list = byOwner.get(item.owner) || [];
        list.push({ keyword: item.keyword, url: item.url, from: before, to: r.rank });
        byOwner.set(item.owner, list);
        item.notifiedOn = today;
      }
    } else {
      failed++;
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  save();

  // 알림 만들기 — 알릴 만한 것만 걸러집니다(notify가 판단).
  let notified = 0;
  for (const [owner, changes] of byOwner) {
    if (!owner) continue;
    const n = notify.push(owner, changes);
    notified += n;
    if (n) {
      const fresh = notify.listFor(owner, { unreadOnly: true }).filter((x) => x.date === todayStr());
      await notify.deliver(owner, fresh);
    }
  }

  return {
    checked: done,
    failed,
    total: items.length,
    notified,
    owners: byOwner.size,
  };
}

/** 특정 사용자 것만 지금 바로 돌립니다(수동 새로고침용). */
async function runFor(owner, { delayMs = 1200 } = {}) {
  const items = Object.values(store.items).filter((i) => i.owner === owner);
  let done = 0;
  for (const item of items) {
    const r = await checkOne(item);
    if (r.ok) done++;
    await new Promise((res) => setTimeout(res, delayMs));
  }
  save();
  return { checked: done, total: items.length, items: listFor(owner) };
}

/**
 * 공개 통계 — 블라이가 첫 화면에 "최근 누락 검출"을 띄우는 것과 같은 용도입니다.
 * 사람들이 이걸 보고 "내 것도 확인해봐야겠다"고 들어옵니다.
 *
 * ⚠️ 남의 블로그 아이디를 그대로 노출하지 않습니다. 앞 한 글자만 남깁니다.
 * 남의 블로그가 검색에서 빠졌다는 걸 실명으로 공개하는 건 그 사람에게 해가 됩니다.
 */
function publicDropStats() {
  const days = {};
  const recent = [];
  for (const item of Object.values(store.items)) {
    const h = item.history || [];
    for (let i = 1; i < h.length; i++) {
      if (h[i].rank == null && h[i - 1].rank != null) {
        days[h[i].date] = (days[h[i].date] || 0) + 1;
        recent.push({
          blogId: item.blogId.slice(0, 1) + "****",
          keyword: item.keyword,
          from: h[i - 1].rank,
          date: h[i].date,
        });
      }
    }
  }
  return {
    byDate: Object.entries(days)
      .sort()
      .slice(-7)
      .map(([date, count]) => ({ date, count })),
    recent: recent.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8),
    tracking: Object.keys(store.items).length,
  };
}

module.exports = { add, remove, listFor, countFor, runAll, runFor, checkOne, publicDropStats, decorate };
