// 쇼츠 소재 발굴기 — 2026-09-01
//
// ⚠️ 왜 만들었나
// 수익화 채널 33개를 분석해보니(docs/수익화-채널-33개-분석.md), 잘 버는 사람들이 공통으로
// **손으로** 하는 일이 하나 있었습니다: "잘 되는 영상 찾기".
//   · 링밥은 인스타 계정 2,000개를 매일 손으로 훑다가 결국 프로그램을 만들었습니다.
//   · 개발남 노씨는 "유튜브 파인더"를 만들어 **구독자 대비 조회수(효율)**로 정렬합니다.
//   · 마라는 VidIQ로 **조회수 추이가 평평해진 영상**을 골라냅니다(재각색 적기).
// 이 셋을 한 번에 하는 도구입니다. 그들이 눈으로 하는 판단을 숫자로 바꿉니다.
//
// ⚠️ API 키를 안 씁니다. yt-dlp로 전부 받습니다 — 사장님 0원 원칙.
//    (YOUTUBE_API_KEY는 할당량 제한이 있고, 우리는 그 한도가 필요할 만큼 자주 안 돕니다)
//
// ⚠️ 남의 영상을 그대로 쓰라는 도구가 아닙니다. **어떤 소재가 먹히는지 찾는** 도구입니다.
//    저작권 위험 신호도 같이 표시해서, 손대면 안 되는 것을 걸러냅니다.

const { execFile } = require("child_process");

const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

function run(args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 1 << 26, encoding: "utf8" }, (err, stdout, stderr) => {
      // yt-dlp는 일부 항목이 실패해도 나머지를 출력합니다. stdout이 있으면 살립니다.
      if (err && !stdout) return reject(new Error(String(stderr || err.message).slice(-500)));
      resolve(stdout || "");
    });
  });
}

const jsonLines = (out) =>
  String(out).split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

const daysSince = (yyyymmdd) => {
  const s = String(yyyymmdd || "");
  if (s.length !== 8) return null;
  const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  return Math.max(1, Math.round((Date.now() - d.getTime()) / 86400000));
};

/**
 * ── 지표 1. 효율 ──
 * 조회수 ÷ 구독자. 개발남 노씨가 쓰는 기준입니다.
 *
 * 왜 조회수만 보면 안 되나: 구독자 100만 채널의 30만 조회는 당연한 겁니다.
 * 구독자 9천인데 30만이 나왔다면 **유튜브가 밀어준 것** — 소재 자체가 좋다는 뜻입니다.
 * 우리는 구독자가 없으니 이런 소재를 찾아야 합니다.
 */
function efficiency(v) {
  const views = Number(v.view_count) || 0;
  const subs = Number(v.channel_follower_count) || 0;
  if (!views) return 0;
  if (!subs) return null;            // 구독자를 못 받아온 경우 — 판단 보류
  return +(views / Math.max(1, subs)).toFixed(2);
}

/**
 * ── 지표 2. 재각색 적기 ──
 * 마라의 3단계 공식 중 2번: "가져오는 타이밍이 있다."
 *
 * 아직 조회수가 오르는 중인 영상은 유튜브가 계속 밀어주는 중이라 지금 손대면 정면으로 겹칩니다.
 * **성장이 멈춰 평평해진 것**을 골라야 새 영상처럼 다시 먹힙니다.
 *
 * ⚠️ yt-dlp는 조회수 이력을 안 줍니다. 그래서 대신 이렇게 봅니다:
 *   · 올라온 지 오래됐고(180일+)
 *   · 하루 평균 조회수가 전체 평균 대비 낮아졌으면 = 이미 식은 것
 * 완벽한 판정은 아닙니다. VidIQ 그래프를 대신하는 근사치입니다.
 */
function remakeScore(v) {
  const days = daysSince(v.upload_date);
  const views = Number(v.view_count) || 0;
  if (!days || !views) return null;
  const perDay = views / days;
  return {
    days,
    perDay: Math.round(perDay),
    // 오래됐을수록 + 지금은 조용할수록 재각색 적기
    ready: days >= 180 && perDay < views / 60,
    why: days < 180 ? "아직 최근 영상 — 지금 손대면 원본과 정면으로 겹칩니다"
       : perDay >= views / 60 ? "아직 조회수가 오르는 중 — 유튜브가 밀어주는 중입니다"
       : "성장이 멈춘 지 오래 — 사람들 기억에서 흐려졌습니다",
  };
}

/**
 * ── 지표 3. 저작권 위험 ──
 *
 * 박준휘가 알려준 실전 판별법 두 가지를 코드로 옮겼습니다:
 *   1) 크리에이티브 커먼즈면 원작자가 재사용을 허락한 것 — 안전
 *   2) **최상단 댓글을 저작권 업체가 달아둔 영상**은 라이선스를 사간 것 — 절대 손대면 안 됨
 *
 * ⚠️ "위험 없음"이라고 나와도 안전을 보장하지 않습니다. 걸러내기용이지 면허가 아닙니다.
 */
const AGENCY_HINT = /(licens|rights|media|content|copyright|재사용|저작권|라이선스|저희가 관리|영상 문의)/i;

function copyrightFlags(v, topComments = []) {
  const flags = [];
  const lic = String(v.license || "");
  if (/creative ?commons/i.test(lic)) flags.push({ level: "good", why: "크리에이티브 커먼즈 — 원작자가 재사용을 허락했습니다" });
  for (const c of topComments.slice(0, 3)) {
    const author = String(c.author || "");
    const text = String(c.text || "");
    if (AGENCY_HINT.test(author) || AGENCY_HINT.test(text)) {
      flags.push({ level: "danger", why: `최상단 댓글이 업체로 보입니다("${author}") — 라이선스를 사간 영상일 수 있습니다. 쓰지 마세요` });
      break;
    }
  }
  if (!flags.length) flags.push({ level: "unknown", why: "판별 신호 없음 — 직접 확인하세요" });
  return flags;
}

/** 쇼츠로 볼 길이의 상한(초). */
const SHORTS_MAX_SEC = 90;

/**
 * 유튜브 검색 "4분 미만" 필터.
 *
 * ⚠️ 왜 필요한가 (2026-09-01 실측)
 * `ytsearchN:키워드`로 찾으면 **롱폼만 나옵니다.** "주방 살림템"으로 찾았더니 1,099초·1,262초
 * 짜리가 올라와서, 90초 이하만 남기는 --shorts를 켜면 결과가 **늘 0건**이었습니다.
 * 발굴기가 조용히 빈손이던 진짜 이유입니다.
 *
 * 유튜브 검색 화면의 "4분 미만" 필터를 쓰면 8초·40초·73초 같은 것이 나옵니다.
 * 그래서 쇼츠를 찾을 때는 검색 주소에 그 필터를 붙입니다.
 */
const SHORT_FILTER = "EgIYAQ%3D%3D";

/** 후보 검색 (빠름). 목록만 훑습니다. */
async function searchCandidates(keyword, { count = 25, shortsOnly = false } = {}) {
  const target = shortsOnly
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=${SHORT_FILTER}`
    : `ytsearch${Math.min(count, 60)}:${keyword}`;

  const out = await run([
    "--flat-playlist", "--dump-json", "--no-warnings",
    ...(shortsOnly ? ["--playlist-end", String(Math.min(count, 60))] : []),
    target,
  ], { timeout: 180000 });

  return jsonLines(out)
    .map((v) => ({
      id: v.id,
      title: String(v.title || "").trim(),
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      views: Number(v.view_count) || 0,
      duration: Number(v.duration) || 0,
      channel: v.channel || v.uploader || "",
    }))
    /**
     * 조회수·길이는 대개 검색 결과에 같이 옵니다(실측: 25만·1099초 정상 수신).
     * 다만 항목에 따라 빠질 때가 있어서 **없다고 버리지는 않습니다** —
     * 없으면 다음 단계(inspect)에서 한 건씩 정밀 조회할 때 채워집니다.
     */
    .filter((v) => v.id)
    .filter((v) => (shortsOnly ? !(v.duration > SHORTS_MAX_SEC) : true));
}

/** 후보 하나를 자세히 봅니다 (느림). 상위 몇 개에만 씁니다. */
async function inspect(videoId, { withComments = true } = {}) {
  const args = ["--skip-download", "--dump-json", "--no-warnings"];
  if (withComments) args.push("--write-comments", "--extractor-args", "youtube:comment_sort=top;max_comments=5,all,5");
  args.push(`https://www.youtube.com/watch?v=${videoId}`);

  const rows = jsonLines(await run(args, { timeout: 180000 }));
  const v = rows[0];
  if (!v) return null;

  const comments = (v.comments || []).map((c) => ({ author: c.author, text: c.text }));
  return {
    id: v.id,
    title: String(v.title || "").trim(),
    url: v.webpage_url,
    channel: v.channel || v.uploader || "",
    views: Number(v.view_count) || 0,
    subs: Number(v.channel_follower_count) || 0,
    likes: Number(v.like_count) || 0,
    comments: Number(v.comment_count) || 0,
    duration: Number(v.duration) || 0,
    uploaded: v.upload_date,
    efficiency: efficiency(v),
    remake: remakeScore(v),
    copyright: copyrightFlags(v, comments),
    topComments: comments.slice(0, 3),
  };
}

/**
 * 소재 찾기 — 검색 → 상위 후보만 정밀 조회 → 효율순 정렬.
 *
 * ⚠️ 정밀 조회는 한 건에 몇 초씩 걸립니다. 그래서 **조회수 상위 몇 개만** 봅니다.
 * 전부 보면 키워드 하나에 몇 분이 걸리고, 실제로 쓸 건 위쪽 몇 개뿐입니다.
 */
async function findSources(keyword, { count = 25, inspectTop = 8, shortsOnly = false, minEfficiency = 0 } = {}) {
  const candidates = await searchCandidates(keyword, { count, shortsOnly });
  if (!candidates.length) return { keyword, checked: 0, results: [], note: "검색 결과가 없습니다." };

  /**
   * 어떤 것을 정밀 조회할까.
   * 검색 단계에서는 조회수를 안 주므로(위 설명 참고) 대부분 0입니다.
   * 조회수를 아는 게 하나도 없으면 **유튜브가 매긴 검색 순서**를 그대로 씁니다 —
   * 전부 0으로 정렬하면 순서가 뒤죽박죽이 되어 오히려 나쁜 후보를 봅니다.
   */
  const knowsViews = candidates.some((c) => c.views > 0);
  const top = (knowsViews ? [...candidates].sort((a, b) => b.views - a.views) : candidates)
    .slice(0, inspectTop);

  const results = [];
  for (const c of top) {
    try {
      const d = await inspect(c.id);
      if (d) results.push(d);
    } catch { /* 한 건 실패는 넘어갑니다 — 나머지로 판단합니다 */ }
  }

  const usable = results
    .filter((r) => r.efficiency === null || r.efficiency >= minEfficiency)
    .sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));

  return {
    keyword,
    searched: candidates.length,
    checked: results.length,
    results: usable,
    note: "효율(조회수÷구독자)이 높을수록 구독자 없이도 유튜브가 밀어준 소재입니다.",
  };
}

/**
 * 키워드 여러 개를 한 번에 — 쇼츠를 찾을 때는 이게 기본이어야 합니다.
 *
 * ⚠️ 왜 (2026-09-01 실측)
 * 유튜브 일반 검색(ytsearch)에는 **쇼츠가 아예 안 섞입니다.** 40건을 받아도 90초 이하가 0건입니다.
 * 쇼츠를 보려면 검색 화면의 "4분 미만" 필터를 써야 하는데, 그 페이지는 yt-dlp가 더 넘기지 못해
 * **키워드 하나당 3~8건**이 천장입니다.
 * 그래서 한 키워드를 깊게 파는 대신 **여러 키워드를 얕게 훑어 합칩니다.**
 * 같은 영상이 여러 키워드에 걸리면 한 번만 셉니다.
 */
async function findSourcesMulti(keywords, opts = {}) {
  const list = (Array.isArray(keywords) ? keywords : [keywords]).map((k) => String(k).trim()).filter(Boolean);
  const seen = new Set();
  const merged = [];
  const perKeyword = [];

  for (const kw of list) {
    let r;
    try { r = await findSources(kw, opts); }
    catch (e) { perKeyword.push({ keyword: kw, error: e.message, found: 0 }); continue; }
    let added = 0;
    for (const v of r.results) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      merged.push({ ...v, keyword: kw });
      added++;
    }
    perKeyword.push({ keyword: kw, searched: r.searched || 0, found: added });
  }

  merged.sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));
  return {
    keywords: list,
    perKeyword,
    results: merged,
    note: "효율(조회수÷구독자)이 높을수록 구독자 없이도 유튜브가 밀어준 소재입니다.",
  };
}

module.exports = { findSources, findSourcesMulti, searchCandidates, inspect, efficiency, remakeScore, copyrightFlags };
