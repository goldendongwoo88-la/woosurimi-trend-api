/**
 * 터진 영상에서 "팔 물건" 뽑아내기 — 2026-09-01
 *
 * 사장님 지적이 맞습니다: 남의 영상을 가져올 게 아니라, **그 영상이 알려주는 제품**을 우리가 팔면 됩니다.
 * 터진 쇼핑 쇼츠는 사실상 "지금 이 물건이 팔린다"는 시장 신호입니다. 영상은 두고 신호만 가져옵니다.
 *
 * ── 어떻게 가려내나 ──
 * 제목 낱말은 두 종류로 갈립니다:
 *   · **일반어** — 여러 영상에 반복됩니다. "다이소", "꿀템", "추천템", "무조건", "TOP10".
 *     이건 훅 어휘라 우리 제목에도 넣어야 하지만, 팔 물건은 아닙니다.
 *   · **제품어** — 한두 영상에만 나옵니다. "채칼", "네트망", "립펜슬", "방수테이프".
 *     구체적이라 겹치지 않습니다. 이게 팔 물건입니다.
 * 그래서 **여러 영상에 겹치는 말은 버리고, 구체적이면서 안 겹치는 말을 남깁니다.**
 * (winnerPattern의 훅어휘와 정확히 반대로 고릅니다 — 같은 자료에서 서로 다른 걸 봅니다.)
 *
 * 해시태그는 따로 봅니다. "#원터치채칼", "#욕실틈새방수테이프"처럼 **제품명을 통째로** 넣어주는 경우가 많습니다.
 *
 * AI를 안 씁니다. 0원입니다.
 */

/** 물건이 아닌 말. 이게 남으면 "다이소를 팔아라" 같은 소리가 나옵니다. */
const NOT_PRODUCT = new Set([
  // 판매처·브랜드 일반
  "다이소", "쿠팡", "이마트", "올리브영", "홈플러스", "마트", "편의점", "네이버", "쇼핑",
  // 마케팅 상투어
  "꿀템", "추천템", "신상", "필템", "인생템", "쟁여", "쟁템", "핫템", "갓템", "존예템",
  "추천", "리뷰", "후기", "언박싱", "내돈내산", "솔직", "비교", "정리", "모음", "총정리",
  "무조건", "역대급", "미쳤다", "대박", "진짜", "이거", "그거", "요즘", "요즘것",
  "가성비", "최애", "레전드", "필수", "강추", "실화", "충격", "반전", "소름",
  // 형식어
  "shorts", "short", "쇼츠", "영상", "브이로그", "구독", "좋아요", "댓글", "링크", "프로필",
  "이렇게", "보이면", "사세요", "사자마자", "쓰는", "쓰면", "있으면", "없으면", "해보니",
  "가지", "개", "종류", "가성", "방법", "사용법", "활용법", "꿀팁", "팁",
  // 사람·수식
  "여배우", "연예인", "주부", "엄마", "아빠", "남편", "아내", "언니", "동생",
  // 실측에서 걸린 것들 — 태그이지 물건이 아닙니다
  "살림초보", "살림템", "살림", "자취템", "자취", "인테리어", "메인인테리어", "이케아",
  "다이소추천", "다이소추천템", "브라이언", "브라이언청소템", "청소템", "정리템", "주방템",
]);

/** 물건일 가능성이 큰 꼬리말. 이걸로 끝나면 대개 제품입니다. */
const PRODUCT_TAIL = new RegExp(
  "(" + [
    // 주방·살림
    "칼", "망", "판", "함", "통", "팩", "컵", "병", "솔", "봉", "캡", "링", "줄", "끈",
    "테이프", "케이스", "커버", "홀더", "트레이", "선반", "바구니", "매트", "수세미", "행주",
    "집게", "국자", "주걱", "도마", "용기", "파우치", "필름", "스티커", "패드", "쿠션",
    "정리함", "수납함", "건조대", "타이머", "저울", "채반", "밀대", "뚜껑", "받침", "걸이",
    // 전자·조명
    "램프", "조명", "충전기", "거치대", "청소기", "선풍기", "가습기", "무드등",
    // 뷰티
    "펜슬", "틴트", "섀도", "크림", "마스크", "샴푸", "린스", "세럼", "앰플", "로션", "미스트",
  ].join("|") + ")$",
);

/** 숫자·기호·조사를 걷어낸 낱말들. */
function words(text) {
  return String(text || "")
    .replace(/[#@]/g, " ")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** 제목·설명에 박힌 해시태그. 제품명을 통째로 주는 경우가 많습니다. */
function hashtags(text) {
  return (String(text || "").match(/#[^\s#]+/g) || [])
    .map((h) => h.slice(1).trim())
    .filter((h) => h.length >= 2);
}

/**
 * 제품 후보 뽑기.
 *
 * @param rows 파인더 결과 (title, description, views, efficiency, url …)
 */
function extract(rows, { max = 20 } = {}) {
  const list = (rows || []).filter((r) => r && r.title);
  if (!list.length) return { ok: false, error: "영상이 없습니다", products: [] };

  // 1) 낱말이 몇 편에 걸쳐 나오는지 셉니다 — 많이 겹치면 일반어입니다.
  const spread = new Map();
  for (const r of list) {
    const all = new Set([...words(r.title), ...hashtags(r.title), ...hashtags(r.description)]);
    for (const w of all) spread.set(w, (spread.get(w) || 0) + 1);
  }

  const half = Math.max(2, Math.ceil(list.length * 0.25));   // 4편 중 1편 넘게 나오면 일반어로 봅니다

  const found = new Map();
  for (const r of list) {
    const cands = new Set([...words(r.title), ...hashtags(r.title)]);
    for (const w of cands) {
      if (w.length < 2 || w.length > 12) continue;
      if (/^\d+$/.test(w)) continue;
      if (NOT_PRODUCT.has(w)) continue;
      if (/^[a-zA-Z]+$/.test(w)) continue;              // 영문 단독은 대개 채널명·태그
      if ((spread.get(w) || 0) > half) continue;         // 너무 흔하면 일반어
      // 물건 꼬리말이 붙었거나, 해시태그로 따로 박아준 것만 남깁니다.
      /**
       * ⚠️ 해시태그라고 다 제품이 아닙니다.
       * 처음엔 "해시태그면 제품명"이라고 봤는데, 실측해보니 #살림초보 #인테리어 #자취템
       * #브라이언(사람 이름)까지 전부 제품으로 잡혔습니다. 그런 걸로 영상을 만들 수는 없습니다.
       * 그래서 **물건 꼬리말이 붙은 것만** 남깁니다. 적게 나오더라도 틀린 걸 주는 것보다 낫습니다.
       * (제품을 하나 잘못 고르면 영상 한 편이 통째로 날아갑니다.)
       */
      if (!PRODUCT_TAIL.test(w)) continue;

      const prev = found.get(w);
      // 같은 제품이 여러 영상에 나오면 **가장 잘 터진 영상**을 근거로 답니다.
      if (!prev || (r.efficiency || 0) > (prev.efficiency || 0)) {
        found.set(w, {
          product: w,
          efficiency: r.efficiency,
          views: r.views,
          subs: r.subs,
          duration: r.duration,
          fromTitle: r.title,
          url: r.url,
          videos: prev ? prev.videos + 1 : 1,
        });
      } else {
        prev.videos += 1;
      }
    }
  }

  const products = [...found.values()]
    // 여러 영상에 걸쳐 나온 제품이 더 확실한 신호입니다. 같으면 효율 순.
    .sort((a, b) => (b.videos - a.videos) || ((b.efficiency || 0) - (a.efficiency || 0)))
    .slice(0, max);

  return {
    ok: true,
    표본: list.length,
    products,
    note: products.length
      ? "쿠팡에 같은 물건이 있는지 확인한 뒤에 영상을 만드십시오. 팔 물건이 없으면 조회수가 나와도 돈이 안 됩니다."
      : "제품명을 못 뽑았습니다. 제목이 '꿀템 모음'처럼 두루뭉술한 영상만 걸린 경우입니다.",
  };
}

module.exports = { extract, hashtags, words, NOT_PRODUCT, PRODUCT_TAIL };
