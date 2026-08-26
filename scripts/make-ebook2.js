/**
 * 두 번째 전자책 — AI 부업의 현실.
 *
 * ⚠️ 이 책의 재료는 다른 데서 못 구합니다. 영상 250편의 제목을 분류하고,
 * 그중 30편의 자막을 전문으로 읽고, 그 안에서 실제로 나온 숫자를 뽑아냈습니다.
 * 시중에 이런 책이 없는 이유는 간단합니다 — 강의를 파는 사람이 쓸 수 없는 내용이거든요.
 *
 * ⚠️ 그래서 이 책은 "이렇게 하면 돈 법니다"가 아니라
 * "이건 이만큼 벌리고 이건 안 벌립니다"입니다. 팔리는 방향은 반대지만,
 * 한 번 산 사람이 다음 것도 사게 만드는 건 이쪽입니다.
 */

require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const ebook = require("../src/ebook");

const MATERIAL = `
[분석한 것]
AI 부업·수익화 관련 유튜브 영상 250여 개의 제목과 분류, 그중 30편의 자막 전문.
2026년 8월 기준.

[주제별 분포 — 무엇이 붐비는가]
· 쇼핑쇼츠·쇼핑커넥트·쿠팡파트너스 계열: 50편 이상 (압도적 1위)
· 블로그(네이버 홈판·애드센스): 30여 편
· 클로드 자동화: 30여 편
· AI 영상·쇼츠(연예인·동물·시니어·해외): 30여 편
· 스레드·인스타: 25여 편
· AI 음악 플레이리스트: 6편
· 당근마켓·위탁판매: 10여 편
· 전자책·지식창업: 10여 편

[목록 스스로가 남긴 신호]
같은 목록 안에 이런 제목이 섞여 있었습니다.
"쇼핑쇼츠는 끝물이니 하지마세요", "97%가 모르는 쇼핑쇼츠의 진짜 현실을 까발립니다",
"사기꾼 강의팔이 지겨워서 폭로합니다", "AI로 돈 번다는 광고의 진실".
한 시장에 폭로·현실 콘텐츠가 쏟아지는 시점은 이미 선점이 끝난 시점입니다.

[강의 생태계의 구조]
30편 중 27편이 전자책 신청이나 무료강의 신청으로 끝났습니다.
"댓글에 신청합니다라고 남겨주세요"가 거의 모든 영상에 나옵니다.
"유료강의 듣지마세요"라는 제목의 1시간짜리 영상조차, 실제로는
개발비 1억 3천을 들였다는 자기 프로그램을 파는 강의였습니다.
방법이 가짜라는 뜻이 아닙니다. 대부분 실제로 작동합니다.
다만 그들의 주 수입원은 그 부업이 아니라 강의이고,
화면에 뜨는 금액은 상위 소수의 결과입니다.

[영상 안에서 실제로 나온 숫자]
· 쇼핑쇼츠 2년 10억 했다는 사람: 앞치마를 1,000만원어치 팔고 남은 게 30만원.
  쿠팡파트너스가 매출의 3%라서. 월 300만원을 벌려면 1억을 팔아야 함.
  본인 말로 "시작하고 두 달 만에 1억을 팔 수 있을까요? 완전 비현실적입니다."
· 유튜브 조회수 수익: 560만 조회에 136만원. 조회당 0.24원.
· 유튜브 쇼핑 제휴(제품 보기): 6.7%. 쿠팡의 두 배.
  조건이 구독 1만에서 500명으로 낮아짐.
· 4개월 4억 매출 냈다는 사람: 영상 대부분이 10만 조회.
  "100만 조회 나와도 조회수 수익은 몇십만 원. 조회수 수익을 바라지 마세요."
  댓글 150~200개 이상인 영상을 벤치마킹하라고 함. 댓글이 곧 구매 문의라서.
· 위탁·사입으로 넘어가면 마진 50%. 원가 2,300원짜리를 14,900원에 판매.
  다만 재고와 CS를 떠안게 됨.
· 18년차 개발자: 웹사이트 5개를 만들어 애드센스 승인은 1개만.
  나머지 4개는 "가치가 별로 없는 콘텐츠"로 거절.
  승인된 1개의 수익은 최근 30일 20달러(약 3만원).
  구글 유입이 거의 없고 네이버 유입만으로 그만큼.
· 사주 PDF 판매: 190쪽을 49,900원에. 원가 3,000원. 마진 90%.
  주문이 오면 AI로 만들어 메일로 보내는 게 전부.
· 스레드 쇼핑: 사진 한 장과 글 몇 줄. 편집·구독자·자본금 모두 불필요.
  쿠팡은 24시간 안에 산 모든 물건에 수수료가 붙음.
· 애드센스 블로그로 7억 정산받은 사람: 같은 강의를 들은 40명 중 남은 사람이 1명.

[여러 강의가 공통으로 가르치는데 따라하면 안 되는 것]
· 샤오홍슈·타오바오에서 남의 영상을 내려받아 워터마크를 잘라내고 올리기.
  한 명은 대놓고 "저작권 이슈가 없다고 하면 아니지만, 아직 국가 간 법적 이슈가
  없어서 따다 쓰셔도 걸리는 게 없습니다"라고 말함.
  유튜브는 재사용 콘텐츠에 수익 창출을 거부하고, 신고가 쌓이면 채널이 사라짐.
· 잘된 영상의 자막을 추출해 GPT로 각색하기. 본인들도 "그대로 쓰면 저작권 문제가
  되겠죠, 그래서 GPT로 바꿔볼게요"라고 인지하면서 함.
· 겪지 않은 일을 경험담처럼 쓰기. 한 강사는 "내가 경험하지 않았지만 누구보다
  경험한 것처럼 만들어낼 수 있잖아요"라고 가르침. 거짓 후기이고
  상품이 끼면 표시광고법 위반.
· 지식인·카페에 링크 뿌리기. 네이버가 어뷰징으로 보고 계정을 막음.
· 광고를 사서 애드센스로 트래픽 보내기. 카카오 광고비 7,500만원으로
  4억 2천을 벌었다는 방법. 애드센스는 이런 유입을 무효 트래픽으로 보고
  계정을 영구 정지시킬 수 있음. 한 번 정지되면 복구가 안 됨.

[30편을 다 읽고 남은 한 문장]
"트래픽 → 유입 → 전환. 이게 끝입니다."
조회수로 돈을 벌면 조회수 1당 1원이지만, 내 상품을 붙이면 조회수 1당 1,000원이 됩니다.
같은 사람의 말: "무료 콘텐츠만 보던 사람은 플랫폼이 휘청이면 그대로 사라집니다.
한 번이라도 결제한 사람은 찾아옵니다."
장사의 신 사례 — 조회수 수익만 얻었으면 연 10~20억이었을 텐데
자기 밀키트를 붙여서 월매출 100억이 됨. 같은 조회수인데 붙인 상품이 달랐던 것.

[2026년 네이버가 바꾼 것]
· 연관검색어 기능 삭제. 키워드 도배가 끝남.
· 에이전틱 서치(초개인화). 사람마다 다른 결과. 모두에게 같은 1등이 없음.
· 퀵백 클릭(들어왔다 바로 나감)에 벌점. 체류시간이 중요해짐.
· 홈피드가 이웃 없이도 띄워줌. 신규 블로그가 오래된 블로그를 이길 수 있음.
  네이버 발표로 홈피드 클릭률의 23%가 썸네일로 결정됨.
· 추천피드 확대. 카페 실험에서 다른 글로 넘어가는 클릭이 130% 늘었음.
· AEO(AI 브리핑). AI가 소제목과 목록만 봄. 줄글은 후보에도 못 오름.
· 신뢰도 우선. 지원금·의학은 뉴스와 정부가 먼저. 블로그는 경험담으로만 뚫림.

[D.I.A. 기준]
1,500자 이상, 제목에 키워드 1회, 본문에 3~5회(비율 아니라 횟수),
이미지 5장, 소제목 3개, 표·목록 중 하나, 문단당 2~4문장.

[행동 키워드]
신청·조회·다운로드·예약·발급·환급·지원금처럼 읽고 나서 누를 것 같은 주제가
광고 단가가 몇 배. 보험·금융은 10~20배까지.
`.trim();

async function main() {
  const outDir = path.join(__dirname, "..", "public", "downloads");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("목차를 짜는 중…");
  const book = await ebook.outline({
    topic: "AI 부업 영상 250개를 분석해봤습니다 — 실제 숫자로 본 현실",
    audience: "AI로 돈 벌어보려고 영상을 잔뜩 봤는데 뭘 먼저 해야 할지 모르겠는 사람",
    material: MATERIAL,
    chapters: 7,
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
      const suspects = ebook.checkNumbers(ch, MATERIAL);
      let fixed = 0;
      if (suspects.length) {
        const r = await ebook.stripUnsourcedNumbers(ch, suspects, MATERIAL);
        ch = r.text; fixed = r.fixed;
      }
      parts.chapters[i] = ch;
      const left = ebook.checkNumbers(ch, MATERIAL);
      console.log(
        `${((Date.now() - t0) / 1000).toFixed(0)}초 · ${ch.replace(/\s/g, "").length}자` +
        (fixed ? ` · 근거없는 숫자 ${fixed}곳 걷어냄` : "") +
        (left.length ? ` · ⚠ 남은 것: ${left.join(", ")}` : "")
      );
    } catch (e) {
      parts.chapters[i] = "";
      console.log(`실패 — ${e.message}`);
    }
  }

  const html = ebook.toHtml(book, parts);
  const file = path.join(outDir, "AI부업-250개-분석.html");
  fs.writeFileSync(file, html, "utf8");
  fs.writeFileSync(path.join(__dirname, "..", "ebook2-draft.json"),
    JSON.stringify({ book, parts }, null, 1), "utf8");

  const total = (parts.intro + parts.chapters.join("")).replace(/\s/g, "").length;
  console.log(`\n완성: ${file}`);
  console.log(`총 ${total.toLocaleString()}자 · A4 약 ${Math.round(total / 900)}쪽`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
