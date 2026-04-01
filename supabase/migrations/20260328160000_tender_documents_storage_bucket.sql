-- Optional snake_case bucket (client default NEXT_PUBLIC_TENDER_DOCUMENTS_BUCKET=tender_documents)
insert into storage.buckets (id, name, public)
values ('tender_documents', 'tender_documents', false)
on conflict (id) do nothing;

drop policy if exists tender_documents_snake_storage_admin_insert on storage.objects;
create policy tender_documents_snake_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tender_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_snake_storage_admin_select on storage.objects;
create policy tender_documents_snake_storage_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tender_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_snake_storage_admin_update on storage.objects;
create policy tender_documents_snake_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tender_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_snake_storage_admin_delete on storage.objects;
create policy tender_documents_snake_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tender_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
