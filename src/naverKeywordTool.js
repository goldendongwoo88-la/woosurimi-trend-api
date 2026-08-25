const crypto = require("crypto");
const { createLimiter } = require("./concurrencyLimiter");

// 네이버 검색광고(searchad.naver.com) "키워드도구" API.
// 씨앗 키워드 하나를 주면 연관 키워드 + 월간 PC/모바일 검색량 + 경쟁정도를 돌려줍니다.
// 공식 문서: https://naver.github.io/searchad-apidoc/#/guides/authorization

const BASE_URL = "https://api.naver.com";
const PATH = "/keywordstool";

// 이 API는 짧은 시간에 여러 요청이 몰리면(예: 카테고리 하나가 시드 여러 개를 동시에
// 조회할 때) 쉽게 레이트리밋에 걸리는 걸 실제로 확인했습니다. 호출하는 쪽이 여러
// 군데(opportunityFinder.js의 내부 병렬 처리, blogWriter.js의 시드 그룹 병렬 처리)라
// 각자 따로 동시성을 조절하면 실제 동시 요청 수가 곱해져 버리므로, API를 실제로
// 호출하는 이 지점에 프로세스 전체 기준 동시 요청 상한을 둡니다.
const limit = createLimiter(2);

function sign(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

function normalizeCount(v) {
  // 검색량이 10 미만이면 API가 문자열 "< 10"으로 줄 때가 있어서 숫자로 바꿔줍니다.
  if (typeof v === "string" && v.includes("<")) return 5;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * seedKeyword와 관련된 키워드 목록 + 검색량을 가져옵니다.
 * 반환: [{ keyword, monthlyPcQcCnt, monthlyMobileQcCnt, compIdx }]
 */
async function getRelatedKeywords(seedKeyword) {
  const { NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID } = process.env;
  if (!NAVER_AD_API_KEY || !NAVER_AD_SECRET_KEY || !NAVER_AD_CUSTOMER_ID) {
    throw new Error(
      "네이버 검색광고 API 키가 설정되지 않았습니다. .env에 NAVER_AD_API_KEY / NAVER_AD_SECRET_KEY / NAVER_AD_CUSTOMER_ID를 채워주세요."
    );
  }

  // 네이버 키워드도구 API는 hintKeywords에 띄어쓰기가 들어가면 400 에러(11001)를 반환합니다.
  // "가을 니트"처럼 띄어쓰기가 있는 씨앗 키워드는 붙여써서("가을니트") 보내야 합니다.
  const hintKeyword = seedKeyword.replace(/\s+/g, "");

  // 타임스탬프/서명은 요청 직전 시각 기준이어야 하므로(오래되면 API가 거부할 수 있음),
  // limit()으로 순서를 기다린 뒤(대기 시간이 있을 수 있음) 실제로 보내기 직전에 만듭니다.
  return limit(async () => {
    const timestamp = Date.now().toString();
    const signature = sign(timestamp, "GET", PATH, NAVER_AD_SECRET_KEY);
    const url = `${BASE_URL}${PATH}?hintKeywords=${encodeURIComponent(hintKeyword)}&showDetail=1`;

    const res = await fetch(url, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": NAVER_AD_API_KEY,
        "X-Customer": NAVER_AD_CUSTOMER_ID,
        "X-Signature": signature,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`키워드도구 API 오류 (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return (data.keywordList || []).map((k) => ({
      keyword: k.relKeyword,
      monthlyPcQcCnt: normalizeCount(k.monthlyPcQcCnt),
      monthlyMobileQcCnt: normalizeCount(k.monthlyMobileQcCnt),
      compIdx: k.compIdx || null, // "낮음" / "중간" / "높음"
    }));
  });
}

module.exports = { getRelatedKeywords };
