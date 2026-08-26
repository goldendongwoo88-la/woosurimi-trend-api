/**
 * 알림 — 순위가 움직였을 때 알려줍니다.
 *
 * ⚠️ 이게 구독을 유지시키는 장치입니다.
 * 진단은 한 번 보면 끝입니다. 궁금증이 풀리면 다시 안 옵니다.
 * 그런데 "어제 12위였던 글이 오늘 5위"는 매일 확인하고 싶어집니다.
 * 판다랭크가 알림톡에 돈을 쓰는 이유가 이겁니다.
 *
 * ⚠️ 지금은 메일을 못 보냅니다. 발송 계정이 없습니다.
 * 그래서 **사이트 안에 쌓아두는 방식**으로 먼저 만듭니다.
 * 나중에 메일이든 카카오든 붙일 수 있게 '보내는 쪽'을 갈아끼울 수 있게 뒀습니다.
 * 없는 기능을 있는 척하느니, 되는 것부터 제대로 하는 게 낫습니다.
 *
 * ⚠️ 알림을 남발하면 안 봅니다.
 * 1~2계단 오르내림은 매일 있는 일입니다. 그걸 다 알리면 잡음이 되고,
 * 잡음이 되면 정작 중요한 '순위권 이탈'도 같이 묻힙니다.
 * 그래서 **알릴 만한 것만** 남깁니다.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "notify.json");

let store = { items: {} }; // email → [알림]
try {
  store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!store.items) store.items = {};
} catch {
  store = { items: {} };
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.warn("[notify] 저장 실패:", e.message);
  }
}

const todayStr = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

/**
 * 알릴 만한 변화인지 판단합니다.
 *
 * 기준을 이렇게 잡은 이유:
 *   - 순위권 이탈: 무조건 알립니다. 제일 급한 일입니다.
 *   - 1페이지 진입(10위 안): 좋은 소식이라 알릴 값어치가 있습니다.
 *   - 5계단 이상: 그 아래는 매일 있는 흔들림이라 잡음입니다.
 */
function worthTelling({ from, to }) {
  if (from == null && to == null) return null;
  if (from != null && to == null) return { kind: "dropped", weight: 0 };
  if (from == null && to != null) return { kind: "entered", weight: 1 };
  if (to <= 10 && from > 10) return { kind: "firstPage", weight: 1 };
  if (from <= 10 && to > 10) return { kind: "leftFirstPage", weight: 1 };
  const diff = from - to;
  if (Math.abs(diff) >= 5) return { kind: diff > 0 ? "up" : "down", weight: 2 };
  return null;
}

function messageFor(kind, item, from, to) {
  const kw = item.keyword;
  switch (kind) {
    case "dropped":
      return `"${kw}" — 30위 밖으로 밀렸습니다. (어제 ${from}위)`;
    case "entered":
      return `"${kw}" — 순위권에 들어왔습니다. ${to}위.`;
    case "firstPage":
      return `"${kw}" — 첫 페이지에 올라왔습니다. ${from}위 → ${to}위.`;
    case "leftFirstPage":
      return `"${kw}" — 첫 페이지에서 밀렸습니다. ${from}위 → ${to}위.`;
    case "up":
      return `"${kw}" — ${from - to}계단 올랐습니다. ${from}위 → ${to}위.`;
    case "down":
      return `"${kw}" — ${to - from}계단 내렸습니다. ${from}위 → ${to}위.`;
    default:
      return `"${kw}" 순위가 바뀌었습니다.`;
  }
}

/** 하루치 변동을 받아 알림으로 만듭니다. */
function push(owner, changes) {
  if (!owner || !changes.length) return 0;
  const list = store.items[owner] || (store.items[owner] = []);
  let n = 0;

  for (const c of changes) {
    const w = worthTelling(c);
    if (!w) continue;
    list.push({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      date: todayStr(),
      kind: w.kind,
      weight: w.weight,
      keyword: c.keyword,
      url: c.url,
      from: c.from,
      to: c.to,
      text: messageFor(w.kind, c, c.from, c.to),
      read: false,
    });
    n++;
  }

  // 급한 것부터 보이게, 그리고 최근 60건만 남깁니다.
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.weight - b.weight));
  if (list.length > 60) store.items[owner] = list.slice(0, 60);
  if (n) save();
  return n;
}

function listFor(owner, { unreadOnly = false } = {}) {
  const list = store.items[owner] || [];
  return unreadOnly ? list.filter((x) => !x.read) : list;
}

function unreadCount(owner) {
  return (store.items[owner] || []).filter((x) => !x.read).length;
}

function markRead(owner, id = null) {
  const list = store.items[owner] || [];
  let n = 0;
  for (const x of list) {
    if (id && x.id !== id) continue;
    if (!x.read) { x.read = true; n++; }
  }
  if (n) save();
  return n;
}

function clear(owner) {
  delete store.items[owner];
  save();
  return { ok: true };
}

/**
 * 보내는 쪽 — 지금은 사이트 안에만 쌓습니다.
 *
 * ⚠️ 나중에 메일이나 카카오를 붙일 자리입니다.
 * 환경변수로 보낼 곳이 생기면 여기서 갈아끼우면 되고,
 * 알림을 만드는 쪽(push)은 손댈 필요가 없습니다.
 */
async function deliver(owner, items) {
  const hook = process.env.NOTIFY_WEBHOOK_URL;
  if (!hook || !items.length) return { sent: 0, how: "site" };
  // 사장님이 직접 웹훅 주소를 넣어두면 그리로도 보냅니다(슬랙·디스코드 등).
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `[우수리미] ${owner} — 순위 변동 ${items.length}건\n` + items.map((x) => "· " + x.text).join("\n"),
      }),
    });
    return { sent: items.length, how: "webhook" };
  } catch (e) {
    console.warn("[notify] 웹훅 실패:", e.message);
    return { sent: 0, how: "site", why: e.message };
  }
}

module.exports = { push, listFor, unreadCount, markRead, clear, deliver, worthTelling };
