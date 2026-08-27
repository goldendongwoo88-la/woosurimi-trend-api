/**
 * 추천 검색어 — 오늘 무엇을 쓸지 정해주는 기능.
 *
 * ⚠️ 네이버가 보여주는 "추천 검색어"와는 다릅니다.
 * 네이버 것은 **그 사람의 검색 이력**을 보고 만든 개인 맞춤입니다.
 * 우리는 사장님 검색 이력이 없고, 있어도 쓰면 안 됩니다.
 *
 * 대신 소재를 고르는 데는 이쪽이 낫습니다. 네이버 추천은 "당신이 관심 있을 것"이지
 * "지금 사람들이 많이 찾는 것"이 아니거든요. 우리는 뒤쪽을 봅니다.
 *
 * 세 곳에서 모읍니다.
 *   1) 네이버 자동완성 — 사람들이 **실제로 치는 말** 그대로. 키 없이 됩니다.
 *   2) 네이버 검색광고 연관검색어 — **월간 검색량과 경쟁도**. 진짜 숫자입니다.
 *   3) 블로그 문서 수 — 이미 얼마나 쌓여 있는지.
 *
 * ⚠️ 검색량만 보고 고르면 안 됩니다. 검색량이 크면 그만큼 글도 많습니다.
 * 그래서 **검색량 ÷ 문서 수**로 기회 점수를 냅니다. 이미 있는 계산을 그대로 씁니다.
 */

const { autocomplete } = require("./celebFinder");
const { getRelatedKeywords } = require("./naverKeywordTool");
const { getBlogPostCount } = require("./naverBlogSearch");
const keywordInsight = require("./keywordInsight");

/** 주제별 씨앗 키워드. 사장님 블로그 셋에 맞춰 뒀습니다. */
const SEEDS = {
  "패션·미용": [
    "메이크업", "화장품 추천", "헤어스타일", "숏컷", "다이어트",
    "코디", "데일리룩", "가방 추천", "향수 추천", "피부관리",
  ],
  "스타·연예인": ["연예인 근황", "아이돌", "배우", "화보", "공항패션"],
  "방송": ["예능 추천", "드라마 추천", "넷플릭스", "시청률", "출연진"],
  "비즈니스·경제": ["금리", "부동산 정책", "연말정산", "청약", "재테크"],
  "상품리뷰": ["내돈내산", "가성비", "언박싱", "비교", "후기"],
  "맛집": ["맛집 추천", "카페 추천", "혼밥", "웨이팅", "배달"],
};

const COMP = { LOW: "낮음", MID: "보통", HIGH: "높음", 낮음: "낮음", 중간: "보통", 높음: "높음" };

/**
 * 씨앗 하나로 후보를 모읍니다.
 * ⚠️ 네이버를 연달아 때리면 막힙니다. 자동완성은 사이를 띄우고,
 * 광고 API는 이미 동시요청 제한이 걸려 있습니다.
 */
async function gather(seed) {
  const out = new Map();

  // 1) 연관검색어 — 검색량이 붙어 옵니다. 이게 뼈대입니다.
  let related = [];
  try {
    related = await getRelatedKeywords(seed);
  } catch (e) {
    // 키가 없거나 API가 막힌 경우. 자동완성만으로도 쓸 수는 있습니다.
    related = [];
  }
  for (const r of related) {
    const total = (Number(r.monthlyPcQcCnt) || 0) + (Number(r.monthlyMobileQcCnt) || 0);
    out.set(r.keyword, {
      keyword: r.keyword,
      volume: total,
      competition: COMP[r.compIdx] || r.compIdx || null,
      from: ["연관"],
    });
  }

  // 2) 자동완성 — 사람들이 실제로 치는 형태. 검색량은 모를 수 있습니다.
  const auto = await autocomplete(seed + " ");
  for (const kw of auto) {
    const hit = out.get(kw);
    if (hit) hit.from.push("자동완성");
    else out.set(kw, { keyword: kw, volume: null, competition: null, from: ["자동완성"] });
  }

  return [...out.values()];
}

/**
 * @param {string|string[]} seeds  씨앗 키워드 (없으면 topic으로 기본값 사용)
 * @param {string} topic           주제 이름 (패션·미용 등)
 * @param {number} depth           문서 수까지 확인할 상위 개수. 많으면 느립니다.
 */
async function suggest({ seeds, topic, depth = 8 } = {}) {
  let list = Array.isArray(seeds) ? seeds.filter(Boolean) : seeds ? [seeds] : [];
  if (!list.length) {
    list = SEEDS[topic] || SEEDS["패션·미용"];
    // 씨앗을 다 돌면 너무 느립니다. 매번 다른 걸 보시게 섞어서 셋만 씁니다.
    list = [...list].sort(() => Math.random() - 0.5).slice(0, 3);
  }
  list = list.slice(0, 5);

  const all = new Map();
  for (const seed of list) {
    let got = [];
    try {
      got = await gather(seed);
    } catch {}
    for (const g of got) {
      const prev = all.get(g.keyword);
      if (prev) {
        prev.from = [...new Set([...prev.from, ...g.from])];
        if (prev.volume == null) prev.volume = g.volume;
      } else {
        all.set(g.keyword, { ...g, seed });
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  let items = [...all.values()];
  if (!items.length) {
    return { ok: false, why: "후보를 찾지 못했습니다. 씨앗 키워드를 바꿔서 다시 해보세요." };
  }

  // ⚠️ 너무 넓은 말은 소재가 못 됩니다. "메이크업" 하나로는 글을 못 씁니다.
  // 두 어절 이상이거나 6자 이상인 것만 남깁니다.
  items = items.filter((x) => {
    const k = String(x.keyword).trim();
    return k.split(/\s+/).length >= 2 || k.replace(/\s/g, "").length >= 6;
  });

  // 검색량이 있는 것부터, 그다음 자동완성만 있는 것
  items.sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));

  // 상위 몇 개만 문서 수까지 확인합니다. 하나당 요청이 한 번씩 더 나갑니다.
  const top = items.slice(0, Math.min(depth, 12));
  for (const t of top) {
    try {
      const docs = await getBlogPostCount(t.keyword);
      t.docs = typeof docs === "number" ? docs : docs?.count ?? null;
      if (t.volume != null && t.docs != null) {
        t.score = Math.round(keywordInsight.opportunityScore(t.volume, t.docs) * 100) / 100;
        // ⚠️ gradeOf는 (점수, 검색량) 둘을 받습니다. 검색량을 안 넘기면
        // "너무 작음" 판정이 절대 안 나와서, 월 3회짜리 키워드가 '황금'으로 뜹니다.
        const g = keywordInsight.gradeOf(t.score, t.volume);
        t.grade = g?.grade ?? null;
        t.tone = g?.tone ?? null;
        t.advice = g?.advice ?? null;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    ok: true,
    topic: topic || null,
    seeds: list,
    checkedAt: new Date().toISOString(),
    items: items.slice(0, 40),
    note:
      "검색량은 네이버 검색광고에서 받은 실제 값입니다. 문서 수는 상위 몇 개만 확인했습니다. " +
      "검색량이 크다고 좋은 소재는 아닙니다 — 그만큼 이미 쓰인 글도 많습니다.",
  };
}

module.exports = { suggest, gather, SEEDS };
