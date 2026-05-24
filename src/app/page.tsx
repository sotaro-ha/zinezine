import PhotoMap from '@/components/Map';
import { getServerSupabase, publicPhotoUrl } from '@/lib/supabase';
import type { Photo, PhotoWithUrl } from '@/types/photo';
import Link from 'next/link';

// 写真は随時増えるので毎回最新を取得（MVP は件数少ない前提、将来ページング）
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = getServerSupabase();

  // 撮影日時順に取得 → 旅程ラインを時系列で結べる
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .order('taken_at', { ascending: true, nullsFirst: false });

  const photos: PhotoWithUrl[] = ((data as Photo[]) ?? []).map((p) => ({
    ...p,
    url: publicPhotoUrl(p.storage_path),
  }));

  const withGps = photos.filter((p) => p.lat != null && p.lng != null).length;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <PhotoMap photos={photos} />

      {/* 左上: 写真件数バッジ */}
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
        <span className="font-serif text-base">{withGps}</span>
        <span className="ml-1 text-neutral-500">枚をマップに表示</span>
      </div>

      {/* 右上: アップロードへ */}
      <Link
        href="/upload"
        className="absolute right-4 top-4 z-10 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
      >
        ＋ 写真を追加
      </Link>

      {error && (
        <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow">
          写真の取得に失敗しました。Supabase の設定（.env.local / テーブル）を確認してください。
        </div>
      )}
    </main>
  );
}
