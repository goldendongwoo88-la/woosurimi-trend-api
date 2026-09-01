/**
 * 합법 영상 소재 공급 — 2026-09-01
 *
 * 남의 유튜브·틱톡·샤오홍슈 영상을 가져다 쓰면 저작권 침해이고, 유튜브 재사용 콘텐츠 정책에
 * 걸려 **수익화가 거절**됩니다. 쿠팡 링크가 붙어도 애드센스가 안 붙고, 저작권 경고 3회면
 * 채널이 삭제됩니다. 그래서 여기서는 **써도 되는 것만** 공급합니다.
 *
 * 지금 되는 공급처:
 *   1. Pexels 동영상 — 상업적 사용까지 전면 허용. 세로 1080x1920이 많아 쇼츠에 그대로 맞습니다.
 *   2. 유튜브 크리에이티브 커먼즈 — 원작자가 재사용을 허락한 것. 출처를 밝히고 씁니다.
 *      (shortsSourceFinder의 copyrightFlags가 이미 CC 여부를 표시합니다)
 *
 * 앞으로 붙일 곳:
 *   · 쿠팡 파트너스 상품 이미지·영상 — 제휴 홍보 목적 사용이 허용됩니다(coupangPartners.js)
 *   · 판매자 제공 소재 — 협찬 시 대부분 줍니다. 이건 사람이 받아와야 합니다.
 */

const PEXELS_VIDEO = "https://api.pexels.com/videos/search";

function pexelsKey() {
  return (process.env.PEXELS_API_KEY || "").trim();
}

/**
 * 쇼츠에 쓸 세로 영상 찾기.
 *
 * ⚠️ 세로(portrait)만 받습니다. 가로 영상을 세로로 잘라 쓰면 화면 양쪽이 잘려서
 * 정작 보여줘야 할 물건이 프레임 밖으로 나갑니다. 처음부터 세로로 찍힌 걸 씁니다.
 */
async function searchVideos(query, { count = 8, minSeconds = 3, maxSeconds = 30 } = {}) {
  const key = pexelsKey();
  if (!key) return { ok: false, error: "PEXELS_API_KEY가 없습니다", videos: [] };

  const url = `${PEXELS_VIDEO}?query=${encodeURIComponent(query)}&per_page=${Math.min(40, count * 3)}&orientation=portrait`;
  try {
    const r = await fetch(url, { headers: { Authorization: key } });
    if (!r.ok) return { ok: false, error: `Pexels ${r.status}`, videos: [] };
    const j = await r.json();

    const videos = (j.videos || [])
      .filter((v) => v.duration >= minSeconds && v.duration <= maxSeconds)
      .map((v) => {
        // 가장 큰 세로 파일을 고릅니다. 작은 걸 받아서 늘리면 화질이 뭉개집니다.
        const files = (v.video_files || [])
          .filter((f) => f.height >= f.width)
          .sort((a, b) => (b.height || 0) - (a.height || 0));
        const best = files[0] || (v.video_files || [])[0];
        if (!best) return null;
        return {
          id: v.id,
          url: best.link,
          width: best.width,
          height: best.height,
          duration: v.duration,
          credit: `Pexels / ${v.user?.name || "unknown"}`,
          sourceUrl: v.url,
          license: "Pexels 무료 (상업적 사용 가능, 출처 표기 불필요)",
          risk: "없음",
          preview: v.image || null,
        };
      })
      .filter(Boolean)
      .slice(0, count);

    return { ok: true, query, videos, note: videos.length ? null : "조건에 맞는 세로 영상이 없습니다. 검색어를 영어로 바꿔보세요." };
  } catch (e) {
    return { ok: false, error: e.message, videos: [] };
  }
}

/**
 * 한 편에 필요한 장면들을 한 번에 모읍니다.
 * 쇼츠 하나는 보통 장면 3~5개로 만듭니다. 장면마다 검색어가 달라야 그림이 안 겹칩니다.
 */
async function gatherScenes(queries, { perScene = 2 } = {}) {
  const list = (Array.isArray(queries) ? queries : [queries]).filter(Boolean).slice(0, 6);
  const scenes = [];
  const missing = [];
  const seen = new Set();

  for (const q of list) {
    const r = await searchVideos(q, { count: perScene + 2 });
    const picked = (r.videos || []).filter((v) => !seen.has(v.id)).slice(0, perScene);
    picked.forEach((v) => seen.add(v.id));
    if (picked.length) scenes.push({ query: q, clips: picked });
    else missing.push(q);
  }
  return { scenes, missing, total: scenes.reduce((n, s) => n + s.clips.length, 0) };
}

module.exports = { searchVideos, gatherScenes };
