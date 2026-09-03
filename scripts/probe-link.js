/**
 * 네이버 블로그 **링크 카드 넣는 길 찾기** — 2026-09-03
 *
 *   node scripts/probe-link.js <블로그ID>
 *
 * ── 왜 ──
 * 주소만 있는 줄 끝에서 엔터를 쳐도 **카드가 0개**였습니다
 * (저장본 실측: 주소줄 4개 · 링크카드 0개). 대표는 "링크 말고 **링크넣기** 해서 박스로"
 * 라고 하셨습니다 — 도구막대에 그 단추가 있다는 뜻입니다.
 *
 * 1차 탐침에서 찾았습니다:
 *   button.se-oglink-toolbar-button  = "링크 추가"   ← 이게 카드(og-link)를 만든다
 *   button.se-link-toolbar-button    = "링크 입력"   ← 이건 글자에 링크 거는 것
 *
 * 이 탐침은 「링크 추가」를 눌러 **뜨는 레이어·입력칸·단추**를 다 적습니다.
 *
 * ⚠️ 저장도 발행도 누르지 않습니다. 관찰만 하고 창을 닫습니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
if (!blogId) { console.log("사용: node scripts/probe-link.js <블로그ID>"); process.exit(1); }

const OUT = path.join(process.env.TEMP || ".", "probe-link");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;

(async () => {
  const 프로필 = `C:\\dev\\profiles\\naver_${blogId}`;
  const browser = await puppeteer.launch({
    headless: false, defaultViewport: null,
    userDataDir: fs.existsSync(프로필) ? 프로필 : undefined,
    args: ["--start-maximized", "--no-first-run"],
  });
  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`,
      { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(6000);

    // "작성 중인 글이 있습니다" 팝업 — 안 치우면 아무것도 안 눌립니다
    for (let i = 0; i < 4; i++) {
      const 눌렀나 = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button, a")) {
          const t = (b.textContent || "").trim();
          if (t === "취소" || t === "닫기") { b.click(); return t; }
        }
        return null;
      }).catch(() => null);
      if (!눌렀나) break;
      await sleep(900);
    }

    // 본문을 한 번 클릭해 커서를 세웁니다 — 커서가 없으면 도구막대가 안 먹습니다
    for (const f of page.frames()) {
      const 됐나 = await f.evaluate(() => {
        const p = document.querySelector(".se-text-paragraph");
        if (!p) return false;
        p.scrollIntoView({ block: "center" });
        return true;
      }).catch(() => false);
      if (됐나) break;
    }
    await sleep(600);

    let 눌렀다 = false;
    for (const f of page.frames()) {
      눌렀다 = await f.evaluate(() => {
        const b = document.querySelector("button.se-oglink-toolbar-button");
        if (!b) return false;
        b.click();
        return true;
      }).catch(() => false);
      if (눌렀다) { say("■ 「링크 추가」 눌렀습니다"); break; }
    }
    if (!눌렀다) say("✖ se-oglink-toolbar-button 을 못 찾았습니다");
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, "링크레이어.png") }).catch(() => {});

    for (const f of page.frames()) {
      const 본것 = await f.evaluate(() => {
        const 보이나 = (e) => e.offsetParent !== null || e.getClientRects().length > 0;
        const 레이어 = [...document.querySelectorAll("[class*='oglink'],[class*='popup'],[class*='layer']")]
          .filter(보이나).map((e) => String(e.className).slice(0, 58)).slice(0, 8);
        const 입력 = [...document.querySelectorAll("input,textarea")].filter(보이나)
          .map((e) => ({ t: e.type || "textarea", ph: e.placeholder || "", c: String(e.className).slice(0, 44) }));
        const 단추 = [...document.querySelectorAll("button")].filter(보이나)
          .filter((e) => /확인|검색|추가|적용|등록/.test(e.textContent || ""))
          .map((e) => ({ t: (e.textContent || "").trim().slice(0, 14), c: String(e.className).slice(0, 44) }));
        return { 레이어, 입력, 단추 };
      }).catch(() => null);
      if (본것 && (본것.레이어.length || 본것.입력.length)) {
        say(`\n■ ${f.url().slice(0, 58)}`);
        본것.레이어.forEach((c) => say(`   레이어: ${c}`));
        본것.입력.forEach((i) => say(`   입력칸: type=${i.t} 안내="${i.ph}" · ${i.c}`));
        본것.단추.forEach((b) => say(`   단추: "${b.t}" · ${b.c}`));
      }
    }
    say(`\n스크린샷 → ${OUT}`);
    say("※ 아무것도 저장하지 않았습니다.");
  } finally {
    await browser.close();
  }
})();
