/**
 * 스레드에 글 올리기.
 *
 * ⚠️ 스레드는 두 단계로 올립니다. 인스타와 같은 방식이에요.
 *   1) 컨테이너를 만든다 (글·사진·영상을 담아둠)
 *   2) 그 컨테이너를 게시한다
 * 한 번에 안 되는 게 불편해 보이지만, 만들어놓고 나중에 올릴 수 있어서
 * 예약 발행 같은 걸 붙일 때 오히려 편합니다.
 *
 * ⚠️ 사진과 영상은 **인터넷에서 접근 가능한 주소**여야 합니다.
 * 메타 서버가 그 주소로 직접 받아갑니다. 우리 컴퓨터에 있는 파일은 못 씁니다.
 * 그래서 우리 서버의 공개 주소를 만들어 넘깁니다.
 *
 * ⚠️ 영상은 처리에 시간이 걸립니다. 만들자마자 게시하면 실패해요.
 * 준비될 때까지 기다렸다가 올립니다.
 */

const threadsAuth = require("./threadsAuth");

const API = threadsAuth.API;
const MAX_TEXT = 500;   // 스레드 글자 수 상한

async function call(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data.error) {
    const m = (data.error && data.error.message) || data.raw || `HTTP ${res.status}`;
    throw new Error(String(m).slice(0, 240));
  }
  return data;
}

/**
 * 우리 서버 파일을 인터넷 주소로 바꿉니다.
 *
 * ⚠️ 메타 서버가 직접 받아가야 해서 localhost는 절대 안 됩니다.
 * PUBLIC_BASE_URL이 없으면 여기서 막습니다. 나중에 이상한 오류로 실패하느니
 * 지금 분명히 말하는 게 낫습니다.
 */
function toPublicUrl(p) {
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) {
    throw new Error("PUBLIC_BASE_URL이 없습니다. 메타 서버가 사진·영상을 받아갈 주소가 필요합니다.");
  }
  return `${base.replace(/\/+$/, "")}/${String(p).replace(/^\/+/, "")}`;
}

/** 메타가 그 주소로 진짜 받아갈 수 있는지 미리 확인합니다. */
async function ensureReachable(url) {
  try {
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    throw new Error(
      `사진·영상 주소에 접근할 수 없습니다(${url}).\n` +
      `메타 서버가 이 주소로 직접 받아가야 해서, 인터넷에서 열리는 주소여야 합니다.`
    );
  }
}

/**
 * 컨테이너가 준비될 때까지 기다립니다.
 *
 * ⚠️ 영상은 메타가 변환하는 데 시간이 걸립니다. 바로 게시하면 실패해요.
 * 실제로 준비 안 된 걸 올리려다 계속 실패한 적이 있어서 넣었습니다.
 */
async function waitReady(creationId, token, { tries = 30, gap = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const s = await call(
      `${API}/v1.0/${creationId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`
    );
    if (s.status === "FINISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") {
      throw new Error(s.error_message || `준비 중 실패했습니다 (${s.status})`);
    }
    await new Promise((r) => setTimeout(r, gap));
  }
  throw new Error("영상 준비가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
}

/**
 * 글 하나 올리기.
 *
 * @param {object} o
 * @param {string} [o.username]  어느 계정으로 (없으면 첫 번째)
 * @param {string} o.text        본문
 * @param {string} [o.imageUrl]  사진 (선택)
 * @param {string} [o.videoUrl]  영상 (선택)
 * @param {string} [o.replyText] 게시 직후 댓글로 달 글 — 링크는 여기에 답니다
 */
async function publish({ username, text = "", imageUrl, videoUrl, replyText } = {}) {
  const acc0 = threadsAuth.getAccount(username);
  if (!acc0) throw new Error("연동된 스레드 계정이 없습니다. 먼저 연동해 주세요.");

  // ⚠️ 만료가 다가왔으면 여기서 갱신합니다. 게시 직전이 가장 확실한 시점입니다.
  const acc = await threadsAuth.refreshIfNeeded(acc0);
  const token = acc.accessToken;

  let body = String(text || "").trim();
  if (body.length > MAX_TEXT) {
    // ⚠️ 그냥 자르면 문장 중간에서 끊깁니다. 문장 끝을 찾아 자릅니다.
    const cut = body.slice(0, MAX_TEXT);
    const at = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "), cut.lastIndexOf("! "));
    body = (at > MAX_TEXT * 0.6 ? cut.slice(0, at + 1) : cut).trim();
  }
  if (!body && !imageUrl && !videoUrl) throw new Error("올릴 내용이 없습니다.");

  const params = new URLSearchParams({ access_token: token });
  if (body) params.set("text", body);

  if (videoUrl) {
    const u = toPublicUrl(videoUrl);
    await ensureReachable(u);
    params.set("media_type", "VIDEO");
    params.set("video_url", u);
  } else if (imageUrl) {
    const u = toPublicUrl(imageUrl);
    await ensureReachable(u);
    params.set("media_type", "IMAGE");
    params.set("image_url", u);
  } else {
    params.set("media_type", "TEXT");
  }

  const container = await call(`${API}/v1.0/${acc.userId}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (videoUrl || imageUrl) await waitReady(container.id, token);

  const published = await call(`${API}/v1.0/${acc.userId}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }),
  });

  const out = { ok: true, id: published.id, username: acc.username };

  // ⚠️ 링크는 본문이 아니라 댓글에 답니다.
  // 본문에 링크를 넣으면 스레드가 노출을 줄입니다. 실제로 많이들 그렇게 씁니다.
  if (replyText && String(replyText).trim()) {
    try {
      const rc = await call(`${API}/v1.0/${acc.userId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          media_type: "TEXT",
          text: String(replyText).slice(0, MAX_TEXT),
          reply_to_id: published.id,
          access_token: token,
        }),
      });
      const rp = await call(`${API}/v1.0/${acc.userId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: rc.id, access_token: token }),
      });
      out.replyId = rp.id;
    } catch (e) {
      // ⚠️ 댓글이 실패해도 본문은 이미 올라갔습니다. 그걸 실패로 처리하면 안 됩니다.
      out.replyFailed = e.message;
    }
  }

  // 올라간 글 주소를 가져옵니다. 확인하러 갈 수 있게요.
  try {
    const p = await call(
      `${API}/v1.0/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`
    );
    out.permalink = p.permalink || null;
  } catch { /* 주소를 못 가져와도 게시는 됐습니다 */ }

  return out;
}

module.exports = { publish, MAX_TEXT };
