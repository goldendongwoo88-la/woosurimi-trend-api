/**
 * 일주일치 사주 릴스를 미리 만들어 둡니다.
 *
 * ⚠️ 도구를 만들어드려도 매번 버튼을 누르는 건 일입니다. 그러다 안 올리게 되고,
 * 안 올리면 사람이 안 오고, 사람이 안 오면 안 팔립니다.
 * 미리 만들어두면 아침에 받아서 올리기만 하면 됩니다. 그 차이가 큽니다.
 *
 * ⚠️ 띠와 주제를 섞습니다. 같은 주제를 연달아 올리면 계정이 단조로워 보입니다.
 */

require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const R = require("../src/sajuReels");
const { renderShortformVideo, RENDERS_DIR } = require("../src/videoRenderer");

const DAYS = Number(process.argv[2]) || 7;
const OUT = path.join(__dirname, "..", "public", "downloads", "reels");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const base = R.seedForDate();
  const made = [];

  for (let i = 0; i < DAYS; i++) {
    // ⚠️ 씨앗 하나로 띠와 주제를 둘 다 정하려니 안 됐습니다.
    // 씨앗을 +5씩 더해봤는데 띠만 바뀌고 주제는 그대로였어요.
    // 12로 나눈 몫이 잘 안 변해서입니다 — 실제로 1편과 2편이 둘 다
    // "잘 맞는 사람"으로 나왔습니다. 연달아 같은 주제면 계정이 단조로워 보입니다.
    //
    // 그래서 띠와 주제를 각각 따로 돌립니다. 주제 개수(8)와 띠 개수(12)가
    // 서로 나누어떨어지지 않아서, 이렇게 하면 한참 동안 같은 조합이 안 나옵니다.
    const z = R.ZODIAC[(base + i) % R.ZODIAC.length];
    const t = R.TOPICS[(Math.floor(base / 7) + i) % R.TOPICS.length];
    const t0 = Date.now();
    process.stdout.write(`${i + 1}/${DAYS} `);

    try {
      const plan = await R.planReel({ zodiac: z.id, topic: t.id });
      process.stdout.write(`${plan.zodiac.name}띠·${plan.topic.label} `);

      const { dir, scenes } = await R.buildScenes(plan);
      const out = await renderShortformVideo(scenes, {
        durationPerScene: 4,
        frameStyle: "full",
        templateId: "bold-black",
        hookText: plan.hook,
        transition: "cut",
        encodePreset: "veryfast",
        // 남녀 목소리를 번갈아 씁니다. 같은 목소리만 나오면 금방 질립니다.
        voice: {
          provider: "azure",
          voiceId: i % 2 ? "ko-KR-HyunsuMultilingualNeural" : "ko-KR-SunHiNeural",
        },
      });
      R.cleanup(dir);

      // 파일 이름만 봐도 무엇인지 알게 합니다. 일곱 개가 쌓이면 헷갈립니다.
      const nice = `${String(i + 1).padStart(2, "0")}_${plan.zodiac.name}띠_${plan.topic.label}.mp4`;
      fs.copyFileSync(path.join(RENDERS_DIR, out.fileName), path.join(OUT, nice));

      const cap =
        `${plan.hook}\n\n` +
        plan.scenes.slice(1, -1).map((s) => `· ${s}`).join("\n") +
        `\n\n띠로 보는 건 여기까지고요,\n태어난 시각까지 넣으면 훨씬 정확하게 나옵니다.\n` +
        `프로필 링크에서 무료로 보실 수 있어요.\n\n` +
        ["사주", "사주풀이", "무료사주", `${plan.zodiac.name}띠`, "오늘의운세", "운세",
         "궁합", "사주보는곳", "만세력", "띠별운세", "일상", "데일리"]
          .map((t) => "#" + t).join(" ");
      fs.writeFileSync(path.join(OUT, nice.replace(/\.mp4$/, ".txt")), cap, "utf8");

      made.push({ file: nice, seconds: Math.round(out.durationSec), leftover: plan.leftover.length });
      console.log(`${((Date.now() - t0) / 1000).toFixed(0)}초 · ${Math.round(out.durationSec)}초` +
        (plan.leftover.length ? ` · ⚠ 확인 필요 ${plan.leftover.length}곳` : ""));
    } catch (e) {
      console.log(`실패 — ${e.message.slice(0, 90)}`);
    }
  }

  // 올릴 순서를 적어둡니다. 파일만 있으면 뭘 먼저 올릴지 또 고민하게 됩니다.
  const guide =
    `우수리미 사주 릴스 — ${made.length}편\n` +
    `${"─".repeat(40)}\n\n` +
    `하루 한 편씩 올리시면 됩니다.\n` +
    `영상 옆의 같은 이름 .txt 파일에 올릴 문구와 해시태그가 들어 있습니다.\n\n` +
    `올릴 곳: 인스타 릴스 · 유튜브 쇼츠 · 틱톡 · 네이버 클립\n` +
    `한 편을 네 군데에 그대로 올리시면 됩니다.\n\n` +
    `⚠️ 프로필 링크를 무료 사주 페이지로 걸어두셔야 합니다.\n` +
    `   릴스가 사람을 그리로 보냅니다.\n\n` +
    made.map((m, i) => `${i + 1}일차  ${m.file}  (${m.seconds}초)` +
      (m.leftover ? `  ⚠ 대본 확인 필요` : "")).join("\n");
  fs.writeFileSync(path.join(OUT, "0_올리는_순서.txt"), guide, "utf8");

  console.log(`\n${made.length}편 완성 → public/downloads/reels/`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
