'use client';

import { buildPopupHTML } from '@/components/PhotoPreview';
import type { PhotoWithUrl } from '@/types/photo';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const TOKYO: [number, number] = [139.767, 35.681]; // 写真ゼロ時の初期中心

type GeoPhoto = PhotoWithUrl & { lat: number; lng: number };

function takenMs(p: PhotoWithUrl): number | null {
  return p.taken_at ? Date.parse(p.taken_at) : null;
}

/** cutoff（ミリ秒）までに撮った写真だけ表示。撮影時刻が無い写真は常に表示。 */
function isVisible(p: PhotoWithUrl, cutoff: number | null): boolean {
  if (cutoff == null) return true;
  const t = takenMs(p);
  return t == null || t <= cutoff;
}

/**
 * 写真の地図。多数の写真でも軽いよう GeoJSON + クラスタリングで描画する
 * （DOM マーカーは使わない）。ピンをクリックするとサムネのポップアップが出る。
 */
export default function PhotoMap({
  photos,
  cutoff = null,
}: {
  photos: PhotoWithUrl[];
  cutoff?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const byId = useRef(new globalThis.Map<string, GeoPhoto>());

  // 初期化（photos が変わったら親が key で再マウントする）
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const geo = photos.filter((p): p is GeoPhoto => p.lat != null && p.lng != null);
    byId.current = new globalThis.Map(geo.map((p) => [p.id, p]));

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
      if (geo.length === 0) return;

      // 旅程ライン
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

      // 写真ポイント（クラスタリング有効）
      map.addSource('photos', {
        type: 'geojson',
        cluster: true,
        clusterRadius: 48,
        clusterMaxZoom: 15,
        data: { type: 'FeatureCollection', features: [] },
      });

      // クラスタ（束ねた円。枚数で大きさを変える）
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'photos',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0a4a4e',
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'photos',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      });

      // 個別ピン（白丸 + teal リング）
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'photos',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': 7,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#0a4a4e',
        },
      });

      // クラスタをクリック → 展開ズーム
      map.on('click', 'clusters', async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = map.getSource('photos') as maplibregl.GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });

      // 個別ピンをクリック → ポップアップ
      map.on('click', 'unclustered', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const photo = byId.current.get(f.properties?.id as string);
        if (!photo) return;
        new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 14 })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(buildPopupHTML(photo))
          .addTo(map);
      });

      for (const layer of ['clusters', 'unclustered']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
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
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // cutoff に応じてポイントとラインを更新
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loadedRef.current) applyCutoff(cutoff);
  }, [cutoff]);

  function applyCutoff(cut: number | null) {
    const map = mapRef.current;
    if (!map) return;
    const geo = [...byId.current.values()];

    const photoSrc = map.getSource('photos') as maplibregl.GeoJSONSource | undefined;
    if (photoSrc) {
      photoSrc.setData({
        type: 'FeatureCollection',
        features: geo
          .filter((p) => isVisible(p, cut))
          .map((p) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: { id: p.id },
          })),
      });
    }

    const routeSrc = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
    if (routeSrc) {
      const coords = geo
        .filter((p) => takenMs(p) != null && isVisible(p, cut))
        .map((p) => [p.lng, p.lat]);
      routeSrc.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    }
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
