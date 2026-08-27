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
 * 얼굴이 있을 만한 쪽으로 잘라냅니다.
 *
 * ⚠️ 얼굴 인식은 안 합니다. 그러려면 별도 모델이 필요하고, 틀리면 엉뚱한 곳을
 * 잘라서 오히려 나빠집니다. 대신 **위쪽 중앙**을 남깁니다.
 * 인물 사진은 얼굴이 위쪽 가운데 있는 경우가 압도적으로 많습니다.
 *
 * ⚠️ 처음엔 sharp의 attention(대비가 제일 큰 곳을 찾아 남기는 방식)을 썼습니다.
 * 실제로 돌려보니 **얼굴이 옆으로 잘려나갔습니다.** 배경이 화려하면 얼굴 대신
 * 배경을 골라버립니다. 똑똑한 방식이 늘 나은 게 아닙니다.
 * north(위쪽 가운데)는 단순하지만 인물 사진에서 틀릴 일이 거의 없습니다.
 */
async function cropFace(buf, w, h) {
  return sharp(buf).resize(w, h, { fit: "cover", position: "north" }).toBuffer();
}

/** 흑백으로 — 비포 쪽에 씁니다. 살짝 어둡게 해서 애프터가 더 살아나게. */
async function toMono(buf) {
  return sharp(buf).grayscale().modulate({ brightness: 0.88 }).toBuffer();
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
}) {
  const S = SIZES[size] || SIZES.square;
  const halfW = Math.round(S.w / 2);

  const [left, right] = await Promise.all([
    cropFace(beforeBuf, halfW, S.h).then(toMono),
    cropFace(afterBuf, halfW, S.h),
  ]);

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

/** 한 장짜리 — 오버레이만 얹습니다. */
async function single({ buf, text = "", sub = "", size = "square", theme = "black", position = "bottom" }) {
  const S = SIZES[size] || SIZES.square;
  const base = await cropFace(buf, S.w, S.h);
  const layers = [];
  if (text) layers.push({ input: overlaySvg({ w: S.w, h: S.h, text, sub, theme, position }), left: 0, top: 0 });
  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
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

module.exports = { beforeAfter, single, suggestText, SIZES, THEMES };
