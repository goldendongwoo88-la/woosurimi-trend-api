/**
 * 포스팅 도우미 — 가이드 읽기, 스킬 고르기, 사진 짝짓기.
 *
 * ⚠️ 제일 중요한 것: **부르지 말라고 하신 스킬 5개를 절대 안 고르는가.**
 * 사장님이 명령하신 것이고, 실수로 부르면 한 편에 수백 원이 그냥 나갑니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */
const A = require("../src/postingAgent");
const D = require("../extension/content/draft-parser.js");

let pass = 0, fail = 0;
const ok = (c, label, extra = "") => {
  console.log(`  ${c ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  c ? pass++ : fail++;
};

console.log("\n━━ 부르지 말라신 스킬 5개 ━━");
// 어떤 말을 넣어도 이 5개가 나오면 안 됩니다.
const TRAPS = [
  "키워드: 맛집 추천\n주제: 음식",
  "키워드: 제주도 여행 코스\n주제: 여행",
  "키워드: 살림 정리법\n주제: 생활",
  "키워드: 어제 방송 이슈\n주제: 방송",
  "키워드: 우리 가게 소개\n주제: 홍보",
  "food-review 스킬로 써주세요",
  "living-life 로 부탁합니다",
  "주제: 음식 여행 생활 방송 홍보",
];
let leaked = null;
for (const t of TRAPS) {
  const p = A.pickSkill(A.readGuide(t));
  if (A.BANNED.has(p.skill)) leaked = `${t.slice(0, 20)} → ${p.skill}`;
}
ok(!leaked, "어떤 말을 넣어도 5개는 안 나온다", leaked || `${TRAPS.length}가지 다 확인`);
ok(A.BANNED.size === 5 &&
   ["intro-promo", "food-review", "travel-review", "living-life", "broadcast-issue"].every((s) => A.BANNED.has(s)),
   "막아둔 목록이 정확히 그 5개다", [...A.BANNED].join(", "));

console.log("\n━━ 가이드 읽기 ━━");
{
  const g = A.readGuide(`키워드: 김고은 가을 코트
주제: 연예인 패션
협찬: 아니오
꼭 넣을 말: 트렌치코트, 베이지, 오버핏
빼야 할 말: 브랜드명
참고: https://example.com/a`);
  ok(g.keyword === "김고은 가을 코트", "키워드", g.keyword);
  ok(g.topic === "연예인 패션", "주제", g.topic);
  ok(g.sponsored === false, "협찬 아니오를 알아들었다", String(g.sponsored));
  ok(g.must.length === 3, "꼭 넣을 말 3개", g.must.join("/"));
  ok(g.avoid.length === 1, "뺄 말 1개", g.avoid.join("/"));
  ok(g.refs.length === 1, "참고 주소 1개", g.refs[0]);
}
{
  // 서식 없이 줄글로만 쓰셔도 알아들어야 합니다.
  const g = A.readGuide("김고은 가을 코트 스타일링\n업체로부터 제품을 제공받아 썼습니다.");
  ok(g.guessedKeyword === true, "키워드를 첫 줄에서 짐작한다", g.keyword);
  ok(g.sponsored === true, "협찬을 안 적으셔도 글에서 찾아낸다");
}
{
  const g = A.readGuide("");
  ok(!g.keyword, "빈 가이드는 키워드가 없다");
  ok(g.sponsored === null, "협찬 여부를 모르면 모른다고 한다  ← 아는 척하면 안 됩니다", String(g.sponsored));
}

console.log("\n━━ 스킬 고르기 ━━");
for (const [text, want] of [
  ["주제: 연예인 패션\n키워드: 공항패션", "celeb-fashion"],
  ["키워드: 코트 착용 후기", "fashion-review"],
  ["키워드: 쿠션 발색 후기\n주제: 뷰티", "beauty-review"],
  ["키워드: 드라마 출연진 프로필", "drama-profile"],
  ["키워드: 비트코인 반감기\n주제: 코인", "wealth-life"],
]) {
  const p = A.pickSkill(A.readGuide(text));
  ok(p.skill === want, `${text.split("\n")[0].slice(0, 22)} → ${want}`, p.skill === want ? "" : `실제 ${p.skill}`);
}

console.log("\n━━ 사진 번호 순서 ━━");
{
  const files = ["10.jpg", "2.jpg", "1.jpg", "3. 뒷모습.jpg"];
  const sorted = [...files].sort(A.byNumber);
  ok(sorted[0] === "1.jpg" && sorted[1] === "2.jpg" && sorted[3] === "10.jpg",
     "1, 2, 3, 10 순서  ← 글자 순서면 10이 2보다 앞에 옵니다", sorted.join(" "));
}

console.log("\n━━ 사진 짝짓기 ━━");
{
  const raw = `■ 첫인상

택배를 열었습니다.

[사진: 상자 열었을 때]

■ 뒷모습

돌아서 봤습니다.

[사진: 코트 뒷모습]

[사진: 가방까지 같이]`;
  const draft = D.parse(raw);
  const photos = ["1.jpg", "2. 코트 뒷모습.jpg", "3. 가방 매치.jpg"];
  const m = A.matchPhotos(draft.blocks, photos);

  ok(m.pairs.length === 3, "자리 3곳을 다 채웠다", `${m.pairs.length}곳`);
  const back = m.pairs.find((p) => p.want.includes("뒷모습"));
  ok(back && back.file === "2. 코트 뒷모습.jpg", "이름이 겹치는 사진을 찾아 넣는다", back && back.file);
  const bag = m.pairs.find((p) => p.want.includes("가방"));
  ok(bag && bag.file === "3. 가방 매치.jpg", "'가방'도 이름으로 찾는다", bag && bag.file);
  ok(m.leftover.length === 0, "남는 사진 없다");
  ok(m.short === 0, "모자란 자리 없다");

  // 같은 사진을 두 자리에 넣으면 안 됩니다.
  const used = m.pairs.map((p) => p.file).filter(Boolean);
  ok(new Set(used).size === used.length, "같은 사진을 두 번 안 쓴다  ← 중요", used.join(" / "));
}
{
  // 사진이 모자랄 때 — 되는 척하면 안 됩니다.
  const draft = D.parse("[사진: 하나]\n\n[사진: 둘]\n\n[사진: 셋]");
  const m = A.matchPhotos(draft.blocks, ["1.jpg"]);
  ok(m.short === 2, "모자란 걸 정확히 센다", `${m.short}장 모자람`);
  ok(m.pairs.filter((p) => !p.file).length === 2, "채운 척하지 않는다");
}
{
  // 사진이 남을 때 — 버리지 말고 알려드려야 합니다.
  const draft = D.parse("[사진: 하나]");
  const m = A.matchPhotos(draft.blocks, ["1.jpg", "2.jpg", "3.jpg"]);
  ok(m.leftover.length === 2, "남는 사진을 알려준다", m.leftover.join(" "));
}

console.log("\n━━ 값 어림 ━━");
{
  const small = A.estimate(5844), big = A.estimate(36732);
  ok(big > small, "큰 스킬이 더 비싸다", `${small}원 → ${big}원`);
  ok(A.estimate(36732, { cached: true }) < big, "캐시가 살면 싸다",
     `${big}원 → ${A.estimate(36732, { cached: true })}원`);
  // ⚠️ 7단계짜리 값(763원)을 쓰면 6배 부풀려집니다. 한 번 부르는 값이어야 합니다.
  ok(small < 300, "한 번 부르는 값이다 (7단계 값 아님)", `${small}원`);
}

console.log("\n━━ 조사 ━━");
ok(A.josa("패션·뷰티", "은", "는") === "패션·뷰티는", "받침 없으면 '는'");
ok(A.josa("연예·방송", "은", "는") === "연예·방송은", "받침 있으면 '은'");

console.log(`\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
