/**
 * 벤치마킹 블로거 **제목 후킹 문법** 실측 — 홈판 / 뷰티 메이트 / 패션 메이트.
 *
 * ⚠️ mate-analyze.js는 "어떤 낱말이 자주 나오는가"(후기·난리·코디…)를 셉니다.
 * 여기서는 다른 걸 봅니다 — **문장을 어떻게 짜는가.**
 *   · 앞머리를 끊고 시작하는가 ("미우미우 인줄 알았는데..")
 *   · 주어를 감추는가 ("여배우", "그 아이돌")
 *   · 따옴표로 말을 따오는가
 *   · 숫자·가격·나이를 박는가
 * 낱말은 유행 따라 바뀌지만 **문장 짜는 틀은 오래 갑니다.** 그래서 따로 셉니다.
 *
 * ⚠️ 제목·날짜만 받습니다(공개 글 목록). 본문·사진은 안 건드립니다. AI 0원.
 *
 *   node scripts/mate-title-hooks.js          (블로그당 최근 20편)
 *   node scripts/mate-title-hooks.js --n=30
 */

const fs = require("fs");
const path = require("path");
const { fetchPostList } = require("../src/naverBlogData");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k, d) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split("=").slice(1).join("=") : d;
};
const N = Math.max(5, Math.min(50, Number(arg("n", 20))));

const GROUPS = {
  "사장님 블로그": ["man_is_best"],
  "홈판 벤치마킹": ["nidle_831"],
  "뷰티 메이트": ["1hello2", "sunnyya314", "qmfosej", "kiddy28", "tnwjd955", "yazeyazasu", "yangeunb", "cosreader",
    "gh676800", "bborie-", "senman456", "akyj010323", "glowbyseoul", "myhelloyj", "jieun1520", "taerious_", "kuroinu92"],
  "패션 메이트": ["goodface0863", "styleknowhow_seoj", "gguu1029", "kims718", "mira841213", "ruddyluna", "tjthdus94",
    "ohye1991", "dasoms2s2", "longtimeknowsee", "luckyjaemin", "viva-a", "yeonju_hhh", "maryjane1440",
    "somethingthatilove", "jayuyu", "cocoleenice", "qkrdmsdhr95", "goodlucky1215", "keita_hitomi", "jollini152", "sso965"],
};
try {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gossip-blogs.json"), "utf8"));
  GROUPS["홈판 벤치마킹"].push(...Object.values(g.found).map((x) => x.id));
} catch {}

/**
 * 문장 틀 — 왜 이게 후킹인지 한 줄로 적어둡니다.
 * (제목 추천기가 이 설명을 그대로 사장님께 보여줍니다)
 */
const HOOKS = {
  "앞머리 끊기": {
    why: "첫 마디를 던지고 '..'로 끊습니다. 끊긴 자리가 궁금해서 눈이 멈춥니다.",
    test: (t) => /^[^…\.]{3,26}(\.\.+|…)/.test(t),
    example: "미우미우 인줄 알았는데.. 다른 가방 멘 장원영 패션",
  },
  "따옴표로 말 따오기": {
    why: "사람이 실제로 한 말은 설명문보다 장면이 그려집니다.",
    test: (t) => /^["“'‘]/.test(t),
    example: '"진짜 AI 아니야?" 한소희, 비현실적 미모',
  },
  "주어 감추기": {
    why: "이름 대신 '여배우·그 아이돌'로 두면 누구인지 확인하러 들어옵니다.",
    test: (t) => /여배우|남배우|여자 ?아이돌|남자 ?아이돌|여돌|남돌|그 ?배우|연예인|인플루언서|모델/.test(t),
    example: "결혼 안하면 안늙네..여전히 예쁜 45세 여배우 시상식 드레스",
  },
  "반전 걸기": {
    why: "'인 줄 알았는데'로 기대를 세웠다가 뒤집습니다.",
    test: (t) => /줄 알았|인 줄|알고보니|알고 보니|반전|의외로|인데\.\.|였는데/.test(t),
    example: "95억 청담동 건물주인데..명품 제로였던 연예인 공항 패션",
  },
  "맞대결": {
    why: "둘을 붙여놓으면 어느 쪽인지 보고 싶어집니다.",
    test: (t) => /vs|VS|보다|제치고|이겼|압살|넘사|대결|갈린/.test(t),
    example: "여돌도 배우 미모는 못 따라가네..난리난 머메이드 드레스 대결",
  },
  // ⚠️ 아래 둘은 다른 세션(woosurimi-trend-api-36)이 따로 잰 표본 131편에서 나온 것을
  // 우리 표본 1,100개로 다시 확인하려고 넣었습니다. 남의 숫자를 그대로 옮겨 적지 않습니다.
  "전언 표현": {
    why: "'~다더니'로 남의 말을 옮기면 단정하지 않으면서 화제성을 씁니다. 가십에서는 법적 안전장치이기도 합니다.",
    test: (t) => /다더니|라더니|다는데|라는데|다는 |라는 |한다는|였다는|이라는/.test(t),
    example: "95억 건물주 됐다는.. 덩달아 유행하는 연예인 패션",
  },
  "반전 접속(~인데..)": {
    why: "앞절에 놀랄 조건을 걸고 '인데..'로 끊습니다. 앞머리 끊기와 세트로 쓰입니다.",
    test: (t) => /(인데|는데|ㄴ데|했는데|됐는데|샀는데)\s*(\.\.+|…)/.test(t),
    example: "95억 청담동 건물주인데..명품 제로였던 연예인 공항 패션",
  },
  "숫자 박기": { why: "구체적인 수치가 눈에 걸립니다.", test: (t) => /\d/.test(t), example: "화제의 161cm 장원영 메이크업" },
  "나이·연차": { why: "나이는 그 자체로 비교를 부릅니다.", test: (t) => /\d+ ?(살|세|년차|개월차|kg|cm)/.test(t), example: "38살 태연vs55살 김혜수 히피펌" },
  "가격": { why: "돈은 제일 센 숫자입니다.", test: (t) => /\d[\d,]* ?(원|만원|억)/.test(t), example: "‘60억 아파트’ 입성한 성해은" },
  "물음표": { why: "물으면 답을 보러 들어옵니다.", test: (t) => /\?/.test(t), example: "이게 실화?" },
  "감탄 꼬리": { why: "말끝을 흐리거나 감탄사를 붙이면 사람 말투가 됩니다.", test: (t) => /ㄷㄷ|ㅋㅋ|헐|;;|ㅎㄷㄷ|하네|네요$|더라/.test(t), example: "생각보다 더 예쁜 장원영 단발 ㄷㄷ..." },
  "정보형(후기·추천)": { why: "검색으로 들어오는 글의 틀입니다. 홈판 후킹과는 다른 길입니다.", test: (t) => /후기|추천|방법|하는 법|꿀팁|리뷰|내돈내산|정보/.test(t), example: "글로우 클렌징폼 추천! 지성피부 효소세안제 후기" },
  "브랜드·제품명": { why: "검색 유입용. 제품명을 그대로 박습니다.", test: (t) => /[A-Za-z]{3,}|[가-힣]+(크림|세럼|쿠션|앰플|토너|립|팩트|샴푸|워시)/.test(t), example: "바닐라코 쉬어 블러 팟 밀크모브" },
};

(async () => {
  const rows = [];
  for (const [group, ids] of Object.entries(GROUPS)) {
    for (const id of ids) {
      const r = await fetchPostList(id, { countPerPage: N }).catch(() => null);
      const posts = (r && r.posts) || [];
      for (const p of posts) rows.push({ group, id, title: p.title, addDate: p.addDate });
      console.log(`  ${group.padEnd(14)} ${id.padEnd(22)} 제목 ${posts.length}개`);
      await sleep(400);
    }
  }

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const summary = {};
  for (const group of Object.keys(GROUPS)) {
    const T = rows.filter((r) => r.group === group).map((r) => r.title).filter(Boolean);
    if (!T.length) continue;
    const hooks = {};
    for (const [k, h] of Object.entries(HOOKS)) hooks[k] = pct(T.filter((t) => h.test(t)).length, T.length);
    // 한 제목에 장치를 몇 개나 겹쳐 쓰는가
    const stacked = T.map((t) => Object.values(HOOKS).filter((h) => h.test(t)).length);
    summary[group] = {
      blogs: new Set(rows.filter((r) => r.group === group).map((r) => r.id)).size,
      titles: T.length,
      평균길이: Math.round(T.reduce((s, t) => s + t.length, 0) / T.length),
      장치겹침평균: +(stacked.reduce((a, b) => a + b, 0) / T.length).toFixed(1),
      hooks,
      예시: T.filter((t) => Object.values(HOOKS).filter((h) => h.test(t)).length >= 4).slice(0, 6),
    };
  }

  const out = {
    madeAt: new Date().toISOString().slice(0, 10),
    method: `블로그 ${new Set(rows.map((r) => r.id)).size}곳 · 제목 ${rows.length}개 (블로그당 최근 ${N}편). AI 0원`,
    caveat: "상관관계지 인과가 아님. 제목만 봤고 조회수는 못 봄(네이버가 안 줍니다).",
    hooks: Object.fromEntries(Object.entries(HOOKS).map(([k, v]) => [k, { why: v.why, example: v.example }])),
    summary,
  };
  const file = path.join(__dirname, "..", "data", "mate-title-hooks.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 1), "utf8");

  console.log("\n" + "═".repeat(70));
  const groups = Object.keys(summary);
  const keys = Object.keys(HOOKS);
  console.log("\n장치".padEnd(20) + groups.map((g) => g.slice(0, 8).padStart(10)).join(""));
  for (const k of keys) {
    console.log(k.padEnd(20) + groups.map((g) => (summary[g].hooks[k] + "%").padStart(10)).join(""));
  }
  console.log("\n평균 길이".padEnd(20) + groups.map((g) => (summary[g].평균길이 + "자").padStart(10)).join(""));
  console.log("장치 겹침".padEnd(20) + groups.map((g) => (summary[g].장치겹침평균 + "개").padStart(10)).join(""));
  for (const g of groups) {
    console.log(`\n■ ${g} — 장치를 4개 이상 겹친 제목`);
    for (const e of summary[g].예시) console.log("   ·", e);
  }
  console.log("\n저장:", file);
})().catch((e) => { console.error("터졌습니다:", e); process.exit(1); });
