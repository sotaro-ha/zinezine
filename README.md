# 旅写真マップ（MVP）

旅行中に撮った写真の位置情報（GPS EXIF）を抽出し、Web 上のマップにピンとして可視化するアプリ。
撮影日時順にピンを線で結んで旅程ラインを表示します。

- フロント: Next.js 16 (App Router) + TypeScript
- マップ: MapLibre GL JS + MapTiler タイル
- EXIF 抽出: `exifr`（ブラウザ内で完結、HEIC 対応）
- バックエンド: Supabase（Postgres + Storage）
- デプロイ: Vercel

> スコープ: ローカル写真の複数アップロード → EXIF 抽出 → Supabase 保存 → マップ表示。
> 認証・グループ共有・AI による zine 生成は将来拡張（テーブルに `user_id` / `trip_id` を用意済み）。

---

## セットアップ

### 0. 前提

- Node.js 20.9 以上
- **npm 11.10 以上**（`.npmrc` の `min-release-age` クールダウンに必要。`npm -v` で確認）

### 1. 依存インストール

```bash
npm install      # 初回。lockfile を生成する
git add package-lock.json && git commit -m "add lockfile"   # lockfile は必ずコミット
```

以降・CI では再現性のため `npm ci` を使う（`npm run deps:install`）。

> `.npmrc` で `ignore-scripts=true` を有効にしているため、インストール時に
> パッケージの postinstall スクリプトは実行されません（後述のセキュリティ参照）。
> もしネイティブビルドが必要な依存を追加し、ビルドが走らず動かない場合は、
> 信頼を確認した上で対象のみ `npm rebuild <pkg>` を実行してください。

### 2. Supabase プロジェクト作成

1. <https://supabase.com> でプロジェクトを作成
2. SQL Editor で **`docs/schema.sql`** を実行（`trips` / `photos` テーブル + インデックス + RLS + Storage ポリシー）
3. Storage で `photos` バケットを作成し **Public**（read）に設定
4. **Authentication → Providers → Google** を有効化（下記「Google 認証」参照）
5. Project Settings → API から `Project URL` と `anon public` キーを控える

> スキーマは `docs/schema.sql` が正本。RLS は `auth.uid()` ベースで、各ユーザーは自分の `trips`/`photos` のみ操作できる。「管理者のみ利用可」はアプリ層の `ADMIN_EMAILS` 許可リストで担保する。

#### Google 認証のセットアップ

1. Google Cloud Console で OAuth 2.0 クライアント（種別: ウェブ）を作成。
2. 「承認済みリダイレクト URI」に Supabase のコールバック
   `https://<PROJECT>.supabase.co/auth/v1/callback` を登録。
3. 取得した Client ID / Secret を Supabase の Authentication → Providers → Google に設定。
4. Authentication → URL Configuration の「Site URL」「Redirect URLs」に
   `http://localhost:3000`（と本番 URL）を登録。アプリ側のコールバックは `/api/auth/callback`。

### 3. MapTiler アカウント

<https://www.maptiler.com> で無料アカウントを作成し、API キーを取得（月 10 万タイル無料・クレカ不要）。

### 4. 環境変数

```bash
cp env.example .env.local
```

`.env.local` に値を入れる（`.env.local` はコミット禁止）:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_MAPTILER_KEY=xxxx
# Google ログインを許可する管理者メール（, または空白区切り）。未設定だと誰もログインできない。
ADMIN_EMAILS=you@example.com
```

> `NEXT_PUBLIC_` 変数はブラウザに露出します。anon key と MapTiler key は公開前提のキーです。
> `ADMIN_EMAILS` は **サーバー専用**（`NEXT_PUBLIC_` を付けない）。サービスロールキー等の秘匿キーも同様。
> `ADMIN_EMAILS` は fail-closed: 未設定だと Google ログインしても全員弾かれます（必ず設定）。

### 5. 起動

```bash
npm run dev   # http://localhost:3000
```

- `/login` … Google ログイン（管理者のみ）
- `/trips` … 旅程一覧（`/` はここへリダイレクト）
- `/trips/new` … 旅程の新規作成
- `/trips/[id]` … 旅程の地図表示 + 写真追加

### 6. Vercel デプロイ

リポジトリを Vercel にインポートし、上記 4 つの環境変数（`ADMIN_EMAILS` 含む）を設定すれば 1 コマンドでデプロイ可能。Google OAuth のリダイレクト URL に本番ドメインを追加すること。

---

## セキュリティ（npm サプライチェーン対策）

2025〜2026 年にかけて npm では自己増殖型ワーム **Shai-Hulud / Mini Shai-Hulud** による
大規模なサプライチェーン攻撃が相次ぎました。手口は概ね次の通りです:

- メンテナのアカウントを乗っ取り、毒入りバージョンを公開
- インストール時の **postinstall スクリプト** で自己増殖し、GitHub PAT や
  AWS/GCP/Azure などのクラウド資格情報を窃取
- 悪性版はレジストリから削除されるまでの**数時間〜数日**だけ存在することが多い

本リポジトリは多層防御を最初から組み込んでいます。

### `.npmrc`（コミット済み・全員/CI に効く）

| 設定 | 効果 |
|---|---|
| `ignore-scripts=true` | postinstall/preinstall を実行しない。ワームの自己増殖・資格情報窃取の主経路を遮断 |
| `min-release-age=7` | 公開から 7 日未満のバージョンを入れない。「公開直後の毒入り版を掴む」事故を防ぐ |
| `save-exact=true` | 依存追加時に完全固定で記録。意図しない自動アップグレードを防ぐ |
| `audit=true` | インストール時に既知脆弱性を監査 |

### lockfile + `npm ci`

- `package-lock.json` を必ずコミットする
- 普段・CI は `npm ci`（`npm run deps:install`）を使う。lockfile と一致しなければ失敗するため、
  新たに公開された悪性版が黙って紛れ込まない
- `package.json` / `package-lock.json` / `.npmrc` の変更は必ずレビューする。
  見覚えのない lockfile の差分は人間が確認すること

### 運用のヒント

- 依存追加は `npm install <pkg>`（`save-exact` で固定される）→ lockfile 差分をレビュー → コミット
- 定期的に `npm run deps:audit`（high 以上で失敗）
- CI でも同じ `.npmrc` が効くようリポジトリ直下に置いている

### Claude Code を使う場合のハーネス側の防御

開発に Claude Code を使う場合、エージェント実行環境（ハーネス）側でも
危険なコマンドやファイルアクセスを制限できます。設定は `.claude/SECURITY-SETUP.md` を参照してください。

---

## ディレクトリ構成

`vibemayfes` のプロジェクト構造を踏襲（`src/` レイアウト + エージェントハーネス）。

```
AGENTS.md              # AI エージェント共通のエントリポイント（まず読む）
CLAUDE.md              # → AGENTS.md へのポインタ
req.md                 # 実装指示書（仕様の正本）
memory/                # 決定の忘却を防ぐメモリプロトコル
  progress.md / decisions.md / learnings.md / open-questions.md / session-handoff.md
.claude/
  rules/               # architecture / security / style（強制ルール）
  skills/              # add-feature / review-pr（再利用手順）
  launch.json
  SECURITY-SETUP.md    # 手動適用するハーネス設定（settings.json / hooks）
src/
  app/
    layout.tsx         # フォント・全体レイアウト
    page.tsx           # マップ画面（サーバーで photos 取得 → Map に渡す）
    upload/page.tsx    # アップロード画面
    api/photos/route.ts# GET: 全写真メタデータ
  components/
    Map.tsx            # MapLibre ラッパー（'use client'、default export は PhotoMap）
    PhotoUploader.tsx  # D&D + EXIF 抽出 + 並列アップロード（同時3）
    PhotoPreview.tsx   # ポップアップ HTML 生成（XSS 対策のエスケープ込み）
    ui/                # shadcn/ui プリミティブ（必要時に追加）
  lib/
    supabase.ts        # browser/server クライアント + 公開 URL 生成
    exif.ts            # exifr ラッパー
    utils.ts           # cn() ヘルパー
  types/
    photo.ts           # Photo 型
```

ツール: Biome（`npm run check` = `biome check .` → `tsc --noEmit`、`npm run format` で整形）、Tailwind v3 + shadcn/ui（`components.json` / `tailwind.config.ts`）。

## 将来拡張メモ

- グループ共有: `trip_id` ベースの RLS に切替（`trips` テーブル追加）
- AI 解析: `taken_at` と `(lat,lng)` のクラスタリング（PostGIS `ST_ClusterDBSCAN`）
- zine 生成: 解析結果を Claude API に渡して文章生成 → PDF
- 認証: Supabase Auth（`lib/supabase.ts` の server client にクッキー連携を実装）
