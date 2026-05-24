'use client';

import PhotoMap from '@/components/Map';
import Timeline from '@/components/Timeline';
import TimelineView from '@/components/TimelineView';
import ZinePreview from '@/components/ZinePreview';
import type { PhotoWithUrl } from '@/types/photo';
import Link from 'next/link';
import { useState } from 'react';

type View = 'map' | 'timeline' | 'zine';

const VIEW_LABELS: Record<View, string> = {
  map: 'マップ',
  timeline: 'タイムライン',
  zine: 'zine',
};

/**
 * 旅程詳細の全画面体験（クライアント）。
 * ヘッダーで マップ / タイムライン / zine を切り替え、
 * マップ側は撮影時刻のシークバーで「旅を再生」する。
 */
export default function TripExperience({
  title,
  description,
  photos,
  total,
  withGps,
  tripId,
  isOwner = false,
}: {
  title: string;
  description: string | null;
  photos: PhotoWithUrl[];
  total: number;
  withGps: number;
  tripId: string;
  isOwner?: boolean;
}) {
  const [view, setView] = useState<View>('map');
  const [cutoff, setCutoff] = useState<number | null>(null);

  return (
    <div className="relative h-full w-full bg-secondary/40">
      {/* ビュー本体（全画面） */}
      {photos.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-2xl text-accent/40">✦</span>
          <p className="text-sm">写真を追加するとここに表示されます</p>
        </div>
      ) : view === 'map' ? (
        <>
          {/* 写真集合が変わったら作り直す（アップロード後の router.refresh） */}
          <PhotoMap key={photos.map((p) => p.id).join(',')} photos={photos} cutoff={cutoff} />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 sm:inset-x-6 sm:bottom-6">
            <div className="mx-auto max-w-2xl">
              <Timeline photos={photos} value={cutoff} onChange={setCutoff} />
            </div>
          </div>
        </>
      ) : view === 'timeline' ? (
        <TimelineView tripId={tripId} photos={photos} isOwner={isOwner} />
      ) : (
        <ZinePreview title={title} description={description} photos={photos} />
      )}

      {/* フローティング・トップバー */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="pointer-events-auto max-w-[60%] rounded-2xl border border-border bg-card/85 px-4 py-3 shadow-[var(--shadow-card)] backdrop-blur">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-accent"
          >
            <span aria-hidden>←</span> 旅程一覧
          </Link>
          <h1 className="truncate font-serif text-xl leading-tight sm:text-2xl">{title}</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            全 {total} 枚 ・ 地図 {withGps} 枚
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {isOwner && (
            <a
              href="#uploader"
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-[var(--shadow-card)] backdrop-blur transition hover:shadow-[var(--shadow-float)]"
            >
              ＋ 追加
            </a>
          )}
          <div className="flex rounded-full border border-border bg-card/85 p-0.5 text-sm shadow-[var(--shadow-card)] backdrop-blur">
            {(['map', 'timeline', 'zine'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-full px-3.5 py-1.5 transition ${
                  view === v
                    ? 'bg-accent text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
