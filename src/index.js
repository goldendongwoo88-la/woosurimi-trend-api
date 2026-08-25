// override: true — 이 프로젝트의 .env 파일 값이 항상 우선하게 합니다. 기본값(override
// 없음)은 이미 시스템/셸에 같은 이름의 환경변수가 있으면 .env 값을 무시하는데, 실제로
// 이 개발 환경에 예전에 다른 용도로 설정해둔 ELEVENLABS_API_KEY가 남아있어서, .env에
// 새 키를 넣어도 계속 예전 키가 쓰이는 문제를 겪었습니다.
require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { fetchGoogleTrendsKR } = require("./trendSource");
const { findOpportunities, CATEGORY_SEEDS } = require("./opportunityFinder");
const { searchRecentNews, searchMergedNews, getBuzzNews, attachImages } = require("./naverNewsSearch");
const { planShortform, planFromPhotos } = require("./shortformPlanner");
const { renderShortformVideo, FRAME_STYLES } = require("./videoRenderer");
const { recommendBgm, getTrackPath } = require("./bgmLibrary");
const { recommendTemplates, TEMPLATES } = require("./videoTemplates");
const { getProviderStatus } = require("./voiceProvider");
const { CATEGORIES: BLOG_CATEGORIES, getTrendTopics, generateDraft, getWriterStatus } = require("./blogWriter");
const { getTools: getPromptTools, runTool: runPromptTool } = require("./promptStudio");
const cardNewsGenerator = require("./cardNewsGenerator");
const stockPhotoSearch = require("./stockPhotoSearch");
const { extractPageData } = require("./pageExtractor");
const instagramAuth = require("./instagramAuth");
const instagramPublish = require("./instagramPublish");
const QRCode = require("qrcode");
const cache = require("./cache");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024 } }); // BGM 업로드용, 최대 15MB

// "자동컷" 모드용 — 사용자가 직접 고른 사진들을 public/uploads/shortform/<잡ID>/ 에
// 저장해서, 렌더링 때 정적 파일 경로(/uploads/...)로 바로 접근할 수 있게 합니다.
const PHOTO_UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads", "shortform");
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req._photoJobId) req._photoJobId = crypto.randomUUID();
    const dir = path.join(PHOTO_UPLOADS_DIR, req._photoJobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const uploadPhotos = multer({ storage: photoStorage, limits: { fileSize: 15 * 1024 * 1024, files: 12 } });

// "AI 자동화 글쓰기" 모드용 — 초안에 넣을 이미지(5~8장)를 public/uploads/blog/<잡ID>/ 에 저장합니다.
const BLOG_UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads", "blog");
const blogImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req._blogJobId) req._blogJobId = crypto.randomUUID();
    const dir = path.join(BLOG_UPLOADS_DIR, req._blogJobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});
const uploadBlogImages = multer({ storage: blogImageStorage, limits: { fileSize: 15 * 1024 * 1024, files: 8 } });

// "AI 카드뉴스 생성" 모드용 — 페이지별 배경 사진(선택)을 임시로 받아둡니다. 사진이 없는
// 페이지는 스타일 그라디언트 배경으로 대신 렌더링됩니다.
const cardUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 15 * 1024 * 1024, files: 8 } });

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
app.use("/bgm", express.static(path.join(__dirname, "..", "assets", "bgm"))); // 배경음악 미리듣기/렌더링용 정적 파일

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

// 숏폼 자동 제작 "링크컷" 모드 — 블로그 글 링크, 브랜드/쇼핑 커넥트 링크, 여행 커넥트
// 링크를 넣으면, 그 페이지에 실제로 있는 사진과 본문 문장으로 장면(씬)별 기획안(대본)을
// 자동으로 짜줍니다. 이 단계는 대본/장면 "기획"만 만듭니다 — 실제 mp4 영상은 아래
// /api/shortform/recommend(5개 추천) 또는 /api/shortform/render가 만듭니다.
// POST /api/shortform/plan  body: { "url": "https://...", "source": "blog" | "shopping" | "travel" }
app.post("/api/shortform/plan", async (req, res) => {
  const { url, source } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "missing_url", message: "블로그 글, 쇼핑 커넥트, 또는 여행 커넥트 URL을 보내주세요." });
  }
  const normalizedSource = ["shopping", "travel"].includes(source) ? source : "blog";

  try {
    const plan = await planShortform(url, normalizedSource);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: "fetch_failed", message: err.message });
  }
});

// 숏폼 자동 제작 "자동컷" 모드 — 링크 없이, 사용자가 직접 고른 사진들(과 한 줄 주제)로
// 장면 기획안을 짭니다. multipart/form-data 로 보내주세요:
//   - photos: 사진 파일 여러 장 (최대 12장, 각 15MB 이하)
//   - topic: 영상 주제를 한 줄로 (필수)
//   - source: (선택) "blog" | "shopping" | "travel" — 후킹/CTA 문구 톤만 다르게
//   - summaryText: (선택) 본문 요약 문단 — 사진 순서에 맞춰 문장을 매칭해서, 아래 이미지 인식
//     AI에게 "본문 맥락"으로 함께 전달함(사진 내용과 자연스럽게 이어지는 캡션을 쓰도록)
//   - captions: (선택) JSON 배열 문자열 — photos와 같은 순서로 사진별 캡션을 직접 지정
// 캡션을 직접 안 넣은 사진은 이미지 인식 AI(Claude Vision, imageCaption.js)가 사진을 실제로
// 보고 자동으로 캡션을 만듭니다(ANTHROPIC_API_KEY 필요 — 없으면 본문 문장/일반 문구로 대체).
app.post("/api/shortform/plan-from-photos", uploadPhotos.array("photos", 12), async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ error: "missing_photos", message: "사진을 최소 1장 이상 업로드해 주세요." });
  }
  const topic = (req.body.topic || "").trim();
  if (!topic) {
    return res.status(400).json({ error: "missing_topic", message: "영상 주제를 한 줄로 입력해 주세요." });
  }
  const source = ["shopping", "travel"].includes(req.body.source) ? req.body.source : "blog";

  let captions = [];
  if (req.body.captions) {
    try {
      captions = JSON.parse(req.body.captions);
      if (!Array.isArray(captions)) captions = [];
    } catch {
      captions = [];
    }
  }

  const jobId = req._photoJobId;
  const photos = files.map((f, i) => ({
    url: `/uploads/shortform/${jobId}/${path.basename(f.path)}`,
    caption: captions[i] || "",
  }));

  try {
    const plan = await planFromPhotos(photos, topic, { source, summaryText: req.body.summaryText || "" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: "plan_failed", message: err.message });
  }
});

// 대본(scenes)의 캡션 텍스트를 보고, 미리 준비된 배경음악 5종(assets/bgm) 중
// 어울리는 순서로 정렬해서 전부 추천해줍니다. 사용자가 그중 하나를 골라서
// /api/shortform/render 호출 시 bgmId로 넘기면 최종 mp4에 삽입됩니다.
// POST /api/shortform/bgm-suggestions  body: { "scenes": [...] }
app.post("/api/shortform/bgm-suggestions", (req, res) => {
  const scenes = Array.isArray(req.body?.scenes) ? req.body.scenes : [];
  const tracks = recommendBgm(scenes);
  res.json({
    note: "우수리미가 자체 제작한(저작권 걱정 없는) 심플 배경음 5종입니다. 대본 내용을 보고 어울리는 순서로 정렬했어요.",
    tracks,
  });
});

// 대본(scenes)의 캡션 텍스트를 보고, src/videoTemplates.js에 있는 자막 디자인 5종을
// 어울리는 순서로 정렬해서 전부 추천해줍니다(캡컷의 "템플릿 고르기"와 비슷한 기능).
// POST /api/shortform/template-suggestions  body: { "scenes": [...] }
app.post("/api/shortform/template-suggestions", (req, res) => {
  const scenes = Array.isArray(req.body?.scenes) ? req.body.scenes : [];
  const templates = recommendTemplates(scenes);
  res.json({
    note: "대본 내용을 보고 어울리는 자막 디자인 순서로 정렬했어요. 어떤 걸 골라도 실제 영상에 그대로 적용됩니다.",
    templates,
  });
});

// 이 서버에 AI 성우(TTS) API 키가 실제로 설정되어 있는지 알려줍니다. 키가 없는
// 제공자를 선택해도 렌더링 자체는 실패하지 않고, 나레이션만 빠진 채로 만들어집니다.
app.get("/api/shortform/voice-providers", (req, res) => {
  res.json({ providers: getProviderStatus() });
});

// 사진 프레임 스타일 목록 — "polaroid"(하얀 테두리 포토카드, 기본값) | "full"(화면 꽉 채우기).
// /api/shortform/render 호출 시 frameStyle로 넘기면 적용됩니다.
app.get("/api/shortform/frame-styles", (req, res) => {
  res.json({ frameStyles: FRAME_STYLES });
});

// 캡컷 "자동컷"처럼, 대본(scenes) 하나로 "템플릿 + 배경음악 + 성우 목소리" 조합
// 여러 개를 AI가 알아서 짜서, 각각 짧은 미리보기 영상으로 만들어 보여줍니다. 사용자는
// 그중 마음에 드는 걸 골라서 /api/shortform/render 를 그 조합(templateId/bgmId/
// voiceProvider) 그대로 호출하면 완성도 높은 최종 영상이 나옵니다.
// - 미리보기는 속도를 위해 앞부분 최대 2개 장면 + 장면당 1.3초 + 크로스페이드 없이
//   하드컷 + 나레이션 없이 렌더링합니다(실제 전환 효과·목소리는 최종 렌더링에서 확인).
// - ⚠️ 한 요청 안에서 5개를 다 만들면, 무료 서버에선 시간이 오래 걸려 Render 프록시가
//   먼저 연결을 끊어버립니다(그러면 브라우저에 빈 응답이 와서 "Unexpected end of JSON
//   input" 오류가 납니다 — 실제로 겪었습니다). 그래서 recipeIndex를 받아 "한 번에 한 개씩"
//   만들 수 있게 했고, 화면에서는 5번 나눠 불러서 완성되는 대로 하나씩 보여줍니다.
// POST /api/shortform/recommend  body: { "scenes": [...], "recipeIndex": 0 }
//   recipeIndex를 주면 그 번호 조합 하나만 만들어 { recipe } 로 돌려줍니다.
//   안 주면 예전처럼 여러 개를 순서대로 만들되, 프록시 타임아웃 전에 끊고 돌려줍니다.
app.post("/api/shortform/recommend", async (req, res) => {
  const scenes = Array.isArray(req.body?.scenes) ? req.body.scenes : [];
  if (!scenes.length) {
    return res.status(400).json({ error: "missing_scenes", message: "scenes 배열이 비어 있습니다. 먼저 plan(-from-photos)을 호출해 주세요." });
  }

  const templates = recommendTemplates(scenes); // 이미 어울리는 순서로 정렬됨
  const bgmTracks = recommendBgm(scenes); // 이미 어울리는 순서로 정렬됨
  const providerStatus = getProviderStatus();
  const readyProviders = Object.entries(providerStatus)
    .filter(([, v]) => v.ready)
    .map(([key, v]) => ({ provider: key, label: v.label }));

  const previewScenes = scenes.slice(0, 2); // 미리보기는 앞부분 최대 2장면만
  const frameStyle = FRAME_STYLES.some((f) => f.id === req.body.frameStyle) ? req.body.frameStyle : "full";
  const hookText = (req.body.hookText || "").trim();
  const RECIPE_COUNT = 5;

  // 조합 하나를 만드는 공통 함수 — recipeIndex 방식과 예전 방식이 같이 씁니다.
  async function buildRecipe(i) {
    const template = templates[i % templates.length];
    const bgm = bgmTracks[i % bgmTracks.length];
    const voiceChoice = readyProviders.length ? readyProviders[i % readyProviders.length] : null;

    let previewPath = null;
    let previewError = null;
    try {
      const result = await renderShortformVideo(previewScenes, {
        durationPerScene: 2,
        bgmPath: getTrackPath(bgm.id),
        animate: false, // 켄번즈(zoompan)는 CPU를 많이 먹어서 미리보기에선 끕니다
        voice: null, // 미리보기는 속도를 위해 나레이션 없이 만듭니다
        templateId: template.id,
        frameStyle,
        hookText,
        fastConcat: true, // 미리보기는 크로스페이드 없이 하드컷으로(훨씬 빠름)
        encodePreset: "ultrafast",
      });
      previewPath = result.publicPath;
    } catch (err) {
      previewError = err.message;
    }

    return {
      recipeId: `recipe-${i + 1}`,
      templateId: template.id,
      templateLabel: template.label,
      bgmId: bgm.id,
      bgmLabel: bgm.label,
      voiceProvider: voiceChoice ? voiceChoice.provider : null,
      voiceLabel: voiceChoice ? voiceChoice.label : "나레이션 없음 (AI 성우 키 미설정)",
      previewUrl: previewPath ? `${req.protocol}://${req.get("host")}${previewPath}` : null,
      previewError,
    };
  }

  // ① 한 개만 만들어 달라고 한 경우(화면에서 5번 나눠 부르는 기본 방식)
  const requestedIndex = Number(req.body.recipeIndex);
  if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < RECIPE_COUNT) {
    try {
      const recipe = await buildRecipe(requestedIndex);
      return res.json({ recipe, recipeCount: RECIPE_COUNT, voiceProvidersReady: readyProviders });
    } catch (err) {
      return res.status(500).json({ error: "recommend_failed", message: err.message });
    }
  }

  // ② 예전 방식(한 번에 여러 개) — 외부에서 그냥 호출했을 때를 위해 남겨둡니다.
  // 무료 서버의 프록시가 오래 걸리는 요청을 끊어버리므로, 그 전에 안전하게 멈춥니다.
  const DEADLINE_MS = Number(process.env.RECOMMEND_DEADLINE_MS || 40000);
  const startedAt = Date.now();
  const recipes = [];
  let timedOut = false;
  for (let i = 0; i < RECIPE_COUNT; i++) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      timedOut = true;
      break;
    }
    recipes.push(await buildRecipe(i));
  }

  res.json({
    note: timedOut
      ? `서버가 바빠서 ${recipes.length}개까지만 미리보기를 완성했어요. 마음에 드는 조합을 고르거나, 아래 "직접 설정해서 만들기"에서 원하는 템플릿·음악을 직접 골라 최종 영상을 만들어도 돼요.`
      : "여러 조합(자막 템플릿+배경음악+성우 목소리)을 AI가 자동으로 짜서 짧게 미리보기를 만들었습니다. 마음에 드는 조합을 고르면 그 설정 그대로 최종 영상을 만들 수 있어요. 미리보기는 속도를 위해 앞부분 일부 장면·짧은 길이·나레이션 없이 만들어졌습니다.",
    voiceProvidersReady: readyProviders,
    recipes,
  });
});

// /api/shortform/plan으로 만든 scenes를 실제 mp4 영상 파일로 렌더링합니다.
// ffmpeg로 서버에서 직접 합성합니다 — 사진마다 켄번즈(확대·축소) 애니메이션과 자막을
// 입히고, 장면과 장면 사이는 하드컷이 아니라 xfade/acrossfade로 부드럽게 겹쳐 넘어가도록
// 이어붙인 뒤, 배경음악(직접 업로드한 mp3 또는 추천 라이브러리 중 선택한 곡)을 전체
// 길이에 맞춰 함께 입힙니다. AI 성우 목소리(provider)를 지정하면 장면별 나레이션도
// TTS로 만들어서 입힙니다(해당 서비스 API 키가 서버에 설정된 경우).
// multipart/form-data 로 보내주세요:
//   - scenes: JSON 문자열(배열) — /api/shortform/plan 응답의 scenes 그대로
//   - durationPerScene: (선택) 장면당 초 — 기본 3 (나레이션이 더 길면 자동으로 늘어남)
//   - bgm: (선택) 직접 업로드하는 mp3/오디오 파일 — 있으면 이게 우선
//   - bgmId: (선택) 추천 라이브러리 트랙 id (예: "calm-piano") — bgm 파일이 없을 때 사용
//   - animate: (선택) "false"를 주면 켄번즈 애니메이션 없이 정지 사진으로 만듦 (기본 true)
//   - frameStyle: (선택) "polaroid"(기본, 하얀 테두리 포토카드+흐린 확대 배경) | "full"(화면 꽉 채우기)
//   - voiceProvider: (선택) "clova" | "typecast" | "elevenlabs" | "azure"
//   - voiceId: (선택) 서비스별 목소리 식별자
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

  const animate = req.body.animate !== "false";
  const uploadedBgmPath = req.file ? req.file.path : null;
  const libraryBgmPath = !uploadedBgmPath && req.body.bgmId ? getTrackPath(req.body.bgmId) : null;
  const bgmPath = uploadedBgmPath || libraryBgmPath;

  const voiceProvider = ["clova", "typecast", "elevenlabs", "azure"].includes(req.body.voiceProvider) ? req.body.voiceProvider : null;
  const voice = voiceProvider ? { provider: voiceProvider, voiceId: req.body.voiceId || null } : null;
  const templateId = TEMPLATES.some((t) => t.id === req.body.templateId) ? req.body.templateId : "bold-black";
  const frameStyle = FRAME_STYLES.some((f) => f.id === req.body.frameStyle) ? req.body.frameStyle : "full";
  const hookText = (req.body.hookText || "").trim();

  try {
    const result = await renderShortformVideo(scenes, { durationPerScene, bgmPath, animate, voice, templateId, frameStyle, hookText });

    // 방금 만든 영상의 "진짜 인터넷 주소"를 QR 코드로 만들어서, 휴대폰 카메라로
    // 바로 찍어 다운로드 페이지로 이동할 수 있게 해줍니다.
    const absoluteUrl = `${req.protocol}://${req.get("host")}${result.publicPath}`;
    const qrDataUrl = await QRCode.toDataURL(absoluteUrl, { width: 260, margin: 1 });

    let narrationNote = null;
    if (voice && !result.narration.used) {
      narrationNote = `AI 성우 음성이 빠진 채로 만들어졌습니다 — ${result.narration.failedReason || "API 키가 설정되지 않았습니다"}. README의 "AI 성우 API 연동" 부분을 참고해서 환경변수를 등록해 주세요.`;
    } else if (voice && result.narration.used) {
      narrationNote = `${result.narration.scenesWithVoice}/${scenes.length}개 장면에 AI 성우 나레이션이 삽입되었습니다.`;
    }

    res.json({
      ...result,
      videoUrl: absoluteUrl,
      qrDataUrl,
      narrationNote,
      note: `사진 ${frameStyle === "polaroid" ? "포토카드(하얀 테두리+흐린 확대 배경)" : "화면 꽉 채우기"} + 켄번즈 애니메이션 + 장면 간 크로스페이드 전환 + 자막 + 배경음악(+선택 시 AI 나레이션)이 들어간 실제 mp4 영상입니다. 무료 서버(Render)는 재시작되면 이 파일이 사라질 수 있으니 바로 다운로드해 두세요.`,
    });
  } catch (err) {
    res.status(500).json({ error: "render_failed", message: err.message });
  } finally {
    if (uploadedBgmPath) fs.unlink(uploadedBgmPath, () => {});
  }
});

// ===================== 최종 영상: 오래 걸리는 작업이라 "비동기 작업" 방식 =====================
// ⚠️ 무료 Render 서버에서 7장면 + 나레이션 영상을 만들면 2~4분이 걸리는데, Render 프록시는
// 그보다 먼저(실측 161초) 연결을 끊고 502를 돌려줍니다. 그래서 위 /render(한 방에 끝내는
// 방식)만으로는 무료 서버에서 최종 영상을 못 만듭니다.
// 대신 여기서는 "작업만 시작하고 바로 응답 → 화면이 주기적으로 진행상황을 물어보는" 방식을
// 씁니다. 서버는 백그라운드에서 계속 렌더링하므로 프록시가 끊어도 작업은 살아있습니다.
//
// ⚠️ 작업 정보는 메모리에만 두므로 서버가 재시작되면 사라집니다(무료 서버는 유휴 상태에서
// 잠들 수 있음). 완성된 mp4는 public/renders에 남으니, 주소만 알면 계속 받을 수 있습니다.
const renderJobs = new Map();
const RENDER_JOB_TTL_MS = 60 * 60 * 1000; // 1시간 지난 작업 기록은 정리

function cleanupOldRenderJobs() {
  const now = Date.now();
  for (const [id, job] of renderJobs) {
    if (now - job.createdAt > RENDER_JOB_TTL_MS) renderJobs.delete(id);
  }
}

// POST /api/shortform/render-job — /api/shortform/render와 완전히 같은 입력을 받고,
// 곧바로 { jobId }를 돌려줍니다. 진행상황은 아래 GET으로 확인하세요.
app.post("/api/shortform/render-job", upload.single("bgm"), (req, res) => {
  let scenes;
  try {
    scenes = JSON.parse(req.body.scenes || "[]");
  } catch {
    return res.status(400).json({ error: "invalid_scenes", message: "scenes 필드가 올바른 JSON이 아닙니다." });
  }
  if (!Array.isArray(scenes) || !scenes.length) {
    return res.status(400).json({ error: "missing_scenes", message: "scenes 배열이 비어 있습니다. 먼저 /api/shortform/plan을 호출해 주세요." });
  }
  if (scenes.length > 12) {
    return res.status(400).json({ error: "too_many_scenes", message: "장면은 최대 12개까지만 지원합니다." });
  }

  const durationPerScene = Number(req.body.durationPerScene) > 0 ? Number(req.body.durationPerScene) : 3;
  const animate = req.body.animate !== "false";
  const uploadedBgmPath = req.file ? req.file.path : null;
  const libraryBgmPath = !uploadedBgmPath && req.body.bgmId ? getTrackPath(req.body.bgmId) : null;
  const bgmPath = uploadedBgmPath || libraryBgmPath;
  const voiceProvider = ["clova", "typecast", "elevenlabs", "azure"].includes(req.body.voiceProvider) ? req.body.voiceProvider : null;
  const voice = voiceProvider ? { provider: voiceProvider, voiceId: req.body.voiceId || null } : null;
  const templateId = TEMPLATES.some((t) => t.id === req.body.templateId) ? req.body.templateId : "bold-black";
  const frameStyle = FRAME_STYLES.some((f) => f.id === req.body.frameStyle) ? req.body.frameStyle : "full";
  const hookText = (req.body.hookText || "").trim();
  const origin = `${req.protocol}://${req.get("host")}`;

  cleanupOldRenderJobs();
  const jobId = crypto.randomUUID();
  renderJobs.set(jobId, { status: "running", createdAt: Date.now(), result: null, error: null });

  // 응답을 먼저 보내고(프록시가 기다리지 않도록), 렌더링은 뒤에서 계속 진행합니다.
  res.json({ jobId, status: "running", note: "영상을 만들기 시작했어요. 진행상황은 이 jobId로 확인하세요." });

  (async () => {
    try {
      const result = await renderShortformVideo(scenes, { durationPerScene, bgmPath, animate, voice, templateId, frameStyle, hookText });
      const absoluteUrl = `${origin}${result.publicPath}`;
      const qrDataUrl = await QRCode.toDataURL(absoluteUrl, { width: 260, margin: 1 });

      let narrationNote = null;
      if (voice && !result.narration.used) {
        narrationNote = `AI 성우 음성이 빠진 채로 만들어졌습니다 — ${result.narration.failedReason || "API 키가 설정되지 않았습니다"}.`;
      } else if (voice && result.narration.used) {
        narrationNote = `${result.narration.scenesWithVoice}/${scenes.length}개 장면에 AI 성우 나레이션이 삽입되었습니다.`;
      }

      const job = renderJobs.get(jobId);
      if (job) {
        job.status = "done";
        job.result = {
          ...result,
          videoUrl: absoluteUrl,
          qrDataUrl,
          narrationNote,
          note: `사진 ${frameStyle === "polaroid" ? "포토카드" : "세로 꽉 채우기"} + 자막(상단 후킹 + 하단 멘트) + 배경음악(+선택 시 AI 나레이션)이 들어간 실제 mp4 영상입니다. 무료 서버(Render)는 재시작되면 이 파일이 사라질 수 있으니 바로 다운로드해 두세요.`,
        };
      }
    } catch (err) {
      const job = renderJobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.error = err.message;
      }
    } finally {
      if (uploadedBgmPath) fs.unlink(uploadedBgmPath, () => {});
    }
  })();
});

// GET /api/shortform/render-job/:jobId — { status: running | done | failed, result?, error? }
app.get("/api/shortform/render-job/:jobId", (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      error: "job_not_found",
      message: "그 작업을 찾을 수 없어요. 서버가 재시작되면 진행 기록이 사라집니다 — 영상 만들기를 다시 눌러 주세요.",
    });
  }
  res.json({
    status: job.status,
    elapsedSec: Math.round((Date.now() - job.createdAt) / 1000),
    result: job.result,
    error: job.error,
  });
});

// ===================== 링크로 콘텐츠 만들기 =====================
// 링크 하나를 넣으면 그 페이지의 실제 제목/설명/사진을 미리 보여주는 허브 기능입니다.
// 이 자체로 콘텐츠를 만들지는 않고, 미리보기 후 "블로그 글" / "카드뉴스" / "숏폼 영상" 중
// 원하는 형식으로 넘어가면 각 기능이 이 URL을 그대로 받아(sourceUrl 파라미터) 실제 내용을
// 다시 가져와서 만듭니다 — pageExtractor.js를 그대로 재사용합니다(코드/개념 중복 방지).
app.get("/api/link-content/preview", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "missing_url", message: "url 쿼리 파라미터가 필요합니다." });
  }
  try {
    const page = await extractPageData(url);
    res.json({
      url,
      title: page.title,
      description: page.description,
      bodyTextSnippet: (page.bodyText || "").slice(0, 400),
      wordCount: (page.bodyText || "").length,
      images: (page.images || []).slice(0, 12),
    });
  } catch (err) {
    res.status(400).json({ error: "preview_failed", message: err.message });
  }
});

// ===================== AI 자동화 글쓰기 =====================
// 오른쪽 화면에 주제별(네이버 홈판 유력 / 여행 커넥트 / 쇼핑 커넥트) 카테고리를 보여주고,
// 실시간 트렌드 주제를 고르면(또는 직접 입력하면) 초안(제목+본문+이미지)을 만들어줍니다.
// ⚠️ 실제 문장을 새로 "창작"하는 LLM API는 아직 연동되어 있지 않아서(어떤 서비스를 쓸지는
// 비용 문제가 있어 사용자 결정이 필요합니다 — README 참고), 초안은 진짜 트렌드 데이터로
// 고른 주제를 바탕으로 "빈칸만 채우면 되는 글쓰기 틀"을 짜는 방식으로 동작합니다.
// 또한 실제 네이버 블로그로 "한 번에 자동 발행"하는 기능은 네이버 블로그 API/로그인 정보가
// 필요해서(보안상 사용자의 로그인 정보를 직접 다룰 수 없어) 지원하지 않고, 그 대신 초안을
// 클립보드에 복사해서 사용자의 실제 블로그 글쓰기 화면으로 바로 이동시켜주는 방식으로
// 만들었습니다. 자세한 내용은 README를 참고해 주세요.

app.get("/api/blog/categories", (req, res) => {
  res.json({ categories: BLOG_CATEGORIES });
});

const BLOG_TOPICS_TTL_MS = Number(process.env.BLOG_TOPICS_TTL_MS || 10 * 60 * 1000);
const blogTopicsCache = new Map();

// 네이버 API가 순간적으로 막히거나(레이트리밋) 일부 후보만 실패해도 items가 0개로
// 돌아올 수 있습니다. 그 "실패한 빈 결과"를 그대로 캐시에 저장해버리면, 진짜 데이터가
// 있는데도 TTL(10분)이 끝날 때까지 계속 빈 목록만 보여주게 됩니다 — 그래서 items가
// 있을 때만 캐시에 저장하고, 비어있으면 저장하지 않고 다음 요청/예열 때 다시 시도합니다.
function isCacheable(data) {
  return !!(data && data.items && data.items.length > 0);
}

// GET /api/blog/topics?category=food_review|travel_review|info_post|intro_promo|it_review|biz_economy|beauty_fashion|daily_hobby
app.get("/api/blog/topics", async (req, res) => {
  const category = req.query.category || "info_post";
  const cached = blogTopicsCache.get(category);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ category, cached: true, ...cached.data });
  }
  try {
    const data = await getTrendTopics(category, 20);
    if (isCacheable(data)) blogTopicsCache.set(category, { data, expiresAt: Date.now() + BLOG_TOPICS_TTL_MS });
    res.json({ category, cached: false, ...data });
  } catch (err) {
    res.status(400).json({ error: "fetch_failed", message: err.message });
  }
});

// 카테고리 하나가 처음 조회될 때(캐시 미스) 네이버 API를 여러 개 불러와야 해서 몇
// 초씩 걸릴 수 있습니다. 사용자가 카테고리를 바꿀 때마다 그 지연을 겪지 않도록, 서버가
// 켜질 때와 캐시 만료 주기에 맞춰 8개 카테고리를 미리(백그라운드에서) 데워둡니다.
// 카테고리끼리는 순서대로, 그리고 사이에 간격을 두고 데워서(카테고리 내부는 이미
// opportunityFinder.js에서 적당히 병렬 처리되므로, 카테고리 8개를 쉬지 않고 곧바로
// 이어붙이면 네이버 API 쪽에서 짧은 시간에 너무 많은 요청으로 보고 막을 수 있습니다).
const WARM_GAP_MS = 1000;
async function warmBlogTopicsCache() {
  for (const c of BLOG_CATEGORIES) {
    const cached = blogTopicsCache.get(c.id);
    if (cached && cached.expiresAt > Date.now()) continue;
    try {
      const data = await getTrendTopics(c.id, 20);
      if (isCacheable(data)) blogTopicsCache.set(c.id, { data, expiresAt: Date.now() + BLOG_TOPICS_TTL_MS });
    } catch (err) {
      console.error(`[blogTopicsCache] "${c.id}" 예열 실패:`, err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, WARM_GAP_MS));
  }
}

// 이 서버에 Claude API 키(ANTHROPIC_API_KEY)가 설정되어 있는지 알려줍니다. 키가 없어도
// /api/blog/draft 자체는 실패하지 않고, 실제 문장 대신 "빈칸만 채우면 되는 글쓰기 틀"로
// 자동 대체됩니다.
app.get("/api/blog/writer-status", (req, res) => {
  res.json(getWriterStatus());
});

// --- 인스타그램(Meta) 계정 연동 ---
// "인스타그램 연결하기" 버튼이 이 주소로 이동하면 Meta 로그인 화면으로 리다이렉트합니다.
app.get("/api/instagram/connect", (req, res) => {
  try {
    const url = instagramAuth.getAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).send(`연동 준비 실패: ${e.message}`);
  }
});

// Meta 로그인 완료 후 돌아오는 콜백. 페이지 액세스 토큰 + 인스타그램 비즈니스 계정
// 정보를 저장하고, 결과를 사람이 읽을 수 있는 간단한 안내 페이지로 보여줍니다.
app.get("/api/instagram/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.status(400).send(`<h2>연동 취소/실패</h2><p>${error_description || error}</p>`);
  }
  try {
    const connected = await instagramAuth.handleCallback(code, state);
    const list = connected.map((c) => `<li>@${c.igUsername} (페이지: ${c.pageName})</li>`).join("");

    // Render 무료 플랜은 재배포/재시작 때 디스크가 초기화되므로, 이 값을 환경변수에
    // 넣어두지 않으면 다음 배포 때 연동이 통째로 풀립니다.
    const envValue = instagramAuth.getAccountsJson();
    const alreadyPersisted = !!process.env.IG_ACCOUNTS_JSON;

    res.send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>인스타그램 연동 완료</title>
<style>
  body { font-family: "Malgun Gothic", sans-serif; line-height:1.6; max-width:760px; margin:40px auto; padding:0 20px; }
  textarea { width:100%; height:120px; font-family:monospace; font-size:12px; }
  .warn { background:#fff8e1; border:1px solid #e0c34d; padding:12px 16px; border-radius:6px; }
  .ok { background:#e8f5e9; border:1px solid #81c784; padding:12px 16px; border-radius:6px; }
  code { background:#eee; padding:2px 5px; border-radius:3px; }
</style></head><body>
<h2>인스타그램 연동 완료 ✅</h2>
<ul>${list}</ul>
${
  alreadyPersisted
    ? `<div class="ok">이미 <code>IG_ACCOUNTS_JSON</code> 환경변수를 쓰고 있어요. 토큰을 새로 발급한 경우에만 아래 값으로 갱신하면 됩니다.</div>`
    : `<div class="warn">
         <b>한 번만 더 해주세요 — 안 하면 다음 배포 때 연동이 풀립니다.</b><br/>
         무료 서버는 재배포·재시작할 때 저장된 파일이 지워져요. 아래 값을 Render 대시보드
         → Environment에 <code>IG_ACCOUNTS_JSON</code> 이름으로 등록해두면, 그 뒤로는 다시
         연결할 필요가 없습니다.
       </div>`
}
<p style="margin-top:20px;"><b>환경변수 값</b> (아래 상자를 클릭하면 전체 선택돼요)</p>
<textarea readonly onclick="this.select()">${envValue.replace(/</g, "&lt;")}</textarea>
<p style="color:#a33;font-size:13px;">⚠️ 이 값에는 계정 액세스 토큰이 들어 있습니다. 다른 사람에게 공유하지 마세요.</p>
<p>이 창은 닫으셔도 됩니다.</p>
</body></html>`);
  } catch (e) {
    res.status(500).send(`<h2>연동 실패</h2><p>${e.message}</p>`);
  }
});

// 현재 연동된 인스타그램 계정 목록 (액세스 토큰은 응답에 포함하지 않음)
app.get("/api/instagram/accounts", (req, res) => {
  res.json({ configured: instagramAuth.isConfigured(), accounts: instagramAuth.listAccounts() });
});

// 오늘 남은 게시 가능 횟수 (인스타그램은 24시간에 50개 제한)
app.get("/api/instagram/publishing-limit", async (req, res) => {
  const { igUsername } = req.query;
  if (!igUsername) {
    return res.status(400).json({ error: "missing_username", message: "igUsername 쿼리 파라미터가 필요합니다." });
  }
  try {
    res.json(await instagramPublish.getPublishingLimit(igUsername));
  } catch (e) {
    res.status(500).json({ error: "limit_failed", message: e.message });
  }
});

// --- 인스타그램 자동 게시 ---
// 게시는 (특히 릴스가) 몇 분씩 걸릴 수 있어서, 영상 렌더링과 같은 비동기 잡 패턴을 씁니다:
// 여기서는 jobId만 바로 돌려주고, 실제 게시는 뒤에서 진행합니다.
//
// POST /api/instagram/publish-job
// body(JSON): {
//   igUsername: "golden__k_",
//   kind: "image" | "carousel" | "reel",
//   caption: "본문 문구",
//   imageUrl:  (kind=image)    "/renders/cardnews/<jobId>/page1.png",
//   imageUrls: (kind=carousel) ["/renders/.../page1.png", ...]  // 2~10장
//   videoUrl:  (kind=reel)     "/renders/xxx.mp4",
//   coverUrl:  (kind=reel, 선택) 커버 이미지
// }
app.post("/api/instagram/publish-job", (req, res) => {
  const { igUsername, kind, caption, imageUrl, imageUrls, videoUrl, coverUrl, shareToFeed } = req.body || {};

  if (!igUsername) {
    return res.status(400).json({ error: "missing_username", message: "igUsername이 필요합니다." });
  }
  if (!["image", "carousel", "reel"].includes(kind)) {
    return res.status(400).json({ error: "bad_kind", message: "kind는 image / carousel / reel 중 하나여야 합니다." });
  }
  if (kind === "image" && !imageUrl) {
    return res.status(400).json({ error: "missing_image", message: "imageUrl이 필요합니다." });
  }
  if (kind === "carousel" && (!Array.isArray(imageUrls) || imageUrls.length < 2)) {
    return res.status(400).json({ error: "missing_images", message: "캐러셀은 imageUrls가 2장 이상이어야 합니다." });
  }
  if (kind === "reel" && !videoUrl) {
    return res.status(400).json({ error: "missing_video", message: "videoUrl이 필요합니다." });
  }

  cleanupOldRenderJobs();
  const jobId = crypto.randomUUID();
  renderJobs.set(jobId, { status: "running", createdAt: Date.now(), result: null, error: null, phase: "준비 중" });

  res.json({
    jobId,
    status: "running",
    note:
      kind === "reel"
        ? "릴스는 인스타그램이 영상을 인코딩하는 시간이 필요해서 1~3분 정도 걸립니다."
        : "게시 중입니다. 보통 10~30초면 끝납니다.",
  });

  (async () => {
    try {
      let result;
      if (kind === "image") {
        result = await instagramPublish.publishImage({ igUsername, imageUrl, caption });
      } else if (kind === "carousel") {
        result = await instagramPublish.publishCarousel({ igUsername, imageUrls, caption });
      } else {
        result = await instagramPublish.publishReel({
          igUsername,
          videoUrl,
          caption,
          coverUrl,
          shareToFeed: shareToFeed !== false,
          onProgress: (code) => {
            const job = renderJobs.get(jobId);
            if (job) job.phase = `인스타그램에서 영상 처리 중 (${code})`;
          },
        });
      }

      const job = renderJobs.get(jobId);
      if (job) {
        job.status = "done";
        job.phase = "완료";
        job.result = { ...result, igUsername, kind };
      }
    } catch (err) {
      const job = renderJobs.get(jobId);
      if (job) {
        job.status = "failed";
        job.error = err.message;
      }
    }
  })();
});

// GET /api/instagram/publish-job/:jobId — { status: running | done | failed, phase, result?, error? }
app.get("/api/instagram/publish-job/:jobId", (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      error: "job_not_found",
      message: "그 작업을 찾을 수 없어요. 서버가 재시작되면 진행 기록이 사라집니다 — 다시 시도해 주세요.",
    });
  }
  res.json({
    status: job.status,
    phase: job.phase,
    elapsedSec: Math.round((Date.now() - job.createdAt) / 1000),
    result: job.result,
    error: job.error,
  });
});

// 초안 생성. multipart/form-data로 보내주세요:
//   - topic: 주제(필수 — sourceUrl을 안 쓸 때만. 트렌드 목록에서 고르거나 직접 입력)
//   - category: "food_review" | "travel_review" | "info_post" | "intro_promo" | "it_review" | "biz_economy" | "beauty_fashion" | "daily_hobby"
//   - mode: "text"(글만) | "text_images"(글+이미지, 첫 이미지가 자동으로 썸네일이 됨)
//   - images: (mode가 text_images일 때) 이미지 파일 5~8장
//   - sourceUrl: (선택, "링크로 콘텐츠 만들기" 기능용) 있으면 topic 대신 이 URL의 실제
//     내용(제목/본문)을 가져와 그걸 바탕으로 초안을 씁니다. mode가 text_images인데 이미지를
//     안 올렸으면 원문 페이지의 실제 사진을 대신 씁니다.
// 서버에 ANTHROPIC_API_KEY가 설정되어 있으면 Claude API로 실제 문장을 생성하고,
// 없거나 호출이 실패하면 자동으로 "빈칸(✏️)만 채우면 되는 글쓰기 틀"로 대체됩니다.
app.post("/api/blog/draft", uploadBlogImages.array("images", 8), async (req, res) => {
  const { topic, category, mode, sourceUrl } = req.body || {};
  const files = req.files || [];
  const jobId = req._blogJobId;
  const images = files.map((f) => ({ url: `/uploads/blog/${jobId}/${path.basename(f.path)}` }));

  try {
    const draft = await generateDraft({ topic, category, mode, images, sourceUrl: sourceUrl || undefined });
    res.json(draft);
  } catch (err) {
    res.status(400).json({ error: "draft_failed", message: err.message });
  }
});

// ===================== AI 카드뉴스 생성 =====================
// 주제를 넣으면 1) Claude API로 페이지별 제목/본문 대본을 짜고(generatePlan), 2) 그
// 대본을 sharp로 실제 PNG 카드 이미지로 렌더링합니다(renderCardNewsSet). 두 단계로
// 나눈 이유는 AI 자동화 글쓰기와 같습니다 — 렌더링(이미지 생성) 전에 사용자가 대본
// 텍스트를 먼저 검토/수정할 수 있게 하기 위해서입니다.

app.get("/api/cardnews/styles", (req, res) => {
  res.json({
    styles: cardNewsGenerator.getStyles(),
    layouts: cardNewsGenerator.getLayouts(),
    aspectRatios: cardNewsGenerator.getAspectRatios(),
  });
});

// 레이아웃·팔레트를 고를 때마다 실제로 어떻게 나오는지 바로 보여주는 미리보기입니다.
// 예시 문장 하나로 그 조합을 렌더링해서 PNG 그대로 돌려줍니다(파일로 저장하지 않음).
// GET /api/cardnews/preview?layoutId=stack&styleId=midnight-purple&ratio=4:5
app.get("/api/cardnews/preview", async (req, res) => {
  try {
    const buf = await cardNewsGenerator.renderPreviewBuffer({
      styleId: req.query.styleId,
      layoutId: req.query.layoutId,
      ratio: req.query.ratio,
    });
    res.set("Cache-Control", "no-store");
    res.type("png").send(buf);
  } catch (err) {
    res.status(400).json({ error: "preview_failed", message: err.message });
  }
});

// 배경 사진을 다양하게 고를 수 있도록, 무료 스톡 사진(Pexels)을 검색합니다.
app.get("/api/cardnews/stock-photos-status", (req, res) => {
  res.json({ ready: stockPhotoSearch.isConfigured() });
});

app.get("/api/cardnews/stock-photos", async (req, res) => {
  try {
    const photos = await stockPhotoSearch.searchPhotos(req.query.query || "");
    res.json({ query: req.query.query, photos });
  } catch (err) {
    res.status(400).json({ error: "search_failed", message: err.message });
  }
});

app.get("/api/cardnews/generator-status", (req, res) => {
  res.json(cardNewsGenerator.getGeneratorStatus());
});

// POST /api/cardnews/plan  body: { topic, pageCount, sourceUrl }
// sourceUrl: (선택, "링크로 콘텐츠 만들기" 기능용) 있으면 topic 대신 이 URL의 실제 내용을
// 가져와 대본을 씁니다. 응답에 sourceImages(원문 실제 사진 URL 목록)가 함께 옵니다.
app.post("/api/cardnews/plan", async (req, res) => {
  const { topic, pageCount, sourceUrl } = req.body || {};
  try {
    const plan = await cardNewsGenerator.generatePlan({ topic, pageCount, sourceUrl: sourceUrl || undefined });
    const recommendedStyles = cardNewsGenerator.recommendStyles(plan.topic || topic || "");
    res.json({ ...plan, recommendedStyles });
  } catch (err) {
    res.status(400).json({ error: "plan_failed", message: err.message });
  }
});

// 대본(plan, 사용자가 수정했을 수도 있음)을 실제 카드 이미지(PNG) 세트로 렌더링합니다.
// multipart/form-data로 보내주세요:
//   - plan: JSON 문자열 — { topic, pages: [{role,title,body}] } (/api/cardnews/plan 응답을 그대로 또는 수정해서)
//   - styleId, layoutId, ratio: (선택) 스타일/레이아웃/비율 id — 기본 midnight-purple, stack, 4:5
//   - images: (선택) 페이지 순서에 맞춰 배경으로 쓸 사진 파일들(직접 업로드) — imagePageIndexes와 짝을 맞춰서 보내주세요
//   - imagePageIndexes: (선택) JSON 배열 — images의 각 파일이 몇 번째 페이지(0부터)용인지
//   - imagePageUrls: (선택) JSON 객체 — { "페이지번호": "스톡 사진 URL" } (/api/cardnews/stock-photos에서 고른 사진)
//     업로드 파일과 스톡 URL이 같은 페이지에 동시에 오면 업로드 파일이 우선합니다.
app.post("/api/cardnews/render", cardUpload.array("images", 8), async (req, res) => {
  let plan;
  try {
    plan = JSON.parse(req.body.plan || "{}");
  } catch {
    return res.status(400).json({ error: "invalid_plan", message: "plan 필드가 올바른 JSON이 아닙니다." });
  }
  const files = req.files || [];
  let pageIndexes = [];
  try {
    pageIndexes = JSON.parse(req.body.imagePageIndexes || "[]");
  } catch {
    pageIndexes = [];
  }
  let pageUrls = {};
  try {
    pageUrls = JSON.parse(req.body.imagePageUrls || "{}");
  } catch {
    pageUrls = {};
  }
  // 사진이 있는 페이지만 그 페이지 번호에 맞춰 채우고, 나머지는 null로 비워둡니다
  // (renderCardNewsSet은 images[i]가 없으면 스타일 그라디언트 배경으로 그립니다).
  const pageCount = Array.isArray(plan.pages) ? plan.pages.length : 0;
  const images = new Array(pageCount).fill(null);
  Object.entries(pageUrls).forEach(([idx, url]) => {
    const i = Number(idx);
    if (Number.isInteger(i) && i >= 0 && i < pageCount && typeof url === "string" && url) images[i] = url;
  });
  files.forEach((f, i) => {
    const targetIndex = pageIndexes[i];
    if (Number.isInteger(targetIndex) && targetIndex >= 0 && targetIndex < pageCount) {
      images[targetIndex] = f.path; // 업로드 파일이 스톡 사진 URL보다 우선
    }
  });
  const allPaths = files.map((f) => f.path);

  try {
    const result = await cardNewsGenerator.renderCardNewsSet(plan, {
      styleId: req.body.styleId,
      layoutId: req.body.layoutId,
      ratio: req.body.ratio,
      images,
    });
    res.json({
      ...result,
      note: "카드뉴스 이미지가 완성되었습니다. 무료 서버(Render)는 재시작되면 이 파일이 사라질 수 있으니 바로 다운로드해 두세요.",
    });
  } catch (err) {
    res.status(500).json({ error: "render_failed", message: err.message });
  } finally {
    allPaths.forEach((p) => fs.unlink(p, () => {}));
  }
});

// ===================== 맞춤형 글쓰기 프롬프트 (챗봇 카드 모음) =====================
// 첨부해 주신 "머니대외비" 글쓰기프롬프트 화면처럼, 역할별 챗봇 카드 목록과 실행 API입니다.

app.get("/api/prompt-studio/tools", (req, res) => {
  res.json({ tools: getPromptTools() });
});

// POST /api/prompt-studio/run
// body: { toolId: "google-seo", messages: [{ role: "user", content: "..." }, ...] }
// messages는 그 카드 안에서 이어지는 대화 기록을 그대로 보내주세요(멀티턴 챗봇처럼 동작).
app.post("/api/prompt-studio/run", async (req, res) => {
  const { toolId, messages } = req.body || {};
  if (!toolId) {
    return res.status(400).json({ error: "missing_tool", message: "toolId가 필요합니다." });
  }
  try {
    const reply = await runPromptTool(toolId, messages);
    res.json({ reply });
  } catch (err) {
    res.status(400).json({ error: "run_failed", message: err.message });
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

// 블로그 카테고리 트렌드도 마찬가지로 서버 시작 시 1회 예열하고, 캐시 TTL과 같은
// 주기로 다시 예열합니다(둘 다 시간이 걸리는 백그라운드 작업이라 await 없이 그냥
// 실행만 시켜두고 서버 시작을 막지 않습니다).
warmBlogTopicsCache();
cron.schedule(`*/${Math.max(1, Math.round(BLOG_TOPICS_TTL_MS / 60000))} * * * *`, warmBlogTopicsCache);

app.listen(PORT, () => {
  console.log(`우수리미 트렌드 API 서버 실행 중 — http://localhost:${PORT}`);
  console.log(`갱신 주기: ${REFRESH_CRON} (cron 표현식)`);
});
