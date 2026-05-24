-- 旅写真マップ — マイグレーション 0003: zine ボード（スタンプ等の編集内容を保存）
-- zine（ストーリー型の提案）に貼ったスタンプなどを旅程ごとに保存する。
-- 閲覧・編集は「その旅程を見られる人」（所有者 OR 共有先）に許可する＝一緒に編集できる。
-- 写真/旅程そのものの編集（追加・削除）は従来通り所有者のみ（別テーブル）。

create table if not exists zine_boards (
  trip_id uuid primary key references trips(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table zine_boards enable row level security;

drop policy if exists "zine_boards_select" on zine_boards;
create policy "zine_boards_select" on zine_boards
  for select to authenticated using (public.user_can_view_trip(trip_id));

drop policy if exists "zine_boards_insert" on zine_boards;
create policy "zine_boards_insert" on zine_boards
  for insert to authenticated with check (public.user_can_view_trip(trip_id));

drop policy if exists "zine_boards_update" on zine_boards;
create policy "zine_boards_update" on zine_boards
  for update to authenticated
  using (public.user_can_view_trip(trip_id))
  with check (public.user_can_view_trip(trip_id));
