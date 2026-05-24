'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { PhotoWithUrl } from '@/types/photo';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * 旅程内の写真を一覧し、不要なものを削除する（所有者向け）。
 * 削除は DB 行 → Storage 本体の順で消す（RLS は所有者のみ許可）。
 */
export default function PhotoManager({
  tripId: _tripId,
  photos,
}: {
  tripId: string;
  photos: PhotoWithUrl[];
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
      // 先に DB 行を消す（一覧・地図から即座に消える）
      const { error: dbErr } = await supabase.from('photos').delete().eq('id', photo.id);
      if (dbErr) throw dbErr;
      // Storage 本体も掃除（失敗しても DB 側は消えているので致命ではない）
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
    return <p className="text-sm text-muted-foreground">まだ写真がありません。</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((p) => {
          const isDeleting = deleting.has(p.id);
          const noGps = p.lat == null || p.lng == null;
          return (
            <li
              key={p.id}
              className={`group relative aspect-square overflow-hidden rounded-xl border border-border bg-secondary transition ${
                isDeleting ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />

              {noGps && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-card/85 px-2 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
                  GPSなし
                </span>
              )}

              {confirmId === p.id ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 px-2 text-center backdrop-blur-sm">
                  <span className="text-xs font-medium text-white">削除しますか？</span>
                  <div className="flex gap-2">
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
                      className="rounded-full bg-card px-3 py-1 text-xs"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  aria-label="この写真を削除"
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
