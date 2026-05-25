import { requireUser } from '@/lib/auth';
import { MAX_TRIPS_PER_USER } from '@/lib/limits';
import { getServerSupabase, signedPhotoUrlMap } from '@/lib/supabase-server';
import type { Trip, TripWithMeta } from '@/types/trip';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type TripRow = Trip & { photos: { storage_path: string; thumb_path: string | null }[] };

/** 代表写真のパス。軽いサムネを優先し、無ければ原寸へフォールバック。 */
function coverPath(t: TripRow): string | null {
  const first = t.photos[0];
  return first?.thumb_path ?? t.cover_photo_path ?? first?.storage_path ?? null;
}

export default async function TripsPage() {
  const user = await requireUser();
  const supabase = await getServerSupabase();

  const { data, error } = await supabase
    .from('trips')
    .select('*, photos(storage_path, thumb_path)')
    .order('created_at', { ascending: false });

  const rows = (data as TripRow[]) ?? [];
  // 上限は「自分が所有する旅程」だけ数える（共有された旅程は対象外）。
  const ownedCount = rows.filter((t) => t.user_id === user.id).length;
  const atTripLimit = ownedCount >= MAX_TRIPS_PER_USER;
  const coverPaths = rows.map(coverPath).filter((p): p is string => p != null);
  const signed = await signedPhotoUrlMap(supabase, coverPaths);

  const trips: TripWithMeta[] = rows.map((t) => {
    const cover = coverPath(t);
    return {
      id: t.id,
      user_id: t.user_id,
      title: t.title,
      description: t.description,
      cover_photo_path: t.cover_photo_path,
      created_at: t.created_at,
      updated_at: t.updated_at,
      photo_count: t.photos.length,
      cover_url: cover ? (signed.get(cover) ?? null) : null,
    };
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="reveal mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Tabi Photo Map
          </span>
          <h1 className="font-serif text-4xl leading-none sm:text-5xl">旅程</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {atTripLimit ? (
            <span
              className="btn-accent pointer-events-none opacity-40"
              title={`旅程は ${MAX_TRIPS_PER_USER} つまでです`}
              aria-disabled
            >
              ＋ 新しい旅程
            </span>
          ) : (
            <Link href="/trips/new" className="btn-accent">
              ＋ 新しい旅程
            </Link>
          )}
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="btn-ghost">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      {error && (
        <p className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          旅程の取得に失敗しました。Supabase の設定（テーブル / RLS）を確認してください。
        </p>
      )}

      {atTripLimit && (
        <p className="mb-6 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm text-muted-foreground">
          作成できる旅程は {MAX_TRIPS_PER_USER}{' '}
          つまでです。新しく作るには、いずれかの旅程を削除してください。
        </p>
      )}

      {trips.length === 0 ? (
        <div className="reveal surface flex flex-col items-center px-6 py-20 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-2xl text-accent">
            ✦
          </div>
          <p className="font-serif text-2xl">まだ旅程がありません</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            「新しい旅程」から最初の旅を作り、写真を地図に並べていきましょう。
          </p>
          <Link href="/trips/new" className="btn-accent mt-6">
            ＋ 最初の旅程をつくる
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip, i) => (
            <li
              key={trip.id}
              className="reveal"
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
            >
              <Link
                href={`/trips/${trip.id}`}
                className="surface group block overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-float)]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-secondary">
                  {trip.cover_url ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={trip.cover_url}
                        alt={trip.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <span className="text-2xl text-accent/40">✦</span>
                      <span className="text-xs">写真なし</span>
                    </div>
                  )}
                  <span className="absolute right-3 top-3 rounded-full bg-card/85 px-2.5 py-1 text-[11px] font-medium text-accent backdrop-blur">
                    {trip.photo_count} 枚
                  </span>
                </div>
                <div className="space-y-1.5 p-5">
                  <h2 className="font-serif text-xl leading-snug transition group-hover:text-accent">
                    {trip.title}
                  </h2>
                  {trip.description && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {trip.description}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
