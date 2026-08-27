// 진단한 걸 실제로 고쳐 쓰기.
//
// ⚠️ 진단만 하고 끝나면 반쪽입니다.
//
// "글자가 800자 모자랍니다", "어미가 다섯 번 연속 같습니다" 라고 알려줘도, 결국
// 사람이 다시 앉아서 고쳐야 합니다. 그럴 거면 진단이 오히려 일을 늘린 셈입니다.
//
// 그래서 진단 결과를 그대로 Claude에게 넘겨 고치게 합니다. 다만 **통째로 새로
// 쓰게 하지는 않습니다.** 새로 쓰면 원래 글에 있던 본인 경험과 말투가 사라지고,
// 어디가 어떻게 바뀌었는지도 알 수 없습니다. 지적된 부분만 고치게 합니다.

const { callClaude } = require("./claudeClient");
const { audit, stripHtml } = require("./postAudit");

const SYSTEM = `당신은 블로그 글을 다듬는 편집자입니다. 새로 쓰는 사람이 아닙니다.

가장 중요한 원칙: **원래 글을 최대한 살립니다.**

글쓴이가 직접 겪은 일, 직접 본 것, 본인 말투는 그 글의 전부입니다. 그걸 매끄럽게
다듬는다고 지워버리면 누가 써도 똑같은 글이 됩니다. 검색에서도 그런 글이 가장 먼저
밀립니다.

그래서 이렇게 합니다.
- 지적된 문제만 고칩니다. 문제없는 문장은 글자 하나도 건드리지 마세요.
- 글이 짧아서 늘려야 한다면, 없는 사실을 지어내지 말고 **이미 있는 내용을 더 자세히**
  풀어 쓰세요. 원문에 "커피가 맛있었다"가 있으면 "어떤 맛이었는지, 무엇과 비교해서
  그렇게 느꼈는지"를 덧붙이는 식입니다. 새로운 장소·가격·날짜·인물을 만들어내면 안 됩니다.
- 확실하지 않은 부분을 채워야 할 때는 [여기에 ○○를 적어주세요] 처럼 대괄호로 표시해
  두세요. 글쓴이가 채우게 하는 게 지어내는 것보다 낫습니다.
- 말투를 바꾸지 마세요. 원문이 "~해요"면 "~해요"로, "~습니다"면 "~습니다"로 갑니다.
  다만 같은 어미가 계속 반복된다는 지적을 받았다면 그때만 몇 개를 섞습니다.

출력은 반드시 아래 JSON 하나만. 앞뒤에 설명을 붙이지 마세요.

{
  "title": "고친 제목 (제목에 문제가 없었으면 원래 것 그대로)",
  "body": "고친 본문 전체. 소제목은 ## 로 시작하는 줄로 표시하세요. 문단은 빈 줄로 나눕니다.",
  "tags": ["태그", "목록"],
  "changes": [
    { "what": "무엇을 고쳤는지 한 줄", "why": "왜 고쳤는지 한 줄" }
  ]
}`;

/** 진단 결과를 Claude가 알아먹을 지시로 바꿉니다. */
function toInstructions(a) {
  const lines = [];

  for (const c of a.checks) {
    if (c.ok) continue;
    lines.push(`- [${c.level === "bad" ? "꼭 고칠 것" : "가능하면"}] ${c.label}: ${c.detail}` +
      (c.fix ? `\n  → ${c.fix}` : ""));
  }

  if (a.risks && a.risks.length) {
    lines.push("");
    lines.push("- [반드시 고칠 것] 광고법에 걸릴 수 있는 표현이 있습니다:");
    for (const r of a.risks) {
      lines.push(`  · "${r.words.join('", "')}" — ${r.why}`);
      lines.push(`    → ${r.fix}`);
    }
    lines.push("  이 표현들은 삭제하거나 위 방법대로 바꿔주세요. 그냥 두면 신고당할 수 있습니다.");
  }

  return lines.join("\n");
}

/**
 * 글을 고쳐 씁니다.
 *
 * @param {object} input audit()에 넣는 것과 같은 형태
 * @returns {Promise<{title, body, tags, changes, before, after}>}
 */
async function improve({ title = "", body = "", tags = [], keyword = "", images = null }) {
  const before = audit({ title, body, tags, keyword, images });

  const todo = toInstructions(before);
  if (!todo.trim()) {
    return {
      title, body, tags,
      changes: [],
      before, after: before,
      unchanged: true,
      message: "고칠 곳이 없습니다. 이대로 올리셔도 좋습니다.",
    };
  }

  const plain = stripHtml(body);

  const user = `아래 글을 지적된 부분만 고쳐 주세요.

${keyword ? `[노리는 키워드] ${keyword}\n` : ""}[제목]
${title || "(제목 없음)"}

[본문]
${plain.slice(0, 20000)}

[태그]
${(tags || []).map((s) => `#${String(s).replace(/^#/, "")}`).join(" ") || "(없음)"}

━━━━━━━━━━━━━━━━━━━━━━━━
[고쳐야 할 것]
${todo}
━━━━━━━━━━━━━━━━━━━━━━━━

다시 강조합니다. **문제없는 문장은 건드리지 마세요.** 글쓴이가 직접 겪은 일과
말투를 그대로 살리면서, 위에 적힌 것만 고쳐 주세요.
사실을 지어내지 마세요. 확실하지 않으면 [대괄호]로 표시해 두세요.

JSON만 출력하세요.`;

  const reply = await callClaude({
    feature: "글 보완",
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    maxTokens: 8000,
    temperature: 0.4, // 고쳐 쓰는 일이라 너무 자유롭지 않게
    timeoutMs: 180000,
  });

  const { extractJson } = require("./claudeClient");
  const data = extractJson(reply);
  if (!data || !data.body) throw new Error("고친 글을 받지 못했습니다. 다시 시도해 주세요.");

  const newTitle = String(data.title || title).trim();
  const newBody = String(data.body || "").trim();
  const newTags = Array.isArray(data.tags)
    ? data.tags.map((s) => String(s).replace(/^#/, "").trim()).filter(Boolean)
    : tags;

  // 고친 뒤에 다시 진단해서 실제로 나아졌는지 봅니다.
  // ⚠️ 이걸 안 하면 "고쳤습니다"라고만 하고 정말 나아졌는지는 아무도 모릅니다.
  const after = audit({
    title: newTitle,
    body: newBody,
    tags: newTags,
    keyword,
    // 이미지는 글쓴이가 넣는 것이라 고쳐 쓴다고 늘어나지 않습니다. 원래 수를 그대로 씁니다.
    images,
  });

  return {
    title: newTitle,
    body: newBody,
    tags: newTags,
    changes: Array.isArray(data.changes) ? data.changes.slice(0, 12) : [],
    before,
    after,
    delta: {
      score: after.score - before.score,
      chars: after.stats.charsNoSpace - before.stats.charsNoSpace,
      bad: after.counts.bad - before.counts.bad,
      warn: after.counts.warn - before.counts.warn,
    },
    // 채워야 할 자리가 남았으면 알려줍니다.
    placeholders: (newBody.match(/\[[^\]\n]{2,40}\]/g) || []).slice(0, 10),
  };
}

module.exports = { improve, toInstructions };
