/**
 * 홈판 썸네일 만들기.
 *
 * ⚠️ 사진은 **사장님이 올리신 것만** 씁니다.
 * 연예인 사진을 인터넷에서 가져와 쓰면 저작권(찍은 사람)과 초상권(찍힌 사람)이
 * 둘 다 걸립니다. 썸네일은 눈에 제일 잘 띄는 자리라 문제가 되면 바로 걸립니다.
 * 그래서 이 파일은 사진을 **받기만** 하고 어디서도 가져오지 않습니다.
 *
 * ⚠️ 어떤 모양이 클릭을 부르는가
 * 제미나이가 정리해준 것을 제 실측과 맞춰봤습니다. 겹치는 부분만 씁니다.
 *
 *   2분할 비포/애프터 — 한 장보다 낫다. 왼쪽 흑백(과거) / 오른쪽 컬러(현재)
 *   짧은 오버레이 텍스트 — 8자 안팎. 고대비(어두운 띠 + 밝은 글씨)
 *   얼굴 클로즈업 — 전신보다 상반신·얼굴이 모바일에서 유리
 *
 * 다만 "클릭률 2.5배" 같은 수치는 출처를 확인하지 못했습니다.
 * 그래서 화면에 그 숫자를 적지 않습니다. 모양만 따르고 효과는 약속하지 않습니다.
 *
 * ⚠️ 그리고 낚시 썸네일은 만들지 않습니다.
 * 본문에 없는 장면을 썸네일이 약속하면 들어왔다가 바로 나갑니다.
 * 제목에서 했던 이야기와 같습니다.
 */

const sharp = require("sharp");
const { alignedText, measureText } = require("./cardNewsGenerator");

/** 홈판은 정사각형에 가깝게 잘립니다. 1:1을 기본으로 두고 몇 가지 더 둡니다. */
const SIZES = {
  square: { w: 1200, h: 1200, label: "정사각형 (홈판 기본)" },
  wide: { w: 1200, h: 900, label: "4:3" },
  tall: { w: 1080, h: 1350, label: "4:5 (인스타 겸용)" },
};

/** 오버레이 띠 색 — 어두운 바탕에 밝은 글씨가 제일 잘 읽힙니다. */
const THEMES = {
  black: { band: "#111318", text: "#ffffff", accent: "#ffd93d", label: "검정 + 흰 글씨" },
  yellow: { band: "#111318", text: "#ffd93d", accent: "#ffffff", label: "검정 + 노란 글씨" },
  red: { band: "#b0201f", text: "#ffffff", accent: "#ffe08a", label: "빨강 + 흰 글씨" },
  white: { band: "#f5f6f8", text: "#17181c", accent: "#b0201f", label: "흰 띠 + 검정 글씨" },
};

/**
 * 얼굴이 **어디 있는지** 찾습니다 — 살색 덩어리를 찾는 방식입니다.
 *
 * ⚠️ 얼굴 인식 모델이 아닙니다. 사진을 64칸으로 줄여서 살색인 칸을 표시하고,
 * 서로 붙어 있는 살색 덩어리 중 제일 큰 것을 얼굴로 봅니다. 모델을 받아 쓰면
 * 정확하지만 설치가 무겁고(수백 MB) 서버가 느려집니다. 이건 순수 계산이라 0원·즉시입니다.
 *
 * ⚠️ 왜 이걸 만들었나: 전에는 "위쪽 가운데가 얼굴"이라고 **가정**했습니다.
 * 실제로 그려보니 얼굴이 가운데나 옆에 있는 사진에서 **배경만 가리고 얼굴은 그대로** 나왔습니다.
 * 가려서 궁금하게 만들려던 게 그냥 사진 망가진 것처럼 보였습니다.
 *
 * ⚠️ 목·팔까지 한 덩어리로 잡히는 걸 막으려고, 덩어리 **위쪽**만 얼굴 비율(가로:세로 1:1.4)로
 * 잘라 씁니다. 살구색 벽·나무 가구가 얼굴로 잡히는 일은 여전히 있을 수 있습니다.
 *
 * @returns {{left:number,top:number,width:number,height:number}|null} 원본 사진 좌표. 못 찾으면 null.
 */
async function findFace(buf) {
  const GRID = 64;
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return null;

  const { data, info } = await sharp(buf)
    .resize(GRID, null, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  if (!W || !H) return null;

  // 살색 판정 — 방송·인쇄에서 쓰는 YCbCr 색 좌표의 살색 범위입니다.
  // (밝기와 상관없이 "색조"만 보기 때문에 조명이 달라도 비교적 버팁니다)
  const skin = new Uint8Array(W * H);
  let skinCount = 0;
  for (let i = 0; i < W * H; i++) {
    const r = data[i * C], g = data[i * C + 1], b = data[i * C + 2];
    if (r < 60) continue;                       // 너무 어두우면 색을 못 믿습니다
    if (!(r > g && r > b)) continue;            // 살색은 빨강이 가장 셉니다
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    if (cr >= 133 && cr <= 178 && cb >= 77 && cb <= 130) { skin[i] = 1; skinCount++; }
  }
  if (skinCount < W * H * 0.012) return null;   // 살색이 거의 없으면 인물 사진이 아닙니다

  // 붙어 있는 덩어리 찾기 (상하좌우 4방향). 제일 큰 덩어리를 얼굴로 봅니다.
  const seen = new Uint8Array(W * H);
  let best = null;
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!skin[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    let area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p - x) / W;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && skin[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && skin[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && skin[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && skin[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    if (!best || area > best.area) best = { area, x0, x1, y0, y1 };
  }
  if (!best || best.area < W * H * 0.008) return null;

  /**
   * ⚠️ 살구색 벽·나무 책상처럼 **넓게 깔린 것**은 얼굴이 아닙니다.
   * 가로로 길게 퍼졌거나(가로가 세로의 2.2배 넘음) 사진 폭을 거의 다 차지하면 버립니다.
   * 버리면 예전 방식(위쪽 가운데)으로 물러서니, 잘못 가리는 것보다 안전합니다.
   */
  const bw = best.x1 - best.x0 + 1;
  const bh = best.y1 - best.y0 + 1;
  if (bw > bh * 2.2 || bw > W * 0.92) return null;

  // 덩어리 위쪽만 얼굴 비율로 자릅니다 (목·어깨·팔이 딸려온 경우 대비).
  const gw = best.x1 - best.x0 + 1;
  const gh = Math.min(best.y1 - best.y0 + 1, Math.round(gw * 1.4));
  const k = meta.width / W;                     // 줄인 격자 → 원본 좌표 배율
  return {
    left: Math.round(best.x0 * k),
    top: Math.round(best.y0 * k),
    width: Math.round(gw * k),
    height: Math.round(gh * k),
  };
}

/**
 * 자르기 계획을 세웁니다 — 얼마나 당길지(scale), 어디를 뗄지(left/top).
 * 계산만 하고 그림은 안 건드립니다. 두 장을 나란히 붙일 때 **먼저 계획만 비교**해서
 * 얼굴 크기를 맞추려고 따로 뺐습니다.
 *
 * @param minFaceRatio 얼굴 높이가 화면의 이 비율은 되게 (두 장 크기 맞출 때 씀)
 */
function planFaceCrop({ iw, ih, box, w, h, eye = 0.38, minFaceRatio = 0 }) {
  const cover = Math.max(w / iw, h / ih);
  const cx0 = box.left + box.width / 2;
  const cy0 = box.top + box.height / 2;

  let scale = cover;
  // ① 얼굴이 작게 나온 사진이면 얼굴 높이가 42%쯤 되게 당깁니다.
  const faceOut = box.height * cover;
  if (faceOut > 0 && faceOut < h * 0.30) scale = Math.max(scale, cover * ((h * 0.42) / faceOut));
  // ①-2 두 장의 얼굴 크기를 맞추라는 주문이 있으면 그만큼 당깁니다.
  if (minFaceRatio > 0 && box.height > 0) scale = Math.max(scale, (h * minFaceRatio) / box.height);
  /**
   * ② 얼굴을 eye(기본 38%) 자리에 **놓을 여유가 없으면** 그만큼 더 당깁니다.
   *
   * ⚠️ 왜 필요한가: 두 장을 나란히 붙였을 때 얼굴 높이가 서로 어긋났습니다.
   * 얼굴이 사진 **위쪽**에 있으면 아무리 내려도 38%까지 안 내려오고,
   * **아래쪽**에 있으면 위로 올릴 여유(잘라낼 아랫부분)가 없어서 그대로 처집니다.
   * 두 방향 다 조금 당기면 여유가 생기고, 그제서야 두 장의 눈높이가 맞습니다.
   */
  if (cy0 > 0) scale = Math.max(scale, (h * eye) / cy0);
  if (ih - cy0 > 0) scale = Math.max(scale, (h * (1 - eye)) / (ih - cy0));
  /**
   * ③ 한계 세 가지.
   *   - 얼굴이 화면 높이의 55%를 넘게 크면 답답합니다(머리 위·턱이 잘려 보입니다).
   *   - 원본에서 잘라내는 폭이 420px 밑으로 내려가면 확대 티가 납니다.
   *   - 어떤 경우에도 cover(화면을 채우는 최소 배율)보다 작아지면 안 됩니다.
   */
  if (box.height > 0) scale = Math.min(scale, (h * 0.55) / box.height);
  scale = Math.max(cover, Math.min(scale, cover * 1.8, Math.max(cover, w / 420)));

  const sw = iw * scale, sh = ih * scale;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    scale,
    sw: Math.round(sw),
    sh: Math.round(sh),
    left: clamp(Math.round(cx0 * scale - w / 2), 0, Math.max(0, Math.round(sw - w))),
    top: clamp(Math.round(cy0 * scale - h * eye), 0, Math.max(0, Math.round(sh - h))),
    faceRatio: (box.height * scale) / h,   // 이 계획대로 자르면 얼굴이 화면의 몇 %가 되는지
  };
}

/** 사진 하나의 자르기 계획 (얼굴을 못 찾으면 null). */
async function faceCropPlan(buf, w, h, opts = {}) {
  const box = await findFace(buf).catch(() => null);
  if (!box) return null;
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return null;
  return { box, ...planFaceCrop({ iw: meta.width, ih: meta.height, box, w, h, ...opts }) };
}

/**
 * 얼굴이 화면에 잘 들어오게 잘라냅니다.
 *
 * ⚠️ 얼굴을 못 찾으면 **위쪽 중앙**(north)을 남깁니다 — 인물 사진은 얼굴이 위쪽 가운데
 * 있는 경우가 압도적으로 많습니다. 예전에는 sharp의 attention(대비가 제일 큰 곳을 남기는
 * 방식)을 썼는데, 배경이 화려하면 배경을 골라서 **얼굴이 옆으로 잘려나갔습니다.**
 */
async function cropFace(buf, w, h, { eye = 0.38, minFaceRatio = 0 } = {}) {
  const plan = await faceCropPlan(buf, w, h, { eye, minFaceRatio });
  if (!plan) return sharp(buf).resize(w, h, { fit: "cover", position: "north" }).toBuffer();

  return sharp(buf)
    .resize(plan.sw, plan.sh, { fit: "fill" })
    .extract({ left: plan.left, top: plan.top, width: w, height: h })
    .toBuffer();
}


/** 흑백으로 — 비포 쪽에 씁니다. 살짝 어둡게 해서 애프터가 더 살아나게. */
async function toMono(buf) {
  return sharp(buf).grayscale().modulate({ brightness: 0.88 }).toBuffer();
}

/**
 * 얼굴이 있을 자리를 모자이크로 가립니다 — "누구지?"를 만드는 장치입니다.
 *
 * ⚠️ 여기도 얼굴 인식을 안 합니다(cropFace와 같은 이유). cropFace가 **위쪽 중앙**을
 * 남기니까, 그 자리(가로 가운데, 위에서 6~36%)를 가립니다. 인물 사진에서는 거의
 * 맞고, 인물이 아닌 사진에서는 엉뚱한 데를 가립니다.
 * → 그래서 **부르는 쪽에서 인물 사진인지 확인하고** 부르셔야 합니다 (thumbAuto가 확인합니다).
 *
 * ⚠️ 흐리게(blur) 하지 않고 네모칸(pixelate)으로 가립니다. 흐린 건 "사진이 잘못됐나"로
 * 보이고, 네모칸은 "일부러 가렸구나"로 읽힙니다. 궁금증은 후자에서 생깁니다.
 */
// ⚠️ 처음엔 위에서 6~36%만 가렸습니다. 실제로 그려보니 **눈만 가려진 띠**가 되어서
// (증명사진 검은 띠 같은 모양) 정체가 그대로 보였습니다. 코·입까지 덮이도록 넓혔습니다.
const FACE_ZONE = { cx: 0.5, top: 0.08, w: 0.46, h: 0.38 };

async function applyMosaic(buf, w, h, { zone = null, blocks = 11 } = {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let rx, ry, rw, rh;

  // 1순위 — 잘라놓은 그림에서 얼굴을 직접 찾습니다(자른 뒤라 좌표가 그대로 맞습니다).
  const found = zone ? null : await findFace(buf).catch(() => null);
  if (found) {
    // 머리카락·턱선까지 덮이도록 조금 넓힙니다. 딱 얼굴만 덮으면 가장자리로 누군지 보입니다.
    const padX = Math.round(found.width * 0.14);
    const padY = Math.round(found.height * 0.18);
    rw = clamp(found.width + padX * 2, 8, w);
    rh = clamp(found.height + padY * 2, 8, h);
    rx = clamp(found.left - padX, 0, w - rw);
    ry = clamp(found.top - padY, 0, h - rh);
  } else {
    // 2순위 — 못 찾으면 인물 사진의 통계적 얼굴 자리(위쪽 가운데).
    const z = zone || FACE_ZONE;
    rw = clamp(Math.round(w * z.w), 8, w);
    rh = clamp(Math.round(h * z.h), 8, h);
    rx = clamp(Math.round(w * z.cx - rw / 2), 0, w - rw);
    ry = clamp(Math.round(h * z.top), 0, h - rh);
  }

  // 잘라내서 아주 작게 줄였다가 원래 크기로 되돌리면 네모칸 모자이크가 됩니다.
  // nearest(가장 가까운 점)로 늘려야 네모가 뭉개지지 않고 각지게 남습니다.
  const tiny = await sharp(buf)
    .extract({ left: rx, top: ry, width: rw, height: rh })
    .resize(blocks, Math.max(1, Math.round((blocks * rh) / rw)), { kernel: "nearest" })
    .toBuffer();
  const block = await sharp(tiny).resize(rw, rh, { kernel: "nearest" }).toBuffer();

  /**
   * ⚠️ 네모로 가리면 **사진이 깨진 것처럼** 보입니다. 실제로 그려보고 알았습니다.
   * 얼굴은 둥그니까 타원으로 가립니다. 그래야 "일부러 가렸구나"로 읽히고,
   * 배경까지 뭉텅이로 지워지지 않습니다.
   */
  const oval = await sharp(block)
    .composite([{
      input: Buffer.from(
        `<svg width="${rw}" height="${rh}" xmlns="http://www.w3.org/2000/svg">` +
        `<ellipse cx="${rw / 2}" cy="${rh / 2}" rx="${rw / 2}" ry="${rh / 2}" fill="#fff"/></svg>`
      ),
      blend: "dest-in",
    }])
    .png()
    .toBuffer();

  return sharp(buf).composite([{ input: oval, left: rx, top: ry }]).toBuffer();
}

/**
 * 큰 글씨 — 홈판 최상위(nidle_831)가 쓰는 유튜브식 대문 글씨.
 *
 * ⚠️ 띠를 안 깝니다. 사진 위에 바로 얹습니다. 대신 **검은 테두리**를 둘러서
 * 어떤 사진 위에서도 읽히게 합니다.
 *
 * ⚠️ 테두리를 어떻게 그리나: 글자를 그리는 alignedText는 글자를 **길(path)**로 바꿔
 * 채우기만 합니다. stroke를 줄 수가 없습니다. 그래서 **같은 글자를 여덟 방향으로
 * 조금씩 밀어 검게 깔고, 그 위에 흰 글자를 얹습니다.** 흔히 쓰는 방법이고 결과가 같습니다.
 *
 * ⚠️ 핵심 낱말 하나만 빨강으로 뺍니다. 숫자·가격이 있으면 그것을, 없으면 첫 낱말을.
 * 다 빨갛게 하면 아무것도 강조가 안 됩니다.
 */
function bigTextSvg({ w, h, text, theme = "black" }) {
  const t = THEMES[theme] || THEMES.black;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  // 두 줄까지. 한 줄이 화면 폭의 88%를 넘으면 나눕니다.
  const maxW = w * 0.88;
  let size = Math.round(w * 0.13);
  const fit = (line) => {
    let s = size;
    while (measureText(line, s) > maxW && s > 20) s -= 2;
    return s;
  };
  let lines = [words.join(" ")];
  if (measureText(lines[0], size) > maxW && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }
  size = Math.min(...lines.map(fit));

  /**
   * 강조할 낱말 하나.
   *   ① 숫자가 든 낱말 (6억? 95억 40분 — 숫자가 제일 셉니다)
   *   ② 없으면 **제일 긴 낱말** — 대개 그게 알맹이입니다
   *
   * ⚠️ 처음엔 그냥 첫 낱말을 빨갛게 했는데, "멤버 한 명이 소시오패스였다"에서
   * '멤버'가 빨개졌습니다. 알맹이는 '소시오패스였다'입니다. 조사·관형어가 앞에
   * 오는 한국어에서 첫 낱말은 알맹이가 아닌 경우가 많습니다.
   */
  const accentWord =
    words.find((x) => /\d/.test(x)) ||
    words.reduce((a, b) => (b.length > a.length ? b : a), words[0]);

  const lineH = Math.round(size * 1.22);
  // 아래 1/3 자리에 놓습니다. 인물 얼굴(위쪽 38%)을 안 가립니다.
  const baseY = Math.round(h * 0.78) - (lines.length - 1) * lineH;
  const OFF = Math.max(2, Math.round(size * 0.055));   // 테두리 두께
  const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

  let out = "";
  lines.forEach((line, i) => {
    const y = baseY + i * lineH;
    // 1) 검은 테두리 — 여덟 방향
    for (const [dx, dy] of RING) {
      out += alignedText(line, w / 2 + dx * OFF, y + dy * OFF, size, "#111318", { anchor: "middle" });
    }
    // 2) 흰 글자. 강조 낱말이 이 줄에 있으면 그 낱말만 따로 빨갛게 덮습니다.
    out += alignedText(line, w / 2, y, size, t.text, { anchor: "middle" });
    const at = line.indexOf(accentWord);
    if (at >= 0) {
      const before = line.slice(0, at);
      const lineW = measureText(line, size);
      const x0 = w / 2 - lineW / 2 + measureText(before, size);
      out += alignedText(accentWord, x0, y, size, "#ff3b30", { anchor: "start" });
    }
  });

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`);
}

/**
 * 여러 장을 세로 띠로 이어붙입니다 (3장 콜라주).
 * ⚠️ 뷰티·패션 메이트가 자주 쓰는 틀입니다. 글씨 없이 정보량으로 승부합니다.
 */
async function collage({ bufs, text = "", sub = "", size = "square", theme = "black" }) {
  const S = SIZES[size] || SIZES.square;
  const list = (bufs || []).filter(Boolean).slice(0, 3);
  if (list.length < 2) throw new Error("콜라주는 사진이 두 장 이상 필요합니다.");

  const n = list.length;
  const colW = Math.floor(S.w / n);
  const parts = await Promise.all(list.map((b) => cropFace(b, colW, S.h)));

  const layers = parts.map((input, i) => ({ input, left: i * colW, top: 0 }));
  // 사이에 가는 흰 선 — 없으면 한 장처럼 붙어 보여 대비가 죽습니다.
  for (let i = 1; i < n; i++) {
    layers.push({
      input: Buffer.from(
        `<svg width="5" height="${S.h}" xmlns="http://www.w3.org/2000/svg"><rect width="5" height="${S.h}" fill="#fff"/></svg>`
      ),
      left: i * colW - 2,
      top: 0,
    });
  }
  if (text) layers.push({ input: overlaySvg({ w: S.w, h: S.h, text, sub, theme }), left: 0, top: 0 });

  return sharp({ create: { width: S.w, height: S.h, channels: 3, background: "#000" } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * 오버레이 띠 + 글자.
 * ⚠️ 글자가 띠보다 길면 잘립니다. 넘치면 글자 크기를 줄여 맞춥니다.
 */
function overlaySvg({ w, h, text, sub, theme, position = "bottom" }) {
  const t = THEMES[theme] || THEMES.black;
  const pad = Math.round(w * 0.05);
  const maxW = w - pad * 2;

  // 8자 안팎이 기준입니다. 길면 줄여서라도 한 줄에 넣습니다.
  let size = Math.round(w * 0.13);
  while (measureText(text, size) > maxW && size > 24) size -= 2;

  const subSize = Math.round(size * 0.34);
  const bandH = Math.round(size * (sub ? 2.1 : 1.7));
  const bandY = position === "top" ? 0 : h - bandH;
  const baseY = bandY + Math.round(size * 1.05);

  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${bandY}" width="${w}" height="${bandH}" fill="${t.band}" opacity="0.93"/>
      ${alignedText(text, w / 2, baseY, size, t.text, { anchor: "middle" })}
      ${sub ? alignedText(sub, w / 2, baseY + subSize * 1.5, subSize, t.accent, { anchor: "middle" }) : ""}
    </svg>`
  );
}

/** 왼쪽/오른쪽 라벨 (BEFORE / AFTER) */
function labelSvg({ w, h, left, right }) {
  const size = Math.round(w * 0.035);
  const padY = Math.round(h * 0.045);
  const box = (x, text, bg) => {
    const tw = measureText(text, size);
    const bw = tw + size * 1.2;
    const bh = size * 1.9;
    return (
      `<rect x="${x - bw / 2}" y="${padY - bh * 0.72}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${bg}" opacity="0.9"/>` +
      alignedText(text, x, padY + size * 0.3, size, "#ffffff", { anchor: "middle" })
    );
  };
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      ${box(w * 0.25, left, "#4b5563")}
      ${box(w * 0.75, right, "#b0201f")}
    </svg>`
  );
}

/**
 * 두 장을 좌우로 붙입니다. 왼쪽은 흑백, 오른쪽은 컬러.
 * @param {Buffer} beforeBuf 왼쪽에 올 사진
 * @param {Buffer} afterBuf  오른쪽에 올 사진
 */
async function beforeAfter({
  beforeBuf,
  afterBuf,
  text = "",
  sub = "",
  size = "square",
  theme = "black",
  labels = { left: "BEFORE", right: "AFTER" },
  // "left" | "right" — 한쪽만 얼굴을 가려 "누구?"로 끌 때 (thumbStrategy의 두 명 중 1명 모자이크)
  mosaicSide = null,
  /**
   * 왼쪽을 흑백으로 할지.
   * ⚠️ 전/후 비교에서는 흑백이 맞습니다(과거 vs 현재). 그런데 **인물 + 소재**를 붙이는
   * 틀(splitSubject — 사람과 건물)에서는 왼쪽 사람이 흑백이 되어 버립니다.
   * 같은 함수가 두 틀을 다 그리므로 끌 수 있어야 합니다.
   */
  mono = true,
}) {
  const S = SIZES[size] || SIZES.square;
  const halfW = Math.round(S.w / 2);

  /**
   * ⚠️ 순서가 중요합니다 — **모자이크를 먼저, 흑백은 나중에.**
   * 처음엔 흑백으로 바꾼 뒤에 모자이크를 걸었는데, 얼굴 찾기가 살색을 보기 때문에
   * 흑백 사진에서는 얼굴을 못 찾아서 엉뚱한 자리를 가렸습니다(왼쪽만 그랬습니다).
   */
  /**
   * 두 장의 **얼굴 크기를 맞춥니다.**
   *
   * ⚠️ 눈높이만 맞췄더니 한쪽 얼굴이 눈에 띄게 크게 나와서 짝이 안 맞아 보였습니다.
   * 먼저 각각 어떻게 잘릴지 계획만 뽑아서, 둘 중 **더 큰 쪽에 맞춰** 작은 쪽을 당깁니다.
   * (작은 쪽으로 맞추려면 큰 쪽을 줄여야 하는데, 줄이면 화면에 빈 자리가 생깁니다.)
   */
  const [planB, planA] = await Promise.all([
    faceCropPlan(beforeBuf, halfW, S.h).catch(() => null),
    faceCropPlan(afterBuf, halfW, S.h).catch(() => null),
  ]);
  const sameFace = planB && planA
    ? Math.min(0.5, Math.max(planB.faceRatio, planA.faceRatio))
    : 0;

  let [left, right] = await Promise.all([
    cropFace(beforeBuf, halfW, S.h, { minFaceRatio: sameFace }),
    cropFace(afterBuf, halfW, S.h, { minFaceRatio: sameFace }),
  ]);
  if (mosaicSide === "left") left = await applyMosaic(left, halfW, S.h);
  if (mosaicSide === "right") right = await applyMosaic(right, halfW, S.h);
  if (mono) left = await toMono(left);

  const layers = [
    { input: left, left: 0, top: 0 },
    { input: right, left: halfW, top: 0 },
    // 가운데 가는 선 — 두 장이 한 장처럼 붙어 보이면 대비가 안 삽니다.
    {
      input: Buffer.from(
        `<svg width="6" height="${S.h}" xmlns="http://www.w3.org/2000/svg"><rect width="6" height="${S.h}" fill="#ffffff"/></svg>`
      ),
      left: halfW - 3,
      top: 0,
    },
  ];
  if (labels) layers.push({ input: labelSvg({ w: S.w, h: S.h, ...labels }), left: 0, top: 0 });
  if (text) layers.push({ input: overlaySvg({ w: S.w, h: S.h, text, sub, theme }), left: 0, top: 0 });

  return sharp({ create: { width: S.w, height: S.h, channels: 3, background: "#000" } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * 한 장짜리.
 * @param style "band"(어두운 띠 + 글씨) | "big"(띠 없이 큰 글씨 + 검은 테두리) | "none"(글씨 없음)
 */
async function single({
  buf, text = "", sub = "", size = "square", theme = "black",
  position = "bottom", mosaic = false, style = "band",
}) {
  const S = SIZES[size] || SIZES.square;
  let base = await cropFace(buf, S.w, S.h, { eye: position === "top" ? 0.52 : 0.38 });
  if (mosaic) base = await applyMosaic(base, S.w, S.h);
  const layers = [];
  if (text && style === "big") {
    const svg = bigTextSvg({ w: S.w, h: S.h, text, theme });
    if (svg) layers.push({ input: svg, left: 0, top: 0 });
  } else if (text && style !== "none") {
    layers.push({ input: overlaySvg({ w: S.w, h: S.h, text, sub, theme, position }), left: 0, top: 0 });
  }
  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
}

/**
 * 패턴 하나를 그림으로 만듭니다 — thumbPatterns.js의 render 지시를 해석합니다.
 *
 * ⚠️ 못 만들면 **조용히 다른 걸 그리지 않고 던집니다.** 사장님이 고른 틀과 다른 게
 * 나오면 그게 더 나쁩니다. 부르는 쪽에서 걸러야 합니다(thumbPatterns가 사진 수로 거릅니다).
 */
async function renderPattern(pattern, bufs, { text = "", sub = "", size = "square", theme = "black" } = {}) {
  const r = (pattern && pattern.render) || {};
  const list = (bufs || []).filter(Boolean);
  if (!list.length) throw new Error("사진이 없습니다.");

  if (r.kind === "collage") {
    return collage({ bufs: list.slice(0, r.n || 3), text, sub, size, theme });
  }
  if (r.kind === "pair") {
    if (list.length < 2) throw new Error("이 틀은 사진이 두 장 필요합니다.");
    return beforeAfter({
      beforeBuf: list[0], afterBuf: list[1],
      text: r.band === false ? "" : text,
      sub, size, theme,
      labels: r.labels || null,
      mosaicSide: r.mosaicSide || null,
      mono: r.mono !== false,
    });
  }
  // single
  return single({
    buf: list[0],
    text: r.textSize === "none" ? "" : text,
    sub,
    size: r.size || size,
    theme,
    mosaic: !!r.mosaic,
    style: r.textSize === "big" ? "big" : r.textSize === "none" ? "none" : "band",
  });
}

/**
 * 본문을 보고 썸네일 문구를 뽑습니다.
 * ⚠️ AI를 쓰지 않습니다. 제목에서 가져옵니다.
 * 썸네일 문구는 8자 안팎이라 지어낼 여지가 없고, 제목과 다른 말을 쓰면
 * 들어온 사람이 헷갈립니다. 제목의 핵심만 잘라 씁니다.
 */
function suggestText(title = "") {
  const t = String(title).trim();
  if (!t) return [];
  const out = [];

  // 따옴표 안의 말 — 이미 사람 말이라 짧고 세 있습니다.
  const quoted = t.match(/[""'']([^""'']{2,14})[""'']/);
  if (quoted) out.push(quoted[1]);

  // 말줄임표 앞뒤 — 궁금증을 만든 자리입니다.
  const parts = t.split(/\.{2,}|…/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const clean = p.replace(/[""''"']/g, "").trim();
    if (clean.length >= 2 && clean.length <= 12) out.push(clean);
  }

  // 마지막 어절 두세 개 — 대개 여기에 결론이 있습니다.
  const words = t.replace(/[""''"']/g, "").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const tail = words.slice(-2).join(" ");
    if (tail.length <= 12) out.push(tail);
  }

  return [...new Set(out)].filter((s) => s.length >= 2).slice(0, 5);
}

module.exports = { beforeAfter, single, collage, renderPattern, suggestText, applyMosaic, findFace, cropFace, faceCropPlan, FACE_ZONE, SIZES, THEMES };
