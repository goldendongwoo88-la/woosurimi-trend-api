// 쿠팡 파트너스 API — 상품이 실제로 있는지 확인하고, 추적 링크를 받아옵니다.
//
// ⚠️ 왜 필요한가 (수익화 채널 33개 분석에서 나온 가장 비싼 실수)
// 제주서영(누적 12.3억)이 영상에서 딱 짚습니다:
//   "영상을 만들기 전에 쿠팡에 물건 있는지부터 꼭 확인하셔야 돼요.
//    열심히 만들었는데 쿠팡에 제품이 없다? 그럼 조회수 수익밖에 안 나오죠."
// 쇼츠 10편을 만들고 나서 팔 물건이 없는 걸 아는 건, 하루를 통째로 버리는 일입니다.
//
// ⚠️ 왜 크롤링을 안 하나
// coupang.com은 봇을 막습니다(실측 403). 브라우저로 우회할 수는 있지만 그건 약관 위반이고,
// 사장님 계정이 걸리면 파트너스 자격 자체가 날아갑니다. 공식 API만 씁니다.
//
// ⚠️ 키가 없으면 조용히 통과시키지 않습니다.
// "확인했다"고 거짓으로 넘어가면 위 실수를 그대로 반복합니다. 못 했으면 못 했다고 말합니다.

const crypto = require("crypto");

const HOST = "https://api-gateway.coupang.com";
const ACCESS = () => process.env.COUPANG_ACCESS_KEY || "";
const SECRET = () => process.env.COUPANG_SECRET_KEY || "";

const isConfigured = () => Boolean(ACCESS() && SECRET());

/**
 * 쿠팡 파트너스 인증 헤더.
 * 서명 대상은 "{yymmddThhmmssZ}{METHOD}{PATH}{QUERY}" 입니다 — 순서가 틀리면 401이 납니다.
 */
function authHeader(method, path, query = "") {
  const ts = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20260902T031500Z
  const msg = ts + method + path + query;
  const sig = crypto.createHmac("sha256", SECRET()).update(msg).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS()}, signed-date=${ts}, signature=${sig}`;
}

async function call(method, path, query = "", body = null) {
  if (!isConfigured()) {
    const e = new Error(
      "쿠팡 파트너스 키가 없습니다(.env의 COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY). " +
      "가입 후 키를 넣으면 상품 확인이 자동으로 됩니다."
    );
    e.code = "NO_KEY";
    throw e;
  }
  const url = HOST + path + (query ? "?" + query : "");
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(method, path, query),
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    throw new Error(`쿠팡 API 오류 ${res.status}: ${(json && (json.message || json.rMessage)) || text.slice(0, 200)}`);
  }
  return json;
}

/**
 * 키워드로 상품을 찾습니다 — "이 소재로 영상 만들어도 팔 게 있나"를 봅니다.
 * @returns {{ok, count, items:[{name, price, url, image, isRocket}]}}
 */
async function search(keyword, { limit = 10 } = {}) {
  const path = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";
  const query = `keyword=${encodeURIComponent(keyword)}&limit=${limit}`;
  const j = await call("GET", path, query);
  const data = (j && j.data && j.data.productData) || [];
  return {
    ok: data.length > 0,
    count: data.length,
    items: data.map((p) => ({
      name: p.productName,
      price: p.productPrice,
      url: p.productUrl,          // 이미 파트너스 추적 링크입니다
      image: p.productImage,
      isRocket: Boolean(p.isRocket),
    })),
  };
}

/**
 * 소재 하나가 "팔 수 있는 소재"인지 판정합니다.
 *
 * ⚠️ 상품이 있기만 하면 되는 게 아닙니다. 너무 싸면 수수료가 안 나옵니다.
 * 3% 기준으로 1만원짜리를 팔아야 300원입니다. 그래서 가격대도 같이 봅니다.
 */
async function checkSellable(keyword, { minPrice = 8000 } = {}) {
  try {
    const r = await search(keyword, { limit: 10 });
    if (!r.ok) {
      return { sellable: false, why: "쿠팡에 이 키워드로 파는 물건이 없습니다 — 조회수 수익만 남습니다", items: [] };
    }
    const good = r.items.filter((i) => (i.price || 0) >= minPrice);
    const top = (good[0] || r.items[0]);
    return {
      sellable: good.length > 0,
      why: good.length
        ? `${r.count}개 중 ${good.length}개가 ${minPrice.toLocaleString()}원 이상 — 팔 만합니다`
        : `상품은 있는데 전부 ${minPrice.toLocaleString()}원 미만 — 수수료가 거의 안 남습니다`,
      best: top ? { name: top.name, price: top.price, url: top.url } : null,
      items: r.items,
    };
  } catch (e) {
    if (e.code === "NO_KEY") {
      // 키가 없을 때 "팔 수 있다"고 하면 안 됩니다. 모른다고 해야 합니다.
      return { sellable: null, why: e.message, items: [] };
    }
    return { sellable: null, why: `확인 실패: ${e.message}`, items: [] };
  }
}

/** 내 링크로 바꾸기 (deeplink). subId는 affiliateLink.js가 붙입니다. */
async function deeplink(urls) {
  const path = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
  const j = await call("POST", path, "", { coupangUrls: Array.isArray(urls) ? urls : [urls] });
  return ((j && j.data) || []).map((d) => d.shortenUrl || d.landingUrl);
}

module.exports = { isConfigured, search, checkSellable, deeplink };
