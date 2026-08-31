/**
 * 네이버 블로그 공개 데이터 수집기.
 *
 * ⚠️ 여기서 쓰는 건 전부 **로그인 없이 누구나 볼 수 있는 공개 정보**입니다.
 * 남의 계정에 들어가지 않고, 비밀번호를 저장하지 않고, 자동으로 글을 쓰거나
 * 이웃신청을 하지도 않습니다. 브라우저로 그 페이지를 열면 보이는 숫자를
 * 대신 세어주는 것뿐입니다.
 *
 * ⚠️ 경쟁 서비스(블라이·판다랭크·블덱스)가 파는 "블로그 지수"의 원재료가 이겁니다.
 * 네이버는 지수를 공개하지 않습니다. 그러니 저 회사들이 보여주는 숫자도
 * **자기들이 만든 추정치**입니다. 우리도 마찬가지고, 그 사실을 화면에 적습니다.
 * 정확한 값인 척하는 순간 거짓말이 됩니다.
 *
 * 확인된 엔드포인트 (2026-08-27 실측):
 *   - NVisitorgp4Ajax.naver    → 최근 5일 일방문자수 (XML)
 *   - PostTitleListAsync.naver → 전체 글 수 + 글 목록 (JSON, 단 escape가 깨져 있어 손질 필요)
 *   - search.naver 블로그탭     → 키워드별 상위 30건 (HTML)
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const HEADERS = {
  "user-agent": UA,
  referer: "https://blog.naver.com/",
  "accept-language": "ko-KR,ko;q=0.9",
};

/** 네이버가 가끔 느립니다. 무한정 기다리면 우리 서버가 같이 멈춥니다. */
async function get(url, { timeoutMs = 10000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/** 블로그 주소를 어떤 형태로 넣어도 아이디만 뽑아냅니다. */
function parseBlogId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // https://blog.naver.com/abc123, m.blog.naver.com/abc123/224..., 그냥 abc123
  const m = s.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  const id = m ? m[1] : s.replace(/^@/, "");
  // 네이버 아이디 규칙: 영문·숫자·하이픈·언더바
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(id)) return null;
  // 블로그 아이디가 아닌 경로들
  if (["PostView", "PostList", "prologue", "widget", "www"].includes(id)) return null;
  return id;
}

/** 글 주소에서 blogId와 logNo를 함께 뽑습니다. */
function parsePostUrl(input) {
  if (!input) return null;
  const s = String(input).trim();
  let m = s.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d{6,})/);
  if (m) return { blogId: m[1], logNo: m[2] };
  // PostView.naver?blogId=xxx&logNo=123
  const bid = s.match(/[?&]blogId=([a-zA-Z0-9_-]+)/);
  const log = s.match(/[?&]logNo=(\d{6,})/);
  if (bid && log) return { blogId: bid[1], logNo: log[2] };
  return null;
}

/**
 * 최근 일방문자수. 네이버가 5일치만 줍니다.
 * 반환: [{ date: "2026-08-25", count: 3001 }, ...] 오래된 것부터.
 */
async function fetchVisitors(blogId) {
  const { status, text } = await get(
    `https://blog.naver.com/NVisitorgp4Ajax.naver?blogId=${encodeURIComponent(blogId)}`
  );
  if (status !== 200) return [];
  const out = [];
  for (const m of text.matchAll(/<visitorcnt\s+id="(\d{8})"\s+cnt="(\d*)"/g)) {
    const d = m[1];
    out.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      count: Number(m[2] || 0),
    });
  }
  return out;
}

/**
 * 글 목록 + 전체 글 수.
 *
 * ⚠️ 이 API의 응답은 JSON인데 pagingHtml 필드 안에 작은따옴표를 \' 로 escape해서
 * 넣어놨습니다. JSON 표준에서 \' 는 허용되지 않아 JSON.parse가 통째로 실패합니다.
 * 실제로 여기서 한 번 터졌습니다. 그래서 파싱 전에 그 필드를 들어냅니다.
 *
 * ⚠️ countPerPage는 **5·10·20·30만 받습니다.** 그 밖의 값(12, 25 …)을 넣으면
 * 네이버가 오류를 내지 않고 **조용히 5개만 돌려줍니다.** 2026-08-31에 벤치마킹
 * 분석에서 이걸로 당했습니다 — 25개를 달라고 했는데 5개만 와서, 표본이 5분의 1로
 * 줄어든 줄도 모르고 통계를 냈습니다. 그래서 여기서 **가장 가까운 허용값으로 맞춥니다.**
 * 조용히 틀리느니 알아서 맞추는 게 낫습니다.
 */
const ALLOWED_PER_PAGE = [5, 10, 20, 30];

function snapPerPage(n) {
  const want = Number(n) || 30;
  return ALLOWED_PER_PAGE.reduce((best, v) =>
    Math.abs(v - want) < Math.abs(best - want) ? v : best, ALLOWED_PER_PAGE[0]);
}

async function fetchPostList(blogId, { page = 1, countPerPage = 30 } = {}) {
  const per = snapPerPage(countPerPage);
  const { status, text } = await get(
    `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(
      blogId
    )}&currentPage=${page}&countPerPage=${per}&categoryNo=0`
  );
  if (status !== 200) return { total: 0, posts: [] };

  let data;
  try {
    // pagingHtml은 우리가 안 씁니다. 통째로 지우고 파싱합니다.
    const cleaned = text.replace(/"pagingHtml"\s*:\s*"(?:[^"\\]|\\.)*"/g, '"pagingHtml":""');
    data = JSON.parse(cleaned);
  } catch {
    // 그래도 실패하면 전체 글 수만이라도 정규식으로 건집니다.
    const t = text.match(/"totalCount"\s*:\s*"?(\d+)/);
    return { total: t ? Number(t[1]) : 0, posts: [] };
  }

  const posts = (data.postList || []).map((p) => ({
    logNo: String(p.logNo),
    // title은 URL 인코딩 + 공백이 '+' 입니다. 둘 다 되돌려야 사람이 읽을 수 있습니다.
    title: safeDecode(String(p.title || "").replace(/\+/g, " ")),
    addDate: p.addDate || "",
    commentCount: Number(p.commentCount || 0),
    // searchYn=false 면 본인이 검색 노출을 꺼둔 글입니다. 누락이 아닙니다.
    searchable: String(p.searchYn) !== "false",
    // openType 2 = 전체공개. 그 외는 이웃공개/비공개라 검색에 안 잡히는 게 정상입니다.
    isPublic: String(p.openType) === "2",
    url: `https://blog.naver.com/${blogId}/${p.logNo}`,
  }));

  return { total: Number(data.totalCount || 0), posts };
}

/**
 * 제목을 사람이 읽는 형태로 되돌립니다.
 *
 * ⚠️ URL 디코딩만 하면 부족합니다. 네이버가 돌려주는 제목에는 HTML 기호가
 * 그대로 들어 있습니다: &quot; &#39; &amp; …
 *
 * 이걸 안 풀면 제목이 이렇게 됩니다:
 *   &quot;못생긴 니가 꺼져&quot; 티빙도 예상 못한 불량연애2
 * 그 상태로 네이버에 검색하면 당연히 아무것도 안 나옵니다. 그러면 우리 코드는
 * "결과가 너무 적다 → 판정 포기"로 넘어가고, **노출 검사가 통째로 죽습니다.**
 *
 * 실제로 두 블로그를 진단했더니 검사한 글이 전부 '확인 안 함'으로 나왔습니다.
 * 하필 연예·이슈 블로그는 제목에 따옴표를 거의 다 씁니다.
 * 이 시장에서 못 쓰는 도구가 될 뻔했습니다.
 */
function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    // &amp; 는 맨 마지막에 풀어야 합니다. 먼저 풀면 &amp;quot; 가 &quot; 가 됐다가
    // 다시 " 로 바뀌어, 원래 글에 있던 문자를 우리가 바꿔버리게 됩니다.
    .replace(/&amp;/g, "&");
}

function safeDecode(s) {
  let out = s;
  try {
    out = decodeURIComponent(s);
  } catch {
    // 인코딩이 깨져 있으면 원문 그대로 두고 기호만 풀어줍니다.
  }
  return decodeEntities(out);
}

/**
 * 네이버 블로그 검색 결과에서 순위를 읽습니다.
 * 반환: [{ rank, blogId, logNo, title, url }] — 위에서부터.
 *
 * ⚠️ 네이버가 화면 구조를 바꾸면 여기가 제일 먼저 깨집니다. 그래서 화면의 CSS
 * 클래스명에 기대지 않고, 본문에 등장하는 글 주소의 **등장 순서**로 순위를 셉니다.
 * 클래스명보다 주소 형식이 훨씬 덜 바뀝니다.
 */
/**
 * ⚠️ 여기서 제일 조심해야 하는 것: **차단당한 걸 "순위 없음"으로 착각하지 않기.**
 *
 * 실제로 겪은 일입니다. 테스트로 네이버를 연달아 두들겼더니 결과가 비어서 돌아왔고,
 * 코드가 그걸 그대로 "30위 안에 없음"으로 기록했습니다. 격리해서 다시 재보니
 * 그 글은 **1위**였습니다.
 *
 * 이게 왜 치명적이냐면, 이 사업에서 파는 제일 중요한 숫자가 순위와 누락이기 때문입니다.
 * 멀쩡한 글을 "검색에서 빠졌습니다"라고 알리면 손님이 놀라서 멀쩡한 글을 지우거나
 * 고쳐 씁니다. 없는 병을 고치라고 시키는 꼴이고, 한 번 겪으면 다시는 안 씁니다.
 * **모르면 모른다고 해야지, 없다고 하면 안 됩니다.**
 *
 * 그래서 "결과가 이상하게 적으면 판정을 포기"합니다. 정상적인 키워드 검색은
 * 블로그탭에서 보통 20~30건이 나옵니다. 한 자릿수면 검색이 안 된 것으로 봅니다.
 */
const SUSPICIOUS_MIN = 10;

async function searchBlogRanking(keyword, { limit = 30, retry = 1 } = {}) {
  const { status, text } = await get(
    `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(keyword)}`,
    { timeoutMs: 12000 }
  );

  // 429(너무 많이 요청) / 5xx는 명백한 차단·장애입니다.
  if (status === 429 || status >= 500) {
    if (retry > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      return searchBlogRanking(keyword, { limit, retry: retry - 1 });
    }
    return { ok: false, blocked: true, why: `네이버가 응답을 거부했습니다 (${status})`, results: [] };
  }
  if (status !== 200) return { ok: false, blocked: true, why: `네이버 응답 ${status}`, results: [] };

  const seen = new Set();
  const results = [];
  for (const m of text.matchAll(/blog\.naver\.com\/([a-zA-Z0-9_-]{3,})\/(\d{6,})/g)) {
    const key = `${m[1]}/${m[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      rank: results.length + 1,
      blogId: m[1],
      logNo: m[2],
      url: `https://blog.naver.com/${m[1]}/${m[2]}`,
    });
    if (results.length >= limit) break;
  }

  // 네이버가 "검색결과 없음"이라고 명시한 경우 — 이건 믿을 수 있는 0건입니다.
  const explicitlyEmpty = /검색결과가 없습니다|에 대한 검색결과가 없습니다/.test(text);
  if (explicitlyEmpty && !results.length) {
    return { ok: true, results: [], why: "검색 결과 없음" };
  }

  // ⚠️ 결과가 적다고 무조건 "막혔다"고 보면 안 됩니다.
  //
  // 처음엔 10건 미만이면 판정을 포기하게 했습니다. 차단을 걸러내려던 건데,
  // **긴 제목으로 검색하면 원래 결과가 적습니다.** 실측: 30자짜리 기사 제목으로
  // 검색하니 4~6건이 나왔고, 그 안에 찾던 글이 **1위**로 들어 있었습니다.
  // 그런데 코드는 "10건 미만이니 모르겠다"며 그 1위를 버렸습니다.
  //
  // 답이 눈앞에 있는데 안 본 겁니다. 그래서 판단을 부르는 쪽으로 넘깁니다.
  //   - 찾던 글이 결과 안에 있으면 → 건수와 무관하게 그게 답입니다.
  //   - 없는데 결과까지 적으면 → 그때는 "모르겠다"가 맞습니다.
  // 이 구분은 여기서 못 합니다. 무엇을 찾는지는 부르는 쪽만 아니까요.
  const lowConfidence = results.length < SUSPICIOUS_MIN;

  return {
    ok: true,
    results,
    lowConfidence,
    why: lowConfidence
      ? `검색 결과가 ${results.length}건뿐입니다. 찾는 글이 여기 없다면 판정하지 않는 편이 안전합니다.`
      : undefined,
  };
}

/**
 * 특정 글이 특정 키워드로 몇 위인지. 없으면 rank: null.
 */
async function findRank(keyword, blogId, logNo, opts = {}) {
  const r = await searchBlogRanking(keyword, opts);
  // 못 읽었으면 rank를 null로 주지 않습니다. null은 "30위 밖"이라는 뜻이라
  // "못 읽었다"와 뜻이 완전히 다릅니다. undefined로 구분합니다.
  if (!r.ok) return { ok: false, blocked: !!r.blocked, why: r.why, rank: undefined };
  const hit = r.results.find(
    (x) => x.blogId === blogId && (!logNo || x.logNo === String(logNo))
  );
  return { ok: true, rank: hit ? hit.rank : null, checked: r.results.length };
}

module.exports = {
  parseBlogId,
  parsePostUrl,
  fetchVisitors,
  fetchPostList,
  searchBlogRanking,
  findRank,
};
