/**
 * 유튜브 답글 초안 — 내 영상에 달린 댓글에 한국어로 답할 말을 만든다.
 *
 *   node scripts/youtube-reply.js @woosoorimi
 *   node scripts/youtube-reply.js @woosoorimi --영상 5 --댓글 20
 *   node scripts/youtube-reply.js https://youtu.be/xxxx
 *
 * ── 무엇을 하고 무엇을 안 하나 ──
 *   한다   : 내 영상의 댓글을 읽고, 그 댓글에만 맞는 답글을 한국어로 만든다.
 *   안 한다: 게시. CSV 로 내주고 사장님이 보고 올리신다.
 *            그리고 **남의 영상에는 아무것도 안 한다.** 내 채널 것만 읽는다.
 *
 * ── 왜 초안까지만인가 ──
 *   게시하려면 OAuth 가 필요하고(API 키로는 못 쓴다), 무엇보다 답글은 한 줄이라도
 *   사람이 손대는 편이 낫다. 기계가 단 티가 나면 안 다느니만 못하다.
 *
 * ── AI ──
 *   로컬 llama-server + Qwen3-32B 를 쓴다. 비용 0원.
 *   안 떠 있으면 댓글 수집까지만 하고 초안 칸은 비워 둔다.
 *     D:/AI/llama/llama-server.exe -m D:/AI/llm/Qwen3-32B-Q4_K_M.gguf --port 8080 -ngl 0 -c 4096
 */

const path = require("path");
const fs = require("fs");

const REPO = path.join(__dirname, "..");
try { process.loadEnvFile(path.join(REPO, ".env")); } catch { /* 없어도 됨 */ }

const KEY = process.env.YOUTUBE_API_KEY;
const LLM = process.env.LLM_URL || "http://127.0.0.1:8080";
const OUT = path.join(REPO, "out", "유튜브답글");

const args = process.argv.slice(2);
const 대상 = args.find((a) => !a.startsWith("--"));
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const num = (f, d) => { const v = val(f); return v ? Number(v) : d; };

if (!대상) {
  console.log([
    "유튜브 답글 초안 — 내 영상 댓글에 한국어로 답할 말을 만든다",
    "",
    "  node scripts/youtube-reply.js @woosoorimi",
    "  node scripts/youtube-reply.js @woosoorimi --영상 5 --댓글 20",
    "  node scripts/youtube-reply.js https://youtu.be/영상아이디",
    "",
    "옵션",
    "  --영상 5     최근 몇 편을 볼지 (기본 5)",
    "  --댓글 20    영상당 몇 개까지 (기본 20)",
    "  --말투 친근  친근 · 담백 · 감사 (기본 친근)",
    "  --출력 파일.csv",
    "",
    "게시는 사장님이 하십니다. 이 도구는 초안만 냅니다.",
  ].join("\n"));
  process.exit(0);
}
if (!KEY) { console.error("✖ .env 에 YOUTUBE_API_KEY 가 없습니다."); process.exit(1); }

let 마지막 = 0;
async function 쉬기(ms = 250) {
  const w = 마지막 + ms - Date.now();
  if (w > 0) await new Promise((r) => setTimeout(r, w));
  마지막 = Date.now();
}

async function api(경로, 파라미터) {
  await 쉬기();
  const u = new URL(`https://www.googleapis.com/youtube/v3/${경로}`);
  for (const [k, v] of Object.entries({ ...파라미터, key: KEY })) u.searchParams.set(k, v);
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${경로} ${r.status} ${t.slice(0, 120)}`);
  }
  return r.json();
}

// ── 내 채널의 최근 영상 ──────────────────────────────────────────
async function 최근영상(핸들, 개수) {
  // 핸들(@xxx)로 채널을 찾고, 업로드 재생목록에서 최근 것을 가져온다.
  const ch = await api("channels", {
    part: "contentDetails,snippet",
    ...(핸들.startsWith("@") ? { forHandle: 핸들 } : { id: 핸들 }),
  });
  const item = (ch.items || [])[0];
  if (!item) throw new Error(`채널을 못 찾았습니다: ${핸들}`);
  const 업로드 = item.contentDetails.relatedPlaylists.uploads;
  const pl = await api("playlistItems", { part: "snippet", playlistId: 업로드, maxResults: Math.min(개수, 50) });
  return {
    채널: item.snippet.title,
    영상: (pl.items || []).map((v) => ({ id: v.snippet.resourceId.videoId, 제목: v.snippet.title })),
  };
}

// ── 댓글 ──────────────────────────────────────────────────────────
// 답글이 이미 달린 건 뺀다. 이미 답한 데 또 다는 게 제일 볼썽사납다.
async function 댓글(videoId, 개수, 채널명) {
  let out = [];
  try {
    const r = await api("commentThreads", {
      part: "snippet,replies", videoId, maxResults: Math.min(개수, 100), order: "time", textFormat: "plainText",
    });
    for (const t of r.items || []) {
      if ((t.snippet.totalReplyCount || 0) > 0) continue;      // 이미 답글 있음
      const c = t.snippet.topLevelComment.snippet;
      // 내가 단 댓글(고정댓글 등)에 내가 답하지 않는다. 실측에서 실제로 그랬다.
      if (c.authorChannelId?.value === t.snippet.channelId) continue;
      if (채널명 && c.authorDisplayName === 채널명) continue;
      out.push({
        댓글id: t.snippet.topLevelComment.id,
        작성자: c.authorDisplayName,
        본문: String(c.textDisplay || "").replace(/\s+/g, " ").trim(),
        좋아요: c.likeCount || 0,
        날짜: (c.publishedAt || "").slice(0, 10),
      });
    }
  } catch (e) {
    // 댓글을 끈 영상이 있다. 통째로 멈추지 않고 넘어간다.
    if (!/disabled|403/.test(e.message)) console.warn(`\n  [${videoId}] ${e.message.slice(0, 60)}`);
  }
  return out;
}

// ── 답글 초안 (로컬 LLM) ─────────────────────────────────────────
const 말투표 = {
  친근: '반말 아닌 친근한 존댓말. "~네요", "~더라고요" 를 쓴다',
  담백: "담백한 존댓말. 감탄사를 아끼고 짧게",
  감사: "고마움을 먼저 말하는 존댓말",
};

function 프롬프트(영상제목, 댓글본문, 말투, 채널명) {
  const 한글 = /[가-힣]/.test(댓글본문);
  return [
    `너는 유튜브 채널 "${채널명}" 의 주인이고, 이 영상을 직접 만든 사람이다.`,
    "댓글에 답글 한 개를 쓴다.",
    "",
    "규칙",
    "- **네가 만든 영상이다.** \"나도 해보고 싶다\", \"저도 사고 싶네요\" 처럼 남 일처럼 말하지 않는다.",
    "  이미 써 보고 찍은 사람의 말투로 쓴다.",
    "- 댓글에 나온 **사람 이름·아이 이름·제품명은 글자 그대로 옮긴다.** 비슷한 말로 바꾸지 않는다.",
    한글
      ? "- 한국어로 답한다."
      : "- 이 댓글은 한국어가 아니다. **댓글과 같은 언어로 짧게 답한다.** 한국어로 답하지 않는다.",
    "- 30~60자. 한 문장에서 두 문장.",
    `- ${말투표[말투] || 말투표.친근}`,
    "- 그 댓글에만 해당되는 말을 한다. 댓글에 나온 것을 하나 집어서 답한다.",
    '- "감사합니다", "시청해주셔서 감사합니다" 만 쓰지 않는다. 아무 댓글에나 붙는 말이다.',
    "- 이모티콘은 최대 1개. 링크·홍보는 넣지 않는다.",
    "- 질문 댓글이면 반드시 답을 한다. 모르면 모른다고 하고 알아보겠다고 한다.",
    "- 답글 본문만 출력한다. 따옴표나 설명을 붙이지 않는다.",
    "/no_think",
    "",
    `영상 제목: ${영상제목}`,
    `댓글: ${댓글본문.slice(0, 400)}`,
  ].join("\n");
}

async function 초안(영상제목, 댓글본문, 말투, 채널명) {
  try {
    const r = await fetch(`${LLM}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: 프롬프트(영상제목, 댓글본문, 말투, 채널명) }],
        chat_template_kwargs: { enable_thinking: false },
        temperature: 0.8, max_tokens: 200, stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const m = d?.choices?.[0]?.message || {};
    let t = m.content || "";
    if (!t.trim() && m.reasoning_content) t = m.reasoning_content;
    t = t.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/<\/?think>/g, "").trim();
    return t.split("\n").filter(Boolean).pop()?.replace(/^["'「『]|["'」』]$/g, "").trim() || null;
  } catch { return null; }
}

async function 살아있나() {
  try { return (await fetch(`${LLM}/v1/models`, { signal: AbortSignal.timeout(2500) })).ok; }
  catch { return false; }
}

// ── 저장 ──────────────────────────────────────────────────────────
const BOM = String.fromCharCode(0xFEFF);
function saveCsv(rows, file) {
  const head = ["영상제목", "영상주소", "작성자", "댓글", "좋아요", "날짜", "답글초안"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = rows.map((r) => [
    r.영상제목, `https://youtu.be/${r.영상id}`, r.작성자, r.본문, r.좋아요, r.날짜, r.답글 || "",
  ].map(esc).join(","));
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, BOM + [head.join(","), ...body].join("\r\n"), "utf8");
  return file;
}

// ── 실행 ──────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const 말투 = val("--말투") || "친근";

  let 영상들, 채널명;
  const 단일 = 대상.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
  if (단일) {
    const v = await api("videos", { part: "snippet", id: 단일[1] });
    const it = (v.items || [])[0];
    if (!it) throw new Error("영상을 못 찾았습니다.");
    채널명 = it.snippet.channelTitle;
    영상들 = [{ id: 단일[1], 제목: it.snippet.title }];
  } else {
    const r = await 최근영상(대상, num("--영상", 5));
    채널명 = r.채널; 영상들 = r.영상;
  }

  console.log(`${채널명} · 영상 ${영상들.length}편\n`);
  const LLM있나 = await 살아있나();
  if (!LLM있나) {
    console.log(`⚠ 로컬 LLM 이 안 떠 있습니다 (${LLM}). 댓글만 모으고 초안은 비워 둡니다.`);
    console.log(`  띄우려면: D:/AI/llama/llama-server.exe -m D:/AI/llm/Qwen3-32B-Q4_K_M.gguf --port 8080 -ngl 0 -c 4096\n`);
  }

  const rows = [];
  for (let i = 0; i < 영상들.length; i++) {
    const v = 영상들[i];
    process.stdout.write(`\r  댓글 수집 ${i + 1}/${영상들.length} · ${v.제목.slice(0, 26)}                    `);
    for (const c of await 댓글(v.id, num("--댓글", 20), 채널명)) {
      rows.push({ 영상id: v.id, 영상제목: v.제목, ...c });
    }
  }
  console.log(`\n  답글 안 단 댓글 ${rows.length}개\n`);

  if (LLM있나 && rows.length) {
    for (let i = 0; i < rows.length; i++) {
      process.stdout.write(`\r  초안 ${i + 1}/${rows.length}                    `);
      rows[i].답글 = await 초안(rows[i].영상제목, rows[i].본문, 말투, 채널명);
    }
    console.log("");
  }

  const out = val("--출력") || path.join(OUT, `답글초안-${new Date().toISOString().slice(0, 10)}.csv`);
  saveCsv(rows, out);

  console.log(`\n초안 ${rows.filter((r) => r.답글).length}개 / 댓글 ${rows.length}개`);
  for (const r of rows.slice(0, 5)) {
    console.log(`\n  [${r.작성자}] ${r.본문.slice(0, 60)}`);
    console.log(`   → ${r.답글 || "(초안 없음)"}`);
  }
  console.log(`\n엑셀: ${out}`);
  console.log("\n초안은 그대로 올리지 마시고 한 줄이라도 손보십시오. 기계가 단 티가 나면 안 다느니만 못합니다.");
})().catch((e) => { console.error("\n✖ 실패:", e.message); process.exit(1); });
