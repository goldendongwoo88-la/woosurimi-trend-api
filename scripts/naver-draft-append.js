/**
 * **이미 있는 임시저장 글**을 열어 사진 밑에 원고를 이어 쓰고 다시 저장합니다 — 2026-09-05
 *
 *   node scripts/naver-draft-append.js <블로그ID> "<초안 제목 앞부분>" <원고.md> [--보기]
 *
 * ── 왜 만들었나 ──
 * `naver-draft.js` 는 **늘 새 글을 만듭니다.** 사장님이 인스타 화면을 캡쳐해 넣어 두신
 * 초안이 이미 있는데 거기다 새로 만들면 **같은 글이 두 개**가 됩니다.
 * 사장님 지시(2026-09-05): "사진은 내가 넣어놨으니 사진밑에 원고 넣어서 임시저장하면 되자나"
 *
 * ── 지키는 것 ──
 * · 있는 사진을 **건드리지 않습니다.** 맨 끝으로 커서를 옮겨 뒤에만 씁니다
 * · 제목은 초안에 있는 것을 **그대로 둡니다** (원고 첫 줄로 덮어쓰지 않습니다)
 * · 저장은 **임시저장만**. 발행 단추는 누르지 않습니다
 *
 * ── 걸렸던 것 ──
 * ⚠️ 합성 클릭은 스마트에디터가 무시합니다. 진짜 마우스·키보드로만 됩니다
 * ⚠️ 저장 목록은 `저장 NN` 단추를 눌러야 열립니다
 * ⚠️ 크롬 프로필은 하나뿐이라 다른 작업이 돌고 있으면 통째로 실패합니다
 */
const fs = require("fs");
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const args = process.argv.slice(2);
const 보기 = args.includes("--보기");
const [blogId, 제목앞, 원고경로] = args.filter((a) => !a.startsWith("--"));
if (!blogId || !제목앞 || !원고경로) {
  console.error('사용법: node scripts/naver-draft-append.js <블로그ID> "<초안 제목 앞부분>" <원고.md>');
  process.exit(2);
}
if (!fs.existsSync(원고경로)) { console.error("원고 파일이 없습니다: " + 원고경로); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;

/** 원고에서 본문만 뽑습니다 — 제목 줄과 사진·영상 자리표시는 뺍니다. */
function 본문만(md) {
  const 줄 = fs.readFileSync(md, "utf8").split("\n");
  const 몸 = 줄[0].startsWith("# ") ? 줄.slice(1) : 줄;
  return 몸
    .filter((l) => !/^\[(사진|영상):/.test(l.trim()))   // 사진은 이미 들어 있습니다
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

(async () => {
  const 원고 = 본문만(원고경로);
  say(`[1/5] 크롬 여는 중 (프로필: naver_${blogId})`);
  const browser = await puppeteer.launch({
    headless: false, defaultViewport: null,
    // ⚠️ 초안을 열면 편집기가 다시 그려지느라 오래 걸립니다.
    //    기본 30초로는 `Runtime.callFunctionOn timed out` 이 납니다(2026-09-05 실측).
    protocolTimeout: 180000,
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--start-maximized", "--disable-blink-features=AutomationControlled"],
  });
  // 클립보드 쓰기 권한을 미리 줍니다 — 안 그러면 붙여넣기가 조용히 실패합니다
  await browser.defaultBrowserContext()
    .overridePermissions("https://blog.naver.com", ["clipboard-read", "clipboard-write"])
    .catch(() => {});
  const page = (await browser.pages())[0] || (await browser.newPage());
  /**
   * ⚠️ 네이버는 이동 중에 한 번 더 넘깁니다. 그러면 `Navigating frame was detached` 가 납니다.
   *    오류가 나도 화면은 떠 있으므로 **삼키고 편집기가 그려졌는지로 판단**합니다.
   */
  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`,
    { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => {
      say(`      (이동 중 넘어감: ${String(e.message).slice(0, 40)} — 계속합니다)`);
    });
  await sleep(9000);
  /**
   * ⚠️ 편집기는 **iframe 안**입니다. 바깥 페이지의 innerText 로 판정하면
   *    멀쩡히 떠 있는데도 "안 떴다"가 됩니다(2026-09-05에 두 번 헛돌았습니다).
   *    프레임 어딘가에 편집기 표시가 있는지로 봅니다.
   */
  let 떴나 = false;
  for (let i = 0; i < 6 && !떴나; i++) {
    for (const f of page.frames()) {
      const r = await f.evaluate(() =>
        Boolean(document.querySelector(".se-main-container, .se-content, .se-text-paragraph"))
        || document.body.innerText.length > 300).catch(() => false);
      if (r) { 떴나 = true; break; }
    }
    if (!떴나) await sleep(3000);
  }
  if (!떴나) { console.error("X 글쓰기 화면이 안 떴습니다"); await browser.close(); process.exit(1); }

  // ── 2) 저장 목록 열기
  say("[2/5] 저장 목록 여는 중");
  /**
   * ⚠️ 목록은 **`저장` 단추의 형제 단추**를 눌러야 열립니다.
   *    `저장99+` 를 직접 누르면 목록이 아니라 **저장**이 됩니다 —
   *    2026-09-05 에 제가 그걸 눌러 빈 초안을 하나 만들었습니다.
   *    naver-draft-verify.js 가 쓰는 **검증된 방식**을 그대로 가져옵니다.
   */
  // ⚠️ 단추가 **iframe 안**에 있습니다. 메인 프레임만 보면 "못 찾음"이 납니다(2026-09-05).
  let 열림 = "저장 단추 못 찾음", 목록프레임 = null;
  for (const f of page.frames()) {
    const r = await f.evaluate(() => {
      const vis = (n) => n.offsetParent !== null || (n.getClientRects && n.getClientRects().length);
      const open = [...document.querySelectorAll("button, a")].filter(vis)
        .find((b) => /^저장(\s*\d+\+?)?$/.test((b.textContent || "").trim()));
      if (!open) return null;
      const near = open.parentElement ? open.parentElement.querySelectorAll("button") : [];
      for (const b of near) if (b !== open) { b.click(); return "목록 단추 누름"; }
      return "형제 단추 없음";
    }).catch(() => null);
    if (r) { 열림 = r; 목록프레임 = f; break; }
  }
  say(`      ${열림}`);
  if (열림 !== "목록 단추 누름") { console.error("X 목록을 못 열었습니다"); await browser.close(); process.exit(1); }
  await sleep(4500);

  // ── 3) 제목으로 그 초안 고르기
  say(`[3/5] 초안 고르는 중 — "${제목앞}"`);
  /**
   * ⚠️ 목록 줄(li)은 **날짜가 있는 것**만 초안입니다.
   * ⚠️ 줄 자체를 누르면 아무 일도 안 일어납니다 — 줄 안의 **제목 링크**를 눌러야 합니다.
   * ⚠️ 화면 밖에 있으면 클릭이 허공에 떨어집니다 — 먼저 끌어옵니다.
   * ⚠️ DOM click() 은 무시됩니다. 좌표를 재서 **진짜 마우스**로 누릅니다.
   */
  const 뒤질곳 = 목록프레임 || page;
  /**
   * ⚠️⚠️ **좌표로 누르면 안 됩니다.** 목록이 iframe 안이라 프레임 좌표와 페이지 좌표가
   *      다르고, `page.mouse.click` 은 페이지 좌표라 **빗나갑니다**
   *      (2026-09-05 실측: 눌린 것처럼 보였는데 본문이 0자였습니다).
   *      **손잡이를 잡아 `.click()`** 하면 퍼펫티어가 프레임 위치를 알아서 더해줍니다.
   */
  const 미리 = await 뒤질곳.evaluate((앞) => {
    const rows = [...document.querySelectorAll("li")]
      .filter((x) => /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""));
    const 맞 = rows.filter((e) => (e.innerText || "").replace(/\s+/g, " ").includes(앞));
    if (맞.length === 1) 맞[0].scrollIntoView({ block: "center" });
    return { 개수: 맞.length,
             글: 맞.length === 1 ? (맞[0].innerText || "").replace(/\s+/g, " ").slice(0, 60) : "",
             보인것: rows.slice(0, 8).map((e) => (e.innerText || "").replace(/\s+/g, " ").slice(0, 40)) };
  }, 제목앞).catch(() => null);
  const 자리 = 미리;
  let 골랐나 = false;
  if (자리 && 자리.개수 === 1) {
    say(`      찾음: ${자리.글}`);
    await sleep(900);
    const 손 = await 뒤질곳.evaluateHandle((앞) => {
      const rows = [...document.querySelectorAll("li")]
        .filter((x) => /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""));
      const t = rows.find((e) => (e.innerText || "").replace(/\s+/g, " ").includes(앞));
      if (!t) return null;
      // 줄 자체가 아니라 **줄 안의 제목 링크**를 눌러야 열립니다
      return t.querySelector("a,button,[class*=title],[class*=Title]") || t;
    }, 제목앞).catch(() => null);
    const 링크 = 손 && 손.asElement();
    if (!링크) { console.error("X 제목 링크를 못 잡았습니다"); await browser.close(); process.exit(1); }
    await 링크.click({ delay: 60 });
    골랐나 = true;
  } else if (자리 && 자리.개수 > 1) {
    console.error(`X 제목이 ${자리.개수}개 맞습니다 — 더 길게 주십시오 (엉뚱한 글에 쓰면 안 됩니다)`);
    await browser.close(); process.exit(1);
  } else if (자리 && 자리.보인것) {
    say("      목록에 보이는 것:");
    자리.보인것.forEach((t) => say("        · " + t));
  }
  if (!골랐나) {
    // 못 찾으면 목록에 무엇이 보이는지 찍어 둡니다 — 짐작으로 고치지 않기 위해서입니다
    for (const f of page.frames()) {
      const 줄 = await f.evaluate(() =>
        [...document.querySelectorAll("li,tr,div[role='listitem']")]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => (e.innerText || "").replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 4 && t.length < 90).slice(0, 12)).catch(() => []);
      if (줄.length) { say("      목록에 보이는 것:"); 줄.forEach((t) => say("        · " + t.slice(0, 70))); break; }
    }
    console.error("X 그 제목의 초안을 못 찾았습니다");
    await browser.close(); process.exit(1);
  }
  // 초안이 다 그려질 때까지 기다립니다 — 덜 그려진 채로 만지면 시간 초과가 납니다
  await sleep(12000);
  for (let i = 0; i < 8; i++) {
    const 준비 = await page.frames().some(() => true) &&
      await (page.frames().find((f) => /PostWriteForm|editor/i.test(f.url())) || page.mainFrame())
        .evaluate(() => document.querySelectorAll(".se-text-paragraph").length > 0).catch(() => false);
    if (준비) break;
    await sleep(3000);
  }

  // ── 4) 맨 끝으로 가서 이어 쓰기
  say("[4/5] 사진 밑에 원고 넣는 중");
  /**
   * ⚠️⚠️ **프레임을 주소로 찾으면 안 됩니다.** 초안을 열면 편집기가 다시 그려지면서
   *      주소가 안 바뀌거나 프레임이 새로 생깁니다. 그러면 빈 프레임을 붙잡고
   *      "본문 0자" 로 읽습니다(2026-09-05에 두 번 이걸로 멈췄습니다).
   *      **문단이 실제로 들어 있는 프레임**을 찾습니다.
   */
  let frameE = null;
  for (let i = 0; i < 10 && !frameE; i++) {
    for (const f of page.frames()) {
      const n = await f.evaluate(() =>
        document.querySelectorAll(".se-text-paragraph").length).catch(() => 0);
      if (n > 0) { frameE = f; say(`      편집기 프레임 찾음 — 문단 ${n}개`); break; }
    }
    if (!frameE) await sleep(3000);
  }
  if (!frameE) { console.error("X 편집기 프레임을 못 찾았습니다"); await browser.close(); process.exit(1); }
  const 손잡이 = await frameE.evaluateHandle(() => {
    const inTitle = (n) => Boolean(n.closest(".se-documentTitle"));
    const ps = [...document.querySelectorAll(".se-text-paragraph")].filter((n) => !inTitle(n));
    return ps.length ? ps[ps.length - 1] : document.querySelector(".se-main-container") || document.body;
  });
  const 끝 = 손잡이.asElement();
  if (!끝) { console.error("X 본문 끝을 못 찾았습니다"); await browser.close(); process.exit(1); }
  await 끝.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await sleep(500);
  await 끝.click({ delay: 60 });
  await sleep(800);

  // 진짜 키보드로 문서 맨 끝으로
  await page.keyboard.down("Control");
  await page.keyboard.press("End");
  await page.keyboard.up("Control");
  await sleep(600);
  await page.keyboard.press("Enter");
  await sleep(400);

  // 클립보드에 담아 진짜 Ctrl+V — 합성 붙여넣기는 편집기가 무시합니다
  await page.evaluate(async (글) => {
    await navigator.clipboard.writeText(글);
  }, 원고).catch(() => {});
  await sleep(500);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyV");
  await page.keyboard.up("Control");
  await sleep(3500);

  const 잰것 = await frameE.evaluate(() => {
    const t = (document.querySelector(".se-main-container") || {}).innerText || "";
    return { 글자: t.replace(/\s/g, "").length,
             사진: document.querySelectorAll(".se-component.se-image").length };
  }).catch(() => ({ 글자: -1, 사진: -1 }));
  say(`      들어간 것 — 글자 ${잰것.글자}자 · 사진 ${잰것.사진}장 (사진은 원래 있던 것)`);
  if (잰것.글자 < 200) {
    console.error("X 본문이 거의 안 들어갔습니다. 저장하지 않고 멈춥니다.");
    if (!보기) await browser.close();
    process.exit(1);
  }

  // ── 5) 임시저장 (발행 아님)
  say("[5/5] 임시저장 누르는 중");
  let 저장함 = false;
  for (const f of page.frames()) {
    const 자리 = await f.evaluate(() => {
      const el = [...document.querySelectorAll("button,a")].find((x) =>
        /^저장$/.test((x.textContent || "").trim()) && x.getBoundingClientRect().width > 0);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }).catch(() => null);
    if (자리) { await page.mouse.click(자리.x, 자리.y); 저장함 = true; break; }
  }
  await sleep(4000);
  say(저장함 ? "임시저장까지 끝났습니다." : "⚠ 저장 단추를 못 찾았습니다 — 화면을 확인하십시오");
  if (!보기) await browser.close();
})().catch((e) => { console.error("X", e.message); process.exit(1); });
