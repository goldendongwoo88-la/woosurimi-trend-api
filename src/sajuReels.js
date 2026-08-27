/**
 * 사주 릴스 자동 제작.
 *
 * ⚠️ 이건 사주 리포트를 팔기 위한 **유입 장치**입니다. 릴스 자체로 돈을 벌 생각이
 * 아니라, 이걸 보고 "내 사주는 어떨까" 싶어서 무료 페이지에 들어오게 만드는 게 목적입니다.
 * 그래서 릴스 안에서 상품을 팔지 않습니다. 무료로 보라고만 합니다.
 *
 * ⚠️ 배경 이미지를 직접 만듭니다. 스톡 사진을 쓰면 다른 채널과 똑같이 생기고,
 * 남의 영상을 가져다 쓰면 계정이 날아갑니다. 사장님은 채널 다섯 개를 키워두셨습니다.
 * 그림을 직접 만들면 저작권 위험이 0이고, 매번 같은 얼굴이라 브랜드가 쌓입니다.
 *
 * ⚠️ 그리고 사주 콘텐츠에는 넘지 말아야 할 선이 있습니다. "이번 주 대박",
 * "이 띠는 조심하세요" 같은 겁주기·단정은 재미는 있지만 결국 신뢰를 깎습니다.
 * 무엇보다 그걸 보고 진짜 불안해하는 사람이 생깁니다. GUARD에 적어뒀습니다.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { callClaude, isConfigured, extractJson } = require("./claudeClient");

const OUT_DIR = path.join(__dirname, "..", "public", "uploads", "saju-reels");

// ────────────────────────────────────────────────────────────
// 열두 띠
//
// 색은 오행을 따랐습니다. 아무 색이나 쓰면 왜 그 색인지 설명할 수 없고,
// 나중에 "이 띠는 왜 파란색이에요"라는 질문에 답을 못 합니다.
// ────────────────────────────────────────────────────────────
const ZODIAC = [
  { id: "rat",     name: "쥐",   hanja: "子", elem: "수", from: "#1B2A44", to: "#0D1523" },
  { id: "ox",      name: "소",   hanja: "丑", elem: "토", from: "#3A2E1C", to: "#1A140B" },
  { id: "tiger",   name: "호랑이", hanja: "寅", elem: "목", from: "#1E3A2A", to: "#0C1A12" },
  { id: "rabbit",  name: "토끼", hanja: "卯", elem: "목", from: "#24402E", to: "#0E1C14" },
  { id: "dragon",  name: "용",   hanja: "辰", elem: "토", from: "#3B2F20", to: "#18120A" },
  { id: "snake",   name: "뱀",   hanja: "巳", elem: "화", from: "#42201E", to: "#1C0C0B" },
  { id: "horse",   name: "말",   hanja: "午", elem: "화", from: "#4A231F", to: "#1F0D0B" },
  { id: "goat",    name: "양",   hanja: "未", elem: "토", from: "#372C1E", to: "#16110A" },
  { id: "monkey",  name: "원숭이", hanja: "申", elem: "금", from: "#2C3340", to: "#12161C" },
  { id: "rooster", name: "닭",   hanja: "酉", elem: "금", from: "#333A46", to: "#14181E" },
  { id: "dog",     name: "개",   hanja: "戌", elem: "토", from: "#39301F", to: "#17130B" },
  { id: "pig",     name: "돼지", hanja: "亥", elem: "수", from: "#1C2B46", to: "#0B1322" },
];

/**
 * 소재.
 *
 * ⚠️ 띠 12개 × 주제 여러 개로 두면 소재가 마르지 않습니다.
 * 하루 한 편씩 올려도 1년치가 나옵니다. 이게 이 구조의 핵심입니다.
 */
const TOPICS = [
  { id: "money",   label: "재물의 결",     ask: "이 띠 사람들이 돈을 벌고 쓰는 방식의 특징" },
  { id: "love",    label: "연애의 결",     ask: "이 띠 사람들이 사랑할 때 드러나는 결" },
  { id: "work",    label: "일과 적성",     ask: "이 띠 사람들이 힘을 내는 일의 종류" },
  { id: "trap",    label: "빠지기 쉬운 함정", ask: "이 띠 사람들이 스스로 힘들게 만드는 지점" },
  { id: "match",   label: "잘 맞는 사람",   ask: "이 띠와 결이 잘 맞는 상대와 그 이유" },
  { id: "reunion", label: "헤어진 뒤",     ask: "이 띠 사람들이 이별 후에 보이는 특징적인 결" },
  { id: "health",  label: "몸이 보내는 신호", ask: "이 띠 사람들의 기운 치우침이 몸에 남기는 자국" },
  { id: "strength", label: "타고난 무기",   ask: "이 띠 사람들이 가진 강점과 그것을 쓰는 법" },
  // ⚠️ 살(煞)은 파는 상품에도 있어서 릴스 주제로도 둡니다.
  // 다만 겁주는 쪽으로 흐르기 제일 쉬운 주제라 GUARD를 더 조심해서 봐야 합니다.
  { id: "sal",     label: "타고난 표식",   ask: "이 띠에 흔한 신살(역마·도화·화개 같은 표식)이 삶에 남기는 결" },
];

const GUARD = `
[사주 콘텐츠에서 하지 않을 것]

1. 겁주지 마세요.
   ✗ "닭띠는 조심하세요"   ✗ "올해 큰일 납니다"   ✗ "주의하지 않으면"
   ⭕ "닭띠와는 결이 좀 달라요"   ⭕ "부딪히기 쉬운 지점이 있습니다"
   부딪힌다는 사실은 말해도 됩니다. **명령형으로 경고하지 마세요.**
   "조심하세요"는 정보가 아니라 불안입니다. 그걸 보고 진짜 걱정하는 사람이 생깁니다.

2. 단정하지 마세요.
   ✗ "무조건", "반드시", "100%", "절대"
   ⭕ "~한 편입니다", "~인 경우가 많아요"

3. 앞일을 예언하지 마세요.
   ✗ "3월에 돈이 들어옵니다"   ✗ "올해 안에 만납니다"
   시기를 말하려면 사건이 아니라 결로 — "마음이 밖으로 향하기 쉬운 때"

4. 어떤 띠도 나쁘게 말하지 마세요.
   궁합이 안 맞는다는 건 서로 결이 다르다는 뜻이지 누가 나쁘다는 게 아닙니다.

5. 상품을 팔지 마세요. 가격도 상품명도 말하지 않습니다. 무료로 보라고만 합니다.
`.trim();

/**
 * 대본에 금지선이 새어나왔는지 봅니다.
 *
 * ⚠️ 프롬프트로 막아도 뚫립니다. 실제로 "닭띠는 조심하세요"가 나왔습니다.
 * 사람처럼 자연스럽게 쓰라고 시키면, 사람이 흔히 쓰는 그 표현이 딸려 나옵니다.
 * 그래서 막는 걸로 끝내지 않고 나온 걸 잡아냅니다.
 */
const BANNED = [
  { kind: "겁주기", re: /조심하세요|조심해야|주의하세요|큰일\s*(납|나|이야)|위험합니다|안\s*좋습니다/ },
  { kind: "단정",   re: /무조건|반드시|100\s*%|절대\s*(로)?\s*(안|못|아니)/ },
  { kind: "예언",   re: /\d+\s*월에\s*(돈|재물|들어|만나|생기)/ },
  { kind: "판매",   re: /[0-9][0-9,]{2,}\s*원|결제하|구매하|주문하/ },
];

function checkScenes(scenes) {
  const hits = [];
  for (const s of scenes) {
    for (const b of BANNED) {
      if (b.re.test(s)) hits.push({ kind: b.kind, line: s, word: (s.match(b.re) || [])[0] });
    }
  }
  return hits;
}

// ────────────────────────────────────────────────────────────
// 배경 그림
// ────────────────────────────────────────────────────────────

/** 별자리처럼 흩뿌린 점. 매번 같은 자리에 찍히게 씨앗을 씁니다. */
function starField(seed, count = 46) {
  let s = seed, out = "";
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < count; i++) {
    const x = Math.round(rnd() * 1080);
    const y = Math.round(rnd() * 1920);
    const r = (rnd() * 1.6 + 0.6).toFixed(1);
    const o = (rnd() * 0.5 + 0.16).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
  }
  return out;
}

/**
 * 캐릭터 그림이 있으면 그걸 씁니다.
 *
 * ⚠️ 그라데이션에 한자만 깔린 영상은 사람들이 안 봅니다. 사장님 말씀이 맞았어요.
 * 사주로 하루 500만원 번다는 사람의 핵심이 바로 캐릭터였습니다 —
 * "제가 한 거는 이 이미지 하나 만들어서 넣은 것밖에 없거든요"라고 했습니다.
 *
 * ⚠️ 그런데 저는 그림을 못 만듭니다. 그래서 이렇게 나눴습니다.
 *   · 캐릭터 그림은 **사장님이 구글 Flow에서 한 번만** 만들어 올려주시고
 *   · 그 뒤로는 96편이 전부 그 그림을 씁니다
 * 한 번 만들어두면 계속 쓰는 구조라, 매번 만드실 필요가 없습니다.
 *
 * ⚠️ 같은 얼굴이 계속 나와야 브랜드가 됩니다. 매번 다른 얼굴이면
 * 사람들이 기억하지 못합니다.
 */
function pickCharacterImage(index, channelId) {
  try {
    const ci = require("./characterImage");
    // ⚠️ 채널별로 골라야 합니다. 연애 채널 영상에 도령이 나오면 안 됩니다.
    const pool = ci.existing(channelId);
    if (!pool.length) return null;
    // ⚠️ 무작위로 고르면 한 영상 안에서 얼굴이 계속 바뀝니다.
    // 장면 순서대로 돌려서 자연스럽게 이어지게 합니다.
    const PUBLIC_DIR = path.join(__dirname, "..", "public");
    const f = pool[index % pool.length];
    const local = path.join(PUBLIC_DIR, f.path.replace(/^\/+/, ""));
    return fs.existsSync(local) ? local : null;
  } catch {
    return null;
  }
}

/**
 * 장면 배경 한 장.
 *
 * ⚠️ 글자는 넣지 않습니다. 자막은 videoRenderer가 얹습니다.
 * 여기서 글자를 넣으면 자막과 겹칩니다.
 *
 * ⚠️ 캐릭터 그림이 올라와 있으면 그림 위에 어둡게 깔아서 씁니다.
 * 그냥 얹으면 밝은 부분에서 자막이 안 보입니다.
 */
async function makeBackground(z, index, dest, channelId) {
  const charPath = pickCharacterImage(index, channelId);
  if (charPath) {
    // 위아래를 어둡게 덮어 자막이 읽히게 합니다. 가운데 얼굴은 살립니다.
    const veil = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs>
    <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#000" stop-opacity="0.62"/>
      <stop offset="0.22" stop-color="#000" stop-opacity="0.10"/>
      <stop offset="0.62" stop-color="#000" stop-opacity="0.10"/>
      <stop offset="1"    stop-color="#000" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#v)"/>
  <rect x="46" y="46" width="988" height="1828" fill="none"
        stroke="${z.from}" stroke-opacity="0.35" stroke-width="2" rx="6"/>
</svg>`);
    await sharp(charPath)
      .resize(1080, 1920, { fit: "cover", position: "top" })
      .composite([{ input: veil, blend: "over" }])
      .jpeg({ quality: 88 })
      .toFile(dest);
    return;
  }
  return makeGradientBackground(z, index, dest);
}

/** 캐릭터 그림이 없을 때 쓰는 바탕. 없어도 영상은 나와야 합니다. */
async function makeGradientBackground(z, index, dest) {
  const big = 700 + (index % 3) * 90;   // 장면마다 한자 크기를 조금씩 달리해 단조로움을 줄입니다
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${z.from}"/>
      <stop offset="1" stop-color="${z.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.7" cy="0.22" r="0.62">
      <stop offset="0" stop-color="#C8A45C" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#C8A45C" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <rect width="1080" height="1920" fill="url(#glow)"/>
  ${starField(index * 977 + 13)}
  <text x="540" y="${960 + big * 0.34}" font-size="${big}" font-family="serif"
        text-anchor="middle" fill="#C8A45C" opacity="0.085">${z.hanja}</text>
  <rect x="46" y="46" width="988" height="1828" fill="none"
        stroke="#C8A45C" stroke-opacity="0.16" stroke-width="2" rx="6"/>
</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(dest);
}

// ────────────────────────────────────────────────────────────
// 대본
// ────────────────────────────────────────────────────────────
async function writeScript(z, topic, character) {
  if (!isConfigured()) throw new Error("AI가 연결되지 않았습니다.");

  // ⚠️ 채널마다 말투가 확실히 달라야 합니다.
  // 세 계정이 같은 말투로 올리면 한 사람이 돌리는 게 티가 납니다.
  const who = character
    ? `\n[이 채널의 말투 — 반드시 지키세요]\n` +
      `${character.name}(${character.who})가 말합니다.\n` +
      `${character.tone}\n` +
      `⚠️ 다른 채널과 말투가 겹치면 안 됩니다. 이 결로만 쓰세요.\n`
    : "";

  const data = await callClaude({
    feature: "사주 릴스",
    system:
      "한국 사주 콘텐츠를 만드는 사람입니다. 44초짜리 세로 영상 대본을 씁니다.\n\n" +
      "⚠️ 첫 장면 3초 안에 붙잡지 못하면 사람들이 넘깁니다. 첫 줄이 전부입니다.\n" +
      "  나쁜 예: '오늘은 쥐띠에 대해 알아보겠습니다'\n" +
      "  좋은 예: '쥐띠가 돈을 모으는 방식, 좀 특이합니다'\n\n" +
      "⚠️ 말로 읽힐 글입니다. 눈으로 읽는 글처럼 쓰지 마세요.\n" +
      "  한 장면은 한 호흡에 읽을 수 있는 길이여야 합니다.\n" +
      who + "\n" +
      GUARD + "\n\n" +
      '{"hook":"상단 고정 문구(12자 이내)","scenes":["장면1","장면2",...]} JSON만 출력하세요.',
    messages: [{
      role: "user",
      content:
        `띠: ${z.name}띠 (${z.hanja}, 오행 ${z.elem})\n` +
        `주제: ${topic.label} — ${topic.ask}\n\n` +
        `장면 6개로 써 주세요. 각 장면은 25~45자.\n` +
        `1번은 후킹, 2~5번은 내용, 6번은 마무리입니다.\n\n` +
        `⚠️ 6번 마무리는 이렇게 해주세요 —\n` +
        `"띠로 보는 건 여기까지고, 진짜는 태어난 시각까지 봐야 나옵니다.\n` +
        ` 무료로 볼 수 있게 해뒀어요" 정도의 결로요.\n` +
        `상품 이름이나 가격은 말하지 마세요.`,
    }],
    maxTokens: 1200,
    temperature: 0.9,
  });

  const parsed = extractJson(data);
  let scenes = (parsed && Array.isArray(parsed.scenes) ? parsed.scenes : [])
    .map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  if (scenes.length < 3) throw new Error("대본을 만들지 못했습니다.");

  // 걸린 줄만 고칩니다. 전체를 다시 쓰게 하면 멀쩡한 데까지 바뀌고 시간도 배로 듭니다.
  const hits = checkScenes(scenes);
  let repaired = 0;
  if (hits.length) {
    try {
      const fixed = await callClaude({
        feature: "사주 릴스",
        system:
          "사주 영상 대본에서 넘지 말아야 할 선을 넘은 문장만 고칩니다.\n\n" +
          "⚠️ 뜻과 말투는 그대로 두고 걸린 표현만 바꿉니다. 글을 더 좋게 만들려 하지 마세요.\n" +
          "⚠️ 글자 수를 비슷하게 유지하세요. 영상 길이가 달라집니다.\n\n" +
          "예) '닭띠는 조심하세요' → '닭띠와는 결이 좀 달라요'\n" +
          "예) '무조건 잘 맞습니다' → '잘 맞는 편입니다'\n\n" +
          GUARD + "\n\n" +
          '{"fixes":[{"before":"원래 문장","after":"고친 문장"}]} JSON만 출력하세요.',
        messages: [{
          role: "user",
          content: hits.map((h, i) =>
            `${i + 1}) ${h.line}\n   걸린 말: "${h.word}" (${h.kind})`).join("\n\n"),
        }],
        maxTokens: 900,
        temperature: 0.4,
      });
      const map = (extractJson(fixed) || {}).fixes || [];
      scenes = scenes.map((s) => {
        for (const f of map) {
          const before = String(f.before || "").trim();
          const after = String(f.after || "").trim();
          if (before && after && s.includes(before)) { repaired++; return s.split(before).join(after); }
          // 문장 통째로 바꿔 오는 경우도 있어서, 거의 같으면 교체합니다.
          if (before && after && s === before) { repaired++; return after; }
        }
        return s;
      });
    } catch { /* 못 고쳐도 대본은 나갑니다. 아래 leftover로 알려줍니다. */ }
  }

  return {
    hook: String(parsed.hook || `${z.name}띠`).slice(0, 14),
    scenes,
    repaired,
    leftover: checkScenes(scenes),   // 고치고도 남은 것. 비어 있어야 정상입니다.
  };
}

// ────────────────────────────────────────────────────────────
// 한 편 만들기
// ────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.zodiac  띠 id (없으면 무작위)
 * @param {string} opts.topic   주제 id (없으면 무작위)
 * @param {number} opts.seed    같은 씨앗이면 같은 조합. 매일 다른 편이 나오게 날짜를 넣습니다.
 */
async function planReel({ zodiac, topic, channel, seed = 0 } = {}) {
  const z = ZODIAC.find((x) => x.id === zodiac) || ZODIAC[seed % ZODIAC.length];

  // ⚠️ 채널을 지정하면 그 채널이 맡은 주제 안에서만 고릅니다.
  // 안 그러면 연애 채널에 재물운 영상이 올라갑니다. 계정 성격이 흐려져요.
  const ci = require("./characterImage");
  const ch = channel ? ci.CHARACTERS[channel] : null;

  let t;
  if (topic) {
    t = TOPICS.find((x) => x.id === topic);
    // 지정한 주제가 그 채널 몫이 아니면 그냥 씁니다 — 사람이 일부러 고른 거니까요.
  }
  if (!t && ch) {
    const mine = ch.topics.map((id) => TOPICS.find((x) => x.id === id)).filter(Boolean);
    t = mine[Math.floor(seed / ZODIAC.length) % mine.length];
  }
  if (!t) t = TOPICS[Math.floor(seed / ZODIAC.length) % TOPICS.length];

  // 채널을 안 정했으면 그 주제를 맡은 채널을 찾습니다.
  const speaker = ch || ci.channelFor(t.id);

  const script = await writeScript(z, t, speaker);
  return {
    zodiac: z,
    topic: t,
    channel: { id: speaker.id, name: speaker.name, handle: speaker.handle, voiceId: speaker.voiceId },
    ...script,
  };
}

/** 대본을 받아 배경까지 만들어, 렌더러가 바로 먹을 수 있는 장면 배열로. */
async function buildScenes(plan) {
  const jobId = crypto.randomUUID().slice(0, 8);
  const dir = path.join(OUT_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });

  const scenes = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const file = path.join(dir, `s${i}.jpg`);
    await makeBackground(plan.zodiac, i, file, plan.channel && plan.channel.id);
    scenes.push({
      caption: plan.scenes[i],
      image: `/uploads/saju-reels/${jobId}/s${i}.jpg`,
    });
  }
  return { jobId, dir, scenes };
}

/** 오늘 날짜로 씨앗을 만듭니다. 같은 날엔 같은 편, 다음 날엔 다음 편. */
function seedForDate(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 3600000);
  return Math.floor(kst.getTime() / 86400000);
}

/** 만들어둔 그림들을 지웁니다. 무료 서버는 디스크가 작습니다. */
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

module.exports = {
  checkScenes, BANNED,
  ZODIAC, TOPICS, GUARD,
  planReel, buildScenes, makeBackground, writeScript,
  seedForDate, cleanup, OUT_DIR,
};
