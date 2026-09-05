# 우수리미부부 전용 크롬을 띄웁니다 — 포트 9335
#
#   powershell -ExecutionPolicy Bypass -File scripts\크롬-우수리미.ps1
#
# 🔴 포트가 채널마다 다릅니다. 남의 창에 붙으면 남의 작업을 깨뜨립니다.
#      9333  부부 경제 연구소
#      9334  느지막한 책상
#      9335  우수리미부부   ← 이것
#
# 처음 한 번은 사람이 로그인해야 합니다. 저는 비밀번호를 못 넣습니다.
# 로그인해 두면 프로필에 남아서 다음부터는 이 스크립트만 돌리면 됩니다.

$ErrorActionPreference = 'Stop'
$포트 = 9335
$프로필 = 'C:\dev\profiles\youtube_woosoorimi'
$채널 = 'UCymEIXAIWQdWDTM9Au2x90Q'

# 이미 떠 있으면 다시 안 띄웁니다
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$포트/json/version" -TimeoutSec 2
  Write-Host "이미 떠 있습니다 — $($r.Browser)"
  Write-Host "다음: node scripts\설명란-붙이기.js --확인"
  exit 0
} catch {}

if (-not (Test-Path $프로필)) { New-Item -ItemType Directory -Force -Path $프로필 | Out-Null }

$크롬 = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $크롬) { Write-Error "크롬을 못 찾았습니다"; exit 1 }

Start-Process $크롬 -ArgumentList @(
  "--remote-debugging-port=$포트",
  "--user-data-dir=$프로필",
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1400,950",
  "https://studio.youtube.com/channel/$채널/videos/upload"
)

# 「띄웠다」와 「붙을 수 있다」는 다릅니다 — 실제로 붙어 봅니다
$됨 = $false
foreach ($i in 1..30) {
  Start-Sleep -Milliseconds 1000
  try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:$포트/json/version" -TimeoutSec 2; $됨 = $true; break } catch {}
}

if (-not $됨) { Write-Error "$포트 번에 안 붙습니다. 크롬 창이 떴는지 보십시오."; exit 1 }

Write-Host ""
Write-Host "크롬이 떴습니다 (포트 $포트)"
Write-Host ""
Write-Host "🔴 처음이면 지금 창에서 **우수리미부부 계정으로 로그인**해 주십시오."
Write-Host "   스튜디오 영상 목록이 보이면 된 것입니다."
Write-Host ""
Write-Host "그다음:"
Write-Host "   node scripts\설명란-붙이기.js            (미리보기 — 아무것도 안 바꿈)"
Write-Host "   node scripts\설명란-붙이기.js --한편 <ID>  (한 편만 시험)"
Write-Host "   node scripts\설명란-붙이기.js --진짜      (전부)"
