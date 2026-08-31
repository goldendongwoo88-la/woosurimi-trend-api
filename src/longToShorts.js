/**
 * 긴 영상에서 쇼츠 뽑아내기.
 *
 * ⚠️ 이건 **내 영상**에만 쓰는 도구입니다. 남의 영상을 잘라 올리면
 * 유튜브가 재사용 콘텐츠로 보고 수익 창출을 거부하고, 저작권 신고가 쌓이면
 * 채널이 사라집니다. 참고한 강의들이 하나같이 남의 영상을 가져다 쓰라고
 * 가르쳤는데, 10년 넘게 키운 채널을 걸 일이 아닙니다.
 *
 * ⚠️ 왜 이게 값어치가 있는가.
 * 가전 리뷰 같은 긴 영상은 이미 찍어둔 게 쌓여 있습니다. 새로 찍지 않고
 * 조회수를 늘릴 수 있는 유일한 방법이에요. 게다가 쇼츠 하나가
 * 유튜브·인스타·틱톡·클립 네 군데에 그대로 올라갑니다.
 *
 * ⚠️ 어디를 자를지는 자막으로 고릅니다. 화면만 보고는 어디가 재미있는지
 * 알 수가 없습니다. 말이 재미있는 지점이 대개 화면도 재미있습니다.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const { callClaude, isConfigured, extractJson } = require("./claudeClient");
const shortsStudio = require("./shortsStudio");

const OUT_DIR = path.join(__dirname, "..", "public", "renders");

function run(bin, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || "").slice(-600)));
      resolve({ stdout, stderr });
    });
  });
}

// ────────────────────────────────────────────────────────────
// 자막 가져오기
// ────────────────────────────────────────────────────────────

/**
 * 유튜브 자막을 시간과 함께 가져옵니다.
 *
 * ⚠️ 자동자막은 한 줄이 화면에 굴러가면서 같은 문장을 서너 번 반복합니다.
 * 그대로 쓰면 어디가 어딘지 알 수가 없어서 중복을 걷어냅니다.
 */
function parseVtt(raw) {
  const lines = String(raw).replace(/<[^>]+>/g, "").split("\n");
  const out = [];
  let cur = null, last = "";
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || /^(WEBVTT|Kind:|Language:|NOTE)/.test(t)) continue;
    const m = t.match(/^(\d\d):(\d\d):(\d\d)\.(\d+)\s*-->\s*(\d\d):(\d\d):(\d\d)\.(\d+)/);
    if (m) {
      const s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +("0." + m[4]);
      const e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +("0." + m[8]);
      cur = { start: s, end: e, text: "" };
      continue;
    }
    if (/^\d+$/.test(t)) continue;
    if (!cur) continue;
    if (t === last) continue;              // 그대로 반복된 줄
    if (last && t.includes(last)) {        // 굴러가면서 앞 줄을 품은 줄
      cur.text = t;
    } else {
      cur.text = cur.text ? cur.text + " " + t : t;
    }
    last = t;
    if (cur.text) { out.push(cur); cur = null; }
  }
  return out;
}

async function fetchYoutube(url, workDir) {
  // 자막 먼저 — 자막이 없으면 어디를 자를지 고를 수가 없습니다.
  //
  // ⚠️ 언어를 한 번에 여러 개 달라고 하면 안 됩니다. 하나가 없거나 막히면
  // yt-dlp가 통째로 실패합니다. 실제로 영어 자막에서 429가 나서 한국어까지
  // 못 받은 적이 있습니다. 한 언어씩 따로 시도하고, 하나만 되면 그걸로 갑니다.
  let lastErr = null;
  for (const lang of ["ko", "ko-orig", "en"]) {
    try {
      await run("yt-dlp", [
        "--skip-download", "--write-auto-subs", "--write-subs",
        "--sub-langs", lang, "--convert-subs", "vtt",
        "--no-warnings", "-o", path.join(workDir, "v.%(ext)s"), url,
      ], { timeout: 180000 });
      if (fs.readdirSync(workDir).some((f) => f.endsWith(".vtt"))) break;
    } catch (e) {
      lastErr = e;
      // ⚠️ 429는 잠깐 쉬면 풀립니다. 다음 언어로 넘어가도 어차피 막히니 여기서 멈춥니다.
      if (/429|Too Many Requests/i.test(e.message)) {
        throw new Error("유튜브가 잠시 요청을 막고 있습니다(429). 10분쯤 뒤에 다시 시도해 주세요.");
      }
    }
  }

  const vtt = fs.readdirSync(workDir).find((f) => f.endsWith(".vtt"));
  if (!vtt) {
    throw new Error(
      "자막을 찾지 못했습니다. 자막이 있는 영상이어야 어디를 자를지 고를 수 있습니다." +
      (lastErr ? `\n(${lastErr.message.slice(0, 120)})` : "")
    );
  }
  const cues = parseVtt(fs.readFileSync(path.join(workDir, vtt), "utf8"));
  if (cues.length < 5) throw new Error("자막이 너무 짧습니다.");

  // 영상은 자막을 보고 자를 곳을 정한 뒤에 받습니다. 미리 받으면 시간만 낭비합니다.
  return { cues, download: async () => {
    await run("yt-dlp", [
      "-f", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4",
      "--no-warnings", "-o", path.join(workDir, "src.%(ext)s"), url,
    ], { timeout: 900000 });
    const f = fs.readdirSync(workDir).find((x) => /^src\./.test(x));
    if (!f) throw new Error("영상을 내려받지 못했습니다.");
    return path.join(workDir, f);
  } };
}

// ────────────────────────────────────────────────────────────
// 어디를 자를까
// ────────────────────────────────────────────────────────────
async function pickMoments(cues, { count = 10, topic = "" } = {}) {
  if (!isConfigured()) throw new Error("AI가 연결되지 않았습니다.");

  // 자막을 15초 덩어리로 묶어서 넘깁니다. 한 줄씩 넘기면 너무 잘게 쪼개져서
  // 어디가 하나의 이야기인지 AI가 못 봅니다.
  const blocks = [];
  let b = null;
  for (const c of cues) {
    if (!b || c.start - b.start > 15) { b = { start: c.start, end: c.end, text: c.text }; blocks.push(b); }
    else { b.end = c.end; b.text += " " + c.text; }
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const data = await callClaude({
    feature: "긴영상→쇼츠",
    system:
      "긴 영상에서 쇼츠로 만들 구간을 고릅니다.\n\n" +
      "⚠️ 쇼츠는 **첫 3초**에 붙잡지 못하면 넘어갑니다. 그러니 시작 지점이 중요합니다.\n" +
      "  좋은 시작: 결과를 먼저 보여주거나, 의외의 말이 나오거나, 질문을 던지는 곳\n" +
      "  나쁜 시작: '자 그럼 이제', '아까 말씀드린 것처럼' 같은 이어받는 말\n\n" +
      "⚠️ 한 구간은 **하나의 이야기**로 끝나야 합니다. 중간에 잘리면 안 됩니다.\n" +
      "⚠️ 길이는 20~55초. 너무 짧으면 내용이 없고 너무 길면 안 봅니다.\n" +
      "⚠️ 서로 겹치지 않게 고르세요.\n\n" +
      "── 각 구간마다 만들 것 ──\n" +
      "① hook — 화면 맨 위에 **두 줄**로 들어갑니다. 둘째 줄은 색이 달라 대비가 생깁니다.\n" +
      "   첫 줄은 상황·소재(8~12자), 둘째 줄은 **반전이나 판정**(6~10자).\n" +
      '   예: "덜 익은 토마토" / "이게 디테일"  ·  "초반부터 절망" / "이 포켓몬 왜 이렇게 약해"\n' +
      "   둘째 줄이 첫 줄을 되풀이하면 안 됩니다. 뒤집거나, 값을 매기거나, 궁금하게 만듭니다.\n" +
      "② comment — 영상 아래에 **시청자 댓글**처럼 붙습니다. 사람들이 이걸 읽느라 끝까지 봅니다.\n" +
      "   진짜 댓글처럼 짧고 구어체로. 정중한 설명체 금지. 30자 이내.\n" +
      '   좋은 예: "이 조합 찬성이요...", "맛이 어떨지 궁금합니다", "얼마나 진심였으면 3개국어를..."\n' +
      "   ⚠️ 영상에 실제로 나온 내용에서만 씁니다. 없는 사실을 지어내지 마세요.\n\n" +
      '{"moments":[{"start":초,"end":초,' +
      '"hook":{"line1":"첫 줄","line2":"둘째 줄"},' +
      '"comment":{"name":"닉네임(한글 2~5자)","text":"댓글 한 줄","likes":"494"},' +
      '"why":"이 구간을 고른 이유 한 줄"}]} JSON만 출력하세요.',
    messages: [{
      role: "user",
      content:
        (topic ? `영상 주제: ${topic}\n\n` : "") +
        `자막(초 단위 시작시각과 함께):\n\n` +
        blocks.map((x) => `[${Math.round(x.start)}s / ${fmt(x.start)}] ${x.text}`).join("\n") +
        `\n\n쇼츠로 만들 구간 ${count}개를 골라주세요.`,
    }],
    maxTokens: 1800,
    temperature: 0.7,
  });

  const parsed = extractJson(data) || {};
  const total = cues[cues.length - 1].end;
  return (Array.isArray(parsed.moments) ? parsed.moments : [])
    .map((m) => {
      // 훅은 {line1,line2}로 받지만, 예전처럼 문자열로 올 수도 있어 둘 다 받습니다.
      const h = m.hook && typeof m.hook === "object" ? m.hook : { line1: String(m.hook || ""), line2: "" };
      const l1 = String(h.line1 || "").slice(0, 14).trim();
      const l2 = String(h.line2 || "").slice(0, 14).trim();
      const c = m.comment && typeof m.comment === "object" ? m.comment : {};
      return {
        start: Math.max(0, Number(m.start) || 0),
        end: Math.min(total, Number(m.end) || 0),
        hookLine1: l1,
        hookLine2: l2,
        hook: [l1, l2].filter(Boolean).join(" "),   // 화면에 그릴 때는 두 줄로 나눠 씁니다
        comment: {
          name: String(c.name || "").slice(0, 10).trim(),
          text: String(c.text || "").slice(0, 40).trim(),
          likes: String(c.likes || "").replace(/[^\d.만천]/g, "").slice(0, 6),
        },
        why: String(m.why || "").trim(),
      };
    })
    .filter((m) => m.end - m.start >= 12 && m.end - m.start <= 90)
    .slice(0, count);
}

// ────────────────────────────────────────────────────────────
// 자르기
// ────────────────────────────────────────────────────────────

/**
 * 한 구간을 세로 쇼츠로.
 *
 * ⚠️ 2026-09-01 방식을 통째로 바꿨습니다.
 * 예전에는 **흐린 배경 위에 가로 영상을 얹는** 방식이었습니다. 화면 위아래 절반이
 * 뭉갠 배경으로 낭비되고 인물이 작게 박혀서, 사장님 지적대로 "AI로 대충 만든 티"가
 * 났습니다. 이제 shortsStudio가 **피사체 위치로 진짜 잘라내고**, 위에 훅 두 줄,
 * 아래에 댓글 카드를 붙입니다(이지컷 화면 분석 결과).
 */
async function cutOne(srcPath, moment, destPath, opts = {}) {
  return shortsStudio.renderShort(srcPath, moment, destPath, opts);
}

/**
 * 유튜브 주소 하나로 쇼츠 여러 개.
 *
 * ⚠️ 본인 영상만 넣으세요. 남의 영상을 자르면 채널이 위험합니다.
 */
async function fromYoutube(url, { count = 10, topic = "", channel = "", theme = "light", subtitles = true } = {}) {
  const jobId = crypto.randomUUID().slice(0, 8);
  const workDir = path.join(os.tmpdir(), "l2s-" + jobId);
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  try {
    const { cues, download } = await fetchYoutube(url, workDir);
    const moments = await pickMoments(cues, { count, topic });
    if (!moments.length) throw new Error("자를 만한 구간을 찾지 못했습니다.");

    const src = await download();

    const shorts = [];
    for (let i = 0; i < moments.length; i++) {
      const name = `short-${jobId}-${i + 1}.mp4`;
      const dest = path.join(OUT_DIR, name);
      try {
        await cutOne(src, moments[i], dest, { cues, channel, theme, subtitles });
        const size = fs.statSync(dest).size;
        shorts.push({
          ...moments[i],
          fileName: name,
          publicPath: `/renders/${name}`,
          seconds: Math.round(moments[i].end - moments[i].start),
          sizeMb: +(size / 1048576).toFixed(1),
        });
      } catch (e) {
        // ⚠️ 하나가 실패해도 나머지는 살립니다.
        shorts.push({ ...moments[i], failed: e.message.slice(0, 160) });
      }
    }
    return { jobId, total: cues[cues.length - 1].end, shorts };
  } finally {
    // 원본은 큽니다. 무료 서버 디스크가 금방 찹니다.
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { fromYoutube, pickMoments, parseVtt, cutOne, OUT_DIR };
