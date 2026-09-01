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
 * ── 지금 어디까지 되나 (2026-09-01 기준) ──
 *   로그인 확인      ✅
 *   원고+사진 담기    ✅ (사진 10장까지 확인)
 *   글쓰기 열기       ✅
 *   **제목 넣기**     ✅ 확장의 '원고 붙이기'가 처리
 *   **본문 넣기**     ❌ 아직 안 됩니다
 *   임시저장         (본문이 안 들어가서 일부러 멈춤)
 *
 * ── 본문이 안 들어가는 이유 (실측으로 좁힌 것) ──
 *   1. 확장은 chrome.debugger로 '진짜 붙여넣기'를 합니다. 그런데 **퍼펫티어가 이미 디버거를
 *      점유**하고 있어 확장이 그 경로를 못 씁니다. 그래서 제목만 들어갑니다.
 *   2. 합성 paste 이벤트(ClipboardEvent + DataTransfer)는 스마트에디터가 무시했습니다.
 *   3. CDP Input.insertText도 안 들어갔습니다. 프레임에 contenteditable이 1개뿐인데
 *      그게 **제목 칸**이고, 본문은 클릭하기 전까지 편집 가능 상태가 아닌 것으로 보입니다.
 *      (본문 문단에는 자리표시 문구 "글감과 함께 나의 일상을 기록해보세요!"만 31자 들어 있음)
 *
 * ── 다음에 시도할 것 ──
 *   · 퍼펫티어 대신 **CDP 없이** 크롬을 띄우고 확장만으로 처리 (자동화 없이 사람이 누르는 것과 동일)
 *   · 또는 본문 영역을 페이지 좌표로 **실제 마우스 클릭**해 편집 상태로 만든 뒤 입력
 *   · 또는 확장에서 debugger 대신 쓸 경로를 하나 더 만들어 두기
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
const show = args.includes("--show");        // 창을 보면서 확인하고 싶을 때

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(m);

(async () => {
  say(`[1/6] 크롬 여는 중 (프로필: naver_${blogId})`);
  const browser = await puppeteer.launch({
    headless: show ? false : "new",
    userDataDir: profileDir,
    defaultViewport: null,
    args: [
      `--load-extension=${EXTENSION}`,
      `--disable-extensions-except=${EXTENSION}`,
      "--disable-blink-features=AutomationControlled",
      "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble",
      "--window-size=1440,960",
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

    // "작성 중이던 글이 있습니다" 팝업이 뜨면 **취소**를 눌러야 새 글로 시작합니다.
    await frame.evaluate(() => {
      const btns = [...document.querySelectorAll("button, a")];
      const cancel = btns.find((b) => /취소|아니오|새로 작성/.test(b.textContent || ""));
      if (cancel) cancel.click();
    }).catch(() => {});
    await sleep(1500);

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
      const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
      const paras = [...document.querySelectorAll(".se-text-paragraph")]
        .filter((n) => !inTitle(n));
      return paras[0]
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
     * ⓪ **확장의 "원고 붙이기" 버튼을 먼저 누릅니다.**
     * 이 버튼 뒤의 코드는 몇 주 동안 실제 사고를 겪으며 다듬어진 것입니다 —
     * 제목이 편집기 모델까지 들어가게 하는 순서, 소제목 전환, 서식, 사진 자리까지 전부 처리합니다.
     * 여기서 다시 만들면 그 사고를 처음부터 다시 겪게 됩니다.
     * 편집국이 /api/last-copied로 원고를 이미 넘겨놨으므로 버튼만 누르면 됩니다.
     */
    let byExtension = false;
    for (const f of page.frames()) {
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
      for (const f of page.frames()) {
        const ok = await f.evaluate((html, plain) => {
          const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
          const cands = [...document.querySelectorAll("[contenteditable='true']")].filter((n) => !inTitle(n));
          if (!cands.length) return false;
          for (const editable of cands) {
            editable.focus?.();
            const range = document.createRange();
            range.selectNodeContents(editable);
            const sel = window.getSelection();
            sel.removeAllRanges(); sel.addRange(range);
            const dt = new DataTransfer();
            dt.setData("text/html", html);
            dt.setData("text/plain", plain);
            editable.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          }
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
    if ((await measure(frameE)) < 200 && (copied.body || "").length > 200) {
      say("      CDP로 글자 직접 넣기 (서식 없이 본문만)");
      const focused = await frameE.evaluate(() => {
        const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
        const el = [...document.querySelectorAll("[contenteditable='true']")].filter((n) => !inTitle(n))[0]
          || [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n))[0];
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

    const pasted = alreadyIn >= 200 ? true : await frameE.evaluate((html, plain) => {
      const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
      const el = [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n))[0]
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
    if (got < 200) {
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
        images: root ? root.querySelectorAll(".se-component.se-image, .se-image-resource").length : 0,
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
    await sleep(4000);
    say(`      "${saved.label}" 눌렀습니다.`);
    say("\n✔ 임시저장까지 끝났습니다. 발행은 사장님이 직접 하십시오.");
    say(`   확인: https://blog.naver.com/${blogId}/postwrite`);

    if (!show) await browser.close();
  } catch (e) {
    console.error("실패:", e.message);
    try { await browser.close(); } catch {}
    process.exit(1);
  }
})();
