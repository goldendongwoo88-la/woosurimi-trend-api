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
const say = (m) => console.log(m);

(async () => {
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
      "--window-size=1100,800",
      "--window-position=1150,650",   // 오른쪽 아래 구석
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
        if (typeof buildNaverHtml === "function") htmlOut = buildNaverHtml(r.post.body, r.post.title, photosArr);
      } catch {}
      if (typeof copyCombined !== "function") return { ok: false, why: "통합복사 기능을 못 찾았습니다" };
      try {
        await copyCombined();
        return { ok: true, how: "clipboard API", title: r.post.title, photos: photosArr.length, html: htmlOut, body: r.post.body };
      } catch (e) {
        /**
         * ⚠️ 최신 클립보드 API가 막히는 환경이 있습니다(권한·포커스).
         * 그때는 **옛 방식**으로 담습니다 — copy 이벤트를 가로채 서식째 넣는 방법입니다.
         * 권한을 안 물어보고, 서식(text/html)도 그대로 실립니다.
         */
        const photos = Array.isArray(r.post.photos) ? r.post.photos : [];
        const html = (typeof buildNaverHtml === "function")
          ? buildNaverHtml(r.post.body, r.post.title, photos) : "";
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
        return { ok: true, how: "execCommand(옛 방식)", title: r.post.title, photos: photos.length, html: htmlOut, body: r.post.body };
      }
    }, postId);

    if (!copied.ok) { console.error("실패:", copied.why); await browser.close(); process.exit(1); }
    say(`      "${copied.title.slice(0, 34)}" · 사진 ${copied.photos}장 · ${copied.how}`);

    // ── 3) 글쓰기 열기 ──
    say("[3/6] 네이버 글쓰기 여는 중");
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: "networkidle2", timeout: 60000 });
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
    const frameE = editor;

    // ── 4) 본문 칸 클릭 후 진짜 Ctrl+V ──
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
    let byExtension = false;
    const already = await frameE.evaluate(() => {
      const root = document.querySelector(".se-main-container, .se-content");
      const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
    }).catch(() => 0);
    if (already >= 200) say(`      이미 본문 ${already.toLocaleString()}자 들어감 — 나머지 단계 건너뜀`);
    for (const f of (already >= 200 ? [] : page.frames())) {
      const clicked = await f.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
        };
        const btn = [...document.querySelectorAll("button, a, div[role='button']")]
          .filter(visible)
          .find((b) => /원고\s*붙이기/.test((b.textContent || "").trim()));
        if (!btn) return false;
        btn.click();
        return true;
      }).catch(() => false);
      if (clicked) { byExtension = true; break; }
    }
    if (byExtension) {
      say("      확장의 '원고 붙이기'를 눌렀습니다 — 처리 기다리는 중");
      await sleep(12000);
      const n1 = await frameE.evaluate(() => {
        const root = document.querySelector(".se-main-container, .se-content");
        const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
        return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
      }).catch(() => 0);
      say(`      확장 처리 후 본문 ${n1.toLocaleString()}자`);
    } else {
      say("      확장 버튼을 못 찾았습니다 — 직접 붙여넣기로 갑니다");
    }

    /**
     * ① 합성 붙여넣기부터.
     * ⚠️ OS 클립보드를 거친 진짜 Ctrl+V가 편집기까지 안 닿는 경우가 있었습니다(실측: 0자).
     * 스마트에디터는 paste 이벤트를 스스로 처리하므로, DataTransfer를 만들어 직접 던지면
     * 편집기가 정상 경로로 받아 문단·사진을 알아서 만듭니다. 확장도 같은 사다리를 씁니다.
     */
    /**
     * ⚠️ 본문이 어느 프레임에 있는지 확정할 수 없습니다.
     * 실측: PostWriteForm 프레임에 문단이 2개(제목+본문)뿐인데 본문이 31자에 머물렀고,
     * about:blank 프레임에도 편집 가능한 영역이 하나 더 있었습니다.
     * 짐작으로 하나를 고르지 말고 **편집 가능한 곳마다 넣어보고, 들어간 곳을 씁니다.**
     */
    const measure = async (f) => f.evaluate(() => {
      const root = document.querySelector(".se-main-container, .se-content") || document.body;
      const t = (document.querySelector(".se-documentTitle")?.innerText || "").replace(/\s/g, "");
      return Math.max(0, (root?.innerText || "").replace(/\s/g, "").length - t.length);
    }).catch(() => 0);

    if ((await measure(frameE)) < 200) {
      /**
       * ⚠️ **붙여넣기 직전에 본문을 다시 클릭합니다.**
       * 앞에서 확장 버튼을 누르는 동안 커서가 본문에서 빠져나갑니다.
       * 커서가 없으면 붙여넣기가 제목으로 가거나 아무 데도 안 들어갑니다.
       */
      try {
        const h2 = await frameE.evaluateHandle(() => {
          const inTitle = (n) => Boolean(n.closest?.(".se-documentTitle"));
          const paras = [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n));
          return paras.length ? paras[paras.length - 1] : document.querySelector(".se-content");
        });
        const el2 = h2.asElement();
        if (el2) { await el2.click({ delay: 60 }); await sleep(700); }
        const where = await frameE.evaluate(() => {
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
        const n2 = await measure(frameE);
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
    if (already < 200 && (await measure(frameE)) < 200 && (copied.body || "").length > 200) {
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
        say(`      넣은 뒤 본문 ${(await measure(frameE)).toLocaleString()}자`);
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
    const nowIn = await measure(frameE);
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
      const editable = el.closest("[contenteditable='true']") || el;
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

    // 사진이 있으면 네이버가 하나씩 올리느라 시간이 걸립니다. 넉넉히 기다립니다.
    say("      붙여넣는 중… 사진 업로드까지 기다립니다");
    await sleep(copied.photos ? 25000 : 6000);

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
        title: (document.querySelector(".se-documentTitle")?.innerText || "").trim().slice(0, 40),
      };
    });
    say(`[5/6] 들어간 것 — 글자 ${state.chars.toLocaleString()}자 · 사진 ${state.images}장`);
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
    say("\n✔ 임시저장까지 끝났습니다. 발행은 사장님이 직접 하십시오.");
    say(`   확인: https://blog.naver.com/${blogId}/postwrite`);

    if (!show) await browser.close();
  } catch (e) {
    console.error("실패:", e.message);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
})();
