'use client';

import MiniMap from '@/components/MiniMap';
import { getBrowserSupabase } from '@/lib/supabase';
import type { PhotoWithUrl } from '@/types/photo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STICKERS = [
  '✨',
  '❤️',
  '😊',
  '📍',
  '🌿',
  '☀️',
  '🎒',
  '📸',
  '⭐️',
  '🗺️',
  '🌊',
  '🍜',
  '🚃',
  '🍷',
  '⛰️',
  '🏝️',
];
const A4 = 210 / 297;

type GeoPhoto = PhotoWithUrl & { lat: number; lng: number };
type Item = {
  id: string;
  kind: 'emoji' | 'text';
  value: string;
  x: number;
  y: number;
  size: number;
  rot: number;
};
type ItemMap = Record<string, Item[]>;
type LayoutKey = 'auto' | 'grid' | 'hero' | 'rows';
type Board = { items: ItemMap; layouts: Record<string, LayoutKey>; coverId: string | null };

type Page =
  | { id: 'cover'; kind: 'cover' }
  | { id: 'map'; kind: 'map' }
  | { id: string; kind: 'day'; label: string; date: string; items: PhotoWithUrl[] };

const LAYOUTS: { key: LayoutKey; label: string }[] = [
  { key: 'auto', label: '自動' },
  { key: 'grid', label: 'グリッド' },
  { key: 'hero', label: 'ヒーロー' },
  { key: 'rows', label: '段組み' },
];

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

/** 枚数とレイアウト指定からグリッド構成を決める */
function gridOf(n: number, key: LayoutKey): { cols: number; rows: number; span0: boolean } {
  if (key === 'grid') {
    const c = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(n))));
    return { cols: c, rows: Math.min(3, Math.ceil(n / c)), span0: false };
  }
  if (key === 'hero') return { cols: 2, rows: 3, span0: true };
  if (key === 'rows') return { cols: 1, rows: Math.min(4, Math.max(1, n)), span0: false };
  // auto
  if (n <= 1) return { cols: 1, rows: 1, span0: false };
  if (n === 2) return { cols: 1, rows: 2, span0: false };
  if (n === 3) return { cols: 2, rows: 2, span0: true };
  if (n === 4) return { cols: 2, rows: 2, span0: false };
  if (n <= 6) return { cols: 2, rows: 3, span0: n === 5 };
  return { cols: 3, rows: 3, span0: false };
}

/** 旧データ（data.stickers）を Item へ移行 */
function migrate(data: unknown): Partial<Board> {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.items) return d as Partial<Board>;
  const legacy = d.stickers as
    | Record<string, { id: string; emoji: string; x: number; y: number; size: number }[]>
    | undefined;
  if (!legacy) return d as Partial<Board>;
  const items: ItemMap = {};
  for (const [pid, list] of Object.entries(legacy)) {
    items[pid] = list.map((s) => ({
      id: s.id,
      kind: 'emoji',
      value: s.emoji,
      x: s.x,
      y: s.y,
      size: s.size,
      rot: 0,
    }));
  }
  return {
    items,
    layouts: (d.layouts as Board['layouts']) ?? {},
    coverId: (d.coverId as string) ?? null,
  };
}

/**
 * zine（ストーリー型の提案）。A4 ページを画面内にフィットさせ、表紙→旅の地図→Day別コラージュを自動生成。
 * スタンプ/テキストを貼り（移動・拡大・回転・削除）、ページごとにレイアウトや表紙写真を選べる。保存・共有される。
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
  const drag = useRef<{ id: string; mode: 'move' | 'transform' } | null>(null);

  const [idx, setIdx] = useState(0);
  const [board, setBoard] = useState<Board>({ items: {}, layouts: {}, coverId: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<'none' | 'sticker' | 'layout' | 'cover'>('none');
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
  const dateText = useMemo(() => dateRange(photos), [photos]);
  const coverPhoto = photos.find((p) => p.id === board.coverId) ?? photos[0];

  // A4 フィット
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
      if (!alive || !data?.data) return;
      const m = migrate(data.data);
      setBoard({ items: m.items ?? {}, layouts: m.layouts ?? {}, coverId: m.coverId ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [supabase, tripId]);

  const commit = useCallback(
    (next: Board) => {
      setBoard(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void supabase.from('zine_boards').upsert({
          trip_id: tripId,
          data: next,
          updated_at: new Date().toISOString(),
        });
      }, 600);
    },
    [supabase, tripId],
  );

  const setPageItems = (pageId: string, fn: (list: Item[]) => Item[]) =>
    commit({ ...board, items: { ...board.items, [pageId]: fn(board.items[pageId] ?? []) } });

  const addEmoji = (emoji: string) => {
    const it: Item = {
      id: crypto.randomUUID(),
      kind: 'emoji',
      value: emoji,
      x: 50,
      y: 50,
      size: 48,
      rot: 0,
    };
    setPageItems(current.id, (l) => [...l, it]);
    setMenu('none');
    setSelected(it.id);
  };

  const addText = () => {
    const text = window.prompt('テキストを入力', '思い出メモ');
    if (!text) return;
    const it: Item = {
      id: crypto.randomUUID(),
      kind: 'text',
      value: text,
      x: 50,
      y: 50,
      size: 28,
      rot: 0,
    };
    setPageItems(current.id, (l) => [...l, it]);
    setMenu('none');
    setSelected(it.id);
  };

  const onPagePointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !pageRef.current) return;
    const r = pageRef.current.getBoundingClientRect();
    const { id, mode } = drag.current;
    if (mode === 'move') {
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      setPageItems(current.id, (l) =>
        l.map((s) =>
          s.id === id
            ? { ...s, x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) }
            : s,
        ),
      );
    } else {
      // transform: 中心からの距離→サイズ、角度→回転
      setPageItems(current.id, (l) =>
        l.map((s) => {
          if (s.id !== id) return s;
          const cx = r.left + (s.x / 100) * r.width;
          const cy = r.top + (s.y / 100) * r.height;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.hypot(dx, dy);
          const size = Math.max(16, Math.min(220, dist * 1.4));
          const rot = (Math.atan2(dy, dx) * 180) / Math.PI - 45;
          return { ...s, size, rot };
        }),
      );
    }
  };

  const pageItems = board.items[current.id] ?? [];

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

      {/* A4 ページ */}
      {size.w > 0 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: 送りは左右ボタンでも可能
        <div
          ref={pageRef}
          onPointerMove={onPagePointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onClick={() => setSelected(null)}
          style={{ width: size.w, height: size.h }}
          className="relative overflow-hidden rounded-md bg-white shadow-[var(--shadow-float)]"
        >
          <PageBody
            page={current}
            title={title}
            geo={geo}
            dateText={dateText}
            heroPhoto={coverPhoto}
            layout={board.layouts[current.id] ?? 'auto'}
          />

          {pageItems.map((it) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: ドラッグ/変形ハンドルで操作（削除は×）
            <div
              key={it.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                drag.current = { id: it.id, mode: 'move' };
                setSelected(it.id);
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (it.kind !== 'text') return;
                const t = window.prompt('テキストを編集', it.value);
                if (t != null)
                  setPageItems(current.id, (l) =>
                    l.map((s) => (s.id === it.id ? { ...s, value: t } : s)),
                  );
              }}
              style={{
                left: `${it.x}%`,
                top: `${it.y}%`,
                transform: `translate(-50%, -50%) rotate(${it.rot}deg)`,
              }}
              className={`absolute cursor-grab touch-none active:cursor-grabbing ${
                selected === it.id ? 'outline outline-2 outline-accent' : ''
              }`}
            >
              {it.kind === 'emoji' ? (
                <span
                  style={{ fontSize: it.size }}
                  className="block drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
                >
                  {it.value}
                </span>
              ) : (
                <span
                  style={{ fontSize: it.size }}
                  className="block whitespace-pre px-1 font-serif text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
                >
                  {it.value}
                </span>
              )}

              {selected === it.id && (
                <>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageItems(current.id, (l) => l.filter((x) => x.id !== it.id));
                      setSelected(null);
                    }}
                    className="-right-3 -top-3 absolute flex h-6 w-6 items-center justify-center rounded-full bg-white text-black text-sm shadow"
                    aria-label="削除"
                  >
                    ×
                  </button>
                  {/* 変形ハンドル（拡大・回転） */}
                  <button
                    type="button"
                    aria-label="拡大・回転"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = { id: it.id, mode: 'transform' };
                    }}
                    className="-right-3 -bottom-3 absolute h-6 w-6 cursor-nwse-resize rounded-full border-2 border-accent bg-white shadow"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 送り */}
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
      {menu === 'sticker' && (
        <div className="absolute inset-x-0 bottom-20 z-40 mx-auto flex max-w-md flex-wrap justify-center gap-2 rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur">
          {STICKERS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => addEmoji(e)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition hover:bg-secondary"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* レイアウト選択（Day ページ） */}
      {menu === 'layout' && current.kind === 'day' && (
        <div className="absolute inset-x-0 bottom-20 z-40 mx-auto flex max-w-md flex-wrap justify-center gap-2 rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                commit({ ...board, layouts: { ...board.layouts, [current.id]: l.key } });
                setMenu('none');
              }}
              className={`rounded-full px-4 py-2 text-sm transition ${
                (board.layouts[current.id] ?? 'auto') === l.key
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-secondary'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* 表紙写真の選択（cover ページ） */}
      {menu === 'cover' && current.kind === 'cover' && (
        <div className="absolute inset-x-0 bottom-20 z-40 mx-auto flex max-w-md gap-2 overflow-x-auto rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur">
          {photos.slice(0, 30).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                commit({ ...board, coverId: p.id });
                setMenu('none');
              }}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                coverPhoto?.id === p.id ? 'border-accent' : 'border-transparent'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb_url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* 下部ツール */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 p-4">
        <span className="rounded-full bg-black/45 px-3 py-1 text-white text-xs backdrop-blur">
          {idx + 1} / {pages.length}
        </span>
        <div className="flex items-center gap-2">
          {current.kind === 'day' && (
            <button
              type="button"
              onClick={() => setMenu((m) => (m === 'layout' ? 'none' : 'layout'))}
              className="flex h-11 items-center rounded-full bg-white px-4 font-medium text-black text-sm shadow-[var(--shadow-float)]"
            >
              ▦ レイアウト
            </button>
          )}
          {current.kind === 'cover' && photos.length > 0 && (
            <button
              type="button"
              onClick={() => setMenu((m) => (m === 'cover' ? 'none' : 'cover'))}
              className="flex h-11 items-center rounded-full bg-white px-4 font-medium text-black text-sm shadow-[var(--shadow-float)]"
            >
              🖼 表紙
            </button>
          )}
          <button
            type="button"
            onClick={addText}
            className="flex h-11 items-center rounded-full bg-white px-4 font-medium text-black text-sm shadow-[var(--shadow-float)]"
          >
            T テキスト
          </button>
          <button
            type="button"
            onClick={() => setMenu((m) => (m === 'sticker' ? 'none' : 'sticker'))}
            className="flex h-11 items-center rounded-full bg-white px-4 font-medium text-black text-sm shadow-[var(--shadow-float)]"
          >
            ✨ スタンプ
          </button>
        </div>
      </div>
    </div>
  );
}

function PageBody({
  page,
  title,
  geo,
  dateText,
  heroPhoto,
  layout,
}: {
  page: Page;
  title: string;
  geo: GeoPhoto[];
  dateText: string;
  heroPhoto?: PhotoWithUrl;
  layout: LayoutKey;
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
        {geo.length > 0 ? (
          <div className="pointer-events-none absolute inset-0">
            <MiniMap geo={geo} />
          </div>
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

  const { cols, rows, span0 } = gridOf(page.items.length, layout);
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
            className={`relative overflow-hidden rounded-sm bg-secondary ${span0 && i === 0 ? 'col-span-2' : ''}`}
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
