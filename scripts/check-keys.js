/**
 * API 키가 진짜로 도는지 확인합니다.
 *
 * ⚠️ 왜 따로 만들었나 — 키가 ".env 에 있다"와 "그 키로 실제 조회가 된다"는 완전히
 * 다른 말입니다. 지금까지는 키를 넣어도 첫 손님이 기능을 눌러봐야 알 수 있었습니다.
 * 그리고 실패할 때 "조회할 수 없습니다" 한 줄만 나와서, 키가 틀린 건지 권한이
 * 없는 건지 한도가 찬 건지 구분이 안 됐습니다. 그걸 구분해서 말해줍니다.
 *
 * ⚠️ 어디서 돌려야 하나 — 네이버로 나갈 수 있는 곳입니다.
 *   · Render 서버의 Shell 탭
 *   · 사장님 PC (.env 를 채운 상태로)
 * 개발용 컨테이너에서는 네이버가 막혀서 전부 "못 나감"으로 나옵니다.
 *
 *   node scripts/check-keys.js
 */
require("dotenv").config();
const crypto = require("crypto");

const TIMEOUT = Number(process.env.TIMEOUT_MS || 15000);

function mask(v) {
  if (!v) return "(비어 있음)";
  const s = String(v);
  return s.length <= 8 ? s[0] + "***" : s.slice(0, 4) + "***" + s.slice(-2);
}

async function ask(url, headers) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const text = await res.text().catch(() => "");
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

/** 응답 하나를 보고 "무엇을 해야 하는지"까지 말해줍니다. */
function verdict(r, what) {
  if (r.status === 0) {
    const net = /abort|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|tunnel|fetch failed/i.test(r.text);
    return net
      ? ["못 나감", `이 컴퓨터에서 ${what} 서버로 나가지 못합니다. 키 문제가 아닙니다.`, r.text.slice(0, 70)]
      : ["실패", r.text.slice(0, 80), ""];
  }
  // ⚠️ 프록시(방화벽)가 막으면 403 이 오는데, 그건 "키 권한 없음"이 아니라
  // "여기서 그 주소로 못 나간다"는 뜻입니다. 둘을 섞으면 멀쩡한 키를 의심하게 됩니다.
  // 실제로 이 도구 첫 판이 그 실수를 했습니다.
  if (/not in allowlist|egress|proxy|CONNECT tunnel|blocked by/i.test(r.text)) {
    return ["못 나감", `이 컴퓨터가 ${what} 로 나가지 못하게 막혀 있습니다. 키 문제가 아닙니다.`, r.text.slice(0, 80)];
  }

  if (r.status === 200) return ["됨", "", ""];
  if (r.status === 401) return ["키 틀림", "키가 맞지 않습니다. 콘솔에서 값을 다시 복사해 주세요.", r.text.slice(0, 90)];
  if (r.status === 403) return ["권한 없음", "키는 맞는데 이 API 를 쓸 권한이 없습니다. 콘솔에서 해당 API 이용 신청을 해주세요.", r.text.slice(0, 90)];
  if (r.status === 429) return ["한도 참", "오늘(또는 지금) 호출 한도를 다 썼습니다. 키는 정상입니다.", r.text.slice(0, 90)];
  if (r.status >= 500) return ["서버 문제", `${what} 쪽 문제입니다. 잠시 뒤 다시 해보세요.`, r.text.slice(0, 90)];
  return ["실패", `HTTP ${r.status}`, r.text.slice(0, 90)];
}

const rows = [];
function show(name, vals, v, detail, raw) {
  rows.push({ name, vals, v, detail, raw });
}

async function main() {
  console.log(`\nAPI 키 점검 — ${new Date().toLocaleString("ko-KR")}\n`);

  // ── 1. 네이버 API HUB (블로그·뉴스 검색) ──────────────
  //    주소는 src/naverBlogSearch.js 가 실제로 부르는 것과 같아야 합니다.
  //    다른 주소로 시험하면 "키는 되는데 기능은 안 되는" 상황을 못 잡습니다.
  {
    const id = process.env.NAVER_APIHUB_KEY_ID;
    const secret = process.env.NAVER_APIHUB_KEY_SECRET;
    const vals = `KEY_ID ${mask(id)} / SECRET ${mask(secret)}`;
    if (!id || !secret) {
      show("네이버 API HUB (블로그 검색)", vals, "비어 있음",
        "NAVER_APIHUB_KEY_ID 와 NAVER_APIHUB_KEY_SECRET 둘 다 있어야 합니다.", "");
    } else {
      const r = await ask(
        "https://naverapihub.apigw.ntruss.com/search/v1/blog?query=%ED%86%A0%EB%84%88&display=1",
        { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }
      );
      const [v, d, raw] = verdict(r, "네이버 클라우드");
      show("네이버 API HUB (블로그 검색)", vals, v, d, raw);
    }
  }

  // ── 2. 네이버 검색광고 (키워드 검색량) ────────────────
  {
    const key = process.env.NAVER_AD_API_KEY;
    const secret = process.env.NAVER_AD_SECRET_KEY;
    const cust = process.env.NAVER_AD_CUSTOMER_ID;
    const vals = `API_KEY ${mask(key)} / SECRET ${mask(secret)} / CUSTOMER ${mask(cust)}`;
    const missing = [
      !key && "NAVER_AD_API_KEY",
      !secret && "NAVER_AD_SECRET_KEY",
      !cust && "NAVER_AD_CUSTOMER_ID",
    ].filter(Boolean);
    if (missing.length) {
      show("네이버 검색광고 (검색량)", vals, "비어 있음", `${missing.join(", ")} 이(가) 없습니다. 세 개 다 필요합니다.`, "");
    } else {
      const ts = Date.now().toString();
      const sig = crypto.createHmac("sha256", secret).update(`${ts}.GET./keywordstool`).digest("base64");
      const r = await ask(
        "https://api.naver.com/keywordstool?hintKeywords=%ED%86%A0%EB%84%88&showDetail=1",
        { "X-Timestamp": ts, "X-API-KEY": key, "X-Customer": cust, "X-Signature": sig }
      );
      let [v, d, raw] = verdict(r, "네이버 검색광고");
      // 이 API 는 고객 ID 가 틀리면 401 이 아니라 403 으로 옵니다. 헷갈리지 않게 짚어줍니다.
      if (v === "권한 없음") d += " 고객 ID(CUSTOMER_ID)가 다른 계정 것일 수도 있습니다.";
      show("네이버 검색광고 (검색량)", vals, v, d, raw);
    }
  }

  // ── 3. Pexels (무료 사진) ─────────────────────────────
  {
    const key = process.env.PEXELS_API_KEY;
    const vals = `KEY ${mask(key)}`;
    if (!key) {
      show("Pexels (무료 사진)", vals, "비어 있음", "PEXELS_API_KEY 가 없습니다. 무료입니다.", "");
    } else {
      const r = await ask("https://api.pexels.com/v1/search?query=cosmetics&per_page=1", { Authorization: key });
      const [v, d, raw] = verdict(r, "Pexels");
      show("Pexels (무료 사진)", vals, v, d, raw);
    }
  }

  // ── 출력 ──────────────────────────────────────────────
  for (const r of rows) {
    const mark = r.v === "됨" ? "✓" : r.v === "못 나감" ? "·" : "✗";
    console.log(`${mark} ${r.v.padEnd(6)} ${r.name}`);
    console.log(`         ${r.vals}`);
    if (r.detail) console.log(`         → ${r.detail}`);
    if (r.raw) console.log(`         응답: ${r.raw}`);
    console.log("");
  }

  const ok = rows.filter((r) => r.v === "됨").length;
  const net = rows.filter((r) => r.v === "못 나감").length;
  console.log("───────────────");
  console.log(`  도는 것 ${ok}개 / 전체 ${rows.length}개`);
  if (net) console.log(`  ${net}개는 이 컴퓨터가 바깥으로 못 나가서 확인하지 못했습니다. Render 서버에서 다시 돌려주세요.`);
  console.log("");
  process.exit(rows.some((r) => ["키 틀림", "권한 없음", "실패"].includes(r.v)) ? 1 : 0);
}

main().catch((e) => { console.error("점검 자체가 실패했습니다:", e); process.exit(2); });
