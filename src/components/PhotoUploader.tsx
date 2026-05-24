'use client';

import { extractMeta } from '@/lib/exif';
import { getBrowserSupabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'pending' | 'uploading' | 'done' | 'error';
type Item = { file: File; status: Status; message?: string; hasGps?: boolean };
type Result = { added: number; gps: number; failed: number; aborted: boolean };

const CONCURRENCY = 3; // req.md: 同時アップロードは 3 に制限

/** Storage キーに使えるよう、ファイル名を安全な文字へ寄せる */
function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_');
}

/** 表示画像から縮小サムネ(JPEG)を作る。一覧/地図用に軽くする。失敗時は null。 */
async function makeThumb(blob: Blob, maxEdge = 1024, quality = 0.72): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close?.();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
  } catch {
    return null;
  }
}

/** ミリ秒を「約 N 秒 / 約 N 分」に */
function fmtEta(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `約 ${s} 秒`;
  return `約 ${Math.ceil(s / 60)} 分`;
}

/**
 * 写真アップロードのモーダル。トリガーボタン「＋ 追加」を兼ねる。
 * - 進捗と残り時間(ETA)を表示
 * - アップロード中の閉じる操作は確認付き（完了済みは保存される）
 * - HEIC は表示用に JPEG へ変換（メタは元データから抽出済み）
 */
export default function PhotoUploader({ tripId }: { tripId: string }) {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(0);

  const update = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  // ETA を滑らかに更新するためのティック
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [busy]);

  // アップロード中のタブ離脱を警告
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  const uploadOne = useCallback(
    async (item: Item, idx: number, userId: string) => {
      update(idx, { status: 'uploading' });
      try {
        // メタ（GPS・撮影時刻）は必ず「元ファイル」から抽出して DB に別管理する。
        const meta = await extractMeta(item.file);

        // ブラウザ（Safari 以外）は HEIC を表示できないため、HEIC は JPEG に変換して保存する。
        let body: Blob = item.file;
        let filename = item.file.name;
        let contentType = item.file.type || 'application/octet-stream';
        try {
          const { isHeic, heicTo } = await import('heic-to/next');
          if (await isHeic(item.file)) {
            body = await heicTo({ blob: item.file, type: 'image/jpeg', quality: 0.85 });
            filename = `${item.file.name.replace(/\.(heic|heif)$/i, '')}.jpg`;
            contentType = 'image/jpeg';
          }
        } catch {
          // 変換に失敗しても元ファイルをそのまま保存する（Safari では表示できる）
        }

        const id = crypto.randomUUID();
        const path = `${userId}/${tripId}/${id}-${safeName(filename)}`;
        const { error: upErr } = await supabase.storage.from('photos').upload(path, body, {
          contentType,
          upsert: false,
        });
        if (upErr) throw upErr;

        // 一覧/地図用の縮小サムネ（失敗しても原寸で代替するので致命ではない）
        let thumbPath: string | null = null;
        const thumb = await makeThumb(body);
        if (thumb) {
          const tp = `${userId}/${tripId}/${id}-thumb.jpg`;
          const { error: tErr } = await supabase.storage
            .from('photos')
            .upload(tp, thumb, { contentType: 'image/jpeg', upsert: false });
          if (!tErr) thumbPath = tp;
        }

        const { error: dbErr } = await supabase.from('photos').insert({
          user_id: userId,
          trip_id: tripId,
          storage_path: path,
          thumb_path: thumbPath,
          lat: meta.lat,
          lng: meta.lng,
          taken_at: meta.takenAt ? meta.takenAt.toISOString() : null,
          width: meta.width,
          height: meta.height,
        });
        if (dbErr) throw dbErr;

        update(idx, { status: 'done', hasGps: meta.lat != null && meta.lng != null });
      } catch (e) {
        update(idx, { status: 'error', message: e instanceof Error ? e.message : '不明なエラー' });
      }
    },
    [supabase, tripId],
  );

  const runPool = useCallback(
    async (list: Item[], userId: string) => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          if (abortRef.current) return; // 中断: これ以上は開始しない
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

      const list: Item[] = Array.from(fileList).map((file) => ({ file, status: 'pending' }));
      abortRef.current = false;
      setItems(list);
      setResult(null);
      setStartedAt(Date.now());
      setNow(Date.now());
      setBusy(true);
      try {
        await runPool(list, user.id);
      } finally {
        setBusy(false);
        setItems((prev) => {
          const ok = prev.filter((i) => i.status === 'done');
          const failed = prev.filter((i) => i.status === 'error').length;
          setResult({
            added: ok.length,
            gps: ok.filter((i) => i.hasGps).length,
            failed,
            aborted: abortRef.current,
          });
          return prev;
        });
        router.refresh();
      }
    },
    [runPool, router, supabase],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) void handleFiles(e.dataTransfer.files);
  };

  const requestClose = () => {
    if (busy) {
      const ok = window.confirm(
        'アップロード中です。中断しますか？\n（完了済みの写真は保存されます。残りは追加されません）',
      );
      if (!ok) return;
      abortRef.current = true;
    }
    setOpen(false);
    setItems([]);
    setResult(null);
    setStartedAt(null);
  };

  const finished = items.filter((i) => i.status === 'done' || i.status === 'error').length;
  const remaining = items.length - finished;
  const eta =
    busy && startedAt && finished > 0 ? fmtEta(((now - startedAt) / finished) * remaining) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-[var(--shadow-card)] backdrop-blur transition hover:shadow-[var(--shadow-float)]"
      >
        ＋ 追加
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="閉じる"
            onClick={requestClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="toast-in surface relative z-10 w-full max-w-md space-y-5 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-2xl">写真を追加</h3>
              <button
                type="button"
                onClick={requestClose}
                aria-label="閉じる"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary"
              >
                ×
              </button>
            </div>

            {/* 完了画面 */}
            {result ? (
              <div className="space-y-4 py-2 text-center">
                <div className="badge-pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-2xl text-accent">
                  {result.aborted ? '!' : '✓'}
                </div>
                <p className="font-serif text-xl">
                  {result.aborted ? '中断しました' : 'アップロード完了'}
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {result.added} 枚を追加しました。
                  {result.gps > 0
                    ? ` うち ${result.gps} 枚が地図に表示されます。`
                    : ' GPS 付きの写真がなかったため地図には出ません。'}
                  {result.failed > 0 ? ` （${result.failed} 枚は失敗）` : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setItems([]);
                      inputRef.current?.click();
                    }}
                    className="btn-ghost flex-1"
                  >
                    さらに追加
                  </button>
                  <button type="button" onClick={requestClose} className="btn-accent flex-1">
                    閉じる
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ドロップゾーン */}
                <button
                  type="button"
                  onClick={() => !busy && inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  disabled={busy}
                  className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                    dragging
                      ? '-translate-y-0.5 border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50 hover:bg-accent/[0.02]'
                  } ${busy ? 'cursor-default opacity-60' : ''}`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-accent/20 bg-accent/5 text-xl text-accent">
                    ↑
                  </span>
                  <span className="font-serif text-lg">ここに写真をドロップ</span>
                  <span className="text-xs text-muted-foreground">
                    またはクリックして選択（複数可・jpeg / heic）
                  </span>
                </button>

                {/* 進捗 + ETA */}
                {items.length > 0 && (
                  <div className="space-y-2">
                    {busy && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            アップロード中… {finished}/{items.length}
                          </span>
                          {eta && <span className="text-accent">残り {eta}</span>}
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-accent/15">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-300"
                            style={{ width: `${(finished / items.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                      {items.map((it, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <span className="truncate text-foreground/80">{it.file.name}</span>
                          <span className="shrink-0">
                            {it.status === 'uploading' && (
                              <span className="text-muted-foreground">…</span>
                            )}
                            {it.status === 'done' && (
                              <span className="badge-pop text-accent">
                                {it.hasGps ? '✓ 地図' : '✓'}
                              </span>
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
                  </div>
                )}
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
        </div>
      )}
    </>
  );
}
