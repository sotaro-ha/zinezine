# Open questions — 旅写真マップ

ユーザーが答える必要がある、または決定前に調査が必要な事項。

解決したら `memory/decisions.md` へ移し、ここから削除（または "Decided" に一行ポインタを残す）。

## Open

### ハーネス由来

- **テストフレームワーク。** MVP 優先でテストは後回し。MVP 完成後に Vitest 等を選び `npm run check` に組み込む。それまで「完了」の定義にテストは含めない。(Raised 2026-05-25)
- **`.claude/hooks.json` の手動適用。** エージェントは自己設定（settings.json / hooks）を書き込めない安全装置がある。フックはユーザーが `.claude/SECURITY-SETUP.md` の手順で手動作成する必要がある。適用済みか要確認。(Raised 2026-05-25)

### 環境

- **npm バージョン。** `.npmrc` の `min-release-age` は npm 11.10.0 以上が必要。確認時点の環境は 11.6.3 で、上げないとクールダウンが無視される。`npm install -g npm@latest` 等で更新が必要。(Raised 2026-05-25)
- **依存バージョンの実値。** `package.json` のレンジは 2026-05 時点の妥当値。`npm install` で解決される `package-lock.json` が正。型チェック・ビルドが通るか未検証。(Raised 2026-05-25)

### 仕様

- **Tailwind v3 採用の是非。** `vibemayfes` 踏襲で v3 にしたが、新規なら v4 の方が将来性がある。チームで v3 統一を続けるか要判断。(Raised 2026-05-25)
- **shadcn/ui コンポーネントの導入範囲。** `components.json` は設定済みだが、まだ `ui/` プリミティブは未導入。必要になった時点で `npx shadcn add` を使う（`.npmrc` の ignore-scripts と deny ルールに注意）。(Raised 2026-05-25)

<!--
新エントリのテンプレート:

- **<トピック>.** 何が不明か。答えは何に影響するか。(Raised YYYY-MM-DD)
-->
