/**
 * **AI가 실제로 쓴 원고가 새 기준을 지키는지** 잽니다.
 *
 * ⚠️ 규칙 파일만 고치고 "적용했습니다"라고 말하면 안 됩니다.
 * 프롬프트에 숫자가 들어간 것과, AI가 그 숫자대로 쓰는 것은 다릅니다.
 * 예전에 "500자로 쓰세요"라고 했더니 360자를 써온 적이 있습니다.
 * 실제로 뽑아서 세어봐야 압니다.
 */
const { runTool } = require("../src/promptStudio");
const rules = require("../src/homefeedRules");

const INVIS = /[\s​-‍⁠﻿]/g;
const vis = (s) => String(s || "").replace(INVIS, "").length;

const CASES = [
  {
    skill: "fashion-review",
    topic: "째피 핑크라인 소프트 리셋 바디워시 + 글로우 업 바디로션 2주 사용 후기",
    want: "패션·뷰티",
  },
  {
    skill: "celeb-beauty",
    topic: "카리나 최근 무대 메이크업 — 아이라인이 얇아진 이유",
    want: "연예·방송",
  },
];

/** 원고를 뜯어서 잽니다. */
function measure(text) {
  const lines = String(text).split("\n").map((l) => l.trim());
  const paras = lines.filter((l) => vis(l) >= 2);

  // [사진: ...] 자리
  const photoSlots = (text.match(/\[사진[^\]]*\]/g) || []).length;
  // 소제목 표시
  const subheads = paras.filter((l) => rules.SKILL_PLACEMENT && /^[■▶◆●]|^\[소제목\]|^#{2,3}\s/.test(l)).length;
  // 사진 자리 사이 글자 수
  const gaps = [];
  let run = 0, saw = false;
  for (const l of lines) {
    if (/\[사진[^\]]*\]/.test(l)) { if (saw) gaps.push(run); saw = true; run = 0; }
    else if (vis(l) >= 2) run += vis(l);
  }
  const bodyParas = paras.filter((l) => !/^\[사진/.test(l) && !/^[■▶◆●]|^\[소제목\]/.test(l));
  const chars = bodyParas.reduce((n, l) => n + vis(l), 0);
  const lens = bodyParas.map(vis).sort((a, b) => a - b);

  return {
    chars,
    paras: bodyParas.length,
    paraMedian: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
    over45: bodyParas.length ? Math.round((bodyParas.filter((l) => vis(l) > 45).length / bodyParas.length) * 100) : 0,
    longest: lens.length ? lens[lens.length - 1] : 0,
    subheads,
    photoSlots,
    imgGap: gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
    hasTable: /\|[-\s|]+\|/.test(text) || /<table/i.test(text),
    hasToc: /목차|이 글의 순서/.test(text.slice(0, 500)),
  };
}

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`    ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

(async () => {
  for (const c of CASES) {
    console.log(`\n━━ ${c.skill} ━━`);
    console.log(`  주제: ${c.topic}`);
    let out;
    const t = Date.now();
    try {
      out = await runTool(c.skill, [{ role: "user", content: `주제: ${c.topic}\n\n이 주제로 블로그 원고를 써주세요.` }]);
    } catch (e) {
      ok(false, "원고를 받았다", e.message);
      continue;
    }
    const text = typeof out === "string" ? out : (out && (out.text || out.content || JSON.stringify(out)));
    console.log(`  ${Math.round((Date.now() - t) / 1000)}초 · ${String(text).length.toLocaleString()}자 받음`);

    const m = measure(text);
    const g = rules.BODY.byTopic[c.want];
    console.log(`  잰 값: 본문 ${m.chars}자 · 문단 ${m.paras}개(중앙 ${m.paraMedian}자, 최장 ${m.longest}자) · ` +
      `소제목 ${m.subheads} · 사진자리 ${m.photoSlots} · 사진간격 ${m.imgGap ?? "—"}`);
    console.log(`  기준: ${g.chars.min}~${g.chars.max}자 · 소제목 ${g.subheads.min}~${g.subheads.max} · ` +
      `사진 ${g.images.min}~${g.images.max} · 간격 ${g.imgGap.min}~${g.imgGap.max}`);

    // ⚠️ 폭을 조금 넉넉히 봅니다. AI가 정확히 맞출 수는 없습니다.
    // 다만 **방향**은 맞아야 합니다.
    ok(m.chars >= g.chars.min * 0.7 && m.chars <= g.chars.max * 1.4,
      "글자 수가 기준 근처다", `${m.chars}자`);
    ok(m.subheads >= Math.max(0, g.subheads.min - 2) && m.subheads <= g.subheads.max + 3,
      "소제목 개수가 기준 근처다", `${m.subheads}개`);
    ok(m.photoSlots >= g.images.min - 5, "사진 자리를 충분히 뒀다", `${m.photoSlots}곳`);
    // 제일 중요한 것 — 두 자료가 같았던 것들
    ok(m.over45 <= 25, "45자 넘는 문단이 적다", `${m.over45}%`);
    ok(!m.hasTable, "표를 안 넣었다");
    ok(!m.hasToc, "목차를 안 넣었다");

    console.log("\n  ── 첫 12줄 ──");
    for (const l of String(text).split("\n").slice(0, 12)) {
      if (l.trim()) console.log(`    ${l.slice(0, 76)}`);
    }
  }

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
