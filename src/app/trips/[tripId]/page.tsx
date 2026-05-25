import TripExperience from '@/components/TripExperience';
import { requireUser } from '@/lib/auth';
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
  const user = await requireUser();
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
          photos={photos}
          total={photos.length}
          withGps={withGps}
          tripId={tripId}
          isOwner={isOwner}
          currentUserId={user.id}
        />
      </section>
    </main>
  );
}
