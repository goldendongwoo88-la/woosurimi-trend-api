/**
 * 네이버 플레이스 순위 — 음식점 대행 파일럿의 핵심 숫자.
 *
 * ⚠️ 왜 만드는가
 * 업주가 진짜 궁금한 건 블로그 순위가 아니라 "우리 가게가 '역삼동 칼국수'
 * 치면 몇 등이냐"입니다. 2026년 플레이스 로직이 행동 데이터(저장·예약·
 * 길찾기) 중심으로 바뀌면서 이 숫자가 대행 보고서의 1면이 됐습니다.
 *
 * ⚠️ 어디서 읽는가 — pcmap.place.naver.com/{업종}/list (공개 화면, 로그인 불필요)
 * 화면에 심긴 window.__APOLLO_STATE__ 안의
 *   ROOT_QUERY["placeList({...display:50...})"].businesses.items  ← 순수 목록 (노출 순서 그대로)
 *   같은 자리의 adBusinesses.items                                  ← 광고 (따로 분리돼 있음)
 * 광고는 순위에 넣지 않습니다. 업주 화면 맨 위 광고칸과 헷갈리면
 * "우리가 3등"이라는 보고가 거짓말이 됩니다.
 *
 * ⚠️ 정직한 한계 — 보고서에도 그대로 적습니다.
 *   1) PC 지도 검색, 위치 미지정 기준입니다. 가게 앞에서 휴대폰으로 검색하는
 *      손님에게는 거리 보정 때문에 순서가 다를 수 있습니다.
 *   2) 한 번에 50위까지만 봅니다. 그 밖이면 "50위 밖"이 사실입니다.
 *   3) 순위는 수시로 바뀝니다. "잰 시각의 값"으로만 말합니다.
 *
 * ⚠️ AI를 안 씁니다. 값이 0원입니다. 단, 네이버를 두드리는 것이므로
 * 키워드 사이 800ms 간격을 지킵니다 (clientReport 의 700ms 와 같은 이유).
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "1,195" · "3,000+" 같은 표기를 숫자로. 원문도 함께 돌려줍니다. */
function num(s) {
  if (s == null) return null;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** 상호 비교용 — 공백·괄호 안 지점명 차이에 안 흔들리게. */
function normName(s) {
  return String(s || "").replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

/** __APOLLO_STATE__ 를 괄호 균형으로 정확히 잘라냅니다 (문자열 안 괄호 무시). */
function cutJson(src, startIdx) {
  let depth = 0, inStr = false, escp = false;
  for (let i = startIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escp) escp = false;
      else if (c === "\\") escp = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
    }
  }
  return null;
}

/**
 * 업종 경로. 음식점이 기본이지만 카페·미용실도 같은 화면 구조를 씁니다.
 * 모르면 place — 전 업종 통합 목록입니다.
 */
const BIZ_PATHS = ["restaurant", "place", "cafe", "hairshop", "accommodation"];

/**
 * 키워드 하나의 플레이스 목록(광고 제외, 노출 순서 그대로)을 가져옵니다.
 * @returns {ok, keyword, total, items:[{rank,id,name,category,address,visitorReviews,blogReviews,saveCount,saveCountRaw}], adNames, path, measuredAt}
 */
async function fetchPlaceList(keyword, { path = "restaurant" } = {}) {
  const kw = String(keyword || "").trim();
  if (!kw) return { ok: false, error: "키워드가 비었습니다." };
  if (!BIZ_PATHS.includes(path)) path = "restaurant";

  let html;
  try {
    const r = await fetch(`https://pcmap.place.naver.com/${path}/list?query=${encodeURIComponent(kw)}`, {
      headers: { "User-Agent": UA, Referer: "https://map.naver.com/" },
    });
    if (!r.ok) return { ok: false, error: `네이버 응답 ${r.status}` };
    html = await r.text();
  } catch (e) {
    return { ok: false, error: `연결 실패: ${e.message}` };
  }

  const at = html.indexOf("window.__APOLLO_STATE__");
  if (at < 0) {
    // restaurant 화면이 아닌 업종이면 place 통합으로 한 번 더 — 그래도 없으면 사실대로.
    if (path !== "place") return fetchPlaceList(kw, { path: "place" });
    return { ok: false, error: "목록 화면을 읽지 못했습니다 (화면 구조가 바뀌었을 수 있습니다)." };
  }
  let state;
  try {
    state = JSON.parse(cutJson(html, html.indexOf("{", at)));
  } catch {
    return { ok: false, error: "목록 데이터를 해석하지 못했습니다." };
  }

  const rq = state.ROOT_QUERY || {};
  // display 가 가장 큰 placeList 항목이 본목록입니다 (display:9 짜리 보조 목록도 같이 옵니다).
  let best = null, bestDisplay = 0;
  for (const [k, v] of Object.entries(rq)) {
    if (!k.startsWith("placeList(") || !v || typeof v !== "object") continue;
    const dm = k.match(/"display":(\d+)/);
    const display = dm ? Number(dm[1]) : 0;
    const items = v.businesses && v.businesses.items;
    if (Array.isArray(items) && display >= bestDisplay) { best = v; bestDisplay = display; }
  }
  if (!best) return { ok: false, error: "검색 결과 목록이 없습니다 (결과 0개이거나 화면 구조 변경)." };

  const deref = (ref) => (ref && ref.__ref ? state[ref.__ref] : ref);
  const items = (best.businesses.items || []).map(deref).filter(Boolean).map((b, i) => ({
    rank: i + 1,
    id: String(b.id || ""),
    name: b.name || "",
    category: b.category || "",
    address: b.commonAddress || b.roadAddress || "",
    visitorReviews: num(b.visitorReviewCount),
    blogReviews: num(b.blogCafeReviewCount),
    saveCount: num(b.saveCount),
    saveCountRaw: b.saveCount ?? null,   // "3,000+" 는 3000이 아니라 "3,000 이상"입니다
  }));
  const adNames = ((best.adBusinesses && best.adBusinesses.items) || []).map(deref).filter(Boolean).map((b) => b.name);

  return {
    ok: true,
    keyword: kw,
    total: num(best.businesses.total),
    items,
    adNames,
    path,
    measuredAt: new Date().toISOString(),
  };
}

/**
 * 우리 매장이 몇 위인지. placeId 가 있으면 그걸로(정확), 없으면 상호로 찾습니다.
 * @returns {ok, keyword, rank, matched:{...}|null, total, sampled, top, adCount, measuredAt}
 */
async function findRank(keyword, { name = "", placeId = "", path = "restaurant", top = 5 } = {}) {
  const r = await fetchPlaceList(keyword, { path });
  if (!r.ok) return r;

  let hit = null;
  if (placeId) hit = r.items.find((b) => b.id === String(placeId));
  if (!hit && name) {
    const nn = normName(name);
    hit = r.items.find((b) => normName(b.name) === nn) ||
          r.items.find((b) => normName(b.name).includes(nn) || nn.includes(normName(b.name)));
  }

  return {
    ok: true,
    keyword: r.keyword,
    rank: hit ? hit.rank : null,     // null = 50위 안에 없음 (그것도 사실입니다)
    matched: hit || null,
    total: r.total,
    sampled: r.items.length,
    top: r.items.slice(0, top),
    adCount: r.adNames.length,
    measuredAt: r.measuredAt,
  };
}

/**
 * 매장 하나 × 키워드 여러 개 — 보고서용 한 번에.
 * 키워드 사이 800ms 간격. 키워드 5개면 4초쯤 걸립니다.
 */
async function trackStore({ name = "", placeId = "", keywords = [], path = "restaurant" }) {
  const rows = [];
  for (let i = 0; i < keywords.length; i++) {
    if (i) await sleep(800);
    const r = await findRank(keywords[i], { name, placeId, path });
    rows.push(r.ok
      ? { keyword: r.keyword, rank: r.rank, total: r.total, sampled: r.sampled,
          visitorReviews: r.matched?.visitorReviews ?? null,
          blogReviews: r.matched?.blogReviews ?? null,
          saveCountRaw: r.matched?.saveCountRaw ?? null }
      : { keyword: keywords[i], rank: null, error: r.error });
  }
  return { name, placeId, rows, measuredAt: new Date().toISOString() };
}

module.exports = { fetchPlaceList, findRank, trackStore, normName, num, cutJson };
