/**
 * 완성된 영상/사진을 "보고" 인스타·스레드·유튜브용 문구 초안을 무료로 뽑아주는 모듈.
 *
 * ⚠️ 이건 로컬 GPU 모델이 아닙니다 — comfyClient/bgmGenerate/autoTranscribe/vaceOutpaint와
 * 다르게, 사장님 PC에 아무것도 설치할 필요가 없습니다. OpenRouter(openrouter.ai)라는
 * 회사가 무료로 열어둔 API를 인터넷으로 호출하는 방식입니다. 대신 openrouter.ai에서
 * 직접 회원가입하고 API 키를 발급받아 OPENROUTER_API_KEY에 넣어야 동작합니다 — 계정을
 * 만드는 건 사장님만 하실 수 있는 부분이라 저희가 대신 해드릴 수 없습니다.
 *
 * ⚠️ "무료"의 실제 의미 — 여기 쓰는 모델(Google Gemma 4 26B A4B, OpenRouter 표기로는
 * google/gemma-4-26b-a4b-it:free)은 토큰당 요금이 $0이지만, OpenRouter가 무료 모델에는
 * 시간당/일당 요청 횟수 제한을 겁니다. 영상 하나 만들 때마다 한 번씩 문구를 뽑는
 * 용도로는 충분하지만, 대량으로 돌리면 막힐 수 있습니다.
 *
 * ⚠️ 네이버 클립 문구는 이미 clipCaption.js(Claude 기반, 검색어 최적화)가 따로 있습니다.
 * 이 모듈은 그것과 역할이 다릅니다 — 실제 화면(프레임)을 직접 보고 판단해서 인스타·
 * 스레드·유튜브용 문구를 뽑습니다. 네이버 클립은 계속 clipCaption.js를 쓰세요.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_VISION_MODEL || "google/gemma-4-26b-a4b-it:free";

function isConfigured() {
  return !!process.env.OPENROUTER_API_KEY;
}

function run(bin, args, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 1 << 26 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).slice(-500)));
      resolve(stdout);
    });
  });
}

// ffprobe 없이 ffmpeg -i 의 stderr에 찍히는 "Duration: hh:mm:ss.xx"만 읽어서 길이를
// 알아냅니다(videoRenderer.js의 probeDurationSeconds와 같은 방식).
function probeDurationSeconds(filePath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-i", filePath], { maxBuffer: 1 << 20, timeout: 15000 }, (err, stdout, stderr) => {
      const m = String(stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      const s = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      resolve(Number.isFinite(s) ? s : null);
    });
  });
}

/** 영상에서 고르게 count장을 뽑아 base64 JPEG 문자열 배열로 돌려줍니다. */
async function extractFrames(videoPath, count = 3) {
  const dur = (await probeDurationSeconds(videoPath)) || 10;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "orcap-"));
  try {
    const frames = [];
    for (let i = 0; i < count; i++) {
      const t = Math.max(0.2, (dur * (i + 1)) / (count + 1));
      const out = path.join(work, `f${i}.jpg`);
      try {
        await run(ffmpegPath, ["-y", "-ss", t.toFixed(2), "-i", videoPath, "-frames:v", "1", "-q:v", "3", out]);
        if (fs.existsSync(out)) frames.push(fs.readFileSync(out).toString("base64"));
      } catch {
        // 한 프레임 실패는 무시하고 나머지로 계속합니다.
      }
    }
    return frames;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

function extractJsonLoose(text) {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

const PROMPT_INSTRUCTIONS = `
당신은 한국 SNS 콘텐츠 마케터입니다. 첨부된 영상 장면(프레임 여러 장) 또는 사진을 보고,
아래 JSON 형식으로만 답하세요. 과장된 표현("최고", "1위", "무조건")은 쓰지 마세요.

{
  "sceneDescription": "화면에 실제로 보이는 것을 한두 문장으로",
  "instagramCaption": "인스타 릴스/피드용 캡션 (감성적, 2~4문장)",
  "instagramHashtags": ["해시태그(# 없이)", "..."],
  "threadsPost": "스레드용 짧은 글 (구어체, 1~3문장)",
  "youtubeTitle": "유튜브 쇼츠 제목 (클릭 유도, 30자 안팎)",
  "youtubeDescription": "유튜브 설명란 (2~3문장 + 관련 키워드)"
}
`.trim();

/**
 * videoPath(영상) 또는 imagePaths(사진 배열) 중 하나를 넘기세요.
 * topic: 영상/사진 주제(있으면 더 정확해집니다)
 *
 * @returns {{ok:boolean, why?:string, instagram?, threads?, youtube?}}
 */
async function describeClip({ videoPath, imagePaths, topic = "" } = {}) {
  if (!isConfigured()) {
    return {
      ok: false,
      why: "OPENROUTER_API_KEY가 설정되어 있지 않습니다. openrouter.ai에서 회원가입 후 " +
           "API 키를 발급받아 넣으면 무료로 동작합니다(설치는 필요 없습니다).",
    };
  }

  let frames;
  try {
    frames = imagePaths && imagePaths.length
      ? imagePaths.map((p) => fs.readFileSync(p).toString("base64"))
      : await extractFrames(videoPath, 3);
  } catch (e) {
    return { ok: false, why: `프레임을 뽑지 못했습니다: ${e.message}` };
  }
  if (!frames.length) {
    return { ok: false, why: "영상/사진에서 프레임을 하나도 읽지 못했습니다." };
  }

  const content = [
    { type: "text", text: PROMPT_INSTRUCTIONS + (topic ? `\n\n주제: ${topic}` : "") },
    ...frames.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })),
  ];

  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }], temperature: 0.8 }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    return { ok: false, why: `OpenRouter에 연결하지 못했습니다: ${e.message}` };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    return { ok: false, why: `OpenRouter 오류: ${msg}` };
  }

  const text = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonLoose(text);
  if (!parsed) {
    return { ok: false, why: "모델 응답에서 JSON을 읽지 못했습니다.", raw: text };
  }

  const tags = (Array.isArray(parsed.instagramHashtags) ? parsed.instagramHashtags : [])
    .map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 15);
  const caption = String(parsed.instagramCaption || "").trim();

  return {
    ok: true,
    model: MODEL,
    sceneDescription: String(parsed.sceneDescription || "").trim(),
    instagram: {
      caption,
      hashtags: tags,
      full: [caption, tags.map((t) => "#" + t).join(" ")].filter(Boolean).join("\n\n"),
    },
    threads: String(parsed.threadsPost || "").trim(),
    youtube: {
      title: String(parsed.youtubeTitle || "").trim(),
      description: String(parsed.youtubeDescription || "").trim(),
    },
  };
}

module.exports = { isConfigured, describeClip, extractFrames, MODEL };
