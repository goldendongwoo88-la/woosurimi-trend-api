/**
 * **네이버가 직접 고른 인기글**로 기준을 잡습니다.
 *
 * ⚠️ 앞서 잰 것과 자료가 다릅니다.
 *   전에는 — 검색어로 찾아 상위에 뜬 블로그. 즉 "검색으로 잘 되는 글"
 *   이번에는 — 네이버 블로그홈의 주제별 인기글. 즉 "네이버가 밀어주는 글"
 * 홈판(홈피드)은 사람마다 다르게 보여서 서버에서 못 받습니다.
 * 이게 홈판에 제일 가까운 공개 자료입니다.
 *
 * ⚠️ 그래도 홈판 그 자체는 아닙니다. 그렇게 말씀드리지 않겠습니다.
 *
 * 주제 번호 (직접 훑어서 알아낸 것):
 *   3, 5   패션·미용
 *   7, 15  상품리뷰
 *   12,16,18  스타·연예인
 */
const fs = require("fs");
const path = require("path");
const fetchLib = require("../src/blogFetch");

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const OUT = path.join(__dirname, "..", "scratch-directory.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GROUPS = {
  "패션·미용": [3, 5],
  "상품리뷰": [7, 15],
  "스타·연예인": [12, 16, 18],
};
const PAGES = 3;          // 주제당 몇 쪽 (한 쪽 10개)
const POSTS_PER_GROUP = 26;

async function directory(no, page) {
  const r = await fetch(
    `https://section.blog.naver.com/ajax/DirectoryPostList.naver?directoryNo=${no}&currentPage=${page}`,
    { headers: { "User-Agent": UA, Referer: "https://section.blog.naver.com/BlogHome.naver", Accept: "application/json" } }
  );
  if (!r.ok) throw new Error(String(r.status));
  // ⚠️ 네이버가 응답 앞에 )]}' 를 붙입니다. JSON 하이재킹 막으려는 것입니다. 떼야 파싱됩니다.
  const t = (await r.text()).replace(/^\)\]\}',?/, "");
  return JSON.parse(t).result;
}

// ── 글 하나 재기 (survey-blogs.js와 같은 방식, 링크는 고친 방식) ──
const INVIS = /[\s​-‍⁠﻿]/g;
const vis = (s) => String(s || "").replace(INVIS, "").length;
const median = (a) => { const s = a.filter((x) => typeof x === "number" && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const p = (a, q) => { const s = a.filter((x) => typeof x === "number" && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };

function measure(post, blogId) {
  const html = post.bodyHtml || "";
  if (!html) return null;

  const paras = [];
  for (const m of html.matchAll(/<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (t) paras.push(t);
  }
  const real = paras.filter((x) => vis(x) >= 2);
  const chars = real.reduce((n, x) => n + vis(x), 0);
  if (chars < 250) return null;

  const c = (re) => (html.match(re) || []).length;

  // 사진과 글의 순서 → 사진 사이 글자 수
  const seq = [];
  const re = /(se-image-resource)|(<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) seq.push({ img: true });
    else { const t = (m[3] || "").replace(/<[^>]+>/g, "").trim(); if (vis(t) >= 2) seq.push({ n: vis(t) }); }
  }
  const gaps = [];
  let run = 0, saw = false;
  for (const s of seq) {
    if (s.img) { if (saw) gaps.push(run); saw = true; run = 0; }
    else run += s.n;
  }

  // ⚠️ 링크카드는 컴포넌트 단위로. 예전에 se-oglink 글자 수를 세서 3개를 24개로 봤습니다.
  const cards = c(/class="[^"]*\bse-component\b[^"]*\bse-oglink\b[^"]*"/g);
  const own = new Set();
  const other = new Set();
  for (const mm of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
    const u = mm[1].split("?")[0];
    if (!/blog\.naver\.com/i.test(u)) continue;
    if (blogId && u.toLowerCase().includes("/" + String(blogId).toLowerCase() + "/")) own.add(u);
    else other.add(u);
  }

  return {
    chars,
    paras: real.length,
    paraMedian: median(real.map(vis)),
    paraOver45: Math.round((real.filter((x) => vis(x) > 45).length / real.length) * 100),
    subheads: c(/se-quotation/gi) + c(/se-sectionTitle/gi),
    images: c(/se-image-resource/gi),
    imgGap: gaps.length ? median(gaps) : null,
    cards,
    ownLinks: own.size,
    otherBlogLinks: other.size,
    tables: c(/<table[\s>]/gi),
    bold: c(/<(b|strong)[\s>]/gi) + c(/font-weight:\s*(bold|[6-9]00)/gi),
    underline: c(/<u[\s>]/gi) + c(/text-decoration:[^;"]*underline/gi),
    highlight: c(/background-color:\s*(?!transparent)/gi),
    colored: c(/(?<!background-)color:\s*(?!inherit)/gi),
    title: post.title || "",
  };
}

(async () => {
  const state = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { picked: {}, measured: {} };

  // ── 1단계: 인기글 목록 모으기 ──
  console.log("━━ 1단계: 네이버가 고른 인기글 목록 ━━");
  for (const [group, nos] of Object.entries(GROUPS)) {
    if (state.picked[group]) { console.log(`  ${group} — 이미 모았습니다 (${state.picked[group].length}개)`); continue; }
    const items = [];
    for (const no of nos) {
      for (let page = 1; page <= PAGES; page++) {
        try {
          const r = await directory(no, page);
          for (const it of (r.postList || [])) {
            items.push({
              blogId: it.domainIdOrBlogId,
              logNo: it.logNo,
              nickname: it.nickname,
              title: String(it.title || "").replace(/<[^>]+>/g, ""),
              sympathy: it.sympathyCnt || 0,
              comments: it.commentCnt || 0,
              at: it.addDate,
            });
          }
        } catch (e) { console.log(`    ${no}번 ${page}쪽 실패: ${e.message}`); }
        await sleep(500);
      }
    }
    // 같은 글이 여러 번 나올 수 있습니다
    const seen = new Set();
    state.picked[group] = items.filter((x) => {
      const k = x.blogId + "/" + x.logNo;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    fs.writeFileSync(OUT, JSON.stringify(state));
    console.log(`  ${group.padEnd(12)} ${state.picked[group].length}개`);
  }

  // ── 2단계: 글을 열어서 재기 ──
  console.log("\n━━ 2단계: 글 열어서 재기 ━━");
  for (const [group, items] of Object.entries(state.picked)) {
    state.measured[group] = state.measured[group] || [];
    const done = new Set(state.measured[group].map((x) => x.key));
    const todo = items.filter((x) => !done.has(x.blogId + "/" + x.logNo)).slice(0, POSTS_PER_GROUP - state.measured[group].length);
    if (!todo.length) { console.log(`  ${group} — 이미 ${state.measured[group].length}편`); continue; }

    for (const it of todo) {
      try {
        const post = await fetchLib.fetchPost(`https://m.blog.naver.com/${it.blogId}/${it.logNo}`);
        const mm = measure(post, it.blogId);
        if (mm) state.measured[group].push({ key: it.blogId + "/" + it.logNo, blogId: it.blogId, sympathy: it.sympathy, comments: it.comments, ...mm });
      } catch {}
      fs.writeFileSync(OUT, JSON.stringify(state));
      await sleep(850);
    }
    console.log(`  ${group.padEnd(12)} ${state.measured[group].length}편`);
  }

  // ── 3단계: 정리 ──
  console.log("\n━━━━ 네이버가 고른 인기글의 생김새 ━━━━");
  for (const [group, rows] of Object.entries(state.measured)) {
    if (!rows.length) continue;
    console.log(`\n━━ ${group} — 글 ${rows.length}편 ━━`);
    const show = (label, key, unit = "") => {
      const a = rows.map((r) => r[key]);
      console.log(`  ${label.padEnd(18)} 25% ${String(p(a, 0.25)).padStart(6)} · 중앙 ${String(median(a)).padStart(6)} · 75% ${String(p(a, 0.75)).padStart(6)}${unit}`);
    };
    show("글자 수", "chars");
    show("문단 수", "paras");
    show("문단 길이", "paraMedian");
    show("45자 넘는 문단%", "paraOver45");
    show("소제목", "subheads");
    show("사진", "images");
    show("사진 사이 글자", "imgGap");
    show("링크카드", "cards");
    show("내 글 링크", "ownLinks");
    show("표", "tables");
    show("굵게", "bold");
    show("밑줄", "underline");
    show("배경색", "highlight");
    show("글자색", "colored");
    const k = (median(rows.map((r) => r.chars)) || 1000) / 1000;
    console.log(`  ─ 1,000자당: 사진 ${(median(rows.map((r) => r.images)) / k).toFixed(1)} · 소제목 ${(median(rows.map((r) => r.subheads)) / k).toFixed(1)} · 굵게 ${(median(rows.map((r) => r.bold)) / k).toFixed(1)}`);
  }

  console.log(`\n결과 파일: ${OUT}`);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
