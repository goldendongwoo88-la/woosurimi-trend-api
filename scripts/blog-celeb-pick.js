/**
 * 연예 원고 임시저장 — 기사 사진 + **눈으로 고른** 인스타 사진 — 2026-09-02
 *
 *   node scripts/blog-celeb-pick.js <블로그ID> <원고ID> <인스타폴더> <쓸번호> <계정>
 *   예) node scripts/blog-celeb-pick.js rlaehddn88 wmth5kttc D:/ig/mgy 07,10,11,12 aka_moons
 *
 * ⚠️ **인스타 사진은 사람이 열어보고 고른 것만 넣습니다.**
 * 계정은 본인 게 맞습니다(문근영 aka_moons · 천우희 thousand_wooo). 문제는 격자에
 * 얼굴 사진만 있는 게 아니라는 것입니다 — 실측으로 12장 중
 *   문근영: 쓸 수 있는 것 4장 (나머지는 정자교 사고 추모·음식·하늘·꽃·계정 안내)
 *   천우희: 쓸 수 있는 것 6장 (나머지는 기타리스트·강아지·불꽃놀이·도쿄 거리)
 * URL만 봐서는 무엇이 찍혔는지 알 수 없으므로 **자동으로 다 넣으면 안 됩니다.**
 * 그래서 이 스크립트는 번호를 직접 받습니다.
 *
 * 기사 사진은 그대로 자동으로 붙입니다(그 연예인 기사에 실린 사진이라 내용이 어긋나지 않습니다).
 *
 * ⚠️ 발행은 안 합니다. 임시저장까지입니다.
 */
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const REPO = path.join(__dirname, "..");
const FLOOR = process.env.BLOG_FLOOR_URL || "http://localhost:8485";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const NOT_PHOTO = /(bul_|btn_|icon|logo|sns_|banner|blank|spacer|pixel|1x1|watermark)/i;

const [blogId, postId, igDir, picks, handle] = process.argv.slice(2);
if (!blogId || !postId) {
  console.log("사용: node scripts/blog-celeb-pick.js <블로그ID> <원고ID> [인스타폴더] [쓸번호] [계정]");
  process.exit(1);
}
const say = (m) => console.log(m);

async function floor(p, body) {
  const r = await fetch(FLOOR + p, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  return r.json();
}
async function isRealPhoto(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Referer: "https://www.google.com/" } });
    if (!r.ok) return false;
    return Buffer.from(await r.arrayBuffer()).length >= 20000;
  } catch { return false; }
}

(async () => {
  const pj = await floor("/api/posts/" + encodeURIComponent(postId));
  if (!pj?.post?.body) { console.error("원고를 못 찾았습니다:", postId); process.exit(1); }
  say(`원고: ${String(pj.post.title).slice(0, 44)}`);

  const chosen = [];

  // 1) 기사 사진 — 자동
  const c = await floor(`/api/photos/candidates?postId=${encodeURIComponent(postId)}`);
  const article = (c?.photos || []).filter((p) => p.kind === "article" && !NOT_PHOTO.test(String(p.url)));
  for (const p of article) {
    if (await isRealPhoto(p.url)) chosen.push(p);
    if (chosen.length >= 10) break;
  }
  say(`기사 사진 ${chosen.length}장`);

  // 2) 인스타 사진 — 사람이 고른 번호만
  if (igDir && picks) {
    const nums = picks.split(",").map((s) => s.trim()).filter(Boolean);
    let n = 0;
    for (const num of nums) {
      const f = path.join(igDir, `${num}.jpg`);
      if (!fs.existsSync(f)) { say(`  ⚠ ${num}.jpg 없음`); continue; }
      chosen.push({
        file: f,
        kind: "instagram",
        credit: handle ? `인스타그램 @${handle}` : "인스타그램",
        link: handle ? `https://www.instagram.com/${handle}/` : "",
      });
      n++;
    }
    say(`인스타 사진 ${n}장 (제가 열어보고 고른 것만)`);
  }

  if (!chosen.length) { console.error("쓸 사진이 없습니다. 임시저장하지 않습니다."); process.exit(1); }
  say(`합계 ${chosen.length}장`);
  await floor("/api/photos/choose", { postId, photos: chosen });

  say("네이버에 넣는 중…");
  await new Promise((resolve) => {
    const child = execFile(process.execPath, [path.join(REPO, "scripts", "naver-draft.js"), blogId, postId],
      { cwd: REPO, timeout: 600000, encoding: "utf8" }, () => resolve());
    child.stdout?.on("data", (d) => String(d).split(String.fromCharCode(10)).forEach((l) => {
      if (/올린 사진|들어간 것|저장 목록 확인|⚠|✔|실패/.test(l)) say("  " + l.trim());
    }));
  });
  say(`확인: https://blog.naver.com/${blogId}/postwrite`);
})().catch((e) => { console.error("실패:", e.message); process.exit(1); });
