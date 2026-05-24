'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { TripShare } from '@/types/trip';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

/** 簡易メール形式チェック（厳密さより誤入力防止が目的） */
function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function ShareManager({ tripId }: { tripId: string }) {
  const supabase = getBrowserSupabase();
  const [shares, setShares] = useState<TripShare[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('trip_shares')
      .select('trip_id, shared_with_email, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (error) {
      setError('共有先の取得に失敗しました');
    } else {
      setShares((data as TripShare[]) ?? []);
    }
    setLoading(false);
  }, [supabase, tripId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    if (error) {
      setError('共有の追加に失敗しました');
    } else {
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
    if (error) {
      setError('共有の解除に失敗しました');
    } else {
      await load();
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
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
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
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
  );
}
