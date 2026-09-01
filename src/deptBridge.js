/**
 * 쇼핑쇼츠 부서 연동 — trend-api(기획) → golden-shop-shorts(렌더) (2026-09-02)
 *
 * ── 두 곳이 하는 일이 다릅니다 ──
 *   woosurimi-trend-api  : **무엇을 만들지** 정합니다 (소재 발굴·구매력·대본·형태)
 *   golden-shop-shorts   : **실제로 만듭니다** (켄번즈·TTS·자막·BGM·렌더·성과 장부)
 * 둘이 안 붙어 있어서 사장님이 매번 손으로 옮겨 적고 계셨습니다. 그 손을 없앱니다.
 *
 * ── 파일로 넘깁니다 (HTTP는 보조) ──
 * 부서 앱(8489)이 꺼져 있을 때가 많습니다. 서버가 떠 있어야만 전달되는 구조면
 * **새벽 7시 예약 실행이 조용히 아무것도 안 하고 끝납니다.**
 * 그래서 파일로 먼저 떨구고, 서버가 살아 있으면 알림만 추가로 보냅니다.
 * 부서 앱은 켤 때 inbox를 읽으면 됩니다.
 */

const fs = require("fs");
const path = require("path");

const DEPT = path.join(__dirname, "..", "..", "golden-shop-shorts");
const INBOX = path.join(DEPT, "data", "inbox");

/**
 * 우리 기획 → 부서 렌더 입력.
 *
 * 부서는 상품명·가격·특징 3~5개·제휴링크·사진, 그리고 장면별(오버레이 문구 + 내레이션)을 받습니다.
 * 우리 5단 대본이 그대로 장면이 됩니다 — **훅/공감/발견/근거/마무리가 곧 5장면**입니다.
 */
/**
 * 화면 자막용으로 줄입니다.
 *
 * ⚠️ 글자수로 그냥 자르면 "쓸 때마다 물건이 쏟"처럼 낱말 중간에서 끊깁니다.
 * 화면에 그대로 박히는 문구라 이러면 못 씁니다. **어절 단위로** 자르고,
 * 잘렸으면 말줄임을 붙여 "여기서 끝난 게 아니다"를 보이게 합니다.
 */
function overlay(text, max = 20) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  let out = "";
  for (const w of t.split(" ")) {
    if ((out + " " + w).trim().length > max) break;
    out = (out + " " + w).trim();
  }
  return (out || t.slice(0, max)) + "…";
}

function toDeptJob(pick) {
  const g = pick.기획;
  const 장면 = g.대본.줄.map((줄, i) => ({
    n: i + 1,
    단: 줄.단,
    오버레이: overlay(줄.문장, 줄.단.startsWith("① 훅") ? 22 : 18),
    내레이션: 줄.문장,
    연출: 줄.메모,
  }));
  return {
    상품명: pick.제품,
    가격: pick.coupang?.best?.price || null,
    제휴링크: pick.coupang?.best?.url || null,          // 쿠팡 키가 없으면 null입니다
    특징: g.대본.needsInput?.length
      ? ["(근거 1 — 제품 상세에서 채우십시오)", "(근거 2 — 숫자나 비교)"]
      : [],
    장면,
    메타: {
      유래: `${pick.방송시간} ${pick.원본} → ${pick.품목}`,
      구매력: pick.구매력, 등급: pick.등급,
      수수료: `${(g.수수료.rate * 100).toFixed(0)}% (${g.수수료.군})`,
      더받는곳: g.최적경로.경로[1] ? `${g.최적경로.경로[0].제휴처} ${g.최적경로.경로[0].요율}` : null,
      화자: g.대본.persona.화자, 훅유형: g.대본.hookType,
      ctaKeyword: g.대본.ctaKeyword,
      대본점수: g.채점?.score ?? null,
      길이초: g.채점?.예상초 ?? null,
      형태: g.형태.map((f) => f.형태),
    },
  };
}

/**
 * inbox에 떨굽니다.
 * @returns {{file:string, count:number, 알림:string}}
 */
async function push(result, { notify = true } = {}) {
  fs.mkdirSync(INBOX, { recursive: true });
  const jobs = result.picks.map(toDeptJob);
  const payload = {
    date: result.date,
    생성: new Date().toISOString(),
    시즌: result.시즌.이름,
    병목: result.병목,
    준비됨: jobs.filter((j) => j.제휴링크).length,   // 링크가 있어야 렌더 의미가 있습니다
    jobs,
  };
  const file = path.join(INBOX, `${result.date}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  let 알림 = "부서 앱이 꺼져 있습니다 — 켜면 inbox에서 읽습니다";
  if (notify) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 2500);
      const r = await fetch("http://localhost:8489/api/health", { signal: c.signal });
      clearTimeout(t);
      if (r.ok) 알림 = "부서 앱(8489) 살아 있음 — 새로고침하면 보입니다";
    } catch { /* 꺼져 있어도 파일은 남았으니 문제 없습니다 */ }
  }
  return { file, count: jobs.length, 알림 };
}

/** 부서 쪽에서 오늘 것 읽기. */
function read(date) {
  try { return JSON.parse(fs.readFileSync(path.join(INBOX, `${date}.json`), "utf8")); }
  catch { return null; }
}

module.exports = { push, read, toDeptJob, INBOX, DEPT };
