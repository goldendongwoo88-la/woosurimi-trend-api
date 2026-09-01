/**
 * 네이버 임시저장 목록 보기 / 지우기 — 2026-09-02
 *
 *   node scripts/naver-drafts.js <블로그ID>                  목록만 봅니다 (아무것도 안 지웁니다)
 *   node scripts/naver-drafts.js <블로그ID> --제목없음만-지우기   제목 없는 초안만 지웁니다
 *
 * ⚠️ **지우면 되돌릴 수 없습니다.** 기본은 보기만 하고, 지울 때는 무엇을 지울지 먼저 다 찍습니다.
 */
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);
const EXTENSION = path.join(__dirname, "..", "extension");

const blogId = process.argv[2];
const doDelete = process.argv.includes("--제목없음만-지우기");
if (!blogId) { console.log("사용: node scripts/naver-drafts.js <블로그ID> [--제목없음만-지우기]"); process.exit(1); }

const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /**
   * 그 프로필로 열린 크롬이 남아 있으면 **프로필이 잠겨서 크롬이 아예 안 뜹니다**
   * (실측: "Timed out ... waiting for the WS endpoint"). 먼저 정리합니다.
   *
   * ⚠️ **곱게 닫습니다(CloseMainWindow).** 예전엔 바로 Stop-Process로 죽였는데,
   * 그러면 크롬이 쿠키를 디스크에 못 쓰고 죽어서 **네이버 로그인이 풀립니다**
   * (실측 2026-09-02: 20분 전 로그인돼 있던 프로필이 로그인 화면으로 넘어갔습니다).
   * 안 닫히면 그때만 강제로 죽입니다.
   */
  try {
    require("child_process").execFileSync("powershell", ["-NoProfile", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*naver_${blogId}*' } | ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p) { $null = $p.CloseMainWindow(); Start-Sleep -Milliseconds 1500; if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } }`],
      { stdio: "ignore", timeout: 30000 });
    await sleep(2500);
  } catch {}

  const browser = await puppeteer.launch({
    timeout: 90000,
    /**
     * ⚠️ 역슬래시는 **두 번** 써야 합니다.
     * `C:\dev\profiles\naver_...` 라고 쓰면 자바스크립트가 `\n`을 **줄바꿈**으로 읽어버려
     * 엉뚱한 폴더에 새 프로필을 만듭니다. 그러면 로그인해 둔 것이 하나도 안 보입니다
     * (실측 2026-09-02: 이 스크립트만 계속 "로그아웃 상태"라고 나온 진짜 원인이었습니다).
     */
    headless: false, userDataDir: `C:\\dev\\profiles\\naver_${blogId}`, defaultViewport: null,
    args: [`--load-extension=${EXTENSION}`, `--disable-extensions-except=${EXTENSION}`,
      "--disable-blink-features=AutomationControlled", "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble", "--window-size=900,700", "--window-position=1050,560", "--lang=ko-KR,ko"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(9000);
    // "작성 중인 글이 있습니다" 팝업 닫기 — 안 닫으면 목록도 안 열립니다.
    for (let i = 0; i < 6; i++) {
      for (const f of page.frames()) {
        try {
          await f.evaluate(() => {
            const b = [...document.querySelectorAll("button")].find((x) => /^\s*취소\s*$/.test(x.textContent || ""));
            if (b) b.click();
          });
        } catch {}
      }
      await sleep(1000);
    }
    // 편집기 프레임은 늦게 뜹니다. 나타날 때까지 기다립니다.
    const ed = () => page.frames().find((f) => /PostWriteForm/.test(f.url()));
    for (let i = 0; i < 20 && !ed(); i++) await sleep(1500);
    if (!ed()) {
      const urls = page.frames().map((f) => f.url().slice(0, 60));
      console.error("편집기를 못 찾았습니다. 지금 열린 주소:", JSON.stringify(urls));
      return;
    }

    // 저장 목록 열기 — "저장 N" 옆의 목록 단추
    await ed().evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const save = [...document.querySelectorAll("button,a")].filter(vis)
        .find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()));
      const near = save?.parentElement?.querySelectorAll("button") || [];
      for (const b of near) if (b !== save) { b.click(); return; }
    });
    await sleep(3000);

    const rows = await ed().evaluate(() => {
      const items = [...document.querySelectorAll("li")]
        .filter((n) => /\d{4}\.\d{2}\.\d{2}/.test(n.textContent || ""))
        .filter((n) => !n.querySelector("li"));   // 가장 안쪽 항목만
      return items.map((n, i) => {
        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
        const d = (t.match(/\d{4}\.\d{2}\.\d{2}\.?\s*\d{2}:\d{2}/) || [""])[0];
        return { i, title: t.replace(d, "").replace(/삭제|편집/g, "").trim().slice(0, 44), when: d };
      });
    });

    say(`\n임시저장 ${rows.length}건 — ${blogId}\n`);
    rows.forEach((r) => say(`${String(r.i + 1).padStart(3)}. ${r.when}  ${r.title || "(제목 없음)"}`));

    if (!doDelete) {
      say("\n※ 보기만 했습니다. 아무것도 지우지 않았습니다.");
      say("   제목 없는 초안만 지우려면: --제목없음만-지우기");
      return;
    }

    /**
     * ── "제목 없음" 초안만 지웁니다 ──
     *
     * ⚠️ **되돌릴 수 없습니다.** 그래서 아무거나 지우지 않고 **제목이 비어 있는 것만** 지웁니다.
     * 제목이 없는 초안은 자동화가 실패해서 남은 껍데기입니다 —
     * 제목이 안 실리면 본문이 들어가도 목록에서 무슨 글인지 알 수가 없습니다.
     * 제목이 붙어 있는 초안은 사장님 것일 수 있으므로 **손대지 않습니다.**
     */
    const targets = rows.filter((r) => /제목\s*없음/.test(r.title) || !r.title);
    if (!targets.length) { say("\n지울 것이 없습니다 — 제목 없는 초안이 없습니다."); return; }
    say(`\n지울 대상: 제목 없는 초안 ${targets.length}건 (제목 있는 ${rows.length - targets.length}건은 그대로 둡니다)`);

    let killed = 0;
    for (let round = 0; round < targets.length + 3; round++) {
      const did = await ed().evaluate(() => {
        const items = [...document.querySelectorAll("li")]
          .filter((n) => /\d{4}\.\d{2}\.\d{2}/.test(n.textContent || ""))
          .filter((n) => !n.querySelector("li"));
        const row = items.find((n) => /제목\s*없음/.test((n.textContent || "").replace(/\s+/g, " ")));
        if (!row) return "없음";
        const btn = [...row.querySelectorAll("button,a")]
          .find((b) => /삭제/.test(b.textContent || b.getAttribute("aria-label") || ""));
        if (!btn) return "버튼없음";
        btn.click();
        return "눌렀음";
      }).catch(() => "실패");
      if (did === "없음") break;
      if (did !== "눌렀음") { say(`      멈춤: ${did}`); break; }
      await sleep(1200);
      // 확인 창이 뜨면 확인을 누릅니다.
      await ed().evaluate(() => {
        const b = [...document.querySelectorAll("button")]
          .filter((n) => n.offsetParent !== null)
          .find((n) => /^\s*(확인|삭제)\s*$/.test(n.textContent || ""));
        b?.click();
      }).catch(() => {});
      killed++;
      await sleep(2000);
    }
    say(`\n지운 초안: ${killed}건. 제목 있는 초안은 건드리지 않았습니다.`);
  } finally {
    const pages = await browser.pages();
    if (pages[0]) { try { await pages[0].goto("about:blank", { timeout: 8000 }); } catch {} }
    await browser.close();
  }
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
