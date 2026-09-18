/**
 * 골든컷 엔진 ↔ 화면 연결 라우트 — 우수리미부부 AI 작업실 통합용
 *
 * 작업실(화면)이 goldencut/*.py(엔진)를 부를 수 있게 이어주는 다리입니다.
 * 붙이는 법은 한 줄입니다:
 *
 *     require("./goldencut/integration/goldencut-routes")(app);
 *
 * express 말고는 아무것도 필요 없습니다(node 기본 모듈만 씁니다). 그래서 이 저장소에도,
 * 작업실 프로젝트에도 파일만 복사하면 그대로 돕니다.
 *
 * ── 왜 "작업 번호(job)"를 쓰나 ────────────────────────────
 * 영상 렌더링은 30초~몇 분이 걸립니다. 그동안 HTTP 응답을 붙들고 있으면 브라우저나
 * 중간 프록시가 먼저 끊어버립니다. 그래서 렌더 요청은 작업 번호만 즉시 돌려주고,
 * 화면이 /job/<번호>를 계속 물어보는 방식으로 만들었습니다.
 *
 * ── 왜 stdout만 읽나 ─────────────────────────────────────
 * 엔진에 --json을 주면 사람이 읽는 진행 문구는 stderr로 가고 stdout에는 결과 JSON
 * 한 줄만 남습니다. 그래서 stdout은 결과 파싱용, stderr는 진행 표시용으로 나눠 씁니다.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// 엔진 파이썬 파일들이 있는 폴더. 이 파일이 goldencut/integration/ 안에 있으니 한 단계 위입니다.
const ENGINE_DIR = process.env.GOLDENCUT_DIR || path.join(__dirname, "..");
// 윈도우는 'python', 맥·리눅스는 'python3'이 기본입니다. 다르면 GOLDENCUT_PYTHON으로 바꾸세요.
const PYTHON = process.env.GOLDENCUT_PYTHON || (process.platform === "win32" ? "python" : "python3");
// 렌더 결과물을 모아두는 곳.
const WORK_DIR = process.env.GOLDENCUT_WORK_DIR || path.join(os.tmpdir(), "goldencut-jobs");
// 폴더 열어보기를 이 경로 아래로만 제한하고 싶을 때 씁니다(비워두면 제한 없음 = 내 PC 전체).
const BROWSE_ROOT = process.env.GOLDENCUT_ROOT || "";

// 작업 기록. 프로그램을 끄면 사라집니다 — 결과 파일은 WORK_DIR에 남으니 문제 없습니다.
const jobs = new Map();
const JOB_TTL_MS = 6 * 60 * 60 * 1000; // 6시간 지난 작업 폴더는 치웁니다.

const MEDIA_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp",
                           ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"]);

/**
 * 내 컴퓨터에서 온 요청인지 확인합니다.
 *
 * ⚠️ 이 라우트는 "내 PC의 파일 목록을 보여주고, 내 PC의 파일로 영상을 만드는" 기능입니다.
 * 작업실처럼 내 컴퓨터에서만 도는 프로그램에서는 당연하고 안전하지만, 이 저장소의 서버는
 * Render 같은 외부에도 올라갑니다. 거기서 이게 열려 있으면 남이 서버 파일을 들여다볼 수
 * 있습니다. 그래서 기본적으로 **내 컴퓨터(localhost)에서 온 요청만** 받습니다.
 * 굳이 외부에 열어야 한다면 GOLDENCUT_ALLOW_REMOTE=1 을 직접 켜야 합니다.
 */
function localOnly(req, res, next) {
  if (process.env.GOLDENCUT_ALLOW_REMOTE === "1") return next();
  const ip = (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip === "") return next();
  return res.status(403).json({
    ok: false,
    error: "골든컷은 내 컴퓨터에서만 쓸 수 있습니다. (외부 접속 차단)",
  });
}

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
    let stderrTail = [];
    child.stdout.on("data", (b) => { stdout += b.toString(); });
    child.stderr.on("data", (b) => {
      const lines = b.toString().split(/\r?\n/).filter((l) => l.trim());
      for (const line of lines) {
        stderrTail.push(line);
        if (stderrTail.length > 60) stderrTail.shift();
        if (onProgress) onProgress(line);
      }
    });
    child.on("error", (e) => {
      resolve({ ok: false, error: `파이썬을 실행하지 못했습니다(${PYTHON}): ${e.message}` });
    });
    child.on("close", (code) => {
      // stdout의 마지막 JSON 한 줄만 결과입니다.
      const line = stdout.trim().split(/\r?\n/).filter((l) => l.trim()).pop();
      if (line) {
        try { return resolve(JSON.parse(line)); } catch { /* 아래로 */ }
      }
      resolve({
        ok: false,
        error: cleanError(stderrTail) || `엔진이 ${code}번으로 끝났습니다.`,
      });
    });
  });
}

/** 오래된 작업 폴더를 치웁니다. */
function sweepOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.startedAt > JOB_TTL_MS) {
      jobs.delete(id);
      fs.rm(path.join(WORK_DIR, id), { recursive: true, force: true }, () => {});
    }
  }
}

function newJob(kind) {
  sweepOldJobs();
  const id = crypto.randomUUID();
  const dir = path.join(WORK_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const job = { id, kind, dir, status: "running", progress: [], result: null, startedAt: Date.now() };
  jobs.set(id, job);
  return job;
}

function pushProgress(job, line) {
  job.progress.push(line);
  if (job.progress.length > 60) job.progress.shift();
}

module.exports = function mountGoldenCut(app, options = {}) {
  const base = options.base || "/api/goldencut";
  fs.mkdirSync(WORK_DIR, { recursive: true });

  // ── 1. 지금 쓸 수 있는 상태인지 ────────────────────────────
  app.get(`${base}/status`, localOnly, async (req, res) => {
    const engines = ["goldencut_effects.py", "goldencut_caption.py", "goldencut_voice.py"];
    const found = {};
    for (const f of engines) found[f] = fs.existsSync(path.join(ENGINE_DIR, f));

    const python = await new Promise((r) => {
      const c = spawn(PYTHON, ["--version"]);
      let out = "";
      c.stdout.on("data", (b) => (out += b));
      c.stderr.on("data", (b) => (out += b));
      c.on("error", () => r(null));
      c.on("close", () => r(out.trim() || null));
    });
    const ffmpeg = await new Promise((r) => {
      const c = spawn("ffmpeg", ["-version"]);
      let out = "";
      c.stdout.on("data", (b) => (out += b));
      c.on("error", () => r(null));
      c.on("close", () => r(out.split("\n")[0] || null));
    });

    res.json({
      ok: Boolean(python && ffmpeg && found["goldencut_effects.py"]),
      engineDir: ENGINE_DIR,
      python, ffmpeg, engines: found,
      hint: !python ? "파이썬이 없습니다. python.org에서 설치하세요."
          : !ffmpeg ? "ffmpeg가 없습니다. ffmpeg를 설치하고 PATH에 넣어주세요."
          : !found["goldencut_effects.py"] ? `엔진 파일을 ${ENGINE_DIR} 에 복사하세요.`
          : "준비 완료입니다.",
    });
  });

  // ── 2. 화면 효과 목록 (드롭다운 채우기) ────────────────────
  app.get(`${base}/effects`, localOnly, async (req, res) => {
    const out = await runEngine("goldencut_effects.py", ["--list", "--json"]);
    if (Array.isArray(out)) return res.json({ ok: true, effects: out });
    res.status(500).json({ ok: false, error: out.error || "효과 목록을 읽지 못했습니다." });
  });

  // ── 3. 폴더 열어보기 — 영상·사진 고르기용 ──────────────────
  // 큰 영상 파일을 업로드로 주고받으면 느리고 용량도 두 배로 듭니다. 작업실은 어차피 내
  // 컴퓨터에서 도니까, 파일을 옮기지 않고 "경로만" 가리키는 쪽이 훨씬 빠릅니다.
  app.get(`${base}/browse`, localOnly, (req, res) => {
    const dir = String(req.query.dir || "").trim();
    if (!dir) return res.status(400).json({ ok: false, error: "폴더 경로를 넣어주세요." });
    const abs = path.resolve(dir);
    if (BROWSE_ROOT && !abs.startsWith(path.resolve(BROWSE_ROOT))) {
      return res.status(403).json({ ok: false, error: `${BROWSE_ROOT} 아래 폴더만 열 수 있습니다.` });
    }
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      return res.status(400).json({ ok: false, error: `폴더를 열지 못했습니다: ${e.message}` });
    }
    const files = entries
      .filter((d) => d.isFile() && MEDIA_EXT.has(path.extname(d.name).toLowerCase()))
      .map((d) => {
        const p = path.join(abs, d.name);
        let size = 0;
        try { size = fs.statSync(p).size; } catch {}
        return { name: d.name, path: p, size, kind: VIDEO_EXT.has(path.extname(d.name).toLowerCase()) ? "video" : "photo" };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const folders = entries.filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => ({ name: d.name, path: path.join(abs, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    res.json({ ok: true, dir: abs, parent: path.dirname(abs), folders, files });
  });

  // ── 4. 영상 만들기 ────────────────────────────────────────
  app.post(`${base}/render`, localOnly, (req, res) => {
    const b = req.body || {};
    const scenes = Array.isArray(b.scenes) ? b.scenes : [];
    if (!scenes.length) return res.status(400).json({ ok: false, error: "장면이 하나도 없습니다." });

    // 없는 파일을 넣으면 엔진이 한참 돌다가 죽습니다. 먼저 걸러줍니다.
    const missing = scenes.filter((s) => !s.image || !fs.existsSync(s.image)).map((s) => s.image || "(빈 경로)");
    if (missing.length) {
      return res.status(400).json({ ok: false, error: `파일을 찾을 수 없습니다:\n${missing.join("\n")}` });
    }

    const job = newJob("render");
    const scenesPath = path.join(job.dir, "scenes.json");
    const outPath = path.join(job.dir, "out.mp4");
    fs.writeFileSync(scenesPath, JSON.stringify(
      scenes.map((s) => ({ image: s.image, caption: s.caption || "" })), null, 2), "utf-8");

    const args = ["--scenes-json", scenesPath, "--out", outPath, "--json"];
    if (b.effect) args.push("--effect", String(b.effect));
    if (b.template) args.push("--template", String(b.template));
    if (b.hook) args.push("--hook", String(b.hook));
    // 길이를 비워두면(=자동) --seconds를 아예 주지 않습니다. 그래야 엔진이 알아서 잡습니다.
    if (b.seconds) args.push("--seconds", String(b.seconds));
    if (b.intro) args.push("--intro", "scatter");
    if (b.bgm) args.push("--bgm", String(b.bgm));
    if (b.voice) args.push("--voice", String(b.voice)); // golden / chasurimi / none

    res.json({ ok: true, jobId: job.id });

    runEngine("goldencut_effects.py", args, { onProgress: (l) => pushProgress(job, l) })
      .then((result) => {
        job.result = result;
        job.status = result && result.ok ? "done" : "failed";
        if (job.status === "done") job.result.playUrl = `${base}/file/${job.id}`;
      })
      .catch((e) => { job.status = "failed"; job.result = { ok: false, error: e.message }; });
  });

  // ── 5. 자동 캡션 ──────────────────────────────────────────
  app.post(`${base}/caption`, localOnly, (req, res) => {
    const b = req.body || {};
    const video = String(b.video || "").trim();
    if (!video || !fs.existsSync(video)) {
      return res.status(400).json({ ok: false, error: "자막을 넣을 영상 파일을 찾을 수 없습니다." });
    }
    const job = newJob("caption");
    const outPath = path.join(job.dir, "captioned.mp4");
    const args = ["--video", video, "--out", outPath];
    if (b.template) args.push("--template", String(b.template));
    if (b.noKaraoke) args.push("--no-karaoke");
    if (b.language) args.push("--language", String(b.language));

    res.json({ ok: true, jobId: job.id });

    runEngine("goldencut_caption.py", args, { onProgress: (l) => pushProgress(job, l) })
      .then((result) => {
        // 캡션 엔진은 --json이 없어서 결과 JSON을 안 냅니다. 파일이 생겼는지로 판단합니다.
        const made = fs.existsSync(outPath);
        job.status = made ? "done" : "failed";
        job.result = made
          ? { ok: true, path: outPath, playUrl: `${base}/file/${job.id}` }
          : { ok: false, error: (result && result.error) || "자막을 입히지 못했습니다." };
      })
      .catch((e) => { job.status = "failed"; job.result = { ok: false, error: e.message }; });
  });

  // ── 6. 작업 진행 상황 물어보기 ────────────────────────────
  app.get(`${base}/job/:id`, localOnly, (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ ok: false, error: "그런 작업이 없습니다." });
    res.json({
      ok: true,
      status: job.status,
      kind: job.kind,
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
      latest: job.progress[job.progress.length - 1] || "",
      progress: job.progress,
      result: job.result,
    });
  });

  // ── 7. 완성된 영상 재생 ───────────────────────────────────
  app.get(`${base}/file/:id`, localOnly, (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job || !job.result || !job.result.path) return res.status(404).send("아직 결과가 없습니다.");
    res.sendFile(job.result.path);
  });

  // ── 8. 목소리(Voicebox) 연결 확인 ─────────────────────────
  app.get(`${base}/voice-check`, localOnly, async (req, res) => {
    const out = await new Promise((resolve) => {
      const c = spawn(PYTHON, [path.join(ENGINE_DIR, "goldencut_voice.py"), "--check"], { cwd: ENGINE_DIR });
      let all = "";
      c.stdout.on("data", (b) => (all += b));
      c.stderr.on("data", (b) => (all += b));
      c.on("error", (e) => resolve(`실행 실패: ${e.message}`));
      c.on("close", () => resolve(all.trim()));
    });
    res.json({ ok: true, report: out });
  });

  console.log(`[goldencut] 자동컷·자동캡션 라우트를 붙였습니다 — ${base} (엔진: ${ENGINE_DIR})`);
};
