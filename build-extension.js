// 확장 폴더를 zip으로 묶습니다. 사장님이 내려받아 크롬에 넣을 파일입니다.
//
// ⚠️ zip 안에 extension/ 폴더가 한 겹 더 생기면 안 됩니다. 크롬은 고른 폴더에서
// manifest.json을 바로 찾는데, 한 겹 들어가 있으면 "매니페스트가 없다"며 거부합니다.
// 압축을 풀었을 때 manifest.json이 바로 보여야 합니다.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SRC = path.join(__dirname, "extension");
const OUT = path.join(__dirname, "public", "downloads", "woosurimi-posting.zip");

if (!fs.existsSync(path.join(SRC, "manifest.json"))) {
  console.error("extension/manifest.json이 없습니다.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

// 윈도우에 기본으로 있는 압축 기능을 씁니다. 따로 설치할 게 없습니다.
//
// ⚠️ `-Path '경로\*'`로 하면 안 됩니다. 실제로 그렇게 했다가 압축 안에
// extension\ 폴더가 한 겹 더 생겼습니다. 그 상태로는 크롬이 매니페스트를 못 찾습니다.
// 폴더 안으로 들어간 뒤 이름만으로 묶어야 최상단에 들어갑니다.
execFileSync("powershell", ["-NoProfile", "-Command",
  `Push-Location '${SRC}'; ` +
  `Compress-Archive -Path (Get-ChildItem -Force | ForEach-Object Name) ` +
  `-DestinationPath '${OUT}' -Force; Pop-Location`
], { stdio: "inherit" });

// ⚠️ 윈도우 Compress-Archive는 폴더 구분자를 역슬래시로 씁니다.
// zip 규격은 슬래시(/)만 허용합니다. 실제로 만들어진 zip 안이 이랬습니다:
//   content\editor-tools.js   ← 잘못됨
//   content/editor-tools.js   ← 맞음
// 크롬은 대체로 넘어가지만, 푸는 도구에 따라 폴더가 아니라 이름에 역슬래시가 든
// 파일 하나로 풀립니다. 그러면 매니페스트가 가리키는 content/... 가 없어서
// 콘텐츠 스크립트가 통째로 안 뜹니다. 왜 안 되는지 알아채기도 어렵습니다.
//
// 이름 길이가 그대로라(역슬래시도 슬래시도 1바이트) 바이트만 바꿔도 안전합니다.
// CRC와 크기는 파일 내용에 대한 값이라 영향이 없습니다.
{
  const buf = fs.readFileSync(OUT);
  let changed = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0x5c) continue; // '\'
    // 파일 이름 안에 있는 것만 바꿔야 합니다. 압축된 데이터에도 0x5c가 들어 있으니
    // 헤더에 적힌 이름 길이만큼만 훑어야 안전합니다.
    // 여기서는 헤더를 직접 찾아 그 범위만 손봅니다(아래 루프에서 처리).
    changed++;
  }
  if (changed) {
    const fix = (sigBytes, nameOffset, lenOffset, extraOffset) => {
      const sig = Buffer.from(sigBytes);
      let i = 0;
      while ((i = buf.indexOf(sig, i)) !== -1) {
        const nameLen = buf.readUInt16LE(i + lenOffset);
        const start = i + nameOffset;
        for (let k = start; k < start + nameLen; k++) if (buf[k] === 0x5c) buf[k] = 0x2f;
        i += 4;
      }
    };
    fix([0x50, 0x4b, 0x03, 0x04], 30, 26); // 로컬 파일 헤더
    fix([0x50, 0x4b, 0x01, 0x02], 46, 28); // 중앙 디렉터리
    fs.writeFileSync(OUT, buf);
  }
}

// ⚠️ 만들고 끝내지 않습니다. 위 문제를 한 번 겪었으니 매번 확인합니다.
// 깨진 zip을 올려두면 사장님이 크롬 앞에서 헤매게 됩니다.
const listing = execFileSync("powershell", ["-NoProfile", "-Command",
  `Add-Type -A System.IO.Compression.FileSystem; ` +
  `[IO.Compression.ZipFile]::OpenRead('${OUT}').Entries | ForEach-Object { $_.FullName }`
], { encoding: "utf8" });

const files = listing.trim().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
if (!files.includes("manifest.json")) {
  console.error("만들다 말았습니다 — 압축 최상단에 manifest.json이 없습니다:");
  files.forEach((f) => console.error("  " + f));
  process.exit(1);
}

// 매니페스트가 부르는 파일이 zip 안에 정말 들어 있는지 확인합니다.
// 파일 하나가 빠지면 그 기능만 조용히 안 뜹니다. 크롬은 오류도 안 냅니다.
{
  const mf = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
  const need = new Set(["manifest.json"]);
  for (const cs of mf.content_scripts || []) {
    (cs.js || []).forEach((f) => need.add(f));
    (cs.css || []).forEach((f) => need.add(f));
  }
  if (mf.background?.service_worker) need.add(mf.background.service_worker);
  if (mf.action?.default_popup) need.add(mf.action.default_popup);
  if (mf.options_page) need.add(mf.options_page);

  const missing = [...need].filter((f) => !files.includes(f));
  if (missing.length) {
    console.error("매니페스트가 부르는 파일이 압축에 없습니다:");
    missing.forEach((f) => console.error("  없음: " + f));
    console.error("압축 안:");
    files.forEach((f) => console.error("  " + f));
    process.exit(1);
  }
  const backslash = files.filter((f) => f.includes("\\"));
  if (backslash.length) {
    console.error("경로에 역슬래시가 남아 있습니다:", backslash.join(", "));
    process.exit(1);
  }
}

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`만들었습니다: public/downloads/woosurimi-posting.zip (${kb}KB, 파일 ${files.length}개)`);
