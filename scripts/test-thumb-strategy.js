/**
 * 썸네일 전략 시험 — **AI를 한 번도 안 부릅니다. 값이 0원입니다.**
 *
 * 확인하는 것 (사장님 지적 2026-08-28에서 나온 것들):
 *   ① 썸네일 문구가 제목을 그대로 되풀이하지 않는가  ← 제일 중요
 *   ② 제목 상황(이름 1명·2명·지칭·전후)에 따라 구성이 달라지는가
 *   ③ 두 명 중 가리는 사람이 **제목 뒤쪽 사람**인가
 *   ④ 모자이크가 실제로 그림에 걸리는가 (말만 하고 안 걸면 소용없음)
 *   ⑤ AI가 제목을 옮겨 적어 와도 검사기가 **바꿔치기**하는가
 */
const sharp = require("sharp");
const S = require("../src/thumbStrategy");
const T = require("../src/thumbnail");
const A = require("../src/thumbAuto");

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  — " + e : ""}`); c ? pass++ : fail++; };

/**
 * 인물 사진 흉내. cx/cy는 얼굴 자리(0~1 비율), r은 얼굴 크기.
 * ⚠️ 살색으로 칠해야 얼굴 찾기(살색 덩어리)가 실제로 동작하는지 시험할 수 있습니다.
 */
function fakePortrait({ hue = 20, cx = 0.5, cy = 0.3, r = 0.24, w = 900, h = 1200 } = {}) {
  const fx = Math.round(w * cx), fy = Math.round(h * cy);
  const rx = Math.round(w * r), ry = Math.round(w * r * 1.25);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="hsl(${hue + 200},28%,26%)"/>
    <ellipse cx="${fx}" cy="${fy}" rx="${rx}" ry="${ry}" fill="hsl(${hue},46%,72%)"/>
    <circle cx="${fx - rx * 0.36}" cy="${fy - ry * 0.12}" r="${rx * 0.1}" fill="#33261f"/>
    <circle cx="${fx + rx * 0.36}" cy="${fy - ry * 0.12}" r="${rx * 0.1}" fill="#33261f"/>
    <path d="M${fx - rx} ${fy + ry * 0.95} Q${fx} ${fy + ry * 1.6} ${fx + rx} ${fy + ry * 0.95}
      L${fx + rx * 1.5} ${h} L${fx - rx * 1.5} ${h} Z" fill="hsl(${hue + 300},26%,30%)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

// 글자만 있는 캡처 — 얼굴이 없어야 합니다.
function fakeScreenshot() {
  const rows = [...Array(9)].map((_, i) =>
    `<rect x="70" y="${70 + i * 62}" width="${520 + (i % 3) * 90}" height="20" fill="#c9ced6"/>`).join("");
  return sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#fff"/>${rows}</svg>`
  )).jpeg().toBuffer();
}

// 그림 한 조각을 raw로 떼어냅니다 (바뀌었는지 비교용).
const cut = (buf, rect) => sharp(buf).extract(rect).raw().toBuffer();

(async () => {
  console.log("\n[1] 제목 상황별 구성");

  const c1 = S.strategize("강호동이 이쁘다던 여배우, 지금은 이렇게 삽니다");
  ok(c1.composition === S.COMPOSITIONS.COMPARE_MOSAIC, "이름 1명 + 지칭 1명 → 두 명 중 1명 모자이크", c1.composition);
  ok(c1.mosaicWho === "여배우", "가리는 대상은 지칭 쪽(여배우)", String(c1.mosaicWho));
  ok(c1.celebs.includes("강호동"), "이름은 얼굴로 보여준다", c1.celebs.join(","));

  const c2 = S.strategize("카리나와 장원영, 같은 코트를 이렇게 다르게 입었다");
  ok(c2.composition === S.COMPOSITIONS.COMPARE_MOSAIC, "이름 2명 → 두 명 중 1명 모자이크", c2.composition);
  ok(c2.mosaicWho === "장원영", "가리는 쪽은 **제목 뒤쪽** 사람", String(c2.mosaicWho));

  const c2b = S.strategize("장원영과 카리나, 같은 코트를 이렇게 다르게 입었다");
  ok(c2b.mosaicWho === "카리나", "순서를 바꾸면 가리는 사람도 바뀐다 (은행 순서가 아니라 제목 순서)", String(c2b.mosaicWho));

  const c3 = S.strategize("민낯에서 풀메까지, 40분 만에 이렇게 바뀝니다");
  ok(c3.composition === S.COMPOSITIONS.BEFORE_AFTER, "전후 낱말 → 두 장 짝짓기", c3.composition);

  const c4 = S.strategize("카리나 신곡 무대 의상이 화제입니다");
  ok(c4.composition === S.COMPOSITIONS.FACE_HOOK, "이름 1명뿐 → 얼굴 크게", c4.composition);

  const c5 = S.strategize("이 쿠션 하나로 여름 화장 끝냈습니다");
  ok(c5.composition === S.COMPOSITIONS.MOSAIC_ONE, "이름 없음 → 정체 가려 궁금하게", c5.composition);
  ok(c5.captions.some((x) => x.includes("쿠션")), "제목의 제품 낱말로 미끼를 만든다", c5.captions.join(" / "));

  ok(S.wantsMosaic(c1.composition) && S.wantsMosaic(c5.composition) && !S.wantsMosaic(c3.composition),
    "모자이크 쓰는 구성/안 쓰는 구성이 갈린다");

  console.log("\n[2] 문구가 제목을 되풀이하지 않는가  ← 사장님 지적의 핵심");

  const TITLES = [
    "강호동이 이쁘다던 여배우, 지금은 이렇게 삽니다",
    "카리나와 장원영, 같은 코트를 이렇게 다르게 입었다",
    "민낯에서 풀메까지, 40분 만에 이렇게 바뀝니다",
    "이 쿠션 하나로 여름 화장 끝냈습니다",
    '"착해진 아이라인" 카리나 메이크업 핵심은 이것',
    "출근룩 이거 하나로 끝냈습니다",
  ];
  let echoed = 0;
  for (const t of TITLES) {
    const s = S.strategize(t);
    const bad = s.captions.filter((c) => S.echoesTitle(c, t));
    if (bad.length) { echoed++; console.log(`      되풀이: ${t} → ${bad.join(",")}`); }
  }
  ok(echoed === 0, `제목 ${TITLES.length}개에서 나온 문구 중 제목 되풀이 0건`);
  ok(TITLES.every((t) => S.strategize(t).captions.length > 0), "제목마다 문구 후보가 하나 이상 나온다");

  console.log("\n[2-1] 문구가 제목에서 실제로 건져 올린 것인가");
  const cap = (t) => S.strategize(t).captions;
  ok(cap("다이소 3천원짜리로 백화점 화장품 이겼습니다")[0] === "3천원인데?",
    "가격이 있으면 가격을 앞세운다", cap("다이소 3천원짜리로 백화점 화장품 이겼습니다").join(" / "));
  ok(cap("40대 피부과 원장이 절대 안 쓰는 화장품 3가지")[0] === "딱 3가지",
    "개수가 있으면 개수를 앞세운다");
  ok(cap("29,800원짜리 바디워시 2주 써본 후기")[0].includes("29,800"),
    "쉼표 들어간 가격도 잡는다", cap("29,800원짜리 바디워시 2주 써본 후기")[0]);
  ok(cap("이 립 하나로 얼굴이 살았습니다").includes("이 립 뭐예요?"),
    "제품 낱말은 그 낱말을 넣어 묻는다");
  ok(cap("출근룩 이거 하나로 끝냈습니다").includes("이거 어디 거?"), "옷·소품은 출처를 묻는다");
  // ⚠️ 제목이 안 한 말을 만들면 안 됩니다 — "3시간 고민한" 글에 "3시간 만에"는 거짓입니다.
  ok(!cap("가을 코트 하나 사려다 3시간 고민한 이유").some((c) => c.includes("만에")),
    "시간 숫자로 '만에'(빨리 해냈다)를 지어내지 않는다", cap("가을 코트 하나 사려다 3시간 고민한 이유").join(" / "));
  ok(cap("민낯에서 풀메까지, 40분 만에 이렇게 바뀝니다")[0] === "40분 만에",
    "제목이 '만에'라고 썼으면 그 표현을 그대로 살린다",
    cap("민낯에서 풀메까지, 40분 만에 이렇게 바뀝니다").join(" / "));

  console.log("\n[2-2] 문구가 그림(구성)과 짝이 맞는가");
  ok(cap("무대에서 노출 사고날뻔한 5세대 걸그룹... 코디가 밉다")[0] === "누구게요?",
    "가리는 구성에는 '누구게요?'가 먼저");
  ok(cap("강호동이 이쁘다던 여배우, 지금은 이렇게 삽니다")[0] === "여배우 누구?",
    "가릴 대상이 있으면 그 대상을 묻는다");
  ok(cap("제니 민낯 공개, 팬들이 놀란 이유").includes("같은 사람?"), "전후 두 장에는 '같은 사람?'");
  ok(!cap("다이소 3천원짜리로 백화점 화장품 이겼습니다").slice(0, 1).includes("다들 놀란 이유"),
    "보편 문구는 건질 게 없을 때만 1등이 된다");

  console.log("\n[3] 되풀이 판정 자체가 맞는가");
  const T1 = "이 쿠션 하나로 여름 화장 끝냈습니다";
  ok(S.echoesTitle(T1, T1), "제목을 그대로 쓰면 되풀이다");
  ok(S.echoesTitle("이 쿠션 하나로 여름 화장 끝냈습니다!!", T1), "문장부호만 다른 것도 되풀이다");
  ok(!S.echoesTitle("이 쿠션 뭐야?", T1), "낱말만 빌린 짧은 문구는 되풀이가 아니다");
  ok(!S.echoesTitle("", T1) && !S.echoesTitle("아무거나", ""), "빈 값에서 터지지 않는다");

  console.log("\n[4] 검사기가 실제로 바꿔치기하는가 (AI 답 흉내)");
  const title = "이 쿠션 하나로 여름 화장 끝냈습니다";
  const body = "여름에 무너지던 화장이 이 쿠션 하나로 잡혔습니다. 29,800원이었습니다.";
  const strategy = S.strategize(title, body);
  const basePlan = { photos: [{ i: 0, kind: "인물-얼굴", score: 9 }], mode: "single", pick: 0, sub: "" };

  const v1 = A.validate({ ...basePlan, text: title }, { count: 1, title, body, strategy });
  ok(v1.text !== title, "AI가 제목을 그대로 써오면 다른 문구로 바꾼다", `"${v1.text}"`);
  ok(v1.textFrom === "rule", "바뀐 문구는 규칙에서 왔다고 표시한다", v1.textFrom);
  ok(v1.warn.some((w) => w.includes("제목과 거의 같")), "왜 바꿨는지 사장님께 알린다");

  const v2 = A.validate({ ...basePlan, text: "" }, { count: 1, title, body, strategy });
  ok(v2.text && !S.echoesTitle(v2.text, title), "AI가 문구를 못 주면 궁금증 문구로 채운다", `"${v2.text}"`);

  const v3 = A.validate({ ...basePlan, text: "3만원 대박특가" }, { count: 1, title, body, strategy });
  ok(v3.invented.length > 0, "AI가 본문에 없는 말을 지어내면 여전히 잡는다", v3.invented.join(","));

  const v4 = A.validate({ ...basePlan, text: "이 쿠션 뭐야?" }, { count: 1, title, body, strategy });
  ok(v4.text === "이 쿠션 뭐야?", "제목과 다른 AI 문구는 그대로 둔다");
  ok(v4.alternatives[0] && !S.echoesTitle(v4.alternatives[0], title),
    "대안 목록은 궁금증 문구가 앞", v4.alternatives.join(" / "));

  console.log("\n[5] 얼굴을 실제로 찾는가  ← 여기가 틀리면 다 틀립니다");

  // 얼굴을 아는 자리에 그려놓고, 찾아낸 상자가 거기 맞는지 봅니다.
  const known = await fakePortrait({ cx: 0.32, cy: 0.28, r: 0.24 });
  const f = await T.findFace(known);
  ok(!!f, "인물 사진에서 얼굴을 찾는다", f ? JSON.stringify(f) : "못 찾음");
  if (f) {
    const wantX = 0.32 * 900, wantY = 0.28 * 1200;
    const gotX = f.left + f.width / 2, gotY = f.top + f.height / 2;
    ok(Math.abs(gotX - wantX) < 900 * 0.06, "가로 위치가 맞다", `${Math.round(gotX)} vs ${wantX}`);
    ok(Math.abs(gotY - wantY) < 1200 * 0.08, "세로 위치가 맞다", `${Math.round(gotY)} vs ${wantY}`);
  }
  ok((await T.findFace(await fakeScreenshot())) === null,
    "글자만 있는 캡처는 얼굴 없음으로 본다 (엉뚱한 데 모자이크 방지)");

  console.log("\n[6] 모자이크가 얼굴 자리에 걸리는가");
  const p1 = await fakePortrait({ hue: 25, cy: 0.45, r: 0.2 });   // 얼굴이 가운데 있는 사진
  const p2 = await fakePortrait({ hue: 12, cx: 0.4, cy: 0.3 });

  const plain = await T.single({ buf: p1, text: "누구게" });
  const mosaicked = await T.single({ buf: p1, text: "누구게", mosaic: true });
  const m0 = await sharp(plain).metadata();
  const m1 = await sharp(mosaicked).metadata();
  ok(m0.width === m1.width && m0.height === m1.height, "모자이크를 걸어도 크기는 그대로", `${m1.width}x${m1.height}`);

  /**
   * ⚠️ 예전 시험은 "위에서 8% 자리가 바뀌었나"로 봤습니다. 그건 **얼굴이 위쪽 가운데
   * 있다고 가정**한 것이라, 얼굴이 가운데 있는 사진에서 배경만 가려도 통과했습니다.
   * 이제 잘라낸 그림에서 얼굴을 다시 찾아 **그 자리**가 바뀌었는지 봅니다.
   */
  const fc = await T.findFace(plain);
  ok(!!fc, "잘라낸 썸네일에서도 얼굴을 찾는다");
  if (fc) {
    const box = {
      left: Math.round(fc.left + fc.width * 0.3),
      top: Math.round(fc.top + fc.height * 0.3),
      width: Math.max(8, Math.round(fc.width * 0.4)),
      height: Math.max(8, Math.round(fc.height * 0.4)),
    };
    const [z0, z1] = await Promise.all([cut(plain, box), cut(mosaicked, box)]);
    ok(!z0.equals(z1), "얼굴 한가운데가 가려졌다  ← 제일 중요");
  }
  // 얼굴에서 먼 구석은 손대면 안 됩니다.
  const corner = { left: 8, top: 1000, width: 140, height: 140 };
  const [cor0, cor1] = await Promise.all([cut(plain, corner), cut(mosaicked, corner)]);
  ok(cor0.equals(cor1), "얼굴에서 먼 구석은 손대지 않았다");

  console.log("\n[7] 얼굴이 작으면 당겨 자르는가 · 두 장 눈높이가 맞는가");

  const farBuf = await fakePortrait({ cy: 0.18, r: 0.1 });        // 얼굴이 아주 작은 사진
  const farThumb = await T.single({ buf: farBuf, text: "" });
  const farFace = await T.findFace(farThumb);
  ok(farFace && farFace.height / 1200 > 0.22,
    "작게 찍힌 얼굴도 썸네일에서는 크게 나온다",
    farFace ? `${Math.round((farFace.height / 1200) * 100)}%` : "못 찾음");

  // 두 장을 붙일 때 각각 어떻게 잘리는지 — 자르기 결과에서 바로 봅니다
  // (붙인 뒤 왼쪽은 흑백이라 살색으로 얼굴을 못 찾습니다).
  const [lcrop, rcrop] = await Promise.all([T.cropFace(p1, 600, 1200), T.cropFace(p2, 600, 1200)]);
  const [lf, rf] = await Promise.all([T.findFace(lcrop), T.findFace(rcrop)]);
  ok(lf && rf, "두 장 모두에서 얼굴을 찾는다");
  if (lf && rf) {
    const ly = lf.top + lf.height / 2, ry = rf.top + rf.height / 2;
    ok(Math.abs(ly - ry) < 1200 * 0.06,
      "붙여놓을 두 얼굴의 눈높이가 맞는다", `${Math.round(ly)} vs ${Math.round(ry)}`);
  }

  // 두 장의 얼굴 **크기**도 맞아야 짝이 맞아 보입니다(눈높이만 맞으면 한쪽만 커 보입니다).
  const [pb, pa] = await Promise.all([T.faceCropPlan(p1, 600, 1200), T.faceCropPlan(p2, 600, 1200)]);
  const same = Math.min(0.5, Math.max(pb.faceRatio, pa.faceRatio));
  const [sc1, sc2] = await Promise.all([
    T.cropFace(p1, 600, 1200, { minFaceRatio: same }),
    T.cropFace(p2, 600, 1200, { minFaceRatio: same }),
  ]);
  const [sf1, sf2] = await Promise.all([T.findFace(sc1), T.findFace(sc2)]);
  ok(sf1 && sf2 && Math.abs(sf1.height - sf2.height) < 1200 * 0.08,
    "두 장의 얼굴 크기를 맞춘다",
    sf1 && sf2 ? `${sf1.height} vs ${sf2.height}` : "못 찾음");

  const pairPlain = await T.beforeAfter({ beforeBuf: p1, afterBuf: p2, text: "누구게", labels: null });
  const pairRight = await T.beforeAfter({ beforeBuf: p1, afterBuf: p2, text: "누구게", labels: null, mosaicSide: "right" });
  const pairLeft = await T.beforeAfter({ beforeBuf: p1, afterBuf: p2, text: "누구게", labels: null, mosaicSide: "left" });
  // ⚠️ 가운데 이음매는 빼고 봅니다. JPEG는 8칸 단위로 눌러 담아서 경계 칸이 살짝 흔들립니다.
  const rawHalf = (b, side) => sharp(b)
    .extract({ left: side === "left" ? 0 : 640, top: 0, width: 560, height: 1200 }).raw().toBuffer();
  const [lp, lr] = await Promise.all([rawHalf(pairPlain, "left"), rawHalf(pairRight, "left")]);
  const [rp, rr] = await Promise.all([rawHalf(pairPlain, "right"), rawHalf(pairRight, "right")]);
  ok(lp.equals(lr), "오른쪽을 가릴 때 왼쪽은 안 건드린다");
  ok(!rp.equals(rr), "오른쪽(가릴 사람)만 가려진다");

  // 왼쪽을 가리는 경우도 실제로 얼굴 자리에 걸려야 합니다(흑백 때문에 못 찾던 자리).
  const lfc = await T.findFace(lcrop);
  if (lfc) {
    const box = {
      left: Math.round(lfc.left + lfc.width * 0.3),
      top: Math.round(lfc.top + lfc.height * 0.3),
      width: Math.max(8, Math.round(lfc.width * 0.4)),
      height: Math.max(8, Math.round(lfc.height * 0.4)),
    };
    const [q0, q1] = await Promise.all([cut(pairPlain, box), cut(pairLeft, box)]);
    ok(!q0.equals(q1), "왼쪽(흑백 쪽)을 가릴 때도 얼굴 자리에 걸린다");
  }

  console.log(`\n  통과 ${pass} · 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("터졌습니다:", e.message);
  process.exit(1);
});
