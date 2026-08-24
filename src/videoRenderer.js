// 숏폼 기획안(scenes)을 받아서 실제 mp4 영상 파일로 렌더링하는 모듈입니다.
// ffmpeg(ffmpeg-static 패키지로 함께 설치되는 실행 파일, 별도 설치 필요 없음)를 직접
// 호출해서 만듭니다.
//
// 처리 순서:
//   1) 각 장면(scene)의 사진을 내려받는다 (사진이 없으면 어두운 배경색으로 대신함)
//   2) (선택) 장면 대사를 AI 성우 목소리(TTS)로 미리 만들어 둔 mp3가 있으면 그 길이에
//      맞춰 장면 길이를 늘린다 — 목소리가 잘리지 않도록
//   3) 장면마다 "사진(켄번즈 확대·축소 애니메이션) + 자막(자동 줄바꿈) + 나레이션(또는
//      무음) + 페이드 인/아웃" 짧은 영상 조각을 만든다
//   4) 조각들을 순서대로 이어 붙인다 (자동 트랜지션 = 각 장면의 페이드 인/아웃)
//   5) 배경음악(BGM)이 있으면, 나레이션(또는 무음) 위에 볼륨을 낮춰 함께 믹싱한다
//
// 자막 디자인은 src/videoTemplates.js에 정의된 5가지 템플릿(색상/박스/위치 조합) 중
// 하나를 골라 적용합니다. 아직 없는 것: 목소리별 감정 톤 세부 조정(성우 API 자체가
// 지원하는 범위 안에서만 가능), 실제 동영상 클립(사진이 아닌 원본 영상)을 장면으로
// 쓰는 기능입니다.

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
const FADE_SEC = 0.4;
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const RENDERS_DIR = path.join(__dirname, "..", "public", "renders");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || "").toString().split("\n").slice(-25).join("\n");
        return reject(new Error(`ffmpeg 처리 중 오류가 발생했습니다: ${tail || err.message}`));
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
    execFile(ffmpegPath, ["-i", filePath], { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
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

// 장면 인덱스에 따라 "확대"와 "축소", 좌/우 살짝 팬을 번갈아 적용해서 장면마다
// 조금씩 다른 느낌의 켄번즈(Ken Burns) 애니메이션을 만듭니다.
function buildKenBurnsFilter(index, duration) {
  const totalFrames = Math.max(Math.round(duration * FPS), 1);
  const maxZoom = 1.18;
  const rate = (maxZoom - 1) / totalFrames;
  const zoomIn = index % 2 === 0;
  const panDir = Math.floor(index / 2) % 2 === 0 ? 1 : -1;
  const driftPx = 50;

  // z='...' 처럼 필터 옵션 값을 작은따옴표로 감쌌기 때문에, 그 안의 쉼표(,)는
  // 필터 구분자로 해석되지 않고 그대로 문자로 들어갑니다 — 따로 이스케이프하지 않습니다.
  const zExpr = zoomIn
    ? `min(zoom+${rate.toFixed(6)},${maxZoom})`
    : `if(eq(on,0),${maxZoom},max(zoom-${rate.toFixed(6)},1.0))`;
  const xExpr = `(iw-iw/zoom)/2+(${panDir}*${driftPx}*on/${totalFrames})`;
  const yExpr = `(ih-ih/zoom)/2`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`;
}

// ⚠️ 이 static ffmpeg 빌드에는 drawtext 필터가 빠져 있어서(라이선스 이유로 종종 제외됨),
// 대신 libass 기반의 subtitles 필터로 자막을 입힙니다. .srt 자막 파일을 하나 만들고
// fontsdir로 우리가 프로젝트에 넣어둔 한글 폰트(assets/fonts)를 직접 지정해서 씁니다.
//
// narrationPath가 있으면 그 오디오를 장면의 소리로 쓰고, 없으면 무음(anullsrc)을 같은
// 길이로 채워 넣습니다 — 모든 장면 조각의 오디오 스트림 형식을 통일해야 나중에
// concat(이어붙이기)이 문제없이 됩니다.
async function renderSceneSegment({ imagePath, captionText, duration, outPath, sceneIndex = 0, animate = true, narrationPath = null, templateId = "bold-black" }) {
  const srtFile = outPath.replace(/\.mp4$/, ".srt");
  // 자막 전체를 한 화면에 몰아넣지 않고, 2줄씩 순서대로 바뀌도록 여러 개의 자막
  // 구간(cue)으로 나눠서 만듭니다 — 글자가 잘리지 않으면서도 화면을 덜 가립니다.
  const srtContent = buildCaptionSrt(captionText, duration);
  fs.writeFileSync(srtFile, srtContent, "utf8");

  const fontsDir = escapeFilterPath(path.dirname(FONT_PATH));
  const forceStyle = getTemplate(templateId).forceStyle;
  const subtitles = `subtitles=filename='${escapeFilterPath(srtFile)}':fontsdir='${fontsDir}':force_style='${forceStyle}'`;

  const fadeOutStart = Math.max(duration - FADE_SEC, 0);
  const fade = `fade=t=in:st=0:d=${FADE_SEC},fade=t=out:st=${fadeOutStart}:d=${FADE_SEC}`;

  let vf;
  if (imagePath && animate) {
    // 팬/줌이 캔버스 밖으로 나가지 않도록, 목표 크기보다 넉넉하게 확대해둔 뒤 켄번즈를 적용합니다.
    // flags=lanczos는 원본보다 작은 사진을 확대할 때 최대한 덜 뭉개지도록 하는 옵션입니다
    // (원본 해상도 자체가 너무 낮으면 이 옵션으로도 한계가 있습니다).
    const bigW = Math.round(WIDTH * 1.3);
    const bigH = Math.round(HEIGHT * 1.3);
    const kenBurns = buildKenBurnsFilter(sceneIndex, duration);
    vf =
      `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${bigW}:${bigH},` +
      `${kenBurns},${subtitles},${fade},format=yuv420p`;
  } else {
    vf =
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},` +
      `${subtitles},${fade},fps=${FPS},format=yuv420p`;
  }

  const inputArgs = imagePath
    ? ["-loop", "1", "-t", String(duration), "-i", imagePath]
    : ["-f", "lavfi", "-t", String(duration), "-i", `color=c=0x1c1c2b:s=${WIDTH}x${HEIGHT}:r=${FPS}`];

  const audioArgs = narrationPath
    ? ["-i", narrationPath]
    : ["-f", "lavfi", "-t", String(duration), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  const args = [
    "-y",
    ...inputArgs,
    ...audioArgs,
    "-vf", vf,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-shortest",
    outPath,
  ];
  await runFfmpeg(args);
  fs.unlinkSync(srtFile);
}

async function concatSegments(segmentPaths, outPath) {
  const listPath = outPath.replace(/\.mp4$/, ".list.txt");
  const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, listContent, "utf8");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath]);
  fs.unlinkSync(listPath);
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

/**
 * scenes: [{ caption, image }]  (planShortform이 만든 결과의 scenes 배열)
 * options.durationPerScene: 장면당 기본 길이(초), 기본 3초 (나레이션이 더 길면 자동으로 늘어남)
 * options.bgmPath: 로컬에 저장된 배경음악 파일 경로(선택)
 * options.animate: 켄번즈(확대·축소) 애니메이션 사용 여부, 기본 true
 * options.voice: { provider, voiceId } — 지정하면 장면별 나레이션을 TTS로 생성해서 입힙니다
 * 반환: { fileName, publicPath, durationSec, narration: { used, provider, failedReason } }
 */
async function renderShortformVideo(scenes, { durationPerScene = 3, bgmPath = null, animate = true, voice = null, templateId = "bold-black" } = {}) {
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

    const segmentPaths = [];
    let totalDuration = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let imagePath = null;
      if (scene.image) {
        if (/^https?:\/\//i.test(scene.image)) {
          // 외부 링크(블로그 등)에서 가져온 사진 — 내려받아서 씁니다.
          const candidate = path.join(workDir, `img${i}${path.extname(new URL(scene.image).pathname) || ".jpg"}`);
          const ok = await downloadToFile(scene.image, candidate);
          if (ok) imagePath = candidate;
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
          await synthesizeVoice({ text: scene.caption, provider: voice.provider, voiceId: voice.voiceId, destPath: narrCandidate });
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
      });
      segmentPaths.push(segPath);
      totalDuration += sceneDuration;
    }

    const concatenatedPath = path.join(workDir, "concat.mp4");
    await concatSegments(segmentPaths, concatenatedPath);

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

module.exports = { renderShortformVideo, RENDERS_DIR };
