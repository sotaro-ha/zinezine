---
name: add-feature
description: 旅写真マップに新機能を追加する。新しいエンドポイント、コンポーネント、テーブル/カラム、バッチジョブなどを追加するときに使う。型 → ロジック → API/route → 進捗更新の順を強制し、変更がセッションをまたいで保持されるようにする。
---

# add-feature

## いつ使うか

新機能・エンドポイント・コンポーネント・ドメイン概念を導入する依頼すべて。リファクタやバグ修正には使わない。

## ステップ

1. **メモリを読む。** `memory/progress.md` でその機能がどの Phase に属するか確認する（スコープ外なら指摘）。`memory/decisions.md` で影響する決定を確認。`memory/open-questions.md` に関連する未決事項があれば、続行前にユーザーへ surface する。
2. **型を先に。** ドメイン型は `src/types/`（写真関連は `photo.ts`）。Supabase 行の型もここで固める。
3. **ロジック。** EXIF 抽出・距離計算・クラスタリング等の純粋ロジックを実装。Supabase / フレームワーク I/O を混ぜない。EXIF はブラウザ内で完結させる（`.claude/rules/architecture.md`）。
4. **配線。** Route Handler は `src/app/api/<resource>/route.ts`、UI は `src/components/`。サーバー秘密情報をクライアントに渡さない（`.claude/rules/security.md`）。`'use client'` から秘匿キーを参照しない。
5. **入力バリデーション。** Route Handler の入力は境界バリデーションする。
6. **検証。** `npm run format` → `npm run check` を実行し、通るまで直す。UI 変更なら dev server で実際に動かして確認する。
7. **メモリ更新。** `memory/progress.md` の該当 Phase 項目をチェック。非自明な選択をしたら `memory/decisions.md` に追記。

## 注意

- テストは現状 MVP 優先で後回し（`memory/open-questions.md`）。完了の定義に自動テストは含めない。
- アーキテクチャルールが自然な構造を禁じる場合、黙って違反せず代替案を提案する。
- 依存を追加する場合は `.claude/rules/security.md` の npm サプライチェーン手順に従う（勝手に追加しない）。
