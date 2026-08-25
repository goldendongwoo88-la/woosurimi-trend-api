// 인스타그램 자동 게시 — instagramAuth.js로 연동해둔 계정의 페이지 액세스 토큰을 써서
// 카드뉴스(단일/캐러셀)와 릴스 영상을 실제로 인스타그램에 올립니다.
//
// 인스타그램 Graph API의 게시는 항상 2단계입니다:
//   1) "미디어 컨테이너" 생성 — 올릴 파일의 공개 URL을 Meta에 알려주면, Meta가 그 URL로
//      직접 파일을 받아가서 처리합니다(우리가 파일을 업로드하는 게 아닙니다).
//   2) 그 컨테이너를 publish — 이때 실제로 피드에 올라갑니다.
// 그래서 이미지/영상은 반드시 "Meta 서버가 접근할 수 있는 공개 HTTPS URL"이어야 합니다.
// 이 프로젝트는 public/renders/ 아래 결과물이 정적 파일로 공개되므로 그대로 쓸 수 있습니다.
//
// ⚠️ Render 무료 플랜은 유휴 상태에서 잠들었다가 첫 요청에 50초 이상 걸릴 수 있습니다.
// 그 사이 Meta가 파일을 가져가려다 실패할 수 있어서, 아래 ensureReachable()로 먼저
// 우리 서버를 깨우고 파일이 실제로 응답하는지 확인한 뒤에 컨테이너를 만듭니다.

const instagramAuth = require("./instagramAuth");

const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

// 영상(릴스)은 Meta가 인코딩하는 데 시간이 걸립니다. FINISHED가 될 때까지 폴링합니다.
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_MAX_MS = 5 * 60 * 1000; // 5분

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function graph(method, path, params) {
  const url = `${GRAPH_URL}${path}`;
  let res;
  if (method === "POST") {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  } else {
    res = await fetch(`${url}?${new URLSearchParams(params).toString()}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
    throw new Error(`인스타그램 API 오류: ${msg}`);
  }
  return data;
}

function requireAccount(igUsername) {
  const account = instagramAuth.getAccount(igUsername);
  if (!account) {
    throw new Error(
      `@${igUsername} 계정이 연동되어 있지 않습니다. "인스타그램 연결하기"로 먼저 연동해 주세요.`
    );
  }
  return account;
}

// 상대 경로(/renders/...)를 Meta가 접근할 수 있는 절대 URL로 바꿉니다.
function toPublicUrl(urlOrPath) {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) throw new Error("PUBLIC_BASE_URL이 설정되어 있지 않아 공개 URL을 만들 수 없습니다.");
  return `${base.replace(/\/$/, "")}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
}

// Meta가 파일을 가져가기 전에, 그 URL이 실제로 응답하는지 우리가 먼저 확인합니다.
// (Render 무료 플랜이 잠들어 있으면 첫 요청이 오래 걸리므로 넉넉히 기다립니다.)
async function ensureReachable(url) {
  const deadline = Date.now() + 90000;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(3000);
  }
  throw new Error(`올릴 파일에 접근할 수 없습니다(${lastErr}): ${url}`);
}

/** 컨테이너를 publish해서 실제 게시물로 만듭니다. */
async function publishContainer(account, creationId) {
  const result = await graph("POST", `/${account.igBusinessAccountId}/media_publish`, {
    creation_id: creationId,
    access_token: account.pageAccessToken,
  });
  const permalink = await graph("GET", `/${result.id}`, {
    fields: "permalink",
    access_token: account.pageAccessToken,
  }).catch(() => ({}));
  return { mediaId: result.id, permalink: permalink.permalink || null };
}

/**
 * 카드뉴스 1장 — 단일 이미지 게시.
 * imageUrl: "/renders/cardnews/<jobId>/page1.png" 같은 경로 또는 완전한 https URL
 */
async function publishImage({ igUsername, imageUrl, caption = "" }) {
  const account = requireAccount(igUsername);
  const url = toPublicUrl(imageUrl);
  await ensureReachable(url);

  const container = await graph("POST", `/${account.igBusinessAccountId}/media`, {
    image_url: url,
    caption,
    access_token: account.pageAccessToken,
  });
  return await publishContainer(account, container.id);
}

/**
 * 카드뉴스 여러 장 — 캐러셀(슬라이드) 게시. 인스타그램 제한상 2~10장까지만 됩니다.
 */
async function publishCarousel({ igUsername, imageUrls, caption = "" }) {
  const account = requireAccount(igUsername);
  if (!Array.isArray(imageUrls) || imageUrls.length < 2) {
    throw new Error("캐러셀은 이미지가 2장 이상이어야 합니다.");
  }
  if (imageUrls.length > 10) {
    throw new Error(`인스타그램 캐러셀은 최대 10장까지입니다 (현재 ${imageUrls.length}장).`);
  }

  const urls = imageUrls.map(toPublicUrl);
  for (const u of urls) await ensureReachable(u);

  // 1) 각 장을 "캐러셀 아이템" 컨테이너로 만듭니다.
  const childIds = [];
  for (const u of urls) {
    const child = await graph("POST", `/${account.igBusinessAccountId}/media`, {
      image_url: u,
      is_carousel_item: "true",
      access_token: account.pageAccessToken,
    });
    childIds.push(child.id);
  }

  // 2) 아이템들을 묶어 캐러셀 컨테이너를 만들고 publish합니다.
  const container = await graph("POST", `/${account.igBusinessAccountId}/media`, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: account.pageAccessToken,
  });
  return await publishContainer(account, container.id);
}

// 영상 컨테이너가 처리 완료(FINISHED)될 때까지 기다립니다.
async function waitForVideoReady(account, containerId, onProgress) {
  const deadline = Date.now() + VIDEO_POLL_MAX_MS;
  while (Date.now() < deadline) {
    const status = await graph("GET", `/${containerId}`, {
      fields: "status_code,status",
      access_token: account.pageAccessToken,
    });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") {
      throw new Error(`영상 처리 실패: ${status.status || "원인 미상"}`);
    }
    if (onProgress) onProgress(status.status_code);
    await sleep(VIDEO_POLL_INTERVAL_MS);
  }
  throw new Error("영상 처리가 5분 안에 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.");
}

/**
 * 숏폼 영상 — 릴스 게시.
 * videoUrl: "/renders/xxx.mp4" 같은 경로 또는 완전한 https URL
 * coverUrl: (선택) 커버 이미지. 없으면 인스타그램이 알아서 첫 프레임을 씁니다.
 * shareToFeed: 릴스를 프로필 피드에도 보이게 할지 (기본 true)
 */
async function publishReel({ igUsername, videoUrl, caption = "", coverUrl, shareToFeed = true, onProgress }) {
  const account = requireAccount(igUsername);
  const url = toPublicUrl(videoUrl);
  await ensureReachable(url);

  const params = {
    media_type: "REELS",
    video_url: url,
    caption,
    share_to_feed: shareToFeed ? "true" : "false",
    access_token: account.pageAccessToken,
  };
  if (coverUrl) params.cover_url = toPublicUrl(coverUrl);

  const container = await graph("POST", `/${account.igBusinessAccountId}/media`, params);
  await waitForVideoReady(account, container.id, onProgress);
  return await publishContainer(account, container.id);
}

/** 오늘 남은 게시 가능 횟수 (인스타그램은 24시간에 50개로 제한합니다). */
async function getPublishingLimit(igUsername) {
  const account = requireAccount(igUsername);
  const data = await graph("GET", `/${account.igBusinessAccountId}/content_publishing_limit`, {
    fields: "config,quota_usage",
    access_token: account.pageAccessToken,
  });
  const row = (data.data || [])[0] || {};
  const quota = row.config?.quota_total ?? 50;
  const used = row.quota_usage ?? 0;
  return { used, quota, remaining: Math.max(0, quota - used) };
}

module.exports = { publishImage, publishCarousel, publishReel, getPublishingLimit };
