'use client';

import { extractMeta } from '@/lib/exif';
import { getBrowserSupabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

type Status = 'pending' | 'uploading' | 'done' | 'error';
type Item = { file: File; status: Status; message?: string; hasGps?: boolean };

const CONCURRENCY = 3; // req.md: 同時アップロードは 3 に制限

/** Storage キーに使えるよう、ファイル名を安全な文字へ寄せる */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_');
}

export default function PhotoUploader({ tripId }: { tripId: string }) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const uploadOne = useCallback(
    async (item: Item, idx: number, userId: string) => {
      update(idx, { status: 'uploading' });
      try {
        const meta = await extractMeta(item.file);

        // 所有者・旅程ごとに整理し、衝突を避けるため uuid を前置
        const path = `${userId}/${tripId}/${crypto.randomUUID()}-${safeName(item.file.name)}`;
        const { error: upErr } = await supabase.storage.from('photos').upload(path, item.file, {
          contentType: item.file.type || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) throw upErr;

        const { error: dbErr } = await supabase.from('photos').insert({
          user_id: userId,
          trip_id: tripId,
          storage_path: path,
          lat: meta.lat,
          lng: meta.lng,
          taken_at: meta.takenAt ? meta.takenAt.toISOString() : null,
          width: meta.width,
          height: meta.height,
        });
        if (dbErr) throw dbErr;

        update(idx, { status: 'done', hasGps: meta.lat != null && meta.lng != null });
      } catch (e) {
        update(idx, {
          status: 'error',
          message: e instanceof Error ? e.message : '不明なエラー',
        });
      }
    },
    [supabase, tripId],
  );

  // 並列度 CONCURRENCY のシンプルなワーカープール
  const runPool = useCallback(
    async (list: Item[], userId: string) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const idx = cursor++;
          await uploadOne(list[idx], idx, userId);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
    },
    [uploadOne],
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const list: Item[] = Array.from(fileList).map((file) => ({
        file,
        status: 'pending' as Status,
      }));
      setItems(list);
      setBusy(true);
      await runPool(list, user.id);
      setBusy(false);

      // サーバーコンポーネントを再取得して地図に反映
      router.refresh();
    },
    [runPool, router, supabase],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) void handleFiles(e.dataTransfer.files);
  };

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
          dragging
            ? '-translate-y-0.5 border-accent bg-accent/5 shadow-[var(--shadow-card)]'
            : 'border-border hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent/[0.02]'
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-xl text-accent">
          ↑
        </span>
        <span className="font-serif text-xl">ここに写真をドロップ</span>
        <span className="text-sm text-muted-foreground">またはクリックして選択（複数可）</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {items.length > 0 && (
        <div className="space-y-2">
          {busy && (
            <p className="text-sm text-muted-foreground">
              アップロード中… ({done}/{items.length})
            </p>
          )}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate text-foreground/80">{it.file.name}</span>
                <span className="shrink-0">
                  {it.status === 'uploading' && <span className="text-muted-foreground">…</span>}
                  {it.status === 'done' && (
                    <span className="text-accent">{it.hasGps ? '✓ 表示' : '✓ GPSなし'}</span>
                  )}
                  {it.status === 'error' && (
                    <span className="text-destructive" title={it.message}>
                      失敗
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!busy && (
            <p className="text-sm text-muted-foreground">
              完了: {done} 枚{failed > 0 && `、失敗: ${failed} 枚`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
