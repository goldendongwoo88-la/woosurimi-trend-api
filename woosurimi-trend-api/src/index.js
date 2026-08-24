require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { fetchGoogleTrendsKR } = require("./trendSource");
const { findOpportunities, CATEGORY_SEEDS } = require("./opportunityFinder");
const { searchRecentNews, searchMergedNews, getBuzzNews, attachImages } = require("./naverNewsSearch");
const { planShortform } = require("./shortformPlanner");
const { renderShortformVideo } = require("./videoRenderer");
const cache = require("./cache");
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } }); // BGM 업로드용, 최대 15MB

// 네이버 "엔터" 홈 화면의 탭(드라마/영화/뮤직/연애)을 흉내낸 소분류 → 검색어 매핑입니다.
// "전체"/"최신뉴스" 탭은 아래 이 4개를 실제로 합쳐서(중복 제거 + 최신순 정렬) 보여줍니다.
const ENTERTAINMENT_SUBCATEGORIES = {
  "드라마": "드라마",
  "영화": "영화",
  "뮤직": "가요",
  "연애": "열애",
};

// "전체"와 "최신뉴스"는 둘 다 4개 소분류를 합치는 같은 로직을 쓰지만, 시간 범위(hours)
// 기본값은 다르게 뒀습니다 — "전체"는 하루 전체(24시간), "최신뉴스"는 말 그대로 "방금 뜬"
// 것만 보이도록 더 좁은 6시간을 기본값으로 씁니다. 요청에 ?hours=숫자를 직접 붙이면
// 이 기본값 대신 그 값을 씁니다.
const ENTERTAINMENT_TABS = ["전체", "최신뉴스", "드라마", "영화", "뮤직", "연애", "랭킹"];
const ENTERTAINMENT_DEFAULT_HOURS = {
  "전체": 24,
  "최신뉴스": 6,
};

// 진짜 네이버 "오늘의 엔터 랭킹"(AiRS 추천), "많이 본 뉴스", "5분 많이 본", "공감 많은"은
// 네이버 내부에서만 계산되는 조회수·공감수 기반 랭킹이라 외부 공개 API가 전혀 없습니다.
// 그래서 "랭킹" 탭은 그 대신 "같은 이슈를 다룬 기사 수(언론사 수)가 많은 순" 화제성
// 랭킹으로 대체했습니다 — getBuzzNews의 주석/설명을 참고하세요.

const PORT = process.env.PORT || 3000;
// 기본값: 10분마다 갱신. 너무 짧게 잡으면 소스 서버에 부담을 주니 1분 미만은 권장하지 않습니다.
const REFRESH_CRON = process.env.REFRESH_CRON || "*/10 * * * *";

const app = express();
app.use(cors()); // 우수리미 AI 프론트엔드(다른 도메인)에서 호출할 수 있도록 허용
app.use(express.json()); // 숏폼 기획 등 POST 요청의 JSON 본문을 읽기 위해
app.use(express.static(path.join(__dirname, "..", "public"))); // /entertainment.html 같은 데모 화면용

app.get("/api/trends", (req, res) => {
  const data = cache.getLatest();
  if (!data) {
    return res.status(503).json({
      error: "not_ready",
      message: "아직 첫 데이터를 가져오는 중입니다. 잠시 후 다시 시도해 주세요.",
    });
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json(data);
});

// 카테고리별 결과를 잠깐 캐시해서, 같은 카테고리를 여러 번 눌러도
// 네이버 API를 매번 다시 호출하지 않도록 합니다. (기본 10분)
const OPPORTUNITY_TTL_MS = Number(process.env.OPPORTUNITY_TTL_MS || 10 * 60 * 1000);
const opportunityCache = new Map(); // category -> { data, expiresAt }

app.get("/api/categories", (req, res) => {
  res.json({ categories: Object.keys(CATEGORY_SEEDS) });
});

app.get("/api/opportunity", async (req, res) => {
  const category = req.query.category;
  if (!category) {
    return res.status(400).json({
      error: "missing_category",
      message: '카테고리를 지정해 주세요. 예: /api/opportunity?category=패션/미용',
      categories: Object.keys(CATEGORY_SEEDS),
    });
  }

  // mode=today면 "오늘 발행된 글" 기준으로, 기본(all)이면 "전체 발행된 글" 기준으로 계산합니다.
  const mode = req.query.mode === "today" ? "today" : "all";
  const cacheKey = `${category}::${mode}`;

  const cached = opportunityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ category, mode, generatedAt: cached.generatedAt, cached: true, items: cached.data });
  }

  try {
    const items = await findOpportunities(category, 20, mode);
    const generatedAt = new Date().toISOString();
    opportunityCache.set(cacheKey, { data: items, generatedAt, expiresAt: Date.now() + OPPORTUNITY_TTL_MS });
    res.json({ category, mode, generatedAt, cached: false, items });
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: err.message });
  }
});

app.get("/api/entertainment/categories", (req, res) => {
  res.json({ categories: ENTERTAINMENT_TABS });
});

// 최근 hours시간 이내에 올라온 진짜 엔터 뉴스 목록 (기본 24시간).
// GET /api/entertainment/news?category=드라마&hours=24
// category가 "전체"나 "최신뉴스"면 드라마+영화+뮤직+연애 4개를 실제로 합쳐서(중복 제거 + 최신순) 줍니다.
app.get("/api/entertainment/news", async (req, res) => {
  const category = req.query.category || "전체";
  // ?hours=숫자를 직접 주면 그 값을 쓰고, 안 주면 카테고리별 기본값(없으면 24시간)을 씁니다.
  const explicitHours = Number(req.query.hours) > 0 ? Number(req.query.hours) : null;
  const hours = explicitHours || ENTERTAINMENT_DEFAULT_HOURS[category] || 24;

  try {
    let items;
    let query;

    if (category === "전체" || category === "최신뉴스") {
      query = Object.values(ENTERTAINMENT_SUBCATEGORIES).join(" + ");
      items = await searchMergedNews(Object.values(ENTERTAINMENT_SUBCATEGORIES), hours, { display: 30 });
      items = items.slice(0, 40); // 4개 합치면 최대 120개까지 나올 수 있어서, 최신순 상위 40개로 추립니다
    } else if (ENTERTAINMENT_SUBCATEGORIES[category]) {
      query = ENTERTAINMENT_SUBCATEGORIES[category];
      items = await searchRecentNews(query, hours, { display: 30 });
    } else {
      return res.status(400).json({
        error: "unknown_category",
        message: `등록되지 않은 카테고리입니다: "${category}"`,
        categories: ENTERTAINMENT_TABS,
      });
    }

    // 기사 원문 페이지에서 대표 이미지(og:image)를 읽어와 채워줍니다 — 목록이 길수록 조금 느려집니다.
    items = await attachImages(items, { limit: 30 });

    res.json({
      category,
      query,
      hours,
      generatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: err.message });
  }
});

// "랭킹" 탭. 진짜 조회수/공감수 랭킹이 아니라, 같은 이슈를 다룬 기사 수(언론사 수)가
// 많은 순으로 매기는 "화제성" 랭킹입니다 — note 필드에 항상 이 설명을 같이 내려줍니다.
// GET /api/entertainment/ranking?hours=24
app.get("/api/entertainment/ranking", async (req, res) => {
  const hours = Number(req.query.hours) > 0 ? Number(req.query.hours) : 24;

  try {
    let items = await getBuzzNews("연예", hours, { display: 100 });
    items = items.slice(0, 20); // 화제성 상위 20개만
    items = await attachImages(items, { limit: 20 });
    res.json({
      category: "랭킹",
      note:
        "네이버의 실제 조회수·공감수는 외부에 공개되지 않아서 '많이 본 뉴스'/'5분 많이 본'/'공감 많은' 같은 진짜 랭킹은 만들 수 없습니다. 대신 같은 이슈를 다룬 기사 수(언론사 수)가 많은 순으로 정렬한 '화제성' 랭킹입니다.",
      hours,
      generatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: err.message });
  }
});

// 숏폼 자동 제작 — 블로그 글 링크 또는 브랜드/쇼핑 커넥트 링크를 넣으면, 그 페이지에
// 실제로 있는 사진과 본문 문장으로 장면(씬)별 기획안(대본)을 자동으로 짜줍니다.
// 이 단계는 대본/장면 "기획"만 만듭니다 — 실제 mp4 영상은 아래 /api/shortform/render가 만듭니다.
// POST /api/shortform/plan  body: { "url": "https://...", "source": "blog" | "shopping" }
app.post("/api/shortform/plan", async (req, res) => {
  const { url, source } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "missing_url", message: "블로그 글 또는 상품 페이지 URL을 보내주세요." });
  }
  const normalizedSource = source === "shopping" ? "shopping" : "blog";

  try {
    const plan = await planShortform(url, normalizedSource);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: err.message });
  }
});

// /api/shortform/plan으로 만든 scenes를 실제 mp4 영상 파일로 렌더링합니다.
// ffmpeg로 서버에서 직접 합성합니다 — 사진마다 자막을 입히고 순서대로 이어붙인 뒤,
// 배경음악(mp3 파일)을 업로드하면 전체 길이에 맞춰 함께 입혀줍니다.
// multipart/form-data 로 보내주세요:
//   - scenes: JSON 문자열(배열) — /api/shortform/plan 응답의 scenes 그대로
//   - durationPerScene: (선택) 장면당 초 — 기본 3
//   - bgm: (선택) mp3/오디오 파일
app.post("/api/shortform/render", upload.single("bgm"), async (req, res) => {
  let scenes;
  try {
    scenes = JSON.parse(req.body.scenes || "[]");
  } catch {
    return res.status(400).json({ error: "invalid_scenes", message: "scenes 필드가 올바른 JSON이 아닙니다." });
  }
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: "missing_scenes", message: "scenes 배열이 비어 있습니다. 먼저 /api/shortform/plan을 호출해 주세요." });
  }
  const durationPerScene = Number(req.body.durationPerScene) > 0 ? Number(req.body.durationPerScene) : 3;
  if (scenes.length > 12) {
    return res.status(400).json({ error: "too_many_scenes", message: "장면은 최대 12개까지만 지원합니다." });
  }

  const bgmPath = req.file ? req.file.path : null;
  try {
    const result = await renderShortformVideo(scenes, { durationPerScene, bgmPath });
    res.json({
      ...result,
      note: "AI 성우 음성이나 이미지 확대·축소 애니메이션은 아직 없는 '고정 템플릿' 버전입니다 — 자세한 내용은 README를 참고하세요.",
    });
  } catch (err) {
    res.status(500).json({ error: "render_failed", message: err.message });
  } finally {
    if (bgmPath) fs.unlink(bgmPath, () => {});
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    lastFetchedAt: cache.getLatest()?.fetchedAt || null,
    lastError: cache.getError(),
  });
});

app.get("/", (req, res) => {
  res.type("text/plain").send("우수리미 트렌드 API가 실행 중입니다. GET /api/trends 를 호출해 보세요.");
});

async function refresh() {
  try {
    const data = await fetchGoogleTrendsKR();
    cache.setLatest(data);
    console.log(`[${new Date().toISOString()}] 트렌드 갱신 완료 — ${data.items.length}건`);
  } catch (err) {
    cache.setError(err);
    console.error(`[${new Date().toISOString()}] 트렌드 갱신 실패:`, err.message);
  }
}

// 서버가 켜지자마자 1회 즉시 수집하고, 이후 정해진 주기로 반복합니다.
refresh();
cron.schedule(REFRESH_CRON, refresh);

app.listen(PORT, () => {
  console.log(`우수리미 트렌드 API 서버 실행 중 — http://localhost:${PORT}`);
  console.log(`갱신 주기: ${REFRESH_CRON} (cron 표현식)`);
});
