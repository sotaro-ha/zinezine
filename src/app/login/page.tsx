import GoogleSignInButton from '@/components/GoogleSignInButton';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === 'not_admin'
      ? 'このアカウントには利用権限がありません（現在は管理者のみ）。'
      : error === 'auth'
        ? 'ログインに失敗しました。もう一度お試しください。'
        : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      {/* 背景の方位記号風リング（地図帳のモチーフ。あくまで控えめに） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-accent/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full border border-accent/10"
      />

      <div className="reveal w-full max-w-sm space-y-9 text-center">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-card/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-accent backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Tabi Photo Map
          </span>
          <h1 className="font-serif text-5xl leading-[1.05]">旅写真マップ</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            旅の写真を、撮った場所と時系列で地図に。
            <br />
            ログインして始めましょう。
          </p>
        </div>

        {message && (
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            {message}
          </p>
        )}

        <GoogleSignInButton />

        <p className="text-xs text-muted-foreground/80">
          現在は招待された管理者アカウントのみ利用できます。
        </p>
      </div>
    </main>
  );
}
