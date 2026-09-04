/**
 * 예약 발행 목록과 임시저장 목록을 읽습니다 — 2026-09-04
 *
 *   node scripts/naver-예약목록.js <블로그ID>
 *
 * ── 왜 만들었나 ──
 * `naver-draft.js` 는 저장할 때마다 **새 초안을 만듭니다. 덮어쓰지 않습니다.**
 * 예약이 걸린 글을 모르고 다시 저장하면 같은 글이 두 개가 되고,
 * 지우는 건 사장님 몫입니다(사장님 지시 2026-09-04: "예약발행이 있다면 확인해보고 있는건 수정 X").
 *
 * 그래서 **만들기 전에** 발행됨·예약됨·초안 셋을 다 보고 겹치는 것을 뺍니다.
 * 발행된 글은 공개 API 로 따로 봅니다(브라우저 필요 없음).
 */
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
if (!blogId) { console.error("사용법: node scripts/naver-예약목록.js <블로그ID>"); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;

(async () => {
  const browser = await puppeteer.launch({
    headless: false, defaultViewport: null,
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write&`,
    { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(7000);

  /**
   * ⚠️ 저장 목록은 **진짜 마우스로** 열어야 합니다.
   *    합성 click() 은 스마트에디터가 무시합니다(2026-09-04 실측, 두 플랫폼 공통).
   */
  let 열림 = false;
  for (const f of page.frames()) {
    const 자리 = await f.evaluate(() => {
      const el = [...document.querySelectorAll("button,a,span,div")].find((x) => {
        const t = (x.textContent || "").trim();
        return /^저장\s*\d+$/.test(t) && x.getBoundingClientRect().width > 0;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: el.textContent.trim() };
    }).catch(() => null);
    if (자리) {
      say(`저장 단추: ${자리.t}`);
      await page.mouse.click(자리.x, 자리.y);
      열림 = true;
      break;
    }
  }
  if (!열림) say("⚠ 저장 단추를 못 찾았습니다");
  await sleep(4500);

  /** 목록 줄을 읽습니다. 예약 글은 줄에 「예약」이 붙습니다. */
  let 찍음 = false;
  for (const f of page.frames()) {
    const 줄 = await f.evaluate(() =>
      [...document.querySelectorAll("li")]
        .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length > 8 && /\d{2}[.:]\d{2}/.test(t))
        .slice(0, 50)
    ).catch(() => []);
    if (줄.length) {
      const 예약 = 줄.filter((t) => /예약/.test(t));
      const 초안 = 줄.filter((t) => !/예약/.test(t));
      say(`\n■ 예약 ${예약.length}개`);
      예약.forEach((t, i) => say(`  ${String(i + 1).padStart(2)}. ${t.slice(0, 76)}`));
      say(`\n■ 임시저장 ${초안.length}개`);
      초안.forEach((t, i) => say(`  ${String(i + 1).padStart(2)}. ${t.slice(0, 76)}`));
      찍음 = true;
      break;
    }
  }
  if (!찍음) say("⚠ 목록 줄을 못 읽었습니다 — 화면이 바뀌었을 수 있습니다");
  await browser.close();
})().catch((e) => { console.error("X", e.message); process.exit(1); });
