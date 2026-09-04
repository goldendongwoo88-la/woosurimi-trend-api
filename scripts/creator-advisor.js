/**
 * 크리에이터 어드바이저 수집기 — 네이버가 매기는 "지금 뜨는 것"을 받아온다.
 *
 *   node scripts/creator-advisor.js man_is_best
 *   node scripts/creator-advisor.js man_is_best --날짜 2026-09-03
 *   node scripts/creator-advisor.js man_is_best --지도        ← 어떤 주소를 부르는지만 적어둔다
 *
 * ── 왜 이게 값어치 있나 ──
 * 우리 todayKeyword 는 검색량÷문서수(황금비)까지는 내는데 "지금 오르는 중인가"를 못 봤다.
 * 데이터랩 검색어트렌드는 자바스크립트로 만들어져 정적으로 안 잡힌다(2026-09-04 확인).
 * 그런데 크리에이터 어드바이저에는 **네이버가 직접 매긴 급상승 표시**가 있다 —
 * 주제별 인기유입검색어에 `new` 와 `▲2 / ▼2` 가 붙는다. 그게 우리가 못 만들던 신호다.
 * 게다가 주제(패션·미용 / 생활·건강 …)로 나뉘어 있어 우리 블로그 갈래와 그대로 맞는다.
 *
 * ── 주소를 왜 안 박아뒀나 ──
 * 이 화면은 로그인해야 열리고 내부 주소가 바뀔 수 있다. 그래서 주소를 추측해 박는 대신
 * **페이지가 실제로 부르는 JSON 응답을 받아 적는다.** 네이버가 주소를 바꿔도 계속 돈다.
 * 처음 한 번은 `--지도` 로 돌려서 무엇이 잡히는지 보고, 그다음부터 이름을 붙여 쓰면 된다.
 *
 * ── 로그인 ──
 * 사장님 크롬 프로필(C:\dev\profiles\naver_<블로그아이디>)을 그대로 쓴다.
 * scripts/naver-draft.js 와 같은 방식이다. 아이디·비밀번호를 여기서 다루지 않는다.
 */

const path = require("path");
const fs = require("fs");

const REPO = path.join(__dirname, "..");
const PUPPETEER = path.join(REPO, "..", "ttj_threads_2026", "node_modules", "puppeteer");
const puppeteer = require(PUPPETEER);

const args = process.argv.slice(2);
const blogId = args.find((a) => !a.startsWith("--"));
const flag = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (!blogId) {
  console.log([
    "크리에이터 어드바이저 수집기 — 네이버가 매기는 급상승 신호를 받아온다",
    "",
    "  node scripts/creator-advisor.js <블로그아이디>",
    "  node scripts/creator-advisor.js man_is_best --날짜 2026-09-03",
    "  node scripts/creator-advisor.js man_is_best --지도",
    "",
    "옵션",
    "  --날짜 YYYY-MM-DD  어느 날짜를 볼지 (기본: 어제)",
    "  --지도             주소만 적어두고 끝낸다. 처음 한 번 이걸로 확인한다",
    "  --보이게           크롬 창을 띄운다 (로그인이 풀렸는지 볼 때)",
    "",
    "프로필: C:\\dev\\profiles\\naver_<블로그아이디>",
  ].join("\n"));
  process.exit(0);
}

const profileDir = `C:\\dev\\profiles\\naver_${blogId}`;
if (!fs.existsSync(profileDir)) {
  console.error(`✖ 프로필이 없습니다: ${profileDir}`);
  console.error("  naver-draft.js 를 한 번 돌려 로그인해 두시면 생깁니다.");
  process.exit(1);
}
// 크롬이 그 프로필로 이미 떠 있으면 붙을 수 없다. 창을 닫아야 한다.
if (fs.existsSync(path.join(profileDir, "SingletonLock"))) {
  console.error("✖ 그 프로필로 크롬이 열려 있습니다. 창을 닫고 다시 실행해 주십시오.");
  process.exit(1);
}

const 어제 = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const 날짜 = val("--날짜") || 어제;
const OUT = path.join(REPO, "out", "어드바이저");
fs.mkdirSync(OUT, { recursive: true });

// 받아 적을 응답 — 주소에 이 말이 들어 있으면 담는다.
// 네이버가 주소를 바꿔도 이 중 하나는 걸리도록 넓게 잡았다.
const 관심 = /trend|keyword|inflow|search|summary|stat|rank|category|main/i;

(async () => {
  const browser = await puppeteer.launch({
    headless: !flag("--보이게"),
    userDataDir: profileDir,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1400,1000"],
    defaultViewport: { width: 1400, height: 1000 },
  });

  const page = (await browser.pages())[0] || (await browser.newPage());
  const 잡힌것 = [];

  page.on("response", async (res) => {
    const url = res.url();
    if (!관심.test(url)) return;
    const ct = (res.headers()["content-type"] || "");
    if (!ct.includes("json")) return;
    try {
      const body = await res.json();
      잡힌것.push({ url, 상태: res.status(), 크기: JSON.stringify(body).length, body });
    } catch { /* 본문을 못 읽는 응답은 넘긴다 */ }
  });

  const 가기 = async (url, 설명) => {
    process.stdout.write(`  ${설명} ... `);
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 2500));   // 늦게 오는 응답까지 받는다
      console.log("됨");
    } catch (e) {
      console.log("실패 (" + e.message.slice(0, 40) + ")");
    }
  };

  const BASE = "https://creator-advisor.naver.com";
  console.log(`크리에이터 어드바이저 · ${blogId} · ${날짜}\n`);

  await 가기(`${BASE}/`, "홈");

  // 로그인이 풀렸으면 여기서 걸린다 — 먼저 알려주고 끝낸다
  const 주소 = page.url();
  if (/nid\.naver\.com|login/i.test(주소)) {
    console.error("\n✖ 로그인이 풀렸습니다. --보이게 로 다시 돌려 직접 로그인해 주십시오.");
    await browser.close();
    process.exit(1);
  }

  await 가기(`${BASE}/tr/search?serviceType=BLOG&date=${날짜}`, "검색 유입 트렌드");
  await 가기(`${BASE}/tr/main?serviceType=BLOG&date=${날짜}`, "메인 유입 트렌드");

  await browser.close();

  // ── 저장 ──
  const 파일 = path.join(OUT, `${blogId}-${날짜}.json`);
  fs.writeFileSync(파일, JSON.stringify(잡힌것, null, 1), "utf8");

  console.log(`\n받아 적은 응답 ${잡힌것.length}건`);
  if (!잡힌것.length) {
    console.log("\n하나도 안 잡혔습니다. 화면 구조가 바뀌었을 수 있습니다.");
    console.log("--보이게 로 돌려 화면이 실제로 뜨는지 먼저 보십시오.");
  } else {
    console.log("");
    for (const r of 잡힌것) {
      const 짧은주소 = r.url.replace(BASE, "").split("?")[0];
      console.log(`  ${String(r.크기).padStart(7)}자  ${짧은주소}`);
    }
  }
  console.log(`\n원본: ${파일}`);
  if (flag("--지도")) {
    console.log("\n이 목록을 보고 어느 주소가 무엇인지 알려주시면, 다음 판에서 표로 뽑아 드리겠습니다.");
  }
})().catch((e) => { console.error("\n✖ 실패:", e.message); process.exit(1); });
