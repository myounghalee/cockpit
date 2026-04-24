#!/usr/bin/env bash
# Cockpit PostToolUse Hook — git commit/push 를 실시간으로 daily.md 에 기록.
#
# PostToolUse(Bash) 매칭으로 등록됨. Bash 툴 호출 후 이 훅이 stdin 으로
# {tool_name, tool_input, tool_response, ...} JSON 을 받는다. `git commit -m "..."`
# 또는 `git push` 가 감지되고 성공(tool_response.is_error != true)이면
# cockpit daily API 로 한 줄 기록.
#
# 파싱 로직은 옆 파일(claude-commit-parse.py) 로 분리해 쉘 quoting 이슈 회피.

input=$(cat 2>/dev/null)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARSER="$SCRIPT_DIR/claude-commit-parse.py"

[ ! -f "$PARSER" ] && exit 0

result=$(printf '%s' "$input" | python3 "$PARSER" 2>/dev/null)
[ -z "$result" ] && exit 0

# 포맷: COMMIT|<msg>|<project_name>  (project 는 비어있을 수 있음)
kind="${result%%|*}"
rest="${result#*|}"
msg="${rest%|*}"
project="${rest##*|}"
# 만약 msg 에 '|' 가 포함돼 있으면 위 파싱이 잘못 나올 수 있으나, 커밋
# 메시지에 '|' 가 흔치 않아 감수.

port=8282
pf="$HOME/.cockpit-userdata/last-port"
if [ -f "$pf" ]; then
  p=$(tr -d '[:space:]' < "$pf" 2>/dev/null)
  case "$p" in
    ''|*[!0-9]*) : ;;
    *) port=$p ;;
  esac
fi

case "$kind" in
  COMMIT) title="커밋: $msg"; tags="auto,commit" ;;
  *) exit 0 ;;
esac

# projectName 은 비어있으면 null 로 전송해 badge 생략.
body=$(python3 -c '
import json, sys
proj = sys.argv[3] if len(sys.argv) > 3 else ""
payload = {"title": sys.argv[1][:180], "tags": sys.argv[2]}
if proj:
    payload["projectName"] = proj
print(json.dumps(payload))
' "$title" "$tags" "$project" 2>/dev/null)
[ -z "$body" ] && exit 0

curl -s -m 3 -X POST "http://127.0.0.1:${port}/api/insights/daily" \
  -H "content-type: application/json" \
  -d "$body" \
  -o /dev/null 2>/dev/null || true

exit 0
