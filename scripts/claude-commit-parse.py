#!/usr/bin/env python3
"""
Cockpit commit-hook parser.

stdin 으로 Claude Code PostToolUse 이벤트 JSON 을 받아:
  - tool_name == "Bash"
  - tool_input.command 에 `git commit -m "..."`
  - tool_response.is_error != True
모두 참이면 stdout 에 "COMMIT|<message>" 출력. 아니면 exit 0.

push 는 기록하지 않음 — 어떤 커밋이 올라갔는지는 이미 개별 COMMIT 로그로
드러나므로, "git push origin main" 같은 전송 커맨드 자체를 또 찍는 건
"내가 뭘 했는지" 회고 관점에서 노이즈.

쉘 훅 스크립트에서 heredoc 으로 파이썬 코드를 인라인하다가
quote 충돌 이슈가 반복돼 별도 파일로 분리함.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys


def resolve_project_name(hook_data: dict) -> str:
    """hook 입력의 cwd 기반으로 git repo basename 을 반환. 실패 시 빈 문자열."""
    cwd = hook_data.get("cwd") or ""
    if not cwd:
        cwd = os.getcwd()
    try:
        out = subprocess.check_output(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
        return os.path.basename(out.decode("utf-8").strip())
    except Exception:
        return ""


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
        # HEREDOC 먼저 시도 — Claude Code 가 멀티라인 메시지 쓸 때 쓰는 패턴:
        #   git commit -m "$(cat <<'EOF'\n<실제 메시지>\nEOF\n)"
        # 이 경우 단순 -m "..." regex 는 "$(cat <<" 를 메시지로 오인하므로 HEREDOC 우선.
        m = re.search(r"<<[\-']?([A-Z]+)[\-']?\s*\n(.+?)\n\s*\1", cmd, re.DOTALL)
        if m:
            commit_msg = m.group(2).strip().split("\n")[0][:140]
        else:
            # -m "msg"  또는  -m 'msg' (단일 라인 메시지)
            m = re.search(r'''git\s+commit[^"']*-m\s+["'](.+?)["']''', cmd, re.DOTALL)
            if m:
                commit_msg = m.group(1).strip().split("\n")[0][:140]

    if commit_msg:
        project = resolve_project_name(data)
        # 구분자 | 로 msg|project 출력 (project 빈 문자열 허용)
        print("COMMIT|" + commit_msg + "|" + project)
        return
    # push 는 의도적으로 무시


if __name__ == "__main__":
    main()
