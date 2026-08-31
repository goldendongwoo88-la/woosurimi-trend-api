/**
 * 홈판 상위노출 심층 분석 — 경쟁 블로거 vs 사장님 블로그 실측 비교.
 *
 * ⚠️ 왜 만들었나: "제목을 어떻게 뽑는지, 본문 몇 자인지, 표·Q&A를 넣는지, 강조를
 * 얼마나 쓰는지, 사진 몇 장인지"를 감으로 말하면 그게 그대로 원고 규칙이 됩니다.
 * 기존 mate-analyze는 제목만 셌습니다. 여기서는 본문까지 열어서 전부 셉니다.
 *
 * ⚠️ AI 0원. 로그인 없이 누구나 보는 공개 글만, 글 사이 1초 이상 띄워서 받아옵니다.
 * ⚠️ 네이버가 막으면 그 글은 건너뜁니다 — 못 받은 걸 0으로 세면 결론이 뒤집힙니다.
 *
 * 결과: data/homefeed-deep.json (원자료) + 콘솔 요약
 */
const fs = require("fs");
const path = require("path");
const { fetchPostList } = require("../src/naverBlogData");
const { fetchPost, analyzeStructure } = require("../src/blogFetch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, "..", "data", "homefeed-deep.json");

// 비교 대상 — 뷰티 메이트(상위노출 실측 명단) + 사장님 블로그.
const TARGETS = [
  { group: "경쟁(뷰티메이트)", id: "1hello2" },
  { group: "경쟁(뷰티메이트)", id: "sunnyya314" },
  { group: "경쟁(뷰티메이트)", id: "qmfosej" },
  { group: "경쟁(뷰티메이트)", id: "kiddy28" },
  { group: "경쟁(뷰티메이트)", id: "tnwjd955" },
  { group: "경쟁(뷰티메이트)", id: "yazeyazasu" },
  { group: "경쟁(대형)", id: "nidle_831" },
  { group: "사장님", id: "runrun0803" },
  { group: "사장님", id: "man_is_best" },
];
const PER_BLOG = Number(process.env.PER_BLOG || 8);

/** 제목에서 후킹 장치를 찾습니다. 있는 그대로 표시만 하고 점수는 매기지 않습니다. */
function titleHooks(t) {
  const s = String(t || "");
  return {
    len: s.length,
    따옴표: /[""''"']/.test(s),
    말줄임: /\.\.\.|…|\.\./.test(s),
    숫자: /\d/.test(s),
    가격: /원|만원|억/.test(s),
    물음표: (s.match(/\?/g) || []).length,
    느낌표: (s.match(/!/g) || []).length,
    전언체: /(다는|라는|다던|더라|봤더니|한다는|이라는|났다는|됐다는)(\s|$|\.|,)/.test(s),
    정체숨기기: /(그\s?(배우|여배우|톱스타|아이돌|가수|스타)|어제\s?그|이\s?(배우|제품)|그녀|모\s?배우)/.test(s),
    감정어: /(대박|미쳤|헐|이럴수가|어머|난리|충격|경악|소름|깜짝|놀랐|レ전드|레전드)/.test(s),
    반전: /(알고보니|알고\s보니|사실은|의외로|아니었|였다니|줄\s?알았)/.test(s),
    소거법: /(도\s아니고|도\s아니다|아니라)/.test(s),
    비교: /(보다|대신|vs|VS|차이)/.test(s),
    zip모음: /(zip|ZIP|모음|총정리|정리)/.test(s),
    질문형: /(어디|뭐|왜|무엇|얼마|어떻게|누구)/.test(s),
    괄호: /[\[\]\(\)]/.test(s),
  };
}

/** 본문 텍스트에서 도입부·Q&A·목차 같은 흐름 요소를 봅니다. */
function flowOf(bodyText) {
  const t = String(bodyText || "");
  const lines = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  // 도입부 = 의미 있는 첫 두 줄 (한 줄이 너무 짧으면 다음 줄까지)
  let intro = "";
  for (const l of lines) {
    intro += (intro ? " " : "") + l;
    if (intro.length >= 40) break;
  }
  return {
    intro: intro.slice(0, 200),
    introLen: intro.length,
    // Q&A — "Q." "Q:" "Q1" 형태
    qna: (t.match(/(^|\n)\s*Q\s*[.:0-9]/g) || []).length,
    목차: /목차|순서대로|이 글의 순서|아래 순서/.test(t),
    결론먼저: /결론부터|먼저 결론|한 줄 요약|3줄 요약|핵심만/.test(t),
    // 도입부가 "오늘은 ~에 대해 알아보겠습니다" 류 정형문인지
    정형도입: /^(안녕하세요|오늘은|여러분|반갑습니다)/.test(lines[0] || ""),
    태그줄: (t.match(/#[^\s#]+/g) || []).length,
  };
}

/** 강조 표시를 셉니다. 네이버 편집기가 실제로 쓰는 형태 기준. */
function emphasisOf(bodyHtml) {
  const h = String(bodyHtml || "");
  if (!h) return null;
  const c = (re) => (h.match(re) || []).length;
  const sizes = {};
  for (const m of h.matchAll(/se-fs(\d+)/g)) sizes[m[1]] = (sizes[m[1]] || 0) + 1;
  return {
    굵게: c(/<(b|strong)[\s>]/gi) + c(/font-weight:\s*(bold|[6-9]00)/gi),
    밑줄: c(/<u[\s>]/gi) + c(/text-decoration:[^;"]*underline/gi),
    형광: c(/background-color:\s*(?!transparent|rgba\(0,\s*0,\s*0,\s*0\))/gi),
    색: c(/(?<!background-)color:\s*(?!inherit)/gi),
    글자크기종류: Object.keys(sizes).length,
  };
}

/** 문단 길이 — 네이버 모바일 리듬을 보려면 문단이 몇 자인지가 핵심입니다. */
function paraStats(bodyHtml) {
  const h = String(bodyHtml || "");
  const lens = [];
  for (const m of h.matchAll(/<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const txt = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/[\s​]+/g, " ").trim();
    if (txt) lens.push(txt.length);
  }
  if (!lens.length) return null;
  const s = [...lens].sort((a, b) => a - b);
  return {
    문단수: lens.length,
    평균: Math.round(lens.reduce((a, b) => a + b, 0) / lens.length),
    중앙: s[Math.floor(s.length / 2)],
    최대: s[s.length - 1],
  };
}

async function run() {
  const rows = [];
  const skipped = [];
  // 이어받기 — 중간에 막혀도 다시 돌리면 남은 것만 받습니다.
  let done = {};
  if (fs.existsSync(OUT)) {
    try { done = JSON.parse(fs.readFileSync(OUT, "utf8")).byUrl || {}; } catch {}
  }

  for (const t of TARGETS) {
    let list;
    try {
      list = await fetchPostList(t.id, { countPerPage: PER_BLOG + 6 });
    } catch (e) {
      skipped.push({ blog: t.id, why: "목록 실패: " + e.message });
      continue;
    }
    // 전체공개 + 검색허용 글만 — 이웃공개 글은 홈판 경쟁 표본이 아닙니다.
    const posts = (list.posts || []).filter((p) => p.isPublic && p.searchable).slice(0, PER_BLOG);
    console.log(`\n[${t.group}] ${t.id} — 전체 ${list.total}편, 이번에 ${posts.length}편`);

    for (const p of posts) {
      if (done[p.url]) { rows.push(done[p.url]); process.stdout.write("·"); continue; }
      try {
        const full = await fetchPost(p.url);
        const st = analyzeStructure(full.bodyHtml) || {};
        const text = String(full.bodyText || "");
        const row = {
          group: t.group, blogId: t.id, url: p.url,
          title: full.title || p.title,
          date: p.addDate,
          hooks: titleHooks(full.title || p.title),
          글자수_공백포함: text.length,
          글자수_공백제외: text.replace(/\s/g, "").length,
          사진: full.images,
          소제목: st.subheads ?? null,
          표: st.tables ?? 0,
          영상: st.videos ?? 0,
          링크카드: st.linkCards ?? 0,
          구분선: st.dividers ?? 0,
          스티커: st.stickers ?? 0,
          사진묶음: st.imageStrips ?? 0,
          지도: !!st.hasMap,
          태그수: (full.tags || []).length,
          flow: flowOf(text),
          emphasis: emphasisOf(full.bodyHtml),
          para: paraStats(full.bodyHtml),
          bodyOk: !!full.bodyHtml,
        };
        rows.push(row);
        done[p.url] = row;
        process.stdout.write(row.bodyOk ? "o" : "x");
      } catch (e) {
        skipped.push({ url: p.url, why: e.message });
        process.stdout.write("!");
      }
      await sleep(1100);
      // 진행분을 계속 저장 — 중간에 끊겨도 날아가지 않게.
      fs.writeFileSync(OUT, JSON.stringify({ ts: Date.now(), byUrl: done, skipped }, null, 2), "utf8");
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ ts: Date.now(), byUrl: done, skipped }, null, 2), "utf8");
  console.log(`\n\n총 ${rows.length}편 수집, 실패 ${skipped.length}건 → ${OUT}`);
}

run().catch((e) => { console.error("실패:", e); process.exit(1); });
