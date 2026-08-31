// 롱폼 → 쇼츠 "이지컷 방식" 화면 만들기 (2026-09-01)
//
// ⚠️ 왜 새로 만드나
// 예전 longToShorts는 가로 영상을 **흐린 배경 위에 얹는** 방식이었습니다.
// 화면의 위아래 절반이 뭉갠 배경으로 낭비되고 인물은 작게 박혀서, 사장님 말씀대로
// "AI로 대충 만든 티"가 났습니다. 이지컷 화면을 뜯어보니 방식이 아예 달랐습니다:
//
//   ┌──────────────┐
//   │  훅 2줄       │  ← 흰 배경, 둘째 줄만 색으로 대비
//   ├──────────────┤
//   │              │
//   │   영상        │  ← 흐린 배경 없이 **피사체 위치로 잘라낸** 세로 화면
//   │              │
//   ├──────────────┤
//   │ 🙂 댓글 한 줄  │  ← 진짜 댓글처럼 보이는 카드 (좋아요 수까지)
//   │  👍 494  댓글 │
//   ├──────────────┤
//   │  ● 채널명      │
//   └──────────────┘
//
// 댓글 카드가 핵심입니다. 시청자가 댓글을 읽느라 **끝까지 봅니다.**
//
// ⚠️ 글자는 시스템 폰트를 안 씁니다. cardNewsGenerator의 glyphPaths로 **글자를
// 그림(SVG path)으로 바꿔** 그립니다. 서버(리눅스)에 한글 폰트가 없어도 안 깨집니다.
// 예전에 <text> 태그로 그렸다가 서버에서만 네모로 나온 사고가 있었습니다.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const sharp = require("sharp");
const ffmpegPath = require("ffmpeg-static");
const { glyphPaths, alignedText, measureText } = require("./cardNewsGenerator");

const W = 1080;
const H = 1920;

/** 화면 배치 — 합이 1920이 되게 맞춰둡니다. */
const LAYOUT = {
  hookTop: 96,        // 훅 첫 줄 기준선
  hookLine: 104,      // 훅 줄 간격
  videoTop: 300,      // 영상 시작 y
  videoH: 1240,       // 영상 높이 (가로 1080 → 세로로 잘라낸 비율 0.87)
  commentTop: 1580,   // 댓글 카드 시작 y
  commentH: 210,
  badgeY: 1856,
};

const THEMES = {
  light: { bg: "#ffffff", hook1: "#111111", hook2: "#1a73e8", card: "#f5f6f8", name: "#8a8f98", text: "#1a1a1a", meta: "#9aa0a6", badge: "#333333" },
  dark:  { bg: "#0b0b0d", hook1: "#ffffff", hook2: "#ff5a5f", card: "#1a1c20", name: "#8a8f98", text: "#f2f2f2", meta: "#7c8288", badge: "#e6e6e6" },
};

function run(bin, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).slice(-800)));
      resolve(stdout);
    });
  });
}

const escapeFilterPath = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

// ────────────────────────────────────────────────────────────
// 1. 어디를 잘라낼까 — 피사체 찾기
// ────────────────────────────────────────────────────────────

/**
 * 영상에서 **사람·움직임이 있는 쪽**을 찾아 가로 자를 위치를 정합니다.
 *
 * ⚠️ 얼굴 인식 라이브러리를 새로 들이지 않았습니다. sharp에 이미 있는
 * `attention` 전략이 화면에서 눈길이 가는 자리를 찾아줍니다(libvips 기능).
 * 자른 결과의 offset을 그대로 받아 쓰면 됩니다 — 새 의존성 0개.
 *
 * ⚠️ 프레임 하나만 보면 그 순간 인물이 비켜서 있을 때 엉뚱한 데를 잡습니다.
 * 구간에서 3장을 뽑아 **중앙값**을 씁니다. 평균은 한 장이 튀면 끌려갑니다.
 *
 * ⚠️ 구간마다 **하나의 고정 위치**를 씁니다. 프레임마다 따라가면 화면이 덜덜 떨립니다.
 */
async function findCropX(srcPath, start, dur, srcW, srcH, cropW) {
  const tmp = path.join(os.tmpdir(), "l2s-frames-" + crypto.randomUUID().slice(0, 8));
  fs.mkdirSync(tmp, { recursive: true });
  const offsets = [];
  try {
    const at = [start + dur * 0.2, start + dur * 0.5, start + dur * 0.8];
    for (let i = 0; i < at.length; i++) {
      const f = path.join(tmp, `f${i}.png`);
      try {
        await run(ffmpegPath, ["-y", "-ss", String(at[i]), "-i", srcPath, "-frames:v", "1", "-q:v", "3", f], { timeout: 60000 });
        const { info } = await sharp(f)
          .resize(cropW, srcH, { fit: "cover", position: sharp.strategy.attention })
          .toBuffer({ resolveWithObject: true });
        if (typeof info.cropOffsetLeft === "number") offsets.push(Math.abs(info.cropOffsetLeft));
      } catch { /* 한 장 실패는 넘어갑니다 — 나머지로 정합니다 */ }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  if (!offsets.length) return Math.max(0, Math.round((srcW - cropW) / 2)); // 못 찾으면 가운데
  offsets.sort((a, b) => a - b);
  const mid = offsets[Math.floor(offsets.length / 2)];
  return Math.max(0, Math.min(srcW - cropW, mid));
}

/** 원본 크기를 읽습니다. 잘라낼 폭을 계산하려면 필요합니다. */
async function probeSize(srcPath) {
  const ffprobe = ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m) => (m.toLowerCase().includes(".exe") ? "ffprobe.exe" : "ffprobe"));
  try {
    const out = await run(ffprobe, ["-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", srcPath], { timeout: 60000 });
    const [w, h] = String(out).trim().split(",").map(Number);
    if (w > 0 && h > 0) return { w, h };
  } catch { /* ffprobe가 없는 환경도 있습니다 */ }
  return { w: 1920, h: 1080 }; // 대부분 유튜브 롱폼이 이 크기입니다
}

// ────────────────────────────────────────────────────────────
// 2. 겉꾸미기 — 훅 2줄 + 댓글 카드
// ────────────────────────────────────────────────────────────

const escXml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 폭에 맞춰 줄을 나눕니다. 글자 폭을 실제로 재서 자릅니다. */
function fitLines(text, fontSize, maxWidth, maxLines = 2) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (measureText(cand, fontSize) <= maxWidth || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

/**
 * 배경 + 훅 + 댓글 카드를 PNG 한 장으로 그립니다. 영상 자리는 **비워둡니다**
 * (그 위에 영상을 얹는 게 아니라, 이 그림을 배경으로 깔고 영상을 그 자리에 넣습니다).
 */
async function buildFramePng({ hook = "", hookLine1 = "", hookLine2 = "", comment = {}, channel = "", theme = "light" }) {
  const T = THEMES[theme] || THEMES.light;
  const pad = 56;

  /**
   * ── 훅 2줄 — 둘째 줄만 색을 달리해 대비를 줍니다 (이지컷이 쓰는 방식) ──
   * ⚠️ 두 줄을 이어붙인 문자열을 받아 다시 나누면 안 됩니다. 폭이 남으면
   * 한 줄로 붙어버려서 대비가 통째로 사라집니다(실제로 그렇게 나왔습니다).
   * line1/line2를 따로 받는 게 원칙이고, 한 문자열만 올 때만 나눠 씁니다.
   */
  let lines;
  if (hookLine1 || hookLine2) lines = [hookLine1, hookLine2].filter(Boolean);
  else lines = fitLines(hook, 62, W - pad * 2, 2);

  let hookSvg = "";
  lines.forEach((ln, i) => {
    // 줄이 넘치면 글자를 줄여서라도 한 줄에 넣습니다 — 훅은 잘리면 안 됩니다.
    let size = 62;
    while (size > 40 && measureText(ln, size) > W - pad * 2) size -= 2;
    hookSvg += alignedText(ln, W / 2, LAYOUT.hookTop + i * LAYOUT.hookLine, size,
      i === 0 ? T.hook1 : T.hook2, { anchor: "middle" });
  });

  // ── 댓글 카드 ──
  const cy = LAYOUT.commentTop;
  const av = 62;                       // 프로필 동그라미 지름
  const avX = pad + av / 2;
  const textX = pad + av + 24;
  const name = String(comment.name || "시청자").slice(0, 14);
  const body = fitLines(comment.text || "", 40, W - textX - pad, 2);
  const likes = String(comment.likes || "").trim();

  let cardSvg =
    `<rect x="${pad - 16}" y="${cy - 34}" width="${W - (pad - 16) * 2}" height="${LAYOUT.commentH}" rx="24" fill="${T.card}"/>` +
    `<circle cx="${avX}" cy="${cy + 4}" r="${av / 2}" fill="${T.hook2}" opacity="0.85"/>` +
    alignedText(name.slice(0, 1), avX, cy + 18, 34, "#ffffff", { anchor: "middle" }) +
    glyphPaths(name, textX, cy - 2, 28, T.name);
  body.forEach((ln, i) => { cardSvg += glyphPaths(ln, textX, cy + 44 + i * 48, 40, T.text); });
  if (likes) {
    const ly = cy + 44 + body.length * 48 + 8;
    /**
     * ⚠️ 하트를 글자(♥)로 찍었더니 **네모로 깨졌습니다.** NotoSansKR-Bold에 그 글자가
     * 없습니다. 글자로 못 쓰는 기호는 **도형으로 직접 그립니다** — 폰트를 안 탑니다.
     */
    const hx = textX + 2, hy = ly - 9, r = 7;
    cardSvg +=
      `<path d="M ${hx} ${hy + r * 0.6} C ${hx} ${hy - r * 0.5}, ${hx - r} ${hy - r * 0.5}, ${hx - r} ${hy + r * 0.35} ` +
      `C ${hx - r} ${hy + r * 1.1}, ${hx} ${hy + r * 1.3}, ${hx} ${hy + r * 1.9} ` +
      `C ${hx} ${hy + r * 1.3}, ${hx + r} ${hy + r * 1.1}, ${hx + r} ${hy + r * 0.35} ` +
      `C ${hx + r} ${hy - r * 0.5}, ${hx} ${hy - r * 0.5}, ${hx} ${hy + r * 0.6} Z" fill="${T.meta}"/>`;
    const numX = textX + 26;
    cardSvg += glyphPaths(likes, numX, ly, 28, T.meta);
    cardSvg += glyphPaths("답글", numX + measureText(likes, 28) + 40, ly, 28, T.meta);
  }

  // ── 채널 배지 ──
  let badgeSvg = "";
  if (channel) {
    const bw = measureText(channel, 30) + 76;
    const bx = (W - bw) / 2;
    badgeSvg =
      `<rect x="${bx}" y="${LAYOUT.badgeY - 34}" width="${bw}" height="52" rx="26" fill="${T.card}"/>` +
      `<circle cx="${bx + 26}" cy="${LAYOUT.badgeY - 8}" r="12" fill="${T.hook2}"/>` +
      glyphPaths(channel, bx + 48, LAYOUT.badgeY + 2, 30, T.badge);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="${T.bg}"/>` +
    hookSvg + cardSvg + badgeSvg +
    `</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ────────────────────────────────────────────────────────────
// 3. 자막 — 영상 자리 안쪽 아래에 굽습니다
// ────────────────────────────────────────────────────────────

const assTime = (sec) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${r}`;
};

/**
 * 구간에 걸친 자막만 골라 ASS로 만듭니다.
 *
 * ⚠️ 시각을 **구간 시작 기준으로 다시 계산**해야 합니다. 원본 시각 그대로 두면
 * 잘라낸 영상에서는 자막이 영영 안 나옵니다.
 */
function buildAssForClip(cues, moment, outPath) {
  const inClip = cues
    .filter((c) => c.end > moment.start && c.start < moment.end)
    .map((c) => ({
      start: Math.max(0, c.start - moment.start),
      end: Math.min(moment.end - moment.start, c.end - moment.start),
      text: String(c.text || "").replace(/\s+/g, " ").trim(),
    }))
    .filter((c) => c.text && c.end > c.start);

  const events = inClip.map((c) => {
    const lines = fitLines(c.text, 46, W - 160, 2);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Sub,,0,0,0,,${lines.join("\\N")}`;
  });

  // MarginV는 아래에서 띄우는 값입니다. 영상 자리 안쪽에 앉게 맞춥니다.
  const marginV = H - (LAYOUT.videoTop + LAYOUT.videoH) + 40;

  const ass =
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n` +
    `[V4+ Styles]\n` +
    `Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n` +
    `Style: Sub,NotoSansKR,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,80,80,${marginV},1\n\n` +
    `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    events.join("\n") + "\n";

  fs.writeFileSync(outPath, ass, "utf8");
  return inClip.length;
}

// ────────────────────────────────────────────────────────────
// 4. 한 편 만들기
// ────────────────────────────────────────────────────────────

/**
 * 구간 하나를 이지컷 방식 쇼츠로 만듭니다.
 *
 * ⚠️ 흐린 배경을 쓰지 않습니다. 피사체 위치로 **진짜 잘라냅니다.**
 * 잘리는 부분이 생기지만, 인물이 크게 보이는 쪽이 훨씬 잘 봅니다.
 */
async function renderShort(srcPath, moment, destPath, { cues = [], channel = "", theme = "light", subtitles = true } = {}) {
  const dur = +(moment.end - moment.start).toFixed(2);
  const work = path.join(os.tmpdir(), "l2s-" + crypto.randomUUID().slice(0, 8));
  fs.mkdirSync(work, { recursive: true });

  try {
    const { w: srcW, h: srcH } = await probeSize(srcPath);

    // 영상 자리 비율(1080:1240)에 맞춰 원본에서 잘라낼 폭
    const cropW = Math.min(srcW, Math.round(srcH * (W / LAYOUT.videoH)));
    const cropX = await findCropX(srcPath, moment.start, dur, srcW, srcH, cropW);

    const framePng = path.join(work, "frame.png");
    fs.writeFileSync(framePng, await buildFramePng({
      hook: moment.hook || "",
      hookLine1: moment.hookLine1 || "",
      hookLine2: moment.hookLine2 || "",
      comment: moment.comment || {},
      channel, theme,
    }));

    const steps = [
      `[0:v]crop=${cropW}:${srcH}:${cropX}:0,scale=${W}:${LAYOUT.videoH}:flags=lanczos[vid]`,
      `[1:v][vid]overlay=0:${LAYOUT.videoTop}[out0]`,
    ];

    let last = "out0";
    if (subtitles && cues.length) {
      const assFile = path.join(work, "sub.ass");
      const n = buildAssForClip(cues, moment, assFile);
      if (n > 0) {
        const fontsDir = escapeFilterPath(path.join(__dirname, "..", "assets", "fonts"));
        steps.push(`[out0]subtitles=filename='${escapeFilterPath(assFile)}':fontsdir='${fontsDir}'[out1]`);
        last = "out1";
      }
    }

    await run(ffmpegPath, [
      "-y",
      "-ss", String(moment.start), "-t", String(dur), "-i", srcPath,
      "-i", framePng,
      "-filter_complex", steps.join(";"),
      "-map", `[${last}]`, "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart", "-r", "30",
      destPath,
    ], { timeout: 900000 });

    return { cropX, cropW, srcW, srcH };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { renderShort, buildFramePng, findCropX, probeSize, LAYOUT, THEMES, W, H, fitLines };
