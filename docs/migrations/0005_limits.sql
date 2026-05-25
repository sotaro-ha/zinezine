-- 0005: 利用上限（DB 側で強制）
--  - 旅程は 1 ユーザーにつき 5 つまで（共有された旅程は所有者側で数える）
--  - 写真は 1 旅程につき 1000 枚まで
-- クライアントは anon キーで直接 insert するため、上限は DB トリガーで担保する。
-- 値を変えるときは src/lib/limits.ts も合わせること。

-- ============================================================
-- 旅程: 1 ユーザー 5 つまで
-- ============================================================
create or replace function public.enforce_trip_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from trips where user_id = new.user_id) >= 5 then
    raise exception '旅程は 1 ユーザーにつき 5 つまでです' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_limit on trips;
create trigger trips_limit before insert on trips
  for each row execute function public.enforce_trip_limit();

-- ============================================================
-- 写真: 1 旅程 1000 枚まで
-- ============================================================
create or replace function public.enforce_photo_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from photos where trip_id = new.trip_id) >= 1000 then
    raise exception '1 つの旅程に追加できる写真は 1000 枚までです' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_limit on photos;
create trigger photos_limit before insert on photos
  for each row execute function public.enforce_photo_limit();
