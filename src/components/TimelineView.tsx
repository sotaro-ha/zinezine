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

/** Storage 上で消すべきパス（原寸 + サムネ） */
function storagePaths(p: PhotoWithUrl): string[] {
  return p.thumb_path ? [p.storage_path, p.thumb_path] : [p.storage_path];
}

/**
 * 撮影時刻順のタイムライン。所有者はここで写真を削除できる（単体 / 複数選択）。
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allSelected = photos.length > 0 && selected.size === photos.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.id)));

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const removeMany = async (targets: PhotoWithUrl[]) => {
    if (targets.length === 0 || busy) return;
    if (!window.confirm(`${targets.length} 枚を削除しますか？（地図・zine からも消えます）`))
      return;
    setBusy(true);
    setError(null);
    try {
      const ids = targets.map((p) => p.id);
      const { error: dbErr } = await supabase.from('photos').delete().in('id', ids);
      if (dbErr) throw dbErr;
      await supabase.storage.from('photos').remove(targets.flatMap(storagePaths));
      exitSelect();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setBusy(false);
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

  const groups: { day: string; items: PhotoWithUrl[] }[] = [];
  for (const p of photos) {
    const key = dayKey(p);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(p);
    else groups.push({ day: key, items: [p] });
  }

  const selectedPhotos = photos.filter((p) => selected.has(p.id));

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-xl space-y-6">
        {/* ツールバー（所有者のみ） */}
        {isOwner && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-2xl border border-border bg-card/85 px-3 py-2 backdrop-blur">
            {selecting ? (
              <>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  {allSelected ? '全解除' : '全選択'}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{selected.size} 枚選択</span>
                  <button
                    type="button"
                    disabled={selected.size === 0 || busy}
                    onClick={() => removeMany(selectedPhotos)}
                    className="rounded-full bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground transition disabled:opacity-50"
                  >
                    {busy ? '削除中…' : '削除'}
                  </button>
                  <button
                    type="button"
                    onClick={exitSelect}
                    className="rounded-full border border-border px-3 py-1.5 text-sm"
                  >
                    やめる
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground">{photos.length} 枚</span>
                <button
                  type="button"
                  onClick={() => setSelecting(true)}
                  className="rounded-full border border-border px-4 py-1.5 text-sm transition hover:border-accent/40 hover:text-accent"
                >
                  選択
                </button>
              </>
            )}
          </div>
        )}

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
                const noGps = p.lat == null || p.lng == null;
                const isSel = selected.has(p.id);
                return (
                  <li
                    key={p.id}
                    className="reveal relative"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <span className="absolute -left-[23px] top-5 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" />
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: 行内に操作ボタンを別途用意している */}
                    <div
                      onClick={selecting ? () => toggle(p.id) : undefined}
                      className={`flex items-center gap-3 rounded-2xl border bg-card p-2.5 shadow-[var(--shadow-card)] transition ${
                        selecting ? 'cursor-pointer' : ''
                      } ${isSel ? 'border-accent ring-2 ring-accent/30' : 'border-border'}`}
                    >
                      {selecting && (
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                            isSel
                              ? 'border-accent bg-accent text-accent-foreground'
                              : 'border-border text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      )}
                      {p.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumb_url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-16 w-16 shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-secondary text-accent/40">
                          ✦
                        </div>
                      )}
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

                      {isOwner && !selecting && (
                        <button
                          type="button"
                          onClick={() => removeMany([p])}
                          aria-label="この写真を削除"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        >
                          ×
                        </button>
                      )}
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
