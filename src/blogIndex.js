/**
 * 블로그 지수 진단.
 *
 * ⚠️ 먼저 분명히 해둘 것이 있습니다.
 * **네이버는 블로그 지수를 공개하지 않습니다.** C-Rank도 D.I.A.도 내부 로직이고,
 * 외부에서 조회할 수 있는 API가 없습니다. 그러니 블라이·판다랭크·블덱스가
 * "최적 3단계", "준최6" 같은 등급을 보여주는 것도 전부 **그 회사가 만든 추정치**입니다.
 *
 * 우리도 추정할 수밖에 없습니다. 대신 두 가지를 지킵니다.
 *
 *   1) 추정치와 실측치를 **섞지 않습니다.**
 *      - 실측: 일방문자수, 전체 글 수, 발행 간격, **검색 노출 여부** ← 진짜 숫자
 *      - 추정: 위 숫자들을 우리가 매긴 배점으로 합산한 등급 ← 우리 의견
 *      화면에서도 이 둘을 갈라서 보여줍니다.
 *
 *   2) 제일 중요한 지표를 **검증 가능한 것**으로 잡습니다.
 *      내 글 제목을 통째로 네이버에 검색했을 때 내 글이 안 나온다 —
 *      이건 추정이 아니라 사실이고, 누구나 직접 확인할 수 있고, 심각한 문제입니다.
 *      경쟁사가 '누락'이라고 부르는 게 이겁니다. 우리 진단의 중심에 이걸 놓습니다.
 *
 * 등급을 0~10으로 두는 건 시장 관행을 따르는 겁니다. 사람들이 이미 그 척도로
 * 이야기하고 있어서, 우리만 다른 척도를 쓰면 비교가 안 됩니다.
 */

const { fetchVisitors, fetchPostList, searchBlogRanking } = require("./naverBlogData");

/** 등급 이름 — 시장에서 쓰는 말을 그대로 씁니다. */
const GRADES = [
  { min: 0, name: "일반", label: "일반 0단계" },
  { min: 12, name: "일반", label: "일반 1단계" },
  { min: 22, name: "준최적", label: "준최적 1단계" },
  { min: 32, name: "준최적", label: "준최적 2단계" },
  { min: 42, name: "준최적", label: "준최적 3단계" },
  { min: 52, name: "준최적", label: "준최적 4단계" },
  { min: 61, name: "준최적", label: "준최적 5단계" },
  { min: 70, name: "최적", label: "최적 1단계" },
  { min: 79, name: "최적", label: "최적 2단계" },
  { min: 87, name: "최적", label: "최적 3단계" },
  { min: 94, name: "최적", label: "최적 4단계" },
];

function gradeFor(score) {
  let g = GRADES[0];
  let level = 0;
  GRADES.forEach((x, i) => {
    if (score >= x.min) {
      g = x;
      level = i;
    }
  });
  return { level, name: g.name, label: g.label };
}

/**
 * 제목으로 검색해서 내 글이 나오는지 확인합니다.
 *
 * ⚠️ 판정이 셋입니다. 뭉뚱그리면 사장님이 오해합니다.
 *   - exposed  : 나옴. 정상.
 *   - missing  : 안 나옴. 제목 전체로 검색했는데도 없으면 색인에서 빠진 겁니다.
 *   - skipped  : 검사 대상이 아님 (비공개 글, 검색허용 끈 글, 너무 짧은 제목).
 *
 * 특히 skipped를 missing으로 세면 안 됩니다. 본인이 일부러 검색을 꺼둔 글을
 * "누락됐습니다"라고 겁주는 건 거짓말입니다.
 */
async function checkExposure(blogId, post) {
  if (!post.isPublic) return { ...post, state: "skipped", why: "전체공개 글이 아닙니다" };
  if (!post.searchable) return { ...post, state: "skipped", why: "검색 허용을 꺼둔 글입니다" };

  const title = (post.title || "").trim();
  // 제목이 너무 짧으면 동명이인 글이 쏟아져서 판정이 무의미해집니다.
  if (title.replace(/\s/g, "").length < 6)
    return { ...post, state: "skipped", why: "제목이 짧아 판정할 수 없습니다" };

  const r = await searchBlogRanking(title, { limit: 30 });
  // ⚠️ 네이버가 막았으면 "누락"이 아니라 "확인 못 함"입니다. 이 둘을 섞으면
  // 멀쩡한 글을 누락됐다고 겁주게 됩니다. 판정을 포기하는 쪽이 항상 안전합니다.
  if (!r.ok)
    return { ...post, state: "skipped", why: r.why || "지금은 확인할 수 없었습니다" };

  const hit = r.results.find((x) => x.blogId === blogId && x.logNo === post.logNo);
  // 찾았으면 결과가 몇 건이든 그게 답입니다. 긴 제목은 원래 결과가 적습니다.
  if (hit) return { ...post, state: "exposed", rank: hit.rank };
  // 못 찾았는데 결과까지 적으면, 없는 건지 못 본 건지 알 수 없습니다.
  if (r.lowConfidence) return { ...post, state: "skipped", why: r.why };
  return { ...post, state: "missing" };
}

/** 발행 간격 — "1일 1포"를 지키는지. addDate가 문자열이라 대충이라도 읽어냅니다. */
function parseAddDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/전$/.test(t)) return new Date(); // "3시간 전" → 오늘
  const m = t.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/**
 * 블로그 하나를 진단합니다.
 * sampleSize: 검색 노출을 확인할 최근 글 수. 검색을 한 번씩 때리므로 크면 느립니다.
 */
async function diagnose(blogId, { sampleSize = 5 } = {}) {
  const [visitors, list] = await Promise.all([
    fetchVisitors(blogId),
    fetchPostList(blogId, { countPerPage: 30 }),
  ]);

  if (!list.total && !visitors.length) {
    return { ok: false, why: "블로그를 찾지 못했습니다. 아이디를 다시 확인해 주세요." };
  }

  // ── 실측 ────────────────────────────────────────────────
  const recent = visitors.slice(-5);
  const avgVisitors = recent.length
    ? Math.round(recent.reduce((a, b) => a + b.count, 0) / recent.length)
    : 0;
  // 어제 대비 추세 (마지막 값은 오늘이라 아직 안 찼습니다. 그래서 뺍니다.)
  const settled = recent.slice(0, -1);
  const trend =
    settled.length >= 2
      ? settled[settled.length - 1].count - settled[settled.length - 2].count
      : null;

  // 발행 간격
  const dates = list.posts.map((p) => parseAddDate(p.addDate)).filter(Boolean);
  let postsPerWeek = 0;
  if (dates.length >= 2) {
    const spanDays = Math.max(1, (dates[0] - dates[dates.length - 1]) / 86400000);
    postsPerWeek = Math.round((dates.length / spanDays) * 7 * 10) / 10;
  }

  // 검색 노출 — 여기가 핵심. 순차로 돌립니다(동시에 때리면 네이버가 막습니다).
  const sample = list.posts.filter((p) => p.isPublic && p.searchable).slice(0, sampleSize);
  const exposure = [];
  for (const p of sample) {
    exposure.push(await checkExposure(blogId, p));
    await new Promise((r) => setTimeout(r, 400));
  }
  const judged = exposure.filter((e) => e.state !== "skipped");
  const missing = judged.filter((e) => e.state === "missing");
  const exposedRate = judged.length ? (judged.length - missing.length) / judged.length : null;

  // ── 추정 (우리 배점) ─────────────────────────────────────
  // 배점 근거를 숫자 옆에 남깁니다. 나중에 조정할 때 왜 이렇게 뒀는지 알아야 합니다.
  const parts = [];

  // 방문자 35점 — 가장 크게 봅니다. 결국 사람이 오느냐의 문제입니다.
  //
  // ⚠️ 처음엔 log10(v)*11로 뒀다가 일 2,500명 블로그가 만점을 받아서 고쳤습니다.
  // 1,500명만 넘으면 다 만점이라 상위권이 전혀 구분되지 않았습니다.
  // 만점 기준을 일 10,000명으로 올립니다. (100명 17점 / 1,000명 26점 / 10,000명 35점)
  const vScore = Math.min(35, Math.round((Math.log10(Math.max(1, avgVisitors)) / 4) * 35));
  parts.push({ key: "방문자", score: vScore, max: 35, detail: `일평균 ${avgVisitors.toLocaleString()}명` });

  // 검색 노출 30점 — 노출이 안 되면 나머지가 다 의미 없습니다.
  const eScore = exposedRate === null ? 0 : Math.round(exposedRate * 30);
  parts.push({
    key: "검색 노출",
    score: eScore,
    max: 30,
    detail:
      exposedRate === null
        ? "판정할 글이 없었습니다"
        : `검사 ${judged.length}건 중 ${judged.length - missing.length}건 노출`,
  });

  // 발행 꾸준함 20점 — 주 3~7회를 만점으로 봅니다. 그 이상은 더 안 쳐줍니다.
  const fScore = Math.min(20, Math.round(Math.min(postsPerWeek, 7) / 7 * 20));
  parts.push({ key: "발행 꾸준함", score: fScore, max: 20, detail: `주 ${postsPerWeek}회` });

  // 누적 글 15점 — 오래 한 블로그에 주는 점수입니다.
  // 만점 기준 3,000건. (100건 9점 / 1,000건 13점 / 3,000건 15점)
  const cScore = Math.min(15, Math.round((Math.log10(Math.max(1, list.total)) / 3.5) * 15));
  parts.push({ key: "누적 글", score: cScore, max: 15, detail: `${list.total.toLocaleString()}건` });

  const score = parts.reduce((a, b) => a + b.score, 0);
  const grade = gradeFor(score);

  // ── 저품질 위험 ─────────────────────────────────────────
  //
  // ⚠️ '저품질'은 네이버가 쓰는 말이 아닙니다. 블로거들 사이에서 쓰는 말이고,
  // 네이버가 그런 딱지를 붙인다고 공식적으로 밝힌 적도 없습니다.
  // 그러니 "저품질입니다"라고 단정하면 우리가 없는 판정을 지어내는 셈입니다.
  //
  // 대신 **실제로 관찰되는 것**만 말합니다:
  //   - 발행한 글이 제목으로 검색해도 안 나온다 (누락)
  //   - 글은 꾸준히 올리는데 방문자가 준다
  // 이 둘이 겹치면 블로거들이 '저품질'이라 부르는 상태와 겉모습이 같습니다.
  // 그래서 "위험 신호가 몇 개 보인다"까지만 말하고 판정은 하지 않습니다.
  const signals = [];
  const missRate = judged.length ? missing.length / judged.length : 0;

  if (judged.length >= 3 && missRate >= 0.5)
    signals.push({
      key: "누락",
      text: `검사한 글 ${judged.length}건 중 ${missing.length}건이 제목으로 검색해도 나오지 않습니다.`,
    });
  else if (missing.length)
    signals.push({
      key: "누락",
      text: `${missing.length}건이 제목으로 검색해도 나오지 않습니다.`,
    });

  // 방문자가 사흘 내리 줄었는가 — 하루 등락은 흔해서 하루로는 판단하지 않습니다.
  if (settled.length >= 4) {
    let down = 0;
    for (let i = 1; i < settled.length; i++) if (settled[i].count < settled[i - 1].count) down++;
    if (down >= settled.length - 1)
      signals.push({ key: "방문자", text: `최근 ${settled.length}일 동안 방문자가 계속 줄고 있습니다.` });
  }

  // 글은 많이 쓰는데 사람이 안 온다
  if (postsPerWeek >= 5 && avgVisitors < 50 && list.total > 100)
    signals.push({
      key: "효율",
      text: `주 ${postsPerWeek}회씩 쓰는데 일 방문자가 ${avgVisitors}명입니다. 글이 노출되지 않고 있을 가능성이 큽니다.`,
    });

  const risk =
    signals.length >= 2 ? "high" : signals.length === 1 ? "watch" : "none";

  // ── 할 일 ───────────────────────────────────────────────
  const advice = [];
  if (missing.length)
    advice.push({
      level: "danger",
      text: `최근 글 ${missing.length}건이 제목으로 검색해도 나오지 않습니다. 다른 무엇보다 이걸 먼저 보셔야 합니다.`,
    });
  if (postsPerWeek > 0 && postsPerWeek < 2)
    advice.push({ level: "warn", text: `발행이 주 ${postsPerWeek}회입니다. 주 3회 위로 올리면 점수가 올라갑니다.` });
  if (trend !== null && trend < 0)
    advice.push({ level: "warn", text: `방문자가 어제보다 ${Math.abs(trend).toLocaleString()}명 줄었습니다.` });
  if (avgVisitors < 100 && list.total > 50)
    advice.push({ level: "info", text: "글은 쌓였는데 방문자가 적습니다. 주제를 좁히고 키워드를 다시 잡아보세요." });
  if (!advice.length) advice.push({ level: "ok", text: "눈에 띄는 문제가 없습니다. 지금 흐름을 유지하세요." });

  return {
    ok: true,
    blogId,
    checkedAt: new Date().toISOString(),
    // 실측 — 우리가 만든 게 아니라 네이버에서 그대로 가져온 값
    measured: {
      visitors: recent,
      avgVisitors,
      trend,
      totalPosts: list.total,
      postsPerWeek,
      exposure: exposure.map((e) => ({
        title: e.title,
        url: e.url,
        state: e.state,
        rank: e.rank ?? null,
        why: e.why ?? null,
      })),
      missingCount: missing.length,
      judgedCount: judged.length,
    },
    // 추정 — 우리 배점표로 매긴 값
    estimated: { score, grade, parts },
    // 위험 신호 — 판정이 아니라 관찰입니다
    risk: {
      level: risk,
      signals,
      note:
        "'저품질'은 네이버가 쓰는 말이 아니고, 네이버가 그런 딱지를 붙인다고 밝힌 적도 없습니다. " +
        "여기서는 실제로 관찰되는 것만 적었습니다.",
    },
    advice,
    disclaimer:
      "네이버는 블로그 지수를 공개하지 않습니다. 등급은 위 실측값을 우수리미 배점표로 환산한 추정치이며, 네이버 공식 판정이 아닙니다.",
  };
}

module.exports = { diagnose, checkExposure, gradeFor, GRADES };
