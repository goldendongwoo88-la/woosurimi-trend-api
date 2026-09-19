"""훅들이 공통으로 쓰는 부분 — 검사 대상에서 '글'을 걷어내고 '명령'만 남깁니다.

⚠️ 왜 필요한가

훅은 명령줄 전체를 하나의 문자열로 받습니다. 그래서 heredoc 본문(커밋 메시지, 파일
내용)에 적힌 **설명**까지 실행될 명령으로 오인합니다. 실제로 "실패를 덮지 말라"고
적은 커밋 메시지가 "실패를 덮으려 한다"는 이유로 차단됐습니다.

이건 규칙을 느슨하게 만드는 게 아니라, **검사 대상을 실제 명령으로 바로잡는 것**입니다.
글에 무엇이 적혀 있든 규칙 자체는 그대로 빡빡합니다.

⚠️ 걷어낼 때 지켜야 할 것 — 애매하면 '검사하는 쪽'으로

걷어내다가 실수하면 훅이 통째로 꺼집니다. 실제로 그런 적이 있습니다:
`python3 -c "print('<<EOF')"` 처럼 **따옴표 안에** heredoc처럼 보이는 글자가 있으면,
닫는 태그를 영영 못 찾고 그 뒤 명령을 전부 버려서 `npm test || true` 가 그냥 통과했습니다.

그래서 **닫는 태그를 못 찾으면 아무것도 버리지 않습니다.** 덜 걷어내면 오탐(괜한 차단)이
나고 사람이 알아채지만, 더 걷어내면 훅이 조용히 꺼져서 아무도 모릅니다.
"""

import json
import re
import sys

# <<TAG / <<-TAG / <<'TAG' — 단, <<<TAG(히어스트링)는 heredoc이 아니므로 제외합니다.
_HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")

# 한 줄 안에서도 명령은 여럿일 수 있습니다: cmd1 && cmd2 || cmd3 ; cmd4 | cmd5
_SPLIT = re.compile(r"&&|\|\||;|\||\n")

# 메시지·본문 플래그에 붙은 따옴표 값 — 커밋 메시지 같은 '글'이지 명령이 아닙니다.
#
# ⚠️ 따옴표 **전부**를 비우지는 않습니다. 그러면 `bash -c "npm test || true"` 가
# 그냥 통과합니다. 비우는 건 글이 들어가는 자리로 한정합니다.
_MSG_ARG = re.compile(
    r"((?:^|\s)(?:-m|-F|-t|-b|-d"
    r"|--message|--file|--title|--body|--body-file|--description)[=\s]+)"
    r"('[^']*'|\"[^\"]*\")"
)


def strip_heredocs(cmd: str) -> str:
    """heredoc 본문을 걷어냅니다. 그건 실행될 명령이 아니라 글입니다.

    닫는 태그를 못 찾으면 **아무것도 버리지 않습니다** — 따옴표 안의 가짜 heredoc에
    속아서 뒤쪽 명령을 통째로 놓치는 일을 막기 위해서입니다.
    """
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
        # 닫는 태그가 실제로 있는지 먼저 봅니다.
        close = next((j for j in range(i, len(lines)) if lines[j].strip() == tag), None)
        if close is None:
            continue  # 가짜 heredoc으로 보고 그냥 둡니다 (검사하는 쪽으로)
        i = close + 1  # 본문과 닫는 태그 줄을 건너뜁니다
    return "\n".join(kept)


def split_commands(cmd: str):
    """한 덩어리 문자열을 실제 명령 단위로 쪼갭니다.

    ⚠️ 통째로 검사하면 **한 줄에 있는 올바른 호출이 잘못된 호출을 덮어줍니다.**
    예: `ffprobe -select_streams v:0 ... && ffprobe -show_entries format=duration ...`
    는 앞쪽에 -select_streams 가 있다는 이유로 뒤쪽 위반이 통과했습니다.
    """
    return [p for p in _SPLIT.split(cmd) if p.strip()]


def strip_message_args(text: str) -> str:
    """메시지·본문 플래그에 붙은 따옴표 값을 비웁니다.

    ⚠️ 이게 없으면 `git commit -m "grep -n 지원 추가"` 가 "-n 으로 검사를 건너뛰려 한다"고
    차단됩니다. 커밋 메시지는 글이지 플래그가 아닙니다.

    ⚠️ 따옴표를 전부 비우지는 않습니다. `bash -c "npm test || true"` 는 진짜로 실행되는
    명령이므로 그대로 검사해야 합니다. 덜 걷어내면 오탐이 나서 사람이 알아채지만,
    더 걷어내면 훅이 조용히 꺼집니다.
    """
    return _MSG_ARG.sub(lambda m: m.group(1) + "''", text)


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
