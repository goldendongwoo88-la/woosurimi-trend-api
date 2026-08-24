const Parser = require("rss-parser");

// Google 트렌드는 국가별 실시간 인기 검색어를 공개 RSS로 제공합니다.
// 공식적으로 열려 있는 피드라, 스크래핑 차단 걱정 없이 쓸 수 있는 몇 안 되는 소스입니다.
const FEED_URL = "https://trends.google.com/trending/rss?geo=KR";

const parser = new Parser({
  customFields: {
    item: [
      ["ht:approx_traffic", "approxTraffic"],
      ["ht:picture", "picture"],
    ],
  },
  requestOptions: {
    headers: {
      // 일부 서버는 기본 User-Agent를 봇으로 간주해 차단합니다.
      "User-Agent":
        "Mozilla/5.0 (compatible; WoosurimiTrendBot/1.0; +https://example.com)",
    },
  },
});

/**
 * 구글 트렌드 대한민국 실시간 인기 검색어를 가져와 공통 포맷으로 정규화합니다.
 * 반환 형태: { source, fetchedAt, items: [{ rank, term, approxTraffic, link, publishedAt }] }
 */
async function fetchGoogleTrendsKR() {
  const feed = await parser.parseURL(FEED_URL);

  const items = (feed.items || []).map((item, idx) => ({
    rank: idx + 1,
    term: item.title,
    approxTraffic: item.approxTraffic || null,
    link: item.link || null,
    publishedAt: item.pubDate || null,
  }));

  return {
    source: "google-trends-kr",
    fetchedAt: new Date().toISOString(),
    items,
  };
}

module.exports = { fetchGoogleTrendsKR, FEED_URL };
