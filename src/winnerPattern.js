/**
 * 터진 영상의 공식 뽑아내기 — 2026-09-01
 *
 * 파인더가 찾아준 "효율 높은 영상"들을 놓고, **무엇을 따라 해야 하는지**를 숫자로 뽑습니다.
 *
 * ── 무엇을 따라 하고 무엇을 따라 하면 안 되는가 ──
 * 따라 해도 되는 것: 제목 공식, 훅 어휘, 영상 길이, 구성 순서, 해시태그 개수, 올리는 시간.
 *   이건 **저작권 대상이 아닙니다.** 그리고 실제로 조회수를 만드는 건 대부분 이쪽입니다.
 * 따라 하면 안 되는 것: **영상·사진 자체.** 남의 화면을 그대로 쓰면 저작권 침해이고,
 *   유튜브 재사용 콘텐츠 정책에 걸려 수익화가 거절됩니다. 채널이 돈을 못 벌면 아무 의미가 없습니다.
 *
 * ── AI를 안 씁니다 ──
 * 전부 코드로 셉니다. "제목에 숫자가 몇 %나 들어갔나" 같은 건 세면 되는 일이지 판단할 일이 아닙니다.
 * AI는 나중에 **우리 대본을 쓸 때** 부르면 됩니다(그건 사장님 승인 후).
 */

/** 세는 데 방해만 되는 흔한 말들. 이걸 빼야 진짜 훅 단어가 보입니다. */
const STOP = new Set([
  "이거", "그거", "저거", "정말", "진짜", "너무", "아주", "매우", "완전", "그냥", "약간",
  "하는", "있는", "없는", "되는", "같은", "이런", "저런", "그런", "우리", "당신", "여러분",
  "합니다", "입니다", "했어요", "해요", "이에요", "예요", "거예요", "합니다만",
  "shorts", "short", "쇼츠", "영상", "추천", "리뷰", "브이로그",
]);

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/u;
const HASHTAG = /#[^\s#]+/g;

/** 가운데 값. 평균은 이상치 하나에 휘둘려서 "보통 이 정도"를 못 보여줍니다. */
function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

/** 제목에서 해시태그·이모지를 걷어낸 알맹이. 길이를 잴 때 이게 진짜 길이입니다. */
function titleCore(title) {
  return String(title || "").replace(HASHTAG, "").replace(new RegExp(EMOJI, "gu"), "").trim();
}

/**
 * 자주 나오는 낱말 — 이게 "훅 어휘"입니다.
 * 터진 영상들이 공통으로 쓰는 말이 있으면, 우리 제목에도 그 말을 넣어야 같은 사람들에게 걸립니다.
 */
function hookWords(titles, top = 12) {
  const count = new Map();
  for (const t of titles) {
    const words = titleCore(t)
      .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
    // 한 제목 안에서 같은 말이 여러 번 나와도 한 번만 셉니다 — 한 영상이 순위를 흔들지 않게.
    for (const w of new Set(words)) count.set(w, (count.get(w) || 0) + 1);
  }
  return [...count.entries()]
    .filter(([, n]) => n >= 2)          // 한 번만 나온 말은 우연입니다
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([word, n]) => ({ word, videos: n }));
}

/** 요일·시간대 — 언제 올렸을 때 터졌나. */
function whenPublished(rows) {
  const DAY = ["일", "월", "화", "수", "목", "금", "토"];
  const days = new Map(), hours = new Map();
  for (const r of rows) {
    if (!r.published) continue;
    const d = new Date(r.published);          // 한국 시간 기준으로 봅니다
    const kst = new Date(d.getTime() + 9 * 3600000);
    const dn = DAY[kst.getUTCDay()];
    const hh = kst.getUTCHours();
    days.set(dn, (days.get(dn) || 0) + 1);
    hours.set(hh, (hours.get(hh) || 0) + 1);
  }
  const top = (m, n = 3) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return {
    요일: top(days).map(([k, v]) => `${k}요일 ${v}편`),
    시간대: top(hours).map(([k, v]) => `${k}시 ${v}편`),
  };
}

/**
 * 공식 뽑기.
 * 입력은 파인더가 준 결과 배열(shapeVideo 형태)입니다.
 */
function analyze(rows) {
  const list = (rows || []).filter((r) => r && r.title);
  if (list.length < 3) {
    return { ok: false, error: `표본이 ${list.length}건뿐입니다. 최소 3건은 있어야 공식이라 할 수 있습니다.` };
  }

  const titles = list.map((r) => r.title);
  const cores = titles.map(titleCore);
  const n = list.length;

  const withNumber = titles.filter((t) => /\d/.test(t)).length;
  const withQuestion = titles.filter((t) => /[?？]/.test(t)).length;
  const withBang = titles.filter((t) => /[!！]/.test(t)).length;
  const withEmoji = titles.filter((t) => EMOJI.test(t)).length;
  const tagCounts = titles.map((t) => (t.match(HASHTAG) || []).length);

  // 참여도 — 우리 영상이 나왔을 때 "이 정도면 잘 나온 건가"를 재는 기준선입니다.
  const likeRates = list.filter((r) => r.views > 0).map((r) => +(r.likes / r.views * 100).toFixed(2));
  const commentRates = list.filter((r) => r.views > 0).map((r) => +(r.comments / r.views * 100).toFixed(2));

  return {
    ok: true,
    표본: n,
    제목: {
      글자수_중앙값: median(cores.map((t) => t.length)),
      글자수_범위: [Math.min(...cores.map((t) => t.length)), Math.max(...cores.map((t) => t.length))],
      숫자_포함: `${pct(withNumber, n)}%`,
      물음표: `${pct(withQuestion, n)}%`,
      느낌표: `${pct(withBang, n)}%`,
      이모지: `${pct(withEmoji, n)}%`,
      해시태그_중앙값: median(tagCounts),
    },
    훅어휘: hookWords(titles),
    길이: {
      초_중앙값: median(list.map((r) => r.duration)),
      초_범위: [Math.min(...list.map((r) => r.duration)), Math.max(...list.map((r) => r.duration))],
    },
    참여도: {
      좋아요율_중앙값: median(likeRates.map((x) => x * 100)) / 100 + "%",
      댓글율_중앙값: median(commentRates.map((x) => x * 100)) / 100 + "%",
    },
    게시시점: whenPublished(list),
    본보기: list.slice(0, 5).map((r) => ({
      효율: r.efficiency, 조회: r.views, 구독: r.subs, 초: r.duration, 제목: r.title, url: r.url,
    })),
  };
}

/**
 * 공식을 사람이 읽는 지시로 바꿉니다.
 * 숫자만 던져주면 "그래서 뭘 어떻게 하라는 건데"가 남습니다.
 */
function toBriefing(a) {
  if (!a.ok) return a.error;
  const t = a.제목;
  const lines = [];
  lines.push(`■ 표본 ${a.표본}편에서 뽑은 공식`);
  lines.push("");
  lines.push(`제목은 ${t.글자수_중앙값}자 안팎으로 씁니다 (${t.글자수_범위[0]}~${t.글자수_범위[1]}자).`);
  if (parseInt(t.숫자_포함) >= 50) lines.push(`· ${t.숫자_포함}가 제목에 숫자를 넣었습니다 — "TOP5", "3가지"처럼 개수를 박으십시오.`);
  if (parseInt(t.물음표) >= 30) lines.push(`· ${t.물음표}가 물음표를 씁니다 — 단정하지 말고 물어보십시오.`);
  if (parseInt(t.이모지) >= 50) lines.push(`· ${t.이모지}가 이모지를 답니다.`);
  if (t.해시태그_중앙값 > 0) lines.push(`· 해시태그는 ${t.해시태그_중앙값}개가 보통입니다.`);
  lines.push("");
  lines.push(`영상 길이는 ${a.길이.초_중앙값}초로 맞춥니다 (${a.길이.초_범위[0]}~${a.길이.초_범위[1]}초).`);
  lines.push("");
  if (a.훅어휘.length) {
    lines.push("이 사람들이 공통으로 쓰는 말 — 제목에 섞으십시오:");
    lines.push("  " + a.훅어휘.map((w) => `${w.word}(${w.videos}편)`).join(", "));
    lines.push("");
  }
  lines.push(`올린 때: ${a.게시시점.요일.join(", ")} / ${a.게시시점.시간대.join(", ")}`);
  lines.push(`잘 나왔다고 볼 기준: 좋아요율 ${a.참여도.좋아요율_중앙값}, 댓글율 ${a.참여도.댓글율_중앙값}`);
  lines.push("");
  lines.push("⚠ 따라 할 것은 여기까지입니다. 영상·사진 자체를 가져오면 저작권 침해이고,");
  lines.push("  유튜브 재사용 콘텐츠 정책에 걸려 수익화가 거절됩니다.");
  return lines.join("\n");
}

module.exports = { analyze, toBriefing, hookWords, titleCore, median };
