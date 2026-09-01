// 홈쇼핑 편성표 → 오늘 만들 쇼핑쇼츠 (2026-09-02)
//
//   node scripts/home-shopping.js [--top 8] [--date 20260902] [--month 11]
//
// 하는 일: 홈쇼핑이 오늘 뭘 파는지 받아 → 품목 정규화 → 보완재로 한 발자국 →
//          구매력 점수로 정렬 → 대본 초안까지 뽑고 자가 채점
//
// 왜 본품을 안 하고 보완재로 넘어가는지, 왜 조회수가 아니라 구매력으로 고르는지는
// docs/돈농부-김정빈-라이브분석-2026-0901.md 를 보십시오. 전부 실측 근거가 있습니다.
//
// AI를 안 씁니다. 0원.

const HS = require("../src/homeShoppingSchedule");
const SIG = require("../src/shoppingSignals");
const SD = require("../src/scriptDraft");
let SC = null;
try { SC = require("../../_shared/script-check"); } catch { /* 없어도 나머지는 돕니다 */ }

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const top = Number(opt("--top", 8));
const date = opt("--date", HS.ymd());
const month = Number(opt("--month", new Date().getMonth() + 1));

(async () => {
  console.log(`\n■ 홈쇼핑 편성표 → 오늘 만들 쇼츠  (${date} 기준, ${month}월 시즌 적용)\n`);

  const r = await HS.fetchSchedule(date);
  console.log(`1/3  편성 수집 — ${r.items.length}건 (${r.소스별.map((s) => `${s.소스} ${s.편성}`).join(", ")})`);
  for (const e of r.errors) console.log(`     ⚠ ${e}`);
  for (const m of r.미해결) console.log(`     · 미해결: ${m}`);
  if (!r.items.length) return console.log("\n편성을 못 받았습니다. 사이트 구조가 바뀌었는지 보십시오.\n");

  const 시즌 = SIG.시즌배율(month);
  console.log(`\n2/3  한 발자국 더 (본품 → 보완재) · 시즌: ${시즌.이름} ×${시즌.v}`);
  const cands = HS.toCandidates(r.items, SIG, { top, month });
  const 보완 = cands.filter((c) => c.유형 === "보완재").length;
  console.log(`     후보 ${cands.length}개 (보완재 ${보완} / 본품 ${cands.length - 보완})\n`);

  console.log("3/3  기획 + 대본 초안\n");
  for (const [i, c] of cands.entries()) {
    const cat = SIG.inferCategory(c.제품);
    const sd = SD.draft(c.제품, { category: cat, price: 0 });
    const sc = SC ? SC.checkScript(sd.text) : null;
    console.log(`${String(i + 1).padStart(2)}. [${c.등급}] 구매력 ${c.구매력}배 · ${c.제품}`);
    console.log(`    유래: ${c.방송시간} "${c.원본.slice(0, 34)}" → ${c.품목}`);
    console.log(`    화자: ${sd.persona.화자} · 훅: ${sd.hookType} · CTA: 댓글에 "${sd.ctaKeyword}"`);
    /**
     * 빈칸은 실패가 아니라 **여기까지가 코드가 할 수 있는 일**이라는 뜻입니다.
     * 근거는 제품 상세를 봐야 나오고 지어내면 허위광고라 코드가 안 씁니다.
     * 그런데 전부 "✗"로 찍히니 다 실패한 것처럼 보였습니다. 상태를 구분해 씁니다.
     */
    if (sc) {
      const 상태 = sc.pass ? "✓ 발행 가능"
                 : sc.빈칸 ? `◐ 초안 — 근거 ${sc.빈칸}칸만 채우면 됩니다`
                 : `✗ ${sc.고칠것[0] || ""}`;
      console.log(`    대본: ${sc.예상초}초 ${sc.score}점 ${상태}`);
    }
    console.log(`    훅  : ${sd.줄[0].문장}`);
    console.log("");
  }

  console.log("── 올리기 전에 ──");
  for (const g of SIG.계정규칙.filter((x) => x.금지).slice(0, 4)) console.log(`  🚫 ${g.규칙} → ${g.결과}`);
  console.log(`  ⚠ 쿠팡에 이 물건이 실제로 있는지 확인 전에는 렌더로 넘기지 마십시오.`);
  if (!SIG.쿠팡수수료.확정) console.log(`  🔶 ${SIG.쿠팡수수료.해야할것}`);
  const 미가입 = SIG.제휴처.filter((x) => x.상태 === "미가입");
  if (미가입.length) console.log(`  🔶 제휴처 미가입: ${미가입.map((x) => `${x.이름}(${x.수수료})`).join(", ")}`);
  console.log("");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
