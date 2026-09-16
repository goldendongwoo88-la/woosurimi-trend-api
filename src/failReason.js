/**
 * 오류 하나를 보고 "누구 잘못인지"를 가려냅니다.
 *
 * ⚠️ 왜 만들었나 — 여러 라우트가 catch 에서 전부 500 "fetch_failed" 를 냈습니다.
 * 500 은 "우리 서버가 터졌다"는 뜻입니다. 그런데 실제로는 대부분
 *   (1) 손님이 없는 카테고리를 골랐거나
 *   (2) .env 에 API 키가 없거나
 *   (3) 네이버가 안 열리는
 * 셋 중 하나였습니다. 셋은 손님이 해야 할 일이 완전히 다릅니다.
 * 뭉뚱그리면 손님은 새로고침만 반복하고, 우리는 로그를 봐도 원인을 모릅니다.
 */

/** 오류를 { status, body } 로 바꿉니다. */
function classify(err, { what = "정보" } = {}) {
  const msg = String((err && err.message) || err || "");

  // (1) 손님 입력 문제 — 고칠 수 있는 사람은 손님입니다.
  if (/등록되지 않은|없는 카테고리|unknown_category|확인해 주세요/.test(msg)) {
    return { status: 400, body: { error: "bad_input", message: msg, fix: "입력을 바꿔서 다시 해주세요." } };
  }

  // (2) 키가 없음 — 고칠 수 있는 사람은 사장님입니다.
  if (err?.noKeys) {
    return { status: 503, body: { error: "no_keys", message: msg, fix: err.fix || "서버 .env 에 키를 넣으면 바로 됩니다." } };
  }
  if (/API ?HUB|API ?키|ANTHROPIC_API_KEY|NAVER_\w+|키가 (없|설정)|no_keys/i.test(msg)) {
    return {
      status: 503,
      body: {
        error: "no_keys",
        message: msg,
        fix: "서버 .env 에 해당 키를 넣으면 바로 됩니다. /setup.html 에서 무엇이 비어 있는지 볼 수 있습니다.",
      },
    };
  }

  // (3) 바깥이 안 열림 — 아무도 잘못하지 않았습니다. 기다리거나 서버 위치 문제입니다.
  if (
    err?.upstream ||
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|tunnel|fetch failed|aborted|Status code \d/i.test(msg)
  ) {
    return {
      status: 502,
      body: {
        error: "upstream_unreachable",
        message: `네이버에서 ${what}를 가져오지 못했습니다.`,
        detail: msg.slice(0, 200),
        fix: "잠시 뒤에 다시 해주세요. 계속되면 서버가 바깥으로 못 나가는 상태입니다.",
      },
    };
  }

  // 여기까지 오면 진짜 우리 잘못입니다.
  return { status: 500, body: { error: "fetch_failed", message: msg.slice(0, 200) } };
}

/** 라우트 catch 에서 한 줄로 씁니다: return fail(res, err, { what: "기회 키워드" }); */
function fail(res, err, opts) {
  const { status, body } = classify(err, opts);
  return res.status(status).json(body);
}

module.exports = { classify, fail };
