import { getServerSupabase } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/**
 * Google OAuth のコールバック。認可コードをセッションに交換し cookie を張る。
 * 管理者判定は middleware が担う（非管理者はこの後 /login?error=not_admin へ弾かれる）。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/trips';

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // ローカル開発時は origin（http://localhost:3000）をそのまま使う。
      // 本番ではプロキシ配下で request.url のホスト/プロトコルが内部値になり得るため、
      // プロキシが渡す x-forwarded-host を優先して公開 URL へ戻す。
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      const base = isLocalEnv || !forwardedHost ? origin : `https://${forwardedHost}`;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
