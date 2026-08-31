// 쇼츠 화면(훅 2줄 + 댓글 카드) 렌더 확인용. 영상 없이 겉꾸미기만 그려봅니다.
// 사용: node scripts/test-shorts-frame.js [출력폴더]
const fs = require("fs");
const path = require("path");
const s = require("../src/shortsStudio");

const outDir = process.argv[2] || path.join(__dirname, "..", "public", "renders");

const CASES = [
  {
    file: "frame-light.png", theme: "light",
    hookLine1: "덜 익은 토마토", hookLine2: "이게 디테일",
    comment: { name: "골든우", text: "이 조합 찬성이요...", likes: "494" },
    channel: "우수리미부부",
  },
  {
    file: "frame-dark.png", theme: "dark",
    hookLine1: "초반부터 절망", hookLine2: "이 포켓몬 왜 이렇게 약해",
    comment: { name: "시청자", text: "맛이 어떨지 진짜 궁금합니다", likes: "4.1만" },
    channel: "지구로그",
  },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const c of CASES) {
    const png = await s.buildFramePng(c);
    const dest = path.join(outDir, c.file);
    fs.writeFileSync(dest, png);
    console.log(`[ok] ${c.file}  ${(png.length / 1024).toFixed(0)}KB  → ${dest}`);
  }
  console.log(`\n배치: 훅 y${s.LAYOUT.hookTop} / 영상 y${s.LAYOUT.videoTop}~${s.LAYOUT.videoTop + s.LAYOUT.videoH} / 댓글 y${s.LAYOUT.commentTop} (전체 ${s.H})`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
