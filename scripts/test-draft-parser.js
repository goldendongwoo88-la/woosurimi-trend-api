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

console.log("\n━━ 제목이 없는 원고 ━━");
{
  const NOTITLE = `이 글은 제목 표시가 없습니다. 첫 문단이 제목이 되어야 합니다.

두 번째 문단입니다. 여기는 본문이고요.`;
  const r = D.parse(NOTITLE);
  ok(!!r.title, "첫 문단을 제목으로 삼았다", r.title.slice(0, 30));
  ok(r.stats.paras === 1, "제목으로 쓴 문단은 본문에서 빠졌다", `${r.stats.paras}개`);
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
