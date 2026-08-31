/**
 * 벤치마킹 블로거 **본문 해부** — 홈판 / 뷰티 메이트 / 패션 메이트 vs 사장님 블로그.
 *
 * ⚠️ 2026-08-31 사장님 지시: "제목·후킹만 말고 본문도 다 봐라 —
 * 글자수·도입부·표·Q&A·흐름·체류 장치·강조 개수·사진 장수까지."
 *
 * ⚠️ 기존 homefeedRules.js의 숫자는 **2026-08-27에 잰 것**이고, 표본이
 * 검색 상위 27곳·글 162편이었습니다. 여기서는 **사장님이 지목한 메이트·홈판 명단**을
 * 직접 재서, 갈래별로 갈라 봅니다. 두 자료가 어긋나면 그것도 적습니다.
 *
 * ⚠️ 남의 글을 어떻게 다루는가:
 *   · 공개 글을 열어 **구조만 셉니다**(글자수·문단수·사진수·강조수).
 *   · 본문 문장은 저장하지 않습니다. 도입부 판정도 그 자리에서 하고 버립니다.
 *   · 남는 건 숫자뿐입니다. 남의 글을 베끼려는 게 아니라 **틀을 배우려는 것**입니다.
 *
 * ⚠️ AI 0원. 전부 규칙·계산입니다.
 * ⚠️ 상관관계지 인과가 아닙니다. 네이버는 홈판 기준을 공개하지 않습니다.
 *
 *   node scripts/mate-body-analyze.js            (그룹당 블로그 8곳 · 글 4편)
 *   node scripts/mate-body-analyze.js --n=6 --blogs=10
 */

const fs = require("fs");
const path = require("path");
const { fetchPostList } = require("../src/naverBlogData");
const { extractBodyHtml, analyzeStructure, extractTags, countImages } = require("../src/blogFetch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split("=").slice(1).join("=") : d;
};
const PER_BLOG = Math.max(2, Math.min(12, Number(arg("n", 4))));
const MAX_BLOGS = Math.max(1, Math.min(30, Number(arg("blogs", 8))));

const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const GROUPS = {
  "사장님 블로그": ["man_is_best"],
  "홈판 벤치마킹": ["nidle_831"],
  "뷰티 메이트": ["1hello2", "sunnyya314", "qmfosej", "kiddy28", "tnwjd955", "yazeyazasu", "yangeunb", "cosreader",
    "gh676800", "glowbyseoul", "myhelloyj", "jieun1520"],
  "패션 메이트": ["goodface0863", "styleknowhow_seoj", "gguu1029", "kims718", "mira841213", "ruddyluna",
    "tjthdus94", "ohye1991", "luckyjaemin", "cocoleenice", "keita_hitomi", "sso965"],
};
try {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gossip-blogs.json"), "utf8"));
  GROUPS["홈판 벤치마킹"].push(...Object.values(g.found).map((x) => x.id));
} catch {}

/** 본문 HTML에서 문단만 뽑습니다. 사진·링크카드는 문단이 아닙니다. */
function paragraphsOf(bodyHtml) {
  const out = [];
  const re = /<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(bodyHtml || ""))) {
    const t = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/​/g, "")
      .trim();
    if (t) out.push(t);
  }
  return out;
}

/** 강조 표시를 셉니다 — 네이버 편집기가 실제로 쓰는 표시만. */
function emphasisOf(h) {
  const count = (re) => (h.match(re) || []).length;
  return {
    bold: count(/<(b|strong)[\s>]/gi) + count(/font-weight:\s*(bold|[6-9]00)/gi),
    underline: count(/<u[\s>]/gi) + count(/text-decoration:[^;"]*underline/gi),
    highlight: count(/background-color:\s*(?!transparent|rgba\(0,\s*0,\s*0,\s*0\))/gi),
    colored: count(/(?<!background-)color:\s*(?!inherit)/gi),
    big: count(/se-fs(2[4-9]|[3-9]\d)/g),   // 24px 이상 = 크게 쓴 글씨
  };
}

/**
 * 도입부를 어떻게 여는가 — 첫 3문단을 봅니다.
 * ⚠️ 여러 개가 동시에 해당될 수 있습니다(질문+장면). 배타 분류가 아닙니다.
 */
function introOf(paras) {
  const head = paras.slice(0, 3);
  const t = head.join(" ");
  return {
    chars: t.length,
    질문: /\?/.test(t),
    인사: /안녕하세요|반갑습니다|안녕하십니까/.test(t),
    장면: /^["'“‘]/.test(paras[0] || "") || /["'“”‘’].{2,30}["'“”‘’]/.test(t),
    결론선점: /결론부터|먼저 말씀|미리 말|한줄 요약|한 줄 요약|바로 말씀/.test(t),
    숫자: /\d/.test(t),
    // 오픈 루프 — "왜 그런지 아래에서" 처럼 뒤를 예고해 스크롤을 끌고 갑니다.
    예고: /아래|밑에|끝까지|이유는|알아보|정리해|보여드릴|말씀드릴/.test(t),
  };
}

/**
 * 마무리를 어떻게 닫는가 — 마지막 3문단.
 * ⚠️ '다음글 링크'는 처음에 본문 **전체**에서 링크카드를 찾았습니다. 그러면 글 중간에
 * 상품 링크만 있어도 "마무리에 다음글을 붙였다"가 되어 전부 100%로 나왔습니다.
 * 뒤쪽 20%만 봅니다.
 */
function outroOf(paras, h) {
  const tail = paras.slice(-3).join(" ");
  const lastPart = h.slice(Math.floor(h.length * 0.8));
  return {
    chars: tail.length,
    질문유도: /어떠신가요|어떤가요|궁금|댓글|알려주세요|의견/.test(tail),
    요약: /정리하면|요약하면|결론적으로|한마디로/.test(tail),
    다음글: /class="se-component se-oglink/i.test(lastPart),
  };
}

async function getHtml(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA_M, "accept-language": "ko-KR,ko;q=0.9" }, signal: ac.signal });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function measurePost(html) {
  const bodyHtml = extractBodyHtml(html);
  if (!bodyHtml) return null;
  const paras = paragraphsOf(bodyHtml);
  if (paras.length < 2) return null;

  const chars = paras.reduce((s, p) => s + p.length, 0);
  if (chars < 200) return null;

  const st = analyzeStructure(bodyHtml) || {};
  const em = emphasisOf(bodyHtml);
  const per1k = (n) => +((n / Math.max(chars, 1)) * 1000).toFixed(1);
  const lens = paras.map((p) => p.length).sort((a, b) => a - b);
  const images = st.images || countImages(html) || 0;

  // Q&A — 물음표로 끝나는 짧은 줄(질문)과 그 아래 답. 소제목이 질문인 경우도 셉니다.
  const questions = paras.filter((p) => p.length <= 40 && /\?$/.test(p)).length;
  // 목차 — 앞부분에 "목차/차례" 표시가 있는가
  const toc = /목\s*차|차\s*례|CONTENTS/i.test(paras.slice(0, 6).join(" "));
  // 리스트 — 불릿·번호로 시작하는 문단
  const bullets = paras.filter((p) => /^[-·•▶▷✓✔※\d]+[\s.)]/.test(p)).length;

  const tagInfo = extractTags(html);

  /**
   * 첫 사진이 나오기까지 몇 자를 읽어야 하는가.
   * ⚠️ 홈판에서 들어온 사람은 글이 아니라 **사진을 보러** 옵니다. 글부터 길게 나오면
   * 그 자리에서 나갑니다. 이게 체류의 첫 관문이라 따로 잽니다.
   */
  const firstImgAt = bodyHtml.search(/class="se-component se-image/i);
  let charsBeforeFirstImage = null;
  if (firstImgAt > 0) {
    const head = bodyHtml.slice(0, firstImgAt);
    charsBeforeFirstImage = paragraphsOf(head).reduce((s, p) => s + p.length, 0);
  }

  return {
    chars,
    charsBeforeFirstImage,
    paras: paras.length,
    paraLen: lens[Math.floor(lens.length / 2)],
    over45: Math.round((paras.filter((p) => p.length > 45).length / paras.length) * 100),
    images,
    imgPer1k: per1k(images),
    imgGap: images ? Math.round(chars / images) : null,
    subheads: st.subheads || 0,
    tables: st.tables || 0,
    linkCards: st.linkCards || 0,
    videos: st.videos || 0,
    stickers: st.stickers || 0,
    dividers: st.dividers || 0,
    hasMap: !!st.hasMap,
    questions,
    toc,
    bullets,
    tags: (tagInfo.tags || []).length,
    boldPer1k: per1k(em.bold),
    underlinePer1k: per1k(em.underline),
    highlightPer1k: per1k(em.highlight),
    coloredPer1k: per1k(em.colored),
    bigPer1k: per1k(em.big),
    emphasisPer1k: per1k(em.bold + em.underline + em.highlight + em.colored),
    intro: introOf(paras),
    outro: outroOf(paras, bodyHtml),
  };
}

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const p25 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.25)] : 0);
const p75 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.75)] : 0);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

(async () => {
  const rows = [];
  for (const [group, ids] of Object.entries(GROUPS)) {
    const list = group === "사장님 블로그" ? ids : ids.slice(0, MAX_BLOGS);
    for (const id of list) {
      const per = group === "사장님 블로그" ? Math.max(PER_BLOG, 10) : PER_BLOG;
      const r = await fetchPostList(id, { countPerPage: 10 }).catch(() => null);
      const posts = ((r && r.posts) || []).slice(0, per);
      let ok = 0;
      for (const p of posts) {
        const html = await getHtml(`https://m.blog.naver.com/${id}/${p.logNo}`);
        await sleep(400);
        if (!html) continue;
        let m = null;
        try { m = measurePost(html); } catch {}
        if (m) { rows.push({ group, id, title: p.title, ...m }); ok++; }
      }
      console.log(`  ${group.padEnd(12)} ${id.padEnd(22)} ${ok}/${posts.length}편`);
      await sleep(400);
    }
  }

  const summary = {};
  for (const group of Object.keys(GROUPS)) {
    const g = rows.filter((r) => r.group === group);
    if (!g.length) continue;
    const col = (k) => g.map((r) => r[k]).filter((v) => typeof v === "number");
    summary[group] = {
      blogs: new Set(g.map((r) => r.id)).size,
      posts: g.length,
      분량: { 글자수: [p25(col("chars")), med(col("chars")), p75(col("chars"))], 문단수: med(col("paras")) },
      문단: { 중앙길이: med(col("paraLen")), "45자초과%": med(col("over45")) },
      사진: {
        장수: med(col("images")),
        "1000자당": +(col("imgPer1k").reduce((a, b) => a + b, 0) / g.length).toFixed(1),
        사진간격: med(col("imgGap").filter(Boolean)),
        첫사진까지: med(g.map((r) => r.charsBeforeFirstImage).filter((v) => typeof v === "number")),
      },
      구조: {
        소제목: med(col("subheads")),
        "표 쓴 글%": pct(g.filter((r) => r.tables > 0).length, g.length),
        "목차 쓴 글%": pct(g.filter((r) => r.toc).length, g.length),
        "질문(Q&A)있는 글%": pct(g.filter((r) => r.questions > 0).length, g.length),
        질문개수중앙: med(col("questions")),
        "리스트 쓴 글%": pct(g.filter((r) => r.bullets > 0).length, g.length),
        링크카드: med(col("linkCards")),
        "동영상 넣은 글%": pct(g.filter((r) => r.videos > 0).length, g.length),
        "스티커 쓴 글%": pct(g.filter((r) => r.stickers > 0).length, g.length),
        // ⚠️ 태그는 모바일 페이지에 아예 실리지 않습니다(실측). 0으로 적으면 거짓말이라 뺐습니다.
      },
      강조: {
        "전체(1000자당)": +med(col("emphasisPer1k")).toFixed(1),
        굵게: +med(col("boldPer1k")).toFixed(1),
        색: +med(col("coloredPer1k")).toFixed(1),
        형광: +med(col("highlightPer1k")).toFixed(1),
        밑줄: +med(col("underlinePer1k")).toFixed(1),
        크게: +med(col("bigPer1k")).toFixed(1),
      },
      도입부: {
        "글자수(첫3문단)": med(g.map((r) => r.intro.chars)),
        "질문%": pct(g.filter((r) => r.intro.질문).length, g.length),
        "인사말%": pct(g.filter((r) => r.intro.인사).length, g.length),
        "장면(따옴표)%": pct(g.filter((r) => r.intro.장면).length, g.length),
        "결론선점%": pct(g.filter((r) => r.intro.결론선점).length, g.length),
        "숫자%": pct(g.filter((r) => r.intro.숫자).length, g.length),
        "뒤를 예고%": pct(g.filter((r) => r.intro.예고).length, g.length),
      },
      마무리: {
        "질문유도%": pct(g.filter((r) => r.outro.질문유도).length, g.length),
        "요약%": pct(g.filter((r) => r.outro.요약).length, g.length),
        "다음글 링크%": pct(g.filter((r) => r.outro.다음글).length, g.length),
      },
    };
  }

  const out = {
    madeAt: new Date().toISOString().slice(0, 10),
    method: `블로그 ${new Set(rows.map((r) => r.id)).size}곳 · 글 ${rows.length}편 본문 해부 (AI 0원)`,
    caveat: "상관관계지 인과가 아님. 조회수는 네이버가 안 줘서 못 봄. 표본은 최근 글 위주.",
    summary,
  };
  fs.writeFileSync(path.join(__dirname, "..", "data", "mate-body.json"), JSON.stringify(out, null, 1), "utf8");

  const groups = Object.keys(summary);
  const line = (label, get) =>
    console.log(label.padEnd(22) + groups.map((g) => String(get(summary[g])).padStart(12)).join(""));

  console.log("\n" + "═".repeat(74));
  console.log("항목".padEnd(22) + groups.map((g) => g.slice(0, 10).padStart(12)).join(""));
  console.log("─".repeat(74));
  line("글 수", (s) => s.posts);
  line("글자수(중앙)", (s) => s.분량.글자수[1]);
  line("글자수(25~75%)", (s) => `${s.분량.글자수[0]}~${s.분량.글자수[2]}`);
  line("문단 수", (s) => s.분량.문단수);
  line("문단 길이", (s) => s.문단.중앙길이 + "자");
  line("45자 넘는 문단%", (s) => s.문단["45자초과%"] + "%");
  line("사진 장수", (s) => s.사진.장수);
  line("사진 간격(자)", (s) => s.사진.사진간격);
  line("첫 사진까지(자)", (s) => s.사진.첫사진까지);
  line("1000자당 사진", (s) => s.사진["1000자당"]);
  line("소제목", (s) => s.구조.소제목);
  line("표 쓴 글%", (s) => s.구조["표 쓴 글%"] + "%");
  line("목차 쓴 글%", (s) => s.구조["목차 쓴 글%"] + "%");
  line("Q&A 있는 글%", (s) => s.구조["질문(Q&A)있는 글%"] + "%");
  line("리스트 쓴 글%", (s) => s.구조["리스트 쓴 글%"] + "%");
  line("링크카드", (s) => s.구조.링크카드);
  line("동영상 넣은 글%", (s) => s.구조["동영상 넣은 글%"] + "%");
  console.log("─".repeat(74));
  line("강조 1000자당", (s) => s.강조["전체(1000자당)"]);
  line("  굵게", (s) => s.강조.굵게);
  line("  색", (s) => s.강조.색);
  line("  형광", (s) => s.강조.형광);
  line("  크게", (s) => s.강조.크게);
  console.log("─".repeat(74));
  line("도입부 글자수", (s) => s.도입부["글자수(첫3문단)"]);
  line("  질문으로 엶%", (s) => s.도입부["질문%"] + "%");
  line("  인사말%", (s) => s.도입부["인사말%"] + "%");
  line("  따옴표 장면%", (s) => s.도입부["장면(따옴표)%"] + "%");
  line("  숫자 넣음%", (s) => s.도입부["숫자%"] + "%");
  line("  뒤를 예고%", (s) => s.도입부["뒤를 예고%"] + "%");
  console.log("─".repeat(74));
  line("마무리 질문유도%", (s) => s.마무리["질문유도%"] + "%");
  line("마무리 다음글%", (s) => s.마무리["다음글 링크%"] + "%");
  console.log("\n저장: data/mate-body.json");
})().catch((e) => { console.error("터졌습니다:", e); process.exit(1); });
