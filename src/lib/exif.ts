import exifr from 'exifr';

export type PhotoMeta = {
  lat: number | null;
  lng: number | null;
  takenAt: Date | null;
  width: number | null;
  height: number | null;
};

/**
 * File から EXIF を抽出する。ブラウザ内で完結させる（サーバー転送しない）。
 * HEIC 対応のため exifr を採用（piexifjs は HEIC 非対応）。
 * GPS が無い写真も許容し、その場合 lat/lng は null になる。
 *
 * 座標は専用の `exifr.gps()` を使う。`parse({ pick: ['latitude','longitude'] })` では
 * exifr が GPS ブロックを解析せず座標が返らない（HEIC/JPEG とも）ため使わない。
 */
export async function extractMeta(file: File): Promise<PhotoMeta> {
  // 1) 座標（GPS 専用メソッドが最も確実）
  let lat: number | null = null;
  let lng: number | null = null;
  const gps = await exifr.gps(file).catch(() => null);
  if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
    lat = gps.latitude;
    lng = gps.longitude;
  }

  // 2) 撮影日時・寸法
  const data = await exifr
    .parse(file, {
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ExifImageWidth',
        'ExifImageHeight',
        'PixelXDimension',
        'PixelYDimension',
      ],
    })
    .catch(() => null);

  return {
    lat,
    lng,
    takenAt: data?.DateTimeOriginal ?? data?.CreateDate ?? null,
    width: data?.ExifImageWidth ?? data?.PixelXDimension ?? null,
    height: data?.ExifImageHeight ?? data?.PixelYDimension ?? null,
  };
}
