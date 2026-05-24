# Session handoff — 2026-05-25

セッションごとに上書き。過去の履歴は git に残る。

## このセッションでやったこと

- npm サプライチェーン対策を導入（`.npmrc`、`.gitignore`、`deps:*` スクリプト、`README` セキュリティ節、`.claude/SECURITY-SETUP.md`）。
- ユーザー依頼により、別プロジェクト `vibemayfes` の構造を踏襲してハーネスを構築:
  - `src/` レイアウトへ移動（`app` / `components` / `lib` / `types` → `src/`）。`tsconfig` の `@/*` を `./src/*` に変更。
  - `AGENTS.md`（エントリポイント）/ `CLAUDE.md`（ポインタ）。
  - `memory/`（progress / decisions / learnings / open-questions / session-handoff）。
  - `.claude/rules/`（architecture / security / style）、`.claude/skills/`（add-feature / review-pr）、`.agents/skills/` にもミラー、`.claude/launch.json`。
  - ツールチェーン: Biome（`biome.json`、`npm run check/format`）、Tailwind v4 → **v3**（`tailwind.config.ts` + `postcss` + HSL `globals.css`）、shadcn/ui（`components.json` + `src/lib/utils.ts`）、`next.config.ts` → `next.config.mjs`、`vercel.json`、`.env.example` → `env.example`。
- アプリコードは `src/` 配下で実装済み（前セッションの MVP 一式）。

## 検証

- `npm install` は実行済み（`node_modules` + `package-lock.json` あり。@supabase 等は exact 版に固定された）。
- `npm run format` → biome が 10 ファイルを整形。残った lint エラー 4 件を修正:
  - `page.tsx`: `import Map` が global Map を shadow → `PhotoMap` に改名。
  - `Map.tsx`: `forEach` → `for...of`。
  - `PhotoUploader.tsx`: クリック可能 div → `<button type="button">` 化し、hidden `<input>` を兄弟要素へ。
- `npm run check`（`biome check .` → `tsc --noEmit`）= **通過**（18 ファイル、エラーなし）。
- `npm warn Unknown project config "min-release-age"` が出る → 現環境の npm は 11.10 未満で、この防御だけ無視されている。

## 残っていること

- **npm を 11.10+ に更新**（`min-release-age` 有効化。現状は警告のみで無視）。
- `.claude/hooks.json` は存在するが、参照スクリプト `.claude/hooks/block-no-verify.sh` / `protect-configs.sh` が未作成 → `.claude/SECURITY-SETUP.md` §4-5 を手動作成 + `chmod +x`。settings.json の deny ルール（同 §1）も未適用。
- `package-lock.json` をコミット（git 未初期化）。
- Supabase / MapTiler セットアップ → `.env.local` → `npm run dev` でブラウザ検証（ピン表示・旅程ライン・ポップアップ・GPSなし除外）。

## ブロッカー

- なし。`npm run check` は通る。実 Supabase/MapTiler 接続前なのでブラウザ動作のみ未確認。

## 次セッションの開始手順

1. `git status --short --branch`（git 未初期化なら `git init` から）。`package-lock.json` をコミット。
2. 必要なら `npm install -g npm@latest` で npm を 11.10+ に上げ、`npm install` し直して `min-release-age` を効かせる。
3. `.claude/SECURITY-SETUP.md` のハーネス設定（settings.json deny + フックスクリプト）を手動適用。
4. `env.example` を `.env.local` にコピーし Supabase/MapTiler の値を設定 → `npm run dev` で `/` と `/upload` を確認。
5. `memory/progress.md` の Phase 0 / Phase 1 のチェックを更新。
