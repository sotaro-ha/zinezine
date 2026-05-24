# 旅写真マップ MVP - コーディングエージェント向け指示書

## プロジェクト概要

旅行中に撮った写真の位置情報（GPS EXIF）を抽出し、Web上のマップにピンとして可視化するアプリ。将来的にグループ共有・AIによるzine生成へ拡張する。本ドキュメントは **機能1（写真アップロード → マップ表示）の MVP** の実装指示書。

### 最終ゴール（参考・本MVPでは未実装）
1. 位置情報付き写真をグループでアップロード
2. マップ上でハイライト・旅程として閲覧
3. AIが自動でzine（旅の冊子）を生成

### このMVPのスコープ
- ✅ ローカルで写真複数枚を選択 → EXIFから緯度経度・撮影日時を抽出
- ✅ Supabase Storage に画像、Postgres にメタデータを保存
- ✅ MapLibre GL JS でマップ表示、ピンクリックで写真プレビュー
- ✅ 撮影日時順にピンを線でつないで旅程ラインを表示
- ❌ 認証・グループ共有（将来）
- ❌ AI解析・zine生成（将来）

---

## 技術スタック

| 層 | 採用 | 理由 |
|---|---|---|
| フロント | Next.js latest
 (App Router) + TypeScript | Vercelデプロイ容易、SSR/CSR柔軟 |
| UI | shadcn/ui | 速い、無料 |
| マップ | MapLibre GL JS | 完全OSS・無料、ベンダーロックインなし |
| タイル | MapTiler (Streets v2) | 月10万タイル無料、クレカ不要 |
| EXIF抽出 | `exifr` (npm) | ブラウザで動く、軽量、HEIC対応 |
| バックエンド | Supabase | Postgres+ストレージ+認証+RLSがオールインワン、無料枠が広い |
| デプロイ | Vercel | Next.jsとの親和性、無料枠あり |

### バックエンド選定の根拠（記録）
- Firebase: NoSQLで将来の旅程解析クエリが書きにくい
- Vercel Postgres+Blob: 無料枠が小さく、写真大量保存に不向き
- **Supabase: SQL（PostGIS拡張で地理空間クエリも可能）、RLSでグループ共有を後で追加しやすい、無料枠 DB 500MB / ストレージ1GB / 月5万MAU**

---

## データモデル（Supabase）

### Table: `photos`
| カラム | 型 | 説明 |
|---|---|---|
| id | uuid (pk, default gen_random_uuid()) | |
| user_id | uuid (nullable) | 将来の認証用、MVPではnull可 |
| trip_id | uuid (nullable) | 将来のグループ/旅行単位、MVPではnull可 |
| storage_path | text not null | Supabase Storage上のパス |
| lat | double precision | EXIFがない写真も許容するためnullable |
| lng | double precision | 同上 |
| taken_at | timestamptz | EXIF DateTimeOriginal |
| width | int | |
| height | int | |
| created_at | timestamptz default now() | |

インデックス: `(taken_at)`, `(lat, lng)`

### Storage Bucket: `photos`
- Public read（MVPでは認証なしで閲覧可能にするため）
- アップロードはサーバー経由 or anon keyで直接（MVPは後者でOK）

### RLS（MVP）
MVPでは `photos` テーブル・バケットともに anon でinsert/select可能にする。将来 trip_id/user_id ベースのポリシーに切り替える前提でコメントを残しておくこと。

---

## ディレクトリ構成

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # マップ画面（メイン）
│   ├── upload/
│   │   └── page.tsx          # アップロード画面
│   └── api/
│       └── photos/
│           └── route.ts      # GET: 全写真メタデータ取得
├── components/
│   ├── Map.tsx               # MapLibre ラッパー（'use client'）
│   ├── PhotoUploader.tsx     # ドラッグ&ドロップ + EXIF抽出
│   └── PhotoPreview.tsx      # ピンクリック時のポップアップ
├── lib/
│   ├── supabase.ts           # createClient (browser/server両対応)
│   └── exif.ts               # exifr ラッパー: File → {lat, lng, takenAt, w, h}
├── types/
│   └── photo.ts              # Photo型定義
├── .env.local                # 環境変数（コミット禁止）
├── .env.example              # キー名のみ記載
└── README.md
```

---

## 環境変数

`.env.example` を作成：

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_MAPTILER_KEY=
```

セットアップ手順をREADMEに記載すること（Supabaseプロジェクト作成、MapTilerアカウント作成、テーブル作成SQL）。

---

## 実装詳細

### 1. EXIF抽出 (`lib/exif.ts`)

```ts
import exifr from 'exifr';

export type PhotoMeta = {
  lat: number | null;
  lng: number | null;
  takenAt: Date | null;
  width: number | null;
  height: number | null;
};

export async function extractMeta(file: File): Promise<PhotoMeta> {
  const data = await exifr.parse(file, {
    pick: ['latitude', 'longitude', 'DateTimeOriginal', 'ExifImageWidth', 'ExifImageHeight'],
  }).catch(() => null);

  return {
    lat: data?.latitude ?? null,
    lng: data?.longitude ?? null,
    takenAt: data?.DateTimeOriginal ?? null,
    width: data?.ExifImageWidth ?? null,
    height: data?.ExifImageHeight ?? null,
  };
}
```

- GPSなしの写真も受け付け、リストには表示するがマップピンには出さない（仕様）
- HEIC対応のため `exifr` を選定（`piexifjs` はHEIC非対応）

### 2. アップロード (`components/PhotoUploader.tsx`)

- ドラッグ&ドロップ + ファイル選択 両対応
- 複数枚同時アップロード（並列、ただし同時実行は3に制限）
- 各ファイルごとに進捗表示
- 流れ:
  1. `extractMeta(file)` でEXIF抽出
  2. Supabase Storage に `${crypto.randomUUID()}-${file.name}` でアップロード
  3. 成功したら `photos` テーブルにメタデータ挿入
  4. 全完了で `/` にリダイレクト

エラーハンドリング: 1枚失敗しても他は続行、最後にサマリー表示。

### 3. マップ画面 (`app/page.tsx` + `components/Map.tsx`)

- サーバーコンポーネントで `photos` を全件取得（MVPは件数少ない前提、将来ページング）
- `Map.tsx` は `'use client'`、MapLibre を `useEffect` で初期化
- スタイル: `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`
- ピン: GeoJSON layer として一括追加（個別Markerより高速）
- **撮影日時順に LineString でピンを結ぶ** → 旅程ラインに見える
- ピンクリック: ポップアップで写真サムネ + 撮影日時を表示
- 初期表示: 全ピンの bounding box に `fitBounds`（写真ゼロなら東京中心）
- 右上にフローティングボタンで `/upload` へ遷移

### 4. ナビゲーション
- ヘッダーなし、地図全画面。`/upload` は中央寄せのシンプルなアップロードUI。

---

## UI/UXガイドライン

派手な装飾より**地図そのものを主役**にする方針。

- 地図は画面全幅・全高
- フローティング要素（アップロードボタン、写真件数バッジ）は角丸 + ドロップシャドウで浮かせる
- フォント: 見出しに `'Instrument Serif'` か `'Fraunces'`（Google Fonts無料）、本文に `'Geist'` か OS デフォルト sans。Inter は避ける
- カラー: ベース白〜オフホワイト、アクセントは1色のみ（例: deep teal `#0a4a4e` or burnt orange `#c2410c`）
- 旅程ラインは半透明のアクセント色、ピンは白丸 + アクセント色のリング
- アップロード画面はゆったり余白、ドロップエリアは点線ボーダー + ホバーで微かに浮く

---

## セットアップSQL（READMEに記載）

```sql
create table photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  trip_id uuid,
  storage_path text not null,
  lat double precision,
  lng double precision,
  taken_at timestamptz,
  width int,
  height int,
  created_at timestamptz default now()
);

create index photos_taken_at_idx on photos(taken_at);
create index photos_geo_idx on photos(lat, lng);

-- MVP: anon でinsert/select可能（将来RLSポリシーで絞る）
alter table photos enable row level security;
create policy "anon read"   on photos for select using (true);
create policy "anon insert" on photos for insert with check (true);
```

Storageバケット `photos` を作成し、Publicに設定。

---

## 完成の定義（Definition of Done）

- [ ] `npm install && npm run dev` で起動できる
- [ ] `.env.example` を `.env.local` にコピーして値を入れれば動く
- [ ] `/upload` で複数枚の jpeg/heic を選択 → アップロード成功
- [ ] `/` でアップロード済み写真がピンとして地図に表示される
- [ ] 撮影日時順に線で結ばれている
- [ ] ピンをクリックすると写真と撮影日時が表示される
- [ ] GPSなしの写真はアップロードは成功するがマップには出ない（リストには出してもよい）
- [ ] README にセットアップ手順（Supabase, MapTiler, env, SQL）が書かれている
- [ ] Vercel に1コマンドでデプロイできる状態

---

## 将来拡張のためのメモ（実装時に意識するだけでOK、機能は作らない）

1. **グループ共有**: `trip_id` カラムは用意済み。`trips` テーブルを追加し、`trip_id` ベースのRLSに切り替える
2. **AI解析**: `taken_at` と `(lat, lng)` のクラスタリングで「日ごとのハイライト」を抽出可能。PostGISの `ST_ClusterDBSCAN` が使える
3. **zine生成**: 解析結果（場所クラスタ＋代表写真＋滞在時間）を Claude API に投げて文章生成 → PDF出力
4. **認証**: Supabase Auth（Email or Google）を後付け、RLSポリシーを `user_id = auth.uid()` 系に変更

これらを見越して、テーブル設計とRLSの方針コメントは残しておくこと。

---

## 禁止事項
- Google Maps の利用（クレカ必須、商用色強い）
- `localStorage`/`sessionStorage` への写真本体保存（Supabase Storageを使うこと）
- APIキーのハードコード
- EXIF抽出をサーバー側でやる（ブラウザで完結させ、無駄な転送を避ける）