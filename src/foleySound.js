/**
 * HunyuanVideo-Foley(로컬 ComfyUI)로 무음(또는 효과음 없는) 영상에 효과음·배경 앰비언스를
 * 자동으로 입힙니다. 목소리 나레이션이 아니라 "발소리, 파도 소리, 바람 소리" 같은
 * 폴리 사운드/효과음 전용입니다 — 나레이션은 기존 voiceProvider.js를 그대로 쓰세요.
 *
 * ⚠️ 라이선스 — Tencent 커뮤니티 라이선스입니다(HunyuanVideo 1.5와 같은 회사).
 * 리서치에서 HunyuanVideo 1.5·MiniMax H3의 라이선스에 대한민국을 제외하는 지역 조항이
 * 있는 걸 확인했습니다 — HunyuanVideo-Foley도 같은 계열 라이선스라 사용 전에 직접
 * 원문을 확인해 보시는 걸 권합니다.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const comfyClient = require("./comfyClient");

const OUT_DIR = path.join(__dirname, "..", "public", "renders");

/** 지금 이 기능을 쓸 수 있는 상태인지 (ComfyUI 켜짐 + foley-sound 워크플로 있음). */
async function isAvailable() {
  return (await comfyClient.ping()) && comfyClient.hasWorkflow("foley-sound");
}

/**
 * videoPath: 효과음을 입힐 영상(절대경로, 무음이어도 되고 있어도 됨)
 * prompt: (선택) 어떤 소리가 났으면 하는지 설명 (예: "파도 소리, 갈매기 울음소리")
 *
 * @returns {{fileName:string, publicPath:string, sizeMb:number}}
 */
async function generate({ videoPath, prompt = "" } = {}) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    const e = new Error("효과음을 입힐 영상 파일을 찾을 수 없습니다.");
    e.status = 400;
    throw e;
  }

  const files = await comfyClient.runWorkflow(
    "foley-sound",
    { INPUT_VIDEO: videoPath, PROMPT: prompt },
    { timeoutMs: 15 * 60 * 1000, outDir: fs.mkdtempSync(path.join(os.tmpdir(), "foley-")) }
  );

  const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f)) || files[0];
  if (!videoFile) throw new Error("워크플로 결과에서 영상 파일을 찾지 못했습니다.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ext = path.extname(videoFile) || ".mp4";
  const fileName = `gen-foley-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const dest = path.join(OUT_DIR, fileName);
  fs.copyFileSync(videoFile, dest);

  return {
    fileName,
    publicPath: `/renders/${fileName}`,
    sizeMb: +(fs.statSync(dest).size / 1048576).toFixed(1),
  };
}

module.exports = { generate, isAvailable };
