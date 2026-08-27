/**
 * 브랜드 설정 — 완성도 세기, 색 뽑기, 원고 지시문.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */
const B = require("../src/brandKit");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

console.log("\n━━ 완성도 세기 ━━");
{
  const empty = B.status({});
  ok(empty.percent === 0, "아무것도 없으면 0%", empty.percent + "%");
  ok(empty.canWrite === false, "꼭 필요한 게 없으면 글을 못 쓴다고 한다");
  ok(empty.missingRequired.length >= 2, "뭐가 빠졌는지 알려준다",
     empty.missingRequired.map((m) => m.label).join(", "));
  ok(empty.next.length === 3, "다음에 할 것 3개를 골라준다",
     empty.next.map((n) => n.label).join(" / "));
  // ⚠️ 퍼센트만 주면 다음 행동을 모릅니다. 꼭 필요한 게 먼저 나와야 합니다.
  ok(empty.next[0].label === B.ITEMS.find((i) => i.required && i.key !== "blogId").label
     || empty.next.some((n) => B.ITEMS.find((i) => i.key === n.key).required),
     "꼭 필요한 걸 먼저 권한다", empty.next[0].label);
}
{
  const some = B.status({ blogId: "goldenwoo", topic: "패션·뷰티" });
  ok(some.canWrite === true, "꼭 필요한 걸 채우면 글을 쓸 수 있다");
  ok(some.percent > 0 && some.percent < 100, "부분만 채우면 중간값", some.percent + "%");
}
{
  const full = {};
  for (const it of B.ITEMS) full[it.key] = it.type === "bool" ? true : it.type === "list" ? ["가"] : "채움";
  const s = B.status(full);
  ok(s.percent === 100, "다 채우면 100%", s.percent + "%");
  ok(s.next.length === 0, "다 채우면 더 권하지 않는다");
}

console.log("\n━━ '껐다'도 정한 것으로 셉니다 ━━");
// ⚠️ 내 글 링크를 **안 넣겠다**고 정하신 것도 결정입니다.
// false 를 '안 채움'으로 세면 영원히 100%가 안 됩니다.
{
  const off = B.status({ ownLinks: false });
  ok(off.items.find((i) => i.key === "ownLinks").done === true,
     "false 도 채운 것으로 센다  ← 안 그러면 영원히 100%가 안 됩니다");
  ok(B.filled("") === false, "빈 글자는 안 채운 것");
  ok(B.filled([]) === false, "빈 목록은 안 채운 것");
  ok(B.filled("   ") === false, "공백만 있는 것도 안 채운 것");
}

console.log("\n━━ 항목마다 '어디에 쓰이는지'가 있는가 ━━");
// ⚠️ 이게 없으면 그냥 빈칸 채우기 숙제가 됩니다. 왜 채우는지 모르면 안 채웁니다.
{
  const noWhy = B.ITEMS.filter((i) => !i.why || i.why.length < 10);
  ok(noWhy.length === 0, "모든 항목에 이유가 있다", noWhy.map((i) => i.key).join(", ") || `${B.ITEMS.length}개`);
  const noUses = B.ITEMS.filter((i) => !i.uses || !i.uses.length);
  ok(noUses.length === 0, "모든 항목에 쓰이는 곳이 있다", noUses.map((i) => i.key).join(", ") || "전부 있음");
}

console.log("\n━━ 원고 지시문 ━━");
{
  ok(B.promptBlock({}) === "", "아무것도 안 채우면 빈 글자  ← 헛소리를 끼워넣으면 안 됩니다");
  const p = B.promptBlock({ tone: "담백하게", avoidWords: ["대박", "핵꿀템"], hashtags: ["#골든패션"] });
  ok(p.includes("담백하게"), "말투가 들어간다");
  ok(p.includes("대박") && p.includes("핵꿀템"), "안 쓰는 말이 들어간다");
  ok(p.includes("#골든패션"), "해시태그가 들어간다");
  ok(!p.includes("undefined") && !p.includes("null"), "빈 항목이 undefined 로 새지 않는다");
}

console.log("\n━━ 로고에서 색 뽑기 (AI 안 씀) ━━");
(async () => {
  const sharp = require("sharp");
  const svg = (body) =>
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">${body}</svg>`);

  {
    const buf = await sharp(svg('<rect width="240" height="240" fill="#ffffff"/><circle cx="120" cy="120" r="90" fill="#c2185b"/>')).png().toBuffer();
    const r = await B.paletteFromLogo(buf);
    ok(r.ok, "색을 찾았다", r.colors.map((c) => c.hex).join(" "));
    /**
     * ⚠️ 흰 배경과 가장자리 얼룩을 안 집는지 봅니다.
     *
     * 처음엔 "#f 로 시작하면 흰색"이라고 셌는데 그건 너무 거칩니다 —
     * 연한 분홍도 #f 로 시작합니다. **세 색이 다 밝고 서로 비슷하면** 흰 쪽입니다.
     * 그리고 밝기에 견준 차이가 작으면 가장자리 얼룩입니다.
     */
    const pale = r.colors.filter((c) => {
      const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16));
      const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
      return mx > 235 || (mx - mn) / mx < 0.25;
    });
    ok(pale.length === 0, "흰 배경과 가장자리 얼룩을 안 집는다", pale.map((c) => c.hex).join(" ") || "깨끗함");
    const top = r.colors[0].hex;
    ok(parseInt(top.slice(1, 3), 16) > 140 && parseInt(top.slice(3, 5), 16) < 90,
       "제일 넓은 진짜 색이 1등이다", top);
  }
  {
    // 흑백 로고 — 뽑을 게 없으면 없다고 해야 합니다.
    const buf = await sharp(svg('<rect width="240" height="240" fill="#ffffff"/><rect x="40" y="40" width="160" height="160" fill="#111111"/>')).png().toBuffer();
    const r = await B.paletteFromLogo(buf);
    ok(r.ok === false, "흑백 로고는 못 찾았다고 솔직히 말한다  ← 아무 색이나 주면 안 됩니다");
    ok(/흑백|못 찾/.test(r.why), "왜 못 찾았는지 알려준다", r.why);
  }

  console.log(`\n통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
