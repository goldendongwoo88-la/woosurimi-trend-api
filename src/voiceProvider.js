// AI 성우 목소리(TTS, Text-to-Speech) 연동 모듈입니다.
//
// ⚠️ 중요: 이 파일은 "코드"만 준비되어 있습니다. 실제로 AI 목소리가 나오려면 아래 3개
// 서비스 중 하나에 직접 가입해서 API 키를 발급받고, Render(또는 로컬 .env)에
// 환경변수로 등록해야 합니다. 키를 등록하지 않으면 /api/shortform/render는 나레이션
// 없이(자막만 있는) 영상으로 자동으로 대체해서 만들어주고, 왜 나레이션이 빠졌는지
// 이유를 응답에 함께 알려줍니다 — 서버가 에러로 죽지 않습니다.
//
// 지원 3사와 필요한 환경변수:
//   1) 네이버 CLOVA Voice  → CLOVA_VOICE_CLIENT_ID, CLOVA_VOICE_CLIENT_SECRET
//   2) 타입캐스트 Typecast → TYPECAST_API_KEY  (+ 선택: TYPECAST_ACTOR_ID)
//   3) ElevenLabs          → ELEVENLABS_API_KEY (+ 선택: ELEVENLABS_VOICE_ID)
//
// 각 서비스의 정확한 API 스펙(요청 형식)은 서비스 쪽 사정으로 바뀔 수 있어서, 만약 특정
// 서비스에서 에러가 계속 나면 해당 회사의 최신 개발자 문서를 검색해서 파라미터명이
// 바뀌지 않았는지 확인해 보는 걸 권장합니다.

const fs = require("fs");

const PROVIDERS = {
  clova: {
    label: "네이버 CLOVA Voice",
    configured: () => !!(process.env.CLOVA_VOICE_CLIENT_ID && process.env.CLOVA_VOICE_CLIENT_SECRET),
    defaultVoice: "nara",
  },
  typecast: {
    label: "타입캐스트 Typecast",
    configured: () => !!process.env.TYPECAST_API_KEY,
    defaultVoice: process.env.TYPECAST_ACTOR_ID || null,
  },
  elevenlabs: {
    label: "ElevenLabs",
    configured: () => !!process.env.ELEVENLABS_API_KEY,
    defaultVoice: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM", // ElevenLabs 기본 샘플 보이스(Rachel)
  },
  azure: {
    label: "Microsoft Azure Speech",
    configured: () => !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION),
    defaultVoice: process.env.AZURE_SPEECH_VOICE || "ko-KR-InJoonNeural", // 사장님이 샘플 듣고 고른 기본 한국어 남성 뉴럴 보이스
  },
};

function getProviderStatus() {
  return Object.fromEntries(
    Object.entries(PROVIDERS).map(([key, p]) => [key, { label: p.label, ready: p.configured() }])
  );
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function saveBinaryResponse(res, destPath) {
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

async function synthesizeClova(text, voiceId, destPath) {
  const clientId = process.env.CLOVA_VOICE_CLIENT_ID;
  const clientSecret = process.env.CLOVA_VOICE_CLIENT_SECRET;
  const body = new URLSearchParams({
    speaker: voiceId || PROVIDERS.clova.defaultVoice,
    text,
    format: "mp3",
    speed: "0",
  });
  const res = await fetchWithTimeout("https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts", {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`CLOVA Voice API 오류(${res.status}): ${errText.slice(0, 200)}`);
  }
  await saveBinaryResponse(res, destPath);
}

async function synthesizeTypecast(text, voiceId, destPath) {
  const apiKey = process.env.TYPECAST_API_KEY;
  const actorId = voiceId || PROVIDERS.typecast.defaultVoice;
  if (!actorId) {
    throw new Error("타입캐스트는 사용할 목소리(actor_id)를 지정해야 합니다 — TYPECAST_ACTOR_ID 환경변수를 등록해 주세요.");
  }
  // 타입캐스트 공식 API(https://docs.typecast.ai)는 요청을 넣으면 음성 생성 작업이
  // 비동기로 처리되고, 결과 mp3 다운로드 URL을 폴링해서 받는 방식입니다.
  const createRes = await fetchWithTimeout("https://typecast.ai/api/speak", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      actor_id: actorId,
      text,
      lang: "auto",
      tempo: 1,
      volume: 100,
      pitch: 0,
      xapi_hd: true,
      max_seconds: 60,
      model_version: "latest",
      xapi_audio_format: "mp3",
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(`타입캐스트 요청 생성 실패(${createRes.status}): ${errText.slice(0, 200)}`);
  }
  const created = await createRes.json();
  const speakUrl = created?.result?.speak_v2_url;
  if (!speakUrl) throw new Error("타입캐스트 응답에서 작업 URL을 찾지 못했습니다.");

  // 완료될 때까지 최대 20초, 1초 간격으로 상태를 확인합니다.
  let audioUrl = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetchWithTimeout(speakUrl, { headers: { "X-API-KEY": apiKey } });
    if (!pollRes.ok) continue;
    const polled = await pollRes.json();
    const status = polled?.result?.status;
    if (status === "done") {
      audioUrl = polled?.result?.audio_download_url;
      break;
    }
    if (status === "failed") throw new Error("타입캐스트 음성 생성이 실패했습니다.");
  }
  if (!audioUrl) throw new Error("타입캐스트 음성 생성이 시간 내에 끝나지 않았습니다.");

  const audioRes = await fetchWithTimeout(audioUrl);
  if (!audioRes.ok) throw new Error("타입캐스트 음성 파일 다운로드에 실패했습니다.");
  await saveBinaryResponse(audioRes, destPath);
}

async function synthesizeElevenLabs(text, voiceId, destPath) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voice = voiceId || PROVIDERS.elevenlabs.defaultVoice;
  const res = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs API 오류(${res.status}): ${errText.slice(0, 200)}`);
  }
  await saveBinaryResponse(res, destPath);
}

function escapeXml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

// Azure AI Speech(구 Cognitive Services Speech)는 리전별 엔드포인트를 씁니다
// (예: "koreacentral", "eastus" 등 — 리소스를 만들 때 고른 리전과 같아야 합니다).
// REST API는 SSML(XML)로 요청을 보내고, 응답 바디에 mp3 바이너리가 그대로 옵니다.
async function synthesizeAzure(text, voiceId, destPath) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voice = voiceId || PROVIDERS.azure.defaultVoice;
  // 숏폼 나레이션은 일반 낭독보다 살짝 빠르게 읽는 게 자연스럽고(요즘 쇼츠 톤),
  // 장면당 길이도 짧아져서 전체 영상이 10~25초 안에 들어옵니다.
  const rate = process.env.AZURE_SPEECH_RATE || "+12%";
  const ssml =
    `<speak version='1.0' xml:lang='ko-KR'><voice name='${escapeXml(voice)}'>` +
    `<prosody rate='${escapeXml(rate)}'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`;

  const res = await fetchWithTimeout(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "woosurimi-trend-api",
    },
    body: ssml,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Azure Speech API 오류(${res.status}): ${errText.slice(0, 200)}`);
  }
  await saveBinaryResponse(res, destPath);
}

/**
 * text: 나레이션으로 읽을 문장
 * provider: "clova" | "typecast" | "elevenlabs" | "azure"
 * voiceId: (선택) 서비스별 목소리 식별자
 * destPath: 결과 mp3를 저장할 로컬 경로
 * 반환: 성공 시 destPath, 키가 없거나 실패하면 예외를 던집니다(호출부에서 잡아서
 *       "나레이션 없이 진행" 처리하세요).
 */
async function synthesizeVoice({ text, provider, voiceId, destPath }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`지원하지 않는 음성 제공자입니다: ${provider}`);
  if (!p.configured()) {
    throw new Error(`${p.label} API 키가 서버에 설정되어 있지 않습니다.`);
  }
  if (provider === "clova") return synthesizeClova(text, voiceId, destPath).then(() => destPath);
  if (provider === "typecast") return synthesizeTypecast(text, voiceId, destPath).then(() => destPath);
  if (provider === "elevenlabs") return synthesizeElevenLabs(text, voiceId, destPath).then(() => destPath);
  if (provider === "azure") return synthesizeAzure(text, voiceId, destPath).then(() => destPath);
  throw new Error(`구현되지 않은 음성 제공자입니다: ${provider}`);
}

module.exports = { synthesizeVoice, getProviderStatus, PROVIDERS };
