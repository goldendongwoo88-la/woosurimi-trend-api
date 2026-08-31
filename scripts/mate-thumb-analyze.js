/**
 * 벤치마킹 블로거 **썸네일·제목 실측** — 홈판 / 뷰티 메이트 / 패션 메이트.
 *
 * ⚠️ 왜 만들었나 (2026-08-31 사장님 지시): 제목 분석(mate-analyze.js)은 있는데
 * **썸네일 분석이 없었습니다.** 홈판은 제목보다 썸네일이 먼저 눈에 들어오는 자리인데
 * 우리는 "어떻게 만들어야 한다"는 근거가 하나도 없었습니다. 그래서 잘 되는 블로그들이
 * 실제로 어떤 썸네일을 쓰는지 **세어봅니다.**
 *
 * ⚠️ 남의 것을 어떻게 다루는가 — 지켜야 할 선:
 *   · 공개 글 목록에서 **제목·날짜**만 받습니다.
 *   · 글 페이지에서는 **대표 이미지 주소(og:image)** 한 줄만 뽑습니다. 본문은 저장 안 합니다.
 *   · 대표 이미지는 받아서 **숫자만 재고 그 자리에서 버립니다.** 파일로 저장하지 않고,
 *     우리 글에 쓰지도 않습니다(저작권·초상권). 남는 건 통계뿐입니다.
 *   · 요청 사이에 쉬어갑니다. 남의 서버를 두들기지 않습니다.
 *
 * ⚠️ AI를 한 번도 안 부릅니다. 값이 0원입니다.
 * ⚠️ 이건 상관관계지 인과가 아닙니다. "이렇게 하면 뜬다"가 아니라
 *    "잘 되는 사람들의 썸네일은 이렇게 생겼다"까지만 말합니다.
 *
 * 쓰는 법:
 *   node scripts/mate-thumb-analyze.js            (기본: 블로그당 글 5편)
 *   node scripts/mate-thumb-analyze.js --n=8
 *   node scripts/mate-thumb-analyze.js --group=뷰티
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { fetchPostList } = require("../src/naverBlogData");
const { findFace } = require("../src/thumbnail");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split("=").slice(1).join("=") : d;
};
const PER_BLOG = Math.max(1, Math.min(12, Number(arg("n", 5))));
const ONLY = arg("group", "");

const UA_M = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// ── 명단 ─────────────────────────────────────────────────
// 홈판 벤치마킹 = 연예·가십 갈래(홈판에 제일 많이 뜨는 갈래). 역추적으로 주소가 확인된 곳.
// 메이트는 mate-analyze.js에 있던 사장님 명단 그대로.
const GROUPS = {
  "사장님 블로그": ["man_is_best"],
  "홈판 벤치마킹": ["nidle_831"],
  "뷰티 메이트": ["1hello2", "sunnyya314", "qmfosej", "kiddy28", "tnwjd955", "yazeyazasu", "yangeunb", "cosreader"],
  "뷰티 메이트(6·7월 선정)": [],
  "패션 메이트": ["goodface0863", "styleknowhow_seoj", "gguu1029", "kims718", "mira841213", "ruddyluna", "tjthdus94", "ohye1991", "dasoms2s2", "longtimeknowsee"],
  "패션 벤치마킹": ["luckyjaemin", "viva-a", "yeonju_hhh", "maryjane1440", "somethingthatilove", "jayuyu", "cocoleenice", "qkrdmsdhr95", "goodlucky1215", "keita_hitomi", "jollini152", "sso965"],
};
try {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gossip-blogs.json"), "utf8"));
  GROUPS["홈판 벤치마킹"].push(...Object.values(g.found).map((x) => x.id));
} catch {}
try {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "mate67-blogs.json"), "utf8"));
  GROUPS["뷰티 메이트(6·7월 선정)"] = m.ids || [];
} catch {}

// ── 제목 장치 ────────────────────────────────────────────
const CELEBS = require("../data/mate-keywords.json").celebs.map((c) => c.word);
const hasCeleb = (t) => CELEBS.some((n) => (n.length >= 2 ? t.includes(n) : false));

const TITLE_DEVICES = {
  "따옴표로 시작": (t) => /^["'“‘]/.test(t),
  "따옴표 아무 데나": (t) => /["'“”‘’]/.test(t),
  "말줄임표(…/..)": (t) => /\.\.|…/.test(t),
  "물음표": (t) => /\?/.test(t),
  "느낌표": (t) => /!/.test(t),
  "숫자": (t) => /\d/.test(t),
  "연예인 이름": (t) => hasCeleb(t),
  "반전 구조(알고보니·인 줄)": (t) => /알고보니|인 줄|줄 알았|근데|그런데|반전|의외로/.test(t),
  "비교(vs·보다·제치고)": (t) => /vs|VS|보다|제치고|이겼|압살|넘사/.test(t),
  "감정 반응(난리·화제·ㄷㄷ)": (t) => /난리|화제|논란|충격|경악|ㄷㄷ|헉|대박|미쳤/.test(t),
  "정보형(후기·추천·방법)": (t) => /후기|추천|방법|하는 법|꿀팁|리뷰|내돈내산/.test(t),
  "가격·돈": (t) => /원|만원|가격|얼마|할인|세일/.test(t),
  "괄호": (t) => /\(|\)|\[|\]/.test(t),
};

// ── 썸네일 측정 ──────────────────────────────────────────
/**
 * 썸네일 한 장을 재봅니다. **AI 안 씁니다. 픽셀 계산입니다.**
 *
 * ⚠️ 처음에는 "얹은 글씨가 있는가"도 세려고 했습니다. **못 셉니다.**
 * 표본 12장을 눈으로 매겨놓고 대조해 봤더니, 글씨가 하나도 없는 콜라주 사진(검은 드레스에
 * 흰 자수)이 자막 있는 사진보다 더 '글씨 같다'고 나왔습니다. 대비만 보는 계산으로는
 * **얹은 글씨와 무늬 많은 사진이 안 갈립니다.**
 * 그래서 글씨는 세지 않고, 대신 사람이 표본을 눈으로 보고 적기로 했습니다(보고서 참고).
 * 지어낸 숫자를 적느니 없는 게 낫습니다.
 *
 * 여기서 세는 것 — 픽셀로 **확실히** 알 수 있는 것만:
 *   shape   대표사진이 가로형인가 정사각인가 세로형인가
 *   skin    살색 덩어리(사람)가 있는가 · 화면의 몇 %인가 · 어디쯤인가
 *   split   여러 장을 이어붙였는가 (세로 이음매)
 *   look    밝기 · 색의 선명함
 *
 * ⚠️ 살색 덩어리는 **얼굴만이 아닙니다.** 손·팔·목도 잡히고, 흑백 사진은 아예 못 잡습니다.
 *    그래서 "얼굴%"가 아니라 "사람(살색)%"이라고 적습니다.
 */
async function measureThumb(buf) {
  const meta = await sharp(buf).metadata();
  const W = 320;
  const { data, info } = await sharp(buf).resize(W, null, { fit: "inside" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const g = (x, y) => data[y * w + x];

  /**
   * 여러 장을 이어붙였는가 — 세로 이음매를 찾습니다.
   * ⚠️ 가운데만 보면 3분할·4분할을 놓칩니다(실제로 3장 콜라주를 놓쳤습니다).
   * 1/2, 1/3, 2/3, 1/4, 3/4 자리를 다 봅니다.
   */
  const colEdge = new Float64Array(w);
  for (let x = 1; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) s += Math.abs(g(x, y) - g(x - 1, y));
    colEdge[x] = s / h;
  }
  const colMed = [...colEdge].sort((a, b) => a - b)[Math.floor(w / 2)] || 0.001;
  const seamAt = (ratio) => {
    let best = 0;
    const c = Math.round(w * ratio);
    for (let x = Math.max(1, c - Math.round(w * 0.02)); x <= Math.min(w - 1, c + Math.round(w * 0.02)); x++) {
      best = Math.max(best, colEdge[x] / colMed);
    }
    return best;
  };
  const seams = [0.5, 1 / 3, 2 / 3, 0.25, 0.75].map(seamAt);
  const split = Math.max(...seams) > 4.5;

  // 밝기·채도
  const st = await sharp(buf).stats();
  const [r, gg, b] = st.channels;
  const bright = (r.mean + gg.mean + b.mean) / 3;
  const sat = Math.max(r.mean, gg.mean, b.mean) - Math.min(r.mean, gg.mean, b.mean);
  // 흑백 사진인지 — 채도가 거의 없으면 살색 판정을 못 하므로 따로 표시합니다.
  const mono = sat < 6;

  const skin = await findFace(buf).catch(() => null);
  const ratio = meta.width && meta.height ? meta.width / meta.height : 1;

  return {
    w: meta.width || 0,
    h: meta.height || 0,
    shape: ratio > 1.15 ? "가로형" : ratio < 0.87 ? "세로형" : "정사각",
    mono,
    skin: !!skin,
    skinRatio: skin && meta.height ? +(skin.height / meta.height).toFixed(3) : 0,
    skinCx: skin && meta.width ? +((skin.left + skin.width / 2) / meta.width).toFixed(2) : null,
    skinCy: skin && meta.height ? +((skin.top + skin.height / 2) / meta.height).toFixed(2) : null,
    split,
    bright: Math.round(bright),
    sat: Math.round(sat),
  };
}

async function get(url, { timeoutMs = 12000, binary = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA_M, referer: "https://blog.naver.com/", "accept-language": "ko-KR,ko;q=0.9" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 글 하나 — 대표 이미지 주소만 뽑습니다(본문은 안 씁니다). */
async function thumbUrlOf(blogId, logNo) {
  const html = await get(`https://m.blog.naver.com/${blogId}/${logNo}`);
  if (!html) return null;
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

(async () => {
  const rows = [];
  const failures = [];
  const names = Object.keys(GROUPS).filter((g) => !ONLY || g.includes(ONLY));

  for (const group of names) {
    for (const blogId of GROUPS[group]) {
      let list;
      try {
        list = await fetchPostList(blogId, { countPerPage: 12 });
      } catch { list = null; }
      if (!list || !list.posts.length) { failures.push(`${group}/${blogId} 글 목록 실패`); await sleep(500); continue; }

      const picked = list.posts.filter((p) => p.isPublic !== false).slice(0, PER_BLOG);
      let okCount = 0;
      for (const p of picked) {
        const url = await thumbUrlOf(blogId, p.logNo);
        await sleep(350);
        let m = null;
        if (url) {
          const buf = await get(url, { binary: true });
          if (buf && buf.length > 2000) { try { m = await measureThumb(buf); } catch {} }
          await sleep(250);
        }
        rows.push({ group, blogId, logNo: p.logNo, title: p.title, addDate: p.addDate, thumb: m });
        if (m) okCount++;
      }
      console.log(`  ${group.padEnd(18)} ${blogId.padEnd(22)} 글 ${picked.length}편 · 썸네일 ${okCount}장`);
      await sleep(600);
    }
  }

  // ── 집계 ──
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const summary = {};
  for (const group of names) {
    const g = rows.filter((r) => r.group === group);
    const t = g.filter((r) => r.thumb);
    const titles = g.map((r) => r.title).filter(Boolean);
    if (!g.length) continue;

    const dev = {};
    for (const [k, fn] of Object.entries(TITLE_DEVICES)) dev[k] = pct(titles.filter(fn).length, titles.length);

    const color = t.filter((r) => !r.thumb.mono);          // 흑백은 살색 판정을 못 합니다
    const withSkin = color.filter((r) => r.thumb.skin);
    summary[group] = {
      blogs: new Set(g.map((r) => r.blogId)).size,
      posts: g.length,
      thumbs: t.length,
      title: {
        평균길이: Math.round(titles.reduce((s, x) => s + x.length, 0) / (titles.length || 1)),
        장치: dev,
      },
      thumb: {
        "사진 모양": ["가로형", "정사각", "세로형"].reduce((o, s) => {
          o[s] = pct(t.filter((r) => r.thumb.shape === s).length, t.length);
          return o;
        }, {}),
        "사람(살색) 있음%": pct(withSkin.length, color.length),
        "사람 크기(중앙값)": withSkin.length
          ? +[...withSkin.map((r) => r.thumb.skinRatio)].sort((a, b) => a - b)[Math.floor(withSkin.length / 2)].toFixed(2)
          : 0,
        "여러 장 이어붙임%": pct(t.filter((r) => r.thumb.split).length, t.length),
        "흑백%": pct(t.filter((r) => r.thumb.mono).length, t.length),
        "평균 밝기": Math.round(t.reduce((s, r) => s + r.thumb.bright, 0) / (t.length || 1)),
        "평균 채도": Math.round(t.reduce((s, r) => s + r.thumb.sat, 0) / (t.length || 1)),
      },
    };
  }

  const out = {
    madeAt: new Date().toISOString().slice(0, 10),
    method: `블로그 ${new Set(rows.map((r) => r.blogId)).size}곳 · 글 ${rows.length}편 · 썸네일 ${rows.filter((r) => r.thumb).length}장 실측 (AI 0원)`,
    caveat: "상관관계지 인과가 아님. 얹은 글씨는 픽셀로 못 가려서 세지 않음(사람이 표본을 눈으로 봄). 살색은 손·팔도 잡히고 흑백은 못 잡음.",
    perBlog: Object.fromEntries(
      [...new Set(rows.map((r) => r.blogId))].map((id) => {
        const g = rows.filter((r) => r.blogId === id && r.thumb);
        return [id, {
          group: (rows.find((r) => r.blogId === id) || {}).group,
          thumbs: g.length,
          "사람%": pct(g.filter((r) => r.thumb.skin).length, g.length),
          "이어붙임%": pct(g.filter((r) => r.thumb.split).length, g.length),
          "세로형%": pct(g.filter((r) => r.thumb.shape === "세로형").length, g.length),
        }];
      })
    ),
    summary,
    failures,
  };
  const file = path.join(__dirname, "..", "data", "mate-thumbs.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 1), "utf8");

  console.log("\n" + "═".repeat(64));
  for (const [group, s] of Object.entries(summary)) {
    console.log(`\n■ ${group} — 블로그 ${s.blogs}곳 · 글 ${s.posts}편 · 썸네일 ${s.thumbs}장`);
    console.log(`  [썸네일] ${Object.entries(s.thumb).map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}`);
    console.log(`  [제목] 평균 ${s.title.평균길이}자`);
    const top = Object.entries(s.title.장치).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of top) console.log(`     ${String(v).padStart(3)}%  ${k}`);
  }
  if (failures.length) console.log("\n못 받은 것:", failures.length + "건 —", failures.slice(0, 6).join(" / "));
  console.log("\n저장:", file);
})().catch((e) => { console.error("터졌습니다:", e); process.exit(1); });
