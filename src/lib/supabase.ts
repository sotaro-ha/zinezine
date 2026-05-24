import { createBrowserClient, createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // 起動時に気づけるよう明示的に警告（値は出力しない）
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local を確認してください。',
  );
}

/**
 * ブラウザ用クライアント（'use client' から使う）。
 * MVP は anon key で直接 Storage/DB にアクセスする（RLS で anon を許可）。
 */
export function getBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * サーバーコンポーネント/Route Handler 用クライアント。
 * MVP は認証なしのためクッキー連携は最小限（no-op）。
 * 将来 Supabase Auth を入れる際は cookies() を渡して getAll/setAll を実装する。
 */
export function getServerSupabase() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}

/** Storage 上のパスから公開 URL を組み立てる */
export function publicPhotoUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${storagePath}`;
}
