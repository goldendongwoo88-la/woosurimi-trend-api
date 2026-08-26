/**
 * 한 번 만들어 여러 곳에 올리기.
 *
 * ⚠️ 먼저 솔직하게 — **일곱 곳 중 다섯 곳만 자동입니다.**
 * "전부 자동으로 올려드립니다"라고 파는 도구들이 있는데, 대개 계정 정보를
 * 저장해두고 브라우저를 사람인 척 조작하는 방식입니다. 그건 계정 정지 위험을
 * 사용자가 떠안는 구조라 여기서는 만들지 않습니다.
 *
 * ⚠️ 그리고 다섯 곳도 **바로 되는 게 아닙니다.** 메타·유튜브·틱톡 모두
 * 앱 심사를 받아야 게시 권한이 열립니다. 며칠에서 몇 주 걸립니다.
 * 그래서 이 모듈은 "안 됩니다"라고 조용히 실패하지 않고,
 * **무엇이 왜 안 되고 어떻게 해야 열리는지**를 정확히 돌려줍니다.
 * 그게 이 파일의 절반입니다.
 */

const instagramAuth = require("./instagramAuth");
const instagramPublish = require("./instagramPublish");

// ────────────────────────────────────────────────────────────
// 어디에 올릴 수 있나
// ────────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: {
    id: "instagram",
    name: "인스타그램 릴스",
    kind: "auto",
    needs: "메타 앱 + 인스타 비즈니스 계정 + 페이스북 페이지 연결",
    steps: [
      "인스타 계정을 프로페셔널(비즈니스)로 전환합니다.",
      "페이스북 페이지를 만들고 인스타 계정과 연결합니다.",
      "developers.facebook.com 에서 앱을 만듭니다.",
      "Instagram Graph API 제품을 추가하고 instagram_content_publish 권한을 신청합니다.",
      "앱 검수(App Review)를 넣습니다 — 보통 며칠에서 2주 걸립니다.",
      "승인되면 이 사이트에서 [인스타 연동]을 누릅니다.",
    ],
  },
  threads: {
    id: "threads",
    name: "스레드",
    kind: "auto",
    needs: "메타 앱 + Threads API 권한",
    steps: [
      "인스타와 같은 메타 앱에 Threads API 제품을 추가합니다.",
      "threads_content_publish 권한을 신청합니다.",
      "검수가 끝나면 인스타와 같은 방식으로 연동됩니다.",
    ],
  },
  facebook: {
    id: "facebook",
    name: "페이스북 페이지·릴스",
    kind: "auto",
    needs: "페이스북 페이지 (개인 계정은 안 됩니다)",
    steps: [
      "페이스북 페이지를 만듭니다. 개인 프로필로는 API 게시가 안 됩니다.",
      "같은 메타 앱에 pages_manage_posts 권한을 신청합니다.",
    ],
  },
  youtube: {
    id: "youtube",
    name: "유튜브 쇼츠",
    kind: "auto",
    needs: "구글 클라우드 프로젝트 + YouTube Data API",
    steps: [
      "console.cloud.google.com 에서 프로젝트를 만듭니다.",
      "YouTube Data API v3를 켭니다.",
      "OAuth 동의 화면을 설정하고 클라이언트 ID를 만듭니다.",
      "⚠️ 업로드는 할당량을 크게 씁니다. 기본 할당량으로 하루 6편 정도가 한도입니다.",
      "더 필요하면 할당량 증량을 신청해야 하는데 승인이 까다롭습니다.",
    ],
  },
  tiktok: {
    id: "tiktok",
    name: "틱톡",
    kind: "auto",
    needs: "틱톡 개발자 앱 + Content Posting API 심사",
    steps: [
      "developers.tiktok.com 에서 앱을 만듭니다.",
      "Content Posting API를 신청합니다.",
      "⚠️ 심사가 가장 까다롭습니다. 몇 주 걸리고 거절되는 경우도 많습니다.",
      "심사 전에는 '초안으로 보내기'만 가능합니다 — 앱에서 직접 게시해야 합니다.",
    ],
  },
  naverBlog: {
    id: "naverBlog",
    name: "네이버 블로그",
    kind: "manual",
    // ⚠️ 네이버는 2020년에 블로그 글쓰기 API를 닫았습니다. 방법이 없습니다.
    why: "네이버가 2020년에 글쓰기 API를 종료했습니다. 공식 통로가 없습니다.",
    instead: "크롬 확장으로 제목·본문이 자동으로 채워집니다. 발행 버튼만 직접 누르시면 됩니다.",
  },
  naverClip: {
    id: "naverClip",
    name: "네이버 클립",
    kind: "manual",
    why: "공개 API가 없습니다.",
    instead: "영상 파일과 올릴 문구까지 만들어드립니다. 올리는 것만 손으로 하시면 됩니다.",
  },
};

// ────────────────────────────────────────────────────────────
// 지금 어디까지 되나
// ────────────────────────────────────────────────────────────
function status() {
  const out = [];

  // 인스타 — 실제로 연동된 계정이 있는지 봅니다.
  let igAccounts = [];
  try { igAccounts = instagramAuth.loadAccounts() || []; } catch { igAccounts = []; }
  const igReady = instagramAuth.isConfigured() && igAccounts.length > 0;

  for (const p of Object.values(PLATFORMS)) {
    if (p.kind === "manual") {
      out.push({ ...p, state: "manual" });
      continue;
    }
    let state = "설정 필요";
    let detail = p.needs;

    if (p.id === "instagram") {
      if (igReady) { state = "준비됨"; detail = `연동된 계정 ${igAccounts.length}개`; }
      else if (instagramAuth.isConfigured()) { state = "연동 필요"; detail = "앱은 있는데 계정 연동이 아직입니다."; }
    } else if (p.id === "threads" || p.id === "facebook") {
      // 같은 메타 앱을 씁니다. 앱이 없으면 셋 다 못 씁니다.
      if (!instagramAuth.isConfigured()) detail = "메타 앱부터 만들어야 합니다 (인스타와 같은 앱).";
    } else if (p.id === "youtube") {
      if (process.env.YOUTUBE_CLIENT_ID) { state = "연동 필요"; detail = "앱은 있는데 계정 연동이 아직입니다."; }
    } else if (p.id === "tiktok") {
      if (process.env.TIKTOK_CLIENT_KEY) { state = "연동 필요"; detail = "앱은 있는데 계정 연동이 아직입니다."; }
    }
    out.push({ ...p, state, detail });
  }

  const ready = out.filter((p) => p.state === "준비됨").length;
  return {
    platforms: out,
    ready,
    total: Object.keys(PLATFORMS).length,
    // ⚠️ 이 문장을 숨기지 않습니다. 기대치를 미리 맞춰두는 게 낫습니다.
    summary: ready === 0
      ? "아직 자동으로 올릴 수 있는 곳이 없습니다. 영상과 문구까지는 자동으로 만들어드리니, 올리는 건 손으로 하시는 게 지금은 더 빠릅니다."
      : `${ready}곳 자동 게시 가능. 나머지는 아래 절차가 필요합니다.`,
  };
}

/**
 * 실제로 올립니다.
 *
 * ⚠️ 한 곳이 실패해도 나머지는 계속합니다. 그리고 **어디가 왜 실패했는지**를
 * 전부 돌려줍니다. "일부 실패"라고만 하면 사장님이 어디를 손으로 올려야 할지
 * 알 수가 없습니다.
 */
async function publish({ videoUrl, imageUrl, caption = "", targets = [] } = {}) {
  const results = [];

  for (const t of targets) {
    const p = PLATFORMS[t];
    if (!p) {
      results.push({ platform: t, ok: false, message: "그런 플랫폼을 모릅니다." });
      continue;
    }
    if (p.kind === "manual") {
      results.push({
        platform: t, name: p.name, ok: false, manual: true,
        message: p.why, instead: p.instead,
      });
      continue;
    }

    if (t === "instagram") {
      try {
        let accounts = [];
        try { accounts = instagramAuth.loadAccounts() || []; } catch {}
        if (!accounts.length) throw new Error("연동된 인스타 계정이 없습니다. 먼저 연동해 주세요.");
        const acc = accounts[0];
        const r = videoUrl
          ? await instagramPublish.publishReel({ igUsername: acc.igUsername, videoUrl, caption })
          : await instagramPublish.publishImage({ igUsername: acc.igUsername, imageUrl, caption });
        results.push({ platform: t, name: p.name, ok: true, ...r });
      } catch (e) {
        results.push({ platform: t, name: p.name, ok: false, message: e.message });
      }
      continue;
    }

    // ⚠️ 나머지는 아직 붙이지 않았습니다. 붙여봐야 심사 전에는 못 쓰고,
    // 심사가 끝나야 실제 응답을 보고 제대로 만들 수 있습니다.
    // 안 되는 걸 되는 척 만들어두면 나중에 더 큰 문제가 됩니다.
    results.push({
      platform: t, name: p.name, ok: false, pending: true,
      message: "아직 연결하지 않았습니다.",
      steps: p.steps,
    });
  }

  const done = results.filter((r) => r.ok).length;
  return {
    results, done, total: targets.length,
    manualLeft: results.filter((r) => !r.ok).map((r) => r.name || r.platform),
  };
}

module.exports = { PLATFORMS, status, publish };
