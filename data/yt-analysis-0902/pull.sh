#!/usr/bin/env bash
# 유튜브 40개 자막 일괄 추출 — 영상은 받지 않는다 (자막만)
# 사용: bash pull.sh
set -u
cd "$(dirname "$0")"

OUT="vtt"
mkdir -p "$OUT"
: > log.txt
: > meta.tsv

n=0
ok=0
fail=0

while IFS=$'\t' read -r theme vid label url; do
  [ -z "${vid:-}" ] && continue
  n=$((n+1))
  printf '[%02d] %s / %s ... ' "$n" "$theme" "$vid" | tee -a log.txt

  # 제목·길이·채널 먼저 (자막 없어도 기록은 남긴다)
  info=$(yt-dlp --no-warnings --skip-download \
          --print "%(title)s\t%(channel)s\t%(duration)s\t%(view_count)s\t%(upload_date)s" \
          "$url" 2>>log.txt | head -1)

  if [ -z "$info" ]; then
    echo "정보실패" | tee -a log.txt
    printf '%s\t%s\t%s\tERROR\t\t\t\t\n' "$theme" "$vid" "$label" >> meta.tsv
    fail=$((fail+1))
    continue
  fi

  printf '%s\t%s\t%s\t%s\n' "$theme" "$vid" "$label" "$info" >> meta.tsv

  # 한국어 자막 (수동 자막 우선, 없으면 자동 자막)
  yt-dlp --no-warnings --skip-download \
    --write-sub --write-auto-sub --sub-lang "ko,ko-KR" \
    -o "$OUT/${theme}_${vid}.%(ext)s" "$url" >>log.txt 2>&1

  if ls "$OUT/${theme}_${vid}"*.vtt >/dev/null 2>&1; then
    echo "OK" | tee -a log.txt
    ok=$((ok+1))
  else
    echo "자막없음" | tee -a log.txt
    fail=$((fail+1))
  fi

  sleep 2   # 연속 요청 완화
done < urls.tsv

echo "----" | tee -a log.txt
echo "총 $n / 자막확보 $ok / 실패 $fail" | tee -a log.txt

# 자막 정리 (vtt -> txt)
python "C:/Users/김동우/OneDrive/Desktop/my-project/_shared/vtt-clean.py" "$OUT" >> log.txt 2>&1
mkdir -p txt && mv "$OUT"/*.txt txt/ 2>/dev/null
echo "정리 완료: txt/ 폴더" | tee -a log.txt
