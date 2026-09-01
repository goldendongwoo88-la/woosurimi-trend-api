/**
 * 블로그 원고 한 번에 끝내기 — 2026-09-02
 *
 *   node scripts/blog-finish.js <블로그ID> [원고ID]
 *   예) node scripts/blog-finish.js rlaehddn88
 *
 * 사장님이 "rlaehddn88 원고 작업 완성해놔" 하시면 이것만 돌리면 됩니다.
 *   ① 그 블로그 갈래의 최신 원고를 고른다 (원고ID를 주면 그걸로)
 *   ② 사진을 모은다 — **공식 인스타그램 사진만 자동으로 넣습니다**
 *   ③ 네이버에 붙여넣고 임시저장까지
 *
 * ── 왜 인스타 사진만 자동인가 ──
 * 기사 사진은 관련기사 썸네일이 섞여 **얼굴이 다른 사람**이 들어갑니다(실측 3회, 건물 조감도까지).
 * 공식 인스타는 **본인이 올린 것**이라 사람이 틀릴 수가 없습니다. 그래서 이것만 자동으로 넣습니다.
 * 기사 사진까지 쓰시려면 고르는 화면에서 직접 고르십시오:
 *   http://localhost:8485/photo-picker.html?postId=<원고ID>
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.**
 */

const path = require("path");
const { execFileSync, execFile } = require("child_process");

const REPO = path.join(__dirname, "..");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [blogId, argPostId] = args;
const withArticles = process.argv.includes("--기사사진");   // 기사 사진까지 넣고 싶을 때만

if (!blogId) {
  console.log("사용: node scripts/blog-finish.js <블로그ID> [원고ID] [--기사사진]");
  console.log("예:   node scripts/blog-finish.js rlaehddn88");
  process.exit(1);
}

/** 블로그별 갈래 — 그 블로그에 맞는 원고만 고릅니다. */
const MODE_OF = {
  man_is_best: ["beauty", "fashion"],
  rlaehddn88: ["gossip", "broadcast", "beauty", "fashion"],
  irlaehddni: ["economy"],
};

const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function floor(p, body) {
  const r = await fetch(FLOOR + p, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}

(async () => {
  // 0) 편집국이 떠 있어야 합니다
  try { if (!(await floor("/api/health"))?.ok) throw new Error(); }
  catch {
    console.error(`편집국(${FLOOR})이 안 떠 있습니다. golden-blog-floor에서 node server.js 를 켜주세요.`);
    process.exit(1);
  }

  // 1) 원고 고르기
  let postId = argPostId;
  if (!postId) {
    const list = (await floor("/api/posts"))?.posts || [];
    const modes = MODE_OF[blogId] || null;
    const cand = list
      .filter((p) => !modes || modes.includes(p.mode))
      .filter((p) => p.pubStatus !== "발행됨")
      .sort((a, b) => b.ts - a.ts)[0];
    if (!cand) { console.error(`${blogId}에 넣을 원고가 없습니다.`); process.exit(1); }
    postId = cand.id;
    say(`원고: "${String(cand.title || "").slice(0, 40)}" (${cand.mode})`);
  }

  const pj = await floor("/api/posts/" + encodeURIComponent(postId));
  if (!pj?.post?.body) { console.error("원고를 못 찾았습니다:", postId); process.exit(1); }
  say(`글자 ${pj.post.body.replace(/\s/g, "").length.toLocaleString()}자`);

  // 2) 사진 — 인스타만 자동. 기사 사진은 --기사사진 을 줄 때만.
  say("사진 모으는 중…");
  const cand = await floor(`/api/photos/candidates?postId=${encodeURIComponent(postId)}`);
  if (cand?.ok) {
    const all = cand.photos || [];
    const insta = all.filter((p) => p.kind === "instagram");
    const chosen = withArticles ? all : insta;
    if (chosen.length) {
      await floor("/api/photos/choose", { postId, photos: chosen });
      const src = withArticles ? "기사+인스타" : "공식 인스타";
      say(`  사진 ${chosen.length}장 (${src})`);
      if (!withArticles && all.length > insta.length) {
        say(`  기사 사진 ${all.length - insta.length}장은 안 넣었습니다 — 얼굴이 다른 사람이 섞입니다.`);
        say(`  쓰시려면: ${FLOOR}/photo-picker.html?postId=${postId}`);
      }
    } else {
      say(`  사진 0장 — ${cand.instagram ? "인스타에서 못 받았습니다" : "공식 인스타 계정을 못 찾았습니다"}`);
    }
  } else {
    say(`  사진 수집 실패: ${cand?.error || "이유 불명"}`);
  }

  // 3) 네이버 임시저장
  say("네이버에 넣는 중… (크롬이 잠깐 떴다가 닫힙니다)");
  // 그 프로필로 열린 크롬이 있으면 잠겨서 못 씁니다. 먼저 정리합니다.
  try {
    execFileSync("powershell", ["-NoProfile", "-Command",
      // ⚠️ 곱게 닫습니다 — 강제 종료하면 쿠키를 못 써서 네이버 로그인이 풀립니다(실측 2026-09-02).
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*naver_${blogId}*' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $null = $p.CloseMainWindow(); Start-Sleep -Milliseconds 1500; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } }`],
      { stdio: "ignore", timeout: 30000 });
    await sleep(2500);
  } catch {}

  const script = path.join(REPO, "scripts", "naver-draft.js");
  await new Promise((resolve) => {
    const child = execFile(process.execPath, [script, blogId, postId],
      { cwd: REPO, timeout: 300000, encoding: "utf8" }, () => resolve());
    child.stdout?.on("data", (d) => {
      // 중요한 줄만 보여줍니다. 진단 로그까지 다 흘리면 뭐가 됐는지 안 보입니다.
      String(d).split("\n").forEach((l) => {
        if (/들어간 것|저장|✔|실패|로그인이 안|팝업/.test(l)) say("  " + l.trim());
      });
    });
  });

  say(`\n확인: https://blog.naver.com/${blogId}/postwrite`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
