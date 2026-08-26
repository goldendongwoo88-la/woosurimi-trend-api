/**
 * 주제 적합도 — 이 글을 어느 블로그에, 어느 주제로 걸어야 하나.
 *
 * ⚠️ 왜 필요한가
 * 홈피드는 "이 블로그는 무슨 블로그인가"를 판단해서 그 주제에 관심 있는 사람에게 밀어줍니다.
 * 그래서 주제 설정과 글 내용이 어긋나면 손해입니다. 패션에 관심 있는 사람에게
 * 예능 얘기를 밀어주면 안 누르고, 안 누르면 그게 나쁜 신호로 쌓입니다.
 *
 * 실측: man_is_best 최근 90편 중 진짜 패션·미용은 44%뿐이었습니다.
 * 나머지는 예능·연예 가십이었는데 같은 블로그에 섞여 있었습니다.
 *
 * ⚠️ AI를 쓰지 않습니다. 낱말로 판정합니다.
 * 이유가 둘입니다. 글 쓸 때마다 부르는 기능이라 **즉시** 답해야 하고,
 * 매번 API 비용이 나가면 안 됩니다. 그리고 이 판정은 낱말만으로 충분히 정확합니다.
 *
 * ⚠️ 단정하지 않습니다. 애매하면 애매하다고 말합니다.
 * 경계에 걸친 글(예: 연예인 무대의상)은 어느 쪽으로 가도 되고,
 * 그건 사장님이 정할 일이지 도구가 정할 일이 아닙니다.
 */

/**
 * 주제별 신호어. 실제 글 제목 180편을 보고 뽑았습니다.
 * strong은 그것만 있어도 그 주제로 볼 만한 말, weak는 거들기만 하는 말입니다.
 */
const TOPICS = {
  "패션·미용": {
    naver: "패션·미용",
    strong: [
      "메이크업", "화장품", "아이라인", "아이섀도", "립스틱", "립틴트", "립밤", "쿠션", "파운데이션",
      "마스카라", "블러셔", "치크", "컨실러", "선크림", "클렌징", "토너", "세럼", "앰플", "수분크림",
      "헤어", "숏컷", "단발", "레이어드컷", "펌", "염색", "탈색", "네일", "향수",
      "코디", "데일리룩", "착장", "착용", "착샷", "무대의상", "공항패션", "오피스룩",
      "원피스", "블라우스", "니트", "가디건", "자켓", "코트", "청바지", "슬랙스", "스니커즈",
      "가방", "백팩", "크로스백", "토트백", "선글라스", "귀걸이", "목걸이", "시계",
    ],
    weak: [
      "뷰티", "패션", "스타일", "피부", "머리", "옷", "신발", "모자", "추천템",
      "쿨톤", "웜톤", "퍼스널컬러",
      // 실측에서 놓쳤던 말들 — 연예인 외모 글이 여기 걸립니다.
      "눈썹", "쌩얼", "민낯", "비주얼", "몸매", "다이어트", "감량", "동안", "탈모", "볼륨",
    ],
  },
  "스타·연예인": {
    naver: "스타·연예인",
    strong: [
      "열애", "결혼", "이혼", "재혼", "임신", "출산", "이별", "결별", "루머", "논란", "구설",
      "성형", "시술", "은퇴", "복귀", "소속사", "계약", "고소", "사과", "해명", "입장문",
      "근황", "폭로", "사생활", "학폭", "음주", "도박",
    ],
    weak: ["연예인", "배우", "가수", "아이돌", "스타", "셀럽"],
  },
  "방송": {
    naver: "방송",
    strong: [
      "예능", "드라마", "시청률", "회차", "출연", "하차", "방영", "종영", "첫방",
      "나는솔로", "불량연애", "연애전쟁", "환승연애", "솔로지옥", "미스터트롯", "복면가왕",
      "넷플릭스", "티빙", "웨이브", "쿠팡플레이", "디즈니플러스",
    ],
    weak: ["방송", "프로그램", "무대", "콘서트", "팬미팅", "시상식"],
  },

  // ⚠️ 아래 둘은 나중에 붙였습니다.
  // 처음엔 패션·미용 / 스타·연예인 / 방송 셋만 뒀는데, 실제 블로그를 돌려보니
  // 90편 중 32편(36%)이 "모름"으로 나왔습니다. 열어보니 대부분 협찬 상품 리뷰와
  // 맛집이었습니다. 있는 것을 못 본 것이지 애매한 글이 아니었습니다.
  // 판정을 못 하면 순도 계산도 같이 틀어집니다.
  "상품리뷰": {
    naver: "상품리뷰",
    strong: [
      "내돈내산", "협찬", "체험단", "언박싱", "실사용", "사용기", "방문기", "구매팁",
      "캐리어", "정장", "로퍼", "샴푸", "안마의자", "밀폐용기", "키보드", "이어폰", "베개",
      "우산", "양산", "슈즈", "유니클로", "다이소", "올리브영", "11번가", "팝업스토어",
      "가격 비교", "장단점", "세일",
    ],
    weak: ["후기", "리뷰", "추천", "가성비", "구매", "할인"],
  },
  "맛집": {
    naver: "맛집",
    strong: [
      "맛집", "메뉴판", "웨이팅", "혼밥", "회식", "삼겹살", "장어덮밥", "한정식", "갈비",
      "파스타", "돈까스", "국밥", "카페", "디저트", "브런치", "오마카세", "포장",
    ],
    weak: ["방문", "가격", "주차", "예약", "영업시간"],
  },
};

/**
 * 글 하나가 어느 주제에 맞는지 봅니다.
 * @param {string} title
 * @param {string} body  있으면 더 정확해집니다
 */
function classify(title, body = "") {
  const t = String(title || "");
  const text = t + " " + String(body || "").slice(0, 1200);

  const scores = {};
  const matched = {};
  for (const [name, def] of Object.entries(TOPICS)) {
    let s = 0;
    const hits = [];
    for (const w of def.strong) {
      // 제목에 있으면 크게, 본문에만 있으면 작게 셉니다.
      if (t.includes(w)) { s += 3; hits.push(w); }
      else if (text.includes(w)) { s += 1; hits.push(w); }
    }
    for (const w of def.weak) {
      if (t.includes(w)) { s += 1; hits.push(w); }
    }
    scores[name] = s;
    matched[name] = [...new Set(hits)].slice(0, 6);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topName, topScore] = ranked[0];
  const [, secondScore] = ranked[1] || [null, 0];

  // ⚠️ 아무 신호도 없으면 모른다고 합니다. 억지로 하나 고르면 틀립니다.
  if (topScore === 0) {
    return {
      topic: null,
      confidence: "unknown",
      why: "주제를 가릴 만한 말을 찾지 못했습니다. 제목이 짧거나 일반적인 표현만 쓰신 것 같습니다.",
      scores,
      matched: {},
    };
  }

  // 1등과 2등이 비슷하면 애매한 겁니다. 단정하면 안 됩니다.
  const clear = topScore >= secondScore * 2 || topScore - secondScore >= 4;

  return {
    topic: topName,
    naver: TOPICS[topName].naver,
    confidence: clear ? "clear" : "mixed",
    runnerUp: clear ? null : ranked[1][0],
    why: clear
      ? `제목과 본문에 ${topName} 쪽 말이 뚜렷합니다.`
      : `${topName}와 ${ranked[1][0]}가 섞여 있습니다. 어느 쪽으로 걸어도 되지만, 블로그 성격에 맞춰 정하세요.`,
    scores,
    matched,
  };
}

/**
 * 이 글이 그 블로그에 맞는지 — 사장님이 블로그를 둘로 나눈 뒤에 쓸 판정입니다.
 * @param {string} title
 * @param {string} body
 * @param {string} blogTopic  이 블로그가 정한 주제 (예: "패션·미용")
 */
function fitsBlog(title, body, blogTopic) {
  const c = classify(title, body);
  if (!c.topic) return { ...c, fits: null, advice: c.why };

  if (c.topic === blogTopic) {
    return {
      ...c,
      fits: true,
      advice:
        c.confidence === "clear"
          ? `${blogTopic} 블로그에 맞는 글입니다.`
          : `${blogTopic} 쪽이 조금 더 우세하지만 ${c.runnerUp}도 섞여 있습니다. 그대로 올리셔도 됩니다.`,
    };
  }

  return {
    ...c,
    fits: false,
    advice:
      c.confidence === "clear"
        ? `이 글은 ${c.topic} 쪽입니다. ${blogTopic} 블로그에 올리면 주제가 흐려집니다. 다른 블로그로 보내는 편이 낫습니다.`
        : `${c.topic} 쪽에 가깝지만 ${blogTopic}도 섞여 있습니다. 애매하니 사장님이 정하세요.`,
  };
}

/** 블로그 전체의 주제 순도 — 제목 목록만 있으면 됩니다. */
function purityOf(titles, blogTopic) {
  const rows = titles.map((t) => ({ title: t, ...classify(t) }));
  const fit = rows.filter((r) => r.topic === blogTopic).length;
  const off = rows.filter((r) => r.topic && r.topic !== blogTopic);
  const unknown = rows.filter((r) => !r.topic).length;
  return {
    total: titles.length,
    fit,
    unknown,
    purity: titles.length ? Math.round((fit / titles.length) * 100) : 0,
    offTopic: off.slice(0, 20).map((r) => ({ title: r.title, topic: r.topic })),
  };
}

module.exports = { classify, fitsBlog, purityOf, TOPICS };
