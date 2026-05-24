'use client';

import type { PhotoWithUrl } from '@/types/photo';

function caption(p: PhotoWithUrl): string {
  if (!p.taken_at) return '撮影日時不明';
  return new Date(p.taken_at).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** その日の見出し（YYYY年M月D日） */
function dayKey(p: PhotoWithUrl): string {
  if (!p.taken_at) return '日付なし';
  return new Date(p.taken_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

/**
 * 読み物としての縦スクロール zine プレビュー（フェーズ1）。
 * 撮影日でまとめ、写真を時系列に大きく並べる。
 */
export default function ZinePreview({
  title,
  description,
  photos,
}: {
  title: string;
  description: string | null;
  photos: PhotoWithUrl[];
}) {
  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-2xl text-accent/40">✦</span>
        <p className="text-sm">写真を追加すると zine が組まれます</p>
      </div>
    );
  }

  // 撮影日でグルーピング（順序は渡された taken_at 昇順を維持）
  const groups: { day: string; items: PhotoWithUrl[] }[] = [];
  for (const p of photos) {
    const key = dayKey(p);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(p);
    else groups.push({ day: key, items: [p] });
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-12">
        <header className="space-y-3 border-b border-border pb-6 text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-accent">
            A Travel Zine
          </span>
          <h2 className="font-serif text-4xl leading-tight sm:text-5xl">{title}</h2>
          {description && <p className="leading-relaxed text-muted-foreground">{description}</p>}
          <p className="text-xs text-muted-foreground">{photos.length} 枚の記録</p>
        </header>

        {groups.map((g) => (
          <section key={g.day} className="space-y-6">
            <h3 className="sticky top-0 z-10 -mx-2 bg-background/80 px-2 py-1 font-serif text-lg text-accent backdrop-blur">
              {g.day}
            </h3>
            {g.items.map((p, i) => (
              <figure
                key={p.id}
                className="reveal overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
                style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb_url}
                  alt={caption(p)}
                  loading="lazy"
                  decoding="async"
                  className="block max-h-[70vh] w-full object-cover"
                />
                <figcaption className="flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {caption(p)}
                  {p.lat != null && p.lng != null && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground/70">
                      {p.lat.toFixed(3)}, {p.lng.toFixed(3)}
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
