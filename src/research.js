/**
 * 자료 조사 — 내가 모르는 것을 찾아서 글로 만들기.
 *
 * ⚠️ 사장님이 정확히 짚으셨습니다.
 * 연예인 뷰티·패션 정보성 글은 **사장님이 직접 겪은 일이 아닙니다.**
 * 카리나가 아이라인을 어떻게 그렸는지 사장님이 알 리가 없습니다.
 * 그래서 "아시면 알려주세요 / 모르면 제목을 바꾸세요"만으로는 부족합니다.
 * 세 번째 길이 필요합니다 — **찾아서 알려드리기.**
 *
 * ⚠️ 다만 이건 지어내기와 종이 한 장 차이입니다. 선을 분명히 긋습니다.
 *
 *   지어내기 — 모르는 걸 그럴듯하게 쓴다.            절대 안 합니다.
 *   찾아쓰기 — 보도된 것을 찾아 출처를 달고 정리한다.  이건 합니다.
 *
 * 그래서 규칙을 셋 둡니다.
 *   1) 원문을 먼저 가져옵니다. 검색 결과 제목과 요약을 실제로 읽습니다.
 *   2) 찾은 것에 없는 내용은 쓰지 않습니다. 없으면 없다고 표시합니다.
 *   3) 무엇을 어디서 봤는지 사장님께 그대로 보여줍니다. 확인하실 수 있어야 합니다.
 *
 * ⚠️ 그리고 베끼지 않습니다.
 * 기사 문장을 그대로 옮기면 저작권 침해입니다. 사실만 가져와서
 * 우리 문장으로 다시 씁니다. 그게 인용의 범위입니다.
 */

const claudeClient = require("./claudeClient");
const { searchRecentNews } = require("./naverNewsSearch");
const { searchBlogRanking } = require("./naverBlogData");
const blogFetch = require("./blogFetch");
const rules = require("./homefeedRules");

/** 연예인 글에서 손대면 안 되는 것 — legalCheck와 같은 기준입니다. */
const OFF_LIMITS =
  "성형·시술 추측, 확인 안 된 열애·이혼·임신, 범죄 단정, 외모 비하. " +
  "본인이나 소속사가 밝힌 것, 언론이 보도한 것만 씁니다.";

/**
 * 주제에 대해 실제로 무엇이 보도됐는지 모읍니다.
 * 뉴스 + 블로그 상위 글을 함께 봅니다. 뉴스는 사실, 블로그는 사람들 관심사입니다.
 */
/**
 * 검색어를 만듭니다.
 *
 * ⚠️ 사장님이 "찾은 자료가 없다고 나온다"고 하셨습니다. 원인은 검색어였습니다.
 * 블로그 **제목을 통째로** 검색어로 넣고 있었습니다.
 *
 * 실측 (search.naver.com):
 *   "착해진 아이라인 눈매에 여전한 존재감" 카리나 메이크업 →  1건
 *   카리나 메이크업                                      → 10건
 *   카리나 아이라인                                      → 10건
 *
 * 제목은 사람이 읽으라고 쓴 문장이지 검색어가 아닙니다.
 * 그래서 짧은 것부터 차례로 시도하고, 자료가 나오면 거기서 멈춥니다.
 */
function searchQueries(topic, angle = "") {
  // 따옴표 안은 글맛을 내려고 쓴 말입니다. 검색어로는 방해만 됩니다.
  const bare = String(topic || "")
    .replace(/[""''"']/g, " ")
    .replace(/[\[\]()<>·|]/g, " ")
    .replace(/\.{2,}|…/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = bare.split(" ").filter(Boolean);
  const out = [];
  const add = (s) => {
    const t = String(s || "").trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  // 뒤쪽 어절이 대개 무엇에 대한 글인지를 담습니다 ("… 카리나 메이크업").
  if (words.length >= 2) add(words.slice(-2).join(" "));
  if (words.length >= 3) add(words.slice(-3).join(" "));
  // 앞쪽도 봅니다 — 제목에 따라 앞에 주어가 오기도 합니다.
  if (words.length >= 2) add(words.slice(0, 2).join(" "));
  // 찾으려는 것(angle)을 뒤쪽 어절과 붙여봅니다.
  const a = String(angle || "").trim();
  if (a && words.length >= 1) add(`${words[words.length - 1]} ${a}`.slice(0, 30));
  // 마지막 수단 — 통째로. 거의 안 나오지만 아예 안 하는 것보단 낫습니다.
  add(bare.slice(0, 40));
  if (words.length) add(words[words.length - 1]);
  return out.slice(0, 5);
}

async function collect(topic, { newsCount = 8, blogCount = 3 } = {}) {
  const q = String(topic || "").trim();
  if (!q) return { ok: false, why: "무엇을 찾을지 알려주세요." };

  const sources = [];
  const warnings = [];
  let usedQuery = null;

  // 1) 뉴스 — 사실의 출처
  //
  // ⚠️ searchRecentNews의 두 번째 인자는 **개수가 아니라 시간(시)**입니다.
  // 처음에 개수인 줄 알고 8을 넘겼더니 "최근 8시간 뉴스"만 찾았습니다.
  // 연예 소재는 며칠 전 기사가 더 많아서 거의 아무것도 안 나옵니다.
  // 30일치를 받아서 최신순으로 필요한 만큼만 씁니다.
  // ⚠️ 검색어를 짧은 것부터 차례로 시도합니다. 하나가 되면 거기서 멈춥니다.
  // 제목을 통째로 넣으면 거의 아무것도 안 나옵니다(실측 1건 대 10건).
  const tried = [];
  try {
    let news = [];
    for (const cand of searchQueries(q)) {
      news = (await searchRecentNews(cand, 24 * 30, { display: 50 })).slice(0, newsCount);
      tried.push(`${cand} → ${news.length}건`);
      if (news.length) { usedQuery = cand; break; }
      await new Promise((s) => setTimeout(s, 300));
    }
    for (const n of news || []) {
      sources.push({
        kind: "뉴스",
        title: String(n.title || "").replace(/<[^>]*>/g, ""),
        summary: String(n.description || n.summary || "").replace(/<[^>]*>/g, ""),
        url: n.link || n.url || null,
        date: n.pubDate || n.date || null,
      });
    }
  } catch (e) {
    warnings.push("뉴스를 못 가져왔습니다: " + e.message);
  }

  // 2) 블로그 상위 글 — 사람들이 이 주제에서 무엇을 궁금해하는지
  try {
    // 뉴스에서 통한 검색어가 있으면 그걸 먼저 씁니다. 없으면 다시 차례로.
    let r = { ok: false, results: [] };
    for (const cand of usedQuery ? [usedQuery, ...searchQueries(q)] : searchQueries(q)) {
      r = await searchBlogRanking(cand, { limit: blogCount * 3 });
      tried.push(`(블로그) ${cand} → ${r.ok ? r.results.length : "X"}건`);
      if (r.ok && r.results.length >= 2) { usedQuery = usedQuery || cand; break; }
      await new Promise((s) => setTimeout(s, 700));
    }
    if (r.ok) {
      let got = 0;
      for (const item of r.results) {
        if (got >= blogCount) break;
        try {
          const post = await blogFetch.fetchPost(item.url);
          if (!post.bodyText || post.bodyText.length < 100) continue;
          sources.push({
            kind: "블로그",
            title: post.title,
            // ⚠️ 앞부분만 봅니다. 남의 글을 통째로 읽어 옮기는 게 아닙니다.
            summary: post.bodyText.slice(0, 500),
            url: item.url,
            rank: item.rank,
          });
          got++;
        } catch {}
        await new Promise((s) => setTimeout(s, 600));
      }
    }
  } catch (e) {
    warnings.push("블로그 상위 글을 못 읽었습니다.");
  }

  if (!sources.length) {
    return {
      ok: false,
      // ⚠️ 무엇으로 찾아봤는지 보여드립니다. "없습니다"만 나오면
      // 사장님이 무엇을 고쳐야 할지 알 수가 없습니다.
      why: "자료를 못 찾았습니다.",
      tried,
      warnings,
    };
  }
  return { ok: true, topic: q, usedQuery, tried, sources, warnings };
}

const SYSTEM =
  `당신은 자료를 찾아 블로그 글감을 정리하는 사람입니다.\n\n` +
  `**당신이 아는 것을 쓰지 마세요. 아래 자료에 있는 것만 쓰세요.**\n` +
  `당신의 기억은 오래됐고 틀릴 수 있습니다. 자료에 없는 이름·날짜·제품명·가격·수치는\n` +
  `절대 쓰지 마세요. 필요한데 자료에 없으면 그 자리에 ✏️(확인 필요: 무엇)로 남기세요.\n\n` +
  `**문장을 베끼지 마세요.** 기사 문장을 그대로 옮기면 저작권 침해입니다.\n` +
  `사실만 가져와서 완전히 다른 문장으로 다시 쓰세요.\n\n` +
  `**다루면 안 되는 것**: ${OFF_LIMITS}\n\n` +
  rules.promptBlock();

/**
 * 모은 자료로 글의 뼈대를 만듭니다.
 * ⚠️ 완성된 글이 아니라 **뼈대와 사실 목록**을 줍니다.
 * 사장님이 보고 고를 수 있어야 하고, 어느 사실이 어디서 왔는지 보여야 합니다.
 */
async function outline({ topic, sources, angle = "" }) {
  const packed = sources
    .map((s, i) => `[${i + 1}] (${s.kind}) ${s.title}\n${String(s.summary).slice(0, 400)}\n출처: ${s.url || "-"}`)
    .join("\n\n");

  const placement = rules.placementBlock(topic, "");

  const prompt =
    `주제: ${topic}\n` +
    (angle ? `사장님이 잡고 싶은 방향: ${angle}\n` : "") +
    `\n${placement}\n\n` +
    `--- 찾은 자료 ---\n${packed}\n--- 자료 끝 ---\n\n` +
    `이 자료만 가지고 글의 뼈대를 만들어 주세요.\n` +
    `각 사실에는 몇 번 자료에서 왔는지 번호를 답니다.\n\n` +
    `JSON만 답하세요:\n` +
    `{\n` +
    `  "facts": [{"text":"확인된 사실 한 줄","source":1}],\n` +
    `  "story": "이 소재를 어떤 이야기로 풀지 두세 문장",\n` +
    `  "sections": [{"heading":"소제목(말하듯 쓴 문장형)","points":["이 꼭지에서 다룰 것"],"sources":[1,2]}],\n` +
    `  "missing": ["자료에 없어서 사장님이 확인해야 할 것"],\n` +
    `  "titles": ["홈판용 제목 후보 3개"]\n` +
    `}\n\n` +
    `소제목은 5~6개로 나눠 주세요.`;

  let parsed;
  try {
    const text = await claudeClient.callClaude({
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4000,
      temperature: 0.5,
      timeoutMs: 150000,
    });
    parsed = claudeClient.extractJson(text);
  } catch (e) {
    return { ok: false, why: `정리에 실패했습니다: ${e.message}` };
  }
  if (!parsed || !Array.isArray(parsed.sections)) {
    return { ok: false, why: "응답 형식이 예상과 달랐습니다. 다시 해주세요." };
  }

  // ⚠️ 자료에 없는 번호를 달고 오는 경우가 있습니다. 그건 지어낸 겁니다.
  const maxIdx = sources.length;
  const badRefs = [];
  for (const f of parsed.facts || []) {
    const n = Number(f.source);
    if (!n || n < 1 || n > maxIdx) badRefs.push(f.text);
  }

  return {
    ok: true,
    topic,
    facts: parsed.facts || [],
    story: parsed.story || "",
    sections: parsed.sections,
    missing: parsed.missing || [],
    titles: parsed.titles || [],
    // 사장님이 직접 확인하실 수 있게 출처를 그대로 돌려줍니다.
    sources: sources.map((s, i) => ({ n: i + 1, kind: s.kind, title: s.title, url: s.url })),
    badRefs,
    note:
      "여기 있는 사실은 위 자료에서 가져온 것이고, 자료에 없던 것은 ✏️로 표시했습니다. " +
      "그래도 발행 전에 출처를 한 번 열어보세요. 사장님 이름으로 나가는 글입니다.",
  };
}

/** 찾기 + 정리를 한 번에. */
async function research({ topic, angle = "", newsCount = 8, blogCount = 3 }) {
  const c = await collect(topic, { newsCount, blogCount });
  if (!c.ok) return c;
  const o = await outline({ topic: c.topic, sources: c.sources, angle });
  if (!o.ok) return o;
  return { ...o, warnings: c.warnings };
}

module.exports = {
  searchQueries, research, collect, outline };
