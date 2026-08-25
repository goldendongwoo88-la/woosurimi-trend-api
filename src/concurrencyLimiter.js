// 여러 곳(카테고리 병렬 처리, 시드 그룹 병렬 처리 등)에서 동시에 같은 외부 API를
// 호출할 수 있는 코드에서, 그 API로 나가는 "실제 동시 요청 수"를 프로세스 전체
// 기준으로 max개까지만 허용하는 간단한 세마포어입니다. 호출하는 쪽 여러 군데에서
// 각자 알아서 동시성을 조절하려 하면(예: 여기는 4개씩, 저기는 Promise.all로 5개씩)
// 실제로는 두 동시성이 곱해져서 API 쪽 레이트리밋에 걸릴 수 있어서, API 요청을
// 실제로 보내는 지점(각 API 래퍼 모듈)에 딱 한 번만 두는 게 안전합니다.
function createLimiter(max) {
  let active = 0;
  const queue = [];

  function next() {
    if (active >= max || queue.length === 0) return;
    active++;
    const resolve = queue.shift();
    resolve();
  }

  return async function withLimit(fn) {
    if (active >= max) {
      await new Promise((resolve) => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}

module.exports = { createLimiter };
