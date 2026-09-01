/**
 * 해외 쇼츠 저작권 판별기 — 2026-09-02
 *
 * "이 영상 가져다 써도 되나?"를 **숫자와 신호로** 답합니다. 감으로 판단하지 않게 하려고 만들었습니다.
 *
 * ── 먼저 분명히 할 것 ──
 * 이 도구는 **"써도 된다"는 허가를 주지 않습니다.** 위험 신호를 찾아 보여줄 뿐입니다.
 * 초록이 나와도 저작권이 사라지는 게 아닙니다. 빨강을 피하는 용도입니다.
 *
 * 유일하게 안전한 것은 **크리에이티브 커먼즈(CC)** 영상입니다. 원작자가 재사용을 허락한 것이고,
 * 유튜브가 라이선스 정보를 직접 알려줍니다. 나머지는 전부 "원작자에게 물어봐야" 하는 것입니다.
 *
 * ── 왜 필요한가 ──
 * 33개 채널 분석에서 반복 확인된 것:
 *   · 남의 영상을 실질적 변형 없이 올리면 유튜브 **재사용 콘텐츠 정책**으로 수익화가 거절된다
 *   · 저작권 경고 3회면 채널이 삭제된다 — 그동안 쌓은 게 통째로 날아간다
 *   · **최상단 댓글을 라이선스 업체가 달아둔 영상**은 이미 팔린 것이다. 손대면 바로 걸린다
 *
 * yt-dlp만 씁니다. API 키가 없어도 돕니다.
 */

const { execFile } = require("child_process");

const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

function run(args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(YTDLP, args, { timeout, maxBuffer: 1 << 26, encoding: "utf8" }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(String(stderr || err.message).slice(-400)));
      resolve(stdout || "");
    });
  });
}

/**
 * 라이선스 업체가 남기는 댓글의 흔적.
 * 이런 계정이 최상단에 댓글을 달아뒀다면 그 영상은 **이미 라이선스가 팔린 것**입니다.
 * 박준휘가 알려준 실전 판별법을 그대로 옮겼습니다.
 */
const AGENCY = /(licen[cs]|rights|permission|media\s*group|content\s*(id|owner)|viral|submit|monetiz|clip\s*(licens|owner)|저작권|라이선스|사용\s*문의|영상\s*문의|저희가\s*관리)/i;

/** 원작자가 직접 "쓰지 마라"고 적어두는 표현. 설명란에 있으면 명백한 금지입니다. */
const NO_REUSE = /(do not (re)?(upload|use|post)|no re-?upload|재업로드\s*금지|무단\s*(도용|사용|전재)\s*금지|all rights reserved|©|\(c\)\s*\d{4})/i;

/** 반대로, 써도 된다고 적어둔 표현. 다만 조건이 붙는 경우가 많으니 원문을 꼭 읽어야 합니다. */
const MAYBE_OK = /(free to use|creative commons|CC[ -]?BY|royalty[ -]?free|no copyright|copyright free|feel free to (use|reuse))/i;

/**
 * 영상 하나를 판별합니다.
 * @returns { verdict: 'green'|'yellow'|'red', score, signals[], meta }
 */
async function check(urlOrId, { withComments = true } = {}) {
  const id = String(urlOrId).includes("http")
    ? urlOrId
    : `https://www.youtube.com/watch?v=${urlOrId}`;

  const args = ["--skip-download", "--dump-json", "--no-warnings"];
  if (withComments) args.push("--write-comments", "--extractor-args", "youtube:comment_sort=top;max_comments=8,all,8");
  args.push(id);

  let v;
  try {
    const line = (await run(args)).split("\n").find((l) => l.trim().startsWith("{"));
    v = line ? JSON.parse(line) : null;
  } catch (e) {
    return { ok: false, error: e.message.slice(0, 200) };
  }
  if (!v) return { ok: false, error: "영상 정보를 못 받았습니다" };

  const signals = [];
  let score = 0;   // 높을수록 위험

  // ── 1. 라이선스 (유일하게 확실한 신호) ──
  const license = String(v.license || "");
  const isCC = /creative ?commons/i.test(license);
  if (isCC) {
    signals.push({ level: "good", why: "크리에이티브 커먼즈 — 원작자가 재사용을 허락했습니다. 출처는 밝히십시오.", weight: -5 });
    score -= 5;
  } else {
    signals.push({ level: "warn", why: "표준 유튜브 라이선스 — 재사용 허락이 없습니다. 기본은 '쓰면 안 됨'입니다.", weight: 3 });
    score += 3;
  }

  // ── 2. 설명란 문구 ──
  const desc = String(v.description || "");
  if (NO_REUSE.test(desc)) {
    signals.push({ level: "danger", why: "설명란에 재업로드·무단사용 금지 문구가 있습니다. 명백한 금지입니다.", weight: 6 });
    score += 6;
  }
  if (MAYBE_OK.test(desc)) {
    signals.push({ level: "good", why: "설명란에 사용 허락으로 보이는 문구가 있습니다. **원문을 직접 읽고 조건을 확인하십시오.**", weight: -3 });
    score -= 3;
  }

  // ── 3. 최상단 댓글이 업체인가 ──
  const comments = (v.comments || []).slice(0, 5);
  const agencyComment = comments.find((c) => AGENCY.test(String(c.author || "")) || AGENCY.test(String(c.text || "")));
  if (agencyComment) {
    signals.push({
      level: "danger",
      why: `최상단 댓글이 라이선스 업체로 보입니다("${String(agencyComment.author || "").slice(0, 30)}"). 이미 팔린 영상입니다. 쓰지 마십시오.`,
      weight: 8,
    });
    score += 8;
  }

  // ── 4. 이 채널이 원작자인가, 모아 올리는 곳인가 ──
  // 짧은 영상만 잔뜩 올리면서 구독자 대비 영상 수가 많으면 수집 채널일 가능성이 큽니다.
  // 수집 채널의 영상은 그 채널도 권리자가 아니므로 허락을 받을 상대조차 아닙니다.
  const dur = Number(v.duration) || 0;
  const chanName = String(v.channel || v.uploader || "");
  if (/compilation|viral|best of|clips?$|daily|shorts?$|funny|meme/i.test(chanName)) {
    signals.push({ level: "warn", why: `채널명이 수집 채널처럼 보입니다("${chanName}"). 그렇다면 그 채널도 권리자가 아닙니다.`, weight: 3 });
    score += 3;
  }

  // ── 5. 워터마크가 박힌 재업로드인가 ──
  // 틱톡·인스타에서 가져온 영상은 제목·설명에 흔적이 남습니다.
  if (/tiktok|douyin|抖音|reels?|인스타|xiaohongshu|小红书/i.test(`${v.title} ${desc}`)) {
    signals.push({
      level: "danger",
      why: "다른 플랫폼(틱톡·인스타·샤오홍슈)에서 가져온 영상으로 보입니다. 이 채널도 남의 것을 옮긴 것이라 권리가 없습니다.",
      weight: 6,
    });
    score += 6;
  }

  // ── 판정 ──
  const verdict = score <= -2 ? "green" : score >= 6 ? "red" : "yellow";
  const advice = {
    green: "재사용 허락이 확인됩니다. 그래도 출처는 반드시 밝히고, 조건(변형 금지 등)이 있는지 원문을 보십시오.",
    yellow: "허락 근거가 없습니다. **원작자에게 직접 물어보지 않았다면 쓰지 마십시오.** 형식(구성·편집 리듬)만 참고하는 건 자유입니다.",
    red: "쓰면 안 됩니다. 저작권 경고나 수익화 거절로 이어질 신호가 있습니다.",
  }[verdict];

  return {
    ok: true,
    verdict,
    score,
    advice,
    signals,
    meta: {
      id: v.id,
      title: String(v.title || "").trim(),
      channel: chanName,
      url: v.webpage_url,
      duration: dur,
      views: Number(v.view_count) || 0,
      subs: Number(v.channel_follower_count) || 0,
      license: license || "표준 유튜브 라이선스",
      uploaded: v.upload_date,
    },
    disclaimer:
      "이 판정은 위험 신호를 모아 본 것이지 법적 판단이 아닙니다. " +
      "초록이어도 저작권이 사라지지 않습니다. 확실한 길은 원작자 허락이나 크리에이티브 커먼즈뿐입니다.",
  };
}

/** 크리에이티브 커먼즈 영상만 찾기 — 유일하게 마음 놓고 쓸 수 있는 것들입니다. */
async function findCC(keyword, { count = 20 } = {}) {
  // 유튜브 검색의 '크리에이티브 커먼즈' 필터(sp=EgIwAQ%3D%3D)
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIwAQ%3D%3D`;
  const out = await run(["--flat-playlist", "--dump-json", "--no-warnings", "--playlist-end", String(count), url]);
  return out.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .map((v) => ({
      id: v.id,
      title: String(v.title || "").trim(),
      url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
      duration: Number(v.duration) || 0,
      channel: v.channel || v.uploader || "",
    }));
}

module.exports = { check, findCC, AGENCY, NO_REUSE };
