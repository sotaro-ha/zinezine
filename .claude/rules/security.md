# Security rules — 旅写真マップ

秘密情報の保護と依存の安全性はこのプロジェクトのクリティカルな関心事。違反は事故扱い。

## 秘密情報

- **秘密情報をクライアントに渡さない。**
  - `NEXT_PUBLIC_` 接頭辞が付くのは公開前提のキーだけ（Supabase anon key、MapTiler key）。
  - 将来導入するサービスロールキー等は **`NEXT_PUBLIC_` を付けず**、サーバー側でのみ参照する。
  - `'use client'` ファイルでサーバー秘密情報を `process.env` 経由で参照しない。
- **秘密情報をコミットしない。** `.env` / `.env.local` は `.gitignore` 済み。ハードコードされた鍵は一切禁止（`req.md` 禁止事項）。
- Supabase Storage バケットは Public read。アップロードは anon。将来 RLS で `trip_id` / `user_id` ベースに絞る前提でコメントを残す。

## npm サプライチェーン対策（2025-2026 の Shai-Hulud 等）

- `.npmrc` の `ignore-scripts=true` / `min-release-age=7` / `save-exact=true` を**外さない・弱めない**。
- 依存追加は `npm install <pkg>`（`save-exact` で固定）→ `package-lock.json` の差分を提示 → ユーザーのレビュー後にコミット。**勝手に依存を追加・更新しない。**
- インストールは `npm ci`（= `npm run deps:install`）を基本にする。`package.json` / `package-lock.json` / `.npmrc` の変更はレビュー必須。
- `curl ... | sh` 等のパイプ実行、未検証スクリプトのネットワーク実行を提案・実行しない。
- 定期的に `npm run deps:audit`（high 以上で失敗）。

## 違反を見つけたときの対応

1. 止まる。違反を回避するパッチを当てない。
2. `memory/open-questions.md` に何を見つけたか記述する。
3. 続行前にユーザーへ報告する。
