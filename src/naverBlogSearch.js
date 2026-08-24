// 네이버 블로그 검색 API — 2026년부터 "NAVER API HUB"(네이버 클라우드 플랫폼)로 이전되었습니다.
// 특정 키워드로 이미 올라온 블로그 글이 몇 개인지(total) 알려줍니다 = 경쟁 정도.
// 예전 developers.naver.com(openapi.naver.com) 경로는 더 이상 새로 발급되지 않으므로
// NAVER API HUB 경로/헤더를 사용합니다.
// 공식 문서: https://guide.ncloud-docs.com/docs/apihub-use

const BASE_URL = "https://naverapihub.apigw.ntruss.com";
const PATH = "/search/v1/blog";

async function getBlogPostCount(keyword) {
  const { NAVER_APIHUB_KEY_ID, NAVER_APIHUB_KEY_SECRET } = process.env;
  if (!NAVER_APIHUB_KEY_ID || !NAVER_APIHUB_KEY_SECRET) {
    throw new Error(
      "네이버 API HUB 키가 설정되지 않았습니다. .env에 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY_SECRET을 채워주세요."
    );
  }

  const url = `${BASE_URL}${PATH}?query=${encodeURIComponent(keyword)}&display=1`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": NAVER_APIHUB_KEY_ID,
      "X-NCP-APIGW-API-KEY": NAVER_APIHUB_KEY_SECRET,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`블로그 검색 API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.total || 0;
}

// 오늘(한국시간 기준) 발행된 블로그 글이 몇 개인지 셉니다.
// ⚠️ 중요한 제약: 네이버 블로그 검색 API의 postdate 필드는 "20260824"처럼 날짜만 주고
// 시:분:초는 주지 않습니다. 그래서 "지금부터 정확히 24시간 전"을 계산할 방법이 없고,
// 대신 "오늘 날짜로 찍힌 글"을 셀 수밖에 없습니다 — 확인하는 시점에 따라 실제로는
// 몇 분 전 글부터 어제 자정 직전 글까지 섞여서 "24시간"과 정확히 일치하지 않을 수 있습니다.
// 또한 한 번의 API 호출에서 최대 100개까지만 확인하기 때문에, 오늘 글이 100개를 넘는
// 아주 인기있는 키워드라면 정확한 총 개수가 아니라 "100+"로만 표시됩니다.
function todayYyyymmddKST() {
  // UTC 시각에 9시간을 더해 한국시간(KST) 기준 오늘 날짜를 yyyymmdd로 만듭니다.
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

async function getTodayPostCount(keyword) {
  const { NAVER_APIHUB_KEY_ID, NAVER_APIHUB_KEY_SECRET } = process.env;
  if (!NAVER_APIHUB_KEY_ID || !NAVER_APIHUB_KEY_SECRET) {
    throw new Error(
      "네이버 API HUB 키가 설정되지 않았습니다. .env에 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY_SECRET을 채워주세요."
    );
  }

  // sort=date로 최신순 100개를 받아서, 그중 오늘 날짜인 것만 직접 셉니다.
  const url = `${BASE_URL}${PATH}?query=${encodeURIComponent(keyword)}&display=100&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": NAVER_APIHUB_KEY_ID,
      "X-NCP-APIGW-API-KEY": NAVER_APIHUB_KEY_SECRET,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`블로그 검색 API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const items = data.items || [];
  const today = todayYyyymmddKST();
  const todayItems = items.filter((it) => it.postdate === today);

  return {
    count: todayItems.length,
    approximate: todayItems.length >= 100, // 100개를 다 채웠으면 실제로는 더 많을 수 있다는 뜻
  };
}

module.exports = { getBlogPostCount, getTodayPostCount };
