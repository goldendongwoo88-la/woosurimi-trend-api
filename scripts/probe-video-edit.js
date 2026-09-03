/**
 * 이미 넣은 영상을 **다시 편집할 수 있는지** 봅니다 — 2026-09-03
 *
 *   node scripts/probe-video-edit.js <블로그ID> "<초안 제목 앞부분>"
 *
 * ── 왜 ──
 * 정보·태그·AI 활용은 **업로더 레이어에서만** 설정됩니다.
 * 영상은 이미 10건에 들어가 있어서, 이 값들을 채우려면 둘 중 하나입니다.
 *   A. 삽입된 영상을 눌러 재편집       ← 되면 10건 재삽입이 필요 없습니다
 *   B. 지우고 다시 넣기                 ← 건당 3분, 30분 더
 * 어느 쪽인지 **눌러 보고** 정합니다. 추측하지 않습니다.
 *
 * 영상을 클릭한 뒤 나타나는 것을 전부 적습니다:
 *   도구막대 단추 이름 · 새 레이어 · nvu_wrap 재등장 여부 · 정렬 단추
 *
 * ⚠️ 저장도 발행도 누르지 않습니다. 관찰만 합니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const [blogId, 제목앞] = process.argv.slice(2);
if (!blogId || !제목앞) {
  console.error('사용법: node probe-video-edit.js <블로그ID> "<초안 제목 앞부분>"');
  process.exit(2);
}
const OUT = path.join(process.env.TEMP || ".", "probe-video-edit");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { console.log(s); log.push(s); };

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
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${blogId}-${n}.png`) }).catch(() => {});
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
  /** 지금 화면에 보이는, 누를 만한 것을 전부 적습니다. */
  const 훑기 = async (딱지) => {
    const 것 = await page.evaluate(() => {
      const out = [];
      for (const n of document.querySelectorAll("button,a,[role=button],[class*=toolbar] *")) {
        if (!n.getClientRects().length) continue;
        const t = (n.innerText || n.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const c = (n.className && n.className.toString ? n.className.toString() : "").slice(0, 46);
        if (!t && !/toolbar|align|video|nvu/i.test(c)) continue;
        out.push(`${n.tagName}.${c}${t ? ' "' + t.slice(0, 16) + '"' : ""}`);
      }
      return [...new Set(out)].slice(0, 40);
    }).catch(() => []);
    const nvu = await page.evaluate(() => !!document.querySelector(".nvu_wrap")).catch(() => false);
    say(`  ── ${딱지} · nvu 레이어 ${nvu ? "★ 있음" : "없음"} · 보이는 것 ${것.length}개`);
    것.forEach((x) => say(`      ${x}`));
  };

  try {
    await page.setViewport({ width: 1480, height: 950 });
    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);
    await 팝업닫기();

    say("[1] 초안 열기");
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
    say(`    ${열림.t}`);
    await sleep(9000);
    await 팝업닫기();
    await sleep(3000);

    const 있나 = await page.evaluate(() => document.querySelectorAll(".se-component.se-video, .se-video").length).catch(() => 0);
    say(`[2] 본문 영상 ${있나}개`);
    if (!있나) { say("✖ 영상이 없습니다 — 다른 초안일 수 있습니다"); await shot("x-영상없음"); return; }

    say("[3] 영상 클릭 전");
    await 훑기("before");

    // 영상 컴포넌트를 진짜 마우스로 클릭
    const v = await 눌러(() => {
      const el = document.querySelector(".se-component.se-video, .se-video");
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`[4] 영상 클릭: ${v ? "눌렀음" : "못 찾음"}`);
    await sleep(3000);
    await shot("1-영상클릭");
    await 훑기("after-click");

    // 더블클릭하면 편집이 열리는 편집기가 많습니다
    if (v) {
      await page.mouse.click(v.x, v.y, { clickCount: 2, delay: 80 });
      await sleep(3500);
      await shot("2-더블클릭");
      await 훑기("after-dblclick");
    }

    // 정렬 단추가 있는지 따로 확인 (규칙 ③ 가운데 정렬)
    const 정렬 = await page.evaluate(() => {
      const out = [];
      for (const n of document.querySelectorAll("button,[role=button]")) {
        if (!n.getClientRects().length) continue;
        const t = (n.innerText || n.getAttribute("aria-label") || n.title || "").replace(/\s+/g, " ").trim();
        const c = (n.className && n.className.toString ? n.className.toString() : "");
        if (/정렬|align/i.test(t) || /align/i.test(c)) out.push(`${n.tagName}.${c.slice(0, 50)} "${t.slice(0, 18)}"`);
      }
      return [...new Set(out)];
    }).catch(() => []);
    say(`[5] 정렬 단추 후보 ${정렬.length}개`);
    정렬.forEach((x) => say(`      ${x}`));
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
    await shot("x-오류");
  } finally {
    fs.writeFileSync(path.join(OUT, "기록.txt"), log.join("\n"), "utf8");
    say(`\n스크린샷·기록 → ${OUT}`);
    await sleep(1500);
    await browser.close();
  }
})();
