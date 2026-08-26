/**
 * 이미 쓴 책에서 지어낸 약어 풀이만 고칩니다.
 *
 * ⚠️ 멀쩡한 장까지 다시 쓸 이유가 없습니다. 장마다 40~80초씩 걸리는데
 * 여덟 장을 다시 쓰면 10분이고, 게다가 잘 나온 장이 더 나빠질 수도 있습니다.
 * 틀린 장만 골라 다시 씁니다.
 *
 * 실제로 잡힌 것:
 *   1권: "D.I.A. 기준입니다. Depth(깊이), Image(시각 자료), Action(행동 유도)의 약자"
 *   2권: "AEO 시대가 왔습니다. AI Engine Optimization."
 * 둘 다 지어낸 겁니다. D.I.A.는 Deep Intent Analysis, AEO는 Answer Engine Optimization입니다.
 */

require("dotenv").config({ override: true });
const fs = require("fs");
const path = require("path");
const ebook = require("../src/ebook");

const BOOKS = [
  { draft: "ebook-draft.json",  out: "네이버-블로그-상위노출-2026.html", material: "make-ebook.js" },
  { draft: "ebook2-draft.json", out: "AI부업-250개-분석.html",         material: "make-ebook2.js" },
];

/** 만들 때 쓴 재료를 스크립트에서 그대로 뽑아옵니다. 두 벌로 관리하면 어긋납니다. */
function materialOf(scriptFile) {
  const src = fs.readFileSync(path.join(__dirname, scriptFile), "utf8");
  const m = src.match(/const MATERIAL = `([\s\S]*?)`\.trim\(\);/);
  if (!m) throw new Error(`${scriptFile}에서 재료를 찾지 못했습니다.`);
  return m[1].trim();
}

async function main() {
  for (const b of BOOKS) {
    const draftPath = path.join(__dirname, "..", b.draft);
    if (!fs.existsSync(draftPath)) { console.log(`${b.draft} 없음 — 건너뜁니다`); continue; }

    const { book, parts } = JSON.parse(fs.readFileSync(draftPath, "utf8"));
    // ⚠️ 재료에 약어 정답을 붙여서 다시 씁니다. 이게 없으면 또 지어냅니다.
    const material = materialOf(b.material) + "\n\n" + ebook.TERM_NOTE;

    console.log(`\n『${book.title}』`);

    const targets = [];
    const introBad = ebook.checkTerms(parts.intro || "");
    if (introBad.length) targets.push({ kind: "intro", bad: introBad });
    parts.chapters.forEach((c, i) => {
      const bad = ebook.checkTerms(c || "");
      if (bad.length) targets.push({ kind: "chapter", index: i, bad });
    });

    if (!targets.length) { console.log("  고칠 것 없음"); continue; }

    for (const t of targets) {
      const label = t.kind === "intro" ? "머리말" : `${t.index + 1}장 「${book.chapters[t.index].title}」`;
      console.log(`  ${label}`);
      t.bad.forEach((x) => console.log(`    ⚠ ${x.abbr} → "${x.wrote}" (맞는 건 ${x.should})`));

      const t0 = Date.now();
      try {
        let text = t.kind === "intro"
          ? await ebook.writeIntro(book, { material })
          : await ebook.writeChapter(book, t.index, { material, words: 1900 });

        // 다시 쓴 글에도 숫자 검사를 겁니다.
        const suspects = ebook.checkNumbers(text, material);
        if (suspects.length) {
          const r = await ebook.stripUnsourcedNumbers(text, suspects, material);
          text = r.text;
        }

        const still = ebook.checkTerms(text);
        if (still.length) {
          // ⚠️ 두 번 시도해서도 안 고쳐지면 억지로 밀어붙이지 않습니다.
          // 원래 것을 두고 사람이 보게 남깁니다. 조용히 틀린 채로 두는 것보다 낫습니다.
          console.log(`    ⚠ 다시 써도 남았습니다: ${still.map((x) => x.abbr).join(", ")} — 원래 글 유지`);
          continue;
        }

        if (t.kind === "intro") parts.intro = text;
        else parts.chapters[t.index] = text;
        console.log(`    고침 (${((Date.now() - t0) / 1000).toFixed(0)}초 · ${text.replace(/\s/g, "").length}자)`);
      } catch (e) {
        console.log(`    실패 — ${e.message}`);
      }
    }

    fs.writeFileSync(draftPath, JSON.stringify({ book, parts }, null, 1), "utf8");
    const html = ebook.toHtml(book, parts);
    const outPath = path.join(__dirname, "..", "public", "downloads", b.out);
    fs.writeFileSync(outPath, html, "utf8");

    const all = parts.intro + parts.chapters.join("");
    const left = ebook.checkTerms(all);
    console.log(`  다시 만듦: ${b.out}`);
    console.log(`  ${all.replace(/\s/g, "").length.toLocaleString()}자 · 약어 문제 ${left.length}건`);
  }
}

main().catch((e) => { console.error("실패:", e.message); process.exit(1); });
