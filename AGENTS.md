# 旅写真マップ（Tabi Photo Map）

旅行中に撮った写真の位置情報（GPS EXIF）を抽出し、Web 上のマップにピンとして可視化するアプリ。撮影日時順にピンを線で結んで旅程ラインを表示する。将来はグループ共有・AI による zine 生成へ拡張する。

このファイルが AI エージェント（Claude Code, Codex, Cursor 等）共通のエントリポイント。仕様の正本は `req.md`。

## 目的（要約）

旅の写真を「いつ・どこで撮ったか」で地図と時系列に再構成し、後から旅程として辿れるようにする。MVP は機能1（写真アップロード → マップ表示）に絞る。
→ スコープ・データモデル・UI 指針・禁止事項は `req.md` を参照。

## メモリプロトコル — まず最初に読む

このプロジェクトの最重要事項。**決定の忘却を防ぐ**ことが harness の目的。

セッション開始時:

1. `memory/session-handoff.md`（空でなければ）を読む — 直近の文脈。
2. `memory/progress.md` を読む — 現在のマイルストーン状態。
3. タスクに関係するなら `memory/decisions.md` と `memory/open-questions.md` の最新を確認。

作業中:

- `memory/progress.md` — マイルストーン内の項目が状態変化したら更新。
- `memory/decisions.md` — 非自明な選択をしたら追記。**過去エントリは絶対に編集しない。**
- `memory/learnings.md` — 非自明なパターン・ハマりどころを見つけたら追記。
- `memory/open-questions.md` — 解決した問いは `decisions.md` へ移す。

セッション終了時:

- `memory/session-handoff.md` を新しく書き直す: やったこと / 残り / ブロッカー / 次セッションの開始手順。

## 技術スタック

- TypeScript（`strict: true` 前提）/ React 19
- Next.js 16（App Router、Route Handlers）
- MapLibre GL JS + MapTiler タイル（地図）
- `exifr`（ブラウザ内で完結する EXIF 抽出、HEIC 対応）
- Supabase（Postgres + Storage。MVP は anon key + RLS）
- Tailwind CSS v3 + shadcn/ui
- Vercel（デプロイ）/ パッケージマネージャ: npm
- Lint/Format: Biome

## ハンドオフ前の検証

`npm run check` を実行（`biome check .` → `tsc --noEmit`）。これが通るまでセッションは完了でない。
コードを移動・新規作成した直後は `npm run format`（`biome check --write .`）で整形してから check する。
テストは現状 MVP 優先で後回し（`memory/open-questions.md` 参照）。

## ディレクトリ配置

- `req.md` — 実装指示書（仕様の正本、人間向けにも可読）。
- `src/app/` — Next.js App Router のページと `api/` Route Handlers。
- `src/components/` — React コンポーネント（`ui/` は shadcn/ui プリミティブ）。
- `src/lib/` — Supabase クライアント（`supabase.ts`）・EXIF（`exif.ts`）・`utils.ts`。
- `src/types/` — ドメイン型（`photo.ts`）。
- `scripts/` — バッチスクリプト（MVP では未使用、将来のデータ取り込み等）。

## データソース

- **写真本体**: Supabase Storage の `photos` バケット（Public read）。
- **メタデータ**: Postgres `photos` テーブル（`storage_path` / `lat` / `lng` / `taken_at` / `width` / `height`）。
- **EXIF**: ブラウザで `exifr` により抽出。GPS が無い写真も許容し、その場合 `lat/lng` は null（マップピンには出さない）。
- **地図タイル**: MapTiler Streets v2。

## ルール

`.claude/rules/` に granular な制約。最重要:

- `.claude/rules/architecture.md` — レイヤー境界、何が何を import してよいか。
- `.claude/rules/security.md` — 秘密情報の扱いと npm サプライチェーン対策。**漏洩はクリティカル。**
- `.claude/rules/style.md` — Biome が拾わない規約。

## スキル

`.claude/skills/` に再利用手順。

- `add-feature` — 型 → ロジック → API/route → 進捗更新。
- `review-pr` — ルールに照らした差分レビュー。

## フック

`.claude/hooks.json` 参照（Claude Code 用）。エージェント自身では書き込めないため、初回はユーザーが手動作成する（`.claude/SECURITY-SETUP.md` 参照）:

- Edit/Write 後に Biome で自動整形。
- セッション終了時に `npm run check`。
- `--no-verify`、設定ファイルおよび `.env` 系の編集をブロック。

## npm サプライチェーン対策

`.npmrc` に防御を組み込み済み（`ignore-scripts` / `min-release-age=7` / `save-exact`）。背景と運用は `README.md`「セキュリティ」と `.claude/rules/security.md`。**これらを弱めない。依存追加はユーザー確認の上、lockfile 差分をレビューしてコミットする。**

## 「完了」の定義

- `npm run check` が通る。
- `memory/progress.md` が新しい状態を反映している。
- 非自明な決定をしたら `memory/decisions.md` に追記済み。
- 秘密情報（サービスロールキー等）をクライアントバンドルや commit に含めていない。`NEXT_PUBLIC_` はクライアント露出前提のキーだけ。

## チーム開発の前提

複数の人間・エージェントが同じ仕様を少しずつ違って解釈する。曖昧な判断は `memory/decisions.md` に根拠付きで残し、次の人が再議論しなくて済むようにする。
