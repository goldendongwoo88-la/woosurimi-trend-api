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
      await writeClip(text);
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
        const resp = await new Promise((res) => {
          try { chrome.runtime.sendMessage({ type: "clickPaste", x, y }, res); } catch { res(null); }
        });
        if (resp && resp.ok) {
          await settle(900);
          if (check()) return { ok: true, how: "클릭+붙여넣기" };
          diags.push("진짜 클릭까지 했는데 안 받음");
        } else diags.push(`클릭경로: ${(resp && resp.message) || "응답 없음"}`);
      } catch (e) { diags.push(`클릭경로: ${e.message}`); }
    }

    // 타자 경로 — 클릭 경로가 막힌 환경용 예비. 맨글자라 서식은 못 싣습니다.
    try {
      placeCaret();
      document.execCommand("insertText", false, text);
      await settle(400);
      if (check()) {
        if (bodyParagraphs({ includeGuide: true }).length >= paraGoal) return { ok: true, how: "입력(서식 없음)" };
        diags.push("입력은 됐는데 문단이 안 나뉨");
        document.execCommand("undo");
        await settle(250);
      } else diags.push("입력 명령 무시됨");
    } catch (e) { diags.push(`입력: ${e.message}`); }

    let diag = "";
    if (clipOk) {
      /**
       * 0차 — **확장 전용 직통 붙여넣기.**
       * clipboardRead 권한이 있는 확장은 execCommand("paste")를 쓸 수 있습니다.
       * 일반 웹은 못 쓰는, 확장에게만 열린 문이라 디버거도 안 거칩니다.
       * "조직에서 관리하는 브라우저"는 디버거를 정책으로 막을 수 있어서
       * (사장님 크롬이 그렇습니다) 이 직통이 첫 번째 길이어야 합니다.
       */
      try {
        placeCaret();
        document.execCommand("paste");
        await settle(600);
        if (check()) return { ok: true, how: "직통" };
        diag = "직통 붙여넣기를 편집기가 안 받음";
      } catch (e) { diag = `직통: ${e.message}`; }

      // 1차: 그냥 키 → 안 먹으면 2차: "붙여넣기 명령" 명시(commands).
      // 처음부터 둘 다 쓰면 두 번 붙을 수 있어서 순서대로 한 번씩만.
      for (const commands of [false, true]) {
        try {
          // ⚠️ 예비 복사(execCommand)가 선택을 훔쳐갔을 수 있으므로,
          // 키를 보내기 **직전에 반드시** 붙일 자리를 다시 세웁니다.
          placeCaret();
          const resp = await new Promise((res) => {
            try { chrome.runtime.sendMessage({ type: "pressPaste", commands }, res); } catch { res(null); }
          });
          if (resp && resp.ok) {
            await settle(700);
            if (check()) return { ok: true, how: commands ? "키보드(명령)" : "키보드" };
            diag = commands ? "키는 들어갔는데 편집기가 안 받음" : diag;
          } else {
            diag = (resp && resp.message) || "배경 작업자 응답 없음";
            break;   // 통로 자체가 죽었으면 2차도 소용없습니다.
          }
        } catch (e) { diag = e.message; break; }
      }
    }

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
    const resp = await new Promise((res) => {
      try { chrome.runtime.sendMessage({ type: "uiClick", x, y }, res); } catch { res(null); }
    });
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
      if (el.closest("#ws-tools-panel, #ws-tools-dock")) continue;
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
    for (const b of subs) {
      say(`소제목 스타일: ${b.text.slice(0, 14)}…`);
      const p = bodyParagraphs({ includeGuide: true })
        .find((n) => norm(n.innerText || "").includes(norm(b.text)));
      if (!p) { failed.push(b.text.slice(0, 14)); continue; }

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
      done++;
    }
    return { done, total: subs.length, failed };
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
      say("제목을 넣는 중…");
      const el = document.querySelector(".se-documentTitle .se-text-paragraph") ||
                 document.querySelector(".se-documentTitle [contenteditable='true']");
      if (el && F.setEditableText) {
        await settle(120);
        F.setEditableText(el, draft.title);
        await settle();
        // ⚠️ 같음(===)이 아니라 **포함**으로 봅니다. 제목 칸에는 "제목"이라는
        // 안내 유령 글자가 붙어 있어서, 실제로 들어갔는데도 계속
        // "안 받았습니다"라고 거짓 실패를 냈습니다 (실측).
        const now = (el.innerText || "").replace(INVIS, "");
        const okT = now.includes(draft.title.replace(INVIS, "").slice(0, 20));
        (okT ? done : failed).push(okT ? "제목" : { what: "제목", why: "편집기가 안 받았습니다" });
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
    const RICH = [
      { re: /\[형광\]([\s\S]*?)\[\/형광\]/g, open: '<span style="background-color:#FDF3A8;">', close: "</span>" },
      { re: /\[밑줄\]([\s\S]*?)\[\/밑줄\]/g, open: "<u>", close: "</u>" },
      { re: /\[색\]([\s\S]*?)\[\/색\]/g, open: '<span style="color:#E8590C;">', close: "</span>" },
      { re: /\[크게\]([\s\S]*?)\[\/크게\]/g, open: '<span style="font-size:19px;">', close: "</span>" },
    ];
    const richStrip = (s) => RICH.reduce((t, r) => t.replace(r.re, "$1"), String(s));
    const richHtml = (escaped) => RICH.reduce((t, r) => t.replace(r.re, (m, inner) => r.open + inner + r.close), escaped);

    const bodyHtml = draft.blocks.map((b) => {
      if (b.kind === "gap") return "<p><br></p>";
      if (b.kind === "photo") return `<p>[사진: ${escH(b.text || "여기에 사진")}]</p>`;
      if (b.kind === "subhead")
        return `<p><span style="font-size:19px;"><b>${richHtml(escH(b.text))}</b></span></p>`;
      if (b.kind === "quote")
        return `<blockquote>${richHtml(escH(b.text))}</blockquote>`;
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

    // 공식 '소제목' 스타일 — 진짜 클릭으로 드롭다운까지 눌러줍니다.
    const os = await applyOfficialSubheads(draft, say);
    if (os.done) done.push(`공식 소제목 ${os.done}/${os.total}곳`);
    if (os.failed.length) failed.push(...os.failed.map((t) => ({ what: `소제목 "${t}"`, why: "드롭다운을 못 눌렀습니다 — 문단 클릭 후 왼쪽 위에서 직접 바꿔주세요" })));

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
        const resp = await new Promise((res) => {
          try { chrome.runtime.sendMessage({ type: "pressPaste" }, res); } catch { res(null); }
        });
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
      if (el.closest("#ws-tools-panel, #ws-tools-dock")) continue;
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

  window.__wsInsert = { insert, applyStructure, saveDraft, isEmpty, pasteBody, appendBlock, bodyParagraphs };
})();
