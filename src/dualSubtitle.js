// 자막 이원화 — 원본 대사와 내 나레이션을 눈에 보이게 갈라놓는다.
//
// 왜 갈라야 하는가 (2026-09-02, 유튜브 36편 자막 분석)
//   드라마쇼츠로 월 900~1,000만원을 내는 채널 운영자가 공통으로 말한 것:
//   저작권 경고를 받고 유튜브에 항소할 때, "이 부분은 원본이 아니라 내가 쓴 해석이다"를
//   증명할 방법이 자막 스타일밖에 없다. 두 자막을 같은 폰트·같은 색으로 쓰면
//   나중에 갈라낼 방법이 없다. 그래서 처음부터 다르게 박아야 한다.
//
//   이건 미관 문제가 아니라 채널이 살아남느냐의 문제다. 경고 3회면 채널이 삭제된다.
//
// 기존 assSubtitle.js(buildAss)를 그대로 쓴다. 여기서는 스타일 두 벌을 정의하고
// 큐를 종류별로 나눠 넣는 일만 한다.

const fs = require("fs");
const path = require("path");
const { buildAss, assTime } = require("./assSubtitle");

// ── 스타일 두 벌 ──
// 설치 폰트 실측(2026-09-02): Noto Sans KR(Black 포함) · Pretendard · Malgun Gothic 사용 가능.
// 항소 증빙이 목적이므로 "굵기만 다른 것"으로는 부족하다. 폰트 패밀리와 색을 함께 바꾼다.
const PRESETS = {
  // 원본에서 온 대사 — 눈에 띄지 않게, 기본값처럼
  원본: {
    FontName: "Malgun Gothic",
    FontSize: 12,
    PrimaryColour: "&H00FFFFFF", // 흰색
    OutlineColour: "&H00000000",
    Outline: 1.6,
    Shadow: 0,
    Bold: 0,
    Alignment: 2,               // 하단 중앙
    MarginV: 22,
  },
  // 내가 쓴 해석 — 확실히 다르게
  해설: {
    FontName: "Noto Sans KR Black",
    FontSize: 13,
    PrimaryColour: "&H0000FFFF", // 노란색 (ASS는 &HAABBGGRR)
    OutlineColour: "&H00000000",
    Outline: 2.4,
    Shadow: 1,
    Bold: 1,
    Alignment: 2,
    MarginV: 22,
  },
};

const styleObjToForce = (o) =>
  Object.entries(o).map(([k, v]) => `${k}=${v}`).join(",");

/**
 * 큐 배열 -> .ass 문자열
 * cue = { start:초, end:초, text, kind:'원본'|'해설' }
 */
function buildDualAss({ width = 1080, height = 1920, cues = [], presets = PRESETS }) {
  const styles = Object.entries(presets).map(([name, o]) => ({
    name,
    forceStyle: styleObjToForce(o),
  }));

  const events = cues
    .filter((c) => c && c.text && Number.isFinite(c.start) && Number.isFinite(c.end))
    .sort((a, b) => a.start - b.start)
    .map((c) => ({
      start: c.start,
      end: c.end,
      style: presets[c.kind] ? c.kind : "원본",
      text: c.text,
    }));

  return buildAss({ width, height, styles, events });
}

/**
 * 재해석 비율 — 전체 자막 시간 중 내 해설이 차지하는 비중.
 * 유튜브 수익창출 기준("실질적 편집")을 넘기려면 원본 대사만으로 채워선 안 된다.
 */
function narrationRatio(cues) {
  const dur = (k) =>
    cues.filter((c) => c.kind === k).reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  const mine = dur("해설");
  const src = dur("원본");
  const total = mine + src;
  if (!total) return { ratio: 0, mine: 0, src: 0, verdict: "자막 없음" };
  const ratio = mine / total;
  let verdict;
  if (ratio >= 0.5) verdict = "✅ 충분 — 해설이 절반을 넘습니다";
  else if (ratio >= 0.3) verdict = "🟡 최소선 — 해설을 더 넣는 편이 안전합니다";
  else verdict = "🔴 부족 — 원본 대사가 대부분입니다. 재사용 콘텐츠로 분류될 수 있습니다";
  return { ratio, mine: +mine.toFixed(1), src: +src.toFixed(1), verdict };
}

/**
 * 손으로 편집할 때 쓰는 규격표 (캡컷·브루·프리미어 공통).
 * 자동 파이프라인을 안 타고 사장님이 직접 얹을 때 이 값을 그대로 넣으면 된다.
 */
function 편집기규격() {
  return [
    "# 자막 이원화 규격 — 캡컷 / 브루 / 프리미어 공통",
    "",
    "두 자막을 **다른 폰트 + 다른 색**으로 갈라야 저작권 항소 때 창작 부분을 짚을 수 있습니다.",
    "캡컷은 아래 값을 한 번 넣고 **트랙 스타일로 저장**해두면 다음부터 클릭 한 번입니다.",
    "",
    "| 항목 | 원본 대사 | 내 나레이션 (해설) |",
    "|---|---|---|",
    "| 폰트 | Malgun Gothic | **Noto Sans KR Black** |",
    "| 굵기 | 보통 | **굵게** |",
    "| 글자색 | 흰색 `#FFFFFF` | **노란색 `#FFFF00`** |",
    "| 외곽선 | 검정 1.6 | **검정 2.4** |",
    "| 그림자 | 없음 | 1 |",
    "| 크기 | 12 | 13 |",
    "| 위치 | 하단 중앙 | 하단 중앙 |",
    "",
    "**캡컷 트랙 스타일 저장법**: 자막 클립 하나에 위 값을 적용 → 우측 패널에서 스타일 저장 →",
    "이름을 `원본` / `해설`로. 다음 영상부터는 자막을 넣고 저장한 스타일을 누르기만 하면 됩니다.",
    "폰트·색·위치·굵기를 매번 맞추는 공정이 사라집니다.",
    "",
    "⚠️ 굵기만 바꾸는 것으로는 부족합니다. **폰트 패밀리와 색을 같이** 바꿔야 나중에 구분됩니다.",
  ].join("\n");
}

// ── CLI ──
// node src/dualSubtitle.js cues.json out.ass
// node src/dualSubtitle.js --규격
function main() {
  const args = process.argv.slice(2);

  if (args.includes("--규격")) {
    console.log(편집기규격());
    return;
  }

  const [inPath, outPath] = args;
  if (!inPath) {
    console.log(`사용법:
  node src/dualSubtitle.js <큐JSON> [출력.ass]   자막 파일 생성
  node src/dualSubtitle.js --규격                 편집기 규격표 출력

큐 JSON 형식:
  [{ "start": 0.0, "end": 2.4, "text": "원본 대사입니다", "kind": "원본" },
   { "start": 2.4, "end": 5.0, "text": "여기서부터가 제 해석입니다", "kind": "해설" }]`);
    return;
  }

  const cues = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const ass = buildDualAss({ cues });
  const out = outPath || inPath.replace(/\.json$/i, "") + ".ass";
  fs.writeFileSync(out, ass, "utf8");

  const r = narrationRatio(cues);
  console.log(`자막 생성: ${out}`);
  console.log(`큐 ${cues.length}개 · 원본 ${r.src}초 / 해설 ${r.mine}초`);
  console.log(`재해석 비율 ${(r.ratio * 100).toFixed(0)}% — ${r.verdict}`);
  console.log(`\n영상에 굽기:\n  ffmpeg -i 원본.mp4 -vf "ass=${path.basename(out)}" -c:a copy 완성.mp4`);
}

if (require.main === module) main();

module.exports = { buildDualAss, narrationRatio, 편집기규격, PRESETS };
