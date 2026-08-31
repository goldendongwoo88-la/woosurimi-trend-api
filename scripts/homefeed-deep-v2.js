/**
 * v1 보정판 — 도입부·Q&A·태그를 제대로 잽니다.
 *
 * ⚠️ v1에서 틀린 것 세 가지를 여기서 바로잡습니다. 남겨둡니다:
 *  1) bodyText에는 줄바꿈이 아예 없습니다(pageExtractor가 공백으로 이어붙임).
 *     그래서 "줄 단위 도입부"가 글 전체가 되어 도입부 길이 = 글자수로 나왔습니다.
 *     → 본문 HTML의 se-text-paragraph(화면상 한 문단)를 직접 뽑아 첫 문단을 도입부로 씁니다.
 *  2) Q&A 정규식이 줄바꿈을 요구해서 무조건 0건이 나왔습니다. → 글 전체에서 찾습니다.
 *  3) 태그는 전부 0으로 나왔는데, 진짜 없는 게 아니라 모바일 페이지에서 못 읽는 것입니다.
 *     → 0으로 세지 않고 null(측정 불가)로 둡니다. 0으로 세면 "태그를 안 단다"는 거짓 결론이 납니다.
 */
const fs = require("fs");
const path = require("path");
const { fetchPostList } = require("../src/naverBlogData");
const { fetchPost, analyzeStructure } = require("../src/blogFetch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, "..", "data", "homefeed-deep-v2.json");

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

/** 화면상 문단 그대로 뽑기 — 도입부·문단 리듬의 근거. */
function paragraphsOf(bodyHtml) {
  const out = [];
  for (const m of String(bodyHtml || "").matchAll(/<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/gi, " ").replace(/[\s​]+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

function titleHooks(t) {
  const s = String(t || "");
  return {
    len: s.length,
    따옴표시작: /^["'“‘]/.test(s.trim()),
    따옴표포함: /["'“”‘’]/.test(s),
    말줄임: /\.\.\.|…|\.\./.test(s),
    숫자: /\d/.test(s),
    가격: /\d\s*(원|만원|억)/.test(s),
    물음표: (s.match(/\?/g) || []).length,
    전언체: /(다는|라는|다던|더라|봤더니|한다는|이라는|났다는|됐다는|린다는|한다길래)/.test(s),
    정체숨기기: /(그\s?(배우|여배우|톱스타|아이돌|가수|스타|연예인)|어제\s?그|모\s?배우|여배우|연예인|이\s?여자)/.test(s),
    감정어: /(대박|미쳤|헐|이럴수가|어머|난리|충격|경악|소름|깜짝|놀랐|레전드|감탄|존예|예쁘|얼마나)/.test(s),
    반전: /(알고보니|알고\s보니|사실은|의외로|아니었|였다니|줄\s?알았|인데\.\.|했는데\.\.|더니)/.test(s),
    브랜드제품: /(올리브영|에센스|틴트|쿠션|크림|세럼|앰플|선크림|샴푸|립|미스트)/.test(s),
    헤어: /(헤어|머리|단발|숏컷|펌|염색|뱅|앞머리|허쉬컷|레이어드)/.test(s),
    후기: /(후기|내돈내산|리뷰|추천)/.test(s),
  };
}

async function run() {
  let done = {};
  if (fs.existsSync(OUT)) { try { done = JSON.parse(fs.readFileSync(OUT, "utf8")).byUrl || {}; } catch {} }
  const skipped = [];

  for (const t of TARGETS) {
    let list;
    try { list = await fetchPostList(t.id, { countPerPage: PER_BLOG + 6 }); }
    catch (e) { skipped.push({ blog: t.id, why: e.message }); continue; }
    const posts = (list.posts || []).filter((p) => p.isPublic && p.searchable).slice(0, PER_BLOG);
    console.log(`\n[${t.group}] ${t.id} — ${posts.length}편`);

    for (const p of posts) {
      if (done[p.url]) { process.stdout.write("·"); continue; }
      try {
        const full = await fetchPost(p.url);
        const st = analyzeStructure(full.bodyHtml) || {};
        const text = String(full.bodyText || "");
        const paras = paragraphsOf(full.bodyHtml);
        const lens = paras.map((x) => x.length).sort((a, b) => a - b);

        done[p.url] = {
          group: t.group, blogId: t.id, url: p.url,
          title: full.title || p.title, date: p.addDate,
          hooks: titleHooks(full.title || p.title),
          글자수_공백포함: text.length,
          글자수_공백제외: text.replace(/\s/g, "").length,
          사진: full.images,
          소제목: st.subheads ?? null,
          표: st.tables ?? 0, 영상: st.videos ?? 0, 링크카드: st.linkCards ?? 0,
          구분선: st.dividers ?? 0, 스티커: st.stickers ?? 0, 사진묶음: st.imageStrips ?? 0,
          // ⚠️ 태그는 못 읽으면 null — 0으로 세지 않습니다.
          태그수: (full.tags || []).length || null,
          // 도입부 = 화면상 첫 문단 3개
          도입문단: paras.slice(0, 3),
          도입부_첫문단자수: paras[0] ? paras[0].length : null,
          정형도입: /^(안녕하세요|오늘은|여러분|반갑습니다|오늘\s?소개)/.test(paras[0] || ""),
          // Q&A·목차 — 글 전체에서(줄바꿈 의존 안 함)
          qna: (text.match(/Q\s*[.:]|Q\d\s*[.:]?/g) || []).length,
          목차: /목차/.test(text),
          결론먼저: /결론부터|먼저 결론|한\s?줄\s?요약|3줄\s?요약|핵심만/.test(text),
          문단수: paras.length,
          문단평균: lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : null,
          문단중앙: lens.length ? lens[Math.floor(lens.length / 2)] : null,
          문단최대: lens.length ? lens[lens.length - 1] : null,
          긴문단비율: lens.length ? Math.round((lens.filter((x) => x > 60).length / lens.length) * 100) : null,
          emphasis: full.bodyHtml ? {
            굵게: (full.bodyHtml.match(/<(b|strong)[\s>]/gi) || []).length + (full.bodyHtml.match(/font-weight:\s*(bold|[6-9]00)/gi) || []).length,
            밑줄: (full.bodyHtml.match(/<u[\s>]/gi) || []).length + (full.bodyHtml.match(/text-decoration:[^;"]*underline/gi) || []).length,
            형광: (full.bodyHtml.match(/background-color:\s*(?!transparent|rgba\(0,\s*0,\s*0,\s*0\))/gi) || []).length,
          } : null,
          bodyOk: !!full.bodyHtml,
        };
        process.stdout.write(done[p.url].bodyOk ? "o" : "x");
      } catch (e) { skipped.push({ url: p.url, why: e.message }); process.stdout.write("!"); }
      await sleep(1100);
      fs.writeFileSync(OUT, JSON.stringify({ ts: Date.now(), byUrl: done, skipped }, null, 2), "utf8");
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ ts: Date.now(), byUrl: done, skipped }, null, 2), "utf8");
  console.log(`\n\n${Object.keys(done).length}편 · 실패 ${skipped.length} → ${OUT}`);
}
run().catch((e) => { console.error(e); process.exit(1); });
