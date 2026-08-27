/**
 * 메이트식 연예인 정보성 원고 — 실측 제목 문법으로 뷰티 1편 + 패션 1편.
 *
 * ⚠️ 비용: celeb-beauty·celeb-fashion 스킬 각 1회 ≈ 편당 100원 안팎. 장부(spend)에 찍힙니다.
 * ⚠️ 큰 스킬 5종(금지 목록)은 부르지 않습니다 — SKIP_IN_TOOLING이 이중으로 막습니다.
 * ⚠️ 발행하지 않습니다. 원고 파일만 만듭니다. 사진은 [사진: …] 자리로 남깁니다.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const fs = require("fs");
const path = require("path");
const { runTool, SKIP_IN_TOOLING } = require("../src/promptStudio");
const rules = require("../src/homefeedRules");
const { suggest } = require("../src/mateTitles");
const { collect } = require("../src/hotIssues");

const OUT = "C:\\Users\\Admin\\Desktop\\포스팅 자료\\원고";

(async () => {
  let hot = null;
  try { hot = await collect(); } catch {}

  // 추천기의 1~2순위 제목을 그대로 주제로 씁니다 — 실측 근거가 있는 제목이므로.
  const beauty = suggest("beauty", hot, 3).items;
  const fashion = suggest("fashion", hot, 3).items;

  // 갈래 하나만 다시 뽑을 수도 있습니다: node scripts/mate-drafts.js fashion
  const only = process.argv[2];
  const JOBS = [
    { key: "beauty", skill: "celeb-beauty", area: "뷰티(골든)", pick: beauty[1] || beauty[0] },
    { key: "fashion", skill: "celeb-fashion", area: "패션(차수리미)", pick: fashion[1] || fashion[0] },
  ].filter((j) => !only || j.key === only);

  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const dir = path.join(OUT, `${day}-메이트`);
  fs.mkdirSync(dir, { recursive: true });

  const g = (rules.BODY && rules.BODY.byTopic && rules.BODY.byTopic["연예·방송"]) || null;
  const lenLine = g
    ? `본문 ${g.chars.mid}자 안팎, 문단은 ${g.paraLen.mid}자 안팎으로 짧게 끊어주세요.`
    : "본문 1,000자 안팎, 문단은 30~40자로 짧게 끊어주세요.";

  for (const job of JOBS) {
    if (SKIP_IN_TOOLING.has(job.skill)) { console.log(`${job.skill}: 금지 목록 — 건너뜀`); continue; }
    const topic = job.pick.title;
    process.stdout.write(`■ ${job.area} — "${topic}" 쓰는 중… `);
    try {
      const t = Date.now();
      const out = await runTool(job.skill, [
        { role: "user", content: `주제: ${topic}` },
        { role: "assistant", content: "알겠습니다. 어느 단계를 진행할까요?" },
        {
          role: "user",
          content:
            "단계를 건너뛰고 **본문만** 바로 써주세요.\n" +
            "제목 목록·팩트체크·이미지 프롬프트는 내지 마세요.\n" +
            "제목 한 줄(# 로 시작)과 본문만 주세요.\n" +
            "소제목은 ■ 로 6개 안팎, 사진 자리는 [사진: 무엇] 으로 표시해 주세요.\n" +
            lenLine + "\n" +
            "⚠️ 확인 안 된 사생활·열애 얘기는 쓰지 마세요. 화면에 보이는 스타일 정보만.\n" +
            "⚠️ 특정 제품을 확정으로 단정하지 마세요 — '~로 알려져 있다', '~와 비슷한 계열' 선까지.",
        },
      ]);
      const text = typeof out === "string" ? out : (out && (out.text || out.content || ""));
      if (!text || text.replace(/\s/g, "").length < 300) throw new Error("본문이 너무 짧게 왔습니다");
      const file = path.join(dir, `${job.area.replace(/[()]/g, "")}-원고.txt`);
      fs.writeFileSync(file, text, "utf8");
      console.log(`완료 (${Math.round((Date.now() - t) / 1000)}초, ${text.length.toLocaleString()}자) → ${path.basename(file)}`);
    } catch (e) {
      console.log(`실패 — ${e.message}`);
    }
  }

  try {
    const spend = require("../src/spend").status();
    console.log(`\n오늘 AI 지출: ${spend.krw}원 (${spend.calls}회)`);
  } catch {}
  console.log(`원고 폴더: ${dir}`);
})();
