import { getServerSupabase } from '@/lib/supabase-server';
import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

/** 現在のユーザー（未ログインなら null）。Server Component / Route Handler から。 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * ページ用ガード: ログインしていなければ /login へリダイレクトする。
 * proxy でも弾くが、Server Component 単体でも安全側に倒すため二重で確認する。
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

/** Route Handler 用: ログイン済みなら User を、未ログインなら null を返す（呼び出し側で 401 を返す）。 */
export async function getUserOrNull(): Promise<User | null> {
  return getCurrentUser();
}
