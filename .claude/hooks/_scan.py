"""훅들이 공통으로 쓰는 부분 — 검사 대상에서 '글'을 걷어내고 '명령'만 남깁니다.

⚠️ 왜 필요한가

훅은 명령줄 전체를 하나의 문자열로 받습니다. 그래서 heredoc 본문(커밋 메시지, 파일
내용)에 적힌 **설명**까지 실행될 명령으로 오인합니다. 실제로 "실패를 덮지 말라"고
적은 커밋 메시지가 "실패를 덮으려 한다"는 이유로 차단됐습니다.

이건 규칙을 느슨하게 만드는 게 아니라, **검사 대상을 실제 명령으로 바로잡는 것**입니다.
글에 무엇이 적혀 있든 규칙 자체는 그대로 빡빡합니다.
"""

import json
import re
import sys

_HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")


def strip_heredocs(cmd: str) -> str:
    """heredoc 본문을 걷어냅니다. 그건 실행될 명령이 아니라 글입니다."""
    lines = cmd.split("\n")
    kept, i = [], 0
    while i < len(lines):
        line = lines[i]
        kept.append(line)
        m = _HEREDOC.search(line)
        i += 1
        if not m:
            continue
        tag = m.group(2)
        while i < len(lines) and lines[i].strip() != tag:
            i += 1
        i += 1  # 닫는 태그 줄도 건너뜁니다
    return "\n".join(kept)


def read_command() -> str:
    """stdin의 훅 입력에서 실제로 실행될 명령만 돌려줍니다."""
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return ""
    cmd = (payload.get("tool_input") or {}).get("command") or ""
    return strip_heredocs(cmd)


def deny(reason: str) -> None:
    """이 명령을 막고 왜 막았는지, 대신 뭘 해야 하는지 알려줍니다."""
    json.dump({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }, sys.stdout, ensure_ascii=False)
    sys.exit(0)
