/**
 * 네이버 블로그 **동영상 넣는 길 찾기** — 2026-09-03
 *
 *   node scripts/probe-video.js <블로그ID>
 *
 * ── 왜 ──
 * 동영상 단추는 눌리는데(disabled 아님) 파일 선택창도, 팝업도 안 뜹니다.
 * 사진 길로 mp4 를 넘겨도 안 붙습니다. **추측을 멈추고 눌러 보고 다 적습니다.**
 *
 * 누르기 전/후를 비교해서 이것들을 전부 뱉습니다:
 *   새로 생긴 프레임 · 새로 생긴 창(target) · input[type=file] 이 어디에 있나
 *   새로 뜬 레이어(class 에 video/layer/modal 이 든 것) · 네트워크 요청
 *   그리고 매 단계 스크린샷
 *
 * ⚠️ 저장도 발행도 누르지 않습니다. 관찰만 합니다.
 */
const path = require("path");
const fs = require("fs");
const PUPPETEER = path.join(__dirname, "..", "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const blogId = process.argv[2] || "irlaehddni";
const OUT = path.join(process.env.TEMP || ".", "probe-video");
fs.mkdirSync(OUT, { recursive: true });
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + ".png") }).catch(() => {});
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
  });

  const 새창 = [];
  browser.on("targetcreated", async (t) => 새창.push(`${t.type()} ${(t.url() || "").slice(0, 90)}`));

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1480, height: 950 });

    const 요청 = [];
    page.on("request", (r) => {
      const u = r.url();
      if (/video|movie|upload|vod|nelo|tv\.naver|selectvideo/i.test(u)) 요청.push(`${r.method()} ${u.slice(0, 110)}`);
    });

    await page.goto(`https://blog.naver.com/${blogId}/postwrite`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);

    // "작성 중인 글이 있습니다" 팝업 — 목록/에디터를 덮으므로 먼저 치웁니다.
    for (let i = 0; i < 4; i++) {
      const hit = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button,a")]
          .find((x) => /^취소$/.test((x.innerText || "").trim()));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }).catch(() => null);
      if (!hit) break;
      await page.mouse.click(hit.x, hit.y, { delay: 50 });
      await sleep(1200);
    }
    await shot(page, "1-에디터");

    const 훑기 = async (딱지) => {
      const frames = page.frames();
      const 결과 = [];
      for (const f of frames) {
        const info = await f.evaluate(() => ({
          files: document.querySelectorAll("input[type=file]").length,
          accept: [...document.querySelectorAll("input[type=file]")].map((i) => i.accept || "(없음)"),
          layers: [...document.querySelectorAll("[class*=video],[class*=Video],[class*=layer],[class*=Layer],[class*=modal],[class*=Modal]")]
            .filter((n) => n.getClientRects().length)
            .map((n) => n.className.toString().slice(0, 70)).slice(0, 8),
        })).catch(() => null);
        if (info) 결과.push(`    [${(f.url() || "about:blank").slice(0, 55)}] file=${info.files}${info.accept.length ? " accept=" + info.accept.join(",") : ""}${info.layers.length ? "\n        보이는레이어: " + info.layers.join(" | ") : ""}`);
      }
      say(`  ── ${딱지} · 프레임 ${frames.length}개`);
      결과.forEach((r) => say(r));
    };

    say("■ 누르기 전");
    await 훑기("before");

    // 동영상 단추 좌표를 재서 **진짜 마우스**로 누릅니다.
    let 좌표 = null;
    for (const f of page.frames()) {
      좌표 = await f.evaluate(() => {
        const byClass = document.querySelector("button.se-video-toolbar-button");
        const byLabel = [...document.querySelectorAll("span.se-toolbar-label,button,a")]
          .find((n) => (n.textContent || "").trim() === "동영상");
        const b = byClass || (byLabel && (byLabel.closest("button") || byLabel));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        if (!r.width) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, cls: b.className.toString().slice(0, 60) };
      }).catch(() => null);
      if (좌표) { 좌표.frame = (f.url() || "").slice(0, 60); break; }
    }
    if (!좌표) { say("✖ 동영상 단추를 못 찾았습니다"); return; }
    say(`■ 동영상 단추: ${좌표.cls}  (${Math.round(좌표.x)},${Math.round(좌표.y)})  프레임 ${좌표.frame}`);

    const chooser = page.waitForFileChooser({ timeout: 12000 }).then(() => "떴다").catch(() => "안 뜸");
    await page.mouse.click(좌표.x, 좌표.y, { delay: 80 });
    await sleep(6000);
    await shot(page, "2-누른직후");
    say(`■ 파일선택창: ${await chooser}`);
    await 훑기("after");

    // 레이어 안에 "동영상 추가 / 내 컴퓨터 / 파일 선택" 같은 두 번째 단추가 있는지
    for (const f of page.frames()) {
      const 두번째 = await f.evaluate(() => {
        const cand = [...document.querySelectorAll("button,a,label,span,div")]
          .filter((n) => n.getClientRects().length &&
            /동영상 추가|파일 추가|내 컴퓨터|파일 선택|업로드|찾아보기/.test((n.innerText || "").trim()) &&
            (n.innerText || "").length < 30);
        return cand.map((n) => ({ t: (n.innerText || "").trim(), tag: n.tagName, cls: n.className.toString().slice(0, 50) })).slice(0, 6);
      }).catch(() => []);
      if (두번째 && 두번째.length) {
        say(`  ▸ 2차 단추 후보 (${(f.url() || "about:blank").slice(0, 50)})`);
        두번째.forEach((c) => say(`      ${c.tag}.${c.cls} = "${c.t}"`));
      }
    }

    /**
     * ── 2단계 ── 레이어 안의 "동영상 추가" 를 또 눌러야 파일창이 뜹니다.
     * 1단계(도구막대 동영상)는 **레이어만** 엽니다. input[type=file] 은 아직 0개입니다.
     * 기존 코드가 1단계 직후에 파일창을 기다려 매번 시간초과가 났던 이유입니다.
     */
    say("■ 2단계 — 레이어 안 '동영상 추가' 누르기");
    let 두좌표 = null;
    for (const f of page.frames()) {
      두좌표 = await f.evaluate(() => {
        const wrap = document.querySelector(".nvu_area_button, .nvu_wrap");
        if (!wrap) return null;
        const b = [...wrap.querySelectorAll("button,a,label,span,div")]
          .filter((n) => n.getClientRects().length)
          .find((n) => /^동영상 추가$/.test((n.innerText || "").trim()));
        const t = b || [...wrap.querySelectorAll("*")].filter((n) => n.getClientRects().length)[0];
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2,
                 tag: t.tagName, cls: t.className.toString().slice(0, 50), txt: (t.innerText || "").trim().slice(0, 20) };
      }).catch(() => null);
      if (두좌표) break;
    }
    if (!두좌표) { say("  ✖ nvu 레이어 안에서 단추를 못 찾았습니다"); }
    else {
      say(`  대상: ${두좌표.tag}.${두좌표.cls} "${두좌표.txt}" (${Math.round(두좌표.x)},${Math.round(두좌표.y)})`);
      const ch2 = page.waitForFileChooser({ timeout: 15000 }).then((c) => c).catch(() => null);
      await page.mouse.click(두좌표.x, 두좌표.y, { delay: 80 });
      await sleep(4000);
      const c = await ch2;
      say(`  ▶ 파일선택창: ${c ? "★ 떴습니다" : "안 뜸"}`);
      await shot(page, "4-2단계");
      if (c) {
        const mp4 = "C:/Users/김동우/OneDrive/Desktop/my-project/golden-office/out/2026-09-03/irlaehddni/video/01.mp4";
        say(`  ▶ 파일 존재: ${fs.existsSync(mp4)}  ${mp4}`);
        try { await c.accept([mp4]); say("  ▶ mp4 넘겼습니다 — 업로드 시작되는지 봅니다"); } catch (e) { say("  ✖ accept 실패 " + String(e).slice(0, 80)); }
        await sleep(9000);
        await shot(page, "5-업로드");
        const 상태 = await page.evaluate(() => {
          const w = document.querySelector(".nvu_wrap");
          return w ? (w.innerText || "").replace(/\s+/g, " ").slice(0, 200) : "(레이어 없음)";
        }).catch(() => "(못 읽음)");
        say(`  ▶ 레이어 상태: ${상태}`);
      }
      // 파일창이 안 떴으면 input 이 생겼는지 본다 (숨은 input 에 직접 넣는 길)
      for (const f of page.frames()) {
        const n = await f.evaluate(() => document.querySelectorAll("input[type=file]").length).catch(() => 0);
        if (n) say(`  ▶ input[type=file] ${n}개 발견 — ${(f.url() || "about:blank").slice(0, 50)}`);
      }
    }

    say(`■ 새로 생긴 창/타깃: ${새창.length ? 새창.join(" / ") : "없음"}`);
    say(`■ 영상 관련 네트워크 요청: ${요청.length ? "\n    " + 요청.slice(0, 10).join("\n    ") : "없음"}`);
    await shot(page, "3-끝");
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
  } finally {
    fs.writeFileSync(path.join(OUT, "기록.txt"), log.join("\n"), "utf8");
    console.log(`\n스크린샷·기록 → ${OUT}`);
    await browser.close();
  }
})();
