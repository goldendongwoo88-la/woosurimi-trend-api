// 클로드가 써준 원고를 편집기에 넣을 수 있는 형태로 뜯어냅니다.
//
// ⚠️ 왜 필요한가
// 사장님은 Claude Pro Max 구독을 쓰십니다. claude.ai나 Claude Code에서 원고를 쓰면
// **API 값이 0원**입니다. 우수리미 사이트에서 뽑으면 한 편에 740원씩 나갑니다.
// 그런데 클로드에서 쓰면 편집기로 옮기는 게 손일입니다 — 복사, 붙여넣기,
// 소제목 하나하나 드롭다운, 사진 자리 찾기, 강조...
// 그 손일을 없애면 **공짜로 쓰면서 손도 안 갑니다.**
//
// ⚠️ 이 파일은 AI를 안 부릅니다. 전부 규칙으로 뜯어냅니다. 값이 안 나갑니다.
//
// ⚠️ 클로드 원고의 생김새 (제가 쓰는 형식입니다)
//   # 제목                      ← 맨 위 한 줄
//   ■ 소제목                    ← ■ [소제목] ## ▶ ◆ ●
//   [사진 1: 무엇]              ← 사진 자리
//   > 인용구                    ← 인용으로 쓸 문장
//   **굵게**                    ← 강조
//   본문 문단들
//
// 단계별 출력(제목 45개 등)이 섞여 있으면 **본문 부분만** 골라냅니다.

(() => {
  "use strict";

  const INVIS = /[\s​-‍⁠﻿]/g;
  const vis = (s) => String(s || "").replace(INVIS, "").length;

  /** 소제목 표시 — src/emphasis.js와 같은 목록입니다. */
  const SUBHEAD = [
    /^\s*■\s*/,
    /^\s*\[소제목\]\s*/,
    /^\s*#{2,3}\s+/,
    /^\s*▶\s*/,
    /^\s*◆\s*/,
    /^\s*●\s*/,
  ];

  const PHOTO = /^\s*\[사진\s*\d*\s*[:：]?\s*([^\]]*)\]\s*$/;
  const QUOTE = /^\s*>\s+(.+)$/;
  const H1 = /^\s*#\s+(.+)$/;

  /**
   * 단계별 출력에서 **본문만** 골라냅니다.
   *
   * ⚠️ 클로드 스킬은 7단계를 밟습니다. 제목 45개, 소제목 목록, 본문, 팩트체크,
   * 이미지 프롬프트... 그중 편집기에 넣을 건 **본문 하나**입니다.
   * 다 넣으면 제목 45개가 글에 들어갑니다.
   */
  function pickBody(raw) {
    const text = String(raw || "");
    const lines = text.split("\n");

    // "4단계", "본문", "본문 출력" 같은 표시가 있으면 그 뒤부터 봅니다.
    //
    // ⚠️ \b(낱말 경계)를 쓰면 안 됩니다. 자바스크립트의 \b는 영문자·숫자 기준이라
    // **한글 뒤에서는 안 먹습니다.** "4단계:"에서 '계'와 ':' 사이에는 경계가 없어서
    // /4단계\b/ 가 아예 안 맞습니다. 실제로 이것 때문에 본문을 못 잘라냈고,
    // 1단계 제목 45개가 통째로 원고에 들어갔습니다.
    const startRe = /^\s*#{0,4}\s*(4단계|본문 작성|본문 출력|본문)\s*[:：\-—]?/;
    const stopRe = /^\s*#{0,4}\s*(5단계|6단계|7단계|팩트체크|이미지 프롬프트|썸네일|인포그래픽)\s*[:：\-—]?/;

    let from = -1, to = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (from < 0 && startRe.test(lines[i])) { from = i + 1; continue; }
      if (from >= 0 && stopRe.test(lines[i])) { to = i; break; }
    }
    if (from >= 0) return lines.slice(from, to).join("\n");

    // 단계 표시가 없으면 통째로 씁니다. 다만 제목 목록처럼 보이면 걷어냅니다.
    return text;
  }

  /**
   * 제목 목록으로 보이는 덩어리를 걷어냅니다.
   *
   * ⚠️ 제목 45개가 "1. …" "2. …" 로 죽 나열됩니다. 그게 본문에 들어가면 안 됩니다.
   * 번호가 붙은 짧은 줄이 5개 넘게 이어지면 목록으로 봅니다.
   */
  function dropTitleList(lines) {
    const out = [];
    let run = [];
    const isNumbered = (l) => /^\s*\d+[.)]\s+\S/.test(l) && vis(l) < 60;
    for (const l of lines) {
      if (isNumbered(l)) { run.push(l); continue; }
      if (run.length >= 5) run = [];          // 목록이었다 — 버립니다
      else out.push(...run), (run = []);      // 몇 개뿐이면 본문입니다
      out.push(l);
    }
    if (run.length < 5) out.push(...run);
    return out;
  }

  /**
   * 원고를 덩어리로 뜯습니다.
   * @returns {{title, blocks: Array<{kind, text, marks?}>}}
   */
  function parse(raw) {
    const body = pickBody(raw);
    let lines = body.split("\n");
    lines = dropTitleList(lines);

    let title = "";
    const blocks = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r/g, "");
      const t = line.trim();

      if (!t) {
        // 빈 줄은 문단 구분입니다. 이어진 빈 줄은 하나로 봅니다.
        if (blocks.length && blocks[blocks.length - 1].kind !== "gap") blocks.push({ kind: "gap" });
        continue;
      }

      // 제목 — 맨 처음 나오는 # 한 줄
      const h1 = t.match(H1);
      if (h1 && !title) { title = clean(h1[1]); continue; }

      // 사진 자리
      const ph = t.match(PHOTO);
      if (ph) { blocks.push({ kind: "photo", text: clean(ph[1] || "") }); continue; }

      // 인용구
      const q = t.match(QUOTE);
      if (q) { blocks.push({ kind: "quote", text: clean(q[1]) }); continue; }

      // 소제목
      let sub = null;
      for (const re of SUBHEAD) {
        if (re.test(t)) {
          const c = clean(t.replace(re, ""));
          if (c.length >= 3 && c.length <= 45) { sub = c; break; }
        }
      }
      if (sub) { blocks.push({ kind: "subhead", text: sub }); continue; }

      // 그 밖에는 본문. **굵게** 표시를 뽑아둡니다.
      const marks = [];
      for (const m of t.matchAll(/\*\*(.+?)\*\*/g)) marks.push(m[1]);
      blocks.push({ kind: "text", text: clean(t), marks });
    }

    // 앞뒤 빈 줄 정리
    while (blocks.length && blocks[0].kind === "gap") blocks.shift();
    while (blocks.length && blocks[blocks.length - 1].kind === "gap") blocks.pop();

    /**
     * 제목 표시가 없을 때 — 첫 줄이 **제목처럼 생겼을 때만** 제목으로 씁니다.
     *
     * ⚠️ 예전에는 "글 문단 중 8~60자짜리 아무거나" 집어서 제목으로 썼습니다.
     * 그러다 이런 일이 났습니다 (흉내 편집기 시험에서 잡았습니다):
     *
     *   원고: "택배 상자를 열자마자 색이 눈에 들어왔습니다." 로 시작
     *   결과: 그 문장이 **제목 칸에 들어가고 본문에서는 사라졌습니다.**
     *         사장님이 이미 써두신 제목도 덮어썼습니다.
     *
     * 두 가지가 겹쳐 나쁩니다 — 글 한 줄이 없어지고, 제목이 바뀝니다.
     * 둘 다 사장님이 눈치채기 어렵습니다.
     *
     * 그래서 조건을 좁힙니다:
     *   1) **맨 첫 덩이**여야 합니다. 중간 문장은 절대 제목이 아닙니다.
     *   2) 마침표·물음표로 끝나면 안 됩니다. 그건 문장이지 제목이 아닙니다.
     *   3) 8~45자.
     *
     * 애매하면 **그냥 둡니다.** 제목을 못 넣는 건 사장님이 바로 아시지만,
     * 멋대로 바꾼 건 모르고 지나갑니다. 모르고 지나가는 쪽이 더 나쁩니다.
     */
    if (!title && blocks[0] && blocks[0].kind === "text") {
      const t = blocks[0].text;
      const looksLikeSentence = /[.!?…。]$/.test(t);
      if (!looksLikeSentence && vis(t) >= 8 && vis(t) <= 45) {
        title = t;
        blocks.shift();
      }
    }

    return { title, blocks, stats: summarize(blocks) };
  }

  /** 마크다운 표시를 뗍니다. 편집기에는 서식으로 넣지 글자로 넣지 않습니다. */
  function clean(s) {
    return String(s || "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/^\s*[-*]\s+/, "")
      .trim();
  }

  function summarize(blocks) {
    const t = blocks.filter((b) => b.kind === "text");
    const lens = t.map((b) => vis(b.text)).sort((a, b) => a - b);
    return {
      subheads: blocks.filter((b) => b.kind === "subhead").length,
      quotes: blocks.filter((b) => b.kind === "quote").length,
      photos: blocks.filter((b) => b.kind === "photo").length,
      paras: t.length,
      chars: t.reduce((n, b) => n + vis(b.text), 0),
      paraMedian: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
      over45: t.length ? Math.round((t.filter((b) => vis(b.text) > 45).length / t.length) * 100) : 0,
      marks: t.reduce((n, b) => n + (b.marks ? b.marks.length : 0), 0),
    };
  }

  window.__wsDraft = { parse, pickBody, dropTitleList, clean };
})();
