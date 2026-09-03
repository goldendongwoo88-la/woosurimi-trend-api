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

    /**
     * ⚠️ **"작성 중인 글이 있습니다" 팝업은 한 번만 처리하면 안 됩니다.**
     *    목록을 연 **뒤에** 다시 뜹니다. 그러면 목록 위를 덮어 클릭이 전부 먹히지 않고,
     *    에디터는 빈 채로 남습니다 — "사진 0장" 으로 잘못 읽던 원인이 이것이었습니다
     *    (2026-09-03 스크린샷으로 확인).
     *    "취소" 를 눌러야 이어쓰기를 버리고 원하는 초안을 열 수 있습니다.
     */
    const 팝업닫기 = async () => {
      for (let i = 0; i < 5; i++) {
        const hit = await page.evaluate(() => {
          const t = [...document.querySelectorAll("div,section")]
            .find((d) => /작성 중인 글이 있습니다/.test(d.innerText || "") && (d.innerText || "").length < 300);
          const scope = t || document;
          const b = [...scope.querySelectorAll("button,a")]
            .find((x) => /^취소$/.test((x.innerText || "").trim()));
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }).catch(() => null);
        if (!hit) return i;                       // 더 없으면 끝
        await page.mouse.click(hit.x, hit.y, { delay: 60 });   // 진짜 마우스로
        await new Promise((r) => setTimeout(r, 1200));
      }
      return 5;
    };
    console.log(`  팝업 닫기(처음): ${await 팝업닫기()}회`);

    /**
     * 임시저장 목록 열기 — naver-draft.js 가 쓰는 **검증된 방식**을 그대로 씁니다.
     * "저장" 단추를 찾고 그 **형제 단추**를 누릅니다.
     * (제 방식은 헤더 class 로 숫자를 찾았는데, 목록이 아예 안 열려서
     *  엉뚱한 li 를 초안으로 착각했습니다 — 2026-09-03 실측)
     */
    const 열림 = await page.evaluate(() => {
      const vis = (n) => n.offsetParent !== null || (n.getClientRects && n.getClientRects().length);
      const open = [...document.querySelectorAll("button, a")].filter(vis)
        .find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()));
      if (!open) return "저장 단추 못 찾음";
      const near = open.parentElement ? open.parentElement.querySelectorAll("button") : [];
      for (const b of near) if (b !== open) { b.click(); return "목록 단추 누름"; }
      return "형제 단추 없음";
    });
    console.log(`  목록 열기: ${열림}`);
    await new Promise((r) => setTimeout(r, 3500));
    console.log(`  팝업 닫기(목록 뒤): ${await 팝업닫기()}회`);   // ← 여기서 또 뜹니다
    await page.screenshot({ path: require("path").join(process.env.TEMP || ".", `verify-${blogId}-목록.png`) }).catch(() => {});

    /**
     * n 번째 초안을 엽니다.
     * ⚠️ 목록 줄(div)을 누르면 **아무 일도 안 일어나고 빈 새 글 화면이 남습니다**(2026-09-03 실측).
     *    실제로 눌러야 하는 것은 줄 안의 **제목 링크/버튼**입니다.
     *    빈 에디터를 보고 "본문이 0자"라고 보고하면 안 됩니다 — 불러오기가 실패한 것뿐입니다.
     */
    /**
     * ⚠️⚠️ **DOM 의 el.click() 은 안 먹습니다.** 스마트에디터가 합성 이벤트(isTrusted:false)를
     *      무시하기 때문입니다. 그래서 좌표를 재서 **진짜 마우스**로 누릅니다.
     *      (naver-draft.js 가 서식·사진·툴바에서 겪은 것과 같은 뿌리입니다)
     */
    const target = await page.evaluate((n) => {
      const rows = [...document.querySelectorAll("li")]
        .filter((x) => /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""));
      const t = rows[n - 1];
      if (!t) return null;
      const hit = t.querySelector("a,button,[class*=title],[class*=Title]") || t;
      const r = hit.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { title: (t.innerText || "").split("\n")[0], x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, nth);
    if (target) await page.mouse.click(target.x, target.y, { delay: 60 });
    const opened = target && target.title;
    await new Promise((r) => setTimeout(r, 6000));
    await 팝업닫기();
    await new Promise((r) => setTimeout(r, 6000));
    await page.screenshot({ path: require("path").join(process.env.TEMP || ".", `verify-${blogId}-초안.png`) }).catch(() => {});

    /**
     * 본문은 `about:blank` 자식 프레임의 contenteditable BODY 입니다.
     * URL 로 고르면 프레임이 여러 개라 틀립니다 — **글자가 가장 많은 곳**을 본문으로 봅니다.
     */
    /**
     * ⚠️ contenteditable 로 프레임을 고르면 틀립니다 — 접근이 막히거나 빈 값이 나와
     *    **초안이 멀쩡히 열렸는데 "불러오기 실패"** 로 보고했습니다(2026-09-03 스크린샷으로 확인).
     *    스마트에디터 본문은 항상 `.se-text-paragraph` 로 이뤄집니다.
     *    그래서 **문단 조각이 가장 많은 프레임**을 본문으로 고릅니다.
     */
    let body = page.mainFrame(), best = -1;
    const 진단 = [];
    for (const f of page.frames()) {
      const n = await f.evaluate(() => document.querySelectorAll(".se-text-paragraph").length)
        .catch(() => -1);
      진단.push(`${(f.url() || "about:blank").slice(0, 40)}=${n}`);
      if (n > best) { best = n; body = f; }
    }
    console.log(`  프레임 훑기: ${진단.join(" · ")}`);
    if (best <= 0) {
      console.log(`\n■ ${blogId} · ${nth}번째 초안 — **불러오기 실패**`);
      console.log(`  목록에서 고른 것 : ${opened || "(못 고름)"}`);
      console.log("  에디터가 비어 있습니다. 초안이 안 열린 것이지 내용이 없는 게 아닙니다.");
      return;
    }

    const r = await body.evaluate(() => {
      const all = [...document.querySelectorAll(".se-component")];
      const 본문 = all.filter((c) => !c.closest(".se-documentTitle"));
      const txt = 본문.map((c) => c.innerText || "").join("\n");
      const paras = txt.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      return {
        글자수: txt.replace(/\s/g, "").length,
        문단수: paras.length,
        사진: document.querySelectorAll(".se-component.se-image img, .se-image-resource").length,
        영상: document.querySelectorAll(".se-component.se-video, .se-video, video").length,
        소제목38: document.querySelectorAll("[class*='se-fs38']").length,
        /**
         * ⚠️ **se-fs38 만 세면 못 봅니다** (2026-09-03 실측).
         *    만들 때는 "소제목 6개 바꿨습니다" 로 나오는데 저장본에서는 0 이었습니다.
         *    네이버가 저장할 때 클래스가 아니라 인라인 style 로 바꿔 넣는지,
         *    아니면 서식이 정말 안 남는지 **글자 크기를 직접 세서** 가립니다.
         */
        링크카드: document.querySelectorAll(".se-component.se-oglink, .se-oglink").length,
        주소줄: [...document.querySelectorAll(".se-text-paragraph")]
                  .filter((n) => /^https?:\/\//.test((n.textContent || "").trim())).length,
        큰글자: (() => {
          const 셈 = {};
          for (const el of document.querySelectorAll(".se-text-paragraph span")) {
            const px = Math.round(parseFloat(getComputedStyle(el).fontSize) || 0);
            if (px >= 20) 셈[px] = (셈[px] || 0) + 1;
          }
          return JSON.stringify(셈);
        })(),
        인용구: document.querySelectorAll(".se-component.se-quotation").length,
        표식잔존: (txt.match(/[⟦\[]사진\s*\d*[⟧\]]|[⟦\[]영상/g) || []).length,
        긴문단: paras.filter((x) => x.replace(/\s/g, "").length > 30).length,
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
