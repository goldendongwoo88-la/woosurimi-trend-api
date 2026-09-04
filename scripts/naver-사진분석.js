/**
 * 사장님이 넣으신 사진을 **읽기만** 합니다 — 2026-09-04
 *
 *   node scripts/naver-사진분석.js <블로그ID> [몇번째 글:1]
 *
 * ⚠️⚠️ **절대 저장하지 않습니다.** 예약 발행이 걸린 글을 건드리면 안 됩니다.
 *      (사장님 지시 2026-09-04: "예약발행이 있다면 확인해보고 있는건 수정 X")
 *      저장·발행 단추를 누르는 코드가 이 파일에 없습니다. 읽고 닫기만 합니다.
 *
 * 보는 것
 *   목록  : 예약 / 임시저장 구분과 제목·시각
 *   글 안 : 사진 개수 · 실제 픽셀 크기 · 주소 · 캡션(사진 설명) · 영상 유무
 *
 * 왜 크기를 보나 — 사진을 어디서 어떻게 가져왔는지가 크기에 남습니다.
 *   인스타 격자에서 긁으면 1080~1440px, 글을 열어 캐러셀에서 받으면 2316~3088px 입니다.
 */
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
const 몇번째 = parseInt(process.argv[3] || "1", 10);
if (!blogId) { console.error("사용법: node scripts/naver-사진분석.js <블로그ID> [몇번째:1]"); process.exit(2); }
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

  // ── 저장 목록 열기 (진짜 마우스로 — 합성 클릭은 무시됩니다)
  let 자리 = null;
  for (const f of page.frames()) {
    자리 = await f.evaluate(() => {
      const el = [...document.querySelectorAll("button,a,span,div")].find((x) =>
        /^저장\s*\d+$/.test((x.textContent || "").trim()) && x.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: el.textContent.trim() };
    }).catch(() => null);
    if (자리) break;
  }
  if (!자리) { say("⚠ 저장 단추를 못 찾았습니다"); await browser.close(); return; }
  say(`저장 단추: ${자리.t}`);
  await page.mouse.click(자리.x, 자리.y);
  await sleep(4500);

  // ── 목록 읽기
  let 줄들 = [], 목록프레임 = null;
  for (const f of page.frames()) {
    const r = await f.evaluate(() =>
      [...document.querySelectorAll("li")].map((e, i) => {
        const t = (e.innerText || "").replace(/\s+/g, " ").trim();
        const b = e.getBoundingClientRect();
        return { i, t, x: b.x + b.width / 2, y: b.y + 20, 보임: b.width > 0 };
      }).filter((o) => o.보임 && o.t.length > 8 && /\d{2}[.:]\d{2}/.test(o.t))
    ).catch(() => []);
    if (r.length) { 줄들 = r; 목록프레임 = f; break; }
  }
  if (!줄들.length) { say("⚠ 목록을 못 읽었습니다"); await browser.close(); return; }

  const 예약 = 줄들.filter((o) => /예약/.test(o.t));
  const 초안 = 줄들.filter((o) => !/예약/.test(o.t));
  say(`\n■ 예약 ${예약.length}개`);
  예약.forEach((o, i) => say(`  ${String(i + 1).padStart(2)}. ${o.t.slice(0, 74)}`));
  say(`\n■ 임시저장 ${초안.length}개`);
  초안.forEach((o, i) => say(`  ${String(i + 1).padStart(2)}. ${o.t.slice(0, 74)}`));

  // ── 고른 글 열기 (예약이 있으면 예약부터)
  const 후보 = 예약.length ? 예약 : 초안;
  const 고름 = 후보[Math.min(몇번째 - 1, 후보.length - 1)];
  if (!고름) { say("⚠ 열 글이 없습니다"); await browser.close(); return; }
  say(`\n■ 여는 글: ${고름.t.slice(0, 60)}`);
  await 목록프레임.evaluate((i) => {
    const li = [...document.querySelectorAll("li")].filter((e) => e.getBoundingClientRect().width > 0)[i];
    if (li) li.scrollIntoView({ block: "center" });
  }, 후보.indexOf(고름)).catch(() => {});
  await sleep(600);
  await page.mouse.click(고름.x, 고름.y);
  await sleep(9000);

  // ── 사진 세기 (읽기만)
  for (const f of page.frames()) {
    const 결과 = await f.evaluate(() => {
      const im = [...document.querySelectorAll(".se-component img, .se-image-resource")]
        .filter((i) => i.naturalWidth > 60);
      const cap = [...document.querySelectorAll(".se-caption")]
        .map((c) => (c.innerText || "").trim()).filter(Boolean);
      const 영상 = document.querySelectorAll(".se-video, .se-module-video").length;
      const 소제목 = document.querySelectorAll("span.se-fs38, span[style*='38px']").length;
      const 글자 = (document.querySelector(".se-main-container") || {}).innerText || "";
      return {
        사진: im.map((i) => ({ w: i.naturalWidth, h: i.naturalHeight, src: (i.src || "").split("?")[0].slice(-46) })),
        캡션: cap, 영상, 소제목, 글자수: 글자.replace(/\s/g, "").length,
      };
    }).catch(() => null);
    if (결과 && 결과.사진.length) {
      say(`\n  글자 ${결과.글자수}자 · 사진 ${결과.사진.length}장 · 영상 ${결과.영상} · 소제목 ${결과.소제목}`);
      say(`\n  ── 사진 크기 (여기에 '어떻게 가져왔는지'가 남습니다) ──`);
      결과.사진.forEach((p, i) =>
        say(`   ${String(i + 1).padStart(2)}. ${String(p.w).padStart(4)}x${String(p.h).padStart(4)}  ${p.src}`));
      if (결과.캡션.length) {
        say(`\n  ── 사진 설명칸 ${결과.캡션.length}개 ──`);
        결과.캡션.forEach((c, i) => say(`   ${i + 1}. ${c.slice(0, 60)}`));
      } else say(`\n  ── 사진 설명칸 없음 ──`);
      break;
    }
  }

  say("\n(저장하지 않고 닫습니다)");
  await browser.close();
})().catch((e) => { console.error("X", e.message); process.exit(1); });
