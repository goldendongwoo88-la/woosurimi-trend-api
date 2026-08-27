#!/usr/bin/env node
/**
 * 올린 글이 실제로 검색에 뜨는지 봅니다.
 *
 *   node scripts/check-exposure.js                 최근 7편
 *   node scripts/check-exposure.js --n=15          최근 15편
 *   node scripts/check-exposure.js --id=goldenwoo  블로그 지정
 *
 * ⚠️ 왜 필요한가
 * 지금 흐름에는 **글을 올린 뒤가 없습니다.** 원고를 만들고, 서식을 넣고, 올리고 — 끝입니다.
 * 떴는지 안 떴는지 모른 채 다음 글을 씁니다. 안 뜨고 있으면 그걸 열 편 반복합니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 *
 * ⚠️ 오늘 한도가 찬 오픈API를 **안 씁니다.** 공개 검색 화면을 읽습니다.
 * 그래서 한도와 상관없이 지금도 돕니다.
 *
 * ⚠️ "안 나옴"을 **누락이라고 단정하지 않습니다.**
 * 제목에서 뽑은 말로 안 걸린다고 색인에 없다는 뜻이 아닙니다.
 * 제목과 상관없는 키워드로 상위에 뜨는 글이 실제로 있습니다.
 * 우리가 말할 수 있는 건 "이 말들로는 안 나온다"까지입니다.
 */

const naverData = require("../src/naverBlogData");
const blogIndex = require("../src/blogIndex");

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const line = (n = 66) => "─".repeat(n);

const norm = (s) => String(s || "").replace(/["'“”‘’.…|·\[\]()【】\s]/g, "");

/**
 * 사람이 실제로 칠 만한 **짧은 말**을 뽑습니다.
 *
 * ⚠️ 제목 뒷부분을 씁니다. 우리 제목은 앞이 후킹 문구("예뻐서 자꾸 보네")이고
 * 뒤가 진짜 주제("스노우피크 어패럴 여성 아우터")인 경우가 많습니다.
 * 사람은 뒤엣말을 검색합니다.
 */
function shortestQuery(title) {
  const t = String(title || "")
    .replace(/["'“”‘’]/g, " ")
    .replace(/\.\.\.|…/g, " ")
    .replace(/[|·\[\]()【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = t.split(" ").filter((w) => w.length >= 2);
  if (words.length < 3) return null;
  return words.slice(-3).join(" ");
}

async function myBlogId() {
  const given = arg("id", "");
  if (given) return naverData.parseBlogId(given);
  // 설정에 넣어두신 게 있으면 그걸 씁니다.
  try {
    const kit = require("../src/accounts").getBrandKit(process.env.OWNER_EMAIL);
    if (kit && kit.blogId) return kit.blogId;
  } catch {}
  return process.env.OWNER_BLOG_ID || "";
}

(async () => {
  const id = await myBlogId();
  if (!id) {
    console.log("\n블로그 아이디를 모릅니다.");
    console.log("  node scripts/check-exposure.js --id=내아이디");
    console.log("또는 브랜드 설정(/brand.html)에 넣어두시면 계속 씁니다.\n");
    process.exit(1);
  }

  /**
   * 노리는 키워드를 직접 물어보는 길.
   *
   * ⚠️ 이게 사실 제일 정확합니다. 제목에서 말을 뽑아내는 건 짐작이고,
   * 사장님은 어떤 말로 뜨고 싶은지 이미 알고 계십니다.
   */
  const kw = arg("kw", "");
  if (kw) {
    console.log(`\n"${kw}" 로 검색했을 때 — 블로그: ${id}`);
    console.log(line());
    const s = await naverData.searchBlogRanking(kw, { limit: 30 });
    if (!s.ok) {
      console.log(`\n검색을 못 했습니다: ${s.why}\n`);
      process.exit(1);
    }
    /**
     * ⚠️ searchBlogRanking 은 **제목을 안 돌려줍니다.** rank·blogId·logNo·url 뿐입니다.
     * 처음에 r.title 을 찍었다가 전부 빈칸으로 나왔습니다.
     * 없는 걸 있는 척 자리만 잡아두면 화면이 고장난 것처럼 보입니다.
     * 있는 것만 보여드리고, 제목이 궁금하시면 주소를 누르시면 됩니다.
     */
    const mine = s.results.filter((x) => x.blogId === id);
    if (mine.length) {
      for (const m of mine) console.log(`  ✓ ${String(m.rank).padStart(2)}위   ${m.url}`);
      console.log(`\n30위 안에 내 글이 ${mine.length}편 있습니다.`);
    } else {
      console.log(`\n  30위 안에 내 글이 없습니다.`);
    }
    // 위에 누가 있는지 보여드립니다 — 그게 다음에 뭘 해야 할지 알려줍니다.
    console.log(`\n지금 위에 있는 블로그 5개:`);
    for (const r of s.results.slice(0, 5)) {
      console.log(`  ${String(r.rank).padStart(2)}위  ${r.blogId.padEnd(20)}${r.blogId === id ? "← 내 글" : ""}`);
      console.log(`       ${r.url}`);
    }
    console.log(`\n(제목은 네이버가 이 화면에서 안 줍니다. 주소를 누르시면 보입니다.)`);
    console.log("");
    process.exit(0);
  }

  const want = Math.max(1, Math.min(30, Number(arg("n", 7)) || 7));
  console.log(`\n블로그: ${id} · 최근 ${want}편`);
  console.log(line());

  let posts;
  try {
    const r = await naverData.fetchPostList(id, { countPerPage: want });
    posts = (r.posts || r.items || r || []).slice(0, want);
  } catch (e) {
    console.log(`\n글 목록을 못 받았습니다: ${e.message}\n`);
    process.exit(1);
  }
  if (!posts.length) {
    console.log("\n글이 없습니다.\n");
    process.exit(0);
  }

  const rows = [];
  for (const p of posts) {
    const post = {
      logNo: String(p.logNo || p.no || ""),
      title: String(p.title || "").replace(/<[^>]+>/g, "").trim(),
      url: `https://blog.naver.com/${id}/${p.logNo || p.no}`,
      addDate: p.addDate || p.date || null,
      // fetchPostList가 공개·검색허용 여부를 안 주면 확인할 수 있다고 봅니다.
      // 실제로 비공개면 검색에 안 걸리고 "안 나옴"으로 나옵니다 — 그건 정직한 결과입니다.
      isPublic: p.isPublic !== false,
      searchable: p.searchable !== false,
    };
    process.stdout.write(`  ${post.title.slice(0, 28).padEnd(30)} `);
    let r;
    try {
      r = await blogIndex.checkExposure(id, post);
    } catch (e) {
      r = { ...post, state: "skipped", why: e.message };
    }

    /**
     * ⚠️ 여기서 하마터면 사장님을 오해시킬 뻔했습니다.
     *
     * checkExposure 는 **제목 전체를 맨 먼저** 검색합니다. 거기서 걸리면 바로 끝납니다.
     * 그런데 제목을 통째로 넣으면 자기 글이 1위인 건 거의 당연합니다.
     * 아무도 20어절짜리 제목을 검색창에 치지 않으니까요.
     *
     * 처음 돌렸을 때 "노출 5/5, 전부 1위"가 나왔습니다. 보기엔 훌륭한데
     * 5개 중 4개가 제목 전체로 걸린 것이었습니다. **알아낸 게 거의 없습니다.**
     * 그대로 보여드렸으면 "다 잘되고 있구나" 하셨을 겁니다.
     *
     * 두 가지는 다른 질문입니다:
     *   색인됐나        — 네이버가 내 글을 알고는 있나. (제목 전체로 확인 가능)
     *   경쟁력이 있나    — 사람들이 실제로 칠 만한 짧은 말로도 위에 뜨나.
     *
     * 그래서 짧은 말로 **한 번 더** 봅니다. 이게 진짜 알고 싶은 것입니다.
     */
    r.byFullTitle = r.state === "exposed" && norm(r.foundBy) === norm(post.title);
    if (r.state === "exposed" && r.byFullTitle) {
      const short = shortestQuery(post.title);
      if (short) {
        await new Promise((res) => setTimeout(res, 700));
        try {
          const s = await naverData.searchBlogRanking(short, { limit: 30 });
          if (s.ok) {
            const hit = s.results.find((x) => x.blogId === id && x.logNo === post.logNo);
            r.shortQuery = short;
            r.shortRank = hit ? hit.rank : null;
          }
        } catch {}
      }
    }

    const mark =
      r.state !== "exposed" ? (r.state === "notfound" ? "· 안 나옴" : "- 확인 못 함")
      : !r.byFullTitle ? `✓ ${r.rank}위 (짧은 말로)`
      : r.shortRank ? `✓ ${r.shortRank}위 (짧은 말로)`
      : r.shortQuery ? `△ 색인만 (짧은 말론 안 뜸)`
      : `△ 색인만`;
    console.log(mark);
    rows.push(r);
    // ⚠️ 쉬지 않고 때리면 네이버가 막습니다. 막히면 전부 "확인 못 함"이 됩니다.
    await new Promise((res) => setTimeout(res, 700));
  }

  const judged = rows.filter((r) => r.state !== "skipped");
  const exposed = judged.filter((r) => r.state === "exposed");
  const notfound = judged.filter((r) => r.state === "notfound");
  const skipped = rows.filter((r) => r.state === "skipped");

  console.log(line());

  // ⚠️ 두 숫자를 갈라서 보여줍니다. 하나로 뭉치면 "다 잘된다"로 보입니다.
  const real = exposed.filter((r) => !r.byFullTitle || r.shortRank);
  const onlyIndexed = exposed.filter((r) => r.byFullTitle && !r.shortRank);

  console.log(`\n색인됨      ${exposed.length} / ${judged.length}${skipped.length ? `   (확인 못 한 것 ${skipped.length}편)` : ""}`);
  console.log(`짧은 말로도  ${real.length} / ${judged.length}   ← 이게 진짜 중요한 숫자입니다`);

  if (real.length) {
    console.log(`\n사람들이 칠 만한 말로도 뜨는 글:`);
    for (const r of real.sort((a, b) => (a.shortRank ?? a.rank) - (b.shortRank ?? b.rank))) {
      console.log(`  ${String(r.shortRank ?? r.rank).padStart(2)}위  ${r.title.slice(0, 32)}`);
      console.log(`        "${r.shortQuery ?? r.foundBy}" 로 검색했을 때`);
    }
    /**
     * ⚠️ 이 짧은 말은 **제목 뒤 3어절을 기계적으로 자른 것**입니다.
     * 사람이 실제로 치는 말과 다를 수 있습니다 — "2기 화제 장면" 같은 건
     * 아무도 검색 안 합니다. 그래도 제목 전체보다는 훨씬 실제에 가깝습니다.
     *
     * 진짜 노리는 키워드가 따로 있으시면 --kw= 로 직접 물어보시는 게 정확합니다.
     */
    console.log(`\n→ 이 말들로는 실제로 위에 뜹니다. 다만 **제목 뒤 3어절을 기계적으로 자른 것**이라`);
    console.log(`   사람이 진짜 치는 말과 다를 수 있습니다.`);
    console.log(`   노리는 키워드가 따로 있으면:  node scripts/check-exposure.js --kw="김고은 가을코트"`);
  }

  if (onlyIndexed.length) {
    console.log(`\n색인은 됐는데 짧은 말로는 안 뜨는 글:`);
    for (const r of onlyIndexed) {
      console.log(`  · ${r.title.slice(0, 36)}`);
      console.log(`      "${r.shortQuery}" 로는 30위 안에 없습니다`);
    }
    console.log(`\n⚠️ 제목을 통째로 검색하면 1위로 나옵니다. 그건 당연합니다 —`);
    console.log(`   아무도 20어절짜리 제목을 검색창에 치지 않습니다.`);
    console.log(`   네이버가 글을 알고는 있다는 뜻일 뿐, 경쟁력이 있다는 뜻이 아닙니다.`);
  }

  if (notfound.length) {
    console.log(`\n이 말들로는 안 나오는 글:`);
    for (const r of notfound) console.log(`  · ${r.title.slice(0, 40)}`);
    // ⚠️ 여기서 "누락됐습니다"라고 하면 안 됩니다. 실제로 그렇게 말했다가 틀린 적이 있습니다.
    console.log(`\n⚠️ 이걸 "누락"이라고 단정하면 안 됩니다.`);
    console.log(`   제목에서 뽑은 말로 안 걸린다는 뜻이지, 색인에 없다는 뜻이 아닙니다.`);
    console.log(`   제목과 상관없는 키워드로 위에 떠 있을 수 있습니다.`);
    console.log(`   정확히 보시려면 네이버 검색에 직접 쳐보시는 게 제일 확실합니다.`);
  }

  if (skipped.length) {
    console.log(`\n확인 못 한 글:`);
    for (const r of skipped) console.log(`  · ${r.title.slice(0, 34)} — ${r.why || "이유 모름"}`);
  }

  console.log("");
})().catch((e) => { console.error("\n터졌습니다:", e.message); process.exit(1); });
