'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { PhotoWithUrl } from '@/types/photo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const STICKERS = ['✨', '❤️', '😊', '📍', '🌿', '☀️', '🎒', '📸', '⭐️', '🗺️', '🌊', '🍜'];
const A4 = 210 / 297; // 幅 / 高さ

type GeoPhoto = PhotoWithUrl & { lat: number; lng: number };
type Sticker = { id: string; emoji: string; x: number; y: number; size: number };
type StickerMap = Record<string, Sticker[]>;

type Page =
  | { id: 'cover'; kind: 'cover' }
  | { id: 'map'; kind: 'map' }
  | { id: string; kind: 'day'; label: string; date: string; items: PhotoWithUrl[] };

function dayLabel(p: PhotoWithUrl): string {
  if (!p.taken_at) return '日付なし';
  return new Date(p.taken_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function dateRange(photos: PhotoWithUrl[]): string {
  const times = photos
    .map((p) => p.taken_at && new Date(p.taken_at))
    .filter((d): d is Date => d instanceof Date);
  if (times.length === 0) return '';
  const min = new Date(Math.min(...times.map((d) => +d)));
  const max = new Date(Math.max(...times.map((d) => +d)));
  const f = (d: Date) => d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  return min.toDateString() === max.toDateString() ? f(min) : `${f(min)} – ${f(max)}`;
}

/** 旅程の代表点で MapTiler の静的地図（A4 比率）を作る */
function staticMapUrl(geo: GeoPhoto[]): string | null {
  if (!MAPTILER_KEY || geo.length === 0) return null;
  const step = Math.max(1, Math.ceil(geo.length / 40));
  const pts = geo.filter((_, i) => i % step === 0);
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join('|');
  const base = `https://api.maptiler.com/maps/streets-v2/static/auto/600x848@2x.png?key=${MAPTILER_KEY}&padding=90`;
  return pts.length < 2
    ? `${base}&markers=${coords}`
    : `${base}&path=stroke:0x0a4a4eff|width:5|${coords}`;
}

/** その日の枚数に応じたコラージュ構成（グリッド列数・行数・先頭の span） */
function collage(n: number): { cols: number; rows: number; span0: boolean } {
  if (n <= 1) return { cols: 1, rows: 1, span0: false };
  if (n === 2) return { cols: 1, rows: 2, span0: false };
  if (n === 3) return { cols: 2, rows: 2, span0: true };
  if (n === 4) return { cols: 2, rows: 2, span0: false };
  if (n <= 6) return { cols: 2, rows: 3, span0: n === 5 };
  return { cols: 3, rows: 3, span0: false };
}

/**
 * zine（ストーリー型の提案）。A4 比率のページを画面内にフィットさせ、
 * 表紙 → 旅の地図 → Day 別コラージュを自動生成。
 * Instagram ストーリーのように送りながらスタンプを貼れる（保存・共有される）。
 */
export default function ZineStory({
  tripId,
  title,
  photos,
}: {
  tripId: string;
  title: string;
  photos: PhotoWithUrl[];
}) {
  const supabase = getBrowserSupabase();
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const dragId = useRef<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [stickers, setStickers] = useState<StickerMap>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const geo = useMemo(
    () => photos.filter((p): p is GeoPhoto => p.lat != null && p.lng != null),
    [photos],
  );

  const pages = useMemo<Page[]>(() => {
    const groups: { day: string; items: PhotoWithUrl[] }[] = [];
    for (const p of photos) {
      const key = dayLabel(p);
      const last = groups[groups.length - 1];
      if (last && last.day === key) last.items.push(p);
      else groups.push({ day: key, items: [p] });
    }
    const result: Page[] = [{ id: 'cover', kind: 'cover' }];
    if (geo.length > 0) result.push({ id: 'map', kind: 'map' });
    groups.forEach((g, i) =>
      result.push({
        id: `day-${i}`,
        kind: 'day',
        label: `Day ${i + 1}`,
        date: g.day,
        items: g.items,
      }),
    );
    return result;
  }, [photos, geo]);

  const current = pages[Math.min(idx, pages.length - 1)];
  const mapUrl = useMemo(() => staticMapUrl(geo), [geo]);
  const dateText = useMemo(() => dateRange(photos), [photos]);

  // A4 をコンテナ内にフィット（レターボックス）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const padW = r.width - 28;
      const padH = r.height - 28;
      let h = padH;
      let w = h * A4;
      if (w > padW) {
        w = padW;
        h = w / A4;
      }
      setSize({ w: Math.max(0, w), h: Math.max(0, h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('zine_boards')
        .select('data')
        .eq('trip_id', tripId)
        .maybeSingle();
      if (alive && data?.data?.stickers) setStickers(data.data.stickers as StickerMap);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, tripId]);

  const persist = useCallback(
    (next: StickerMap) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void supabase.from('zine_boards').upsert({
          trip_id: tripId,
          data: { stickers: next },
          updated_at: new Date().toISOString(),
        });
      }, 700);
    },
    [supabase, tripId],
  );

  const updatePageStickers = (pageId: string, fn: (list: Sticker[]) => Sticker[]) => {
    setStickers((prev) => {
      const next = { ...prev, [pageId]: fn(prev[pageId] ?? []) };
      persist(next);
      return next;
    });
  };

  const addSticker = (emoji: string) => {
    const s: Sticker = { id: crypto.randomUUID(), emoji, x: 50, y: 50, size: 48 };
    updatePageStickers(current.id, (list) => [...list, s]);
    setPalette(false);
    setSelected(s.id);
  };

  const onPagePointerMove = (e: React.PointerEvent) => {
    if (!dragId.current || !pageRef.current) return;
    const r = pageRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    updatePageStickers(current.id, (list) =>
      list.map((s) =>
        s.id === dragId.current
          ? { ...s, x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) }
          : s,
      ),
    );
  };

  const pageStickers = stickers[current.id] ?? [];

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full select-none items-center justify-center bg-neutral-900 p-3.5"
    >
      {/* 進捗バー */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex gap-1 p-2">
        {pages.map((p, i) => (
          <span
            key={p.id}
            className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>

      {/* A4 ページ（ステージ） */}
      {size.w > 0 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: 送りは左右ボタンでも可能
        <div
          ref={pageRef}
          onPointerMove={onPagePointerMove}
          onPointerUp={() => {
            dragId.current = null;
          }}
          onClick={() => setSelected(null)}
          style={{ width: size.w, height: size.h }}
          className="relative overflow-hidden rounded-md bg-white shadow-[var(--shadow-float)]"
        >
          <PageBody
            page={current}
            title={title}
            mapUrl={mapUrl}
            dateText={dateText}
            heroPhoto={photos[0]}
          />

          {pageStickers.map((s) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: ドラッグ可能なスタンプ（削除は×）
            <div
              key={s.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                dragId.current = s.id;
                setSelected(s.id);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                fontSize: s.size,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute cursor-grab touch-none active:cursor-grabbing ${
                selected === s.id ? 'rounded-2xl outline outline-2 outline-accent' : ''
              }`}
            >
              <span className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">{s.emoji}</span>
              {selected === s.id && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePageStickers(current.id, (list) => list.filter((x) => x.id !== s.id));
                    setSelected(null);
                  }}
                  className="-right-3 -top-3 absolute flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm text-black shadow"
                  aria-label="スタンプを削除"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 送り（左右） */}
      <button
        type="button"
        aria-label="前のページ"
        onClick={() => setIdx((i) => Math.max(0, i - 1))}
        disabled={idx === 0}
        className="absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow disabled:opacity-0"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="次のページ"
        onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
        disabled={idx >= pages.length - 1}
        className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow disabled:opacity-0"
      >
        ›
      </button>

      {/* スタンプ・パレット */}
      {palette && (
        <div className="absolute inset-x-0 bottom-20 z-40 mx-auto flex max-w-md flex-wrap justify-center gap-2 rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur">
          {STICKERS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => addSticker(e)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition hover:bg-secondary"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* 下部ツール */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 p-4">
        <span className="rounded-full bg-black/45 px-3 py-1 text-white text-xs backdrop-blur">
          {idx + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={() => setPalette((v) => !v)}
          className="flex h-11 items-center gap-1.5 rounded-full bg-white px-5 font-medium text-black text-sm shadow-[var(--shadow-float)]"
        >
          ✨ スタンプ
        </button>
      </div>
    </div>
  );
}

function PageBody({
  page,
  title,
  mapUrl,
  dateText,
  heroPhoto,
}: {
  page: Page;
  title: string;
  mapUrl: string | null;
  dateText: string;
  heroPhoto?: PhotoWithUrl;
}) {
  if (page.kind === 'cover') {
    return (
      <div className="relative h-full w-full bg-accent">
        {heroPhoto?.thumb_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroPhoto.thumb_url} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/25" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/75">Travel Zine</span>
          <h2 className="mt-1 font-serif text-4xl leading-tight">{title}</h2>
          {dateText && <p className="mt-1 text-sm text-white/85">{dateText}</p>}
        </div>
      </div>
    );
  }

  if (page.kind === 'map') {
    return (
      <div className="relative h-full w-full bg-secondary">
        {mapUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mapUrl} alt="旅の地図" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            位置情報のある写真がありません
          </div>
        )}
        <div className="absolute inset-x-0 top-5 text-center">
          <span className="rounded-full bg-black/45 px-4 py-1.5 font-serif text-lg text-white backdrop-blur">
            旅の地図
          </span>
        </div>
      </div>
    );
  }

  // day: コラージュ
  const { cols, rows, span0 } = collage(page.items.length);
  const cap = cols * rows;
  const shown = page.items.slice(0, Math.min(page.items.length, cap));
  const extra = page.items.length - shown.length;

  return (
    <div className="relative h-full w-full bg-white">
      <div
        className="grid h-full w-full gap-1.5 p-2.5"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`,
        }}
      >
        {shown.map((p, i) => (
          <div
            key={p.id}
            className={`relative overflow-hidden rounded-sm bg-secondary ${
              span0 && i === 0 ? 'col-span-2' : ''
            }`}
          >
            {p.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-accent/40">✦</div>
            )}
            {i === shown.length - 1 && extra > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 font-medium text-white">
                +{extra}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="absolute top-3 left-3 rounded-full bg-black/45 px-3 py-1 text-white backdrop-blur">
        <span className="font-serif text-base">{page.label}</span>
        <span className="ml-2 text-[11px] text-white/80">{page.date}</span>
      </div>
    </div>
  );
}
