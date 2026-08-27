/**
 * 본문을 홈판용으로 보완합니다.
 *
 * ⚠️ 이 기능은 **사장님이 직접 쓴 글에 손을 대는** 일입니다. 제목보다 훨씬 위험합니다.
 * 그래서 원칙을 좁게 잡았습니다.
 *
 *   하는 일   — 나누기, 소제목 달기, 사진 자리 표시, 문단 쪼개기
 *   안 하는 일 — 사실을 바꾸거나 없던 내용을 보태기
 *
 * 실측에서 나온 가장 큰 차이가 **소제목 6개 대 1개**였습니다.
 * 그런데 이건 글을 새로 쓰지 않아도 됩니다. 이미 쓴 1,900자를 여섯 토막으로
 * 나누기만 하면 되는 일입니다. 그게 이 기능이 하는 일의 거의 전부입니다.
 *
 * ⚠️ 없던 내용을 보태면 안 되는 이유
 * 사장님이 직접 써본 후기에 AI가 "이런 점도 좋았습니다"를 끼워 넣으면,
 * 그건 사장님이 겪지 않은 일을 사장님 이름으로 말하는 겁니다.
 * 후기 글에서 그건 거짓말이고, 협찬 글이면 표시 의무 문제까지 걸립니다.
 * 그래서 보탠 문장이 있으면 **반드시 표시**하고, 얼마나 늘었는지도 함께 보여줍니다.
 */

const claudeClient = require("./claudeClient");
const rules = require("./homefeedRules");

const SYSTEM =
  `당신은 네이버 블로그 원고를 홈판(홈피드)에서 잘 읽히도록 다듬는 편집자입니다.\n\n` +
  rules.promptBlock() +
  `\n\n[가장 중요한 규칙 — 이것부터 지키세요]\n` +
  `**원문의 문장은 한 문장도 사라지면 안 됩니다.**\n` +
  `이 글은 글쓴이가 직접 쓴 것이고, 당신은 편집자이지 대필자가 아닙니다.\n` +
  `요약하지 마세요. 문장을 합치지 마세요. "비슷한 내용이라" 지우지 마세요.\n` +
  `원문의 모든 문장이 결과물 안에 **거의 그대로** 남아 있어야 합니다.\n` +
  `당신이 하는 건 **순서를 정리하고, 나누고, 소제목을 다는 것**뿐입니다.\n` +
  `결과물의 글자 수는 원문과 비슷하거나 조금 더 많아야 정상입니다.\n` +
  `짧아졌다면 당신이 뭔가를 지운 것이고, 그건 실패입니다.\n\n` +

  `[당신이 하는 일]\n` +
  `1. 글을 **정확히 6개** 덩어리로 나누고 각 덩어리에 소제목을 답니다.\n` +
  `   6개입니다. 4개나 5개가 아닙니다. 실측에서 잘 되는 블로그가 6개를 씁니다.\n` +
  `   덩어리가 안 나뉘면 긴 부분을 둘로 쪼개서라도 6개를 만드세요.\n` +
  `   소제목은 딱딱한 명사형("제품 특징")이 아니라 말하듯 쓴 문장형으로 만듭니다.\n` +
  `   좋은 예: "생각보다 무거워서 놀랐어요" / "이 색은 조명 아래서 완전히 달라집니다"\n` +
  `2. 긴 문단을 1~3문장으로 쪼갭니다. 모바일에서 벽처럼 보이면 그냥 넘어갑니다.\n` +
  `3. 사진이 들어갈 자리를 [사진: 무엇을 찍은 것] 형태로 표시합니다. 총 18장 안팎.\n` +
  `4. 도입부 첫 두 문장을 손봅니다. 홈판에서는 첫 줄이 미리보기로 보입니다.\n` +
  `   단 이때도 원문 문장을 **버리지 말고** 순서만 바꾸세요.\n\n` +

  `[절대 하지 않는 일]\n` +
  `- 없던 사실을 보태지 않습니다. 제품명·가격·날짜·수치를 새로 만들지 않습니다.\n` +
  `- 글쓴이가 겪지 않은 경험을 지어내지 않습니다. 후기 글에서 이건 거짓말입니다.\n` +
  `- 말투를 바꾸지 않습니다. 글쓴이가 쓰던 어투를 그대로 유지합니다.\n` +
  `- 분량을 채우려고 같은 말을 다르게 반복하지 않습니다.\n\n` +
  `내용이 모자라 여섯 덩어리를 못 채우겠으면, 억지로 늘리지 말고 ` +
  `그 자리에 ✏️(여기에 ~를 덧붙이면 좋습니다) 형태로 **무엇을 더 쓰면 좋을지 알려만** 주세요.`;

/** 원문에 없던 숫자·주장을 찾아냅니다. 제목 쪽과 같은 방식입니다. */
function findInvented(before, after) {
  const known = String(before).replace(/\s/g, "");
  const out = [];
  for (const m of String(after).matchAll(/\d[\d,.]*/g)) {
    const n = m[0].replace(/[,.]$/, "");
    if (n.length >= 2 && !known.includes(n)) out.push(n);
  }
  for (const w of ["전문가", "의사", "관계자", "네티즌", "누리꾼", "업계", "공식", "정품"]) {
    if (String(after).includes(w) && !known.includes(w)) out.push(w);
  }
  return [...new Set(out)].slice(0, 12);
}

function countSubheads(text) {
  return (String(text).match(/^\s*\[소제목\]|^\s*##\s|^\s*\[.{2,40}\]\s*$/gm) || []).length;
}

function countPhotoSlots(text) {
  return (String(text).match(/\[사진[^\]]*\]/g) || []).length;
}

/**
 * @param {string} body   지금 본문 (에디터에서 읽어온 글)
 * @param {string} title  제목 (맥락용, 없어도 됩니다)
 */
async function rewrite({ body, title = "" }) {
  const src = String(body || "").trim();
  if (src.length < 200)
    return { ok: false, why: "본문이 너무 짧습니다. 200자 이상 쓰신 뒤에 눌러주세요." };
  // ⚠️ 너무 길면 토큰이 넘칩니다. 넘치면 뒷부분이 통째로 사라지는데,
  // 그건 사장님 글을 잘라먹는 것이라 아예 거절하는 편이 낫습니다.
  if (src.length > 6000)
    return { ok: false, why: "본문이 6,000자를 넘습니다. 나눠서 해주세요. 잘린 글을 돌려드릴 수는 없습니다." };

  // ⚠️ 결론을 위에 둘지 아래에 둘지는 글 성격마다 다릅니다.
  // 후기는 판정을 맨 위에(검색으로 오니까), 연예인 정보성은 반전을 아래에(홈피드로 오니까).
  const placement = rules.placementBlock(title, src);

  const prompt =
    (title ? `제목: ${title}\n\n` : "") +
    placement + "\n\n" +
    `아래 본문을 홈판용으로 다듬어 주세요.\n\n` +
    `--- 본문 시작 ---\n${src}\n--- 본문 끝 ---\n\n` +
    `JSON만 답하세요:\n` +
    `{\n` +
    `  "body": "다듬은 본문 전체. 소제목은 [소제목] 표시로, 사진 자리는 [사진: 설명] 표시로.",\n` +
    `  "subheads": ["소제목1", "소제목2", ...],\n` +
    `  "changes": ["무엇을 어떻게 바꿨는지 한 줄씩", ...],\n` +
    `  "suggestions": ["더 쓰면 좋을 내용", ...]\n` +
    `}`;

  let parsed;
  try {
    const text = await claudeClient.callClaude({
      feature: "본문 다듬기",
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      // 원문 길이의 두 배쯤은 나올 수 있게 잡습니다. 모자라면 잘립니다.
      maxTokens: Math.min(8000, Math.max(3000, Math.round(src.length * 2.4))),
      temperature: 0.4, // 다듬는 일이라 낮게. 창작이 아닙니다.
      timeoutMs: 150000,
    });
    parsed = claudeClient.extractJson(text);
  } catch (e) {
    return { ok: false, why: `다듬는 데 실패했습니다: ${e.message}` };
  }

  const after = String((parsed && parsed.body) || "").trim();
  if (!after) return { ok: false, why: "응답 형식이 예상과 달랐습니다. 다시 해주세요." };

  // ⚠️ 결과가 원문보다 짧으면 사장님 글이 사라진 겁니다.
  //
  // 처음엔 60% 미만일 때만 막았는데, 실제로 돌려보니 1,964자가 1,426자(73%)로
  // 줄어든 채 통과했습니다. 4분의 1이 사라졌는데 "다듬었습니다" 하고 돌려준 겁니다.
  // 사장님이 모르고 붙여넣으면 쓴 내용이 그냥 없어집니다.
  //
  // 나누고 소제목을 다는 작업은 원래 글자 수가 **늘어야** 정상입니다.
  // 그래서 기준을 85%로 올립니다. 잘라먹느니 거절하는 편이 낫습니다.
  const bodyOnly = after.replace(/\[[^\]]*\]/g, "");
  const ratio = bodyOnly.length / src.length;
  if (ratio < 0.85) {
    return {
      ok: false,
      why:
        `다듬은 글이 원문의 ${Math.round(ratio * 100)}%로 줄었습니다. ` +
        `내용이 사라진 것이라 돌려드리지 않습니다. 다시 눌러보시고, 계속 그러면 본문을 나눠서 해주세요.`,
      shrunk: true,
      ratio,
    };
  }

  const invented = findInvented(src, after);

  return {
    ok: true,
    before: { chars: src.length, subheads: countSubheads(src), photoSlots: countPhotoSlots(src) },
    after: {
      chars: after.replace(/\[[^\]]*\]/g, "").length,
      subheads: Array.isArray(parsed.subheads) ? parsed.subheads.length : countSubheads(after),
      photoSlots: countPhotoSlots(after),
    },
    body: after,
    subheads: Array.isArray(parsed.subheads) ? parsed.subheads : [],
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    invented,
    note:
      "나누고 소제목을 단 것이지 새로 쓴 게 아닙니다. " +
      "그래도 붙여넣기 전에 한 번 읽어보세요. 사장님 이름으로 나가는 글입니다.",
  };
}

/**
 * 제목이 약속했는데 본문에 없는 내용을 채워 넣습니다.
 *
 * ⚠️ 여기가 지어내기와 가장 가까운 자리라 선을 분명히 긋습니다.
 *
 * 제목이 "눈 4방향 연 메이크업"인데 본문에 4방향 이야기가 없을 때,
 * AI가 "4방향으로 그렸습니다"를 지어내면 **제목만 낚시였던 게 글 전체가 거짓**이 됩니다.
 * 그건 안 하느니만 못합니다.
 *
 * 그래서 **사실은 밖에서 들어와야** 합니다. 두 곳 중 하나입니다.
 *   1) 사장님이 아시는 것을 적어주신다
 *   2) 자료 조사(research.js)로 찾아온 것을 넘겨받는다
 * 이 함수는 받은 사실을 **본문 알맞은 자리에 자연스럽게 엮는 일만** 합니다.
 * 사실을 만들지 않습니다.
 */
async function fillMissing({ body, title = "", missing = [], facts = "" }) {
  const src = String(body || "").trim();
  const fact = String(facts || "").trim();
  if (src.length < 100) return { ok: false, why: "본문이 너무 짧습니다." };
  if (!fact) {
    return {
      ok: false,
      why: "넣을 내용을 알려주세요. 모르시면 '찾아보기'로 자료를 먼저 모으세요.",
      needFacts: true,
    };
  }

  const want = (Array.isArray(missing) ? missing : [missing]).filter(Boolean);

  const system =
    `당신은 블로그 원고에 빠진 내용을 채워 넣는 편집자입니다.\n\n` +
    `**아래 '넣을 내용'에 있는 것만 쓰세요.** 거기 없는 사실을 보태면 안 됩니다.\n` +
    `숫자·제품명·날짜를 새로 만들지 마세요. 넣을 내용에 없으면 그대로 비워두세요.\n\n` +
    `**원문의 문장은 지우지 마세요.** 끼워 넣는 것이지 다시 쓰는 게 아닙니다.\n` +
    `결과물은 원문보다 길어야 정상입니다. 짧아졌다면 당신이 뭔가를 지운 겁니다.\n\n` +
    `**말투를 맞추세요.** 글쓴이가 쓰던 어투 그대로 이어 쓰세요.\n` +
    `새로 넣은 문장이 튀면 읽는 사람이 바로 알아챕니다.\n\n` +
    rules.promptBlock();

  const prompt =
    (title ? `제목: ${title}\n` : "") +
    (want.length ? `제목이 약속했는데 본문에 없는 말: ${want.join(", ")}\n` : "") +
    `\n[넣을 내용 — 이 안에 있는 것만 쓰세요]\n${fact}\n\n` +
    `--- 본문 시작 ---\n${src}\n--- 본문 끝 ---\n\n` +
    `이 내용을 본문에서 가장 자연스러운 자리에 끼워 넣어 주세요.\n` +
    `맨 앞이나 맨 뒤에 덧붙이지 말고, 흐름이 이어지는 곳을 찾아 넣으세요.\n\n` +
    `JSON만 답하세요:\n` +
    `{"body":"채워 넣은 본문 전체","added":["새로 넣은 문장"],"where":"어느 대목에 넣었는지 한 줄"}`;

  let parsed;
  try {
    const text = await claudeClient.callClaude({
      feature: "본문 다듬기",
      system,
      messages: [{ role: "user", content: prompt }],
      maxTokens: Math.min(8000, Math.max(3000, Math.round(src.length * 2.4))),
      temperature: 0.4,
      timeoutMs: 150000,
    });
    parsed = claudeClient.extractJson(text);
  } catch (e) {
    return { ok: false, why: `채워 넣지 못했습니다: ${e.message}` };
  }

  const after = String((parsed && parsed.body) || "").trim();
  if (!after) return { ok: false, why: "응답 형식이 예상과 달랐습니다." };

  // ⚠️ 채워 넣는 일인데 글이 짧아졌다면 원문을 지운 겁니다.
  if (after.length < src.length * 0.95) {
    return {
      ok: false,
      why: `채운 글이 원문보다 짧습니다(${Math.round((after.length / src.length) * 100)}%). 내용이 지워진 것이라 돌려드리지 않습니다.`,
      shrunk: true,
    };
  }

  // 넣을 내용에도 원문에도 없는 숫자가 새로 생겼는지 봅니다.
  const invented = findInvented(src + " " + fact, after);

  return {
    ok: true,
    before: { chars: src.length },
    after: { chars: after.length },
    body: after,
    added: Array.isArray(parsed.added) ? parsed.added : [],
    where: parsed.where || "",
    invented,
    note:
      "넣어드린 내용은 사장님이 주신 것과 찾아온 자료에서만 왔습니다. " +
      "그래도 붙여넣기 전에 새로 들어간 문장을 한 번 읽어보세요.",
  };
}

module.exports = { rewrite, fillMissing, findInvented, countSubheads, countPhotoSlots };
