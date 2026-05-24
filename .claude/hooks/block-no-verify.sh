#!/usr/bin/env bash
# git の --no-verify / --no-gpg-sign をブロックする PreToolUse フック。
# 標準入力で渡されるツール呼び出し JSON の command フィールドを検査する。
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

case "$command" in
  *"--no-verify"*|*"--no-gpg-sign"*)
    echo "Blocked: --no-verify / --no-gpg-sign は使用禁止。pre-commit フックが失敗したら原因を直すこと。" >&2
    exit 2
    ;;
esac

exit 0
