#!/usr/bin/env bash
# Cockpit SessionEnd Hook — 세션 종료 시 conversation-based recap.
#
# 동작:
#   Claude Code 세션이 끝날 때 실행됨. 세션 transcript 전체를 읽어 사용자/
#   어시스턴트의 텍스트 메시지만 추출 → `claude -p` 로 한 단락 요약 생성 →
#   cockpit daily.md 에 1건 기록. 의미 있는 작업 없었던 세션(잡담·질문만)은
#   LLM 이 "NONE" 으로 판정 → 기록 스킵.
#
# 특징:
#   - per-turn Stop 훅과 분리. Stop 은 no-op, 로그는 여기서만 남김.
#   - 도구 사용 여부와 무관 — 대화 자체로 판단 (설계·기획·조사·결정도 포함)
#   - COCKPIT_HOOK_LLM=0 이면 비활성화
#   - claude CLI 없으면 스킵

input=$(cat 2>/dev/null)

# 비활성화
[ "${COCKPIT_HOOK_LLM:-1}" = "0" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0

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

# 대화 발췌 (사용자/어시스턴트 텍스트만, tool_result/tool_use 제외, 최근 ~10KB)
excerpt=$(python3 - "$transcript" <<'PY' 2>/dev/null
import sys, json, os
path = sys.argv[1]
try:
    lines = open(path, encoding="utf-8").read().splitlines()
except Exception:
    sys.exit(0)

def extract_text(ev):
    """user/assistant 이벤트에서 실제 사람/AI 텍스트만 뽑음. tool_use·tool_result 제외."""
    t = ev.get("type")
    if t not in ("user", "assistant"):
        return None
    msg = ev.get("message")
    if not isinstance(msg, dict):
        return None
    content = msg.get("content")
    # user content 가 문자열이면 그대로 사용자 발화
    if t == "user" and isinstance(content, str):
        return ("user", content)
    # list 형태
    if isinstance(content, list):
        parts = []
        has_tool_result = False
        for c in content:
            if not isinstance(c, dict):
                if isinstance(c, str):
                    parts.append(c)
                continue
            ct = c.get("type")
            if ct == "text" and isinstance(c.get("text"), str):
                parts.append(c["text"])
            elif ct == "tool_result":
                has_tool_result = True
            # tool_use 는 완전히 무시
        # user type 이면서 tool_result 뿐이면 이건 실제 사용자 발화 아님 → 스킵
        if t == "user" and has_tool_result and not parts:
            return None
        text = "\n".join(p.strip() for p in parts if p and p.strip())
        if not text:
            return None
        return (t, text)
    return None

dialogue = []
for line in lines:
    try:
        e = json.loads(line)
    except Exception:
        continue
    got = extract_text(e)
    if not got:
        continue
    role, text = got
    dialogue.append(f"[{role}] {text.strip()}")

# 너무 길면 뒤에서부터 ~10KB 로 자름
MAX_CHARS = 10_000
joined = "\n\n".join(dialogue)
if len(joined) > MAX_CHARS:
    joined = "...(앞부분 생략)...\n\n" + joined[-MAX_CHARS:]

if not joined.strip():
    sys.exit(0)

# 메시지 개수가 너무 적으면(진짜 짧은 세션) 스킵
if len(dialogue) < 3:
    sys.exit(0)

print(joined)
PY
)

[ -z "$excerpt" ] && exit 0

# 프롬프트
prompt_header='다음은 Claude Code 한 세션의 대화 기록입니다. 사용자가 **실제로 수행한 작업·결정·발견** 을 회고용으로 요약하세요.

규칙:
- 한국어 2~4문장 한 단락.
- 도구 이름(Edit/Write/MCP/Bash 등) 언급 금지.
- 결과 지향: 주요 결정·산출물·문제 해결 중심으로 서술.
- 잡담·단순 질문만 있었고 의미 있는 작업이 없으면 정확히 "NONE" 한 단어만 출력.
- 불릿·머리말·따옴표 없이 문단만 출력.

대화 기록:'

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

# LLM 호출 (동기 — 세션 끝 시점이라 UX 블록 상관 없음)
full_prompt=$(printf "%s\n\n%s\n\n요약:" "$prompt_header" "$excerpt")
summary=$(printf "%s" "$full_prompt" | claude -p --output-format text 2>/dev/null | python3 -c '
import sys
t = sys.stdin.read().replace("\r", "").strip()[:600]
# 줄바꿈 → 공백, 연속 공백 축약
t = " ".join(t.split())
print(t)
' 2>/dev/null)

# NONE 판정 또는 빈 결과 → 스킵
case "$summary" in
  ""|"NONE"|"none"|"None"|"NONE."|"None.") exit 0 ;;
esac

# title 에 넣기엔 길 수 있으므로 title 은 짧은 도입부, details 로 전체 담기
# 첫 문장까지만 title 로, 나머지는 details 로 분리 (가독성)
title=$(printf '%s' "$summary" | python3 -c '
import sys, re
text = sys.stdin.read().strip()
# 첫 마침표/물음표까지를 title 로
m = re.split(r"(?<=[.!?。])\s+", text, maxsplit=1)
head = m[0] if m else text
if len(head) > 140:
    head = head[:137] + "…"
print(head)
')
# details 는 전체 원문
body=$(python3 -c '
import json, sys
print(json.dumps({
  "title": sys.argv[1][:140],
  "details": sys.argv[2][:1000],
  "tags": "auto,recap,session"
}))
' "$title" "$summary" 2>/dev/null)

[ -z "$body" ] && exit 0

curl -s -m 5 -X POST "http://127.0.0.1:${port}/api/insights/daily" \
  -H "content-type: application/json" \
  -d "$body" \
  -o /dev/null 2>/dev/null || true

exit 0
