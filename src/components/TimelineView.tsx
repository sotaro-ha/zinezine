'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { PhotoWithUrl } from '@/types/photo';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function timeLabel(p: PhotoWithUrl): string {
  if (!p.taken_at) return '時刻不明';
  return new Date(p.taken_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function dayKey(p: PhotoWithUrl): string {
  if (!p.taken_at) return '日付なし';
  return new Date(p.taken_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

/**
 * 撮影時刻順のタイムライン。所有者はここで写真を削除できる。
 */
export default function TimelineView({
  tripId: _tripId,
  photos,
  isOwner,
}: {
  tripId: string;
  photos: PhotoWithUrl[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (photo: PhotoWithUrl) => {
    setConfirmId(null);
    setError(null);
    setDeleting((s) => new Set(s).add(photo.id));
    try {
      const { error: dbErr } = await supabase.from('photos').delete().eq('id', photo.id);
      if (dbErr) throw dbErr;
      await supabase.storage.from('photos').remove([photo.storage_path]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
      setDeleting((s) => {
        const n = new Set(s);
        n.delete(photo.id);
        return n;
      });
    }
  };

  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-2xl text-accent/40">✦</span>
        <p className="text-sm">写真を追加すると時系列に並びます</p>
      </div>
    );
  }

  // 撮影日でグルーピング（photos は taken_at 昇順で渡される）
  const groups: { day: string; items: PhotoWithUrl[] }[] = [];
  for (const p of photos) {
    const key = dayKey(p);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(p);
    else groups.push({ day: key, items: [p] });
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-xl space-y-8">
        {error && (
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.day} className="space-y-3">
            <h3 className="font-serif text-lg text-accent">{g.day}</h3>
            <ul className="relative space-y-3 border-l border-border pl-5">
              {g.items.map((p, i) => {
                const isDeleting = deleting.has(p.id);
                const noGps = p.lat == null || p.lng == null;
                return (
                  <li
                    key={p.id}
                    className={`reveal relative ${isDeleting ? 'pointer-events-none opacity-40' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    {/* タイムラインのドット */}
                    <span className="absolute -left-[23px] top-5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
                    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-[var(--shadow-card)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumb_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-16 w-16 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium tabular-nums">{timeLabel(p)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {noGps ? (
                            <span className="text-muted-foreground/70">
                              GPSなし（地図に出ません）
                            </span>
                          ) : (
                            <span className="tabular-nums">
                              {p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}
                            </span>
                          )}
                        </p>
                      </div>

                      {isOwner &&
                        (confirmId === p.id ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => remove(p)}
                              className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
                            >
                              削除
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmId(null)}
                              className="rounded-full border border-border px-3 py-1 text-xs"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmId(p.id)}
                            aria-label="この写真を削除"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          >
                            ×
                          </button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
