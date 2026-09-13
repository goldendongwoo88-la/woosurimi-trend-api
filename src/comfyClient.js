// 로컬 ComfyUI와 통신하는 공용 클라이언트입니다.
//
// ⚠️ 왜 ComfyUI인가 — 오픈소스 AI 스택 리포트(docs/오픈소스-AI-모델-리서치-2026-09.md)에서
// 추천한 Z-Image Turbo, Wan-VACE, musubi-tuner로 학습한 캐릭터 LoRA가 전부 ComfyUI를
// 공식/네이티브로 지원합니다. 그래서 이 파일 하나로 셋을 다 연결합니다.
//
// ⚠️ 이 모델들은 전부 "로컬 GPU"에서 돕니다. 이 서버(Render)는 CPU만 있어서 모델 자체를
// 여기서 돌릴 수 없습니다 — voiceProvider.js의 Voicebox와 똑같은 구조입니다: 사장님(또는
// 실제로 렌더링을 실행하는) 컴퓨터에서 ComfyUI를 켜두면, 그 컴퓨터에서 이 코드를 실행할 때만
// 동작합니다. Render에 배포된 채로는 이 기능들이 자동으로 꺼진 채(기존 방식 그대로) 동작합니다.
//
// ⚠️ ComfyUI 워크플로(그래프)는 설치한 커스텀 노드·체크포인트 파일명에 따라 사람마다 다릅니다.
// 그래서 그래프를 이 코드에 통째로 하드코딩하지 않고, 사장님이 ComfyUI에서 직접 만든 워크플로를
// "Save (API Format)"으로 내보내 workflows/ 폴더에 넣어두는 방식을 씁니다. 이 클라이언트는
// 그 JSON 안에서 아래 "자리표시자" 문자열을 실제 값으로 바꿔치기한 뒤 그대로 ComfyUI에 넘깁니다.
// 자세한 설정 방법은 workflows/README.md를 참고하세요.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WORKFLOWS_DIR = path.join(__dirname, "..", "workflows");

function baseUrl() {
  return (process.env.COMFYUI_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
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

/** ComfyUI가 이 컴퓨터에서 실제로 켜져 있는지 아주 짧게 두드려 봅니다(2초 타임아웃). */
async function ping() {
  try {
    const res = await fetchWithTimeout(`${baseUrl()}/system_stats`, {}, 2000);
    return res.ok;
  } catch {
    return false;
  }
}

function workflowPath(name) {
  return path.join(WORKFLOWS_DIR, `${name}.json`);
}

function hasWorkflow(name) {
  return fs.existsSync(workflowPath(name));
}

/**
 * 워크플로 JSON(문자열)에서 "__키__" 형태의 자리표시자를 vars의 값으로 바꿉니다.
 * 숫자/불리언 값은 JSON 안에서 따옴표 없이(진짜 숫자로) 들어가도록, 자리표시자가
 * 값 전체를 차지하는 문자열 리터럴일 때(예: "__WIDTH__")만 통째로 치환합니다.
 * 문장 중간에 섞여 있는 경우(예: "cat __STYLE__")는 문자열로 치환합니다.
 */
function fillPlaceholders(jsonText, vars) {
  let out = jsonText;
  for (const [key, value] of Object.entries(vars || {})) {
    const token = `__${key}__`;
    const wholeValueRe = new RegExp(`"${token}"`, "g");
    if (typeof value === "number" || typeof value === "boolean") {
      out = out.replace(wholeValueRe, JSON.stringify(value));
    } else {
      // 문자열은 안에 있을 수도 있는 개행/따옴표를 안전하게 이스케이프한 뒤 넣습니다.
      const safe = JSON.stringify(String(value ?? "")).slice(1, -1);
      out = out.replace(new RegExp(token, "g"), safe);
    }
  }
  return out;
}

/**
 * workflowName: workflows/<workflowName>.json 파일을 읽어 vars로 자리표시자를 채운 뒤 실행합니다.
 * vars: { PROMPT, NEGATIVE_PROMPT, WIDTH, HEIGHT, SEED, STEPS, LORA_NAME, INPUT_IMAGE, ... }
 *       실제로 어떤 키를 쓰는지는 워크플로 안에 사장님이 __KEY__로 표시해 둔 것에 달렸습니다.
 * outputKind: "images" | "gifs"(영상 프레임) | "audio" — ComfyUI history 응답에서 어느
 *             필드를 결과로 볼지. 대부분의 이미지/영상 노드는 "images", 오디오 저장 노드는
 *             구현체마다 다를 수 있어 세 필드를 순서대로 찾습니다.
 * 반환: 완성된 출력 파일들을 로컬에 내려받아 그 경로 배열을 돌려줍니다.
 */
async function runWorkflow(workflowName, vars = {}, { timeoutMs = 10 * 60 * 1000, outDir } = {}) {
  const wfPath = workflowPath(workflowName);
  if (!fs.existsSync(wfPath)) {
    throw new Error(
      `workflows/${workflowName}.json 파일이 없습니다. ComfyUI에서 워크플로를 만든 뒤 ` +
        `"Save (API Format)"으로 내보내 이 경로에 넣어주세요 (workflows/README.md 참고).`
    );
  }

  const alive = await ping();
  if (!alive) {
    throw new Error(
      `ComfyUI에 연결하지 못했습니다(${baseUrl()}) — 이 컴퓨터에서 ComfyUI가 실행 중인지 확인해 주세요.`
    );
  }

  const raw = fs.readFileSync(wfPath, "utf8");
  const filled = fillPlaceholders(raw, vars);
  let promptGraph;
  try {
    promptGraph = JSON.parse(filled);
  } catch (e) {
    throw new Error(`workflows/${workflowName}.json이 올바른 JSON이 아닙니다: ${e.message}`);
  }

  const clientId = crypto.randomUUID();
  const submitRes = await fetchWithTimeout(
    `${baseUrl()}/prompt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptGraph, client_id: clientId }),
    },
    20000
  );
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "");
    throw new Error(`ComfyUI가 워크플로를 거절했습니다(${submitRes.status}): ${errText.slice(0, 400)}`);
  }
  const submitted = await submitRes.json();
  const promptId = submitted.prompt_id;
  if (submitted.node_errors && Object.keys(submitted.node_errors).length) {
    throw new Error(`ComfyUI 워크플로에 노드 오류가 있습니다: ${JSON.stringify(submitted.node_errors).slice(0, 400)}`);
  }
  if (!promptId) throw new Error("ComfyUI가 prompt_id를 돌려주지 않았습니다.");

  // ⚠️ 웹소켓 대신 폴링을 씁니다 — 새 의존성(ws 패키지) 없이, 이 코드가 실제로 필요한 건
  // "다 됐을 때 파일 받기"뿐이라 실시간 진행률까지는 필요 없습니다. 로컬 GPU 추론이라
  // Z-Image Turbo 8스텝은 몇 초, LTX-2.5급 영상은 몇 분 걸릴 수 있어 넉넉히 기다립니다.
  const startedAt = Date.now();
  let history = null;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    const histRes = await fetchWithTimeout(`${baseUrl()}/history/${promptId}`, {}, 10000).catch(() => null);
    if (!histRes || !histRes.ok) continue;
    const histData = await histRes.json().catch(() => ({}));
    if (histData[promptId]) {
      history = histData[promptId];
      break;
    }
  }
  if (!history) {
    throw new Error(
      `ComfyUI 작업이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다(prompt_id: ${promptId}). ` +
        `ComfyUI 창에서 진행 상태를 확인해 주세요.`
    );
  }
  if (history.status && history.status.status_str === "error") {
    throw new Error(`ComfyUI 실행 중 오류가 발생했습니다: ${JSON.stringify(history.status).slice(0, 400)}`);
  }

  const outputs = history.outputs || {};
  const files = [];
  for (const nodeOutput of Object.values(outputs)) {
    for (const kind of ["images", "gifs", "audio"]) {
      if (Array.isArray(nodeOutput[kind])) files.push(...nodeOutput[kind]);
    }
  }
  if (!files.length) {
    throw new Error("ComfyUI 작업은 끝났지만 저장된 결과 파일을 찾지 못했습니다 — SaveImage/SaveAudio 노드가 있는지 확인해 주세요.");
  }

  const destDir = outDir || fs.mkdtempSync(path.join(require("os").tmpdir(), "comfy-out-"));
  fs.mkdirSync(destDir, { recursive: true });
  const localPaths = [];
  for (const f of files) {
    const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder || "", type: f.type || "output" });
    const viewRes = await fetchWithTimeout(`${baseUrl()}/view?${q.toString()}`, {}, 30000);
    if (!viewRes.ok) continue;
    const buf = Buffer.from(await viewRes.arrayBuffer());
    const dest = path.join(destDir, f.filename);
    fs.writeFileSync(dest, buf);
    localPaths.push(dest);
  }
  if (!localPaths.length) throw new Error("ComfyUI 결과 파일을 내려받지 못했습니다.");
  return localPaths;
}

module.exports = { ping, hasWorkflow, runWorkflow, fillPlaceholders, baseUrl, WORKFLOWS_DIR };
