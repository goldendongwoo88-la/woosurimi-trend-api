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

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 25;
const FADE_SEC = 0.4; // 영상 맨 처음/맨 끝에만 쓰는 검은 화면 페이드
const TRANSITION_SEC = 0.35; // 장면과 장면 사이 크로스페이드 전환 길이
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const RENDERS_DIR = path.join(__dirname, "..", "public", "renders");
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
];

// execFile은 기본적으로 시간 제한이 없어서, ffmpeg가 어떤 이유로든(예: 손상된 입력
// 파일, 예상 못한 인코더 문제) 멈춰버리면 이 Promise가 영영 끝나지 않고 그 위의
// 호출부(장면 렌더링 → 미리보기 5개 순서대로 생성 등) 전체가 몇 분이고 멈춰 있게
// 됩니다. timeout을 걸어서, 정말 멈춘 경우엔 에러로 실패 처리되고 다음 단계로 넘어갈
// 수 있게(또는 사용자에게 실패로 보여줄 수 있게) 합니다.
const FFMPEG_TIMEOUT_MS = 90000;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 100, timeout: FFMPEG_TIMEOUT_MS }, (err, stdout, stderr) => {
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
function buildCaptionSrt(text, duration) {
  const chunks = buildCaptionChunks(text);
  const perChunk = duration / chunks.length;
  let srt = "";
  chunks.forEach((chunk, i) => {
    const start = i * perChunk;
    const end = i === chunks.length - 1 ? duration : (i + 1) * perChunk;
    srt += `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${chunk}\n\n`;
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

// 장면 인덱스에 따라 "확대"와 "축소", 좌/우 살짝 팬을 번갈아 적용해서 장면마다
// 조금씩 다른 느낌의 켄번즈(Ken Burns) 애니메이션 필터를 만듭니다. width/height는 이
// 필터가 최종적으로 출력할 크기(예: 배경은 화면 전체, 카드는 카드 안쪽 크기)입니다.
function buildKenBurnsFilter(index, duration, { width, height, maxZoom = 1.18, driftRatio = 0.07 } = {}) {
  const totalFrames = Math.max(Math.round(duration * FPS), 1);
  const rate = (maxZoom - 1) / totalFrames;
  const zoomIn = index % 2 === 0;
  const panDir = Math.floor(index / 2) % 2 === 0 ? 1 : -1;
  const driftPx = Math.round(width * driftRatio);

  // z='...' 처럼 필터 옵션 값을 작은따옴표로 감쌌기 때문에, 그 안의 쉼표(,)는
  // 필터 구분자로 해석되지 않고 그대로 문자로 들어갑니다 — 따로 이스케이프하지 않습니다.
  const zExpr = zoomIn
    ? `min(zoom+${rate.toFixed(6)},${maxZoom})`
    : `if(eq(on,0),${maxZoom},max(zoom-${rate.toFixed(6)},1.0))`;
  const xExpr = `(iw-iw/zoom)/2+(${panDir}*${driftPx}*on/${totalFrames})`;
  const yExpr = `(ih-ih/zoom)/2`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${width}x${height}:fps=${FPS}`;
}

// 사진 한 장을 targetW x targetH로 채운 뒤, animate가 true면 켄번즈 애니메이션까지
// 적용하는 필터 체인(배열)을 만듭니다. 배경 레이어/카드 레이어에 공통으로 씁니다.
function buildLayerFilters({ animate, sceneIndex, duration, targetW, targetH, maxZoom, driftRatio }) {
  if (animate) {
    const bigW = Math.round(targetW * 1.3);
    const bigH = Math.round(targetH * 1.3);
    return [
      buildCoverCropFilter(bigW, bigH),
      buildKenBurnsFilter(sceneIndex, duration, { width: targetW, height: targetH, maxZoom, driftRatio }),
    ];
  }
  return [buildCoverCropFilter(targetW, targetH)];
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
  hookText = "",
  encodePreset = "veryfast",
  fadeIn = true,
  fadeOut = true,
}) {
  const srtFile = outPath.replace(/\.mp4$/, ".srt");
  // 자막 전체를 한 화면에 몰아넣지 않고, 2줄씩 순서대로 바뀌도록 여러 개의 자막
  // 구간(cue)으로 나눠서 만듭니다 — 글자가 잘리지 않으면서도 화면을 덜 가립니다.
  const srtContent = buildCaptionSrt(captionText, duration);
  fs.writeFileSync(srtFile, srtContent, "utf8");

  const fontsDir = escapeFilterPath(path.dirname(FONT_PATH));
  const template = getTemplate(templateId);
  const tempFiles = [srtFile];

  // 자막은 두 겹입니다(유튜브 쇼츠에서 흔히 쓰는 구성):
  //   - 상단: 영상 내내 안 바뀌는 후킹 문구(hookText) — 스크롤하다 멈추게 만드는 역할
  //   - 하단: 장면마다 바뀌는 구어체 멘트(captionText) — 실제 내용 전달
  // libass subtitles 필터를 두 번 이어 붙여서 각각 다른 스타일/위치로 얹습니다.
  const subtitleFilters = [
    `subtitles=filename='${escapeFilterPath(srtFile)}':fontsdir='${fontsDir}':force_style='${template.forceStyle}'`,
  ];
  if (hookText && hookText.trim()) {
    const hookSrtFile = outPath.replace(/\.mp4$/, ".hook.srt");
    // 후킹 문구는 장면 내내 계속 떠 있어야 해서 구간을 하나만 만듭니다.
    const hookLines = wrapHookLines(hookText.trim()).join("\n");
    fs.writeFileSync(hookSrtFile, `1\n${srtTimestamp(0)} --> ${srtTimestamp(duration)}\n${hookLines}\n\n`, "utf8");
    tempFiles.push(hookSrtFile);
    subtitleFilters.push(
      `subtitles=filename='${escapeFilterPath(hookSrtFile)}':fontsdir='${fontsDir}':force_style='${template.hookStyle}'`
    );
  }
  const subtitles = subtitleFilters.join(",");

  const fadeSteps = [];
  if (fadeIn) fadeSteps.push(`fade=t=in:st=0:d=${FADE_SEC}`);
  if (fadeOut) fadeSteps.push(`fade=t=out:st=${Math.max(duration - FADE_SEC, 0)}:d=${FADE_SEC}`);

  const usePolaroid = Boolean(imagePath) && frameStyle === "polaroid";

  const audioArgs = narrationPath
    ? ["-i", narrationPath]
    : ["-f", "lavfi", "-t", String(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  if (usePolaroid) {
    // === 포토카드(폴라로이드) 스타일: 배경(흐리게 확대) + 하얀 테두리 카드(원본 사진) ===
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
      targetW: CARD_CONTENT_W,
      targetH: CARD_CONTENT_H,
      maxZoom: 1.06,
      driftRatio: 0.03,
    })
      .concat([`pad=w=${CARD_W}:h=${CARD_H}:x=${CARD_BORDER}:y=${CARD_BORDER}:color=white`])
      .join(",");

    const shadowFilters = "boxblur=16:2,format=yuva420p,colorchannelmixer=aa=0.4";

    const overlayY = `(H-h)/2-${CARD_Y_OFFSET}`;
    const shadowY = `(H-h)/2-${CARD_Y_OFFSET}+14`;
    const shadowX = `(W-w)/2+10`;

    const finalSteps = [subtitles, ...fadeSteps, "format=yuv420p"].join(",");

    const filterComplex = [
      `[0:v]split=2[fgsrc][bgsrc]`,
      `[bgsrc]${bgFilters}[bglayer]`,
      `[1:v]${shadowFilters}[shadow]`,
      `[bglayer][shadow]overlay=x=${shadowX}:y=${shadowY}:format=auto[withshadow]`,
      `[fgsrc]${fgFilters}[card]`,
      `[withshadow][card]overlay=x=(W-w)/2:y=${overlayY}[merged]`,
      `[merged]${finalSteps}[outv]`,
    ].join(";");

    const args = [
      "-y",
      "-loop", "1", "-t", String(duration), "-i", imagePath,
      "-f", "lavfi", "-t", String(duration), "-i", `color=c=black:s=${CARD_W}x${CARD_H}:r=${FPS}`,
      ...audioArgs,
      "-filter_complex", filterComplex,
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
      maxZoom: 1.18,
      driftRatio: 0.07,
    });
    vf = [...layerFilters, subtitles, fade, "format=yuv420p"].filter(Boolean).join(",");
  } else if (imagePath) {
    vf = [buildCoverCropFilter(WIDTH, HEIGHT), subtitles, fade, `fps=${FPS}`, "format=yuv420p"].filter(Boolean).join(",");
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
async function concatWithCrossfade(segmentPaths, durations, outPath, transitionSec = TRANSITION_SEC) {
  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0], outPath);
    return durations[0];
  }

  const inputArgs = [];
  segmentPaths.forEach((p) => inputArgs.push("-i", p));

  const filterParts = [];
  let vLabel = "0:v";
  let aLabel = "0:a";
  let cum = durations[0];
  for (let i = 1; i < segmentPaths.length; i++) {
    // 전환 길이가 짧은 장면보다 길면 안 되므로(그러면 offset이 음수가 되어 깨짐),
    // 두 장면 중 더 짧은 쪽 길이를 넘지 않게 안전하게 제한합니다.
    const t = Math.max(Math.min(transitionSec, durations[i - 1], durations[i]) - 0.001, 0.05);
    const offset = Math.max(cum - t, 0);
    const vOut = `v${i}`;
    const aOut = `a${i}`;
    filterParts.push(`[${vLabel}][${i}:v]xfade=transition=fade:duration=${t.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}]`);
    filterParts.push(`[${aLabel}][${i}:a]acrossfade=d=${t.toFixed(3)}[${aOut}]`);
    vLabel = vOut;
    aLabel = aOut;
    cum = cum + durations[i] - t;
  }

  await runFfmpeg([
    "-y",
    ...inputArgs,
    "-filter_complex", filterParts.join(";"),
    "-map", `[${vLabel}]`,
    "-map", `[${aLabel}]`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-movflags", "+faststart",
    outPath,
  ]);
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
    durationPerScene = 3,
    bgmPath = null,
    animate = true,
    voice = null,
    templateId = "bold-black",
    frameStyle = "full", // 숏폼은 세로 화면을 꽉 채우는 게 기본(폴라로이드 카드는 선택 옵션)
    hookText = "", // 영상 내내 상단에 고정으로 붙는 후킹 문구
    fastConcat = false, // true면 크로스페이드 없이 하드컷으로 이어붙여 렌더링 속도를 크게 아낌(미리보기용)
    encodePreset = "veryfast", // 미리보기는 "ultrafast"로 더 빠르게
  } = {}
) {
  if (!scenes || !scenes.length) throw new Error("장면(scene)이 없습니다.");
  if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });

  const jobId = crypto.randomUUID();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `shortform-${jobId}-`));

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
      let sceneDuration = Math.max(durationPerScene, estimateMinDurationForCaption(scene.caption));
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
        hookText,
        encodePreset,
        fadeIn: i === 0,
        fadeOut: i === scenes.length - 1,
      });
      segmentPaths.push(segPath);
      durations.push(sceneDuration);
    }

    const concatenatedPath = path.join(workDir, "concat.mp4");
    let totalDuration;
    if (fastConcat) {
      // 크로스페이드는 장면마다 재인코딩이 필요해서 느립니다 — 미리보기처럼 속도가
      // 중요할 땐 처음부터 하드컷으로 이어붙입니다.
      totalDuration = durations.reduce((a, b) => a + b, 0);
      await concatSegments(segmentPaths, concatenatedPath);
    } else {
      try {
        totalDuration = await concatWithCrossfade(segmentPaths, durations, concatenatedPath, TRANSITION_SEC);
      } catch (err) {
        // 크로스페이드 합성이 실패하면(예: ffmpeg 빌드 문제) 영상 자체가 안 만들어지는 것보다는
        // 낫다고 보고, 예전처럼 하드컷으로 이어붙이는 방식으로 안전하게 대체합니다.
        console.error("[videoRenderer] 크로스페이드 전환 실패 — 하드컷 이어붙이기로 대체합니다:", err.message);
        totalDuration = durations.reduce((a, b) => a + b, 0);
        await concatSegments(segmentPaths, concatenatedPath);
      }
    }

    const fileName = `${jobId}.mp4`;
    const finalPath = path.join(RENDERS_DIR, fileName);

    if (bgmPath) {
      await muxBgmAndNarration(concatenatedPath, bgmPath, totalDuration, finalPath);
    } else {
      fs.copyFileSync(concatenatedPath, finalPath);
    }

    return { fileName, publicPath: `/renders/${fileName}`, durationSec: totalDuration, narration: narrationInfo };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { renderShortformVideo, RENDERS_DIR, FRAME_STYLES };
