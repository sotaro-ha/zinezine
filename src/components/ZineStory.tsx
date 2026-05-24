'use client';

import { getBrowserSupabase } from '@/lib/supabase';
import type { PhotoWithUrl } from '@/types/photo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const STICKERS = ['✨', '❤️', '😊', '📍', '🌿', '☀️', '🎒', '📸', '⭐️', '🗺️', '🌊', '🍜'];

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

/** 旅程の代表点で MapTiler の静的地図（＝マップのスクリーンショット）を作る */
function staticMapUrl(geo: GeoPhoto[]): string | null {
  if (!MAPTILER_KEY || geo.length === 0) return null;
  const step = Math.max(1, Math.ceil(geo.length / 40));
  const pts = geo.filter((_, i) => i % step === 0);
  const coords = pts.map((p) => `${p.lng},${p.lat}`).join('|');
  const base = `https://api.maptiler.com/maps/streets-v2/static/auto/600x900@2x.png?key=${MAPTILER_KEY}&padding=90`;
  return pts.length < 2
    ? `${base}&markers=${coords}`
    : `${base}&path=stroke:0x0a4a4eff|width:5|${coords}`;
}

/**
 * zine（ストーリー型の提案）。表紙 → 旅の地図 → Day 別ページを自動生成し、
 * Instagram ストーリーのように送りながらスタンプを貼れる（保存される）。
 * ※リアルタイム共同編集は次段。今はスタンプの保存・共有まで。
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
  const stageRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const dragId = useRef<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [stickers, setStickers] = useState<StickerMap>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);

  const geo = useMemo(
    () => photos.filter((p): p is GeoPhoto => p.lat != null && p.lng != null),
    [photos],
  );

  // ページ自動生成: 表紙 → 地図 → Day別
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

  // 既存のスタンプを読み込む
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
    const s: Sticker = { id: crypto.randomUUID(), emoji, x: 50, y: 50, size: 56 };
    updatePageStickers(current.id, (list) => [...list, s]);
    setPalette(false);
    setSelected(s.id);
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    if (!dragId.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    updatePageStickers(current.id, (list) =>
      list.map((s) =>
        s.id === dragId.current
          ? { ...s, x: Math.max(2, Math.min(98, x)), y: Math.max(3, Math.min(97, y)) }
          : s,
      ),
    );
  };

  const pageStickers = stickers[current.id] ?? [];

  return (
    <div className="relative h-full w-full select-none bg-black">
      {/* 進捗バー（ストーリー風） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex gap-1 p-2">
        {pages.map((p, i) => (
          <span
            key={p.id}
            className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>

      {/* ステージ（写真 + スタンプ） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: ストーリーの送りは左右ボタンでも可能 */}
      <div
        ref={stageRef}
        onPointerMove={onStagePointerMove}
        onPointerUp={() => {
          dragId.current = null;
        }}
        onClick={() => setSelected(null)}
        className="relative h-full w-full overflow-hidden"
      >
        <PageBody page={current} title={title} mapUrl={mapUrl} dateText={dateRange(photos)} />

        {/* スタンプ */}
        {pageStickers.map((s) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: ドラッグ可能なスタンプ（削除は×ボタン）
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
              selected === s.id ? 'rounded-2xl outline outline-2 outline-white/80' : ''
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

        {/* 送り（左右タップゾーン） */}
        <button
          type="button"
          aria-label="前のページ"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          className="absolute inset-y-0 left-0 z-20 w-1/5"
        />
        <button
          type="button"
          aria-label="次のページ"
          onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
          className="absolute inset-y-0 right-0 z-20 w-1/5"
        />
      </div>

      {/* スタンプ・パレット */}
      {palette && (
        <div className="absolute inset-x-0 bottom-20 z-30 mx-auto flex max-w-md flex-wrap justify-center gap-2 rounded-2xl bg-card/95 p-3 shadow-[var(--shadow-float)] backdrop-blur">
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
        <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
          {idx + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={() => setPalette((v) => !v)}
          className="flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-medium text-black shadow-[var(--shadow-float)]"
        >
          ✨ スタンプ
        </button>
      </div>
    </div>
  );
}

/** ページ本体（種類ごとの見た目） */
function PageBody({
  page,
  title,
  mapUrl,
  dateText,
}: {
  page: Page;
  title: string;
  mapUrl: string | null;
  dateText: string;
}) {
  if (page.kind === 'cover') {
    return (
      <div className="relative h-full w-full">
        {/* 背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent to-[#06363a]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center text-white">
          <span className="text-[11px] uppercase tracking-[0.3em] text-white/70">Travel Zine</span>
          <h2 className="font-serif text-5xl leading-tight">{title}</h2>
          {dateText && <p className="text-white/80">{dateText}</p>}
          <span className="mt-4 text-2xl">✦</span>
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
          <div className="flex h-full items-center justify-center text-muted-foreground">
            位置情報のある写真がありません
          </div>
        )}
        <div className="absolute inset-x-0 top-8 text-center">
          <span className="rounded-full bg-black/45 px-4 py-1.5 font-serif text-lg text-white backdrop-blur">
            旅の地図
          </span>
        </div>
      </div>
    );
  }

  // day
  const hero = page.items[0];
  return (
    <div className="relative h-full w-full bg-black">
      {hero?.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.thumb_url} alt={page.label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-white/40">✦</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
      <div className="absolute left-6 top-12 text-white">
        <div className="font-serif text-4xl">{page.label}</div>
        <div className="text-sm text-white/80">{page.date}</div>
      </div>
      {/* その日の写真ストリップ */}
      {page.items.length > 1 && (
        <div className="absolute inset-x-0 bottom-16 flex gap-2 overflow-x-auto px-6 pb-1">
          {page.items.slice(1, 10).map((p) => (
            <img
              key={p.id}
              // eslint-disable-next-line @next/next/no-img-element
              src={p.thumb_url}
              alt=""
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-lg border-2 border-white/80 object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
