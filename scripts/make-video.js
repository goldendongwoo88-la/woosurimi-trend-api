#!/usr/bin/env node
// content/videos/**/*.json 로 정의해둔 장면 목록을 받아서, 자막·전환·나레이션까지
// 입힌 완성된 mp4로 뽑는 마무리 도구입니다.
//
// 이 스크립트가 하는 일은 "이어붙이기와 자막"뿐입니다. 장면 영상 자체(clip)는
// Wan 2.2 / LTX-2.5 등으로 로컬에서 먼저 만들어서 scenes.json의 "clip" 자리에
// 경로를 채워 넣어야 합니다 — 각 장면의 genPrompt(또는 genPrompt_wan22 등
// 모델별 프롬프트)와 negativePrompt를 그대로 넣고 durationSec 근처 길이로
// 생성하면 됩니다.
//
// 쓰는 법:
//   node scripts/make-video.js content/videos/shorts/01-beolcho-injury.json
//
// clip 자리가 아직 "PASTE_CLIP_PATH_HERE.mp4"인 장면이 하나라도 있으면, 반쯤
// 채워진 영상을 만들어봐야 소용없으므로 여기서 멈추고 몇 번 장면이 비었는지 알려줍니다.

const fs = require("fs");
const path = require("path");
const { assembleFromClips } = require("../src/videoRenderer");

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("사용법: node scripts/make-video.js <scenes.json 경로>");
    console.error("예:     node scripts/make-video.js content/videos/shorts/01-beolcho-injury.json");
    process.exit(1);
  }

  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    console.error(`파일을 찾을 수 없습니다: ${resolved}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(config.scenes) || !config.scenes.length) {
    console.error("scenes 배열이 비어 있습니다.");
    process.exit(1);
  }

  const missing = config.scenes
    .map((s, i) => ({ i, clip: s.clip }))
    .filter((s) => !s.clip || /^PASTE_/.test(s.clip));
  if (missing.length) {
    console.error(
      `아직 클립 경로가 안 채워진 장면이 ${missing.length}/${config.scenes.length}개 있습니다: ` +
        `장면 번호 ${missing.map((m) => m.i + 1).join(", ")}`
    );
    console.error(
      "각 장면의 genPrompt(또는 genPrompt_wan22 등)로 Wan 2.2 / LTX-2.5에서 클립을 만든 뒤, " +
        `"clip" 자리에 그 파일의 절대경로를 채우고 다시 실행하십시오.`
    );
    process.exit(1);
  }

  const missingFile = config.scenes
    .map((s, i) => ({ i, clip: s.clip }))
    .filter((s) => !fs.existsSync(s.clip));
  if (missingFile.length) {
    console.error(`경로는 채워져 있는데 실제로 파일이 없는 장면이 있습니다: 장면 번호 ${missingFile.map((m) => m.i + 1).join(", ")}`);
    missingFile.forEach((m) => console.error(`  장면 ${m.i + 1}: ${m.clip}`));
    process.exit(1);
  }

  console.log(`[${config.title || path.basename(configPath)}] 장면 ${config.scenes.length}개 조립 시작...`);
  if (config.disclosure) {
    console.log(`대가성 고지(화면 안 + 설명 첫 줄에 넣으십시오): "${config.disclosure}"`);
  }

  const scenesForAssembly = config.scenes.map((s) => ({
    clip: s.clip,
    caption: s.caption || "",
    durationSec: s.durationSec,
  }));

  const result = await assembleFromClips(scenesForAssembly, config.options || {});
  console.log("완성:", result);
  console.log(`파일 위치: public${result.publicPath}`);
}

main().catch((err) => {
  console.error("실패:", err.message);
  process.exit(1);
});
