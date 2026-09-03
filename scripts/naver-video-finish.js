/**
 * 이미 넣은 영상에 **가운데 정렬 + 정보 + 태그 + AI 활용**을 채웁니다 — 2026-09-03
 *
 *   node scripts/naver-video-finish.js <블로그ID> "<초안 제목 앞부분>" "<정보로 넣을 글>" "<태그1,태그2,...>"
 *
 * 사장님 확정 배치 규칙(feedback_naver_layout_rules_0903) 중 영상 몫입니다.
 *   ③ 영상은 가운데 정렬
 *   ⑤ 동영상 정보 칸을 다 채운다 — 제목 / 정보 = 원고 제목 / 태그 전부 / AI 활용 = 켬
 *
 * ── 재삽입이 아니라 재편집으로 됩니다 (2026-09-03 실측) ──
 *   영상 **클릭**    → se-property-toolbar 에 정렬 단추 3개(왼쪽·가운데·오른쪽)가 나온다
 *   영상 **더블클릭** → `nvu_wrap` 업로더 레이어가 **다시 뜬다** ← 메타데이터를 여기서 고친다
 *   그래서 영상을 지웠다 다시 넣을 필요가 없습니다.
 *
 * ── AI 활용 토글 ──
 *   <div class="nvu_ai_toggle_container">
 *     <button class="nvu_ai_toggle_button"><span class="nvu_ai_toggle_switch"></span></button>
 *   </div>
 *   ⚠️ aria-checked 도 type 도 없는 **맨 버튼**입니다. 그래서 "눌렀다" 가 "켜졌다" 의 증거가 못 됩니다.
 *      누르기 전후의 class 를 비교해서 **바뀌었는지**로 판정합니다.
 *
 * ⚠️ 발행은 절대 누르지 않습니다. 임시저장까지입니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const [blogId, 제목앞, 정보글, 태그문자열] = process.argv.slice(2);
if (!blogId || !제목앞) {
  console.error('사용법: node naver-video-finish.js <블로그ID> "<초안 제목 앞부분>" "<정보>" "<태그1,태그2>"');
  process.exit(2);
}
const 태그들 = (태그문자열 || "").split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean).slice(0, 10);
const OUT = path.join(process.env.TEMP || ".", "video-finish");
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
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${blogId}-${제목앞.slice(0, 6)}-${n}.png`) }).catch(() => {});
  const 눌러 = async (fn, arg) => {
    for (const f of page.frames()) {
      const c = await f.evaluate(fn, arg).catch(() => null);
      if (!c) continue;
      let ox = 0, oy = 0;
      try {
        const fe = await f.frameElement();
        if (fe) { const bb = await fe.boundingBox(); if (bb) { ox = bb.x; oy = bb.y; } }
      } catch {}
      await page.mouse.click(ox + c.x, oy + c.y, { delay: 70 });
      return c;
    }
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

  const 결과 = { 정렬: "?", 정보: "?", 태그: "?", AI: "?", 저장: "?" };
  try {
    await page.setViewport({ width: 1480, height: 950 });
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);
    await 팝업닫기();

    say(`[1/6] 초안 열기 — ${제목앞}`);
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
    if (!열림) { say("✖ 초안을 못 찾았습니다"); return; }
    say(`      ${열림.t}`);
    await sleep(9000);
    await 팝업닫기();
    await sleep(3000);

    const 있나 = await page.evaluate(() => document.querySelectorAll(".se-component.se-video, .se-video").length).catch(() => 0);
    if (!있나) { say("✖ 본문에 영상이 없습니다"); await shot("x-영상없음"); return; }
    say(`[2/6] 본문 영상 ${있나}개`);

    // ── 규칙 ③ 가운데 정렬 ── 영상을 한 번 클릭하면 정렬 단추가 나옵니다.
    const v = await 눌러(() => {
      const el = document.querySelector(".se-component.se-video, .se-video");
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await sleep(2500);
    const 정렬 = await 눌러(() => {
      const b = [...document.querySelectorAll("button")]
        .filter((n) => n.getClientRects().length)
        .find((n) => /가운데\s*정렬/.test((n.innerText || n.getAttribute("aria-label") || "")));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    결과.정렬 = 정렬 ? "눌렀음" : "단추 못 찾음";
    say(`[3/6] 가운데 정렬: ${결과.정렬}`);
    await sleep(2000);

    // ── 더블클릭으로 업로더 레이어 다시 열기 ──
    if (!v) { say("✖ 영상 좌표를 못 잡았습니다"); return; }
    await page.mouse.click(v.x, v.y, { clickCount: 2, delay: 80 });
    await sleep(5000);
    const 레이어 = await page.evaluate(() => !!document.querySelector(".nvu_wrap")).catch(() => false);
    say(`[4/6] 업로더 레이어 다시 열기: ${레이어 ? "열림" : "안 열림"}`);
    if (!레이어) { await shot("x-레이어없음"); return; }
    await shot("1-레이어");

    // ── 규칙 ⑤ 정보 ──
    if (정보글) {
      결과.정보 = await page.evaluate((v2) => {
        const t = document.querySelector("#nvu_inp_box_description");
        if (!t) return "칸 없음";
        const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        if (set) set.call(t, v2); else t.value = v2;
        t.dispatchEvent(new Event("input", { bubbles: true }));
        t.dispatchEvent(new Event("change", { bubbles: true }));
        return t.value ? `"${t.value.slice(0, 20)}"` : "안 들어감";
      }, 정보글.slice(0, 300)).catch(() => "오류");
      say(`[5/6] 정보: ${결과.정보}`);
      await sleep(900);
    }

    // ── 규칙 ⑤ 태그 ── "태그추가" 를 누르면 combobox 가 나타납니다. 하나씩 Enter.
    if (태그들.length) {
      let 넣은수 = 0;
      for (const tg of 태그들) {
        const 열기 = await 눌러(() => {
          const b = document.querySelector("#nvu_inp_box_tag");
          if (!b || !b.getClientRects().length) return null;
          const r = b.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (!열기) break;
        await sleep(600);
        await page.keyboard.type(tg, { delay: 30 });
        await sleep(400);
        await page.keyboard.press("Enter");
        await sleep(700);
        넣은수++;
      }
      const 실제 = await page.evaluate(() => document.querySelectorAll(".nvu_tag_list .nvu_tag_item").length).catch(() => -1);
      결과.태그 = `시도 ${넣은수} · 목록 ${실제}개`;
      say(`      태그: ${결과.태그}`);
    }

    // ── 규칙 ⑤ AI 활용 켜기 ── class 변화로 판정합니다.
    /**
     * ⚠️⚠️ **켜짐 상태는 `nvu_is_active` 클래스입니다** (2026-09-03 실측으로 확인).
     *      전: <button class="nvu_ai_toggle_button">
     *      후: <button class="nvu_ai_toggle_button nvu_is_active">
     *      토글이라 **이미 켜진 것을 또 누르면 꺼집니다.** 그래서 상태를 먼저 읽고,
     *      꺼져 있을 때만 누릅니다. 그리고 마지막에 다시 읽어 **켜졌음을 확인**합니다.
     */
    const 읽기 = () => page.evaluate(() => {
      const b = document.querySelector("button.nvu_ai_toggle_button");
      if (!b) return null;
      return { on: b.classList.contains("nvu_is_active"), html: b.outerHTML.replace(/\s+/g, " ").slice(0, 100) };
    }).catch(() => null);

    const 전 = await 읽기();
    if (!전) {
      결과.AI = "단추 못 찾음";
    } else if (전.on) {
      결과.AI = "이미 켜져 있음 — 안 누름";
    } else {
      await 눌러(() => {
        const b = document.querySelector("button.nvu_ai_toggle_button");
        if (!b || !b.getClientRects().length) return null;
        b.scrollIntoView({ block: "center" });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await sleep(1500);
      const 후 = await 읽기();
      결과.AI = 후 && 후.on ? "★ 켜짐 확인" : `안 켜짐 (${후 ? 후.html : "못 읽음"})`;
    }
    say(`      AI 활용: ${결과.AI}`);
    await sleep(800);
    await shot("2-채움");

    // ── 완료 ──
    const done = await 눌러(() => {
      const b = [...document.querySelectorAll(".nvu_wrap button, .se-popup button")]
        .find((n) => /^완료$/.test((n.innerText || "").trim()) && n.getClientRects().length && !n.disabled);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`[6/6] 완료: ${done ? "눌렀음" : "꺼져 있거나 없음"}`);
    await sleep(6000);

    const 저장 = await 눌러(() => {
      const b = [...document.querySelectorAll("button,a")]
        .find((n) => /^저장(\s*\d+)?$/.test((n.innerText || "").trim()) && n.getClientRects().length);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    결과.저장 = 저장 ? "눌렀음" : "못 찾음";
    say(`      임시저장: ${결과.저장}`);
    await sleep(6000);
    await shot("3-저장");
    say(`\n■ ${제목앞} — 정렬 ${결과.정렬} · 정보 ${결과.정보} · 태그 ${결과.태그} · AI ${결과.AI} · 저장 ${결과.저장}`);
    say("  ⚠ 발행은 누르지 않았습니다.");
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
    await shot("x-오류");
  } finally {
    await sleep(1500);
    await browser.close();
  }
})();
