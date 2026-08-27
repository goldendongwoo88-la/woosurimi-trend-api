/**
 * 뷰티·패션 메이트 제목 분석 — 골든(뷰티 메이트 목표)·차수리미(패션 메이트 목표)용.
 *
 * ⚠️ 왜 실측인가: 사장님이 손으로 모은 제목 60여 개도 훌륭하지만, 한 사람이
 * 눈으로 모으면 눈에 띈 것만 모입니다. 여기서는 메이트·벤치마킹 블로그 30곳의
 * 최근 글 제목을 전부 긁어(공개 목록) 빈도로 셉니다. 인상이 아니라 숫자로.
 *
 * ⚠️ 남의 본문은 안 가져옵니다. 제목·날짜만 봅니다 (공개 글 목록 API).
 * ⚠️ AI 0원. 블로그 사이 700ms.
 *
 * 결과: ① 분석 보고서(txt) ② 키워드 은행(data/mate-keywords.json)
 *       — 은행은 제목 추천·관심 키워드 등록의 재료가 됩니다.
 */

const fs = require("fs");
const path = require("path");
const { fetchPostList } = require("../src/naverBlogData");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 사장님이 주신 명단 (8월 메이트 + 벤치마킹)
// 가십 벤치마킹은 닉네임→주소 역추적 결과(data/gossip-blogs.json)에서 불러옵니다.
const BLOGS = {
  "뷰티 메이트": ["1hello2", "sunnyya314", "qmfosej", "kiddy28", "tnwjd955", "yazeyazasu", "yangeunb", "cosreader"],
  "패션 메이트": ["goodface0863", "styleknowhow_seoj", "gguu1029", "kims718", "mira841213", "ruddyluna", "tjthdus94", "ohye1991", "dasoms2s2", "longtimeknowsee"],
  "패션 벤치마킹": ["luckyjaemin", "viva-a", "yeonju_hhh", "maryjane1440", "somethingthatilove", "jayuyu", "cocoleenice", "qkrdmsdhr95", "goodlucky1215", "keita_hitomi", "jollini152", "sso965"],
};

// 연예인 이름 사전 — 사장님 수집본 + 요즘 자주 오르내리는 이름.
// ⚠️ 여기 없는 이름은 못 셉니다. 분석 보고서에 그 한계를 적습니다.
// ⚠️ "리즈"(리즈시절)·"레이"(얼그레이·레이어드)는 다른 말에 묻혀 엉터리로 세어져서
// 뺐습니다. 실제로 리즈 23회·레이 19회로 잡혔는데 표본을 보니 대부분 오염이었습니다.
// "뷔"는 "데뷔"에 걸리므로 아래 hasName이 외자 이름을 따로 다룹니다.
const CELEBS = [
  "카리나", "장원영", "제니", "전지현", "신민아", "한소희", "고윤정", "김지원", "츠키", "유나",
  "김연아", "정은채", "신지", "안유진", "윈터", "닝닝", "지젤", "이서",
  "민지", "하니", "다니엘", "해린", "혜인", "설윤", "규진", "카즈하", "사쿠라", "김채원",
  "허윤진", "홍은채", "아이유", "수지", "태연", "지수", "로제", "리사", "김고은", "한지민",
  "송혜교", "손예진", "김태리", "김유정", "김세정", "박보영", "박은빈", "문가영", "노윤서",
  "차은우", "뷔", "정국", "지민", "박보검", "이도현", "변우석", "송강", "안효섭",
];

// 제목 공식 낱말 — 사장님 분석 + 홈판 후킹 문법.
const FORMULA = [
  "오늘자", "무보정", "쌩얼", "근황", "레전드", "역대", "전/후", "비교", "후기", "찐후기",
  "메이크업", "화장법", "화장", "헤메코", "헤어", "머리", "단발", "중단발", "칼단발", "장발",
  "레이어드", "펌", "앞머리", "똥머리", "포니테일", "올백", "가르마",
  "다이어트", "몸매", "비율", "kg", "체지방", "뼈말라",
  "피부", "모공", "선크림", "샴푸", "트리트먼트", "렌즈", "안경", "눈썹",
  "룩", "코디", "스타일링", "핏", "청바지", "나시", "원피스", "가을", "여름",
  "분명", "알고보니", "못알아", "난리", "논란", "화제", "압살", "넘사벽", "유일한",
];

const norm = (s) => String(s || "").replace(/<[^>]+>/g, "").trim();

// 가십 벤치마킹 — 역추적으로 대문 제목까지 확인된 곳만.
try {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gossip-blogs.json"), "utf8"));
  BLOGS["가십 벤치마킹"] = Object.values(g.found).map((x) => x.id);
} catch {}
// 6·7월 뷰티 메이트 — 전체 명단은 비공개라, 본인 인증글(선정 후기)로 확인한 곳들.
try {
  const m67 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "mate67-blogs.json"), "utf8"));
  BLOGS["뷰티 메이트 6·7월"] = m67.ids;
} catch {}

(async () => {
  const rows = [];   // {group, blogId, title, date}
  const failed = [];

  for (const [group, ids] of Object.entries(BLOGS)) {
    for (const id of ids) {
      try {
        const r = await fetchPostList(id, { countPerPage: 30 });
        const list = ((r && (r.posts || r.items)) || r || []);
        let n = 0;
        for (const p of list) {
          const title = norm(p.title);
          if (!title) continue;
          rows.push({ group, blogId: id, title, date: String(p.addDate || "").slice(0, 10) });
          n++;
        }
        console.log(`  ${group} · ${id} → 제목 ${n}개`);
      } catch (e) {
        failed.push(`${id} (${e.message})`);
        console.log(`  ${group} · ${id} → 실패: ${e.message}`);
      }
      await sleep(700);
    }
  }

  console.log(`\n모은 제목: ${rows.length}개 (실패 ${failed.length}곳)`);

  // ── 세기 ──
  // 외자 이름(뷔)은 앞뒤가 한글이 아닐 때만 — "데뷔"에 걸리면 안 됩니다.
  const hasWord = (t, w) =>
    w.length >= 2 ? t.includes(w) : new RegExp(`(^|[^가-힣])${w}([^가-힣]|$)`).test(t);
  const count = (dict, words, getText) => {
    for (const row of rows) {
      const t = getText(row);
      for (const w of words) {
        if (hasWord(t, w)) {
          if (!dict[w]) dict[w] = { n: 0, sample: [] };
          dict[w].n++;
          if (dict[w].sample.length < 3) dict[w].sample.push(row.title);
        }
      }
    }
  };

  const celebHits = {}, formulaHits = {};
  count(celebHits, CELEBS, (r) => r.title);
  count(formulaHits, FORMULA, (r) => r.title);

  const sorted = (d) => Object.entries(d).sort((a, b) => b[1].n - a[1].n);

  // 제목 모양 통계
  const stats = {
    total: rows.length,
    withCeleb: rows.filter((r) => CELEBS.some((c) => hasWord(r.title, c))).length,
    withNumber: rows.filter((r) => /\d/.test(r.title)).length,
    withQuestion: rows.filter((r) => /\?/.test(r.title)).length,
    withDots: rows.filter((r) => /\.\.\.|…/.test(r.title)).length,
    withBest: rows.filter((r) => /BEST|best|TOP|top|순위|\d위/.test(r.title)).length,
    avgLen: Math.round(rows.reduce((a, r) => a + r.title.length, 0) / Math.max(1, rows.length)),
  };

  // ── 저장 ──
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const bank = {
    madeAt: day,
    source: `메이트·벤치마킹 블로그 ${Object.values(BLOGS).flat().length}곳, 제목 ${rows.length}개 실측`,
    celebs: sorted(celebHits).map(([w, v]) => ({ word: w, n: v.n, sample: v.sample })),
    formulas: sorted(formulaHits).map(([w, v]) => ({ word: w, n: v.n, sample: v.sample })),
    stats,
    // 사장님이 손으로 모은 제목들 — 실측과 별개로 보존합니다 (원문 그대로).
    bossPicksNote: "사장님 수집 제목은 별도 파일(바탕화면 메모)에 있습니다",
  };
  const dataFile = path.join(__dirname, "..", "data", "mate-keywords.json");
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(bank, null, 1), "utf8");

  const report = [
    `뷰티·패션 메이트 제목 실측 분석 — ${day}`,
    `재료: 블로그 ${Object.values(BLOGS).flat().length}곳 · 제목 ${rows.length}개${failed.length ? ` · 못 읽은 곳 ${failed.length}: ${failed.join(", ")}` : ""}`,
    "",
    "━━ 제목 모양 (전체 대비) ━━",
    `  연예인 이름 포함: ${stats.withCeleb}개 (${Math.round(stats.withCeleb / stats.total * 100)}%)`,
    `  숫자 포함: ${stats.withNumber}개 (${Math.round(stats.withNumber / stats.total * 100)}%)`,
    `  말줄임(...) : ${stats.withDots}개 (${Math.round(stats.withDots / stats.total * 100)}%)`,
    `  물음표: ${stats.withQuestion}개 (${Math.round(stats.withQuestion / stats.total * 100)}%)`,
    `  BEST/TOP/순위: ${stats.withBest}개 (${Math.round(stats.withBest / stats.total * 100)}%)`,
    `  평균 길이: ${stats.avgLen}자`,
    "",
    "━━ 무리별 연예인 제목 비중 ━━",
    ...Object.keys(BLOGS).map((g) => {
      const mine = rows.filter((r) => r.group === g);
      const withC = mine.filter((r) => CELEBS.some((c) => hasWord(r.title, c))).length;
      return `  ${g}: 제목 ${mine.length}개 중 연예인 ${withC}개 (${mine.length ? Math.round(withC / mine.length * 100) : 0}%)`;
    }),
    "",
    "━━ 연예인 이름 빈도 (상위 20) ━━",
    ...sorted(celebHits).slice(0, 20).map(([w, v]) => `  ${w} ${v.n}회 — 예: ${v.sample[0] || ""}`),
    "",
    "━━ 공식 낱말 빈도 (상위 30) ━━",
    ...sorted(formulaHits).slice(0, 30).map(([w, v]) => `  ${w} ${v.n}회`),
    "",
    "⚠️ 한계: 연예인 사전에 없는 이름은 못 셌습니다. 위 통계는 최근 글 30개씩 기준입니다.",
  ].join("\n");

  const outFile = "C:\\Users\\Admin\\Desktop\\포스팅 자료\\제안\\메이트-제목-분석-" + day + ".txt";
  fs.writeFileSync(outFile, report, "utf8");
  console.log("\n" + report.split("\n").slice(0, 30).join("\n"));
  console.log(`\n보고서: ${outFile}`);
  console.log(`키워드 은행: ${dataFile}`);
})();
