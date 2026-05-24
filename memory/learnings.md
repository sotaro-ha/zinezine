# Learnings — 旅写真マップ

追記のみ。コードベースやツールで非自明なパターン・ハマりどころ・驚きを見つけたら日付付きで追加する。

プロジェクト開始時点でこのファイルがほぼ空なのは正しい — 作業の中で有機的に育てる。

## 2026-05-25 — MapLibre のポップアップは React ではなく HTML 文字列

`maplibregl.Popup().setHTML(...)` は DOM/HTML 文字列を受け取る。React コンポーネントとして描画できないため、`src/components/PhotoPreview.tsx` の `buildPopupHTML()` で**エスケープ済みの**文字列を組み立てる。ユーザー由来の値（ファイル名・撮影日時）を差し込むので、エスケープを外すと XSS になる。

## 2026-05-25 — `Map` という名前のコンポーネントは global `Map` を隠す

地図コンポーネントを `Map` と命名すると、内部の `new Map<...>()`（lookup table）がコンポーネント関数を参照してしまい実行時エラーになる。`src/components/Map.tsx` は default export 関数名を `PhotoMap` にし、lookup には `new globalThis.Map(...)` を使う。import 名（`Map`）は呼び出し側の自由。

<!--
新エントリのテンプレート:

## YYYY-MM-DD — <一行サマリ>

驚いた点とその対処を数文で。具体的に。関連するファイルパスやコマンドを書く。
-->
