/**
 * 발행 전 법률 위험 검토.
 *
 * ⚠️ 먼저 분명히 해둘 것 — **이건 법률 자문이 아닙니다.**
 * 저는 변호사가 아니고, 이 검사가 통과했다고 안전하다는 뜻도 아닙니다.
 * 이 도구가 하는 일은 딱 하나입니다: **자주 문제가 되는 표현을 찾아서 보여주기.**
 * 최종 판단은 사장님이 하시고, 큰 건이면 변호사에게 물으셔야 합니다.
 * 그렇게 화면에도 적습니다. "안전합니다"라고 말하는 순간 거짓말이 됩니다.
 *
 * ⚠️ 왜 두 종류로 나눴나
 * 위험의 종류가 완전히 다릅니다.
 *   연예 가십 → 명예훼손·초상권 (정보통신망법 제70조)
 *   투자·경제 → 자본시장법 (유사투자자문·미등록 투자자문)
 * 한 벌로 만들면 둘 다 엉성해집니다.
 *
 * ⚠️ AI를 쓰지 않습니다.
 * 발행 직전에 누르는 기능이라 즉시 답해야 하고, 무엇이 걸렸는지
 * **정확히 어느 낱말 때문인지** 보여줘야 합니다. AI는 그걸 못 합니다.
 * 대신 규칙이라 놓치는 것이 있습니다. 그것도 화면에 적습니다.
 */

/** 위험도: high = 형사 처벌 조항이 명시적으로 걸리는 것, mid = 다툼이 될 수 있는 것 */
const PROFILES = {
  // ── 연예 가십 · 방송 ─────────────────────────────────
  gossip: {
    label: "연예 가십 · 방송",
    law: "정보통신망 이용촉진 및 정보보호 등에 관한 법률 제70조",
    penalty:
      "사실을 드러내 명예를 훼손하면 3년 이하 징역 또는 3천만원 이하 벌금, " +
      "거짓이면 7년 이하 징역 또는 5천만원 이하 벌금입니다. 사실이어도 비방 목적이면 처벌됩니다.",
    rules: [
      {
        id: "surgery",
        level: "high",
        label: "성형 단정",
        // ⚠️ 본인이 밝힌 경우까지 막으면 못 쓰는 글이 너무 많아집니다.
        // 그래서 '단정하는 말과 함께 나올 때'만 잡습니다.
        find: /(성형|코성형|눈성형|양악|쌍꺼풀|보톡스|필러|지방흡입|시술)/g,
        near: /(했|한 듯|의혹|전후|비교|티가|확실|분명|명백|인정|바꿨|손댔)/,
        why: "본인이나 소속사가 인정하지 않은 성형을 단정하면 '거짓 사실 적시'가 되어 형이 더 무겁습니다.",
        fix: "본인이 직접 밝힌 경우가 아니면 아예 다루지 마세요. 다룬다면 '○○ 매체 보도에 따르면'처럼 출처를 밝히고 보도 범위를 넘지 마세요.",
      },
      {
        id: "affair",
        level: "high",
        label: "사생활 단정",
        find: /(열애설|불륜|외도|이혼설|임신설|동거|양다리|환승연애설)/g,
        why: "본인·소속사 공식 입장이 없는 사생활을 단정하면 명예훼손과 사생활 침해가 함께 걸립니다.",
        fix: "공식 입장이 나온 것만 쓰시고, 출처를 반드시 적으세요. '~라는 말이 돈다'도 적시로 봅니다.",
      },
      {
        id: "crime",
        level: "high",
        label: "범죄 관련 단정",
        find: /(마약|도박|음주운전|학폭|탈세|횡령|사기|성추행|성폭행|폭행)/g,
        near: /(했|혐의|의혹|들통|적발|밝혀|드러|정황|저질)/,
        why: "확정 판결 전에는 무죄 추정입니다. 단정하면 허위사실 적시가 될 수 있습니다.",
        fix: "수사·재판 단계를 그대로 적으세요. '입건', '기소', '1심 선고'처럼요. '했다'로 끝내지 마세요.",
      },
      {
        id: "body",
        level: "mid",
        label: "외모·신체 평가",
        find: /(살쪘|살찐|폭삭|늙었|망가졌|성괴|얼굴 갈아|몸매 논란|노출 논란)/g,
        why: "모욕죄가 될 수 있습니다. 특히 부정적 평가를 실명과 붙이면 위험합니다.",
        fix: "변화를 사실로만 적고 평가를 붙이지 마세요.",
      },
      {
        id: "rumor",
        level: "mid",
        label: "출처 없는 전언",
        find: /(카더라|찌라시|~라는 소문|익명 관계자|한 매체에 따르면|측근에 따르면)/g,
        why: "출처가 특정되지 않으면 인용이 아니라 본인 주장으로 봅니다.",
        fix: "매체 이름을 정확히 밝히세요. 못 밝히겠으면 그 문장을 빼세요.",
      },
      {
        id: "photo",
        level: "high",
        label: "사진 사용",
        find: /(캡처|캡쳐|스틸컷|화보 사진|인스타 사진 출처)/g,
        why: "연예인 사진에는 저작권(찍은 사람)과 초상권(찍힌 사람)이 함께 걸립니다. 방송 캡처는 방송사 저작물입니다.",
        fix: "직접 만든 이미지나 저작권이 확인된 무료 이미지만 쓰세요.",
      },
    ],
  },

  // ── 투자 · 경제 ──────────────────────────────────────
  invest: {
    label: "투자 · 경제",
    law: "자본시장과 금융투자업에 관한 법률",
    penalty:
      "등록 없이 투자자문업을 하면 3년 이하 징역 또는 1억원 이하 벌금입니다. " +
      "2024년 개정으로 대가를 받고 종목·매매시점을 알려주는 운영이 명시적으로 규율됩니다.",
    rules: [
      {
        id: "timing",
        level: "high",
        label: "매매 시점 단정",
        // ⚠️ "지금 들어"처럼 붙여서만 찾으면 "지금 이 종목 들어가야"를 놓칩니다.
        // 실제로 놓쳤습니다. 사이에 다른 말이 끼는 게 오히려 보통입니다.
        // '지금/오늘/이번 주' 뒤 15자 안에 매수·매도 말이 오면 잡습니다.
        find: /((?:지금|오늘|이번 주|당장)[^.!?\n]{0,15}(?:사세요|사야|매수|매도|들어가|담으|올라탈|진입))|(들어갈 타이밍|손절하세요|익절하세요|물타기|풀매수|풀매도|몰빵|지금이 기회|막차)/g,
        why: "특정 시점의 매매를 권하는 것은 투자자문에 해당합니다. 등록 없이 하면 처벌 대상입니다.",
        fix: "'이런 지표가 이렇게 움직였습니다'처럼 사실만 적고, 판단은 독자에게 넘기세요.",
      },
      {
        id: "target",
        level: "high",
        label: "목표가·수익률 제시",
        find: /(목표가|목표주가|얼마까지 간다|배 간다|두 배|수익률 \d+%|\d+% 수익|원금 보장|손실 없)/g,
        why: "수익을 약속하거나 암시하면 자본시장법 외에 유사수신 문제까지 걸릴 수 있습니다.",
        fix: "예측을 단정하지 마세요. 근거가 있으면 근거와 출처만 적으세요.",
      },
      {
        id: "recommend",
        level: "high",
        label: "종목 추천",
        find: /(추천 종목|유망주|급등주|테마주|이 종목|이 코인|주목할 종목|담아야|사야 할)/g,
        why: "특정 종목을 지목해 권하는 것이 투자자문의 핵심 요건입니다.",
        fix: "종목 이름을 걸고 권하지 마세요. 산업·정책 흐름을 설명하는 데까지가 안전합니다.",
      },
      {
        id: "solicit",
        level: "high",
        label: "유료방 유도",
        find: /(리딩방|단톡방|텔레그램|오픈채팅|유료방|VIP방|입장료|회비|가입비|1:1 상담)/g,
        why: "블로그가 유료 리딩방의 홍보 통로가 되면 그 방과 함께 규율됩니다. 대가를 받는 순간 미등록 투자자문업입니다.",
        fix: "유료 상담·리딩방으로 이어지는 문구를 빼세요. 하시려면 금융위원회에 유사투자자문업 신고부터 하셔야 합니다.",
      },
      {
        id: "tax",
        level: "mid",
        label: "세무 단정",
        find: /(절세 확실|세금 안 내|이렇게 하면 비과세|법인으로 하면 무조건|신고 안 해도)/g,
        why: "세무는 개별 사정에 따라 결론이 달라집니다. 단정했다가 독자가 손해를 보면 책임 문제가 생깁니다.",
        fix: "'일반적으로 이렇습니다. 개별 상황은 세무사와 상담하세요'를 반드시 붙이세요.",
      },
      {
        id: "guarantee",
        level: "mid",
        label: "단정적 표현",
        find: /(무조건|반드시 오|절대 안 떨어|확실히 오|100%)/g,
        why: "시장 예측에 단정어를 쓰면 부당광고로 볼 수 있습니다.",
        fix: "'~할 가능성이 있습니다', '~라는 견해가 있습니다'로 바꾸세요.",
      },
    ],
  },
};

/** 표시 의무 — 협찬·광고 글에 공통으로 걸립니다. */
const DISCLOSURE = {
  received: /(제공받|협찬|지원받|무상|대여받|초청받|체험단|서포터즈|원고료|수수료를 받)/,
  marked: /(협찬|광고|유료광고|대가를 받|제공받아 작성|소정의 수수료)/,
};

function checkOne(text, rule) {
  const hits = [];
  const t = String(text);
  for (const m of t.matchAll(rule.find)) {
    // near가 있으면 그 낱말 주변에 단정하는 말이 함께 있을 때만 잡습니다.
    // 없으면 "성형" 한 단어만 나와도 걸려서 쓸 수 없는 도구가 됩니다.
    if (rule.near) {
      const around = t.slice(Math.max(0, m.index - 40), m.index + 60);
      if (!rule.near.test(around)) continue;
    }
    hits.push({
      word: m[0],
      context: t.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\s+/g, " ").trim(),
    });
    if (hits.length >= 4) break;
  }
  return hits;
}

/**
 * @param {string} title
 * @param {string} body
 * @param {"gossip"|"invest"|"auto"} kind
 */
function check({ title = "", body = "", kind = "auto" }) {
  const text = `${title}\n${body}`;
  if (!text.trim()) return { ok: false, why: "검토할 글이 없습니다." };

  // 무엇으로 볼지 스스로 정합니다. 틀릴 수 있으니 화면에 어느 기준으로 봤는지 적습니다.
  let profileKey = kind;
  if (kind === "auto") {
    // ⚠️ 위험한 낱말 개수로만 고르면, **안전하게 잘 쓴 투자 글**이 연예 기준으로
    // 넘어갑니다. 위험어가 하나도 없으니 둘 다 0점이 되어서요.
    // 실제로 "2026 금투세 이렇게 바뀝니다"가 연예 가십으로 분류됐습니다.
    // 판정은 clear로 맞게 나왔지만 화면에 엉뚱한 법 조항이 뜹니다.
    // 그래서 주제어를 먼저 봅니다.
    const investTopic =
      /(주식|증시|코스피|코스닥|나스닥|코인|비트코인|이더리움|투자|배당|ETF|펀드|부동산|청약|금리|세금|금투세|양도세|종부세|연금|재테크|자산|시총|공모주)/;
    const gossipTopic =
      /(연예|배우|가수|아이돌|드라마|예능|방송|출연|열애|결혼|이혼|시청률|팬미팅|앨범|컴백|무대)/;

    const investTopicHits = (text.match(new RegExp(investTopic, "g")) || []).length;
    const gossipTopicHits = (text.match(new RegExp(gossipTopic, "g")) || []).length;

    if (investTopicHits !== gossipTopicHits) {
      profileKey = investTopicHits > gossipTopicHits ? "invest" : "gossip";
    } else {
      // 주제로도 안 갈리면 그때 위험어로 봅니다.
      const investHits = PROFILES.invest.rules.reduce((n, r) => n + (text.match(r.find) || []).length, 0);
      const gossipHits = PROFILES.gossip.rules.reduce((n, r) => n + (text.match(r.find) || []).length, 0);
      profileKey = investHits > gossipHits ? "invest" : "gossip";
    }
  }
  const profile = PROFILES[profileKey] || PROFILES.gossip;

  const findings = [];
  for (const rule of profile.rules) {
    const hits = checkOne(text, rule);
    if (hits.length)
      findings.push({
        id: rule.id,
        level: rule.level,
        label: rule.label,
        why: rule.why,
        fix: rule.fix,
        hits,
      });
  }

  // 대가성 표기 — 받은 흔적이 있는데 표시가 없으면 표시광고법 문제입니다.
  if (DISCLOSURE.received.test(text) && !DISCLOSURE.marked.test(text)) {
    findings.push({
      id: "disclosure",
      level: "high",
      label: "대가성 표기 누락",
      why: "무언가 제공받았다는 내용이 있는데 표시가 보이지 않습니다. 표시·광고의 공정화에 관한 법률 위반이 될 수 있습니다.",
      fix: "글 첫머리나 끝에 '이 글은 ○○로부터 제품을 제공받아 작성했습니다'를 눈에 띄게 넣으세요.",
      hits: [],
    });
  }

  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1));
  const high = findings.filter((f) => f.level === "high").length;

  return {
    ok: true,
    profile: profileKey,
    profileLabel: profile.label,
    law: profile.law,
    penalty: profile.penalty,
    findings,
    high,
    verdict: high ? "hold" : findings.length ? "review" : "clear",
    disclaimer:
      "이 검사는 법률 자문이 아닙니다. 자주 문제가 되는 표현을 찾아 보여줄 뿐이고, " +
      "통과했다고 안전하다는 뜻이 아닙니다. 규칙으로 찾는 방식이라 놓치는 것도 있습니다. " +
      "판단은 사장님이 하시고, 큰 건은 변호사에게 물으세요.",
  };
}

module.exports = { check, PROFILES };
