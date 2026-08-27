/**
 * 지금 연예판에서 뜨는 소재 — 홈판 벤치마킹 사이트들을 실제로 읽어 모읍니다.
 *
 * ⚠️ 왜: 메이트·상위 블로거들의 제목 1,281개를 실측해보니 21%가 연예인 소재였고,
 * 그 소재는 결국 "지금 랭킹뉴스에 오른 이야기"에서 나옵니다. 소재 사이트를
 * 사람이 매일 도는 대신 서버가 돌고, 제목 추천이 그 위에서 나옵니다.
 *
 * ⚠️ 남의 기사 본문을 가져오지 않습니다. 제목·링크만 봅니다(가리키는 것).
 * ⚠️ 어떤 소스가 죽어도 나머지로 갑니다. 죽은 소스는 warnings로 알립니다.
 * ⚠️ AI 0원.
 *
 * 소스 실측 결과 (2026-08-28):
 *   네이트 연예랭킹 — EUC-KR. TextDecoder("euc-kr")로 해독해야 합니다. 잘 읽힘.
 *   다음연예       — UTF-8, 잘 읽힘.
 *   뉴스1 연예     — UTF-8, HTML 엔티티 해독 필요.
 *   네이버 랭킹    — 화면이 JS로 그려져 서버에서 안 읽힘 → 기존 뉴스검색 API로 대체.
 *   이슈링크·SBS  — 구조가 잡히지 않아 뺐습니다 (억지로 넣으면 쓰레기가 섞임).
 */

const CACHE_TTL = 10 * 60 * 1000;   // 랭킹은 분 단위로 안 바뀝니다. 10분.
let cache = { at: 0, data: null };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function getDecoded(url, enc = "utf-8", timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return new TextDecoder(enc).decode(await r.arrayBuffer());
  } finally { clearTimeout(timer); }
}

const unent = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

/** 네이트 연예 랭킹 — 공감순. EUC-KR입니다. */
async function nateRanking() {
  const html = await getDecoded("https://news.nate.com/rank/emoticon?cate=ent", "euc-kr");
  const out = [];
  const seen = new Set();
  // 같은 기사가 그림 링크(제목이 alt에)와 글자 링크로 두 번 나옵니다. 둘 다 받습니다.
  for (const m of html.matchAll(/<a[^>]+href="(\/\/news\.nate\.com\/view\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const alt = (m[0].match(/alt="([^"]{8,80})"/) || [])[1];
    const text = unent(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    const title = (text.length >= 8 ? text : unent(alt || "")).trim();
    if (title.length < 8 || title.length > 80) continue;
    const link = "https:" + m[1];
    const key = link.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, link });
    if (out.length >= 30) break;
  }
  return out;
}

/** 다음연예 — 최신 뉴스 목록. 링크가 v.daum.net/v/숫자 꼴입니다. */
async function daumEnt() {
  const html = await getDecoded("https://entertain.daum.net/news");
  const out = [];
  for (const m of html.matchAll(/href="(https?:\/\/v\.daum\.net\/v\/\d+[^"]*)"[^>]*>([\s\S]{0,400}?)<\/a>/g)) {
    const title = unent(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 80) continue;
    out.push({ title, link: m[1] });
    if (out.length >= 30) break;
  }
  return out;
}

/** 뉴스1 연예 — 최신. */
async function news1Ent() {
  const html = await getDecoded("https://www.news1.kr/entertain");
  const out = [];
  for (const m of html.matchAll(/href="(\/entertain\/[a-z-]+\/\d+)"[^>]*>([\s\S]{0,300}?)<\/a>/g)) {
    const title = unent(m[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 80) continue;
    out.push({ title, link: "https://www.news1.kr" + m[1] });
    if (out.length >= 30) break;
  }
  return out;
}

/**
 * 모아서, "지금 여러 곳에서 같이 오르내리는 이름"을 셉니다.
 * 한 곳에만 나오는 건 그 매체 사정이고, 여러 곳에 같이 나오면 진짜 이슈입니다.
 */
async function collect() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL) return { ...cache.data, cached: true };

  const warnings = [];
  // ⚠️ 다음연예는 제목이 화면 뒤 숨은 데이터에 있어서 서버에서 안 잡힙니다.
  // 억지로 반쪽을 넣느니 뺍니다 (daumEnt 함수는 나중을 위해 남겨둠).
  const srcs = await Promise.all([
    nateRanking().then((items) => ({ name: "네이트 연예랭킹", items })).catch((e) => { warnings.push(`네이트: ${e.message}`); return { name: "네이트 연예랭킹", items: [] }; }),
    news1Ent().then((items) => ({ name: "뉴스1 연예", items })).catch((e) => { warnings.push(`뉴스1: ${e.message}`); return { name: "뉴스1 연예", items: [] }; }),
    // 구글 트렌드 — 연예 밖 소재(홈판 일반)도 같이 봅니다.
    require("./trendSource").fetchGoogleTrendsKR()
      .then((r) => ({ name: "구글 트렌드", items: (r.items || []).slice(0, 20).map((x) => ({ title: x.term, link: x.link })) }))
      .catch((e) => { warnings.push(`구글트렌드: ${e.message}`); return { name: "구글 트렌드", items: [] }; }),
  ]);

  // 같은 제목(거의 같은 것 포함)은 하나로.
  const seen = new Set();
  const all = [];
  for (const s of srcs) {
    for (const it of s.items) {
      const key = it.title.replace(/[\s"'\[\]()‘’“”]/g, "").slice(0, 30);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ ...it, source: s.name });
    }
  }

  // 사람 이름 후보 — 제목에서 2~4글자 한글 이름 패턴을 다 셀 수는 없으니,
  // 메이트 분석에서 만든 연예인 사전(mate-keywords.json)의 이름을 씁니다.
  let names = [];
  try {
    const bank = require("../data/mate-keywords.json");
    names = bank.celebs.map((c) => c.word);
  } catch {}
  /**
   * ⚠️ 외자 이름(뷔)은 "데뷔"에도 걸립니다. 실제로 그렇게 잘못 셌습니다.
   * 두 글자 미만 이름은 앞뒤가 한글이 아닐 때만 인정합니다.
   */
  const hasName = (title, n) =>
    n.length >= 2 ? title.includes(n)
                  : new RegExp(`(^|[^가-힣])${n}([^가-힣]|$)`).test(title);

  const nameCount = {};
  for (const it of all) {
    for (const n of names) {
      if (hasName(it.title, n)) {
        if (!nameCount[n]) nameCount[n] = { n: 0, titles: [] };
        nameCount[n].n++;
        if (nameCount[n].titles.length < 3) nameCount[n].titles.push(it.title);
      }
    }
  }

  const data = {
    ok: true,
    at: Date.now(),
    sources: srcs.map((s) => ({ name: s.name, count: s.items.length })),
    items: all.slice(0, 60),
    hotNames: Object.entries(nameCount).sort((a, b) => b[1].n - a[1].n)
      .map(([name, v]) => ({ name, count: v.n, titles: v.titles })),
    warnings,
    note: "기사 제목·링크만 봅니다. 본문은 원문에서 읽으세요.",
  };
  cache = { at: Date.now(), data };
  return data;
}

module.exports = { collect, nateRanking, daumEnt, news1Ent };
