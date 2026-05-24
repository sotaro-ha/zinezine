import { getAdminUserOrNull } from '@/lib/auth';
import { attachPhotoUrls, getServerSupabase } from '@/lib/supabase-server';
import type { Photo } from '@/types/photo';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/photos?tripId=... — 写真メタデータを撮影日時順で返す（自分の写真のみ、RLS で担保） */
export async function GET(request: Request) {
  const user = await getAdminUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const tripId = new URL(request.url).searchParams.get('tripId');
  const supabase = await getServerSupabase();

  let query = supabase
    .from('photos')
    .select('*')
    .order('taken_at', { ascending: true, nullsFirst: false });
  if (tripId) {
    query = query.eq('trip_id', tripId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const photos = await attachPhotoUrls(supabase, (data as Photo[]) ?? []);

  return NextResponse.json({ photos });
}
