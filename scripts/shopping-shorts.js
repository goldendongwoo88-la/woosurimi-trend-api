// 쇼핑 쇼츠 한 줄 파이프라인 (2026-09-02)
//
//   node scripts/shopping-shorts.js "주방 꿀템" --count 5
//
// 하는 일: 소재 발굴 → 쿠팡에 팔 물건 있나 확인 → 후킹 채점 → 장부 기록 → 링크 등록 준비
//
// ⚠️ 영상 렌더링은 이 단계에서 안 합니다.
// 33개 채널 분석에서 가장 비싼 실수가 "팔 물건 없는 소재로 영상부터 만드는 것"이었습니다.
// 그래서 **팔 수 있는 소재만 남긴 뒤** 사장님이 확인하고 렌더를 돌리게 나눴습니다.
// 렌더는 무겁고(편당 수 분), 잘못된 소재로 돌리면 그 시간이 통째로 날아갑니다.

const path = require("path");
const finder = require("../src/shortsSourceFinder");
const coupang = require("../src/coupangPartners");

let hookEngine = null, ledger = null;
try { hookEngine = require(path.join(__dirname, "..", "..", "_shared", "hook-engine")); } catch {}
try { ledger = require(path.join(__dirname, "..", "..", "gw_analytics_2026", "lib", "store")); } catch {}

const args = process.argv.slice(2);
const keyword = args.find((a) => !a.startsWith("--"));
const num = (flag, d) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) || d : d; };
const count = num("--count", 5);
const dryRun = args.includes("--dry-run");

if (!keyword) {
  console.log('사용: node scripts/shopping-shorts.js "키워드" [--count 5] [--dry-run]');
  process.exit(1);
}

const won = (n) => (+n || 0).toLocaleString() + "원";

(async () => {
  console.log(`\n■ "${keyword}" 쇼핑 쇼츠 준비\n`);

  // 1) 소재 발굴 — 효율(조회수÷구독자) 높은 것부터
  console.log("1/4  소재 발굴 중… (유튜브)");
  const found = await finder.findSources(keyword, { inspectTop: count, shortsOnly: false });
  if (!found.results.length) return console.log("   소재를 못 찾았습니다.");
  console.log(`     검색 ${found.searched}개 → 정밀 조회 ${found.checked}개\n`);

  // 2) 쿠팡에 팔 물건이 있나
  console.log("2/4  쿠팡 판매 가능 확인 중…");
  const sell = await coupang.checkSellable(keyword);
  if (sell.sellable === null) {
    console.log(`     ⚠️ ${sell.why}`);
    console.log("     → 소재는 뽑되, 팔 물건 확인은 사장님이 직접 하셔야 합니다.\n");
  } else if (!sell.sellable) {
    console.log(`     ✗ ${sell.why}`);
    console.log("     → 이 키워드로는 영상을 만들지 마세요. 조회수 수익만 남습니다.\n");
    if (!args.includes("--force")) return console.log("중단했습니다. 그래도 진행하려면 --force\n");
  } else {
    console.log(`     ✓ ${sell.why}`);
    if (sell.best) console.log(`     대표상품: ${sell.best.name} (${won(sell.best.price)})\n`);
  }

  // 3) 후킹 채점 — 어떤 제목을 쓸지
  console.log("3/4  후킹 채점 중…");
  const picked = [];
  for (const v of found.results) {
    const score = hookEngine ? hookEngine.scoreTitle(v.title, "shop")   /* money는 부업 콘텐츠 축입니다 */ : { mult: null, devices: [] };
    picked.push({ ...v, hookMult: score.mult, devices: score.devices });
  }
  picked.sort((a, b) => (b.hookMult || 0) - (a.hookMult || 0));
  console.log("");

  // 4) 결과 + 장부 기록
  console.log("4/4  결과\n");
  picked.forEach((v, i) => {
    const eff = v.efficiency == null ? " ?" : v.efficiency.toFixed(1);
    const ready = v.remake && v.remake.ready ? "◎적기" : "△대기";
    const danger = v.copyright.some((f) => f.level === "danger");
    console.log(`${String(i + 1).padStart(2)}. 효율 ${String(eff).padStart(5)} · 훅 ${v.hookMult ?? "?"}x · ${ready}${danger ? " · 🚫저작권위험" : ""}`);
    console.log(`    ${v.title.slice(0, 58)}`);
    console.log(`    ${v.url}`);
  });

  const usable = picked.filter((v) => !v.copyright.some((f) => f.level === "danger"));
  console.log(`\n쓸 수 있는 소재 ${usable.length}개 / 전체 ${picked.length}개`);

  if (!dryRun && ledger) {
    for (const v of usable) {
      ledger.logContent({
        channel: "shorts", mode: "shopping", title: v.title,
        devices: v.devices, titleScore: v.hookMult, topic: keyword,
      });
    }
    console.log(`장부에 ${usable.length}건 기록했습니다.`);
  }

  console.log("\n다음 단계");
  console.log("  1) 쓸 소재를 고르신 뒤 shortsStudio로 렌더");
  console.log("  2) node scripts/affiliate.js add <콘텐츠ID> <쿠팡링크> <제품명> <채널>");
  console.log("  3) node scripts/affiliate.js block <콘텐츠ID>  ← 붙여넣을 문구\n");
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
