-- Authenticated users can manage delivery note images for procurement proof

drop policy if exists delivery_notes_storage_authenticated_all on storage.objects;

create policy delivery_notes_storage_authenticated_all
  on storage.objects
  for all
  to authenticated
  using (bucket_id = 'delivery-notes')
  with check (bucket_id = 'delivery-notes');
