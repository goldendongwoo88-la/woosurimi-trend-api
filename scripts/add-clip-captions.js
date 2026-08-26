/**
 * 이미 만든 릴스에 네이버 클립용 문구를 붙입니다.
 *
 * ⚠️ 인스타 캡션을 클립에 그대로 올리면 손해입니다.
 * 클립은 네이버 검색과 연결돼서 문구에 검색어가 들어가야 하는데,
 * 인스타용은 감성 문장 위주라 검색에 안 걸립니다.
 * 같은 영상이라도 문구는 따로 있어야 합니다.
 */

require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const clip = require("../src/clipCaption");

const DIR = path.join(__dirname, "..", "public", "downloads", "reels");
const PRODUCT = process.argv[2] || "사주 총정리 리포트";

async function main() {
  if (!fs.existsSync(DIR)) { console.log("릴스 폴더가 없습니다."); return; }

  const reels = fs.readdirSync(DIR).filter((f) => f.endsWith(".mp4")).sort();
  console.log(`${reels.length}편에 클립 문구를 붙입니다.\n`);

  for (const mp4 of reels) {
    const base = mp4.replace(/\.mp4$/, "");
    const out = path.join(DIR, `${base}_클립용.txt`);
    if (fs.existsSync(out)) { console.log(`  건너뜀 (이미 있음) ${base}`); continue; }

    // 파일 이름과 인스타용 문구에서 재료를 뽑습니다.
    // 01_토끼띠_빠지기 쉬운 함정 → 주제
    const topic = base.replace(/^\d+_/, "").replace(/_/g, " ");
    let lines = [];
    const igFile = path.join(DIR, `${base}.txt`);
    if (fs.existsSync(igFile)) {
      lines = fs.readFileSync(igFile, "utf8")
        .split("\n").filter((l) => l.startsWith("· ")).map((l) => l.slice(2).trim());
    }

    try {
      const c = await clip.make({ topic, lines, product: PRODUCT });
      const text =
        `[네이버 클립용 — 인스타와 다릅니다]\n` +
        `${"─".repeat(46)}\n\n` +
        `${c.full}\n\n` +
        `${"─".repeat(46)}\n` +
        `노리는 검색어: ${c.searchWords.join(" / ")}\n\n` +
        `올릴 때 할 것\n` +
        c.todo.map((t, i) =>
          `${i + 1}. ${t.what}\n   ${t.how}` + (t.note ? `\n   → ${t.note}` : "")
        ).join("\n\n") + "\n";
      fs.writeFileSync(out, text, "utf8");
      console.log(`  ${base}\n     "${c.title}"`);
    } catch (e) {
      console.log(`  실패 ${base} — ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`\n끝. ${DIR} 안에 _클립용.txt 가 함께 들어 있습니다.`);
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
