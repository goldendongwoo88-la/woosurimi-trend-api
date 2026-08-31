/**
 * 썸네일 패턴 — **홈판 상위 블로그가 실제로 쓰는 10가지 틀**과, 글에 맞는 것을 골라주는 규칙.
 *
 * ⚠️ 근거: 홈판·뷰티·패션 메이트 블로그의 대표사진 **62장을 눈으로 보고** 분류했습니다
 * (2026-08-31, 픽셀 실측 280장과 별개). 왜 눈으로 봤냐면, "글씨를 얹었는가"를 픽셀로는
 * 못 가리기 때문입니다 — 검은 드레스에 흰 자수가 자막보다 더 '글씨 같다'고 나왔습니다.
 *
 * ⚠️ AI를 안 씁니다. 제목·본문 낱말과 사진 개수만 보고 규칙으로 고릅니다. 값이 0원입니다.
 *
 * ⚠️ 이건 상관관계지 인과가 아닙니다. "이 틀을 쓰면 홈판에 뜬다"가 아니라
 * "홈판에 뜨는 블로그들이 이 틀을 쓰더라"까지입니다.
 *
 * ⚠️ **만들 수 없는 틀은 추천하지 않습니다.** 2분할은 사진 2장, 콜라주는 3장이 필요합니다.
 * 사진 1장인데 2분할을 추천하면 사장님이 고른 뒤에 못 만든다고 말하게 됩니다. 그건 최악입니다.
 */

/**
 * 10가지 틀.
 *   needPhotos  최소 사진 수
 *   render      thumbnail.js에서 이 틀을 그리는 방법 (renderPattern이 해석)
 *   fits        어떤 글에 어울리는가 (사람이 읽을 설명)
 *   seen        62장에서 이 틀을 쓴 블로그 예 (근거)
 */
const PATTERNS = {
  bigCaption: {
    id: "bigCaption",
    label: "유튜브식 대문",
    needPhotos: 1,
    render: { kind: "single", textSize: "big", band: false, accent: true },
    fits: "연예·가십·이슈. 화면 1/3을 글씨가 채우고 핵심 낱말만 빨강.",
    why: "홈판은 손톱만 하게 보입니다. 그 크기에서 읽히는 건 대여섯 글자뿐입니다.",
    seen: "nidle_831 — 일 7.4만",
  },
  bandQuestion: {
    id: "bandQuestion",
    label: "아래 띠 + 질문 한 줄",
    needPhotos: 1,
    render: { kind: "single", textSize: "mid", band: true, position: "bottom" },
    fits: "정보성·가십 공통. 제목을 되풀이하지 않고 다른 각도로 묻습니다.",
    why: "띠가 깔리면 글씨가 사진에 묻히지 않습니다. 어떤 사진이 와도 읽힙니다.",
    seen: "tmzmfk010(힐스터K) — 흰 띠 + 빨간 글씨",
  },
  splitSubject: {
    id: "splitSubject",
    label: "2분할 — 인물 + 소재",
    needPhotos: 2,
    render: { kind: "pair", labels: null, mono: false },
    fits: "인물과 물건·장소가 같이 나오는 글(건물주·차·가방·매장).",
    why: "한 장으로 설명이 안 되는 이야기를 두 장으로 보여줍니다. '이 사람과 저것이 무슨 관계?'가 생깁니다.",
    seen: "livenoa12 — 인물 + 건물",
  },
  splitBand: {
    id: "splitBand",
    label: "2분할 + 아래 띠 카피",
    needPhotos: 2,
    render: { kind: "pair", labels: null, mono: false, band: true },
    fits: "위와 같되 한 줄 설명이 꼭 필요할 때.",
    why: "두 장만으로 관계가 안 읽히면 띠 한 줄이 다리를 놓아줍니다.",
    seen: "tmzmfk010 — 인물 + 화면 캡처 + 하단 질문",
  },
  beforeAfter: {
    id: "beforeAfter",
    label: "전 / 후 두 장",
    needPhotos: 2,
    render: { kind: "pair", labels: { left: "BEFORE", right: "AFTER" }, mono: true },
    fits: "변화·전후·민낯/풀메·다이어트.",
    why: "왼쪽 흑백(과거) / 오른쪽 컬러(현재)로 대비가 한눈에 들어옵니다.",
    seen: "honestpsc17 — 같은 인물 다른 장면",
  },
  mosaicOne: {
    id: "mosaicOne",
    label: "얼굴 가리기",
    needPhotos: 1,
    render: { kind: "single", mosaic: true, textSize: "mid", band: false },
    fits: "제목에 이름이 없는 글. '누구지?'를 만듭니다.",
    why: "정체를 가리면 확인하러 들어옵니다. 네모가 아니라 타원으로 가려야 '일부러 가렸다'로 읽힙니다.",
    seen: "spoen1217(홍기자) — 두 명 중 한 명만 가림",
  },
  mosaicPair: {
    id: "mosaicPair",
    label: "두 명 중 한 명만 가리기",
    needPhotos: 2,
    render: { kind: "pair", mosaicSide: "right", labels: null },
    fits: "이름 2명이거나 '이름 + 여배우' 같은 지칭이 섞인 글.",
    why: "보여줄 사람은 보여주고, 화제의 인물만 가립니다.",
    seen: "spoen1217",
  },
  faceClose: {
    id: "faceClose",
    label: "얼굴 클로즈업 (글씨 없이)",
    needPhotos: 1,
    render: { kind: "single", textSize: "none" },
    fits: "사진 자체가 센 글. 미모·화보·시상식.",
    why: "얼굴이 화면의 절반을 넘으면 글씨가 없어도 눈이 멈춥니다. 사진을 믿는 틀입니다.",
    seen: "뷰티·패션 메이트 다수 — 사람 크기 중앙값 0.52~0.67",
  },
  tallFull: {
    id: "tallFull",
    label: "세로 전신",
    needPhotos: 1,
    render: { kind: "single", size: "tall", textSize: "none" },
    fits: "패션·코디·룩. 옷 전체를 보여줘야 하는 글.",
    why: "패션 메이트의 40%가 세로형입니다. 홈판에서 세로가 더 큰 자리를 먹습니다.",
    seen: "11_24m · podo_hyoni",
  },
  collage3: {
    id: "collage3",
    label: "3장 콜라주",
    needPhotos: 3,
    render: { kind: "collage", n: 3 },
    fits: "여러 장면·여러 아이템을 한 번에 보여주는 글.",
    why: "정보량으로 승부합니다. 후기·화보 글에서 많이 씁니다.",
    seen: "kiddy28 · goodface0863",
  },
};

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** 제목·본문에서 읽어내는 신호들. 전부 낱말 규칙입니다. */
function readSignals(title, body = "") {
  const t = norm(title);
  const all = t + " " + norm(body).slice(0, 800);
  return {
    beforeAfter: /전후|비포|애프터|before|after|바뀐|달라진|변화|변신|민낯|쌩얼|다이어트|감량|시술 전|시술 후/i.test(t),
    twoPeople: /vs|VS|대결|비교|보다|제치고|과 |와 |,/.test(t),
    // 이름 없이 가리키는 사람 — 가리기 틀이 잘 맞습니다
    hidden: /여배우|남배우|여자 ?아이돌|남자 ?아이돌|여돌|남돌|그 ?배우|연예인|인플루언서|모델/.test(t),
    // 물건·장소가 주인공
    object: /건물|집|아파트|차량|차|가방|시계|매장|카페|호텔|식당|브랜드|제품|가격|억|만원/.test(t),
    fashion: /패션|코디|룩|드레스|원피스|재킷|코트|청바지|신발|가방|착장|스타일링/.test(t),
    beauty: /메이크업|화장|피부|헤어|머리|펌|염색|립|섀도|쿠션|파데|시술|모공/.test(t),
    gossip: /근황|열애|결혼|이혼|논란|화제|난리|충격|해명|입장|폭로|고백/.test(t),
    travel: /여행|맛집|카페|코스|당일치기|숙소|호텔|투어/.test(t),
    number: /\d/.test(t),
    quote: /["'“”‘’]/.test(t),
  };
}

/**
 * 이 글에 어울리는 틀을 점수로 줄 세웁니다.
 *
 * ⚠️ 점수는 **어떤 글이냐**로만 매깁니다. "이게 더 잘 나간다"는 근거가 우리에겐
 * 없습니다(조회수를 못 봅니다). 그래서 "이 글에는 이 틀이 맞다"까지만 말합니다.
 *
 * @param photoCount 지금 본문에 있는 쓸 만한 사진 수 — 못 만들 틀을 걸러내는 데 씁니다
 * @returns [{ pattern, score, reason }] 점수 높은 순
 */
function rank(title, body = "", photoCount = 1) {
  const s = readSignals(title, body);
  const out = [];
  const add = (id, score, reason) => {
    const p = PATTERNS[id];
    if (!p) return;
    if (photoCount < p.needPhotos) return;   // 못 만들 틀은 아예 안 올립니다
    out.push({ pattern: p, score, reason });
  };

  // 전후 신호는 제일 강합니다 — 다른 무엇보다 먼저 봅니다.
  if (s.beforeAfter) add("beforeAfter", 100, "제목에 변화·전후를 뜻하는 말이 있습니다.");

  // 가리기 — 이름을 감춘 글
  if (s.hidden) {
    add("mosaicPair", 90, "제목이 이름 대신 '여배우·연예인'으로 가리키고 있습니다.");
    add("mosaicOne", 85, "정체를 가리면 누구인지 확인하러 들어옵니다.");
  }

  // 인물 + 물건·장소
  if (s.object) {
    add("splitSubject", 88, "인물과 물건·장소가 같이 나오는 글이라 두 장으로 보여줄 수 있습니다.");
    add("splitBand", 80, "두 장의 관계를 한 줄로 설명해 줍니다.");
  }

  // 가십·이슈 — 글씨가 세야 합니다
  if (s.gossip) {
    add("bigCaption", 92, "연예·이슈 글입니다. 홈판 최상위가 쓰는 큰 글씨 틀입니다.");
    add("bandQuestion", 84, "띠를 깔면 어떤 사진이 와도 글씨가 읽힙니다.");
  }

  // 패션 — 세로형
  if (s.fashion) {
    add("tallFull", 86, "패션 글입니다. 옷 전체가 보이는 세로형이 홈판에서 자리를 크게 먹습니다.");
    add("faceClose", 70, "사진이 세면 글씨 없이 얼굴로 갑니다.");
  }

  // 뷰티 — 얼굴이 알맹이
  if (s.beauty) {
    add("faceClose", 84, "뷰티 글은 얼굴이 알맹이라 크게 잡습니다.");
    add("bandQuestion", 76, "제품·기법을 한 줄로 물어봅니다.");
  }

  // 여행·맛집 — 현장 사진 여러 장
  if (s.travel) {
    add("collage3", 82, "장소가 여럿인 글이라 여러 장을 한 번에 보여줍니다.");
    add("bandQuestion", 74, "어디인지 한 줄로 알려줍니다.");
  }

  // 숫자·따옴표가 있으면 글씨 얹는 틀이 살아납니다
  if (s.number) add("bigCaption", 78, "제목에 숫자가 있어 글씨로 박으면 셉니다.");
  if (s.quote) add("bandQuestion", 72, "제목에 따온 말이 있어 띠에 얹기 좋습니다.");

  // 아무 신호도 안 걸린 글을 위한 바탕 — 어떤 글이든 이 셋은 만들 수 있습니다.
  add("bandQuestion", 50, "어떤 글에나 무난합니다. 띠가 있어 글씨가 항상 읽힙니다.");
  add("faceClose", 46, "사진이 세면 글씨 없이도 눈이 멈춥니다.");
  add("bigCaption", 44, "글씨를 크게 얹어 손톱만 한 크기에서도 읽히게 합니다.");
  add("collage3", 40, "사진이 여러 장 있으면 한 번에 보여줍니다.");
  add("tallFull", 38, "세로형은 홈판에서 자리를 크게 먹습니다.");
  add("splitSubject", 36, "두 장을 붙이면 이야기가 생깁니다.");
  add("mosaicOne", 34, "가리면 궁금해집니다.");

  // 같은 틀이 여러 번 들어왔으면 제일 높은 점수 하나만 남깁니다.
  const best = new Map();
  for (const c of out) {
    const cur = best.get(c.pattern.id);
    if (!cur || c.score > cur.score) best.set(c.pattern.id, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * 한 번에 보여줄 4개를 뽑습니다. page를 넘기면 그다음 4개(새로고침).
 *
 * ⚠️ 돌고 돕니다. 끝까지 가면 처음으로 돌아옵니다 — "더 없습니다"로 막다른 길을
 * 만들지 않습니다. 대신 몇 바퀴째인지 알려줘서 사장님이 다 봤다는 걸 아시게 합니다.
 */
function pick(title, body = "", photoCount = 1, page = 0) {
  const ranked = rank(title, body, photoCount);
  if (!ranked.length) return { items: [], pages: 0, page: 0, total: 0 };
  const PER = 4;
  const pages = Math.max(1, Math.ceil(ranked.length / PER));
  const p = ((page % pages) + pages) % pages;      // 음수도 뒤에서부터 (되돌아가기)
  const items = [];
  for (let i = 0; i < PER; i++) {
    const c = ranked[(p * PER + i) % ranked.length];
    if (!items.some((x) => x.pattern.id === c.pattern.id)) items.push(c);
  }
  return { items, pages, page: p, total: ranked.length };
}

module.exports = { PATTERNS, rank, pick, readSignals };
