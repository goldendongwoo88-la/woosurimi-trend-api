/**
 * 내 글이 어느 갈래인지 — "함께 보면 좋은 글"에 **같은 갈래**를 붙이려고 씁니다.
 *
 * ⚠️ topicFit.js 로는 부족합니다. 그건 네이버 주제(패션·미용 / 스타·연예인 / 방송…)
 * 기준이라 **"연예인 뷰티"와 "연예인 패션"을 못 가릅니다.** 둘 다 연예인이고,
 * 하나는 화장이고 하나는 옷인데 같은 칸에 들어갑니다.
 *
 * 사장님이 나누고 싶어 하신 갈래는 이렇습니다:
 *   연예인 뷰티 / 연예인 패션 / 연예인 가십 / 경제 / 내돈내산 후기
 *
 * ⚠️ AI를 안 씁니다. 낱말로 가립니다. 값이 0원입니다.
 * 글 20편을 AI로 가리면 한 번에 수십 원씩 나가는데, 제목만 보면 거의 다 알 수 있습니다.
 *
 * ⚠️ 확실하지 않으면 **"모름"이라고 합니다.** 억지로 아무 칸에나 넣으면
 * 패션 글 밑에 경제 글 링크가 붙습니다. 그건 안 붙이느니만 못합니다.
 */

/** 연예인 이야기인지 — 뷰티·패션·가십을 가르기 전에 먼저 봅니다. */
const CELEB = /연예인|아이돌|배우|가수|스타|그룹|멤버|아이브|르세라핌|뉴진스|에스파|블랙핑크|BTS|방탄|트와이스|레드벨벳|카리나|윈터|제니|리사|김고은|전지현|송혜교|한소희|수지|아이유|장원영|안유진|화보|시상식|공항|직캠|인스타|SNS/i;

/**
 * 갈래마다 **그 갈래에서만 쓰는 말**을 둡니다.
 * 여러 갈래에 다 나오는 말(예: "스타일")은 넣으면 안 됩니다. 가르는 데 도움이 안 됩니다.
 */
const RULES = [
  {
    id: "연예인 가십",
    // ⚠️ 가십을 **맨 앞에** 둡니다. "카리나 열애설 메이크업"처럼 섞이면
    // 뷰티가 아니라 가십으로 봐야 합니다. 사람들이 그걸 보러 옵니다.
    needCeleb: true,
    re: /열애|결별|이혼|재혼|결婚|결혼|임신|출산|루머|논란|구설|해명|입장문|사과|고소|폭로|사생활|근황|하차|은퇴|복귀|열애설|의혹|해프닝|다이어트\s*비법|나이|프로필/i,
  },
  {
    id: "연예인 뷰티",
    needCeleb: true,
    re: /메이크업|화장|아이라인|아이섀도|섀도|립스틱|립틴트|립|쿠션|파운데이션|마스카라|블러셔|치크|컨실러|선크림|클렌징|토너|세럼|앰플|수분크림|피부|피부톤|민낯|헤어|염색|숏컷|단발|앞머리|네일|시술|뷰티/i,
  },
  {
    id: "연예인 패션",
    needCeleb: true,
    re: /패션|코디|룩|착장|의상|드레스|원피스|자켓|재킷|코트|니트|가디건|셔츠|블라우스|청바지|데님|스커트|치마|가방|백|슈즈|구두|스니커즈|운동화|악세서리|주얼리|목걸이|귀걸이|브랜드|명품/i,
  },
  {
    id: "경제",
    needCeleb: false,
    // "주가"가 빠져서 "삼성전자 주가"를 못 가렸습니다. 시험이 잡았습니다.
    re: /경제|주식|주가|증시|코스피|코스닥|나스닥|비트코인|코인|가상자산|투자|재테크|부동산|아파트|전세|금리|환율|달러|연금|적금|예금|대출|세금|연말정산|배당|ETF|펀드|물가|인플레/i,
  },
  {
    id: "내돈내산 후기",
    needCeleb: false,
    re: /내돈내산|직접\s*써본|써봤|사봤|입어봤|먹어봤|후기|리뷰|사용기|한\s*달\s*써|비교|추천템/i,
  },
];

/**
 * 제목(과 있으면 본문 앞부분)으로 갈래를 가립니다.
 * @returns {{id:string|null, why:string, hit:string|null, celeb:boolean}}
 */
function classify(title, body = "") {
  const t = `${String(title || "")} ${String(body || "").slice(0, 300)}`;
  if (!t.trim()) return { id: null, why: "제목이 비었습니다.", hit: null, celeb: false };

  const celeb = CELEB.test(t);
  for (const r of RULES) {
    if (r.needCeleb && !celeb) continue;
    const m = t.match(r.re);
    if (m) {
      return {
        id: r.id,
        hit: m[0],
        celeb,
        why: r.needCeleb
          ? `연예인 이야기이고 "${m[0]}"가 보여서`
          : `"${m[0]}"가 보여서`,
      };
    }
  }

  // ⚠️ 억지로 넣지 않습니다. 모르면 모른다고 합니다.
  return {
    id: null,
    hit: null,
    celeb,
    why: celeb
      ? "연예인 이야기인 건 알겠는데 뷰티·패션·가십 중 뭔지 못 가렸습니다."
      : "어느 갈래인지 못 가렸습니다.",
  };
}

/** 이 갈래 목록 — 화면에서 고르게 할 때 씁니다. */
const IDS = RULES.map((r) => r.id);

/**
 * 글 목록에서 **같은 갈래**만 최근 순으로 골라냅니다.
 *
 * ⚠️ 관련도 순이 아니라 **최근 순**입니다. 사장님이 그렇게 요청하셨습니다.
 * 오래된 글을 위에 붙이면 "이 사람 요즘 활동 안 하나" 싶어 보입니다.
 */
function pickSameCategory(posts, categoryId, { limit = 4, excludeLogNo = null } = {}) {
  const out = [];
  for (const p of posts) {
    if (excludeLogNo && String(p.logNo) === String(excludeLogNo)) continue;
    const c = classify(p.title);
    if (c.id !== categoryId) continue;
    out.push({ ...p, category: c.id, why: c.why });
    if (out.length >= limit) break;
  }
  return out;
}

/** 모바일 주소 — 사장님이 모바일 링크로 달라고 하셨습니다. */
function mobileUrl(blogId, logNo) {
  return `https://m.blog.naver.com/${blogId}/${logNo}`;
}

module.exports = { classify, pickSameCategory, mobileUrl, IDS, RULES, CELEB };
