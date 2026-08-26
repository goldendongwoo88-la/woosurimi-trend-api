/**
 * 제목을 홈피드용으로 다시 씁니다.
 *
 * ⚠️ 왜 따로 만드는가
 * 홈피드 진단이 "말줄임표가 3%뿐입니다"라고 알려줘도, 그래서 뭘 어떻게 고치라는 건지는
 * 여전히 막막합니다. **진단과 고침 사이가 비어 있으면 아무도 안 고칩니다.**
 * 그 사이를 잇습니다 — 제목을 넣으면 고쳐진 제목이 나옵니다.
 *
 * ⚠️ 규칙은 감이 아니라 실측에서 나왔습니다.
 * 일 방문 7.6만 블로그와 2.5만 블로그의 제목 각 90편을 세어 갈리는 것만 남겼습니다:
 *   따옴표로 시작 88% 대 40% / 말줄임표 66% 대 1% / 궁금증 남기는 말 41% 대 18%
 *
 * ⚠️ 하면 안 되는 것
 * 낚시는 만들지 않습니다. 본문에 없는 내용을 제목이 약속하면 사람이 들어왔다가
 * 바로 나갑니다. 네이버는 그 '바로 나감'을 셉니다(퀵백). 조회수는 오르고 지수는 떨어집니다.
 * 그래서 프롬프트에 **본문에 있는 사실로만 궁금증을 만들라**고 못 박습니다.
 */

const claudeClient = require("./claudeClient");
// ⚠️ 규칙은 homefeedRules 한 곳에만 둡니다. 여기에 또 적어두면 언젠가 어긋나고,
// 어긋나면 화면이 알려주는 기준과 AI가 따르는 기준이 달라집니다.
const rules = require("./homefeedRules");

/** 제목에 어떤 장치가 있는지 — 고치기 전후를 비교해 보여주려고 씁니다. */
function analyze(title) {
  const m = rules.measure(title);
  return { length: m.length, ...m.devices };
}

function score(a) {
  return [a.quoteStart, a.ellipsis, a.curiosity, a.number].filter(Boolean).length;
}

const SYSTEM = `당신은 네이버 블로그 제목을 다듬는 사람입니다.

지금 네이버에서 사람이 가장 많이 들어오는 자리는 검색이 아니라 홈피드입니다.
홈피드는 손가락으로 넘기며 보는 자리라, 제목이 눈을 멈추게 하지 못하면 그냥 지나갑니다.

일 방문 7만 명대 블로그의 제목 90편을 세어보니 이런 장치를 씁니다:
- 88%가 따옴표로 시작합니다. 사람 말을 그대로 따오면 장면이 그려집니다.
- 66%가 말줄임표(…)로 한 번 끊습니다. 뒷말을 감추는 자리입니다.
- 41%가 '이것' '이곳' '진짜 이유' '했던' 같은 말로 끝을 열어둡니다.
- 58%에 숫자가 들어갑니다.

**가장 중요한 규칙 — 낚시를 만들지 마세요.**
본문에 없는 내용을 제목이 약속하면, 사람이 들어왔다가 바로 나갑니다.
네이버는 그 '바로 나감'을 세서 블로그 점수를 깎습니다. 조회수는 오르고 블로그는 죽습니다.
궁금증은 반드시 **본문에 실제로 있는 사실**로 만드세요.
본문을 모르면 원래 제목에 이미 담긴 사실 안에서만 다듬으세요.

그리고 이건 하지 마세요:
- 확인되지 않은 성형·열애·질병 추측
- "충격" "경악" "발칵" 같은 과장어 남발
- 특정인을 깎아내리는 표현`;

/**
 * @param {string} title    지금 제목
 * @param {string} body     본문 (있으면 훨씬 정확해집니다)
 * @param {number} count    몇 개 뽑을지
 */
async function rewrite({ title, body = "", count = 5 }) {
  const t = String(title || "").trim();
  if (!t) return { ok: false, why: "제목을 넣어주세요." };

  const before = analyze(t);

  // ⚠️ "알아서 잘 써주세요"라고 하면 장치를 안 씁니다. 실제로 처음에 그렇게 했더니
  // 5개 중 2개가 장치를 하나도 안 써서 **원래 제목보다 못한 결과**가 나왔습니다.
  // 변형마다 어떤 장치를 쓸지 못 박아 줍니다.
  const RECIPES = [
    "따옴표로 시작 + 말줄임표(…)로 끊기 + 끝을 '이유'나 '이것'으로 열어두기",
    "따옴표로 시작 + 숫자 넣기",
    "말줄임표(…)로 끊기 + '알고보니' 또는 '진짜 이유'로 끝내기",
    "따옴표로 시작 + '이것' 또는 '이곳'으로 대상을 감추기",
    "숫자 넣기 + 말줄임표(…)로 끊기",
    "따옴표로 시작 + '했던' 또는 '하더니'로 뒷일을 감추기",
  ];
  const recipes = RECIPES.slice(0, count);

  const prompt =
    `아래 제목을 홈피드에서 눈이 멈추도록 ${count}개로 다시 써주세요.\n\n` +
    `지금 제목: ${t}\n` +
    (body
      ? `\n본문 (이 안에 있는 사실로만 궁금증을 만드세요):\n${String(body).slice(0, 1500)}\n`
      : `\n본문이 없습니다. 원래 제목에 담긴 사실 밖으로 나가지 마세요.\n`) +
    `\n${count}개 각각에 아래 방식을 **반드시** 적용하세요. 순서대로 하나씩입니다:\n` +
    recipes.map((r, i) => `${i + 1}) ${r}`).join("\n") +
    `\n\n말줄임표는 반드시 … 또는 ... 형태로 실제로 넣으세요.\n` +
    `제목 길이는 35~45자가 적당합니다.\n\n` +
    `JSON만 답하세요:\n` +
    `{"titles":[{"text":"제목","why":"이 제목이 왜 눈을 멈추게 하는지 한 문장"}]}`;

  let parsed;
  try {
    const text = await claudeClient.callClaude({
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      temperature: 0.9,
      timeoutMs: 60000,
    });
    parsed = claudeClient.extractJson(text);
  } catch (e) {
    return { ok: false, why: `제목을 만들지 못했습니다: ${e.message}` };
  }

  const list = Array.isArray(parsed && parsed.titles) ? parsed.titles : [];
  if (!list.length) return { ok: false, why: "응답 형식이 예상과 달랐습니다. 다시 해주세요." };

  // ⚠️ 지어낸 숫자를 잡습니다.
  //
  // 본문 없이 돌렸더니 "2024년 바꾼 딱 1가지", "5가지만 기억하세요", "미용사들이 추천"
  // 같은 말이 나왔습니다. 원래 제목에 없던 사실입니다.
  // 이런 제목을 그대로 올리면 본문과 안 맞고, 들어온 사람이 바로 나갑니다.
  // 지우지는 않습니다 — 사장님이 실제로 그런 내용을 쓸 수도 있으니까요.
  // 대신 **어디가 새로 생긴 말인지 표시**해서 확인하고 쓰시게 합니다.
  const known = (t + " " + String(body || "")).replace(/\s/g, "");
  const findInvented = (text) => {
    const out = [];
    // 원문에 없는 숫자
    for (const m of text.matchAll(/\d+/g)) {
      if (!known.includes(m[0])) out.push(m[0]);
    }
    // 출처를 지어내는 표현
    for (const w of ["전문가", "미용사", "의사", "관계자", "네티즌", "누리꾼", "업계"]) {
      if (text.includes(w) && !known.includes(w)) out.push(w);
    }
    return [...new Set(out)];
  };

  const titles = list
    .map((x) => {
      const text = String(x.text || x.title || "").trim();
      if (!text) return null;
      const a = analyze(text);
      const invented = findInvented(text);
      return { text, why: String(x.why || "").trim(), devices: a, score: score(a), invented };
    })
    .filter(Boolean)
    // 장치를 많이 쓴 것부터
    .sort((a, b) => b.score - a.score);

  // ⚠️ 원래 제목보다 장치가 적은 건 내보내지 않습니다.
  // 고쳐달라고 했는데 더 나쁜 걸 주면 안 됩니다. 다만 전부 걸러지면
  // 빈손으로 보내는 셈이라, 그때는 있는 대로 주고 그 사실을 알립니다.
  const beforeScore = score(before);
  const better = titles.filter((x) => x.score >= beforeScore);
  const kept = better.length ? better : titles;

  return {
    ok: true,
    original: { text: t, devices: before, score: beforeScore },
    titles: kept,
    dropped: titles.length - kept.length,
    weak: !better.length,
    note:
      "제목이 약속한 내용은 본문에 반드시 있어야 합니다. 들어왔다가 바로 나가면 " +
      "조회수는 올라도 블로그 점수는 떨어집니다.",
  };
}

module.exports = { rewrite, analyze, score };
