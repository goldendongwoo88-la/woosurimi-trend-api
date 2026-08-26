/**
 * 홈판(홈피드) 제목 규칙 — 실측으로 알아낸 것을 한 곳에 모아둡니다.
 *
 * ⚠️ 여기 있는 숫자는 전부 **직접 세어본 값**입니다. 어디서 들은 이야기가 아닙니다.
 * 2026년 8월 27일, 두 블로그의 제목을 각 90편씩 세었습니다.
 *
 *   니들의연애가중계(nidle_831)  글 145편   일 방문 74,094명
 *   man_is_best                 글 4,588편  일 방문 21,018명
 *
 * 글은 32분의 1인데 방문자는 3~4배입니다. 두 블로그 다 우리 진단 점수는 94점으로
 * 같았습니다. 검색 지표로는 이 차이가 설명되지 않습니다. 차이는 제목과 생김새였습니다.
 *
 * ⚠️ 다시 못 박아 둡니다 — **이건 상관관계지 인과가 아닙니다.**
 * 말줄임표를 넣는다고 홈판에 뜨는 게 아닙니다. 홈판 로직은 네이버가 공개하지 않고
 * 앞으로도 공개하지 않을 겁니다. 우리가 말할 수 있는 건
 * "잘 되는 블로그의 제목은 이렇게 생겼다"까지입니다.
 *
 * ⚠️ 그리고 낚시는 만들지 않습니다.
 * 본문에 없는 걸 제목이 약속하면 사람이 들어왔다가 바로 나갑니다.
 * 네이버는 그 '바로 나감'(퀵백)을 셉니다. 조회수는 오르고 블로그는 죽습니다.
 * 클릭률을 올리자고 블로그를 태울 수는 없습니다.
 */

/** 실측 값 — 화면에서 근거로 보여줄 때 씁니다. */
const EVIDENCE = {
  measuredAt: "2026-08-27",
  winner: { blogId: "nidle_831", posts: 145, dailyVisitors: 74094 },
  baseline: { blogId: "man_is_best", posts: 4588, dailyVisitors: 21018 },
  sampleSize: 90,
};

/**
 * 제목 장치 — 두 블로그에서 확실히 갈린 것만 남겼습니다.
 * winner/baseline은 실제 비율(%)입니다.
 */
const DEVICES = {
  quoteStart: {
    label: "따옴표로 시작",
    winner: 88,
    baseline: 40,
    why: "사람 말을 그대로 따오면 장면이 그려집니다. 설명문보다 눈이 먼저 멈춥니다.",
    test: (t) => /^["'“‘]/.test(String(t).trim()),
    example: '“나 키스 받았어!”…BTS 지민 볼 뽀뽀 한 번에 후원금 1억?',
  },
  ellipsis: {
    label: "말줄임표(…)로 끊기",
    winner: 66,
    baseline: 1,
    why: "가장 크게 갈린 장치입니다. 뒷말을 감추는 자리를 만듭니다.",
    test: (t) => /\.\.\.|…/.test(String(t)),
    example: "“부도난 거냐”는 말까지…이 '여배우', 60평 집 정리한 진짜 이유",
  },
  curiosity: {
    label: "끝을 열어두는 말",
    winner: 41,
    baseline: 18,
    why: "제목만 읽고는 답을 알 수 없어야 누릅니다. 다 말해버리면 안 눌러도 됩니다.",
    test: (t) =>
      /['‘]?이것['’]?|['‘]?이곳['’]?|진짜 이유|이유 있었|비밀|정체|알고보니|알고 보니|했던|하더니|까닭|무슨 일|이런 일/.test(
        String(t)
      ),
    example: "‘욕망의 덫’ 장서희가 10년간 했던 '이것'",
  },
  number: {
    label: "숫자 넣기",
    winner: 58,
    baseline: 42,
    why: "구체적인 수치가 눈에 걸립니다. 시청률·나이·금액·개수 무엇이든.",
    test: (t) => /\d/.test(String(t)),
    example: "“시청률 47.9% 찍고도 멈추지 않았다”…",
  },
};

/** 본문 생김새 — 제목만큼 중요합니다. */
const BODY = {
  subheads: { label: "소제목(인용구)", winner: 6, baseline: 1,
    why: "홈판은 스크롤로 흘러가는 자리라 끊는 자리가 있어야 손가락이 멈춥니다. 소제목 6개는 여섯 번 붙잡는다는 뜻입니다." },
  images: { label: "사진", winner: 19, baseline: 14,
    why: "머문 시간을 늘립니다. 홈판은 체류시간을 봅니다." },
  chars: { label: "본문 길이", winner: 1640, baseline: 1943,
    why: "길이는 오히려 baseline이 깁니다. 길게 쓰는 것보다 나누는 게 중요합니다." },
  purity: { label: "주제 순도", winner: 97, baseline: 58,
    why: "협찬과 정보가 섞이면 네이버가 '이 블로그는 무슨 블로그인가'를 판단하기 어려워집니다." },
};

/** 쓰면 안 되는 것 — 클릭은 올라도 블로그가 상합니다. */
const AVOID = [
  { what: "본문에 없는 내용 약속", why: "들어왔다가 바로 나갑니다. 네이버가 그걸 셉니다(퀵백)." },
  { what: "충격·경악·발칵 남발", why: "한두 번은 먹히지만 쌓이면 그 블로그 글을 안 누르게 됩니다." },
  { what: "확인 안 된 성형·열애·질병 추측", why: "정보통신망법상 명예훼손입니다. 거짓이면 7년 이하 징역입니다." },
  { what: "특정인을 깎아내리는 표현", why: "같은 법 조항에 걸립니다. 사실이어도 비방 목적이면 처벌됩니다." },
];

/** 제목 하나를 재봅니다. */
function measure(title) {
  const t = String(title || "");
  const hit = {};
  for (const [k, d] of Object.entries(DEVICES)) hit[k] = d.test(t);
  return {
    length: t.length,
    devices: hit,
    score: Object.values(hit).filter(Boolean).length,
    max: Object.keys(DEVICES).length,
  };
}

/** AI에게 줄 지침 — 실측값을 그대로 넣습니다. */
function promptBlock() {
  return (
    `[홈판 제목 규칙 — 실측 근거]\n` +
    `일 방문 ${EVIDENCE.winner.dailyVisitors.toLocaleString()}명 블로그와 ` +
    `${EVIDENCE.baseline.dailyVisitors.toLocaleString()}명 블로그의 제목을 각 ${EVIDENCE.sampleSize}편씩 세었습니다.\n` +
    Object.values(DEVICES)
      .map((d) => `- ${d.label}: 잘 되는 쪽 ${d.winner}% / 덜 되는 쪽 ${d.baseline}%. ${d.why}\n  예) ${d.example}`)
      .join("\n") +
    `\n\n[절대 하지 말 것]\n` +
    AVOID.map((a) => `- ${a.what} — ${a.why}`).join("\n") +
    `\n\n가장 중요한 것: 궁금증은 반드시 **본문에 실제로 있는 사실**로 만드세요.\n` +
    `본문을 모르면 원래 제목에 이미 담긴 사실 안에서만 다듬으세요.\n` +
    `제목 길이는 35~45자가 적당합니다. (잘 되는 쪽 평균 41자)`
  );
}

module.exports = { EVIDENCE, DEVICES, BODY, AVOID, measure, promptBlock };
