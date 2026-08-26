/**
 * 진단 결과 공유 페이지.
 *
 * ⚠️ 왜 만드는가 — 지금 이 사업의 진짜 병목은 기능이 아닙니다.
 * 블로그 진단도 되고 순위 추적도 되는데 **아무도 사이트를 모릅니다.**
 * 기능을 하나 더 만드는 것보다 사람이 들어올 길을 내는 게 급합니다.
 *
 * 블로거는 자기 지수가 잘 나오면 자랑합니다. 못 나와도 하소연합니다.
 * 둘 다 남에게 보여줍니다. 그때 보여줄 **주소**가 있어야 합니다.
 *
 * ⚠️ 중요 — 이 페이지는 **서버에서 HTML을 완성해서** 내려보냅니다.
 * 자바스크립트로 그리면 카카오톡·네이버·구글이 빈 페이지로 봅니다.
 * 공유가 목적인데 미리보기에 아무것도 안 뜨면 아무도 안 누릅니다.
 *
 * ⚠️ 남의 블로그를 마음대로 공개하지 않습니다.
 * 진단은 누구 것이든 볼 수 있지만, 공유 링크는 **누른 사람이 직접 만들 때만** 생깁니다.
 * 그리고 만든 사람이 지울 수 있어야 합니다.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "shares.json");

let store = { items: {} };
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
    console.warn("[share] 저장 실패:", e.message);
  }
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/** 진단 결과를 저장하고 짧은 주소를 돌려줍니다. */
function create(result, { owner = null } = {}) {
  if (!result || !result.ok) return { ok: false, why: "저장할 결과가 없습니다." };

  const id = crypto.randomBytes(5).toString("hex");
  // ⚠️ 통째로 저장하지 않습니다. 공유 페이지에 필요한 것만 남깁니다.
  // 글 제목까지 다 담으면 남의 글 목록을 우리가 퍼뜨리는 셈이 됩니다.
  store.items[id] = {
    id,
    owner,
    blogId: result.blogId,
    score: result.estimated.score,
    grade: result.estimated.grade.label,
    parts: result.estimated.parts.map((p) => ({ key: p.key, score: p.score, max: p.max, detail: p.detail })),
    avgVisitors: result.measured.avgVisitors,
    totalPosts: result.measured.totalPosts,
    postsPerWeek: result.measured.postsPerWeek,
    missingCount: result.measured.missingCount,
    judgedCount: result.measured.judgedCount,
    createdAt: new Date().toISOString(),
    views: 0,
  };
  save();
  return { ok: true, id, url: `/d/${id}` };
}

function get(id) {
  return store.items[id] || null;
}

function remove(id, owner) {
  const it = store.items[id];
  if (!it) return { ok: false, why: "없는 링크입니다." };
  // 만든 사람만 지울 수 있습니다. 비회원이 만든 건 아무나 못 지웁니다.
  if (it.owner && it.owner !== owner) return { ok: false, why: "본인이 만든 것만 지울 수 있습니다." };
  delete store.items[id];
  save();
  return { ok: true };
}

/** 오래된 것 정리 — 무료 서버 디스크를 아껴야 합니다. */
function prune(days = 60) {
  const cutoff = Date.now() - days * 86400000;
  let n = 0;
  for (const [id, it] of Object.entries(store.items)) {
    if (new Date(it.createdAt).getTime() < cutoff) {
      delete store.items[id];
      n++;
    }
  }
  if (n) save();
  return n;
}

/** 서버에서 완성해 내려보내는 HTML. */
function render(item, { baseUrl = "" } = {}) {
  const pct = Math.round((item.score / 100) * 100);
  // 등급에 따라 색을 바꿉니다. 잘 나온 사람은 자랑하고 싶어집니다.
  const color = item.score >= 70 ? "#0b8f4d" : item.score >= 45 ? "#b7791f" : "#8b909c";
  const masked = item.blogId.slice(0, 3) + "***";

  const title = `${masked} 블로그 지수 ${item.score}점 · ${item.grade}`;
  const desc =
    `일 방문자 ${item.avgVisitors.toLocaleString()}명 · 전체 글 ${item.totalPosts.toLocaleString()}건 · 주 ${item.postsPerWeek}회 발행` +
    (item.missingCount ? ` · 검색에서 빠진 글 ${item.missingCount}건` : "");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="website" />
${baseUrl ? `<meta property="og:url" content="${esc(baseUrl)}/d/${esc(item.id)}" />` : ""}
<link rel="stylesheet" href="/assets/ws.css" />
</head>
<body>
<div class="topbar"><div class="topbar-in">
  <a class="brand" href="/blog-index.html">우수리미<span>.</span></a>
</div></div>

<div class="wrap" style="max-width:520px">
  <h1 style="margin-bottom:2px">${esc(masked)} 블로그 진단</h1>
  <p class="lede">${new Date(item.createdAt).toISOString().slice(0, 10)} 기준</p>

  <div class="card" style="text-align:center;padding:28px 20px">
    <div class="score-big" style="color:${color}">${item.score}<span style="font-size:18px;color:var(--ink-3)">/100</span></div>
    <div class="grade" style="color:${color};font-size:17px">${esc(item.grade)}</div>
  </div>

  <div class="card">
    ${item.parts.map((p) => `
      <div style="margin-bottom:9px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--ink-2)">
          <span>${esc(p.key)} <span class="muted">${esc(p.detail)}</span></span>
          <span style="font-variant-numeric:tabular-nums">${p.score}/${p.max}</span>
        </div>
        <div class="bar"><i style="width:${Math.round((p.score / p.max) * 100)}%"></i></div>
      </div>`).join("")}
  </div>

  ${item.missingCount
      ? `<div class="msg err">검사한 글 ${item.judgedCount}건 중 <b>${item.missingCount}건</b>이 제목으로 검색해도 나오지 않습니다.</div>`
      : item.judgedCount
      ? `<div class="msg ok">검사한 글 ${item.judgedCount}건이 모두 검색에 정상 노출됩니다.</div>`
      : ""}

  <div class="card" style="text-align:center">
    <p style="margin:0 0 14px;font-size:15px">내 블로그는 몇 점일까요?</p>
    <a href="/blog-index.html"><button style="width:100%">무료로 진단해보기</button></a>
    <p class="muted" style="margin:10px 0 0">로그인 없이 하루 3번까지 됩니다.</p>
  </div>

  <p class="muted" style="text-align:center">
    네이버는 블로그 지수를 공개하지 않습니다. 위 등급은 공개 정보를 우수리미 배점표로
    환산한 추정치이며 네이버 공식 판정이 아닙니다.
  </p>
</div>
</body>
</html>`;
}

module.exports = { create, get, remove, render, prune };
