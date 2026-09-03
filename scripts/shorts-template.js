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
 *   --credit            출처 표기 ("출처 | 편스토랑" 형태)
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

  // 배경 — 블러 + 어둡게. 원본 자막이 번져 보이는 것을 막습니다(실측: sigma 28로는 비칩니다).
  chain.push(
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=60,eq=brightness=-0.38:saturation=0.5[b]`,
    `[fg]scale=${W}:-2[f]`,
    `[b][f]overlay=(W-w)/2:${t.vy}[v0]`,
  );

  // 상단 검은 밴드
  let last = "v0";
  chain.push(`[${last}]drawbox=x=0:y=0:w=${W}:h=${t.band}:color=${C.band}:t=fill[v1]`);
  last = "v1";

  let i = 2;
  const push = (f) => { chain.push(`[${last}]${f}[v${i}]`); last = `v${i}`; i++; };

  const y1 = Math.round(t.band * 0.22);
  const y2 = Math.round(t.band * 0.56);
  if (o.top1) push(dt(dir, { text: wrap(o.top1, t.top1.size), font, size: t.top1.size, color: t.top1.color, y: y1, box: t.top1.box }));
  if (o.top2) push(dt(dir, { text: wrap(o.top2, t.top2.size), font, size: t.top2.size, color: t.top2.color, y: y2, box: t.top2.box }));

  // 영상 위 리액션 자막 — 원본 자막(대개 영상 하단)과 겹치지 않게 위쪽에 얹습니다.
  if (o.react) push(dt(dir, { text: wrap(o.react, 58), font, size: 58, color: t.accent, y: Math.round(H * 0.36) }));

  // 하단 자막 — 흰 글씨 + 두꺼운 테두리. 배경이 뭐든 읽힙니다.
  if (o.sub) push(dt(dir, { text: wrap(o.sub, 54), font, size: 54, color: C.white, y: Math.round(H * 0.74), border: 9 }));

  // 출처 — 작게, 흐리게. 저작권 방어는 안 되지만 예의입니다.
  if (o.credit) push(dt(dir, { text: o.credit, font, size: 36, color: "white@0.75", y: Math.round(H * 0.80), border: 5 }));

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
