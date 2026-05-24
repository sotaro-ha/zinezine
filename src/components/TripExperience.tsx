'use client';

import PhotoMap from '@/components/Map';
import Timeline from '@/components/Timeline';
import ZinePreview from '@/components/ZinePreview';
import type { PhotoWithUrl } from '@/types/photo';
import { useState } from 'react';

type View = 'map' | 'zine';

/**
 * 旅程詳細の体験部分（クライアント）。
 * ヘッダーで マップ / zine を切り替え、マップ側は撮影時刻のシークバーで「旅を再生」する。
 */
export default function TripExperience({
  title,
  description,
  photos,
}: {
  title: string;
  description: string | null;
  photos: PhotoWithUrl[];
}) {
  const [view, setView] = useState<View>('map');
  const [cutoff, setCutoff] = useState<number | null>(null);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border"
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      {/* ツールバー: ビュー切り替え */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur">
        <span className="text-xs text-muted-foreground">
          {view === 'map' ? '撮った場所をたどる' : '読み物として振り返る'}
        </span>
        <div className="flex rounded-full border border-border bg-background/60 p-0.5 text-sm">
          {(['map', 'zine'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 transition ${
                view === v
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v === 'map' ? 'マップ' : 'zine'}
            </button>
          ))}
        </div>
      </div>

      {/* ビュー本体 */}
      <div className="relative h-[58vh] bg-secondary/40">
        {photos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="text-2xl text-accent/40">✦</span>
            <p className="text-sm">写真を追加するとここに表示されます</p>
          </div>
        ) : view === 'map' ? (
          <>
            {/* 写真集合が変わったら作り直す（アップロード後の router.refresh） */}
            <PhotoMap key={photos.map((p) => p.id).join(',')} photos={photos} cutoff={cutoff} />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
              <Timeline photos={photos} value={cutoff} onChange={setCutoff} />
            </div>
          </>
        ) : (
          <ZinePreview title={title} description={description} photos={photos} />
        )}
      </div>
    </div>
  );
}
