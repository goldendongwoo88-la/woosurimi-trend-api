// faster-whisper(로컬)로 영상/오디오를 자동으로 받아써서 자막 큐를 만드는 모듈입니다.
//
// ⚠️ voiceProvider.js/bgmGenerate.js 머리말과 같은 주의사항 — faster-whisper 자체는
// 파이썬 라이브러리라 "그대로 실행하면 뜨는 표준 HTTP API"가 하나로 정해져 있지 않습니다.
// 여기서는 가장 널리 쓰이는 자체 호스팅 방식인 whisper-asr-webservice
// (ahmetoner/whisper-asr-webservice, faster-whisper를 백엔드로 쓸 수 있음)의 관례를
// 기본으로 가정합니다: POST {FASTER_WHISPER_URL}/asr (multipart, 필드명 audio_file)
// → output_format=json이면 { segments: [{ start, end, text }, ...] } 형태로 돌아옵니다.
// 다른 방식으로 띄운 서버라면 이 파일의 요청/응답 처리 부분만 고치면 되고, 부르는
// 쪽(assSubtitle.js, shortsStudio.js)의 cues 형태는 그대로 유지됩니다.
//
// 안 켜져 있어도 서버는 죽지 않습니다 — 자막을 직접 입력하는 기존 방식이 그대로 남아있습니다.

const fs = require("fs");
const { whisperUrl } = require("./localModels");

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
 * mediaPath: 로컬 영상/오디오 파일 경로(mp4/mp3/wav 등 ffmpeg가 읽을 수 있는 형식이면 됨).
 * language: (선택) "ko"처럼 언어 코드를 지정하면 자동감지보다 빠르고 정확합니다.
 * 반환: assSubtitle.js/shortsStudio.js가 그대로 쓸 수 있는 [{ start, end, text }, ...] (초 단위).
 */
async function transcribe(mediaPath, { language = "ko" } = {}) {
  const baseUrl = whisperUrl();
  const buf = fs.readFileSync(mediaPath);
  const form = new FormData();
  form.append("audio_file", new Blob([buf]), require("path").basename(mediaPath));

  const query = new URLSearchParams({ output: "json", language, word_timestamps: "false" });
  let res;
  try {
    res = await fetchWithTimeout(`${baseUrl}/asr?${query.toString()}`, { method: "POST", body: form }, 600000);
  } catch (err) {
    throw new Error(
      `faster-whisper 서버에 연결하지 못했습니다(${baseUrl}) — 이 컴퓨터에서 자막 받아쓰기 서버가 실행 중인지 확인해 주세요. (${err.message})`
    );
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`faster-whisper API 오류(${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const segments = data.segments || data.chunks || [];
  if (!Array.isArray(segments) || !segments.length) {
    throw new Error("faster-whisper가 자막 구간을 하나도 돌려주지 않았습니다(무음 영상이거나 언어 인식 실패일 수 있습니다).");
  }
  return segments
    .map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || "").trim(),
    }))
    .filter((c) => c.text && c.end > c.start);
}

/** 지금 자동 받아쓰기를 쓸 수 있는 상태인지 — 화면에 버튼을 보여줄지 판단하는 데 씁니다. */
async function status() {
  try {
    const res = await fetchWithTimeout(`${whisperUrl()}/`, {}, 2000);
    return { running: res.status < 500, url: whisperUrl() };
  } catch {
    return { running: false, url: whisperUrl() };
  }
}

module.exports = { transcribe, status };
