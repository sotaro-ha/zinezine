import PhotoUploader from '@/components/PhotoUploader';
import Link from 'next/link';

export default function UploadPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <Link href="/" className="text-sm text-neutral-500 transition hover:text-accent">
          ← マップに戻る
        </Link>
        <h1 className="font-serif text-4xl">写真をアップロード</h1>
        <p className="text-neutral-500">
          位置情報（GPS）付きの写真をマップに表示します。jpeg / heic に対応。 GPS
          の無い写真もアップロードできますが、ピンには出ません。
        </p>
      </header>

      <PhotoUploader />
    </main>
  );
}
