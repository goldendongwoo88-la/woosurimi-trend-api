/**
 * 쇼핑 쇼츠 에이전트 — 2026-09-01
 *
 * 사장님이 그린 흐름 그대로:
 *   뜨는 영상 찾기 → 어떻게 만든 건지 분석 → 팔 제품 뽑기 → 쿠팡 확인 → 기획서 → 렌더 → 업로드
 *
 * ── 지금 어디까지 자동인가 (솔직하게) ──
 *   1) 뜨는 영상 찾기      ✅ youtubeFinder
 *   2) 제작 방식 분석      ✅ winnerPattern
 *   3) 팔 제품 뽑기        ✅ productExtract
 *   4) 쿠팡 제품 확인      ❌ 키가 없으면 **멈춥니다**
 *   5) 기획서(제목·구성표)  ✅ 여기서 만듭니다 (AI 안 씀, 0원)
 *   6) 영상 렌더           ⚠️ 소재·나레이션 붙이면 가능
 *   7) 유튜브 업로드       ❌ OAuth 인증 필요
 *
 * ⚠️ **4번에서 멈추는 건 고장이 아니라 설계입니다.**
 * 33개 채널 분석에서 가장 비싼 실수가 "팔 물건 없는 소재로 영상부터 만드는 것"이었습니다.
 * 쿠팡에 물건이 없으면 조회수가 100만이 나와도 0원입니다. 그래서 확인 전에는 렌더로 안 넘깁니다.
 *
 * ⚠️ **남의 영상은 안 가져옵니다.** 가져오는 건 제품 신호와 형식(제목·길이·구성)뿐입니다.
 * 형식은 저작권 대상이 아니고, 영상 자체를 옮기면 유튜브 재사용 콘텐츠 정책으로 수익화가 거절됩니다.
 */

const YTF = require("./youtubeFinder");
const WP = require("./winnerPattern");
const PE = require("./productExtract");
const SV = require("./stockVideo");

let coupang = null;
try { coupang = require("./coupangPartners"); } catch { /* 없어도 나머지는 돕니다 */ }

/**
 * 제목 후보 만들기.
 *
 * AI를 안 씁니다. **공식이 이미 숫자로 나와 있으므로 틀에 넣기만 하면 됩니다.**
 * (제목 27자·숫자 64%·단정형·훅어휘 — winnerPattern이 잰 값)
 * 사장님이 이 중에서 고르시면 됩니다. 열 개를 지어내는 데 돈을 쓸 이유가 없습니다.
 */
/**
 * 한국어 조사 붙이기 — "네트망로"가 아니라 "네트망으로".
 * 받침이 없거나 받침이 ㄹ이면 '로', 그 밖에는 '으로'.
 * 실측에서 "3천원 네트망로 공간 두 배"가 나왔습니다. 제목에 이런 게 섞이면 못 씁니다.
 */
/** 받침 여부로 을/를, 이/가, 은/는을 고릅니다. "접시선반를"처럼 나오면 광고가 아마추어로 보입니다. */
function josa(word, withJong, withoutJong) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return withoutJong;
  return ((code - 0xac00) % 28) ? withJong : withoutJong;
}

function ro(word) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "로";      // 한글이 아니면 그냥 '로'
  const jong = (code - 0xac00) % 28;                    // 0 = 받침 없음, 8 = ㄹ
  return (jong === 0 || jong === 8) ? "로" : "으로";
}

function makeTitles(product, pattern, { store = "다이소", price = "" } = {}) {
  const p = product;
  const won = price ? `${price} ` : "";
  const hooks = (pattern?.훅어휘 || []).map((h) => h.word);
  const has = (w) => hooks.includes(w);

  const pool = [
    `${store}에서 보이면 무조건 담는 ${p}`,
    `${won}${p} 하나로 끝나는 정리 4가지`,
    `${store} ${p}, 이걸 왜 이제 알았을까`,
    `${p} 활용법 3가지 알려드릴게요`,
    `${store}에서 이거 하나만 사세요`,
    `${won}${p}${ro(p)} 공간 두 배 만드는 법`,
    `${store} ${p} 쓰는 사람만 아는 것`,
    `${p} 없이 살던 시절로 못 돌아갑니다`,
    `${store} 신상 중에 이거 하나는 사세요`,
    /**
     * ⚠️ 가격이 들어가야만 말이 되는 틀은 가격이 있을 때만 씁니다.
     * 실측에서 가격 없이 돌렸더니 "으로 끝내는 네트망 활용 TOP3"처럼 앞이 잘린 문장이 나왔습니다.
     * 사장님이 고르는 목록에 깨진 문장이 섞이면 목록 전체를 못 믿게 됩니다.
     */
    ...(price ? [`${price}으로 끝내는 ${p} 활용 TOP3`] : [`${p} 활용 TOP3, 이건 꼭 사세요`]),
  ];

  // 공식에 맞는지 점수를 매겨 위로 올립니다. 사람이 고르기 쉽게.
  const target = pattern?.제목?.글자수_중앙값 || 27;
  return pool
    .map((t) => {
      let score = 0;
      if (/\d/.test(t)) score += 3;                       // 실측 64%가 숫자를 넣었다
      if (Math.abs(t.length - target) <= 6) score += 3;   // 길이가 중앙값에 가까울수록
      if (hooks.some((h) => t.includes(h))) score += 2;   // 훅 어휘를 썼으면
      if (!/[?？]/.test(t)) score += 1;                   // 물음표는 5%뿐 — 단정형이 이긴다
      return { title: t, chars: t.length, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * ── 릴스 구조: H-V-P-R-C ──
 * 갓생맘 REELS_SCRIPT 공식. 30초 안에 이 다섯 칸을 채우면 끝까지 봅니다.
 *   H(Hook)     0~3초   손가락을 멈추게 하는 문제 장면
 *   V(Value)    3~10초  "이게 왜 필요한가"
 *   P(Proof)    10~20초 실제로 되는 장면 (여기가 저장을 만듭니다)
 *   R(Result)   20~27초 전/후 대비
 *   C(CTA)      27~33초 링크 안내
 *
 * ⚠️ 우리 실측(파인더 22편)과도 맞습니다: 상위 영상 전부 **문제 장면으로 열었습니다.**
 * 정리된 모습으로 시작한 영상은 상위권에 없었습니다.
 */
function buildStructure(product, seconds = 33) {
  const s = Math.max(15, Math.min(60, seconds));
  const at = (r) => Math.round(s * r);
  return [
    { from: 0,        to: at(0.09), part: "H 훅",   what: `${product} 없이 불편한 상태 (문제 장면)`, note: "정리된 모습 말고 엉망인 모습으로 여십시오" },
    { from: at(0.09), to: at(0.30), part: "V 가치", what: `${product}${josa(product, "을", "를")} 꺼내며 가격 한 줄`,          note: "숫자를 화면에 박습니다" },
    { from: at(0.30), to: at(0.60), part: "P 증명", what: "실제로 쓰는 장면 2~3컷",                 note: "여기가 저장을 만듭니다. 손이 나와야 합니다" },
    { from: at(0.60), to: at(0.82), part: "R 결과", what: "전/후 대비",                             note: "같은 각도로 찍어야 대비가 삽니다" },
    { from: at(0.82), to: s,        part: "C 안내", what: "제품컷 + '링크는 설명란'",               note: "대가성 문구는 설명란 첫 줄" },
  ];
}

/**
 * ── 훅 7유형 ──
 * 갓생맘 HOOK_3SEC. 어떤 심리를 건드리는지까지 붙여둡니다 — 고를 때 근거가 됩니다.
 */
function hookLines(product) {
  return [
    { type: "문제 지적", line: `이렇게 쓰고 계시죠`,                 psych: "찔림 — 내 얘기 같아서 멈춘다" },
    { type: "손실 회피", line: `${product} 모르면 계속 손해입니다`,  psych: "놓치기 싫음" },
    { type: "숫자 충격", line: `단돈 ○천원인데 이게 됩니다`,          psych: "가격 대비 기대 위반" },
    { type: "반전",     line: `비싼 거 살 필요 없었습니다`,          psych: "믿던 것이 뒤집힘" },
    { type: "권위",     line: `살림 고수들이 다 쓰는 것`,            psych: "남들도 쓴다는 안심" },
    { type: "금지",     line: `이거 모르고 사지 마세요`,             psych: "경고는 무시하기 어렵다" },
    { type: "즉시성",   line: `3초면 끝납니다`,                      psych: "부담 없음" },
  ];
}

/** 스톡 영상 검색어 — 제품명을 그대로 영어로 넣으면 잘 안 나옵니다. 쓰임새로 찾습니다. */
function sceneQueries(product) {
  const MAP = [
    [/선반|정리|수납|바구니|랙/, ["kitchen shelf organizer", "dish rack kitchen", "tidy kitchen counter"]],
    [/용기|병|펌프|디스펜서/, ["foam soap dispenser", "skincare bottle pump", "washing hands foam"]],
    [/칼|도마|주걱|국자|집게/, ["cutting vegetables closeup", "kitchen tools cooking", "chopping board knife"]],
    [/청소|솔|수세미|행주/, ["cleaning kitchen sink", "wiping counter cloth", "home cleaning routine"]],
    [/조명|램프|충전/, ["desk lamp warm light", "cozy room lighting", "phone charging desk"]],
    [/크림|세럼|앰플|틴트|펜슬|마스크/, ["skincare routine closeup", "applying cream face", "makeup products flatlay"]],
  ];
  for (const [re, qs] of MAP) if (re.test(product)) return qs;
  return ["home organization", "daily necessities", "tidy home closeup"];
}

/**
 * 파이프라인 한 바퀴.
 *
 * @param keywords 훑을 키워드들
 * @param opts.want 몇 개 제품까지 볼지
 */
async function run(keywords, { days = 90, maxSubs = 100000, minEfficiency = 5, want = 3, withStock = true } = {}) {
  const kws = (Array.isArray(keywords) ? keywords : [keywords]).filter(Boolean).slice(0, 6);
  const log = [];
  const say = (m) => { log.push(m); console.log(m); };

  // ── 1) 뜨는 영상 찾기 ──
  say(`[1/5] 뜨는 영상 찾는 중 — 키워드 ${kws.length}개`);
  if (!YTF.hasApiKey()) {
    return { ok: false, stage: "찾기", error: "YOUTUBE_API_KEY가 없습니다. 파인더가 못 돕니다.", log };
  }
  const all = [];
  const seen = new Set();
  let quota = 0;
  for (const kw of kws) {
    const r = await YTF.keywordSearch(kw, { days, maxSubs, minEfficiency, shortsOnly: true });
    quota += r.quotaUsed || 0;
    for (const v of r.results) if (!seen.has(v.id)) { seen.add(v.id); all.push(v); }
  }
  all.sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0));
  say(`      영상 ${all.length}편 확보 (할당량 ${quota}유닛)`);
  if (all.length < 3) {
    return { ok: false, stage: "찾기", error: "영상이 너무 적습니다. 키워드를 바꾸거나 최소 효율을 낮추세요.", log };
  }

  // ── 2) 어떻게 만든 건지 분석 ──
  say("[2/5] 제작 방식 분석 중");
  const pattern = WP.analyze(all);
  if (pattern.ok) {
    say(`      제목 ${pattern.제목.글자수_중앙값}자 · 숫자 ${pattern.제목.숫자_포함} · 길이 ${pattern.길이.초_중앙값}초`);
    say(`      게시: ${pattern.게시시점.요일.join(", ")} / ${pattern.게시시점.시간대.join(", ")}`);
  }

  // ── 3) 팔 제품 뽑기 ──
  say("[3/5] 팔 제품 뽑는 중");
  const pe = PE.extract(all, { max: want * 3 });
  const picks = (pe.products || []).slice(0, want);
  say(`      제품 후보 ${picks.length}개: ${picks.map((p) => p.product).join(", ") || "없음"}`);
  if (!picks.length) {
    return { ok: false, stage: "제품", error: pe.note, pattern, log };
  }

  // ── 4) 쿠팡 확인 ──
  say("[4/5] 쿠팡에 팔 물건이 있는지 확인");
  const configured = coupang?.isConfigured?.() || false;
  for (const p of picks) {
    if (!configured) {
      /**
       * ⚠️ 키가 없을 때 "팔 수 있다"고 넘기면 안 됩니다.
       * 없는 걸 있다고 하면 그 소재로 영상을 만들었다가 통째로 날립니다.
       * 모르면 **모른다고** 표시하고 사람이 확인하게 둡니다.
       */
      p.coupang = { sellable: null, why: "쿠팡 파트너스 키가 없어 확인하지 못했습니다" };
      continue;
    }
    try {
      p.coupang = await coupang.checkSellable(p.product);
    } catch (e) {
      p.coupang = { sellable: null, why: `확인 실패: ${e.message}` };
    }
  }
  if (!configured) {
    say("      ⚠ 쿠팡 키가 없습니다 — 팔 수 있는지 확인 못 했습니다. 사장님이 직접 보셔야 합니다.");
  }

  // ── 5) 기획서 ──
  say("[5/5] 기획서 작성 (AI 안 씀)");
  for (const p of picks) {
    p.titles = makeTitles(p.product, pattern);
    p.sceneQueries = sceneQueries(p.product);
    if (withStock) {
      const g = await SV.gatherScenes(p.sceneQueries, { perScene: 2 }).catch(() => null);
      p.stock = g ? { clips: g.total, scenes: g.scenes } : null;
    }
    p.publishAt = pattern.ok ? pattern.게시시점 : null;
    p.targetSeconds = pattern.ok ? pattern.길이.초_중앙값 : 33;
    p.structure = buildStructure(p.product, p.targetSeconds);   // H-V-P-R-C
    p.hooks = hookLines(p.product);                              // 훅 7유형
  }
  say(`      제품 ${picks.length}개 기획 완료`);

  const blocked = [];
  if (!configured) blocked.push("쿠팡 파트너스 키 (COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY)");
  blocked.push("유튜브 업로드 OAuth (지금 키로는 업로드 불가)");

  return {
    ok: true,
    keywords: kws,
    videos: all.length,
    quotaUsed: quota,
    pattern,
    products: picks,
    blocked,
    log,
    note: configured
      ? "쿠팡 확인까지 끝났습니다. 팔 수 있는 제품만 렌더로 넘기십시오."
      : "쿠팡 확인을 못 했습니다. 제품이 실제로 팔리는지 보고 나서 영상을 만드십시오.",
  };
}

module.exports = { run, makeTitles, sceneQueries, buildStructure, hookLines, josa };
