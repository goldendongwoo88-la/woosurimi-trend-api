/**
 * 네이버 홈판 대량 수집 — 2026-09-03
 *
 *   node scripts/homefeed-collect.js [--목표 10000] [--분] 25
 *
 * ── 무엇을 모으나 ──
 * 홈판 추천 피드에 실제로 올라온 글의 **제목·썸네일·반응·주제**를 모읍니다.
 * 후킹을 분석하려면 "홈판에 뜬 것" 이 표본이어야 합니다.
 *
 * ── 어떻게 ──
 *   GET section.blog.naver.com/ajax/DirectoryPostList.naver?directoryNo=D&currentPage=P
 *   실측(2026-09-03): directoryNo 마다 totalCount=1000, currentPage 100 까지 넘어갑니다.
 *   같은 글이 여러 directoryNo 에 겹쳐 나오므로 **(블로그ID, 글번호)로 중복을 제거**합니다.
 *
 * ⚠️ 이 API 는 "홈판 추천 피드" 입니다. **"상위노출"과 같은 것인지는 확인하지 못했습니다.**
 *    피드에 떴다 = 노출됐다 까지만 말할 수 있습니다. 그 이상은 추측입니다.
 *
 * ⚠️ 공감·댓글 수는 **블로그 크기에 크게 좌우**됩니다. 썸네일 효과를 보려면
 *    이웃 수로 정규화해야 하는데, 이 API 는 이웃 수를 주지 않습니다.
 *    그래서 분석에서는 **비율(%)** 을 주로 쓰고, 절대 수치는 참고로만 씁니다.
 *
 * 결과: data/homefeed/수집.jsonl  (한 줄에 한 글)
 */
const fs = require('fs');
const path = require('path');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const 목표 = Number(arg('--목표', 10000));
const 제한분 = Number(arg('--분', 6));
const OUT_DIR = path.join(__dirname, '..', 'data', 'homefeed');
const OUT = path.join(OUT_DIR, '수집.jsonl');
fs.mkdirSync(OUT_DIR, { recursive: true });

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
  'Referer': 'https://section.blog.naver.com/',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function 부르기(dn, pg) {
  const url = `https://section.blog.naver.com/ajax/DirectoryPostList.naver?directoryNo=${dn}&currentPage=${pg}`;
  const r = await fetch(url, { headers: H });
  const t = await r.text();
  return JSON.parse(t.replace(/^\)\]\}',?\s*/, ''));
}

(async () => {
  const 본것 = new Set();
  // 이어서 모을 수 있게, 이미 있는 것을 먼저 읽습니다
  if (fs.existsSync(OUT)) {
    for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try { const o = JSON.parse(l); 본것.add(o.키); } catch {}
    }
    console.log(`이미 모은 것 ${본것.size}건 — 이어서 모읍니다`);
  }
  const 쓰기 = fs.createWriteStream(OUT, { flags: 'a' });
  const 시작 = Date.now();
  let 호출 = 0, 실패 = 0;
  const 주제별 = {};

  /**
   * ⚠️ **깊은 페이지는 헛돕니다** (2026-09-03 실측).
   *    totalCount 는 1000 이라고 나오지만 실제로는 같은 글이 계속 반복됩니다.
   *    40분을 돌려 126건이 전부였습니다 — 페이지 100까지 가도 새 글은 3~6건씩입니다.
   *    그래서 **깊이 파는 대신 자주 도는 쪽**으로 바꿨습니다.
   *    피드는 시간이 지나면 새 글로 갈리므로, 짧게 여러 번이 훨씬 많이 모입니다.
   *    (작업 스케줄러 GwHomefeedCollect 가 3시간마다 부릅니다)
   */
  const 최대페이지 = Number(arg('--페이지', 12));
  바깥: for (let pg = 1; pg <= 최대페이지; pg++) {
    for (let dn = 0; dn <= 40; dn++) {
      if (본것.size >= 목표) break 바깥;
      if ((Date.now() - 시작) / 60000 > 제한분) { console.log('\n시간 제한에 걸려 멈춥니다'); break 바깥; }
      let j;
      try { j = await 부르기(dn, pg); 호출++; }
      catch { 실패++; await sleep(400); continue; }
      const lst = (j.result || {}).postList || [];
      for (const p of lst) {
        const 키 = `${p.domainIdOrBlogId}/${p.logNo}`;
        if (본것.has(키)) continue;
        본것.add(키);
        const 주제 = (p.directory || {}).name || '?';
        주제별[주제] = (주제별[주제] || 0) + 1;
        const th = (p.thumbnails || []).filter((t) => t && t.url).map((t) => t.url);
        쓰기.write(JSON.stringify({
          키, 주제,
          제목: p.title || '',
          블로그: p.nickname || '',
          블로그ID: p.domainIdOrBlogId || '',
          공감: p.sympathyCnt || 0,
          댓글: p.commentCnt || 0,
          날짜: p.addDate || null,
          썸수: th.length,
          썸네일: th[0] || null,
          요약: (p.briefContents || '').slice(0, 120),
        }) + '\n');
      }
      if (호출 % 40 === 0) {
        const 분 = ((Date.now() - 시작) / 60000).toFixed(1);
        process.stdout.write(`\r  ${본것.size}건 · 호출 ${호출} · 실패 ${실패} · ${분}분`);
      }
      await sleep(120);      // 남의 서버입니다. 몰아치지 않습니다
    }
  }
  쓰기.end();
  console.log(`\n\n■ 수집 ${본것.size}건 · 호출 ${호출} · 실패 ${실패}`);
  console.log('■ 주제별 (이번 실행분)');
  Object.entries(주제별).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(5)}  ${k}`));
  console.log(`\n→ ${OUT}`);
})();
