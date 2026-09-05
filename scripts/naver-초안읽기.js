/**
 * 임시저장·예약 목록을 **읽기만** 합니다 (2026-09-05)
 *
 *   node scripts/naver-초안읽기.js <블로그ID>
 *
 * ── 왜 새로 쓰나 ──
 * `naver-예약목록.js` 는 `저장15` 글자를 가진 요소를 **직접 눌렀습니다.**
 * 그런데 스마트에디터에서 그 자리는 **저장 단추**입니다 — 누르면 빈 초안이 하나 생깁니다.
 * 목록은 그 **옆(형제) 요소**를 눌러야 열립니다 (2026-09-05 실측).
 *
 * 이 파일은 **아무것도 저장하지 않습니다.** 세 가지만 합니다.
 *   ① 저장 개수를 읽고  ② 형제를 눌러 목록을 열고  ③ 줄을 파일로 적습니다
 *
 * ⚠️ 합성 click() 은 스마트에디터가 무시합니다. 진짜 마우스로 눌러야 합니다.
 */
const fs = require("fs");
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
if (!blogId) { console.error("사용법: node scripts/naver-초안읽기.js <블로그ID>"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;
const 낼 = path.join(__dirname, "..", "..", "golden-office", "out", "2026-09-05", `_초안-${blogId}.txt`);

(async () => {
  const browser = await puppeteer.launch({
    headless: false, defaultViewport: null, protocolTimeout: 180000,
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--start-maximized", "--no-first-run"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write&`,
    { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(8000);

  /**
   * ⚠️ 먼저 「작성 중인 글이 있습니다」 팝업을 닫습니다.
   * 이게 떠 있으면 화면 전체가 덮여서 **아무 단추도 안 눌립니다.**
   * 2026-09-05 에 목록을 0줄로 두 번 읽은 원인이 이것이었습니다(화면을 찍고서야 봤습니다).
   * 「확인」을 누르면 옛 내용을 이어서 열어 버리니 반드시 **취소**입니다.
   */
  /**
   * 팝업의 「취소」는 **프레임 안에서 el.click()** 으로 눌러야 합니다.
   * page.mouse.click 에 프레임 좌표를 주면 페이지 좌표로 해석돼 엉뚱한 데를 누릅니다
   * (2026-09-05에 「닫음」이 두 번 찍혔는데 화면에는 팝업이 그대로였습니다).
   * 편집기 도구막대와 반대입니다 — 그쪽은 합성 클릭을 무시합니다. 자리마다 다릅니다.
   */
  for (let n = 1; n <= 8; n++) {
    let 있음 = false;
    for (const f of page.frames()) {
      const r = await f.evaluate(() => {
        const 보임 = (el) => { const b = el.getBoundingClientRect();
          return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
        if (!/작성 중인 글이 있습니다|이어서 작성/.test(document.body?.innerText || "")) return { p: false };
        const c = [...document.querySelectorAll("button,a")].filter(보임)
          .find((b) => /^\s*취소\s*$/.test(b.textContent || ""));
        if (c) { c.click(); return { p: true, c: true }; }
        return { p: true, c: false };
      }).catch(() => ({ p: false }));
      if (r.p) { 있음 = true; if (r.c) say("팝업 닫음 (취소)"); }
    }
    if (!있음) break;
    await sleep(1200);
  }
  await sleep(1500);

  let 열림 = null;
  for (const f of page.frames()) {
    const 자리 = await f.evaluate(() => {
      // 「저장 15」 처럼 개수가 붙은 요소를 찾고, 그 **형제**의 좌표를 돌려줍니다
      const el = [...document.querySelectorAll("button,a,span,div")].find((x) => {
        const t = (x.textContent || "").trim();
        return /^저장\s*\d+\+?$/.test(t) && x.getBoundingClientRect().width > 0;
      });
      if (!el) return null;
      const 개수 = el.textContent.trim();
      const 형제 = [...(el.parentElement ? el.parentElement.children : [])]
        .filter((c) => c !== el && c.getBoundingClientRect().width > 0);
      const 목표 = 형제[형제.length - 1] || el;
      const r = 목표.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, 개수, 형제수: 형제.length };
    }).catch(() => null);
    if (자리) {
      say(`저장 개수: ${자리.개수} · 형제 ${자리.형제수}개 — 형제를 누릅니다`);
      await page.mouse.click(자리.x, 자리.y);
      열림 = 자리;
      break;
    }
  }
  if (!열림) { say("⚠ 저장 개수 표시를 못 찾았습니다"); await browser.close(); process.exit(1); }
  await sleep(5000);

  // 화면을 찍습니다 — 세 번 더듬었으면 찍어 보는 게 빠릅니다
  const 사진길 = 낼.replace(/\.txt$/, ".png");
  await page.screenshot({ path: 사진길, fullPage: false });
  say(`화면: ${사진길}`);

  let 줄 = [];
  for (const f of page.frames()) {
    const r = await f.evaluate(() =>
      [...document.querySelectorAll("li,tr,div[class*=item],div[class*=list]")]
        .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 6 && t.length < 200)
        .slice(0, 80)
    ).catch(() => []);
    if (r.length > 줄.length) 줄 = r;
  }

  const 본 = [...new Set(줄)].filter((t) => /\d{4}\.\d{2}\.\d{2}|\d{2}[.:]\d{2}/.test(t));
  fs.writeFileSync(낼, [`저장 ${열림.개수}`, "", ...본].join("\n"), "utf8");
  say(`■ 줄 ${본.length}개 → ${낼}`);
  await browser.close();
})();
