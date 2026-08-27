#!/usr/bin/env node
/**
 * 확장 프로그램을 zip 으로 묶습니다.
 *
 *   node scripts/pack-extension.js
 *
 * ⚠️ 윈도우 Compress-Archive 를 쓰면 안 됩니다.
 * 그걸로 만들었더니 zip 안 경로가 `content\editor-tools.js` 처럼 **역슬래시**였습니다.
 * ZIP 규격은 정슬래시(/)입니다. 푸는 도구에 따라 폴더가 안 생기고
 * **이름에 \ 가 박힌 파일 하나**로 풀립니다. 그러면 크롬이 확장을 못 켭니다.
 *
 * 그래서 직접 씁니다. 바깥 라이브러리도 안 씁니다 — node 기본 zlib 이면 됩니다.
 *
 * ⚠️ AI를 안 부릅니다. 값이 0원입니다.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SRC = path.join(__dirname, "..", "extension");
const OUT = path.join(__dirname, "..", "public", "downloads", "woosurimi-posting.zip");

/** 폴더를 훑어 파일 목록을 만듭니다. 경로는 **항상 정슬래시**입니다. */
function walk(dir, base = "") {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    // 개발할 때 쓰는 찌꺼기는 안 넣습니다. 크롬이 경고를 띄웁니다.
    if (name === ".DS_Store" || name === "Thumbs.db" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;      // ← 정슬래시로 이어붙입니다
    if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full });
  }
  return out;
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** MS-DOS 시각 — zip 은 아직 1980년 형식을 씁니다. */
function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function pack(files, when) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, date } = dosTime(when);

  for (const f of files) {
    const nameBuf = Buffer.from(f.rel, "utf8");
    const raw = fs.readFileSync(f.full);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // 압축이 오히려 커지면 그냥 담습니다. 작은 파일에서 실제로 그럽니다.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            // 필요한 버전
    lh.writeUInt16LE(0x0800, 6);        // 이름이 UTF-8이라고 알립니다 (한글 파일명 대비)
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }

  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

const files = walk(SRC);
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));

// ⚠️ 만들기 전에 확인합니다. 빠진 채로 묶으면 사장님이 설치하고 나서야 압니다.
const MUST = ["manifest.json", "background.js", "popup.html", "options.html",
  "content/editor-tools.js", "content/draft-parser.js", "content/draft-insert.js",
  "content/format-tools.js", "content/panel.css"];
const have = new Set(files.map((f) => f.rel));
const missing = MUST.filter((m) => !have.has(m));
if (missing.length) {
  console.error(`\n✗ 꼭 있어야 할 파일이 없습니다: ${missing.join(", ")}\n`);
  process.exit(1);
}
// manifest 가 부르는 파일이 실제로 있는지도 봅니다.
const declared = [
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  manifest.background && manifest.background.service_worker,
  manifest.options_page,
  manifest.action && manifest.action.default_popup,
  ...Object.values((manifest.icons || {})),
].filter(Boolean);
const broken = declared.filter((d) => !have.has(d));
if (broken.length) {
  console.error(`\n✗ manifest 가 부르는데 없는 파일: ${broken.join(", ")}`);
  console.error(`  이대로 설치하면 크롬이 확장을 안 켭니다.\n`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
// ⚠️ 시각을 고정합니다. 안 그러면 내용이 같아도 zip 이 매번 달라져서
// git 에 쓸데없는 변경이 쌓입니다.
fs.writeFileSync(OUT, pack(files, new Date("2026-01-01T00:00:00Z")));

console.log(`\n우수리미 포스팅 ${manifest.version}`);
console.log(`  파일 ${files.length}개 · ${Math.round(fs.statSync(OUT).size / 1024)}KB`);
console.log(`  ${OUT}`);
console.log(`\n  경로가 전부 정슬래시(/)인지 확인:`);
const bad = files.filter((f) => f.rel.includes("\\"));
console.log(`  ${bad.length ? "✗ 역슬래시 " + bad.length + "개" : "✓ 깨끗합니다"}\n`);
