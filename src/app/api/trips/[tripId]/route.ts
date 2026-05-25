import { getUserOrNull } from '@/lib/auth';
import { attachPhotoUrls, getServerSupabase } from '@/lib/supabase-server';
import type { Photo } from '@/types/photo';
import type { Trip } from '@/types/trip';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/trips/:tripId — 旅程と、撮影日時順の写真 */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const user = await getUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { tripId } = await params;
  const supabase = await getServerSupabase();

  const { data: trip, error: tripErr } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();
  if (tripErr || !trip) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { data: photoRows, error: photoErr } = await supabase
    .from('photos')
    .select('*')
    .eq('trip_id', tripId)
    .order('taken_at', { ascending: true, nullsFirst: false });
  if (photoErr) {
    return NextResponse.json({ error: photoErr.message }, { status: 500 });
  }

  const photos = await attachPhotoUrls(supabase, (photoRows as Photo[]) ?? []);

  return NextResponse.json({ trip: trip as Trip, photos });
}

/** DELETE /api/trips/:tripId — 旅程を削除（photos 行は cascade で消える） */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const user = await getUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { tripId } = await params;
  const supabase = await getServerSupabase();

  // 注: Storage 上の画像本体はここでは削除しない（将来 storage.remove で対応）。
  const { error } = await supabase.from('trips').delete().eq('id', tripId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
