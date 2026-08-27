/**
 * 가십 벤치마킹 블로거 — 닉네임만 있고 주소가 없어서, 주소를 역추적합니다.
 *
 * 방법: 블로그 이름으로 네이버 검색 → 자주 나오는 아이디 후보 → 각 후보의
 * **블로그 대문 제목을 직접 열어** 이름이 맞는지 확인 → 맞는 것만 채택.
 * ⚠️ 추측으로 채택하지 않습니다. 대문 제목이 안 맞으면 "못 찾음"으로 남깁니다 —
 * 엉뚱한 블로그를 분석해놓고 맞다고 하는 것보다 낫습니다.
 */

const fs = require("fs");
const path = require("path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// (닉네임, 검색어, 대문 제목에서 확인할 글자)
const TARGETS = [
  ["러블리여사", "러블리여사 블로그", "러블리여사"],
  ["이미닛", "매일 매일 기록 이미닛", "매일 매일 기록"],
  ["효니", "효니 연예 블로그", "효니"],
  ["점자니", "점자니 블로그", "점자니"],
  ["머니파수꾼", "매일 적립하는 부자 습관", "부자 습관"],
  ["꼴뚝", "꼴뚝 네이버 블로그", "꼴뚝"],
  ["달콤한 레슬리", "레슬리 웰니스매거진", "웰니스매거진"],
  ["스밀라", "스밀라의 휘게 라이프", "휘게"],
  ["리브노아", "리브노아의 패션뷰티 이슈로그", "리브노아"],
  ["짱구", "비카요모조모", "비카요모조모"],
  ["해적왕", "해적왕의 여행 일상 이야기", "해적왕"],
  ["홍기자", "홍기자 네이버 블로그", "홍기자"],
  ["Tom편집장", "오늘의 추천아이템 Tom편집장", "추천아이템"],
  ["제씨킴", "패션 디자이너의 Closet", "Closet"],
  ["또또", "또또들 블로그", "또또"],
  ["힐스터K", "힐스터K랑 오늘은 이거 볼래", "힐스터"],
  ["Aping트롱", "Aping트롱 2026", "트롱"],
];

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  return r.text();
}

/** 검색 결과에서 자주 등장하는 아이디 순으로 후보를 냅니다. */
async function candidates(query) {
  const html = await get(`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(query)}`);
  const counts = {};
  for (const m of html.matchAll(/blog\.naver\.com\/([A-Za-z0-9_-]{3,20})/g)) {
    const id = m[1];
    if (["PostView", "MyBlog", "prologue"].includes(id)) continue;
    counts[id] = (counts[id] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 5);
}

/** 블로그 대문 제목 — 여기에 이름이 있으면 진짜입니다. */
async function blogTitle(id) {
  try {
    const html = await get(`https://m.blog.naver.com/${id}`);
    const m = html.match(/<title>([^<]{1,80})<\/title>/);
    return m ? m[1].replace(/\s*:\s*네이버\s*블로그.*/, "").trim() : "";
  } catch { return ""; }
}

(async () => {
  const found = {}, missed = [];
  for (const [nick, query, mustHave] of TARGETS) {
    process.stdout.write(`${nick} … `);
    try {
      const cands = await candidates(query);
      let hit = null;
      for (const id of cands) {
        await sleep(400);
        const t = await blogTitle(id);
        if (t && t.replace(/\s+/g, "").includes(mustHave.replace(/\s+/g, ""))) { hit = { id, title: t }; break; }
      }
      if (hit) { found[nick] = hit; console.log(`✓ ${hit.id} ("${hit.title}")`); }
      else { missed.push(nick); console.log(`✗ 못 찾음 (후보: ${cands.join(", ") || "없음"})`); }
    } catch (e) { missed.push(nick); console.log(`✗ 오류: ${e.message}`); }
    await sleep(600);
  }

  // Dow듀듀는 이미 압니다.
  found["Dow듀듀"] = { id: "tnwjd955", title: "듀듀의 블로그" };

  const file = path.join(__dirname, "..", "data", "gossip-blogs.json");
  fs.writeFileSync(file, JSON.stringify({ found, missed, at: new Date().toISOString() }, null, 1), "utf8");
  console.log(`\n찾음 ${Object.keys(found).length} · 못 찾음 ${missed.length}${missed.length ? " (" + missed.join(", ") + ")" : ""}`);
  console.log(`저장: ${file}`);
})();
