/**
 * 전자책 한 권 만들기.
 *
 * ⚠️ 재료를 파일에 적어두고 그것만 가지고 씁니다.
 * "AI야 블로그 전자책 써줘"로 만든 책은 아무것도 안 들어 있어서 환불로 돌아옵니다.
 * 아래 MATERIAL은 영상 30편의 자막을 전문으로 읽고, 네이버 발표를 확인하고,
 * 실제로 도구를 만들어 돌려보며 알게 된 것들입니다. 이건 지어낸 게 아닙니다.
 */

require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const ebook = require("../src/ebook");

const MATERIAL = `
[2026년 네이버가 실제로 바꾼 것 — 네이버 공식 발표 기준]

1) 연관검색어 기능을 없앴습니다.
   제목과 본문에 연관어를 긁어모아 채우는 방식이 끝났다는 선언입니다.
   대신 소제목 잡을 때는 구글 연관검색이나 지식인 질문을 참고하면 됩니다.

2) 에이전틱 서치(초개인화 검색).
   사람마다 다른 결과가 보입니다. 모두에게 같은 1등 자리가 없어졌습니다.
   그래서 타겟을 넓게 잡으면 아무에게도 1등이 못 됩니다.
   "30대 여성 화장품"이 아니라 "내일 소개팅 가야 하는 30대 직장인 파운데이션"입니다.
   좁힐수록 손해 같지만 개인화 검색에서는 오히려 그쪽이 1등으로 뜹니다.

3) 퀵백 클릭에 벌점.
   들어왔다가 바로 뒤로가기를 누르면 저품질로 판정합니다.
   체류시간이 전보다 훨씬 중요해졌습니다.

4) AI가 보는 곳은 제목 + 첫 세 줄 + 소제목입니다.
   첫 줄에 "안녕하세요, 오늘 날씨가 좋네요"가 나오면 추천에서 밀립니다.
   독자의 고민을 먼저 던져야 합니다.

5) 홈피드가 이웃 없이도 띄워줍니다.
   관심사 기반이라 신규 블로그가 10년 된 블로그를 이길 수 있습니다.
   네이버 발표로는 홈피드 클릭률의 23%가 썸네일로 결정됩니다.
   글감(뉴스 등)을 붙이면 노출에 도움이 되는데, 주제와 안 맞는 글감을 달면
   오히려 저품질로 떨어집니다.

6) 추천피드가 확대됐습니다.
   대형 블로그 글 아래에 내 글이 노출될 수 있습니다.
   네이버가 카페에서 실험했을 때 다른 글로 넘어가는 클릭이 130% 늘었습니다.
   한 주제를 깊게 파는 블로그를 VIP로 대우합니다.
   → 네이버는 한 주제, 구글은 여러 주제여도 됩니다.

7) AEO(네이버 브리핑) — 검색창 맨 위 AI 요약.
   AI는 글을 통째로 읽지 않고 소제목과 목록만 봅니다.
   "1단계 … 2단계 …"처럼 번호를 매기면 뽑힐 확률이 올라갑니다.
   줄글로만 쓰면 아예 후보에 못 올라갑니다.

8) 신뢰도 우선 검색.
   지원금·의학·금융처럼 중요한 정보는 뉴스와 정부 사이트를 먼저 띄웁니다.
   블로그가 뚫는 방법은 하나 — 직접 해보고 경험으로 쓰는 것입니다.
   "2026 청년지원금 신청방법 총정리"는 정부 사이트에 집니다.
   "직장 다니면서 신청해보고 알게 된 주의사항"은 이깁니다.

[D.I.A. 기준 — 글 하나로 잴 수 있는 것]
· 공백 제외 1,500자 이상 (2,000~2,500자가 안정적)
· 제목에 노리는 키워드 정확히 1회. 두 번 넣으면 손해.
· 본문에 키워드 3~5회. **비율이 아니라 횟수**입니다.
  글이 길어져도 횟수는 그대로입니다. 8회를 넘으면 남용으로 봅니다.
  다만 "전세 계약 주의사항"처럼 긴 키워드는 2~4회가 맞습니다.
  네 어절짜리를 다섯 번 반복하면 글이 안 읽힙니다.
· 원본 이미지 5장 이상
· 소제목 3개 이상
· 표·목록·영상 중 하나
· 문단당 2~4문장 (모바일에서 벽처럼 보이면 이탈합니다)

[행동 키워드 — 이건 노출이 아니라 수익 이야기입니다]
신청·조회·다운로드·예약·발급·환급·지원금·자격·대상·기간처럼
읽고 나서 뭔가를 누를 것 같은 주제가 광고 단가가 몇 배입니다.
"김치찌개 만드는 법"으로는 하루 1달러도 안 나옵니다.
보험·금융 키워드는 클릭 단가가 10~20배까지 차이 납니다.

[숫자로 확인한 현실 — 관련 영상들의 실제 발언]
· 쿠팡파트너스는 매출의 3%입니다. 1,000만원어치 팔면 30만원 남습니다.
  월 300만원을 벌려면 1억을 팔아야 합니다.
· 유튜브 조회수 수익: 560만 조회에 136만원.
· 유튜브 쇼핑 제휴(제품 보기)는 6.7%로 쿠팡의 두 배입니다.
  조건이 구독 1만에서 500명으로 낮아졌습니다.
· 18년차 개발자가 웹사이트 5개를 만들어 애드센스 승인은 1개만 받았고,
  그 사이트의 수익은 월 20달러(약 3만원)였습니다.
  "가치가 별로 없는 콘텐츠"가 거절 사유였습니다.
· 애드센스 강의를 함께 들은 40명 중 남은 사람은 1명이었습니다.

[강의 생태계에 대해 알아야 할 것]
"유료강의 듣지마세요", "무료로 다 공개합니다"라는 제목의 영상 대부분이
전자책 신청이나 무료강의 신청으로 끝납니다. 방법이 가짜라는 뜻은 아닙니다.
대부분 실제로 작동합니다. 다만 그들의 주 수입원은 그 부업이 아니라 강의이고,
화면에 뜨는 금액은 상위 소수의 결과라는 걸 알고 봐야 합니다.
한 시장에 "끝물이다", "폭로한다" 콘텐츠가 쏟아지는 시점은 이미 선점이 끝난 시점입니다.

[따라하면 안 되는 것들 — 여러 강의에서 실제로 가르치는 방법]
· 샤오홍슈나 타오바오에서 남의 영상을 내려받아 워터마크를 잘라내고 올리기.
  "국가 간 법적 이슈가 없어서 안 걸린다"고 하지만 침해는 침해입니다.
  유튜브는 재사용 콘텐츠에 수익 창출을 거부하고, 신고가 쌓이면 채널이 사라집니다.
· 잘된 영상의 자막을 추출해 GPT로 각색하기. 저작권을 우회하려는 시도입니다.
· 겪지 않은 일을 경험담처럼 쓰기. 거짓 후기이고 상품이 끼면 표시광고법 위반입니다.
· 지식인·카페에 링크 뿌리기. 네이버가 어뷰징으로 보고 계정을 막습니다.
· 광고를 사서 애드센스로 트래픽 보내기. 무효 트래픽으로 계정이 영구 정지될 수 있습니다.
  한 번 정지되면 복구가 안 됩니다.

[광고법 — 블로그에서 실제로 문제되는 표현]
· 최고, 1위, 유일한, 100%, 완벽, 무조건 → 근거 없는 최상급·순위 주장
· 완치, 치료 효과, 부작용 없음 → 의약품이 아닌 것에 쓰면 약사법 위반
· 수익 보장, 원금 보장 → 유사수신·부당광고 위험
· 대가성 표기: 협찬이나 제공을 받았으면 반드시 밝혀야 합니다.
  "사장님이 서비스로 주셨어요" 정도는 표기로 인정되지 않습니다.
  쿠팡파트너스는 표기가 없으면 수익을 지급하지 않고 이미 받은 것도 몰수될 수 있습니다.
`.trim();

async function main() {
  const outDir = path.join(__dirname, "..", "public", "downloads");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("목차를 짜는 중…");
  const book = await ebook.outline({
    topic: "2026년 네이버 블로그 상위노출 — 바뀐 로직에 맞춰 다시 쓰는 법",
    audience: "블로그를 하고 있는데 예전 방식이 안 먹히기 시작한 사람",
    material: MATERIAL,
    chapters: 8,
  });

  console.log(`\n『${book.title}』`);
  if (book.subtitle) console.log(`  ${book.subtitle}`);
  if (book.promise) console.log(`  → ${book.promise}`);
  console.log();
  book.chapters.forEach((c, i) => console.log(`  ${i + 1}. ${c.title}`));
  console.log();

  const parts = { intro: "", chapters: [] };

  console.log("머리말…");
  parts.intro = await ebook.writeIntro(book, { material: MATERIAL });
  console.log(`  ${parts.intro.replace(/\s/g, "").length}자`);

  for (let i = 0; i < book.chapters.length; i++) {
    const t0 = Date.now();
    process.stdout.write(`${i + 1}장 「${book.chapters[i].title}」… `);
    try {
      let ch = await ebook.writeChapter(book, i, { material: MATERIAL, words: 1900 });

      // ⚠️ 파는 책입니다. 지어낸 숫자 하나가 들통나면 책 전체가 의심받습니다.
      // 프롬프트로 막아도 뚫려서(첫 판에서 "클릭 단가 50원", "월 80만원"이 나왔습니다)
      // 재료와 대조해 잡아내고 걷어냅니다.
      const suspects = ebook.checkNumbers(ch, MATERIAL);
      let fixed = 0;
      if (suspects.length) {
        const r = await ebook.stripUnsourcedNumbers(ch, suspects, MATERIAL);
        ch = r.text;
        fixed = r.fixed;
      }
      parts.chapters[i] = ch;

      const left = ebook.checkNumbers(ch, MATERIAL);
      console.log(
        `${((Date.now() - t0) / 1000).toFixed(0)}초 · ${ch.replace(/\s/g, "").length}자` +
        (fixed ? ` · 근거없는 숫자 ${fixed}곳 걷어냄` : "") +
        (left.length ? ` · ⚠ 남은 것: ${left.join(", ")}` : "")
      );
    } catch (e) {
      // ⚠️ 한 장이 실패해도 나머지는 살립니다. 통째로 날리면 안 됩니다.
      parts.chapters[i] = "";
      console.log(`실패 — ${e.message}`);
    }
  }

  const html = ebook.toHtml(book, parts);
  const file = path.join(outDir, "네이버-블로그-상위노출-2026.html");
  fs.writeFileSync(file, html, "utf8");
  fs.writeFileSync(path.join(__dirname, "..", "ebook-draft.json"),
    JSON.stringify({ book, parts }, null, 1), "utf8");

  const total = (parts.intro + parts.chapters.join("")).replace(/\s/g, "").length;
  console.log(`\n완성: ${file}`);
  console.log(`총 ${total.toLocaleString()}자 · 원고지 약 ${Math.round(total / 200)}장 · A4 약 ${Math.round(total / 900)}쪽`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
