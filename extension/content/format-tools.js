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
  function findStyleDropdown() {
    const wanted = ["본문", "소제목", "인용구"];
    // 도구줄 안에서 저 셋 중 하나를 글자로 가진 작은 버튼을 찾습니다.
    for (const el of document.querySelectorAll("button, [role='button'], .se-toolbar-option-text-button, a")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (wanted.includes(t) && el.offsetParent !== null) {
        // 너무 큰 요소면 드롭다운이 아니라 감싸는 상자입니다.
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width < 220 && r.height < 60) return el;
      }
    }
    return null;
  }

  /** 드롭다운이 열린 뒤, 원하는 항목을 찾습니다. */
  function findStyleOption(label) {
    for (const el of document.querySelectorAll("button, [role='option'], [role='menuitem'], li, a, span")) {
      const t = (el.innerText || el.textContent || "").trim();
      if (t !== label) continue;
      if (el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.width < 220 && r.height < 60) return el;
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

    if (!putCaret(paragraph)) return false;
    await settle(120);

    const trigger = findStyleDropdown();
    if (!trigger) return false;

    realClick(trigger);
    await settle(180);

    const option = findStyleOption(label);
    if (!option) {
      // 드롭다운을 열어놨으면 닫아줍니다. 열린 채로 두면 사장님 화면이 어수선합니다.
      realClick(trigger);
      return false;
    }
    realClick(option);
    await settle();

    // ⚠️ 정말 바뀌었는지는 **다시 읽어봐야** 압니다.
    // 문단이 다른 요소로 교체될 수도 있어서, 화면에서 다시 찾습니다.
    const after = paragraph.isConnected
      ? paragraph.className + "|" + ((paragraph.closest(".se-component") || {}).className || "")
      : "(교체됨)";
    return after !== before;
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

  // 다른 파일에서 쓸 수 있게 내놓습니다.
  window.__wsFormat = { setParagraphStyle, applyMark, selectPhrase, findStyleDropdown, settle, norm };
})();
