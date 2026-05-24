import ShareManager from '@/components/ShareManager';
import TripExperience from '@/components/TripExperience';
import { requireAdmin } from '@/lib/auth';
import { attachPhotoUrls, getServerSupabase } from '@/lib/supabase-server';
import type { Photo } from '@/types/photo';
import type { Trip } from '@/types/trip';
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

  const photos = await attachPhotoUrls(supabase, (rows as Photo[]) ?? []);
  const withGps = photos.filter((p) => p.lat != null && p.lng != null).length;

  return (
    <main>
      {/* 全画面の地図 / zine 体験 */}
      <section className="reveal h-[100svh] w-full">
        <TripExperience
          title={t.title}
          description={t.description}
          photos={photos}
          total={photos.length}
          withGps={withGps}
          tripId={tripId}
          isOwner={isOwner}
        />
      </section>

      {/* 編集パネル（スクロールで下に） */}
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
        {isOwner ? (
          <>
            <section className="surface space-y-3 p-6">
              <h2 className="font-serif text-2xl">共有</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                メールアドレスを指定すると、その人がログインしたときにこの旅程を閲覧できます（編集は所有者のみ）。
              </p>
              <ShareManager tripId={tripId} />
            </section>
          </>
        ) : (
          <section className="surface flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <span className="text-accent">✦</span>
            この旅程はあなたに共有されています（閲覧のみ）。
          </section>
        )}
      </div>
    </main>
  );
}
