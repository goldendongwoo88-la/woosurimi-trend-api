/**
 * 홈쇼핑 편성표 수집기 — 2026-09-02
 *
 * 근거: 돈농부 라이브 공식 1 "홈쇼핑을 참고해서 상품 아이디어를 얻어라".
 * 정본: docs/돈농부-김정빈-라이브분석-2026-0901.md §5
 *
 * ── 왜 홈쇼핑인가 ──
 * 홈쇼핑은 **안 팔릴 물건을 편성하지 않습니다.** 한 시간짜리 방송 슬롯에 무엇을 올릴지는
 * MD가 판매 데이터를 놓고 결정합니다. 그래서 편성표는 검색량보다 앞서는 선행지표입니다.
 * 그가 이걸 **눈으로** 하라고 했습니다. 우리는 매일 자동으로 받습니다.
 *
 * ── 어디서 받나 ──
 * GS샵이 브라우저 없이 받을 수 있는 유일한 곳이었습니다(2026-09-02 실측).
 *   GS샵      ✅ tvScheduleDetail.gs — 평범한 GET으로 58편 나옵니다
 *   CJ온스타일 ❌ SPA, 편성 데이터가 HTML에 없음
 *   롯데      ❌ 편성표 URL이 404
 *   현대      ❌ Next.js, 편성 데이터가 __NEXT_DATA__에 없음
 * 한 곳만 되는 건 약점입니다. 그래서 **소스를 배열로 두고** 나중에 붙일 자리를 남깁니다.
 *
 * ⚠️ 구매수량은 못 받습니다.
 * 화면에는 "34,061개 구매"가 뜨는데, 이 숫자는 페이지가 뜬 뒤 외부 JS 번들이 따로 채웁니다.
 * HTML에는 빈 칸(`<dd class="ord-cnt"></dd>`)으로 옵니다. 실제로 얼마나 팔렸는지는
 * 편성 여부보다 훨씬 좋은 신호라서 **찾으면 큰 이득**입니다. 미해결로 적어둡니다.
 * (브라우저를 띄우면 읽을 수 있지만, 매일 도는 수집기가 브라우저를 띄우는 건 과합니다.)
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36";

const 소스 = [
  {
    이름: "GS샵",
    url: (yyyymmdd) => `https://www.gsshop.com/shop/tv/tvScheduleDetail.gs?today=${yyyymmdd}`,
    referer: "https://www.gsshop.com/shop/tv/tvScheduleMain.gs",
    parse: parseGsShop,
  },
];

const ymd = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/** 태그를 걷어내고 공백을 정리합니다. 상품명에 태그가 섞여 들어오면 매칭이 전부 어긋납니다. */
const strip = (s) =>
  String(s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
           .replace(/\s+/g, " ").trim();

function parseGsShop(html) {
  const out = [];
  const blocks = html.split('<article class="items">').slice(1);
  for (const b of blocks) {
    const t = b.match(/<span class="times">\s*([0-2]?\d:[0-5]\d)\s*<\/span>/);
    if (!t) continue;
    const time = t[1];
    /** 한 시간대에 상품이 여러 개 붙습니다(같은 방송에서 색상·용량 나눠 파는 경우). */
    for (const m of b.matchAll(/<dt class="prd-name">([\s\S]*?)<\/dt>([\s\S]*?)(?=<li class="prd-item"|<\/ul>|$)/g)) {
      let name = strip(m[1]).replace(/^\[TV상품\]\s*/, "");
      if (!name) continue;
      const price = (m[2].match(/<strong>\s*([\d,]+)\s*<\/strong>\s*원/) || [])[1];
      const prdId = (m[1].match(/prdid=(\d+)/) || [])[1] || null;
      out.push({
        time, product: name,
        price: price ? Number(price.replace(/,/g, "")) : null,
        prdId,
        상담상품: /상담신청|상담만/.test(name) || /상담신청상품/.test(b),
      });
    }
  }
  return out;
}

/**
 * 하루치 편성표를 받습니다.
 * @param {string} date YYYYMMDD (기본: 오늘)
 */
async function fetchSchedule(date = ymd(), { timeoutMs = 20000 } = {}) {
  const results = [];
  const errors = [];
  for (const s of 소스) {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), timeoutMs);
      const r = await fetch(s.url(date), {
        headers: { "User-Agent": UA, "Accept-Language": "ko-KR", Referer: s.referer },
        signal: c.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const items = s.parse(await r.text());
      if (!items.length) throw new Error("편성 항목 0개 — 사이트 구조가 바뀌었을 수 있습니다");
      results.push({ 소스: s.이름, items });
    } catch (e) {
      errors.push(`${s.이름}: ${e.message}`);
    }
  }
  const items = results.flatMap((r) => r.items.map((x) => ({ ...x, 소스: r.소스 })));
  return {
    date, items,
    소스별: results.map((r) => ({ 소스: r.소스, 편성: r.items.length })),
    errors,
    미해결: ["구매수량(실제 판매량) — 화면에는 뜨지만 HTML에는 안 옵니다"],
  };
}

/**
 * ── 상품명 정규화 ──
 *
 * 홈쇼핑 상품명은 우리 소재로 그대로 못 씁니다. 실측 예:
 *   "[매니아] 쉰내잡는 피지 모락셀라 냄새제거 캡슐세제 20입x7팩,5입x1팩(체험분)"
 * 여기서 우리에게 필요한 건 **"캡슐세제"** 한 낱말입니다.
 * 브랜드·수량·행사문구를 걷어내야 보완재 사전과 매칭이 됩니다.
 * (안 걷어냈더니 실제 편성 58건 중 매칭 0건이었습니다.)
 */
function normalize(name) {
  let t = String(name);
  t = t.replace(/\[[^\]]*\]/g, " ");                       // [매니아] [TV상품] [런칭 가격 …]
  t = t.replace(/\([^)]*\)/g, " ");                         // (체험분) (총16봉) (6개월분)
  t = t.replace(/\d+[가-힣a-zA-Z]{0,3}\s?[xX×]\s?\d+[가-힣a-zA-Z]{0,3}/g, " "); // 20입x7팩
  t = t.replace(/\d+[,.\d]*\s?(원|개월분?|박스|팩|입|봉|종|매|병|캔|호|주|kg|g|ml|L|리터|세트|구)/g, " ");
  t = t.replace(/(26|25)?[FSAW]{2}/g, " ");             // 26FW 같은 시즌 표기
  t = t.replace(/[+·,]/g, " ").replace(/\s+/g, " ").trim();
  return t;
}

/**
 * 정규화한 이름에서 **우리가 다룰 카테고리 낱말**을 뽑습니다.
 * 사전에 걸리면 그 낱말, 아니면 마지막 명사 두 어절을 씁니다.
 */
const 품목사전 = [
  [/세제|세탁세제|캡슐세제/, "세탁세제"], [/섬유유연|유연제/, "섬유유연제"],
  [/콜라겐|구미/, "콜라겐"], [/유산균|프로바이오/, "유산균"], [/오메가|루테인|코엔자임|코큐텐|종자유|영양제/, "영양제"],
  [/워킹화|운동화|스니커즈|슬리퍼|구두/, "신발"], [/셔츠|블라우스|니트|가디건|티셔츠/, "상의"],
  [/데님|팬츠|바지|스커트|치노/, "하의"], [/패딩|코트|자켓|재킷/, "아우터"],
  [/이불|베개|매트리스|토퍼|침구/, "침구"], [/프라이팬|냄비|밀폐용기|도마|칼세트/, "주방용품"],
  [/쭈꾸미|갈비|만두|국|탕|반찬|김치|고기|생선/, "간편식"],
  [/크림|세럼|앰플|토너|클렌징|마스크팩/, "스킨케어"],
  [/청소기|건조기|세탁기|에어컨|공기청정|냉장고|TV|노트북/, "가전"],
];
function 품목(name) {
  const t = normalize(name);
  for (const [re, k] of 품목사전) if (re.test(t)) return k;
  const w = t.split(" ").filter(Boolean);
  return w.slice(-2).join(" ") || t;
}

/**
 * 편성표 → 우리가 만들 소재.
 *
 * **본품을 그대로 하지 않습니다.** 홈쇼핑이 파는 건 브랜드 본품이고 우리가 이길 자리가 아닙니다.
 * 라이브의 "한 발자국 더" — 본품에서 보완재로 옮깁니다.
 * 보완재가 없는 품목은 본품 그대로 후보에 남기되 표시해 둡니다.
 */
function toCandidates(items, SIG, { top = 10, month = null } = {}) {
  const 제외 = /보험|상담|렌탈|여행|상품권|카드|적금|공기청정기\s?렌/;
  const seen = new Set();
  const rows = [];
  for (const it of items) {
    if (it.상담상품 || 제외.test(it.product)) continue;
    const 정규 = 품목(it.product);                       // "…캡슐세제 20입x7팩…" → "세탁세제"
    const comp = SIG.complements(정규);
    const 후보들 = comp.보완재.length ? comp.보완재.map((c) => ({ 제품: c, 유형: "보완재" }))
                                     : [{ 제품: 정규, 유형: "본품(보완재 미등록)" }];
    for (const c of 후보들) {
      if (seen.has(c.제품)) continue;
      seen.add(c.제품);
      const bp = SIG.buyingPower(c.제품, { price: it.price || 0, month });
      rows.push({ ...c, 원본: it.product, 품목: 정규, 방송시간: it.time, 본품가: it.price,
                  구매력: bp.mult, 등급: bp.등급 });
    }
  }
  return rows.sort((a, b) => b.구매력 - a.구매력).slice(0, top);
}

module.exports = { fetchSchedule, toCandidates, parseGsShop, normalize, 품목, ymd, 소스 };
