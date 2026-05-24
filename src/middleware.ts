import { isAdminEmail } from '@/lib/admin';
import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

// 認証なしでアクセスできるパス
const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // セッションのリフレッシュも兼ねる（getUser を呼ぶことで cookie が更新される）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // 未認証 → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 認証済みだが管理者許可リスト外 → サインアウトして /login?error=not_admin
  if (user && !isAdminEmail(user.email)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'not_admin');
    return NextResponse.redirect(url);
  }

  // 認証済み管理者が /login にいる → /trips へ
  if (user && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/trips';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // /api（Route Handler 側で認証）と静的アセットは除外
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
