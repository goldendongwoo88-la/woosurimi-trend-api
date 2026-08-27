/**
 * 매일 3~5편 포스팅 도우미 — 폴더를 읽고 원고를 만들어 둡니다.
 *
 * ⚠️ 사장님이 하실 일은 **1번 폴더에 자료 넣기**뿐입니다.
 *   바탕화면/포스팅 자료/1. 오늘 쓸 것/<아무 이름>/
 *     ├─ 가이드.txt   ← 뭘 쓸지
 *     └─ 1.jpg 2.jpg  ← 사진 (번호 순서대로 씁니다)
 *
 * ⚠️ **값이 나가는 건 원고 만들기 하나뿐입니다.**
 * 폴더 읽기·사진 짝짓기·검사는 전부 AI를 안 씁니다. 0원입니다.
 * 그래서 값이 나가기 전에 항상 먼저 얼마인지 보여드리고 여쭙니다.
 *
 * ⚠️ 큰 스킬 5개는 **절대 안 부릅니다.**
 * intro-promo · food-review · travel-review · living-life · broadcast-issue
 * 사장님이 명령하신 것입니다. 여기서도 지킵니다.
 */

const fs = require("fs");
const path = require("path");

/** 사장님 폴더. 다른 데 두셨으면 환경변수로 바꿉니다. */
const ROOT = process.env.POSTING_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || "", "Desktop", "포스팅 자료");

const TODO = path.join(ROOT, "1. 오늘 쓸 것");
const DONE = path.join(ROOT, "3. 다 쓴 것");

const IMG = /\.(jpe?g|png|webp|gif|heic)$/i;
const VID = /\.(mp4|mov|avi|mkv|webm)$/i;

/**
 * 가이드 파일을 읽습니다.
 *
 * ⚠️ 정해진 서식을 요구하지 않습니다. 사장님이 서식을 외우셔야 하면
 * 그 자체가 일입니다. "키워드:" 처럼 적으시면 알아듣고,
 * 그냥 줄글로 쓰셔도 통째로 받아둡니다.
 */
function readGuide(text) {
  const raw = String(text || "");
  const g = { keyword: "", topic: "", sponsored: null, must: [], avoid: [], refs: [], notes: raw.trim() };

  const grab = (names) => {
    for (const n of names) {
      const m = raw.match(new RegExp(`^\\s*${n}\\s*[:：]\\s*(.+)$`, "im"));
      if (m) return m[1].trim();
    }
    return "";
  };
  const list = (s) => String(s || "").split(/[,·、]/).map((x) => x.trim()).filter(Boolean);

  g.keyword = grab(["키워드", "메인키워드", "주제어", "keyword"]);
  g.topic = grab(["주제", "분야", "카테고리", "topic"]);
  g.must = list(grab(["꼭 넣을 말", "꼭넣을말", "필수", "포함"]));
  g.avoid = list(grab(["빼야 할 말", "빼야할말", "제외", "금지"]));
  g.refs = (raw.match(/https?:\/\/\S+/g) || []).slice(0, 5);

  // 협찬 — 적어주셨으면 그걸 믿고, 없으면 글에서 찾아봅니다.
  const said = grab(["협찬", "제공", "광고"]);
  if (said) g.sponsored = /^(예|네|응|y|yes|o|있|맞)/i.test(said) ? true : /^(아니|없|n|no|x)/i.test(said) ? false : null;
  if (g.sponsored === null) {
    // src/postingAgent 와 확장(editor-tools.js)이 같은 규칙을 씁니다.
    g.sponsored = /협찬|제공\s*받아|제공받았|원고료|소정의\s*(수수료|대가)|대가를\s*받아|업체로부터|체험단|서포터즈|무상\s*제공/.test(raw) || null;
  }

  // 키워드를 안 적으셨으면 첫 줄에서 짐작합니다. 짐작한 건 짐작이라고 말합니다.
  if (!g.keyword) {
    const first = raw.split("\n").map((l) => l.trim()).find((l) => l && !/^https?:/.test(l));
    if (first) { g.keyword = first.replace(/^[#\-*■>]\s*/, "").slice(0, 40); g.guessedKeyword = true; }
  }
  return g;
}

/**
 * 주제 → 어느 스킬로 쓸지.
 *
 * ⚠️ 부르지 말라고 하신 5개는 여기 후보에 아예 없습니다.
 * 목록에 없으면 실수로도 못 고릅니다.
 */
const BANNED = new Set(["intro-promo", "food-review", "travel-review", "living-life", "broadcast-issue"]);

/**
 * ⚠️ **연예인 패션·뷰티는 "연예·방송" 쪽입니다.** 처음에 "패션·뷰티"로 넣었다가 틀렸습니다.
 *
 * 이름에 '패션'이 들어가니 패션 쪽이라고 생각했는데, 실제로 나온 글을 보고 알았습니다.
 * 720자가 나왔습니다. 패션·뷰티 기준(1,370~2,100자)으로는 한참 모자랍니다.
 *
 * 그런데 이건 AI가 못 쓴 게 아니라 **제가 잘못 짝지은 것**이었습니다.
 *   celeb-fashion 스킬 자체가 "짧은 호흡(800~1,000자)"으로 짜여 있습니다.
 *   제가 잰 값도 연예·방송은 900~1,700자입니다. 720자면 거의 맞습니다.
 *
 * 성격이 다릅니다:
 *   내돈내산 후기  — 길게 씁니다. 사서 써보고 판단하는 과정이 있습니다.
 *   연예인 패션    — 짧습니다. 사진이 이야기를 끌고 갑니다.
 *
 * 억지로 길게 늘리면 오히려 나빠집니다. 할 말이 없는데 늘리면 같은 말을 반복하게 됩니다.
 */
const PICK = [
  { skill: "celeb-fashion", topic: "연예·방송", re: /연예인?\s*패션|스타\s*패션|공항\s*패션|시상식|드레스/ },
  { skill: "celeb-beauty", topic: "연예·방송", re: /연예인?\s*(뷰티|메이크업|화장)|스타\s*(뷰티|메이크업)/ },
  { skill: "fashion-review", topic: "패션·뷰티", re: /패션|옷|코트|니트|가방|신발|스타일링|착용/ },
  { skill: "beauty-review", topic: "패션·뷰티", re: /뷰티|화장품|스킨케어|메이크업|쿠션|립|선크림/ },
  { skill: "celebrity-gossip", topic: "연예·방송", re: /연예|가십|열애|결별|논란|배우|아이돌|가수/ },
  { skill: "drama-profile", topic: "연예·방송", re: /드라마|출연진|등장인물|배역|프로필/ },
  { skill: "sports-issue", topic: "연예·방송", re: /스포츠|축구|야구|경기|선수/ },
  { skill: "wealth-life", topic: "패션·뷰티", re: /경제|주식|코인|투자|재테크|부동산/ },
  { skill: "health-info", topic: "패션·뷰티", re: /건강|운동|다이어트|영양|질병|증상/ },
  { skill: "it-auto", topic: "패션·뷰티", re: /IT|전자|휴대폰|노트북|자동차|차량/i },
  { skill: "knowledge-culture", topic: "패션·뷰티", re: /상식|문화|역사|책|공부/ },
];

function pickSkill(guide) {
  const hay = `${guide.topic} ${guide.keyword} ${guide.notes}`.slice(0, 400);
  for (const p of PICK) {
    if (BANNED.has(p.skill)) continue;          // 두 겹으로 막습니다
    if (p.re.test(hay)) return { skill: p.skill, topic: p.topic, why: `"${hay.match(p.re)[0]}"가 보여서` };
  }
  // 못 고르면 후기로 갑니다. 사장님 채널이 패션·뷰티 후기라서요.
  return { skill: "fashion-review", topic: "패션·뷰티", why: "짐작이 안 돼서 기본값(패션 후기)으로 갑니다" };
}

/**
 * 은/는, 이/가 를 받침에 맞춰 골라줍니다.
 *
 * ⚠️ 안 하면 "패션·뷰티은 15장쯤 필요합니다" 같은 말이 나옵니다.
 * 사장님이 매일 보실 화면인데 말이 어색하면 계속 거슬립니다.
 * 한글 받침은 (글자코드 - 0xAC00) % 28 로 알 수 있습니다. 0이면 받침이 없습니다.
 */
function josa(word, withJong, withoutJong) {
  const s = String(word || "");
  const last = s.charCodeAt(s.length - 1);
  // 한글이 아니면(영문·숫자·기호) 받침 판단을 못 하니 받침 있는 쪽으로 둡니다.
  if (!(last >= 0xac00 && last <= 0xd7a3)) return s + withJong;
  return s + ((last - 0xac00) % 28 ? withJong : withoutJong);
}

/**
 * 이 스킬로 한 편 쓰면 얼마인가 — **한 번 부르는 값**입니다.
 *
 * ⚠️ 처음에 763원이라고 적어뒀는데 **6배 넘게 부풀린 값**이었습니다.
 * 763원은 사람이 7단계를 하나씩 밟을 때 값입니다.
 * 이 도구는 **한 번에 한 통으로** 부릅니다. 그래서 훨씬 쌉니다.
 *
 * 값을 실제보다 크게 말하는 것도 틀린 겁니다. 사장님이 "비싸서 안 되겠네" 하고
 * 안 쓰실 수 있으니까요.
 */
const PRICE = { in: 3, out: 15, write1h: 6, read: 0.3, krw: 1380 };
function estimate(skillChars, { cached = false, askChars = 4000, outTokens = 2600 } = {}) {
  const sysTok = Math.round(skillChars * 1.05);      // 한글은 글자당 1토큰쯤
  const askTok = Math.round(askChars * 1.05);
  const usd =
    (cached ? sysTok * PRICE.read : sysTok * PRICE.write1h) / 1e6 +
    (askTok * PRICE.in) / 1e6 +
    (outTokens * PRICE.out) / 1e6;
  return Math.round(usd * PRICE.krw);
}

/** 폴더 하나를 읽습니다. */
function readJob(dir) {
  const files = fs.readdirSync(dir);
  const guideFile = files.find((f) => /가이드|guide/i.test(f) && /\.(txt|md)$/i.test(f));
  const photos = files.filter((f) => IMG.test(f)).sort(byNumber);
  const videos = files.filter((f) => VID.test(f)).sort(byNumber);

  const guide = guideFile
    ? readGuide(fs.readFileSync(path.join(dir, guideFile), "utf8"))
    : readGuide("");

  const problems = [];
  if (!guideFile) problems.push("가이드 파일이 없습니다 (가이드.txt)");
  if (!photos.length) problems.push("사진이 한 장도 없습니다");
  if (!guide.keyword) problems.push("무슨 글인지 알 수가 없습니다");

  return {
    dir,
    name: path.basename(dir),
    guide,
    photos,
    videos,
    problems,
    ...pickSkill(guide),
  };
}

/** 1.jpg, 2.jpg, 10.jpg 를 사람이 세는 순서로. 글자 순서로 하면 10이 2보다 앞에 옵니다. */
function byNumber(a, b) {
  const n = (s) => { const m = String(s).match(/\d+/); return m ? Number(m[0]) : 9999; };
  const d = n(a) - n(b);
  return d !== 0 ? d : String(a).localeCompare(b, "ko");
}

/** 오늘 할 일 목록. AI를 안 씁니다. */
function listJobs() {
  if (!fs.existsSync(TODO)) return { ok: false, why: `폴더가 없습니다: ${TODO}`, jobs: [] };
  const dirs = fs.readdirSync(TODO, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(TODO, d.name));
  return { ok: true, root: ROOT, jobs: dirs.map(readJob) };
}

/**
 * 사진을 원고의 [사진: …] 자리에 짝지어 줍니다.
 *
 * ⚠️ **AI를 안 씁니다.** 사진을 눈으로 보고 고르게 하면 한 장에 200토큰씩 듭니다.
 * 15장이면 3,000토큰입니다. 그런데 사장님이 파일 이름에 이미 적어두십니다 —
 * "3. 코트 뒷모습.jpg" 처럼요. 그 글자를 쓰면 공짜입니다.
 *
 * ⚠️ 이름에 설명이 없으면(1.jpg, 2.jpg) **번호 순서대로** 넣습니다.
 * 사장님이 찍은 순서가 곧 이야기 순서인 경우가 대부분입니다.
 *
 * ⚠️ 사진을 편집기에 **자동으로 넣지는 않습니다.**
 * 네이버는 사진을 넣을 때 자기 서버에 올리는 절차를 거칩니다.
 * 바깥에서 밀어 넣으면 그 절차를 건너뛰어 글이 깨집니다.
 * 대신 **어느 자리에 어느 파일**인지 적어드립니다. 끌어다 놓기만 하시면 됩니다.
 */
function matchPhotos(blocks, photos) {
  const slots = [];
  blocks.forEach((b, i) => { if (b.kind === "photo") slots.push({ at: i, want: b.text || "" }); });

  const left = [...photos];
  const pairs = [];

  // 1) 이름에 적힌 말이 겹치는 것부터 짝지어 줍니다.
  for (const s of slots) {
    const words = s.want.replace(/[^가-힣a-zA-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
    if (!words.length) continue;
    let best = null, bestScore = 0;
    for (const f of left) {
      const nameOnly = f.replace(/\.[^.]+$/, "").replace(/^\s*\d+[.\-_ ]*/, "");
      const score = words.filter((w) => nameOnly.includes(w)).length;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best) { pairs.push({ ...s, file: best, how: `이름이 겹칩니다 (${bestScore}낱말)` }); left.splice(left.indexOf(best), 1); }
  }

  // 2) 남은 자리는 번호 순서대로.
  for (const s of slots) {
    if (pairs.some((p) => p.at === s.at)) continue;
    const f = left.shift();
    if (f) pairs.push({ ...s, file: f, how: "번호 순서대로" });
    else pairs.push({ ...s, file: null, how: "사진이 모자랍니다" });
  }

  pairs.sort((a, b) => a.at - b.at);
  return { pairs, leftover: left, short: pairs.filter((p) => !p.file).length };
}

/** 사장님이 보실 사진 배치표. */
function photoSheet(job, blocks, match) {
  const lines = [`${job.name} — 사진 놓을 자리`, ""];
  let n = 0, lastHead = "";
  for (const b of blocks) {
    if (b.kind === "subhead") { lastHead = b.text; continue; }
    if (b.kind !== "photo") continue;
    const p = match.pairs[n++];
    lines.push(`${String(n).padStart(2)}. ${lastHead ? `[${lastHead}] ` : ""}${b.text || "(설명 없음)"}`);
    lines.push(`    → ${p && p.file ? p.file : "⚠️ 넣을 사진이 없습니다"}${p && p.file ? `   (${p.how})` : ""}`);
    lines.push("");
  }
  if (match.leftover.length) {
    lines.push("남은 사진 (자리가 없습니다):");
    for (const f of match.leftover) lines.push(`  · ${f}`);
    lines.push("");
    lines.push("→ 원고에 [사진: …] 자리를 더 넣거나, 이 사진들은 안 쓰셔도 됩니다.");
  }
  if (match.short) {
    lines.push(`⚠️ 사진이 ${match.short}장 모자랍니다. 자리는 있는데 넣을 사진이 없습니다.`);
  }
  return lines.join("\n");
}

module.exports = {
  ROOT, TODO, DONE, listJobs, readJob, readGuide, pickSkill, byNumber, BANNED,
  matchPhotos, photoSheet, josa, estimate,
};
