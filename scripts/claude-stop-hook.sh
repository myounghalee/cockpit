#!/usr/bin/env bash
# Cockpit Stop Hook v2 — 침묵형 자동 로거.
#
# 동작:
#   Claude Code 가 턴을 마치는 순간 실행됨. transcript 의 이번 턴 tool_use 를 스캔해
#   파일 수정(Edit/Write/NotebookEdit), git commit/push, cockpit MCP state-change 호출이
#   있었으면 기계적 한 줄 요약을 cockpit API 로 직접 기록. 없으면 아무 것도 안 함.
#
# 특징:
#   - decision=block 안 씀 → Claude Code 대화에 전혀 표시 안 됨
#   - Claude 에게 리마인더 주입 없음 → 매 턴 "스킵" 같은 출력도 없음
#   - 이 턴에 daily_log_activity 가 이미 호출되었으면 중복 로깅 방지 위해 스킵
#
# 제거:
#   ~/.claude/settings.json 의 hooks.Stop 에서 이 스크립트 엔트리 삭제.

input=$(cat 2>/dev/null)

# 이번 turn 의 transcript_path 추출
transcript=$(printf '%s' "$input" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get("transcript_path") or "")
except Exception:
    pass
' 2>/dev/null)

[ -z "$transcript" ] && exit 0
[ ! -f "$transcript" ] && exit 0

# 이번 턴(마지막 user 메시지 이후)의 tool_use 스캔 → 한 줄 요약
summary=$(python3 - "$transcript" <<'PY' 2>/dev/null
import sys, json, os
path = sys.argv[1]
try:
    lines = open(path, encoding="utf-8").read().splitlines()
except Exception:
    sys.exit(0)

# 가장 최근 user 이벤트 위치 찾기 (그 다음부터가 "이번 턴")
last_user = -1
for i in range(len(lines) - 1, -1, -1):
    try:
        e = json.loads(lines[i])
    except Exception:
        continue
    if e.get("type") == "user":
        last_user = i
        break
if last_user < 0:
    sys.exit(0)

STATE_MCP = {
    "memo_create", "memo_update", "memo_complete",
    "ticket_create", "ticket_update",
    "daily_log_activity",
}

edits, writes, bash_cmds, mcp_calls = [], [], [], []
daily_log_called = False

for line in lines[last_user + 1:]:
    try:
        e = json.loads(line)
    except Exception:
        continue
    msg = e.get("message")
    if not isinstance(msg, dict):
        continue
    content = msg.get("content")
    if not isinstance(content, list):
        continue
    for c in content:
        if not isinstance(c, dict) or c.get("type") != "tool_use":
            continue
        name = c.get("name", "")
        inp = c.get("input") or {}
        if name == "Edit":
            fp = inp.get("file_path", "")
            if fp:
                edits.append(os.path.basename(fp))
        elif name == "Write":
            fp = inp.get("file_path", "")
            if fp:
                writes.append(os.path.basename(fp))
        elif name == "NotebookEdit":
            fp = inp.get("notebook_path", "")
            if fp:
                writes.append(os.path.basename(fp))
        elif name == "Bash":
            cmd = inp.get("command", "")
            low = cmd.lower()
            if "git commit" in low or "git push" in low:
                bash_cmds.append(cmd.strip().split("\n")[0][:80])
        elif name.startswith("mcp__cockpit__") or name.startswith("mcp__Cockpit__"):
            leaf = name.split("__")[-1]
            if leaf == "daily_log_activity":
                daily_log_called = True
            if leaf in STATE_MCP:
                mcp_calls.append(leaf)

# Claude 가 이 턴에 이미 수동으로 daily_log_activity 를 썼다면 중복 기록 방지
if daily_log_called:
    sys.exit(0)

parts = []
if edits:
    u = list(dict.fromkeys(edits))
    more = f" +{len(u)-3}" if len(u) > 3 else ""
    parts.append(f"Edit: {', '.join(u[:3])}{more}")
if writes:
    u = list(dict.fromkeys(writes))
    more = f" +{len(u)-3}" if len(u) > 3 else ""
    parts.append(f"Write: {', '.join(u[:3])}{more}")
if bash_cmds:
    more = f" (+{len(bash_cmds)-1})" if len(bash_cmds) > 1 else ""
    parts.append(f"Git: {bash_cmds[0]}{more}")
if mcp_calls:
    parts.append("MCP: " + ",".join(sorted(set(mcp_calls))))

if not parts:
    sys.exit(0)

print(" / ".join(parts))
PY
)

[ -z "$summary" ] && exit 0

# cockpit 포트 찾기 (last-port 파일 우선, 없으면 8282)
port=8282
pf="$HOME/.cockpit-userdata/last-port"
if [ -f "$pf" ]; then
  p=$(tr -d '[:space:]' < "$pf" 2>/dev/null)
  case "$p" in
    ''|*[!0-9]*) : ;;
    *) port=$p ;;
  esac
fi

# JSON body 안전하게 구성
body=$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1][:140], "tags": "auto,hook"}))' "$summary" 2>/dev/null)
[ -z "$body" ] && exit 0

# 조용히 POST. 실패해도 침묵.
curl -s -m 3 -X POST "http://127.0.0.1:${port}/api/insights/daily" \
  -H "content-type: application/json" \
  -d "$body" \
  -o /dev/null 2>/dev/null || true

exit 0
