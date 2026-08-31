/**
 * 홈판 진단 리포트 — 블로그 글 주소 하나로 판매 가능한 진단서를 만든다.
 *
 * ⚠️ 왜 만들었나 (2026-08-31):
 *   크몽은 같은 상품 중복 등록을 금지합니다(판매중지·회원자격 정지·인기도 감점).
 *   전자책을 제목만 바꿔 두 번 올릴 수 없습니다.
 *   대신 **다른 카테고리의 다른 상품**을 하나 만들면 키워드를 합법적으로 둘 다 잡습니다.
 *   전자책(노하우·콘텐츠) + 진단 서비스(마케팅)는 중복이 아닙니다.
 *
 * ⚠️ 리포트를 사람이 손으로 쓰지 않습니다. 규칙으로 잽니다. AI 호출 0회 = 0원.
 *   의뢰 한 건당 몇 분이면 끝납니다. 그게 이 상품이 성립하는 이유입니다.
 *
 * ⚠️ 판정 기준은 실측값입니다(docs/홈판-벤치마킹-실측-2026-08-31.md).
 *   순위를 보장하지 않습니다. "잘 되는 블로그는 이렇게 쓴다"까지만 말합니다.
 *
 * 사용법: node scripts/homefeed-report.mjs <블로그글주소> <출력폴더> [--genre 뷰티|패션|가십]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fetchPost, analyzeStructure } = require('../src/blogFetch.js');

const args = process.argv.slice(2);
const [url, outDir] = args.filter((a) => !a.startsWith('--') && a !== args[args.indexOf('--genre') + 1]);
const gi = args.indexOf('--genre');
const genre = gi >= 0 && args[gi + 1] ? args[gi + 1] : '뷰티';
if (!url || !outDir) {
  console.error('사용법: node scripts/homefeed-report.mjs <글주소> <출력폴더> [--genre 뷰티|패션|가십]');
  process.exit(1);
}

// 갈래별 기준 — 전부 실측 중앙값
const BENCH = {
  뷰티: { paraLen: 16, imgGap: 101, intro: 48, colorPer1k: 0, boldPer1k: 2.4, qna: 48 },
  패션: { paraLen: 18, imgGap: 68, intro: 56, colorPer1k: 1.6, boldPer1k: 7.4, qna: 28 },
  가십: { paraLen: 24, imgGap: 100, intro: 72, colorPer1k: 3.5, boldPer1k: 10.9, qna: 45 },
};
const B = BENCH[genre] || BENCH['뷰티'];

const paras = (html) =>
  [...String(html || '').matchAll(/<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/[\s​]+/g, ' ').trim())
    .filter(Boolean);

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const post = await fetchPost(url);
  const html = post.bodyHtml || '';
  if (!html) {
    console.error('본문을 읽지 못했습니다. 전체공개 글 주소인지 확인해 주세요.');
    process.exit(1);
  }
  const st = analyzeStructure(html) || {};
  const P = paras(html);
  const lens = P.map((x) => x.length).sort((a, b) => a - b);
  const chars = P.reduce((s, x) => s + x.length, 0);

  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;
  const med = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const over45 = lens.length ? Math.round((lens.filter((x) => x > 45).length / lens.length) * 100) : 0;
  const imgGap = st.images ? Math.round(chars / st.images) : null;
  const introLen = P[0] ? P[0].length : 0;
  const bold = (html.match(/<(b|strong)[\s>]/gi) || []).length + (html.match(/font-weight:\s*(bold|[6-9]00)/gi) || []).length;
  const color = (html.match(/(?<!background-)color:\s*(?!inherit)/gi) || []).length;
  const per1k = (n) => (chars ? Math.round((n / chars) * 1000 * 10) / 10 : 0);
  const title = post.title || '';
  const hasCut = /\.\.\.|…|\.\./.test(title);
  const hasHide = /(여배우|연예인|그\s?배우|톱스타|이\s?배우)/.test(title);
  const qMark = /\?/.test(P.slice(1).join(' '));

  const items = [];
  const add = (name, ok, now, target, why) => items.push({ name, ok, now, target, why });

  add('문단 길이', avg <= 30, `평균 ${avg}자 (중앙 ${med}자)`, `${B.paraLen}자 안팎`,
    avg > 30
      ? '모바일 한 줄이 20자입니다. 지금 길이면 화면에서 벽으로 보여 홈판 유입이 첫 화면에서 이탈합니다. 문장 하나에 마침표 하나, 마침표에서 줄을 바꾸세요.'
      : '읽기 좋은 길이입니다. 유지하세요.');
  add('긴 문단 비율', over45 <= 10, `45자 초과 ${over45}%`, '10% 이하',
    over45 > 10
      ? '잘 되는 블로그는 이 값이 0~7%입니다. 긴 문단부터 찾아 자르면 가장 빨리 개선됩니다.'
      : '기준 안에 듭니다.');
  add('사진 간격', imgGap != null && imgGap <= B.imgGap * 1.4,
    imgGap == null ? '측정 불가' : `${imgGap}자마다 1장 (총 ${st.images}장)`, `${B.imgGap}자마다`,
    imgGap && imgGap > B.imgGap * 1.4
      ? '장수를 늘리라는 게 아니라 더 고르게 흩으라는 뜻입니다. 긴 글 덩어리에 사진을 넣으세요.'
      : '적절합니다.');
  add('도입부 길이', introLen > 0 && introLen <= 90, `첫 문단 ${introLen}자`, `${B.intro}자 안팎`,
    introLen > 90
      ? '홈판 미리보기에 보이는 건 첫 두세 줄뿐입니다. 답이 아니라 장면이나 질문으로 짧게 여세요.'
      : '적절합니다.');
  add('굵게 강조', per1k(bold) <= B.boldPer1k * 2.5, `1,000자당 ${per1k(bold)}회 (총 ${bold}회)`, `1,000자당 ${B.boldPer1k}회`,
    per1k(bold) > B.boldPer1k * 2.5
      ? '강조가 많으면 강조가 사라집니다. 결론·숫자·가격만 남기세요.'
      : '적절합니다.');
  add('글자색', per1k(color) <= Math.max(B.colorPer1k * 3, 6), `1,000자당 ${per1k(color)}회`, `1,000자당 ${B.colorPer1k}회`,
    per1k(color) > Math.max(B.colorPer1k * 3, 6)
      ? `${genre} 갈래 상위 블로그는 글자색을 사실상 쓰지 않습니다. 색은 결론·숫자·가격에만.`
      : '적절합니다.');
  add('제목 — 끊기', hasCut, hasCut ? "'..'로 끊음" : '없음', "앞 절 뒤 '..'",
    hasCut ? '좋습니다.' : "상위 제목의 55%가 앞 절을 '..'로 끊습니다. 뒷말을 감추는 자리를 만드세요.");
  add('제목 — 주어 감추기', hasHide, hasHide ? '감춤' : '이름 노출', "'여배우·연예인' 등",
    hasHide ? '좋습니다.' : '이름을 쓰면 아는 사람은 클릭할 이유가 없어집니다. 단서는 남기되 이름을 감춰보세요.');
  add('본문 질문', qMark, qMark ? '있음' : '없음', '2~3개',
    qMark ? '좋습니다.' : `짧은 질문 한 줄을 던지고 아래에서 답하세요. ${genre} 갈래 상위 ${B.qna}%가 씁니다.`);

  const pass = items.filter((i) => i.ok).length;
  const grade = pass >= 8 ? 'A' : pass >= 6 ? 'B' : pass >= 4 ? 'C' : 'D';
  const gColor = grade === 'A' ? '#1E7A4A' : grade === 'B' ? '#1F4E79' : grade === 'C' ? '#8A6D1F' : '#C0392B';

  const row = (i) =>
    `<tr class="${i.ok ? 'ok' : 'no'}"><td class="s">${i.ok ? '충족' : '개선'}</td><td class="n">${esc(i.name)}</td><td class="v">${esc(i.now)}</td><td class="t">${esc(i.target)}</td><td class="w">${esc(i.why)}</td></tr>`;

  const doc = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>홈판 진단 리포트</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#151B24;font-family:"Noto Sans KR",sans-serif;font-size:14px;line-height:1.7}
.p{max-width:820px;margin:0 auto;padding:38px 30px 60px}
h1{font-family:"Gothic A1",sans-serif;font-size:30px;font-weight:800;margin:0 0 6px;letter-spacing:-.03em}
.sub{color:#5A6B7A;margin:0 0 22px;font-size:13px;word-break:break-all}
.grade{display:flex;align-items:center;gap:18px;background:#F4F7F9;border:1px solid #D8DDE4;border-radius:4px;padding:20px 24px;margin-bottom:26px}
.g{font-family:"Gothic A1",sans-serif;font-size:48px;font-weight:800;line-height:1;color:${gColor}}
.gt{font-size:15px}.gt b{font-size:17px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#EDF0F4;text-align:left;padding:9px 11px;border-bottom:1px solid #D8DDE4;font-size:11px;letter-spacing:.06em;color:#5A6B7A}
td{padding:11px;border-bottom:1px solid #E9EDF2;vertical-align:top}
td.s{font-weight:700;white-space:nowrap;width:52px}
tr.ok td.s{color:#1E7A4A}tr.no td.s{color:#C0392B}
td.n{font-weight:700;white-space:nowrap}td.v,td.t{white-space:nowrap;font-variant-numeric:tabular-nums}
td.t{color:#5A6B7A}td.w{color:#3A4654;line-height:1.6}
.note{margin-top:26px;background:#F8F9FB;border:1px solid #E9EDF2;border-radius:4px;padding:18px 20px;font-size:12.5px;color:#5A6B7A;line-height:1.8}
.note b{color:#151B24}
@page{size:A4;margin:14mm}@media print{body{font-size:11pt}.p{padding:0;max-width:none}tr{page-break-inside:avoid}}
</style></head><body><div class="p">
<h1>홈판 진단 리포트</h1>
<p class="sub">${esc(title)}<br>${esc(url)} · ${esc(genre)} 갈래 기준</p>
<div class="grade"><div class="g">${grade}</div><div class="gt">9개 항목 중 <b>${pass}개</b> 충족<br><span style="color:#5A6B7A">개선 항목 ${9 - pass}개 — 아래 표에서 '개선'을 위에서부터 처리하세요.</span></div></div>
<table><thead><tr><th>판정</th><th>항목</th><th>현재</th><th>기준</th><th>왜 · 어떻게</th></tr></thead>
<tbody>${items.map(row).join('')}</tbody></table>
<div class="note">
<b>이 기준은 어디서 나왔나</b><br>
상위 노출 블로거의 글을 직접 열어 센 값입니다(본문 130편·제목 1,100개, 별도 표본 72편으로 교차검증). 갈래별 중앙값을 기준으로 씁니다.<br><br>
<b>말할 수 있는 것과 없는 것</b><br>
네이버는 홈판 노출 기준을 공개하지 않습니다. 그래서 이 리포트가 말하는 건 <b>"잘 되는 블로그는 이렇게 쓴다"</b>까지입니다. 인과가 아니라 상관관계이며, <b>순위를 보장하지 않습니다.</b><br><br>
조회수는 측정할 수 없습니다(네이버가 남의 글 조회수를 제공하지 않음). 태그 수도 모바일 페이지에 실리지 않아 진단에서 제외했습니다.
</div>
</div></body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const safe = (title || 'report').replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'report';
  const file = path.join(outDir, `홈판진단_${safe}.html`);
  fs.writeFileSync(file, doc, 'utf8');
  console.log(`등급 ${grade} · ${pass}/9 충족`);
  items.filter((i) => !i.ok).forEach((i) => console.log(`  개선 · ${i.name}: ${i.now} → ${i.target}`));
  console.log(`\n${file}`);
})().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
