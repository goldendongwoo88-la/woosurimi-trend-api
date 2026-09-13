// ACE-Step 1.5로 배경음악을 새로 생성해서 bgmLibrary의 트랙 목록에 추가하는 모듈입니다.
//
// ⚠️ voiceProvider.js 머리말과 같은 주의사항 — ACE-Step 1.5는 로컬(사장님 컴퓨터, 무료)
// 에서 실행되는 오픈소스 모델입니다. GitHub 저장소(ace-step/ACE-Step-1.5)를 그대로
// 실행하면 대개 Gradio 데모 화면이 뜹니다. 정확한 로컬 서버 API 스펙은 실행 방식(Gradio
// 기본 데모 vs 직접 짠 FastAPI 서버 등)에 따라 달라질 수 있어서, 여기서는 이 프로젝트의
// 다른 로컬 모델(voiceProvider.js의 Voicebox)과 같은 가장 단순한 형태 — "POST로 요청하면
// 오디오 바이너리를 그대로 돌려준다" — 를 기본으로 가정합니다. 실제로 붙여보고 이 형태가
// 안 맞으면(예: Gradio의 /api/predict 형식이라면) synthesizeAceStep()의 요청/응답 처리
// 부분만 고치면 됩니다 — 이 파일을 부르는 쪽(bgmLibrary.js, index.js)은 안 바뀝니다.
//
// 안 켜져 있어도 서버는 죽지 않고, 기존 5종 라이브러리 트랙만 추천됩니다.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { aceStepUrl } = require("./localModels");

const GENERATED_DIR = path.join(__dirname, "..", "assets", "bgm", "generated");

async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * prompt: 곡 분위기를 설명하는 짧은 문장(영어가 더 잘 먹히는 음악 생성 모델이 많아, 한국어
 *         무드 키워드를 쓰더라도 괜찮습니다 — ACE-Step은 50개 이상 언어를 지원한다고 알려져
 *         있습니다).
 * durationSec: 원하는 길이(초). ACE-Step 1.5는 최대 4분(240초)까지 지원한다고 알려져 있습니다.
 * lyrics: (선택) 가사. 없으면 순수 배경음(인스트루멘탈)으로 요청합니다.
 * 반환: 생성된 mp3/wav 파일의 로컬 절대경로.
 */
async function synthesizeAceStep({ prompt, durationSec = 30, lyrics = "" }) {
  const baseUrl = aceStepUrl();
  let res;
  try {
    res = await fetchWithTimeout(
      `${baseUrl}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          lyrics: lyrics || "[instrumental]",
          duration: Math.max(10, Math.min(240, Math.round(durationSec))),
        }),
      },
      120000 // 로컬 GPU 추론 — 리포트 기준으로는 몇 초면 되지만 CPU/사양에 따라 넉넉히 잡습니다.
    );
  } catch (err) {
    throw new Error(`ACE-Step 서버에 연결하지 못했습니다(${baseUrl}) — 이 컴퓨터에서 ACE-Step이 실행 중인지 확인해 주세요. (${err.message})`);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ACE-Step API 오류(${res.status}): ${errText.slice(0, 200)}`);
  }
  const contentType = res.headers.get("content-type") || "";
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const ext = /wav/i.test(contentType) ? "wav" : "mp3";
  const fileName = `gen-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}.${ext}`;
  const dest = path.join(GENERATED_DIR, fileName);

  if (contentType.includes("application/json")) {
    // 일부 구현체는 바이너리 대신 { url: "..." } 형태로 돌려줄 수 있습니다 — 그 경우도 받아줍니다.
    const data = await res.json();
    const fileUrl = data.url || data.audio_url;
    if (!fileUrl) throw new Error("ACE-Step 응답에서 오디오 파일을 찾지 못했습니다.");
    const fileRes = await fetchWithTimeout(fileUrl, {}, 30000);
    fs.writeFileSync(dest, Buffer.from(await fileRes.arrayBuffer()));
  } else {
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  return dest;
}

/**
 * bgmLibrary.TRACKS와 같은 모양의 트랙 객체를 만들어 돌려줍니다 — recommendBgm()이 돌려주는
 * 목록에 바로 이어붙일 수 있는 형태입니다.
 */
async function generateBgmTrack({ label, mood = "custom", prompt, durationSec = 30, lyrics = "" }) {
  const filePath = await synthesizeAceStep({ prompt, durationSec, lyrics });
  const fileName = path.basename(filePath);
  const id = `gen-${path.parse(fileName).name}`;
  return {
    id,
    label: label || "AI 생성 배경음악",
    mood,
    description: `ACE-Step 1.5로 방금 생성한 곡: "${prompt}"`,
    keywords: [],
    score: 0,
    previewUrl: `/bgm/generated/${fileName}`,
    generated: true,
    filePath,
  };
}

module.exports = { synthesizeAceStep, generateBgmTrack, GENERATED_DIR };
