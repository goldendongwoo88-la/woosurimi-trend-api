/**
 * 연예·방송 원고 임시저장 — 실제 연예인 사진으로 — 2026-09-02
 *
 *   node scripts/blog-celeb.js <블로그ID> <원고ID>
 *
 * ⚠️ **연예 글에는 카드뉴스를 넣지 않습니다.**
 * 독자가 연예 글에 오는 이유는 **그 사람 얼굴**입니다. 카드로 대체할 수 없습니다.
 * (제가 한 번 그렇게 했다가 사장님께 지적받았습니다 — "왜 카드뉴스가 들어가있어")
 *
 * ⚠️ **인스타그램 격자는 쓰지 않습니다.**
 * 그 사람의 최신 게시물을 순서대로 가져오는 것이라 기사와 무관한 게 섞입니다.
 * 실제로 문근영 헤어스타일 글에 **분당 정자교 사고 추모 사진**이 첫 장으로 들어갔습니다.
 * 무엇이 찍혔는지 우리가 알 수 없으니, 안 쓰는 게 맞습니다.
 *
 * **기사 사진만 씁니다.** 그 연예인을 다룬 기사에 실린 사진이라 내용이 어긋날 일이 없습니다.
 * 모자라면 모자란 대로 냅니다 — 관련 없는 사진으로 채우는 것보다 낫습니다.
 *
 * ⚠️ **발행은 안 합니다. 임시저장까지입니다.**
 */
const path = require("path");
const { execFile } = require("child_process");

const REPO = path.join(__dirname, "..");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";

const [blogId, postId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!blogId || !postId) {
  console.log("사용: node scripts/blog-celeb.js <블로그ID> <원고ID>");
  process.exit(1);
}

const say = (m) => console.log(m);

/**
 * 사진이 아니라 **꾸밈 이미지**인 것들. 언론사 페이지에서 같이 딸려 옵니다.
 * 실측: 스포츠조선의 `bul_you2022.png`(불릿 아이콘)가 후보에 들어왔습니다.
 */
const NOT_PHOTO = /(bul_|btn_|icon|logo|sns_|banner|blank|spacer|pixel|1x1|watermark)/i;

async function floor(p, body) {
  const r = await fetch(FLOOR + p, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}

/** 진짜 사진인지 받아봅니다 — 이름만으로는 아이콘을 다 못 거릅니다. */
async function isRealPhoto(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.google.com/" } });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    // 20KB 미만은 아이콘이거나 아주 작은 섬네일입니다.
    return buf.length >= 20000;
  } catch { return false; }
}

(async () => {
  const pj = await floor("/api/posts/" + encodeURIComponent(postId));
  if (!pj?.post?.body) { console.error("원고를 못 찾았습니다:", postId); process.exit(1); }
  say(`원고: ${String(pj.post.title).slice(0, 40)}`);

  const c = await floor(`/api/photos/candidates?postId=${encodeURIComponent(postId)}`);
  const all = c?.photos || [];
  const article = all.filter((p) => p.kind === "article" && !NOT_PHOTO.test(String(p.url)));
  say(`후보: 기사 ${all.filter((p) => p.kind === "article").length}장 · 인스타 ${all.filter((p) => p.kind === "instagram").length}장`);
  say(`  → 기사 사진만 씁니다. 인스타 격자는 기사와 무관한 게 섞입니다.`);

  const keep = [];
  for (const p of article) {
    if (await isRealPhoto(p.url)) keep.push(p);
    if (keep.length >= 16) break;
  }
  say(`쓸 수 있는 사진 ${keep.length}장 (아이콘·작은 그림 ${article.length - keep.length}장 뺌)`);
  if (!keep.length) { console.error("쓸 사진이 없습니다. 임시저장을 하지 않습니다."); process.exit(1); }

  await floor("/api/photos/choose", { postId, photos: keep });

  say("네이버에 넣는 중…");
  await new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(REPO, "scripts", "naver-draft.js"), blogId, postId],
      { cwd: REPO, timeout: 600000, encoding: "utf8" }, () => resolve());
    child.stdout?.on("data", (d) => String(d).split(String.fromCharCode(10)).forEach((l) => {
      if (/올린 사진|들어간 것|저장 목록 확인|⚠|✔|실패/.test(l)) say("  " + l.trim());
    }));
  });
  say(`\n확인: https://blog.naver.com/${blogId}/postwrite`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
