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
 */
export async function extractMeta(file: File): Promise<PhotoMeta> {
  const data = await exifr
    .parse(file, {
      pick: ['latitude', 'longitude', 'DateTimeOriginal', 'ExifImageWidth', 'ExifImageHeight'],
    })
    .catch(() => null);

  return {
    lat: data?.latitude ?? null,
    lng: data?.longitude ?? null,
    takenAt: data?.DateTimeOriginal ?? null,
    width: data?.ExifImageWidth ?? null,
    height: data?.ExifImageHeight ?? null,
  };
}
