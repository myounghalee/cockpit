#!/usr/bin/env python3
"""
Cockpit recap POST worker.

stdin 으로 claude-recap-parse.py 의 출력을 받아(--UUID:xxx-- 블록들), 각
블록을 cockpit /api/insights/daily 로 POST.

argv[1] = cockpit 서버 포트
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request


def main() -> None:
    if len(sys.argv) < 2:
        return
    port = sys.argv[1]
    raw = sys.stdin.read()
    if not raw.strip():
        return

    blocks = raw.split("---NEXT---")
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        # UUID 자체에 `-` 가 들어가므로 [^\-]+ 는 쓸 수 없음. lazy 매칭으로 다음 `---` 까지.
        m = re.match(r"^---UUID:(.+?)---\s*\n(.+)$", block, re.DOTALL)
        if not m:
            continue
        text = m.group(2).strip()
        if len(text) < 50:
            continue
        # "No recap available" 등 Claude 의 실패 메시지는 배제
        if re.search(r"No recap available|generation failed", text, re.IGNORECASE):
            continue

        head_match = re.split(r"(?<=[.!?。])\s+", text, maxsplit=1)
        head = head_match[0] if head_match else text
        if len(head) > 140:
            head = head[:137] + "…"

        payload = {
            "title": head,
            "details": text[:1500],
            "tags": "auto,recap,claude",
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/insights/daily",
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=5).read()
        except Exception:
            pass


if __name__ == "__main__":
    main()
