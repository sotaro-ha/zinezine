import type { PhotoWithUrl } from '@/types/photo';

/** HTML エスケープ（ポップアップへ文字列を差し込むため） */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * MapLibre のポップアップに差し込む HTML を生成する。
 * MapLibre は DOM/HTML 文字列でポップアップを描くため、React コンポーネントとして
 * レンダリングするのではなく、安全にエスケープした HTML 文字列を返す。
 */
export function buildPopupHTML(photo: PhotoWithUrl): string {
  const when = photo.taken_at
    ? new Date(photo.taken_at).toLocaleString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '撮影日時不明';

  const src = photo.thumb_url || photo.url;
  const media = src
    ? `<img src="${esc(src)}" alt="${esc(when)}" style="display:block;width:100%;height:150px;object-fit:cover;" loading="lazy" />`
    : `<div style="height:150px;display:flex;align-items:center;justify-content:center;background:#eef2f2;color:#0a4a4e;">✦</div>`;

  return `
    <figure style="margin:0;width:220px;background:#fff;">
      ${media}
      <figcaption style="padding:9px 13px;font-size:12px;letter-spacing:0.02em;color:#0a4a4e;display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:5px;height:5px;border-radius:9999px;background:#0a4a4e;"></span>
        ${esc(when)}
      </figcaption>
    </figure>
  `;
}
