// Wan-VACE(로컬 ComfyUI)로 가로 영상을 세로로 "잘라내지 않고 채워서" 만드는 모듈입니다.
//
// ⚠️ shortsStudio.js의 기본 방식은 findCropX로 피사체가 있는 쪽을 찾아 그 부분만
// **잘라냅니다**(양옆 소실). Wan-VACE 아웃페인팅을 쓰면 자르는 대신 화면 양옆을 AI가
// 자연스럽게 그려서 채워서, 원본 프레임을 더 많이 살릴 수 있습니다(docs/오픈소스-AI-모델-
// 리서치-2026-09.md "영상 편집" 절 참고). 다만 로컬 GPU가 필요하고 크롭 방식보다 훨씬
// 느립니다 — 그래서 기본은 꺼져 있고(opt-in), 실패하면 자동으로 크롭 방식으로 물러섭니다.
//
// ⚠️ ComfyUI의 비디오 워크플로(노드 구성)는 설치한 커스텀 노드(예: VHS_VideoCombine)에
// 따라 사람마다 다릅니다. 이 코드는 comfyClient.js와 같은 원칙으로, 사장님이 ComfyUI에서
// 직접 만든 워크플로(workflows/vace-outpaint.json)를 그대로 실행만 합니다 — 워크플로가
// 최종적으로 mp4/webm 파일 하나를 저장하는 노드로 끝나기만 하면 됩니다(comfyClient의
// runWorkflow가 결과 파일을 자동으로 찾아 받아옵니다).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const comfyClient = require("./comfyClient");

function run(bin, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).slice(-800)));
      resolve(stdout);
    });
  });
}

/** 지금 아웃페인팅을 쓸 수 있는 상태인지. */
async function isAvailable() {
  return (await comfyClient.ping()) && comfyClient.hasWorkflow("vace-outpaint");
}

/**
 * srcPath: 원본(가로) 영상 전체 경로
 * moment: { start, end } — 초 단위 구간
 * targetW/targetH: 최종 채워 넣을 세로 캔버스 크기(예: shortsStudio의 1080×1240 영상 영역)
 * 반환: 아웃페인팅이 끝난 로컬 mp4 파일 경로
 */
async function outpaintClip(srcPath, moment, targetW, targetH) {
  const dur = +(moment.end - moment.start).toFixed(2);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vace-"));
  try {
    // 1) 이 구간만 먼저 잘라둡니다(시간만 자르고 화면은 그대로 — VACE에 넘길 입력).
    const segment = path.join(work, "segment.mp4");
    await run(ffmpegPath, [
      "-y", "-ss", String(moment.start), "-t", String(dur), "-i", srcPath,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-an",
      segment,
    ], { timeout: 120000 });

    // 2) ComfyUI(Wan-VACE)로 세로 캔버스에 맞춰 아웃페인팅.
    const files = await comfyClient.runWorkflow(
      "vace-outpaint",
      {
        INPUT_VIDEO: segment,
        WIDTH: targetW,
        HEIGHT: targetH,
        PROMPT: "extend the background naturally on both sides, seamless, cinematic, photorealistic",
      },
      { timeoutMs: 20 * 60 * 1000, outDir: work } // 영상 생성이라 이미지보다 훨씬 오래 걸릴 수 있어 넉넉히
    );
    const outFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f)) || files[0];
    if (!outFile) throw new Error("워크플로 결과에서 영상 파일을 찾지 못했습니다.");

    // 최종 크기가 정확히 안 맞을 수 있어(모델이 살짝 다른 비율로 뽑는 경우) 확실히 맞춥니다.
    const finalOut = path.join(work, "final.mp4");
    await run(ffmpegPath, [
      "-y", "-i", outFile,
      "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-an",
      finalOut,
    ], { timeout: 120000 });

    // 임시 작업 폴더가 지워지기 전에, 호출한 쪽이 계속 쓸 수 있도록 시스템 임시 폴더의
    // 별도 파일로 복사해서 경로를 돌려줍니다.
    const keep = path.join(os.tmpdir(), `vace-out-${crypto.randomUUID().slice(0, 8)}.mp4`);
    fs.copyFileSync(finalOut, keep);
    return keep;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { outpaintClip, isAvailable };
