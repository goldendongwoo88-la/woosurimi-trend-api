// 네이버 블로그 검색 API — 2026년부터 "NAVER API HUB"(네이버 클라우드 플랫폼)로 이전되었습니다.
// 특정 키워드로 이미 올라온 블로그 글이 몇 개인지(total) 알려줍니다 = 경쟁 정도.
// 예전 developers.naver.com(openapi.naver.com) 경로는 더 이상 새로 발급되지 않으므로
// NAVER API HUB 경로/헤더를 사용합니다.
// 공식 문서: https://guide.ncloud-docs.com/docs/apihub-use

const { createLimiter } = require("./concurrencyLimiter");

/**
 * 일별 한도를 넘겼는지 기억해 둡니다.
 *
 * ⚠️ 왜 필요한가 — 실제로 이런 일이 있었습니다.
 * /api/keyword/status 는 "search: true, ready: true"라고 답했습니다.
 * 그런데 실제로 부르면 429가 났습니다: "일별 사용량 한도가 초과하였습니다."
 * 화면은 준비됐다고 하는데 눌러보면 빈칸이 나옵니다.
 *
 * 크레딧이 0인데 "AI 준비됨"이라고 답하던 것과 **똑같은 종류**입니다.
 * 열쇠가 있는 것과 지금 쓸 수 있는 것은 다릅니다.
 *
 * ⚠️ 한도는 날마다 풀립니다. 그래서 한국 날짜가 바뀌면 스스로 잊습니다.
 * 안 잊으면 자정이 지나도 "안 된다"고 말하게 됩니다.
 */
let quota = { hitAt: null, day: null, message: null };

const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

function noteQuota(status, body) {
  if (status !== 429 && !/한도|quota|exceed/i.test(String(body))) return;
  quota = { hitAt: Date.now(), day: kstDay(), message: String(body).slice(0, 160) };
}

/** 지금 쓸 수 있나. 열쇠가 아니라 **실제로 되는지**를 봅니다. */
function quotaStatus() {
  if (quota.day && quota.day !== kstDay()) quota = { hitAt: null, day: null, message: null };
  return {
    exhausted: !!quota.hitAt,
    at: quota.hitAt,
    message: quota.message,
    note: quota.hitAt
      ? "네이버 블로그 검색의 하루 사용량을 다 썼습니다. 한국 시간으로 자정이 지나면 다시 됩니다."
      : null,
  };
}

const BASE_URL = "https://naverapihub.apigw.ntruss.com";
const PATH = "/search/v1/blog";

// 후보 키워드가 많을 때(최대 60개) 이 함수가 그만큼 많이 동시에 불릴 수 있어서, API
// 쪽 레이트리밋을 피하려고 프로세스 전체 기준 동시 요청 수를 제한합니다.
const limit = createLimiter(5);

async function getBlogPostCount(keyword) {
  const { NAVER_APIHUB_KEY_ID, NAVER_APIHUB_KEY_SECRET } = process.env;
  if (!NAVER_APIHUB_KEY_ID || !NAVER_APIHUB_KEY_SECRET) {
    throw new Error(
      "네이버 API HUB 키가 설정되지 않았습니다. .env에 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY_SECRET을 채워주세요."
    );
  }

  return limit(async () => {
    const url = `${BASE_URL}${PATH}?query=${encodeURIComponent(keyword)}&display=1`;
    const res = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": NAVER_APIHUB_KEY_ID,
        "X-NCP-APIGW-API-KEY": NAVER_APIHUB_KEY_SECRET,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      noteQuota(res.status, body);
      throw new Error(`블로그 검색 API 오류 (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.total || 0;
  });
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

  return limit(async () => {
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
      noteQuota(res.status, body);
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
  });
}

module.exports = { getBlogPostCount, getTodayPostCount, quotaStatus };
