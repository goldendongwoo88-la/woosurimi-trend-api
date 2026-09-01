/**
 * 네이버 임시저장 — 백그라운드 방식 (2026-09-01)
 *
 *   node scripts/naver-draft-bg.js <블로그ID> <원고ID>
 *   예) node scripts/naver-draft-bg.js rlaehddn88 wmti9pxv4
 *
 * ── 사장님 일을 방해하지 않습니다 ──
 * 앞선 방식(naver-draft.js)은 두 번 실패했습니다:
 *   1. 퍼펫티어로 붙이기 → 그 도구가 chrome.debugger 자리를 차지해 **확장의 붙여넣기가 막혔습니다.**
 *   2. 운영체제 키보드로 우회 → 크롬 창을 앞으로 불러야 해서, **사장님이 이메일 쓰시던 창에
 *      원고가 붙는 사고**가 났습니다. 남의 작업을 가로채는 방식은 자동화로 쓰면 안 됩니다.
 *
 * 그래서 여기서는 **아무것도 조작하지 않습니다.**
 *   · 편집국에 "이 원고를 무인으로 넣어라"고 표시만 남깁니다
 *   · 크롬을 **최소화 상태로** 띄웁니다 (포커스를 안 뺏습니다)
 *   · 나머지는 확장이 자기 안에서 합니다 — 몇 주 동안 다듬어진 그 코드입니다
 *   · 결과는 확장이 편집국에 알려주고, 여기서는 그걸 기다릴 뿐입니다
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.**
 */

const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const EXTENSION = path.join(REPO, "extension");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [blogId, postId] = args;
const keepOpen = process.argv.includes("--keep");

if (!blogId || !postId) {
  console.log("사용: node scripts/naver-draft-bg.js <블로그ID> <원고ID> [--keep]");
  process.exit(1);
}

const profileDir = `C:\\dev\\profiles\\naver_${blogId}`;
if (!fs.existsSync(profileDir)) {
  console.error(`프로필이 없습니다: ${profileDir}`);
  console.error(`바탕화면 '네이버-${blogId}' 바로가기로 한 번 로그인해 두셔야 합니다.`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(m);

/** 크롬 실행 파일 찾기. 없으면 여기서 멈추는 게 낫습니다. */
function findChrome() {
  const cands = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  return cands.find((p) => fs.existsSync(p)) || null;
}

/** 이 프로필로 떠 있는 크롬이 있는지 — 있으면 프로필이 잠겨 새로 못 띄웁니다. */
function chromePidsForProfile() {
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-Command",
      `(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*naver_${blogId}*' }).ProcessId`],
      { encoding: "utf8", timeout: 20000 });
    return out.split(/\s+/).map((x) => Number(x)).filter(Boolean);
  } catch { return []; }
}

async function floor(pathname, body) {
  const r = await fetch(FLOOR + pathname, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error("크롬을 못 찾았습니다."); process.exit(1); }

  // 0) 편집국이 떠 있어야 합니다 — 확장이 거기서 원고를 받아갑니다.
  try {
    const h = await floor("/api/health");
    if (!h?.ok) throw new Error("응답 이상");
  } catch {
    console.error(`편집국(${FLOOR})이 안 떠 있습니다. 먼저 켜주세요:`);
    console.error("  node server.js  (golden-blog-floor 폴더에서)");
    process.exit(1);
  }

  // 1) 원고 확인
  const pj = await floor("/api/posts/" + encodeURIComponent(postId)).catch(() => null);
  if (!pj?.post?.body) { console.error("원고를 못 찾았습니다:", postId); process.exit(1); }
  say(`원고: "${String(pj.post.title || "").slice(0, 40)}" (${pj.post.body.replace(/\s/g, "").length.toLocaleString()}자)`);

  // 2) 무인 표시 남기기 — 확장이 이걸 보고 스스로 붙입니다
  const set = await floor("/api/last-copied", { id: postId, auto: true });
  if (!set?.ok) { console.error("무인 표시 실패"); process.exit(1); }
  say("무인 표시 남김 — 확장이 받아갑니다");

  // 3) 크롬을 최소화로 띄웁니다. 포커스를 안 뺏습니다.
  const already = chromePidsForProfile();
  if (already.length) {
    say(`이미 이 프로필로 크롬이 떠 있습니다(${already.length}개). 그 창에서 확장이 처리합니다.`);
    say("→ 글쓰기 화면이 아니면 처리가 안 됩니다. 안 되면 그 창을 닫고 다시 실행하세요.");
  }
  let child = null;
  if (!already.length) {
    child = spawn(chrome, [
      `--user-data-dir=${profileDir}`,
      `--load-extension=${EXTENSION}`,
      "--no-first-run", "--no-default-browser-check",
      "--hide-crash-restore-bubble", "--disable-session-crashed-bubble",
      "--window-size=1280,900",
      /**
       * ⚠️ 화면 밖(-32000)으로 밀면 크롬이 그 창을 **절전 처리**해서 확장 타이머가 거의 안 돕니다
       * (실측: 3분 기다려도 확장이 아무 반응이 없었습니다).
       * 그래서 화면 안에 두되 **오른쪽 아래 구석**으로 보냅니다. 작업 화면을 거의 안 가립니다.
       * --hidden 을 주면 화면 밖으로 밀지만, 그때는 확장이 안 돌 수 있습니다.
       */
      ...(process.argv.includes("--hidden")
        ? ["--window-position=-32000,-32000"]
        : ["--window-position=1200,700"]),
      `https://blog.naver.com/${blogId}?Redirect=Write`,
    ], { detached: true, stdio: "ignore" });
    child.unref();
    say("크롬을 화면 밖에서 띄웠습니다 (사장님 화면을 안 가립니다)");
  }

  // 4) 확장이 끝냈다고 알려줄 때까지 기다립니다.
  say("확장이 붙여넣는 중… (최대 3분)");
  let result = null;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const r = await floor("/api/auto-result").catch(() => null);
    if (r?.result && r.result.postId === postId) { result = r.result; break; }
    if (i % 10 === 9) say(`      기다리는 중… ${(i + 1) * 2}초`);
  }

  if (!result) {
    say("\n시간 안에 결과가 안 왔습니다.");
    say("확인할 것: ① 네이버 로그인이 살아 있는지 ② '작성 중인 글' 팝업이 떠 있는지");
    say(`창을 보시려면: node scripts/naver-draft.js ${blogId} ${postId} --show`);
  } else if (result.ok) {
    say("\n✔ 붙여넣기 성공. 확장이 제목·소제목까지 정리했습니다.");
    say(`   확인: https://blog.naver.com/${blogId}/postwrite`);
  } else {
    say(`\n✗ 실패: ${result.why || "이유 불명"}`);
  }

  // 5) 우리가 띄운 창만 닫습니다. 사장님이 열어둔 창은 안 건드립니다.
  if (child && !keepOpen) {
    try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
    say("띄웠던 창을 닫았습니다.");
  }
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
