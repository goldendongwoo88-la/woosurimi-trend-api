/**
 * 임시저장된 글에 **영상을 넣고 임시저장**합니다 — 2026-09-03
 *
 *   node scripts/naver-video-fill.js <블로그ID> "<초안 제목 앞부분>" <영상.mp4> [--title "영상제목"]
 *
 * ── 동영상은 2단계다 (2026-09-03 실측) ──
 * "단추는 눌리는데 파일창이 안 뜬다" 로 여러 세션이 막혀 있었습니다. 답은 단순했습니다.
 *
 *   1단계  button.se-video-toolbar-button      → `se-popup-video-upload` **레이어만** 열림
 *          ⚠ 이 시점 input[type=file] 은 문서 전체에 **0개**입니다. 기다려도 안 옵니다
 *   2단계  button.nvu_btn_append.nvu_local     → **파일선택창이 뜬다**
 *   3단계  chooser.accept([mp4])               → "1 로딩중 … · 대표 이미지 추출중"
 *   4단계  메타데이터 **제목은 필수(*)**        → 안 채우면 [완료]가 안 눌립니다
 *   5단계  [완료]                               → 본문 삽입
 *
 * ── 커서를 제자리에 세우는 법 ──
 * 좌표를 **한 번만 재면 화면 밖 표식은 엉뚱한 곳을 찍어** 영상이 글 맨 위로 갑니다.
 * man_is_best 세션이 사진 13/13 을 제자리에 넣은 방식을 그대로 씁니다:
 *   Range 로 잡기 → scrollIntoView({block:"center"}) → **다시 재기**
 *   → iframe 오프셋 더하기 → 진짜 마우스 클릭 → 350ms 쉬기
 * selection.addRange 로만 세우면 편집기가 무시합니다(합성 이벤트).
 *
 * 네이버 제한: 파일 10개 · 1GB · 15분.
 * 「AI 활용」 표시는 **켭니다** — 대표 승인 2026-09-03.
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
// ⚠️ 역슬래시는 여러 겹 이스케이프에서 자주 뭉개집니다. 슬래시로 바꾸고 존재를 확인합니다.
const MP4 = path.resolve(mp4).replace(/\\/g, "/");
if (!fs.existsSync(MP4)) { console.error("✖ 영상 파일이 없습니다: " + MP4); process.exit(2); }

const OUT = path.join(process.env.TEMP || ".", "video-fill");
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
  });
  const page = await browser.newPage();
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${blogId}-${n}.png`) }).catch(() => {});

  /** 좌표를 재서 진짜 마우스로 누릅니다(프레임 오프셋 포함). 못 찾으면 null. */
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
  /** "작성 중인 글이 있습니다" — 목록을 연 뒤에도 다시 뜹니다. 여러 번 부릅니다. */
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

    say("[1/7] 임시저장 목록에서 초안 찾기");
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
    await sleep(9000);
    await 팝업닫기();
    await sleep(4000);
    await shot("1-초안");

    say("[2/7] [영상: …] 자리에 커서 세우기 — 화면 안으로 넣고 좌표를 다시 잽니다");
    const 자리 = await 눌러(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const v = n.nodeValue || "";
        const at = Math.max(v.indexOf("[영상"), v.indexOf("⟦영상"));
        if (at < 0) continue;
        const host = n.parentElement;
        if (host && host.scrollIntoView) host.scrollIntoView({ block: "center" });
        const rg = document.createRange();
        rg.setStart(n, at); rg.setEnd(n, Math.min(at + 1, v.length));
        const r = rg.getBoundingClientRect();   // ← 스크롤한 뒤에 다시 잰다
        if (!r.width && !r.height) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, txt: v.trim().slice(0, 40) };
      }
      return null;
    });
    say(자리 ? `      찾음: ${자리.txt}` : "      ⚠ 자리를 못 찾았습니다 — 현재 커서 위치에 들어갑니다");
    await sleep(400);

    say("[3/7] 도구막대 [동영상] — 레이어만 열립니다");
    const b1 = await 눌러(() => {
      const b = document.querySelector("button.se-video-toolbar-button");
      if (!b || !b.getClientRects().length) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!b1) { say("✖ 동영상 단추를 못 찾았습니다"); return; }
    await sleep(5000);

    say("[4/7] 레이어 안 [동영상 추가] — 여기서 파일창이 뜹니다");
    const chooser = page.waitForFileChooser({ timeout: 20000 }).then((c) => c).catch(() => null);
    const b2 = await 눌러(() => {
      const b = document.querySelector("button.nvu_btn_append.nvu_local")
        || [...document.querySelectorAll(".nvu_wrap button, .nvu_area_button button")]
             .find((n) => /동영상 추가/.test((n.innerText || "").trim()) && n.getClientRects().length);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!b2) { say("✖ 레이어 안 [동영상 추가] 를 못 찾았습니다"); await shot("x-레이어"); return; }
    const ch = await chooser;
    if (!ch) { say("✖ 파일선택창이 안 떴습니다"); await shot("x-파일창없음"); return; }
    await ch.accept([MP4]);
    say(`      넘김: ${path.basename(MP4)}`);

    say("[5/7] 업로드 기다리는 중");
    let 준비 = false;
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const st = await page.evaluate(() => {
        const w = document.querySelector(".nvu_wrap");
        if (!w) return null;
        const t = (w.innerText || "").replace(/\s+/g, " ");
        return { 로딩: /로딩중|추출중|업로드중|진행중/.test(t), 글: t.slice(0, 80) };
      }).catch(() => null);
      if (!st) break;
      if (i % 4 === 0) say(`      ${st.글}`);
      if (!st.로딩) { 준비 = true; break; }
    }
    say(`      업로드 ${준비 ? "완료" : "아직 진행 중일 수 있음"}`);

    // 제목은 필수(*)입니다. 안 채우면 [완료]가 꺼진 채로 있습니다.
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
    say(`      영상 제목 ${넣음 ? `"${제목값}"` : "칸 못 찾음"}`);
    await sleep(1200);

    // 「AI 활용」 표시 — 대표 승인(2026-09-03). 네이버가 직접 묻는 항목입니다.
    const ai = await 눌러(() => {
      const w = document.querySelector(".nvu_wrap");
      if (!w) return null;
      const 라벨 = [...w.querySelectorAll("*")]
        .find((n) => /AI 활용/.test(n.innerText || "") && (n.innerText || "").length < 120);
      const scope = 라벨 || w;
      const t = [...scope.querySelectorAll("input[type=checkbox], [role=switch], button, label")]
        .find((n) => n.getClientRects().length
          && n.checked !== true
          && (n.getAttribute("aria-checked") || "false") !== "true");
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const ai상태 = await page.evaluate(() => {
      const w = document.querySelector(".nvu_wrap");
      if (!w) return "(레이어 없음)";
      const on = [...w.querySelectorAll("input[type=checkbox]")].some((n) => n.checked)
        || w.querySelectorAll("[aria-checked=true]").length > 0;
      return on ? "켜짐" : "꺼짐(또는 못 읽음)";
    }).catch(() => "(못 읽음)");
    say(`      AI 활용 표시: ${ai ? "눌렀음" : "항목 못 찾음"} → ${ai상태}`);
    await sleep(1200);
    await shot("2-업로드");

    say("[6/7] [완료] 눌러 본문에 삽입");
    const done = await 눌러(() => {
      const b = [...document.querySelectorAll(".nvu_wrap button, .se-popup button")]
        .find((n) => /^완료$/.test((n.innerText || "").trim()) && n.getClientRects().length && !n.disabled);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(done ? "      눌렀습니다" : "      ⚠ [완료]가 꺼져 있거나 없습니다");
    await sleep(7000);

    const 결과 = await page.evaluate(() => ({
      영상: document.querySelectorAll(".se-component.se-video, .se-video, video").length,
      표식: ((document.body.innerText || "").match(/[⟦\[]영상/g) || []).length,
    })).catch(() => ({}));
    say(`      본문 영상 ${결과.영상}개 · [영상] 표식 ${결과.표식}개`);
    await shot("3-삽입");

    // 표식 글자 지우기 — DOM 에서 지우면 저장할 때 되돌아오므로 **키보드**로 지웁니다.
    if (결과.표식) {
      const 잡음 = await 눌러(() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) {
          const v = n.nodeValue || "";
          const at = Math.max(v.indexOf("[영상"), v.indexOf("⟦영상"));
          if (at < 0) continue;
          let end = v.indexOf("]", at);
          if (end < 0) end = v.indexOf("⟧", at);
          if (end < 0) end = v.length - 1;
          const host = n.parentElement;
          if (host && host.scrollIntoView) host.scrollIntoView({ block: "center" });
          const rg = document.createRange();
          rg.setStart(n, at); rg.setEnd(n, end + 1);
          const r = rg.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        return null;
      });
      if (잡음) {
        await sleep(300);
        // 그 줄을 통째로 고른 뒤 지웁니다 (Home → Shift+End → Delete)
        await page.keyboard.down("Home").catch(() => {});
        await page.keyboard.press("Home").catch(() => {});
        await page.keyboard.down("Shift");
        await page.keyboard.press("End");
        await page.keyboard.up("Shift");
        await page.keyboard.press("Delete").catch(() => {});
        await sleep(800);
      }
      const 남음 = await page.evaluate(() => ((document.body.innerText || "").match(/[⟦\[]영상/g) || []).length).catch(() => -1);
      say(`      표식 지운 뒤 남은 개수: ${남음}`);
    }

    say("[7/7] 임시저장 (발행 아님)");
    const 저장 = await 눌러(() => {
      const b = [...document.querySelectorAll("button,a")]
        .find((n) => /^저장(\s*\d+)?$/.test((n.innerText || "").trim()) && n.getClientRects().length);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    say(`      ${저장 ? "저장 눌렀습니다" : "저장 단추 못 찾음"}`);
    await sleep(6000);
    await shot("4-저장");
    say(`■ 끝 — 스크린샷 ${OUT}`);
    say("  ⚠ 발행은 누르지 않았습니다.");
  } catch (e) {
    say("오류: " + String(e).slice(0, 200));
    await shot("x-오류");
  } finally {
    await sleep(1500);
    await browser.close();
  }
})();
