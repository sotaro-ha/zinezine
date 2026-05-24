# Learnings — 旅写真マップ

追記のみ。コードベースやツールで非自明なパターン・ハマりどころ・驚きを見つけたら日付付きで追加する。

プロジェクト開始時点でこのファイルがほぼ空なのは正しい — 作業の中で有機的に育てる。

## 2026-05-25 — MapLibre のポップアップは React ではなく HTML 文字列

`maplibregl.Popup().setHTML(...)` は DOM/HTML 文字列を受け取る。React コンポーネントとして描画できないため、`src/components/PhotoPreview.tsx` の `buildPopupHTML()` で**エスケープ済みの**文字列を組み立てる。ユーザー由来の値（ファイル名・撮影日時）を差し込むので、エスケープを外すと XSS になる。

## 2026-05-25 — `Map` という名前のコンポーネントは global `Map` を隠す

地図コンポーネントを `Map` と命名すると、内部の `new Map<...>()`（lookup table）がコンポーネント関数を参照してしまい実行時エラーになる。`src/components/Map.tsx` は default export 関数名を `PhotoMap` にし、lookup には `new globalThis.Map(...)` を使う。import 名（`Map`）は呼び出し側の自由。

## 2026-05-25 — Supabase クライアントはブラウザ用とサーバー用でファイルを分ける

`next/headers`（`cookies()`）はサーバー専用 API。これを import するモジュールをクライアントコンポーネントが（間接的にでも）読み込むと、Turbopack が "You're importing a module that depends on next/headers ... Pages Router" でビルドを落とす。原因は `src/lib/supabase.ts` に `getBrowserSupabase`（client）と `getServerSupabase`（server, next/headers 依存）を同居させ、`GoogleSignInButton`（'use client'）が前者目的で import したため、後者ごとクライアントバンドルに入ったこと。

対処: ファイルを分割。`@/lib/supabase` = ブラウザ用 + 純粋関数（`getBrowserSupabase` / `publicPhotoUrl`、next/headers を import しない）。`@/lib/supabase-server` = `getServerSupabase`（next/headers を import、サーバー専用）。クライアントは前者、Server Component / Route Handler / `lib/auth` は後者を使う。`server-only` パッケージは未導入なので import しない（依存を増やさない方針）。

slug: learning-split-supabase-client-server

<!--
新エントリのテンプレート:

## YYYY-MM-DD — <一行サマリ>

驚いた点とその対処を数文で。具体的に。関連するファイルパスやコマンドを書く。
-->
