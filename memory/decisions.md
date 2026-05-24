# Decisions — 旅写真マップ

非自明な選択を日付付きで記録する。**過去エントリは編集しない**（追記のみ）。次の人が再議論しなくて済むようにする。

## 2026-05-25 — バックエンドは Supabase

Firebase（NoSQL で将来の旅程解析クエリが書きにくい）と Vercel Postgres+Blob（無料枠が小さい）を比較し、Supabase を採用。理由: SQL（PostGIS で地理空間クエリ可）、RLS でグループ共有を後付けしやすい、無料枠が広い（DB 500MB / Storage 1GB / 月5万MAU）。`req.md` §バックエンド選定の根拠より。

## 2026-05-25 — EXIF 抽出はブラウザ内で完結（exifr）

`exifr` を採用（HEIC 対応。`piexifjs` は HEIC 非対応）。サーバーへ画像を送らずブラウザで抽出し、無駄な転送を避ける（`req.md` 禁止事項）。GPS なし写真も受け付け、マップピンには出さない。

## 2026-05-25 — npm サプライチェーン対策を最初から組み込む

2025-2026 の Shai-Hulud / Mini Shai-Hulud ワーム（postinstall 悪用・自己増殖・資格情報窃取）を受け、`.npmrc` に `ignore-scripts=true` / `min-release-age=7`（公開7日未満を弾く、要 npm 11.10+）/ `save-exact=true` を設定。lockfile コミット + `npm ci` 運用。背景は `README.md`「セキュリティ」。

## 2026-05-25 — ハーネスは `vibemayfes` 構造を踏襲

ユーザー依頼により、別プロジェクト `vibemayfes` の構造を踏襲。`AGENTS.md` をエントリポイント、`memory/` プロトコルで決定の忘却を防ぐ、`.claude/rules` + `.claude/skills`、Biome、shadcn/ui（`components.json` + `tailwind.config.ts`）、`src/` レイアウト。Tailwind は `vibemayfes` に合わせ v4 → **v3** に変更（config ファイル + HSL CSS 変数 + autoprefixer）。Next/React は新しめを維持（Next 16 / React 19）。

## 2026-05-25 — 認証は Supabase Auth の Google のみ + 管理者許可リスト

ユーザー依頼により認証は Google OAuth のみ。Supabase Auth を使い、`@supabase/ssr` の cookie ベース SSR（`getServerSupabase` を async 化、`src/middleware.ts` でセッション更新 + ルート保護）。「とりあえず管理者だけ」を `ADMIN_EMAILS`（サーバー専用 env、カンマ/空白区切り）の許可リストで実現。**fail-closed**: 未設定なら誰もログインできない。誰でも Google ログインは試せるが、許可リスト外は middleware が即サインアウトして `/login?error=not_admin` へ。Firebase Auth ではなく Supabase Auth にしたのはバックエンドが Supabase で一貫するため。

## 2026-05-25 — RLS は所有者スコープ、管理者限定はアプリ層

`trips`/`photos` の RLS は `auth.uid() = user_id`（各自の行のみ）。「管理者のみ」は DB ではなくアプリ層（`ADMIN_EMAILS`）で担保。理由: 将来一般ユーザーへ開放する際、RLS は所有者スコープのままでよく、アプリ層のゲートを外すだけで済む。Storage `photos` は Public read（表示 URL を公開で使う）+ authenticated insert + 所有者 delete。

## 2026-05-25 — 画面構成と写真の旅程紐付け

最小画面: `/login`・`/trips`（一覧）・`/trips/new`（作成）・`/trips/[id]`（地図+画像追加）。`/` は `/trips` へリダイレクト。写真は必ず旅程（`trip_id`）に属し、`photos.user_id`/`trip_id` を not null/FK 化（旧 MVP の nullable から変更）。アップロードは従来どおりブラウザ直 upload（EXIF はブラウザ内）だが、`user_id`/`trip_id` を付与し storage パスを `userId/tripId/uuid-name` に整理。旧 `/upload`（旅程なし一括アップロード）は撤去。

## 2026-05-25 — 仕様の正本は `req.md`（docs/ へ移動しない）

`vibemayfes` は `docs/開発仕様書.md` を正本とするが、本プロジェクトでは既存の `req.md` をそのまま正本とし、`AGENTS.md` から参照する。`docs/` ディレクトリは将来の補助資料用に用意。

## 2026-05-25 — プロダクト方針: Polarsteps とは別ゲームで戦う

直接競合は **Polarsteps**（旅の自動GPSログ + テンプレ印刷本、2,000万人）。同じ土俵（自動追跡アプリ）では勝てない（ネイティブ完成度・オフライン・印刷物流・社会的グラフが完成済み）。**別ゲームに持ち込む**のが方針。

ポジショニング: **「Polarsteps は"一人の旅の自動ログ"。こちらは"みんなで寄せて、AIが一冊に綴じる旅の zine"」**

Polarsteps の構造的な穴（＝突きどころ）:
- **1旅程に1人しか投稿できない**（同行者は集約 or 各自バラバラ）。← 最大の穴
- 旅行中にアプリ起動して追跡する前提（電池・粗い経路・手動開始/終了/統合不可）。
- アウトプットはテンプレ印刷本（€36〜150、最低24p）。AI が文章を書く"読み物"ではない。
- グローバル一律・英語前提で、日本語の組版/情緒に最適化していない。

優位を狙う4くさび（優先度順）:
1. **AIが綴じる web zine** — 場所クラスタ＋滞在から Claude が日本語エッセイ/キャプションを生成、地図連動の縦スクロール zine を即・無料で。印刷は後段。アウトプットの質で差別化。
2. **共同編集の旅程** — `trip_shares` を活かし複数人が同じ地図に写真を寄せる「みんなの旅程」。Polarsteps の最大の穴を突く。req.md のグループ共有ゴールそのもの。
3. **写真起点・後追いOK** — EXIF だけ要るので一眼の写真や昔の旅も後から再構成。旅行中の常時起動が不要。
4. **日本語の編集体験** — 明朝＋Fraunces・地図主役の和の体裁。"記録"でなく"作品(zine)"へ。

戦わない領域: 自動GPS追跡そのもの、ネイティブ/オフライン、印刷スケール、フォローグラフ。

実装上の罠（くさびを実現する前提）:
- **②③は EXIF GPS 前提** → GPS なし写真が多い現実に備え「**手動ピン留め UI**」が早期に必要。
- **共同編集には権限設計が要る**。現 RLS は閲覧=共有先 / 書込=所有者のみなので、共有相手は写真を足せない。「みんなで寄せる」を本気でやるなら `trip_shares` に **contributor（編集可）** の概念を追加する必要がある。

**Why:** 機能の優先順位を決める判断軸（次に作るべきは ①web zine と ②共同編集。追跡アプリ機能は作らない）。
**How to apply:** 新機能の検討時、「Polarsteps の真似（追跡精度・印刷物流）」なら却下寄り、「zine の質・共同編集・後追い・日本語 craft」を強める提案を優先する。詳細調査の出典は [[learnings]] ではなく本エントリに集約。
