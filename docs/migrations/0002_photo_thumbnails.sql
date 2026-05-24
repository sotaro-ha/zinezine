-- 旅写真マップ — マイグレーション 0002: サムネイル列
-- 一覧 / タイムライン / 地図ポップアップは原寸ではなく縮小版を配信して軽量化する。
-- サムネはアップロード時にブラウザで生成し、同じ `photos` バケットの
-- `${userId}/${tripId}/...` 配下に置く（既存の Storage RLS がそのまま効く）。

alter table photos add column if not exists thumb_path text;
