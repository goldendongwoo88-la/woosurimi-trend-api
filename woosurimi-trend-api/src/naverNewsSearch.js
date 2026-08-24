// 네이버 뉴스 검색 API (NAVER API HUB).
// 블로그 검색과 달리 pubDate에 "시:분:초"까지 정확히 들어있어서(RFC822 형식),
// "최근 24시간 이내"를 진짜로 정확하게 걸러낼 수 있습니다 — 이게 블로그 API와의 핵심 차이입니다.
//
// ⚠️ 이 API를 쓰려면 NAVER API HUB 콘솔에서 "뉴스"(NAVER Search News API)를 추가로
// 이용 신청해야 합니다. "블로그"만 신청했다면 이 함수는 403/404 에러가 날 수 있어요.
// 콘솔에서 기존 애플리케이션(예: woosoorimi)에 "뉴스" API를 추가하거나, 안 되면 새
// 애플리케이션으로 "뉴스"를 신청한 뒤 그 Client ID/Secret을 써주세요.

const BASE_URL = "https://naverapihub.apigw.ntruss.com";
const PATH = "/search/v1/news";

function stripHtml(text) {
  return (text || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/**
 * query로 뉴스를 검색합니다. 최신순(sort=date)으로 최대 display개까지 가져옵니다.
 * 반환: [{ title, link, description, pubDate (Date 객체), press }]
 */
async function searchNews(query, { display = 30 } = {}) {
  const { NAVER_APIHUB_KEY_ID, NAVER_APIHUB_KEY_SECRET } = process.env;
  if (!NAVER_APIHUB_KEY_ID || !NAVER_APIHUB_KEY_SECRET) {
    throw new Error(
      "네이버 API HUB 키가 설정되지 않았습니다. .env에 NAVER_APIHUB_KEY_ID / NAVER_APIHUB_KEY_SECRET을 채워주세요."
    );
  }

  const url = `${BASE_URL}${PATH}?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": NAVER_APIHUB_KEY_ID,
      "X-NCP-APIGW-API-KEY": NAVER_APIHUB_KEY_SECRET,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`뉴스 검색 API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.items || []).map((it) => {
    let press = null;
    try {
      press = new URL(it.originallink || it.link).hostname.replace(/^www\./, "");
    } catch {
      press = null;
    }
    return {
      title: stripHtml(it.title),
      link: it.link,
      description: stripHtml(it.description),
      pubDate: new Date(it.pubDate),
      press,
    };
  });
}

/**
 * query로 뉴스를 검색한 뒤, 정확히 최근 hours시간 이내에 발행된 것만 남깁니다.
 * pubDate가 진짜 타임스탬프라서, 블로그 쪽 getTodayPostCount와 달리 이건 진짜 "24시간 이내"입니다.
 */
async function searchRecentNews(query, hours = 24, { display = 30 } = {}) {
  const all = await searchNews(query, { display });
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return all.filter((item) => item.pubDate.getTime() >= cutoff);
}

/**
 * 여러 검색어(예: 드라마/영화/가요/열애)를 각각 검색한 뒤, 링크 기준으로 중복을 없애고
 * 최신순으로 합쳐서 하나의 목록으로 돌려줍니다. "전체" 탭처럼 여러 소분류를 한 번에
 * 섞어서 보여주고 싶을 때 씁니다.
 */
async function searchMergedNews(queries, hours = 24, { display = 30 } = {}) {
  const lists = await Promise.all(queries.map((q) => searchRecentNews(q, hours, { display })));
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      merged.push(item);
    }
  }
  merged.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
  return merged;
}

// 제목에서 의미 있는 단어(2글자 이상)만 뽑아냅니다. 한국어 형태소 분석기가 없어서
// 정확한 명사 추출은 아니고, 조사가 붙은 채로 대충 토큰화하는 수준의 근사치입니다.
function tokenize(title) {
  return (title || "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// 제목에 겹치는 단어가 일정 개수 이상이면 "같은 이슈를 다룬 기사"로 대충 묶습니다.
// 정확한 클러스터링은 아니라서, 가끔 서로 다른 기사가 묶이거나 같은 이슈인데 못 묶일 수 있습니다.
function clusterByTopic(items) {
  const clusters = [];
  for (const item of items) {
    const tokens = new Set(tokenize(item.title));
    let matched = null;
    for (const cluster of clusters) {
      let overlap = 0;
      for (const t of tokens) {
        if (cluster.tokens.has(t)) overlap++;
      }
      if (overlap >= 2) {
        matched = cluster;
        break;
      }
    }
    if (matched) {
      matched.items.push(item);
      for (const t of tokens) matched.tokens.add(t);
    } else {
      clusters.push({ tokens, items: [item] });
    }
  }
  return clusters;
}

/**
 * ⚠️ 네이버 뉴스 검색 API는 조회수·공감수·클릭수 같은 데이터를 전혀 주지 않습니다
 * (네이버 앱/사이트에서 보이는 "많이 본 뉴스", "5분 많이 본", "공감 많은" 랭킹은
 * 네이버 내부 시스템(AiRS 등)에서만 계산되고, 외부에 공개된 API가 없습니다 — 이건
 * 흉내조차 낼 수 없는 데이터입니다).
 *
 * 대신 이 함수는 "같은 이슈를 다룬 기사가 몇 개나 올라왔는지(=여러 언론사가 동시에
 * 다룰수록 화제성이 높다고 볼 수 있음)"를 기준으로 순위를 매기는 대체(근사) 랭킹입니다.
 * 진짜 조회수 랭킹이 아니라 "기사 수 기준 화제성 랭킹"이라는 점을 꼭 구분해서 써주세요.
 */
async function getBuzzNews(query, hours = 24, { display = 100 } = {}) {
  const items = await searchRecentNews(query, hours, { display });
  const clusters = clusterByTopic(items);

  const ranked = clusters.map((cluster) => {
    const sorted = cluster.items.slice().sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    const top = sorted[0];
    const distinctPress = new Set(cluster.items.map((i) => i.press).filter(Boolean));
    return {
      title: top.title,
      link: top.link,
      pubDate: top.pubDate,
      press: top.press,
      articleCount: cluster.items.length,
      pressCount: distinctPress.size,
      relatedArticles: sorted.slice(0, 5).map((i) => ({ title: i.title, link: i.link, press: i.press })),
    };
  });

  ranked.sort((a, b) => b.pressCount - a.pressCount || b.articleCount - a.articleCount);
  return ranked;
}

// ⚠️ 네이버 뉴스 검색 API 응답에는 썸네일/이미지 필드가 아예 없습니다(title/originallink/link/
// description/pubDate만 줍니다 — 공식 문서로 확인함). 그래서 목록에 정사각형 썸네일을 보여주려면
// 각 기사의 원문 페이지(originallink)에 접속해서 og:image(또는 twitter:image) 메타태그를 직접
// 읽어오는 방법을 씁니다. 이건 네이버가 주는 데이터가 아니라 각 언론사 페이지에 실제로 걸려있는
// 대표 이미지 태그를 읽는 것이라, 진짜 그 기사의 썸네일이 맞습니다(가짜 이미지 아님) — 다만
// 기사마다 페이지에 추가로 접속해야 해서 응답이 조금 느려지고, 사이트에 따라 실패할 수도 있습니다
// (그 경우 image는 null이 되고, 화면에서는 그냥 빈 썸네일로 처리하면 됩니다).
const imageCache = new Map(); // link -> { url: string|null, expiresAt: number }
const IMAGE_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간 — 같은 기사를 계속 다시 긁지 않도록

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

async function fetchArticleImage(link) {
  const cached = imageCache.get(link);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let url = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(link, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; woosurimi-trend-api/1.0)" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      url = extractOgImage(html);
    }
  } catch {
    url = null; // 타임아웃/차단 등으로 실패하면 그냥 이미지 없음 처리
  }
  imageCache.set(link, { url, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS });
  return url;
}

/**
 * 뉴스 목록에 image 필드를 채워서 돌려줍니다. 응답 속도를 위해 앞쪽 limit개만 채우고,
 * 나머지는 image: null로 둡니다(원하면 개수를 늘릴 수 있지만, 그만큼 느려집니다).
 */
async function attachImages(items, { limit = 30 } = {}) {
  const targets = items.slice(0, limit);
  const rest = items.slice(limit);
  const images = await Promise.allSettled(targets.map((it) => fetchArticleImage(it.link)));
  const withImages = targets.map((it, idx) => ({
    ...it,
    image: images[idx].status === "fulfilled" ? images[idx].value : null,
  }));
  return [...withImages, ...rest.map((it) => ({ ...it, image: null }))];
}

module.exports = { searchNews, searchRecentNews, searchMergedNews, getBuzzNews, attachImages };
