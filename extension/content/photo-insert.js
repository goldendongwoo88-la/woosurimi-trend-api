/**
 * 사진을 네이버 에디터 본문에 넣습니다 — 2026-09-02
 *
 * ── 왜 지금까지 안 했나 ──
 * 밖에서 <img>를 DOM에 밀어 넣으면 **저장할 때 사진이 사라집니다.**
 * 본문 글자에서 겪은 것과 똑같은 함정입니다 — 화면엔 보이는데 편집기 내부 모델은 빈 채로 남습니다.
 * (postingAgent.js에도 같은 판단이 적혀 있습니다: "바깥에서 밀어 넣으면 그 절차를 건너뛰어 글이 깨집니다")
 *
 * 네이버는 사진을 넣을 때 **자기 서버에 올리는 절차**를 반드시 거칩니다.
 * 그래서 되는 길은 하나뿐입니다 — **네이버가 그 절차를 스스로 돌게 하는 것.**
 * 사람이 사진 버튼을 눌러 파일을 고르면 그 절차가 돕니다. 그걸 그대로 재현합니다.
 *
 * ── 사다리 ──
 *   ① 파일칸에 파일 넣기   포커스가 필요 없습니다 → **무인 모드에서도 됩니다**
 *   ② 클립보드 + 진짜 Ctrl+V  ①이 막혔을 때. 창이 앞에 있어야 합니다
 *   ③ 둘 다 안 되면 자리표시를 그대로 두고 **왜 안 됐는지 적습니다** — 되는 척하지 않습니다
 *
 * ⚠️ 사진 주소는 **편집국 프록시(8485)를 거칩니다.**
 *    언론사·스톡 주소를 확장 권한(host_permissions)에 하나씩 넣으면 언론사가 늘 때마다
 *    확장을 고쳐야 합니다. 편집국이 대신 받아 넘겨주면 확장은 localhost 하나만 알면 됩니다.
 *
 * ⚠️ **저작권 판단은 여기서 하지 않습니다.** 어느 사진을 쓸지는 편집국이 risk 표시와 출처를
 *    붙여 사장님께 넘깁니다. 여기는 고른 사진을 **넣는 길**일 뿐입니다.
 */
(() => {
  "use strict";

  /** draft-parser.js:38 과 같은 규칙 — 두 곳이 갈라지면 자리표시를 못 찾습니다. */
  const PHOTO_SLOT = /^\s*\[사진\s*\d*\s*[:：]?\s*([^\]]*)\]\s*$/;

  const FLOOR = "http://localhost:8485";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * 배경 작업자에게 묻고 제한시간 안에 답을 받습니다.
   * ⚠️ draft-insert.js와 같은 이유입니다 — 배경이 침묵하면 "넣는 중…"에서 영영 멈춥니다.
   */
  function askBg(msg, timeoutMs = 10000) {
    return new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res({ ok: false, message: "응답 시간 초과" }); } }, timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          res(resp || { ok: false, message: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "응답 없음" });
        });
      } catch (e) {
        if (!done) { done = true; clearTimeout(t); res({ ok: false, message: e.message }); }
      }
    });
  }

  /** 편집기가 iframe 속이면 좌표에 iframe 위치를 더해야 합니다 (draft-insert.js와 같은 규칙). */
  const frameOffset = () => {
    try {
      const fe = window.frameElement;
      if (fe) { const r = fe.getBoundingClientRect(); return { fx: r.left, fy: r.top }; }
    } catch {}
    return { fx: 0, fy: 0 };
  };

  // ─────────────────────────────── 사진 받아오기

  function dataUriToBlob(uri) {
    const s = String(uri || "");
    const comma = s.indexOf(",");
    if (comma < 0) throw new Error("사진 자료가 이상합니다");
    const mime = (s.slice(0, comma).match(/data:([^;]+)/) || [, "image/jpeg"])[1];
    const bin = atob(s.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /**
   * 사진 한 장을 받아옵니다. 바깥 주소는 편집국 프록시를 거칩니다.
   * data:·blob: 은 이미 손에 있는 것이라 그대로 씁니다.
   */
  async function fetchPhoto(url) {
    const u = String(url || "");
    if (!u) throw new Error("사진 주소가 비었습니다");
    if (u.startsWith("data:")) return dataUriToBlob(u);
    if (u.startsWith("blob:")) {
      const r = await fetch(u);
      if (!r.ok) throw new Error("사진을 못 읽었습니다");
      return r.blob();
    }
    const via = u.startsWith(FLOOR) ? u : `${FLOOR}/api/photos/proxy?url=${encodeURIComponent(u)}`;
    const r = await askBg({ type: "fetchImage", url: via }, 30000);
    if (!r || !r.ok) throw new Error((r && r.message) || "사진을 못 받았습니다");
    return dataUriToBlob(r.dataUri);
  }

  /**
   * 네이버가 확실히 받는 포맷으로 맞춥니다.
   * ⚠️ webp·avif는 편집기가 거부하는 경우가 있고, 거부당하면 아무 일도 안 일어나
   * "왜 안 되지"만 남습니다. 미리 jpeg로 바꿔 그 경우를 없앱니다.
   */
  async function toSafeImage(blob) {
    if (/^image\/(jpeg|png)$/i.test(blob.type)) return blob;
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      const out = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
      return out || blob;
    } catch { return blob; }
  }

  /** 클립보드에는 png만 확실히 실립니다. */
  async function toPng(blob) {
    if (/^image\/png$/i.test(blob.type)) return blob;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    return (await new Promise((res) => c.toBlob(res, "image/png"))) || blob;
  }

  // ─────────────────────────────── 편집기 살피기

  /** 지금 본문에 들어 있는 사진 수. 넣기 전후로 세어서 **진짜 들어갔는지** 확인합니다. */
  function imageCount() {
    return document.querySelectorAll(
      ".se-component.se-image img, img.se-image-resource, img[class*='se-image']"
    ).length;
  }

  /**
   * 네이버 사진 업로드가 쓰는 파일칸.
   * ⚠️ 화면에 안 보이게 숨겨져 있습니다 — 보이는지로 거르면 못 찾습니다.
   * (offsetParent로 판정했다가 통째로 걸러진 사고가 이 저장소에 이미 있습니다)
   */
  function findFileInput() {
    const all = [...document.querySelectorAll('input[type="file"]')].filter((i) => !i.disabled);
    return all.find((i) => /image|jpg|jpeg|png|gif/i.test(i.accept || "")) || all[0] || null;
  }

  /** 원고에 [사진: …] 이라고만 적혀 있는 문단들. 위에서부터 순서대로. */
  function photoSlots() {
    const I = window.__wsInsert;
    if (!I || !I.bodyParagraphs) return [];
    return I.bodyParagraphs().filter((p) => PHOTO_SLOT.test(p.innerText || ""));
  }

  /**
   * 자리표시 줄을 **통째로 고릅니다**(세 번 클릭).
   *
   * ⚠️ 왜 진짜 클릭인가: 편집기는 코드가 세운 커서를 무시하고 **실제 마우스가 만든
   * 자기 커서**만 인정합니다 (본문 붙여넣기에서 실측으로 확정된 사실).
   * 줄을 골라두면 사진이 그 자리를 **대신하며** 들어가서, 자리표시 글자를 따로
   * 지울 필요가 없습니다 — DOM을 손으로 지우면 편집기 모델에는 글자가 남아 되살아납니다.
   */
  async function selectSlot(para) {
    const r = para.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const { fx, fy } = frameOffset();
    const x = Math.round(fx + r.left + Math.min(40, Math.max(5, r.width / 2)));
    const y = Math.round(fy + r.top + r.height / 2);
    const resp = await askBg({ type: "uiClick", x, y, clicks: 3 });
    if (resp && resp.ok) { await sleep(250); return true; }
    return false;
  }

  /** 넣은 뒤 네이버가 자기 서버에 올릴 때까지 기다립니다. */
  async function waitForUpload(before, ms = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (imageCount() > before) return true;
      await sleep(500);
    }
    return false;
  }

  // ─────────────────────────────── 넣는 두 가지 길

  /**
   * ① 파일칸에 파일 넣기 — 사람이 '사진' 버튼을 눌러 파일을 고른 것과 같습니다.
   * 포커스가 필요 없어서 **무인 모드에서도** 됩니다. 이게 1순위인 이유입니다.
   */
  async function viaFileInput(file) {
    const input = findFileInput();
    if (!input) return { ok: false, why: "사진 파일칸을 못 찾았습니다" };
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, how: "파일칸" };
    } catch (e) {
      return { ok: false, why: `파일칸: ${e.message}` };
    }
  }

  /**
   * ② 클립보드 + 진짜 Ctrl+V — 사람이 사진을 복사해 붙여넣는 것과 같습니다.
   * ⚠️ 창이 앞에 있어야 하고, 편집기가 iframe이면 권한 정책에 막힐 수 있습니다
   *    (본문 붙여넣기에서 실제로 겪었습니다). 그래서 2순위입니다.
   */
  async function viaClipboard(blob, para) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      return { ok: false, why: "이 화면에서는 클립보드를 못 씁니다" };
    }
    try {
      const png = await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    } catch (e) {
      return { ok: false, why: `클립보드에 못 담았습니다: ${e.message}` };
    }
    const r = para.getBoundingClientRect();
    const { fx, fy } = frameOffset();
    const resp = await askBg({
      type: "clickPaste",
      x: Math.round(fx + r.left + Math.min(40, Math.max(5, r.width / 2))),
      y: Math.round(fy + r.top + r.height / 2),
    });
    if (!resp || !resp.ok) return { ok: false, why: `붙여넣기: ${(resp && resp.message) || "응답 없음"}` };
    return { ok: true, how: "클립보드" };
  }

  // ─────────────────────────────── 한 장 넣기

  /**
   * 자리표시 한 곳에 사진 한 장.
   * @returns {ok, how} 또는 {ok:false, why}
   */
  async function insertPhotoAt(para, blob, name = "photo.jpg") {
    const safe = await toSafeImage(blob);
    const file = new File([safe], name, { type: safe.type || "image/jpeg" });

    await selectSlot(para);          // 실패해도 계속합니다 — 커서가 이미 맞을 수 있습니다
    const before = imageCount();

    const first = await viaFileInput(file);
    if (first.ok && (await waitForUpload(before))) return { ok: true, how: first.how };

    // ①이 안 먹었습니다. 자리를 다시 고르고 ②로 갑니다.
    await selectSlot(para);
    const second = await viaClipboard(safe, para);
    if (second.ok && (await waitForUpload(imageCount()))) return { ok: true, how: second.how };

    return {
      ok: false,
      why: [first.why, second.why].filter(Boolean).join(" / ") || "편집기가 사진을 안 받았습니다",
    };
  }

  // ─────────────────────────────── 전부 채우기

  /**
   * 원고의 [사진: …] 자리를 위에서부터 순서대로 채웁니다.
   *
   * ⚠️ 한 장 넣을 때마다 문단이 바뀌므로 **매번 다시 찾습니다.**
   *    처음에 목록을 떠두고 순서대로 쓰면 두 번째부터 엉뚱한 자리에 들어갑니다.
   *
   * ⚠️ 실패한 자리는 **그대로 둡니다.** 자리표시가 남아 있어야 사장님이 무엇이 빠졌는지 압니다.
   */
  async function fillPhotoSlots(photos, say = () => {}) {
    const list = (Array.isArray(photos) ? photos : []).filter((p) => p && (p.url || p.src));
    if (!list.length) return { ok: false, why: "넣을 사진이 없습니다", done: 0, total: 0 };
    if (!window.__wsInsert) return { ok: false, why: "붙여넣기 도구를 못 찾았습니다", done: 0, total: 0 };

    let done = 0;
    let riskHigh = 0;                 // 저작권 위험 '높음'으로 들어간 장수
    const failed = [];
    const total = Math.min(list.length, photoSlots().length);
    if (!total) return { ok: false, why: "본문에 [사진: …] 자리가 없습니다", done: 0, total: 0 };

    for (let i = 0; i < total; i++) {
      const slots = photoSlots();
      if (!slots.length) break;                       // 자리를 다 채웠습니다
      const para = slots[0];                          // 항상 남아 있는 첫 자리
      const photo = list[i];
      const label = String(photo.credit || photo.alt || `사진 ${i + 1}`).slice(0, 24);
      say(`사진 ${i + 1}/${total} 넣는 중… (${label})`);

      try {
        const blob = await fetchPhoto(photo.url || photo.src);
        const r = await insertPhotoAt(para, blob, `photo-${i + 1}.jpg`);
        if (r.ok) {
          done++;
          if (String(photo.risk || "") === "높음") riskHigh++;
          await sleep(600);                            // 편집기가 다음 사진을 받을 짬
        } else failed.push(`${i + 1}번: ${r.why}`);
      } catch (e) {
        failed.push(`${i + 1}번: ${String((e && e.message) || e).slice(0, 60)}`);
      }
    }

    /**
     * ⚠️ 저작권 위험을 **숫자로 돌려줍니다.**
     * `/api/photos/collect`는 사장님이 고르지 않아도 원고에 사진을 넣습니다. 그래서
     * 기사 사진(risk '높음')이 조용히 들어갈 수 있습니다. 막지는 않습니다 —
     * 판단은 사장님 몫이라는 게 이 시스템의 설계입니다. 다만 **모르고 지나가면 안 됩니다.**
     */
    return {
      ok: done > 0,
      done,
      total,
      riskHigh,
      failed,
      why: done ? null : (failed[0] || "한 장도 못 넣었습니다"),
    };
  }

  window.__wsPhoto = { fillPhotoSlots, insertPhotoAt, photoSlots, fetchPhoto, PHOTO_SLOT };
})();
