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
// 크롬이 그 프로필로 떠 있으면 새로 띄울 수 없다. 대신 **떠 있는 크롬에 붙는다.**
//
// 윈도우는 SingletonLock(리눅스·맥) 이 아니라 `lockfile` 을 쓴다.
// SingletonLock 만 보다가 못 잡아서 "browser is already running" 으로 죽었다(2026-09-04 실측).
// 그리고 어차피 창을 닫으라고 하는 것보다 붙는 쪽이 낫다 — 사장님 작업을 안 끊는다.
// 붙는 주소는 DevToolsActivePort 첫 줄에 포트로 적혀 있다.
// ⚠️ DevToolsActivePort 는 크롬이 닫혀도 남는다. 낡은 포트에 붙으려다 실패한다
//    (2026-09-04 실측 — 파일엔 57719 인데 그 포트는 죽어 있었다).
//    그래서 파일만 믿지 않고 **실제로 응답하는지 확인한 뒤** 쓴다. 안 되면 새로 띄운다.
async function 떠있는크롬() {
  const 잠김 = ["lockfile", "SingletonLock"].some((f) => fs.existsSync(path.join(profileDir, f)));
  if (!잠김) return null;
  let port;
  try {
    port = fs.readFileSync(path.join(profileDir, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
  } catch { return null; }
  if (!port) return null;
  const url = `http://127.0.0.1:${port}`;
  try {
    const r = await fetch(`${url}/json/version`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    return url;
  } catch {
    console.log(`(포트 ${port} 는 죽어 있어 새로 띄웁니다 — 파일만 남은 것입니다)`);
    return null;
  }
}

const 어제 = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const 날짜 = val("--날짜") || 어제;
const OUT = path.join(REPO, "out", "어드바이저");
fs.mkdirSync(OUT, { recursive: true });

// 받아 적을 응답 — 주소에 이 말이 들어 있으면 담는다.
// 네이버가 주소를 바꿔도 이 중 하나는 걸리도록 넓게 잡았다.
const 관심 = /trend|keyword|inflow|search|summary|stat|rank|category|main/i;

(async () => {
  const 붙을주소 = await 떠있는크롬();
  let browser, 붙었나 = false, 내탭;

  if (붙을주소) {
    console.log(`떠 있는 크롬에 붙습니다 (${붙을주소}) — 창을 닫지 않으셔도 됩니다.\n`);
    browser = await puppeteer.connect({ browserURL: 붙을주소, defaultViewport: null });
    붙었나 = true;
    내탭 = await browser.newPage();          // 사장님 탭은 건드리지 않고 새 탭에서만 논다
  } else {
    browser = await puppeteer.launch({
      headless: !flag("--보이게"),
      userDataDir: profileDir,
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1400,1000"],
      defaultViewport: { width: 1400, height: 1000 },
    });
    내탭 = (await browser.pages())[0] || (await browser.newPage());
  }
  const page = 내탭;

  // 붙어 있을 땐 사장님 크롬을 닫으면 안 된다. 내가 연 탭만 닫고 연결을 끊는다.
  const 정리 = async () => {
    try { await 내탭.close(); } catch { /* 이미 닫혔으면 넘어간다 */ }
    try { 붙었나 ? browser.disconnect() : await browser.close(); } catch { /* 무시 */ }
  };
  const 잡힌것 = [];
  // ⚠️ 감시기가 res.json() 으로 본문을 먼저 읽으면, 페이지 안에서 도는 fetch 가 같은 본문을
  //    못 읽어 빈 값이 돌아온다(2026-09-04 실측 — 호출은 갔는데 결과가 0건이었다).
  //    그래서 주소를 훑는 동안만 켜고, 실제로 값을 받아올 때는 끈다.
  let 받아적기 = true;

  page.on("response", async (res) => {
    if (!받아적기) return;
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
    // 붙어 있을 땐 browser.close() 를 부르면 사장님 크롬이 통째로 닫힌다. 정리()가 갈라서 처리한다.
    console.error("\n✖ 로그인이 풀렸습니다. 크롬에서 네이버에 로그인한 뒤 다시 돌려 주십시오.");
    await 정리();
    process.exit(1);
  }

  // 실제 주소는 /naver_blog/<아이디>/trends 다. /tr/... 로 짐작했다가 셋 다 홈으로 돌아왔다(2026-09-04).
  const MY = `${BASE}/naver_blog/${blogId}`;
  await 가기(`${MY}/trends?service=naver_blog&startDate=${날짜}&endDate=${날짜}&interval=day`, "트렌드");

  if (flag("--지도")) {
    await 가기(`${MY}/inflow-analysis?service=naver_blog&startDate=${날짜}&endDate=${날짜}&interval=day`, "유입분석");
    await 가기(`${MY}/integrated-analysis?service=naver_blog&startDate=${날짜}&endDate=${날짜}&interval=day`, "통합 데이터");
  }

  // ── 본론: 주제별 급상승 검색어를 주제 전부에서 받아온다 ──
  //
  // 화면은 내 관심 주제 3개만 보여주는데, API 는 주제를 골라 넣을 수 있다.
  // 그래서 주제 목록을 먼저 받고 3개씩 끊어 전부 훑는다.
  //   rank   그날 그 주제에서 몇 등으로 유입됐나
  //   ratio  그 주제 유입에서 차지하는 비중
  //   rankChange 어제 대비 몇 계단 올랐나 ← 화면의 ▲2 / ▼2
  //
  // ⚠️ rankChange 는 **`hasRankChange=true` 를 붙여야만 온다.** 없으면 조용히 빠진 채로 온다
  //    (2026-09-04: 파라미터를 페이지와 맞췄는데도 응답이 5,034 대 3,900 으로 달랐던 원인이 이것이었다.
  //     헤더 차이인 줄 알고 헤맸는데, 페이지의 실제 요청을 잡아 보니 파라미터 하나였다).
  //    네이버 값이 없을 때를 대비해 순위를 매일 저장하고 우리 계산도 남겨둔다.
  // 페이지 안에서 fetch 하므로 로그인 쿠키가 그대로 실린다.
  let 급상승 = [];
  if (!flag("--지도")) {
    받아적기 = false;                       // 여기서부터는 값을 직접 받는다
    const q = `contentType=text&date=${날짜}&interval=day&service=naver_blog`;
    // hasRankChange 는 /trend/category 만 아는 값이다.
    // 공용 q 에 넣었더니 주제목록 호출(category-inflow-ranks)이 0개를 돌려줬다(2026-09-04 실측).
    const q순위변동 = q + '&hasRankChange=true';
    const 주제목록 = await page.evaluate(async (q) => {
      const r = await fetch(`/api/v6/trend/category-inflow-ranks?${q}`, { credentials: "include" });
      if (!r.ok) return [];
      return (await r.json()).data || [];
    }, q);
    console.log(`\n주제 ${주제목록.length}개에서 급상승 검색어를 받아옵니다.`);

    for (let i = 0; i < 주제목록.length; i += 3) {
      const 묶음 = 주제목록.slice(i, i + 3);
      process.stdout.write(`\r  ${Math.min(i + 3, 주제목록.length)}/${주제목록.length} · ${묶음.join(", ").slice(0, 40)}          `);
      const got = await page.evaluate(async (q, cats, limit) => {
        const url = `/api/v6/trend/category?categories=${encodeURIComponent(cats.join(","))}&${q}&limit=${limit}`;
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) return [];
        return (await r.json()).data || [];
      }, q순위변동, 묶음, Number(val("--개수") || 20));
      for (const c of got) {
        for (const k of (c.queryList || [])) {
          급상승.push({ 주제: c.category, 키워드: k.query, 순위: k.rank, 비중: k.ratio, 네이버변동: k.rankChange ?? null });
        }
      }
      await new Promise((r) => setTimeout(r, 400));   // 남의 서버다
    }
    console.log("");
  }

  // ── 내 블로그 성과 ──
  //
  // ⚠️ 이 주소들은 **channelId 가 없으면 400/403 이 난다.** 그걸 몰라서 다섯 개를 전부 틀렸다
  //    (2026-09-04 실측). 짐작을 그만두고 페이지의 실제 요청을 잡아서 알아냈다.
  //    metric=cv 는 조회수(count of view) 를 뜻한다.
  let 성과 = null;
  if (!flag("--지도")) {
    const C = `channelId=${blogId}&service=naver_blog`;
    const 오늘 = new Date().toISOString().slice(0, 10);
    const 시작 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    성과 = await page.evaluate(async (C, 날짜, 오늘, 시작) => {
      const 가져오기 = async (u) => {
        try { const r = await fetch(u, { credentials: "include" }); return r.ok ? (await r.json()).data : null; }
        catch { return null; }
      };
      return {
        어제: await 가져오기(`/api/v6/home/yesterday-summary?${C}&date=${오늘}`),
        실시간: await 가져오기(`/api/v6/home/realtime-summary?${C}&date=${오늘}`),
        급상승글: await 가져오기(`/api/v6/home/soaring-contents?${C}&date=${날짜}&interval=day`),
        유입도메인: await 가져오기(`/api/v6/inflow-analysis/referrer-domain?${C}&date=${날짜}&interval=day&limit=10&metric=cv`),
        체류시간: await 가져오기(`/api/v6/integrated-analysis/average-duration?${C}&startDate=${시작}&endDate=${날짜}&interval=day`),
        조회수추이: await 가져오기(`/api/v6/integrated-analysis/view-count?${C}&startDate=${시작}&endDate=${날짜}&interval=day`),
      };
    }, C, 날짜, 오늘, 시작);
  }

  await 정리();

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
  // ── 어제 것과 견줘 변동을 우리가 낸다 ──
  const 이력파일 = path.join(OUT, `순위이력-${blogId}.json`);
  let 이력 = {};
  try { 이력 = JSON.parse(fs.readFileSync(이력파일, "utf8")); } catch { /* 첫 회차 */ }
  const 지난회차 = Object.keys(이력).filter((d) => d !== 날짜).sort().pop();
  const 지난것 = 지난회차 ? 이력[지난회차] : null;
  for (const r of 급상승) {
    const 키 = r.주제 + "|" + r.키워드;
    const 옛순위 = 지난것 ? 지난것[키] : undefined;
    r.지난순위 = 옛순위 ?? null;
    const 우리계산 = 옛순위 == null ? null : 옛순위 - r.순위;   // 양수 = 올라감
    // 네이버 값이 있으면 그걸 쓴다. 첫날부터 나오고, 네이버가 직접 매긴 값이라 더 맞다.
    r.변동 = r.네이버변동 ?? 우리계산;
    r.출처 = r.네이버변동 != null ? "네이버" : (우리계산 == null ? "처음" : "우리계산");
  }
  이력[날짜] = Object.fromEntries(급상승.map((r) => [r.주제 + "|" + r.키워드, r.순위]));
  for (const d of Object.keys(이력).sort().slice(0, -14)) delete 이력[d];   // 14회분만
  fs.writeFileSync(이력파일, JSON.stringify(이력), "utf8");

  // ── 급상승 표 ──
  if (급상승.length) {
    const BOM = String.fromCharCode(0xFEFF);
    const esc = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const csv = [["주제", "키워드", "순위", "순위변동", "변동출처", "지난순위", "비중%"].join(",")].concat(
      급상승.map((r) => [r.주제, r.키워드, r.순위, r.변동 ?? "", r.출처, r.지난순위 ?? "", (r.비중 * 100).toFixed(3)].map(esc).join(","))
    );
    const 표파일 = path.join(OUT, `급상승-${blogId}-${날짜}.csv`);
    fs.writeFileSync(표파일, BOM + csv.join("\r\n"), "utf8");

    // 변동 0 은 어제와 같은 자리라 새 소식이 아니다. 오른 것만 위로 올린다.
    const 오른것 = 급상승.filter((r) => r.변동 > 0).sort((a, b) => b.변동 - a.변동);
    console.log(`\n주제 ${new Set(급상승.map((r) => r.주제)).size}개 · 검색어 ${급상승.length}개 · 그중 오른 것 ${오른것.length}개`);
    console.log("\n가장 많이 오른 20개");
    console.log("   변동   순위  주제            검색어");
    console.log("  " + "─".repeat(64));
    const 보일것 = 오른것.length ? 오른것.slice(0, 20) : 급상승.filter((r) => r.순위 <= 2).slice(0, 20);
    for (const r of 보일것) {
      console.log(
        "  " + (r.변동 == null ? "새" : "▲" + r.변동).padStart(5) + String(r.순위).padStart(6) + "  " +
        r.주제.slice(0, 12).padEnd(13) + r.키워드
      );
    }
    console.log(`\n엑셀: ${표파일}`);
  }

  // ── 내 블로그 성과 표 ──
  if (성과) {
    const 있는것 = Object.entries(성과).filter(([, v]) => v != null);
    if (있는것.length) {
      const 성과파일 = path.join(OUT, `성과-${blogId}-${날짜}.json`);
      fs.writeFileSync(성과파일, JSON.stringify(성과, null, 1), "utf8");
      console.log(`\n── 내 블로그 (${blogId}) ──`);
      for (const [이름, v] of 있는것) {
        const 요약 = Array.isArray(v) ? `${v.length}건` : JSON.stringify(v).replace(/\s+/g, " ").slice(0, 100);
        console.log(`  ${이름.padEnd(10)} ${요약}`);
      }
      const 못받은것 = Object.entries(성과).filter(([, v]) => v == null).map(([k]) => k);
      if (못받은것.length) console.log(`  (못 받음: ${못받은것.join(", ")})`);
      console.log(`  원본: ${성과파일}`);
    }
  }

  console.log(`\n원본(주소 훑기): ${파일}`);
  if (flag("--지도")) {
    console.log("\n이 목록을 보고 어느 주소가 무엇인지 알려주시면, 다음 판에서 표로 뽑아 드리겠습니다.");
  }
})().catch((e) => { console.error("\n✖ 실패:", e.message); process.exit(1); });
