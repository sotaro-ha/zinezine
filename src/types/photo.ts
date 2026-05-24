/** Supabase `photos` テーブルの 1 行に対応する型 */
export type Photo = {
  id: string;
  user_id: string | null; // 将来の認証用。MVP では null
  trip_id: string | null; // 将来のグループ/旅行単位。MVP では null
  storage_path: string;
  thumb_path: string | null; // 縮小版の storage パス（一覧/地図用）。無ければ原寸を使う
  lat: number | null; // EXIF に GPS が無い写真は null（マップピンには出さない）
  lng: number | null;
  taken_at: string | null; // ISO8601 文字列（timestamptz）
  width: number | null;
  height: number | null;
  created_at: string;
};

/**
 * 表示用 URL を付与した写真。
 * - `url`      … 原寸（ポップアップ等の拡大表示用）
 * - `thumb_url`… 縮小版（一覧 / タイムライン / 地図用。サムネが無ければ原寸と同じ）
 */
export type PhotoWithUrl = Photo & { url: string; thumb_url: string };
