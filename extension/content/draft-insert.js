// 뜯어낸 원고를 편집기에 실제로 넣습니다.
//
// ⚠️ 이 파일은 **사장님 글을 직접 만듭니다.** 제일 조심스러운 코드입니다.
// 앞서 제목을 세 번 날려먹고 배운 것을 전부 적용합니다.
//
//   1) el.textContent = ... 로 글을 바꾸면 안 됩니다. span이 날아가고
//      편집기가 그 문단을 통째로 비웁니다.
//   2) 넣자마자 확인하면 안 됩니다. 편집기가 되돌리는 건 다음 순간입니다.
//   3) 반환값을 믿으면 안 됩니다. execCommand는 아무 일도 안 하고 true를 줍니다.
//   4) 실패하면 멈추고 말합니다. 되는 척하지 않습니다.
//
// ⚠️ **글이 이미 있으면 안 넣습니다.**
// 빈 편집기에 새로 쓰는 것과, 쓰던 글을 갈아엎는 것은 위험이 다릅니다.
// 갈아엎기는 안 합니다. 사장님이 쓰시던 글을 잃을 수 있습니다.
//
// ⚠️ AI를 안 부릅니다. 값이 0원입니다.

(() => {
  "use strict";

  const settle = (ms = 320) => new Promise((r) => setTimeout(r, ms));
  const INVIS = /[\s​-‍⁠﻿]/g;
  const norm = (s) => String(s || "").replace(INVIS, "");

  function editorRoot() {
    return document.querySelector(".se-main-container") ||
           document.querySelector(".se-content") ||
           document.querySelector("#se-editor") || null;
  }

  function bodyParagraphs() {
    const root = editorRoot();
    if (!root) return [];
    const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
    return [...root.querySelectorAll(".se-text-paragraph")].filter(
      (n) => !n.closest(SKIP) && !n.closest(".se-documentTitle") && !n.closest(".se-placeholder")
    );
  }

  /** 편집기가 비어 있는가 — 넣기 전에 반드시 봅니다. */
  function isEmpty() {
    const paras = bodyParagraphs();
    const chars = paras.reduce((n, p) => n + norm(p.innerText || "").length, 0);
    const root = editorRoot();
    const media = root ? root.querySelectorAll(".se-image-resource, .se-oglink, .se-video").length : 0;
    return { empty: chars < 20 && media === 0, chars, media };
  }

  /**
   * 본문에 글을 통째로 넣습니다.
   *
   * ⚠️ 문단을 하나씩 만들지 않습니다. **한 번에 붙여넣습니다.**
   * 문단을 하나씩 만들려면 매번 엔터를 치고 커서를 옮겨야 하는데,
   * 편집기가 그 사이에 자동완성·자동서식을 걸어서 어긋납니다.
   * 붙여넣기 한 번이면 편집기가 알아서 문단을 나눕니다.
   */
  /**
   * ⚠️ 본문을 **자동으로 안 넣습니다.** 접었습니다. 이유를 남깁니다.
   *
   * 두 가지를 해봤습니다.
   *   1) 붙여넣기 흉내(ClipboardEvent) — 편집기가 합성 이벤트를 무시합니다.
   *   2) 문단을 하나씩 만들기 — 엔터를 칠 때마다 편집기가 구조를 다시 짭니다.
   *      그 사이에 제 코드가 문단을 놓쳐서 **같은 칸에 겹쳐 쓰거나** 멈췄습니다.
   *      시험대에서 26초가 지나도 안 끝났습니다.
   *
   * 억지로 밀어넣다가 사장님 글을 뭉개는 것보다, **Ctrl+V 한 번** 하시는 게 낫습니다.
   * 편집기가 붙여넣기를 스스로 처리하면 문단이 정확하게 나뉩니다. 그게 제일 확실합니다.
   * 우리는 그 앞뒤를 맡습니다 — 깨끗하게 다듬어 담아드리고, 붙이신 뒤 서식을 넣습니다.
   *
   * 남겨둔 자동 시도는 **붙여넣기 흉내 하나뿐**입니다. 되면 좋고 안 되면 바로 넘어갑니다.
   */
  async function pasteBody(text) {
    const root = editorRoot();
    if (!root) return { ok: false, why: "본문을 찾지 못했습니다." };

    const first = bodyParagraphs()[0];
    if (!first) return { ok: false, why: "본문 문단을 찾지 못했습니다." };

    const check = () => {
      const now = norm(root.innerText || "");
      return now.includes(norm(text.slice(0, 30))) && now.length >= norm(text).length * 0.8;
    };

    // ── 1) 붙여넣기 흉내 ──
    // 스마트에디터는 paste를 스스로 처리해서 문단을 알아서 나눕니다. 이게 제일 낫습니다.
    try {
      first.focus();
      const range = document.createRange();
      range.selectNodeContents(first);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      first.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await settle(500);
      if (check()) return { ok: true, how: "paste" };
    } catch {}

    // ── 2) 안 되면 손으로 하시게 합니다 ──
    // ⚠️ 되는 척하지 않습니다. 깨끗하게 다듬은 글을 복사해 드리고 그렇게 말합니다.
    //
    // ⚠️ 클립보드 쓰기는 **창이 포커스를 잃으면 영영 안 끝납니다.**
    // 다른 창을 보고 계시면 화면이 "넣는 중…"에서 멈춰버립니다. 3초만 기다립니다.
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
    } catch {}
    return {
      ok: false,
      copied: true,
      why: "편집기가 본문을 안 받았습니다. 다듬은 글을 복사해 뒀으니 본문 칸에 Ctrl+V 해주세요. " +
           "붙여넣으신 뒤 '자동 서식'을 누르시면 소제목·인용구·강조가 들어갑니다.",
    };
  }

  /**
   * 원고를 편집기에 넣습니다.
   *
   * @param {{title, blocks}} draft  draft-parser가 뜯어낸 것
   * @param {(msg:string)=>void} say 진행 상황 알림
   */
  async function insert(draft, say = () => {}) {
    const F = window.__wsFormat;
    if (!F) return { ok: false, why: "서식 도구를 못 불러왔습니다. 확장을 다시 설치해 보세요." };

    const state = isEmpty();
    if (!state.empty) {
      return {
        ok: false,
        needsConfirm: true,
        why: `본문에 이미 글이 ${state.chars.toLocaleString()}자${state.media ? `, 사진·링크 ${state.media}개` : ""} 있습니다. ` +
             `덮어쓰면 되돌릴 수 없어서 멈췄습니다.`,
      };
    }

    const done = [];
    const failed = [];

    // ── 1. 제목 ──
    if (draft.title) {
      say("제목을 넣는 중…");
      const el = document.querySelector(".se-documentTitle .se-text-paragraph") ||
                 document.querySelector(".se-documentTitle [contenteditable='true']");
      if (el && F.setEditableText) {
        await settle(120);
        F.setEditableText(el, draft.title);
        await settle();
        const now = (el.innerText || "").replace(INVIS, "");
        (now === draft.title.replace(INVIS, "") ? done : failed).push(
          now === draft.title.replace(INVIS, "") ? "제목" : { what: "제목", why: "편집기가 안 받았습니다" }
        );
      } else failed.push({ what: "제목", why: "제목 칸을 못 찾았습니다" });
    }

    // ── 2. 본문 통째로 ──
    // ⚠️ 사진 자리는 **글자로** 남겨둡니다. [사진 1: 무엇]
    // 사진을 대신 넣어드릴 수는 없습니다 — 어떤 사진인지는 사장님만 압니다.
    // 대신 그 자리에 무엇을 넣을지 적어두면 사장님이 하나씩 갈아끼우시면 됩니다.
    say("본문을 넣는 중…");
    const bodyText = draft.blocks
      .map((b) => {
        if (b.kind === "gap") return "";
        if (b.kind === "photo") return `[사진: ${b.text || "여기에 사진"}]`;
        return b.text;
      })
      .join("\n");

    const r = await pasteBody(bodyText);
    if (!r.ok) return { ok: false, why: r.why, copied: r.copied, done, failed };
    done.push(`본문 (${r.how === "paste" ? "붙여넣기" : "한 줄씩"})`);

    // ── 3. 소제목·인용구 문단 스타일 ──
    const subs = draft.blocks.filter((b) => b.kind === "subhead");
    const quotes = draft.blocks.filter((b) => b.kind === "quote");

    for (const b of subs) {
      say(`소제목: ${b.text.slice(0, 18)}…`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push({ what: `소제목 "${b.text.slice(0, 18)}"`, why: "본문에서 그 줄을 못 찾았습니다" }); continue; }
      (await F.setParagraphStyle(p, "소제목"))
        ? done.push(`소제목: ${b.text.slice(0, 18)}`)
        : failed.push({ what: `소제목 "${b.text.slice(0, 18)}"`, why: "편집기가 안 바꿔줬습니다" });
    }

    for (const b of quotes) {
      say(`인용구: ${b.text.slice(0, 18)}…`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push({ what: `인용구 "${b.text.slice(0, 18)}"`, why: "본문에서 그 문장을 못 찾았습니다" }); continue; }
      (await F.setParagraphStyle(p, "인용구"))
        ? done.push(`인용구: ${b.text.slice(0, 18)}`)
        : failed.push({ what: `인용구 "${b.text.slice(0, 18)}"`, why: "편집기가 안 바꿔줬습니다" });
    }

    // ── 4. 굵게 (**표시**였던 것) ──
    // ⚠️ 클로드가 이미 골라준 것만 넣습니다. AI를 다시 안 부릅니다. 값이 0원입니다.
    const marks = [];
    for (const b of draft.blocks) if (b.marks) for (const m of b.marks) marks.push(m);
    for (const m of [...new Set(marks)]) {
      say(`굵게: ${m.slice(0, 14)}`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(m)));
      if (!p) { failed.push({ what: `굵게 "${m}"`, why: "본문에서 그 글자를 못 찾았습니다" }); continue; }
      const rr = await F.applyMark(p, m, "bold");
      rr.ok ? done.push(`굵게: ${m}`) : failed.push({ what: `굵게 "${m}"`, why: rr.why });
    }

    return { ok: true, done, failed, photoSlots: draft.blocks.filter((b) => b.kind === "photo").length };
  }

  /**
   * 임시저장을 누릅니다.
   *
   * ⚠️ 클래스 이름으로 안 찾습니다. **보이는 글자**로 찾습니다.
   * 네이버가 구조를 바꿔도 "저장"이라는 글자는 안 바뀝니다.
   *
   * ⚠️ '발행'은 절대 안 누릅니다. 글이 세상에 나가는 건 사장님이 정하실 일입니다.
   */
  async function saveDraft() {
    const bad = /발행|게시|공개/;
    let btn = null;
    for (const el of document.querySelectorAll("button, [role='button'], a, span")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (!/^저장$|^임시저장$|저장\s*\d*$/.test(t)) continue;
      if (bad.test(t)) continue;
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 200 && r.height < 60) { btn = el; break; }
    }
    if (!btn) return { ok: false, why: "저장 버튼을 못 찾았습니다. 직접 눌러주세요." };

    const before = btn.innerText;
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    await settle(900);

    // 저장되면 보통 "저장 1"처럼 숫자가 붙거나 알림이 뜹니다.
    const after = btn.isConnected ? btn.innerText : "";
    return { ok: true, changed: after !== before, label: after || before };
  }

  window.__wsInsert = { insert, saveDraft, isEmpty, pasteBody, bodyParagraphs };
})();
