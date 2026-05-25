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
  });
}

/** 左レール用のコンパクトな日付（5/23 と 金） */
function dateParts(p: PhotoWithUrl): { md: string; wd: string } {
  if (!p.taken_at) return { md: '日付', wd: 'なし' };
  const d = new Date(p.taken_at);
  return {
    md: d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
    wd: d.toLocaleDateString('ja-JP', { weekday: 'short' }),
  };
}

/** Storage 上で消すべきパス（原寸 + サムネ） */
function storagePaths(p: PhotoWithUrl): string[] {
  return p.thumb_path ? [p.storage_path, p.thumb_path] : [p.storage_path];
}

/**
 * 撮影時刻順のタイムライン。左に日付、右に大きな写真を縦に並べる。
 * 自分が上げた写真は削除できる（所有者は任意の写真を削除可。単体 / 複数選択）。
 */
export default function TimelineView({
  tripId: _tripId,
  photos,
  isOwner,
  currentUserId = null,
}: {
  tripId: string;
  photos: PhotoWithUrl[];
  isOwner: boolean;
  currentUserId?: string | null;
}) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cols, setCols] = useState(1); // 写真の大きさ（1=大きい … 3=小さい）

  // 削除できるのは「自分が上げた写真」OR「旅程の所有者（任意の写真）」。
  const canDelete = (p: PhotoWithUrl) =>
    isOwner || (currentUserId != null && p.user_id === currentUserId);
  const deletable = photos.filter(canDelete);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allSelected = deletable.length > 0 && selected.size === deletable.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(deletable.map((p) => p.id)));

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
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {error && (
          <p className="border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {groups.map((g) => {
          const { md, wd } = dateParts(g.items[0]);
          return (
            <section key={g.day} className="flex gap-3 sm:gap-5">
              {/* 左レール: 日付 */}
              <div className="w-12 shrink-0 sm:w-16">
                <div className="sticky top-16 text-right leading-tight">
                  <div className="font-serif text-xl text-accent sm:text-2xl">{md}</div>
                  <div className="text-xs text-muted-foreground">{wd}</div>
                </div>
              </div>

              {/* 右: 写真（大きさはスライダーで） */}
              <div
                className="grid min-w-0 flex-1 gap-3"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {g.items.map((p, i) => {
                  const noGps = p.lat == null || p.lng == null;
                  const isSel = selected.has(p.id);
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: 選択モード以外では別ボタンで操作する
                    <figure
                      key={p.id}
                      onClick={selecting ? () => toggle(p.id) : undefined}
                      className={`reveal relative overflow-hidden border bg-card shadow-[var(--shadow-card)] transition ${
                        selecting ? 'cursor-pointer' : ''
                      } ${isSel ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}
                      style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    >
                      {p.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumb_url}
                          alt={timeLabel(p)}
                          loading="lazy"
                          decoding="async"
                          className={`block w-full object-cover ${
                            cols === 1 ? 'max-h-[78vh]' : 'aspect-square'
                          }`}
                        />
                      ) : (
                        <div
                          className={`flex w-full items-center justify-center bg-secondary text-2xl text-accent/40 ${
                            cols === 1 ? 'aspect-[4/3]' : 'aspect-square'
                          }`}
                        >
                          ✦
                        </div>
                      )}

                      {/* 左下: 時刻 + 位置の有無 */}
                      <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-4 pb-3 pt-8 text-sm text-white">
                        <span className="font-medium tabular-nums">{timeLabel(p)}</span>
                        <span className="text-xs text-white/85">
                          {noGps ? '· 位置情報なし' : '· 📍 地図に表示'}
                        </span>
                      </figcaption>

                      {/* 右上: 選択 / 削除（自分の写真 or 所有者） */}
                      {canDelete(p) &&
                        (selecting ? (
                          <span
                            className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                              isSel
                                ? 'border-accent bg-accent text-accent-foreground'
                                : 'border-white/70 bg-black/30 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeMany([p])}
                            aria-label="この写真を削除"
                            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-destructive"
                          >
                            ×
                          </button>
                        ))}
                    </figure>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* ツールバー（下部に固定） */}
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border border-border bg-card/85 px-3 py-2 backdrop-blur">
          {/* 大きさスライダー */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden>▦</span>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={4 - cols}
              onChange={(e) => setCols(4 - Number(e.target.value))}
              className="timeline-range w-24"
              aria-label="写真の大きさ"
            />
            <span aria-hidden className="text-base">
              ⬚
            </span>
          </label>

          {/* 選択 / 削除（削除できる写真がある場合のみ） */}
          {deletable.length > 0 &&
            (selecting ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground"
                >
                  {allSelected ? '全解除' : '全選択'}
                </button>
                <span className="text-sm text-muted-foreground">{selected.size} 枚</span>
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
            ) : (
              <button
                type="button"
                onClick={() => setSelecting(true)}
                className="rounded-full border border-border px-4 py-1.5 text-sm transition hover:border-accent/40 hover:text-accent"
              >
                選択
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
