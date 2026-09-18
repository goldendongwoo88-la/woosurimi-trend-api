#!/usr/bin/env python3
"""훅 자체 검사 — 막아야 할 것은 막고, 멀쩡한 것은 통과하는지 확인합니다.

실행: python3 .claude/hooks/selftest.py
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

M = "|" + "| true"          # 훅이 이 파일 자체를 오인하지 않게 쪼개서 씁니다
E = "|" + "| echo ok"

CASES = [
    # (막혀야 하나, 훅 파일, 명령, 설명)
    (True,  "no-silent-failure.py", f"npm test {M}",                    "검증 실패를 덮음"),
    (True,  "no-silent-failure.py", f"pytest -q {M}",                   "검증 실패를 덮음"),
    (True,  "no-silent-failure.py", f"node --check a.js {E}",           "검증 실패를 덮음"),
    (True,  "no-silent-failure.py", "git commit --no-verify -m x",      "검사 우회"),
    (True,  "no-silent-failure.py", "git commit -n -m x",               "검사 우회"),
    (False, "no-silent-failure.py", "npm test",                         "그냥 검증"),
    (False, "no-silent-failure.py", f"pkill -f node {M}",               "정리 명령"),
    (False, "no-silent-failure.py", f"rm -rf tmp {M}",                  "정리 명령"),
    (False, "no-silent-failure.py", "git commit -m 'x'",                "보통 커밋"),
    (False, "no-silent-failure.py", "git log --oneline -n 5",           "-n 은 log 것"),
    (False, "no-silent-failure.py", "grep -n foo a.txt && git commit -m x", "-n 은 grep 것"),
    (False, "no-silent-failure.py", f"git commit -F - <<'MSG'\n설명: {M} 를 쓰지 말자\nMSG", "글 속 설명"),

    (True,  "video-guard.py", "ffprobe -show_entries format=duration f.mp4", "컨테이너 길이"),
    (True,  "video-guard.py", "ffmpeg -loop 1 -t 2 -i a.jpg o.mp4",          "framerate 없음"),
    (False, "video-guard.py", "ffprobe -select_streams v:0 -show_entries stream=nb_frames f.mp4", "영상 스트림"),
    (False, "video-guard.py", "ffprobe -select_streams a:0 -show_entries format=duration f.mp3", "소리를 일부러"),
    (False, "video-guard.py", "ffmpeg -loop 1 -framerate 30 -t 2 -i a.jpg o.mp4", "framerate 있음"),
    (False, "video-guard.py", "git status",                                   "무관한 명령"),
    (False, "video-guard.py", "git commit -F - <<'MSG'\nformat=duration 쓰지 말 것 (ffprobe)\nMSG", "글 속 설명"),
]

fails = 0
for should_block, hook, cmd, label in CASES:
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})
    out = subprocess.run(
        [sys.executable, os.path.join(HERE, hook)],
        input=payload, capture_output=True, text=True,
    ).stdout.strip()
    blocked = bool(out)
    ok = blocked == should_block
    if not ok:
        fails += 1
    mark = "OK  " if ok else "FAIL"
    want = "차단" if should_block else "통과"
    got = "차단" if blocked else "통과"
    print(f"  {mark} [{hook.split('.')[0]:17s}] {want}해야 → {got}  · {label}")

print()
if fails:
    print(f"실패 {fails}건 / 전체 {len(CASES)}건")
    sys.exit(1)
print(f"전부 통과 — {len(CASES)}건")
