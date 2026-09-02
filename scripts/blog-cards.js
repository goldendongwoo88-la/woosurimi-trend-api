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

  // 카드뉴스 만들기 — 편집국 쪽 모듈이라 그 폴더에서 불러옵니다.
  const { makeCards } = await import(
    "file:///" + path.join(FLOOR_DIR, "src", "cardNews.js").split("\\").join("/")
  );
  const here = process.cwd();
  process.chdir(FLOOR_DIR);          // 모듈이 상대 경로로 puppeteer를 찾습니다
  let made;
  try {
    made = await makeCards(pj.post, { max: 8, style, brand: "넥스트밸류" });
  } finally { process.chdir(here); }
  say(`카드 ${made.cards.length}장 · ${made.style} · ${made.palette} · 사진 ${made.photo}`);

  /**
   * 만든 카드를 원고의 사진으로 등록합니다.
   * `file`을 주면 naver-draft가 내려받지 않고 그 파일을 그대로 올립니다.
   */
  const photos = made.cards.map((c) => ({
    file: c.file,
    url: "",                       // 카드는 인터넷 주소가 없습니다
    kind: "card",
    credit: "",                    // 우리가 만든 것이라 출처를 붙이지 않습니다
    license: "자체 제작",
    risk: "없음",
  }));
  await floor("/api/photos/choose", { postId, photos });
  say(`원고에 카드 ${photos.length}장 붙였습니다`);

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
