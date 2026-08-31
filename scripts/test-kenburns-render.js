/**
 * 켄번즈(대각선 줌/팬) 개선 확인용 테스트 렌더.
 * AI 대본 생성은 건너뛰고(비용 없음), 이미 나간 01_토끼띠 편의 문구를 그대로 재사용해서
 * 배경(무료 로컬 SVG 그라디언트)만 새로 만들고 렌더러를 돌립니다.
 */
require("dotenv").config({ override: true });
const path = require("path");
const { ZODIAC, makeBackground } = require("../src/sajuReels");
const { renderShortformVideo } = require("../src/videoRenderer");
const fs = require("fs");

const CAPTIONS = [
  "이 사람들은 눈치가 빨라서 상대 기분을 먼저 읽어요. 그런데 그걸 너무 믿습니다",
  "상대가 불편해 보이면 내가 뭘 잘못했나 돌아보는데, 사실 그 사람은 그냥 피곤했던 거예요",
  "그리고 갈등을 피하려다 보니 말을 안 하고 참는 쪽을 선택하는데, 그게 쌓입니다",
  "결국 혼자 지쳐서 관계를 끊어버리거나, 어느 날 한 번에 터뜨리게 되죠",
];

async function main() {
  const z = ZODIAC.find((x) => x.id === "rabbit");
  const jobId = "kenburns-test";
  const dir = path.join(__dirname, "..", "public", "uploads", "saju-reels", jobId);
  fs.mkdirSync(dir, { recursive: true });

  const scenes = [];
  for (let i = 0; i < CAPTIONS.length; i++) {
    const file = path.join(dir, `s${i}.jpg`);
    await makeBackground(z, i, file, null);
    scenes.push({ caption: CAPTIONS[i], image: `/uploads/saju-reels/${jobId}/s${i}.jpg` });
  }

  console.log("장면 배경 준비 완료. 렌더 시작...");
  const result = await renderShortformVideo(scenes, {
    durationPerScene: 3,
    animate: true,
    templateId: "bold-black",
    hookText: "토끼띠가 힘든 이유",
    encodePreset: "veryfast",
    onPhase: (phase) => console.log(" -", phase),
  });

  console.log("\n완료:", result);
}

main().catch((e) => { console.error("실패:", e); process.exit(1); });
