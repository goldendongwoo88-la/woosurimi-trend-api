/**
 * 골든컷 파이썬 엔진을 부르는 공용 부분.
 *
 * 라우트(goldencut-routes.js)와 URL 자동 제작(autocut.js)이 똑같이 파이썬을 불러야 해서,
 * 실행·결과파싱·오류정리를 여기 한 곳에만 둡니다.
 *
 * 규약: 엔진에 --json을 주면 stdout에는 결과 JSON 한 줄만, 진행 문구는 stderr로 나옵니다.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENGINE_DIR = process.env.GOLDENCUT_DIR || path.join(__dirname, "..");
const PYTHON = process.env.GOLDENCUT_PYTHON || (process.platform === "win32" ? "python" : "python3");
const WORK_DIR = process.env.GOLDENCUT_WORK_DIR || path.join(os.tmpdir(), "goldencut-jobs");

/**
 * 파이썬 오류에서 사람이 읽을 부분만 남깁니다.
 *
 * 엔진이 죽으면 stderr에 traceback이 통째로 쏟아집니다("File ...", "^^^^", "raise ...").
 * 그걸 그대로 화면에 띄우면 뭘 해야 하는지 알 수가 없습니다. 파이썬은 진짜 이유를
 * 맨 끝의 "XxxError: 설명" 줄에 적으므로, 그 줄부터 뒤만 보여줍니다.
 */
function cleanError(lines) {
  const idx = lines.map((l) => /^\s*\w*(Error|Exception):/.test(l)).lastIndexOf(true);
  const picked = idx >= 0 ? lines.slice(idx) : lines.slice(-6);
  return picked
    .map((l) => l.replace(/^\s*\w*(Error|Exception):\s*/, ""))
    .filter((l) => l.trim() && !/^\s*(\^+|File "|Traceback|raise |\.\.\.)/.test(l))
    .join("\n")
    .trim();
}

/** 엔진을 한 번 돌립니다. stdout=결과 JSON, stderr=진행 문구. */
function runEngine(script, args, { onProgress } = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(ENGINE_DIR, script);
    if (!fs.existsSync(scriptPath)) {
      return resolve({ ok: false, error: `엔진 파일이 없습니다: ${scriptPath}` });
    }
    let child;
    try {
      child = spawn(PYTHON, [scriptPath, ...args], { cwd: ENGINE_DIR });
    } catch (e) {
      return resolve({ ok: false, error: `파이썬을 실행하지 못했습니다(${PYTHON}): ${e.message}` });
    }

    let stdout = "";
    const stderrTail = [];
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => {
      for (const line of b.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        stderrTail.push(line);
        if (stderrTail.length > 60) stderrTail.shift();
        if (onProgress) onProgress(line);
      }
    });
    child.on("error", (e) => resolve({ ok: false, error: `파이썬을 실행하지 못했습니다(${PYTHON}): ${e.message}` }));
    child.on("close", (code) => {
      const line = stdout.trim().split(/\r?\n/).filter((l) => l.trim()).pop();
      if (line) {
        try { return resolve(JSON.parse(line)); } catch { /* 아래로 */ }
      }
      resolve({ ok: false, error: cleanError(stderrTail) || `엔진이 ${code}번으로 끝났습니다.` });
    });
  });
}

/** 화면 효과 목록. 값이 잘 안 바뀌어서 한 번 읽고 재사용합니다. */
let effectsCache = null;
async function listEffects() {
  if (effectsCache) return effectsCache;
  const out = await runEngine("goldencut_effects.py", ["--list", "--json"]);
  if (Array.isArray(out)) effectsCache = out;
  return Array.isArray(out) ? out : [];
}

module.exports = { ENGINE_DIR, PYTHON, WORK_DIR, runEngine, cleanError, listEffects };
