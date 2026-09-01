/**
 * 네이버 로그인 창 열기 — 2026-09-02
 *
 *   node scripts/naver-login.js <블로그ID>
 *
 * ⚠️ **왜 따로 필요한가**
 * 자동화는 사장님이 평소 쓰시는 크롬이 아니라 **별도 프로필**(C:\dev\profiles\naver_<블로그ID>)로 돕니다.
 * 그래서 평소 크롬에서 네이버에 로그인해도 자동화 쪽은 여전히 로그아웃 상태입니다(실측 2026-09-02).
 * 이 창에서 로그인하셔야 자동화가 씁니다.
 *
 * 로그인하실 때 **"로그인 상태 유지"를 켜** 주세요. 안 켜면 창을 닫는 순간 풀립니다.
 * 로그인이 확인되면 이 스크립트가 **쿠키를 저장하며 곱게** 창을 닫습니다.
 */
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer"));

const blogId = process.argv[2];
if (!blogId) { console.log("사용: node scripts/naver-login.js <블로그ID>"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    // ⚠️ 역슬래시는 두 번 — `\n`이 줄바꿈으로 읽혀 엉뚱한 폴더에 프로필이 생깁니다(실측 2026-09-02).
    headless: false, timeout: 90000, userDataDir: `C:\\dev\\profiles\\naver_${blogId}`, defaultViewport: null,
    args: ["--disable-blink-features=AutomationControlled", "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble", "--window-size=1000,760", "--window-position=200,80", "--lang=ko-KR,ko"],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("https://nid.naver.com/nidlogin.login", { waitUntil: "domcontentloaded", timeout: 45000 });

  console.log(`\n▶ ${blogId} 로그인 창을 열었습니다.`);
  console.log("   ① 아이디·비밀번호를 넣고");
  console.log("   ② **로그인 버튼 위의 '로그인 상태 유지'를 켜신 다음**");
  console.log("   ③ 로그인하세요. 창은 제가 알아서 닫습니다.\n");

  // 로그인될 때까지 기다립니다 (최대 5분).
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const done = await page.evaluate(() => !/nidlogin/.test(location.href)).catch(() => false);
    if (done) break;
  }
  // 글쓰기까지 되는지 확인합니다 — 로그인만 되고 권한이 없으면 소용없습니다.
  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await sleep(6000);
  const ok = !/nidlogin/.test(page.url());
  console.log(ok ? "✔ 로그인됐습니다. 이어서 작업합니다." : "✗ 아직 로그인이 안 됐습니다. 다시 실행해 주세요.");

  // 쿠키가 디스크에 써지도록 곱게 닫습니다.
  try { await page.goto("about:blank", { timeout: 8000 }); } catch {}
  await sleep(1500);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
