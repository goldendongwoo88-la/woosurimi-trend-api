/**
 * 로컬 ComfyUI로 글(프롬프트)에서 실제 영상을 생성합니다.
 *
 * ⚠️ 어떤 모델을 쓰는지는 이 코드가 정하지 않습니다 — 사장님 PC(RTX 4090)에 설치해 두신
 * LTX-2.5 / HunyuanVideo 1.5 / Wan 2.2 / MiniMax H3 중 어느 것으로 "video-generate"
 * 워크플로를 만드셨든, comfyClient.js가 그 워크플로를 그대로 실행합니다(Z-Image Turbo·
 * 캐릭터 LoRA·Wan-VACE와 같은 원칙 — workflows/README.md 참고).
 *
 * ⚠️ 지금은 "글로 영상 만들기"(텍스트→영상)만 다룹니다. MiniMax H3의 참조 이미지/사운드
 * 중심 고급 컷이나 Wan 2.2의 캐릭터 애니메이션·인물 교체는 입력 형태가 아예 달라서
 * (이미지·영상을 함께 넣어야 함) 별도 워크플로/기능으로 다뤄야 합니다.
 *
 * ⚠️ 영상 생성은 카드뉴스 이미지보다 훨씬 오래 걸립니다(모델·길이에 따라 수 분~수십 분).
 * index.js에서는 즉시 응답하지 않고 작업 ID를 먼저 돌려주는 방식(long-to-shorts와 같은
 * 패턴)으로 씁니다.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const comfyClient = require("./comfyClient");

const OUT_DIR = path.join(__dirname, "..", "public", "renders");
const FPS = 25; // videoRenderer.js와 같은 기준(초당 프레임) — 길이(초)를 프레임 수로 환산할 때 씁니다.

/** 지금 이 기능을 쓸 수 있는 상태인지 (ComfyUI 켜짐 + video-generate 워크플로 있음). */
async function isAvailable() {
  return (await comfyClient.ping()) && comfyClient.hasWorkflow("video-generate");
}

/**
 * prompt: 영상 내용 설명 (필수)
 * negativePrompt: (선택) 안 나왔으면 하는 것
 * durationSec: 영상 길이(초, 기본 4초) — FPS(25) 기준으로 프레임 수로 환산해 넘깁니다
 * width/height: 출력 해상도 (기본 768×1024, 세로 쇼츠 기준)
 * seed: (선택) 재현하고 싶을 때
 *
 * @returns {{fileName:string, publicPath:string, sizeMb:number}}
 */
async function generate({ prompt, negativePrompt = "", durationSec = 4, width = 768, height = 1024, seed } = {}) {
  if (!String(prompt || "").trim()) {
    const e = new Error("영상 내용을 설명하는 prompt가 필요합니다.");
    e.status = 400;
    throw e;
  }

  const numFrames = Math.max(Math.round(durationSec * FPS), 1);
  const files = await comfyClient.runWorkflow(
    "video-generate",
    {
      PROMPT: prompt,
      NEGATIVE_PROMPT: negativePrompt,
      WIDTH: width,
      HEIGHT: height,
      NUM_FRAMES: numFrames,
      SEED: seed ?? Math.floor(Math.random() * 1_000_000_000),
    },
    { timeoutMs: 20 * 60 * 1000, outDir: fs.mkdtempSync(path.join(os.tmpdir(), "vidgen-")) }
  );

  const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f)) || files[0];
  if (!videoFile) throw new Error("워크플로 결과에서 영상 파일을 찾지 못했습니다.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ext = path.extname(videoFile) || ".mp4";
  const fileName = `gen-video-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const dest = path.join(OUT_DIR, fileName);
  fs.copyFileSync(videoFile, dest);

  return {
    fileName,
    publicPath: `/renders/${fileName}`,
    sizeMb: +(fs.statSync(dest).size / 1048576).toFixed(1),
  };
}

module.exports = { generate, isAvailable, FPS };
