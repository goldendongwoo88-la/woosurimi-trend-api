/**
 * 연예인 뷰티·패션 소재 찾기.
 *
 * ⚠️ 왜 자동완성을 쓰는가
 * "사람들이 많이 검색하는 연예인 뷰티 콘텐츠"를 알아내는 가장 정직한 방법은
 * **네이버가 자동완성으로 뭘 제안하는지 보는 것**입니다. 자동완성은 실제 검색량을
 * 근거로 만들어지기 때문에, 우리가 상상해서 지어낸 목록보다 훨씬 낫습니다.
 *
 * 실측 예: "장원영 " → 쌩얼, 밀크티, 빗, 소파 / "제니 " → 의상, 선글라스, 아디다스
 * 이런 건 앉아서 생각해내기 어렵습니다.
 *
 * ⚠️ 다루면 안 되는 것
 * 성형·구설 같은 소재는 여기서 **일부러 걸러냅니다.** 이유는 감성이 아니라 법입니다.
 * 정보통신망법 제70조는 비방할 목적으로 사실을 드러내 명예를 훼손하면 3년 이하 징역,
 * 거짓이면 7년 이하 징역입니다. 연예인이 인정하지 않은 성형을 단정하면 '거짓 사실'이
 * 될 수 있고, 블로그 글 하나로 형사사건이 됩니다. 그래서 목록에서 뺍니다.
 * 다만 본인이 밝혔거나 언론이 보도한 결혼·이혼 같은 건 '보도 인용'으로 다룰 수 있어서
 * 따로 표시해 둡니다.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 붙여볼 꼬리말. 이걸 바꾸면 캐는 소재가 달라집니다. */
const SEEDS = {
  beauty: ["메이크업", "화장", "립", "아이라인", "쌩얼", "피부", "헤어", "머리", "단발", "펌", "염색", "탈색", "다이어트", "성형"],
  fashion: ["옷", "패션", "데일리룩", "공항", "가방", "신발", "코디", "원피스", "니트", "청바지", "선글라스", "귀걸이", "브랜드"],
  issue: ["결혼", "이혼", "열애", "논란", "나이", "키", "학력", "가족"],
};

/**
 * ⚠️ 이 말이 들어간 소재는 돌려주지 않습니다.
 * 사실 여부를 우리가 확인할 수 없는데 단정하면 바로 명예훼손이 됩니다.
 */
const BLOCK = [
  "성형", "코성형", "눈성형", "양악", "보톡스", "필러", "시술", "수술",
  "쌍꺼풀", "지방흡입", "가슴", "몸매", "살쪘", "살찐", "늙", "폭삭",
  "논란", "구설", "루머", "찌라시", "사생활", "열애설", "마약", "음주", "학폭", "탈세",
];

/** 조심해서 다뤄야 하는 소재 — 막지는 않고 표시만 합니다. */
const CAUTION = ["결혼", "이혼", "열애", "이별", "재혼", "임신", "출산", "소속사", "계약"];

/** 인구의 대부분을 덮는 성씨들. 이름인지 아닌지 가르는 데만 씁니다. */
const SURNAMES =
  "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제탁";

/** 성씨로 시작하는 세 글자 낱말이지만 사람 이름이 아닌 것들. */
const NOT_NAMES = new Set([
  "정보성", "최신곡", "인스타", "유튜브", "화보집", "고화질", "방송분",
  "구두굽", "유행어", "임신설", "전신샷", "상반신", "하반신", "안경테",
]);

/** 이름이 낱말의 앞머리에 있는가 — 맨 앞이거나 바로 앞이 띄어쓰기. */
function startsWord(text, name) {
  let i = text.indexOf(name);
  while (i !== -1) {
    if (i === 0 || /\s/.test(text[i - 1])) return true;
    i = text.indexOf(name, i + 1);
  }
  return false;
}

function isLikelyPersonName(s) {
  if (!/^[가-힣]{3}$/.test(s)) return false;   // 한국 이름은 대개 세 글자
  if (NOT_NAMES.has(s)) return false;
  return SURNAMES.includes(s[0]);
}

/**
 * 소재를 셋으로 나눕니다: 통과 / 주의 / 차단.
 *
 * @param {string} keyword
 * @param {string} name  검색한 연예인 이름 — 이름만 남는 경우를 잡으려면 필요합니다.
 */
function classify(keyword, name = "") {
  const k = String(keyword);
  if (BLOCK.some((b) => k.includes(b))) return "blocked";
  if (CAUTION.some((c) => k.includes(c))) return "caution";

  // ⚠️ "한소희 류준열", "한소희 남주혁"이 그냥 통과했습니다.
  // 금지어가 하나도 안 들어 있지만 실질은 **열애설**입니다.
  //
  // 처음엔 "이름 뗀 나머지가 2~4글자면 사람 이름"으로 잡았는데,
  // 금발·드라마·영화·타투까지 다 걸려서 12건 중 9건에 경고가 붙었습니다.
  // **모든 것에 붙는 경고는 아무도 안 봅니다.** 없느니만 못합니다.
  //
  // 그래서 한국 이름의 모양을 씁니다: 세 글자이고 첫 글자가 흔한 성씨.
  // 남주혁·류준열·전종서는 걸리고, 드라마·블로그는 안 걸립니다(드·블은 성씨가 아님).
  // 두 글자(금발·영화·타투)는 이름으로 보지 않습니다.
  if (name) {
    const rest = k.replace(name, "").trim();
    // ⚠️ 성씨 규칙만 쓰면 원피스(원)·공항룩(공)·오사카(오)까지 사람 이름으로 봅니다.
    // 우리가 아는 주제어가 들어 있으면 그건 주제어지 사람 이름이 아닙니다. 먼저 걸러냅니다.
    const allSeeds = [...SEEDS.beauty, ...SEEDS.fashion, ...SEEDS.issue];
    if (allSeeds.some((s) => rest.includes(s))) return "ok";
    if (isLikelyPersonName(rest)) return "caution";
  }
  return "ok";
}

function topicOf(keyword) {
  const k = String(keyword);
  if (SEEDS.beauty.some((s) => k.includes(s))) return "뷰티";
  if (SEEDS.fashion.some((s) => k.includes(s))) return "패션";
  if (SEEDS.issue.some((s) => k.includes(s))) return "이슈";
  return "기타";
}

/** 네이버 자동완성 한 번. */
async function autocomplete(query) {
  const url =
    "https://ac.search.naver.com/nx/ac?q=" +
    encodeURIComponent(query) +
    "&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: "https://search.naver.com/" },
      signal: ac.signal,
    });
    if (res.status !== 200) return [];
    const j = await res.json();
    // 응답 형태: { items: [ [ ["장원영 국적", ...], ... ] ] }
    const rows = (j.items && j.items[0]) || [];
    return rows.map((r) => (Array.isArray(r) ? r[0] : r)).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 연예인 한 명에 대해 소재를 캡니다.
 *
 * @param {string} name  연예인 이름
 * @param {object} opts  { categories: ["beauty","fashion"], maxSeeds }
 */
async function mine(name, { categories = ["beauty", "fashion"], maxSeeds = 10 } = {}) {
  const who = String(name || "").trim();
  if (!who) return { ok: false, why: "연예인 이름을 넣어주세요." };

  // 이름만으로 한 번, 그리고 꼬리말을 붙여서 여러 번.
  const queries = [`${who} `];
  for (const c of categories) {
    for (const s of (SEEDS[c] || []).slice(0, maxSeeds)) queries.push(`${who} ${s}`);
  }

  const seen = new Set();
  const found = [];
  let blocked = 0;

  for (const q of queries) {
    const items = await autocomplete(q);
    for (const it of items) {
      const kw = String(it).trim();
      if (!kw || seen.has(kw)) continue;
      // ⚠️ 이름이 '들어 있기만' 하면 되게 뒀더니 짧은 이름에서 엉뚱한 게 쏟아졌습니다.
      // "제니"로 캤더니 씨엔제니 헤어, 위드제니헤어룸, 제니오설치가 딸려왔습니다.
      // 이름이 **낱말 앞머리**에 오는 것만 받습니다(맨 앞이거나 앞에 띄어쓰기).
      // "샤넬 제니 가방", "제니가방"은 남고 "씨엔제니"는 빠집니다.
      if (!startsWord(kw, who)) continue;
      seen.add(kw);
      const state = classify(kw, who);
      if (state === "blocked") { blocked++; continue; }
      found.push({ keyword: kw, topic: topicOf(kw), caution: state === "caution" });
    }
    // ⚠️ 자동완성도 연달아 때리면 막힙니다. 사이를 띄웁니다.
    await new Promise((r) => setTimeout(r, 250));
  }

  // 뷰티·패션을 앞으로, 기타를 뒤로
  const order = { 뷰티: 0, 패션: 1, 이슈: 2, 기타: 3 };
  found.sort((a, b) => (order[a.topic] - order[b.topic]) || a.keyword.localeCompare(b.keyword));

  return {
    ok: true,
    name: who,
    total: found.length,
    blocked,
    items: found,
    note:
      blocked > 0
        ? `성형·논란처럼 사실 확인이 안 되는 소재 ${blocked}건은 뺐습니다. 사실이어도 비방 목적으로 보이면 정보통신망법상 명예훼손이 됩니다.`
        : null,
  };
}

/**
 * 참고할 만한 곳들. 조사해서 확인한 것만 넣습니다.
 * ⚠️ 여기 적힌 곳의 사진과 글은 **가져다 쓰면 안 됩니다.** 소재를 얻는 곳이지
 * 퍼오는 곳이 아닙니다. 사진은 저작권과 초상권이 함께 걸려서 특히 위험합니다.
 */
const SOURCES = {
  뷰티: [
    { name: "엘르 코리아 뷰티", url: "https://www.elle.co.kr/beauty", what: "연예인 메이크업·헤어 트렌드를 기사로 정리. '문가영·조여정의 글래스 헤어'처럼 이름을 걸고 다룹니다." },
    { name: "얼루어 코리아", url: "https://www.allurekorea.com/beauty/", what: "제품 중심. 아이돌 메이크업 공식, 아티스트 인터뷰가 많습니다." },
    { name: "코스모폴리탄 코리아", url: "https://www.cosmopolitan.co.kr/beauty", what: "따라 하기 쉬운 형태로 풀어줍니다. 블로그 글로 옮기기 좋은 구성." },
    { name: "네이버 자동완성", url: "https://search.naver.com/", what: "사람들이 실제로 뭘 치는지. 이 도구가 쓰는 곳입니다." },
  ],
  패션: [
    { name: "더블유 코리아", url: "https://www.wkorea.com/", what: "아이돌 공항 패션·화보. 브랜드명이 본문에 자주 나옵니다." },
    { name: "보그 코리아", url: "https://www.vogue.co.kr/", what: "패션 인스타 계정 큐레이션 기사가 따로 있습니다." },
    { name: "엘르 코리아 패션", url: "https://www.elle.co.kr/", what: "셀럽 공항 패션을 아이템 단위로 짚어줍니다." },
  ],
  이슈: [
    { name: "디스패치", url: "https://www.dispatch.co.kr/", what: "단독 보도가 많아 이슈의 출발점이 되는 곳. 인용할 때 반드시 출처를 밝히세요." },
    { name: "네이트 연예", url: "https://news.nate.com/ent/section?mid=e0100", what: "언론사 기사를 모아 봅니다. 어떤 이슈가 큰지 한눈에." },
  ],
};

module.exports = { mine, autocomplete, SOURCES, SEEDS, BLOCK, CAUTION, classify };
