/**
 * 플레이스 순위 — 클릭으로 쓰는 화면 (내 컴퓨터 전용).
 *
 * ⚠️ 왜 로컬인가: 브라우저에서 네이버 지도를 직접 읽을 수 없어서(CORS)
 * 중간에 서버가 필요합니다. 실서버 배포는 계정 초기화 문제로 미뤄뒀으니,
 * 그때까지는 이 파일이 사장님 컴퓨터 안에서 그 역할을 합니다.
 * 켜는 법:  node scripts/place-web.js   → 브라우저가 저절로 열립니다.
 *
 * ⚠️ AI 0원. 네이버 공개 화면만 읽습니다. 골든 에이전트(8484~8489)와
 * 안 겹치게 8890 포트를 씁니다.
 */
const http = require("http");
const { execFile } = require("child_process");
const { fetchPlaceList, findRank } = require("../src/placeRank");

const PORT = 8890;

const PAGE = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>플레이스 순위 확인</title>
<style>
:root{--ink:#26302a;--dim:#7c837d;--line:#e4e7e2;--green:#2f6b4f;--bg:#f6f7f5}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;line-height:1.7}
.wrap{max-width:720px;margin:0 auto;padding:34px 18px 60px}
h1{font-size:22px;margin-bottom:4px}
.sub{font-size:13px;color:var(--dim);margin-bottom:20px}
.box{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
label{font-size:13px;font-weight:700;display:block;margin-bottom:5px}
input{width:100%;font-size:16px;padding:11px 13px;border:1.5px solid var(--line);border-radius:10px;outline:none}
input:focus{border-color:var(--green)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
@media(max-width:540px){.row{grid-template-columns:1fr}}
button{width:100%;font-size:16px;font-weight:800;padding:13px;border:0;border-radius:10px;background:var(--green);color:#fff;cursor:pointer}
button:disabled{opacity:.5;cursor:wait}
.hint{font-size:12px;color:var(--dim);margin-top:4px}
.mine{background:#e7f2ec;border:1.5px solid var(--green);border-radius:12px;padding:14px;margin-bottom:12px;font-size:15px}
.mine b{font-size:22px;color:var(--green)}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{font-size:12px;color:var(--dim);text-align:left;padding:6px 8px;border-bottom:1.5px solid var(--line);font-weight:700}
td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.rank{display:inline-block;background:#e7f2ec;color:var(--green);font-weight:800;font-size:12px;padding:1px 9px;border-radius:9px}
.hit td{background:#f2f8f4;font-weight:700}
.foot{font-size:12px;color:var(--dim);margin-top:12px;line-height:1.8}
.err{background:#fdf0ef;border:1px solid #e7b8b3;color:#8a2f25;border-radius:10px;padding:11px 14px;font-size:13.5px;margin-bottom:12px}
.dim{color:var(--dim)}
</style></head><body><div class="wrap">
<h1>플레이스 순위 확인</h1>
<div class="sub">네이버 지도에서 그 자리에서 검색한 실측값 · 광고 제외 · 몇 번을 돌려도 0원</div>

<div class="box">
  <div class="row">
    <div>
      <label>검색어</label>
      <input id="kw" placeholder="예: 역삼동 칼국수" autofocus>
      <div class="hint">손님이 실제로 칠 만한 "동네+메뉴"</div>
    </div>
    <div>
      <label>가게 상호 <span class="dim" style="font-weight:400">(안 넣으면 동네 판세만)</span></label>
      <input id="name" placeholder="예: 심가네칼국수">
    </div>
  </div>
  <button id="go" onclick="run()">순위 확인</button>
</div>

<div id="out"></div>

<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function run() {
  const kw = $("kw").value.trim(), name = $("name").value.trim();
  if (!kw) { $("kw").focus(); return; }
  $("go").disabled = true; $("go").textContent = "네이버에서 확인하는 중…";
  $("out").innerHTML = "";
  try {
    const r = await fetch("/api/place?kw=" + encodeURIComponent(kw) + "&name=" + encodeURIComponent(name)).then((x) => x.json());
    if (!r.ok) { $("out").innerHTML = '<div class="err">' + esc(r.error || "확인하지 못했습니다.") + "</div>"; return; }

    let html = "";
    if (name) {
      html += r.rank != null
        ? '<div class="mine">"' + esc(r.keyword) + '" 검색 시 <b>' + r.rank + "위</b>" +
          (r.total ? ' <span class="dim">(이 검색어로 나오는 가게 ' + r.total.toLocaleString() + "곳 중)</span>" : "") +
          (r.matched ? '<div style="font-size:13px;margin-top:4px">' + esc(r.matched.name) + " · 방문리뷰 " + (r.matched.visitorReviews ?? "?").toLocaleString() + " · 블로그리뷰 " + (r.matched.blogReviews ?? "?").toLocaleString() + (r.matched.saveCountRaw ? " · 저장 " + esc(r.matched.saveCountRaw) : "") + "</div>" : "") +
          "</div>"
        : '<div class="mine">"' + esc(r.keyword) + '" 검색 시 <b style="color:#8a5c11">50위 밖</b>' +
          (r.total ? ' <span class="dim">(전체 ' + r.total.toLocaleString() + "곳)</span>" : "") +
          '<div style="font-size:13px;margin-top:4px" class="dim">이 검색어의 첫 화면에 없다는 뜻입니다 — 올릴 자리가 있다는 뜻이기도 합니다.</div></div>';
    }
    const rows = (r.items || []).slice(0, 15).map((b) => {
      const hit = r.matched && b.id === r.matched.id;
      return "<tr" + (hit ? ' class="hit"' : "") + '><td class="r"><span class="rank">' + b.rank + "위</span></td><td>" + esc(b.name) + '<div class="dim" style="font-size:11.5px">' + esc(b.category) + "</div></td>" +
        '<td class="r">' + (b.visitorReviews ?? "?").toLocaleString() + '</td><td class="r">' + (b.blogReviews ?? "?").toLocaleString() + '</td><td class="r">' + esc(b.saveCountRaw ?? "?") + "</td></tr>";
    }).join("");
    html += '<div class="box"><table><tr><th></th><th>가게</th><th style="text-align:right">방문리뷰</th><th style="text-align:right">블로그리뷰</th><th style="text-align:right">저장</th></tr>' + rows + "</table>" +
      '<div class="foot">PC 지도 검색, 위치 미지정, 광고 ' + (r.adCount || 0) + '개 제외 기준입니다. 가게 근처에서 검색하는 손님에게는 거리 때문에 순서가 다를 수 있습니다.<br>잰 시각: ' + new Date().toLocaleString("ko-KR") + "</div></div>";
    $("out").innerHTML = html;
  } catch (e) {
    $("out").innerHTML = '<div class="err">서버 창이 닫혔을 수 있습니다. 명령을 다시 실행해 주세요.</div>';
  } finally {
    $("go").disabled = false; $("go").textContent = "순위 확인";
  }
}
$("kw").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
</script>
</div></body></html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === "/api/place") {
    const kw = u.searchParams.get("kw") || "";
    const name = (u.searchParams.get("name") || "").trim();
    let out;
    if (name) {
      out = await findRank(kw, { name, top: 50 });
      if (out.ok) out.items = out.top;   // 화면에는 상위 목록도 같이
    } else {
      const r = await fetchPlaceList(kw);
      out = r.ok ? { ok: true, keyword: r.keyword, rank: null, matched: null, total: r.total, items: r.items, adCount: r.adNames.length } : r;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(out));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`플레이스 순위 화면이 켜졌습니다 → ${url}`);
  console.log("이 창을 닫으면 화면도 꺼집니다. 끄려면 Ctrl+C.");
  // 브라우저 자동 열기 (윈도우)
  if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url], () => {});
});
