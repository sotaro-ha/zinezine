import { getServerSupabase } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/** POST /api/auth/signout — サインアウトして /login へ（フォーム送信から使う） */
export async function POST(request: Request) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
