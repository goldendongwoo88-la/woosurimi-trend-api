/**
 * 내 블로그 힘 재기, 그리고 **내가 이길 수 있는 키워드** 고르기.
 *
 * ⚠️ 먼저 정직하게 밝힙니다.
 * **네이버는 블로그 지수를 공개하지 않습니다.** C-Rank도 D.I.A.도 내부 로직입니다.
 * 경쟁 서비스가 "블로그 지수 78점"이라고 보여주는 것도 전부 추정입니다.
 * 여기서 내는 숫자도 추정입니다. 네이버 공식 판정이 아닙니다.
 *
 * ⚠️ 그런데 추정 방식이 다릅니다. 이게 핵심입니다.
 *
 * 흔한 방식 — "검색량 ÷ 문서 수"가 높으면 기회 키워드다.
 *   문제: 문서 수가 적어도 **상위 10개가 전부 대형 블로그면** 못 이깁니다.
 *   반대로 문서가 많아도 위에 약한 블로그뿐이면 비집고 들어갑니다.
 *   문서 수는 "몇 명이 썼나"이고, 우리가 알고 싶은 건 "누가 위에 있나"입니다.
 *
 * 우리 방식 — **지금 위에 있는 블로그들이 얼마나 센가**를 잽니다.
 *   그 키워드 상위 블로그들의 일 방문자 수를 실제로 가져옵니다.
 *   내 방문자 수와 견줍니다. 내가 더 세면 비벼볼 만한 것입니다.
 *
 * ⚠️ 이 방식의 한계도 적어둡니다.
 *   1) **방문자 수를 숨긴 블로그는 못 잽니다.** 실제로 절반쯤 그렇습니다.
 *      그럴 땐 "모름"이라고 하지, 약하다고 치지 않습니다.
 *   2) 방문자 수가 곧 검색 경쟁력은 아닙니다. 인플루언서는 검색이 아니라
 *      구독으로 방문자를 모을 수 있습니다.
 *   3) 오늘 1위가 내일도 1위는 아닙니다. 한 번 잰 값입니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 * ⚠️ 오픈API(APIHUB)를 안 씁니다. 일별 한도와 무관하게 돕니다.
 */

const { fetchVisitors, searchBlogRanking, fetchPostList } = require("./naverBlogData");

/** 네이버가 막지 않게 사이를 둡니다. 급하게 때리면 전부 실패로 돌아옵니다. */
const GAP_MS = 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 같은 블로그를 여러 키워드에서 또 만납니다. 한 번만 가져옵니다.
 * ⚠️ 프로세스가 살아 있는 동안만 기억합니다. 오래 두면 옛날 숫자를 쓰게 됩니다.
 */
const visitorCache = new Map();

/** 최근 며칠 평균 방문자. 숨겨둔 블로그는 null 입니다 — 0이 아니라 **모름**입니다. */
async function dailyVisitors(blogId) {
  if (visitorCache.has(blogId)) return visitorCache.get(blogId);
  let out = null;
  try {
    const rows = await fetchVisitors(blogId);
    if (Array.isArray(rows) && rows.length) {
      // 마지막 날은 아직 안 찬 숫자라 뺍니다. 그날만 유독 낮게 나옵니다.
      const use = rows.length > 1 ? rows.slice(0, -1) : rows;
      const nums = use.map((r) => Number(r.count) || 0).filter((n) => n > 0);
      if (nums.length) out = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    }
  } catch {}
  visitorCache.set(blogId, out);
  return out;
}

/**
 * 키워드 하나의 **벽 높이**를 잽니다.
 *
 * @param {number} topN 위에서 몇 개까지 볼지. 5면 요청 5번입니다.
 */
async function wallHeight(keyword, { topN = 5, myBlogId = null } = {}) {
  const s = await searchBlogRanking(keyword, { limit: 30 });
  if (!s.ok) return { ok: false, why: s.why, keyword };

  const top = s.results.slice(0, topN);
  const measured = [];
  const hidden = [];
  for (const r of top) {
    const v = await dailyVisitors(r.blogId);
    if (v == null) hidden.push(r.blogId);
    else measured.push({ blogId: r.blogId, rank: r.rank, visitors: v });
    await sleep(GAP_MS);
  }

  /**
   * ⚠️ **내 블로그는 벽에서 뺍니다.**
   *
   * "카리나 메이크업"을 재봤더니 내 글이 2위였습니다. 그런데 그 25,850명을
   * 벽 높이에 같이 넣고 있었습니다. 나 자신과 경쟁하는 셈입니다.
   * 벽이 부풀려져서 "어렵다"고 잘못 말하게 됩니다.
   *
   * 우리가 알고 싶은 건 **남들이 얼마나 센가**입니다.
   */
  const mine = myBlogId ? measured.filter((m) => m.blogId === myBlogId) : [];
  const rivals = myBlogId ? measured.filter((m) => m.blogId !== myBlogId) : measured;

  const nums = rivals.map((m) => m.visitors).sort((a, b) => a - b);
  const median = nums.length ? nums[Math.floor(nums.length / 2)] : null;

  // 벽 계산에 쓴 자리(내 자리 제외)만 놓고 믿을 만한 정도를 냅니다.
  const rivalSlots = top.length - mine.length;

  return {
    ok: true,
    keyword,
    total: s.results.length,
    checked: top.length,
    // ⚠️ 숨긴 블로그를 빼고 낸 값입니다. 몇 개를 못 쟀는지 같이 냅니다.
    // 5개 중 4개를 못 쟀으면 이 중앙값은 믿을 게 못 됩니다.
    median,
    measured: rivals,
    // 이미 내 글이 위에 있으면 그것도 알려드립니다 — 다른 이야기입니다.
    alreadyMine: mine.map((m) => m.rank),
    hiddenCount: hidden.length,
    confidence: rivalSlots > 0 ? Math.round((rivals.length / rivalSlots) * 100) : 0,
  };
}

/**
 * 내 블로그 힘.
 *
 * ⚠️ 방문자 수만 보지 않습니다. **실제로 이긴 기록**을 같이 봅니다.
 * 방문자가 많아도 검색으로 안 오는 블로그가 있고, 그 반대도 있습니다.
 */
async function myPower(blogId, { samplePosts = 5 } = {}) {
  const visitors = await dailyVisitors(blogId);

  // 최근 글이 어떤 말로 몇 위에 있는지 — 실제 전적입니다.
  let wins = [];
  try {
    const r = await fetchPostList(blogId, { countPerPage: samplePosts });
    const posts = ((r && (r.posts || r.items)) || r || []).slice(0, samplePosts);
    for (const p of posts) {
      const title = String(p.title || "").replace(/<[^>]+>/g, "").trim();
      const q = tailWords(title, 3);
      if (!q) continue;
      const s = await searchBlogRanking(q, { limit: 30 });
      await sleep(GAP_MS);
      if (!s.ok) continue;
      const hit = s.results.find((x) => x.blogId === blogId && String(x.logNo) === String(p.logNo || p.no));
      if (hit) wins.push({ query: q, rank: hit.rank, title });
    }
  } catch {}

  const top10 = wins.filter((w) => w.rank <= 10);

  return {
    blogId,
    visitors,
    // ⚠️ 방문자를 숨겨두셨으면 못 잽니다. 그럴 땐 그렇다고 말합니다.
    visitorsKnown: visitors != null,
    tested: wins.length,
    top10: top10.length,
    bestRank: wins.length ? Math.min(...wins.map((w) => w.rank)) : null,
    wins,
    note: visitors == null
      ? "일 방문자 수를 못 가져왔습니다. 블로그 설정에서 방문자 수를 공개해두셨는지 확인해 주세요."
      : null,
  };
}

/** 제목 뒤쪽 낱말 — 사람이 실제로 치는 건 보통 뒤엣말입니다. */
function tailWords(title, n) {
  const t = String(title || "")
    .replace(/["'“”‘’]/g, " ")
    .replace(/\.\.\.|…/g, " ")
    .replace(/[|·\[\]()【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const w = t.split(" ").filter((x) => x.length >= 2);
  return w.length >= n ? w.slice(-n).join(" ") : null;
}

/**
 * 내 힘으로 이 키워드를 이길 만한가.
 *
 * ⚠️ 점수 하나로 뭉개지 않습니다. **왜 그렇게 봤는지**를 같이 냅니다.
 * "72점"만 보면 뭘 해야 할지 모릅니다. "위에 있는 블로그가 나보다 크다"는 알 수 있습니다.
 */
function judge(myVisitors, wall) {
  if (!wall.ok) return { verdict: "모름", why: wall.why || "검색을 못 했습니다." };
  if (wall.median == null)
    return {
      verdict: "모름",
      why: `위에 있는 블로그 ${wall.checked}개가 전부 방문자 수를 숨겨뒀습니다. 잴 수가 없습니다.`,
    };
  if (myVisitors == null)
    return { verdict: "모름", why: "내 방문자 수를 몰라서 견줄 수가 없습니다." };

  const ratio = myVisitors / wall.median;
  // ⚠️ 숨긴 블로그가 많으면 값이 흔들립니다. 그럴 땐 판정을 낮춰 잡습니다.
  const shaky = wall.confidence < 60;

  /**
   * ⚠️ 판정 이름을 "쉬움/어려움"에서 **"위가 약함/강함"**으로 바꿨습니다.
   *
   * 사장님 실제 결과로 모델을 검증해봤더니 이렇게 나왔습니다:
   *
   *   아우터 자켓 코디      벽 6,098명   → 실제 3위   맞음
   *   2기 화제 장면        벽 20,107명  → 실제 1위   모델보다 좋음
   *   캐리어로 추천하는 이유  벽 2,088명   → 실제 9위   **어긋남**
   *
   * **벽이 제일 낮은 곳에서 제일 나쁜 순위가 나왔습니다.**
   * 방문자 수는 순위를 부분적으로만 설명합니다. 네이버는 그것 말고도
   * 주제 적합도·최신성·C-Rank 같은 걸 봅니다. 우리는 그걸 못 잽니다.
   *
   * 그래서 "쉬움"이라고 하면 안 됩니다. 그건 **예언**이고 우리는 못 합니다.
   * 우리가 말할 수 있는 건 **"지금 위에 있는 블로그가 나보다 작다"**는 사실뿐입니다.
   * 그건 여전히 쓸모 있습니다 — 큰 블로그들이 아직 안 차지한 자리라는 뜻이니까요.
   */
  let verdict, why;
  if (ratio >= 2) { verdict = "위가 약함"; why = `위에 있는 블로그보다 내가 ${ratio.toFixed(1)}배 큽니다.`; }
  else if (ratio >= 1) { verdict = "비슷함"; why = `비슷하거나 내가 조금 큽니다 (${ratio.toFixed(1)}배).`; }
  else if (ratio >= 0.5) { verdict = "위가 강함"; why = `위에 있는 블로그가 나보다 ${(1 / ratio).toFixed(1)}배 큽니다.`; }
  else { verdict = "위가 많이 강함"; why = `위에 있는 블로그가 나보다 ${(1 / ratio).toFixed(1)}배 큽니다.`; }

  if (shaky) why += ` (다만 ${wall.checked}개 중 ${wall.hiddenCount}개가 방문자를 숨겨서 덜 믿을 만합니다.)`;
  return { verdict, why, ratio: Math.round(ratio * 100) / 100, shaky };
}

const ORDER = { "위가 약함": 0, "비슷함": 1, "위가 강함": 2, "위가 많이 강함": 3, "모름": 4 };

module.exports = { myPower, wallHeight, judge, dailyVisitors, tailWords, ORDER, GAP_MS };
