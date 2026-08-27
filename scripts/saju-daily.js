/**
 * 사주 부서 — 아침 지시서 만들기.
 *
 * 한 번 돌리면 오늘치 릴스 재료가 채널별로 나옵니다:
 *   바탕화면\포스팅 자료\사주\2026-08-28\연화\
 *     ├─ 대본.txt      (장면별 대본 + 상단 고정 문구)
 *     ├─ 캡션.txt      (인스타 캡션 + 해시태그 + DM 답문)
 *     └─ s0.jpg …     (장면 배경 그림 — Flow/캡컷에 바로 넣는 용)
 *
 * ⚠️ 올리는 건 사람이 합니다. 자동 업로드는 안 합니다(계정 안전 + 원칙).
 * ⚠️ 비용: 채널당 AI 호출 1~2번(대본+수선). 실측은 돌린 뒤 장부(spend)에 찍힙니다.
 *    이미지·캡션·해시태그는 AI 없이 만듭니다. 0원입니다.
 *
 * 쓰는 법:  node scripts/saju-daily.js          ← 오늘치 (채널 3개 전부)
 *          node scripts/saju-daily.js yeonhwa   ← 한 채널만
 */

// 서버(src/index.js)만 .env를 읽고 있었습니다. 홀로 도는 스크립트도 읽어야
// AI 열쇠를 만납니다 — 이거 없이는 "AI가 연결되지 않았습니다"가 됩니다.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const fs = require("fs");
const path = require("path");
const reels = require("../src/sajuReels");
const { CHARACTERS } = require("../src/characterImage");
const spend = require("../src/spend");

const BASE = "C:\\Users\\Admin\\Desktop\\포스팅 자료\\사주";

/** 캡션·해시태그 — 규칙으로 만듭니다. AI를 부를 일이 아닙니다. */
function caption(plan) {
  const z = plan.zodiac, t = plan.topic, ch = plan.channel;
  const tags = [
    `#${z.name}띠`, "#사주", "#오늘의운세", "#운세", `#${t.label.replace(/[·\s]/g, "")}`,
    "#사주풀이", "#릴스", "#무료사주",
  ];
  return [
    `${plan.hook} — ${z.name}띠 이야기`,
    "",
    plan.scenes[0],
    "",
    "타고난 시각까지 넣은 진짜 풀이는 프로필 링크에서 무료로 볼 수 있어요.",
    "",
    tags.join(" "),
    "",
    "── DM 답문 (복사해서 쓰세요) ──",
    `안녕하세요 :) ${z.name}띠 영상 보고 오셨죠?`,
    "프로필 링크 누르시면 생년월일만 넣고 무료로 사주 한 장 볼 수 있어요.",
    "타고난 시각까지 아시면 더 정확하게 나와요!",
  ].join("\n");
}

(async () => {
  const only = process.argv[2];
  const chans = Object.values(CHARACTERS).filter((c) => !only || c.id === only);
  if (!chans.length) {
    console.log("그런 채널이 없습니다. 되는 것:", Object.keys(CHARACTERS).join(", "));
    process.exit(1);
  }

  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const seed = reels.seedForDate();
  const outBase = path.join(BASE, day);
  const made = [];

  for (const ch of chans) {
    process.stdout.write(`■ ${ch.name}(${ch.handle}) 대본 만드는 중… `);
    try {
      const plan = await reels.planReel({ channel: ch.id, seed });
      if (plan.leftover && plan.leftover.length) {
        // ⚠️ 금지선(겁주기·단정·판매)을 못 고친 대본은 폴더에 넣지 않습니다.
        // 어중간한 대본이 올라가는 것보다 하루 빼먹는 게 낫습니다.
        console.log(`중단 — 걸린 표현이 남았습니다: ${plan.leftover.map((h) => h.word).join(", ")}`);
        continue;
      }
      const built = await reels.buildScenes(plan);

      const dir = path.join(outBase, ch.name);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < built.scenes.length; i++) {
        fs.copyFileSync(path.join(built.dir, `s${i}.jpg`), path.join(dir, `s${i}.jpg`));
      }
      fs.writeFileSync(path.join(dir, "대본.txt"),
        [`[${day} · ${ch.name} · ${plan.zodiac.name}띠 × ${plan.topic.label}]`,
         `상단 고정 문구: ${plan.hook}`, "",
         ...built.scenes.map((s, i) => `장면 ${i + 1}. ${s.caption}`),
        ].join("\n"), "utf8");
      fs.writeFileSync(path.join(dir, "캡션.txt"), caption(plan), "utf8");
      reels.cleanup(built.dir);

      console.log(`완료 (${plan.zodiac.name}띠 × ${plan.topic.label}, 장면 ${built.scenes.length}개)`);
      made.push({ ch: ch.name, z: plan.zodiac.name, t: plan.topic.label, dir });
    } catch (e) {
      console.log(`실패 — ${e.message}`);
    }
  }

  if (made.length) {
    // 지시서 — 아침에 이것만 보면 됩니다.
    fs.writeFileSync(path.join(outBase, "오늘의 지시서.txt"), [
      `${day} 사주 릴스 지시서`,
      "",
      ...made.map((m, i) => `${i + 1}. [${m.ch}] ${m.z}띠 × ${m.t} — 폴더: ${m.dir}`),
      "",
      "할 일:",
      "  1) 각 폴더의 s0~s5.jpg를 Flow(또는 캡컷)에 넣고 대본.txt 순서로 자막",
      "  2) 캡션.txt 내용으로 업로드 (해당 채널에)",
      "  3) 프로필 링크가 랜딩(landing.html)인지 확인",
      "  4) DM이 오면 캡션.txt 아래 'DM 답문'을 복사해 답장",
      "",
      "⚠️ 발행 버튼은 반드시 직접. 자동 업로드 없음.",
    ].join("\n"), "utf8");
  }

  const spent = (() => { try { return spend.status(); } catch { return null; } })();
  console.log(`\n오늘 폴더: ${outBase}`);
  if (spent) console.log(`오늘 AI 지출 장부: ${JSON.stringify(spent).slice(0, 200)}`);
})();
