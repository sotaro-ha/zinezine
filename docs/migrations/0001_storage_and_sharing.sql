-- 旅写真マップ — マイグレーション 0001: Storage を非公開化 + 旅程単位の共有
-- Supabase の SQL Editor で「上から順に」実行する。何度実行しても安全（idempotent）。
--
-- 目的:
--   1) 匿名（未ログイン）での写真閲覧を禁止する（旧 photos_storage_read の穴を塞ぐ）
--   2) アップロードを「自分のフォルダ」だけに限定する
--   3) 旅程をメール単位で他ユーザーへ共有できるようにする（所有者 OR 共有先のみ閲覧可）
--
-- 設計メモ:
--   - 共有は auth.users を露出させないため「メールアドレス」で持つ。
--   - RLS の相互参照による無限再帰を避けるため、判定は security definer 関数に閉じる。

-- ============================================================
-- 1) 共有テーブル
-- ============================================================
create table if not exists trip_shares (
  trip_id uuid not null references trips(id) on delete cascade,
  shared_with_email text not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, shared_with_email)
);

create index if not exists trip_shares_email_idx on trip_shares (lower(shared_with_email));

alter table trip_shares enable row level security;

-- ============================================================
-- 2) 可視性判定（security definer = RLS をバイパスして判定。再帰を防ぐ）
-- ============================================================
create or replace function public.user_owns_trip(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from trips t
    where t.id = tid and t.user_id = auth.uid()
  );
$$;

create or replace function public.user_can_view_trip(tid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from trips t
    where t.id = tid and t.user_id = auth.uid()
  )
  or exists (
    select 1 from trip_shares s
    where s.trip_id = tid
      and lower(s.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.user_owns_trip(uuid) from public;
revoke all on function public.user_can_view_trip(uuid) from public;
grant execute on function public.user_owns_trip(uuid) to authenticated;
grant execute on function public.user_can_view_trip(uuid) to authenticated;

-- ============================================================
-- 3) trips: SELECT を「所有者 OR 共有先」に拡張。書き込みは所有者のみ。
-- ============================================================
drop policy if exists "trips_select_own" on trips;
drop policy if exists "trips_select_visible" on trips;
create policy "trips_select_visible" on trips
  for select to authenticated
  using (public.user_can_view_trip(id));

-- insert/update/delete は所有者限定のまま（既存があれば作り直し）
drop policy if exists "trips_insert_own" on trips;
create policy "trips_insert_own" on trips
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "trips_update_own" on trips;
create policy "trips_update_own" on trips
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "trips_delete_own" on trips;
create policy "trips_delete_own" on trips
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- 4) photos: SELECT は「閲覧可能な旅程の写真」。追加は自分の旅程にのみ。
-- ============================================================
drop policy if exists "photos_select_own" on photos;
drop policy if exists "photos_select_visible" on photos;
create policy "photos_select_visible" on photos
  for select to authenticated
  using (public.user_can_view_trip(trip_id));

drop policy if exists "photos_insert_own" on photos;
create policy "photos_insert_own" on photos
  for insert to authenticated
  with check (auth.uid() = user_id and public.user_owns_trip(trip_id));

drop policy if exists "photos_delete_own" on photos;
create policy "photos_delete_own" on photos
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- 5) trip_shares: 所有者は管理可。共有先は自分宛ての行のみ参照可。
--    （他テーブルの可視性判定が共有行を読めるようにするため、自分宛ては参照可にする）
-- ============================================================
drop policy if exists "trip_shares_select" on trip_shares;
create policy "trip_shares_select" on trip_shares
  for select to authenticated
  using (
    public.user_owns_trip(trip_id)
    or lower(shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "trip_shares_insert" on trip_shares;
create policy "trip_shares_insert" on trip_shares
  for insert to authenticated with check (public.user_owns_trip(trip_id));

drop policy if exists "trip_shares_delete" on trip_shares;
create policy "trip_shares_delete" on trip_shares
  for delete to authenticated using (public.user_owns_trip(trip_id));

-- ============================================================
-- 6) Storage バケット `photos` を非公開化
--    パス形式: `${userId}/${tripId}/${uuid}-${filename}`
--    foldername[1] = userId, foldername[2] = tripId
-- ============================================================
update storage.buckets set public = false where id = 'photos';

-- 旧: bucket_id だけで全公開していた読み取りポリシーを撤廃
drop policy if exists "photos_storage_read" on storage.objects;
-- 読み取り: 自分のフォルダ OR 共有された旅程のみ（署名付きURLの発行時に評価される）
create policy "photos_storage_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_can_view_trip(((storage.foldername(name))[2])::uuid)
    )
  );

-- アップロード: 自分のフォルダにのみ
drop policy if exists "photos_storage_insert" on storage.objects;
create policy "photos_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 削除: 自分のフォルダにのみ
drop policy if exists "photos_storage_delete" on storage.objects;
create policy "photos_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
