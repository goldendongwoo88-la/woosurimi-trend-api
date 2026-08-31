// 쇼츠 전체 합성(크롭+배경+훅+댓글+자막)이 실제로 돌아가는지 확인합니다.
// 진짜 유튜브 영상 없이, ffmpeg가 만든 시험용 가로 영상으로 돌립니다.
// 사용: node scripts/test-shorts-render.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const s = require("../src/shortsStudio");

const run = (args) => new Promise((res, rej) =>
  execFile(ffmpegPath, args, { maxBuffer: 1 << 26 }, (e, o, err) =>
    e ? rej(new Error(String(err || e.message).slice(-600))) : res(o)));

(async () => {
  const tmp = path.join(os.tmpdir(), "l2s-test");
  fs.mkdirSync(tmp, { recursive: true });
  const src = path.join(tmp, "src.mp4");

  // 1920x1080 시험 영상 12초 — 움직이는 사각형을 오른쪽에 둬서 크롭이 그쪽을 잡는지 봅니다.
  console.log("시험용 가로 영상 만드는 중…");
  await run(["-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=12",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src]);

  const outDir = path.join(__dirname, "..", "public", "renders");
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, "test-short.mp4");

  const moment = {
    start: 2, end: 10,
    hookLine1: "덜 익은 토마토",
    hookLine2: "이게 디테일",
    comment: { name: "골든우", text: "이 조합 찬성이요...", likes: "494" },
  };
  const cues = [
    { start: 2.0, end: 5.0, text: "이번에 소바쥬 엑스트레를 처음 써봤습니다" },
    { start: 5.0, end: 8.0, text: "확산력이 확실히 센 편이라 존재감이 분명했어요" },
    { start: 8.0, end: 10.0, text: "은은한 향 좋아하시면 살짝 놀랄 수 있습니다" },
  ];

  console.log("쇼츠 합성 중…");
  const info = await s.renderShort(src, moment, dest, { cues, channel: "우수리미부부", theme: "light" });

  const size = fs.statSync(dest).size;
  console.log(`\n[ok] ${dest}`);
  console.log(`  크기 ${(size / 1048576).toFixed(1)}MB`);
  console.log(`  원본 ${info.srcW}x${info.srcH} → 잘라낸 폭 ${info.cropW}, 가로 위치 ${info.cropX}`);
  console.log(`  (가운데였다면 ${Math.round((info.srcW - info.cropW) / 2)} — 이 값과 다르면 피사체를 따라간 것입니다)`);

  // 결과에서 한 장 뽑아 눈으로 확인
  const shot = path.join(outDir, "test-short.png");
  await run(["-y", "-ss", "3", "-i", dest, "-frames:v", "1", shot]);
  console.log(`  미리보기 → ${shot}`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
