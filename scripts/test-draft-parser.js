/**
 * 클로드 원고 뜯어내기 시험.
 *
 * ⚠️ 제일 중요한 것: **제목 45개가 본문에 안 들어가야** 합니다.
 * 클로드 스킬은 7단계를 밟아서 제목 목록·팩트체크·이미지 프롬프트가 함께 나옵니다.
 * 그걸 통째로 편집기에 넣으면 글이 아니라 작업 기록이 올라갑니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "extension", "content", "draft-parser.js");
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8"), ctx);
const D = ctx.window.__wsDraft;

let pass = 0, fail = 0;
const ok = (c, l, e = "") => { console.log(`  ${c ? "✓" : "✗"} ${l}${e ? "  " + e : ""}`); c ? pass++ : fail++; };

// ── 실제 클로드 원고 모양 (7단계 출력이 섞인 것) ──
const FULL = `# 1단계 — 제목 45개

1. 째피 핑크라인 소프트 리셋 바디워시 2주 후기
2. "바디워시만 바꿨는데…" 째피 핑크라인 2주 쓰고 느낀 점
3. 째피 핑크라인 바디케어 세트 솔직 후기
4. 2주 써보니 알겠더라, 째피 핑크라인 실사용 후기
5. 째피 소프트 리셋 바디워시 직접 써본 솔직 후기
6. "향이 이렇게 오래 가?" 째피 핑크라인 2주 사용 후기
7. 째피 핑크라인 바디워시+로션 세트 30대 남자 후기

## 3단계 — 소제목

1. 패키지 첫인상
2. 2주 써본 결과

### 4단계: 본문 작성

# "당김이 없어졌어요" 째피 핑크라인 바디워시 2주 솔직 후기

요즘 환절기 지나가면서 샤워하고 나면 피부가 당기는 느낌이 심해졌습니다.

세정력 세다는 바디워시들은 오히려 뒤가 더 당기더라고요.

[사진 1: 째피 핑크라인 패키지 첫인상 - 두 제품 함께]

■ 패키지 첫인상, 그리고 왜 이 제품을 쓰게 됐는지

핑크색 바디에 노란 펌프, 레트로한 번개 로고까지.

욕실에 그냥 올려만 놔도 예쁜 오브제 같은 디자인입니다.

[사진 2: 손에 든 소프트 리셋 - 정면]

■ 2주 써본 결과

가격은 두 개 세트로 **29,800원**이었고 용량은 각각 **300ml**입니다.

> 다른 바디워시와 달리 씻고 난 뒤 10분이 지나도 당김이 없었어요.

저는 **재구매 의사 있습니다**.

### 5단계: 팩트체크

- 가격 29,800원 — 공식몰 확인 필요 ✏️
- 용량 300ml — 확인됨

### 6단계: 이미지 프롬프트

A photorealistic product shot of pink body wash bottle...
`;

console.log("\n━━ 7단계 출력에서 본문만 골라내는가 ━━");
{
  const r = D.parse(FULL);
  console.log(`    제목: ${r.title}`);
  console.log(`    덩어리: 소제목 ${r.stats.subheads} · 인용구 ${r.stats.quotes} · 사진 ${r.stats.photos} · 문단 ${r.stats.paras}`);

  const all = r.blocks.map((b) => b.text || "").join(" ");
  ok(!/제목 45개|1단계/.test(all), "1단계 제목 목록이 안 들어갔다");
  ok(!/팩트체크|공식몰 확인 필요/.test(all), "5단계 팩트체크가 안 들어갔다");
  ok(!/photorealistic|product shot/i.test(all), "6단계 이미지 프롬프트가 안 들어갔다");
  ok(!/째피 핑크라인 바디케어 세트 솔직 후기/.test(all), "제목 후보들이 본문에 안 섞였다");

  ok(r.title === '"당김이 없어졌어요" 째피 핑크라인 바디워시 2주 솔직 후기',
    "본문의 제목을 골랐다 (1단계 제목이 아니라)", r.title);
  ok(r.stats.subheads === 2, "소제목 2개", `${r.stats.subheads}개`);
  ok(r.stats.quotes === 1, "인용구 1개", `${r.stats.quotes}개`);
  ok(r.stats.photos === 2, "사진 자리 2곳", `${r.stats.photos}곳`);
  ok(r.stats.marks === 3, "굵게 표시 3개를 찾았다", `${r.stats.marks}개`);
}

console.log("\n━━ 마크다운 표시가 글자로 안 들어가는가 ━━");
{
  const r = D.parse(FULL);
  const all = r.blocks.map((b) => b.text || "").join(" ");
  ok(!all.includes("**"), "**가 글자로 안 남았다");
  ok(!all.includes("■"), "■가 글자로 안 남았다");
  ok(!/^>/.test(all), ">가 글자로 안 남았다");
  const q = r.blocks.find((b) => b.kind === "quote");
  ok(q && q.text.startsWith("다른 바디워시와 달리"), "인용구 글자가 온전하다", q && q.text.slice(0, 24));
  const marked = r.blocks.find((b) => b.marks && b.marks.length);
  ok(marked && marked.text.includes("29,800원"), "굵게였던 글자는 본문에 그대로 남았다");
}

console.log("\n━━ 단계 표시가 없는 원고 ━━");
{
  const SIMPLE = `# 그냥 제목

첫 문단입니다.

■ 소제목 하나

두 번째 문단입니다.

[사진 1: 무엇]

세 번째 문단.`;
  const r = D.parse(SIMPLE);
  ok(r.title === "그냥 제목", "제목을 찾았다", r.title);
  ok(r.stats.subheads === 1 && r.stats.photos === 1 && r.stats.paras === 3,
    "소제목 1 · 사진 1 · 문단 3", `${r.stats.subheads}/${r.stats.photos}/${r.stats.paras}`);
}

console.log("\n━━ '본문'으로 시작하는 문장을 표시로 착각하지 않는가 ━━");
// ⚠️ 실제로 사고가 났습니다. 표시 규칙이 줄 끝을 안 묶어놔서
// "본문으로 시작하는 아무 문장"이나 단계 표시로 봤습니다.
// 그 앞의 글이 **말없이 사라졌습니다.** 조용히 없어지는 게 제일 나쁩니다.
{
  const TRAP = `# 가을 코트 고르기

첫 문장입니다. 이게 사라지면 안 됩니다.

본문입니다. 이 줄 때문에 앞이 다 날아갔었습니다.

마지막 문장입니다.`;
  const r = D.parse(TRAP);
  const text = r.blocks.filter((b) => b.kind === "text").map((b) => b.text).join(" ");
  ok(r.title === "가을 코트 고르기", "제목은 그대로", r.title);
  ok(text.includes("첫 문장입니다"), "'본문…' 앞의 글이 안 사라진다  ← 여기가 핵심");
  ok(text.includes("본문입니다"), "'본문입니다'도 본문으로 남는다");
  ok(text.includes("마지막 문장입니다"), "뒤의 글도 남는다");
  ok(r.stats.paras === 3, "문단 3개 다 있다", `${r.stats.paras}개`);
}
{
  // 끝 표시도 같은 문제였습니다 — "썸네일"로 시작하는 문장에서 본문을 끊었습니다.
  const TRAP2 = `4단계: 본문 작성

코트를 샀습니다.

썸네일은 밝은 사진으로 골랐어요.

그리고 잘 입고 있습니다.`;
  const r = D.parse(TRAP2);
  const text = r.blocks.filter((b) => b.kind === "text").map((b) => b.text).join(" ");
  ok(text.includes("썸네일은 밝은"), "'썸네일…' 문장에서 안 끊는다");
  ok(text.includes("그리고 잘 입고"), "그 뒤의 글도 남는다");
}
{
  // 진짜 표시는 여전히 잘라야 합니다 — 고치다가 반대로 망가지면 안 됩니다.
  const REAL = `1단계: 제목 뽑기

1. 제목 하나
2. 제목 둘
3. 제목 셋
4. 제목 넷
5. 제목 다섯
6. 제목 여섯

4단계: 본문 작성

진짜 본문입니다.

5단계: 팩트체크

이건 본문이 아닙니다.`;
  const r = D.parse(REAL);
  const text = r.blocks.filter((b) => b.kind === "text").map((b) => b.text).join(" ");
  ok(text.includes("진짜 본문입니다"), "진짜 본문은 가져온다");
  ok(!text.includes("제목 하나"), "1단계 제목 목록은 안 들어온다");
  ok(!text.includes("이건 본문이 아닙니다"), "5단계 뒤는 안 들어온다");
}

console.log("\n━━ 제목 표시가 없을 때 ━━");
// ⚠️ 여기서 실제로 사고가 났습니다. 흉내 편집기에서 잡았습니다.
//
// 예전 규칙은 "8~60자짜리 글 문단 아무거나" 집어서 제목으로 썼습니다.
// 그래서 본문 첫 문장이 **제목 칸으로 옮겨가고 본문에서 사라졌습니다.**
// 사장님이 이미 써두신 제목까지 덮어썼습니다.
// 글 한 줄이 없어지는 것도, 제목이 바뀌는 것도 눈치채기 어렵습니다.
//
// 이제는 **첫 줄이 제목처럼 생겼을 때만** 가져갑니다.
{
  // 1) 제목처럼 생긴 첫 줄 — 마침표가 없고 짧습니다
  const LOOKS_LIKE = `김고은 가을 코트 3가지

택배 상자를 열자마자 색이 눈에 들어왔습니다.

베이지가 생각보다 밝았어요.`;
  const a = D.parse(LOOKS_LIKE);
  ok(a.title === "김고은 가을 코트 3가지", "제목처럼 생긴 첫 줄은 제목으로", a.title);
  ok(a.stats.paras === 2, "그 줄은 본문에서 빠진다", `${a.stats.paras}개`);

  // 2) 그냥 문장 — 마침표로 끝납니다. 가져가면 안 됩니다.
  const PROSE = `택배 상자를 열자마자 색이 눈에 들어왔습니다.

베이지가 생각보다 밝았어요.`;
  const b = D.parse(PROSE);
  ok(b.title === "", "마침표로 끝나는 문장은 제목으로 안 가져간다", `"${b.title}"`);
  ok(b.stats.paras === 2, "본문 두 줄이 그대로 남는다  ← 글이 사라지면 안 됩니다", `${b.stats.paras}개`);

  // 3) 중간 문장은 절대 제목이 아닙니다
  const MIDDLE = `■ 첫인상

짧은말

두 번째 문단입니다.`;
  const c = D.parse(MIDDLE);
  ok(c.title === "", "소제목으로 시작하면 제목을 안 만든다", `"${c.title}"`);
  ok(c.stats.subheads === 1 && c.stats.paras === 2, "소제목 1 · 문단 2 그대로", `${c.stats.subheads}/${c.stats.paras}`);
}

console.log("\n━━ 번호 목록이 진짜 본문일 때 (버리면 안 됨) ━━");
{
  const SHORT_LIST = `# 제목

이렇게 정리했습니다.

1. 첫째 이유
2. 둘째 이유
3. 셋째 이유

그래서 이런 결론입니다.`;
  const r = D.parse(SHORT_LIST);
  const all = r.blocks.map((b) => b.text).join(" ");
  ok(/첫째 이유/.test(all) && /셋째 이유/.test(all),
    "3개짜리 목록은 본문으로 남겼다 (5개 미만)", `문단 ${r.stats.paras}개`);
}

console.log(`\n  통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
