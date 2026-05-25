-- 0004: 共有された人も写真を追加できるようにする
-- これまで写真の insert は所有者のみ（user_owns_trip）だった。
-- 共有先（trip_shares）も「自分名義で」写真を追加できるようにする。
-- 閲覧は従来どおり user_can_view_trip（所有者 OR 共有先）。
-- 削除は「自分が上げた写真」OR「旅程の所有者」に拡張する。

-- ============================================================
-- photos: insert を共有先にも許可（user_id は自分、trip は閲覧可能なもの）
-- ============================================================
drop policy if exists "photos_insert_own" on photos;
create policy "photos_insert_contributor" on photos
  for insert to authenticated
  with check (auth.uid() = user_id and public.user_can_view_trip(trip_id));

-- 削除: 自分が上げた写真、または旅程の所有者なら任意の写真を消せる
drop policy if exists "photos_delete_own" on photos;
create policy "photos_delete_own_or_trip_owner" on photos
  for delete to authenticated
  using (auth.uid() = user_id or public.user_owns_trip(trip_id));

-- ============================================================
-- Storage: 投稿は従来どおり「自分のフォルダ（${uid}/...）」に限る（変更なし）。
-- 削除は、自分のフォルダ OR 旅程の所有者（共有先の投稿も所有者が消せる）。
-- パス形式: ${userId}/${tripId}/${uuid}-${name}
-- ============================================================
drop policy if exists "photos_storage_delete" on storage.objects;
create policy "photos_storage_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.user_owns_trip(((storage.foldername(name))[2])::uuid)
    )
  );
