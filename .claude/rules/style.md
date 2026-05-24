# Style rules — 旅写真マップ

formatter / linter が機械的に拾えるものはここに書かず Biome 設定で有効化する。

## Formatter / Linter

`biome check .` — Edit/Write 後のフックで自動整形され、`npm run check` の一部としても走る。
コードを移動・新規作成した直後は `npm run format` を先に流す（既定は single quote / semicolons always / 2-space / lineWidth 100）。

## ツールが拾えない規約

- TypeScript は `strict: true` 前提。`any` を避け、外部データ（EXIF・Supabase 行）は型付きで扱う。
- 列挙的な値は文字列リテラルユニオン型で表現する。
- UI 文言・コメントは日本語で統一（想定ユーザーが日本語のため）。
- フォント: 見出しはセリフ体（Fraunces / Instrument Serif）、本文は OS デフォルト sans。**Inter は避ける**（`req.md` UI 指針）。
- カラー: ベース白〜オフホワイト、アクセントは deep teal 1 色（`globals.css` の `--accent` / tailwind `brand.accent`）。
- 地図を主役にする: 地図は全画面、フローティング要素は角丸 + ドロップシャドウ。
- MapTiler / OSM 等の帰属表示が必要なら地図上または近接に出す。
