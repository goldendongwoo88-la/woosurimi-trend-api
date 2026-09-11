// "로컬 오픈소스 AI 모델" 연동 상태를 한 곳에서 알려주는 모듈입니다.
// voiceProvider.js의 getProviderStatus()와 같은 원칙: 화면이 이 주소 하나만 물어보면
// 지금 어떤 로컬 모델이 켜져 있는지 알 수 있습니다.
//
// docs/오픈소스-AI-모델-리서치-2026-09.md에서 고른 4개를 연결합니다:
//   1) ComfyUI(Z-Image Turbo·Wan-VACE·캐릭터 LoRA)  → COMFYUI_URL
//   2) ACE-Step 1.5(배경음악 생성)                   → ACE_STEP_URL
//   3) faster-whisper(자막 받아쓰기)                 → FASTER_WHISPER_URL
//
// 셋 다 "이 컴퓨터에서 실제로 실행 중이어야" 동작하는 로컬 서비스입니다(Voicebox와 같은
// 성격). 안 켜져 있어도 서버는 죽지 않고, 기존 방식(그라디언트 배경·프롬프트만 제공·
// 크롭 방식 쇼츠·자막 수동 입력)으로 조용히 대체됩니다.

const comfyClient = require("./comfyClient");

async function fetchWithTimeout(url, opts = {}, timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function aceStepUrl() {
  return (process.env.ACE_STEP_URL || "http://127.0.0.1:7867").replace(/\/+$/, "");
}

function whisperUrl() {
  return (process.env.FASTER_WHISPER_URL || "http://127.0.0.1:8009").replace(/\/+$/, "");
}

async function pingHttp(url) {
  try {
    const res = await fetchWithTimeout(url, {}, 2000);
    // 서버가 살아만 있으면 됩니다 — 404/405도 "떠 있다"는 뜻이라 실패로 안 칩니다.
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * ⚠️ 매번 실제로 두드려 보면(특히 안 켜져 있을 때 타임아웃 대기 때문에) 화면이 느려집니다.
 * claudeClient의 creditCache와 같은 원칙으로 15초만 결과를 재사용합니다.
 */
const statusCache = { at: 0, data: null };
const STATUS_TTL_MS = 15000;

async function getLocalModelStatus({ fresh = false } = {}) {
  if (!fresh && statusCache.data && Date.now() - statusCache.at < STATUS_TTL_MS) {
    return statusCache.data;
  }

  const [comfy, aceStep, whisper] = await Promise.all([
    comfyClient.ping(),
    pingHttp(`${aceStepUrl()}/`),
    pingHttp(`${whisperUrl()}/`),
  ]);

  const data = {
    comfyui: {
      label: "ComfyUI (Z-Image Turbo · Wan-VACE · 캐릭터 LoRA)",
      url: comfyClient.baseUrl(),
      running: comfy,
      workflows: {
        cardNewsBackground: comfyClient.hasWorkflow("zimage-cardnews"),
        characterLora: comfyClient.hasWorkflow("character-lora"),
        vaceOutpaint: comfyClient.hasWorkflow("vace-outpaint"),
      },
    },
    aceStep: {
      label: "ACE-Step 1.5 (배경음악 생성)",
      url: aceStepUrl(),
      running: aceStep,
    },
    fasterWhisper: {
      label: "faster-whisper (자막 받아쓰기)",
      url: whisperUrl(),
      running: whisper,
    },
  };

  statusCache.at = Date.now();
  statusCache.data = data;
  return data;
}

module.exports = { getLocalModelStatus, aceStepUrl, whisperUrl };
