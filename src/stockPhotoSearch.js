// "AI 카드뉴스 생성"의 배경 사진을 다양하게 고를 수 있도록, 무료 스톡 사진 API인
// Pexels(https://www.pexels.com/api)에서 검색해줍니다. 저작권 걱정 없이 상업적으로도
// 쓸 수 있는 무료 사진들이고, API 키 발급도 가입만 하면 바로 무료로 받을 수 있습니다.
//
// naverNewsSearch.js/voiceProvider.js와 같은 원칙: 서버에 PEXELS_API_KEY가 없으면
// 이 기능은 에러를 던지고, 호출한 쪽(index.js)에서 "키가 없어서 지금은 업로드/그라디언트
// 배경만 쓸 수 있다"고 사용자에게 안내합니다 — 카드뉴스 생성 자체가 막히지는 않습니다.

const BASE_URL = "https://api.pexels.com/v1/search";

function isConfigured() {
  return !!process.env.PEXELS_API_KEY;
}

/**
 * query로 스톡 사진을 검색합니다.
 * 반환: [{ id, thumbUrl, fullUrl, width, height, photographer, photographerUrl, pexelsUrl }]
 */
async function searchPhotos(query, { perPage = 15 } = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "서버에 PEXELS_API_KEY가 설정되어 있지 않습니다. pexels.com/api 에서 무료로 키를 발급받아 .env에 등록해 주세요."
    );
  }
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) throw new Error("검색어를 입력해 주세요.");

  const url = `${BASE_URL}?query=${encodeURIComponent(cleanQuery)}&per_page=${perPage}`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pexels API 오류 (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.photos || []).map((p) => ({
    id: p.id,
    thumbUrl: p.src.medium,
    fullUrl: p.src.large2x || p.src.large || p.src.original,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pexelsUrl: p.url,
  }));
}

module.exports = { isConfigured, searchPhotos };
