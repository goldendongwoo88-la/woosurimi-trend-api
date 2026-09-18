#!/usr/bin/env bash
# 영상 작업에서 실제로 터졌던 결함 두 가지를 기계적으로 막습니다.
# Claude Code가 Bash 명령을 실행하기 전에 불립니다(PreToolUse). stdin으로 JSON이 들어옵니다.
#
# 왜 이 훅이 있나: 2026-09-18, 사진 장면의 그림이 5/6로 짧아지는 결함을 몇 시간 동안
# 못 잡았습니다. ffprobe의 컨테이너 길이만 보고 "정상"이라고 보고했기 때문입니다.
# 사람이 기억으로 지키는 규칙은 또 잊습니다. 그래서 문을 잠급니다.

set -uo pipefail
payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
[ -z "$cmd" ] && exit 0

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

has() { printf '%s' "$cmd" | grep -qE "$1"; }

# ── 규칙 1. 영상 길이를 컨테이너 길이로 재지 말 것 ──────────────────
#
# ffprobe -show_entries format=duration 은 영상과 소리 중 **긴 쪽**을 돌려줍니다.
# 장면 소리는 apad로 목표 길이까지 채워지므로, 그림이 잘려도 이 값은 멀쩡해 보입니다.
# 실제로 그림 2.17초 / 소리 13.99초인 파일이 "13.99초"로 보고됐습니다.
if has 'ffprobe' && has 'format=duration' && ! has 'select_streams[[:space:]]+[av]'; then
  deny "영상 길이를 컨테이너 길이(format=duration)로 재려고 했습니다. 이 값은 영상과 소리 중 긴 쪽이라, 그림이 잘려도 멀쩡해 보입니다(실제로 그림 2.17초 / 소리 13.99초인 파일이 13.99초로 보고된 적 있습니다).

영상 스트림만 따로 재세요:
  ffprobe -v error -select_streams v:0 -show_entries stream=duration,nb_frames -of csv=p=0 <파일>

소리 길이가 정말 필요하면 -select_streams a:0 을 붙이면 통과합니다."
fi

# ── 규칙 2. -loop 1 로 사진을 읽을 때 -framerate 를 빠뜨리지 말 것 ──
#
# ffmpeg는 -loop 1 입력을 기본 25fps로 디코딩합니다. 출력이 30fps면 모든 사진 장면의
# 그림이 정확히 25/30 = 5/6로 짧아지고, 이어붙일 때 xfade offset이 실제 그림 길이를
# 넘어서면서 영상이 마지막 장면 하나로 무너집니다.
if has 'ffmpeg' && has '\-loop[[:space:]]+1' && ! has '\-framerate'; then
  deny "ffmpeg -loop 1 로 사진을 읽으면서 -framerate 를 빠뜨렸습니다. ffmpeg는 이때 25fps로 디코딩하는데 출력이 30fps라, 사진 장면의 그림이 정확히 5/6로 짧아집니다. 이어붙일 때 xfade offset이 실제 그림 길이를 넘어서면 영상이 마지막 장면 하나로 무너집니다.

이렇게 쓰세요:
  ffmpeg -loop 1 -framerate 30 -t <초> -i <사진> ...

(2026-09-18 goldencut_effects.py에서 실제로 터진 결함입니다)"
fi

exit 0
