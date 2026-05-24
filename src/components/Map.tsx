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
 * 写真の地図。多数でも軽いよう GeoJSON + クラスタリングで管理しつつ、
 * クラスタ／単体ピンは「代表写真のサムネ」を HTML マーカーで描く（数字ではなく写真）。
 * 画面内に出るマーカーだけ生成するので、写真が増えても軽い。
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
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const onScreen = useRef<Record<string, maplibregl.Marker>>({});
  const clusterRep = useRef(new globalThis.Map<number, string>());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const geo = photos.filter((p): p is GeoPhoto => p.lat != null && p.lng != null);
    byId.current = new globalThis.Map(geo.map((p) => [p.id, p]));
    markers.current = {};
    onScreen.current = {};
    clusterRep.current = new globalThis.Map();

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

      map.addSource('photos', {
        type: 'geojson',
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 16,
        data: { type: 'FeatureCollection', features: [] },
      });
      // ソースをタイル化させるための不可視レイヤー（描画は HTML マーカーで行う）
      map.addLayer({
        id: 'photos-src',
        type: 'circle',
        source: 'photos',
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      });

      const bounds = new maplibregl.LngLatBounds();
      for (const p of geo) bounds.extend([p.lng, p.lat]);
      map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });

      map.on('render', updateMarkers);
      applyCutoff(cutoff);
    });

    return () => {
      loadedRef.current = false;
      for (const m of Object.values(markers.current)) m.remove();
      markers.current = {};
      onScreen.current = {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (loadedRef.current) applyCutoff(cutoff);
  }, [cutoff]);

  /** サムネ画像（無ければ ✦ プレースホルダ）を持つ円形 DOM を作る */
  function fillThumb(el: HTMLElement, url: string | undefined) {
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      el.appendChild(img);
    } else {
      el.textContent = '✦';
    }
  }

  function makePointEl(photo: GeoPhoto): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'photo-pin';
    el.setAttribute('aria-label', '写真を表示');
    fillThumb(el, photo.thumb_url || photo.url);
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const map = mapRef.current;
      if (!map) return;
      new maplibregl.Popup({ closeButton: true, maxWidth: '240px', offset: 16 })
        .setLngLat([photo.lng, photo.lat])
        .setHTML(buildPopupHTML(photo))
        .addTo(map);
    });
    return el;
  }

  function makeClusterEl(clusterId: number, count: number): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'photo-cluster';
    el.setAttribute('aria-label', `${count} 枚の写真`);

    const thumb = document.createElement('span');
    thumb.className = 'photo-cluster-thumb';
    el.appendChild(thumb);

    const badge = document.createElement('span');
    badge.className = 'photo-cluster-badge';
    badge.textContent = String(count);
    el.appendChild(badge);

    // 代表写真（クラスタの先頭の葉）を遅延取得してはめ込む
    const cached = clusterRep.current.get(clusterId);
    if (cached !== undefined) {
      fillThumb(thumb, cached || undefined);
    } else {
      const map = mapRef.current;
      const src = map?.getSource('photos') as maplibregl.GeoJSONSource | undefined;
      src
        ?.getClusterLeaves(clusterId, 1, 0)
        .then((leaves) => {
          const leaf = leaves?.[0];
          const photo = leaf ? byId.current.get(leaf.properties?.id as string) : undefined;
          const url = photo?.thumb_url || photo?.url || '';
          clusterRep.current.set(clusterId, url);
          fillThumb(thumb, url || undefined);
        })
        .catch(() => {});
    }

    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const map = mapRef.current;
      const src = map?.getSource('photos') as maplibregl.GeoJSONSource | undefined;
      if (!map || !src) return;
      const zoom = await src.getClusterExpansionZoom(clusterId);
      const leaves = await src.getClusterLeaves(clusterId, 1, 0);
      const leaf = leaves?.[0];
      const coords = leaf
        ? ((leaf.geometry as GeoJSON.Point).coordinates as [number, number])
        : map.getCenter().toArray();
      map.easeTo({ center: coords as [number, number], zoom });
    });
    return el;
  }

  /** 画面内のクラスタ／点に対応する HTML マーカーを増減させる */
  function updateMarkers() {
    const map = mapRef.current;
    if (!map || !map.isSourceLoaded('photos')) return;

    const features = map.querySourceFeatures('photos');
    const next: Record<string, maplibregl.Marker> = {};

    for (const f of features) {
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = f.properties ?? {};
      const isCluster = Boolean(props.cluster);
      const key = isCluster ? `c${props.cluster_id}` : `p${props.id}`;
      if (next[key]) continue;

      let marker = markers.current[key];
      if (!marker) {
        const el = isCluster
          ? makeClusterEl(props.cluster_id as number, props.point_count as number)
          : (() => {
              const photo = byId.current.get(props.id as string);
              return photo ? makePointEl(photo) : null;
            })();
        if (!el) continue;
        marker = new maplibregl.Marker({
          element: el,
          anchor: isCluster ? 'center' : 'bottom',
        }).setLngLat(coords);
        markers.current[key] = marker;
      }
      next[key] = marker;
      if (!onScreen.current[key]) marker.addTo(map);
    }

    for (const key of Object.keys(onScreen.current)) {
      if (!next[key]) onScreen.current[key].remove();
    }
    onScreen.current = next;
  }

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
      clusterRep.current.clear(); // cluster_id が振り直されるため代表キャッシュを破棄
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
