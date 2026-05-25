'use client';

import type { PhotoWithUrl } from '@/types/photo';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

type GeoPhoto = PhotoWithUrl & { lat: number; lng: number };

/**
 * zine の「旅の地図」ページ用の静止地図。
 * MapTiler の Static Maps API は無料プランで使えない（403）ため、
 * 動くタイルで非対話の MapLibre 地図を描いて背景にする。
 */
export default function MiniMap({ geo }: { geo: GeoPhoto[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
      interactive: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('load', () => {
      if (geo.length === 0) return;
      const coords = geo.map((p) => [p.lng, p.lat]);

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0a4a4e', 'line-width': 3, 'line-opacity': 0.5 },
      });
      map.addSource('pts', {
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
        id: 'pts',
        type: 'circle',
        source: 'pts',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0a4a4e',
          'circle-stroke-width': 2,
        },
      });

      const b = new maplibregl.LngLatBounds();
      for (const c of coords) b.extend(c as [number, number]);
      map.fitBounds(b, { padding: 48, maxZoom: 13, duration: 0 });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geo]);

  return <div ref={ref} className="h-full w-full" />;
}
