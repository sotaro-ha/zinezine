import { isAdminEmail } from '@/lib/admin';
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
 * ページ用ガード: 管理者でなければ /login へリダイレクトする。
 * middleware でも弾くが、Server Component 単体でも安全側に倒すため二重で確認する。
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect('/login');
  }
  return user;
}

/** Route Handler 用: 管理者なら User を、そうでなければ null を返す（呼び出し側で 401 を返す）。 */
export async function getAdminUserOrNull(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && isAdminEmail(user.email) ? user : null;
}
