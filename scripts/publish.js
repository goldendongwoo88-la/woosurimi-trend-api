// 올린 뒤 기록 — 중복 차단 + 성과 장부 등록 (2026-09-02)
//
//   node scripts/publish.js --list                          오늘 기획 목록
//   node scripts/publish.js --n 1 --채널 threads --계정 goldenwoo
//   node scripts/publish.js --n 1 --채널 youtube --계정 우수리미 --url https://...
//
// 왜 발행 시점에 적나: 기획할 때 적으면 **안 올린 것까지 장부에 쌓여** 평균이 통째로 틀어집니다.
// 그리고 올린 뒤에 적으려면 "이 소재를 왜 골랐더라"를 기억해야 하는데, 그건 못 합니다.
// 그래서 기획은 파일로 들고 있다가, **올렸다고 말하는 순간** 내력째로 장부에 넘깁니다.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const L = require("../src/uploadLedger");
const HS = require("../src/homeShoppingSchedule");

let SL = null;
try { SL = require(path.join(__dirname, "..", "..", "gw_analytics_2026", "lib", "shopLedger")); } catch {}

const a = process.argv.slice(2);
const opt = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
const date = opt("--date", HS.ymd());

const INBOX = path.join(__dirname, "..", "..", "golden-shop-shorts", "data", "inbox", `${date}.json`);
let box = null;
try { box = JSON.parse(fs.readFileSync(INBOX, "utf8")); } catch {}
if (!box) { console.log(`\n${date} 기획이 없습니다. 먼저: node scripts/daily.js\n`); process.exit(1); }

if (a.includes("--list") || !a.length) {
  console.log(`\n■ ${date} 기획 (${box.jobs.length}건)\n`);
  box.jobs.forEach((j, i) => {
    const 어디 = L.where(`${date}-${j.상품명}`);
    console.log(`  ${i + 1}. ${j.상품명.padEnd(18)} ${j.메타.훅유형 || "-"} · 댓글에 "${j.메타.ctaKeyword}"`);
    console.log(`     ${어디.length ? "이미 올림: " + 어디.map((x) => x.platform + "/" + x.account).join(", ") : "아직 안 올림"}`);
  });
  console.log(`\n올린 뒤: node scripts/publish.js --n 1 --채널 threads --계정 <계정명>\n`);
  process.exit(0);
}

const n = Number(opt("--n", 0));
const job = box.jobs[n - 1];
if (!job) { console.log(`\n--n ${n} 이 없습니다. --list 로 확인하십시오.\n`); process.exit(1); }

const 채널 = opt("--채널"), 계정 = opt("--계정");
if (!채널 || !계정) { console.log("\n--채널 과 --계정 이 필요합니다.\n"); process.exit(1); }

const contentId = `${date}-${job.상품명}`;

/** 올리기 전 검사 — 같은 플랫폼 다중계정이면 여기서 막습니다. */
const 검사 = L.canUpload(contentId, 채널, 계정);
if (!검사.ok) {
  console.log(`\n🚫 ${검사.사유}\n   ${검사.설명}\n   → ${검사.대안}\n`);
  process.exit(1);
}
console.log(`\n✅ ${검사.안내}`);

L.record(contentId, 채널, 계정, { product: job.상품명 });

if (SL) {
  const rec = SL.logShop({
    제품: job.상품명, 품목: job.메타.유래?.split("→").pop()?.trim() || "",
    유래: job.메타.유래, 형태: opt("--형태", "나레이션형"),
    훅유형: job.메타.훅유형, 화자: job.메타.화자, ctaKeyword: job.메타.ctaKeyword,
    구매력: job.메타.구매력, 수수료군: (job.메타.수수료 || "").replace(/.*\(|\)/g, ""),
    채널, 계정, url: opt("--url", ""),
    대본점수: job.메타.대본점수, 길이초: job.메타.길이초,
  });
  console.log(`   장부 등록: ${rec.id}`);
  console.log(`\n성과가 나오면: node ../gw_analytics_2026/shop-input.js --id ${rec.id} --조회 0 --클릭 0 --주문 0 --수익 0\n`);
} else {
  console.log("   ⚠ 성과 장부(gw_analytics_2026)를 못 찾아 기록을 건너뛰었습니다.\n");
}
