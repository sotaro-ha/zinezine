'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function NewTripPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '作成に失敗しました');
        setBusy(false);
        return;
      }
      router.push(`/trips/${json.trip.id}`);
    } catch {
      setError('ネットワークエラーが発生しました');
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <header className="reveal space-y-2">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-accent"
        >
          <span aria-hidden>←</span> 旅程一覧に戻る
        </Link>
        <h1 className="font-serif text-4xl leading-tight sm:text-5xl">新しい旅程</h1>
        <p className="text-muted-foreground">
          タイトルを付けて旅程を作成し、写真を追加していきます。
        </p>
      </header>

      <form
        onSubmit={submit}
        className="reveal surface space-y-5 p-6"
        style={{ animationDelay: '80ms' }}
      >
        <div className="space-y-1.5">
          <label htmlFor="title" className="text-sm font-medium">
            タイトル <span className="text-destructive">*</span>
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 2026 春 京都"
            maxLength={120}
            required
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="description" className="text-sm font-medium">
            説明（任意）
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="どんな旅だったか、メモ程度に。"
            rows={3}
            className="w-full resize-none rounded-xl border border-input bg-background/60 px-4 py-2.5 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !title.trim()} className="btn-accent w-full">
          {busy ? '作成中…' : '旅程を作成'}
        </button>
      </form>
    </main>
  );
}
