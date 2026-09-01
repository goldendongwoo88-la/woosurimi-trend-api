/**
 * 유튜브 파인더 — 2026-09-01
 *
 * "구독자는 적은데 조회수는 터진" 영상·채널을 찾습니다.
 * 개발남 노씨 파인더(오토워커 2기)의 판단 기준을 그대로 쓰되, 우리 쪽에 맞게 넓혔습니다.
 *
 * ── 핵심 지표: 효율 = 조회수 ÷ 구독자 ──
 * 구독자 100만 채널의 30만 조회는 당연합니다. 구독자 9천인데 30만이면 **유튜브가 밀어준 것** —
 * 소재 자체가 좋다는 뜻입니다. 우리는 구독자가 없으니 이런 소재를 찾아야 합니다.
 *
 * ── 왜 API 키를 쓰는가 (실측 비교, 2026-09-01) ──
 * 원래 yt-dlp만 쓰려 했습니다(키 0원 원칙). 그런데 두 가지가 걸렸습니다:
 *   1) **유튜브 일반 검색에는 쇼츠가 안 섞입니다.** ytsearch40으로 받아도 90초 이하가 0건.
 *      검색 화면의 "4분 미만" 필터를 써야 나오는데, 그 페이지는 키워드당 3~8건이 천장입니다.
 *   2) yt-dlp는 영상 하나 조회에 몇 초씩 걸립니다. 채널 100개를 매일 훑는 건 사실상 불가능합니다.
 * 유튜브 Data API는 **무료**(하루 1만 유닛)이고 한 번에 50개씩 즉시 옵니다.
 * 그래서 키가 있으면 API를, 없으면 yt-dlp를 씁니다. 둘 다 결과 모양은 같습니다.
 *
 * ── 할당량 (하루 1만 유닛) ──
 *   search.list      100 유닛  ← 비쌉니다. 키워드 검색은 하루 90번쯤이 한계입니다.
 *   videos.list        1 유닛  (한 번에 50개)
 *   channels.list      1 유닛  (한 번에 50개)
 *   playlistItems.list 1 유닛  (한 번에 50개)
 * 채널 모니터링은 검색을 안 쓰므로 **채널 100개를 훑어도 5유닛 남짓**입니다. 마음껏 돌리십시오.
 */

const API = "https://www.googleapis.com/youtube/v3";

function apiKey() {
  return (process.env.YOUTUBE_API_KEY || "").trim();
}

/** 키가 있는지 — 화면에서 "지금 어느 방식으로 도는지" 보여줄 때 씁니다. */
function hasApiKey() {
  return Boolean(apiKey());
}

async function get(path, params) {
  const key = apiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY가 없습니다");
  const qs = new URLSearchParams({ ...params, key });
  const r = await fetch(`${API}/${path}?${qs}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = j?.error?.errors?.[0]?.reason || "";
    if (reason === "quotaExceeded") {
      throw new Error("오늘 유튜브 할당량(1만 유닛)을 다 썼습니다. 내일 자정(태평양시)에 초기화됩니다.");
    }
    if (reason === "keyInvalid" || r.status === 400) {
      throw new Error("API 키가 잘못됐습니다. YouTube Data API v3가 켜져 있는지 확인하세요.");
    }
    throw new Error(j?.error?.message || `유튜브 API ${r.status}`);
  }
  return j;
}

/** ISO8601 길이("PT1M30S")를 초로. 유튜브가 이 형식으로만 줍니다. */
function isoToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => Number(x) || 0);
  return d * 86400 + h * 3600 + mi * 60 + s;
}

const daysAgoIso = (days) => new Date(Date.now() - days * 86400000).toISOString();

/**
 * 여러 개를 한 번에 물어봅니다.
 * 50개씩 끊는 건 유튜브가 정한 상한입니다. 하나씩 물으면 유닛도 시간도 50배 듭니다.
 */
async function chunked(path, ids, params, pick) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const j = await get(path, { ...params, id: ids.slice(i, i + 50).join(",") });
    for (const item of j.items || []) out.set(item.id, pick(item));
  }
  return out;
}

/** 영상 하나를 우리 형식으로. 효율은 채널 구독자를 알아야 나오므로 따로 붙입니다. */
function shapeVideo(v, subs) {
  const views = Number(v.statistics?.viewCount) || 0;
  const dur = isoToSeconds(v.contentDetails?.duration);
  const published = v.snippet?.publishedAt || null;
  const days = published ? Math.max(1, Math.round((Date.now() - Date.parse(published)) / 86400000)) : null;
  return {
    id: v.id,
    title: (v.snippet?.title || "").trim(),
    // 설명에도 해시태그로 제품명이 박혀 있는 경우가 많습니다(productExtract가 씁니다).
    description: (v.snippet?.description || "").slice(0, 500),
    url: `https://www.youtube.com/watch?v=${v.id}`,
    channel: v.snippet?.channelTitle || "",
    channelId: v.snippet?.channelId || "",
    views,
    likes: Number(v.statistics?.likeCount) || 0,
    comments: Number(v.statistics?.commentCount) || 0,
    duration: dur,
    isShort: dur > 0 && dur <= 90,
    published,
    days,
    perDay: days ? Math.round(views / days) : null,
    subs: subs ?? null,
    efficiency: subs ? +(views / Math.max(1, subs)).toFixed(2) : null,
    thumb: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || null,
  };
}

/**
 * ── 재각색 적기 ──
 * 마라의 공식: 아직 조회수가 오르는 중인 영상은 유튜브가 계속 밀어주는 중이라 지금 손대면
 * 정면으로 겹칩니다. **성장이 멈춰 평평해진 것**을 골라야 새 영상처럼 다시 먹힙니다.
 * (조회수 이력을 안 주므로 "올라온 지 오래 + 요즘 조용함"으로 대신 봅니다.)
 */
function remakeTiming(v) {
  if (!v.days || !v.views) return null;
  const quiet = v.perDay < v.views / 60;
  const old = v.days >= 180;
  const hot = (v.efficiency || 0) >= 20;

  /**
   * ⚠️ 지금 터지는 영상을 무조건 "대기"로 밀어두면 안 됩니다.
   * 최근 것만 보면(기간 30일) 전부 대기로 나와서 표시가 아무 쓸모가 없어집니다.
   *
   * 쇼핑 쇼츠는 **영상이 아니라 상품이 터지는 것**입니다. 지금 뜨는 상품이면 지금 만드는 게 맞습니다.
   * 야담·이야기 소재는 반대입니다 — 원본이 밀리는 중에 손대면 정면으로 겹칩니다.
   * 그래서 지금 터지는 것은 "베끼지 말고 같은 소재로 지금"이라고 알려줍니다.
   */
  if (old && quiet) {
    return { days: v.days, perDay: v.perDay, ready: true, mode: "remake",
      why: "성장이 멈춘 지 오래 — 사람들 기억에서 흐려졌습니다. 재각색 적기입니다." };
  }
  if (hot) {
    return { days: v.days, perDay: v.perDay, ready: true, mode: "ride",
      why: "지금 터지는 중 — 영상을 베끼지 말고 같은 상품·소재로 지금 만드십시오." };
  }
  return { days: v.days, perDay: v.perDay, ready: false, mode: "wait",
    why: old ? "아직 조회수가 오르는 중 — 유튜브가 밀어주는 중입니다"
      : "아직 최근 영상이고 효율도 낮습니다 — 굳이 따라갈 이유가 없습니다" };
}

/**
 * ── 키워드 검색 ──
 * 파인더의 "고급 설정"과 같은 거름망입니다: 최대 구독자 / 최소 효율 / 기간 / 길이.
 *
 * ⚠️ search.list는 100유닛입니다. 하루 90번쯤이 한계이니 키워드를 함부로 늘리지 마십시오.
 */
async function keywordSearch(keyword, {
  days = 30,
  maxSubs = 50000,
  minEfficiency = 1.0,
  duration = "any",      // any | short(4분미만) | medium | long
  shortsOnly = false,    // 90초 이하만 (쇼핑 쇼츠용)
  max = 50,
  regionCode = "KR",
} = {}) {
  const search = await get("search", {
    part: "snippet",
    q: keyword,
    type: "video",
    order: "viewCount",
    maxResults: String(Math.min(50, max)),
    publishedAfter: daysAgoIso(days),
    regionCode,
    relevanceLanguage: "ko",
    // 쇼츠를 찾을 때는 유튜브에게 "4분 미만"으로 좁혀 달라고 합니다. 90초 컷은 우리가 다시 합니다.
    videoDuration: shortsOnly ? "short" : duration,
  });

  const ids = (search.items || []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return { keyword, checked: 0, results: [], note: "검색 결과가 없습니다." };

  const videos = await chunked("videos", ids, { part: "snippet,statistics,contentDetails" }, (v) => v);
  const channelIds = [...new Set([...videos.values()].map((v) => v.snippet?.channelId).filter(Boolean))];
  const subsById = await chunked("channels", channelIds, { part: "statistics" },
    (c) => Number(c.statistics?.subscriberCount) || 0);

  const rows = [...videos.values()]
    .map((v) => shapeVideo(v, subsById.get(v.snippet?.channelId)))
    .filter((v) => (shortsOnly ? v.isShort : true))
    // 구독자를 숨긴 채널은 효율을 못 냅니다. 버리지 않고 남기되 정렬에서 뒤로 갑니다.
    .filter((v) => v.subs === null || v.subs <= maxSubs)
    .filter((v) => v.efficiency === null || v.efficiency >= minEfficiency)
    .map((v) => ({ ...v, remake: remakeTiming(v) }))
    .sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));

  return {
    keyword,
    checked: ids.length,
    results: rows,
    quotaUsed: 100 + Math.ceil(ids.length / 50) + Math.ceil(channelIds.length / 50),
    note: "효율(조회수÷구독자)이 높을수록 구독자 없이도 유튜브가 밀어준 소재입니다.",
  };
}

/** @핸들·채널주소·채널ID 무엇을 넣어도 채널ID로 바꿉니다. */
async function resolveChannel(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const idMatch = /(?:channel\/)?(UC[A-Za-z0-9_-]{22})/.exec(s);
  if (idMatch) return idMatch[1];

  const handle = (/@([A-Za-z0-9._-]+)/.exec(s) || [])[1];
  if (handle) {
    const j = await get("channels", { part: "id", forHandle: `@${handle}` });
    if (j.items?.[0]?.id) return j.items[0].id;
  }
  // 마지막 수단: 이름으로 검색. 100유닛이라 되도록 @핸들이나 채널ID를 쓰십시오.
  const sr = await get("search", { part: "snippet", q: s, type: "channel", maxResults: "1" });
  return sr.items?.[0]?.snippet?.channelId || sr.items?.[0]?.id?.channelId || null;
}

/**
 * ── 채널 모니터링 ──
 * 등록한 채널들의 최신 영상을 효율순으로 정렬합니다. 파인더의 진짜 값어치는 여기 있습니다.
 *
 * 검색(100유닛)을 안 씁니다. 채널의 "업로드 재생목록"을 읽는 방식이라 **채널 100개에 5유닛 남짓**입니다.
 * 아침에 한 번 돌려놓고 훑어보시면 됩니다.
 */
async function monitorChannels(channelIds, { days = 7, perChannel = 10, shortsOnly = false, minEfficiency = 0 } = {}) {
  const ids = channelIds.filter(Boolean);
  if (!ids.length) return { results: [], checked: 0 };

  // 채널 정보(구독자 + 업로드 재생목록)를 50개씩 한 번에
  const info = await chunked("channels", ids, { part: "statistics,contentDetails,snippet" }, (c) => ({
    title: c.snippet?.title || "",
    subs: Number(c.statistics?.subscriberCount) || 0,
    uploads: c.contentDetails?.relatedPlaylists?.uploads || null,
  }));

  const since = Date.now() - days * 86400000;
  const videoIds = [];
  const subsByChannel = new Map();

  for (const [cid, meta] of info) {
    subsByChannel.set(cid, meta.subs);
    if (!meta.uploads) continue;
    try {
      const pl = await get("playlistItems", {
        part: "contentDetails",
        playlistId: meta.uploads,
        maxResults: String(Math.min(50, perChannel)),
      });
      for (const it of pl.items || []) {
        const at = Date.parse(it.contentDetails?.videoPublishedAt || "");
        if (!at || at < since) continue;      // 기간 밖은 버립니다
        videoIds.push(it.contentDetails.videoId);
      }
    } catch { /* 한 채널이 막혀도 나머지로 갑니다 */ }
  }

  if (!videoIds.length) {
    return { results: [], checked: ids.length, note: `최근 ${days}일 안에 올라온 영상이 없습니다.` };
  }

  const videos = await chunked("videos", videoIds, { part: "snippet,statistics,contentDetails" }, (v) => v);
  const rows = [...videos.values()]
    .map((v) => shapeVideo(v, subsByChannel.get(v.snippet?.channelId)))
    .filter((v) => (shortsOnly ? v.isShort : true))
    .filter((v) => v.efficiency === null || v.efficiency >= minEfficiency)
    .map((v) => ({ ...v, remake: remakeTiming(v) }))
    .sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));

  return {
    results: rows,
    checked: ids.length,
    videos: videoIds.length,
    quotaUsed: Math.ceil(ids.length / 50) + ids.length + Math.ceil(videoIds.length / 50),
    note: "효율순입니다. 구독자 대비 조회수가 터진 것이 위로 옵니다.",
  };
}

module.exports = {
  hasApiKey, keywordSearch, monitorChannels, resolveChannel,
  isoToSeconds, remakeTiming, shapeVideo,
};
