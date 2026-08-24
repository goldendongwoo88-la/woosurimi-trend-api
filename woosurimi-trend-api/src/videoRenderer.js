// 숏폼 기획안(scenes)을 받아서 실제 mp4 영상 파일로 렌더링하는 모듈입니다.
// ffmpeg(ffmpeg-static 패키지로 함께 설치되는 실행 파일, 별도 설치 필요 없음)를 직접
// 호출해서 만듭니다 — 유료 API를 쓰지 않는, "고정 템플릿 하나" 수준의 단순한 버전입니다.
//
// 처리 순서:
//   1) 각 장면(scene)의 사진을 내려받는다 (사진이 없으면 어두운 배경색으로 대신함)
//   2) 장면마다 "사진 + 자막(자동 줄바꿈) + 페이드 인/아웃" 짧은 영상 조각을 만든다
//   3) 조각들을 순서대로 이어 붙인다 (자동 트랜지션 = 각 장면의 페이드 인/아웃)
//   4) 배경음악(BGM) 파일을 준 경우, 전체 길이에 맞춰 잘라서 입힌다
//
// AI 음성(여러 성우 톤)이나 이미지 확대/축소 애니메이션(켄 번즈 효과) 같은 고급 기능은
// 아직 없습니다 — README의 "다음 단계" 설명을 참고하세요.

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 25;
const FADE_SEC = 0.4;
const FONT_PATH = path.join(__dirname, "..", "assets", "fonts", "NotoSansKR-Bold.ttf");
const RENDERS_DIR = path.join(__dirname, "..", "public", "renders");

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

// ffmpeg 필터 문자열 안에 경로를 넣을 때는 백슬래시(윈도우 경로)와 콜론(드라이브 문자,
// 필터 옵션 구분자)을 이스케이프해야 깨지지 않습니다.
function escapeFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function wrapCaption(text, maxCharsPerLine = 16, maxLines = 4) {
  const words = (text || "").replace(/\s+/g, " ").trim().split(" ");
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
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.join("\n");
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

// ⚠️ 이 static ffmpeg 빌드에는 drawtext 필터가 빠져 있어서(라이선스 이유로 종종 제외됨),
// 대신 libass 기반의 subtitles 필터로 자막을 입힙니다. .srt 자막 파일을 하나 만들고
// fontsdir로 우리가 프로젝트에 넣어둔 한글 폰트(assets/fonts)를 직접 지정해서 씁니다.
async function renderSceneSegment({ imagePath, captionText, duration, outPath }) {
  const srtFile = outPath.replace(/\.mp4$/, ".srt");
  const srtContent = `1\n${srtTimestamp(0)} --> ${srtTimestamp(duration)}\n${wrapCaption(captionText)}\n`;
  fs.writeFileSync(srtFile, srtContent, "utf8");

  const fontsDir = escapeFilterPath(path.dirname(FONT_PATH));
  const forceStyle =
    "FontName=Woosurimi Caption KR,FontSize=20,PrimaryColour=&H00FFFFFF," +
    "BorderStyle=3,BackColour=&H99000000,Outline=1,Shadow=0,Alignment=2,MarginV=140";
  const subtitles = `subtitles=filename='${escapeFilterPath(srtFile)}':fontsdir='${fontsDir}':force_style='${forceStyle}'`;

  const fadeOutStart = Math.max(duration - FADE_SEC, 0);
  const vf = `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},` +
    `${subtitles},fade=t=in:st=0:d=${FADE_SEC},fade=t=out:st=${fadeOutStart}:d=${FADE_SEC},fps=${FPS},format=yuv420p`;

  const inputArgs = imagePath
    ? ["-loop", "1", "-t", String(duration), "-i", imagePath]
    : ["-f", "lavfi", "-t", String(duration), "-i", `color=c=0x1c1c2b:s=${WIDTH}x${HEIGHT}:r=${FPS}`];

  const args = [
    "-y",
    ...inputArgs,
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
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

async function muxBgm(videoPath, bgmPath, totalDuration, outPath) {
  await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-filter_complex", `[1:a]volume=0.45,atrim=0:${totalDuration},asetpts=PTS-STARTPTS[a]`,
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
 * options.durationPerScene: 장면당 길이(초), 기본 3초
 * options.bgmPath: 로컬에 저장된 배경음악 파일 경로(선택)
 * 반환: { fileName, publicPath, durationSec }
 */
async function renderShortformVideo(scenes, { durationPerScene = 3, bgmPath = null } = {}) {
  if (!scenes || !scenes.length) throw new Error("장면(scene)이 없습니다.");
  if (!fs.existsSync(RENDERS_DIR)) fs.mkdirSync(RENDERS_DIR, { recursive: true });

  const jobId = crypto.randomUUID();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `shortform-${jobId}-`));

  try {
    const segmentPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let imagePath = null;
      if (scene.image) {
        const candidate = path.join(workDir, `img${i}${path.extname(new URL(scene.image).pathname) || ".jpg"}`);
        const ok = await downloadToFile(scene.image, candidate);
        if (ok) imagePath = candidate;
      }
      const segPath = path.join(workDir, `seg${i}.mp4`);
      await renderSceneSegment({ imagePath, captionText: scene.caption, duration: durationPerScene, outPath: segPath });
      segmentPaths.push(segPath);
    }

    const concatenatedPath = path.join(workDir, "concat.mp4");
    await concatSegments(segmentPaths, concatenatedPath);

    const totalDuration = scenes.length * durationPerScene;
    const fileName = `${jobId}.mp4`;
    const finalPath = path.join(RENDERS_DIR, fileName);

    if (bgmPath) {
      await muxBgm(concatenatedPath, bgmPath, totalDuration, finalPath);
    } else {
      fs.copyFileSync(concatenatedPath, finalPath);
    }

    return { fileName, publicPath: `/renders/${fileName}`, durationSec: totalDuration };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { renderShortformVideo, RENDERS_DIR };
