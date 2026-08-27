/**
 * 플레이스 순위 + 보고서 — 네트워크 없이 지켜야 할 것들을 확인합니다.
 *
 * ⚠️ 순위 자체는 네이버를 두드려야 나오므로 여기서 안 잽니다 (그건
 * scripts/place-rank.js 로 실측). 여기서는 **거짓말을 막는 장치**만 봅니다:
 *   - 광고를 순위에 섞지 않는가 (구조상 분리돼 있는가)
 *   - 데모 보고서에 "가상"이 박히는가
 *   - 50위 밖을 "50위 밖"이라고 쓰는가 (없는 순위를 지어내지 않는가)
 */
const assert = (c, label) => { console.log(`  ${c ? "✓" : "✗"} ${label}`); if (!c) fails++; };
let fails = 0;

const { normName, num, cutJson } = require("../src/placeRank");
const clientReport = require("../src/clientReport");

console.log("\n━━ 이름·숫자 다루기 ━━");
assert(normName("심가네칼국수 강남역본점") === normName("심가네칼국수강남역본점"), "공백 차이에 안 흔들린다");
assert(num("1,195") === 1195, '"1,195" → 1195');
assert(num("3,000+") === 3000, '"3,000+" → 3000 (원문은 saveCountRaw 로 따로 보관)');
assert(num(null) === null, "없으면 null — 0으로 지어내지 않는다");

console.log("\n━━ JSON 잘라내기 ━━");
// 문자열 안에 중괄호·이스케이프가 있어도 균형이 안 깨져야 합니다 (실제로 겪은 실패).
const tricky = 'window.__APOLLO_STATE__ = {"a":"중괄호 } 포함 \\" 문자열","b":{"c":1}};</script>';
const cut = cutJson(tricky, tricky.indexOf("{"));
assert(JSON.parse(cut).b.c === 1, "문자열 속 중괄호를 무시하고 정확히 자른다");

console.log("\n━━ 데모 보고서 ━━");
const demo = clientReport.demoData();
const html = clientReport.render({ data: demo, createdAt: Date.now() });
assert(html.includes("가상 예시 보고서"), "데모에는 '가상'이 화면에 박힌다");
assert(html.includes("지도(플레이스) 검색 순위"), "플레이스 절이 들어간다");
assert(html.includes("50위 밖"), "순위 밖은 '50위 밖'이라고 쓴다");
assert(html.includes("광고 제외"), "광고 제외 기준을 화면에 밝힌다");
assert(html.includes("위치 미지정"), "위치 미지정 한계를 화면에 밝힌다");
assert((html.match(/<section>/g) || []).length >= 3, "절이 3개 이상 (플레이스·방문자·글)");

console.log("\n━━ 플레이스 없이도 보고서가 나오는가 ━━");
// 블로그만 맡긴 고객도 있습니다. place 가 null 이면 그 절만 빠져야 합니다.
const noPlace = { ...demo, place: null };
const html2 = clientReport.render({ data: noPlace, createdAt: Date.now() });
assert(!html2.includes("지도(플레이스) 검색 순위"), "place 없으면 절이 통째로 빠진다");
assert(html2.includes("일별 방문자"), "나머지 절은 그대로 나온다");

console.log(fails ? `\n실패 ${fails}건` : "\n전부 통과");
process.exit(fails ? 1 : 0);
