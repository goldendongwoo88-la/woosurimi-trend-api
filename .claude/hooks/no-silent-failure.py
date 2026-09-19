#!/usr/bin/env python3
"""막히면 기준을 낮추지 말고 "못했다"고 보고한다 — 기계로 받치는 부분.

사람의 태도는 훅으로 못 막습니다. 대신 **실패를 성공처럼 보이게 만드는 손버릇**은
명령줄에 그대로 드러나므로, 그것만 잡습니다.

왜 있나: 2026-09-18, Voicebox가 꺼져 있을 때 조용히 자막만으로 낮춰서 만들고,
검증하지 않은 렌더를 "정상 출력"이라고 보고한 일이 있었습니다.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _scan import read_command, strip_message_args, deny  # noqa: E402

cmd = strip_message_args(read_command())
if not cmd.strip():
    sys.exit(0)

# 검증에 해당하는 명령들. 이것들이 실패하면 그건 "못한 것"이지 "통과"가 아닙니다.
VERIFY = re.compile(
    r"\b("
    r"npm\s+(run\s+)?test|yarn\s+test|pnpm\s+test|"
    r"pytest|jest|mocha|vitest|"
    r"go\s+test|cargo\s+test|"
    r"node\s+--check|jq\s+-e|ffprobe"
    r")\b"
)

# 실패를 삼켜서 성공처럼 보이게 만드는 오른쪽 짝: `|| true`, `|| :`, `|| echo ...`
MASK_RHS = re.compile(r"^\s*(true|:|echo\b.*?)\s*$", re.S)

# `;` 뒤에 그냥 붙여서 종료코드를 0으로 만드는 꼬리: `npm test; true`
# (여기서는 echo 를 포함하지 않습니다 — `npm test; echo 끝` 은 흔하고 멀쩡합니다.)
MASK_TAIL = re.compile(r"^\s*(true|:)\s*$")

DENY_MASK = (
    "검증 명령의 실패를 '|| true' 같은 꼬리표로 덮으려 했습니다. "
    "이러면 실패가 통과처럼 보이고, 결국 사장님께 잘못된 보고가 나갑니다.\n\n"
    "규칙: 막히면 기준을 낮추지 말고 '못했다'고 보고합니다.\n\n"
    "- 검증은 그대로 돌리고, 실패하면 실패한 채로 두세요.\n"
    "- 원인을 못 고치겠으면 무엇이 왜 실패했는지 그대로 보고하세요.\n"
    "- 정리(cleanup)처럼 실패해도 되는 명령이라면 검증 명령과 한 줄에 "
    "섞지 말고 따로 실행하세요."
)

# ── 규칙 1. 검증 실패를 || true 로 덮지 말 것 ──────────────────────
#
# ⚠️ 명령줄 전체를 한 덩어리로 보면 안 됩니다. 두 방향으로 다 틀립니다:
#
#   rm -rf tmp || true && npm test      ← 덮는 대상은 rm 입니다. 막으면 오탐.
#   npm test && echo done || true       ← 덮는 대상은 npm test 입니다. 놓치면 구멍.
#
# 그래서 `||` 하나하나를 보고, **그 `||` 의 왼쪽에 검증 명령이 있는지**를 봅니다.
# 셸에서 `a && b || c` 의 `|| c` 는 `a && b` 전체의 실패를 받습니다.
CHAIN = re.compile(r"(\|\||&&)")

segments = re.split(r";|\n", cmd)
for seg in segments:
    tokens = CHAIN.split(seg)  # [피연산자, 연산자, 피연산자, ...]
    for i in range(1, len(tokens), 2):
        if tokens[i] != "||":
            continue
        right = tokens[i + 1] if i + 1 < len(tokens) else ""
        if MASK_RHS.match(right) and VERIFY.search("".join(tokens[:i])):
            deny(DENY_MASK + f"\n\n(걸린 부분: {seg.strip()[:120]})")

# `npm test; true` — 세미콜론/줄바꿈으로 끊고 성공을 덧붙이는 경우.
for idx in range(1, len(segments)):
    if MASK_TAIL.match(segments[idx]) and VERIFY.search(segments[idx - 1]):
        deny(DENY_MASK + f"\n\n(걸린 부분: {segments[idx - 1].strip()[:120]} ; true)")

# ── 규칙 2. 검사를 건너뛰고 커밋하지 말 것 ────────────────────────
#
# ⚠️ 해당 git commit 호출에 붙은 플래그만 봅니다(&&, ||, ;, 줄바꿈에서 끊습니다).
# 안 그러면 같은 블록에 있는 `grep -n`, `sort -n`, `head -n` 까지 걸립니다.
# 커밋 메시지 속 `-n` 은 위에서 strip_message_args() 가 이미 비웠습니다.
COMMIT_SKIP = re.compile(r"git\s+commit\b[^&|;\n]*?(--no-verify|\s-n\b)")
if COMMIT_SKIP.search(cmd):
    deny(
        "git commit 에서 검사를 건너뛰려(--no-verify) 했습니다. "
        "검사가 막는 데는 이유가 있습니다.\n\n"
        "규칙: 막히면 기준을 낮추지 말고 '못했다'고 보고합니다.\n\n"
        "검사가 실패하면 원인을 고치거나, 못 고치겠으면 무엇이 막고 있는지 "
        "사장님께 보고하세요. 우회해서 커밋하지 않습니다."
    )

sys.exit(0)
