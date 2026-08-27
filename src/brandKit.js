/**
 * 브랜드 설정 — 내 블로그의 "생김새"를 한 번만 정해두고 모든 글에 씁니다.
 *
 * ⚠️ 어디서 가져온 생각인가
 * 경쟁 서비스(adport.kr) 화면을 봤습니다. 거기 제일 좋았던 게 이겁니다:
 *
 *   셋업 완성도 ███████░░ 79%   15/19 완료
 *   ☑ 브랜드 로고   ☑ 브랜드색   ☐ 본문 글씨   ☐ CTA 링크 카드
 *   "항목을 누르면 해당 설정으로 이동합니다"
 *
 * 왜 좋은가 — **설정이 어디까지 됐는지 한 눈에 보입니다.**
 * 사장님이 설정 단계에서 자주 막히셨는데, 막히는 진짜 이유는
 * "뭘 더 해야 하는지 모르는 것"입니다. 목록과 퍼센트가 그걸 없앱니다.
 *
 * ⚠️ 안 가져온 것도 적어둡니다.
 *   발행 프록시  — 네이버가 자동 발행을 막는 걸 우회하는 장치입니다. 안 만듭니다.
 *   자동 발행    — 네이버 계정 비밀번호를 서버에 맡겨야 합니다. 안 만듭니다.
 *   대행사 관리  — 사장님은 지금 대행사가 아니라 본인 블로그를 하십니다.
 *
 * ⚠️ 저쪽은 "AI 팔레트 분석"이라고 합니다. 우리는 **AI를 안 씁니다.**
 * 로고 그림에서 많이 쓰인 색을 직접 세면 됩니다. 값이 0원입니다.
 */

/**
 * 항목 하나하나가 **어느 기능에 실제로 쓰이는지** 적어둡니다.
 *
 * ⚠️ 이게 없으면 그냥 "빈칸 채우기 숙제"가 됩니다.
 * 왜 채워야 하는지 모르면 안 채웁니다. 채워도 뭐가 좋아지는지 모릅니다.
 */
const ITEMS = [
  // ── 이것부터 (없으면 글을 못 씁니다) ──
  { key: "blogId", group: "먼저", label: "내 블로그 주소",
    why: "내 글 목록을 받아와야 '함께 보면 좋은 글' 링크를 붙일 수 있습니다.",
    uses: ["함께보기", "노출 확인"], required: true, page: "/setup.html" },
  { key: "topic", group: "먼저", label: "주로 쓰는 주제",
    why: "패션·뷰티는 1,370~2,100자, 연예·방송은 900~1,700자로 기준이 다릅니다.",
    uses: ["원고 만들기", "마무리 점검"], required: true, page: "/brand.html",
    options: ["패션·뷰티", "연예·방송"] },

  // ── 글 생김새 ──
  { key: "brandColor", group: "글 생김새", label: "브랜드색",
    why: "소제목과 강조에 같은 색을 쓰면 글마다 같은 사람이 쓴 티가 납니다.",
    uses: ["자동 서식", "썸네일"], type: "color" },
  { key: "markColor", group: "글 생김새", label: "형광펜색",
    why: "제일 중요한 한 줄에만 칠합니다. 실측상 상위 블로그는 배경색을 거의 안 씁니다.",
    uses: ["자동 서식"], type: "color" },
  { key: "bodyFont", group: "글 생김새", label: "본문 글꼴·크기",
    why: "매번 손으로 고르지 않아도 됩니다. 소제목은 38로 자동입니다.",
    uses: ["폰트", "자동 서식"] },
  { key: "logo", group: "글 생김새", label: "로고 그림",
    why: "썸네일 구석에 넣습니다. 퍼가도 출처가 남습니다.",
    uses: ["썸네일", "브랜드색 뽑기"], type: "image" },

  // ── 글 끝 ──
  { key: "hashtags", group: "글 끝", label: "늘 넣는 해시태그",
    why: "글마다 다시 치지 않아도 됩니다.",
    uses: ["원고 만들기"], type: "list" },
  { key: "ctaText", group: "글 끝", label: "맺음말 (CTA)",
    why: "글 끝에 붙일 한 줄입니다. 이웃추가·문의 유도 같은 것.",
    uses: ["원고 만들기"] },
  { key: "ownLinks", group: "글 끝", label: "내 글 링크 붙이기",
    why: "실측: 상위 블로그는 자기 글 링크가 중앙값 2개, 하위는 0개였습니다.",
    uses: ["함께보기"], type: "bool" },

  // ── 나에 대해 ──
  { key: "persona", group: "나에 대해", label: "글 쓰는 사람 소개",
    why: "키·사이즈·피부 타입 같은 것. 후기 글이 구체적이 됩니다.",
    uses: ["원고 만들기"], type: "text" },
  { key: "tone", group: "나에 대해", label: "말투",
    why: "존댓말인지 반말인지, 담백한지 수다스러운지.",
    uses: ["원고 만들기"], options: ["담백하게", "친근하게", "전문가처럼"] },
  { key: "avoidWords", group: "나에 대해", label: "안 쓰는 말",
    why: "내가 절대 안 쓰는 표현을 적어두면 AI가 피합니다.",
    uses: ["원고 만들기", "표현 검사"], type: "list" },

  // ── 자료 ──
  { key: "photoFolder", group: "자료", label: "사진 폴더",
    why: "매일 포스팅 도우미가 여기서 사진을 가져옵니다.",
    uses: ["매일 포스팅 도우미"] },
  { key: "sponsorRule", group: "자료", label: "협찬 글 규칙",
    why: "협찬 글에는 다른 글로 보내는 링크를 안 넣습니다. 광고주가 막는 경우가 많습니다.",
    uses: ["함께보기", "마무리 점검"], type: "bool" },
];

/** 값이 실제로 채워졌다고 볼 수 있는가. 빈 문자열·빈 배열은 안 채운 것입니다. */
function filled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return true;          // 껐다도 정한 것입니다
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
}

/**
 * 지금 몇 퍼센트 채웠는가.
 *
 * ⚠️ 퍼센트만 보여주면 안 됩니다. **뭘 더 해야 하는지**가 같이 나와야
 * 사장님이 다음 행동을 아십니다. 퍼센트는 기분이고, 목록이 일입니다.
 */
function status(kit = {}) {
  const items = ITEMS.map((it) => ({
    ...it,
    done: filled(kit[it.key]),
    value: it.type === "image" ? (filled(kit[it.key]) ? "(넣으심)" : null) : kit[it.key] ?? null,
  }));

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  const missingRequired = items.filter((i) => i.required && !i.done);

  // 다음에 뭘 하면 제일 이득인가 — 필수 먼저, 그 다음 쓰이는 곳이 많은 것.
  const next = items
    .filter((i) => !i.done)
    .sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || (b.uses?.length || 0) - (a.uses?.length || 0))
    .slice(0, 3);

  const groups = {};
  for (const i of items) (groups[i.group] = groups[i.group] || []).push(i);

  return {
    percent, done, total: items.length,
    canWrite: missingRequired.length === 0,
    missingRequired: missingRequired.map((i) => ({ key: i.key, label: i.label, page: i.page })),
    next: next.map((i) => ({ key: i.key, label: i.label, why: i.why, uses: i.uses })),
    groups,
    items,
  };
}

/**
 * 로고 그림에서 많이 쓰인 색을 뽑습니다.
 *
 * ⚠️ 저쪽은 이걸 "AI 팔레트 분석"이라고 부릅니다. AI가 필요 없습니다.
 * 그림을 아주 작게(32×32) 줄이면 색이 뭉쳐집니다. 그걸 세면 끝입니다.
 * AI로 하면 그림 한 장에 200토큰씩 나갑니다. 이건 0원이고 더 정확합니다.
 *
 * ⚠️ 흰색·검정에 가까운 건 뺍니다. 배경이거나 글자라서 브랜드색이 아닙니다.
 */
async function paletteFromLogo(buf) {
  const sharp = require("sharp");
  const SIZE = 32;
  const { data } = await sharp(buf)
    .resize(SIZE, SIZE, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bucket = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    // 너무 밝거나 어두우면 배경이거나 글자입니다.
    if (max > 240 || max < 25) continue;
    /**
     * ⚠️ 색이 얼마나 진한지는 **밝기에 견줘서** 봐야 합니다.
     *
     * 처음엔 "max - min 이 24보다 크면 색이다"라고 했습니다. 그랬더니
     * 연분홍 #f5d9e4 가 브랜드색 후보로 올라왔습니다. 그건 색이 아니라
     * **흰 배경과 분홍 원이 만나는 가장자리**입니다. 그림을 줄이면 생기는 얼룩이에요.
     *
     *   #f5d9e4  차이 28 / 밝기 245 = 11%   ← 얼룩
     *   #c2185b  차이 170 / 밝기 194 = 88%  ← 진짜 브랜드색
     *
     * 같은 "차이 28"이라도 어두운 색에서는 뚜렷하고 밝은 색에서는 얼룩입니다.
     * 그래서 비율로 봅니다.
     */
    if ((max - min) / max < 0.25) continue;
    // 16단계로 뭉칩니다. 안 뭉치면 비슷한 색이 전부 따로 셉니다.
    const k = `${r >> 4},${g >> 4},${b >> 4}`;
    const cur = bucket.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n++; cur.r += r; cur.g += g; cur.b += b;
    bucket.set(k, cur);
  }

  const hex = (n) => n.toString(16).padStart(2, "0");
  const colors = [...bucket.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((c) => ({
      hex: `#${hex(Math.round(c.r / c.n))}${hex(Math.round(c.g / c.n))}${hex(Math.round(c.b / c.n))}`,
      share: c.n,
    }));

  const total = colors.reduce((n, c) => n + c.share, 0) || 1;
  return {
    ok: colors.length > 0,
    colors: colors.map((c) => ({ hex: c.hex, percent: Math.round((c.share / total) * 100) })),
    why: colors.length
      ? "로고에서 많이 쓰인 색입니다. AI를 안 써서 값이 0원입니다."
      : "뚜렷한 색을 못 찾았습니다. 로고가 흑백이거나 아주 연한 것 같습니다.",
  };
}

/** 원고를 만들 때 브랜드 설정을 지시문으로 바꿉니다. */
function promptBlock(kit = {}) {
  const out = [];
  if (filled(kit.persona)) out.push(`[글 쓰는 사람] ${kit.persona}`);
  if (filled(kit.tone)) out.push(`[말투] ${kit.tone}`);
  if (filled(kit.avoidWords)) out.push(`[안 쓰는 말] ${[].concat(kit.avoidWords).join(", ")} — 이 말들은 쓰지 마세요.`);
  if (filled(kit.hashtags)) out.push(`[글 끝 해시태그] ${[].concat(kit.hashtags).join(" ")}`);
  if (filled(kit.ctaText)) out.push(`[맺음말] 글 마지막에 이 한 줄을 넣어주세요: ${kit.ctaText}`);
  return out.join("\n");
}

module.exports = { ITEMS, status, paletteFromLogo, promptBlock, filled };
