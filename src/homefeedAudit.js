/**
 * 홈피드 진단 — 내 블로그가 홈피드에서 밀리는 이유를 찾습니다.
 *
 * ⚠️ 왜 이걸 만드는가
 * 경쟁 서비스(블라이·판다랭크·블덱스)는 전부 **검색 노출**만 봅니다.
 * 그런데 2026년 네이버는 홈피드에서 오는 트래픽이 훨씬 큽니다.
 * 검색은 그 키워드를 친 사람만 오지만, 홈피드는 안 찾던 사람에게도 밀어줍니다.
 *
 * 실제로 두 블로그를 재봤습니다.
 *   니들의연애가중계 — 글 145편, 일 방문 74,094명
 *   man_is_best      — 글 4,588편, 일 방문 21,018명
 * 글은 32분의 1인데 방문자는 4배입니다. 검색 지표로는 이 차이가 설명되지 않습니다.
 * 두 블로그 다 진단 점수가 94점으로 같았으니까요.
 *
 * 차이는 **글의 생김새**에 있었습니다. 소제목 6개 대 1개, 말줄임표 66% 대 1%.
 * 이건 셀 수 있습니다. 그래서 도구로 만듭니다.
 *
 * ⚠️ 다시 한 번 — 이건 **상관관계지 인과가 아닙니다.**
 * 소제목을 6개로 늘린다고 홈피드에 뜬다는 보장은 없습니다.
 * 홈피드 로직은 공개돼 있지 않고, 앞으로도 공개되지 않을 겁니다.
 * 우리가 말할 수 있는 건 "잘 되는 블로그는 이렇게 생겼다"까지입니다.
 * 그 이상을 약속하면 거짓말이 됩니다.
 */

const { fetchPostList, fetchVisitors, parseBlogId } = require("./naverBlogData");
const blogFetch = require("./blogFetch");

/**
 * 제목에 쓰인 장치를 셉니다.
 *
 * ⚠️ 이 목록은 실측에서 나왔습니다. 잘 되는 블로그 90편과 덜 되는 블로그 90편의
 * 제목을 세어보고, 확실히 갈리는 것만 남겼습니다. 감으로 넣은 항목은 없습니다.
 */
const TITLE_DEVICES = {
  // 인용문으로 시작 — 사람 말을 그대로 따오면 장면이 그려집니다. (88% 대 40%)
  quoteStart: { label: "따옴표로 시작", test: (t) => /^["'“‘]/.test(t.trim()), good: 70 },
  // 말줄임표로 끊기 — 뒷말을 감추는 장치. 가장 크게 갈렸습니다. (66% 대 1%)
  ellipsis: { label: "말줄임표(…)로 끊기", test: (t) => /\.\.\.|…/.test(t), good: 50 },
  // 궁금증을 남기는 말 — 제목만 읽고는 답을 알 수 없게 만듭니다. (41% 대 18%)
  curiosity: {
    label: "궁금증 남기는 말",
    test: (t) => /['‘]?이것['’]?|['‘]?이곳['’]?|진짜 이유|이유|비밀|정체|알고보니|했던|하더니|까닭|근황|무슨 일/.test(t),
    good: 35,
  },
  // 숫자 — 구체적인 수치가 눈에 걸립니다. (58% 대 42%)
  number: { label: "숫자 넣기", test: (t) => /\d/.test(t), good: 50 },
};

/** 글 한 편의 생김새 */
async function measurePost(url, title) {
  const post = await blogFetch.fetchPost(url);
  const st = blogFetch.analyzeStructure(post.bodyHtml);
  return {
    title,
    url,
    chars: (post.bodyText || "").length,
    subheads: st ? st.subheads : null,
    images: st ? st.images : post.images || 0,
    linkCards: st ? st.linkCards : 0,
    videos: st ? st.videos : 0,
    hasMap: st ? st.hasMap : false,
  };
}

/**
 * 블로그 하나를 홈피드 관점에서 진단합니다.
 * @param {string} blogId
 * @param {object} opts { deep: 열어볼 글 수, sample: 제목만 볼 글 수 }
 */
async function audit(blogId, { deep = 5, sample = 60 } = {}) {
  const id = parseBlogId(blogId);
  if (!id) return { ok: false, why: "블로그 주소나 아이디를 확인해 주세요." };

  // 제목은 많이, 본문은 조금. 본문을 여는 게 훨씬 느립니다.
  let posts = [];
  for (let page = 1; posts.length < sample && page <= 3; page++) {
    const l = await fetchPostList(id, { page, countPerPage: 30 });
    if (!l.posts.length) break;
    posts = posts.concat(l.posts);
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!posts.length) return { ok: false, why: "글을 찾지 못했습니다. 아이디를 다시 확인해 주세요." };

  // 같은 글이 두 번 들어오는 경우가 있습니다.
  const seen = new Set();
  posts = posts.filter((p) => !seen.has(p.logNo) && seen.add(p.logNo)).slice(0, sample);

  const visitors = await fetchVisitors(id);
  const settled = visitors.slice(0, -1); // 오늘은 아직 집계 중
  const avgVisitors = settled.length
    ? Math.round(settled.reduce((a, b) => a + b.count, 0) / settled.length)
    : 0;

  // ── 제목 장치 ────────────────────────────────────────
  const titles = posts.map((p) => p.title).filter(Boolean);
  const devices = {};
  for (const [key, d] of Object.entries(TITLE_DEVICES)) {
    const hit = titles.filter((t) => d.test(t)).length;
    const rate = Math.round((hit / titles.length) * 100);
    devices[key] = { label: d.label, rate, good: d.good, ok: rate >= d.good };
  }
  const avgTitleLen = Math.round(titles.reduce((a, t) => a + t.length, 0) / titles.length);

  // ── 본문 생김새 ──────────────────────────────────────
  const measured = [];
  const failed = [];
  for (const p of posts.slice(0, deep)) {
    try {
      measured.push(await measurePost(p.url, p.title));
    } catch (e) {
      failed.push(p.title);
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const avg = (k) => {
    const v = measured.map((m) => m[k]).filter((x) => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const body = {
    chars: avg("chars"),
    subheads: avg("subheads"),
    images: avg("images"),
    linkCards: avg("linkCards"),
  };

  // ── 주제 순도 ────────────────────────────────────────
  // 협찬·리뷰형과 정보·이슈형이 섞이면 네이버가 "이 블로그는 무슨 블로그인가"를
  // 판단하기 어려워집니다. 홈피드는 그 판단으로 밀어주는 자리입니다.
  const adLike = titles.filter((t) => /♥|❤|추천|후기|리뷰|내돈내산|체험단|협찬|공구|할인|이벤트|증정/.test(t)).length;
  const purity = Math.round((1 - adLike / titles.length) * 100);

  // ── 할 일 ────────────────────────────────────────────
  const todos = [];
  const push = (weight, title, detail) => todos.push({ weight, title, detail });

  if (body.subheads != null && body.subheads < 4) {
    push(
      1,
      `소제목을 ${body.subheads}개 → 5~6개로`,
      "스마트에디터에 제목 서식이 없어서 다들 인용구를 소제목으로 씁니다. " +
        "홈피드는 스크롤로 흘러가는 자리라 끊는 자리가 있어야 손가락이 멈춥니다. " +
        "글을 더 쓸 필요 없이 지금 글을 나누기만 하면 됩니다."
    );
  }
  if (!devices.ellipsis.ok) {
    push(
      2,
      `제목에 말줄임표를 (지금 ${devices.ellipsis.rate}%)`,
      "제목이 문장을 다 끝내버리면 안 눌러도 됩니다. '…' 뒤에 답을 감추세요. " +
        "잘 되는 블로그는 절반 이상에서 씁니다."
    );
  }
  if (!devices.curiosity.ok) {
    push(
      2,
      `제목 끝을 열어두기 (지금 ${devices.curiosity.rate}%)`,
      "'이것', '이곳', '진짜 이유', '했던' — 제목만 읽고는 답을 알 수 없게 만드는 말입니다."
    );
  }
  if (body.images != null && body.images < 15) {
    push(3, `사진을 ${body.images}장 → 18장 이상으로`, "홈피드는 머문 시간을 봅니다. 사진이 그 시간을 늘립니다.");
  }
  if (purity < 75) {
    push(
      3,
      `주제가 섞여 있습니다 (협찬성 글 ${100 - purity}%)`,
      "홈피드는 '이 블로그는 무슨 블로그인가'를 판단해서 그 주제에 관심 있는 사람에게 밀어줍니다. " +
        "협찬과 정보가 반반이면 그 판단이 흐려집니다. 협찬용 블로그를 따로 두는 쪽을 권합니다."
    );
  }
  if (!devices.quoteStart.ok) {
    push(4, `따옴표로 시작하기 (지금 ${devices.quoteStart.rate}%)`, "사람 말을 그대로 따오면 장면이 그려져서 눈이 멈춥니다.");
  }
  if (body.chars != null && body.chars < 1200) {
    push(4, `본문이 ${body.chars}자로 짧습니다`, "1,600자 안팎이 이 분야의 보통입니다.");
  }

  todos.sort((a, b) => a.weight - b.weight);

  return {
    ok: true,
    blogId: id,
    checkedAt: new Date().toISOString(),
    avgVisitors,
    totalPosts: posts.length,
    titleSample: titles.length,
    deepSample: measured.length,
    avgTitleLen,
    devices,
    body,
    purity,
    posts: measured,
    failed,
    todos,
    note:
      "홈피드 로직은 네이버가 공개하지 않습니다. 여기 있는 것은 잘 되는 블로그들이 " +
      "실제로 어떻게 생겼는지를 센 값이고, 이렇게 하면 뜬다는 보장이 아닙니다.",
  };
}

/** 두 블로그를 나란히 놓고 봅니다. */
async function versus(myId, rivalId, opts = {}) {
  const [mine, rival] = [await audit(myId, opts), await audit(rivalId, opts)];
  if (!mine.ok) return { ok: false, why: `내 블로그: ${mine.why}` };
  if (!rival.ok) return { ok: false, why: `비교 블로그: ${rival.why}` };

  const rows = [];
  const cmp = (label, a, b, unit = "", higherIsBetter = true) => {
    if (a == null || b == null) return;
    rows.push({ label, mine: a, rival: b, unit, behind: higherIsBetter ? a < b : a > b });
  };
  cmp("일 방문자", mine.avgVisitors, rival.avgVisitors, "명");
  cmp("소제목", mine.body.subheads, rival.body.subheads, "개");
  cmp("사진", mine.body.images, rival.body.images, "장");
  cmp("본문 길이", mine.body.chars, rival.body.chars, "자");
  cmp("주제 순도", mine.purity, rival.purity, "%");
  for (const k of Object.keys(TITLE_DEVICES)) {
    cmp(mine.devices[k].label, mine.devices[k].rate, rival.devices[k].rate, "%");
  }

  return { ok: true, mine, rival, rows };
}

module.exports = { audit, versus, TITLE_DEVICES };
