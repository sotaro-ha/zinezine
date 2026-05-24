'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { TripShare } from '@/types/trip';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

/** 簡易メール形式チェック（厳密さより誤入力防止が目的） */
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * 旅程の共有管理。トップバーの「共有」ボタンを兼ね、押すとモーダルを開く。
 * メール単位で共有先を追加 / 解除する（所有者のみ）。
 */
export default function ShareManager({ tripId }: { tripId: string }) {
  const supabase = getBrowserSupabase();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<TripShare[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('trip_shares')
      .select('trip_id, shared_with_email, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (error) setError('共有先の取得に失敗しました');
    else setShares((data as TripShare[]) ?? []);
    setLoading(false);
  }, [supabase, tripId]);

  // モーダルを開いたときに読み込む
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || busy) return;
    if (!looksLikeEmail(value)) {
      setError('メールアドレスの形式が正しくありません');
      return;
    }
    if (shares.some((s) => s.shared_with_email === value)) {
      setError('すでに共有済みです');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('trip_shares')
      .insert({ trip_id: tripId, shared_with_email: value });
    if (error) setError('共有の追加に失敗しました');
    else {
      setEmail('');
      await load();
    }
    setBusy(false);
  };

  const remove = async (target: string) => {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('trip_shares')
      .delete()
      .eq('trip_id', tripId)
      .eq('shared_with_email', target);
    if (error) setError('共有の解除に失敗しました');
    else await load();
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="floating flex h-10 items-center gap-1.5 px-4 text-sm transition hover:text-accent"
      >
        共有
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="toast-in surface relative z-10 w-full max-w-md space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl">共有</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary"
              >
                ×
              </button>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              メールアドレスを指定すると、その人がログインしたときにこの旅程を閲覧できます（編集は所有者のみ）。
            </p>

            <form onSubmit={add} className="flex flex-wrap gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="共有相手のメールアドレス"
                className="min-w-0 flex-1 rounded-xl border border-input bg-background/60 px-4 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <button type="submit" disabled={busy || !email.trim()} className="btn-accent">
                共有する
              </button>
            </form>

            {error && (
              <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            {loading ? (
              <p className="text-sm text-muted-foreground">読み込み中…</p>
            ) : shares.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ誰にも共有していません。</p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {shares.map((s) => (
                  <li
                    key={s.shared_with_email}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="truncate text-foreground/80">{s.shared_with_email}</span>
                    <button
                      type="button"
                      onClick={() => void remove(s.shared_with_email)}
                      disabled={busy}
                      className="shrink-0 rounded-full px-3 py-1 text-xs text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
                    >
                      解除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
