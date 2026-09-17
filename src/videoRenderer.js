// 숏폼 기획안(scenes)을 받아서 실제 mp4 영상 파일로 렌더링하는 모듈입니다.
// ffmpeg(ffmpeg-static 패키지로 함께 설치되는 실행 파일, 별도 설치 필요 없음)를 직접
// 호출해서 만듭니다.
//
// 처리 순서:
//   1) 각 장면(scene)의 사진을 내려받는다 (사진이 없으면 어두운 배경색으로 대신함)
//   2) (선택) 장면 대사를 AI 성우 목소리(TTS)로 미리 만들어 둔 mp3가 있으면 그 길이에
//      맞춰 장면 길이를 늘린다 — 목소리가 잘리지 않도록
//   3) 장면마다 "사진 + 자막(자동 줄바꿈) + 나레이션(또는 무음) + 애니메이션" 짧은 영상
//      조각을 만든다. frameStyle이 "polaroid"(기본값)이면 사진을 하얀 테두리 카드로 두고
//      배경은 같은 사진을 흐리게 확대해서 채우는 "포토카드" 스타일로 만들고(요즘 캡컷
//      감성 숏폼에서 흔히 쓰는 스타일), "full"이면 예전처럼 사진을 화면 전체에 꽉 채운다.
//   4) 조각들을 순서대로 이어 붙인다 — 첫 장면 시작과 마지막 장면 끝에만 검은 화면에서
//      페이드 인/아웃을 넣고, 장면과 장면 사이는 하드컷이 아니라 xfade/acrossfade로
//      부드럽게 크로스페이드(겹쳐 넘어가는) 전환을 넣는다.
//   5) 배경음악(BGM)이 있으면, 나레이션(또는 무음) 위에 볼륨을 낮춰 함께 믹싱한다
//
// 자막 디자인은 src/videoTemplates.js에 정의된 5가지 템플릿(색상/박스/위치 조합) 중
// 하나를 골라 적용합니다.
//
// ⚠️ 이 모듈은 "사용자가 고른 사진들"을 가지고 슬라이드/카드 스타일 영상을 자동으로
// 합성하는 도구입니다 — 사람이 직접 들고 찍은 "실제 촬영 영상(움직이는 손, 셀카 각도
// 변화 등)"을 새로 만들어내는 기능은 아닙니다. 그런 느낌을 원하면 사용자가 촬영한
// 영상 클립을 소재로 쓰는 기능이 필요한데, 아직 지원하지 않습니다(README 참고).

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { getTemplate } = require("./videoTemplates");
const { buildAss } = require("./assSubtitle");
const { getEffect, transitionAt, tiltAt, DEFAULT_EFFECT_ID } = require("./videoEffects");

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 25;
const FADE_SEC = 0.4; // 영상 맨 처음/맨 끝에만 쓰는 검은 화면 페이드
const TRANSITION_SEC = 0.35; // 장면과 장면 사이 크로스페이드 전환 길이
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const RENDERS_DIR = path.join(__dirname, "..", "public", "renders");

/**
 * 오래된 영상을 치웁니다.
 *
 * ⚠️ 만든 영상이 쌓이기만 하고 아무도 안 지우고 있었습니다.
 * 하루 몇 편씩 만들면 며칠 만에 디스크가 찹니다.
 *
 * ⚠️ 시간으로만 지우면 안 됩니다. 사장님이 방금 만든 걸 아직 안 받으셨을 수 있어요.
 * 그래서 **6시간이 지났고, 그러면서 용량이 넘칠 때만** 오래된 것부터 지웁니다.
 * 급하지 않으면 그냥 둡니다.
 */
const KEEP_HOURS = 6;
const KEEP_MB = 400;

function sweepOldRenders() {
  try {
    if (!fs.existsSync(RENDERS_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(RENDERS_DIR)
      .filter((f) => /\.(mp4|mov|webm)$/i.test(f))
      .map((f) => {
        const p = path.join(RENDERS_DIR, f);
        const st = fs.statSync(p);
        return { p, mtime: st.mtimeMs, mb: st.size / 1048576 };
      })
      .sort((a, b) => a.mtime - b.mtime);   // 오래된 것부터

    let totalMb = files.reduce((a, f) => a + f.mb, 0);
    for (const f of files) {
      const oldEnough = now - f.mtime > KEEP_HOURS * 3600 * 1000;
      if (!oldEnough) break;                 // 정렬돼 있으니 여기서부터는 다 최근입니다
      if (totalMb <= KEEP_MB) break;         // 넉넉하면 굳이 지우지 않습니다
      try { fs.unlinkSync(f.p); totalMb -= f.mb; } catch {}
    }
  } catch {
    // ⚠️ 치우다 실패해도 영상 만드는 건 계속돼야 합니다.
  }
}
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// "포토카드(폴라로이드)" 스타일 치수 — 720x1280 화면 기준으로 넉넉하게 잡되, 자막이
// 들어갈 아래쪽 여백은 남겨둡니다.
const CARD_CONTENT_W = 640;
const CARD_CONTENT_H = 980;
const CARD_BORDER = 20;
const CARD_W = CARD_CONTENT_W + CARD_BORDER * 2;
const CARD_H = CARD_CONTENT_H + CARD_BORDER * 2;
const CARD_Y_OFFSET = 55; // 화면 정중앙보다 이만큼(px) 위로 올려서 아래쪽 자막 공간 확보

// 목록 맨 앞이 화면(드롭다운)의 기본 선택값이 됩니다 — 숏폼은 세로 화면을 꽉 채우는
// 게 기본이라 "full"을 앞에 둡니다.
const FRAME_STYLES = [
  {
    id: "full",
    label: "세로 꽉 채우기 (숏폼 기본)",
    description: "사진을 9:16 세로 화면에 여백 없이 꽉 채워요 — 유튜브 쇼츠/릴스에 올릴 때 기본으로 쓰는 방식이에요.",
  },
  {
    id: "polaroid",
    label: "포토카드(폴라로이드)",
    description: "사진을 하얀 테두리 카드로 두고, 배경은 같은 사진을 흐리게 확대해서 채워요 — 감성 브이로그 느낌을 낼 때 써보세요.",
  },
  {
    id: "whitecard",
    label: "화이트카드",
    description: "밝은 회백색 배경 위에 하얀 카드를 그림자와 함께 올려요 — 제품컷을 깔끔하게 넘길 때 써보세요.",
  },
  {
    id: "letterbox",
    label: "시네마 레터박스",
    description: "위아래에 검은 띠를 넣고 사진을 가운데 띠에만 보여줘요 — 진중한 이야기나 사주 콘텐츠에 어울려요.",
  },
];

// 화이트카드 스타일의 배경색 — 순백(#FFFFFF)으로 두면 하얀 카드가 배경에 묻혀서
// 경계가 안 보입니다. 아주 살짝 회색을 섞어야 카드가 떠 보입니다.
const WHITECARD_BG = "0xF2F2F4";

// 레터박스에서 사진이 보이는 가운데 띠 높이입니다. 참고 영상에서 사진이 화면 높이의
// 대략 60%를 차지했습니다(1280 × 0.6 ≈ 768).
const LETTERBOX_BAND_H = 768;

// execFile은 기본적으로 시간 제한이 없어서, ffmpeg가 어떤 이유로든(예: 손상된 입력
// 파일, 예상 못한 인코더 문제) 멈춰버리면 이 Promise가 영영 끝나지 않고 그 위의
// 호출부(장면 렌더링 → 미리보기 5개 순서대로 생성 등) 전체가 몇 분이고 멈춰 있게
// 됩니다. timeout을 걸어서, 정말 멈춘 경우엔 에러로 실패 처리되고 다음 단계로 넘어갈
// 수 있게(또는 사용자에게 실패로 보여줄 수 있게) 합니다.
const FFMPEG_TIMEOUT_MS = 90000;

// ffmpeg가 쓸 스레드 수입니다.
//
// 예전에 Render 무료 플랜(CPU 0.1개)을 쓸 때는 이 값을 1로 묶어둬야 했습니다. ffmpeg가
// 기본값대로 CPU를 최대한 끌어쓰면 Node가 CPU를 못 받아 헬스체크(5초 안에 응답)에 실패하고,
// 60초 이상 실패하면 Render가 인스턴스를 통째로 재시작해 버렸거든요(실제로 렌더링 도중
// 서버가 죽고 작업이 사라졌습니다).
//
// 지금은 Starter 플랜(CPU 0.5개)이라 여유가 생겨서 2로 올렸습니다. 0으로 두면 ffmpeg가
// 알아서 최대한 쓰는데, 그러면 다시 Node가 굶을 수 있어서 일부러 상한을 둡니다.
// 더 큰 플랜으로 올리면 FFMPEG_THREADS 환경변수로 더 높여도 됩니다.
const FFMPEG_THREADS = process.env.FFMPEG_THREADS || "2";

function runFfmpeg(args) {
  // -threads는 입력 옵션보다 앞에 두어도 전역으로 적용됩니다.
  const withThreads = ["-threads", FFMPEG_THREADS, ...args];
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, withThreads, { maxBuffer: 1024 * 1024 * 100, timeout: FFMPEG_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || "").toString().split("\n").slice(-25).join("\n");
        const reason = err.killed ? `ffmpeg가 ${FFMPEG_TIMEOUT_MS / 1000}초 안에 끝나지 않아 중단했습니다.` : tail || err.message;
        return reject(new Error(`ffmpeg 처리 중 오류가 발생했습니다: ${reason}`));
      }
      resolve();
    });
  });
}

// ffprobe를 따로 설치하지 않고, ffmpeg -i 만으로 stderr에 찍히는 "Duration: hh:mm:ss.xx"
// 줄을 읽어서 오디오/영상 길이(초)를 알아냅니다 (출력 파일을 안 주면 에러로 끝나지만,
// Duration 줄은 에러 전에 이미 찍혀 있어서 그걸 파싱하면 됩니다).
function probeDurationSeconds(filePath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-i", filePath], { maxBuffer: 1024 * 1024 * 20, timeout: 15000 }, (err, stdout, stderr) => {
      const text = (stderr || "").toString();
      const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      resolve(Number.isFinite(seconds) ? seconds : null);
    });
  });
}

// ffmpeg 필터 문자열 안에 경로를 넣을 때는 백슬래시(윈도우 경로)와 콜론(드라이브 문자,
// 필터 옵션 구분자)을 이스케이프해야 깨지지 않습니다.
function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// 자막이 화면을 다 가리지 않도록, 문장을 통째로 한 화면에 우겨넣지 않고 "짧은 줄 단위"로
// 잘라둡니다(글자 손실 없이 전부 담기고, 아래 buildCaptionCues가 이걸 2줄씩 순서대로
// 보여줍니다).
function wrapCaptionLines(text, maxCharsPerLine = 12) {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// wrapCaptionLines로 나눈 줄들을 linesPerChunk(기본 2줄)씩 묶어서, 장면 하나 안에서
// "2줄 보여주고 → 다음 2줄 보여주고" 식으로 순서대로 넘어가도록 자막 덩어리를 만듭니다.
function buildCaptionChunks(text, linesPerChunk = 2, maxCharsPerLine = 12) {
  const lines = wrapCaptionLines(text, maxCharsPerLine);
  const chunks = [];
  for (let i = 0; i < lines.length; i += linesPerChunk) {
    chunks.push(lines.slice(i, i + linesPerChunk).join("\n"));
  }
  return chunks.length ? chunks : [""];
}

// 자막 덩어리 하나당 최소 이 정도(초)는 보여야 읽을 수 있다고 보고, 장면 길이가
// 너무 짧으면(나레이션도 없고 durationPerScene도 짧으면) 이 값을 기준으로 늘려줍니다.
const MIN_SECONDS_PER_CAPTION_CHUNK = 1.4;

// 상단 후킹 문구는 하단 자막보다 글자가 커서, 한 줄에 들어가는 글자 수가 더 적습니다.
const HOOK_MAX_CHARS_PER_LINE = 12;

// 후킹 문구를 그냥 순서대로 줄바꿈하면 마지막 줄에 "6종" 같은 한 단어만 덩그러니
// 남아 3줄이 되어버립니다(참고 영상은 항상 2줄). 그래서 두 줄로 나눌 때는 양쪽 길이가
// 최대한 비슷해지는 지점에서 끊습니다.
function wrapHookLines(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= HOOK_MAX_CHARS_PER_LINE) return [clean];

  const words = clean.split(" ");
  let best = null;
  // 단어 사이 어디서 끊을지 전부 따져보고, 두 줄 길이 차이가 가장 작은 곳을 고릅니다.
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(" ");
    const second = words.slice(i).join(" ");
    const longest = Math.max(first.length, second.length);
    const diff = Math.abs(first.length - second.length);
    // 한 줄 한도를 넘는 후보는 크게 감점해서 되도록 피합니다.
    const penalty = longest > HOOK_MAX_CHARS_PER_LINE ? 100 + longest : 0;
    const score = diff + penalty;
    if (!best || score < best.score) best = { score, lines: [first, second] };
  }
  return best ? best.lines : wrapCaptionLines(clean, HOOK_MAX_CHARS_PER_LINE);
}

function estimateMinDurationForCaption(text) {
  return buildCaptionChunks(text).length * MIN_SECONDS_PER_CAPTION_CHUNK;
}

// duration(초) 동안 chunks를 순서대로 균등하게 나눠 보여주는 .srt 내용을 만듭니다.
/**
 * 대본에 *별표*로 표시된 부분을 강조색으로 바꿉니다.
 *
 * ⚠️ 요즘 한국 숏폼의 가장 큰 특징입니다. 자막 한 줄을 통째로 같은 색으로 쓰는
 * 경우가 거의 없고, 핵심 단어 한둘만 색을 바꿔서 눈이 거기 먼저 가게 만듭니다.
 * 소리를 끄고 보는 사람이 많아서, 색이 바뀐 단어만 훑어도 내용이 전달되게 하는
 * 장치입니다.
 *
 * libass는 자막 안에서 {\c&HBBGGRR&} 로 색을 바꿉니다. 바꾼 뒤에는 {\c} 로
 * 되돌려야 그다음 글자가 원래 색으로 나옵니다.
 */
function applyEmphasis(text, accentColour) {
  const s = String(text == null ? "" : text);
  if (!accentColour) return s.replace(/\*([^*\n]+)\*/g, "$1");
  return s.replace(/\*([^*\n]+)\*/g, (_, word) => "{\\c" + accentColour + "&}" + word + "{\\c}");
}

/** 장면 자막을 .ass 이벤트 목록으로. */
function buildCaptionEvents(text, duration, accent) {
  const chunks = buildCaptionChunks(text);
  if (!chunks.length) return [];
  const per = duration / chunks.length;
  return chunks.map((chunk, i) => ({
    start: i * per,
    end: i === chunks.length - 1 ? duration : (i + 1) * per,
    style: "Body",
    // 자막이 툭 튀어나왔다 툭 사라지면 딱딱합니다. 살짝 흐려지며 들어오게 합니다.
    text: `{\\fad(150,100)}${applyEmphasis(chunk, accent)}`,
  }));
}

function buildCaptionSrt(text, duration, opts) {
  const { accent = null, fade = true } = opts || {};
  const chunks = buildCaptionChunks(text);
  const perChunk = duration / chunks.length;
  let srt = "";
  chunks.forEach((chunk, i) => {
    const start = i * perChunk;
    const end = i === chunks.length - 1 ? duration : (i + 1) * perChunk;
    // 자막이 툭 튀어나왔다 툭 사라지면 딱딱합니다. 살짝 흐려지며 들어오게 합니다.
    const anim = fade ? "{\\fad(150,100)}" : "";
    srt += `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${anim}${applyEmphasis(chunk, accent)}\n\n`;
  });
  return srt;
}

// 같은 사진을 여러 번 내려받지 않도록 임시 폴더에 캐시해 둡니다.
// "AI 추천 5개"는 똑같은 장면 2개를 자막 디자인만 바꿔 5번 렌더링하는데, 캐시가 없으면
// 같은 사진을 10번(2장 × 5회) 다시 내려받게 됩니다. 무료 서버는 네트워크도 느려서
// 이게 미리보기 생성 시간의 상당 부분을 차지했습니다.
const IMAGE_CACHE_DIR = path.join(os.tmpdir(), "woosurimi-img-cache");

async function downloadToFileCached(url) {
  if (!fs.existsSync(IMAGE_CACHE_DIR)) fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
  let ext = ".jpg";
  try {
    ext = path.extname(new URL(url).pathname) || ".jpg";
  } catch {
    /* 확장자를 못 알아내면 .jpg로 두고 진행 — ffmpeg는 내용을 보고 형식을 판단합니다 */
  }
  const key = crypto.createHash("sha1").update(url).digest("hex");
  const cachePath = path.join(IMAGE_CACHE_DIR, `${key}${ext}`);
  // 이미 받아둔 게 있으면 그대로 씁니다(0바이트로 깨진 캐시는 무시하고 다시 받습니다).
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) return cachePath;
  const ok = await downloadToFile(url, cachePath);
  return ok ? cachePath : null;
}

async function downloadToFile(url, destPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; woosurimi-trend-api/1.0)" },
    });
    if (!res.ok) throw new Error(`상태 코드 ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (err) {
    return false; // 실패하면 호출부에서 배경색으로 대신 처리
  } finally {
    clearTimeout(timer);
  }
}

function srtTimestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const msPart = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${msPart}`;
}

// 사진을 targetW x targetH 크기로 "꽉 채워" 자르는 필터(비율이 안 맞아도 여백 없이 채움).
function buildCoverCropFilter(targetW, targetH) {
  return `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${targetW}:${targetH}`;
}

// 장면 인덱스에 따라 "확대"와 "축소"를 번갈아 적용하고, 팬도 가로 한 방향이 아니라
// 대각선(좌상/좌하/우상/우하) 네 방향을 돌아가며 써서 장면마다 다른 느낌의 켄번즈
// (Ken Burns) 애니메이션 필터를 만듭니다. width/height는 이 필터가 최종적으로 출력할
// 크기(예: 배경은 화면 전체, 카드는 카드 안쪽 크기)입니다.
function buildKenBurnsFilter(index, duration, { width, height, maxZoom = 1.18, driftRatio = 0.07 } = {}) {
  const totalFrames = Math.max(Math.round(duration * FPS), 1);
  const rate = (maxZoom - 1) / totalFrames;
  const zoomIn = index % 2 === 0;
  // dirX/dirY를 서로 다른 주기로 순환시켜서(4칸 주기를 한 칸 어긋나게) 확대/축소
  // 여부와 상관없이 대각선 방향이 장면마다 다양하게 나오도록 합니다.
  const dirX = index % 4 < 2 ? 1 : -1;
  const dirY = (index + 1) % 4 < 2 ? 1 : -1;
  const driftPxX = Math.round(width * driftRatio);
  const driftPxY = Math.round(height * driftRatio * 0.6); // 세로는 화면비 특성상 살짝 덜 흔들리게

  // z='...' 처럼 필터 옵션 값을 작은따옴표로 감쌌기 때문에, 그 안의 쉼표(,)는
  // 필터 구분자로 해석되지 않고 그대로 문자로 들어갑니다 — 따로 이스케이프하지 않습니다.
  const zExpr = zoomIn
    ? `min(zoom+${rate.toFixed(6)},${maxZoom})`
    : `if(eq(on,0),${maxZoom},max(zoom-${rate.toFixed(6)},1.0))`;
  const xExpr = `(iw-iw/zoom)/2+(${dirX}*${driftPxX}*on/${totalFrames})`;
  const yExpr = `(ih-ih/zoom)/2+(${dirY}*${driftPxY}*on/${totalFrames})`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${width}x${height}:fps=${FPS}`;
}

// 사진 한 장을 targetW x targetH로 채운 뒤, animate가 true면 켄번즈 애니메이션까지
// 적용하는 필터 체인(배열)을 만듭니다. 배경 레이어/카드 레이어에 공통으로 씁니다.
// grade: 효과팩이 지정한 색보정 필터 문자열(예: "eq=contrast=1.16:saturation=1.34").
// 켄번즈로 확대한 "뒤"에 걸어야 합니다 — 앞에 걸면 확대 전 큰 이미지 전체를 보정하느라
// 쓸데없이 느려집니다.
function buildLayerFilters({ animate, sceneIndex, duration, targetW, targetH, maxZoom, driftRatio, grade = null }) {
  const base = animate
    ? [
        buildCoverCropFilter(Math.round(targetW * 1.3), Math.round(targetH * 1.3)),
        buildKenBurnsFilter(sceneIndex, duration, { width: targetW, height: targetH, maxZoom, driftRatio }),
      ]
    : [buildCoverCropFilter(targetW, targetH)];
  return grade ? [...base, grade] : base;
}

/**
 * 카드를 살짝 기울입니다(캡컷 포토카드 효과의 핵심 — 반듯하면 손으로 놓은 느낌이 안 납니다).
 *
 * ⚠️ rotate 필터는 회전하면서 생긴 네 귀퉁이를 채울 색이 필요한데, 기본값이 검정입니다.
 * 그대로 두면 하얀 카드 주변에 검은 삼각형이 생깁니다. c=none(투명)으로 두고 그 전에
 * format=rgba로 알파 채널을 만들어 줘야 배경이 비칩니다.
 * ow/oh도 키워주지 않으면 회전한 모서리가 잘려 나갑니다.
 */
function buildTiltFilters(deg) {
  if (!deg) return [];
  const rad = (deg * Math.PI) / 180;
  const a = rad.toFixed(5);
  return ["format=rgba", `rotate=${a}:c=none:ow=rotw(${a}):oh=roth(${a})`];
}

// ⚠️ 이 static ffmpeg 빌드에는 drawtext 필터가 빠져 있어서(라이선스 이유로 종종 제외됨),
// 대신 libass 기반의 subtitles 필터로 자막을 입힙니다. .srt 자막 파일을 하나 만들고
// fontsdir로 우리가 프로젝트에 넣어둔 한글 폰트(assets/fonts)를 직접 지정해서 씁니다.
//
// narrationPath가 있으면 그 오디오를 장면의 소리로 쓰고, 없으면 무음(anullsrc)을 같은
// 길이로 채워 넣습니다 — 모든 장면 조각의 오디오 스트림 형식을 통일해야 나중에
// 이어붙이기(크로스페이드 또는 하드컷)가 문제없이 됩니다.
//
// fadeIn/fadeOut: true면 이 장면의 시작/끝에 검은 화면 페이드를 넣습니다. 여러 장면을
// 이어 붙일 때는 맨 처음 장면만 fadeIn=true, 맨 마지막 장면만 fadeOut=true로 주고
// 나머지는 둘 다 false로 둬서(장면 사이는 concatWithCrossfade가 자연스럽게 이어줌),
// 안에서 또 페이드가 겹쳐 어두워지는 걸 막습니다.
async function renderSceneSegment({
  imagePath,
  captionText,
  duration,
  outPath,
  sceneIndex = 0,
  animate = true,
  narrationPath = null,
  templateId = "bold-black",
  frameStyle = "full",
  effectId = DEFAULT_EFFECT_ID,
  hookText = "",
  encodePreset = "veryfast",
  fadeIn = true,
  fadeOut = true,
}) {
  // 자막 전체를 한 화면에 몰아넣지 않고, 2줄씩 순서대로 바뀌도록 여러 개의 자막
  // 구간(cue)으로 나눠서 만듭니다 — 글자가 잘리지 않으면서도 화면을 덜 가립니다.
  const template = getTemplate(templateId);

  // ⚠️ .srt가 아니라 .ass로 만듭니다.
  //
  // 핵심 단어만 색을 바꾸는 게 요즘 숏폼의 특징인데, .srt로는 안 됩니다.
  // {\c&H...&} 같은 색 태그를 넣어도 ffmpeg의 subrip 디코더가 중괄호를 이스케이프해
  // 버려서 그냥 사라집니다(렌더해서 확인했습니다 — 태그가 찍히지도 않고 색도 안 바뀜).
  // .ass는 그 태그가 원래 자기 문법이라 그대로 먹습니다.
  //
  // 겸사겸사 두 겹이던 자막 필터도 하나로 합쳤습니다. 예전엔 하단 자막용 .srt와
  // 상단 후킹용 .srt를 따로 만들어 subtitles 필터를 두 번 걸었는데, .ass는 한 파일에
  // 스타일을 여러 개 둘 수 있어서 필터 한 번이면 됩니다. 인코딩도 그만큼 가벼워집니다.
  const assFile = outPath.replace(/\.mp4$/, ".ass");
  const events = buildCaptionEvents(captionText, duration, template.accent);

  if (hookText && hookText.trim()) {
    events.push({
      start: 0,
      end: duration,
      style: "Hook",
      // 후킹은 시작 때 한 번만 부드럽게 들어오면 됩니다(끝은 그대로 유지).
      text: `{\\fad(250,0)}${applyEmphasis(wrapHookLines(hookText.trim()).join("\n"), template.accent)}`,
    });
  }

  fs.writeFileSync(assFile, buildAss({
    width: WIDTH,
    height: HEIGHT,
    styles: [
      { name: "Body", forceStyle: template.forceStyle },
      { name: "Hook", forceStyle: template.hookStyle },
    ],
    events,
  }), "utf8");

  const fontsDir = escapeFilterPath(path.dirname(FONT_PATH));
  const tempFiles = [assFile];
  const subtitles = `subtitles=filename='${escapeFilterPath(assFile)}':fontsdir='${fontsDir}'`;

  const fadeSteps = [];
  if (fadeIn) fadeSteps.push(`fade=t=in:st=0:d=${FADE_SEC}`);
  if (fadeOut) fadeSteps.push(`fade=t=out:st=${Math.max(duration - FADE_SEC, 0)}:d=${FADE_SEC}`);

  // ⚠️ 화면 구성을 정하는 순서 — 호출부가 frameStyle을 콕 집어 주면 그게 이깁니다.
  // 비워두거나 "auto"로 주면 효과팩이 정한 구성을 씁니다. 예전 호출부는 전부
  // frameStyle을 명시하고 있으니 동작이 바뀌지 않습니다.
  const effect = getEffect(effectId);
  const motion = effect.motion || {};
  const grade = effect.grade || null;
  const tiltDeg = tiltAt(effect, sceneIndex);
  const style = !frameStyle || frameStyle === "auto" ? effect.frame : frameStyle;

  // polaroid는 예전 이름, photocard는 효과팩에서 쓰는 이름 — 같은 화면입니다.
  const isCard = Boolean(imagePath) && ["polaroid", "photocard", "whitecard"].includes(style);
  const isLetterbox = Boolean(imagePath) && style === "letterbox";

  const audioArgs = narrationPath
    ? ["-i", narrationPath]
    : ["-f", "lavfi", "-t", String(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  const finalSteps = [subtitles, ...fadeSteps, "format=yuv420p"].join(",");

  if (isCard) {
    // === 카드 스타일: 하얀 테두리 카드(원본 사진) + 배경 ===
    // 배경이 두 가지입니다.
    //   · photocard — 같은 사진을 흐리게 확대해서 깔기(감성)
    //   · whitecard — 밝은 회백색 단색(제품컷을 깔끔하게)
    const flatBg = style === "whitecard";

    // 단색 배경은 여백이 넓어야 카드가 떠 보입니다. 사진 배경일 때보다 카드를 줄입니다.
    const contentW = flatBg ? 580 : CARD_CONTENT_W;
    const contentH = flatBg ? 880 : CARD_CONTENT_H;
    const border = flatBg ? 24 : CARD_BORDER;
    const cardW = contentW + border * 2;
    const cardH = contentH + border * 2;

    const bgFilters = buildLayerFilters({
      animate,
      sceneIndex,
      duration,
      targetW: WIDTH,
      targetH: HEIGHT,
      maxZoom: 1.2,
      driftRatio: 0.08,
    })
      .concat(["gblur=sigma=24", "eq=brightness=-0.08:saturation=0.85"])
      .join(",");

    const fgFilters = buildLayerFilters({
      animate,
      sceneIndex,
      duration,
      targetW: contentW,
      targetH: contentH,
      maxZoom: motion.maxZoom ?? 1.06,
      driftRatio: motion.driftRatio ?? 0.03,
      grade,
    })
      .concat([`pad=w=${cardW}:h=${cardH}:x=${border}:y=${border}:color=white`])
      .concat(buildTiltFilters(tiltDeg))
      .join(",");

    // 그림자도 카드와 같은 각도로 기울여야 따로 놀지 않습니다.
    const shadowFilters = [
      flatBg ? "boxblur=12:2" : "boxblur=16:2",
      "format=yuva420p",
      `colorchannelmixer=aa=${flatBg ? "0.26" : "0.4"}`,
    ]
      .concat(buildTiltFilters(tiltDeg))
      .join(",");

    const overlayY = `(H-h)/2-${CARD_Y_OFFSET}`;
    const shadowY = `(H-h)/2-${CARD_Y_OFFSET}+14`;
    const shadowX = `(W-w)/2+10`;

    const parts = [];
    if (flatBg) {
      // 사진을 배경으로 안 쓰니 split이 필요 없습니다 — 그만큼 디코딩도 한 번 덜 합니다.
      parts.push(`color=c=${WHITECARD_BG}:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}[bglayer]`);
      parts.push(`[0:v]${fgFilters}[card]`);
    } else {
      parts.push(`[0:v]split=2[fgsrc][bgsrc]`);
      parts.push(`[bgsrc]${bgFilters}[bglayer]`);
      parts.push(`[fgsrc]${fgFilters}[card]`);
    }
    parts.push(`[1:v]${shadowFilters}[shadow]`);
    parts.push(`[bglayer][shadow]overlay=x=${shadowX}:y=${shadowY}:format=auto[withshadow]`);
    parts.push(`[withshadow][card]overlay=x=(W-w)/2:y=${overlayY}:format=auto[merged]`);
    parts.push(`[merged]${finalSteps}[outv]`);

    const args = [
      "-y",
      "-loop", "1", "-t", String(duration), "-i", imagePath,
      "-f", "lavfi", "-t", String(duration), "-i", `color=c=black:s=${cardW}x${cardH}:r=${FPS}`,
      ...audioArgs,
      "-filter_complex", parts.join(";"),
      "-map", "[outv]",
      "-map", "2:a",
      "-c:v", "libx264",
      "-preset", encodePreset,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      // 나레이션 mp3는 장면 길이보다 짧을 수 있습니다. 예전엔 "-shortest"를 썼는데,
      // 그러면 장면 조각이 나레이션 길이만큼 짧게 잘려버려서 나중에 이어붙일 때
      // (xfade offset 계산이 계획한 길이 기준이라) 영상이 통째로 깨졌습니다.
      // 그래서 뒤를 무음으로 채우고(apad) 길이를 장면 길이로 못박습니다.
      "-af", "apad",
      "-t", String(duration),
      outPath,
    ];
    await runFfmpeg(args);
    tempFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    return;
  }

  if (isLetterbox) {
    // === 시네마 레터박스: 검은 화면 가운데 띠에만 사진 ===
    // ⚠️ 자막(MarginV 기준 아래에서 약 300px)이 아래쪽 검은 띠에 얹힙니다. 사진을 가리지
    // 않으면서 글자가 가장 잘 읽히는 배치라, 이 스타일에서는 오히려 장점입니다.
    const bandFilters = buildLayerFilters({
      animate,
      sceneIndex,
      duration,
      targetW: WIDTH,
      targetH: LETTERBOX_BAND_H,
      maxZoom: motion.maxZoom ?? 1.12,
      driftRatio: motion.driftRatio ?? 0.05,
      grade,
    }).join(",");

    const args = [
      "-y",
      "-loop", "1", "-t", String(duration), "-i", imagePath,
      ...audioArgs,
      "-filter_complex",
      [
        `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${duration}[bg]`,
        `[0:v]${bandFilters}[band]`,
        `[bg][band]overlay=x=0:y=(H-h)/2[merged]`,
        `[merged]${finalSteps}[outv]`,
      ].join(";"),
      "-map", "[outv]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", encodePreset,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-af", "apad",
      "-t", String(duration),
      outPath,
    ];
    await runFfmpeg(args);
    tempFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    return;
  }

  // === 예전 스타일("full"): 사진(또는 색상 배경)을 화면 전체에 꽉 채움 ===
  const fade = fadeSteps.join(",");
  let vf;
  if (imagePath && animate) {
    const layerFilters = buildLayerFilters({
      animate: true,
      sceneIndex,
      duration,
      targetW: WIDTH,
      targetH: HEIGHT,
      maxZoom: motion.maxZoom ?? 1.18,
      driftRatio: motion.driftRatio ?? 0.07,
      grade,
    });
    vf = [...layerFilters, subtitles, fade, "format=yuv420p"].filter(Boolean).join(",");
  } else if (imagePath) {
    vf = [buildCoverCropFilter(WIDTH, HEIGHT), grade, subtitles, fade, `fps=${FPS}`, "format=yuv420p"].filter(Boolean).join(",");
  } else {
    vf = [subtitles, fade, `fps=${FPS}`, "format=yuv420p"].filter(Boolean).join(",");
  }

  const inputArgs = imagePath
    ? ["-loop", "1", "-t", String(duration), "-i", imagePath]
    : ["-f", "lavfi", "-t", String(duration), "-i", `color=c=0x1c1c2b:s=${WIDTH}x${HEIGHT}:r=${FPS}`];

  const args = [
    "-y",
    ...inputArgs,
    ...audioArgs,
    "-vf", vf,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "libx264",
    "-preset", encodePreset,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    // (위 폴라로이드 분기와 같은 이유로) 오디오를 무음으로 채워 장면 길이를 고정합니다.
    "-af", "apad",
    "-t", String(duration),
    outPath,
  ];
  await runFfmpeg(args);
  tempFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
}

// 하드컷(그냥 순서대로 이어붙이기) — xfade 크로스페이드가 어떤 이유로든 실패했을 때만
// 안전하게 대체하는 용도로 남겨둡니다.
async function concatSegments(segmentPaths, outPath) {
  const listPath = outPath.replace(/\.mp4$/, ".list.txt");
  const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent, "utf8");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath]);
  fs.unlinkSync(listPath);
}

// 장면 조각들을 하드컷이 아니라 xfade(화면)/acrossfade(소리)로 부드럽게 겹쳐 넘어가도록
// 이어붙입니다. 반환값은 크로스페이드로 겹친 만큼 줄어든 실제 전체 길이(초)입니다.
// ⚠️ 예전에는 장면 파일을 전부 한 번에 열어(-i × N) xfade 필터 체인을 하나로 만들었습니다.
// 그러면 ffmpeg가 1080x1920 스트림 N개를 동시에 디코딩하느라 메모리를 많이 쓰는데,
// Render는 컨테이너 전체가 512MB라 장면이 5개만 돼도 ffmpeg가 그 한도를 넘겨서 서버가
// 통째로 재시작됐습니다(Node 자체는 118MB밖에 안 썼는데도 죽었습니다).
//
// 그래서 지금은 "두 개씩 차례로" 합칩니다. 한 번에 열리는 파일이 항상 2개뿐이라 장면이
// 몇 개든 메모리 사용량이 일정합니다. 대신 중간 결과가 여러 번 재인코딩되므로, 중간
// 파일만 crf 18(눈으로는 차이를 못 느끼는 수준)로 떠서 화질 손실을 막습니다.
// effect: 효과팩(videoEffects)을 주면 장면 경계마다 전환 효과를 번갈아 씁니다.
// 안 주면 예전처럼 전부 fade — 기존 호출부의 결과가 바뀌지 않습니다.
async function concatWithCrossfade(segmentPaths, durations, outPath, transitionSec = TRANSITION_SEC, effect = null) {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outPath);
    return durations[0];
  }

  const tmpDir = path.dirname(outPath);
  const tempFiles = [];
  let currentPath = segmentPaths[0];
  let cum = durations[0];

  try {
    for (let i = 1; i < segmentPaths.length; i++) {
      // 전환 길이가 짧은 장면보다 길면 안 되므로(그러면 offset이 음수가 되어 깨짐),
      // 두 장면 중 더 짧은 쪽 길이를 넘지 않게 안전하게 제한합니다.
      const t = Math.max(Math.min(transitionSec, durations[i - 1], durations[i]) - 0.001, 0.05);
      const offset = Math.max(cum - t, 0);
      const isLast = i === segmentPaths.length - 1;
      const stepOut = isLast ? outPath : path.join(tmpDir, `xfade-step-${i}.mp4`);
      if (!isLast) tempFiles.push(stepOut);

      // ⚠️ 여기서 쓰는 전환 이름이 이 ffmpeg 빌드에 없으면 렌더가 통째로 실패합니다.
      // videoEffects의 transitionAt이 목록에 없는 이름을 fade로 떨궈주므로 안전합니다.
      const transitionName = effect ? transitionAt(effect, i - 1) : "fade";

      await runFfmpeg([
        "-y",
        "-i", currentPath,
        "-i", segmentPaths[i],
        "-filter_complex",
        `[0:v][1:v]xfade=transition=${transitionName}:duration=${t.toFixed(3)}:offset=${offset.toFixed(3)}[v];` +
          `[0:a][1:a]acrossfade=d=${t.toFixed(3)}[a]`,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        // 중간 파일은 여러 번 다시 인코딩되므로 화질을 넉넉히 잡고, 최종 출력만 기본값을 씁니다.
        ...(isLast ? [] : ["-crf", "18"]),
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        stepOut,
      ]);

      cum = cum + durations[i] - t;

      // 직전 중간 파일은 더 안 쓰므로 바로 지워서 디스크도 아낍니다.
      if (currentPath !== segmentPaths[0] && currentPath !== outPath) {
        fs.unlink(currentPath, () => {});
      }
      currentPath = stepOut;
    }
  } catch (err) {
    tempFiles.forEach((f) => fs.existsSync(f) && fs.unlinkSync(f));
    throw err;
  }

  return cum;
}

// 기존 오디오(나레이션 또는 무음)와 배경음악(BGM)을 함께 믹싱합니다.
// BGM은 볼륨을 낮춰(0.28) 나레이션을 방해하지 않게 하고, 전체 길이에 맞춰 반복(loop)합니다.
async function muxBgmAndNarration(videoPath, bgmPath, totalDuration, outPath) {
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-filter_complex",
    `[0:a]volume=1.0[a0];[1:a]volume=0.28,atrim=0:${totalDuration},asetpts=PTS-STARTPTS[a1];` +
      `[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
}

// Azure 목소리를 대본 내용 기반으로 자동으로 고를 때 쓰는 남성/여성 기본 목소리입니다.
// (voiceProvider.js의 기본값과 같은 InJoon을 남성 쪽 기준으로 맞춰뒀습니다.)
const AZURE_MALE_VOICE = "ko-KR-InJoonNeural";
const AZURE_FEMALE_VOICE = "ko-KR-SunHiNeural";

// 커플/결혼처럼 남녀가 함께 나오는 정보성 콘텐츠는(사장님 지정에 따라) 여자 목소리로
// 고정합니다 — 이 키워드가 있으면 아래 "남자 vs 여자" 단어 수 비교보다 우선합니다.
const MIXED_CONTENT_KEYWORDS = /커플|결혼|부부|남녀|웨딩|신혼/;

// 전체 대본(모든 장면 캡션)에 "남자/남성" vs "여자/여성" 단어가 몇 번씩 나오는지 세서,
// 더 많이 나온 쪽 목소리를 고릅니다(예: "남자 연예인" 기사 → 남성, "여자 연예인" 기사
// → 여성). 둘 다 없거나 동률이면 null(판단 보류)을 반환해서 호출부가 기본 목소리로
// 자연스럽게 넘어가게 합니다.
function detectGenderVoice(scenes) {
  const text = (scenes || []).map((s) => s.caption || "").join(" ");
  if (MIXED_CONTENT_KEYWORDS.test(text)) return AZURE_FEMALE_VOICE;
  const maleHits = (text.match(/남자|남성/g) || []).length;
  const femaleHits = (text.match(/여자|여성/g) || []).length;
  if (maleHits === femaleHits) return null;
  return maleHits > femaleHits ? AZURE_MALE_VOICE : AZURE_FEMALE_VOICE;
}

/**
 * scenes: [{ caption, image }]  (planShortform이 만든 결과의 scenes 배열)
 * options.durationPerScene: 장면당 기본 길이(초), 기본 3초 (나레이션이 더 길면 자동으로 늘어남)
 * options.bgmPath: 로컬에 저장된 배경음악 파일 경로(선택)
 * options.animate: 켄번즈(확대·축소) 애니메이션 사용 여부, 기본 true
 * options.frameStyle: "polaroid"(기본, 하얀 테두리 포토카드) | "full"(화면 꽉 채우기)
 * options.voice: { provider, voiceId } — 지정하면 장면별 나레이션을 TTS로 생성해서 입힙니다
 * 반환: { fileName, publicPath, durationSec, narration: { used, provider, failedReason } }
 */
async function renderShortformVideo(
  scenes,
  {
    // ⚠️ 기본값을 숫자로 박지 않고 비워둡니다. 안 주면 효과팩이 정한 컷 속도(paceSec)를
    // 씁니다 — 캡컷 자동컷처럼 스타일마다 컷 리듬이 달라야 느낌이 살기 때문입니다.
    // 숫자를 직접 주면 예전처럼 그 값이 그대로 쓰입니다.
    durationPerScene = null,
    bgmPath = null,
    animate = true,
    voice = null,
    templateId = "bold-black",
    effectId = DEFAULT_EFFECT_ID, // 화면 효과팩(videoEffects) — 자막 템플릿과 별개입니다
    frameStyle = "full", // 숏폼은 세로 화면을 꽉 채우는 게 기본(폴라로이드 카드는 선택 옵션)
    hookText = "", // 영상 내내 상단에 고정으로 붙는 후킹 문구
    // 장면 전환 방식: "cut"(하드컷, 기본) | "crossfade"(부드럽게 겹치기)
    //
    // 기본이 하드컷인 이유가 두 가지입니다.
    //  1) 참고하신 숏폼 레퍼런스 영상들이 전부 하드컷 스타일입니다.
    //  2) 크로스페이드는 전 구간을 다시 인코딩해야 해서 ffmpeg 메모리를 크게 먹는데,
    //     Render는 컨테이너 전체가 512MB라 장면이 5개만 돼도 서버가 통째로 재시작됐습니다.
    //     하드컷은 `-c copy`라 디코딩·인코딩이 아예 없어서 메모리를 거의 안 쓰고 훨씬 빠릅니다.
    //
    // ⚠️ 기본값을 null로 둡니다. 호출부가 "cut"/"crossfade"를 콕 집어 주면 그게 이기고,
    // 안 주면 효과팩이 정한 방식(useTransition)을 따릅니다. 기본 효과(clean-zoom)는
    // useTransition=false라 예전과 똑같이 하드컷으로 나옵니다.
    transition = null,
    fastConcat = false, // (구버전 호환) true면 transition을 무시하고 하드컷
    encodePreset = "veryfast", // 미리보기는 "ultrafast"로 더 빠르게
    onPhase = null, // (phase, memMb) — 어디까지 진행됐는지 호출부에 알려줍니다
  } = {}
) {
  if (!scenes || !scenes.length) throw new Error("장면(scene)이 없습니다.");
  if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });

  const effect = getEffect(effectId);
  const sceneSeconds = durationPerScene == null ? effect.paceSec || 3 : durationPerScene;
  const resolvedTransition = transition != null ? transition : effect.useTransition ? "crossfade" : "cut";

  // ⚠️ 만든 영상이 쌓이기만 하고 아무도 안 지웠습니다.
  // 하루에 몇 편씩 만들면 며칠 만에 디스크가 찹니다(Render 무료는 용량이 작습니다).
  // 새로 만들기 직전에 오래된 것부터 치웁니다.
  sweepOldRenders();

  const jobId = crypto.randomUUID();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `shortform-${jobId}-`));

  // 렌더링 도중 서버가 메모리 부족으로 죽는 일이 있었어서(Render 512MB), 단계마다
  // 어디까지 갔고 메모리를 얼마나 쓰고 있는지 남깁니다. 죽더라도 마지막으로 보고된
  // 단계를 보면 어디서 터졌는지 알 수 있습니다.
  const reportPhase = (phase) => {
    const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
    console.log(`[render ${jobId.slice(0, 8)}] ${phase} — RSS ${memMb}MB`);
    if (onPhase) onPhase(phase, memMb);
  };

  const narrationInfo = { used: false, provider: voice?.provider || null, failedReason: null, scenesWithVoice: 0 };

  try {
    let synthesizeVoice = null;
    if (voice && voice.provider) {
      ({ synthesizeVoice } = require("./voiceProvider"));
    }

    // Azure이고 사용자가 목소리를 직접 안 골랐으면(voiceId 빈 값), 대본 내용을 보고
    // "남자" 관련 콘텐츠인지 "여자" 관련 콘텐츠인지에 따라 자동으로 남성/여성 목소리를
    // 골라줍니다. 애매하면(둘 다 없거나 동률이면) null로 두고, voiceProvider.js의
    // 기본 목소리(InJoon)로 자연스럽게 넘어가게 둡니다. 영상 전체에서 목소리가 장면마다
    // 바뀌면 어색하므로, 장면별이 아니라 영상 전체 기준으로 딱 한 번만 정합니다.
    const autoVoiceId = voice && voice.provider === "azure" && !voice.voiceId ? detectGenderVoice(scenes) : null;

    const segmentPaths = [];
    const durations = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let imagePath = null;
      if (scene.image) {
        if (/^https?:\/\//i.test(scene.image)) {
          // 외부 링크(블로그 등)에서 가져온 사진 — 내려받아서 씁니다(같은 주소는 캐시 재사용).
          imagePath = await downloadToFileCached(scene.image);
        } else {
          // "자동컷" 모드처럼 사용자가 이 서버에 직접 업로드한 사진 — /uploads/... 같은
          // 상대 경로이므로 내려받을 필요 없이 public 폴더에서 바로 읽습니다.
          const localPath = path.join(PUBLIC_DIR, scene.image.replace(/^\/+/, ""));
          if (fs.existsSync(localPath)) imagePath = localPath;
        }
      }

      let narrationPath = null;
      // 자막 글자 수에 비례해 "2줄씩 읽기에 최소 필요한 시간"을 계산해서, 장면당
      // 기본 길이(durationPerScene)가 너무 짧아 자막이 빠르게 지나가버리지 않게 합니다.
      let sceneDuration = Math.max(sceneSeconds, estimateMinDurationForCaption(scene.caption));
      if (synthesizeVoice) {
        const narrCandidate = path.join(workDir, `narr${i}.mp3`);
        try {
          await synthesizeVoice({ text: scene.caption, provider: voice.provider, voiceId: voice.voiceId || autoVoiceId, destPath: narrCandidate });
          const dur = await probeDurationSeconds(narrCandidate);
          narrationPath = narrCandidate;
          if (dur) sceneDuration = Math.max(sceneDuration, dur + 0.4);
          narrationInfo.used = true;
          narrationInfo.scenesWithVoice++;
        } catch (err) {
          if (!narrationInfo.failedReason) narrationInfo.failedReason = err.message;
        }
      }

      const segPath = path.join(workDir, `seg${i}.mp4`);
      await renderSceneSegment({
        imagePath,
        captionText: scene.caption,
        duration: sceneDuration,
        outPath: segPath,
        sceneIndex: i,
        animate,
        narrationPath,
        templateId,
        frameStyle,
        effectId,
        hookText,
        encodePreset,
        fadeIn: i === 0,
        fadeOut: i === scenes.length - 1,
      });
      segmentPaths.push(segPath);
      durations.push(sceneDuration);
      reportPhase(`장면 ${i + 1}/${scenes.length} 완료`);

      // 장면 사이에 아주 짧은 틈을 둡니다. ffmpeg가 CPU를 계속 붙잡고 있으면 서버가
      // 헬스체크에 제때 응답하지 못해 Render가 인스턴스를 재시작해 버리기 때문에,
      // 중간중간 서버가 숨 쉴 틈을 만들어 주는 용도입니다.
      // (무료 플랜에선 400ms가 필요했지만, Starter로 올린 뒤로는 CPU 여유가 생겨 짧게 줄였습니다.)
      await new Promise((r) => setTimeout(r, 120));
    }

    const concatenatedPath = path.join(workDir, "concat.mp4");
    let totalDuration;
    reportPhase("장면 합치기 시작");
    if (fastConcat || resolvedTransition !== "crossfade") {
      // 하드컷 — `-c copy`라 디코딩·인코딩이 없어서 사실상 순식간이고 메모리도 안 씁니다.
      totalDuration = durations.reduce((a, b) => a + b, 0);
      await concatSegments(segmentPaths, concatenatedPath);
    } else {
      try {
        totalDuration = await concatWithCrossfade(
          segmentPaths, durations, concatenatedPath, effect.transitionSec || TRANSITION_SEC, effect
        );
      } catch (err) {
        // 크로스페이드 합성이 실패하면(예: ffmpeg 빌드 문제) 영상 자체가 안 만들어지는 것보다는
        // 낫다고 보고, 예전처럼 하드컷으로 이어붙이는 방식으로 안전하게 대체합니다.
        console.error("[videoRenderer] 크로스페이드 전환 실패 — 하드컷 이어붙이기로 대체합니다:", err.message);
        totalDuration = durations.reduce((a, b) => a + b, 0);
        await concatSegments(segmentPaths, concatenatedPath);
      }
    }

    reportPhase("장면 합치기 완료");

    const fileName = `${jobId}.mp4`;
    const finalPath = path.join(RENDERS_DIR, fileName);

    if (bgmPath) {
      await muxBgmAndNarration(concatenatedPath, bgmPath, totalDuration, finalPath);
    } else {
      fs.copyFileSync(concatenatedPath, finalPath);
    }
    reportPhase("마무리 완료");

    return { fileName, publicPath: `/renders/${fileName}`, durationSec: totalDuration, narration: narrationInfo };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { renderShortformVideo, sweepOldRenders, RENDERS_DIR, FRAME_STYLES, applyEmphasis, buildCaptionSrt, buildCaptionEvents };
