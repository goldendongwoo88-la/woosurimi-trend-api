/**
 * 크몽 등록 자산 일괄 생성기 — 붙여넣기만 하면 되게 만든다.
 *
 * ⚠️ 등록 자체는 자동화하지 않습니다. 못 하는 게 아니라 안 합니다.
 *   크몽은 자동 등록·크롤링을 약관으로 막고 있고, 계정 하나가 전자책·템플릿·
 *   상세페이지 세 라인의 공통 관문입니다. 중복 등록을 피하자고 해놓고 봇으로
 *   계정을 날리면 앞뒤가 안 맞습니다. 로그인·본인인증도 사람만 할 수 있습니다.
 *
 * ⚠️ 그래서 여기서는 **손으로 만들면 오래 걸리는 것**만 만듭니다.
 *   크몽 요구 규격(2026-09 기준 공개 가이드):
 *     썸네일        504 × 648 px
 *     상세 이미지    가로 650 px, 세로 3000 px 이하
 *     검색 키워드    5개까지
 *     상세 이미지에 목차와 본문 맛보기가 들어가야 하고,
 *     글자만 있으면 안 되고 그림·사진이 있어야 함
 *
 * ⚠️ AI 호출 0회 = 0원. 그림은 CSS로 그립니다(막대그래프 = 이 책의 핵심 근거).
 *
 * 사용법: node scripts/kmong-listing-kit.mjs <출력폴더>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const outDir = process.argv[2];
if (!outDir) { console.error('사용법: node scripts/kmong-listing-kit.mjs <출력폴더>'); process.exit(1); }

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;700;800;900&family=Noto+Sans+KR:wght@400;500;700&display=swap">';

// ── 썸네일 504×648 ───────────────────────────────────────────
// 그림 요소로 막대그래프를 넣습니다. 이 책의 근거이자, 규격이 요구하는 '그림'입니다.
function thumb({ eyebrow, title, sub, badge, accent }) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:504px;height:648px;font-family:"Noto Sans KR",sans-serif;background:#12181F;color:#fff;
  display:flex;flex-direction:column;overflow:hidden}
.top{padding:40px 36px 0}
.eyebrow{font-family:"Gothic A1";font-size:15px;font-weight:700;letter-spacing:.16em;color:${accent}}
h1{font-family:"Gothic A1";font-size:44px;font-weight:900;line-height:1.18;letter-spacing:-.035em;margin:16px 0 0}
.sub{font-size:16px;color:#9AAAB8;margin-top:14px;line-height:1.6}
.chart{margin:34px 36px auto;padding:22px 0 0;border-top:1px solid #26313C}
.clab{font-size:13px;color:#9AAAB8;margin-bottom:9px}
.bar{display:flex;align-items:center;gap:11px;margin-bottom:11px}
.bname{font-size:13px;width:74px;color:#C7D2DC;flex:none}
.btrack{flex:1;height:30px;background:#1E2731;border-radius:3px;overflow:hidden;display:block}
.bfill{display:block;height:100%;border-radius:3px}
.bval{font-family:"Gothic A1";font-size:17px;font-weight:800;width:52px;text-align:right;flex:none}
.badge{background:${accent};color:#12181F;font-family:"Gothic A1";font-weight:800;font-size:17px;
  padding:15px 36px;text-align:center;letter-spacing:-.02em}
</style></head><body>
<div class="top">
  <div class="eyebrow">${eyebrow}</div>
  <h1>${title}</h1>
  <p class="sub">${sub}</p>
</div>
<div class="chart">
  <div class="clab">홈판 상위 블로거 vs 일반 블로그 — 문단 길이</div>
  <div class="bar"><span class="bname">상위 블로거</span><span class="btrack"><span class="bfill" style="width:33%;background:${accent}"></span></span><span class="bval" style="color:${accent}">16자</span></div>
  <div class="bar"><span class="bname">일반 블로그</span><span class="btrack"><span class="bfill" style="width:100%;background:#E4695C"></span></span><span class="bval" style="color:#E4695C">48자</span></div>
</div>
<div class="badge">${badge}</div>
</body></html>`;
}

// ── 상세 이미지 650 × 3000 이하 ──────────────────────────────
function detail({ title, lead, toc, points, closing, accent }) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:650px;font-family:"Noto Sans KR",sans-serif;background:#fff;color:#12181F;font-size:15px;line-height:1.75}
.s{padding:34px 40px;border-bottom:1px solid #E9EDF2}
h2{font-family:"Gothic A1";font-size:25px;font-weight:800;letter-spacing:-.03em;margin-bottom:14px;color:${accent}}
.hero{background:#12181F;color:#fff;padding:44px 40px}
.hero h1{font-family:"Gothic A1";font-size:34px;font-weight:900;line-height:1.25;letter-spacing:-.03em}
.hero p{color:#9AAAB8;margin-top:14px;font-size:16px}
.chart{background:#F4F7F9;border:1px solid #D8DDE4;border-radius:5px;padding:22px 24px;margin-top:16px}
.bar{display:flex;align-items:center;gap:11px;margin-bottom:10px}
.bn{font-size:13px;width:88px;color:#5A6B7A;flex:none}
.bt{flex:1;height:26px;background:#E4E9EE;border-radius:3px;overflow:hidden;display:block}
.bf{display:block;height:100%}
.bv{font-family:"Gothic A1";font-size:16px;font-weight:800;width:48px;text-align:right;flex:none}
ol,ul{margin:0;padding-left:22px}
li{margin-bottom:8px;color:#3A4654}
.pt{border-left:3px solid ${accent};padding:4px 0 4px 15px;margin-bottom:16px}
.pt b{display:block;font-family:"Gothic A1";font-size:17px;font-weight:800;margin-bottom:3px}
.pt span{color:#3A4654;font-size:14.5px}
.note{background:#F8F9FB;border:1px solid #E9EDF2;border-radius:5px;padding:18px 20px;font-size:13.5px;color:#5A6B7A;line-height:1.8}
.note b{color:#12181F}
</style></head><body>
<div class="hero"><h1>${title}</h1><p>${lead}</p></div>
<div class="s"><h2>숫자로 보면 이렇습니다</h2>
  <div class="chart">
    <div class="bar"><span class="bn">상위 블로거</span><span class="bt"><span class="bf" style="width:33%;background:${accent}"></span></span><span class="bv" style="color:${accent}">16자</span></div>
    <div class="bar"><span class="bn">일반 블로그</span><span class="bt"><span class="bf" style="width:100%;background:#C0392B"></span></span><span class="bv" style="color:#C0392B">48자</span></div>
    <div class="bar"><span class="bn">가장 긴 문단</span><span class="bt"><span class="bf" style="width:22%;background:${accent}"></span></span><span class="bv" style="color:${accent}">32자</span></div>
    <div class="bar"><span class="bn">〃 일반</span><span class="bt"><span class="bf" style="width:100%;background:#C0392B"></span></span><span class="bv" style="color:#C0392B">143자</span></div>
  </div>
  <p style="margin-top:14px;color:#3A4654;font-size:14.5px">모바일 한 줄이 20자입니다. 48자면 세 줄, 143자면 일곱 줄짜리 벽이 됩니다.</p>
</div>
<div class="s"><h2>목차</h2><ol>${toc.map((t) => `<li>${t}</li>`).join('')}</ol></div>
<div class="s"><h2>이런 것을 다룹니다</h2>${points.map((p) => `<div class="pt"><b>${p.t}</b><span>${p.d}</span></div>`).join('')}</div>
<div class="s"><h2>먼저 말씀드릴 것</h2><div class="note">${closing}</div></div>
</body></html>`;
}

// ── 상품 정의 ────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: 'A_전자책',
    accent: '#4FBFA3',
    thumb: {
      eyebrow: '실측 데이터', accent: '#4FBFA3', badge: '상위 블로거 72편 실측',
      title: '네이버 홈판<br>진입 공식',
      sub: '홈피드에 뜨는 글은 무엇이 다른가',
    },
    detail: {
      accent: '#1E7A4A',
      title: '네이버 홈판 진입 공식',
      lead: '감으로 쓴 조언이 아닙니다. 상위 블로거의 글을 직접 열어 센 숫자입니다.',
      toc: ['검색과 홈판은 다른 문입니다', '어떻게 쟀는지, 그리고 무엇을 못 쟀는지',
        '가장 크게 갈린 하나 — 문단', '제목 — 후킹을 어디에 거는가',
        '강조 — 많이 칠할수록 안 보입니다', '도입부와 사진 — 첫 세 줄에서 결정됩니다',
        '체류 — Q&A가 아니라 질문의 리듬', '썸네일 — 손톱만 한 크기에서 읽히는 것',
        '갈래마다 숫자가 다릅니다 (뷰티·패션·가십)', '제목 서른 개를 만들어 봅니다',
        '자가진단 — 내 글은 지금 몇 점인가', '오늘 글부터 바꾸는 순서'],
      points: [
        { t: '"체류시간을 늘리세요"는 실행할 수 없습니다', d: '살을 빼라는 말과 같습니다. 이 책은 "문단을 20자로 끊으세요"로 바꿔서 말합니다. 오늘 저녁에 할 수 있는 일입니다.' },
        { t: '갈래마다 정답이 다릅니다', d: '패션은 880자에 사진 68자마다, 뷰티는 도입부 48자에 글자색 0회. 자기 갈래 숫자를 봐야 합니다.' },
        { t: '2장은 통째로 "못 잰 것"입니다', d: '조회수도 태그도 못 쟀습니다. 못 잰 것을 밝히는 이유는 하나입니다. 그래야 잰 것을 믿을 수 있습니다.' },
      ],
      closing: '<b>이 책은 순위를 보장하지 않습니다.</b> 네이버는 홈판 기준을 공개한 적이 없습니다. 이 책이 말할 수 있는 건 "잘 되는 블로그는 이렇게 씁니다"까지입니다. 인과가 아니라 상관관계입니다.<br><br>다만 잘 되는 쪽이 예외 없이 하고 안 되는 쪽이 안 하는 것이라면, 따라 해볼 값어치는 있다고 봅니다.',
    },
    form: {
      제목: '네이버 홈판 진입 공식 | 상위 블로거 72편을 직접 세어 만든 전자책',
      카테고리: '노하우·콘텐츠 → 전자책 → 마케팅·SNS',
      검색키워드: ['홈판', '홈피드', '블로그홈판', '네이버블로그', '블로그전자책'],
      가격: '런칭 39,000원 (리뷰 10개 후 59,000원)',
      첫문단: '홈피드(홈판) 노출이 안 되는 이유를 숫자로 짚습니다. 상위 노출 블로거 7곳의 최근 글 56편, 별도로 모은 본문 130편과 제목 1,100개를 직접 세어 만들었습니다.',
    },
  },
  {
    id: 'B_진단서비스',
    accent: '#6FA8DC',
    thumb: {
      eyebrow: '9개 항목 진단', accent: '#6FA8DC', badge: '내 글 등급 바로 확인',
      title: '네이버 홈피드<br>노출 진단',
      sub: '내 글이 왜 안 뜨는지 짚어드립니다',
    },
    detail: {
      accent: '#1F4E79',
      title: '네이버 홈피드 노출 진단',
      lead: '글 주소 하나만 주시면 9개 항목으로 진단해 드립니다.',
      toc: ['문단 길이 — 상위 블로거 대비', '45자 넘는 문단 비율', '사진 간격',
        '도입부 길이', '굵게 강조 밀도', '글자색 밀도',
        "제목 — 앞 절 '..' 끊기", '제목 — 주어 감추기', '본문 질문 유무'],
      points: [
        { t: '등급과 개선 순서를 드립니다', d: '9개 항목 중 몇 개가 기준에 드는지 A~D 등급으로 보여드리고, 무엇부터 고쳐야 하는지 순서대로 정리해 드립니다.' },
        { t: '갈래별 기준으로 봅니다', d: '뷰티·패션·가십은 기준 숫자가 다릅니다. 패션 글을 가십 기준으로 재면 틀립니다. 갈래를 골라 진단합니다.' },
        { t: '실측값과 나란히 비교합니다', d: '"길다"가 아니라 "평균 38자, 기준 16자"로 알려드립니다. 무엇을 얼마나 고쳐야 하는지가 숫자로 나옵니다.' },
      ],
      closing: '<b>순위를 보장하지 않습니다.</b> 네이버는 홈판 기준을 공개하지 않습니다. 이 진단이 말하는 건 "잘 되는 블로그는 이렇게 쓴다"까지이며, 인과가 아니라 상관관계입니다.<br><br>조회수는 측정할 수 없습니다. 네이버가 남의 글 조회수를 제공하지 않기 때문입니다. 태그 수도 모바일 페이지에 실리지 않아 진단에서 제외했습니다.',
    },
    form: {
      제목: '네이버 홈피드 노출 진단 | 내 글이 왜 안 뜨는지 9개 항목으로 짚어드립니다',
      카테고리: '마케팅 → 블로그 마케팅 (또는 SNS 마케팅)',
      검색키워드: ['홈피드', '홈판', '홈판노출', '블로그진단', '블로그컨설팅'],
      가격: '1편 19,000원 / 3편 49,000원 (리뷰 10개 후 29,000 / 69,000)',
      첫문단: '홈판(홈피드)에 뜨는 글과 내 글이 무엇이 다른지, 상위 블로거 실측값과 나란히 비교해 드립니다. 글 주소만 주시면 됩니다.',
    },
  },
];

// ── 실행 ─────────────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const shot = (html, out, w, h) => new Promise((res) => {
  const tmp = out.replace(/\.png$/, '.tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');
  if (!CHROME) { console.log('  ⚠ 크롬 없음 — HTML만 남깁니다'); return res(); }
  execFile(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${w},${h}`, `--screenshot=${out}`, '--virtual-time-budget=8000',
    `file:///${tmp.replace(/\\/g, '/')}`], () => { fs.rmSync(tmp, { force: true }); res(); });
});

const lines = [];
for (const p of PRODUCTS) {
  const dir = path.join(outDir, p.id);
  fs.mkdirSync(dir, { recursive: true });
  await shot(thumb(p.thumb), path.join(dir, '01_썸네일_504x648.png'), 504, 648);
  // 목차·설명 개수로 높이를 추정합니다(크몽 상한 3000px).
  const d = p.detail;
  const est = 300 + 330 + 90 + d.toc.length * 30 + 80 +
    d.points.reduce((n, x) => n + 74 + Math.ceil(x.d.length / 42) * 25, 0) +
    90 + Math.ceil(d.closing.replace(/<[^>]+>/g, '').length / 44) * 25 +
    (d.closing.match(/<br>/g) || []).length * 22 + 140;
  const h = Math.min(3000, Math.max(1200, Math.round(est)));
  await shot(detail(d), path.join(dir, '02_상세이미지_650.png'), 650, h);
  console.log(`${p.id} — 썸네일·상세이미지 생성`);

  const f = p.form;
  lines.push(`
${'='.repeat(66)}
${p.id}
${'='.repeat(66)}

[서비스 제목]  ※ 그대로 복사
${f.제목}

[카테고리]
${f.카테고리}

[검색 키워드]  ※ 크몽은 5개까지. 순서대로 입력
${f.검색키워드.map((k, i) => `${i + 1}. ${k}`).join('\n')}

[가격]
${f.가격}

[설명 첫 문단]  ※ 검색 색인에 들어가므로 키워드가 자연스럽게 포함되어야 함
${f.첫문단}

[이미지]
01_썸네일_504x648.png   → 대표 이미지
02_상세이미지_650.png    → 상세 설명 이미지
`);
}

fs.writeFileSync(path.join(outDir, '00_등록폼_붙여넣기.txt'),
  `크몽 등록 폼 — 붙여넣기용
생성: 코드로 자동 생성 (AI 호출 0회 · 원가 0원)

⚠️ 등록 자체는 사람이 해야 합니다.
   크몽은 자동 등록을 약관으로 막고 있고, 로그인·본인인증은 대신할 수 없습니다.
   아래 내용을 크몽 등록 화면에 붙여넣기만 하시면 됩니다.

⚠️ 규격 근거 (크몽 공개 가이드, 2026-09 확인)
   썸네일 504×648px / 상세이미지 가로 650px·세로 3000px 이하 / 검색 키워드 5개
   상세 이미지에는 목차와 본문 맛보기가 있어야 하고, 글자만 있으면 안 됩니다
   (그래서 막대그래프를 넣었습니다).

⚠️ 올리는 순서 — B를 먼저 올리세요.
   단가가 낮아 첫 구매·첫 리뷰가 빨리 붙습니다.
   리뷰 3개가 생긴 뒤 A(전자책)를 올리면 훨씬 잘 팔립니다.

⚠️ 제목에 "상위노출"을 쓰지 마세요.
   네이버 검색량 실측: 홈판 1,360 / 홈피드 230 / 블로그상위노출 10.
   크몽 검색에서도 "블로그 상위노출"은 0건입니다.
${lines.join('')}
${'='.repeat(66)}
[등록 전 마지막 확인]
${'='.repeat(66)}
□ 두 상품은 카테고리가 다릅니다. 중복 등록이 아닙니다.
   (크몽은 같은 상품 중복 등록 시 판매중지·회원자격 정지·인기도 감점)
□ 보장 표현("무조건", "반드시 1위")은 넣지 마세요. 반려·제재 사유입니다.
□ 방문자 수 캡처를 넣으면 강력합니다. 단 실제 화면이어야 합니다.
□ 지속 판매는 사업소득입니다. 사업자등록·세금 문제는 세무 상담을 받으세요.
□ 전자책은 열람 후 환불 분쟁이 잦습니다. 환불 정책을 상세페이지에 미리 적으세요.
`, 'utf8');

console.log(`\n완료 → ${outDir}`);
console.log('00_등록폼_붙여넣기.txt 에 제목·키워드·가격·설명이 전부 들어 있습니다.');
