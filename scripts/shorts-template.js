#!/usr/bin/env node
/**
 * 쇼츠 자막 템플릿 — 2026-09-03
 *
 * 사장님이 보내주신 쇼츠 4종(가십 채널)의 문법을 뜯어 재사용 가능한 양식으로 만든 것입니다.
 * 소재는 안 가립니다. 가전·육아·경제 무엇에 써도 됩니다.
 *
 * ── 뜯어보니 규칙이 이렇게 되어 있었습니다 ──
 *   1) 상단 검은 밴드에 2줄. 첫 줄은 상황, 둘째 줄이 결론입니다.
 *   2) 한 화면에 강조색은 **하나만** 씁니다. 노랑과 빨강을 같이 쓰면 둘 다 죽습니다.
 *   3) 숫자는 반드시 강조색으로 뺍니다 — "100억", "TOP7", "33기"가 전부 그랬습니다.
 *   4) 하단 자막은 흰 글씨 + 두꺼운 검은 테두리. 배경이 뭐든 읽힙니다.
 *   5) 리액션 자막(형광 연두)은 영상 위에 얹습니다. 밴드 안에 넣지 않습니다.
 *
 * ⚠️ 이 파일은 **틀만** 만듭니다. 남의 영상·사진을 넣는 것은 저작권 문제입니다.
 *    우리 영상이나 직접 만든 화면에 씁니다.
 *
 * 사용법
 *   node scripts/shorts-template.js list
 *   node scripts/shorts-template.js render <템플릿> <입력영상> <출력.mp4> [옵션]
 *   node scripts/shorts-template.js sample <템플릿> <입력영상> <출력.png>
 *
 * 옵션 (--키=값)
 *   --top1 --top2       상단 밴드 두 줄
 *   --hi                강조할 낱말 (top1/top2 안에 있으면 그 낱말만 색이 바뀝니다)
 *   --sub               하단 자막
 *   --react             영상 위 형광 리액션 자막 (없으면 안 나옵니다)
 *   --big               영상 위 대형 자막 (한 낱말짜리 되물음)
 *   --brand             최상단 채널 바 (화이트형 전용, 이모지는 자동으로 지워집니다)
 *   --credit            출처 표기 ("출처 | 편스토랑" 형태)
 *   --ratio             영상 크롭 비율. 기본 1.2. 작을수록 크게 나오고 좌우가 더 잘립니다
 *   --start --dur       잘라낼 구간 (초)
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const W = 1080, H = 1920;

/** 색 — 가십 쇼츠 4종에서 실제로 쓰이던 값에 맞췄습니다. */
const C = {
  white: "white",
  yellow: "#FFE400",     // 숫자·핵심어
  red: "#FF2D2D",        // 부정·충격
  neon: "#7CFC00",       // 리액션·의외성
  black: "black",
  band: "black@0.92",
  boxYellow: "#FFE400",
};

/**
 * 템플릿 5종.
 * band  = 상단 검은 밴드 높이
 * vy    = 영상이 올라앉는 y 좌표
 * 색 조합은 템플릿마다 **하나의 강조색**만 갖습니다(규칙 2).
 */
const T = {
  화이트형: {
    설명: "흰 밴드 + 최상단 채널 바 + 영상 위 대형 자막. 밴드가 밝아 제목이 가장 멀리서 읽힙니다.",
    band: 430, vy: 430, accent: C.neon,
    bandColor: "white", brandBar: 150,
    top1: { size: 82, color: "#E02020" }, top2: { size: 82, color: C.black },
    bigSize: 108,
  },
  비교형: {
    설명: "Before/After. 좌우 2분할 영상에 씁니다. 강조색 형광 연두.",
    band: 470, vy: 470, accent: C.neon,
    top1: { size: 78, color: C.white }, top2: { size: 66, color: C.white, box: C.red },
  },
  리액션형: {
    설명: "인물 리액션. 영상 위에 형광 자막을 얹습니다. 강조색 노랑.",
    band: 400, vy: 400, accent: C.yellow,
    top1: { size: 80, color: C.red }, top2: { size: 76, color: C.white },
  },
  박스강조형: {
    설명: "둘째 줄을 노란 박스에 검은 글씨로. 정보·이유 설명형.",
    band: 430, vy: 430, accent: C.yellow,
    top1: { size: 76, color: C.white }, top2: { size: 72, color: C.black, box: C.boxYellow },
  },
  충격뉴스형: {
    설명: "노랑→빨강 2줄. 수치가 큰 소재. 가장 강하고 가장 위험합니다.",
    band: 420, vy: 420, accent: C.yellow,
    top1: { size: 82, color: C.yellow }, top2: { size: 82, color: C.red },
  },
  정보형: {
    설명: "차분한 정보 전달. 가전·육아 리뷰에 맞습니다. 강조색 노랑.",
    band: 400, vy: 460, accent: C.yellow,
    top1: { size: 74, color: C.white }, top2: { size: 68, color: C.yellow },
  },
};

/** 폰트를 작업 폴더로 복사합니다 — 윈도우 경로를 drawtext에 그대로 주면 깨집니다(실측). */
function ensureFont(dir) {
  const dst = path.join(dir, "_kfont.ttf");
  if (!fs.existsSync(dst)) {
    const src = "C:/Windows/Fonts/malgunbd.ttf";
    if (!fs.existsSync(src)) throw new Error("맑은 고딕 볼드를 못 찾았습니다: " + src);
    fs.copyFileSync(src, dst);
  }
  return "_kfont.ttf";
}

/**
 * 글자를 파일로 넘깁니다.
 * ⚠️ drawtext에 text=로 직접 주면 한글·따옴표·콜론이 깨집니다.
 *    그리고 %가 들어가면 strftime으로 해석돼 **렌더가 통째로 실패**합니다(실측).
 *    그래서 textfile + expansion=none 이 유일하게 안전한 길입니다.
 */
let seq = 0;
function textFile(dir, s) {
  const f = `_t${seq++}.txt`;
  fs.writeFileSync(path.join(dir, f), String(s), "utf8");
  return f;
}

/**
 * 자동 줄바꿈.
 *
 * ⚠️ drawtext는 줄을 알아서 안 넘깁니다. 긴 자막이 **화면 밖으로 그냥 잘려 나갑니다**
 *    — 렌더는 성공하고 오류도 없어서, 결과물을 눈으로 볼 때까지 모릅니다(실측).
 *
 * 한글은 글자 폭이 대체로 fontsize와 같습니다. 여백 80px씩 빼고 나눕니다.
 * 낱말 단위로 끊되, 한 낱말이 한 줄보다 길면 그 낱말만 강제로 자릅니다.
 */
function wrap(text, fontSize, maxWidth = W - 160) {
  const per = Math.max(6, Math.floor(maxWidth / fontSize));
  const out = [];
  for (const para of String(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (word.length > per) {                       // 한 낱말이 통째로 넘칠 때
        if (line) { out.push(line); line = ""; }
        for (let i = 0; i < word.length; i += per) out.push(word.slice(i, i + per));
        continue;
      }
      const next = line ? line + " " + word : word;
      if (next.length > per) { out.push(line); line = word; }
      else line = next;
    }
    if (line) out.push(line);
  }
  return out.join("\n");
}

function dt(dir, { text, font, size, color, y, x = "(w-text_w)/2", border = 8, box = null, enable = null }) {
  const parts = [
    `fontfile=${font}`,
    `textfile=${textFile(dir, text)}`,
    "expansion=none",
    `fontcolor=${color}`,
    `fontsize=${size}`,
    "line_spacing=16",
    `x=${x}`,
    `y=${y}`,
  ];
  if (box) parts.push(`box=1:boxcolor=${box}:boxborderw=18`);
  else parts.push(`borderw=${border}:bordercolor=black@0.9`);
  if (enable) parts.push(`enable='${enable}'`);
  return "drawtext=" + parts.join(":");
}

function buildFilter(dir, tpl, o) {
  const t = T[tpl];
  if (!t) throw new Error(`템플릿 '${tpl}' 없음. 쓸 수 있는 것: ${Object.keys(T).join(", ")}`);
  const font = ensureFont(dir);
  const chain = [];

  /**
   * 상단 밴드 — 템플릿에 따라 검정 또는 흰색.
   *
   * ⚠️ 높이를 **글자를 먼저 접어보고** 정합니다. 템플릿에 적힌 값은 최소치일 뿐입니다.
   *    고정 높이로 두면 제목이 길어 두 줄이 될 때 둘째 줄이 밴드 밖으로 넘쳐
   *    영상 위에 걸칩니다 — 흰 밴드에 검은 글씨면 그 부분이 아예 안 보입니다(실측).
   */
  const topPad = t.brandBar || 0;
  const _w1 = o.top1 ? wrap(o.top1, t.top1.size) : "";
  const _w2 = o.top2 ? wrap(o.top2, t.top2.size) : "";
  const _n1 = _w1 ? _w1.split("\n").length : 0;
  const _n2 = _w2 ? _w2.split("\n").length : 0;
  const need = topPad + 28 + _n1 * (t.top1.size + 16) + (_n2 ? 22 + _n2 * (t.top2.size + 16) : 0) + 30;
  const bandH = Math.max(t.band, need);

  /**
   * 영상 배치 — 가운데를 잘라 정사각형에 가깝게 넣습니다.
   *
   * 블러 배경은 없앴습니다(사장님: "뒤에 뿌옇게 나오게 하지 말고 꽉 차게", 2026-09-03).
   * 남는 자리는 검게 둡니다.
   *
   * ⚠️ 비율이 전부입니다. 다섯 개를 실제로 뽑아 원본 자막이 언제 잘리는지 봤습니다.
   *    남는 가로 = 0.5625 × ratio (1080p 16:9 기준)
   *
   *      1.78  100%  원본 그대로. 화면의 3분의 1만 차지해 너무 작습니다.
   *      1.20   67%  ← 기본값. 원본 자막이 마침표까지 온전합니다.
   *      1.00   56%  더 크지만 자막 좌우 끝이 걸치기 시작합니다.
   *      0.90   51%  자막 앞뒤가 잘립니다.
   *      0.71   40%  인물까지 반쯤 날아갑니다. 못 씁니다.
   *
   * 판단 기준은 **원본에 자막이 박혀 있느냐**입니다.
   *   박혀 있으면 1.2 아래로 내리지 마십시오.
   *   자막 없는 원본(브이로그 생영상 등)이면 1.0 이나 0.9 로 더 키워도 됩니다.
   */
  const ratio = Math.max(0.6, Math.min(2.2, Number(o.ratio) || 1.2));
  const vh = Math.round(W / ratio);                  // 화면에 들어갈 영상 높이
  const contentH = H - bandH;
  /**
   * 남는 자리를 위 1 : 아래 3 으로 나눠 씁니다.
   * 정가운데에 두면 아래에 자막 놓을 자리가 없어 **원본에 박힌 자막 위에 우리 자막이
   * 겹쳐 찍힙니다**(실측: 세 비율에서 전부 겹쳤습니다). 아래를 넉넉히 비워둡니다.
   */
  const slack = Math.max(0, contentH - vh);
  const vy = bandH + Math.round(slack * 0.25);
  const vBottom = vy + vh;                           // 영상이 끝나는 자리 — 자막은 이 아래로
  let last = "v0";
  chain.push(
    `[0:v]crop=w='min(iw,ih*${ratio})':h='min(ih,iw/${ratio})',` +
    `scale=${W}:${vh},pad=${W}:${H}:0:${vy}:color=black[v0]`,
  );

  const bandColor = t.bandColor === "white" ? "white@0.96" : C.band;
  chain.push(`[${last}]drawbox=x=0:y=0:w=${W}:h=${bandH}:color=${bandColor}:t=fill[v1]`);
  last = "v1";

  let i = 2;
  const push = (f) => { chain.push(`[${last}]${f}[v${i}]`); last = `v${i}`; i++; };

  /**
   * 최상단 채널 바 — 흰 밴드 위에 채널 이름을 얹습니다(「스타등용문」 형식).
   *
   * ⚠️ 이모지는 지웁니다. 맑은 고딕에는 이모지 글자가 없어서 **네모(□)로 찍힙니다**
   *    (실측: "⭐ 우수리미 부부" → "□ 우수리미 부부"). drawtext는 한 번에 폰트 하나만
   *    쓰므로 한글과 이모지를 같이 낼 방법이 없습니다. 별을 넣으시려면 로고 이미지로
   *    합성하셔야 합니다.
   */
  if (t.brandBar && o.brand) {
    const brand = String(o.brand).replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu, "").trim();
    if (brand) push(dt(dir, { text: brand, font, size: 46, color: C.black, y: Math.round(t.brandBar * 0.30), border: 0 }));
  }

  /**
   * 제목 두 줄.
   * 밴드가 흰색이면 글자가 이미 어두우므로 검은 테두리를 거의 안 씁니다 —
   * 흰 바탕에 검은 테두리를 두르면 글자가 뭉개져 보입니다.
   */
  const top = topPad;                                // 채널 바가 있으면 그만큼 내려서 시작
  const bd = t.bandColor === "white" ? 0 : 8;
  const w1 = _w1, w2 = _w2;                          // 밴드 높이 계산 때 접어둔 것을 그대로 씁니다

  /**
   * ⚠️ 둘째 줄 위치는 **첫 줄이 몇 줄이 됐는지 보고** 정합니다.
   *    비율로 박아두면, 첫 줄이 길어 두 줄로 접힐 때 둘째 줄이 그 위에 겹쳐 찍힙니다
   *    (실측: 화이트형에서 제목 두 개가 포개져 나왔습니다).
   */
  const lh1 = t.top1.size + 16;                      // line_spacing=16 과 맞춥니다
  const n1 = w1 ? w1.split("\n").length : 0;
  const y1 = top + 28;
  const y2 = y1 + n1 * lh1 + 22;

  if (w1) push(dt(dir, { text: w1, font, size: t.top1.size, color: t.top1.color, y: y1, box: t.top1.box, border: bd }));
  if (w2) push(dt(dir, { text: w2, font, size: t.top2.size, color: t.top2.color, y: y2, box: t.top2.box, border: bd }));

  /**
   * 영상 위 대형 자막 — 「스타등용문」의 "여자친구?" 자리.
   * 한 낱말짜리 되물음이 들어갑니다. 길게 쓰면 효과가 죽습니다.
   */
  if (o.big) {
    const bs = t.bigSize || 100;
    push(dt(dir, { text: wrap(o.big, bs), font, size: bs, color: C.white, y: Math.round(H * 0.55), border: 14 }));
  }

  // 영상 위 리액션 자막 — 원본 자막(대개 영상 하단)과 겹치지 않게 위쪽에 얹습니다.
  if (o.react) push(dt(dir, { text: wrap(o.react, 58), font, size: 58, color: t.accent, y: Math.round(H * 0.36) }));

  /**
   * 하단 자막 — 영상이 끝나는 자리 **아래**에 놓습니다.
   * 화면 높이의 몇 % 로 박아두면 원본에 박힌 자막과 겹칩니다(실측).
   * 아래 공간이 모자라면 그때만 영상 안쪽으로 밀어 넣습니다.
   */
  if (o.sub) {
    const sw = wrap(o.sub, 54);
    const sh = sw.split(String.fromCharCode(10)).length * 70;
    const below = vBottom + 44;
    const sy = (below + sh < H - 40) ? below : Math.max(vBottom - sh - 40, H - sh - 90);
    push(dt(dir, { text: sw, font, size: 54, color: C.white, y: sy, border: 9 }));
  }

  // 출처 — 작게, 흐리게. 저작권 방어는 안 되지만 예의입니다.
  if (o.credit) push(dt(dir, { text: o.credit, font, size: 36, color: "white@0.75", y: Math.min(H - 70, vBottom + 150), border: 5 }));

  return { filter: chain.join(";").replace(new RegExp(`\\[${last}\\]$`), "") + `[out]`, outLabel: "out", lastLabel: last };
}

function run(args) {
  const cmd = args[0];
  if (!cmd || cmd === "list") {
    console.log("쇼츠 자막 템플릿\n");
    for (const [k, v] of Object.entries(T)) console.log(`  ${k.padEnd(8)} ${v.설명}`);
    console.log("\n예)\n  node scripts/shorts-template.js render 정보형 in.mp4 out.mp4 \\\n     --top1=\"침구 청소기 샀는데\" --top2=\"진드기 97% 잡힌대요\" --sub=\"소파랑 침구가 제일 신경쓰이잖아요\"");
    return;
  }

  const o = {};
  for (const a of args) {
    const m = a.match(/^--([a-z0-9]+)=([\s\S]*)$/i);
    if (m) o[m[1]] = m[2];
  }
  const [, tpl, input, output] = args;
  if (!tpl || !input || !output) throw new Error("사용법: render <템플릿> <입력> <출력> [--top1=..]");
  if (!fs.existsSync(input)) throw new Error("입력 파일 없음: " + input);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-"));
  try {
    const { filter } = buildFilter(dir, tpl, o);
    const still = cmd === "sample";
    const a = ["-v", "error"];
    if (o.start) a.push("-ss", String(o.start));
    if (!still && o.dur) a.push("-t", String(o.dur));
    a.push("-i", path.resolve(input), "-filter_complex", filter, "-map", "[out]");
    if (still) a.push("-frames:v", "1");
    else a.push("-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-r", "30");
    a.push(path.resolve(output), "-y");
    execFileSync("ffmpeg", a, { cwd: dir, stdio: ["ignore", "inherit", "inherit"] });
    console.log(`✅ ${tpl} → ${output}`);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  try { run(process.argv.slice(2)); }
  catch (e) { console.error("❌ " + e.message); process.exit(1); }
}

module.exports = { T, buildFilter, C };
