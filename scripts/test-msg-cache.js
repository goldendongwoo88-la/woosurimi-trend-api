/**
 * 대화 내용 캐시 — 무엇을 건드리고 무엇을 안 건드리는지.
 *
 * ⚠️ 여기는 **사장님 글이 지나가는 길**입니다.
 * 캐시를 걸다가 대화 내용이 한 글자라도 바뀌면 AI가 다른 답을 내놓습니다.
 * 그래서 "값을 아꼈나"보다 **"글이 그대로인가"**를 먼저 봅니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */
const C = require("../src/claudeClient");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

const long = (n) => "가".repeat(n);
/** 캐시 표시를 뗀 뒤 원래 글자만 남깁니다 — 내용이 안 바뀌었는지 보려고. */
const plain = (msgs) =>
  msgs.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join(""),
  }));

console.log("\n━━ 안 건드려야 하는 경우 ━━");
{
  const one = [{ role: "user", content: long(5000) }];
  ok(C.buildMessages(one, "long") === one, "말이 하나뿐이면 그대로 (캐시할 앞부분이 없음)");

  const short = [{ role: "user", content: "안녕" }, { role: "assistant", content: "네" }, { role: "user", content: "또" }];
  ok(C.buildMessages(short, "long") === short, "대화가 짧으면 그대로", `앞부분 ${"안녕네".length}자`);

  const noCache = [{ role: "user", content: long(3000) }, { role: "assistant", content: "네" }];
  ok(C.buildMessages(noCache, undefined) === noCache, "캐시를 안 쓰는 호출은 그대로");

  // 이미 덩이로 들어온 것 — 섣불리 손대면 깨집니다
  const blocks = [
    { role: "user", content: long(3000) },
    { role: "assistant", content: [{ type: "text", text: "네" }] },
  ];
  ok(C.buildMessages(blocks, "long") === blocks, "이미 덩이로 온 것은 안 건드린다");
}

console.log("\n━━ 걸어야 하는 경우 ━━");
{
  const msgs = [
    { role: "user", content: long(3000) },
    { role: "assistant", content: long(3000) },
    { role: "user", content: "다음 단계 해줘" },
  ];
  const out = C.buildMessages(msgs, "long");

  ok(out !== msgs, "새 배열을 만들었다");
  ok(msgs[2].content === "다음 단계 해줘", "원본은 안 건드렸다  ← 5분으로 다시 부를 때 필요", typeof msgs[2].content);
  ok(out.length === msgs.length, "말 개수 그대로", `${out.length}개`);

  // ⚠️ 제일 중요합니다. 글자가 하나라도 달라지면 AI가 다른 답을 냅니다.
  ok(JSON.stringify(plain(out)) === JSON.stringify(plain(msgs)),
     "대화 내용이 글자 하나까지 같다  ← 제일 중요");

  const lastBlock = out[out.length - 1].content[0];
  ok(!!lastBlock.cache_control, "마지막 말에 캐시 표시가 붙었다");
  ok(lastBlock.cache_control.ttl === "1h", "1시간짜리다", JSON.stringify(lastBlock.cache_control));
  ok(out.slice(0, -1).every((m) => typeof m.content === "string"), "앞엣것들은 글자 그대로 남았다");

  const short5 = C.buildMessages(msgs, "short");
  ok(short5[short5.length - 1].content[0].cache_control.ttl === undefined,
     "5분짜리로 부르면 ttl이 안 붙는다", JSON.stringify(short5[short5.length - 1].content[0].cache_control));
}

console.log("\n━━ 캐시 표시 개수 (많으면 API가 거절합니다) ━━");
{
  // 한 요청에 4개까지만 됩니다. 시스템 1 + 대화 1 = 2개여야 합니다.
  const msgs = [
    { role: "user", content: long(3000) },
    { role: "assistant", content: long(3000) },
    { role: "user", content: "또" },
  ];
  const body = { ...C.buildSystem(long(3000), "long"), messages: C.buildMessages(msgs, "long") };
  const n = (JSON.stringify(body).match(/"cache_control"/g) || []).length;
  ok(n === 2, "표시가 딱 2개 (시스템 1 + 대화 1)", `${n}개`);
}

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
