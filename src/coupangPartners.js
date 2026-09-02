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
  // 쿠팡이 요구하는 형식은 yyMMdd'T'HHmmss'Z' — **연도가 두 자리**다.
  // 네 자리로 보내면 401 "HMAC format is invalid"가 난다 (2026-09-03 실측).
  const ts = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "").slice(2); // 260903T013000Z
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

// 상품명에 흔해서 브랜드 구실을 못 하는 말들. 이게 겹쳐도 "같은 물건"이 아닙니다.
const 흔한말 = new Set([
  "세트", "선물", "본품", "리필", "정품", "공식", "무료배송", "특가", "행사", "기획",
  "남성", "여성", "남녀공용", "대용량", "국내산", "국산", "수입", "신상", "인기",
  "패키지", "구성", "종합", "프리미엄", "고급", "실속", "택1", "혼합", "모음",
]);

/** 검색어를 비교용 토큰으로 쪼갭니다. 2글자 미만과 흔한 말은 버립니다. */
function 토큰(s) {
  return String(s || "")
    .replace(/[\[\]()<>{}★☆♥■□▶·|/+,~!?"'`]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !흔한말.has(t) && !/^\d+$/.test(t));
}

/**
 * 쿠팡 상품이 검색어와 **같은 물건**인지 봅니다.
 *
 * ⚠️ 이게 없으면 판정기가 쓸모없어집니다 (2026-09-03 실측).
 * 홈쇼핑 8개 카테고리를 돌렸더니 전부 "팔 만합니다"가 나왔습니다.
 * "라삐아프 핀턱 팬츠"를 검색하면 "르위 와이드팬츠"가 잡히는데,
 * 이건 **다른 브랜드 대체품**이라 그 방송을 보고 온 사람에게 걸 링크가 아닙니다.
 *
 * 정확 — 첫 토큰(대개 브랜드)이 상품명에 그대로 있다. 그 물건 링크를 건다
 * 유사 — 브랜드는 다른데 품목이 겹친다. 대체품 링크만 걸 수 있다
 * 없음 — 겹치는 말이 없다. 검색이 엉뚱한 걸 물어온 것이다
 */
function 매칭등급(keyword, productName) {
  const k = 토큰(keyword);
  if (!k.length) return "없음";
  const name = String(productName || "");
  if (name.includes(k[0])) return "정확";
  return k.slice(1).some((t) => name.includes(t)) ? "유사" : "없음";
}

/**
 * 소재 하나가 "팔 수 있는 소재"인지 판정합니다.
 *
 * ⚠️ 상품이 있기만 하면 되는 게 아닙니다. 두 가지를 같이 봅니다.
 *   ① 너무 싸면 수수료가 안 나옵니다. 3% 기준 1만원을 팔아야 300원입니다.
 *   ② **같은 물건이어야 합니다.** 대체품만 나오면 방송 보고 온 사람이 이탈합니다.
 */
async function checkSellable(keyword, { minPrice = 8000 } = {}) {
  try {
    const r = await search(keyword, { limit: 10 });
    if (!r.ok) {
      return { sellable: false, 등급: "🔴", why: "쿠팡에 이 키워드로 파는 물건이 없습니다 — 조회수 수익만 남습니다", items: [] };
    }

    const 판정 = r.items.map((i) => ({ ...i, 매칭: 매칭등급(keyword, i.name) }));
    const 비쌈 = (i) => (i.price || 0) >= minPrice;
    const 정확 = 판정.filter((i) => i.매칭 === "정확" && 비쌈(i));
    const 유사 = 판정.filter((i) => i.매칭 === "유사" && 비쌈(i));
    const good = 판정.filter(비쌈);

    // 같은 물건을 우선으로 고릅니다. 없으면 대체품, 그것도 없으면 아무거나.
    const top = 정확[0] || 유사[0] || good[0] || 판정[0];
    const 원 = (n) => n.toLocaleString() + "원";

    let 등급, why;
    if (정확.length) {
      등급 = "🟢";
      why = `같은 물건 ${정확.length}개 — 그대로 링크를 걸 수 있습니다`;
    } else if (유사.length) {
      등급 = "🟡";
      why = `같은 물건은 없고 비슷한 물건 ${유사.length}개 — 대체품 링크만 됩니다`;
    } else if (good.length) {
      등급 = "🔴";
      why = `검색은 되는데 겹치는 게 없습니다 — 엉뚱한 상품입니다`;
    } else {
      등급 = "🔴";
      why = `상품은 있는데 전부 ${원(minPrice)} 미만 — 수수료가 거의 안 남습니다`;
    }

    return {
      // 대체품만 있는 것도 팔 수는 있으니 막지 않습니다. 다만 등급으로 구분합니다.
      sellable: 정확.length > 0 || 유사.length > 0,
      등급,
      why,
      정확일치: 정확.length,
      유사일치: 유사.length,
      best: top ? { name: top.name, price: top.price, url: top.url, 매칭: top.매칭 } : null,
      items: 판정,
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

module.exports = { isConfigured, search, checkSellable, deeplink, 매칭등급 };
