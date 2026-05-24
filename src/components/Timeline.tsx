'use client';

import type { PhotoWithUrl } from '@/types/photo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const PLAY_DURATION_MS = 9000; // 端から端まで再生する時間

function fmt(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 撮影時刻で旅を「再生」するシークバー。
 * value（ミリ秒）= その時刻までに撮った写真を地図に出す累積カットオフ。
 */
export default function Timeline({
  photos,
  value,
  onChange,
}: {
  photos: PhotoWithUrl[];
  value: number | null;
  onChange: (cutoff: number | null) => void;
}) {
  const times = useMemo(
    () =>
      photos
        .map((p) => (p.taken_at ? Date.parse(p.taken_at) : Number.NaN))
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b),
    [photos],
  );
  const min = times[0] ?? 0;
  const max = times[times.length - 1] ?? 0;
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  const current = value ?? max;

  const stop = useCallback(() => {
    setPlaying(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const play = useCallback(() => {
    if (max <= min) return;
    // 端まで再生済みなら頭から
    const startFrom = current >= max ? min : current;
    const startWall = performance.now();
    const span = max - min;
    const offset = startFrom - min;
    setPlaying(true);
    const tick = (now: number) => {
      const elapsed = now - startWall + (offset / span) * PLAY_DURATION_MS;
      const ratio = Math.min(1, elapsed / PLAY_DURATION_MS);
      onChange(min + ratio * span);
      if (ratio >= 1) {
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [min, max, current, onChange, stop]);

  useEffect(() => () => stop(), [stop]);

  if (times.length < 2) return null; // 振り返るほどの時系列が無い

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-card/85 px-4 py-3 shadow-[var(--shadow-float)] backdrop-blur">
      <button
        type="button"
        onClick={() => (playing ? stop() : play())}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:scale-105"
        aria-label={playing ? '一時停止' : '旅を再生'}
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="h-3.5 w-[3px] rounded-full bg-current" />
            <span className="h-3.5 w-[3px] rounded-full bg-current" />
          </span>
        ) : (
          <span className="ml-0.5 border-y-[6px] border-l-[10px] border-y-transparent border-l-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span className="font-medium text-accent">{fmt(current)}</span>
          <span>{fmt(max)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={Math.max(1, Math.round((max - min) / 1000))}
          value={current}
          onChange={(e) => {
            stop();
            onChange(Number(e.target.value));
          }}
          className="timeline-range w-full"
          aria-label="撮影時刻でスクラブ"
        />
      </div>
    </div>
  );
}
