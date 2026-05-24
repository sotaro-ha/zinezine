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

  return `
    <figure style="margin:0;width:220px;">
      <img src="${esc(photo.url)}" alt="${esc(when)}"
           style="display:block;width:100%;height:150px;object-fit:cover;" loading="lazy" />
      <figcaption style="padding:8px 12px;font-size:12px;color:#444;">
        ${esc(when)}
      </figcaption>
    </figure>
  `;
}
