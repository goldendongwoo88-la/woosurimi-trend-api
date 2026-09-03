/**
 * 임시저장 초안 **한 건만** 지웁니다 — 2026-09-03
 *
 *   node scripts/naver-draft-delete.js <블로그ID> "<제목 앞부분>" "<HH:MM>" [--yes]
 *
 * ⚠️ **되돌릴 수 없습니다.** 그래서 안전장치를 넣었습니다:
 *   · 제목 **과** 시각이 **둘 다** 맞는 줄만 대상으로 봅니다
 *   · 대상이 정확히 1건이 아니면 **아무것도 안 하고 멈춥니다**
 *   · --yes 가 없으면 무엇을 지울지 보여주고 끝냅니다 (예행연습)
 *
 * 왜 시각까지 보는가: 같은 제목이 두 번 저장된 것을 지우는 일이라
 * 제목만 보면 살릴 것과 지울 것을 구분할 수 없습니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const args = process.argv.slice(2);
const [blogId, 제목앞, 시각] = args.filter((a) => !a.startsWith("--"));
const 실행 = args.includes("--yes");
if (!blogId || !제목앞 || !시각) {
  console.error('사용법: node naver-draft-delete.js <블로그ID> "<제목 앞부분>" "<HH:MM>" [--yes]');
  process.exit(2);
}
const OUT = path.join(process.env.TEMP || ".", "draft-delete");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = console.log;

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    userDataDir: `C:\\dev\\profiles\\naver_${blogId}`,
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1500,1000"],
    defaultViewport: null,
    protocolTimeout: 180000,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png") }).catch(() => {});

  /**
   * ⚠️ "선택 삭제" 를 누르면 **네이티브 confirm 창**이 뜹니다.
   *    이걸 안 받으면 렌더러가 멈춰 `Input.dispatchMouseEvent timed out` 이 납니다
   *    (2026-09-03 실측 — 삭제가 여기서 멈췄습니다).
   *    문구를 찍어 두고, **"전체"·"모두" 가 들어 있으면 거부**합니다. 한 건만 지우는 작업입니다.
   */
  const 대화상자 = [];
  page.on("dialog", async (d) => {
    const msg = (d.message() || "").replace(/\s+/g, " ").trim();
    대화상자.push(`${d.type()}: ${msg}`);
    if (/전체|모두|all/i.test(msg)) { say(`  ✖ 확인창에 "전체/모두" 가 있어 거부합니다: ${msg}`); await d.dismiss().catch(() => {}); }
    else { say(`  ▶ 확인창 수락: ${msg}`); await d.accept().catch(() => {}); }
  });
  const 눌러 = async (fn, arg) => {
    const c = await page.evaluate(fn, arg).catch(() => null);
    if (c) { await page.mouse.click(c.x, c.y, { delay: 70 }); return c; }
    return null;
  };
  const 팝업닫기 = async () => {
    for (let i = 0; i < 5; i++) {
      const hit = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a")]
          .find((x) => /^취소$/.test((x.innerText || "").trim()) && x.getClientRects().length);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }).catch(() => null);
      if (!hit) return;
      await page.mouse.click(hit.x, hit.y, { delay: 50 });
      await sleep(1100);
    }
  };

  try {
    await page.setViewport({ width: 1480, height: 950 });
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);
    await 팝업닫기();

    // 임시저장 목록 열기 (naver-draft.js 의 검증된 방식)
    await page.evaluate(() => {
      const vis = (n) => n.getClientRects().length;
      const open = [...document.querySelectorAll("button, a")].filter(vis)
        .find((b) => /^저장(\s*\d+)?$/.test((b.textContent || "").trim()));
      const near = open && open.parentElement ? open.parentElement.querySelectorAll("button") : [];
      for (const b of near) if (b !== open) { b.click(); break; }
    });
    await sleep(3500);
    await 팝업닫기();
    await shot("1-목록");

    const 목록 = await page.evaluate(() => [...document.querySelectorAll("li")]
      .filter((x) => x.getClientRects().length && /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""))
      .map((x) => (x.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80)));
    say(`■ 임시저장 ${목록.length}건`);

    const 대상 = 목록.map((t, i) => ({ t, i })).filter((r) => r.t.includes(제목앞) && r.t.includes(시각));
    say(`■ "${제목앞}" + "${시각}" 에 맞는 줄: ${대상.length}건`);
    대상.forEach((r) => say(`    [${r.i}] ${r.t}`));
    목록.filter((t) => t.includes(제목앞)).forEach((t) => say(`    (같은 제목) ${t}`));

    if (대상.length !== 1) { say("✖ 정확히 1건이 아니라 아무것도 하지 않습니다."); return; }
    if (!실행) { say("\n예행연습입니다. 실제로 지우려면 --yes 를 붙이십시오."); return; }

    // 목록의 "편집" 을 눌러 삭제 모드로
    const 편집 = await 눌러(() => {
      const b = [...document.querySelectorAll("button,a")]
        .find((n) => /^편집$/.test((n.innerText || "").trim()) && n.getClientRects().length);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`■ 편집 모드: ${편집 ? "들어감" : "단추 못 찾음"}`);
    await sleep(2000);
    await shot("2-편집");

    // 대상 줄의 체크박스를 켠다
    const 체크 = await 눌러((idx) => {
      const rows = [...document.querySelectorAll("li")]
        .filter((x) => x.getClientRects().length && /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || ""));
      const row = rows[idx];
      if (!row) return null;
      const box = row.querySelector("input[type=checkbox], label, .checkbox, [class*=check]") || row;
      const r = box.getBoundingClientRect();
      return { x: r.left + Math.min(18, r.width / 2), y: r.top + r.height / 2 };
    }, 대상[0].i);
    say(`■ 대상 선택: ${체크 ? "눌렀음" : "못 찾음"}`);
    await sleep(1500);
    await shot("3-선택");

    /**
     * ⚠️⚠️ 단추 이름은 **"선택 삭제"** 입니다. 그냥 "삭제" 로 찾으면 못 잡습니다(2026-09-03 실측).
     *      바로 옆에 **"전체 삭제"** 가 있습니다 — 그걸 누르면 임시저장 전부가 날아갑니다.
     *      그래서 "전체" 가 든 것은 **명시적으로 배제**하고, 정확히 "선택 삭제" 만 누릅니다.
     */
    const 삭제 = await 눌러(() => {
      const b = [...document.querySelectorAll("button,a")]
        .filter((n) => n.getClientRects().length && !n.disabled)
        .find((n) => {
          const t = (n.innerText || "").replace(/\s+/g, " ").trim();
          if (/전체/.test(t)) return false;              // ← 전체 삭제는 절대 안 누른다
          return t === "선택 삭제" || t === "선택삭제";
        });
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`■ 삭제 단추: ${삭제 ? "눌렀음" : "못 찾음(꺼져 있을 수 있음)"}`);
    await sleep(2000);
    // 확인 대화상자
    // 확인 대화상자 — 여기서도 "전체" 가 든 것은 배제합니다.
    const 확인 = await 눌러(() => {
      const b = [...document.querySelectorAll("button,a")]
        .filter((n) => n.getClientRects().length && !/전체/.test(n.innerText || ""))
        .find((n) => /^(확인|삭제)$/.test((n.innerText || "").trim()));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`■ 확인: ${확인 ? "눌렀음" : "대화상자 없음"}`);
    await sleep(3000);
    await shot("4-끝");

    const 남은 = await page.evaluate(() => [...document.querySelectorAll("li")]
      .filter((x) => x.getClientRects().length && /\d{4}\.\d{2}\.\d{2}/.test(x.innerText || "")).length);
    say(`\n■ 남은 임시저장: ${남은}건 (지우기 전 ${목록.length}건)`);
    say(`   스크린샷 → ${OUT}`);
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
    await shot("x-오류");
  } finally {
    await sleep(1500);
    await browser.close();
  }
})();
