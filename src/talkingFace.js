/**
 * InfiniteTalk/MultiTalk(로컬 ComfyUI)로 사진 한 장 + 목소리 오디오만 넣으면
 * 립싱크되는 "말하는 얼굴" 영상을 만듭니다.
 *
 * ⚠️ 리서치 결과(2026-09) — InfiniteTalk는 Wan2.1-I2V-14B-480P를 베이스로 씁니다
 * (Wan2.2 통합은 아직 공식 지원 전입니다). ComfyUI에 이 베이스 모델까지 함께 준비하셔야
 * 워크플로가 동작합니다.
 *
 * ⚠️ 라이선스 — Apache 2.0이라 지역 제한 없이 상업적으로 쓸 수 있습니다
 * (같은 리서치에서 확인된 HunyuanVideo 1.5·MiniMax H3의 "대한민국 제외" 조항과
 * 다릅니다).
 *
 * ⚠️ 어떤 캐릭터 사진을 쓰느냐는 사장님 몫입니다 — characterImage.js로 만들어둔
 * 캐릭터 그림을 그대로 넣으면, 그 캐릭터가 실제로 말하는 영상이 됩니다.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const comfyClient = require("./comfyClient");

const OUT_DIR = path.join(__dirname, "..", "public", "renders");

/** 지금 이 기능을 쓸 수 있는 상태인지 (ComfyUI 켜짐 + talking-face 워크플로 있음). */
async function isAvailable() {
  return (await comfyClient.ping()) && comfyClient.hasWorkflow("talking-face");
}

/**
 * imagePath: 말할 얼굴 사진(절대경로)
 * audioPath: 립싱크할 목소리 오디오(절대경로)
 * width/height: 출력 해상도 (기본 768×1024, 세로 쇼츠 기준)
 *
 * @returns {{fileName:string, publicPath:string, sizeMb:number}}
 */
async function generate({ imagePath, audioPath, width = 768, height = 1024 } = {}) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    const e = new Error("얼굴 사진 파일을 찾을 수 없습니다.");
    e.status = 400;
    throw e;
  }
  if (!audioPath || !fs.existsSync(audioPath)) {
    const e = new Error("목소리 오디오 파일을 찾을 수 없습니다.");
    e.status = 400;
    throw e;
  }

  const files = await comfyClient.runWorkflow(
    "talking-face",
    { IMAGE: imagePath, AUDIO: audioPath, WIDTH: width, HEIGHT: height },
    { timeoutMs: 20 * 60 * 1000, outDir: fs.mkdtempSync(path.join(os.tmpdir(), "talkface-")) }
  );

  const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f)) || files[0];
  if (!videoFile) throw new Error("워크플로 결과에서 영상 파일을 찾지 못했습니다.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ext = path.extname(videoFile) || ".mp4";
  const fileName = `gen-talk-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const dest = path.join(OUT_DIR, fileName);
  fs.copyFileSync(videoFile, dest);

  return {
    fileName,
    publicPath: `/renders/${fileName}`,
    sizeMb: +(fs.statSync(dest).size / 1048576).toFixed(1),
  };
}

module.exports = { generate, isAvailable };
