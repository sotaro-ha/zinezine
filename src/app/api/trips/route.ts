import { getAdminUserOrNull } from '@/lib/auth';
import { getServerSupabase, signedPhotoUrlMap } from '@/lib/supabase-server';
import type { Trip, TripWithMeta } from '@/types/trip';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type TripRow = Trip & { photos: { storage_path: string }[] };

/** GET /api/trips — 自分の旅程一覧（新しい順、写真枚数と代表写真付き） */
export async function GET() {
  const user = await getAdminUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('trips')
    .select('*, photos(storage_path)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as TripRow[]) ?? [];
  const coverPaths = rows
    .map((t) => t.cover_photo_path ?? t.photos[0]?.storage_path ?? null)
    .filter((p): p is string => p != null);
  const signed = await signedPhotoUrlMap(supabase, coverPaths);

  const trips: TripWithMeta[] = rows.map((t) => {
    const cover = t.cover_photo_path ?? t.photos[0]?.storage_path ?? null;
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

  return NextResponse.json({ trips });
}

/** POST /api/trips — 旅程を新規作成 */
export async function POST(request: Request) {
  const user = await getAdminUserOrNull();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { title, description } = (body ?? {}) as { title?: unknown; description?: unknown };
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 });
  }
  if (trimmedTitle.length > 120) {
    return NextResponse.json({ error: 'title が長すぎます（120文字以内）' }, { status: 400 });
  }
  const desc = typeof description === 'string' && description.trim() ? description.trim() : null;

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from('trips')
    .insert({ user_id: user.id, title: trimmedTitle, description: desc })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trip: data as Trip }, { status: 201 });
}
