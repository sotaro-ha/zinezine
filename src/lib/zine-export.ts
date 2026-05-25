// zine をキャンバスにラスタライズして書き出すための純粋ヘルパー（クライアント専用）。
// 地図ページは MapTiler の静的 API が使えない（403）ため、オフスクリーンの MapLibre を
// preserveDrawingBuffer で描いて取り込む。

const A4 = 210 / 297;
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export type ExportItem = {
  kind: 'emoji' | 'text';
  value: string;
  x: number; // 0..100 (%)
  y: number;
  size: number; // 書き出しキャンバス上の px（呼び出し側でスケール済み）
  rot: number; // deg
};

export type ExportPage =
  | { kind: 'cover'; title: string; dateText: string; heroUrl?: string; items: ExportItem[] }
  | { kind: 'map'; geo: { lng: number; lat: number }[]; items: ExportItem[] }
  | {
      kind: 'day';
      label: string;
      date: string;
      photoUrls: string[];
      total: number;
      cols: number;
      rows: number;
      items: ExportItem[];
    };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  if (ir > dr) {
    sh = img.height;
    sw = sh * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** オフスクリーンの MapLibre を描いて PNG dataURL を返す */
async function captureMap(
  geo: { lng: number; lat: number }[],
  w: number,
  h: number,
): Promise<HTMLImageElement | null> {
  if (!MAPTILER_KEY || geo.length === 0) return null;
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(div);
  try {
    const maplibregl = (await import('maplibre-gl')).default;
    const map = new maplibregl.Map({
      container: div,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const url = await new Promise<string | null>((resolve) => {
      const done = (v: string | null) => resolve(v);
      const timer = window.setTimeout(() => done(null), 6000);
      map.on('load', () => {
        const coords = geo.map((p) => [p.lng, p.lat]);
        map.addSource('r', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
          },
        });
        map.addLayer({
          id: 'r',
          type: 'line',
          source: 'r',
          paint: { 'line-color': '#0a4a4e', 'line-width': 3, 'line-opacity': 0.5 },
        });
        map.addSource('p', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: geo.map((p) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
              properties: {},
            })),
          },
        });
        map.addLayer({
          id: 'p',
          type: 'circle',
          source: 'p',
          paint: {
            'circle-radius': 5,
            'circle-color': '#fff',
            'circle-stroke-color': '#0a4a4e',
            'circle-stroke-width': 2,
          },
        });
        const b = new maplibregl.LngLatBounds();
        for (const c of coords) b.extend(c as [number, number]);
        map.fitBounds(b, { padding: 40, maxZoom: 13, duration: 0 });
        map.once('idle', () => {
          window.clearTimeout(timer);
          try {
            done(map.getCanvas().toDataURL('image/png'));
          } catch {
            done(null);
          }
        });
      });
    });
    map.remove();
    if (!url) return null;
    return await loadImage(url);
  } finally {
    div.remove();
  }
}

function drawItems(ctx: CanvasRenderingContext2D, items: ExportItem[], W: number, H: number) {
  for (const it of items) {
    ctx.save();
    ctx.translate((it.x / 100) * W, (it.y / 100) * H);
    ctx.rotate((it.rot * Math.PI) / 180);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (it.kind === 'emoji') {
      ctx.font = `${it.size}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      ctx.fillText(it.value, 0, 0);
    } else {
      ctx.font = `600 ${it.size}px Georgia, serif`;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillText(it.value, 0, 0);
    }
    ctx.restore();
  }
}

function labelChip(ctx: CanvasRenderingContext2D, x: number, y: number, main: string, sub: string) {
  ctx.font = '600 30px Georgia, serif';
  const subFont = '500 18px sans-serif';
  ctx.font = subFont;
  const subW = ctx.measureText(sub).width;
  ctx.font = '600 30px Georgia, serif';
  const mainW = ctx.measureText(main).width;
  const padX = 18;
  const w = padX * 2 + mainW + 14 + subW;
  const h = 48;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = '600 30px Georgia, serif';
  ctx.fillText(main, x + padX, y + h / 2 + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = subFont;
  ctx.fillText(sub, x + padX + mainW + 14, y + h / 2 + 1);
}

async function drawPage(ctx: CanvasRenderingContext2D, page: ExportPage, W: number, H: number) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  if (page.kind === 'cover') {
    ctx.fillStyle = '#0a4a4e';
    ctx.fillRect(0, 0, W, H);
    if (page.heroUrl) {
      const img = await loadImage(page.heroUrl);
      if (img) drawCover(ctx, img, 0, 0, W, H);
    }
    const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '500 22px sans-serif';
    ctx.fillText('TRAVEL ZINE', W * 0.08, H * 0.82);
    ctx.font = '600 72px Georgia, serif';
    ctx.fillText(page.title, W * 0.08, H * 0.88);
    if (page.dateText) {
      ctx.font = '400 26px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(page.dateText, W * 0.08, H * 0.92);
    }
  } else if (page.kind === 'map') {
    ctx.fillStyle = '#eef2f2';
    ctx.fillRect(0, 0, W, H);
    const img = await captureMap(page.geo, W, H);
    if (img) drawCover(ctx, img, 0, 0, W, H);
    // 帰属表示
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '400 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('© MapTiler © OpenStreetMap', W - 12, H - 10);
    labelChip(ctx, W / 2 - 70, 28, '旅の地図', '');
  } else {
    const pad = W * 0.022;
    const gap = W * 0.012;
    const cols = page.cols;
    const rows = page.rows;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const ch = (H - pad * 2 - gap * (rows - 1)) / rows;
    const shown = page.photoUrls.slice(0, cols * rows);
    const extra = page.total - shown.length;
    const imgs = await Promise.all(shown.map((u) => loadImage(u)));
    imgs.forEach((img, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = pad + c * (cw + gap);
      const y = pad + r * (ch + gap);
      ctx.save();
      roundRectPath(ctx, x, y, cw, ch, 8);
      ctx.clip();
      ctx.fillStyle = '#e7ecec';
      ctx.fillRect(x, y, cw, ch);
      if (img) drawCover(ctx, img, x, y, cw, ch);
      if (i === shown.length - 1 && extra > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y, cw, ch);
        ctx.fillStyle = '#fff';
        ctx.font = '600 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${extra}`, x + cw / 2, y + ch / 2);
      }
      ctx.restore();
    });
    labelChip(ctx, pad, pad, page.label, page.date);
  }

  drawItems(ctx, page.items, W, H);
}

/** 各ページのキャンバスを生成（A4: W×H px） */
export async function renderPageCanvases(
  pages: ExportPage[],
  W = 1240,
): Promise<HTMLCanvasElement[]> {
  const H = Math.round(W / A4);
  const out: HTMLCanvasElement[] = [];
  for (const page of pages) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await drawPage(ctx, page, W, H);
    out.push(canvas);
  }
  return out;
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

/** 全ページを縦に連結した 1 枚の PNG として保存 */
export async function exportZinePng(pages: ExportPage[], fileBase: string): Promise<void> {
  const W = 1240;
  const canvases = await renderPageCanvases(pages, W);
  if (canvases.length === 0) return;
  const H = canvases[0].height;
  const gap = 24;
  const combined = document.createElement('canvas');
  combined.width = W;
  combined.height = canvases.length * H + (canvases.length - 1) * gap;
  const ctx = combined.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#171717';
  ctx.fillRect(0, 0, combined.width, combined.height);
  canvases.forEach((c, i) => ctx.drawImage(c, 0, i * (H + gap)));
  const blob = await new Promise<Blob | null>((res) => combined.toBlob(res, 'image/png'));
  if (!blob) throw new Error('toBlob failed');
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${fileBase}.png`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 各ページを A4 の PDF（1 ページ＝1 ページ）として保存 */
export async function exportZinePdf(pages: ExportPage[], fileBase: string): Promise<void> {
  const W = 1240;
  const canvases = await renderPageCanvases(pages, W);
  if (canvases.length === 0) return;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  canvases.forEach((c, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, ph);
  });
  pdf.save(`${fileBase}.pdf`);
}
