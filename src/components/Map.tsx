'use client';

import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildPopupHTML } from '@/components/PhotoPreview';
import type { PhotoWithUrl } from '@/types/photo';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TOKYO: [number, number] = [139.767, 35.681]; // 写真ゼロ時の初期中心

export default function PhotoMap({ photos }: { photos: PhotoWithUrl[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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
      const geo = photos.filter((p) => p.lat != null && p.lng != null);
      if (geo.length === 0) return;

      // 旅程ライン（撮影日時順。photos は既に taken_at 昇順で渡される）
      const lineCoords = geo.map((p) => [p.lng as number, p.lat as number]);
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: lineCoords },
          properties: {},
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0a4a4e',
          'line-width': 3,
          'line-opacity': 0.45,
        },
      });

      // ピン（個別 Marker より GeoJSON layer が高速）
      map.addSource('photos', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: geo.map((p) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng as number, p.lat as number] },
            properties: { id: p.id },
          })),
        },
      });
      // 白丸 + アクセント色のリング
      map.addLayer({
        id: 'photo-pins',
        type: 'circle',
        source: 'photos',
        paint: {
          'circle-radius': 7,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0a4a4e',
          'circle-stroke-width': 3,
        },
      });

      const byId = new globalThis.Map<string, PhotoWithUrl>(geo.map((p) => [p.id, p]));

      map.on('click', 'photo-pins', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const photo = byId.get(f.properties?.id as string);
        if (!photo) return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
          .setLngLat([lng, lat])
          .setHTML(buildPopupHTML(photo))
          .addTo(map);
      });
      map.on('mouseenter', 'photo-pins', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'photo-pins', () => {
        map.getCanvas().style.cursor = '';
      });

      // 全ピンが収まるように fitBounds
      const bounds = new maplibregl.LngLatBounds();
      for (const c of lineCoords) {
        bounds.extend(c as [number, number]);
      }
      map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [photos]);

  return <div ref={containerRef} className="h-full w-full" />;
}
