#!/usr/bin/env python3
"""
Cockpit recap-detect parser (state-tracked).

argv[1] transcript 파일 경로를 받아 아래 두 종류 recap 이벤트 중 아직
기록된 적 없는 것들을 stdout 으로 방출:

  1) type="system", subtype="away_summary"
     → Claude Code 가 유휴/away 상태에서 자동 생성한 recap
     → content 필드가 본문

  2) type="user" 에 <command-name>/recap</command-name> 이 있고 바로
     뒤에 type="system", subtype="local_command" 의 content 에
     <local-command-stdout>...</local-command-stdout>
     → 수동 /recap 실행 결과. stdout 본문이 recap.

세션별 state 파일 ~/.cockpit-userdata/recap-state/<session_id>.json 에
이미 로그한 recap UUID 를 저장해 중복 방지.

출력 포맷:
  각 recap 앞에 `---UUID:<uuid>---` 한 줄 + 본문 (multi-line)
  recap 간 구분자는 `---NEXT---`.

hook 쉘 스크립트가 본문 파싱 후 daily.md POST + state 업데이트.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any


def load_state(state_path: str) -> set[str]:
    if not os.path.isfile(state_path):
        return set()
    try:
        with open(state_path, encoding="utf-8") as f:
            data = json.load(f)
        return set(data.get("logged_uuids", []))
    except Exception:
        return set()


def save_state(state_path: str, uuids: set[str]) -> None:
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    try:
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump({"logged_uuids": sorted(uuids)[-500:]}, f)
    except Exception:
        pass


def session_id_from_path(path: str) -> str:
    base = os.path.basename(path)
    if base.endswith(".jsonl"):
        base = base[:-6]
    return base


def extract_recaps(lines: list[str]) -> list[tuple[str, str]]:
    """transcript 라인에서 (uuid, recap_text) 튜플 추출 (중복 제거 전)."""
    events: list[dict[str, Any]] = []
    for line in lines:
        try:
            events.append(json.loads(line))
        except Exception:
            continue

    results: list[tuple[str, str]] = []
    for i, ev in enumerate(events):
        if ev.get("type") != "system":
            continue
        subtype = ev.get("subtype")
        content = ev.get("content") or ""
        uuid = ev.get("uuid") or ""
        if not uuid:
            continue

        # (1) 자동 away_summary
        if subtype == "away_summary" and isinstance(content, str):
            text = content.strip()
            if len(text) >= 50:
                results.append((uuid, text))
            continue

        # (2) 수동 /recap
        if subtype == "local_command" and isinstance(content, str):
            m = re.search(
                r"<local-command-stdout>(.+?)</local-command-stdout>",
                content,
                re.DOTALL,
            )
            if not m:
                continue
            stdout_text = m.group(1).strip()
            # 직전 user 이벤트(최근 몇 개) 에서 /recap 커맨드 확인
            is_recap = False
            for j in range(i - 1, max(-1, i - 5), -1):
                prev = events[j]
                if prev.get("type") != "user":
                    continue
                prev_msg = prev.get("message") or {}
                prev_content = prev_msg.get("content")
                prev_text = (
                    prev_content if isinstance(prev_content, str) else ""
                )
                if "<command-name>/recap</command-name>" in prev_text:
                    is_recap = True
                    break
                # user 메시지 나오면 거기서 stop
                break
            if is_recap and len(stdout_text) >= 50:
                results.append((uuid, stdout_text))

    return results


def main() -> None:
    if len(sys.argv) < 2:
        return
    transcript_path = sys.argv[1]
    try:
        lines = open(transcript_path, encoding="utf-8").read().splitlines()
    except Exception:
        return

    session_id = session_id_from_path(transcript_path)
    state_dir = os.path.expanduser("~/.cockpit-userdata/recap-state")
    state_path = os.path.join(state_dir, f"{session_id}.json")
    logged = load_state(state_path)

    recaps = extract_recaps(lines)
    new_entries = [(u, t) for (u, t) in recaps if u not in logged]
    if not new_entries:
        return

    # 출력
    out = []
    for idx, (uuid, text) in enumerate(new_entries):
        if idx > 0:
            out.append("---NEXT---")
        out.append(f"---UUID:{uuid}---")
        out.append(text)
    sys.stdout.write("\n".join(out))
    sys.stdout.write("\n")

    # state 갱신
    for uuid, _ in new_entries:
        logged.add(uuid)
    save_state(state_path, logged)


if __name__ == "__main__":
    main()
