/**
 * 네이버 블로그 **사진 설명(회색칸) 넣는 길 찾기** — 2026-09-03
 *
 *   node scripts/probe-caption.js <블로그ID> [초안번호=1]
 *
 * ── 왜 ──
 * 대표 지시: "사진 출처 넣을 때는 **사진 밑에 회색칸**에 넣어. 본문에 넣지 말고."
 * 지금은 `▲ 출처 : …` 을 **본문 문단**으로 넣고 있어 반려됐습니다.
 * 사진 부품 안에 설명 칸이 따로 있는데, 그 자리를 정확히 몰라 추측하지 않고 찍어 봅니다.
 *
 * 뱉는 것: 사진 부품 하나의 안쪽 구조 · 설명 칸으로 보이는 요소의 클래스와 안내문구
 *
 * ⚠️ 저장도 발행도 누르지 않습니다. 관찰만 하고 창을 닫습니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
const 번째 = Number(process.argv[3] || 1);
if (!blogId) { console.log("사용: node scripts/probe-caption.js <블로그ID> [초안번호]"); process.exit(1); }

const OUT = path.join(process.env.TEMP || ".", "probe-caption");
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

    /**
     * ⚠️ 팝업은 **목록을 연 뒤에도 다시 뜹니다** (2026-09-03에 이것 때문에 빈 편집기를 읽고
     *    "사진 0장"이라고 잘못 보고했습니다). 그래서 단계마다 치웁니다.
     */
    const 팝업치우기 = async () => {
      for (let i = 0; i < 4; i++) {
        const t = await page.evaluate(() => {
          for (const b of document.querySelectorAll("button, a")) {
            const t = (b.textContent || "").trim();
            if (t === "취소" || t === "닫기") { b.click(); return t; }
          }
          return null;
        }).catch(() => null);
        if (!t) break;
        await sleep(800);
      }
    };
    await 팝업치우기();

    // 임시저장 목록에서 N번째를 엽니다
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button, a")) {
        if (/저장\s*\d+|임시저장/.test((b.textContent || "").trim())) { b.click(); return; }
      }
    }).catch(() => {});
    await sleep(2500);
    await 팝업치우기();
    await page.evaluate((n) => {
      const items = [...document.querySelectorAll("li")]
        .filter((x) => /\d{4}\.\d{2}\.\d{2}/.test(x.textContent || ""))
        .filter((x) => !x.querySelector("li"));
      const row = items[n - 1];
      if (!row) return;
      const a = row.querySelector("a, button, span");
      (a || row).click();
    }, 번째).catch(() => {});
    await sleep(6000);
    await 팝업치우기();
    await page.screenshot({ path: path.join(OUT, "01-초안.png") }).catch(() => {});

    for (const f of page.frames()) {
      const 본것 = await f.evaluate(() => {
        const img = document.querySelector(".se-component.se-image, .se-image");
        if (!img) return null;
        const 안쪽 = [...img.querySelectorAll("*")]
          .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 46)}`)
          .filter((s) => /caption|text|placeholder|figcaption/i.test(s))
          .slice(0, 14);
        const 설명칸 = [...img.querySelectorAll("*")]
          .filter((e) => /사진 설명|설명을 입력/.test(e.getAttribute("data-placeholder") || e.textContent || ""))
          .map((e) => ({
            tag: e.tagName.toLowerCase(),
            cls: String(e.className).slice(0, 50),
            ph: e.getAttribute("data-placeholder") || "",
            편집가능: e.getAttribute("contenteditable"),
          })).slice(0, 6);
        return { 사진부품: String(img.className).slice(0, 60), 안쪽, 설명칸, 사진수:
          document.querySelectorAll(".se-component.se-image, .se-image").length };
      }).catch(() => null);
      if (본것) {
        say(`\n■ ${f.url().slice(0, 58)}`);
        say(`   사진 부품 ${본것.사진수}개 · 첫 부품 클래스: ${본것.사진부품}`);
        본것.안쪽.forEach((s) => say(`   안쪽: ${s}`));
        본것.설명칸.forEach((s) => say(`   ★ 설명칸: <${s.tag}> ${s.cls} · 안내="${s.ph}" · contenteditable=${s.편집가능}`));
        break;
      }
    }
    say(`\n스크린샷 → ${OUT}`);
    say("※ 아무것도 저장하지 않았습니다.");
  } finally {
    await browser.close();
  }
})();
