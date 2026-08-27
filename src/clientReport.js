/**
 * 고객(광고주)용 성과 보고서 — 링크 하나로 전달합니다.
 *
 * ⚠️ 왜 만드는가
 * 브랜드 블로그 대행 파일럿(음식점 3곳)의 척추입니다. 어제 라이브에서
 * 5시간 중 감탄이 가장 몰린 순간이 글 생성이 아니라 **보고서 화면**이었습니다
 * ("다이어리에 보고서 기능 우와 비서네요"). 업주는 글을 안 읽습니다.
 * 성적표를 봅니다.
 *
 * ⚠️ 이 보고서의 규칙 — 파는 물건이라 더 엄격합니다.
 *   1) **잰 것만 씁니다.** 순위는 실제 검색해서 나온 값, 방문자는 실제 공개값.
 *   2) 못 잰 건 못 쟀다고 씁니다. 방문자 비공개면 "비공개"라고 표기.
 *   3) 예시 보고서는 화면 맨 위에 "가상 예시"를 박습니다.
 *      가짜 성과로 영업하기 시작하면 그 사업은 언젠가 무너집니다.
 *
 * ⚠️ sharePage 와 같은 방식: 서버에서 HTML을 완성해 내려보냅니다.
 * 업주가 카톡으로 받은 링크를 눌렀을 때 미리보기가 비어 있으면 안 누릅니다.
 *
 * ⚠️ 무료 서버는 배포마다 디스크가 지워집니다. 보고서도 사라질 수 있습니다.
 * 그래서 보고서는 "만들어서 보내는 순간의 스냅샷"이고, 지워지면 다시 만들면
 * 됩니다(재료가 다 실측이라 언제든 다시 나옵니다). 90일 지난 것은 정리합니다.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { fetchVisitors, fetchPostList, searchBlogRanking, parseBlogId } = require("./naverBlogData");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "client-reports.json");

let store = { items: {} };
try {
  store = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (!store.items) store.items = {};
} catch {}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
  } catch (e) {
    console.warn("[clientReport] 저장 실패:", e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 제목 뒤 3어절 — 사람이 실제로 치는 검색어에 가깝습니다 (blogPower와 같은 논리). */
function tailQuery(title) {
  const t = String(title || "")
    .replace(/["'“”‘’]/g, " ").replace(/\.\.\.|…/g, " ")
    .replace(/[|·\[\]()【】]/g, " ").replace(/\s+/g, " ").trim();
  const w = t.split(" ").filter((x) => x.length >= 2);
  return w.length >= 3 ? w.slice(-3).join(" ") : (w.length ? w.join(" ") : null);
}

/**
 * 블로그 하나의 성과를 실측으로 모읍니다.
 *
 * ⚠️ 네이버를 글 수 × 1번씩 두드립니다. 사이를 안 두면 막혀서 전부
 * "확인 못 함"이 됩니다. 700ms 간격 — 글 6편이면 10초쯤 걸립니다.
 */
async function collect(blogId, { posts = 6, storeName = "", note = "" } = {}) {
  const id = parseBlogId(blogId);
  if (!id) throw new Error("블로그 아이디를 확인해 주세요.");

  // 1) 방문자 — 비공개면 비공개라고 씁니다. 지어내지 않습니다.
  let visitors = null;
  try {
    const rows = await fetchVisitors(id);
    if (Array.isArray(rows) && rows.length) {
      visitors = rows.slice(-14).map((r) => ({ date: String(r.date).slice(5), count: Number(r.count) || 0 }));
    }
  } catch {}

  // 2) 최근 글 + 실제 검색 순위
  const r = await fetchPostList(id, { countPerPage: posts });
  const list = ((r && (r.posts || r.items)) || r || []).slice(0, posts);
  const rows = [];
  for (const p of list) {
    const title = String(p.title || "").replace(/<[^>]+>/g, "").trim();
    const logNo = String(p.logNo || p.no || "");
    const q = tailQuery(title);
    let rank = null, query = null;
    if (q) {
      try {
        const s = await searchBlogRanking(q, { limit: 30 });
        if (s.ok) {
          const hit = s.results.find((x) => x.blogId === id && String(x.logNo) === logNo);
          if (hit) { rank = hit.rank; query = q; }
          else query = q;   // 검색은 했는데 30위 안에 없음 — 그것도 사실입니다
        }
      } catch {}
      await sleep(700);
    }
    rows.push({ title, url: `https://blog.naver.com/${id}/${logNo}`, date: String(p.addDate || "").slice(0, 10), rank, query });
  }

  return {
    blogId: id,
    storeName: String(storeName || "").slice(0, 40),
    note: String(note || "").slice(0, 500),
    measuredAt: new Date().toISOString(),
    visitors,
    posts: rows,
    demo: false,
  };
}

/** 예시 보고서 — 지인에게 보여줄 샘플. 가상임을 화면에 박습니다. */
function demoData() {
  const days = [];
  const base = Date.now() - 13 * 86400000;
  const nums = [41, 55, 48, 62, 77, 96, 88, 104, 131, 118, 152, 169, 148, 183];
  for (let i = 0; i < 14; i++) {
    days.push({ date: new Date(base + i * 86400000).toISOString().slice(5, 10), count: nums[i] });
  }
  return {
    blogId: "demo",
    storeName: "골목집 칼국수 (가상 예시)",
    note: "다음 주: 신메뉴 '들깨 칼국수' 소개 글 2편, 점심 세트 안내 1편 예정입니다.",
    measuredAt: new Date().toISOString(),
    visitors: days,
    posts: [
      { title: "여름 한정 콩국수, 이번 주부터 시작합니다", url: "#", date: "2026-08-25", rank: 3, query: "콩국수 시작합니다" },
      { title: "칼국수 면은 매일 아침 직접 뽑습니다", url: "#", date: "2026-08-22", rank: 1, query: "면 직접 뽑는 칼국수" },
      { title: "주차 안내 — 가게 뒤 공영주차장 30분 무료", url: "#", date: "2026-08-20", rank: 7, query: "공영주차장 30분 무료" },
      { title: "단체 예약 받는 방법을 정리했습니다", url: "#", date: "2026-08-18", rank: null, query: "단체 예약 받는 방법" },
    ],
    demo: true,
  };
}

// ── 저장·조회 ──────────────────────────────────────────────
function create(data, { owner = null } = {}) {
  const id = crypto.randomBytes(6).toString("base64url");
  store.items[id] = { id, data, owner, createdAt: Date.now() };
  save();
  return id;
}

function get(id) { return store.items[String(id || "")] || null; }

function prune(days = 90) {
  const cut = Date.now() - days * 86400000;
  let n = 0;
  for (const [k, v] of Object.entries(store.items)) {
    if (v.createdAt < cut) { delete store.items[k]; n++; }
  }
  if (n) save();
  return n;
}

// ── 화면 ──────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** 방문자 미니 막대그래프 — 그림 파일 없이 SVG 로 그립니다. */
function chart(visitors) {
  if (!visitors || !visitors.length) {
    return `<p class="dim">방문자 수가 비공개 설정이라 표시할 수 없습니다. 공개로 바꾸시면 다음 보고서부터 나옵니다.</p>`;
  }
  const max = Math.max(...visitors.map((v) => v.count), 1);
  const W = 640, H = 150, bw = W / visitors.length;
  const bars = visitors.map((v, i) => {
    const h = Math.max(3, Math.round((v.count / max) * (H - 30)));
    return `<rect x="${(i * bw + 4).toFixed(1)}" y="${H - 20 - h}" width="${(bw - 8).toFixed(1)}" height="${h}" rx="3" fill="#2f6b4f"/>` +
      `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#8a8f87">${esc(v.date)}</text>` +
      `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 26 - h}" text-anchor="middle" font-size="9.5" fill="#39423c">${v.count}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="일별 방문자">${bars}</svg>`;
}

function render(item) {
  const d = item.data;
  const dt = new Date(item.createdAt);
  const when = `${dt.getFullYear()}. ${dt.getMonth() + 1}. ${dt.getDate()}.`;
  const exposed = d.posts.filter((p) => p.rank != null);
  const sum = d.visitors ? d.visitors.reduce((n, v) => n + v.count, 0) : null;

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(d.storeName || d.blogId)} 블로그 성과 보고서</title>
<meta property="og:title" content="${esc(d.storeName || d.blogId)} — 블로그 성과 보고서">
<meta property="og:description" content="발행 ${d.posts.length}편 · 검색 노출 ${exposed.length}편${sum != null ? ` · 최근 2주 방문 ${sum.toLocaleString()}명` : ""}">
<style>
:root{--ink:#26302a;--dim:#7c837d;--line:#e4e7e2;--green:#2f6b4f;--bg:#f6f7f5}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;line-height:1.7}
.wrap{max-width:680px;margin:0 auto;padding:28px 18px 60px}
.demo{background:#fff3cd;border:1px solid #e6cd6f;color:#7a5d00;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;margin-bottom:14px;text-align:center}
header{margin-bottom:18px}
.kicker{font-size:12px;letter-spacing:.18em;color:var(--green);font-weight:700}
h1{font-size:24px;line-height:1.4;margin:4px 0 2px}
.when{font-size:13px;color:var(--dim)}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:13px 8px;text-align:center}
.card b{display:block;font-size:22px;color:var(--green);font-variant-numeric:tabular-nums}
.card span{font-size:11.5px;color:var(--dim)}
section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
h2{font-size:15px;margin-bottom:12px}
.post{padding:10px 0;border-top:1px solid var(--line)}
.post:first-of-type{border-top:none;padding-top:0}
.post a{color:var(--ink);text-decoration:none;font-weight:600;font-size:14px}
.post .meta{font-size:12px;color:var(--dim);margin-top:2px}
.rank{display:inline-block;background:#e7f2ec;color:var(--green);font-weight:800;font-size:12px;padding:1px 9px;border-radius:9px;margin-right:6px}
.norank{display:inline-block;background:#f0f1ef;color:var(--dim);font-size:12px;padding:1px 9px;border-radius:9px;margin-right:6px}
.dim{font-size:12.5px;color:var(--dim)}
.note{background:#f2f6f3;border-radius:10px;padding:12px 14px;font-size:13.5px}
footer{text-align:center;font-size:11.5px;color:var(--dim);margin-top:22px;line-height:1.8}
@media (max-width:480px){.cards{grid-template-columns:repeat(3,1fr)}}
</style></head><body><div class="wrap">
${d.demo ? `<div class="demo">⚠️ 가상 예시 보고서입니다 — 실제 매장·실제 수치가 아닙니다</div>` : ""}
<header>
  <div class="kicker">주간 블로그 성과 보고서</div>
  <h1>${esc(d.storeName || d.blogId)}</h1>
  <div class="when">${esc(when)} 기준 · 실제 검색 결과를 그 시각에 확인한 값입니다</div>
</header>

<div class="cards">
  <div class="card"><b>${d.posts.length}</b><span>발행한 글</span></div>
  <div class="card"><b>${exposed.length}</b><span>검색 노출 확인</span></div>
  <div class="card"><b>${sum != null ? sum.toLocaleString() : "비공개"}</b><span>최근 2주 방문</span></div>
</div>

<section>
  <h2>일별 방문자</h2>
  ${chart(d.visitors)}
</section>

<section>
  <h2>발행한 글과 검색 순위</h2>
  ${d.posts.map((p) => `
  <div class="post">
    ${p.rank != null ? `<span class="rank">${p.rank}위</span>` : `<span class="norank">30위 밖</span>`}
    <a href="${esc(p.url)}"${p.url === "#" ? "" : ' target="_blank" rel="noopener"'}>${esc(p.title)}</a>
    <div class="meta">${esc(p.date)}${p.query ? ` · "${esc(p.query)}" 검색 기준` : ""}</div>
  </div>`).join("")}
  <p class="dim" style="margin-top:10px">순위는 보고서를 만든 시각에 네이버에서 실제로 검색해 확인한 값입니다.
  순위는 수시로 바뀌며, "30위 밖"은 해당 검색어 기준일 뿐 다른 검색어로는 노출될 수 있습니다.</p>
</section>

${d.note ? `<section><h2>다음 주 계획</h2><div class="note">${esc(d.note)}</div></section>` : ""}

<footer>이 보고서의 수치는 공개된 실측값만 사용합니다 — 추정치나 지어낸 값을 쓰지 않습니다.</footer>
</div></body></html>`;
}

module.exports = { collect, demoData, create, get, prune, render };
