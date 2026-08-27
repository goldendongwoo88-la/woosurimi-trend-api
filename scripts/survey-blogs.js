/**
 * 잘 되는 블로그를 **여러 개** 찾아서 글의 생김새를 잽니다.
 *
 * ⚠️ 왜 다시 하나
 * 지금까지 저는 블로그 **두 개**만 보고 "소제목 6개", "45자" 같은 숫자를
 * 말씀드렸습니다. 사장님이 "많이 분석해봤냐"고 물으셨습니다. 아닙니다.
 * 두 개로 정한 숫자를 사장님 글 규칙으로 박아놓은 겁니다.
 *
 * ⚠️ 무엇을 재는지 정확히 해둡니다
 * **홈피드 알고리즘을 재는 게 아닙니다.** 네이버는 그걸 공개하지 않습니다.
 * 여기서 재는 것은 "검색 상위에 뜨고 방문자가 많은 블로그들이 글을 어떻게
 * 생기게 쓰는가"입니다. 그것뿐입니다.
 * 그래서 결론도 "이렇게 하면 뜬다"가 아니라 "잘 되는 사람들은 이렇게 쓴다"입니다.
 *
 * ⚠️ 네이버가 막습니다
 * 예전에 20개를 한꺼번에 불렀다가 403이 섞여 나왔고, 그걸 모르고
 * "글이 누락됐다"는 헛경보를 냈습니다. 하나씩, 사이를 두고 받습니다.
 */
const fs = require("fs");
const path = require("path");
const naver = require("../src/naverBlogData");
const fetchLib = require("../src/blogFetch");

const OUT = path.join(__dirname, "..", "scratch-survey.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 어떤 글을 쓰는 사람들을 볼 것인가 — 사장님 주제에 맞춥니다. */
const SEEDS = {
  "패션": ["가을 코디 추천", "데일리룩 후기", "니트 코디", "원피스 추천", "블로퍼 후기", "겨울 아우터 추천"],
  "뷰티": ["쿠션 추천", "립스틱 후기", "아이라이너 추천", "바디로션 후기", "선크림 추천", "앰플 후기"],
  "연예": ["아이돌 공항패션", "연예인 메이크업", "드라마 리뷰", "예능 리뷰"],
};

const PER_KEYWORD = 8;   // 검색 결과에서 몇 개까지 볼지
const POSTS_PER_BLOG = 6;
const MIN_DAILY = 3000;  // 이만큼은 와야 "잘 되는" 축에 넣습니다

// ── 글 하나의 생김새를 잽니다 ─────────────────────────────
const INVIS = /[\s​-‍⁠﻿]/g;
const vis = (s) => String(s || "").replace(INVIS, "").length;

function measurePost(post) {
  const html = post.bodyHtml || "";
  if (!html) return null;

  // 문단
  const paras = [];
  for (const m of html.matchAll(/<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
    if (t) paras.push(t);
  }
  const real = paras.filter((p) => vis(p) >= 2);
  const chars = real.reduce((n, p) => n + vis(p), 0);
  if (chars < 300) return null;

  const count = (re) => (html.match(re) || []).length;

  // ⚠️ 사진은 se-image-resource로 셉니다. 예전에 두 가지를 같이 세서
  // 30장짜리 글이 64장으로 나온 적이 있습니다.
  const images = count(/se-image-resource/gi);
  const quotes = count(/se-quotation/gi);
  const sectionTitles = count(/se-sectionTitle/gi);
  const tables = count(/<table[\s>]/gi);
  const oglinks = count(/se-oglink/gi);
  // 본문 안의 자기 블로그 링크 = 다음 글로 보내는 고리
  const innerLinks = count(/blog\.naver\.com/gi);
  const stickers = count(/se-sticker/gi);
  const videos = count(/se-video/gi);
  const maps = count(/se-placesMap/gi);

  // 강조
  const bold = count(/<(b|strong)[\s>]/gi) + count(/font-weight:\s*(bold|[6-9]00)/gi);
  const underline = count(/<u[\s>]/gi) + count(/text-decoration:[^;"]*underline/gi);
  const highlight = count(/background-color:\s*(?!transparent)/gi);
  const colored = count(/(?<!background-)color:\s*(?!inherit)/gi);

  // 소제목 = 인용구 + 섹션타이틀 (블로거마다 다른 걸 씁니다)
  const subheads = quotes + sectionTitles;

  // 사진 사이 간격 — 사진과 사진 사이에 글이 몇 자나 있나
  // ⚠️ 이걸 재려면 순서를 알아야 합니다. HTML에서 나오는 차례대로 훑습니다.
  const seq = [];
  const re = /(se-image-resource)|(<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) seq.push({ kind: "img" });
    else {
      const t = (m[3] || "").replace(/<[^>]+>/g, "").trim();
      if (vis(t) >= 2) seq.push({ kind: "text", n: vis(t) });
    }
  }
  const gaps = [];
  let run = 0;
  let sawImage = false;
  for (const s of seq) {
    if (s.kind === "img") {
      if (sawImage) gaps.push(run);
      sawImage = true;
      run = 0;
    } else run += s.n;
  }

  // 목차 — 글 앞부분에 소제목들이 목록처럼 모여 있나
  const head = real.slice(0, 8).join(" ");
  const hasToc = /목차|이 글의 순서|순서대로|아래 순서/.test(head);

  return {
    chars,
    paras: real.length,
    paraMedian: median(real.map(vis)),
    paraOver45: pct(real.map(vis), (x) => x > 45),
    subheads, quotes, sectionTitles,
    images,
    imgGapMedian: gaps.length ? median(gaps) : null,
    imgGaps: gaps.length,
    tables, oglinks, innerLinks, stickers, videos, maps,
    bold, underline, highlight, colored,
    hasToc,
    title: post.title || "",
  };
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, f) => (a.length ? Math.round((a.filter(f).length / a.length) * 100) : 0);

// ── 제목 장치 ────────────────────────────────────────────
function titleDevices(t) {
  const s = String(t || "");
  return {
    quoteStart: /^["'""'']/.test(s.trim()),
    hasQuote: /["'""'']/.test(s),
    ellipsis: /\.{2,}|…/.test(s),
    number: /\d/.test(s),
    question: /\?/.test(s),
    curiosity: /왜|이유|비결|진짜|알고 보니|의외|하나로|끝|이것|이거|딱|바로/.test(s),
    len: s.length,
    words: s.trim().split(/\s+/).length,
  };
}

(async () => {
  const state = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { blogs: {}, posts: {}, found: {} };

  // ── 1단계: 검색으로 블로그 아이디를 모읍니다 ──
  console.log("━━ 1단계: 잘 되는 블로그 찾기 ━━");
  for (const [topic, keywords] of Object.entries(SEEDS)) {
    for (const kw of keywords) {
      if (state.found[kw]) continue;
      try {
        const r = await naver.searchBlogRanking(kw, { limit: PER_KEYWORD });
        const ids = [];
        for (const item of (r.results || [])) {
          const id = naver.parseBlogId(item.url);
          if (id) ids.push(id);
        }
        state.found[kw] = { topic, ids };
        console.log(`  ${kw.padEnd(16)} ${ids.length}개`);
      } catch (e) {
        console.log(`  ${kw.padEnd(16)} 실패: ${e.message}`);
        state.found[kw] = { topic, ids: [] };
      }
      fs.writeFileSync(OUT, JSON.stringify(state));
      await sleep(1100);
    }
  }

  // 블로그별 주제 모으기
  const blogTopic = {};
  for (const [kw, v] of Object.entries(state.found)) {
    for (const id of v.ids) {
      blogTopic[id] = blogTopic[id] || new Set();
      blogTopic[id].add(v.topic);
    }
  }
  const allIds = Object.keys(blogTopic);
  console.log(`\n  블로그 ${allIds.length}개 모았습니다`);

  // ── 2단계: 방문자 수로 거릅니다 ──
  console.log("\n━━ 2단계: 방문자 수 확인 ━━");
  for (const id of allIds) {
    if (state.blogs[id]) continue;
    try {
      const v = await naver.fetchVisitors(id);
      // ⚠️ 오늘 값은 아직 다 안 찼습니다. 어제까지로 봅니다.
      const past = (v || []).slice(0, -1);
      const daily = past.length ? Math.round(past.reduce((a, b) => a + b.count, 0) / past.length) : 0;
      state.blogs[id] = { daily, topics: [...blogTopic[id]] };
    } catch {
      state.blogs[id] = { daily: 0, topics: [...blogTopic[id]], failed: true };
    }
    fs.writeFileSync(OUT, JSON.stringify(state));
    await sleep(700);
  }

  const ranked = allIds
    .map((id) => ({ id, ...state.blogs[id] }))
    .filter((b) => b.daily >= MIN_DAILY)
    .sort((a, b) => b.daily - a.daily);
  console.log(`  일 ${MIN_DAILY.toLocaleString()}명 이상: ${ranked.length}개`);
  for (const b of ranked.slice(0, 12)) {
    console.log(`    ${b.id.padEnd(22)} 일 ${b.daily.toLocaleString().padStart(7)}명  ${b.topics.join(",")}`);
  }

  // ── 3단계: 글을 열어서 잽니다 ──
  console.log("\n━━ 3단계: 글 구조 재기 ━━");
  for (const b of ranked) {
    if (state.posts[b.id]) continue;
    let list;
    try {
      const r = await naver.fetchPostList(b.id, { countPerPage: 20 });
      list = (r.posts || r.items || r || []).slice(0, POSTS_PER_BLOG);
    } catch { state.posts[b.id] = []; continue; }

    const rows = [];
    for (const p of list) {
      try {
        const post = await fetchLib.fetchPost(`https://m.blog.naver.com/${b.id}/${p.logNo || p.no}`);
        const mm = measurePost(post);
        if (mm) rows.push({ ...mm, devices: titleDevices(post.title || p.title) });
      } catch {}
      await sleep(850);
    }
    state.posts[b.id] = rows;
    fs.writeFileSync(OUT, JSON.stringify(state));
    console.log(`  ${b.id.padEnd(22)} ${rows.length}편`);
  }

  console.log(`\n다 됐습니다. 결과: ${OUT}`);
  console.log("분석은 scripts/report-survey.js 로 돌리세요.");
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
