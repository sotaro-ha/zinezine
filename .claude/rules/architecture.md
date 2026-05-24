# Architecture rules — 旅写真マップ

このファイルのルールは *強制可能* なものに限る。チェックできない曖昧な規約は `style.md` へ。

## レイヤー境界

- **EXIF 抽出はブラウザ内で完結させる。** サーバー（Route Handler）へ画像を送って解析しない（`req.md` 禁止事項）。`src/lib/exif.ts` はクライアントから呼ぶ。
- Supabase クライアントは用途で分ける（`src/lib/supabase.ts`）:
  - `getBrowserSupabase()` … `'use client'` から。
  - `getServerSupabase()` … サーバーコンポーネント / Route Handler から。
  - 将来サービスロールキーを使うサーバー専用クライアントを足す場合、クライアントバンドルへ絶対に import しない。
- 写真本体を `localStorage` / `sessionStorage` に保存しない。Supabase Storage を使う（`req.md` 禁止事項）。

## モジュール配置

- API ルートは `src/app/api/<resource>/route.ts` のみ。それ以外の場所にエンドポイントを定義しない。
- ドメイン型は `src/types/` に集約（`photo.ts`）。
- 地図描画は `src/components/Map.tsx`（`'use client'`）に閉じる。ポップアップ HTML は `src/components/PhotoPreview.tsx` で**エスケープして**生成する（XSS 対策）。

## データモデルの不変条件

- `photos` テーブルの `lat` / `lng` / `taken_at` は nullable。GPS なし写真は許容し、マップピンには出さない。
- `storage_path` は `${crypto.randomUUID()}-${file.name}` 形式。
- 将来の `user_id` / `trip_id` カラムは用意済み。MVP では null。RLS は有効のまま anon に絞った許可を与え、将来 trip/user ベースへ切り替える。

## API 入力バリデーション

- Route Handler の入力は境界でバリデーションする。バリデーションなしで Supabase へ書き込まない。

## なぜ重要か

クライアント/サーバーの境界（特に秘匿キーの非露出）はビジネスクリティカル。同じ違反が 2 回起きたら、ドキュメント（L1）から `.claude/hooks` または依存関係チェック（L3）へ昇格させる。
