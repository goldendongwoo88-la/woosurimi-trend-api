/**
 * 원고 일괄 임시저장 — 2026-09-02
 *
 *   node scripts/blog-batch.js <블로그ID> [개수]
 *   예) node scripts/blog-batch.js irlaehddni 10
 *
 * 그 블로그 갈래의 원고를 최신순으로 골라 **사진까지 넣어 임시저장**합니다.
 * 하나 끝날 때마다 결과를 찍습니다 — 무엇이 되고 무엇이 안 됐는지 나중에 사장님이 볼 수 있게.
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.**
 * ⚠️ 이미 임시저장한 원고는 `data/done-<블로그ID>.json`에 적어두고 **다시 안 올립니다**
 *    (같은 글이 여러 건 쌓이면 사장님이 손으로 지워야 합니다).
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const REPO = path.join(__dirname, "..");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";

const blogId = process.argv[2];
const want = Number(process.argv[3] || 10);
if (!blogId) { console.log("사용: node scripts/blog-batch.js <블로그ID> [개수]"); process.exit(1); }

/** 블로그별 갈래 — 그 블로그에 맞는 원고만 고릅니다. */
const MODE_OF = {
  man_is_best: ["beauty", "fashion"],
  rlaehddn88: ["gossip", "broadcast", "beauty", "fashion"],
  irlaehddni: ["economy"],
};

const DONE = path.join(REPO, "data", `done-${blogId}.json`);
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDone() {
  try { return new Set(JSON.parse(fs.readFileSync(DONE, "utf8"))); } catch { return new Set(); }
}
function saveDone(set) {
  try {
    fs.mkdirSync(path.dirname(DONE), { recursive: true });
    fs.writeFileSync(DONE, JSON.stringify([...set], null, 1), "utf8");
  } catch {}
}

async function floor(p, body) {
  const r = await fetch(FLOOR + p, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}

/** 원고 하나를 처리합니다. 무엇이 됐는지 돌려줍니다. */
function runOne(postId) {
  return new Promise((resolve) => {
    const out = [];
    const child = execFile(process.execPath, [path.join(REPO, "scripts", "naver-draft.js"), blogId, postId],
      { cwd: REPO, timeout: 480000, encoding: "utf8" }, () => {
        const text = out.join("");
        const photos = /네이버가 가진 사진 (\d+)장/.exec(text);
        const wide = /옆트임 (\d+)장/.exec(text);
        const titleOk = /저장 목록 확인:/.test(text) && !/제목 없음/.test(text);
        resolve({
          ok: /임시저장까지 끝났습니다/.test(text),
          photos: photos ? Number(photos[1]) : 0,
          wide: wide ? Number(wide[1]) : 0,
          titleOk,
        });
      });
    child.stdout?.on("data", (d) => out.push(String(d)));
    child.stderr?.on("data", (d) => out.push(String(d)));
  });
}

(async () => {
  try { if (!(await floor("/api/health"))?.ok) throw new Error(); }
  catch { console.error(`편집국(${FLOOR})이 안 떠 있습니다.`); process.exit(1); }

  const done = loadDone();
  const list = (await floor("/api/posts"))?.posts || [];
  const modes = MODE_OF[blogId] || null;
  const cand = list
    .filter((p) => !modes || modes.includes(p.mode))
    .filter((p) => p.pubStatus !== "발행됨")
    .filter((p) => !done.has(p.id))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, want);

  if (!cand.length) { say(`${blogId}: 아직 안 올린 원고가 없습니다.`); return; }
  say(`${blogId} — 원고 ${cand.length}개를 임시저장합니다 (요청 ${want}개)\n`);

  let good = 0;
  for (const [i, p] of cand.entries()) {
    const head = `${String(i + 1).padStart(2)}/${cand.length}  ${String(p.title || "").slice(0, 34)}`;
    say(head);

    /**
     * 사진이 아직 없으면 **여기서 먼저 모읍니다.**
     * naver-draft는 원고에 붙어 있는 사진만 올립니다. 예전에는 사진 붙이는 일을 blog-finish만
     * 했기 때문에, 일괄로 돌리면 **사진 0장짜리 초안**이 그대로 저장됐습니다(실측: 경제 원고 전부).
     *   · 연예인 글 → 기사 사진 + 공식 인스타
     *   · 인물이 없는 글(경제·시사) → 자유 라이선스 사진(위키미디어 공용)
     */
    const full = await floor("/api/posts/" + encodeURIComponent(p.id)).catch(() => null);
    if (!(full?.post?.photos || []).length) {
      const c = await floor(`/api/photos/candidates?postId=${encodeURIComponent(p.id)}`).catch(() => null);
      const all = c?.ok ? (c.photos || []) : [];
      // 연예인 글은 얼굴이 틀리면 안 되므로 공식 인스타만. 인물 없는 글은 자유 라이선스 사진 전부.
      const pick = c?.celeb === null ? all : all.filter((x) => x.kind === "instagram");
      if (pick.length) {
        await floor("/api/photos/choose", { postId: p.id, photos: pick }).catch(() => {});
        say(`        사진 ${pick.length}장 모음 (${c?.celeb === null ? "자유 라이선스" : "공식 인스타"})`);
      } else {
        say(`        사진 못 구했습니다 — ${c?.error || "후보 없음"}`);
      }
    }

    const r = await runOne(p.id);
    if (r.ok) {
      good++;
      done.add(p.id);
      saveDone(done);
      say(`        ✔ 사진 ${r.photos}장(옆트임 ${r.wide}) · 제목 ${r.titleOk ? "OK" : "⚠ 안 들어감"}`);
    } else {
      say("        ✗ 실패 — 다음 원고로 넘어갑니다");
    }
    // 네이버가 빠른 연속 저장을 싫어합니다("임시저장 목록을 불러오지 못했습니다"). 사이를 둡니다.
    await sleep(8000);
  }
  say(`\n${blogId}: ${good}/${cand.length}건 임시저장 완료. 발행은 사장님이 직접 하십시오.`);
  say(`확인: https://blog.naver.com/${blogId}/postwrite`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
