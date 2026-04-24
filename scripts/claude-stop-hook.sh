#!/usr/bin/env bash
# Cockpit Stop Hook v5 — Claude Code recap 이벤트 감지 → daily.md 기록.
#
# 매 턴 종료 시 transcript 를 훑어 아직 기록되지 않은 recap 이벤트를 찾아
# daily.md 에 POST 한다. 두 종류 모두 처리:
#   (a) 자동 away_summary — Claude Code 가 idle 상태에서 생성
#   (b) 수동 /recap — 사용자가 슬래시 커맨드로 실행
#
# 세션별 state 파일(~/.cockpit-userdata/recap-state/<session_id>.json)에
# 이미 로그한 recap UUID 를 저장해 매 턴 반복 로그 방지. 파싱·state 갱신은
# claude-recap-parse.py 가 담당.
#
# SessionEnd 훅과 공존 — SessionEnd 는 LLM 으로 세션 전체를 한 단락 요약
# (별도 관점), 이 훅은 Claude 자신이 만든 recap 본문을 그대로 보존.

input=$(cat 2>/dev/null)

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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARSER="$SCRIPT_DIR/claude-recap-parse.py"
[ ! -f "$PARSER" ] && exit 0

# 파서가 새로 등장한 recap 들을 아래 포맷으로 출력:
#   ---UUID:<uuid>---
#   <recap 본문 멀티라인>
#   ---NEXT---
#   ---UUID:<uuid>---
#   ...
payload=$(python3 "$PARSER" "$transcript" 2>/dev/null)
[ -z "$payload" ] && exit 0

# cockpit 포트
port=8282
pf="$HOME/.cockpit-userdata/last-port"
if [ -f "$pf" ]; then
  p=$(tr -d '[:space:]' < "$pf" 2>/dev/null)
  case "$p" in
    ''|*[!0-9]*) : ;;
    *) port=$p ;;
  esac
fi

# 각 recap 블록을 POST. 별도 파이썬 스크립트(claude-recap-post.py) 로 위임해
# heredoc(script 전달) + pipe(payload) stdin 충돌을 피함.
POSTER="$SCRIPT_DIR/claude-recap-post.py"
if [ -x "$POSTER" ]; then
  printf '%s' "$payload" | python3 "$POSTER" "$port" 2>/dev/null
fi

exit 0
