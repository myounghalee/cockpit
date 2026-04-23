#!/usr/bin/env bash
# Cockpit Stop Hook v4 — no-op.
#
# 이전 버전들(v1~v3)은 턴 단위로 daily.md 에 로그를 남겼으나,
# 대화 기반 recap (세션 단위 요약) 으로 전환하면서 Stop 훅은 비활성화됨.
# 실제 로그는 claude-sessionend-hook.sh 가 SessionEnd 시점에 전담.
#
# 이 스크립트는 settings.json 에 등록된 경로와의 호환성을 위해 유지되며,
# 아무 것도 하지 않고 exit 0.

exit 0
