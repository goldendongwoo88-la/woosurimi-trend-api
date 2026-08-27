/**
 * 줄바꿈 — 긴 문단을 읽기 좋게 자릅니다.
 *
 * ⚠️ AI를 안 씁니다.
 * 늑대플은 이걸 "AI 줄바꿈"이라고 부르지만, 자르는 자리는 국어 문법으로 정해져
 * 있습니다. AI한테 물어보면 (1) 돈이 나가고 (2) 느리고 (3) 가끔 **문장을 고쳐서**
 * 돌려줍니다. 자르라고 했는데 내용이 바뀌면 그건 줄바꿈이 아닙니다.
 * 여기서는 **글자를 단 하나도 바꾸지 않습니다.** 자를 뿐입니다.
 *
 * ⚠️ 기준은 지어낸 게 아니라 실제로 세어본 값입니다.
 * (scripts/measure-paragraphs.js — 두 블로그 각 12편, 문단 1,508개)
 *
 *                       잘 되는 쪽(nidle_831)   사장님(man_is_best)
 *   문단 길이 중앙값            19자                  38자
 *   90%가 이 안에              28자                  94자
 *   45자 넘는 문단              1%                   39%
 *   60자 넘는 문단              0%                   26%
 *   최대                       87자                 200자
 *
 * 일 74,094명 오는 블로그는 **60자 넘는 문단을 아예 안 씁니다.** 0%입니다.
 * 그래서 목표를 20자, 한계를 45자로 잡았습니다.
 */

/**
 * 눈에 안 보이는 글자들.
 *
 * ⚠️ 네이버 편집기는 빈 줄에 U+200B(폭 없는 공백)를 넣습니다. 실제 글 1,508개를
 * 세어보니 **1,278개가 이것**이었습니다. 이건 글자가 아니라 여백입니다.
 * 그런데 자바스크립트의 \s는 U+200B를 공백으로 안 봅니다. 그래서 따로 적어야 합니다.
 *
 * ⚠️ 처음엔 "2글자 미만이면 버린다"로 했습니다. 그랬더니 **"또", "즉"** 처럼
 * 한 글자짜리 진짜 문단이 같이 사라졌습니다(실제 글에서 4개 나왔습니다).
 * 길이로 판단하면 안 됩니다. 보이는 글자가 있느냐로 판단해야 합니다.
 */
const INVISIBLE = /[\s​-‍⁠﻿]/g;

/** 눈에 보이는 글자가 하나도 없으면 빈 줄입니다. */
const isBlank = (s) => !String(s || "").replace(INVISIBLE, "");

/** 눈에 보이는 글자 수 — 길이를 잴 때 이걸 씁니다. */
const visibleLen = (s) => String(s || "").replace(INVISIBLE, "").length;

/** 문단 하나가 이 정도면 좋습니다. (잘 되는 쪽 중앙값 19자) */
const TARGET = 22;
/** 여기를 넘으면 자릅니다. (잘 되는 쪽의 99%가 이 아래) */
const LIMIT = 45;
/** 이보다 짧은 조각은 만들지 않습니다. 한 글자짜리 줄이 생기면 더 못 읽습니다. */
const MIN_PIECE = 8;

/**
 * 문장이 끝나는 자리.
 *
 * ⚠️ 한국어 블로그는 마침표를 잘 안 찍습니다. 그래서 부호만 보면 못 자릅니다.
 * 종결어미도 같이 봅니다. 다만 **연결어미(-고, -면, -며)는 안 씁니다.**
 * '사고', '보고', '라면', '측면'처럼 낱말 속에 그 글자가 그냥 들어 있는 경우가
 * 너무 많아서, 문장 한가운데를 엉뚱하게 자릅니다. 확실한 것만 씁니다.
 */
const ENDERS = [
  // 부호로 끝나는 자리 — 제일 확실합니다.
  { re: /([.!?]|\.{2,}|…)(\s+)/g, kind: "부호" },
  // 종결어미 + 공백 — 부호가 없어도 문장이 끝난 게 확실한 것들.
  { re: /((?:습니다|ㅂ니다|입니다|합니다|됩니다|했어요|해요|예요|이에요|에요|네요|더라고요|거든요|잖아요|드려요|세요|십니다|겠죠|겠어요|았어요|었어요|았습니다|었습니다)[.!?]?)(\s+)/g, kind: "종결" },
];

/**
 * 문장이 안 끝났는데 자를 수밖에 없을 때 쓰는 자리들.
 *
 * ⚠️ 처음엔 이게 없어서 "겨울에도 충분히 입을 수 / 있을 것 같았습니다"처럼
 * 어색하게 끊겼습니다. 자를 자리가 없으면 그냥 띄어쓰기에서 끊었기 때문입니다.
 *
 * ⚠️ 그렇다고 연결어미를 문장 나누기에 그대로 쓰면 안 됩니다.
 * '사고', '보고', '라면', '측면'처럼 낱말 속에 그 글자가 든 경우가 너무 많습니다.
 * 그래서 **점수**를 매깁니다. 확실한 것일수록 높고, 애매한 것은 낮습니다.
 * 확실한 자리가 있으면 그쪽으로 가고, 없을 때만 애매한 자리를 씁니다.
 */
const SOFT = [
  // 연결어미 — 여기서 끊으면 거의 자연스럽습니다.
  { re: /((?:는데|은데|ㄴ데|지만|아서|어서|여서|니까|으니까|면서|거나|든지|더니|길래|는지|던데|테니|라서|다가|자마자)[,]?)(\s+)/g, score: 8 },
  // 쉼표 — 글쓴이가 직접 찍은 쉼표입니다. 여기가 마디라고 본인이 표시한 겁니다.
  //
  // ⚠️ 처음엔 쉼표를 나중에 따로 한 번 더 돌리는 방식이었습니다. 그랬더니
  // 확장(한 번에 같이 보는 방식)과 결과가 달라졌습니다. 실제 문단 2,790개를
  // 대조해보니 56개가 어긋났고, **확장 쪽이 더 자연스러웠습니다.**
  //   서버: "* 출처: 김윤주 인스타그램, 권정열 / 인스타그램, KBS(...)"   ← 이상함
  //   확장: "* 출처: 김윤주 인스타그램, 권정열 인스타그램, / KBS(...)"   ← 맞음
  // 그래서 서버를 확장에 맞췄습니다.
  { re: /(,)(\s+)/g, score: 6 },
  // 조사로 끝나는 어절 — 문장의 마디입니다.
  { re: /((?:에서|으로|에게|한테|부터|까지|보다|처럼|만큼|대신|위해|통해)[,]?)(\s+)/g, score: 5 },
  // -고 / -며 / -면 — 낱말 속에도 흔해서 제일 낮습니다.
  { re: /((?:하고|되고|이고|보며|하며|되며|하면|되면|이면)[,]?)(\s+)/g, score: 3 },
];

/**
 * 점수가 붙은 자를 자리들. {pos, score} 배열.
 * ⚠️ 같은 자리가 여러 규칙에 걸리면 제일 높은 점수를 씁니다.
 */
function softPoints(text) {
  const map = new Map();
  for (const { re, score } of SOFT) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const pos = m.index + m[1].length;
      if (!map.has(pos) || map.get(pos) < score) map.set(pos, score);
    }
  }
  // 띄어쓰기도 후보에 넣습니다 — 점수는 제일 낮게.
  const sp = /(\S)(\s+)/g;
  let m;
  while ((m = sp.exec(text))) {
    const pos = m.index + 1;
    if (!map.has(pos)) map.set(pos, 1);
  }
  return [...map.entries()].map(([pos, score]) => ({ pos, score })).sort((a, b) => a.pos - b.pos);
}

/**
 * 자를 수 있는 위치들을 모읍니다. 위치는 "이 글자 다음에서 자른다"는 뜻입니다.
 * 반환값은 오름차순 인덱스 배열.
 */
function breakPoints(text, patterns) {
  const pts = [];
  for (const { re } of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      // m[1] 끝까지가 한 조각. 뒤따르는 공백은 다음 조각 앞에서 떼어냅니다.
      pts.push(m.index + m[1].length);
    }
  }
  return [...new Set(pts)].sort((a, b) => a - b);
}

/**
 * 자를 자리 목록을 받아, TARGET 근처에서 끊어가며 조각을 만듭니다.
 * ⚠️ 욕심내서 매번 제일 가까운 자리를 고르면 마지막에 3자짜리 꼬리가 남습니다.
 * 남은 길이가 MIN_PIECE보다 짧아질 자리는 고르지 않습니다.
 */
function cutAt(text, points) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    const rest = text.length - start;
    if (rest <= LIMIT) {
      out.push(text.slice(start).trim());
      break;
    }
    // start 이후, LIMIT 안에 있는 자리들 중에서 TARGET에 제일 가까운 것.
    const cands = points.filter((p) => p > start + MIN_PIECE && p - start <= LIMIT);
    let pick = null;
    if (cands.length) {
      // 잘랐을 때 남는 꼬리가 너무 짧아지지 않는 자리만.
      const okay = cands.filter((p) => text.length - p === 0 || text.length - p >= MIN_PIECE);
      const pool = okay.length ? okay : cands;
      pick = pool.reduce((best, p) =>
        Math.abs(p - start - TARGET) < Math.abs(best - start - TARGET) ? p : best);
    }
    if (pick == null) {
      // 문장이 안 끝났는데 자를 수밖에 없습니다.
      // 연결어미 > 조사 > 띄어쓰기 순으로 봅니다. 점수가 같으면 TARGET에 가까운 쪽.
      const soft = softPoints(text).filter((s) => s.pos > start + MIN_PIECE && s.pos - start <= LIMIT);
      if (soft.length) {
        const best = soft.reduce((a, b) => {
          if (b.score !== a.score) return b.score > a.score ? b : a;
          return Math.abs(b.pos - start - TARGET) < Math.abs(a.pos - start - TARGET) ? b : a;
        });
        pick = best.pos;
      } else {
        pick = start + LIMIT;
      }
    }
    const piece = text.slice(start, pick).trim();
    if (piece) out.push(piece);
    start = pick;
    // 다음 조각 앞의 공백을 건너뜁니다.
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  return out.filter(Boolean);
}

/**
 * 문단 하나를 자릅니다.
 * @returns {string[]} 조각들. 원래도 짧으면 [원문] 그대로.
 */
function splitParagraph(text) {
  // 눈에 안 보이는 글자를 먼저 걷어냅니다. 안 그러면 30자짜리 문단이
  // 45자로 보여서 엉뚱하게 잘립니다.
  const t = String(text || "").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (!t) return [];
  if (t.length <= LIMIT) return [t];

  // 문장 끝으로 나눕니다. 문장 끝이 없으면 cutAt이 알아서 연결어미·쉼표를 봅니다.
  return cutAt(t, breakPoints(t, ENDERS));
}

/**
 * 글 전체를 다시 나눕니다.
 *
 * @param {string} body 문단이 줄바꿈으로 이어진 글
 * @param {object} opt
 * @param {boolean} opt.blankLines 조각 사이에 빈 줄을 넣을지 (기본 true)
 * @returns {{ok:boolean, text:string, before:object, after:object, changed:number, why?:string}}
 */
function rebreak(body, { blankLines = true } = {}) {
  const src = String(body || "");
  if (!src.trim()) return { ok: false, why: "본문이 비어 있습니다." };

  // 원문의 문단. 빈 줄은 여기서 걷어냅니다 — 어차피 다시 넣습니다.
  const paras = src.split(/\n/).map((s) => s.trim());
  const real = paras.filter((s) => !isBlank(s));
  if (!real.length) return { ok: false, why: "글자가 있는 문단을 찾지 못했습니다." };

  const out = [];
  let changed = 0;
  for (const p of paras) {
    if (isBlank(p)) continue; // 원래 빈 줄은 버립니다 (뒤에서 다시 넣습니다)
    const pieces = splitParagraph(p);
    if (pieces.length > 1) changed++;
    out.push(...pieces);
    if (blankLines) out.push("");
  }
  // 마지막 빈 줄은 뗍니다.
  while (out.length && out[out.length - 1] === "") out.pop();

  const after = out.filter((s) => !isBlank(s));

  // ⚠️ 글자가 사라지지 않았는지 확인합니다. 자르기만 했으니 공백 뺀 글자 수는
  // 똑같아야 합니다. 다르면 제가 뭔가 잘못한 겁니다 — 그럴 땐 원문을 돌려줍니다.
  // ⚠️ \s만 빼면 U+200B가 남아서 "글자가 사라졌다"는 헛경보가 납니다.
  const strip = (arr) => arr.join("").replace(INVISIBLE, "");
  const beforeChars = strip(real);
  const afterChars = strip(after);
  if (beforeChars !== afterChars) {
    return {
      ok: false,
      why: "자르는 도중 글자가 달라졌습니다. 원문을 건드리지 않았습니다.",
      lost: beforeChars.length - afterChars.length,
    };
  }

  return {
    ok: true,
    text: out.join("\n"),
    changed,
    before: measure(real),
    after: measure(after),
  };
}

/** 문단 길이 통계 — 화면에서 전/후를 견줄 때 씁니다. */
function measure(paras) {
  const lens = paras.map((p) => visibleLen(p));
  if (!lens.length) return { n: 0 };
  const s = [...lens].sort((a, b) => a - b);
  const over = (n) => Math.round((lens.filter((x) => x > n).length / lens.length) * 100);
  return {
    n: lens.length,
    median: s[Math.floor(s.length / 2)],
    max: s[s.length - 1],
    over45: over(45),
    over60: over(60),
  };
}

module.exports = { rebreak, splitParagraph, measure, isBlank, visibleLen, TARGET, LIMIT };
