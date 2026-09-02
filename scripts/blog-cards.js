/**
 * 카드뉴스로 원고 임시저장하기 — 2026-09-02
 *
 *   node scripts/blog-cards.js <블로그ID> <원고ID> [A|B|C]
 *   node scripts/blog-cards.js irlaehddni wmtj2p8mz A
 *
 * 원고의 소제목마다 카드를 만들어 **사진 대신** 넣고 임시저장합니다.
 *
 * ⚠️ **왜 사진 대신 카드인가**
 * 경제 글에는 연예인이 없어서 쓸 사진이 없습니다. 스톡을 찾아 넣었더니 기준금리 글에
 * 파리 대성당이, 청약 글에 평양 낚시 사진이 들어갔습니다(실측 2026-09-02).
 * 카드는 그 소제목의 글로 만드니 내용과 100% 맞고, 저작권·유사문서 걱정이 없습니다.
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.**
 */
const path = require("path");
const { execFile } = require("child_process");

const REPO = path.join(__dirname, "..");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";
const FLOOR_DIR = path.join(REPO, "..", "golden-blog-floor");

const [blogId, postId, style = "A"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
/**
 * 연예 글은 **첫 장만 인물 사진**을 쓰고 나머지는 카드로 갑니다 (사장님 지시 2026-09-02).
 *
 * ⚠️ 왜 섞나
 * 인스타에서 가져오는 건 그 사람의 **최신 게시물 격자**라, 그 기사와 무관한
 * 음식·강아지 사진이 섞입니다(사장님 지적). 무엇이 찍혔는지는 우리가 알 수 없습니다.
 * 반면 독자가 연예 글에 오는 이유는 **그 사람 얼굴**입니다. 그래서 첫 장만 사진으로 두고,
 * 본문은 내용과 100% 맞는 카드로 채웁니다.
 */
const withFace = process.argv.includes("--인물");
if (!blogId || !postId) {
  console.log("사용: node scripts/blog-cards.js <블로그ID> <원고ID> [A|B|C]");
  console.log("  A 카드형 · B 뉴스형 · C 매거진형");
  process.exit(1);
}

const say = (m) => console.log(m);

async function floor(p, body) {
  const r = await fetch(FLOOR + p, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}

(async () => {
  const pj = await floor("/api/posts/" + encodeURIComponent(postId));
  if (!pj?.post?.body) { console.error("원고를 못 찾았습니다:", postId); process.exit(1); }
  say(`원고: ${String(pj.post.title).slice(0, 40)}`);

  /**
   * ── 사진 자리를 늘립니다 ──
   *
   * ⚠️ 홈판 실측(src/homefeedRules.js): 스타·연예인은 사진 **19장 · 55자마다 한 장**,
   * 패션·미용은 14장 · 89자마다입니다. 소제목마다 한 장만 두면 5장에서 끝나
   * 기준의 4분의 1밖에 안 됩니다.
   *
   * 소제목 위의 자리는 **그대로 두고**(사장님 지시), 소제목 아래 문단 사이에 더 끼웁니다.
   * 세 문단마다 한 장이면 90자 안팎이 나옵니다.
   */
  const want = 15;
  let body = String(pj.post.body || "");
  if ((body.match(/\[사진/g) || []).length < want) {
    const out = [];
    let since = 0;
    const NL = String.fromCharCode(10);
    for (const raw of body.split(NL)) {
      const l = raw.trim();
      if (l.startsWith("[사진")) { out.push(raw); since = 0; continue; }
      if (l.startsWith("[소제목]")) { out.push(raw); since = 0; continue; }
      // 빈 줄·표식이 아닌 **진짜 문단**만 셉니다.
      if (l && !l.startsWith("[")) {
        since++;
        if (since >= 3) { out.push("[사진: 이어지는 내용]"); since = 0; }
      }
      out.push(raw);
    }
    body = out.join(NL);
    const now = (body.match(/\[사진/g) || []).length;
    await fetch(`${FLOOR}/api/posts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pj.post, body, updated: Date.now() }),
    });
    pj.post.body = body;
    say(`사진 자리 ${now}곳으로 늘렸습니다 (홈판 기준 13~19장)`);
  }

  // 카드뉴스 만들기 — 편집국 쪽 모듈이라 그 폴더에서 불러옵니다.
  const { makeCards } = await import(
    "file:///" + path.join(FLOOR_DIR, "src", "cardNews.js").split("\\").join("/")
  );
  const here = process.cwd();
  process.chdir(FLOOR_DIR);          // 모듈이 상대 경로로 puppeteer를 찾습니다
  let made;
  try {
    // 블로그마다 카드 아래에 찍히는 이름이 다릅니다.
    const BRAND = { irlaehddni: "넥스트밸류", rlaehddn88: "발빠른 스타", man_is_best: "맨이즈베스트" };
    made = await makeCards(pj.post, { max: want + 1, style, brand: BRAND[blogId] || blogId });
  } finally { process.chdir(here); }
  say(`카드 ${made.cards.length}장 · ${made.style} · ${made.palette} · 사진 ${made.photo}`);

  /**
   * 만든 카드를 원고의 사진으로 등록합니다.
   * `file`을 주면 naver-draft가 내려받지 않고 그 파일을 그대로 올립니다.
   */
  let faces = [];
  if (withFace) {
    const c = await floor(`/api/photos/candidates?postId=${encodeURIComponent(postId)}`).catch(() => null);
    faces = (c?.photos || []).filter((x) => x.kind === "instagram").slice(0, 1);
    say(faces.length ? `인물 사진 ${faces.length}장 (첫 장에만)` : "인물 사진을 못 구했습니다 — 카드만 씁니다");
  }

  const photos = made.cards.map((c) => ({
    file: c.file,
    url: "",                       // 카드는 인터넷 주소가 없습니다
    kind: "card",
    credit: "",                    // 우리가 만든 것이라 출처를 붙이지 않습니다
    license: "자체 제작",
    risk: "없음",
  }));
  // 첫 자리에 인물 사진을 끼우고, 카드는 그 뒤로 밀립니다.
  const all = withFace && faces.length ? [...faces, ...photos.slice(0, -1)] : photos;
  await floor("/api/photos/choose", { postId, photos: all });
  say(`원고에 ${all.length}장 붙였습니다 (인물 ${withFace && faces.length ? 1 : 0} · 카드 ${all.length - (withFace && faces.length ? 1 : 0)})`);

  say("네이버에 넣는 중…");
  await new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(REPO, "scripts", "naver-draft.js"), blogId, postId],
      { cwd: REPO, timeout: 600000, encoding: "utf8" }, () => resolve());
    child.stdout?.on("data", (d) => String(d).split("\n").forEach((l) => {
      if (/올린 사진|들어간 것|저장 목록 확인|⚠|✔|실패/.test(l)) say("  " + l.trim());
    }));
  });
  say(`\n확인: https://blog.naver.com/${blogId}/postwrite`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
