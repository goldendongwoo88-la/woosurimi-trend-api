/**
 * 쇼핑쇼츠 일일 파이프라인 — 2026-09-02
 *
 * 하루 한 번 돌면 **오늘 만들 것이 정해져서 파일로 떨어집니다.**
 * 정본: docs/돈농부-김정빈-라이브분석-2026-0901.md · docs/쇼핑쇼츠-수익화-실행플랜.md
 *
 * ── 설계 원칙 (my-project/docs/AI회사-조직설계-노하우.md) ──
 * 상태를 5종으로 적습니다. **"승인 대기"(사장님 결정)와 "연동 대기"(키·계정 필요)와
 * "대기"(그냥 순서)를 한 덩어리로 만들지 않습니다.** 안 나누면 "왜 안 돼?"에 답을 못 합니다.
 *
 * ── 어디서 멈추는가 ──
 * 쿠팡 키가 없으면 **4단계에서 멈춥니다. 이건 고장이 아니라 설계입니다.**
 * 팔 물건이 없는 소재로 영상을 만들면 조회수가 100만이어도 0원입니다.
 * 렌더는 편당 수 분이 들어서, 잘못된 소재로 돌리면 그 시간이 통째로 날아갑니다.
 */

const fs = require("fs");
const path = require("path");

const HS = require("./homeShoppingSchedule");
const SIG = require("./shoppingSignals");
const SD = require("./scriptDraft");
const CF = require("./contentFormats");
const CM = require("./commission");
const CB = require("./comboSource");
let SC = null, coupang = null, BRIDGE = null;
try { SC = require(path.join(__dirname, "..", "..", "_shared", "script-check")); } catch {}
try { coupang = require("./coupangPartners"); } catch {}
try { BRIDGE = require("./deptBridge"); } catch {}

const 상태 = { DONE: "done", RUNNING: "running", APPROVAL: "wait_approval",
               INTEGRATION: "wait_integration", QUEUED: "queued" };

const OUT = path.join(__dirname, "..", "output", "daily");

/**
 * 하루치 실행.
 * @param {{date?:string, want?:number, month?:number, write?:boolean}} opts
 */
async function run({ date = HS.ymd(), want = 5, month = null, write = true } = {}) {
  const m = month || new Date().getMonth() + 1;
  const steps = [];
  const say = (단계, st, 내용) => { steps.push({ 단계, 상태: st, 내용 }); return 내용; };

  // ── 1) 소재 발굴 ──
  const sch = await HS.fetchSchedule(date);
  say("1 소재 발굴 (홈쇼핑 편성)", sch.items.length ? 상태.DONE : 상태.INTEGRATION,
      `편성 ${sch.items.length}건${sch.errors.length ? ` · 실패 ${sch.errors.join(", ")}` : ""}`);
  if (!sch.items.length) return { ok: false, date, steps, 병목: "홈쇼핑 편성을 못 받았습니다" };

  // ── 2) 결합형 (최고 수익 형태) ──
  const combo = await CB.todayCombos({ month: m });
  say("2 결합형 이슈", combo.쓸수있음.length ? 상태.DONE : 상태.QUEUED,
      combo.쓸수있음.length ? combo.쓸수있음.slice(0, 3).map((c) => `${c.이슈}→${c.카테고리}`).join(" / ")
                            : "오늘은 붙일 이슈 없음 (정상) — 시즌 소재로 갑니다");

  // ── 3) 선정 ──
  const picks = HS.toCandidates(sch.items, SIG, { top: want, month: m });
  say("3 소재 선정 (구매력×수수료)", 상태.DONE,
      picks.map((p) => `${p.제품}(${p.구매력})`).join(", "));

  // ── 4) 쿠팡 확인 — 여기가 게이트입니다 ──
  const 연동 = coupang?.isConfigured?.() || false;
  for (const p of picks) {
    if (!연동) { p.coupang = { sellable: null, why: "쿠팡 파트너스 키 없음" }; continue; }
    try { p.coupang = await coupang.checkSellable(p.제품); }
    catch (e) { p.coupang = { sellable: null, why: `확인 실패: ${e.message}` }; }
  }
  say("4 쿠팡 판매 확인", 연동 ? 상태.DONE : 상태.INTEGRATION,
      연동 ? `${picks.filter((p) => p.coupang?.sellable).length}/${picks.length} 판매 가능`
           : "COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 가 비어 있습니다");

  // ── 5) 기획 + 대본 + 형태별 산출물 ──
  for (const p of picks) {
    const cat = SIG.inferCategory(p.제품);
    const price = p.coupang?.best?.price || 0;
    p.기획 = {
      카테고리: cat,
      수수료: CM.coupangRate(p.제품),
      최적경로: CM.bestRoute(p.제품, price),
      예상수익_건당: CM.expectedRevenue(price, p.제품),
      대본: SD.draft(p.제품, { category: cat, price }),
      형태: CF.all(p.제품, { price }),
    };
    p.기획.채점 = SC ? SC.checkScript(p.기획.대본.text) : null;
  }
  say("5 기획·대본·형태", 상태.DONE, `${picks.length}건 × 형태 ${picks[0]?.기획.형태.length || 0}종`);

  // ── 6) 렌더 — 쿠팡 확인 전에는 안 넘깁니다 ──
  const 렌더가능 = picks.filter((p) => p.coupang?.sellable === true);
  say("6 렌더", 렌더가능.length ? 상태.QUEUED : 상태.INTEGRATION,
      렌더가능.length ? `${렌더가능.length}건 렌더 대기`
                      : "쿠팡 확인 전에는 렌더로 넘기지 않습니다 (설계)");

  // ── 7) 업로드 ──
  say("7 업로드", 상태.INTEGRATION, "유튜브 OAuth 미설정 — 지금은 수동 업로드");

  /** 병목은 **하나만** 짚습니다. 여러 개 늘어놓으면 뭘 먼저 할지 못 정합니다. */
  const 병목 = !연동
    ? "쿠팡 파트너스 키가 비어 있습니다. 링크를 못 만들면 조회수가 나와도 수익이 0원입니다. 이것 하나가 전부를 막고 있습니다."
    : 렌더가능.length === 0 ? "선정한 소재 중 쿠팡에 팔 물건이 없습니다. 키워드를 바꾸십시오."
    : "지연 없습니다. 렌더 → 업로드만 남았습니다.";

  const result = { ok: true, date, 시즌: SIG.시즌배율(m), steps, picks, combo, 병목,
                   요약: { 편성: sch.items.length, 선정: picks.length,
                          판매가능: picks.filter((p) => p.coupang?.sellable === true).length,
                          발행가능대본: picks.filter((p) => p.기획.채점?.pass).length } };

  if (write) {
    result.저장 = writeBrief(result);
    /**
     * 부서(golden-shop-shorts)로 넘깁니다. 여기서 끊기면 사장님이 손으로 옮겨 적으셔야 합니다.
     * 부서 앱이 꺼져 있어도 파일로 남기므로 새벽 예약 실행이 헛돌지 않습니다.
     */
    if (BRIDGE) {
      try {
        const b = await BRIDGE.push(result);
        result.부서 = b;
        result.steps.push({ 단계: "8 부서 전달", 상태: 상태.DONE, 내용: `${b.count}건 → ${b.알림}` });
      } catch (e) {
        result.steps.push({ 단계: "8 부서 전달", 상태: 상태.INTEGRATION, 내용: `실패: ${e.message}` });
      }
    }
  }
  return result;
}

/** 기획서를 파일로 떨굽니다. 화면에만 찍으면 다음 날 사라집니다. */
function writeBrief(r) {
  fs.mkdirSync(OUT, { recursive: true });
  const L = [];
  L.push(`# 오늘의 쇼핑쇼츠 — ${r.date}`, "");
  L.push(`시즌: ${r.시즌.이름} (×${r.시즌.v})`, "");
  L.push(`> **병목**: ${r.병목}`, "");
  L.push("## 진행 상태", "", "| 단계 | 상태 | 내용 |", "|---|---|---|");
  for (const s of r.steps) L.push(`| ${s.단계} | ${s.상태} | ${s.내용} |`);
  L.push("");
  for (const [i, p] of r.picks.entries()) {
    const g = p.기획;
    L.push(`## ${i + 1}. ${p.제품}`, "");
    L.push(`- 유래: ${p.방송시간} "${p.원본}" → ${p.품목}`);
    L.push(`- 구매력 ${p.구매력}배 [${p.등급}] · 수수료 ${(g.수수료.rate * 100).toFixed(0)}% (${g.수수료.군})`);
    L.push(`- 쿠팡: ${p.coupang?.sellable === true ? "판매 가능" : p.coupang?.sellable === false ? "없음" : `확인 못함 — ${p.coupang?.why}`}`);
    if (g.최적경로.경로[1]) L.push(`- 더 받는 곳: ${g.최적경로.경로[0].제휴처} ${g.최적경로.경로[0].요율} (${g.최적경로.경로[0].상태})`);
    L.push("", `### 대본 (${g.채점?.예상초 || "?"}초 · ${g.채점?.score || "?"}점)`, "");
    for (const 줄 of g.대본.줄) L.push(`**${줄.단}** ${줄.문장}`, `> ${줄.메모}`, "");
    if (g.대본.needsInput?.length) L.push(`⚠️ ${g.대본.needsInput.join(" / ")}`, "");
    L.push(`### 형태별 산출물`, "");
    for (const f of g.형태) L.push(`- **${f.형태}** (${f.제작시간}) → ${(CF.형태별플랫폼[f.형태] || []).join(", ")}`);
    L.push("");
  }
  L.push("---", "", "## 올리기 전 확인", "");
  for (const x of SIG.계정규칙.filter((v) => v.금지)) L.push(`- 🚫 ${x.규칙} → ${x.결과}`);
  const file = path.join(OUT, `${r.date}.md`);
  fs.writeFileSync(file, L.join("\n"), "utf8");
  return file;
}

module.exports = { run, writeBrief, 상태, OUT };
