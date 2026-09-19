/**
 * URL 하나로 추천 영상 6개 만들기 — 블로그 / 뉴스 / 상품 링크
 *
 * 흐름:
 *   1. 링크에서 사진과 문장을 뽑아 장면(대본)을 짭니다   → 기획
 *   2. 그 사진들을 내 컴퓨터로 내려받습니다               → 엔진은 로컬 파일만 받습니다
 *   3. 글 내용에 어울리는 스타일 6종을 고릅니다           → styles.js의 rankStyles
 *   4. 6개를 3개씩 동시에 렌더링합니다                    → 끝난 것부터 화면에 뜹니다
 *
 * 왜 3개씩인가: ffmpeg는 코어를 많이 씁니다. 6개를 한꺼번에 돌리면 서로 CPU를 뺏느라
 * 전체가 더 느려지고, 메모리도 위험합니다. 3개씩이 가장 빨랐습니다.
 */

const fs = require("fs");
const path = require("path");
const { runEngine } = require("./engine");
const { rankStyles, getStyle, guessSource } = require("./styles");

const RENDER_CONCURRENCY = Number(process.env.GOLDENCUT_CONCURRENCY || 3);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 20000;
const MIN_SCENES = 2;

/**
 * 링크 → 장면 기획.
 *
 * 이 저장소 안에서 돌 때는 src/shortformPlanner를 직접 부릅니다. 작업실처럼 그 파일이
 * 없는 곳에 복사해서 쓸 때는, woosurimi 서버의 /api/shortform/plan을 대신 부릅니다
 * (WOOSURIMI_API로 주소를 바꿀 수 있습니다). 그래서 어느 쪽에 두든 똑같이 돕니다.
 */
async function planFromUrl(url, source) {
  try {
    const { planShortform } = require("../../src/shortformPlanner");
    return await planShortform(url, source);
  } catch (e) {
    if (e && e.code !== "MODULE_NOT_FOUND") throw e;
  }
  const base = process.env.WOOSURIMI_API || "http://localhost:3000";
  const res = await fetch(`${base}/api/shortform/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, source }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`기획 서버(${base})가 응답하지 않습니다. woosurimi 서버를 켜주세요. ${body.slice(0, 200)}`);
  }
  return res.json();
}

function extFromType(type = "") {
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  return ".jpg";
}

/**
 * 원문 사진을 내려받습니다.
 *
 * ⚠️ Referer를 원문 주소로 넣어줍니다. 네이버 등 많은 사이트가 "다른 곳에서 사진만
 * 가져가는 것(핫링크)"을 막는데, 그 판단을 Referer로 합니다. 이게 없으면 사진이
 * 통째로 403으로 막혀서 장면이 하나도 안 만들어집니다.
 */
async function downloadImages(urls, destDir, pageUrl, onProgress) {
  fs.mkdirSync(destDir, { recursive: true });
  const saved = [];
  let failed = 0;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (!u || !/^https?:\/\//i.test(u)) { failed++; continue; }
    try {
      const res = await fetch(u, {
        headers: {
          Referer: pageUrl || "",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) throw new Error(`사진이 아님(${type || "형식 불명"})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) throw new Error("빈 파일");
      if (buf.length > MAX_IMAGE_BYTES) throw new Error("너무 큼");
      const file = path.join(destDir, `img${String(i + 1).padStart(2, "0")}${extFromType(type)}`);
      fs.writeFileSync(file, buf);
      saved.push({ index: i, path: file });
    } catch (e) {
      failed++;
      if (onProgress) onProgress(`사진 ${i + 1} 건너뜀 — ${e.message}`);
    }
    if (onProgress) onProgress(`사진 ${saved.length}장 받음 (${i + 1}/${urls.length})`);
  }
  return { saved, failed };
}

/**
 * 더빙을 쓸 수 있는 상태인지 한 번만 확인합니다.
 *
 * ⚠️ 이게 없으면 Voicebox가 꺼져 있을 때 추천 6개가 **전부** 실패합니다. 프리셋 10종이
 * 모두 골든/차수리미 목소리를 쓰기 때문입니다. 목소리가 없다고 영상을 아예 못 만들 이유는
 * 없으니(자막만으로도 충분히 쓸 수 있습니다), 이럴 땐 조용히 '자막만'으로 낮춰서 만들고
 * 화면에 왜 목소리가 없는지 한 줄로 알려줍니다.
 */
const VOICE_ENV = { golden: "VOICEBOX_PROFILE_GOLDEN", chasurimi: "VOICEBOX_PROFILE_CHASURIMI" };

async function probeVoiceReady(voices = []) {
  // ⚠️ goldencut_voice.py --check 는 결과를 **stdout**에 씁니다. runEngine의 onProgress는
  // stderr만 주기 때문에, 그걸로 판단하면 화면이 늘 "정상"이라고 거짓말을 합니다
  //(실제로 Voicebox를 꺼둔 채 "목소리: 정상"이라고 나왔습니다). 그래서 직접 읽습니다.
  const { spawn } = require("child_process");
  const { ENGINE_DIR, PYTHON } = require("./engine");
  const pathMod = require("path");
  const text = await new Promise((resolve) => {
    let all = "";
    let c;
    try {
      c = spawn(PYTHON, [pathMod.join(ENGINE_DIR, "goldencut_voice.py"), "--check"], { cwd: ENGINE_DIR });
    } catch { return resolve("연결 실패"); }
    c.stdout.on("data", (b) => (all += b));
    c.stderr.on("data", (b) => (all += b));
    c.on("error", () => resolve("연결 실패"));
    c.on("close", () => resolve(all));
  });
  // ⚠️ "실패 문구가 안 보이면 정상"으로 판단하면 안 됩니다. 출력이 비었거나 우리가
  // 모르는 문구로 실패하면 그대로 "정상"이 되어, 또 거짓 보고가 나갑니다.
  // **붙었다는 말이 실제로 있을 때만** 정상으로 봅니다.
  if (!/✅\s*연결됨/.test(text)) {
    return { ready: false, why: "Voicebox에 붙지 못했습니다(앱이 꺼져 있을 수 있습니다)." };
  }

  // ⚠️ --check 는 '붙었는지'만 봅니다. 목소리 프로필 ID가 환경변수에 없으면 붙어 있어도
  // 더빙은 실패합니다. 그걸 여기서 같이 봐야 화면이 "목소리: 정상"이라고 거짓말하지 않습니다.
  const missing = [...new Set(voices)]
    .filter((v) => v && v !== "none")
    .filter((v) => !(process.env[VOICE_ENV[v] || ""] || process.env.VOICEBOX_PROFILE_ID));
  if (missing.length) {
    const names = missing.map((v) => VOICE_ENV[v] || v).join(", ");
    return { ready: false, why: `Voicebox는 켜져 있지만 목소리 ID가 없습니다(${names}).` };
  }
  return { ready: true, why: "" };
}

/** 스타일 하나로 영상 한 개를 만듭니다. */
async function renderOne({ style, scenesPath, outPath, hookText, onProgress }) {
  const { getTrackPath } = require("../../src/bgmLibrary");
  // ⚠️ 배경음악이 없으면 없는 채로 만들되, **없었다는 사실을 돌려줍니다.**
  // 조용히 삼키면 화면에는 "핫딜 속보형(배경음악 있음)"이라고 뜨는데 실제로는 없습니다.
  let bgmPath = null;
  let bgmMissing = "";
  try {
    const p = getTrackPath(style.bgm);
    if (p && fs.existsSync(p)) bgmPath = p;
    else bgmMissing = `배경음악 '${style.bgm}' 파일이 없습니다`;
  } catch (e) {
    bgmMissing = `배경음악 '${style.bgm}'을 찾지 못했습니다 (${e.message})`;
  }
  if (bgmMissing && onProgress) onProgress(`${bgmMissing} — 배경음악 없이 만듭니다`);

  const args = [
    "--scenes-json", scenesPath,
    "--out", outPath,
    "--effect", style.effect,
    "--template", style.template,
    "--seconds", String(style.seconds),
    "--voice", style.voice,
    "--json",
  ];
  if (hookText) args.push("--hook", hookText);
  if (style.intro) args.push("--intro", "scatter");
  if (bgmPath) args.push("--bgm", bgmPath);

  const first = await runEngine("goldencut_effects.py", args, { onProgress });
  if (first && first.ok) return { ...first, bgmMissing };

  // 안전망: 더빙 때문에 실패했으면 자막만으로 한 번 더 만듭니다. 목소리가 없다고
  // 영상을 통째로 못 내주는 건 손해가 너무 큽니다(앞의 probeVoiceReady가 놓친 경우용).
  const err = String((first && first.error) || "");
  const dubFailed = /더빙|목소리|프로필 ID|Voicebox/i.test(err);
  if (dubFailed && style.voice !== "none") {
    if (onProgress) onProgress("목소리를 쓸 수 없어 자막만으로 다시 만듭니다");
    const retry = args.slice();
    retry[retry.indexOf("--voice") + 1] = "none";
    const second = await runEngine("goldencut_effects.py", retry, { onProgress });
    if (second && second.ok) return { ...second, bgmMissing, voiceDowngraded: true };
    return second;
  }
  return first;
}

/**
 * 메인. job 객체를 그 자리에서 고쳐 나가므로, 라우트는 job을 그대로 내보내면 됩니다.
 *
 * job.videos[i].status: "대기" → "만드는 중" → "완료" | "실패"
 */
async function buildFromUrl(job, { url, source, styleIds }) {
  const src = source && source !== "auto" ? source : guessSource(url);
  job.source = src;

  // ── 1. 기획 ────────────────────────────────────────────
  job.stage = "글 읽는 중";
  const plan = await planFromUrl(url, src);
  const scenes = (plan.scenes || []).filter((s) => s && s.image);
  if (!scenes.length) {
    throw new Error("이 링크에서 쓸 수 있는 사진을 찾지 못했습니다. 사진이 있는 글인지 확인해 주세요.");
  }
  job.plan = {
    title: plan.sourceTitle || "",
    hookText: plan.hookText || "",
    source: src,
    sceneCount: scenes.length,
    hashtags: plan.hashtags || [],
    scriptGeneratedBy: plan.scriptGeneratedBy || "template",
  };

  // ── 2. 사진 내려받기 ───────────────────────────────────
  job.stage = "사진 받는 중";
  const imgDir = path.join(job.dir, "images");
  const { saved, failed } = await downloadImages(
    scenes.map((s) => s.image), imgDir, url, (m) => { job.latest = m; }
  );
  job.imagesDownloaded = saved.length;
  job.imagesFailed = failed;
  if (saved.length < MIN_SCENES) {
    throw new Error(
      `사진을 ${saved.length}장밖에 못 받았습니다(${failed}장 실패). 원문이 사진을 막아둔 것 같습니다 — ` +
      "사진을 직접 내려받아 '영상·사진 고르기'로 만들어 주세요."
    );
  }

  // 받은 사진에 해당하는 장면만 남깁니다(못 받은 장면의 자막은 버립니다 — 사진 없이
  // 자막만 넣으면 검은 화면이 끼어서 영상이 이상해집니다).
  const usable = saved.map(({ index, path: p }) => ({
    image: p,
    caption: (scenes[index] && scenes[index].caption) || "",
  }));
  const scenesPath = path.join(job.dir, "scenes.json");
  fs.writeFileSync(scenesPath, JSON.stringify(usable, null, 2), "utf-8");

  // ── 3. 스타일 고르기 ───────────────────────────────────
  const hay = [plan.sourceTitle, plan.hookText, ...usable.map((s) => s.caption)].join(" ");
  const styles = (Array.isArray(styleIds) && styleIds.length)
    ? styleIds.map(getStyle).filter(Boolean)
    : rankStyles(hay, src, 6);

  // 목소리를 쓸 수 있는지 한 번만 확인합니다(6번 따로 확인하면 그만큼 느려집니다).
  const voice = await probeVoiceReady(styles.map((s) => s.voice));
  job.voiceReady = voice.ready;
  job.voiceNote = voice.ready ? "" : `${voice.why} 목소리 없이 자막만으로 만듭니다.`;
  const useVoice = (s) => (voice.ready ? s.voice : "none");

  job.videos = styles.map((s) => ({
    styleId: s.id, label: s.label, category: s.category, desc: s.desc,
    effect: s.effect, template: s.template, bgm: s.bgm, voice: useVoice(s),
    seconds: s.seconds, intro: s.intro,
    status: "대기", playUrl: null, duration: null, error: null, latest: "",
  }));

  // ── 4. 3개씩 동시에 렌더링 ─────────────────────────────
  job.stage = "영상 만드는 중";
  const { createLimiter } = require("../../src/concurrencyLimiter");
  const limit = createLimiter(RENDER_CONCURRENCY);

  await Promise.all(styles.map((style, i) => limit(async () => {
    const v = job.videos[i];
    v.status = "만드는 중";
    const outPath = path.join(job.dir, `${style.id}.mp4`);
    const result = await renderOne({
      style: { ...style, voice: useVoice(style) }, scenesPath, outPath,
      hookText: plan.hookText || "",
      onProgress: (line) => { v.latest = line; job.latest = `${style.label}: ${line}`; },
    });
    if (result && result.ok) {
      v.status = "완료";
      v.path = result.path;
      v.duration = result.duration;
      v.playUrl = `${job.base}/video/${job.id}/${style.id}`;
      // ⚠️ 낮춰서 만들었으면 **결과보다 먼저** 그 사실이 보여야 합니다(CLAUDE.md §2).
      // 여기서 안 옮기면 화면에는 계획한 목소리·배경음악이 그대로 떠서 거짓말이 됩니다.
      const lowered = [];
      if (result.voiceDowngraded) { v.voice = "none"; lowered.push("목소리 없이 자막만"); }
      if (result.bgmMissing) { v.bgm = null; lowered.push(result.bgmMissing); }
      v.downgraded = lowered.length ? lowered.join(" · ") : "";
      if (v.downgraded) job.downgradedCount = (job.downgradedCount || 0) + 1;
      job.doneCount = (job.doneCount || 0) + 1;
    } else {
      v.status = "실패";
      v.error = (result && result.error) || "알 수 없는 이유로 실패했습니다.";
    }
  })));

  const ok = job.videos.filter((v) => v.status === "완료").length;
  job.stage = "완료";
  if (!ok) throw new Error(job.videos[0]?.error || "영상을 하나도 만들지 못했습니다.");
  return job;
}

module.exports = { buildFromUrl, downloadImages, planFromUrl, RENDER_CONCURRENCY };
