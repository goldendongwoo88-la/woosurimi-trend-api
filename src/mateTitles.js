/**
 * 메이트식 제목 추천 — 실측 1,281개 제목의 문법으로 오늘 쓸 제목을 뽑습니다.
 *
 * 재료 둘:
 *   1) 키워드 은행(data/mate-keywords.json) — 메이트·상위 블로거 43곳 제목 실측.
 *      연예인 이름 빈도, 공식 낱말 빈도. "관심 키워드"의 저장소이기도 합니다.
 *   2) 지금 뜨는 소재(hotIssues) — 네이트 랭킹·뉴스1·구글트렌드 실시간.
 *
 * ⚠️ 실측에서 나온 제목 문법 (근거 있는 것만 씁니다):
 *      숫자 포함 41% · 말줄임(...) 13% · 물음표 16% · 평균 37자
 *      "오늘자/무보정/분명 ~인데/알고보니/난리난" 같은 낱말이 반복됩니다.
 *
 * ⚠️ 선 지키기: 열애·불화 단정, 외모 비하, 살 빼라는 압박 어조는 안 만듭니다.
 *    연예인 "정보성"(패션·뷰티 따라하기)까지만 — 사생활 가십 제목은 여기서 안 나옵니다.
 *    (가십은 법적 위험을 사장님이 따로 판단하실 영역이라 기본 꺼짐)
 *
 * ⚠️ AI 0원 — 은행과 틀로만 조립합니다.
 */

const fs = require("fs");
const path = require("path");

function bank() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "mate-keywords.json"), "utf8"));
  } catch {
    return { celebs: [], formulas: [], stats: {} };
  }
}

// 갈래별 제목 틀 — {c}에 연예인이 들어갑니다. 전부 실측 제목의 결을 따랐습니다.
const TEMPLATES = {
  beauty: [
    "오늘자 {c} 메이크업.. 달라진 포인트만 정리했습니다",
    "분명 같은 화장인데... {c} 피부가 달라 보이는 이유",
    "{c} 중단발, 미용실에서 이렇게 말하면 됩니다",
    "화장 싹 바꾼 {c}... 아이 메이크업부터 달라졌습니다",
    "{c} 헤메코 정리 — 이번 무대 디테일 3가지",
    "무보정으로 화제된 {c} 피부.. 관리 루틴 짚어봤습니다",
    "{c} 앞머리 뭐가 다른가 했더니.. 커트 방법이 달랐습니다",
    "따라해본 {c} 데일리 메이크업.. 필요한 건 3개뿐이었습니다",
  ],
  // ⚠️ "다 국내 브랜드였습니다" 같은 **사실 단정형 틀은 뺐습니다.**
  // 실제로 AI가 그 전제에 맞춰 없는 사실을 지어내는 걸 확인했습니다 (2026-08-28).
  // 제목은 후킹하되, 본문이 지어내지 않아도 지킬 수 있는 약속만 겁니다.
  fashion: [
    "같은 옷인데... {c}가 입으니 달라 보이는 이유",
    "{c} 공항룩, 따라 입는 순서만 정리했습니다",
    "{c} 최근 코디에서 배울 색 조합 3가지",
    "{c} 청바지핏이 달라 보이는 이유.. 기장부터 봅니다",
    "오늘자 {c} 사복.. 코디 공식만 뽑아봤습니다",
    "{c} 원피스 스타일링, 가을에 그대로 써먹는 법",
    "이번 주 화제된 {c} 스타일링.. 포인트는 하나였습니다",
    "{c}처럼 입고 싶다면.. 순서는 신발부터입니다",
  ],
};

/**
 * @param {"beauty"|"fashion"} area
 * @param {object} hot hotIssues.collect() 결과 (없으면 은행만으로)
 * @param {number} n
 */
function suggest(area = "beauty", hot = null, n = 10) {
  const b = bank();
  const tpls = TEMPLATES[area] || TEMPLATES.beauty;

  // 이름 고르기 — ① 오늘 이슈에 오른 이름 먼저 ② 실측 빈도 순
  const hotNames = (hot && hot.hotNames ? hot.hotNames.map((h) => h.name) : []);
  const bankNames = b.celebs.map((c) => c.word);
  const names = [...new Set([...hotNames, ...bankNames])].slice(0, Math.max(6, n));

  const out = [];
  let ti = 0;
  for (const name of names) {
    if (out.length >= n) break;
    const tpl = tpls[ti++ % tpls.length];
    const freq = (b.celebs.find((c) => c.word === name) || {}).n || 0;
    out.push({
      title: tpl.replace(/\{c\}/g, name),
      celeb: name,
      why: hotNames.includes(name)
        ? "지금 랭킹뉴스에 오른 이름"
        : `메이트 제목 실측 ${freq}회 등장`,
    });
  }
  return {
    area,
    items: out,
    basis: b.source || "키워드 은행",
    note: "제목 틀은 메이트 1,281개 제목의 문법(숫자 41%·말줄임 13%·평균 37자)을 따랐습니다. " +
          "본문 없이 제목만 쓰지 마시고, 실제 내용이 그 약속을 지키게 써주세요.",
  };
}

module.exports = { suggest, bank, TEMPLATES };
