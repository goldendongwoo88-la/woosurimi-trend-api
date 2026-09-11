# 오픈소스-AI-모델-다운로드-가이드.md에서 안내한 8개 모델이 실제로 받아졌는지
# 사용자님 PC에서 직접 확인하는 스크립트입니다. Claude는 이 컴퓨터를 볼 수 없어서
# 대신 이 스크립트를 PC에서 직접 실행해서 확인하는 방식입니다.
#
# 사용법: PowerShell에서
#   cd 이 스크립트가 있는 폴더\..
#   powershell -ExecutionPolicy Bypass -File scripts\check-local-models.ps1
#
# ⚠️ 아래 경로는 가이드 문서의 예시 명령어(--local-dir models\...) 그대로 받았을 때
# 기준입니다. 다른 폴더에 받으셨다면 $base 값이나 각 경로를 실제 위치로 바꿔주세요.

param(
  [string]$Base = "$PWD\models"
)

Write-Host ""
Write-Host "오픈소스 AI 모델 8종 다운로드 확인 (기준 폴더: $Base)" -ForegroundColor Cyan
Write-Host "다른 곳에 받으셨다면: .\scripts\check-local-models.ps1 -Base '실제경로\models'" -ForegroundColor DarkGray
Write-Host ""

$checks = @(
  @{ n = "1. LTX-2.5 (영상 제작)";                 p = "$Base\ltx-2.5" },
  @{ n = "2. Wan 2.2 (영상 제작, 변형 아무거나)";    p = @("$Base\Wan2.2-TI2V-5B", "$Base\Wan2.2-T2V-A14B", "$Base\Wan2.2-I2V-A14B") },
  @{ n = "3. Wan2.1-VACE-14B (영상 편집)";          p = "$Base\Wan2.1-VACE-14B" },
  @{ n = "4. musubi-tuner (얼굴 학습 도구)";         p = "$PWD\musubi-tuner" },
  @{ n = "5. Z-Image Turbo (카드뉴스 그림)";         p = "$Base\Z-Image-Turbo" },
  @{ n = "6. InfiniteTalk (말하는 얼굴)";            p = "$Base\InfiniteTalk" },
  @{ n = "7. Qwen-Image-Edit-2511 (그림 수정)";      p = @("$Base\Qwen-Image-Edit-2511", "$Base\Qwen-Image-Edit-2511-Lightning") },
  @{ n = "8. ACE-Step 1.5 (배경음악)";               p = "$PWD\ACE-Step-1.5" }
)

$missing = 0
foreach ($c in $checks) {
  $candidates = @($c.p)
  $found = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($found) {
    Write-Host "  [받음]     $($c.n)" -ForegroundColor Green
  } else {
    Write-Host "  [안 받음]  $($c.n)" -ForegroundColor Red
    $missing++
  }
}

Write-Host ""
if ($missing -eq 0) {
  Write-Host "8개 전부 확인됐습니다." -ForegroundColor Green
} else {
  Write-Host "$missing 개가 안 보입니다. 위 [안 받음] 항목은 오픈소스-AI-모델-다운로드-가이드.md의 해당 명령어를 다시 실행하시거나, 다른 폴더에 받으셨다면 -Base 옵션으로 실제 경로를 알려주세요." -ForegroundColor Yellow
}
Write-Host ""
