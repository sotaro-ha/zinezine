import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** 署名付き URL の既定有効期限（秒）。ページ表示中に切れない程度に短く。 */
const SIGNED_URL_TTL = 60 * 60; // 1 時間

/**
 * Storage パス → 署名付き URL の Map を作る。
 * バケットは非公開なので、呼び出しユーザーが Storage RLS 上で読めるパスにだけ URL が返る
 * （自分のフォルダ or 共有された旅程）。読めないパスは Map に含まれない。
 */
export async function signedPhotoUrlMap(
  supabase: SupabaseClient,
  paths: string[],
  expiresIn: number = SIGNED_URL_TTL,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return map;

  const { data } = await supabase.storage.from('photos').createSignedUrls(unique, expiresIn);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) {
      map.set(item.path, item.signedUrl);
    }
  }
  return map;
}

/**
 * サーバーコンポーネント / Route Handler 用クライアント。
 * cookie 経由でセッションを読む。Server Component では set 不可なので、
 * トークンのリフレッシュは middleware が担う（setAll の例外は握りつぶす）。
 * next/headers を import するため、クライアントからは読み込めない（@/lib/supabase を使うこと）。
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からの呼び出し。middleware がセッションを更新するため無視してよい。
        }
      },
    },
  });
}
