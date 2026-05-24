import PhotoMap from '@/components/Map';
import PhotoUploader from '@/components/PhotoUploader';
import ShareManager from '@/components/ShareManager';
import { requireAdmin } from '@/lib/auth';
import { getServerSupabase, signedPhotoUrlMap } from '@/lib/supabase-server';
import type { Photo, PhotoWithUrl } from '@/types/photo';
import type { Trip } from '@/types/trip';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const user = await requireAdmin();
  const { tripId } = await params;
  const supabase = await getServerSupabase();

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).single();
  if (!trip) {
    notFound();
  }
  const t = trip as Trip;
  const isOwner = t.user_id === user.id;

  const { data: rows } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', tripId)
    .order('taken_at', { ascending: true, nullsFirst: false });

  const photoRows = (rows as Photo[]) ?? [];
  const signed = await signedPhotoUrlMap(
    supabase,
    photoRows.map((p) => p.storage_path),
  );
  const photos: PhotoWithUrl[] = photoRows.map((p) => ({
    ...p,
    url: signed.get(p.storage_path) ?? '',
  }));
  const withGps = photos.filter((p) => p.lat != null && p.lng != null).length;

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-12">
      <header className="reveal space-y-3">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-accent"
        >
          <span aria-hidden>←</span> 旅程一覧に戻る
        </Link>
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1>
        {t.description && (
          <p className="max-w-2xl leading-relaxed text-muted-foreground">{t.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-3 py-1">
            全 {photos.length} 枚
          </span>
          <span className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-accent">
            マップ表示 {withGps} 枚
          </span>
        </div>
      </header>

      <section
        className="reveal h-[58vh] overflow-hidden rounded-2xl border border-border"
        style={{ animationDelay: '80ms', boxShadow: 'var(--shadow-float)' }}
      >
        {photos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-secondary/60 text-muted-foreground">
            <span className="text-2xl text-accent/40">✦</span>
            <p className="text-sm">写真を追加するとここに地図が表示されます</p>
          </div>
        ) : (
          // 写真集合が変わったら地図を作り直す（アップロード後の router.refresh() で反映）
          <PhotoMap key={photos.map((p) => p.id).join(',')} photos={photos} />
        )}
      </section>

      {isOwner ? (
        <>
          <section className="reveal surface space-y-3 p-6" style={{ animationDelay: '140ms' }}>
            <h2 className="font-serif text-2xl">写真を追加</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              位置情報（GPS）付きの写真をこの旅程に追加します。jpeg / heic 対応。GPS
              が無い写真はピンには出ません。
            </p>
            <PhotoUploader tripId={tripId} />
          </section>

          <section className="reveal surface space-y-3 p-6" style={{ animationDelay: '200ms' }}>
            <h2 className="font-serif text-2xl">共有</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              メールアドレスを指定すると、その人がログインしたときにこの旅程を閲覧できます（編集は所有者のみ）。
            </p>
            <ShareManager tripId={tripId} />
          </section>
        </>
      ) : (
        <section
          className="reveal surface flex items-center gap-3 p-6 text-sm text-muted-foreground"
          style={{ animationDelay: '140ms' }}
        >
          <span className="text-accent">✦</span>
          この旅程はあなたに共有されています（閲覧のみ）。
        </section>
      )}
    </main>
  );
}
