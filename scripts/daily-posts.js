#!/usr/bin/env node
/**
 * 매일 포스팅 도우미.
 *
 *   node scripts/daily-posts.js          ← 무엇을 할지 보여만 줍니다 (0원)
 *   node scripts/daily-posts.js --go     ← 실제로 원고를 만듭니다 (값 나감)
 *
 * ⚠️ 그냥 실행하면 **아무 값도 안 나갑니다.** 폴더를 읽고 계획만 보여드립니다.
 * 값이 나가는 건 --go 를 붙였을 때뿐이고, 그때도 얼마인지 먼저 보여드립니다.
 *
 * ⚠️ 큰 스킬 5개는 절대 안 부릅니다 (사장님 명령).
 */

const fs = require("fs");
const path = require("path");
const A = require("../src/postingAgent");
const D = require("../extension/content/draft-parser.js");

const KRW = 1380;
const GO = process.argv.includes("--go");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);

const line = (n = 62) => "─".repeat(n);

/** 주인 계정의 브랜드 설정. 계정이 없으면 null — 그래도 글은 씁니다. */
function accountsOf(email) {
  if (!email) return null;
  try { return require("../src/accounts").getBrandKit(email); } catch { return null; }
}

(async () => {
  const r = A.listJobs();
  if (!r.ok) {
    console.log(`\n${r.why}`);
    console.log("먼저 폴더를 만들어 주세요. 안에 '여기에 뭘 넣나요.md'가 있습니다.\n");
    process.exit(1);
  }

  let jobs = r.jobs;
  if (ONLY) jobs = jobs.filter((j) => j.name.includes(ONLY));

  console.log(`\n폴더: ${r.root}`);
  if (!jobs.length) {
    console.log("\n오늘 쓸 것이 없습니다.");
    console.log("'1. 오늘 쓸 것' 안에 글 하나당 폴더 하나를 만들고,");
    console.log("가이드.txt 와 사진을 넣어주세요.\n");
    process.exit(0);
  }

  console.log(`오늘 쓸 것: ${jobs.length}개\n`);
  console.log(line());

  const ready = [];
  for (const j of jobs) {
    console.log(`\n■ ${j.name}`);
    console.log(`  키워드 : ${j.guide.keyword || "(모름)"}${j.guide.guessedKeyword ? "  ← 첫 줄에서 짐작했습니다" : ""}`);
    console.log(`  스킬   : ${j.skill}  (${j.topic})`);
    console.log(`           ${j.why}`);
    console.log(`  협찬   : ${j.guide.sponsored === true ? "예 → 내 글 링크 안 넣습니다" : j.guide.sponsored === false ? "아니오 → 내 글 링크 2개 넣습니다" : "안 적혀 있습니다 → 안 넣는 쪽으로 갑니다"}`);
    console.log(`  사진   : ${j.photos.length}장${j.videos.length ? ` · 영상 ${j.videos.length}개` : ""}`);
    if (j.guide.must.length) console.log(`  꼭 넣을: ${j.guide.must.join(", ")}`);
    if (j.guide.avoid.length) console.log(`  뺄 말  : ${j.guide.avoid.join(", ")}`);

    if (j.problems.length) {
      console.log(`  ⚠️ 이대로는 못 만듭니다:`);
      for (const p of j.problems) console.log(`     · ${p}`);
      continue;
    }
    // 실측 기준 — 패션·뷰티는 사진 15~17장이 필요합니다.
    const wantPhotos = j.topic === "연예·방송" ? 10 : 15;
    if (j.photos.length < wantPhotos) {
      console.log(`  ⚠️ 사진이 ${j.photos.length}장입니다. ${A.josa(j.topic, "은", "는")} ${wantPhotos}장쯤 필요합니다.`);
      console.log(`     만들긴 합니다. 자리는 비워둘게요.`);
    }
    ready.push(j);
  }

  console.log(`\n${line()}`);

  if (!ready.length) {
    console.log("\n만들 수 있는 게 없습니다. 위의 ⚠️ 를 채워주세요.\n");
    process.exit(0);
  }

  // ── 값 ──
  // ⚠️ 값이 나가기 전에 반드시 먼저 보여드립니다.
  //
  // ⚠️ 스킬마다 값이 다릅니다. 큰 스킬(celebrity-gossip 36,732자)은
  // 작은 스킬(fashion-review 5,844자)보다 3배 비쌉니다.
  // 한 값으로 뭉뚱그리면 어느 글이 비싼지 모르게 됩니다.
  const studio0 = require("../src/promptStudio");
  let total = 0;
  console.log(`\n만들 수 있는 것: ${ready.length}개`);
  console.log(`\n  글                         스킬               예상 값`);
  console.log(`  ${line(56)}`);
  for (const j of ready) {
    const t = studio0.findTool(j.skill);
    j.won = A.estimate(String((t && t.system) || "").length);
    total += j.won;
    console.log(`  ${j.name.slice(0, 22).padEnd(24)} ${j.skill.padEnd(18)} ${(j.won + "원").padStart(6)}`);
  }
  console.log(`  ${line(56)}`);
  console.log(`  합계${" ".repeat(40)}${(total.toLocaleString() + "원").padStart(6)}`);
  console.log(`\n같은 스킬을 1시간 안에 또 쓰면 두 번째부터는 훨씬 쌉니다(캐시).`);
  console.log(`진짜 값은 만든 뒤에 알려드립니다.`);

  if (!GO) {
    console.log(`\n${line()}`);
    console.log("\n지금은 **아무 값도 안 나갔습니다.** 보여드리기만 했습니다.");
    console.log("실제로 만들려면:");
    console.log("\n    node scripts/daily-posts.js --go\n");
    process.exit(0);
  }

  // ── 실제로 만듭니다 ──
  const claude = require("../src/claudeClient");
  const studio = require("../src/promptStudio");
  const spend = require("../src/spend");
  const rules = require("../src/homefeedRules");
  const brandKit = require("../src/brandKit");

  /**
   * 브랜드 설정을 가져옵니다.
   *
   * ⚠️ 이 도구는 명령창에서 도니까 로그인 쿠키가 없습니다.
   * 그래서 주인 계정(OWNER_EMAIL)의 설정을 직접 읽습니다.
   * 없으면 빈 값으로 갑니다 — 설정을 안 하셨다고 글을 못 쓰면 안 됩니다.
   */
  let brandBlock = "";
  try {
    const kit = accountsOf(process.env.OWNER_EMAIL);
    if (kit) {
      brandBlock = brandKit.promptBlock(kit);
      if (brandBlock) console.log(`브랜드 설정을 반영합니다 (${brandKit.status(kit).percent}% 채우심)\n`);
    }
  } catch {}

  if (!claude.isConfigured()) {
    console.log("\n서버에 AI 열쇠(ANTHROPIC_API_KEY)가 없습니다.\n");
    process.exit(1);
  }

  console.log(`\n${line()}\n`);
  const before = spend.status().usd;
  const results = [];

  for (const j of ready) {
    // ⚠️ 두 겹으로 막습니다. 여기서 한 번 더 봅니다.
    if (A.BANNED.has(j.skill)) {
      console.log(`■ ${j.name} — ${j.skill}은 부르지 말라고 하셔서 건너뜁니다.`);
      continue;
    }
    process.stdout.write(`■ ${j.name} … `);

    // 이 주제의 실측 기준. 분량 지시를 구조로 만들 때 씁니다.
    const g = rules.BODY.byTopic[j.topic];
    // 목표 글자수 ÷ 문단 길이 = 필요한 문단 수. 숫자를 손으로 적으면 반드시 틀립니다.
    const totalParas = Math.round(g.chars.mid / (g.paraLen.mid || 16));
    const perSection = Math.max(4, Math.round(totalParas / Math.max(1, g.subheads.mid)));

    const ask = [
      `키워드: ${j.guide.keyword}`,
      j.guide.must.length ? `꼭 넣을 말: ${j.guide.must.join(", ")}` : "",
      j.guide.avoid.length ? `빼야 할 말: ${j.guide.avoid.join(", ")}` : "",
      j.guide.sponsored ? "이 글은 협찬입니다. 다른 글로 보내는 링크는 넣지 마세요." : "",
      `쓸 수 있는 사진: ${j.photos.length}장`,
      "",
      rules.bodyBlock(j.topic),
      "",
      // ⚠️ 브랜드 설정(말투·페르소나·안 쓰는 말·해시태그·맺음말)을 여기 끼웁니다.
      // 안 채우셨으면 빈 글자라 아무 일도 안 일어납니다. 채우실수록 글이 사장님답게 나옵니다.
      brandBlock,
      brandBlock ? "" : null,
      "위 기준대로 **본문만** 써주세요. 제목 후보 목록은 필요 없습니다.",
      "소제목은 ■ 로, 사진 자리는 [사진: 무엇] 으로, 강조할 말은 **이렇게** 표시해 주세요.",
      "",
      // ⚠️ "1,370자 이상 쓰세요"는 안 먹힙니다. 앞서 확인했습니다 —
      // "45자 넘게 쓰지 마세요"라고 했더니 50%가 45자를 넘었습니다(최장 129자).
      // AI는 글자를 못 셉니다. **구조로 시키면** 먹힙니다.
      // 실제로 이 지시 없이 돌렸더니 588자가 나왔습니다. 목표의 절반도 안 됩니다.
      // ⚠️ 여기 숫자를 손으로 적으면 안 됩니다. 실제로 그러다 틀렸습니다.
      // "소제목 4개 × 문단 6~8개"라고 적었더니 AI가 **정확히 그대로** 31문단을 썼고,
      // 결과는 572자였습니다. 목표는 900~1,700자였는데요.
      // AI가 안 따른 게 아니라 **제가 계산을 안 하고 숫자를 적은 것**이었습니다.
      //
      // 실측값에서 뽑아냅니다: 목표 글자수 ÷ 문단 길이 = 필요한 문단 수.
      // 연예·방송이면 1,300자 ÷ 13자 = 100문단. 많아 보이지만 실제로 그렇습니다.
      // 네이버 모바일 글은 한 문장씩 끊어서 아주 잘게 나뉩니다.
      `**분량은 이렇게 채우세요 (세면서 쓰세요):**`,
      `1. 소제목을 **${g.subheads.mid}개** 만듭니다.`,
      `2. 소제목 하나 아래에 **문단을 ${perSection}개** 씁니다. 문단 하나는 문장 하나입니다.`,
      `3. 그러면 문단이 모두 **${totalParas}개**가 됩니다. 이게 ${g.chars.mid}자쯤 됩니다.`,
      `   ⚠️ 많아 보여도 맞습니다. 실제 상위 블로그가 이렇게 씁니다.`,
      `4. 문단이 모자라면 **더 구체적으로** 쓰세요 — 언제, 어디서, 얼마에, 어떤 느낌이었는지.`,
      `   늘리려고 같은 말을 다시 하지는 마세요. 그럴 바엔 짧은 게 낫습니다.`,
      "",
      "⚠️ 다 쓰고 나서 설명을 덧붙이지 마세요. 글자 수나 '참고' 같은 메모도 적지 마세요.",
      "⚠️ ``` 로 감싸지 마세요. 본문만 그대로 주세요.",
      j.guide.notes ? `\n[사장님 메모]\n${j.guide.notes.slice(0, 800)}` : "",
    ].filter(Boolean).join("\n");

    let text;
    try {
      // 본문 전체를 한 번에 받습니다. 2,100자 한글이면 2,200토큰으론 모자랍니다.
      text = await studio.runTool(j.skill, [{ role: "user", content: ask }], { maxTokens: 5000 });
    } catch (e) {
      console.log(`✗ ${e.message}`);
      results.push({ j, ok: false, why: e.message });
      continue;
    }
    const u = claude.getLastUsage();

    const draft = D.parse(text);
    const match = A.matchPhotos(draft.blocks, j.photos);

    // 원고와 사진 배치표를 폴더에 넣어드립니다.
    fs.writeFileSync(path.join(j.dir, "원고.txt"), text, "utf8");
    fs.writeFileSync(path.join(j.dir, "사진 배치.txt"), A.photoSheet(j, draft.blocks, match), "utf8");

    console.log(`✓ ${draft.stats.chars.toLocaleString()}자 · 소제목 ${draft.stats.subheads} · 사진자리 ${draft.stats.photos} · ${Math.round(u.usd * KRW)}원`);
    results.push({ j, ok: true, draft, match, usd: u.usd });
  }

  // ── 기준값과 견줘보기 (AI 안 씀) ──
  console.log(`\n${line()}\n`);
  console.log("기준값과 견줘봅니다 (실측: 블로그 27개 · 글 162편)\n");
  for (const r of results.filter((x) => x.ok)) {
    const g = rules.BODY.byTopic[r.j.topic];
    const s = r.draft.stats;
    const off = [];
    if (s.chars < g.chars.min || s.chars > g.chars.max) off.push(`글자 ${s.chars}자 (${g.chars.min}~${g.chars.max})`);
    if (s.subheads < g.subheads.min || s.subheads > g.subheads.max) off.push(`소제목 ${s.subheads}개 (${g.subheads.min}~${g.subheads.max})`);
    // ⚠️ 사진 자리는 **넣어주신 사진 장수**를 넘을 수 없습니다.
    // 5장 주시고 15곳을 만들면 10곳이 빈 채로 남습니다. 그게 더 나쁩니다.
    // 그래서 사진이 모자란 건 원고 탓이 아니라 **사진이 모자란 것**이라고 말해야 합니다.
    const canDo = Math.min(g.images.max, r.j.photos.length);
    if (r.j.photos.length < g.images.min) {
      off.push(`사진을 ${r.j.photos.length}장 주셨습니다 (${g.images.min}~${g.images.max}장 필요)`);
    } else if (s.photos < g.images.min || s.photos > canDo) {
      off.push(`사진자리 ${s.photos}곳 (${g.images.min}~${canDo})`);
    }
    if (s.over45 > 5) off.push(`45자 넘는 문단 ${s.over45}%`);
    console.log(`  ${r.j.name}`);
    console.log(`    ${off.length ? "⚠️ " + off.join(" · ") : "✓ 모두 기준 안"}`);
    if (r.match.short) console.log(`    ⚠️ 사진이 ${r.match.short}장 모자랍니다`);
    if (r.match.leftover.length) console.log(`    · 안 쓰는 사진 ${r.match.leftover.length}장`);
  }

  const spent = spend.status().usd - before;
  console.log(`\n${line()}`);
  console.log(`\n만든 것: ${results.filter((x) => x.ok).length}개 · 실패 ${results.filter((x) => !x.ok).length}개`);
  console.log(`쓴 값: 약 ${Math.round(spent * KRW).toLocaleString()}원 (예상 ${total.toLocaleString()}원)`);
  console.log(`오늘 누적: ${spend.status().krw.toLocaleString()}원`);
  console.log(`\n각 폴더에 '원고.txt'와 '사진 배치.txt'를 넣어뒀습니다.`);
  console.log(`원고.txt 를 복사해서 네이버 편집기에 붙이시고,`);
  console.log(`확장 프로그램의 '자동 서식' → '함께보기' → '마무리'를 차례로 누르시면 됩니다.\n`);
})().catch((e) => { console.error("\n터졌습니다:", e.message); process.exit(1); });
