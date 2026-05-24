/** Supabase `photos` テーブルの 1 行に対応する型 */
export type Photo = {
  id: string;
  user_id: string | null; // 将来の認証用。MVP では null
  trip_id: string | null; // 将来のグループ/旅行単位。MVP では null
  storage_path: string;
  lat: number | null; // EXIF に GPS が無い写真は null（マップピンには出さない）
  lng: number | null;
  taken_at: string | null; // ISO8601 文字列（timestamptz）
  width: number | null;
  height: number | null;
  created_at: string;
};

/** Storage の公開パスから表示用 URL を組み立てるための型補助 */
export type PhotoWithUrl = Photo & { url: string };
