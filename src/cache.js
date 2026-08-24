// 아주 단순한 인메모리 캐시입니다. 서버가 재시작되면 초기화됩니다.
// 트래픽이 커지면 Redis 등으로 바꿔도 인터페이스는 그대로 씁니다.

let latest = null;
let lastError = null;

function setLatest(data) {
  latest = data;
  lastError = null;
}

function setError(err) {
  lastError = { message: err.message, at: new Date().toISOString() };
}

function getLatest() {
  return latest;
}

function getError() {
  return lastError;
}

module.exports = { setLatest, setError, getLatest, getError };
