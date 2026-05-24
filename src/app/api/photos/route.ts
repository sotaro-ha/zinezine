import { getServerSupabase, publicPhotoUrl } from '@/lib/supabase';
import type { Photo, PhotoWithUrl } from '@/types/photo';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** GET /api/photos — 全写真メタデータを撮影日時順で返す */
export async function GET() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .order('taken_at', { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const photos: PhotoWithUrl[] = ((data as Photo[]) ?? []).map((p) => ({
    ...p,
    url: publicPhotoUrl(p.storage_path),
  }));

  return NextResponse.json({ photos });
}
