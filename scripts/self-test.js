/**
 * 도구 50개 자가 점검.
 *
 * 왜 만들었나 — 화면이 뜨는 것과 도구가 실제로 도는 것은 다릅니다.
 * 손님이 발견하기 전에 우리가 먼저 알아야 합니다.
 *
 * 쓰는 법
 *   node scripts/self-test.js                      # 로컬(기본 http://127.0.0.1:3000)
 *   BASE=https://우리주소.onrender.com node scripts/self-test.js
 *   node scripts/self-test.js --json               # 기계가 읽을 형태로
 *
 * 판정
 *   OK    쓸 만한 결과가 나왔습니다
 *   키없음 API 키가 없어서 못 돕니다 — .env를 채우면 됩니다
 *   막힘  바깥(네이버 등)에 못 나가서 못 돕니다 — 서버 위치 문제입니다
 *   한도  오늘 횟수를 다 썼습니다(정상 동작)
 *   없음  이 기능을 부를 주소가 아예 없습니다 — 만들어야 합니다
 *   실패  진짜 고장입니다
 */
const BASE = process.env.BASE || "http://127.0.0.1:3000";
const JSON_OUT = process.argv.includes("--json");
const TIMEOUT = Number(process.env.TIMEOUT_MS || 45000);

let COOKIE = "";

async function hit(method, path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(COOKIE ? { Cookie: COOKIE } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const set = res.headers.get("set-cookie");
    if (set) COOKIE = set.split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: res.status, json, text, ok: res.ok };
  } catch (err) {
    return { status: 0, json: null, text: String(err.message || err), ok: false };
  } finally {
    clearTimeout(t);
  }
}

/** 응답을 보고 무슨 일이 일어났는지 판정합니다. */
function judge(r, opts = {}) {
  if (r.status === 0) return ["실패", "서버에 연결하지 못했습니다: " + r.text.slice(0, 60)];
  const j = r.json || {};
  const msg = String(j.message || j.error || "");

  if (r.status === 429) return ["한도", msg || "횟수 초과 — 제한이 도는 중입니다"];
  if (r.status === 402) return ["권한", msg || "유료 이용권이 필요합니다(무료 플랜 정상 동작)"];
  if (r.status === 401 || r.status === 403) return ["권한", msg || "이 계정으로는 못 엽니다(정상 동작)"];
  // "사진을 올려주세요" 같은 400 은 고장이 아니라 입력이 더 필요한 것입니다.
  if (r.status === 400 && /올려주세요|넣어주세요|보내주세요|필요합니다|입력해/.test(msg))
    return ["입력필요", msg.slice(0, 60)];

  if (/no_keys|키가 없|API 키/.test(msg) || j.error === "no_keys")
    return ["키없음", msg.slice(0, 70)];

  if (j.error === "upstream_unreachable") return ["막힘", (j.detail || msg).slice(0, 60)];
  if (/not_ready|가져오는 중/.test(msg)) return ["막힘", "바깥 데이터를 아직 못 받았습니다"];
  if (/찾지 못했|찾을 수 없|불러오지 못|가져오지 못|응답하지 않|네이버 응답|Status code/.test(msg))
    return ["막힘", msg.slice(0, 60)];
  // 502/503 은 우리 잘못이 아니라 바깥이 안 열린 것입니다.
  if (r.status === 502 || r.status === 503) return ["막힘", msg.slice(0, 60) || `HTTP ${r.status}`];

  if (r.status === 404 && /Cannot (GET|POST)/.test(r.text))
    return ["없음", "이 주소가 없습니다"];

  if (!r.ok) return ["실패", `HTTP ${r.status} ${msg.slice(0, 60) || r.text.slice(0, 60)}`];

  // 200 이지만 알맹이가 비었는지 본다
  if (opts.needs) {
    const miss = opts.needs.filter((k) => {
      const v = k.split(".").reduce((o, p) => (o == null ? o : o[p]), j);
      return v == null || (Array.isArray(v) && v.length === 0) || v === "";
    });
    if (miss.length) return ["빈손", `200 인데 ${miss.join(", ")} 가 비었습니다`];
  }
  if (Array.isArray(j.warnings) && j.warnings.length)
    return ["빈손", "200 인데 경고: " + j.warnings.join(" / ").slice(0, 70)];

  return ["OK", opts.note || ""];
}

const T = []; // 결과
function rec(group, tool, verdict, detail, path) {
  T.push({ group, tool, verdict, detail, path });
}

async function check(group, tool, method, path, body, opts) {
  const r = await hit(method, path, body);
  const [v, d] = judge(r, opts || {});
  rec(group, tool, v, d, `${method} ${path}`);
}

/** 주소가 아예 없는 기능 — 코드는 있는데 부를 길이 없는 것들. */
function missing(group, tool, why) {
  rec(group, tool, "없음", why, "—");
}

async function main() {
  // 로그인해야 열리는 도구가 있어서 시험용 계정을 하나 만듭니다.
  const email = `selftest_${Date.now()}@example.com`;
  const signup = await hit("POST", "/api/auth/signup", {
    email, password: "selftest1234!", name: "자가점검", blogId: "naver_diary",
  });
  const logged = signup.ok || (await hit("POST", "/api/auth/login", { email, password: "selftest1234!" })).ok;

  // ── 1. 진단
  await check("진단", "블로그 지수 진단", "POST", "/api/blog-index", { blogId: "naver_diary" }, { needs: ["blogId"] });
  await check("진단", "홈판 노출 진단", "POST", "/api/homefeed", { blogId: "naver_diary" });
  await check("진단", "홈판 규칙표", "GET", "/api/homefeed/rules", undefined, { needs: ["evidence"] });
  await check("진단", "글 노출·누락 확인", "POST", "/api/post-exposure", { postUrl: "https://blog.naver.com/naver_diary/223000000000" });
  await check("진단", "경쟁 글 비교", "POST", "/api/compare", { keyword: "토너 추천" });
  await check("진단", "순위 추적", "GET", "/api/rank/list", undefined, {});

  // ── 2. 키워드
  await check("키워드", "키워드 분석", "GET", "/api/keyword/inspect?q=" + encodeURIComponent("토너 추천"));
  await check("키워드", "경쟁 키워드 찾기", "GET", "/api/keyword/competitors?q=" + encodeURIComponent("토너 추천"));
  await check("키워드", "기회 키워드", "GET", "/api/opportunity?category=" + encodeURIComponent("패션/미용"));
  await check("키워드", "주제 추천", "POST", "/api/suggest-topics", { seeds: ["토너", "올리브영"] });
  await check("키워드", "키워드 순위 대량", "POST", "/api/keyword-ranking", { keywords: ["토너 추천"] });
  await check("키워드", "플레이스 순위", "GET", "/api/place/rank?keyword=" + encodeURIComponent("역삼동 칼국수") + "&name=" + encodeURIComponent("현대칼국수"));
  await check("키워드", "플레이스 여러 키워드", "POST", "/api/place/track", { name: "현대칼국수", keywords: ["역삼동 칼국수"] });

  // ── 3. 글 다듬기
  const SAMPLE = "오늘은 토너 후기입니다. 결론부터 말하면 재구매 의사 있습니다. 향이 강하지 않아 좋았어요. 다만 용량 대비 가격은 아쉽습니다. 3개월 써본 기준입니다.";
  await check("글 다듬기", "줄바꿈 정리", "POST", "/api/linebreak", { body: SAMPLE }, { needs: ["text"] });
  await check("글 다듬기", "맞춤법 검사", "POST", "/api/spellcheck", { text: "어의없는 일이 있었습니다. 되요? 안되요. 몇일 갔다올게요." }, { needs: ["issues"] });
  await check("글 다듬기", "강조 넣기", "POST", "/api/emphasis", { title: "토너 후기", body: SAMPLE });
  await check("글 다듬기", "제목 실험실", "POST", "/api/title-lab", { body: SAMPLE, keyword: "토너 추천", currentTitle: "토너 후기", count: 5 });
  await check("글 다듬기", "글 점검", "POST", "/api/post-audit", { title: "올리브영 토너 추천 내돈내산 후기", body: SAMPLE, tags: ["토너"], keyword: "토너 추천", images: 5 }, { needs: ["score", "checks"] });
  await check("글 다듬기", "주제 순도", "POST", "/api/topic-fit", { title: "올리브영 토너 후기", body: SAMPLE, blogTopic: "뷰티" }, { needs: ["topic"] });
  await check("글 다듬기", "글 고치기 제안", "POST", "/api/post-improve", { title: "토너 후기", body: SAMPLE, keyword: "토너 추천", images: 5 });

  // ── 4. 썸네일
  await check("썸네일", "썸네일 옵션", "GET", "/api/thumb/options", undefined, { needs: ["sizes", "themes"] });
  await check("썸네일", "홈판 썸네일 만들기", "POST", "/api/thumb", { title: "올리브영 토너 추천", size: "square", theme: "black" });
  await check("썸네일", "썸네일 문구 제안", "POST", "/api/thumb/suggest", { title: "올리브영 토너 추천 내돈내산 후기", keyword: "토너 추천" }, { needs: ["suggestions"] });
  await check("썸네일", "썸네일 전략", "POST", "/api/thumb/strategy", { keyword: "토너 추천" });
  await check("썸네일", "썸네일 패턴", "POST", "/api/thumb/patterns", { keyword: "토너 추천" });
  await check("썸네일", "카드뉴스", "POST", "/api/cardnews/plan", { topic: "올리브영 토너 추천", pageCount: 6 });
  await check("썸네일", "브랜드 키트", "GET", "/api/brand");

  // ── 5. 숏폼
  await check("숏폼", "숏폼 기획", "POST", "/api/shortform/plan", { url: "https://blog.naver.com/naver_diary/223000000000" });
  await check("숏폼", "숏폼 화면 스타일", "GET", "/api/shortform/frame-styles", undefined, { needs: ["frameStyles"] });
  await check("숏폼", "성우 목소리 목록", "GET", "/api/shortform/voice-providers");
  await check("숏폼", "롱폼 → 숏츠", "POST", "/api/long-to-shorts", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", count: 2 });
  await check("숏폼", "사주 릴스", "GET", "/api/saju-reels/menu");
  await check("숏폼", "네이버 클립 자막", "POST", "/api/naver-clip/caption", { text: "오늘은 토너 후기입니다. 결론부터 말합니다." });
  await check("숏폼", "유튜브 소재 찾기", "GET", "/api/finder/status");

  // ── 6. 발행
  await check("발행", "크롬 확장 연결", "POST", "/api/ext/ping", {});
  await check("발행", "네이버 발행 상태", "GET", "/api/publish/status");
  await check("발행", "인스타그램 계정", "GET", "/api/instagram/accounts");
  await check("발행", "스레드 상태", "GET", "/api/threads/status");
  await check("발행", "네이버 글 준비", "POST", "/api/naver-blog/prepare", { text: SAMPLE, blogId: "naver_diary" });

  // ── 7. 수익화
  await check("수익화", "쿠팡 연결 상태", "GET", "/api/coupang/status", undefined, { needs: [] });
  await check("수익화", "쿠팡 상품 찾기", "GET", "/api/coupang/search?q=" + encodeURIComponent("토너"));
  await check("수익화", "팔 물건 있는지 확인", "POST", "/api/coupang/check", { keyword: "토너" });
  await check("수익화", "스레드 상품 소개", "POST", "/api/thread-shop/product", { url: "https://example.com/product/1" });
  await check("수익화", "연예인 소재 출처", "GET", "/api/celeb/sources", undefined, { needs: ["sources"] });
  await check("수익화", "대행사 리포트", "POST", "/api/report/client", { blogId: "naver_diary", storeName: "시험 가게", demo: true });

  // ── 8. AI 원고
  await check("AI 원고", "원고 초안", "POST", "/api/blog/draft", { topic: "올리브영 토너 추천" }, { needs: ["title", "sections"] });
  await check("AI 원고", "본문 다시 쓰기", "POST", "/api/body-rewrite", { title: "토너 후기", body: SAMPLE });
  await check("AI 원고", "제목 다시 쓰기", "POST", "/api/title-rewrite", { title: "토너 후기", body: SAMPLE, count: 5 });
  await check("AI 원고", "프롬프트 스튜디오", "GET", "/api/prompt-studio/tools", undefined, { needs: ["tools"] });
  await check("AI 원고", "자료 조사", "POST", "/api/research", { topic: "올리브영 토너", angle: "성분" });

  // ── 9. 알림
  await check("알림", "알림함", "GET", "/api/notify");
  await check("알림", "누락 통계", "GET", "/api/drop-stats");

  // ── 10. 사장님 전용
  await check("사장님", "이용권 발급", "POST", "/api/admin/license/issue", { plan: "pro", months: 1, count: 1 });
  await check("사장님", "회원 목록", "GET", "/api/admin/users");
  await check("사장님", "캐릭터 목록", "GET", "/api/characters/list");
  await check("사장님", "엔터 뉴스", "GET", "/api/entertainment/news");
  await check("사장님", "링크에서 글 뽑기", "GET", "/api/link-content/preview?url=" + encodeURIComponent("https://example.com"));
  await check("사장님", "설정 상태", "GET", "/api/setup-status");
  await check("사장님", "트렌드", "GET", "/api/trends");
  await check("사장님", "핫이슈", "GET", "/api/hot-issues");

  // ── 출력
  if (JSON_OUT) { console.log(JSON.stringify({ base: BASE, loggedIn: logged, results: T }, null, 2)); return; }

  const ORDER = ["실패", "없음", "빈손", "막힘", "키없음", "입력필요", "권한", "한도", "OK"];
  const count = {};
  T.forEach((r) => (count[r.verdict] = (count[r.verdict] || 0) + 1));

  console.log(`\n대상: ${BASE}   로그인: ${logged ? "됨" : "안 됨"}   검사: ${T.length}개\n`);
  let lastG = "";
  for (const r of T) {
    if (r.group !== lastG) { console.log(`\n[${r.group}]`); lastG = r.group; }
    const mark = r.verdict === "OK" ? "✓" : r.verdict === "실패" || r.verdict === "없음" ? "✗" : "·";
    console.log(`  ${mark} ${r.verdict.padEnd(4)} ${r.tool.padEnd(18)} ${r.detail || ""}`);
  }
  console.log("\n───────────────");
  ORDER.filter((k) => count[k]).forEach((k) => console.log(`  ${k.padEnd(5)} ${count[k]}개`));
  const broken = (count["실패"] || 0) + (count["없음"] || 0);
  console.log(`\n고쳐야 할 것: ${broken}개\n`);
  process.exit(broken ? 1 : 0);
}

main().catch((e) => { console.error("점검 자체가 실패했습니다:", e); process.exit(2); });
