// 제목 후보 만들기.
//
// ⚠️ 왜 따로 만드는가
//
// 블로그에서 제목이 차지하는 비중이 유별납니다. 본문이 아무리 좋아도 검색 결과에서
// 안 눌리면 아무도 안 읽습니다. 그런데 글을 다 쓰고 나면 제목에 쓸 기운이 남아 있질
// 않아서, 대충 "제주도 카페" 같은 걸 달고 올려버립니다.
//
// 그래서 본문을 이미 갖고 있을 때 거기서 제목을 여러 개 뽑아주는 걸 따로 뒀습니다.
// 하나만 주면 그게 좋은지 나쁜지 알 수가 없어서, 결이 다른 것들을 나란히 놓고
// 고르게 합니다.
//
// 상위 글 패턴(competitorScan)을 함께 넘기면 그 키워드에서 실제로 통하는 방식에
// 맞춰 씁니다. 없으면 일반적인 기준으로 씁니다.

const { callClaude, extractJson } = require("./claudeClient");
const { stripHtml } = require("./postAudit");

const SYSTEM = `당신은 네이버 블로그 제목을 짓는 사람입니다.

제목 하나가 그 글의 운명을 정합니다. 검색 결과에 스무 개가 나란히 뜨는데 그중 하나가
눌리는 겁니다. 본문이 좋아도 제목에서 지면 아무도 안 읽습니다.

지켜야 할 것:
- 길이는 25~40자. 검색 결과에서 잘리지 않고, 궁금하게 만들 수 있는 길이입니다.
- 키워드를 반드시 넣되, 앞쪽에 두는 게 유리합니다.
- 본문에 실제로 있는 내용만 쓰세요. 본문에 없는 숫자·장소·사실을 지어내면 안 됩니다.
  ("3곳"이라고 쓰려면 본문에 정말 세 곳이 나와야 합니다)
- 낚시는 하되 거짓말은 하지 마세요. 열어봤을 때 제목과 다른 내용이면 바로 나갑니다.
- 과장 표현(최고, 1위, 100%, 무조건)은 광고법에 걸립니다. 쓰지 마세요.
- 특수문자를 남발하지 마세요. 느낌표는 하나면 충분하고 없어도 됩니다.

결이 다른 여러 개를 만들어야 합니다. 비슷한 걸 열 개 주면 고를 수가 없습니다.

반드시 아래 JSON만 출력하세요.

{
  "titles": [
    {
      "text": "제목",
      "style": "정보형 | 후기형 | 숫자형 | 질문형 | 비교형 | 공감형",
      "why": "이 제목이 왜 눌릴 것 같은지 한 줄",
      "for": "어떤 사람이 이걸 누를지 한 줄"
    }
  ]
}`;

/** 상위 글 패턴을 지시문으로 바꿉니다. */
function patternHint(patterns) {
  if (!patterns) return "";
  const p = patterns;
  const lines = [`\n[이 키워드에서 상위에 있는 글 ${p.count}개를 봤더니]`];
  lines.push(`- 제목 길이는 ${p.title.min}~${p.title.max}자, 가운데값 ${p.title.median}자`);
  if (p.keywordAtStart >= 50) lines.push(`- ${p.keywordAtStart}%가 제목을 키워드로 시작합니다`);
  if (p.hasNumber >= 40) lines.push(`- ${p.hasNumber}%가 숫자를 씁니다`);
  if (p.hasReview >= 40) lines.push(`- ${p.hasReview}%가 후기·리뷰형입니다`);
  if (p.hasRecommend >= 40) lines.push(`- ${p.hasRecommend}%가 추천·모음형입니다`);
  if (p.hasQuestion >= 30) lines.push(`- ${p.hasQuestion}%가 질문형입니다`);
  lines.push(`이 결에 맞춰 쓰되, 똑같이 따라 하지는 마세요. 같은 결 안에서 더 눈에 띄어야 합니다.`);
  return lines.join("\n");
}

/**
 * @param {object} input
 * @param {string} input.body 본문 (제목을 여기서 뽑습니다)
 * @param {string} [input.keyword]
 * @param {string} [input.currentTitle] 지금 제목 (있으면 이것보다 나은 걸 만들게 합니다)
 * @param {object} [input.patterns] competitorScan의 patterns
 * @param {number} [input.count]
 */
async function suggest({ body = "", keyword = "", currentTitle = "", patterns = null, count = 10 }) {
  const text = stripHtml(body);
  if (!text.trim()) throw new Error("본문이 없습니다. 본문을 넣어주셔야 제목을 뽑을 수 있어요.");

  const n = Math.min(15, Math.max(5, count));

  const user = `아래 본문에 어울리는 제목을 ${n}개 지어 주세요.

${keyword ? `[노리는 키워드] ${keyword}\n` : ""}${currentTitle ? `[지금 제목] ${currentTitle}\n지금 제목보다 나은 걸 만들어 주세요.\n` : ""}
[본문]
${text.slice(0, 12000)}
${patternHint(patterns)}

결이 다른 것들로 만들어 주세요. 정보형·후기형·숫자형·질문형·비교형·공감형을 골고루요.
본문에 없는 사실을 지어내지 마세요.

JSON만 출력하세요.`;

  const reply = await callClaude({
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    maxTokens: 3000,
    temperature: 0.9, // 제목은 다양해야 해서 조금 자유롭게
    timeoutMs: 120000,
  });

  const data = extractJson(reply);
  if (!data || !Array.isArray(data.titles)) throw new Error("제목을 받지 못했습니다. 다시 시도해 주세요.");

  // 받은 제목마다 확인 가능한 것들을 붙여줍니다.
  // 길이가 맞는지, 키워드가 들어 있는지, 앞쪽에 있는지는 계산으로 알 수 있습니다.
  const flat = (s) => String(s).replace(/\s/g, "");
  const kwFlat = flat(keyword);

  return {
    titles: data.titles.slice(0, n).map((t) => {
      const text = String(t.text || "").trim();
      const f = flat(text);
      const pos = kwFlat ? f.indexOf(kwFlat) : -1;
      return {
        text,
        style: t.style || "",
        why: t.why || "",
        for: t.for || "",
        length: text.length,
        // 길이가 25~40자를 벗어나면 알려줍니다.
        lengthOk: text.length >= 22 && text.length <= 42,
        hasKeyword: pos >= 0,
        // 앞쪽 3분의 1 안에 있으면 '앞에 있다'고 봅니다.
        keywordEarly: pos >= 0 && pos <= f.length / 3,
        hasNumber: /\d/.test(text),
      };
    }),
    note:
      "제목 길이와 키워드 위치는 계산으로 확인한 값입니다. " +
      "어떤 제목이 실제로 더 눌릴지는 아무도 미리 알 수 없으니, 결이 다른 것 중에서 " +
      "본문과 가장 잘 맞는 걸 고르세요.",
  };
}

module.exports = { suggest, patternHint };
