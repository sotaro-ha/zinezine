#!/usr/bin/env bash
# 設定ファイルと秘密情報ファイルの編集をブロックする PreToolUse フック。
# Edit/Write の対象パスを検査する。意図的な変更が必要なときはユーザーがこのフックを一時無効化する。
set -euo pipefail

input="$(cat)"
path="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"

base="$(basename "$path")"

case "$base" in
  biome.json|biome.jsonc|.env|.env.*|tsconfig.json)
    echo "Blocked: $base はルール/秘密情報の根幹。編集が必要ならユーザーに確認し、決定を memory/decisions.md に残すこと。" >&2
    exit 2
    ;;
esac

# サービスアカウント JSON らしきファイル名もブロック
case "$base" in
  *serviceAccount*.json|*firebase-adminsdk*.json)
    echo "Blocked: $base は Firebase 秘密鍵の可能性。コミットせず Vercel 環境変数で管理すること。" >&2
    exit 2
    ;;
esac

exit 0
