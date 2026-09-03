/**
 * 임시저장된 글에 **영상만 채워 넣습니다** — 2026-09-03
 *
 *   node scripts/naver-video-fill.js <블로그ID> <초안제목의 앞부분> <영상.mp4> [--title "영상제목"]
 *
 * ── 왜 따로 만들었나 ──
 * naver-draft.js 는 원고·사진까지 넣고 저장합니다. 영상만 매번 실패했습니다.
 * 그 파일은 지금 다른 세션이 고치는 중이라(CLAUDE.md 규칙 7) 건드리지 않고,
 * **찾아낸 길만 따로** 씁니다. 길이 확인되면 그쪽에 넘깁니다.
 *
 * ── 찾아낸 길 (2026-09-03 실측) ──
 * 동영상은 **두 단계**입니다. 이걸 몰라서 "단추는 눌리는데 창이 안 뜬다" 였습니다.
 *
 *   1단계  도구막대 button.se-video-toolbar-button   → `se-popup-video-upload` **레이어만** 열림
 *          (이 시점에 input[type=file] 은 문서 전체에 0개입니다 — 그래서 기다려도 안 옵니다)
 *   2단계  레이어 안 button.nvu_btn_append.nvu_local ("동영상 추가")  → **파일선택창이 뜸**
 *   3단계  chooser.accept([mp4])                      → 업로드 시작
 *   4단계  메타데이터 **제목은 필수(*)** — 안 채우면 완료가 안 눌립니다
 *   5단계  "완료" → 본문에 삽입
 *
 * 클릭은 전부 **좌표를 재서 진짜 마우스**로 합니다. 합성 클릭(el.click())은
 * 스마트에디터가 무시하고, window.open 도 팝업 차단에 걸립니다.
 *
 * 네이버 제한: 파일 10개 · 1GB · 15분. (우리 카드 영상은 5초·1MB 미만)
 *
 * ⚠️ 발행은 절대 누르지 않습니다. 임시저장까지입니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const args = process.argv.slice(2);
const [blogId, 제목앞, mp4] = args.filter((a) => !a.startsWith("--"));
const ti = args.indexOf("--title");
const 영상제목 = ti > -1 ? args[ti + 1] : null;
if (!blogId || !제목앞 || !mp4) {
  console.error('사용법: node naver-video-fill.js <블로그ID> "<초안 제목 앞부분>" <영상.mp4> [--title "영상제목"]');
  process.exit(2);
}
const MP4 = path.resolve(mp4).replace(/\\/g, "/");   // ⚠️ 역슬래시는 이스케이프에서 자주 뭉개집니다
if (!fs.existsSync(MP4)) { console.error("✖ 영상 파일이 없습니다: " + MP4); process.exit(2); }

const OUT = path.join(process.env.TEMP || ".", "video-fill");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => console.log(s);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1500,1000"],
    defaultViewport: null,
  });
  const page = await browser.newPage();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") }).catch(() => {});

  /** 좌표를 재서 진짜 마우스로 누릅니다. 못 찾으면 null. */
  const 눌러 = async (fn, arg) => {
    for (const f of page.frames()) {
      const c = await f.evaluate(fn, arg).catch(() => null);
      if (c) { await page.mouse.click(c.x, c.y, { delay: 70 }); return c; }
    }
    return null;
  };
  /** "작성 중인 글이 있습니다" 팝업 — 목록을 연 뒤에도 다시 뜹니다. */
  const 팝업닫기 = async () => {
    for (let i = 0; i < 5; i++) {
      const hit = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a")]
          .find((x) => /^취소$/.test((x.innerText || "").trim()) && x.getClientRects().length);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }).catch(() => null);
      if (!hit) return i;
      await page.mouse.click(hit.x, hit.y, { delay: 50 });
      await sleep(1100);
    }
    return 5;
  };

  try {
    await page.setViewport({ width: 1480, height: 950 });
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);
    await 팝업닫기();

    // ── 초안 열기 ──
    say("[1/6] 임시저장 목록에서 초안 찾기");
    await page.evaluate(() => {
      const vis = (n) => n.getClientRects().length;
      const open = [...document.querySelectorAll("button, a")].filter(vis)
        .find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()));
      const near = open && open.parentElement ? open.parentElement.querySelectorAll("button") : [];
      for (const b of near) if (b !== open) { b.click(); break; }
    });
    await sleep(3500);
    await 팝업닫기();
    const 열림 = await 눌러((앞) => {
      const rows = [...document.querySelectorAll("li")]
        .filter((x) => x.getClientRects().length && (x.innerText || "").includes(앞));
      if (!rows.length) return null;
      const t = rows[0].querySelector("a,button,[class*=title]") || rows[0];
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: (rows[0].innerText || "").split("\n")[0] };
    }, 제목앞);
    if (!열림) { say("✖ 그 제목의 초안을 못 찾았습니다"); return; }
    say(`      ${열림.t}`);
    await sleep(8000);
    await 팝업닫기();
    await sleep(4000);
    await shot("1-초안");

    // ── 영상 자리에 커서 세우기 ──
    say("[2/6] [영상: …] 자리에 커서 세우기");
    const 자리 = await 눌러(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const v = n.nodeValue || "";
        const at = Math.max(v.indexOf("[영상"), v.indexOf("⟦영상"));
        if (at < 0) continue;
        const rg = document.createRange();
        rg.setStart(n, at); rg.setEnd(n, Math.min(at + 1, v.length));
        const r = rg.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, txt: v.trim().slice(0, 40) };
      }
      return null;
    });
    say(자리 ? `      찾음: ${자리.txt}` : "      ⚠ 자리를 못 찾아 현재 커서 위치에 넣습니다");
    await sleep(1200);

    // ── 1단계: 도구막대 동영상 ──
    say("[3/6] 도구막대 [동영상] — 레이어만 열립니다");
    const b1 = await 눌러(() => {
      const b = document.querySelector("button.se-video-toolbar-button");
      if (!b || !b.getClientRects().length) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!b1) { say("✖ 동영상 단추를 못 찾았습니다"); return; }
    await sleep(5000);
    await shot("2-레이어");

    // ── 2단계: 레이어 안 "동영상 추가" → 파일창 ──
    say("[4/6] 레이어 안 [동영상 추가] — 여기서 파일창이 뜹니다");
    const chooser = page.waitForFileChooser({ timeout: 20000 }).then((c) => c).catch(() => null);
    const b2 = await 눌러(() => {
      const b = document.querySelector("button.nvu_btn_append.nvu_local")
        || [...document.querySelectorAll(".nvu_wrap button,.nvu_area_button button")]
             .find((n) => /동영상 추가/.test((n.innerText || "").trim()) && n.getClientRects().length);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!b2) { say("✖ 레이어 안 [동영상 추가] 를 못 찾았습니다"); return; }
    const ch = await chooser;
    if (!ch) { say("✖ 파일선택창이 안 떴습니다"); await shot("x-파일창없음"); return; }
    await ch.accept([MP4]);
    say(`      넘김: ${path.basename(MP4)}`);

    // ── 업로드 대기 ──
    say("[5/6] 업로드 기다리는 중");
    let 준비 = false;
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const st = await page.evaluate(() => {
        const w = document.querySelector(".nvu_wrap");
        if (!w) return null;
        const t = (w.innerText || "").replace(/\s+/g, " ");
        return { 로딩: /로딩중|추출중|업로드중/.test(t), 글: t.slice(0, 90) };
      }).catch(() => null);
      if (!st) break;
      if (i % 3 === 0) say(`      ${st.글}`);
      if (!st.로딩) { 준비 = true; break; }
    }
    say(`      업로드 ${준비 ? "끝난 것으로 보입니다" : "아직 진행 중일 수 있습니다"}`);
    await shot("3-업로드");

    // 제목은 필수입니다(*). 안 채우면 완료가 안 눌립니다.
    const 제목값 = 영상제목 || path.basename(MP4, ".mp4");
    const 넣음 = await page.evaluate((v) => {
      const inp = [...document.querySelectorAll(".nvu_wrap input[type=text], .nvu_wrap textarea")]
        .find((n) => n.getClientRects().length);
      if (!inp) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (set) set.call(inp, v); else inp.value = v;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, 제목값).catch(() => false);
    say(`      영상 제목 ${넣음 ? `"${제목값}" 입력` : "칸을 못 찾음"}`);
    await sleep(1500);

    // ── 완료 → 본문 삽입 ──
    say("[6/6] [완료] 눌러 본문에 삽입");
    const done = await 눌러(() => {
      const b = [...document.querySelectorAll(".nvu_wrap button, .se-popup button")]
        .find((n) => /^완료$/.test((n.innerText || "").trim()) && n.getClientRects().length && !n.disabled);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(done ? "      눌렀습니다" : "      ⚠ [완료] 가 아직 꺼져 있거나 없습니다");
    await sleep(7000);
    await shot("4-삽입");

    const 결과 = await page.evaluate(() => ({
      영상: document.querySelectorAll(".se-component.se-video, .se-video, video").length,
      표식: ((document.body.innerText || "").match(/[⟦\[]영상/g) || []).length,
    })).catch(() => ({}));
    say(`\n■ 본문 영상 ${결과.영상}개 · [영상] 표식 ${결과.표식}개 남음`);
    say(`   스크린샷 → ${OUT}`);
    say("   ⚠ 저장은 누르지 않았습니다 — 확인하시고 저장하십시오.");
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
    await shot("x-오류");
  } finally {
    await sleep(2000);
    await browser.close();
  }
})();
