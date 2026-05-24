# Decisions — 旅写真マップ

非自明な選択を日付付きで記録する。**過去エントリは編集しない**（追記のみ）。次の人が再議論しなくて済むようにする。

## 2026-05-25 — バックエンドは Supabase

Firebase（NoSQL で将来の旅程解析クエリが書きにくい）と Vercel Postgres+Blob（無料枠が小さい）を比較し、Supabase を採用。理由: SQL（PostGIS で地理空間クエリ可）、RLS でグループ共有を後付けしやすい、無料枠が広い（DB 500MB / Storage 1GB / 月5万MAU）。`req.md` §バックエンド選定の根拠より。

## 2026-05-25 — EXIF 抽出はブラウザ内で完結（exifr）

`exifr` を採用（HEIC 対応。`piexifjs` は HEIC 非対応）。サーバーへ画像を送らずブラウザで抽出し、無駄な転送を避ける（`req.md` 禁止事項）。GPS なし写真も受け付け、マップピンには出さない。

## 2026-05-25 — npm サプライチェーン対策を最初から組み込む

2025-2026 の Shai-Hulud / Mini Shai-Hulud ワーム（postinstall 悪用・自己増殖・資格情報窃取）を受け、`.npmrc` に `ignore-scripts=true` / `min-release-age=7`（公開7日未満を弾く、要 npm 11.10+）/ `save-exact=true` を設定。lockfile コミット + `npm ci` 運用。背景は `README.md`「セキュリティ」。

## 2026-05-25 — ハーネスは `vibemayfes` 構造を踏襲

ユーザー依頼により、別プロジェクト `vibemayfes` の構造を踏襲。`AGENTS.md` をエントリポイント、`memory/` プロトコルで決定の忘却を防ぐ、`.claude/rules` + `.claude/skills`、Biome、shadcn/ui（`components.json` + `tailwind.config.ts`）、`src/` レイアウト。Tailwind は `vibemayfes` に合わせ v4 → **v3** に変更（config ファイル + HSL CSS 変数 + autoprefixer）。Next/React は新しめを維持（Next 16 / React 19）。

## 2026-05-25 — 仕様の正本は `req.md`（docs/ へ移動しない）

`vibemayfes` は `docs/開発仕様書.md` を正本とするが、本プロジェクトでは既存の `req.md` をそのまま正本とし、`AGENTS.md` から参照する。`docs/` ディレクトリは将来の補助資料用に用意。
