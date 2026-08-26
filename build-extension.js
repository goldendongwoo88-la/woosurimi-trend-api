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

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`만들었습니다: public/downloads/woosurimi-posting.zip (${kb}KB, 파일 ${files.length}개)`);
