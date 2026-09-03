/**
 * 임시저장 결과를 **직접 열어서 세어 봅니다** — 2026-09-03
 *
 *   node scripts/naver-draft-verify.js <블로그ID> [몇번째 초안:1]
 *
 * ── 왜 만들었나 ──
 * naver-draft.js 는 "저장" 을 누른 뒤 목록이 늘어난 것까지만 봅니다.
 * 그런데 **저장은 됐는데 내용이 빈** 사고가 실제로 있었습니다(2026-08-31).
 * 그리고 사장님 완성 기준 9개(feedback_blog_writing_rules)는
 * 저장 여부가 아니라 **열어서 세어야** 알 수 있습니다.
 *
 * 세는 것
 *   제목 / 문단 수 / 글자 수 / 사진 수 / 영상 수 / 소제목(se-fs38) 수
 *   ⟦사진N⟧ 표식 잔존 / 인용구 / 링크
 *
 * ⚠️ 발행은 절대 누르지 않습니다. 읽기만 합니다.
 */
const path = require("path");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2];
const nth = Number(process.argv[3] || 1);
if (!blogId) { console.error("사용법: node naver-draft-verify.js <블로그ID> [n]"); process.exit(2); }

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1500,1000"],
    defaultViewport: null,
  });
  try {
    // ⚠️ browser.pages()[0] 은 프로필을 이어 열 때 **닫히는 중인 탭**일 수 있습니다.
    //    거기에 goto 하면 "Navigating frame was detached" 로 죽습니다(2026-09-03 실측).
    //    새 탭을 열어서 씁니다.
    const page = await browser.newPage();
    await page.setViewport({ width: 1480, height: 950 });
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));

    // "작성 중인 글이 있습니다" 팝업이 뜨면 취소를 눌러야 편집기가 열립니다.
    for (let i = 0; i < 4; i++) {
      const closed = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a")]
          .find((x) => /취소|닫기/.test(x.innerText || ""));
        if (b) { b.click(); return true; }
        return false;
      }).catch(() => false);
      if (!closed) break;
      await new Promise((r) => setTimeout(r, 900));
    }

    // 헤더의 "저장 | 숫자" 에서 숫자 쪽이 임시저장 목록 버튼입니다.
    await page.evaluate(() => {
      const el = [...document.querySelectorAll("button,a,span")]
        .find((x) => /^\d+$/.test((x.innerText || "").trim()) && x.closest("[class*=header],[class*=Header]"));
      if (el) el.click();
    });
    await new Promise((r) => setTimeout(r, 2500));

    /**
     * n 번째 초안을 엽니다.
     * ⚠️ 목록 줄(div)을 누르면 **아무 일도 안 일어나고 빈 새 글 화면이 남습니다**(2026-09-03 실측).
     *    실제로 눌러야 하는 것은 줄 안의 **제목 링크/버튼**입니다.
     *    빈 에디터를 보고 "본문이 0자"라고 보고하면 안 됩니다 — 불러오기가 실패한 것뿐입니다.
     */
    const opened = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll("li")]
        .filter((x) => /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""));
      const t = rows[n - 1];
      if (!t) return null;
      const title = (t.innerText || "").split("\n")[0];
      const hit = t.querySelector("a,button,[class*=title],[class*=Title]") || t;
      hit.click();
      return title;
    }, nth);
    await new Promise((r) => setTimeout(r, 12000));

    /**
     * 본문은 `about:blank` 자식 프레임의 contenteditable BODY 입니다.
     * URL 로 고르면 프레임이 여러 개라 틀립니다 — **글자가 가장 많은 곳**을 본문으로 봅니다.
     */
    let body = page.mainFrame(), best = -1;
    for (const f of page.frames()) {
      const len = await f.evaluate(() => {
        const e = document.querySelector("[contenteditable]");
        return e ? (e.innerText || "").length : -1;
      }).catch(() => -1);
      if (len > best) { best = len; body = f; }
    }
    if (best <= 0) {
      console.log(`\n■ ${blogId} · ${nth}번째 초안 — **불러오기 실패**`);
      console.log(`  목록에서 고른 것 : ${opened || "(못 고름)"}`);
      console.log("  에디터가 비어 있습니다. 초안이 안 열린 것이지 내용이 없는 게 아닙니다.");
      return;
    }

    const r = await body.evaluate(() => {
      const root = document.querySelector("[contenteditable]") || document.body;
      const txt = root.innerText || "";
      const paras = txt.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      return {
        글자수: txt.replace(/\s/g, "").length,
        문단수: paras.length,
        사진: root.querySelectorAll("img").length,
        영상: root.querySelectorAll("video,[class*=video],[class*=Video]").length,
        소제목38: root.querySelectorAll(".se-fs38,[class*=se-fs38]").length,
        인용구: root.querySelectorAll("[class*=quotation],[class*=Quotation]").length,
        표식잔존: (txt.match(/⟦사진\d+⟧/g) || []).length,
        긴문단: paras.filter((p) => p.replace(/\s/g, "").length > 30).length,
      };
    }).catch((e) => ({ 오류: String(e).slice(0, 120) }));

    const title = await page.evaluate(() => {
      const t = document.querySelector(".se-documentTitle");
      return t ? (t.innerText || "").trim().slice(0, 60) : "(못 읽음)";
    }).catch(() => "(못 읽음)");

    console.log(`\n■ ${blogId} · ${nth}번째 초안`);
    console.log(`  목록에서 고른 것 : ${opened || "(못 고름)"}`);
    console.log(`  제목칸           : ${title}`);
    for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(9)}: ${v}`);
    console.log("\n  ※ 발행은 누르지 않았습니다. 읽기만 했습니다.");
  } catch (e) { console.log("오류:", String(e).slice(0,150)); } finally {
    await browser.close();
  }
})();
