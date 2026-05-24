# Claude Code ハーネス セキュリティ設定（手動適用してください）

Claude Code はエージェント自身の起動設定（`.claude/settings.json` やフック）を
**エージェント自身が書き換えること**を安全装置でブロックします。
そのため以下の 2 ファイルは、あなた（人間）が手動で作成・確認してください。

これらは npm サプライチェーン攻撃やプロンプトインジェクションが、開発中に
危険なコマンド実行・資格情報読み取りへ発展するのを防ぐための多層防御です。

---

## 1. `.claude/settings.json`（チーム共有・コミット推奨）

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Bash(npm install:*)",
      "Bash(npm i:*)",
      "Bash(npx:*)",
      "Bash(pnpm dlx:*)",
      "Bash(pnpm add:*)",
      "Bash(yarn add:*)",
      "Bash(pip install:*)",
      "Read(.env)",
      "Read(.env.*)",
      "Read(~/.npmrc)",
      "Read(~/.aws/**)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gcloud/**)"
    ],
    "ask": [
      "Bash(npm:*)"
    ]
  },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowedDomains": [
        "registry.npmjs.org",
        "npmjs.com",
        "github.com",
        "objects.githubusercontent.com"
      ]
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-risky-bash.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 効果
- **deny**: `curl`/`wget`、各種パッケージマネージャの install/add、`.env` や
  `~/.aws` `~/.ssh` `~/.npmrc` の読み取りを**完全に禁止**（deny は ask/allow より優先）。
  `Bash(npm install:*)` の `:*` は末尾ワイルドカードで `Bash(npm install *)` と等価。
  `Read(.env)` は配下すべての `.env` にマッチ（gitignore 記法）。
- **ask**: その他の `npm` サブコマンド（`run`/`ci`/`audit` など）は毎回確認を挟む。
- **sandbox**: Bash の子プロセスを OS レベルで隔離（macOS は Seatbelt）。
  ネットワークは許可ドメインのみ。万一プロンプトインジェクションで判断を奪われても、
  サンドボックス境界が外部流出を防ぐ。
- **hook**: 下記スクリプトで `curl|sh` 等の危険パターンを実行前にブロック。

> sandbox はプラットフォーム依存です。Linux では `bubblewrap` と `socat` が必要
> （`sudo apt-get install bubblewrap socat`）。問題が出る場合は `"enabled": false` で
> 一旦無効化し、permissions と hook だけでも有効にしてください。

---

## 2. `.claude/hooks/block-risky-bash.sh`（実行権限を付与）

```bash
#!/usr/bin/env bash
# PreToolUse(Bash) フック: サプライチェーン攻撃でよく使われる危険パターンを
# 実行前にブロックする。exit 2 でツール呼び出しを停止する。
set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | (command -v jq >/dev/null && jq -r '.tool_input.command // ""' || cat))"

# 危険パターン（パイプ実行・無検証のリモート実行・スクリプト無効化解除など）
patterns=(
  'curl[^|]*\|[[:space:]]*(ba)?sh'   # curl ... | sh
  'wget[^|]*\|[[:space:]]*(ba)?sh'   # wget ... | sh
  '--ignore-scripts[[:space:]]*=?[[:space:]]*false'  # ignore-scripts の無効化
  'npm[[:space:]]+(install|i|ci)[^&|;]*--foreground-scripts'
  'eval[[:space:]]+\$\('              # eval $(...)
)

for p in "${patterns[@]}"; do
  if printf '%s' "$cmd" | grep -Eiq "$p"; then
    echo "Blocked by block-risky-bash.sh: pattern '$p' matched." >&2
    echo "Command: $cmd" >&2
    exit 2
  fi
done

exit 0
```

作成後、実行権限を付与:

```bash
chmod +x .claude/hooks/block-risky-bash.sh
```

---

## 適用手順まとめ

```bash
mkdir -p .claude/hooks
# 上記 2 ファイルをエディタで作成して内容を貼り付け
chmod +x .claude/hooks/block-risky-bash.sh
# Claude Code を再起動して /permissions で deny ルールが読み込まれたか確認
```

`.claude/settings.local.json`（個人用・gitignore 済み）で各自の上書きが可能ですが、
**deny ルールはどのスコープでも優先**されるため、上書きで緩めることはできません。

---

## 3. `.claude/hooks.json`（vibemayfes 流ハーネスのフック・コミット推奨）

`vibemayfes` 構造踏襲で導入するフック。Edit/Write 後の自動整形、セッション終了時の検証、危険操作のブロック。
（`settings.json` の `hooks` に直接書いてもよいが、`vibemayfes` は `.claude/hooks.json` に分離している。Claude Code v2.1+ は `.claude/hooks.json` を自動ロードする。）

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx --no-install biome check --write --no-errors-on-unmatched . 2>/dev/null || true" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "npm run check --if-present" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/block-no-verify.sh" }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/protect-configs.sh" }
        ]
      }
    ]
  }
}
```

> 注: `npx --no-install` は `.npmrc` の deny（`npx` 禁止）や `ignore-scripts` と干渉しない（既にローカルにある biome を呼ぶだけで、インストールはしない）。気になる場合は `./node_modules/.bin/biome` 直叩きに置き換えてよい。

## 4. `.claude/hooks/block-no-verify.sh`

```bash
#!/usr/bin/env bash
# git の --no-verify / --no-gpg-sign をブロックする PreToolUse フック。
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

case "$command" in
  *"--no-verify"*|*"--no-gpg-sign"*)
    echo "Blocked: --no-verify / --no-gpg-sign は使用禁止。pre-commit が失敗したら原因を直すこと。" >&2
    exit 2
    ;;
esac

exit 0
```

## 5. `.claude/hooks/protect-configs.sh`

```bash
#!/usr/bin/env bash
# 設定ファイルと秘密情報ファイルの編集をブロックする PreToolUse フック。
set -euo pipefail

input="$(cat)"
path="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"
base="$(basename "$path")"

case "$base" in
  biome.json|biome.jsonc|.env|.env.*|tsconfig.json|.npmrc)
    echo "Blocked: $base はルール/秘密情報/サプライチェーン防御の根幹。編集が必要ならユーザーに確認し、決定を memory/decisions.md に残すこと。" >&2
    exit 2
    ;;
esac

exit 0
```

作成後、実行権限を付与:

```bash
chmod +x .claude/hooks/block-no-verify.sh .claude/hooks/protect-configs.sh
```

> どのフックを「危険な npm コマンドのブロック（§2 の block-risky-bash.sh）」と組み合わせるかは任意。
> §1 の settings.json の deny ルール（`npm install` / `npx` / `curl|wget` 等）と、この §3-5 のフックは併用できる。
