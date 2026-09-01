/**
 * 업로드 장부 — 같은 플랫폼 중복 업로드를 막습니다 (2026-09-02)
 *
 * 근거: 돈농부 라이브 2부 Q&A.
 *   "이렇게 하면 꿀 아니야? 했다가 **계정 날아가고 다시는 수익 못 내고** 이런단 말이에요"
 *   "똑같은 영상을 다른 플랫폼에 올려도 될까요? → 네 올려도 됩니다"
 *
 * ── 헷갈리는 자리라 코드가 지킵니다 ──
 * 규칙 자체는 한 줄인데, **방향이 정반대인 두 경우가 붙어 있어서** 사람이 헷갈립니다.
 *   유튜브 → 인스타 → 틱톡 에 같은 영상   ✅ 이게 원소스 멀티플랫폼입니다
 *   유튜브 계정A → 유튜브 계정B 에 같은 영상  ❌ 이건 계정이 죽습니다
 * 헷갈리면 계정이 날아가고, 계정이 날아가면 그 채널에 쌓은 게 통째로 사라집니다.
 * 그래서 기억에 맡기지 않고 장부에 적고 코드가 막습니다.
 *
 * 저장은 JSON 한 장입니다. DB를 쓸 이유가 없습니다.
 */

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "data", "upload-ledger.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { rows: [] }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2), "utf8");
}

/**
 * 올려도 되는지 묻습니다. **올리기 전에** 부르십시오.
 * @param {string} contentId 콘텐츠 식별자 (같은 영상이면 같은 값)
 * @param {string} platform  youtube | instagram | tiktok | facebook | naver | threads
 * @param {string} account   그 플랫폼의 계정 이름
 */
function canUpload(contentId, platform, account) {
  const db = load();
  const 같은플랫폼 = db.rows.filter((r) => r.contentId === contentId && r.platform === platform);

  const 다른계정 = 같은플랫폼.filter((r) => r.account !== account);
  if (다른계정.length) {
    return { ok: false, 사유: "같은 플랫폼 다중계정 중복",
             설명: `이 콘텐츠는 ${platform}의 "${다른계정[0].account}" 계정에 이미 올라갔습니다. ` +
                   `같은 플랫폼에 계정만 바꿔 같은 걸 올리면 계정이 정지됩니다.`,
             대안: "다른 플랫폼에는 올려도 됩니다. 같은 플랫폼이면 영상을 새로 만드십시오." };
  }
  if (같은플랫폼.length) {
    return { ok: false, 사유: "동일 계정 재업로드",
             설명: `이미 ${platform}/${account}에 올라간 콘텐츠입니다.`,
             대안: "중복 게시입니다. 확인하고 넘어가십시오." };
  }
  const 타플랫폼 = db.rows.filter((r) => r.contentId === contentId);
  return { ok: true,
           안내: 타플랫폼.length
             ? `${타플랫폼.map((r) => r.platform).join(", ")}에 올라간 콘텐츠입니다. ` +
               `다른 플랫폼 재사용은 허용되지만 **톤·길이·해시태그는 그 채널에 맞게 손보십시오.** ` +
               `그대로 복사하면 어느 쪽에서도 안 돕니다.`
             : "첫 업로드입니다." };
}

/** 올린 뒤에 적습니다. 안 적으면 다음 판단이 틀립니다. */
function record(contentId, platform, account, { product = "", at = null } = {}) {
  const db = load();
  db.rows.push({ contentId, platform, account, product, at: at || new Date().toISOString() });
  save(db);
  return db.rows.length;
}

/** 이 콘텐츠가 어디에 올라가 있나. */
function where(contentId) {
  return load().rows.filter((r) => r.contentId === contentId)
    .map((r) => ({ platform: r.platform, account: r.account, at: r.at }));
}

module.exports = { canUpload, record, where, FILE };
