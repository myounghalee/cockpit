#!/usr/bin/env bash
# Cockpit Stop Hook v3 — LLM 요약형 침묵 로거.
#
# 동작:
#   Claude Code 가 턴을 마치는 순간 실행됨.
#   이번 턴의 tool_use 이벤트를 스캔해 구조화된 actions 목록을 만든 뒤,
#   `claude -p` 를 백그라운드로 호출해 "무엇을 했는지" 한 줄 요약을 생성.
#   요약 결과를 cockpit daily.md 에 조용히 기록. Claude Code 대화엔 아무 것도 표시 안 됨.
#
# 핵심:
#   - decision=block 안 씀 → UI 노이즈 0
#   - 백그라운드 비동기 → 사용자 UX 블록 0
#   - LLM 실패/타임아웃 → 기계적 fallback 요약으로 대체
#   - COCKPIT_HOOK_LLM=0 이면 LLM 호출 스킵하고 fallback 만 사용
#   - daily_log_activity 가 이 턴에 이미 수동 호출됐으면 중복 방지 위해 exit

input=$(cat 2>/dev/null)

# transcript_path 추출
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

# 이번 턴의 tool_use 를 구조화해서 두 가지를 뽑아냄:
#   FALLBACK: 기계적 한 줄 요약 (LLM 실패시 사용)
#   ACTIONS:  LLM 프롬프트용 상세 actions 텍스트 (여러 줄)
#   SKIP:     이 턴을 스킵해야 하는 경우 "1"
extracted=$(python3 - "$transcript" <<'PY' 2>/dev/null
import sys, json, os
path = sys.argv[1]
try:
    lines = open(path, encoding="utf-8").read().splitlines()
except Exception:
    sys.exit(0)

def is_real_user_message(ev):
    if ev.get("type") != "user":
        return False
    msg = ev.get("message")
    if not isinstance(msg, dict):
        return False
    content = msg.get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        if not content:
            return False
        first = content[0]
        if isinstance(first, dict) and first.get("type") == "tool_result":
            return False
        return True
    return False

last_user = -1
last_user_text = ""
for i in range(len(lines) - 1, -1, -1):
    try:
        e = json.loads(lines[i])
    except Exception:
        continue
    if is_real_user_message(e):
        last_user = i
        msg = e.get("message") or {}
        c = msg.get("content")
        if isinstance(c, str):
            last_user_text = c
        elif isinstance(c, list):
            for item in c:
                if isinstance(item, dict) and item.get("type") == "text":
                    last_user_text = item.get("text", "")
                    break
                if isinstance(item, str):
                    last_user_text = item
                    break
        break
if last_user < 0:
    sys.exit(0)

STATE_MCP = {
    "memo_create", "memo_update", "memo_complete",
    "ticket_create", "ticket_update",
    "daily_log_activity",
}

edits, writes, bash_items, mcp_items = [], [], [], []
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
            cmd = inp.get("command", "") or ""
            low = cmd.lower()
            if "git commit" in low or "git push" in low:
                # 커밋 메시지 추출 시도 (-m "..." 또는 HEREDOC)
                msg_text = None
                import re
                m = re.search(r"""git\s+commit[^"']*-m\s+["'](.+?)["']""", cmd, re.DOTALL)
                if m:
                    msg_text = m.group(1).strip().split("\n")[0][:120]
                else:
                    m = re.search(r"""<<'EOF'\s*\n(.+?)\n\s*EOF""", cmd, re.DOTALL)
                    if m:
                        msg_text = m.group(1).strip().split("\n")[0][:120]
                if msg_text:
                    bash_items.append({"kind": "git_commit", "msg": msg_text})
                elif "git push" in low:
                    bash_items.append({"kind": "git_push", "msg": cmd.strip().split("\n")[0][:80]})
        elif name.startswith("mcp__cockpit__") or name.startswith("mcp__Cockpit__"):
            leaf = name.split("__")[-1]
            if leaf == "daily_log_activity":
                daily_log_called = True
                continue
            if leaf in STATE_MCP:
                mcp_items.append({"leaf": leaf, "input": inp})

# 이미 수동 로그 있으면 중복 방지
if daily_log_called:
    print("SKIP=1")
    sys.exit(0)

# 어떤 action 도 없으면 스킵
if not edits and not writes and not bash_items and not mcp_items:
    sys.exit(0)

# ── FALLBACK (기계적) ─────────────────────────────────────
fb_parts = []
if edits:
    u = list(dict.fromkeys(edits))
    more = f" +{len(u)-3}" if len(u) > 3 else ""
    fb_parts.append(f"파일 편집: {', '.join(u[:3])}{more}")
if writes:
    u = list(dict.fromkeys(writes))
    more = f" +{len(u)-3}" if len(u) > 3 else ""
    fb_parts.append(f"파일 작성: {', '.join(u[:3])}{more}")
if bash_items:
    msgs = [b.get("msg", "") for b in bash_items if b.get("msg")]
    if msgs:
        more = f" (+{len(msgs)-1})" if len(msgs) > 1 else ""
        fb_parts.append(f"커밋: {msgs[0]}{more}")
if mcp_items:
    names = sorted({m["leaf"] for m in mcp_items})
    fb_parts.append("메모/티켓: " + ",".join(names))
fallback = " / ".join(fb_parts)

# ── ACTIONS (LLM 프롬프트용) ─────────────────────────────
action_lines = []
if edits:
    u = list(dict.fromkeys(edits))
    action_lines.append(f"- 파일 편집: {', '.join(u)}")
if writes:
    u = list(dict.fromkeys(writes))
    action_lines.append(f"- 파일 신규 작성: {', '.join(u)}")
for b in bash_items:
    if b.get("kind") == "git_commit":
        action_lines.append(f"- Git 커밋: \"{b.get('msg','')}\"")
    elif b.get("kind") == "git_push":
        action_lines.append(f"- Git push")
for m in mcp_items:
    leaf = m["leaf"]
    inp = m.get("input") or {}
    if leaf == "memo_create":
        title = inp.get("title", "")
        tags = inp.get("tags", "")
        action_lines.append(f"- 메모 생성: \"{title}\"" + (f" (tags: {tags})" if tags else ""))
    elif leaf == "memo_update":
        title = inp.get("title")
        mid = inp.get("id", "")
        if title:
            action_lines.append(f"- 메모 수정: \"{title}\"")
        else:
            action_lines.append(f"- 메모 수정 (id={mid[:12]}…)")
    elif leaf == "memo_complete":
        action_lines.append(f"- 메모 완료 체크 (id={inp.get('id','')[:12]}…)")
    elif leaf == "ticket_create":
        title = inp.get("title", "")
        ttype = inp.get("type", "")
        action_lines.append(f"- 티켓 생성: \"{title}\"" + (f" [{ttype}]" if ttype else ""))
    elif leaf == "ticket_update":
        title = inp.get("title") or inp.get("id", "")
        action_lines.append(f"- 티켓 수정: \"{title}\"")

actions_text = "\n".join(action_lines)
user_hint = last_user_text.strip().replace("\n", " ")[:200]

# 결과 출력 — bash 쪽에서 파싱하기 쉽게 구분자 사용
# NULL 문자는 bash 에서 까다로우니 명시적 sentinel 사용
print("FALLBACK<<<" + fallback)
print("USERHINT<<<" + user_hint)
print("ACTIONS<<<")
print(actions_text)
print(">>>END")
PY
)

# 스킵 신호
if printf '%s' "$extracted" | grep -q '^SKIP=1$'; then
  exit 0
fi

[ -z "$extracted" ] && exit 0

fallback=$(printf '%s' "$extracted" | sed -n 's/^FALLBACK<<<//p')
user_hint=$(printf '%s' "$extracted" | sed -n 's/^USERHINT<<<//p')
# ACTIONS 블록 (ACTIONS<<< 다음 줄부터 >>>END 이전까지)
actions_text=$(printf '%s' "$extracted" | awk '/^ACTIONS<<<$/{flag=1;next}/^>>>END$/{flag=0}flag')

[ -z "$fallback" ] && exit 0

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

# LLM 비활성화면 fallback 바로 기록하고 종료
if [ "${COCKPIT_HOOK_LLM:-1}" = "0" ]; then
  body=$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1][:140], "tags": "auto,hook"}))' "$fallback" 2>/dev/null)
  [ -n "$body" ] && curl -s -m 3 -X POST "http://127.0.0.1:${port}/api/insights/daily" \
    -H "content-type: application/json" -d "$body" -o /dev/null 2>/dev/null || true
  exit 0
fi

# claude CLI 없으면 fallback 만 기록
if ! command -v claude >/dev/null 2>&1; then
  body=$(python3 -c 'import json,sys; print(json.dumps({"title": sys.argv[1][:140], "tags": "auto,hook"}))' "$fallback" 2>/dev/null)
  [ -n "$body" ] && curl -s -m 3 -X POST "http://127.0.0.1:${port}/api/insights/daily" \
    -H "content-type: application/json" -d "$body" -o /dev/null 2>/dev/null || true
  exit 0
fi

# 백그라운드로 LLM 요약 수행 후 기록
# - 60초 타임아웃: 사용자 턴 간 지연과 무관 (훅은 이미 종료됨)
# - 실패시 fallback 사용
nohup bash -c '
  PROMPT_HEADER="다음은 사용자가 Claude Code 한 턴에서 수행한 작업 목록입니다. 이 작업을 **한국어 한 줄(50~80자)** 로 요약하세요.\n\n규칙:\n- 도구 이름(Edit, Write, Bash, MCP 등) 은 언급하지 마세요.\n- 결과 지향으로 \"무엇을 했는지\" 를 간결히.\n- 불릿/머리말/따옴표 없이 한 문장만 출력.\n- 80자 이내."

  PROMPT_BODY="사용자 직전 메시지:\n$1\n\n수행한 작업:\n$2"
  PROMPT=$(printf "%b\n\n%s" "$PROMPT_HEADER" "$PROMPT_BODY")

  # claude -p 실행 (텍스트 출력). 타임아웃 60s.
  SUMMARY=$(printf "%s" "$PROMPT" | claude -p --output-format text 2>/dev/null | head -c 200 | tr -d "\r\n\"" | sed "s/[[:space:]]\+/ /g" | sed "s/^[[:space:]]*//;s/[[:space:]]*$//")

  if [ -z "$SUMMARY" ]; then
    SUMMARY="$3"
  fi

  BODY=$(python3 -c "import json,sys; print(json.dumps({\"title\": sys.argv[1][:140], \"tags\": \"auto,hook\"}))" "$SUMMARY" 2>/dev/null)
  [ -n "$BODY" ] && curl -s -m 5 -X POST "http://127.0.0.1:'${port}'/api/insights/daily" \
    -H "content-type: application/json" -d "$BODY" -o /dev/null 2>/dev/null || true
' _ "$user_hint" "$actions_text" "$fallback" </dev/null >/dev/null 2>&1 &
disown 2>/dev/null || true

exit 0
