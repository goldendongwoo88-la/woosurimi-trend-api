// 편집기 서식 다루기 — 소제목·인용구·강조를 실제로 넣습니다.
//
// ⚠️ 이 파일이 왜 따로 있나
// editor-tools.js가 이미 1,400줄입니다. 그리고 여기 있는 일은 성격이 다릅니다 —
// **사장님 글에 직접 손을 대는 일**입니다. 잘못하면 글이 망가집니다.
// 그래서 따로 떼어놓고, 여기만 특히 조심스럽게 다룹니다.
//
// ⚠️ 배운 것 (제목을 세 번 날려먹고 알아낸 것)
//   1) el.textContent = ... 로 글을 바꾸면 안 됩니다. 편집기가 쓰는 span이 날아가고,
//      그러면 편집기가 구조가 깨졌다고 보고 그 문단을 통째로 비웁니다.
//   2) 넣자마자 확인하면 안 됩니다. 편집기가 되돌리는 건 다음 순간입니다.
//      300ms 기다렸다가 봐야 진짜 결과가 보입니다.
//   3) 실패하면 원래대로 돌려놔야 합니다. 되는 척하다 글을 날리는 것보다
//      안 된다고 말하는 게 낫습니다.
//
// ⚠️ 소제목·인용구는 **글자 크기가 아닙니다**
// 편집기 왼쪽 위 드롭다운(본문 / 소제목 / 인용구)에서 고르는 **문단 스타일**입니다.
// 글자 크기만 38로 키우면 겉보기만 비슷하고 실제로는 본문입니다.
// 그래서 우리도 그 드롭다운을 **실제로 눌러서** 바꿉니다. 사람이 하는 것과 같게.

(() => {
  "use strict";

  const INVIS = /[\s​-‍﻿]/g;
  const norm = (s) => String(s || "").replace(INVIS, "");
  const settle = (ms = 320) => new Promise((r) => setTimeout(r, ms));

  /** 사람이 누른 것처럼 — 편집기가 진짜 클릭으로 알아듣게 합니다. */
  function realClick(el) {
    if (!el) return false;
    for (const type of ["pointerdown", "mousedown", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }

  /**
   * 문단 스타일 드롭다운을 찾습니다.
   *
   * ⚠️ 클래스 이름으로 찾지 않습니다. 네이버가 자주 바꿉니다.
   * **보이는 글자**로 찾습니다 — "본문", "소제목", "인용구"는 안 바뀝니다.
   */
  /**
   * 눈에 보이는가.
   *
   * ⚠️ 예전엔 offsetParent !== null 로 봤습니다. 이게 함정이었습니다 —
   * 조상 중에 position:fixed 가 있으면 **화면에 멀쩡히 보여도 offsetParent가 null**입니다.
   * 네이버 도구줄은 스크롤을 따라다니느라 fixed로 붙어 있어서, 도구줄 단추가
   * 통째로 "안 보이는 것"으로 걸러졌을 수 있습니다. 이제 실제 크기·스타일로 봅니다.
   */
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function findStyleDropdown() {
    const wanted = ["본문", "소제목", "인용구"];
    // 도구줄 안에서 저 셋 중 하나를 글자로 가진 작은 버튼을 찾습니다.
    for (const el of document.querySelectorAll("button, [role='button'], .se-toolbar-option-text-button, a, span")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (wanted.includes(t) && isVisible(el)) {
        // 너무 큰 요소면 드롭다운이 아니라 감싸는 상자입니다.
        const r = el.getBoundingClientRect();
        if (r.width < 260 && r.height < 70) return el;
      }
    }
    return null;
  }

  /** 드롭다운이 열린 뒤, 원하는 항목을 찾습니다. */
  function findStyleOption(label) {
    for (const el of document.querySelectorAll("button, [role='option'], [role='menuitem'], li, a, span")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t !== label) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 260 && r.height < 70) return el;
    }
    return null;
  }

  /** 문단 안에 커서를 놓습니다. 스타일 바꾸기는 커서가 있어야 먹습니다. */
  function putCaret(paragraph) {
    try {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      paragraph.focus && paragraph.focus();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 문단 하나의 스타일을 바꿉니다.
   * @param {Element} paragraph .se-text-paragraph
   * @param {"소제목"|"인용구"|"본문"} label
   * @returns {Promise<boolean>} 정말 바뀌었는지
   */
  async function setParagraphStyle(paragraph, label) {
    const before = paragraph.className + "|" + (paragraph.closest(".se-component") || {}).className;

    /**
     * ⚠️ 2026-08-31: 실패가 전부 "편집기가 안 바꿔줬습니다" 한 문장으로만 나와서
     * 어느 단계에서 막혔는지 알 수가 없었습니다(16군데 전부 실패인데 원인 불명).
     * 이제 단계별로 이유를 남깁니다. 고칠 자리를 찾는 데 이게 없으면 계속 짐작만 하게 됩니다.
     */
    if (!putCaret(paragraph)) return fail("커서를 그 문단에 못 놓았습니다");
    await settle(120);

    const trigger = findStyleDropdown();
    if (!trigger) return fail("도구줄에서 문단 스타일 단추(본문/소제목/인용구)를 못 찾았습니다");

    realClick(trigger);
    await settle(180);

    const option = findStyleOption(label);
    if (!option) {
      // 드롭다운을 열어놨으면 닫아줍니다. 열린 채로 두면 사장님 화면이 어수선합니다.
      realClick(trigger);
      return fail(`드롭다운은 열었는데 "${label}" 항목이 안 보입니다`);
    }
    realClick(option);
    await settle();

    // ⚠️ 정말 바뀌었는지는 **다시 읽어봐야** 압니다.
    // 문단이 다른 요소로 교체될 수도 있어서, 화면에서 다시 찾습니다.
    const after = paragraph.isConnected
      ? paragraph.className + "|" + ((paragraph.closest(".se-component") || {}).className || "")
      : "(교체됨)";
    if (after === before) return fail("항목까지 눌렀는데 문단이 그대로입니다 (편집기가 무시)");
    lastWhy = "";
    return true;
  }

  /**
   * 글자 범위를 찾아 선택합니다.
   *
   * ⚠️ 문단 하나가 여러 텍스트 조각으로 나뉘어 있을 수 있습니다.
   * ("째피 " + "핑크라인" 처럼 서식 때문에 쪼개집니다)
   * 그래서 조각을 이어붙인 글에서 자리를 찾고, 그 자리를 다시 조각 좌표로 바꿉니다.
   */
  function selectPhrase(root, phrase) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let joined = "";
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: joined.length });
      joined += node.nodeValue;
    }
    const at = joined.indexOf(phrase);
    if (at < 0) return null;
    const end = at + phrase.length;

    const spot = (offset) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (offset >= nodes[i].start) return { node: nodes[i].node, offset: offset - nodes[i].start };
      }
      return null;
    };
    const s = spot(at);
    const e = spot(end);
    if (!s || !e) return null;

    try {
      const range = document.createRange();
      range.setStart(s.node, Math.min(s.offset, s.node.length));
      range.setEnd(e.node, Math.min(e.offset, e.node.length));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * 고른 글자에 서식을 넣습니다.
   *
   * ⚠️ execCommand는 오래된 방식이지만 **편집기가 알아듣는 유일한 길**입니다.
   * 직접 태그를 감싸면 편집기가 모르는 구조가 되어 발행할 때 날아갑니다.
   * 여기서는 글을 **바꾸는 게 아니라 감싸는** 것이라, 제목 때 겪었던
   * "span이 사라지는" 문제는 안 생깁니다.
   */
  const COMMANDS = {
    bold: {
      // ⚠️ bold와 underline은 **토글**입니다. 이미 굵은 글자에 또 걸면 **풀립니다.**
      // 실제로 이것 때문에 "반환값은 true인데 굵게가 안 들어간" 일이 있었습니다.
      // 그래서 먼저 지금 상태를 보고, 이미 되어 있으면 건드리지 않습니다.
      toggle: true,
      state: () => document.queryCommandState("bold"),
      run: () => document.execCommand("bold"),
      landed: (el) => /<b[\s>]|<strong[\s>]|font-weight:\s*(bold|[6-9]00)/i.test(el.innerHTML),
    },
    underline: {
      toggle: true,
      state: () => document.queryCommandState("underline"),
      run: () => document.execCommand("underline"),
      landed: (el) => /<u[\s>]|text-decoration[^;"]*underline/i.test(el.innerHTML),
    },
    color: {
      toggle: false,
      run: () => document.execCommand("foreColor", false, "#c0392b"),
      landed: (el) => /<font[^>]*color|(?<!background-)color:\s*(?!inherit)/i.test(el.innerHTML),
    },
    highlight: {
      toggle: false,
      // hiliteColor가 안 먹는 브라우저가 있어서 backColor로 한 번 더 시도합니다.
      run: () => document.execCommand("hiliteColor", false, "#fff3a3") ||
                 document.execCommand("backColor", false, "#fff3a3"),
      landed: (el) => /background-color|bgcolor/i.test(el.innerHTML),
    },
  };

  /**
   * 고른 글자에 서식을 넣습니다.
   *
   * ⚠️ **반환값을 믿으면 안 됩니다.** execCommand는 아무 일도 안 하고도
   * true를 돌려줍니다. 예전에 dispatchEvent에서 똑같이 당했습니다.
   * 넣은 뒤에 **HTML을 다시 읽어서** 정말 들어갔는지 봅니다.
   */
  async function applyMark(root, phrase, kind) {
    const cmd = COMMANDS[kind] || COMMANDS.bold;
    const beforeHtml = root.innerHTML;
    const beforeText = norm(root.innerText || "");

    const range = selectPhrase(root, phrase);
    if (!range) return { ok: false, why: "본문에서 그 글자를 못 찾았습니다" };

    // 이미 그 서식이 걸려 있으면 건드리지 않습니다. 걸면 풀립니다.
    if (cmd.toggle && cmd.state && cmd.state()) {
      window.getSelection().removeAllRanges();
      return { ok: true, already: true, why: "" };
    }

    try { cmd.run(); } catch {}
    await settle(140);
    window.getSelection().removeAllRanges();

    // 1) 글자가 사라지지 않았는가 — 제일 중요합니다.
    if (norm(root.innerText || "") !== beforeText) {
      root.innerHTML = beforeHtml;
      return { ok: false, why: "서식을 넣다가 글자가 달라져서 되돌렸습니다" };
    }
    // 2) 서식이 정말 들어갔는가 — 반환값 말고 HTML로 봅니다.
    if (root.innerHTML === beforeHtml) {
      return { ok: false, why: "편집기가 이 서식을 안 받았습니다 (화면이 그대로입니다)" };
    }
    if (cmd.landed && !cmd.landed(root)) {
      return { ok: false, why: "서식이 들어간 흔적이 없습니다" };
    }
    return { ok: true, why: "" };
  }

  /**
   * 편집기 칸의 글자를 바꿉니다. **span을 살려두면서.**
   *
   * ⚠️ 이걸 알아내는 데 세 번 실패했습니다. 브라우저에서 직접 재보고 알았습니다.
   *
   * 스마트에디터의 칸은 이렇게 생겼습니다:
   *   <p class="se-text-paragraph"><span class="se-ff-... se-fs32">글자</span></p>
   * 에디터는 저 span을 기준으로 문서를 관리합니다. span이 없어지면 구조가 깨졌다고
   * 보고 자기 모델로 되돌리는데, 그 과정에서 **글이 빈칸이 됩니다.**
   *
   * 실제로 재본 것:
   *   el.textContent = 새글                        → span 사라짐 ✗
   *   문단 전체 선택 + execCommand("insertText")    → span 사라짐 ✗   ← 이것도 안 됩니다
   *   span 안쪽만 선택 + execCommand("insertText")  → span 사라짐 ✗   ← 이것도요
   *
   * 왜냐면 브라우저는 **span이 빈 순간 그 span을 치워버립니다.**
   * 글자를 전부 선택해서 바꾸면 반드시 한 번은 비게 됩니다.
   *
   * 그래서 **한 번도 안 비게** 합니다:
   *   1) 끝에 커서를 두고 새 글자를 **붙입니다**  → "원래글새글" (span 유지)
   *   2) 앞쪽 원래 글자만 골라서 지웁니다          → "새글"     (span 유지)
   * 둘 다 execCommand라 에디터가 자기 명령으로 인식하고 모델도 같이 갱신합니다.
   *
   * 이게 막히면 텍스트 노드의 값만 직접 바꿉니다 — 구조는 안 건드리는 방식입니다.
   */
  function setEditableText(el, want) {
    const value = String(want);
    try {
      // 글자를 담고 있는 그릇 — 보통 span, 없으면 칸 자체.
      const host = el.querySelector("span") || el;
      const before = host.textContent || "";
      const sel = window.getSelection();

      if (before.length) {
        // 1) 끝에 붙이기
        el.focus();
        const r1 = document.createRange();
        r1.selectNodeContents(host);
        r1.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r1);
        if (!document.execCommand("insertText", false, value)) throw new Error("insert 실패");

        // 2) 앞쪽 옛 글자만 지우기
        // ⚠️ 붙이면서 텍스트 노드가 쪼개질 수 있습니다. 글자 수로 자리를 찾습니다.
        const spot = charOffset(host, before.length);
        if (!spot) throw new Error("지울 자리를 못 찾음");
        const r2 = document.createRange();
        r2.setStart(host.firstChild && host.firstChild.nodeType === 3 ? host.firstChild : spot.node, 0);
        r2.setEnd(spot.node, spot.offset);
        sel.removeAllRanges();
        sel.addRange(r2);
        document.execCommand("delete");
      } else {
        el.focus();
        const r = document.createRange();
        r.selectNodeContents(host);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand("insertText", false, value);
      }

      if ((el.innerText || "").replace(/​/g, "").trim() === value.trim()) return true;
    } catch {}

    // 물러서기 — 텍스트 노드 값만 바꿉니다. 구조를 안 건드리니 span이 삽니다.
    try {
      const host = el.querySelector("span") || el;
      const tn = [...host.childNodes].find((n) => n.nodeType === 3);
      if (tn) {
        tn.nodeValue = value;
      } else {
        host.appendChild(document.createTextNode(value));
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      return (el.innerText || "").replace(/​/g, "").trim() === value.trim();
    } catch {
      return false;
    }
  }

  /** 그릇 안에서 n번째 글자가 어느 텍스트 노드의 몇 번째인지 찾습니다. */
  function charOffset(host, n) {
    let left = n;
    const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node;
    let last = null;
    while ((node = walk.nextNode())) {
      last = node;
      if (left <= node.length) return { node, offset: left };
      left -= node.length;
    }
    return last ? { node: last, offset: last.length } : null;
  }

  // 다른 파일에서 쓸 수 있게 내놓습니다.
  window.__wsFormat = { setParagraphStyle, applyMark, selectPhrase, findStyleDropdown, settle, norm, setEditableText, charOffset };
})();
