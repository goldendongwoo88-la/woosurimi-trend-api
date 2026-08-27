/**
 * 자동 강조·인용구·소제목 시험.
 *
 * ⚠️ 제일 중요한 확인: **AI가 준 말이 본문에 그대로 있는가.**
 * 한 글자라도 다르면 편집기에서 못 찾고, 못 찾은 걸 모른 채
 * "강조했습니다"라고 말하게 됩니다.
 */
const E = require("../src/emphasis");
const { isConfigured } = require("../src/claudeClient");

const BODY = [
  "요즘 환절기 지나가면서 샤워하고 나면 피부가 당기는 느낌이 심해졌는데, 세정력 세다는 바디워시들은 오히려 뒤가 더 당기더라고요. 씻는 것과 보습을 따로 챙기는 게 귀찮아서 바디워시랑 바디로션을 세트로 맞춰 쓸 수 있는 제품을 찾다가 째피 핑크라인(소프트 리셋 + 글로우 업)을 2주 정도 써보게 됐습니다.",
  "",
  "✓ 소프트 리셋은 순하게 씻기면서도 세정 후 당김이 덜한 바디워시",
  "✓ 글로우 업은 씻고 난 직후 발라주면 촉촉함이 하루 종일 이어지는 바디로션",
  "",
  "■ 패키지 첫인상, 그리고 왜 이 제품을 쓰게 됐는지",
  "",
  "핑크색 바디에 노란 펌프, 레트로한 번개 로고까지 — 욕실에 그냥 올려만 놔도 예쁜 오브제 같은 디자인이라 첫인상부터 좋았어요. 소프트 리셋(바디워시)과 글로우 업(바디로션)이 같은 라인으로 나와서 나란히 두면 세트감도 확실하고요.",
  "",
  "■ 2주 써본 결과",
  "",
  "가격은 두 개 세트로 29,800원이었고 용량은 각각 300ml입니다. 다른 바디워시와 달리 씻고 난 뒤 10분이 지나도 당김이 없었어요. 저는 재구매 의사 있습니다.",
  "",
  "씻고 나면 당기는 그 느낌, 아시죠. 그게 없어진 게 제일 컸습니다.",
].join("\n");

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

(async () => {
  // ── AI 없이 되는 것 ──
  console.log("\n── 소제목 찾기 (AI 안 씀) ──");
  const fake = E.validate({ marks: [], quotes: [] }, { text: BODY, targets: E.PER_1000, chars: BODY.length });
  console.log("    찾은 소제목:", fake.subheads.map((s) => s.text).join(" / "));
  ok(fake.subheads.length === 2, "소제목 2개를 찾았다", fake.subheads.length + "개");
  ok(fake.subheads.every((s) => !/^[■\[#▶]/.test(s.text)), "표시(■)를 뗀 글자를 준다");

  console.log("\n── 본문에 없는 말은 버리는가 ──");
  const bad = E.validate({
    marks: [
      { text: "2주 사용", kind: "bold" },              // 본문은 "2주 정도 써보게" — 다듬은 말
      { text: "29,800원", kind: "color" },             // 본문에 그대로 있음
      { text: "가", kind: "bold" },                    // 너무 짧음
      { text: "이 문장은 정말 정말 정말 아주 길어서 강조로 쓸 수 없는 길이입니다", kind: "bold" },
    ],
    quotes: [{ text: "씻고 나면 당기는 그 느낌, 아시죠. 그게 없어진 게 제일 컸습니다." }],
  }, { text: BODY, targets: { bold: 9, underline: 6, highlight: 4, color: 3 }, chars: BODY.length });

  ok(bad.marks.length === 1 && bad.marks[0].text === "29,800원",
    "본문에 그대로 있는 것만 남았다", bad.marks.map((m) => m.text).join(","));
  ok(bad.dropped.some((d) => d.phrase === "2주 사용" && /그대로 없/.test(d.why)),
    "다듬은 말은 이유와 함께 버렸다");
  ok(bad.dropped.some((d) => d.phrase === "가"), "너무 짧은 것도 버렸다");
  ok(bad.quotes.length === 1, "인용구는 본문에 있어서 남았다", bad.quotes.length + "개");

  console.log("\n── 개수 한도 ──");
  const many = E.validate({
    marks: Array.from({ length: 20 }, (_, i) => ({ text: "당김", kind: "bold" })),
    quotes: [],
  }, { text: BODY, targets: { bold: 3, underline: 6, highlight: 4, color: 3 }, chars: BODY.length });
  ok(many.marks.length <= 3, "굵게 한도(3개)를 안 넘는다", many.marks.length + "개");

  if (!isConfigured()) {
    console.log("\n(ANTHROPIC_API_KEY가 없어 AI 부분은 건너뜁니다)");
    console.log(`\n  통과 ${pass} · 실패 ${fail}`);
    process.exit(fail ? 1 : 0);
  }

  // ── 진짜 AI로 ──
  console.log("\n── AI가 실제로 골라오는가 ──");
  const t = Date.now();
  const r = await E.plan({
    title: "째피 핑크라인 소프트 리셋 글로우 업, 샤워 후 촉촉하게 이어진 바디로션 루틴 후기",
    body: BODY,
  });
  console.log(`    ${Date.now() - t}ms · 본문 ${r.chars}자`);
  if (!r.ok) { ok(false, "AI가 답했다", r.why); }
  else {
    console.log(`    기준: 굵게 ${r.targets.bold} · 밑줄 ${r.targets.underline} · 배경색 ${r.targets.highlight} · 글자색 ${r.targets.color}`);
    console.log(`    실제: 굵게 ${r.used.bold} · 밑줄 ${r.used.underline} · 배경색 ${r.used.highlight} · 글자색 ${r.used.color}`);
    console.log("");
    for (const m of r.marks) console.log(`    [${m.label}] "${m.text}"  — ${m.why}`);
    console.log("");
    for (const q of r.quotes) console.log(`    [인용구] "${q.text}"  — ${q.why}`);
    if (r.dropped.length) {
      console.log("");
      console.log(`    버린 것 ${r.dropped.length}개:`);
      for (const d of r.dropped.slice(0, 4)) console.log(`      "${d.phrase}" — ${d.why}`);
    }

    ok(r.marks.length > 0, "강조할 자리를 찾았다", r.marks.length + "곳");
    ok(r.marks.every((m) => BODY.includes(m.text)),
      "남은 것은 전부 본문에 그대로 있다  ← 제일 중요");
    ok(r.quotes.every((q) => BODY.includes(q.text)), "인용구도 본문에 그대로 있다");
    ok(r.subheads.length === 2, "소제목도 함께 찾았다", r.subheads.length + "개");
    ok(new Set(r.marks.map((m) => m.kind)).size >= 2,
      "한 가지만 쓰지 않는다 (사장님 블로그의 문제)",
      [...new Set(r.marks.map((m) => m.label))].join(","));
    ok(r.used.bold <= r.targets.bold && r.used.color <= r.targets.color, "한도를 안 넘었다");
    // 브랜드·가격이 잡혔는지 — 사장님이 콕 집어 말씀하신 것입니다
    const all = r.marks.map((m) => m.text).join(" ");
    ok(/째피|핑크라인|소프트 리셋|글로우 업/.test(all), "브랜드·제품명을 잡았다");
    ok(/29,800|300ml|2주/.test(all), "가격·용량·기간을 잡았다");
  }

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
