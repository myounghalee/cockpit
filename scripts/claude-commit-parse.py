#!/usr/bin/env python3
"""
Cockpit commit-hook parser.

stdin 으로 Claude Code PostToolUse 이벤트 JSON 을 받아:
  - tool_name == "Bash"
  - tool_input.command 에 `git commit -m "..."` 또는 `git push`
  - tool_response.is_error != True
모두 참이면 stdout 에 "COMMIT|<message>" 또는 "PUSH|<cmd_first_line>" 출력.
아니면 아무것도 안 찍고 exit 0.

쉘 훅 스크립트에서 heredoc 으로 파이썬 코드를 인라인하다가
quote 충돌 이슈가 반복돼 별도 파일로 분리함.
"""
from __future__ import annotations

import json
import re
import sys


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return

    if not isinstance(data, dict):
        return

    if (data.get("tool_name") or "") != "Bash":
        return

    inp = data.get("tool_input") or {}
    cmd = inp.get("command") or ""
    if not cmd:
        return

    # tool_response 가 실패로 기록됐으면 스킵
    resp = data.get("tool_response")
    if isinstance(resp, dict) and resp.get("is_error") is True:
        return

    low = cmd.lower()

    commit_msg: str | None = None
    if "git commit" in low:
        # -m "msg"  또는  -m 'msg'
        m = re.search(r'''git\s+commit[^"']*-m\s+["'](.+?)["']''', cmd, re.DOTALL)
        if m:
            commit_msg = m.group(1).strip().split("\n")[0][:140]
        else:
            # HEREDOC 스타일 (<<'EOF' ... EOF)
            m = re.search(r"<<[\-']?([A-Z]+)[\-']?\s*\n(.+?)\n\s*\1", cmd, re.DOTALL)
            if m:
                commit_msg = m.group(2).strip().split("\n")[0][:140]

    if commit_msg:
        print("COMMIT|" + commit_msg)
        return

    if "git push" in low:
        first = cmd.strip().split("\n")[0][:100]
        print("PUSH|" + first)
        return


if __name__ == "__main__":
    main()
