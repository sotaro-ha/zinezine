'use client';

import { buildPopupHTML } from '@/components/PhotoPreview';
import type { PhotoWithUrl } from '@/types/photo';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TOKYO: [number, number] = [139.767, 35.681]; // 写真ゼロ時の初期中心

type GeoPhoto = PhotoWithUrl & { lat: number; lng: number };

/** taken_at をミリ秒に。無い写真は null。 */
function takenMs(p: PhotoWithUrl): number | null {
  return p.taken_at ? Date.parse(p.taken_at) : null;
}

/**
 * cutoff（ミリ秒）が指定されたとき、その時刻までに撮った写真だけ見せる（旅の再生）。
 * 撮影時刻が無い写真は常に表示する。
 */
function isVisible(p: PhotoWithUrl, cutoff: number | null): boolean {
  if (cutoff == null) return true;
  const t = takenMs(p);
  return t == null || t <= cutoff;
}

/** 写真サムネのマーカー DOM を作る。 */
function makeMarkerEl(photo: GeoPhoto): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'photo-marker';
  el.setAttribute('aria-label', '写真を表示');
  const img = document.createElement('img');
  img.src = photo.url;
  img.alt = '';
  img.loading = 'lazy';
  el.appendChild(img);
  return el;
}

export default function PhotoMap({
  photos,
  cutoff = null,
}: {
  photos: PhotoWithUrl[];
  /** この時刻（ミリ秒）までに撮った写真だけ表示。null は全部表示。 */
  cutoff?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<
    { photo: GeoPhoto; marker: maplibregl.Marker; el: HTMLButtonElement }[]
  >([]);
  const loadedRef = useRef(false);

  // 初期化（photos が変わったら作り直す。親が key で再マウントもする）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      center: TOKYO,
      zoom: 4,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      loadedRef.current = true;
      const geo = photos.filter((p): p is GeoPhoto => p.lat != null && p.lng != null);
      if (geo.length === 0) return;

      // 旅程ライン（撮影日時順。photos は taken_at 昇順で渡される）
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0a4a4e', 'line-width': 3, 'line-opacity': 0.4 },
      });

      // 写真サムネのマーカー
      for (const photo of geo) {
        const el = makeMarkerEl(photo);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 18 })
            .setLngLat([photo.lng, photo.lat])
            .setHTML(buildPopupHTML(photo))
            .addTo(map);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([photo.lng, photo.lat])
          .addTo(map);
        markersRef.current.push({ photo, marker, el });
      }

      // 全ピンが収まるように
      const bounds = new maplibregl.LngLatBounds();
      for (const p of geo) {
        bounds.extend([p.lng, p.lat]);
      }
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });

      applyCutoff(cutoff);
    });

    return () => {
      loadedRef.current = false;
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // photos の同一集合内での再描画は別 effect（cutoff）で扱う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // cutoff に応じてマーカー表示とラインを更新
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loadedRef.current) applyCutoff(cutoff);
  }, [cutoff]);

  function applyCutoff(cut: number | null) {
    const map = mapRef.current;
    if (!map) return;

    for (const { photo, el } of markersRef.current) {
      const visible = isVisible(photo, cut);
      // 既に表示中なら drop アニメを再発火させない
      if (visible && el.dataset.shown !== '1') {
        el.dataset.shown = '1';
        el.classList.remove('is-hidden');
        el.classList.add('is-dropping');
        el.addEventListener('animationend', () => el.classList.remove('is-dropping'), {
          once: true,
        });
      } else if (!visible && el.dataset.shown !== '0') {
        el.dataset.shown = '0';
        el.classList.add('is-hidden');
      }
    }

    // ライン: 表示中かつ撮影時刻あり（＝順序が確定）のみ
    const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      const coords = markersRef.current
        .filter(({ photo }) => takenMs(photo) != null && isVisible(photo, cut))
        .map(({ photo }) => [photo.lng, photo.lat]);
      src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    }
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
