/**
 * 오늘 AI에 얼마 썼는지 셉니다.
 *
 * ⚠️ 왜 필요한가
 * 오늘 크레딧이 0이 됐는데 **왜 그렇게 됐는지 알 방법이 없었습니다.**
 * 어느 기능이 얼마를 쓰는지, 오늘 얼마나 나갔는지 아무 데도 안 남았습니다.
 * 그래서 사장님이 "생각보다 너무 빨리 다 쓴다"고만 느끼셨습니다.
 *
 * ⚠️ 다른 대화창(증권사 에이전트)은 **넘으면 아예 막는** 방식을 씁니다.
 * 거기는 배치라 막아도 사람이 안 기다립니다.
 * 여기는 **손님이 쓰는 서버**입니다. 막으면 손님 화면이 그 자리에서 멈춥니다.
 * 그래서 여기는 **경고만** 합니다. 막을지 말지는 사장님이 정하실 일입니다.
 *
 * ⚠️ 무료 서버는 배포할 때마다 파일이 지워집니다.
 * 그래서 이 기록도 사라집니다. 그건 감수합니다 — 정확한 회계가 아니라
 * "오늘 많이 나갔나"를 보려는 것이니까요. 정확한 값은 Anthropic 콘솔에 있습니다.
 */

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "spend.json");

/** 하루 얼마를 넘으면 알릴지. 사장님이 $20 넣으셨으니 하루 $1이면 20일 갑니다. */
const DAILY_WARN_USD = Number(process.env.AI_DAILY_WARN_USD || 1);
const KRW = 1380;

let today = { day: "", usd: 0, calls: 0, byFeature: {} };

function dayStr() {
  // 한국 시간으로 하루를 끊습니다. UTC로 하면 오전 9시에 초기화됩니다.
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (raw.day === dayStr()) today = raw;
    else today = { day: dayStr(), usd: 0, calls: 0, byFeature: {} };
  } catch {
    today = { day: dayStr(), usd: 0, calls: 0, byFeature: {} };
  }
}

let timer = null;

function writeNow() {
  timer = null;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(today));
  } catch {}
}

/**
 * 2초 모아서 씁니다 — 부를 때마다 디스크를 두드리면 낭비입니다.
 *
 * ⚠️ 그런데 **미뤄둔 걸 못 쓰고 끝나는 경우**가 있습니다.
 * unref() 때문에 이 타이머는 프로그램을 붙잡아 두지 않습니다.
 * 그래서 짧게 돌다 끝나는 프로그램(시험 스크립트, 배치)은 마지막 기록을 잃습니다.
 *
 * 실제로 겪었습니다 — 시험에서 3번 불러 66원을 썼는데
 * 기록에는 **2번 61원**만 남았습니다. 마지막 한 번이 통째로 사라졌습니다.
 *
 * 돈을 세는 장부가 **적게 세는 것**이 제일 나쁩니다.
 * 많이 나갔는데 안 나간 줄 알게 되니까요. 끝날 때 반드시 씁니다.
 */
function save() {
  if (timer) return;
  timer = setTimeout(writeNow, 2000);
  if (timer.unref) timer.unref();
}

// 끝날 때 미뤄둔 게 있으면 마저 씁니다. exit 안에서는 동기 쓰기만 됩니다.
process.on("exit", () => { if (timer) { clearTimeout(timer); writeNow(); } });

/**
 * ⚠️ exit 핸들러는 **SIGTERM에서는 안 돕니다.** 서버를 멈추거나 다시 띄울 때 오는 게
 * SIGTERM인데, 신호로 죽을 때는 exit 이벤트 자체가 안 납니다(Node 문서).
 *
 * ⚠️ 이건 **윈도우에서 확인할 수 없습니다.** 윈도우에는 진짜 신호가 없어서
 * kill 을 해도 그냥 프로세스를 죽입니다. 실제 서버(리눅스)에서만 의미가 있습니다.
 * 그래서 아래 시험은 신호를 직접 쏘아 **핸들러 안의 판단**만 확인합니다.
 *
 * ⚠️ 솔직히 말씀드리면, **지금 쓰는 무료 서버에서는 이걸 고쳐도 달라지는 게 없습니다.**
 * 배포할 때마다 디스크가 통째로 지워져서 파일 자체가 사라지기 때문입니다.
 * 그래도 넣어둡니다 — 내 컴퓨터에서 돌릴 때와, 나중에 디스크를 붙이면 그때 필요합니다.
 *
 * ⚠️ 신호를 받겠다고 하면 **기본 동작(종료)이 사라집니다.** 그래서 우리가 직접 끝내야 하는데,
 * 다른 데서도 이 신호를 듣고 있으면 그쪽 정리가 끝나기 전에 잘라버릴 수 있습니다.
 * 우리가 유일한 청취자일 때만 끝냅니다.
 */
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (timer) { clearTimeout(timer); writeNow(); }
    if (process.listenerCount(sig) <= 1) process.exit(0);
  });
}

load();

/**
 * 한 번 부른 값을 기록합니다.
 * @param {string} feature 어느 기능인지 ("draft", "title", "emphasis"…)
 * @param {{usd:number}} usage claudeClient.getLastUsage()
 */
function record(feature, usage) {
  if (!usage || !usage.usd) return;
  if (today.day !== dayStr()) load();   // 날이 바뀌었으면 새로 시작
  today.usd = +(today.usd + usage.usd).toFixed(4);
  today.calls++;
  const f = feature || "기타";
  today.byFeature[f] = +((today.byFeature[f] || 0) + usage.usd).toFixed(4);
  save();
}

/** 지금 상태 — 화면과 관리자 페이지에서 씁니다. */
function status() {
  if (today.day !== dayStr()) load();
  const krw = Math.round(today.usd * KRW);
  const over = today.usd >= DAILY_WARN_USD;
  return {
    day: today.day,
    usd: +today.usd.toFixed(4),
    krw,
    calls: today.calls,
    limitUsd: DAILY_WARN_USD,
    limitKrw: Math.round(DAILY_WARN_USD * KRW),
    over,
    // ⚠️ 막지 않습니다. 손님 서버라 막으면 그 자리에서 멈춥니다.
    warning: over
      ? `오늘 AI에 ${krw.toLocaleString()}원 썼습니다. 정해둔 하루 기준(${Math.round(DAILY_WARN_USD * KRW).toLocaleString()}원)을 넘었습니다.`
      : null,
    byFeature: Object.entries(today.byFeature)
      .map(([k, v]) => ({ feature: k, usd: +v.toFixed(4), krw: Math.round(v * KRW) }))
      .sort((a, b) => b.usd - a.usd),
    note: "무료 서버는 배포할 때마다 이 기록이 지워집니다. 정확한 값은 Anthropic 콘솔에 있습니다.",
  };
}

module.exports = { record, status, DAILY_WARN_USD };
