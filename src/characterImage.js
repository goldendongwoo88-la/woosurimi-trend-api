/**
 * 사주 캐릭터 그림 만들기.
 *
 * ⚠️ 먼저 분명히 — **저는 그림을 못 그립니다.** 글과 코드만 만듭니다.
 * 그래서 이미지 AI를 붙였습니다. 키를 넣으시면 자동으로 만들어지고,
 * 없으면 **붙여넣기만 하면 되는 프롬프트**를 드립니다.
 * 무료 도구(Gemini 웹, ChatGPT 등)에 그대로 넣으셔도 같은 그림이 나옵니다.
 *
 * ⚠️ 프롬프트는 사주로 하루 500만원 번다는 사람이 말한 그대로 짰습니다.
 *
 *   "실사도 아니고 만화도 아니고 **그 사이 어딘가**"
 *   "여기서 제일 중요한 게 **레퍼런스를 줘야** 돼요"
 *   "네이버 웹툰보다 **카카오 웹툰 그림체가 고급져요**. 여자들이 좋아하고"
 *   "저희 주요 타겟은 **90% 이상이 다 여자**예요. 무조건 여자만을 위해서 만들어야 돼요"
 *   "남성분들은 꼭 주변 여성분들에게 보여줘야 돼요. **남자분들은 구려요, 보통**"
 *
 * 마지막 줄이 진짜입니다. 고르실 때 사모님께 꼭 보여주세요.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "..", "public", "uploads", "characters");

// ────────────────────────────────────────────────────────────
// 그림체를 고정하는 부분
//
// ⚠️ 이 문단이 모든 프롬프트에 똑같이 들어갑니다.
// 이게 없으면 만들 때마다 딴 사람이 나옵니다. 캐릭터는 **같은 얼굴이 계속 나와야**
// 사람들이 기억하고, 그게 곧 브랜드가 됩니다.
// ────────────────────────────────────────────────────────────
const STYLE = `
Korean webtoon illustration style, semi-realistic — halfway between
photorealism and anime. Clean line art with soft cel shading and gentle
gradients. Refined, elegant, premium quality — the polished look of a
top-tier Korean webtoon (Kakao Webtoon tier), not cheap anime.
Delicate facial features, luminous skin, expressive eyes with detailed
highlights. Muted, sophisticated color palette with warm rim lighting.
Vertical 9:16 composition, character centered, upper body framing,
generous empty space at top and bottom for text overlay.
No text, no watermark, no logo in the image.
`.trim().replace(/\s+/g, " ");

// ⚠️ 세로 영상에 쓸 거라 9:16이어야 합니다. 가로로 만들면 위아래가 잘려서
// 얼굴이 화면 밖으로 나갑니다.
const RATIO = "9:16 vertical portrait aspect ratio";

/**
 * 캐릭터 = 채널 하나.
 *
 * ⚠️ 채널마다 다른 캐릭터를 두는 건 괜찮습니다. 웹툰 작가가 캐릭터 여럿 쓰는 것과 같아요.
 * 다만 **실제 사람인 척 후기를 쓰거나 계정끼리 서로 추천하는 건 조작**입니다.
 * 걸리면 계정이 전부 날아갑니다. 캐릭터는 캐릭터로 둡니다.
 *
 * ⚠️ 그리고 **채널마다 다루는 주제가 달라야** 합니다.
 * 같은 영상을 세 계정에 나눠 올리면 중복 콘텐츠로 노출이 깎입니다.
 * 그래서 캐릭터마다 맡는 주제를 따로 정해뒀습니다. 겹치지 않습니다.
 *
 * ⚠️ 고객의 90%가 여성입니다. 그래서
 *   · 여성 캐릭터 둘 — 결이 서로 달라야 합니다. 비슷하면 같은 사람으로 보입니다.
 *   · 남성 캐릭터 하나 — "여성이 좋아할 남자"여야지 남자 취향으로 만들면 안 됩니다.
 */
const CHARACTERS = {
  assi: {
    id: "assi",
    name: "아씨",
    who: "한복 곱게 입은 아가씨",
    handle: "정통 사주 채널",
    // ⚠️ 이 채널이 맡는 주제. 다른 채널과 겹치지 않습니다.
    topics: ["money", "work", "health"],
    tone: "차분하고 단정한 존댓말. 어른이 조용히 짚어주는 결. 문장이 길어도 됩니다.",
    voiceId: "ko-KR-SunHiNeural",
    accent: "#8A6A1F",
    base:
      "A beautiful young Korean woman in her early twenties wearing an elegant " +
      "modern hanbok in deep midnight blue with subtle gold embroidery. " +
      "Long straight black hair worn down, calm knowing gaze, faint gentle smile. " +
      "Delicate silver hairpin. Refined and mysterious, like a fortune teller " +
      "who has seen many lives.",
    scenes: {
      idle: "sitting calmly at a low wooden table, soft candlelight, night sky with stars behind",
      reading: "holding an old fortune-telling book, looking down at it thoughtfully, warm lamp glow",
      speaking: "looking directly at the viewer, one hand gently raised as if explaining, soft smile",
      serious: "expression quiet and serious, eyes lowered slightly, dim blue moonlight",
      warm: "warm reassuring smile, head slightly tilted, soft golden light, comforting mood",
    },
  },

  yeonhwa: {
    id: "yeonhwa",
    name: "연화",
    who: "친구처럼 편한 요즘 사주",
    handle: "연애·궁합 채널",
    // ⚠️ 감정이 실리는 주제만 맡습니다. 이 채널이 제일 잘 팔릴 겁니다 —
    // 재회운·연애운을 사는 사람이 가장 절박하거든요.
    topics: ["love", "match", "reunion"],
    tone: "친구가 말해주듯 편한 반말 섞인 말투. 짧게 끊어 칩니다. '~거든', '~인데'.",
    voiceId: "ko-KR-SunHiNeural",
    accent: "#9E3B37",
    // ⚠️ 아씨와 확실히 달라야 합니다. 한복이 아니라 요즘 옷, 단발, 밝은 분위기.
    // 둘 다 한복 입히면 같은 사람으로 보입니다.
    base:
      "A pretty Korean woman in her mid twenties with a soft bob haircut, " +
      "wearing a cream knit cardigan over a simple white top, small gold earrings. " +
      "Bright approachable face, playful warm eyes, natural light makeup. " +
      "Looks like a close friend who happens to read fortunes — modern, not traditional. " +
      "Cozy cafe or bedroom setting, plants and soft daylight.",
    scenes: {
      idle: "sitting cross-legged on a bed with a phone, cozy room, soft afternoon light",
      reading: "holding tarot-like cards loosely, looking at them with curiosity, cafe table",
      speaking: "leaning toward the viewer as if telling a secret, bright animated expression",
      serious: "pausing mid-thought, expression softened with concern, quiet moment",
      warm: "laughing lightly, hand near her cheek, very warm and comforting",
    },
  },

  doryeong: {
    id: "doryeong",
    name: "도령",
    who: "밤새 책을 읽는 선비",
    handle: "살·신살 채널",
    // ⚠️ 겁주는 주제가 아니라 '타고난 표식'을 다룹니다.
    // 여성 고객이 "잘생긴 남자가 진지하게 봐주는" 걸 좋아합니다.
    topics: ["sal", "trap", "strength"],
    tone: "군더더기 없는 존댓말. 짧고 단정합니다. 감정을 싣지 않고 사실만.",
    voiceId: "ko-KR-HyunsuMultilingualNeural",
    accent: "#3E5C8A",
    base:
      "A handsome young Korean man in his mid twenties wearing a scholar's " +
      "durumagi robe in charcoal grey with fine indigo trim. " +
      "Neatly tied topknot, sharp intelligent eyes, quiet composed expression, " +
      "clean jawline. Slender and refined, like a young scholar who studies " +
      "through the night. Cold beautiful features.",
    scenes: {
      idle: "seated at a desk stacked with old books, single candle, deep night",
      reading: "reading a scroll by candlelight, brow slightly furrowed in concentration",
      speaking: "turning toward the viewer mid-sentence, calm and articulate",
      serious: "closing a book slowly, expression grave, cold blue light",
      warm: "faint rare smile, shoulders relaxed, warm amber lamplight",
    },
  },
};

/** 이 캐릭터가 맡은 주제인지. 채널끼리 겹치지 않게 하는 데 씁니다. */
function ownsTopic(charId, topicId) {
  const c = CHARACTERS[charId];
  return !!(c && c.topics.includes(topicId));
}

/** 어느 채널이 이 주제를 맡는가. */
function channelFor(topicId) {
  for (const c of Object.values(CHARACTERS)) {
    if (c.topics.includes(topicId)) return c;
  }
  return CHARACTERS.assi;
}

/**
 * 붙여넣을 프롬프트를 만듭니다.
 *
 * ⚠️ 레퍼런스 이미지를 함께 넣으라는 안내를 반드시 붙입니다.
 * 글만으로는 그림체가 매번 흔들립니다. 저 사람도 "제일 중요한 게 레퍼런스"라고 했어요.
 */
function prompt(charId, scene = "speaking") {
  const c = CHARACTERS[charId];
  if (!c) throw new Error("그런 캐릭터가 없습니다.");
  const s = c.scenes[scene] || c.scenes.speaking;
  return {
    character: c.name,
    scene,
    text: `${c.base} ${s}. ${STYLE} ${RATIO}`,
    tip:
      "⚠️ 이 글만 넣지 마시고 **마음에 드는 웹툰 그림 한 장을 함께 올려서** " +
      "'이 그림체로 그려줘'라고 하세요. 글만으로는 만들 때마다 딴 사람이 나옵니다.\n" +
      "⚠️ 카카오 웹툰 쪽 그림체가 여성 취향에 잘 맞습니다.\n" +
      "⚠️ 고르실 때 **사모님께 꼭 보여주세요.** 주 고객이 여성이라 남자 눈으로 고르면 어긋납니다.",
  };
}

function allPrompts() {
  const out = [];
  for (const c of Object.values(CHARACTERS)) {
    for (const scene of Object.keys(c.scenes)) {
      out.push(prompt(c.id, scene));
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 이미지 AI 붙이기
//
// ⚠️ 키가 없으면 만들지 못합니다. 그때는 조용히 실패하지 않고
// "프롬프트를 드릴 테니 직접 만드세요"라고 분명히 말합니다.
// ────────────────────────────────────────────────────────────
function provider() {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

async function viaGemini(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
      signal: AbortSignal.timeout(180000),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error("그림이 돌아오지 않았습니다. 프롬프트가 거부됐을 수 있습니다.");
  const b64 = (img.inlineData || img.inline_data).data;
  return Buffer.from(b64, "base64");
}

async function viaOpenAI(text) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: text,
      size: "1024x1536",   // 세로. 정사각형으로 만들면 영상에서 잘립니다.
      n: 1,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("그림이 돌아오지 않았습니다.");
  return Buffer.from(b64, "base64");
}

/**
 * 캐릭터 그림 한 장.
 *
 * @returns {{ok:boolean, path?:string, prompt:object, why?:string}}
 */
async function generate(charId, scene = "speaking") {
  const pr = prompt(charId, scene);
  const who = provider();
  if (!who) {
    return {
      ok: false,
      prompt: pr,
      why: "이미지 AI 키가 없습니다. GEMINI_API_KEY 또는 OPENAI_API_KEY를 넣으시면 " +
           "자동으로 만들어집니다. 지금은 위 프롬프트를 무료 도구에 붙여넣어 직접 만드셔도 됩니다.",
    };
  }

  try {
    const buf = who === "gemini" ? await viaGemini(pr.text) : await viaOpenAI(pr.text);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const name = `${charId}-${scene}-${Date.now().toString(36)}.jpg`;
    const dest = path.join(OUT_DIR, name);
    // ⚠️ 세로 영상 규격에 맞춥니다. 안 맞추면 영상에서 얼굴이 잘립니다.
    await sharp(buf)
      .resize(1080, 1920, { fit: "cover", position: "top" })
      .jpeg({ quality: 90 })
      .toFile(dest);
    return { ok: true, path: `/uploads/characters/${name}`, prompt: pr, provider: who };
  } catch (e) {
    return { ok: false, prompt: pr, why: `${who}로 만들지 못했습니다: ${e.message}` };
  }
}

/** 이미 만들어둔 캐릭터 그림 목록. 있으면 릴스에서 바로 씁니다. */
function existing(charId) {
  try {
    if (!fs.existsSync(OUT_DIR)) return [];
    return fs.readdirSync(OUT_DIR)
      .filter((f) => (!charId || f.startsWith(charId + "-")) && /\.(jpg|png|webp)$/i.test(f))
      .map((f) => ({
        name: f,
        path: `/uploads/characters/${f}`,
        scene: (f.split("-")[1] || "").replace(/\..*$/, ""),
      }));
  } catch {
    return [];
  }
}

module.exports = {
  CHARACTERS, STYLE, OUT_DIR,
  prompt, allPrompts, generate, existing, provider,
  ownsTopic, channelFor,
};
