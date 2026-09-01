/**
 * 사진 자리표시 규칙 대조 — node scripts/test-photo-slot.js
 *
 * ⚠️ 왜 이 테스트가 필요한가:
 * 이 저장소는 **같은 규칙이 두 곳에 갈라져 있다가** 두 번 당했습니다.
 *   · 확장이 `.se-main-container`를 쓰는데 실제 편집기엔 그게 없어서 선택자가 전부 헛돌았습니다
 *   · 사진 주소를 한 곳은 `data-src`부터 읽고 다른 곳은 `src`만 읽어서, 워드에 사진이 한 장도 안 담겼습니다
 *
 * 이번에도 같은 모양입니다 — 원고를 만드는 쪽(draft-parser.js)과 사진을 넣는 쪽(photo-insert.js)이
 * **[사진: …] 을 같은 규칙으로 알아봐야** 합니다. 한 글자만 달라도 자리를 하나도 못 찾고,
 * 그러면 "사진이 안 들어가는데 오류도 안 난다"가 됩니다. 제일 찾기 어려운 종류의 고장입니다.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const EXT = path.join(__dirname, '..', 'extension', 'content');
const read = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');

let pass = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); process.exitCode = 1; }
};

/** 파일에서 정규식 리터럴 한 줄을 뽑습니다. */
function grabRegex(src, varName) {
  const m = src.match(new RegExp(`${varName}\\s*=\\s*(/.+/[gimsuy]*)\\s*;`));
  if (!m) throw new Error(`${varName} 을 못 찾았습니다`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

console.log('\n사진 자리표시 규칙');

const PARSER = grabRegex(read('draft-parser.js'), 'PHOTO');
const INSERT = grabRegex(read('photo-insert.js'), 'PHOTO_SLOT');

t('두 곳의 규칙이 글자까지 같다  ← 제일 중요', () => {
  assert.strictEqual(
    INSERT.source, PARSER.source,
    `갈라졌습니다.\n       draft-parser.js: ${PARSER.source}\n       photo-insert.js: ${INSERT.source}`
  );
});

// 원고 생성 쪽이 실제로 뱉는 모양들 (draft-insert.js:767, bodyRewrite.js, extension.js 기준)
const SHOULD_MATCH = [
  '[사진: 코트 뒷모습]',
  '[사진 1: 무엇]',
  '[사진 12: 화장대 위 제품들]',
  '[사진: 여기에 사진]',
  '[사진]',
  '  [사진: 앞뒤 공백이 있어도]  ',
  '[사진： 전각 콜론]',
];

const SHOULD_NOT = [
  '오늘 [사진: 이건 문장 안에] 있습니다',   // 줄 전체가 자리표시일 때만
  '[소제목] 이건 소제목',
  '사진 이야기를 해볼게요',
  '',
];

t('원고가 뱉는 모양을 전부 알아본다', () => {
  for (const s of SHOULD_MATCH) {
    assert.ok(INSERT.test(s), `못 알아봄: "${s}"`);
    assert.ok(PARSER.test(s), `파서도 못 알아봄: "${s}"`);
  }
});

t('자리표시가 아닌 줄은 건드리지 않는다', () => {
  for (const s of SHOULD_NOT) {
    assert.ok(!INSERT.test(s), `잘못 걸림: "${s}"`);
  }
});

t('설명 글자를 꺼낼 수 있다 (어느 사진인지 판단용)', () => {
  assert.strictEqual('[사진 3: 코트 뒷모습]'.match(INSERT)[1].trim(), '코트 뒷모습');
  assert.strictEqual('[사진]'.match(INSERT)[1].trim(), '');
});

console.log('\n확장 배선');

t('photo-insert.js 가 매니페스트에 실려 있다', () => {
  const mf = JSON.parse(fs.readFileSync(path.join(EXT, '..', 'manifest.json'), 'utf8'));
  const js = mf.content_scripts[0].js;
  assert.ok(js.includes('content/photo-insert.js'), '매니페스트에 없습니다');
  assert.ok(
    js.indexOf('content/photo-insert.js') > js.indexOf('content/draft-insert.js'),
    'draft-insert.js 보다 뒤에 와야 합니다 (window.__wsInsert 를 씁니다)'
  );
  assert.ok(
    js.indexOf('content/photo-insert.js') < js.indexOf('content/editor-tools.js'),
    'editor-tools.js 보다 앞에 와야 합니다 (거기서 window.__wsPhoto 를 씁니다)'
  );
});

t('배경이 세 번 클릭(clicks)을 받는다', () => {
  const bg = fs.readFileSync(path.join(EXT, '..', 'background.js'), 'utf8');
  assert.ok(/msg\.clicks/.test(bg), 'uiClick 이 clicks 를 안 봅니다 — 줄 선택이 안 됩니다');
});

console.log(`\n${pass}개 통과${process.exitCode ? ' (실패 있음)' : ''}\n`);
