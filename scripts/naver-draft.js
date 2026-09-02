/**
 * 네이버 블로그 임시저장 자동화 — 2026-09-01
 *
 *   node scripts/naver-draft.js <블로그ID> <원고ID> [--show]
 *   예) node scripts/naver-draft.js rlaehddn88 wmti9pxv4
 *
 * ── 왜 이렇게 만들었나 ──
 * 사람이 하던 순서를 그대로 흉내 냅니다:
 *   ① 편집국(localhost:8485)에서 "통합 복사" 누르기 → 클립보드에 제목+본문+사진이 담김
 *   ② 네이버 글쓰기 열고 본문에 **진짜 Ctrl+V**
 *   ③ 저장(임시저장) 누르기
 *
 * 왜 코드로 직접 넣지 않고 클립보드를 거치는가:
 *   스마트에디터는 DOM에 글자를 넣어도 **내부 모델은 빈 채**로 둡니다.
 *   그러면 화면에는 보이는데 저장하면 사라집니다(2026-08-31에 실제로 겪은 사고).
 *   붙여넣기는 편집기가 스스로 처리하는 정상 경로라 모델까지 채워집니다.
 *
 * 사장님 크롬 프로필(C:\dev\profiles\naver_*)을 그대로 씁니다.
 *   · 이미 로그인돼 있어 다시 로그인할 필요가 없습니다
 *   · 우수리미 확장도 같이 떠서, 붙여넣은 뒤 제목·소제목 정리를 확장이 해 줍니다
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.** 사장님 방침입니다.
 *
 * ── 되는 것 (2026-09-01 확인, 2회 연속 재현) ──
 *   로그인 확인 → 원고 담기 → 글쓰기 열기 → 팝업 닫기 → 본문 붙여넣기 → 임시저장
 *   실측: 본문 1,177자 · 제목 정상 · 임시저장 목록 증가 확인
 *
 * ── 오래 막혔던 두 가지와 답 ──
 *   1. **"작성 중인 글이 있습니다" 팝업**이 편집기를 덮고 있으면 아무것도 안 들어갑니다.
 *      클립보드가 멀쩡해도 본문은 자리표시 문구(31자)만 남습니다. 사라질 때까지 '취소'를 누릅니다.
 *   2. **커서가 본문에 있어야 합니다.** 이 편집기는 contenteditable이 제목 하나뿐이라,
 *      요소를 찾아서 붙이면 언제나 제목으로 갑니다.
 *      게다가 확장 버튼을 누르는 순간 커서가 본문에서 빠져나갑니다 —
 *      그래서 **붙여넣기 직전에 본문을 다시 클릭**하고, 커서가 있는 자리에 paste를 던집니다.
 *
 * ⚠️ 운영체제 키보드(SendKeys)는 기본으로 꺼져 있습니다(--focus 로만 켜짐).
 *    그 방식은 크롬 창을 앞으로 불러내서, 사장님이 이메일 쓰시던 창에 원고가 붙는 사고를 냈습니다.
 *    지금은 필요 없습니다.
 *
 * ── 편집기 DOM 실측 (2026-09-01) ──
 * 네이버 글쓰기 프레임(PostWriteForm.naver)의 실제 구조는 이렇습니다:
 *   .se-main-container = **0개** (없습니다)   .se-content = 1
 *   .se-text-paragraph = 2 (제목 1 + 본문 1)  .se-documentTitle = 1
 *   [contenteditable] = 1
 * 확장 코드가 쓰는 `.se-main-container`를 그대로 가져다 썼다가 **모든 선택자가 헛돌았습니다.**
 * 여기서는 `.se-content`를 함께 봅니다. 본문 문단은 `.se-documentTitle` 안에 있는 것을 뺀 나머지입니다.
 */

const path = require("path");
const fs = require("fs");

const REPO = path.join(__dirname, "..");
const PUPPETEER = path.join(REPO, "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";
const EXTENSION = path.join(REPO, "extension");

const args = process.argv.slice(2);
const blogId = args.find((a) => !a.startsWith("--"));
const postId = args.filter((a) => !a.startsWith("--"))[1];
const show = args.includes("--show");
/**
 * 화면 포커스를 빼앗는 붙여넣기를 허용할지. **기본은 끔.**
 * 켜면 크롬 창을 앞으로 불러 키를 보내는데, 그 순간 사장님이 다른 창에서 타자를 치고 계시면
 * 그 창에 원고가 들어갑니다. 실제로 이메일 작성 중에 붙어버린 적이 있습니다.
 */
const allowFocus = args.includes("--focus");        // 창을 보면서 확인하고 싶을 때

if (!blogId || !postId) {
  console.log("사용: node scripts/naver-draft.js <블로그ID> <원고ID> [--show]");
  console.log("예:   node scripts/naver-draft.js rlaehddn88 wmti9pxv4");
  process.exit(1);
}

const profileDir = `C:\\dev\\profiles\\naver_${blogId}`;
if (!fs.existsSync(profileDir)) {
  console.error(`프로필이 없습니다: ${profileDir}`);
  console.error("바탕화면의 '네이버-<아이디>' 바로가기로 한 번 로그인해 두셔야 합니다.");
  process.exit(1);
}
// 크롬이 그 프로필로 열려 있으면 잠겨서 못 씁니다. 미리 알려줍니다.
if (fs.existsSync(path.join(profileDir, "SingletonLock"))) {
  console.error(`프로필이 잠겨 있습니다 — '네이버-${blogId}' 크롬 창을 닫고 다시 실행하세요.`);
  process.exit(1);
}

const { execFileSync } = require("child_process");
const os = require("os");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 윈도우 클립보드에 **서식째** 담습니다.
 *
 * 왜 브라우저 클립보드를 안 쓰나: 브라우저가 담은 것은 CDP로 보낸 Ctrl+V에서만 쓰이는데,
 * 그 키를 스마트에디터가 안 받았습니다. 운영체제 클립보드 + 진짜 키를 써야 사람이 한 것과 같아집니다.
 * .NET DataObject에 Html 형식으로 넣으면 CF_HTML 머리말을 알아서 붙여줍니다.
 */
function setWindowsClipboard(html, plain) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wsdraft-"));
  const hf = path.join(dir, "body.html");
  const pf = path.join(dir, "body.txt");
  const sf = path.join(dir, "set.ps1");
  fs.writeFileSync(hf, html, "utf8");
  fs.writeFileSync(pf, plain, "utf8");
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    `$html = [System.IO.File]::ReadAllText('${hf}', [System.Text.Encoding]::UTF8)`,
    `$plain = [System.IO.File]::ReadAllText('${pf}', [System.Text.Encoding]::UTF8)`,
    "$dobj = New-Object System.Windows.Forms.DataObject",
    "$dobj.SetData([System.Windows.Forms.DataFormats]::Html, $html)",
    "$dobj.SetData([System.Windows.Forms.DataFormats]::UnicodeText, $plain)",
    "[System.Windows.Forms.Clipboard]::SetDataObject($dobj, $true)",
    "Start-Sleep -Milliseconds 500",
    "Write-Output ('ok:' + [System.Windows.Forms.Clipboard]::ContainsData([System.Windows.Forms.DataFormats]::Html))",
  ].join(String.fromCharCode(13) + String.fromCharCode(10));
  fs.writeFileSync(sf, String.fromCharCode(0xFEFF) + ps, "utf8");   // BOM이 없으면 PowerShell이 한글을 깨뜨립니다
  const out = execFileSync("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", sf],
    { encoding: "utf8", timeout: 30000 });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return /ok:True/i.test(out);
}

/** 크롬 창을 앞으로 가져오고 **진짜 Ctrl+V**를 보냅니다. */
function osPaste(pid) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wspaste-"));
  const sf = path.join(dir, "paste.ps1");
  const ps = [
    "Add-Type -AssemblyName Microsoft.VisualBasic",
    "Add-Type -AssemblyName System.Windows.Forms",
    `try { [Microsoft.VisualBasic.Interaction]::AppActivate(${pid}) } catch {}`,
    "Start-Sleep -Milliseconds 900",
    "[System.Windows.Forms.SendKeys]::SendWait('^v')",
    "Start-Sleep -Milliseconds 500",
    "Write-Output 'sent'",
  ].join(String.fromCharCode(13) + String.fromCharCode(10));
  fs.writeFileSync(sf, String.fromCharCode(0xFEFF) + ps, "utf8");   // BOM이 없으면 PowerShell이 한글을 깨뜨립니다
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", sf],
      { encoding: "utf8", timeout: 30000 });
    return /sent/.test(out);
  } catch { return false; } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}
/**
 * 클립보드 백업/복원.
 *
 * ⚠️ 왜 필요한가 (2026-09-02, 두 번 난 사고)
 * 네이버 제목 칸은 **진짜 붙여넣기만** 받습니다. 그래서 확장이 제목을 넣을 때 클립보드를 씁니다.
 * 그러면 사장님이 다른 창에서 Ctrl+V 할 때 원고 제목이 튀어나옵니다 —
 * 실제로 이메일 본문과 포토샵 저장 파일명에 원고가 들어갔습니다.
 * 고칠 곳은 확장이 아니라 여기입니다: **시작 전에 백업하고, 끝나면 되돌려 놓습니다.**
 */
function readClipboard() {
  try {
    return execFileSync("powershell", ["-NoProfile", "-STA", "-Command", "Get-Clipboard -Raw"],
      { encoding: "utf8", timeout: 15000 });
  } catch { return null; }
}
function writeClipboard(text) {
  if (text == null) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wsclip-"));
  try {
    const tf = path.join(dir, "clip.txt");
    const sf = path.join(dir, "set.ps1");
    fs.writeFileSync(tf, text, "utf8");
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$t = [System.IO.File]::ReadAllText('" + tf + "', [System.Text.Encoding]::UTF8)",
      "if ($t.Length -gt 0) { [System.Windows.Forms.Clipboard]::SetText($t) } else { [System.Windows.Forms.Clipboard]::Clear() }",
    ].join(String.fromCharCode(13) + String.fromCharCode(10));
    fs.writeFileSync(sf, String.fromCharCode(0xFEFF) + ps, "utf8");
    execFileSync("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", sf],
      { stdio: "ignore", timeout: 20000 });
  } catch {} finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

/**
 * ── 사진을 **진짜로 올립니다** ──
 *
 * ⚠️ 왜 바꿨나 (2026-09-02 사장님 지적: "라이브러리에는 사진이 안나와")
 * 예전에는 원고 HTML에 `<img src="남의 주소">`를 넣어 붙여넣었습니다. 화면에는 보였지만
 * 네이버가 그 사진을 **가진 게 아니라 남의 주소를 빌려 쓰는 것**이라,
 *   · 사진 라이브러리에 안 나옵니다 → 사장님이 사진을 고치거나 뺄 수가 없습니다
 *   · 대표사진 지정도 안 됩니다
 *   · 원본 쪽에서 주소가 바뀌면 나중에 사진이 통째로 깨집니다
 * 그래서 파일로 내려받아 **에디터 사진 버튼으로 업로드**합니다.
 * 업로드된 사진은 주소가 blogfiles.pstatic.net 으로 바뀝니다 — 그게 "네이버가 가진 사진"이라는 표시입니다.
 */
const UA_IMG = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const PHOTO_MARK = (i) => `⟦사진${i}⟧`;
/**
 * ⚠️ **네이버가 ⟦⟧ 를 [] 로 바꿔버립니다** (2026-09-03 실측).
 *    붙여넣으면 화면에는 `[사진3]` 으로 나옵니다. 그래서 ⟦⟧ 만 찾으면
 *    자리를 하나도 못 찾고 사진이 **글 맨 끝에 몰립니다.**
 *    찾을 때는 두 모양을 다 봅니다.
 */
const PHOTO_MARK_ALT = (i) => `[사진${i}]`;
const PHOTO_MARK_RE = /[⟦\[]사진(\d+)[⟧\]]/;
const PHOTO_MARK_RE_G = /[⟦\[]사진\d+[⟧\]]/g;

/** 사진을 임시 폴더로 내려받습니다. 못 받은 자리는 null로 둡니다(자리는 유지). */
async function downloadPhotos(photos, say) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wsu-photos-"));
  const files = [];
  let small = 0;
  for (const [i, ph] of photos.entries()) {
    try {
      /**
       * 카드뉴스처럼 **이미 이 컴퓨터에 있는 그림**은 내려받지 않고 그대로 씁니다.
       * (photo.file 이 있으면 그게 파일 경로입니다)
       */
      if (ph.file && fs.existsSync(ph.file)) {
        const f = path.join(dir, `p${String(i).padStart(2, "0")}${path.extname(ph.file) || ".png"}`);
        fs.copyFileSync(ph.file, f);
        files.push(f);
        continue;
      }
      const r = await fetch(ph.url, { headers: { "User-Agent": UA_IMG, Referer: "https://www.instagram.com/" } });
      if (!r.ok) { files.push(null); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      // 3KB 미만은 사진이 아니라 오류 이미지이거나 아주 작은 섬네일입니다. 올리지 않습니다.
      if (buf.length < 3000) { files.push(null); small++; continue; }
      const f = path.join(dir, `p${String(i).padStart(2, "0")}.jpg`);
      fs.writeFileSync(f, buf);
      files.push(f);
    } catch { files.push(null); }
  }
  const got = files.filter(Boolean).length;
  say(`      사진 ${got}/${photos.length}장 내려받음${small ? ` (너무 작아서 뺌 ${small}장)` : ""}`);
  return { dir, files };
}

module.exports = module.exports || {};

const say = (m) => console.log(m);

let clipBackup = null;
const restoreClip = () => { try { writeClipboard(clipBackup); } catch {} };

(async () => {
  // 사장님이 쓰시던 클립보드를 지키려고 먼저 백업합니다.
  clipBackup = readClipboard();
  process.on("exit", restoreClip);

  say(`[1/6] 크롬 여는 중 (프로필: naver_${blogId})`);
  const browser = await puppeteer.launch({
    /**
     * 창 없이 돕니다 — 사장님 화면을 전혀 건드리지 않습니다.
     *
     * 한때 운영체제 키보드를 쓰려고 창을 띄웠는데, 그 방식은 **사장님이 쓰시던 이메일 창에
     * 원고가 붙는 사고**를 냈습니다. 알고 보니 키보드가 필요 없었습니다 —
     * "작성 중인 글이 있습니다" 팝업만 닫으면 합성 붙여넣기로 본문·사진이 다 들어갑니다.
     * (--show 를 주면 창을 볼 수 있습니다. 문제를 눈으로 확인할 때만 쓰십시오.)
     */
    /**
     * ⚠️ 창 없이(헤드리스) 돌리면 **붙여넣기가 제목 칸으로 들어갑니다**(실측).
     * 헤드리스에서는 편집기가 문단을 다르게 그리는 것으로 보입니다.
     * 그래서 창을 띄우되 **화면 오른쪽 아래 구석**으로 보냅니다 — 작업 화면을 거의 안 가립니다.
     * 포커스는 안 뺏습니다(운영체제 키보드는 기본으로 꺼져 있습니다).
     */
    headless: false,
    userDataDir: profileDir,
    defaultViewport: null,
    args: [
      `--load-extension=${EXTENSION}`,
      `--disable-extensions-except=${EXTENSION}`,
      "--disable-blink-features=AutomationControlled",
      "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble",
      /**
       * 창 크기.
       * ⚠️ 700x420으로 작게 두었더니 **사진을 눌러도 안 골라졌습니다**(실측: "고른 사진 0개").
       * 사진 도구막대가 뜰 자리가 없어서입니다. 그래서 옆트임이 한 장도 안 먹혔습니다.
       * 화면을 가리지 않으려고 작게 했던 건데, 안 되는 것보다는 낫습니다.
       * 위치는 여전히 오른쪽 아래 구석입니다.
       */
      `--window-size=${process.env.WSU_WIN || "1100,900"}`,
      /**
       * ⚠️ **화면 밖(-2400)으로 보내면 안 됩니다.**
       * 크롬이 보이지 않는 창을 절전 처리해서 페이지가 아예 안 뜹니다
       * (실측: navigation timeout 60초). 헤드리스도 붙여넣기가 제목으로 가서 못 씁니다.
       * 그래서 **작게 만들어 오른쪽 아래 구석**에 둡니다. 완전히 안 보이게는 못 합니다.
       */
      "--window-position=1250,720",
      "--lang=ko-KR,ko",
    ],
  });

  try {
    const page = await browser.newPage();

    /**
     * 클립보드 권한.
     * ⚠️ 실측: origin을 문자열로 넘겼더니 "Write permission denied"가 났습니다.
     * 실제 페이지 origin과 정확히 같아야 하고, sanitized-write까지 줘야 합니다.
     * 그래도 안 되면 아래에서 옛 방식(execCommand)으로 넘어갑니다.
     */
    const ctx = browser.defaultBrowserContext();
    const grant = async (origin) => {
      for (const set of [["clipboard-read", "clipboard-write", "clipboard-sanitized-write"], ["clipboard-read", "clipboard-write"]]) {
        try { await ctx.overridePermissions(origin, set); return true; } catch {}
      }
      return false;
    };
    await grant(new URL(FLOOR).origin);
    await grant("https://blog.naver.com");

    /**
     * ── 로그인부터 확인합니다 ──
     * ⚠️ 실측(2026-09-01): 로그인이 안 된 채로 돌렸더니 원고를 클립보드에 담고 사진까지 챙긴 다음에야
     * 로그인 화면에서 막혔습니다. 헛수고인 데다 왜 실패했는지도 한참 뒤에 나옵니다.
     * **제일 먼저** 봅니다. 안 되면 여기서 끝냅니다.
     */
    say("[0/6] 로그인 확인");
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(4000);
    if (/nidlogin/.test(page.url())) {
      console.error(`
${blogId} 로그인이 안 돼 있습니다.
`);
      console.error("이렇게 해주세요:");
      console.error(`  1. 바탕화면 '네이버-${blogId}' 바로가기 실행 (다른 크롬 창 말고 이 바로가기)`);
      console.error("  2. 로그인 — '로그인 상태 유지' 체크");
      console.error(`  3. naver.com에서 우측 상단이 ${blogId} 인지 확인`);
      console.error("  4. 5초쯤 기다렸다가 창 닫기 (바로 닫으면 쿠키가 저장 전에 날아갑니다)");
      if (!show) await browser.close();
      process.exit(1);
    }
    say("      로그인 확인됨");

    // ── 2) 편집국에서 통합 복사 ──
    say("[2/6] 편집국에서 원고 담는 중");
    await page.goto(`${FLOOR}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    /**
     * ⚠️ 클립보드는 **문서가 포커스돼 있을 때만** 쓸 수 있습니다.
     * 이걸 안 하면 "Document is not focused"로 통합복사가 실패합니다(실측).
     * 탭을 앞으로 가져오고 본문을 한 번 눌러 포커스를 확실히 줍니다.
     */
    await page.bringToFront();
    await sleep(800);
    try { await page.mouse.click(300, 300); } catch {}
    await sleep(600);

    const copied = await page.evaluate(async (id) => {
      // 화면의 "통합 복사" 버튼과 같은 일을 합니다 — 그 함수를 그대로 부릅니다.
      if (typeof loadPost === "function") { try { await loadPost(id); } catch {} }
      if (typeof work === "object" && work) work.id = id;
      const r = await fetch("/api/posts/" + id).then((x) => x.json()).catch(() => null);
      if (!r?.post) return { ok: false, why: "원고를 못 찾았습니다: " + id };
      if (typeof work === "object" && work) {
        work.id = r.post.id; work.title = r.post.title; work.body = r.post.body; work.mode = r.post.mode;
        const area = document.getElementById("draftArea");
        if (area) area.value = r.post.body;
      }
      /**
       * 클립보드에도 담고, **HTML을 그대로 돌려받기도** 합니다.
       * OS 클립보드가 편집기까지 안 닿는 경우가 있어서(실측), 붙여넣기를 직접 만들 재료가 필요합니다.
       */
      const photosArr = Array.isArray(r.post.photos) ? r.post.photos : [];
      let htmlOut = "";
      try {
        if (typeof buildNaverHtml === "function") htmlOut = buildNaverHtml(r.post.body, r.post.title, photosArr, r.post.resultTable || null);
      } catch {}
      /**
       * ⚠️ **클립보드를 건드리지 않습니다.** (2026-09-02 사고)
       * 통합복사는 시스템 클립보드에 원고를 씁니다. 그러면 사장님이 다른 창에서 Ctrl+V 할 때
       * **원고가 튀어나옵니다.** 실제로 사장님 작업 중에 그 일이 났습니다.
       * 지금은 HTML을 직접 넘겨 붙이므로 클립보드가 필요 없습니다. 그래서 안 씁니다.
       */
      if (htmlOut) {
        return { ok: true, how: "HTML 직접", title: r.post.title, photos: photosArr.length, photosArr, html: htmlOut, body: r.post.body };
      }
      if (typeof copyCombined !== "function") return { ok: false, why: "본문 HTML을 못 만들었습니다" };
      try {
        await copyCombined();
        return { ok: true, how: "clipboard API", title: r.post.title, photos: photosArr.length, photosArr, html: htmlOut, body: r.post.body };
      } catch (e) {
        /**
         * ⚠️ 최신 클립보드 API가 막히는 환경이 있습니다(권한·포커스).
         * 그때는 **옛 방식**으로 담습니다 — copy 이벤트를 가로채 서식째 넣는 방법입니다.
         * 권한을 안 물어보고, 서식(text/html)도 그대로 실립니다.
         */
        const photos = Array.isArray(r.post.photos) ? r.post.photos : [];
        const html = (typeof buildNaverHtml === "function")
          ? buildNaverHtml(r.post.body, r.post.title, photos, r.post.resultTable || null) : "";
        if (!html) return { ok: false, why: "클립보드 실패 + 본문 HTML도 못 만들었습니다: " + e.message };
        const titleHtml = `<p data-wsu-title="1" data-wsu-post="1">${r.post.title}</p>`;
        const NL = String.fromCharCode(10);
        const plain = r.post.title + NL + NL + r.post.body;
        const onCopy = (ev) => {
          ev.clipboardData.setData("text/html", titleHtml + html);
          ev.clipboardData.setData("text/plain", plain);
          ev.preventDefault();
        };
        document.addEventListener("copy", onCopy);
        // 선택 영역이 없으면 execCommand('copy')가 무시됩니다. 임시로 하나 만듭니다.
        const tmp = document.createElement("div");
        tmp.textContent = "x";
        tmp.style.cssText = "position:fixed;left:-9999px;top:0";
        document.body.appendChild(tmp);
        const range = document.createRange();
        range.selectNodeContents(tmp);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        const okOld = document.execCommand("copy");
        sel.removeAllRanges(); tmp.remove();
        document.removeEventListener("copy", onCopy);
        if (!okOld) return { ok: false, why: "클립보드에 담지 못했습니다: " + e.message };
        return { ok: true, how: "execCommand(옛 방식)", title: r.post.title, photos: photos.length, photosArr: photos, html: htmlOut, body: r.post.body };
      }
    }, postId);

    if (!copied.ok) { console.error("실패:", copied.why); await browser.close(); process.exit(1); }
    say(`      "${copied.title.slice(0, 34)}" · 사진 ${copied.photos}장 · ${copied.how}`);

    // ── 3) 글쓰기 열기 ──
    say("[3/6] 네이버 글쓰기 여는 중");
    /**
     * networkidle2는 **너무 까다롭습니다.** 네이버 페이지는 광고·추적 요청이 계속 떠서
     * "조용해지는 순간"이 안 옵니다(실측: 60초 초과로 실패).
     * 글이 그려졌는지만 보면 충분하므로 domcontentloaded로 바꾸고, 대신 조금 더 기다립니다.
     */
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(3000);
    await sleep(4000);

    // 스마트에디터는 iframe 안에 있습니다. 없으면 페이지 자체가 편집기입니다.
    const frame = page.frames().find((f) => /PostWriteForm|editor/i.test(f.url())) || page.mainFrame();

    /**
     * ⚠️ **"작성 중인 글이 있습니다" 팝업을 반드시 닫아야 합니다.**
     *
     * 이게 본문이 안 들어가던 진짜 원인이었습니다. 팝업이 편집기를 덮고 있으면
     * 클립보드가 멀쩡하고 Ctrl+V가 제대로 가도 글자가 본문에 안 꽂힙니다.
     * (실측: 클립보드에는 원고 전체가 담겨 있었는데 본문은 31자 — 자리표시 문구뿐이었습니다)
     *
     * 한 번 눌러보고 마는 게 아니라 **사라질 때까지 확인**합니다. 팝업은 편집기가 다 뜬 뒤에
     * 나타나기도 해서, 너무 일찍 누르면 헛손질이 됩니다.
     * '취소'를 누릅니다 — '확인'을 누르면 지난 초안을 이어받아 우리 원고와 섞입니다.
     */
    let popupGone = false;
    for (let n = 1; n <= 10 && !popupGone; n++) {
      let found = false;
      for (const f of page.frames()) {
        const r = await f.evaluate(() => {
          const visible = (el) => {
            const b = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return b.width > 0 && b.height > 0 && st.visibility !== "hidden" && st.display !== "none";
          };
          const hasPopup = /작성 중인 글이 있습니다|작성중이던 글|이어서 작성/.test(document.body?.innerText || "");
          if (!hasPopup) return { popup: false };
          const cancel = [...document.querySelectorAll("button, a")].filter(visible)
            .find((b) => /^\s*취소\s*$/.test(b.textContent || ""));
          if (cancel) { cancel.click(); return { popup: true, clicked: true }; }
          return { popup: true, clicked: false };
        }).catch(() => ({ popup: false }));
        if (r.popup) { found = true; if (r.clicked) say(`      '작성 중인 글' 팝업 닫음`); }
      }
      if (!found) { popupGone = true; break; }
      await sleep(1200);
    }
    if (!popupGone) say("      ⚠ 팝업이 안 닫혔습니다 — 붙여넣기가 막힐 수 있습니다");
    await sleep(1200);

    /**
     * 편집기 찾기. 스마트에디터가 어느 프레임에 있는지는 그때그때 다릅니다.
     * **한 프레임만 보고 없다고 단정하면 안 됩니다** — 프레임을 전부 훑습니다.
     */
    let editor = null;
    for (let tryN = 1; tryN <= 6 && !editor; tryN++) {
      for (const f of page.frames()) {
        /**
         * ⚠️ .se-main-container 하나만 보면 놓칩니다.
         * 실측: 편집기 프레임(PostWriteForm.naver)이 분명히 떠 있는데도 못 찾았습니다.
         * 편집기가 뜨는 데 시간이 걸리고, 뼈대가 먼저 그려진 뒤 본문 칸이 나중에 붙습니다.
         * 그래서 여러 선택자로 보고, 몇 초 간격으로 다시 봅니다.
         */
        const has = await f.evaluate(() => Boolean(
          document.querySelector(".se-main-container, .se-content") ||
          document.querySelector(".se-content") ||
          document.querySelector(".se-component.se-text") ||
          document.querySelector(".se-documentTitle")
        )).catch(() => false);
        if (has) { editor = f; break; }
      }
      if (!editor) { say(`      편집기 기다리는 중… (${tryN}/6)`); await sleep(3000); }
    }
    if (!editor) {
      // 왜 없는지 알아야 고칩니다. 화면 상태를 그대로 찍습니다.
      say("      편집기를 못 찾았습니다. 지금 화면 상태:");
      say(`      URL: ${page.url().slice(0, 90)}`);
      say(`      제목: ${await page.title()}`);
      for (const f of page.frames()) {
        const info = await f.evaluate(() => ({
          txt: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 70),
          login: /로그인|아이디|비밀번호/.test(document.body?.innerText || ""),
        })).catch(() => null);
        if (info) say(`      · ${f.url().slice(0, 58)} ${info.login ? "[로그인 화면]" : ""} | ${info.txt}`);
      }
      if (!show) await browser.close();
      process.exit(1);
    }
    /**
     * ⚠️ 프레임은 중간에 **교체됩니다.**
     * 확장 버튼을 누르거나 편집기가 다시 그려지면 잡아둔 프레임이 죽고
     * "Attempted to use detached Frame" 으로 통째로 실패합니다(실측).
     * 그래서 쓸 때마다 살아 있는지 보고, 죽었으면 다시 찾습니다.
     */
    let frameE = editor;
    const liveFrame = async () => {
      const alive = frameE ? await frameE.evaluate(() => true).catch(() => false) : false;
      if (alive) return frameE;
      for (const f of page.frames()) {
        const has = await f.evaluate(() => Boolean(
          document.querySelector(".se-main-container, .se-content") || document.querySelector(".se-documentTitle")
        )).catch(() => false);
        if (has) { frameE = f; return frameE; }
      }
      return frameE;
    };

    // ── 4) 본문 칸 클릭 후 진짜 Ctrl+V ──
    /**
     * ⚠️ **제목을 본문보다 먼저 넣습니다.**
     * 편집기가 막 열렸을 때는 커서가 제목 칸에 있어서, 그때 치면 편집기 모델에 정상으로 실립니다.
     * 본문을 먼저 붙여넣으면 커서가 본문으로 내려가 있어, 제목 칸을 다시 눌러도 절반쯤 빗나갔습니다
     * (실측 2026-09-02: 화면에는 제목이 보이는데 저장 목록에는 "제목 없음"으로 들어갔습니다).
     * applyTitle은 함수 선언(호이스팅)이라 아래에서 정의해도 여기서 부를 수 있습니다.
     */
    await applyTitle();

    say("[4/6] 본문에 붙여넣는 중");
    /**
     * ⚠️ 프레임 안의 좌표로 page.mouse.click을 하면 엉뚱한 곳을 누릅니다.
     * getBoundingClientRect는 **iframe 기준** 좌표인데 page.mouse는 **페이지 기준**이라
     * iframe이 화면 중간에 있으면 그만큼 어긋납니다(실측: 아무 데도 안 들어갔습니다).
     * 요소를 직접 잡아 클릭하면 퍼펫티어가 프레임 위치를 알아서 더해줍니다.
     */
    const handle = await frameE.evaluateHandle(() => {
      /**
       * ⚠️ 본문 문단 고르기 — `.se-documentTitle` 안에 있는지로 거르면 **안 됩니다.**
       * 실측: 제목 문단이 .se-documentTitle의 자손이 아니라서 필터를 그냥 통과했고,
       * 그 결과 **제목 칸에 본문이 통째로 붙었습니다.**
       * 이 편집기는 문단이 2개(제목·본문)뿐이고 **본문이 항상 마지막**입니다. 그걸로 고릅니다.
       */
      const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
      const pickBody = (list) => (list.length ? list[list.length - 1] : null);
      const paras = [...document.querySelectorAll(".se-text-paragraph")]
        .filter((n) => !inTitle(n));
      return pickBody(paras)
        || [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n))[0]
        || document.querySelector(".se-main-container, .se-content")
        || document.body;
    });
    const target = handle.asElement();
    if (!target) { console.error("본문 자리를 못 찾았습니다."); if (!show) await browser.close(); process.exit(1); }
    await target.click({ delay: 60 }).catch(async () => {
      // 가려져 있으면 클릭이 막힙니다. 그때는 포커스만 줍니다.
      await frameE.evaluate(() => {
        const el = document.querySelector("[contenteditable='true']") ||
                   document.querySelector(".se-main-container, .se-content");
        el?.focus?.();
      });
    });
    await sleep(900);

    /**
     * ⓪-1 **운영체제 클립보드 + 진짜 Ctrl+V** — 이게 주 경로입니다.
     *
     * 앞서 실패한 것들: 브라우저 클립보드 + CDP 키(0자), 합성 paste 이벤트(무시됨),
     * CDP Input.insertText(안 들어감), 확장의 붙여넣기(퍼펫티어가 debugger를 점유해 막힘).
     * 남은 길은 **사람이 하는 것과 물리적으로 같은 입력**입니다.
     * 윈도우 클립보드에 서식째 담고, 크롬 창을 앞으로 불러 SendKeys로 Ctrl+V를 보냅니다.
     */
    // 커서가 어디에 있는지 먼저 봅니다. 붙여넣기는 커서가 본문에 있어야 들어갑니다.
    const focusInfo = await frameE.evaluate(() => {
      const a = document.activeElement;
      if (!a) return "없음";
      const cls = (a.className || "").toString().slice(0, 40);
      const inTitle = Boolean(a.closest?.(".se-documentTitle"));
      const sel = window.getSelection();
      return `${a.tagName}.${cls} | 제목안=${inTitle} | 선택=${sel?.rangeCount || 0}`;
    }).catch(() => "확인실패");
    say(`      커서 위치: ${focusInfo}`);

    /**
     * ⚠️⚠️ **기본으로 끕니다.** (2026-09-01 사고)
     * 이 방식은 크롬 창을 **앞으로 불러내고** 키를 보냅니다. 그런데 사장님이 그때 다른 창에서
     * 일하고 계시면 **그 창이 키를 받습니다.** 실제로 사장님 이메일 작성 창에 원고가 붙었습니다.
     * 남의 작업을 가로채는 방식은 자동화로 쓰면 안 됩니다.
     * 정말 필요할 때만 --focus 를 직접 주십시오. 그때는 다른 일을 멈추고 지켜보셔야 합니다.
     */
    let osOk = false;
    if (copied.html && allowFocus) {
      try {
        const put = setWindowsClipboard(copied.html, copied.body || "");
        say(`      윈도우 클립보드에 담기 ${put ? "성공" : "실패"}`);
        if (put) {
          const pid = browser.process()?.pid;
          osOk = pid ? osPaste(pid) : false;
          say(`      진짜 Ctrl+V ${osOk ? "보냄" : "실패"}`);
          if (osOk) await sleep(copied.photos ? 22000 : 7000);
        }
      } catch (e) { say(`      OS 붙여넣기 실패: ${e.message.slice(0, 60)}`); }
    }

    /**
     * ⓪ **확장의 "원고 붙이기" 버튼을 먼저 누릅니다.**
     * 이 버튼 뒤의 코드는 몇 주 동안 실제 사고를 겪으며 다듬어진 것입니다 —
     * 제목이 편집기 모델까지 들어가게 하는 순서, 소제목 전환, 서식, 사진 자리까지 전부 처리합니다.
     * 여기서 다시 만들면 그 사고를 처음부터 다시 겪게 됩니다.
     * 편집국이 /api/last-copied로 원고를 이미 넘겨놨으므로 버튼만 누르면 됩니다.
     */
    /**
     * ⚠️ **확장의 '원고 붙이기' 버튼은 누르지 않습니다.** (2026-09-02)
     * 그 버튼을 누르면 편집기가 다시 그려지면서 **프레임이 죽고**,
     * 이후 모든 작업이 "detached Frame"으로 통째로 실패합니다(실측 2회).
     * 게다가 필요도 없습니다 — 본문이 채워지면 확장이 알아서 제목·소제목을 정리합니다.
     */
    const byExtension = false;
    // 확장 블록을 지우면서 같이 사라진 값입니다. 여기서는 늘 0(아직 아무것도 안 들어감)입니다.
    const already = 0;

    /**
     * ⚠️ 본문이 어느 프레임에 있는지 확정할 수 없습니다.
     * 실측: PostWriteForm 프레임에 문단이 2개(제목+본문)뿐인데 본문이 31자에 머물렀고,
     * about:blank 프레임에도 편집 가능한 영역이 하나 더 있었습니다.
     * 짐작으로 하나를 고르지 말고 **편집 가능한 곳마다 넣어보고, 들어간 곳을 씁니다.**
     */
    /**
     * ⚠️ 잴 때마다 **살아 있는 프레임을 다시 잡습니다.**
     * 붙여넣기가 일어나면 편집기가 다시 그려지면서 잡아둔 프레임이 죽습니다.
     * 그걸 그대로 쓰면 "detached Frame"으로 통째로 실패합니다(실측 3회).
     */
    /**
     * 프레임에서 코드를 돌립니다. **끊기면 다시 잡아 한 번 더** 해봅니다.
     * 붙여넣기·클릭 때마다 편집기가 다시 그려져 프레임이 죽는데,
     * 그때마다 개별로 막으려니 계속 새 자리에서 터졌습니다(실측 3회). 여기 한 곳에서 처리합니다.
     */
    const evalIn = async (fn, ...a) => {
      try { return await (await liveFrame()).evaluate(fn, ...a); }
      catch (e) {
        if (!/detached|Execution context/i.test(String(e.message))) throw e;
        frameE = null;                       // 강제로 다시 찾게 합니다
        await sleep(1200);
        try { return await (await liveFrame()).evaluate(fn, ...a); } catch { return null; }
      }
    };

    const measure = async () => (await evalIn(() => {
      const root = document.querySelector(".se-main-container, .se-content") || document.body;
      const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
    })) || 0;

    if ((await measure()) < 200) {
      /**
       * ⚠️ **붙여넣기 직전에 본문을 다시 클릭합니다.**
       * 앞에서 확장 버튼을 누르는 동안 커서가 본문에서 빠져나갑니다.
       * 커서가 없으면 붙여넣기가 제목으로 가거나 아무 데도 안 들어갑니다.
       */
      try {
        const h2 = await (await liveFrame()).evaluateHandle(() => {
          const inTitle = (n) => Boolean(n.closest?.(".se-documentTitle"));
          const paras = [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n));
          return paras.length ? paras[paras.length - 1] : document.querySelector(".se-content");
        });
        const el2 = h2.asElement();
        if (el2) { await el2.click({ delay: 60 }); await sleep(700); }
        const where = await evalIn(() => {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return "커서 없음";
          let n = sel.getRangeAt(0).startContainer;
          if (n.nodeType === 3) n = n.parentElement;
          return (n?.closest?.(".se-documentTitle") ? "제목" : "본문");
        }).catch(() => "확인실패");
        say(`      커서 다시 세움 → ${where}`);
      } catch {}

      for (const f of page.frames()) {
        const ok = await f.evaluate((html, plain) => {
          /**
       * ⚠️ 본문 문단 고르기 — `.se-documentTitle` 안에 있는지로 거르면 **안 됩니다.**
       * 실측: 제목 문단이 .se-documentTitle의 자손이 아니라서 필터를 그냥 통과했고,
       * 그 결과 **제목 칸에 본문이 통째로 붙었습니다.**
       * 이 편집기는 문단이 2개(제목·본문)뿐이고 **본문이 항상 마지막**입니다. 그걸로 고릅니다.
       */
          /**
           * ⚠️ **커서가 있는 자리에 넣습니다. 선택을 새로 만들지 않습니다.**
           *
           * 이 편집기는 contenteditable이 **제목 하나뿐**입니다(실측 editable=1).
           * 그래서 "편집 가능한 요소를 찾아서 넣는" 방식은 **언제나 제목**으로 갑니다.
           * 본문은 우리가 이미 클릭해서 커서를 세워둔 자리이므로, 그 커서를 건드리지 않고
           * **커서가 들어 있는 요소**에 paste 이벤트를 던집니다.
           * (한때 OS 키보드로만 됐던 이유가 이것입니다 — 키보드는 늘 커서 자리에 넣으니까요.)
           */
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return false;
          let node = sel.getRangeAt(0).startContainer;
          if (node.nodeType === 3) node = node.parentElement;
          if (!node) return false;
          if (node.closest && node.closest(".se-documentTitle")) return false;   // 제목이면 안 넣습니다

          const dt = new DataTransfer();
          dt.setData("text/html", html);
          dt.setData("text/plain", plain);
          node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          return true;
        }, copied.html || "", copied.body || "").catch(() => false);
        if (!ok) continue;
        await sleep(3500);
        const n2 = await measure();
        say(`      ${f.url().slice(0, 40)} 에 시도 → 본문 ${n2}자`);
        if (n2 >= 200) break;
      }
    }

    /**
     * ⚠️ 마지막 수단: CDP로 **글자를 직접 밀어넣기**.
     *
     * 왜 여기까지 오나: 확장은 chrome.debugger로 '진짜 붙여넣기'를 하는데,
     * 퍼펫티어가 이미 디버거 자리를 차지하고 있어서 확장이 그 경로를 못 씁니다(제목만 들어간 이유).
     * 합성 paste 이벤트도 스마트에디터가 무시했습니다.
     * Input.insertText는 사람이 타자 친 것과 같은 취급이라 편집기 모델까지 채워집니다.
     * 서식·사진은 안 실립니다 — 글자만 들어갑니다. 그래도 빈 초안보다 낫습니다.
     */
    if (already < 200 && (await measure()) < 200 && (copied.body || "").length > 200) {
      say("      CDP로 글자 직접 넣기 (서식 없이 본문만)");
      const focused = await frameE.evaluate(() => {
        /**
       * ⚠️ 본문 문단 고르기 — `.se-documentTitle` 안에 있는지로 거르면 **안 됩니다.**
       * 실측: 제목 문단이 .se-documentTitle의 자손이 아니라서 필터를 그냥 통과했고,
       * 그 결과 **제목 칸에 본문이 통째로 붙었습니다.**
       * 이 편집기는 문단이 2개(제목·본문)뿐이고 **본문이 항상 마지막**입니다. 그걸로 고릅니다.
       */
      const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
      const pickBody = (list) => (list.length ? list[list.length - 1] : null);
        const el = pickBody([...document.querySelectorAll("[contenteditable='true']")].filter((n) => !inTitle(n)))
          || pickBody([...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n)));
        if (!el) return false;
        el.focus?.();
        const r = document.createRange();
        r.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        return true;
      }).catch(() => false);
      if (focused) {
        const cdp = await page.createCDPSession();
        // 문단을 살리려면 줄바꿈마다 끊어 넣고 사이에 Enter를 보냅니다.
        const lines = String(copied.body || "").split(String.fromCharCode(10));
        for (const line of lines) {
          if (line.trim()) await cdp.send("Input.insertText", { text: line }).catch(() => {});
          await page.keyboard.press("Enter").catch(() => {});
        }
        await cdp.detach().catch(() => {});
        await sleep(2500);
        say(`      넣은 뒤 본문 ${(await measure()).toLocaleString()}자`);
      }
    }

    const alreadyIn = byExtension ? await frameE.evaluate(() => {
      const root = document.querySelector(".se-main-container, .se-content");
      const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
    }).catch(() => 0) : 0;

    /**
     * ⚠️ **다시 재고 나서 결정합니다.**
     * `already`는 프레임 순회 **전에** 잰 값이라, 순회에서 성공했어도 옛 숫자(31자)가 남아 있습니다.
     * 그걸로 판단하면 이미 들어간 글에 **한 번 더** 붙습니다 —
     * 실측: 사진 13장을 골랐는데 26장이 들어갔습니다.
     */
    const nowIn = await measure();
    const pasted = (nowIn >= 200 || already >= 200 || alreadyIn >= 200) ? true : await frameE.evaluate((html, plain) => {
      /**
       * ⚠️ 본문 문단 고르기 — `.se-documentTitle` 안에 있는지로 거르면 **안 됩니다.**
       * 실측: 제목 문단이 .se-documentTitle의 자손이 아니라서 필터를 그냥 통과했고,
       * 그 결과 **제목 칸에 본문이 통째로 붙었습니다.**
       * 이 편집기는 문단이 2개(제목·본문)뿐이고 **본문이 항상 마지막**입니다. 그걸로 고릅니다.
       */
      const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
      const pickBody = (list) => (list.length ? list[list.length - 1] : null);
      const el = pickBody([...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n)))
        || document.querySelector(".se-main-container, .se-content");
      if (!el) return false;
      const editable = el.closest('[contenteditable]') || el;
      editable.focus?.();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      const dt = new DataTransfer();
      dt.setData("text/html", html);
      dt.setData("text/plain", plain);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      return true;
    }, copied.html || "", (copied.body || "")).catch(() => false);
    say(`      합성 붙여넣기 ${pasted ? "보냄" : "실패"}`);
    await sleep(4000);

    // ② 그래도 안 들어갔으면 진짜 Ctrl+V로 한 번 더.
    const got = await frameE.evaluate(() => {
      const root = document.querySelector(".se-main-container, .se-content");
      const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
    }).catch(() => 0);
    if (got < 200 && nowIn < 200) {
      say("      안 들어갔습니다 — 진짜 Ctrl+V로 다시 시도");
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyV");
      await page.keyboard.up("Control");
    }

    // 붙여넣기가 자리를 잡을 때까지만 기다립니다. (사진은 아래에서 따로 올립니다)
    await sleep(6000);

    /**
     * ── 사진 업로드 ──
     * 본문에 남겨둔 표식(⟦사진0⟧ …)을 하나씩 찾아가서, 그 자리에 진짜 파일을 올립니다.
     * 다 올리면 표식 글자는 지웁니다.
     */
    const photosArr = copied.photosArr || [];
    let uploaded = 0;
    if (photosArr.length) {
      say(`[4.5/6] 사진 올리는 중 (${photosArr.length}장)`);
      const { dir, files } = await downloadPhotos(photosArr, say);
      const failed = new Set();
      /**
       * ⚠️ **본문이 든 프레임을 씁니다.** (2026-09-03)
       *    예전에는 PostWriteForm 을 먼저 잡았는데, 본문은 about:blank 프레임에
       *    들어가는 경우가 있습니다(위 626행 주석에 이미 적혀 있던 사실입니다).
       *    엉뚱한 프레임에서 ⟦사진N⟧ 을 찾으니 커서가 편집영역 밖에 서고,
       *    네이버는 사진을 **문서 맨 끝에 몰아넣습니다.**
       *    그래서 **표식이 실제로 있는 프레임**을 골라 씁니다.
       */
      const 표식있는프레임 = async () => {
        for (const f of page.frames()) {
          const 있나 = await f.evaluate(() =>
            /[⟦\[]사진\d+[⟧\]]/.test(document.body?.innerText || "")).catch(() => false);
          if (있나) return f;
        }
        return null;
      };
      let 본문프레임 = await 표식있는프레임();
      if (본문프레임) say(`      본문 프레임: ${본문프레임.url().slice(0, 46) || "about:blank"}`);
      const ed = () => 본문프레임
        || page.frames().find((f) => /PostWriteForm/.test(f.url())) || frameE;

      const imgCount = async () => (await ed().evaluate(
        () => document.querySelectorAll(".se-component.se-image").length).catch(() => 0));

      for (const [i, file] of files.entries()) {
        if (!file) { failed.add(i); continue; }
        const mark = PHOTO_MARK(i);
        const markAlt = PHOTO_MARK_ALT(i);
        // ① 표식 자리에 커서를 세웁니다.
        // 두 모양(⟦사진N⟧ · [사진N])을 다 찾습니다 — 네이버가 괄호를 바꿉니다.
        const put = await ed().evaluate((mks) => {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = w.nextNode())) {
            const v = n.nodeValue || "";
            let mk = null, at = -1;
            for (const cand of mks) { const i2 = v.indexOf(cand); if (i2 >= 0) { mk = cand; at = i2; break; } }
            if (at < 0) continue;
            const host = n.parentElement?.closest('[contenteditable]');
            host?.focus?.();
            const r = document.createRange();
            r.setStart(n, at + mk.length);
            r.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges(); sel.addRange(r);
            return true;
          }
          return false;
        }, [mark, markAlt]).catch(() => false);
        if (!put) { failed.add(i); say(`      ⚠ ${mark} 자리를 못 찾았습니다 — 건너뜁니다`); continue; }
        // 진단 — 커서가 실제로 어디에 섰는지, 사진이 그 자리에 들어가는지 봅니다.
        if (i === 0) {
          const 진단 = await ed().evaluate(() => {
            const sel = window.getSelection();
            const n = sel && sel.anchorNode;
            const p = n && (n.nodeType === 3 ? n.parentElement : n);
            return {
              커서있나: !!(sel && sel.rangeCount),
              커서주변: (n && n.nodeValue || "").slice(0, 40),
              부모: p ? p.tagName + "." + (p.className || "").slice(0, 30) : "없음",
              편집가능: !!(p && p.closest('[contenteditable]')),
              소제목후보: document.querySelectorAll("span[style*='38px']").length,
              문단수: document.querySelectorAll(".se-text-paragraph").length,
            };
          }).catch((e) => ({ 오류: String(e).slice(0, 60) }));
          say("      [진단] " + JSON.stringify(진단, null, 0));
        }

        // ② 사진 버튼을 눌러 파일 선택창을 띄우고 파일을 넘깁니다.
        const before = await imgCount();
        let chooser = null;
        const waitCh = page.waitForFileChooser({ timeout: 15000 }).then((c) => { chooser = c; }).catch(() => {});
        await ed().evaluate(() => {
          const b = [...document.querySelectorAll("button.se-image-toolbar-button")][0]
            || [...document.querySelectorAll("button")].find((n) => /사진/.test(n.textContent || ""));
          b?.click();
        }).catch(() => {});
        await waitCh;
        if (!chooser) { failed.add(i); say(`      ⚠ 파일 선택창이 안 떴습니다 (${i + 1}번째)`); continue; }
        await chooser.accept([file]);

        // ③ 올라갈 때까지 기다립니다 — 사진 수가 늘면 끝난 것입니다.
        let ok = false;
        for (let t = 0; t < 20; t++) {
          await sleep(1500);
          if ((await imgCount()) > before) { ok = true; break; }
        }
        if (ok) uploaded++;
        else { failed.add(i); say(`      ⚠ ${i + 1}번째 사진이 안 올라갔습니다`); }
      }

      /**
       * ④ 표식 정리.
       * 올라간 자리는 표식 **글자만** 지웁니다.
       * 못 올린 자리는 **출처 줄까지 통째로** 지웁니다 — 사진 없이 "▲ 사진 출처"만 남으면
       * 사진이 빠진 것처럼 보입니다(실측: 8장만 올라갔는데 출처는 12줄이 남았습니다).
       */
      const cleaned = await ed().evaluate((failedIdx) => {
        const bad = new Set(failedIdx);
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const hits = [];
        let n;
        while ((n = w.nextNode())) {
          const m = (n.nodeValue || "").match(/[⟦\[]사진(\d+)[⟧\]]/);
          if (m) hits.push({ node: n, idx: Number(m[1]) });
        }
        let removed = 0;
        for (const h of hits) {
          const para = h.node.parentElement?.closest("p, .se-text-paragraph");
          if (bad.has(h.idx) && para) {
            // 바로 다음 줄이 출처면 같이 지웁니다.
            const nx = para.nextElementSibling;
            if (nx && /^▲ 사진 출처/.test((nx.textContent || "").trim())) { nx.remove(); removed++; }
            para.remove();
            continue;
          }
          h.node.nodeValue = (h.node.nodeValue || "").replace(/[⟦\[]사진\d+[⟧\]]/g, "");
        }
        return removed;
      }, [...failed]).catch(() => 0);
      if (cleaned) say(`      못 올린 자리 출처줄 ${cleaned}줄 지웠습니다`);

      /**
       * ⑤ **옆트임** — 사진을 화면 폭에 꽉 차게 (사장님 지시 2026-09-02).
       * 사진을 진짜 마우스로 눌러야 편집기가 "고른 상태"로 인식하고 옆트임 단추가 나옵니다.
       * DOM의 click()으로는 안 됩니다(실측).
       */
      /**
       * ⚠️ 업로드 직후에는 사진 요소가 아직 안 잡힙니다.
       * 실측 2026-09-02: 10개 중 **1개만 옆트임이 되고 나머지는 0**이었습니다 —
       * 사진 목록을 한 번만 읽었는데 그때 비어 있어서 반복문이 아예 안 돌았습니다.
       * 나타날 때까지 기다렸다가 셉니다.
       */
      let wide = 0;
      let shotCount = 0;
      /**
       * ⚠️ `.se-component.se-image img` 로 세면 **0이 나오는 경우가 있습니다**
       * (실측: 사진 8장이 분명히 들어갔는데 옆트임 0장). 안쪽 <img>가 아직 안 그려진 것으로 보입니다.
       * 측정할 때 쓰는 것과 **같은 선택자**(바깥 껍데기)로 셉니다.
       */
      for (let t = 0; t < 12; t++) {
        shotCount = await ed().evaluate(() =>
          document.querySelectorAll(".se-component.se-image").length).catch(() => 0);
        if (shotCount >= uploaded && shotCount > 0) break;
        await sleep(1500);
      }
      if (!shotCount) say("      ⚠ 사진 요소를 못 찾아 옆트임을 건너뜁니다");
      let why = "";
      for (let k = 0; k < shotCount; k++) {
        try {
          /**
           * 사진을 고릅니다.
           * ⚠️ 요소 한가운데를 누르면 **사진 설명 칸**이나 떠 있는 도구막대에 눌려서
           * 사진이 안 골라집니다(실측: "고른 사진 0개"). 사진 **위쪽 1/4** 지점을 누릅니다.
           */
          const imgs = await ed().$$(".se-component.se-image");
          if (!imgs[k]) { why = "사진 손잡이 없음"; continue; }
          await imgs[k].scrollIntoView().catch(() => {});
          await sleep(400);
          /**
           * ⚠️ **좌표로 누르면 안 됩니다.**
           * page.mouse.click(x, y)는 iframe 안쪽 좌표를 못 맞춥니다. 편집기가 iframe 안에 있어서
           * 좌표가 그만큼 어긋나고, 클릭이 허공에 떨어져 사진이 안 골라집니다
           * (실측: irlaehddni에서 "고른 사진 0개"가 계속 나왔습니다).
           * elementHandle.click()은 퍼페티어가 프레임 오프셋을 알아서 계산합니다.
           * (man_is_best 담당 세션이 10/10 성공한 방식 — 그쪽에서 알려줬습니다)
           */
          await imgs[k].evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
          await sleep(350);
          await imgs[k].click({ delay: 50 });
          await sleep(900);
          if (k === 0 && process.argv.includes("--옆트임조사")) {
            const d = await ed().evaluate(() => {
              const c = document.querySelector(".se-component.se-image");
              const r = c?.getBoundingClientRect();
              return {
                cls: c?.className || "(없음)",
                box: r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "-",
                sel: document.querySelectorAll(".se-is-selected").length,
                selCls: [...document.querySelectorAll(".se-is-selected")].map((n) => String(n.className).slice(0, 40)).slice(0, 3),
                toolbars: [...document.querySelectorAll("[class*='toolbar']")]
                  .filter((n) => n.offsetParent !== null).map((n) => String(n.className).slice(0, 46)).slice(0, 6),
                imgSrc: (c?.querySelector("img")?.src || "").slice(0, 60),
              };
            }).catch((e) => ({ err: e.message.slice(0, 60) }));
            say("PROBE " + JSON.stringify(d));
          }
          const hit = await ed().evaluate(() => {
            const btns = [...document.querySelectorAll("button")];
            const b = btns.find((n) => /옆트임/.test(n.textContent || "") && n.offsetParent !== null);
            if (b) { b.click(); return "눌렀음"; }
            // 왜 못 찾았는지 남깁니다 — 숨어 있는지, 아예 없는지가 완전히 다른 문제입니다.
            const hidden = btns.filter((n) => /옆트임/.test(n.textContent || "")).length;
            if (hidden) return `단추가 숨어 있음(${hidden}개)`;
            const sel = document.querySelectorAll(".se-component.se-image.se-is-selected").length;
            const names = btns.filter((n) => n.offsetParent !== null)
              .map((n) => (n.textContent || "").trim().slice(0, 8)).filter(Boolean).slice(0, 12);
            return `단추 없음 (고른 사진 ${sel}개 · 보이는 단추: ${names.join("/")})`;
          });
          if (hit === "눌렀음") wide++;
          else why = hit;
          await sleep(500);
        } catch (e) { why = String(e.message).slice(0, 40); }
      }
      if (!wide && shotCount) say(`      ⚠ 옆트임 못 함 — ${why || "이유 불명"}`);
      say(`      올린 사진 ${uploaded}장 · 옆트임 ${wide}장`);

      /**
       * ── 소제목을 네이버 공식 스타일로 바꿉니다 ──
       *
       * 붙여넣기로는 19px 굵게까지밖에 안 됩니다. 네이버가 인정하는 "소제목"은
       * 서식 드롭다운에서 골라야 들어갑니다.
       *
       * ⚠️ **`span.se-toolbar-label`이 두 곳에 있습니다.**
       * 위쪽 도구막대의 '인용구' 삽입 단추(y≈80)와, 아래 서식줄의 스타일 드롭다운(y≈114)입니다.
       * 클래스만 보고 첫 번째를 잡으면 드롭다운이 열리는 게 아니라 **인용구가 삽입됩니다.**
       * 그래서 **화면 위에서 100px 아래**에 있는 것만 고릅니다.
       * `span.se-toolbar-tooltip`은 설명 풍선이라 누르면 안 됩니다.
       * (man_is_best 담당 세션이 17번 헛돌고 찾아낸 것 — 그쪽에서 알려줬습니다. 19/19 성공)
       */
      let subOk = 0;
      const subs = await ed().$$("p[data-wsu-subhead], .se-text-paragraph");
      for (const el of subs) {
        try {
          /**
           * ⚠️ **<b> 로 소제목을 가리면 안 됩니다.** 본문의 [강조] 도 <b> 로 나가서
           *    강조 문단이 소제목으로 잡히고, 정작 소제목은 놓칩니다(2026-09-03 실측: 5개 중 2개).
           *    소제목은 38px 로 나가므로 그걸 봅니다.
           */
          const isSub = await el.evaluate((n) =>
            n.hasAttribute('data-wsu-subhead')
            || Boolean(n.querySelector('span[style*="38px"], span[style*="38.0px"]'))
            || /font-size:\s*38(\.0)?px/.test(n.getAttribute('style') || ''));
          if (!isSub) continue;
          await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
          await sleep(250);
          await el.click({ clickCount: 3, delay: 40 });     // 세 번 눌러 문단을 통째로 고릅니다
          await sleep(500);
          const opened = await ed().evaluate(() => {
            const labels = [...document.querySelectorAll('span.se-toolbar-label')]
              .filter((n) => n.getBoundingClientRect().top >= 100);
            const btn = labels[0]?.closest('button');
            if (!btn) return false;
            btn.click();
            return true;
          });
          if (!opened) continue;
          await sleep(1600);
          const picked = await ed().evaluate(() => {
            const o = [...document.querySelectorAll('span.se-toolbar-option-label')]
              .find((n) => /소제목/.test(n.textContent || ''));
            if (!o) return false;
            (o.closest('button') || o).click();
            return true;
          });
          if (picked) subOk++;
          await sleep(500);
          /**
           * 사장님 지시(2026-09-03): **소제목 표시를 먼저 바꾸고, 그다음 38 굵게.**
           * 네이버 소제목 스타일이 제 크기로 덮어쓰기 때문에 순서가 중요합니다.
           */
          if (picked) {
            await el.evaluate((n) => {
              n.querySelectorAll('span').forEach((sp) => { sp.style.fontSize = '38px'; sp.style.fontWeight = '700'; });
              if (!n.querySelector('span')) { n.style.fontSize = '38px'; n.style.fontWeight = '700'; }
            }).catch(() => {});
            await sleep(200);
          }
        } catch { /* 다음 문단 */ }
      }
      if (subOk) say(`      소제목 ${subOk}개를 네이버 공식 스타일로 바꿨습니다`);
      /**
       * 사진이 **자리에** 들어갔는지 실제로 셉니다.
       * "올린 사진 N장"은 업로드 성공만 뜻하지 위치를 보장하지 않습니다.
       * 이미지가 전부 문서 끝에 몰려 있으면 마지막 이미지의 위치가 문단 수에 가깝습니다.
       */
      const 배치 = await ed().evaluate(() => {
        const all = [...document.querySelectorAll(".se-component")];
        const img = all.map((n, i) => ({ i, 이미지: n.classList.contains("se-image") }))
          .filter((x) => x.이미지).map((x) => x.i);
        const 남은표식 = (document.body.innerText.match(/[⟦\[]사진\d+[⟧\]]/g) || []).length;
        return { 전체부품: all.length, 이미지위치: img.slice(0, 4).concat(img.slice(-2)), 남은표식 };
      }).catch(() => null);
      if (배치) say(`      [배치] 부품 ${배치.전체부품}개 · 이미지 위치 ${JSON.stringify(배치.이미지위치)} · 남은 표식 ${배치.남은표식}개`);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

      /**
       * ⚠️ 사진을 올리고 나면 편집기 프레임이 새로 그려집니다.
       * 그러면 앞서 잡아둔 frameE가 **죽은 손잡이**가 되어 다음 단계에서
       * "Cannot read properties of null (reading 'evaluate')"로 죽습니다(실측 2026-09-02).
       * 여기서 다시 잡아 둡니다.
       */
      const fresh = page.frames().find((f) => /PostWriteForm/.test(f.url()));
      if (fresh) frameE = fresh;
    }

    /**
     * ── 제목 넣기 ──
     * ⚠️ 확장 버튼을 빼면서 제목 넣는 일도 같이 빠졌습니다(실측: 제목이 자리표시 그대로).
     * 본문과 같은 방식으로 넣습니다 — 제목 칸을 클릭해 커서를 세우고 그 자리에 붙여넣기.
     * DOM에 글자만 쓰면 편집기 내부 모델이 비어서 **저장할 때 제목이 사라집니다.**
     */
    /**
     * ⓪ **확장에게 마무리를 맡깁니다.**
     * 편집국에 "이 원고를 방금 복사했다"고 알려주면(=/api/last-copied),
     * 확장이 본문이 찬 것을 보고 **제목 칸과 네이버 공식 소제목**을 처리합니다.
     * 그 두 가지는 네이버가 진짜 클릭을 요구해서 붙여넣기로는 절대 안 들어갑니다.
     * ⚠️ 클립보드는 안 건드립니다 — 원고를 클립보드에 쓰면 사장님이 다른 창에서
     * Ctrl+V 할 때 그게 튀어나옵니다(실제로 났던 사고).
     */
    /**
     * ⚠️ **확장에 마무리를 맡기지 않습니다.** (2026-09-02에 떼어냄)
     *
     * 예전에는 여기서 편집국에 알려 확장이 제목·소제목을 처리하게 했습니다. 그런데
     * 사진이 많은 원고(12장)에서 **이 요청 뒤에 편집기 내용이 통째로 사라졌습니다** —
     * 본문 928자와 사진 11장이 들어간 것을 확인한 직후 `content=0 para=0`이 됐습니다.
     * 윤세아·카리나 원고가 계속 실패하던 원인이 이것이었습니다.
     *
     * 제목은 이제 위에서 직접 쳐 넣으므로 확장이 할 일이 없습니다.
     * 소제목은 네이버 공식 스타일 대신 19px 굵게로 나가지만, 원고가 통째로 날아가는 것보다 낫습니다.
     */

    /**
     * ── 제목은 **직접 쳐 넣습니다** ──
     *
     * ⚠️ 확장에 맡겼더니 어떤 날은 되고 어떤 날은 안 됐습니다.
     * 화면에는 제목이 보이는데 저장하면 목록에 **"제목 없음"** 으로 들어갔습니다
     * (사장님이 목록에서 먼저 발견하셨습니다). DOM에 글자만 써 넣으면 편집기 내부 모델이
     * 비어 있어서 저장할 때 빠집니다.
     *
     * 그래서 사람이 하는 것과 똑같이 합니다 — **진짜 마우스로 제목 칸을 누르고, 키보드로 칩니다.**
     * 이러면 편집기가 입력을 정상으로 받아 모델에도 실립니다.
     * (클립보드는 안 씁니다. 사장님 클립보드를 덮어쓰는 사고가 두 번 났습니다.)
     */
    await applyTitle();

    async function applyTitle() {
      const wantTitle = String(copied.title || "").trim();
      if (!wantTitle) return false;
      const edf = () => page.frames().find((f) => /PostWriteForm/.test(f.url())) || frameE;
      // 이미 제대로 들어가 있으면 손대지 않습니다.
      const already2 = await edf().evaluate(() =>
        (document.querySelector(".se-documentTitle")?.innerText || "").trim()).catch(() => "");
      if (already2 && already2 !== "제목" && already2.slice(0, 8) === wantTitle.slice(0, 8)) return true;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          /**
           * 제목 칸을 누릅니다.
           * ⚠️ 빈 제목 문단은 높이가 거의 없어서 누르는 곳이 빗나갑니다(실측: 절반쯤 실패).
           * 그래서 **넓은 바깥 상자**를 누르고, 커서가 진짜 제목 칸에 들어갔는지 확인합니다.
           */
          const box = await edf().$(".se-documentTitle .se-section-documentTitle, .se-documentTitle");
          if (!box) break;
          await box.click();
          await sleep(700);
          const inTitle = await edf().evaluate(() => {
            const n = window.getSelection()?.anchorNode;
            const el = n?.nodeType === 1 ? n : n?.parentElement;
            return Boolean(el?.closest?.(".se-documentTitle"));
          }).catch(() => false);
          if (!inTitle) {
            // 안 들어갔으면 상자 한가운데를 진짜 마우스로 한 번 더 누릅니다.
            const bb = await box.boundingBox().catch(() => null);
            if (bb) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(600); }
          }
          /**
           * 이미 뭐가 들어 있으면 지우고 씁니다.
           * ⚠️ **Ctrl+A를 쓰면 안 됩니다** — 커서가 제목 칸에 있어도 문서 전체가 잡혀서
           * 이어지는 Delete가 **본문을 통째로 지울 수 있습니다.**
           * 제목 요소 안에서만 범위를 잡아 지웁니다.
           */
          const had = await edf().evaluate(() =>
            (document.querySelector(".se-documentTitle")?.innerText || "").trim()).catch(() => "");
          if (had && had !== "제목") {
            // 이미 글자가 있으면 제목 칸 안에서만 범위를 잡아 지웁니다.
            await edf().evaluate(() => {
              const t = document.querySelector(".se-documentTitle");
              if (!t) return;
              const r = document.createRange();
              r.selectNodeContents(t);
              const sel = window.getSelection();
              sel.removeAllRanges(); sel.addRange(r);
            }).catch(() => {});
            await page.keyboard.press("Delete");
            await sleep(300);
          }
          await page.keyboard.type(wantTitle, { delay: 12 });
          await sleep(1200);
          const now = await edf().evaluate(() =>
            (document.querySelector(".se-documentTitle")?.innerText || "").trim()).catch(() => "");
          if (now && now !== "제목" && now.slice(0, 8) === wantTitle.slice(0, 8)) {
            say(`      제목 쳐 넣음: ${now.slice(0, 30)}`);
            return true;
          }
          say(`      제목이 안 들어갔습니다 — 다시 시도 (${attempt + 1}/3)`);
        } catch (e) { say(`      제목 넣다 실패: ${String(e.message).slice(0, 50)}`); }
      }
      return false;
    }

    const titleText = String(copied.title || "").trim();
    if (false && titleText) {
      try {
        const th = await (await liveFrame()).evaluateHandle(() => {
          const el = document.querySelector(".se-documentTitle .se-text-paragraph")
            || document.querySelector(".se-documentTitle [contenteditable='true']")
            || document.querySelector(".se-documentTitle");
          return el;
        });
        const tel = th.asElement();
        if (tel) { await tel.click({ delay: 60 }); await sleep(600); }
        await evalIn((t) => {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return false;
          let node = sel.getRangeAt(0).startContainer;
          if (node.nodeType === 3) node = node.parentElement;
          if (!node || !node.closest(".se-documentTitle")) return false;
          const dt = new DataTransfer();
          dt.setData("text/plain", t);
          node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          return true;
        }, titleText);
        await sleep(2000);
      } catch {}
    }

    // ── 5) 뭐가 들어갔는지 세어 봅니다 ──
    const state = await frameE.evaluate(() => {
      const root = document.querySelector(".se-main-container, .se-content");
      // 제목은 따로 세므로 본문 글자수에서 뺍니다.
      const titleText = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      const allText = (root?.innerText || "").replace(/\s/g, "");
      return {
        chars: Math.max(0, allText.length - titleText.length),
        /**
         * ⚠️ 사진 하나가 `.se-component.se-image`와 `.se-image-resource`를 **둘 다** 가집니다.
         * 두 선택자를 한 번에 세면 **정확히 두 배**로 나옵니다 —
         * 13장을 넣었는데 26장이라고 보고해서 "중복으로 들어갔다"고 잘못 판단했습니다.
         * 바깥 껍데기(.se-component.se-image)만 셉니다.
         */
        images: root ? root.querySelectorAll(".se-component.se-image").length : 0,
        /**
         * **네이버가 진짜로 가진 사진인지** 셉니다.
         * 업로드된 사진만 주소가 pstatic.net 으로 바뀝니다. 남의 주소를 빌려 쓴 사진은
         * 화면에는 보여도 **사진 라이브러리에 안 나오고 수정도 안 됩니다** (사장님 지적 2026-09-02).
         * 이 숫자가 사진 수와 다르면 업로드가 아니라 붙여넣기로 들어간 것입니다.
         */
        owned: root ? [...root.querySelectorAll(".se-component.se-image img")]
          .filter((n) => /pstatic\.net/.test(n.src || "")).length : 0,
        /** 출처 줄이 가운데 정렬됐는지 (사장님 지시 2026-09-02) */
        credits: root ? [...root.querySelectorAll("*")]
          .filter((n) => /^▲ 사진 출처/.test((n.textContent || "").trim())).length : 0,
        creditsCentered: root ? [...root.querySelectorAll("*")]
          .filter((n) => /^▲ 사진 출처/.test((n.textContent || "").trim()))
          .filter((n) => /center/.test(getComputedStyle(n).textAlign || "")).length : 0,
        title: (document.querySelector(".se-documentTitle")?.innerText || "").trim().slice(0, 40),
      };
    });
    say(`[5/6] 들어간 것 — 글자 ${state.chars.toLocaleString()}자 · 사진 ${state.images}장`
      + ` (네이버가 가진 사진 ${state.owned}장 · 출처줄 ${state.creditsCentered}/${state.credits} 가운데정렬)`);
    if (state.images && state.owned < state.images) {
      say(`      ⚠ ${state.images - state.owned}장은 업로드가 아니라 붙여넣기로 들어갔습니다 — 라이브러리에 안 나옵니다`);
    }
    say(`      제목: ${state.title || "(비어 있음)"}`);

    if (state.chars < 200) {
      // 왜 안 들어갔는지 구조를 찍습니다. 짐작으로 선택자를 바꾸는 건 시간 낭비입니다.
      say("      ── 편집기 구조 진단 ──");
      // 그 '31자'가 대체 무슨 글자인지 눈으로 봐야 합니다. 숫자만 봐서는 못 고칩니다.
      const peek = await frameE.evaluate(() => {
        const c = document.querySelector(".se-main-container, .se-content");
        return {
          content: (c?.innerText || "").replace(/\s+/g, " ").slice(0, 160),
          bodyAll: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 220),
          paraTexts: [...document.querySelectorAll(".se-text-paragraph")]
            .map((n) => (n.innerText || "").replace(/\s+/g, " ").slice(0, 60)),
        };
      }).catch(() => null);
      if (peek) {
        say(`      .se-content 안: "${peek.content}"`);
        say(`      문단들: ${JSON.stringify(peek.paraTexts)}`);
        say(`      프레임 전체: "${peek.bodyAll}"`);
      }
      for (const f of page.frames()) {
        const c = await f.evaluate(() => {
          const q = (s) => document.querySelectorAll(s).length;
          return {
            main: q(".se-main-container"), content: q(".se-content"),
            para: q(".se-text-paragraph"), comp: q(".se-component"),
            title: q(".se-documentTitle"), editable: q("[contenteditable='true']"),
            body: q("body"),
          };
        }).catch(() => null);
        if (c && (c.main || c.para || c.title || c.editable)) {
          say(`      ${f.url().slice(0, 52)}`);
          say(`        main=${c.main} content=${c.content} para=${c.para} comp=${c.comp} title=${c.title} editable=${c.editable}`);
        }
      }
      console.error("본문이 거의 안 들어갔습니다. 임시저장을 하지 않고 멈춥니다.");
      if (!show) await browser.close();
      process.exit(1);
    }

    // ── 6) 임시저장 ──
    say("[6/6] 임시저장 누르는 중");
    const saved = await frameE.evaluate(() => {
      /**
       * 저장 버튼 찾기. offsetParent로 보이는지 판단하면 **position:fixed 버튼이 안 잡힙니다**
       * (이 저장소에서 세 번 겪은 함정). 화면 크기와 style로 판단합니다.
       */
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
      };
      const btns = [...document.querySelectorAll("button, a")].filter(visible);
      const btn = btns.find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()))
        || btns.find((b) => /임시저장/.test(b.textContent || ""));
      if (!btn) return { ok: false, why: "저장 버튼을 못 찾았습니다" };
      btn.click();
      return { ok: true, label: (btn.textContent || "").trim() };
    });

    if (!saved.ok) {
      console.error("실패:", saved.why, "— 창을 열어둔 채로 두니 직접 저장하세요.");
      if (!show) await browser.close();
      process.exit(1);
    }
    await sleep(5000);
    /**
     * 눌렀다고 저장된 게 아닙니다. 편집기 위쪽 "저장 N"의 숫자가 늘었는지로 확인합니다.
     * 버튼만 누르고 "됐다"고 보고하면, 안 됐을 때 사장님이 나중에 빈손으로 발견합니다.
     */
    const savedCount = await frameE.evaluate(() => {
      const m = /저장\s*(\d+)/.exec(document.body?.innerText || "");
      return m ? Number(m[1]) : null;
    }).catch(() => null);
    say(`      "${saved.label}" 눌렀습니다. 임시저장 목록: ${savedCount ?? "확인 못 함"}건`);

    /**
     * ── 제목이 **진짜로 저장됐는지** 확인 ──
     * ⚠️ 화면의 제목 칸에 글자가 보여도 저장 목록에는 "제목 없음"으로 남을 수 있습니다
     * (편집기 내부 모델이 비어 있으면 그렇습니다 — 사장님이 목록에서 발견하신 문제).
     * 그래서 저장 목록을 열어 **맨 위 글의 제목**을 직접 읽습니다.
     */
    const listTitle = await frameE.evaluate(async () => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const open = [...document.querySelectorAll("button, a")].filter(vis)
        .find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()));
      // "저장 N" 옆의 목록 열기 단추를 누릅니다.
      const near = open?.parentElement?.querySelectorAll("button") || [];
      for (const b of near) if (b !== open) { b.click(); break; }
      await new Promise((r) => setTimeout(r, 2500));
      const rows = [...document.querySelectorAll("li, tr")]
        .map((n) => (n.textContent || "").trim())
        .filter((t) => /\d{4}\.\d{2}\.\d{2}/.test(t));
      return rows.slice(0, 2);
    }).catch(() => []);
    if (listTitle.length) {
      listTitle.forEach((r, i) => say(`      [목록 ${i + 1}] ${String(r).slice(0, 70)}`));
      const first = String(listTitle[0] || "");
      if (/제목\s*없음/.test(first)) {
        say("      ⚠ 저장 목록에 **제목 없음**으로 들어갔습니다 — 제목이 편집기 모델에 안 실렸습니다");
      } else {
        say(`      저장 목록 확인: ${first.slice(0, 40)}`);
      }
    }
    restoreClip();   // 사장님 클립보드를 원래대로 돌려놓습니다
    say("\n✔ 임시저장까지 끝났습니다. 발행은 사장님이 직접 하십시오.");
    say(`   확인: https://blog.naver.com/${blogId}/postwrite`);

    /**
     * ⚠️ **나가기 전에 탭을 비웁니다.**
     * 크롬은 닫을 때 열려 있던 탭을 세션에 저장합니다. 그래서 자동화가 매번 탭을 남기면,
     * 나중에 사장님이 바로가기로 창을 여실 때 **그게 전부 복원됩니다**
     * (실측: 블로그 탭 25개가 한꺼번에 뜨고 메모리를 잡아먹었습니다).
     * 빈 페이지 하나만 남기고 나갑니다.
     */
    try {
      const pages = await browser.pages();
      for (const pg of pages.slice(1)) { try { await pg.close(); } catch {} }
      if (pages[0]) { try { await pages[0].goto("about:blank", { timeout: 8000 }); } catch {} }
    } catch {}

    if (!show) {
      try { await browser.close(); } catch {}
      try {
        const pid = browser.process()?.pid;
        if (pid) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {}
    }
  } catch (e) {
    console.error("실패:", e.message);
    // 실패해도 탭은 비우고 나갑니다 — 안 그러면 다음에 사장님 창에 쌓여서 복원됩니다.
    try {
      const pages = await browser.pages();
      for (const pg of pages.slice(1)) { try { await pg.close(); } catch {} }
      if (pages[0]) { try { await pages[0].goto("about:blank", { timeout: 8000 }); } catch {} }
    } catch {}
    try { await browser.close(); } catch {}
    try {
      const pid = browser.process()?.pid;
      if (pid) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
    process.exit(1);
  }
})();
