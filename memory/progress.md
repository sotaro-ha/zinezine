# Progress — 旅写真マップ

Last updated: 2026-05-25

## Current focus

ハーネス（`vibemayfes` 構造の踏襲）と MVP の足場を構築した段階。アプリコードは実装済みだが、`npm install` / `npm run check` / ブラウザ検証はまだ未実施。次は依存インストールと検証。

進捗はマイルストーン（Phase）単位で管理。各 Phase の項目が状態変化したらここを更新する。

## Milestone: Phase 0 — セットアップ / ハーネス

- [x] `req.md`（実装指示書）受領
- [x] npm サプライチェーン対策（`.npmrc`: ignore-scripts / min-release-age=7 / save-exact、`.gitignore`、`deps:*` スクリプト）
- [x] `vibemayfes` 構造の踏襲（`src/` レイアウト、`AGENTS.md` / `CLAUDE.md`、`memory/`、`.claude/rules` + `.claude/skills`、biome、shadcn/ui の `components.json` + `tailwind.config.ts`、`launch.json`、`vercel.json`、`env.example`）
- [x] `npm install` → `package-lock.json` 生成（node_modules 導入済み）
- [x] `npm run format` → `npm run check` 通過（biome クリーン + tsc エラーなし、18 ファイル。2026-05-25）
- [~] `.claude/hooks.json` は作成済みだが、参照する `.claude/hooks/block-no-verify.sh` / `protect-configs.sh` が未作成（`.claude/SECURITY-SETUP.md` §4-5 を手動作成 + chmod +x）。settings.json の deny ルールも未適用（同 §1）
- [ ] Supabase プロジェクト作成 / `photos` テーブル + Storage バケット + RLS（`req.md` の SQL）
- [ ] MapTiler アカウント / `.env.local` 設定
- [ ] `npm run dev` でブラウザ検証

## Milestone: Phase 1 — 写真アップロード → マップ表示（MVP 本体）

- [x] EXIF 抽出 `src/lib/exif.ts`（exifr、GPS なし許容、HEIC 対応）
- [x] Supabase クライアント `src/lib/supabase.ts`（browser/server + 公開 URL 生成）
- [x] 型定義 `src/types/photo.ts`
- [x] アップロード UI `src/components/PhotoUploader.tsx`（D&D + 並列3 + 進捗 + サマリー）
- [x] マップ `src/components/Map.tsx`（GeoJSON ピン + 旅程ライン + fitBounds + ポップアップ）
- [x] ポップアップ HTML 生成 `src/components/PhotoPreview.tsx`（XSS エスケープ）
- [x] マップ画面 `src/app/page.tsx`（サーバーで撮影日時順取得）
- [x] アップロード画面 `src/app/upload/page.tsx`
- [x] API `src/app/api/photos/route.ts`（GET 全件）
- [ ] end-to-end 動作確認（jpeg/heic アップロード → ピン表示 → 旅程ライン → ポップアップ）
- [ ] GPS なし写真がピンに出ないことの確認

## Milestone: Phase 1.5 — 認証 + 旅程（2026-05-25 実装、ブラウザ検証は未）

Google 認証（管理者限定）と旅程 CRUD の最小画面を実装。写真は旅程に紐づく。

- [x] DB: `trips` テーブル追加、`photos` を `trip_id`/`user_id`（not null）で紐付け、RLS を `auth.uid()` ベースに、Storage ポリシー（`docs/schema.sql`）
- [x] 認証基盤: cookie ベース SSR（`src/lib/supabase.ts`）、`src/middleware.ts`（未認証→/login・非管理者サインアウト）、`src/lib/admin.ts`（`ADMIN_EMAILS` fail-closed）、`src/lib/auth.ts`
- [x] OAuth: `/api/auth/callback`（code→session）、`/api/auth/signout`、Google ボタン
- [x] API: `/api/trips`（GET一覧/POST作成）、`/api/trips/[tripId]`（GET/DELETE）、`/api/photos?tripId`（認証必須）
- [x] 画面: `/login`、`/`→`/trips`、`/trips`（カード一覧+ログアウト）、`/trips/new`（作成フォーム）、`/trips/[tripId]`（地図+画像追加）
- [x] `PhotoUploader` を `tripId` 対応（`user_id`/`trip_id` 付与、storage パスを `userId/tripId/uuid-name`、完了で `router.refresh()`）。旧 `/upload` は撤去
- [x] `npm run check` 通過（31 ファイル）
- [ ] Supabase で `docs/schema.sql` 実行 + Google プロバイダ設定 + `ADMIN_EMAILS` 設定 → ブラウザで end-to-end 検証（ログイン→旅程作成→画像追加→地図表示）

## Milestone: Phase 2 — 将来拡張（本 MVP では未実装）

- [ ] グループ共有（`trips` に group_id + メンバーシップ RLS。現状は所有者単独）
- [ ] AI 解析（`taken_at` + `(lat,lng)` クラスタリング、PostGIS `ST_ClusterDBSCAN`）
- [ ] zine 生成（解析結果を Claude API へ → PDF）
- [ ] 複数管理者→一般ユーザー開放（現状は `ADMIN_EMAILS` 限定）
- [ ] 旅程削除 UI、Storage 実体の削除、cover 写真の明示選択

## Done

- [x] ハーネス初期化（`vibemayfes` 構造踏襲、2026-05-25）。
- [x] Google 認証（管理者限定）+ 旅程 CRUD + 画像追加の最小画面（2026-05-25）。
