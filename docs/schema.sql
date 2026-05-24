-- 旅写真マップ — Supabase スキーマ（Google 認証 + 管理者限定 + 旅程共有）
-- Supabase の SQL Editor で実行する（新規構築用。既存 DB は docs/migrations/ を使う）。
-- 認証は Supabase Auth(Google)。アプリ層で ADMIN_EMAILS 許可リストに絞る。
-- RLS は auth.uid() ベース。閲覧は「所有者 OR 共有先（trip_shares）」、書き込みは所有者のみ。
-- Storage バケット `photos` は非公開。表示は署名付き URL で行う。

-- ============================================================
-- trips: 旅程
-- ============================================================
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  cover_photo_path text,                       -- 代表写真の storage パス（任意）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on trips(user_id);
create index if not exists trips_created_at_idx on trips(created_at desc);

-- ============================================================
-- photos: 写真メタデータ（本体は Storage）
-- ============================================================
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,  -- 旅程に属する
  storage_path text not null,
  lat double precision,   -- GPS が無い写真は null（マップピンには出さない）
  lng double precision,
  taken_at timestamptz,   -- EXIF DateTimeOriginal
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists photos_trip_id_idx on photos(trip_id);
create index if not exists photos_taken_at_idx on photos(taken_at);
create index if not exists photos_geo_idx on photos(lat, lng);

-- ============================================================
-- trip_shares: 旅程をメール単位で共有（auth.users を露出させない）
-- ============================================================
create table if not exists trip_shares (
  trip_id uuid not null references trips(id) on delete cascade,
  shared_with_email text not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, shared_with_email)
);
create index if not exists trip_shares_email_idx on trip_shares (lower(shared_with_email));

-- ============================================================
-- 可視性判定（security definer = RLS をバイパス。ポリシー間の無限再帰を防ぐ）
-- ============================================================
create or replace function public.user_owns_trip(tid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trips t where t.id = tid and t.user_id = auth.uid());
$$;
create or replace function public.user_can_view_trip(tid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trips t where t.id = tid and t.user_id = auth.uid())
      or exists (select 1 from trip_shares s where s.trip_id = tid
                 and lower(s.shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.user_owns_trip(uuid) from public;
revoke all on function public.user_can_view_trip(uuid) from public;
grant execute on function public.user_owns_trip(uuid) to authenticated;
grant execute on function public.user_can_view_trip(uuid) to authenticated;

-- ============================================================
-- RLS: 閲覧は「所有者 OR 共有先」、書き込みは所有者のみ
-- （管理者限定はアプリ層の ADMIN_EMAILS で担保。ここは所有者/共有スコープ）
-- ============================================================
alter table trips enable row level security;
create policy "trips_select_visible" on trips for select to authenticated using (public.user_can_view_trip(id));
create policy "trips_insert_own" on trips for insert to authenticated with check (auth.uid() = user_id);
create policy "trips_update_own" on trips for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trips_delete_own" on trips for delete to authenticated using (auth.uid() = user_id);

alter table photos enable row level security;
create policy "photos_select_visible" on photos for select to authenticated using (public.user_can_view_trip(trip_id));
create policy "photos_insert_own" on photos for insert to authenticated with check (auth.uid() = user_id and public.user_owns_trip(trip_id));
create policy "photos_delete_own" on photos for delete to authenticated using (auth.uid() = user_id);

alter table trip_shares enable row level security;
create policy "trip_shares_select" on trip_shares for select to authenticated
  using (public.user_owns_trip(trip_id) or lower(shared_with_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "trip_shares_insert" on trip_shares for insert to authenticated with check (public.user_owns_trip(trip_id));
create policy "trip_shares_delete" on trip_shares for delete to authenticated using (public.user_owns_trip(trip_id));

-- ============================================================
-- Storage: バケット `photos`（非公開）
-- ダッシュボードで作成（Public OFF）。パス形式: ${userId}/${tripId}/${uuid}-${name}
-- 表示は署名付き URL（createSignedUrls）。読み取りは自分 OR 共有された旅程のみ。
-- ============================================================
-- update storage.buckets set public = false where id = 'photos';
create policy "photos_storage_read" on storage.objects
  for select to authenticated using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_can_view_trip(((storage.foldername(name))[2])::uuid)
    )
  );
create policy "photos_storage_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "photos_storage_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 将来拡張:
--  - AI 解析/zine: taken_at と (lat,lng) のクラスタリング（PostGIS ST_ClusterDBSCAN）
