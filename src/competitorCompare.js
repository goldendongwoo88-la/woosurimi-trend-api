/**
 * 경쟁 글 비교 — "내 글이 3위인데, 위에 있는 글은 뭐가 다른가?"
 *
 * ⚠️ 이 기능이 유료 전환을 만듭니다. 이유가 있습니다.
 * 진단은 "당신 블로그는 57점입니다"로 끝납니다. 그래서 뭘 하라는 건지 알 수 없습니다.
 * 그런데 "1~3위 글은 평균 2,400자인데 사장님 글은 1,800자입니다"는
 * **당장 할 일이 나옵니다.** 사람은 점수가 아니라 할 일에 돈을 냅니다.
 *
 * ⚠️ 조심할 것 — 여기서 나오는 건 **상관관계지 인과가 아닙니다.**
 * 글자 수를 2,400자로 늘린다고 1위가 되는 게 아닙니다. 1위 글들이 우연히 길 수도 있고,
 * 그 블로그의 지수가 높아서 올라간 것일 수도 있습니다.
 * "이렇게 하면 1위가 됩니다"라고 쓰면 거짓말이 됩니다.
 * 화면에는 **"위에 있는 글들은 이런 모습이다"**까지만 적습니다.
 *
 * ⚠️ 네이버를 연달아 두들기면 막힙니다. 글을 하나씩, 사이를 띄워서 가져옵니다.
 */

const { searchBlogRanking, parsePostUrl } = require("./naverBlogData");
const blogFetch = require("./blogFetch");
const postAudit = require("./postAudit");

/** 글 하나에서 잴 수 있는 것들만 잽니다. */
function measure(post, keyword) {
  const body = post.bodyText || "";
  const title = post.title || "";
  const kw = String(keyword || "").trim();
  // 스마트에디터 구성요소 — 본문 HTML을 제대로 잘라낼 수 있게 되면서 쓸 수 있게 됐습니다.
  const st = blogFetch.analyzeStructure(post.bodyHtml);

  return {
    url: post.url,
    title,
    titleLength: title.length,
    // 제목 맨 앞에 키워드가 있는지 — 네이버가 앞쪽을 더 본다는 게 통설입니다.
    keywordInTitle: kw ? title.includes(kw) : null,
    keywordAtTitleStart: kw ? title.trim().startsWith(kw) : null,
    chars: body.length,
    charsNoSpace: body.replace(/\s/g, "").length,
    images: st ? st.images : post.images || 0,
    tags: (post.tags || []).length,
    // 본문에서 키워드가 몇 번 나오는지
    keywordCount: kw ? postAudit.countKeyword(body, kw) : null,
    // 네이버 블로그에서 인용구가 사실상 소제목 역할을 합니다.
    headings: st ? st.subheads : null,
    hasMap: st ? st.hasMap : null,
    linkCards: st ? st.linkCards : null,
    videos: st ? st.videos : null,
  };
}

const avg = (arr, key) => {
  const vals = arr.map((x) => x[key]).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
};

/**
 * keyword로 검색해서 상위 글들을 가져와 내 글과 비교합니다.
 * myUrl이 없으면 상위 글들의 공통점만 보여줍니다.
 */
async function compare({ keyword, myUrl, topN = 5 }) {
  const kw = String(keyword || "").trim();
  if (!kw) return { ok: false, why: "키워드를 입력해 주세요." };

  const search = await searchBlogRanking(kw, { limit: 30 });
  if (!search.ok) {
    return {
      ok: false,
      why: search.why || "네이버 검색을 읽지 못했습니다. 잠시 뒤에 다시 해주세요.",
      blocked: !!search.blocked,
    };
  }
  if (!search.results.length) return { ok: false, why: "이 키워드로 나오는 블로그 글이 없습니다." };

  const mine = myUrl ? parsePostUrl(myUrl) : null;
  const myRank = mine
    ? (search.results.find((r) => r.blogId === mine.blogId && r.logNo === mine.logNo) || {}).rank ?? null
    : null;

  // 위에 있는 글들을 가져옵니다. 내 글은 따로 가져옵니다(순위권 밖일 수 있으므로).
  const targets = search.results.filter((r) => !mine || !(r.blogId === mine.blogId && r.logNo === mine.logNo)).slice(0, topN);

  const rivals = [];
  const failed = [];
  for (const t of targets) {
    try {
      const post = await blogFetch.fetchPost(t.url);
      if (!post.bodyText || post.bodyText.length < 50) {
        failed.push({ rank: t.rank, why: "본문을 읽지 못했습니다" });
      } else {
        rivals.push({ rank: t.rank, blogId: t.blogId, ...measure({ ...post, url: t.url }, kw) });
      }
    } catch (e) {
      failed.push({ rank: t.rank, why: e.message });
    }
    await new Promise((r) => setTimeout(r, 900));
  }

  if (!rivals.length) {
    return { ok: false, why: "상위 글을 한 편도 읽지 못했습니다. 잠시 뒤에 다시 해주세요." };
  }

  let me = null;
  if (myUrl) {
    try {
      const post = await blogFetch.fetchPost(myUrl);
      if (post.bodyText && post.bodyText.length >= 50) me = measure({ ...post, url: myUrl }, kw);
    } catch {}
  }

  const bench = {
    chars: avg(rivals, "chars"),
    images: avg(rivals, "images"),
    titleLength: avg(rivals, "titleLength"),
    keywordCount: avg(rivals, "keywordCount"),
    headings: avg(rivals, "headings"),
    keywordInTitleRate: Math.round(
      (rivals.filter((r) => r.keywordInTitle).length / rivals.length) * 100
    ),
    mapRate: Math.round((rivals.filter((r) => r.hasMap).length / rivals.length) * 100),
  };

  // ── 차이 짚기 ────────────────────────────────────────
  // ⚠️ "이렇게 하면 오른다"가 아니라 "이만큼 다르다"까지만 말합니다.
  const gaps = [];
  if (me) {
    const d = (label, mineV, benchV, unit, tolerance) => {
      if (mineV == null || benchV == null) return;
      const diff = mineV - benchV;
      if (Math.abs(diff) < tolerance) return;
      gaps.push({
        label,
        mine: mineV,
        bench: benchV,
        diff,
        text:
          diff < 0
            ? `상위 글 평균보다 ${Math.abs(diff).toLocaleString()}${unit} 적습니다.`
            : `상위 글 평균보다 ${diff.toLocaleString()}${unit} 많습니다.`,
      });
    };
    d("글자 수", me.chars, bench.chars, "자", 300);
    d("사진 수", me.images, bench.images, "장", 3);
    d("소제목 수", me.headings, bench.headings, "개", 2);
    d("본문 키워드 반복", me.keywordCount, bench.keywordCount, "회", 2);

    if (me.keywordInTitle === false && bench.keywordInTitleRate >= 60) {
      gaps.push({
        label: "제목에 키워드",
        text: `상위 글 ${bench.keywordInTitleRate}%가 제목에 "${kw}"를 넣었는데, 사장님 글에는 없습니다.`,
      });
    }
    // 장소 글에서 지도는 있고 없고가 눈에 띄게 갈립니다.
    if (me.hasMap === false && bench.mapRate >= 60) {
      gaps.push({
        label: "지도",
        text: `상위 글 ${bench.mapRate}%가 지도를 넣었는데, 사장님 글에는 없습니다.`,
      });
    }
  }

  return {
    ok: true,
    keyword: kw,
    myRank,
    me,
    rivals,
    bench,
    gaps,
    failed,
    note:
      "상위 글의 공통점이지, 상위 노출의 원인이 아닙니다. 글자 수를 늘린다고 순위가 오르지는 않습니다. " +
      "무엇이 다른지 보고 판단하는 데 쓰세요.",
  };
}

module.exports = { compare, measure };
