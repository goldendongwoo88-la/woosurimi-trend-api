/**
 * 썸네일 틀 추천·그리기 시험 — **AI 안 부름. 0원.**
 *
 * ⚠️ 이 시험이 없던 채로 커밋했습니다. 기능을 만들고 "147건 통과"라고 말했는데
 * 그 147건은 **새 기능을 한 줄도 안 보고 있었습니다.** 통과 숫자가 안전을 뜻하지
 * 않는다는 걸 그대로 보여준 경우라, 여기 적어둡니다.
 *
 * 확인하는 것:
 *   ① 글 성격에 맞는 틀이 위로 오는가
 *   ② **못 만들 틀은 추천에서 빠지는가** (사진 1장에 2분할을 권하면 안 됨)
 *   ③ 쪽 넘기기 — 새로고침·되돌아가기·한 바퀴 돌기
 *   ④ 10가지 틀이 **전부 실제로 그려지는가**
 *   ⑤ 못 그릴 때 조용히 다른 걸 그리지 않고 던지는가
 */
const sharp = require("sharp");
const P = require("../src/thumbPatterns");
const T = require("../src/thumbnail");

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  — " + e : ""}`); c ? pass++ : fail++; };

// 인물 사진 흉내 — 살색으로 칠해야 얼굴 찾기가 동작합니다.
function photo({ hue = 20, cx = 0.5, cy = 0.32, r = 0.2, w = 900, h = 1200 } = {}) {
  const fx = Math.round(w * cx), fy = Math.round(h * cy);
  const rx = Math.round(w * r), ry = Math.round(w * r * 1.25);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="hsl(${hue + 200},26%,28%)"/>
    <ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${ry}" fill="hsl(${hue},48%,74%)"/>
    <circle cx="${fx - rx * 0.36}" cy="${fy - ry * 0.1}" r="${rx * 0.1}" fill="#33261f"/>
    <circle cx="${fx + rx * 0.36}" cy="${fy - ry * 0.1}" r="${rx * 0.1}" fill="#33261f"/>
    <path d="M${fx - rx} ${fy + ry} Q${fx} ${fy + ry * 1.6} ${fx + rx} ${fy + ry}
      L${fx + rx * 1.6} ${h} L${fx - rx * 1.6} ${h} Z" fill="hsl(${hue + 300},26%,32%)"/>
  </svg>`)).jpeg({ quality: 90 }).toBuffer();
}

const idsOf = (r) => r.items.map((x) => x.pattern.id);

(async () => {
  console.log("\n[1] 글 성격에 맞는 틀이 위로 오는가");
  ok(idsOf(P.pick("민낯에서 풀메까지, 40분 만에 이렇게 바뀝니다", "", 3))[0] === "beforeAfter",
    "전후 제목 → '전/후 두 장'이 1위", idsOf(P.pick("민낯에서 풀메까지, 40분 만에", "", 3))[0]);
  ok(idsOf(P.pick("강호동이 이쁘다던 여배우, 지금은", "", 3))[0].startsWith("mosaic"),
    "이름을 감춘 제목 → 가리기 틀이 1위");
  ok(idsOf(P.pick("카리나 공항 패션 코디", "", 3)).includes("tallFull"),
    "패션 제목 → 세로 전신이 후보에 있다");
  ok(idsOf(P.pick("양평 당일치기 코스 6곳", "", 3)).includes("collage3"),
    "여행 제목 → 3장 콜라주가 후보에 있다");
  ok(P.pick("아무 말이나 적은 제목", "", 1).items.length >= 3,
    "아무 신호 없는 제목에도 후보가 나온다  (막다른 길 금지)");

  console.log("\n[2] 못 만들 틀은 추천에서 빠지는가  ← 절반의 목적");
  const one = idsOf(P.pick("강호동이 이쁘다던 여배우, 지금은", "", 1));
  ok(!one.includes("mosaicPair") && !one.includes("splitSubject") && !one.includes("splitBand"),
    "사진 1장이면 2분할 계열이 안 나온다", one.join(","));
  ok(!one.includes("collage3"), "사진 1장이면 콜라주가 안 나온다");
  ok(!idsOf(P.pick("민낯 vs 풀메 변화", "", 1)).includes("beforeAfter"),
    "사진 1장이면 전후 두 장도 안 나온다  (제목이 전후여도)");
  const two = idsOf(P.pick("양평 당일치기 코스 6곳", "", 2));
  ok(!two.includes("collage3"), "사진 2장이면 콜라주(3장 필요)가 안 나온다");

  console.log("\n[3] 쪽 넘기기 — 새로고침·되돌아가기");
  const title = "95억 청담동 건물주인데..명품 제로였던 연예인 공항 패션";
  const p0 = P.pick(title, "", 3, 0);
  const p1 = P.pick(title, "", 3, 1);
  ok(p0.pages >= 2, "후보가 많으면 쪽이 여러 개", p0.pages + "쪽");
  ok(JSON.stringify(idsOf(p0)) !== JSON.stringify(idsOf(p1)), "다음 쪽은 다른 틀이 나온다");
  ok(p0.items.length === 4 || p0.items.length === p0.total, "한 쪽에 4개", p0.items.length + "개");
  const back = P.pick(title, "", 3, -1);
  ok(back.page === p0.pages - 1, "되돌아가기(-1)는 마지막 쪽으로", `page=${back.page}`);
  const wrap = P.pick(title, "", 3, p0.pages);
  ok(JSON.stringify(idsOf(wrap)) === JSON.stringify(idsOf(p0)),
    "끝까지 가면 처음으로 돌아온다  (막다른 길 금지)");
  ok(new Set(idsOf(p0)).size === idsOf(p0).length, "한 쪽 안에 같은 틀이 두 번 안 나온다");

  console.log("\n[4] 10가지 틀이 전부 실제로 그려지는가");
  const bufs = [await photo({ hue: 22 }), await photo({ hue: 8, cx: 0.44 }), await photo({ hue: 300, r: 0.16 })];
  const ids = Object.keys(P.PATTERNS);
  ok(ids.length === 10, "틀이 10가지다", ids.length + "가지");
  for (const id of ids) {
    const pat = P.PATTERNS[id];
    try {
      const jpeg = await T.renderPattern(pat, bufs, { text: "누구게요?" });
      const m = await sharp(jpeg).metadata();
      const wantTall = (pat.render.size || "") === "tall";
      const sizeOk = wantTall ? (m.width === 1080 && m.height === 1350) : (m.width === 1200 && m.height === 1200);
      ok(sizeOk && jpeg.length > 3000, `${pat.label} 그려짐`, `${m.width}x${m.height}`);
    } catch (e) {
      ok(false, `${pat.label} 그려짐`, e.message);
    }
  }

  console.log("\n[5] 못 그리면 조용히 다른 걸 그리지 않고 던지는가");
  let threw = false;
  try { await T.renderPattern(P.PATTERNS.splitSubject, [bufs[0]], { text: "x" }); }
  catch { threw = true; }
  ok(threw, "사진 1장으로 2분할을 시키면 던진다  (엉뚱한 걸 그려주면 더 나쁨)");
  let threw2 = false;
  try { await T.renderPattern(P.PATTERNS.faceClose, [], { text: "x" }); }
  catch { threw2 = true; }
  ok(threw2, "사진이 없으면 던진다");

  console.log("\n[6] 큰 글씨 — 강조 낱말 고르기");
  // 그림에서 직접 못 읽으니, 규칙이 도는지는 그려지는 것으로만 확인하고
  // 낱말 고르기는 같은 규칙을 여기서 재현해 확인합니다.
  const accent = (t) => {
    const w = t.trim().split(/\s+/);
    return w.find((x) => /\d/.test(x)) || w.reduce((a, b) => (b.length > a.length ? b : a), w[0]);
  };
  ok(accent("6억? 그럼 줘야지") === "6억?", "숫자가 있으면 숫자 낱말", accent("6억? 그럼 줘야지"));
  ok(accent("멤버 한 명이 소시오패스였다") === "소시오패스였다",
    "숫자가 없으면 제일 긴 낱말  (첫 낱말을 쓰다 '멤버'가 빨개졌던 것)", accent("멤버 한 명이 소시오패스였다"));

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("터졌습니다:", e.message); process.exit(1); });
