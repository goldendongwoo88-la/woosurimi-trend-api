/**
 * 홈판 썸네일 — 자동 고르기.
 *
 * 수동 버전(thumbnail.js)은 사장님이 사진 두 장을 직접 고릅니다.
 * 여기서는 **본문에 이미 넣으신 사진들 중에서 AI가 골라줍니다.**
 *
 *   한 장짜리   — 인물 사진 중에 제일 눈에 걸릴 것 한 장 + 핵심 문구
 *   비포/애프터 — 제목이 전후 비교면, 비포 한 장 + 애프터 한 장을 짝지어 붙임
 *
 * ⚠️ 사진은 여전히 **사장님 글에 이미 들어 있는 것만** 씁니다.
 * 인터넷에서 연예인 사진을 찾아다 주는 기능이 아닙니다. 그건 저작권(찍은 사람)과
 * 초상권(찍힌 사람)이 둘 다 걸립니다. 여기서는 사장님이 이미 고른 사진들 중에서
 * 어느 게 제일 나은지만 판단합니다.
 *
 * ⚠️ AI가 지어낸 문구는 안 씁니다.
 * 썸네일 문구가 본문에 없는 걸 약속하면 들어왔다가 바로 나갑니다. 그건 클릭이
 * 아니라 이탈이고, 홈피드는 그걸 봅니다. 그래서 AI가 돌려준 문구의 낱말이
 * 제목·본문에 실제로 있는지 대조하고, 없으면 알려드립니다.
 */

const sharp = require("sharp");
const { callClaude, isConfigured, extractJson } = require("./claudeClient");
const thumbnail = require("./thumbnail");

/** AI에 한 번에 보낼 사진 수. 많이 보내면 느리고 비쌉니다. */
const MAX_PHOTOS = 12;

/**
 * AI에 보낼 때 줄이는 크기.
 *
 * ⚠️ 원본을 그대로 보내면 안 됩니다. 사진 한 장이 3~5MB인데 12장이면 50MB입니다.
 * 얼굴이 있는지, 표정이 어떤지, 클로즈업인지 전신인지는 400px이면 충분히 보입니다.
 * (클로드가 사진을 읽는 비용은 넓이×높이에 비례합니다 — 400px이면 한 장에 200토큰 정도)
 */
const AI_PX = 400;

/**
 * 사진에서 URL을 받아올 때 허용하는 곳.
 *
 * ⚠️ 이게 없으면 아무 주소나 받아서 우리 서버가 대신 접속해줍니다.
 * 남이 우리 서버를 시켜서 내부망을 훑을 수 있게 됩니다(SSRF).
 * 네이버가 사진을 올려두는 곳만 허용합니다.
 */
const ALLOWED_HOSTS = /(^|\.)(pstatic\.net|naver\.net|naver\.com)$/i;

function isAllowedUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    return ALLOWED_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 제목만 보고 전후 비교 글인지 봅니다.
 * ⚠️ AI를 안 씁니다. 낱말로 알 수 있는 걸 물어보면 돈과 시간만 나갑니다.
 */
const BA_WORDS = [
  "전후", "비포", "애프터", "before", "after", "비교",
  "바뀐", "바뀌", "달라진", "달라졌", "변화", "변신", "반전",
  "전 vs", "vs 후", "전과 후", "하기 전", "하고 나서", "쓰기 전", "쓰고 나서",
  "민낯", "화장 전", "시술 전", "시술 후", "다이어트", "감량", "리터치",
];

function looksBeforeAfter(title = "", body = "") {
  const t = String(title).toLowerCase();
  const hit = BA_WORDS.filter((w) => t.includes(w.toLowerCase()));
  // 본문에도 신호가 있으면 더 확실합니다. 다만 제목이 우선입니다.
  const b = String(body).toLowerCase();
  const bodyHit = BA_WORDS.filter((w) => b.includes(w.toLowerCase()));
  return {
    yes: hit.length > 0,
    words: hit,
    bodyWords: bodyHit.slice(0, 4),
    why: hit.length
      ? `제목에 '${hit.join("', '")}'가 있어서 전후 비교로 봤습니다.`
      : "제목에 전후 비교를 뜻하는 말이 없어서 한 장짜리로 만듭니다.",
  };
}

/**
 * 네이버 사진 주소에서 **더 큰 크기**를 달라고 바꿉니다.
 *
 * ⚠️ 네이버 사진 주소 뒤에는 ?type=w80 같은 크기 지시가 붙습니다.
 * 처음에 "원본을 받자"고 그 부분을 떼어냈는데 **404가 났습니다.**
 * 네이버는 크기 지시가 있어야 사진을 줍니다. 떼면 안 됩니다.
 *
 * 그리고 화면에 작게 보이는 사진은 주소도 작은 크기(w80)입니다. 그대로 받으면
 * 썸네일이 뭉개집니다. 그래서 큰 크기를 달라고 바꿔서 받습니다.
 * 원본이 그보다 작으면 네이버가 알아서 원본 크기로 줍니다.
 */
function biggerUrl(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("type")) return null;
    const cur = u.searchParams.get("type");
    if (/^w\d+$/.test(cur) && parseInt(cur.slice(1), 10) >= 966) return null;
    u.searchParams.set("type", "w966");
    return u.toString();
  } catch {
    return null;
  }
}

async function get(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        // ⚠️ Referer가 없으면 네이버가 막습니다.
        Referer: "https://blog.naver.com/",
      },
    });
    if (!res.ok) throw new Error(`사진을 못 받았습니다 (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) throw new Error("사진이 너무 큽니다.");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/** 주소로 사진을 받아옵니다. 네이버 주소만. */
async function fetchImage(url, timeoutMs = 12000) {
  if (!isAllowedUrl(url)) throw new Error("네이버에 올라간 사진만 받아올 수 있습니다.");
  // 큰 크기를 먼저 달라고 해보고, 안 주면 원래 주소로 받습니다.
  const big = biggerUrl(url);
  if (big) {
    try {
      return await get(big, timeoutMs);
    } catch {}
  }
  return get(url, timeoutMs);
}

/**
 * AI에 보낼 수 있게 줄이고 base64로 바꿉니다.
 * 못 읽는 사진(HEIC 등)은 조용히 빼고, 몇 장을 뺐는지 돌려줍니다.
 */
async function prepare(buffers) {
  const out = [];
  const dropped = [];
  for (let i = 0; i < buffers.length; i++) {
    try {
      const meta = await sharp(buffers[i]).metadata();
      const small = await sharp(buffers[i])
        .resize(AI_PX, AI_PX, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 62 })
        .toBuffer();
      out.push({
        index: i,
        b64: small.toString("base64"),
        w: meta.width || 0,
        h: meta.height || 0,
        ratio: meta.width && meta.height ? +(meta.width / meta.height).toFixed(2) : null,
      });
    } catch {
      dropped.push(i);
    }
  }
  return { photos: out, dropped };
}

const SYSTEM = `당신은 네이버 블로그 홈피드 썸네일을 고르는 사람입니다.

홈피드는 손가락으로 빠르게 넘기는 자리입니다. 손톱만 한 크기로 스쳐 지나갑니다.
그 안에서 손가락을 멈추게 하는 사진을 고르는 것이 당신의 일입니다.

무엇이 멈추게 하는가 (실제로 잘 되는 글들의 공통점입니다):
- 얼굴이 크게 나온 사진. 전신 사진은 작은 화면에서 아무것도 안 보입니다.
- 표정이나 시선이 살아 있는 사진. 무표정한 증명사진은 안 멈춥니다.
- 색이 선명하고 배경이 단순한 사진. 배경이 복잡하면 얼굴이 묻힙니다.
- 밝기가 적당한 사진. 너무 어둡거나 하얗게 날아간 사진은 탈락입니다.

무엇이 안 되는가:
- 글자만 있는 캡처, 표, 그래프
- 제품만 덩그러니 놓인 사진 (인물이 쓰고 있는 사진은 괜찮습니다)
- 흔들렸거나 초점이 나간 사진
- 여러 명이 작게 나온 단체 사진

문구 규칙 (아주 중요합니다):
- 공백 빼고 8자 안팎. 최대 10자.
- 반드시 제목이나 본문에 **실제로 있는 말**에서 가져오세요.
- 본문에 없는 내용을 약속하는 문구는 절대 안 됩니다. 들어왔다가 바로 나갑니다.
- 지어내지 마세요. 없으면 빈 문자열로 두세요.

반드시 JSON만 답하세요. 설명은 JSON 안에 넣으세요.`;

/**
 * AI에게 물어봅니다.
 * @returns {object} 아래 shape() 참고
 */
async function choose({ photos, title = "", body = "", mode }) {
  if (!isConfigured()) throw new Error("서버에 ANTHROPIC_API_KEY가 없어서 자동 고르기를 못 씁니다.");
  if (!photos.length) throw new Error("고를 사진이 없습니다.");

  /**
   * ⚠️ 처음엔 **제목만 보고** 한 장이냐 두 장이냐를 정했습니다.
   * 제목에 '비포', '전후' 같은 말이 있으면 두 장, 없으면 한 장.
   * 사장님이 짚어주셨습니다 — 제목이 전후 비교가 아니어도 두 장을 붙이면
   * 더 눌릴 사진들이 있습니다. 낱말 몇 개로 정할 일이 아닙니다.
   *
   * 이제 **AI가 사진을 보고 정합니다.** 제목은 참고로만 넘깁니다.
   * force가 오면 사장님이 직접 정하신 것이라 그대로 따릅니다.
   */
  const hint = mode === "beforeAfter"
    ? "제목이 전후 비교로 보입니다. 다만 사진을 보고 아니라고 판단하면 한 장으로 하세요."
    : mode === "single"
      ? "제목만으로는 전후 비교가 아닙니다. 다만 두 장을 붙이는 게 확실히 낫다면 그렇게 하세요."
      : "";
  const forced = mode === "forceSingle" ? "single" : mode === "forcePair" ? "pair" : null;

  const content = [];
  for (const p of photos) {
    content.push({ type: "text", text: `[사진 ${p.index}] ${p.w}x${p.h}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: p.b64 },
    });
  }

  const ask = `위 사진들을 보고 **한 장으로 만들지, 두 장을 붙일지 당신이 정하세요.**
${forced ? `
사장님이 이미 "${forced === "pair" ? "두 장" : "한 장"}"으로 정하셨습니다. 그대로 하세요.
` : ""}
${hint ? `참고: ${hint}
` : ""}
**두 장을 붙이면 좋은 경우** (제목이 전후 비교가 아니어도 됩니다):
- 같은 사람/대상인데 눈에 띄게 달라 보이는 두 장 (화장 전후, 착용 전후, 시간차)
- 나란히 놓으면 "무슨 차이지?"라는 궁금증이 생기는 두 장
- 한 장만으로는 밋밋한데, 둘을 붙이면 이야기가 생기는 경우
두 장을 붙이면 각 사진이 반쪽 크기가 됩니다. 그래도 나은 경우에만 그렇게 하세요.

**한 장이 나은 경우**:
- 얼굴이 크고 표정이 살아 있어서 그 자체로 눈이 멈추는 사진
- 짝지을 만한 두 번째 사진이 없거나, 붙여도 차이가 안 보이는 경우
- 억지로 짝을 만들지 마세요. 그건 오히려 나쁩니다.

인물 사진이 있으면 인물을 우선합니다. 인물이 하나도 없으면 그 사실을 why에 적으세요.

**딱지(label)**: 두 장을 붙일 때 왼쪽/오른쪽에 붙는 짧은 말입니다.
- 화장·시술 전후면 "BEFORE" / "AFTER"
- 그 밖에는 내용에 맞게 정하세요 ("평소" / "무대", "작년" / "올해", "민낯" / "풀메")
- 붙일 말이 마땅치 않으면 빈 문자열로 두세요. 억지 딱지는 안 붙이는 게 낫습니다.

아래 형식으로만 답하세요:
{
  "photos": [{"i": 0, "kind": "인물-얼굴|인물-전신|제품|배경|글자캡처|기타", "score": 0-10, "note": "한 줄"}],
  "mode": "single" 또는 "beforeAfter",
  "pick": 사진번호,          // mode가 single일 때만
  "before": 사진번호,        // mode가 beforeAfter일 때만 (왼쪽)
  "after": 사진번호,         // mode가 beforeAfter일 때만 (오른쪽)
  "leftLabel": "왼쪽 딱지",   // 없으면 ""
  "rightLabel": "오른쪽 딱지", // 없으면 ""
  "text": "큰 글씨 (8자 안팎)",
  "sub": "작은 글씨 (선택, 없으면 빈 문자열)",
  "why": "왜 이렇게 정했는지 한두 문장. 한 장/두 장을 고른 이유를 꼭 넣으세요."
}`;

  content.push({
    type: "text",
    text: `글 제목: ${title || "(없음)"}

본문:
${String(body).slice(0, 2500) || "(없음)"}

${ask}`,
  });

  const raw = await callClaude({
    system: SYSTEM,
    messages: [{ role: "user", content }],
    maxTokens: 1600,
    temperature: 0.4,
    // 사진 12장을 읽는 데 시간이 걸립니다. 기본 45초로는 모자랍니다.
    timeoutMs: 90000,
  });

  return extractJson(raw);
}

/**
 * AI가 돌려준 것을 검사합니다.
 *
 * ⚠️ AI 답을 그대로 믿으면 안 됩니다. 없는 사진 번호를 주기도 하고,
 * 본문에 없는 문구를 지어내기도 합니다. 사진 번호가 틀리면 엉뚱한 사진이
 * 썸네일이 되고, 문구가 지어낸 것이면 낚시가 됩니다.
 */
function validate(plan, { count, title, body }) {
  const warn = [];
  const inRange = (n) => Number.isInteger(n) && n >= 0 && n < count;

  let mode = plan.mode === "beforeAfter" ? "beforeAfter" : "single";
  let pick = plan.pick;
  let before = plan.before;
  let after = plan.after;

  if (mode === "beforeAfter") {
    if (!inRange(before) || !inRange(after) || before === after) {
      warn.push("AI가 고른 비포/애프터 짝이 이상해서 한 장짜리로 바꿨습니다.");
      mode = "single";
      pick = inRange(before) ? before : inRange(after) ? after : 0;
    }
  }
  if (mode === "single" && !inRange(pick)) {
    // 점수가 제일 높은 사진으로 물러섭니다.
    const scored = (plan.photos || []).filter((p) => inRange(p.i));
    pick = scored.length
      ? scored.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a)).i
      : 0;
    warn.push("AI가 고른 사진 번호가 없어서 점수가 제일 높은 사진으로 골랐습니다.");
  }

  // ── 문구 검사 ──
  const source = (String(title) + " " + String(body)).replace(/\s+/g, " ");
  const clean = (s) => String(s || "").replace(/[""''"'.,!?…\-~]/g, "").trim();
  const invented = [];
  let text = String(plan.text || "").trim();
  let sub = String(plan.sub || "").trim();

  for (const [label, val] of [["text", text], ["sub", sub]]) {
    for (const w of clean(val).split(/\s+/).filter((x) => x.length >= 2)) {
      if (!source.includes(w)) invented.push(w);
    }
  }
  if (invented.length) {
    warn.push(
      `문구에 본문에 없는 말이 있습니다: ${[...new Set(invented)].join(", ")}. ` +
      `그대로 쓰면 들어온 사람이 본문에서 그 내용을 못 찾습니다.`
    );
  }

  const vis = clean(text).replace(/\s/g, "").length;
  if (vis > 10) warn.push(`큰 글씨가 ${vis}자입니다. 8자 안팎이 모바일에서 제일 잘 읽힙니다.`);
  if (!text) {
    warn.push("AI가 쓸 만한 문구를 못 찾아서 제목에서 뽑았습니다.");
    text = (thumbnail.suggestText(title)[0] || "").trim();
  }

  return {
    mode,
    pick,
    before,
    after,
    text,
    sub,
    // ⚠️ 예전엔 비면 무조건 BEFORE/AFTER를 넣었습니다. 그런데 전후 비교가
    // 아닌 두 장에 그 딱지가 붙으면 거짓말이 됩니다. 비면 비운 채로 둡니다.
    leftLabel: String(plan.leftLabel || "").slice(0, 12),
    rightLabel: String(plan.rightLabel || "").slice(0, 12),
    why: String(plan.why || "").slice(0, 400),
    photos: (plan.photos || []).filter((p) => inRange(p.i)),
    invented: [...new Set(invented)],
    warn,
    // 제목에서 뽑은 대안 — AI 문구가 마음에 안 들 때 바로 바꿔 쓰시라고.
    alternatives: thumbnail.suggestText(title),
  };
}

/**
 * 처음부터 끝까지 — 사진을 받아 AI에게 물어보고 썸네일까지 만듭니다.
 *
 * @param {Buffer[]} buffers 본문에 들어 있는 사진들
 * @param {object} opt {title, body, size, theme, force}
 *   force: "single" | "beforeAfter" — 사장님이 직접 정하고 싶을 때
 * @returns {{plan:object, jpeg:Buffer, ba:object}}
 */
async function run(buffers, { title = "", body = "", size = "square", theme = "black", force } = {}) {
  const list = buffers.slice(0, MAX_PHOTOS);
  const { photos, dropped } = await prepare(list);
  if (!photos.length) throw new Error("읽을 수 있는 사진이 없습니다. JPG나 PNG로 올려주세요.");

  const ba = looksBeforeAfter(title, body);
  // ⚠️ 제목은 이제 **참고**입니다. 정하는 건 AI가 사진을 보고 합니다.
  // force가 오면 사장님이 직접 고르신 것이라 그대로 따릅니다.
  const mode = force === "single" ? "forceSingle"
    : force === "beforeAfter" ? "forcePair"
    : (ba.yes ? "beforeAfter" : "single");

  const rawPlan = await choose({ photos, title, body, mode });
  const plan = validate(rawPlan, { count: list.length, title, body });

  // ⚠️ AI에 보낸 건 400px로 줄인 사진입니다. 실제 썸네일은 **원본**으로 만듭니다.
  // 줄인 걸로 만들면 홈피드에서 뭉개져 보입니다.
  let jpeg;
  if (plan.mode === "beforeAfter") {
    jpeg = await thumbnail.beforeAfter({
      beforeBuf: list[plan.before],
      afterBuf: list[plan.after],
      text: plan.text,
      sub: plan.sub,
      size,
      theme,
      // 딱지가 둘 다 비면 안 그립니다. 전후 비교가 아닌 두 장에는 딱지가 없는 게 낫습니다.
      labels: (plan.leftLabel || plan.rightLabel)
        ? { left: plan.leftLabel || " ", right: plan.rightLabel || " " }
        : null,
    });
  } else {
    jpeg = await thumbnail.single({
      buf: list[plan.pick],
      text: plan.text,
      sub: plan.sub,
      size,
      theme,
    });
  }

  if (dropped.length) {
    plan.warn.push(`사진 ${dropped.length}장은 읽지 못해서 뺐습니다 (아이폰 HEIC일 수 있습니다).`);
  }
  if (buffers.length > MAX_PHOTOS) {
    plan.warn.push(`사진이 ${buffers.length}장이라 앞에서 ${MAX_PHOTOS}장만 봤습니다.`);
  }

  // 제목만 봤을 때의 판단과 AI 판단이 다르면 그것도 알려드립니다.
  const titleSaid = ba.yes ? "beforeAfter" : "single";
  if (!force && plan.mode !== titleSaid) {
    plan.overrode = titleSaid === "single"
      ? "제목은 전후 비교가 아닌데, 사진을 보니 두 장을 붙이는 게 낫다고 판단했습니다."
      : "제목은 전후 비교인데, 사진으로는 차이가 안 보여서 한 장으로 만들었습니다.";
  }
  return { plan, jpeg, ba, considered: list.length };
}

module.exports = { run, looksBeforeAfter, prepare, choose, validate, fetchImage, isAllowedUrl, MAX_PHOTOS };
