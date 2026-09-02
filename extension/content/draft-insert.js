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

  /**
   * 네이버가 띄우는 **안내 문구**를 걸러냅니다. 사장님이 쓰신 글이 아닙니다.
   *
   * ⚠️ 실제로 사고가 났습니다. 빈 편집기인데 이렇게 나왔습니다:
   *     "본문에 이미 글이 있습니다 — 지금 27자가 들어 있습니다"
   *
   * 그 27자는 네이버가 띄운 글감 제안이었습니다:
   *     "나를 돌아보는 회고, 뜻밖의 발견을 기다립니다. #모두의회고"  ← 공백 빼고 정확히 27자
   *
   * `.se-placeholder` 만 걸러내고 있었는데, 네이버는 자리마다 다른 이름을 씁니다.
   * 그래서 **placeholder 라는 말이 들어간 것은 전부** 걸러냅니다.
   * 클래스 이름이 또 바뀌어도 버틸 확률이 높습니다.
   */
  const PLACEHOLDER =
    ".se-placeholder, [class*='placeholder'], [class*='Placeholder'], " +
    "[data-placeholder], [aria-hidden='true'], .se-drop-guide, .se-guide";

  /**
   * ⚠️ 글자 무늬로도 거릅니다. 클래스만 믿었다가 실제 네이버에서 뚫렸습니다.
   *
   * 1.22.0 에서 placeholder 계열 클래스를 걸렀는데, 사장님 화면에서
   * "나를 돌아보는 회고, 뜻밖의 발견을 기다립니다. #모두의회고" 가
   * **여전히 27자로 세어졌습니다.** 네이버가 그 안내 문구엔 제가 모르는
   * 이름을 씁니다. 이름은 저쪽 마음이라 언제든 또 바뀝니다.
   *
   * 그런데 글감 안내 문구는 **생김새가 일정합니다**:
   * "…기다립니다/남겨보세요/기록해 보세요" 로 권하고 끝에 #태그 하나.
   * 사람이 본문 첫 줄을 이렇게 쓸 일은 없습니다.
   */
  const GUIDE_TEXT = /(기다립니다|남겨보세요|남겨\s*보세요|기록해\s*보세요|들려주세요|적어보세요)\.?\s*#[가-힣A-Za-z0-9]+\s*$/;

  function isPlaceholder(el) {
    if (!el) return false;
    if (GUIDE_TEXT.test((el.innerText || "").trim())) return true;
    if (el.closest(PLACEHOLDER)) return true;
    // 네이버가 클래스 대신 속성으로 표시하는 경우도 있습니다.
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      if (n.getAttribute && n.getAttribute("contenteditable") === "false") return true;
    }
    return false;
  }

  /**
   * ⚠️ "세는 용도"와 "붙일 자리 찾는 용도"를 **갈라야 합니다.** 실제로 사고가 났습니다.
   *
   * 1.25.0 에서 글감 안내 문구("나를 돌아보는 회고… #모두의회고")를 글자 수에서
   * 뺐습니다. 그건 맞습니다. 그런데 빈 편집기에서는 **그 문구가 붙은 문단이
   * 유일한 진짜 문단**입니다. 붙여넣기가 그 문단을 잡고 시작해야 하는데
   * 걸러버리니 "본문 문단을 찾지 못했습니다"가 떴습니다.
   * 제목은 들어가고 본문만 안 들어가는 — 사장님이 보신 그 증상입니다.
   *
   * 그래서:
   *   셀 때(includeGuide=false, 기본) — 안내 문구 문단을 뺍니다. 글이 아니니까.
   *   붙일 때(includeGuide=true)     — 포함합니다. 커서를 세울 진짜 문단이니까.
   */
  function bodyParagraphs({ includeGuide = false } = {}) {
    const root = editorRoot();
    if (!root) return [];
    const SKIP = ".se-oglink, .se-image, .se-imageStrip, .se-video, .se-sticker, .se-material, .se-placesMap, .se-code";
    return [...root.querySelectorAll(".se-text-paragraph")].filter(
      (n) => !n.closest(SKIP) && !n.closest(".se-documentTitle") &&
             (includeGuide || !isPlaceholder(n))
    );
  }

  /**
   * 편집기가 비어 있는가 — 넣기 전에 반드시 봅니다.
   *
   * ⚠️ 여기서 잘못 세면 **사장님이 아무것도 못 하십니다.** 넣기 버튼이 잠기는데
   * 정작 지울 글이 없으니까요. 그래서 무엇을 세었는지 같이 돌려줍니다 —
   * 화면에서 "이게 글인가요?" 하고 보여드릴 수 있게요.
   */
  function isEmpty() {
    const paras = bodyParagraphs();
    /**
     * ⚠️ 세는 것과 보여주는 것을 **갈라야 합니다.**
     *
     * 처음엔 공백을 지운 글자(norm)를 화면에도 그대로 썼습니다. 그랬더니
     *   "나를돌아보는회고,뜻밖의발견을기다립니다.#모두의회고"
     * 이렇게 나왔습니다. 사장님이 보시면 화면이 고장난 줄 아십니다.
     *
     * 셀 때는 공백을 빼는 게 맞습니다(공백만 있는 문단을 글로 세면 안 되니까요).
     * 보여줄 때는 **원래 글자 그대로** 보여드립니다.
     */
    const rows = paras
      .map((p) => ({
        raw: (p.innerText || "").trim(),
        norm: norm(p.innerText || ""),
        // 또 잘못 세면 화면의 이 이름만 보고 무엇을 걸러야 할지 알 수 있습니다.
        cls: String(p.className || "").slice(0, 60),
      }))
      .filter((r) => r.norm);
    const chars = rows.reduce((n, r) => n + r.norm.length, 0);
    const root = editorRoot();
    const media = root ? root.querySelectorAll(".se-image-resource, .se-oglink, .se-video").length : 0;
    return {
      empty: chars < 20 && media === 0,
      chars,
      media,
      // 무엇을 글이라고 봤는지. 안내 문구를 또 잘못 세면 이걸로 바로 압니다.
      sample: rows.slice(0, 3).map((r) => r.raw.slice(0, 40) + "  〔" + r.cls + "〕"),
    };
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
  /**
   * 클립보드에 글 담기 — 두 겹입니다.
   *   1) 요즘 방식(navigator.clipboard) — 되면 제일 깔끔합니다.
   *   2) 옛 방식(execCommand 복사) — 네이버 편집기 iframe에서 요즘 방식이
   *      권한 정책으로 막히는 걸 실제로 겪어서 답니다. 숨은 칸에 글을 넣고
   *      선택해서 복사한 뒤 바로 지웁니다.
   * ⚠️ 2번은 **선택(커서)을 훔쳐갑니다.** 부른 쪽이 반드시 커서를 다시 세워야 합니다.
   */
  async function writeClip(text, html = null) {
    /**
     * ⚠️ html을 주면 **서식째** 복사합니다 (굵게·크기·색이 든 채로).
     * 편집기가 코드로 거는 서식은 무시해도, **붙여넣기에 실려 온 서식은
     * 받아들입니다** — 사람들이 워드에서 굵은 글씨를 복사해 붙이는 그 길입니다.
     * 숨은 편집칸에 HTML을 넣고 선택-복사하면 글자·서식 두 벌이 함께 담깁니다.
     */
    if (html) {
      try {
        const dv = document.createElement("div");
        dv.contentEditable = "true";
        dv.innerHTML = html;
        dv.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
        document.body.appendChild(dv);
        const range = document.createRange();
        range.selectNodeContents(dv);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand("copy");
        dv.remove();
        if (ok) return true;
      } catch {}
      // 서식 복사가 막히면 맨글자로라도 — 본문이 안 들어가는 것보단 낫습니다.
    }
    try {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
      return true;
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  async function pasteBody(text, { overwrite = false, html = null } = {}) {
    const root = editorRoot();
    if (!root) return { ok: false, why: "본문을 찾지 못했습니다." };

    let paras = bodyParagraphs({ includeGuide: true });
    let first = paras[0];

    /**
     * ⚠️ 문단이 하나도 없으면 — 새 문서에서 편집기가 본문 칸을 아직 안 만든
     * 경우가 있습니다(안내 문구는 겉그림일 뿐 진짜 문단이 아닐 때).
     * 본문 자리를 한 번 눌러주면 편집기가 문단을 만듭니다. 그걸 대신 눌러봅니다.
     */
    if (!first) {
      try {
        const area = root.querySelector(".se-component.se-text") ||
                     root.querySelector(".se-components-wrap") || root;
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          area.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
        await settle(400);
        paras = bodyParagraphs({ includeGuide: true });
        first = paras[0];
      } catch {}
    }

    if (!first) {
      // ⚠️ 자리를 못 찾아도 빈손으로 끝내지 않습니다. 예전엔 여기서 그냥
      // 오류만 띄웠는데, 그러면 복사조차 안 돼서 사장님이 할 게 없었습니다.
      // 서식째(html) 담습니다 — 손 Ctrl+V로도 형광·굵게·크기가 그대로 들어가게.
      await writeClip(text, html);
      // ⚠️ 진단 꼬리표 — 원격에서 화면만 보고도 원인을 좁힐 수 있게, 무엇이
      // 보였는지 숫자로 남깁니다. (전체 문단 수 / 제목 쪽 문단 수)
      const all = document.querySelectorAll(".se-text-paragraph").length;
      const inTitle = document.querySelectorAll(".se-documentTitle .se-text-paragraph").length;
      return {
        ok: false, copied: true,
        why: "붙일 자리를 못 찾았습니다. 다듬은 글은 복사해 뒀으니 본문 칸을 한 번 누르고 Ctrl+V 해주세요." +
             ` (진단: 문단 ${all}개, 제목 쪽 ${inTitle}개)`,
      };
    }

    const check = () => {
      const now = norm(root.innerText || "");
      return now.includes(norm(text.slice(0, 30))) && now.length >= norm(text).length * 0.8;
    };

    /**
     * 붙일 자리에 커서·선택을 세웁니다. **여러 번 불러도 되게** 따로 뺐습니다 —
     * 클립보드 예비 복사(execCommand)가 선택을 훔쳐가서, 키를 보내기 직전에
     * 반드시 다시 세워야 하기 때문입니다.
     */
    const placeCaret = () => {
      first.focus();
      const range = document.createRange();
      /**
       * ⚠️ 덮어쓰기("그래도 넣기")면 **본문 전체**를 골라서 그 위에 붙입니다.
       * 처음엔 첫 문단만 갈아치웠습니다 — 그러면 옛 글 나머지가 새 글 아래에
       * 그대로 남습니다. 덮어쓰겠다고 하신 건데 반만 덮는 셈이었습니다.
       */
      if (overwrite && paras.length > 1) {
        range.setStartBefore(first);
        range.setEndAfter(paras[paras.length - 1]);
      } else {
        range.selectNodeContents(first);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };

    // ── 1) 붙여넣기 흉내 ──
    // 스마트에디터는 paste를 스스로 처리해서 문단을 알아서 나눕니다. 이게 제일 낫습니다.
    try {
      placeCaret();
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      first.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await settle(500);
      if (check()) return { ok: true, how: "paste" };
    } catch {}

    // ── 2) 진짜 Ctrl+V ──
    // 흉내(1번)는 진짜 편집기가 무시합니다. 그래서 배경 작업자에게 부탁해
    // **브라우저가 직접 누르는 붙여넣기 키**를 보냅니다. 편집기는 사람 입력과
    // 구별하지 못합니다. 순서가 중요합니다:
    //   클립보드에 글을 담고 → 담긴 게 확인됐을 때만 → 키를 보냅니다.
    // 담기 전에 키부터 보내면 **엉뚱한 옛 클립보드 내용**이 붙습니다.
    //
    // ⚠️ 클립보드 쓰기는 **창이 포커스를 잃으면 영영 안 끝납니다.** 3초만 기다립니다.
    // ⚠️ 그리고 네이버 편집기는 iframe 속이라 **클립보드 API가 권한 정책으로
    // 통째로 막히는 경우**가 있습니다 (사장님 화면에서 실제 확인, 2026-08-28).
    // 그래서 막히면 옛 방식(execCommand 복사)으로 한 번 더 시도합니다 —
    // 그 방식은 권한 정책을 안 탑니다.
    const clipOk = await writeClip(text, html);

    /**
     * 사다리에 오르기 전 — **타자 경로.** 클립보드도 붙여넣기도 안 거치고,
     * 타자 치듯 본문을 직접 입력합니다(insertText). 붙여넣기 신호를 편집기가
     * 무시하는 걸 실측으로 확인해서(진단: "키는 들어갔는데 안 받음") 답니다.
     * ⚠️ 문단이 제대로 나뉘었는지까지 확인하고, 한 덩어리로 뭉쳤으면
     * 되돌리기(undo) 후 다음 사다리로 갑니다 — 뭉친 글을 두면 서식이 다 망가집니다.
     */
    const paraGoal = Math.max(3, Math.round((text.match(/\n/g) || []).length * 0.4));
    const diags = [];
    /**
     * ⚠️ 순서 중요 (1.27.8): 검증된 승자(진짜 클릭+붙여넣기)가 **맨 앞**입니다.
     * 서식(굵게·소제목)이 클립보드에 실려 있어서, 이 길로 들어가야 서식까지
     * 함께 들어갑니다. 타자 경로는 맨글자라 뒤로 물렸습니다.
     */

    /**
     * ★ 결정타 — **진짜 클릭 + Ctrl+V.**
     * 편집기는 코드가 세운 커서를 무시하고 **실제 마우스 클릭이 만든 자기
     * 커서**만 인정합니다 (실측 진단으로 확정). 그래서 브라우저에게 본문
     * 좌표를 진짜로 클릭시키고 바로 Ctrl+V 를 보냅니다 — 사람 손 그대로.
     * 편집기가 iframe 속이면 좌표에 iframe 위치를 더해야 합니다 (같은 주소라 읽힘).
     */
    if (clipOk && !overwrite) {
      try {
        const r1 = first.getBoundingClientRect();
        let fx = 0, fy = 0;
        try {
          const fe = window.frameElement;
          if (fe) { const fr = fe.getBoundingClientRect(); fx = fr.left; fy = fr.top; }
        } catch {}
        const x = Math.round(fx + r1.left + Math.min(40, Math.max(5, r1.width / 2)));
        const y = Math.round(fy + r1.top + r1.height / 2);
        const resp = await askBg({ type: "clickPaste", x, y });
        if (resp && resp.ok) {
          await settle(900);
          if (check()) return { ok: true, how: "클릭+붙여넣기" };
          diags.push("진짜 클릭까지 했는데 안 받음");
        } else diags.push(`클릭경로: ${(resp && resp.message) || "응답 없음"}`);
      } catch (e) { diags.push(`클릭경로: ${e.message}`); }
    }

    /**
     * ⚠️ 사다리 축소 (1.27.15 결단): 타자·직통·키 경로는 이 편집기에서 전부
     * 무시당하는 걸 반복 실측했고, 시도 시간만 30초 넘게 잡아먹으며
     * "넣는 중…"이 길어지는 원인이었습니다. 이제 **클릭+붙여넣기 한 번만**
     * 빠르게 시도하고, 안 되면 몇 초 안에 확실한 길(Ctrl+V 한 번)로 안내합니다.
     * Ctrl+V 순간을 화면이 감지해 나머지(공식 소제목·임시저장)는 자동 진행됩니다.
     */
    const diag = "";

    // ── 3) 그래도 안 되면 손으로 하시게 합니다 ──
    // ⚠️ 되는 척하지 않습니다. 이미 복사돼 있으니 Ctrl+V 한 번이면 됩니다.
    // 진단 꼬리표 — 어느 고리가 끊겼는지 캡처 한 장으로 알 수 있게.
    return {
      ok: false,
      copied: clipOk,
      why: clipOk
        ? "자동으로 못 붙였습니다. 다듬은 글은 복사돼 있으니 본문 칸에 Ctrl+V 해주세요. " +
          "붙여넣으신 뒤 '자동 서식'을 누르시면 소제목·인용구·강조가 들어갑니다." +
          ((diags.length || diag) ? ` (진단: ${[...diags, diag].filter(Boolean).join(" / ")})` : "")
        : "클립보드가 막혀서 복사도 못 했습니다. 창을 이 화면에 둔 채로 다시 눌러주세요.",
    };
  }

  /**
   * 진짜 클릭으로 네이버 **공식 '소제목' 스타일**을 입힙니다 (1.27.9).
   *
   * ⚠️ 왜 이렇게까지: 편집기는 코드가 거는 스타일을 전부 무시하고, 클립보드
   * 서식으로는 "크고 굵은 글"까지만 됩니다. 왼쪽 드롭다운이 '소제목'으로 바뀌는
   * 공식 스타일은 **사람처럼 드롭다운을 눌러야만** 됩니다. 마침 진짜 클릭
   * 통로가 뚫려 있으니(본문 붙여넣기가 이걸로 성공), 그 손으로 눌러줍니다.
   * 문단 클릭 → 스타일 드롭다운 클릭 → '소제목' 항목 클릭, 소제목마다 3번.
   */
  /**
   * 배경 작업자에게 묻고 **제한시간 안에** 답을 받습니다.
   * ⚠️ 2026-08-28 실사고: 배경이 답을 안 주는 경우가 있어 "본문을 넣는 중…"에서
   * 영영 멈췄습니다. 어떤 단계도 이제 8초 넘게 기다리지 않습니다 —
   * 침묵하면 실패로 치고 다음 사다리로 갑니다.
   */
  function askBg(msg, timeoutMs = 8000) {
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

  const frameOffset = () => {
    try {
      const fe = window.frameElement;
      if (fe) { const r = fe.getBoundingClientRect(); return { fx: r.left, fy: r.top }; }
    } catch {}
    return { fx: 0, fy: 0 };
  };

  async function realClick(el, { dxCap = 60 } = {}) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const { fx, fy } = frameOffset();
    const x = Math.round(fx + r.left + Math.min(dxCap, r.width / 2));
    const y = Math.round(fy + r.top + r.height / 2);
    const resp = await askBg({ type: "uiClick", x, y });
    return !!(resp && resp.ok);
  }

  /**
   * 요소가 나타날 때까지 잠깐 기다리며 찾습니다.
   * ⚠️ 드롭다운 목록은 클릭 직후 바로 안 뜹니다 — 350ms 한 번으로는 소제목
   * 4곳 중 1곳이 타이밍을 놓쳤습니다 (실측). 250ms 간격으로 최대 5번 봅니다.
   */
  async function waitByText(startsWith, opts = {}, tries = 5) {
    for (let i = 0; i < tries; i++) {
      const el = visibleByText(startsWith, opts);
      if (el) return el;
      await settle(250);
    }
    return null;
  }

  /** 화면에 실제로 보이는 요소 중, 글자가 딱 이걸로 시작하는 것을 찾습니다. */
  function visibleByText(startsWith, { top = null } = {}) {
    for (const el of document.querySelectorAll("button, [role='button'], li, span, div")) {
      // 우리 도구 화면은 건너뜁니다 — 우리 버튼을 네이버 버튼으로 착각하면 엉뚱한 걸 누릅니다.
      if (el.closest("#ws-tools-panel, #ws-tools-dock, #ws-tools-counts, #ws-title-bar")) continue;
      const t = (el.innerText || "").trim();
      if (!t || !t.startsWith(startsWith) || t.length > startsWith.length + 3) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (top != null && r.top > top) continue;
      return el;
    }
    return null;
  }

  async function applyOfficialSubheads(draft, say = () => {}) {
    const subs = draft.blocks.filter((b) => b.kind === "subhead");
    let done = 0;
    const failed = [];
    const 크기실패 = [];
    for (const b of subs) {
      say(`소제목 스타일: ${b.text.slice(0, 14)}…`);
      const p = bodyParagraphs({ includeGuide: true })
        .find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push(b.text.slice(0, 14)); continue; }

      /**
       * 0) 그 문단을 화면 안으로 끌어옵니다.
       *
       * ⚠️ 이게 없어서 소제목이 통째로 실패했습니다(0/6). 클릭 좌표는 **화면 기준**이라
       * 문단이 스크롤 밖에 있으면 좌표가 화면을 벗어나고, 그 자리엔 아무것도 없어서
       * 클릭이 허공을 칩니다. 긴 글은 소제목 대부분이 화면 밖이라 거의 다 놓쳤습니다.
       * 가운데로 끌어와야 위쪽 도구줄이나 아래 글감 바에 가리지도 않습니다.
       */
      try { p.scrollIntoView({ block: "center" }); } catch {}
      await settle(300);

      // 1) 그 문단을 진짜로 클릭 — 편집기 커서가 그 문단에 섭니다.
      if (!(await realClick(p, { dxCap: 30 }))) { failed.push(b.text.slice(0, 14)); continue; }
      await settle(350);

      // 2) 왼쪽 위 문단 스타일 드롭다운('본문'이라고 쓰인 것) 클릭.
      const dd = await waitByText("본문", { top: 220 });
      if (!dd || !(await realClick(dd))) { failed.push(b.text.slice(0, 14)); continue; }

      // 3) 펼쳐진 목록에서 '소제목'으로 시작하는 항목 클릭 — 뜰 때까지 기다립니다.
      const item = await waitByText("소제목");
      if (!item || !(await realClick(item))) {
        // 목록이 열린 채 남지 않게 닫아줍니다.
        try { await realClick(dd); } catch {}
        failed.push(b.text.slice(0, 14));
        continue;
      }
      await settle(350);

      /**
       * 4) 🔴 크기를 38 로 되돌립니다 (2026-09-02 사장님 지시).
       *
       * ⚠️ **소제목 서식을 적용하면 네이버가 크기를 30 으로 되돌립니다.**
       * 사장님: "내가 소제목으로 바꾸게 되면 다시 글자 크기가 30으로 줄어들어서
       *          내가 다시 38로 크기를 변경해야돼. 굉장히 번거로워."
       *
       * 그래서 순서가 중요합니다 — **소제목 서식 먼저, 그다음 크기.**
       * 반대로 하면 소제목 서식이 크기를 도로 30 으로 만듭니다.
       *
       * 이 단계가 없어서 사장님이 소제목마다 손으로 38 을 누르고 계셨습니다.
       */
      const 커짐 = await setSubheadSize(p, 38);
      if (!커짐) 크기실패.push(b.text.slice(0, 14));

      done++;
    }
    return { done, total: subs.length, failed, 크기실패 };
  }

  /**
   * 소제목 문단의 글자 크기를 바꿉니다.
   *
   * 도구줄의 크기 드롭다운을 눌러 원하는 숫자를 고릅니다.
   * 문단 스타일 드롭다운과 같은 방식이라 findStyleDropdown 의 형제를 찾습니다.
   *
   * ⚠️ 못 바꿔도 **글은 그대로 둡니다.** 크기가 30 이어도 소제목이긴 하니
   *    글을 망가뜨리는 것보다 낫습니다. 실패는 세어서 알립니다.
   */
  async function setSubheadSize(paragraph, px) {
    try {
      const F = window.__wsFormat;
      if (!F || !F.realClick) return false;

      // 문단 전체를 선택합니다. 선택 없이 크기를 바꾸면 커서 위치에만 걸립니다.
      const r = document.createRange();
      r.selectNodeContents(paragraph);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      await settle(150);

      // 크기 드롭다운은 숫자(예: 30)가 적힌 단추입니다.
      const 숫자단추 = [...document.querySelectorAll("button, [role='button']")]
        .filter((n) => {
          const t = (n.innerText || "").trim();
          return /^\d{2}$/.test(t) && n.offsetParent !== null;
        })[0];
      if (!숫자단추) return false;
      F.realClick(숫자단추);
      await settle(200);

      const 항목 = [...document.querySelectorAll("button, li, [role='option']")]
        .find((n) => (n.innerText || "").trim() === String(px) && n.offsetParent !== null);
      if (!항목) { F.realClick(숫자단추); return false; }
      F.realClick(항목);
      await settle(200);
      return true;
    } catch { return false; }
  }

  /**
   * 원고의 구조(소제목·인용구·굵게)를 **지금 편집기에 있는 본문**에 입힙니다.
   *
   * ⚠️ 왜 따로 뺐는가 (2026-08-28 실사용 사고): 자동 붙이기가 실패해서 사장님이
   * 손으로 Ctrl+V 하신 뒤 "서식 넣기"를 눌렀는데, 그 버튼이 이 함수가 아니라
   * 일반 자동 서식(■ 표시를 찾는 도구)을 불렀습니다. 붙여넣은 글에는 ■가 이미
   * 벗겨져 있어서 아무것도 안 입혀졌습니다. **원고가 구조를 이미 아는데
   * 그걸 버리고 다시 찾게 시킨 것**이 잘못이었습니다.
   * 이제 자동 붙이기 성공 경로와 손 붙이기 경로가 같은 이 함수를 씁니다.
   */
  async function applyStructure(draft, say = () => {}) {
    const F = window.__wsFormat;
    const done = [], failed = [];
    if (!F) return { done, failed: [{ what: "서식", why: "서식 도구를 못 불러왔습니다" }] };

    const subs = draft.blocks.filter((b) => b.kind === "subhead");
    const quotes = draft.blocks.filter((b) => b.kind === "quote");

    for (const b of subs) {
      say(`소제목: ${b.text.slice(0, 18)}…`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push({ what: `소제목 "${b.text.slice(0, 18)}"`, why: "본문에서 그 줄을 못 찾았습니다" }); continue; }
      (await F.setParagraphStyle(p, "소제목"))
        ? done.push(`소제목: ${b.text.slice(0, 18)}`)
        : failed.push({ what: `소제목 "${b.text.slice(0, 18)}"`, why: (F.getLastWhy && F.getLastWhy()) || "편집기가 안 바꿔줬습니다" });
    }

    for (const b of quotes) {
      say(`인용구: ${b.text.slice(0, 18)}…`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push({ what: `인용구 "${b.text.slice(0, 18)}"`, why: "본문에서 그 문장을 못 찾았습니다" }); continue; }
      (await F.setParagraphStyle(p, "인용구"))
        ? done.push(`인용구: ${b.text.slice(0, 18)}`)
        : failed.push({ what: `인용구 "${b.text.slice(0, 18)}"`, why: (F.getLastWhy && F.getLastWhy()) || "편집기가 안 바꿔줬습니다" });
    }

    // 굵게 — ⚠️ 클로드가 이미 골라준 것만 넣습니다. AI를 다시 안 부릅니다. 0원.
    const marks = [];
    for (const b of draft.blocks) if (b.marks) for (const m of b.marks) marks.push(m);
    for (const m of [...new Set(marks)]) {
      say(`굵게: ${m.slice(0, 14)}`);
      const p = bodyParagraphs().find((n) => norm(n.innerText || "").includes(norm(m)));
      if (!p) { failed.push({ what: `굵게 "${m}"`, why: "본문에서 그 글자를 못 찾았습니다" }); continue; }
      const rr = await F.applyMark(p, m, "bold");
      rr.ok ? done.push(`굵게: ${m}`) : failed.push({ what: `굵게 "${m}"`, why: rr.why });
    }

    return { done, failed };
  }

  /**
   * 원고를 편집기에 넣습니다.
   *
   * @param {{title, blocks}} draft  draft-parser가 뜯어낸 것
   * @param {(msg:string)=>void} say 진행 상황 알림
   */
  /**
   * 제목을 넣는 검증된 길 — 통합 복사 마무리와 원고 붙이기가 **같이** 씁니다.
   *
   * ⚠️ 왜 이 길이어야 하나 (2026-08-31 실사고): 통합 복사 마무리가 다른 경로
   * (execCommand만 쓰는 applyTitle)로 제목을 넣었더니, DOM에는 글자가 보이는데
   * **편집기 내부 모델은 빈 채**였습니다. 그래서 회색 "제목" 안내가 계속 겹쳐 보이고,
   * 지우려 해도 (모델엔 지울 게 없으니) **지워지지 않고**, 발행하면 제목이 빠질 판이었습니다.
   *
   * 순서: ① 타자 흉내(setEditableText) → 확인 ② 안 먹으면 클립보드에 담고
   * 제목칸을 **진짜로 클릭** 후 Ctrl+V(디버거 경유 — 사람 입력과 구별 불가).
   * 확인은 같음(===)이 아니라 **포함**으로 — 안내 유령 글자("제목")가 붙어 있어서
   * 같음 비교는 실제로 들어갔는데도 거짓 실패를 냈습니다.
   */
  async function applyTitleReal(title, say = () => {}) {
    const F = window.__wsFormat;
    const el = document.querySelector(".se-documentTitle .se-text-paragraph") ||
               document.querySelector(".se-documentTitle [contenteditable='true']");
    if (!el || !F || !F.setEditableText) return false;
    const tOK = () => (el.innerText || "").replace(INVIS, "").includes(title.replace(INVIS, "").slice(0, 20));

    /**
     * ⚠️ 2026-09-01 — 순서를 뒤집었습니다. 사장님 신고: "제목이 삭제가 안 됩니다."
     *
     * 예전엔 setEditableText(빠른 길)로 먼저 넣고, 글자가 보이면 거기서 멈췄습니다.
     * 그러면 **화면에는 글자가 있는데 편집기 내부 모델은 비어 있습니다.**
     * 사장님이 제목을 지우려고 전체 선택 후 지워도, 편집기는 자기 모델에 지울 게
     * 없다고 보고 아무 일도 안 합니다. 그래서 제목이 안 지워졌습니다.
     *
     * 진짜 클릭+붙여넣기는 편집기가 **사람 입력으로 받아들여** 모델에 기록합니다.
     * 느리지만 이게 맞는 길입니다. 빠른 길은 이게 안 될 때의 예비로 내렸습니다.
     */
    say("제목을 넣는 중…");
    await settle(120);
    let okT = false;

    await writeClip(title);
    const r0 = el.getBoundingClientRect();
    const { fx, fy } = frameOffset();
    const resp = await new Promise((res) => {
      try {
        chrome.runtime.sendMessage({
          type: "clickPaste",
          x: Math.round(fx + r0.left + Math.min(60, r0.width / 2)),
          y: Math.round(fy + r0.top + r0.height / 2),
        }, res);
      } catch { res(null); }
    });
    if (resp && resp.ok) { await settle(600); okT = tOK(); }

    // 예비 — 진짜 클릭이 막혔을 때만. 이 길로 들어간 제목은 안 지워질 수 있습니다.
    if (!okT) {
      say("제목을 넣는 중(예비 방식)…");
      F.setEditableText(el, title);
      await settle();
      okT = tOK();
    }
    /**
     * ⚠️ 회색 "제목" 잔상 지우기 (2026-08-31 — 두 번째 시도).
     * 사람이 타자를 치면 네이버가 안내 글자를 스스로 걷는데, 코드로 넣으면 그 스위치를
     * 안 건드려서 진짜 제목 뒤에 회색 "제목"이 계속 붙어 보였습니다.
     * editor-tools 쪽에만 넣었다가, 통합 복사가 이 함수를 쓰게 되면서 그 처리를 안 타
     * 증상이 그대로 남았습니다 — 그래서 넣는 자리인 여기로 옮겼습니다.
     */
    /**
     * ⚠️ 2026-09-01 — display:none으로 **영구히** 숨기던 것을 되돌렸습니다.
     * 그렇게 하면 나중에 사장님이 제목을 지워 비웠을 때도 안내가 안 돌아와서,
     * 빈 제목인지 아닌지 화면으로 알 수가 없습니다.
     * 진짜 클릭+붙여넣기로 넣으면 네이버가 안내를 **스스로** 걷습니다.
     * 그래도 잔상이 남는 경우에만, 제목이 비면 다시 보이도록 되돌려 둡니다.
     */
    try {
      const ph = document.querySelectorAll(
        ".se-documentTitle [class*='placeholder'], .se-documentTitle [class*='Placeholder']"
      );
      ph.forEach((n) => { n.style.display = okT ? "none" : ""; });
      if (okT && ph.length) {
        // 제목이 비워지면 안내를 되살립니다. 한 번만 걸어둡니다.
        const host = document.querySelector(".se-documentTitle");
        if (host && !host.dataset.wsPhWatch) {
          host.dataset.wsPhWatch = "1";
          new MutationObserver(() => {
            const empty = !(el.innerText || "").replace(INVIS, "").trim();
            ph.forEach((n) => { n.style.display = empty ? "" : "none"; });
          }).observe(host, { childList: true, subtree: true, characterData: true });
        }
      }
    } catch {}
    return okT;
  }

  async function insert(draft, say = () => {}, { force = false } = {}) {
    const F = window.__wsFormat;
    if (!F) return { ok: false, why: "서식 도구를 못 불러왔습니다. 확장을 다시 설치해 보세요." };

    // ⚠️ force 는 **사장님이 화면에서 직접 "그래도 넣기"를 누르셨을 때만** 옵니다.
    // 제 판정이 틀릴 수 있어서 둔 탈출구입니다. 코드가 스스로 켜면 안 됩니다.
    let state = isEmpty();

    /**
     * 덮어쓰기 — **옛 글을 먼저 지웁니다.**
     *
     * ⚠️ 처음엔 옛 글 위에 그대로 붙이려 했는데, 진짜 편집기는 합성 붙여넣기를
     * 무시합니다(이미 확인한 사실). 그러면 복사→Ctrl+V 안내로 넘어가는데,
     * 옛 글이 그대로 남은 채라 사장님이 직접 지우셔야 했습니다.
     * 지우는 것부터 우리가 합니다 — execCommand("delete")는 진짜 편집기에서
     * 먹히는 방식입니다(제목 넣기가 이걸로 돕니다).
     */
    if (!state.empty && force) {
      const all = bodyParagraphs({ includeGuide: true });
      if (all.length) {
        try {
          all[0].focus();
          const range = document.createRange();
          range.setStartBefore(all[0]);
          range.setEndAfter(all[all.length - 1]);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("delete");
          await settle(300);
        } catch {}
      }
      state = isEmpty();
      // ⚠️ 지웠는데도 남아 있으면 멈춥니다. 반쯤 지워진 위에 붙이면 뒤죽박죽이 됩니다.
      if (!state.empty) {
        return {
          ok: false,
          why: `옛 글을 지우려 했는데 ${state.chars}자가 남았습니다. ` +
               `본문을 전체 선택(Ctrl+A)해서 지우신 뒤 다시 눌러주세요.`,
        };
      }
    }

    if (!state.empty && !force) {
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
      const okT = await applyTitleReal(draft.title, say);
      (okT ? done : failed).push(okT ? "제목" : { what: "제목", why: "편집기가 안 받았습니다 — 제목만 직접 붙여주세요" });
    }

    // ── 2. 본문 통째로 ──
    // ⚠️ 사진 자리는 **글자로** 남겨둡니다. [사진 1: 무엇]
    // 사진을 대신 넣어드릴 수는 없습니다 — 어떤 사진인지는 사장님만 압니다.
    // 대신 그 자리에 무엇을 넣을지 적어두면 사장님이 하나씩 갈아끼우시면 됩니다.
    say("본문을 넣는 중…");

    /**
     * 소제목 구역 규칙 (사장님 지정, 2026-08-28):
     * 소제목 사이가 붙어 보이지 않게, 그리고 **구역마다 사진을 넣으실 거라서** —
     * 모든 소제목 **직전에 [빈 줄 + 사진 자리 + 빈 줄]을 보장**합니다.
     * 원고에 이미 그 자리 사진이 있으면 중복으로 안 넣습니다.
     */
    /**
     * 긴 문단을 넣기 전에 잘라둡니다 (2026-08-31 신설).
     *
     * ⚠️ 왜 필요한가: 줄바꿈 도구는 있었지만 **버튼이라 안 눌렸습니다.**
     * 그래서 실측에서 사장님 글은 문단 중앙 41자, 45자 넘는 문단이 43%였습니다.
     * 벤치마킹(홈판·뷰티·패션 메이트 25곳)은 16~24자에 45자 초과가 0~7%입니다.
     * 모바일 한 줄이 20자라, 41자면 두 줄이 넘어가고 두 줄이 넘으면 벽으로 보입니다.
     * 지침에 적어두는 것만으로는 안 바뀝니다. 넣을 때 코드가 잘라야 바뀝니다.
     *
     * ⚠️ 글자는 하나도 안 바꿉니다. 자를 뿐입니다(breakOne 규칙 — 국어 문법 기준).
     * ⚠️ 서식 표기([강조]…[/강조] 등)가 조각 사이에서 끊기면 **그 문단은 안 자릅니다.**
     *    표기가 반쪽만 남으면 서식이 통째로 깨져서, 자르는 이득보다 손해가 큽니다.
     */
    const B = typeof window !== "undefined" && window.__wsBreak;
    const MARKS = ["강조", "형광", "밑줄", "색", "크게"];
    const marksBalanced = (s) =>
      MARKS.every((m) => (s.split(`[${m}]`).length - 1) === (s.split(`[/${m}]`).length - 1));

    const splitLongText = (b) => {
      if (!B || b.kind !== "text" || !b.text) return [b];
      const pieces = B.breakOne(b.text);
      if (pieces.length <= 1) return [b];
      // 표기가 반쪽만 남는 조각이 하나라도 있으면 자르지 않습니다.
      if (!pieces.every(marksBalanced)) return [b];
      /**
       * ⚠️ 굵게 표시(marks)가 조각 두 개에 걸쳐 있으면 자르지 않습니다.
       * 아래 서식 거는 자리는 `h.includes(m)`으로만 붙이기 때문에, 걸친 표시는
       * 조용히 사라집니다. 사라진 줄도 모르는 게 제일 나쁩니다.
       */
      if ((b.marks || []).some((m) => !pieces.some((p) => p.includes(m)))) return [b];
      // 조각마다 자기 안에 실제로 있는 표시만 들고 갑니다.
      return pieces.map((t) => ({ ...b, text: t, marks: (b.marks || []).filter((m) => t.includes(m)) }));
    };

    const blocksOut = [];
    for (const b of draft.blocks.flatMap(splitLongText)) {
      if (b.kind === "subhead") {
        // 바로 앞(빈 줄 건너뛰고)에 사진 자리가 이미 있는지 봅니다.
        let j = blocksOut.length - 1;
        while (j >= 0 && blocksOut[j].kind === "gap") j--;
        const hasPhoto = j >= 0 && blocksOut[j].kind === "photo";
        if (!hasPhoto && blocksOut.length) {
          if (blocksOut[blocksOut.length - 1].kind !== "gap") blocksOut.push({ kind: "gap" });
          blocksOut.push({ kind: "photo", text: `${b.text.slice(0, 14)} 관련 사진` });
        }
        if (blocksOut.length && blocksOut[blocksOut.length - 1].kind !== "gap") blocksOut.push({ kind: "gap" });
      }
      blocksOut.push(b);
    }

    const bodyText = blocksOut
      .map((b) => {
        if (b.kind === "gap") return "";
        if (b.kind === "photo") return `[사진: ${b.text || "여기에 사진"}]`;
        // 서식 표기는 맨글자판에서는 벗겨냅니다 — 표기가 글자로 발행되면 안 됩니다.
        return richStrip(b.text);
      })
      .join("\n");

    /**
     * ⚠️ 서식은 **클립보드에 실어 보냅니다** (1.27.8).
     * 코드로 나중에 서식을 거는 방식(applyStructure)은 편집기가 자기 커서가
     * 아니라며 전부 무시했습니다 ("9군데 못 넣음" 실측). 그런데 붙여넣기에
     * 실려 온 서식은 받습니다 — 워드에서 굵은 글씨를 복사해 붙이는 그 길입니다.
     * 소제목은 크고 굵게, 굵게 표시는 <b>로 심습니다.
     */
    const escH = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    /**
     * 원고 서식 표기 4종 (2026-08-28 신설 — 사장님 "밑줄·글자색·배경색·크기는 왜 안 따라와?").
     * 원고 표준에 이 표기 자체가 없어서 못 따라온 것이었습니다. 이제 원고에
     * 아래 표기가 있으면 서식째 클립보드에 실려 들어갑니다:
     *   [형광]…[/형광]  노란 배경   [밑줄]…[/밑줄]  밑줄
     *   [색]…[/색]      주홍 글자   [크게]…[/크게]  19px
     * 색은 블로그 미관상 한 벌로 통일 — 바꾸려면 여기 색값만 고치면 됩니다.
     */
    /**
     * 팔레트 로테이션 (사장님 요청: "매 포스팅마다 다르게").
     * 완전 무작위는 한 글 안에서 색이 뒤죽박죽될 위험이 있어서,
     * **어울리는 조합 4벌 중 글 제목에 따라 한 벌**을 고릅니다 —
     * 같은 글은 언제 붙여도 같은 색(안정), 다른 글은 다른 색(사람 냄새).
     */
    const PALETTES = [
      { name: "노랑·주홍", bg: "#FDF3A8", color: "#E8590C", big: 19 },
      { name: "연두·청록", bg: "#E3F7C8", color: "#0B7285", big: 21 },
      { name: "분홍·자주", bg: "#FFE0EB", color: "#C2255C", big: 19 },
      { name: "하늘·파랑", bg: "#DBF0FF", color: "#1864AB", big: 21 },
    ];
    const pi = [...String(draft.title || "무제")].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTES.length;
    const PAL = PALETTES[pi];

    const RICH = [
      { re: /\[형광\]([\s\S]*?)\[\/형광\]/g, open: `<span style="background-color:${PAL.bg};">`, close: "</span>" },
      { re: /\[밑줄\]([\s\S]*?)\[\/밑줄\]/g, open: "<u>", close: "</u>" },
      { re: /\[색\]([\s\S]*?)\[\/색\]/g, open: `<span style="color:${PAL.color};">`, close: "</span>" },
      { re: /\[크게\]([\s\S]*?)\[\/크게\]/g, open: `<span style="font-size:${PAL.big}px;">`, close: "</span>" },
    ];
    const richStrip = (s) => RICH.reduce((t, r) => t.replace(r.re, "$1"), String(s));
    const richHtml = (escaped) => RICH.reduce((t, r) => t.replace(r.re, (m, inner) => r.open + inner + r.close), escaped);

    const bodyHtml = blocksOut.map((b) => {
      if (b.kind === "gap") return "<p><br></p>";
      if (b.kind === "photo") return `<p>[사진: ${escH(b.text || "여기에 사진")}]</p>`;
      if (b.kind === "subhead")
        /**
         * ⚠️ 2026-09-01 실측으로 바꿨습니다.
         * 예전엔 <p><span style="font-size:19px"><b>…</b></span></p> 로 보냈습니다.
         * 그건 **겉보기만 소제목**이고 편집기 안에서는 그냥 본문이라, 나중에 도구줄로
         * 다시 바꿔야 했습니다(그 과정에서 사고도 났습니다).
         * 브라우저에서 드래그 복사해 붙여넣을 때 h2는 진짜 제목으로 살아남고
         * h3는 안 살아남는 것이 확인됐습니다. 그래서 h2로 보냅니다.
         * style은 편집기가 h2를 무시할 때를 대비한 보험입니다.
         */
        return `<h2 style="font-size:19px;font-weight:bold;">${richHtml(escH(b.text))}</h2>`;
      if (b.kind === "quote")
        // 인용 모양을 스타일로도 실어 보냅니다 — 편집기가 blockquote를 제 인용구로
        // 안 바꿔도 시각적으로는 인용구답게 들어가게.
        return `<blockquote style="border-left:4px solid #bbb;margin:12px 0;padding:8px 16px;color:#555;">${richHtml(escH(b.text))}</blockquote>`;
      let h = richHtml(escH(b.text));
      for (const m of b.marks || []) {
        const em = richHtml(escH(m));
        if (h.includes(em)) h = h.split(em).join(`<b>${em}</b>`);
      }
      return `<p>${h}</p>`;
    }).join("");

    const r = await pasteBody(bodyText, { html: bodyHtml });
    if (!r.ok) return { ok: false, why: r.why, copied: r.copied, done, failed };
    done.push(`본문+서식 (${r.how})`);

    /**
     * 서식이 붙여넣기에 실려 들어갔으면 뒷단 서식 걸기는 건너뜁니다 —
     * 어차피 편집기가 무시해서 "못 넣었습니다" 소음만 냈습니다.
     * 인용구·진짜 '소제목' 스타일까지 원하시면 편집기 드롭다운으로 바꾸면 되고,
     * 홈판 셈(글자 수·소제목 수)은 글자 기준이라 지금 상태로도 잡힙니다.
     */
    const markCount = new Set(draft.blocks.flatMap((b) => b.marks || [])).size;
    if (markCount) done.push(`굵게 ${markCount}곳`);
    // 어떤 색 벌을 입었는지 알려드립니다 — "이번 글은 왜 이 색이지?"의 답.
    if (/\[형광\]|\[색\]|\[크게\]/.test(draft.blocks.map((b) => b.text || "").join(""))) {
      done.push(`팔레트 ${PAL.name}`);
    }

    // 공식 '소제목' 스타일 — 진짜 클릭으로 드롭다운까지 눌러줍니다.
    const os = await applyOfficialSubheads(draft, say);
    if (os.done) done.push(`공식 소제목 ${os.done}/${os.total}곳`);
    if (os.failed.length) failed.push(...os.failed.map((t) => ({ what: `소제목 "${t}"`, why: "드롭다운을 못 눌렀습니다 — 문단 클릭 후 왼쪽 위에서 직접 바꿔주세요" })));
    /**
     * ⚠️ 크기 실패는 **조용히 넘어가면 안 됩니다.**
     * 소제목 서식은 걸렸는데 크기가 30 으로 남아 있으면 겉보기엔 소제목이라
     * 다 된 것처럼 보입니다. 그러면 사장님이 또 손으로 38 을 누르시게 됩니다.
     */
    if (os.크기실패 && os.크기실패.length) {
      failed.push(...os.크기실패.map((t) => ({
        what: `소제목 크기 "${t}"`,
        why: "소제목은 됐는데 크기가 30 그대로입니다 — 그 줄만 38 로 바꿔주세요",
      })));
    }

    return { ok: true, done, failed, photoSlots: draft.blocks.filter((b) => b.kind === "photo").length };
  }

  /**
   * 본문 **끝에** 몇 줄을 덧붙입니다. ("함께 보면 좋은 글" 링크 묶음)
   *
   * ⚠️ pasteBody와 다릅니다. 저건 첫 문단을 **갈아끼우고**, 이건 맨 끝에 **더합니다.**
   * 쓰시던 글은 한 글자도 안 건드립니다.
   *
   * ⚠️ 문단을 하나씩 만들지 않습니다. 그러다 26초 넘게 멈추고 같은 칸에
   * 겹쳐 쓴 적이 있습니다. 붙여넣기 한 번이면 편집기가 알아서 나눕니다.
   *
   * ⚠️ 주소를 한 줄에 하나씩 둡니다. 그래야 네이버가 링크 카드로 바꿔줍니다.
   * 글자 사이에 끼워 넣으면 그냥 파란 글씨로 남습니다.
   */
  async function appendBlock(text) {
    const root = editorRoot();
    if (!root) return { ok: false, why: "본문을 찾지 못했습니다." };

    const paras = bodyParagraphs({ includeGuide: true });
    const last = paras[paras.length - 1];
    if (!last) return { ok: false, why: "본문 문단을 찾지 못했습니다." };

    const mark = norm(text).slice(0, 24);
    const had = norm(root.innerText || "");
    if (had.includes(mark)) return { ok: false, why: "이미 넣으신 것 같습니다. 본문 끝을 확인해 주세요." };

    // 맨 끝으로 커서를 옮깁니다. 고르는 게 아니라 **끝에 세우는** 것이라
    // 기존 글자가 지워질 일이 없습니다. (예비 복사가 커서를 훔쳐가서 여러 번 부릅니다)
    const caretToEnd = () => {
      last.focus();
      const range = document.createRange();
      range.selectNodeContents(last);
      range.collapse(false);          // false = 끝으로
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };

    try {
      caretToEnd();
      const dt = new DataTransfer();
      dt.setData("text/plain", "\n" + text);
      last.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      await settle(600);
      if (norm(root.innerText || "").includes(mark)) return { ok: true, how: "paste" };
    } catch {}

    // 흉내가 안 먹히면 진짜 붙여넣기로 갑니다 (pasteBody와 같은 사다리).
    // 클립보드는 두 겹(writeClip) — iframe에서 요즘 방식이 막히는 걸 실제로 겪었습니다.
    const clipOk = await writeClip("\n" + text);
    if (clipOk) {
      // 0차 — 확장 전용 직통 (관리형 크롬에서 디버거가 막혀도 됩니다)
      try {
        caretToEnd();   // 예비 복사가 커서를 가져갔을 수 있어 반드시 다시 세웁니다.
        document.execCommand("paste");
        await settle(600);
        if (norm(root.innerText || "").includes(mark)) return { ok: true, how: "직통" };
      } catch {}
      // 1차 — 브라우저가 누르는 키
      try {
        caretToEnd();
        const resp = await askBg({ type: "pressPaste" });
        if (resp && resp.ok) {
          await settle(700);
          if (norm(root.innerText || "").includes(mark)) return { ok: true, how: "키보드" };
        }
      } catch {}
      // 안내용 클립보드는 줄바꿈 없이 다시 담아둡니다 — 손으로 붙일 때 깔끔하게.
      await writeClip(text);
    }

    // ⚠️ 그래도 안 되면 되는 척하지 않습니다. 복사해 드리고 그렇게 말합니다.
    return {
      ok: false,
      copied: clipOk,
      why: clipOk
        ? "자동으로 못 붙였습니다. 복사해 뒀으니 본문 맨 끝을 누르고 Ctrl+V 해주세요."
        : "클립보드가 막혔습니다. 창을 이 화면에 둔 채로 다시 눌러주세요.",
    };
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
      // ⚠️ **우리 버튼을 우리가 누르면 안 됩니다.**
      // 마무리 패널에도 "임시저장"이라고 쓰인 버튼이 있습니다. 글자로 찾다 보니
      // 그걸 먼저 집어서, 자기가 자기를 누르고 ok:true 를 돌려줬습니다.
      // 네이버 저장은 한 번도 안 눌렸는데 "저장했습니다"라고 말했습니다.
      // 흉내 편집기 시험에서 잡았습니다.
      // 우리 도구 화면은 건너뜁니다 — 우리 버튼을 네이버 버튼으로 착각하면 엉뚱한 걸 누릅니다.
      if (el.closest("#ws-tools-panel, #ws-tools-dock, #ws-tools-counts, #ws-title-bar")) continue;
      const t = (el.innerText || el.textContent || "").trim();
      if (!/^저장$|^임시저장$|저장\s*\d*$/.test(t)) continue;
      if (bad.test(t)) continue;
      /**
       * ⚠️ 2026-09-01: 예전엔 offsetParent === null 로 걸렀습니다. 그게 함정입니다 —
       * 네이버 저장 버튼은 상단에 **고정(position:fixed)**돼 있어서, 화면에 멀쩡히
       * 보여도 offsetParent가 null입니다. 그래서 "저장 버튼을 못 찾았습니다"가 났습니다.
       * 자동 서식에서 똑같은 원인을 잡았고, 여기도 같은 자리였습니다.
       */
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (r.width < 200 && r.height < 60) { btn = el; break; }
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

  window.__wsInsert = { insert, applyStructure, applyOfficialSubheads, applyTitleReal, saveDraft, isEmpty, pasteBody, appendBlock, bodyParagraphs };
})();
