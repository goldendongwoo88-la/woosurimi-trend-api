#!/usr/bin/env python3
"""영상 작업에서 실제로 터졌던 결함 두 가지를 실행 전에 막습니다.

왜 있나: 2026-09-18, 사진 장면의 그림이 5/6로 짧아지는 결함을 몇 시간 동안 못 잡았습니다.
ffprobe의 컨테이너 길이만 보고 "정상"이라고 보고했기 때문입니다.
사람이 기억으로 지키는 규칙은 또 잊습니다. 그래서 문을 잠급니다.

⚠️ 검사는 **명령 하나하나**에 겁니다. 한 덩어리로 보면 앞쪽의 올바른 호출이 뒤쪽의
잘못된 호출을 덮어줍니다. 실제로 이랬습니다:

    ffprobe -select_streams v:0 ... a.mp4 && ffprobe -show_entries format=duration b.mp4

앞에 -select_streams 가 있다는 이유로 뒤쪽 위반이 그냥 통과했습니다.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _scan import read_command, split_commands, strip_message_args, deny  # noqa: E402

cmd = strip_message_args(read_command())
if not cmd.strip():
    sys.exit(0)

for part in split_commands(cmd):
    def has(pattern: str, _p=part) -> bool:
        return re.search(pattern, _p) is not None

    # ── 규칙 1. 영상 길이를 컨테이너 길이로 재지 말 것 ──────────────────
    #
    # ffprobe -show_entries format=duration 은 영상과 소리 중 **긴 쪽**을 돌려줍니다.
    # 장면 소리는 apad로 목표 길이까지 채워지므로, 그림이 잘려도 이 값은 멀쩡해 보입니다.
    # 실제로 그림 2.17초 / 소리 13.99초인 파일이 "13.99초"로 보고됐습니다.
    if has(r"\bffprobe\b") and has(r"format=duration") and not has(r"select_streams\s+[av]"):
        deny(
            "영상 길이를 컨테이너 길이(format=duration)로 재려고 했습니다. "
            "이 값은 영상과 소리 중 긴 쪽이라, 그림이 잘려도 멀쩡해 보입니다"
            "(실제로 그림 2.17초 / 소리 13.99초인 파일이 13.99초로 보고된 적 있습니다).\n\n"
            "영상 스트림만 따로 재세요:\n"
            "  ffprobe -v error -select_streams v:0 "
            "-show_entries stream=duration,nb_frames -of csv=p=0 <파일>\n\n"
            "소리 길이가 정말 필요하면 -select_streams a:0 을 붙이면 통과합니다.\n"
            f"(걸린 부분: {part.strip()[:120]})"
        )

    # ── 규칙 2. -loop 1 로 사진을 읽을 때 -framerate 를 빠뜨리지 말 것 ──
    #
    # ffmpeg는 -loop 1 입력을 기본 25fps로 디코딩합니다. 출력이 30fps면 모든 사진 장면의
    # 그림이 정확히 25/30 = 5/6로 짧아지고, 이어붙일 때 xfade offset이 실제 그림 길이를
    # 넘어서면서 영상이 마지막 장면 하나로 무너집니다.
    #
    # ⚠️ 한 명령 안에 -loop 1 입력이 여러 개일 수 있습니다. 하나라도 -framerate 없이
    # 붙어 있으면 막아야 하므로 **입력 하나하나**를 봅니다. ffmpeg의 입력 옵션은
    # 바로 뒤 -i 에 붙으므로, `-i` 앞까지를 한 입력으로 끊어서 그 안에 -loop 1 과
    # -framerate 가 같이 있는지 확인합니다.
    #
    # 순서는 따지지 않습니다. `-framerate 30 -loop 1` 도 ffmpeg에서는 똑같이 맞습니다.
    if has(r"\bffmpeg\b"):
        for seg in re.findall(r"((?:(?!\s-i\b).)*)\s-i\b", part, re.S):
            if re.search(r"-loop\s+1\b", seg) and "-framerate" not in seg:
                deny(
                    "ffmpeg -loop 1 로 사진을 읽으면서 -framerate 를 빠뜨렸습니다. "
                    "ffmpeg는 이때 25fps로 디코딩하는데 출력이 30fps라, 사진 장면의 그림이 "
                    "정확히 5/6로 짧아집니다. 이어붙일 때 xfade offset이 실제 그림 길이를 "
                    "넘어서면 영상이 마지막 장면 하나로 무너집니다.\n\n"
                    "이렇게 쓰세요:\n"
                    "  ffmpeg -loop 1 -framerate 30 -t <초> -i <사진> ...\n\n"
                    "(2026-09-18 goldencut_effects.py에서 실제로 터진 결함입니다)\n"
                    f"(걸린 부분: {part.strip()[:120]})"
                )

sys.exit(0)
