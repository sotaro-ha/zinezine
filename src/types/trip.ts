/** Supabase `trips` テーブルの 1 行に対応する型 */
export type Trip = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_photo_path: string | null;
  created_at: string;
  updated_at: string;
};

/** 一覧表示用: 写真枚数と代表写真 URL を付与 */
export type TripWithMeta = Trip & {
  photo_count: number;
  cover_url: string | null;
};

/** Supabase `trip_shares` テーブルの 1 行。旅程をメール単位で共有する。 */
export type TripShare = {
  trip_id: string;
  shared_with_email: string;
  created_at: string;
};
