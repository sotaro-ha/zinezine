import { createBrowserClient } from '@supabase/ssr';

// このファイルはクライアント/サーバー双方から import される。
// next/headers のようなサーバー専用 API は絶対に import しない（クライアントバンドルが壊れる）。
// サーバー専用クライアントは @/lib/supabase-server を参照すること。

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // 起動時に気づけるよう明示的に警告（値は出力しない）
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です。.env.local を確認してください。',
  );
}

/** ブラウザ用クライアント（'use client' から使う）。セッションは cookie に保持される。 */
export function getBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 写真本体の URL は「署名付き URL」を使う（バケットは非公開。Storage RLS で
// 自分 or 共有された旅程のみ発行できる）。発行はサーバー側で行う想定のため
// @/lib/supabase-server の signedPhotoUrls / signedPhotoUrlMap を使うこと。
