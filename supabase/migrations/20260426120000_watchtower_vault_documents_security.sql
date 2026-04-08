-- Watchtower: כספת חוזה — עדכון RLS + אחסון; מסמכי FM ישנים — סגירת anon והרחבת היקף לפי בניין.

-- ---------------------------------------------------------------------------
-- 1) mo_contract_vault_documents: עדכון רק למעלה או אדמין (לא "כל קורא")
-- ---------------------------------------------------------------------------
drop policy if exists mo_contract_vault_update on public.mo_contract_vault_documents;

create policy mo_contract_vault_update
  on public.mo_contract_vault_documents
  for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin'
    )
  )
  with check (
    uploaded_by = auth.uid()
    or exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) mo-contract-vault storage: הורדה רק כשקיימת שורה + mo_contract_vault_row_readable
-- ---------------------------------------------------------------------------
drop policy if exists mo_contract_vault_storage_select on storage.objects;

create policy mo_contract_vault_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'mo-contract-vault'
    and exists (
      select 1
      from public.mo_contract_vault_documents d
      where d.storage_path = storage.objects.name
        and public.mo_contract_vault_row_readable(d)
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Legacy public.documents + bucket documents — ללא anon; גישה לפי תפקיד ב-profiles
-- ---------------------------------------------------------------------------
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name varchar,
  created_at timestamptz default now()
);

alter table public.documents
  add column if not exists building_id uuid references public.buildings (id) on delete set null;

create index if not exists documents_building_id_idx
  on public.documents (building_id)
  where building_id is not null;

drop policy if exists "anon_select_documents_dashboard" on public.documents;
drop policy if exists "anon_insert_documents_dashboard" on public.documents;

drop policy if exists documents_select_building_scope on public.documents;
create policy documents_select_building_scope
  on public.documents
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

drop policy if exists documents_insert_staff on public.documents;
create policy documents_insert_staff
  on public.documents
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

drop policy if exists documents_update_staff on public.documents;
create policy documents_update_staff
  on public.documents
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

drop policy if exists documents_delete_staff on public.documents;
create policy documents_delete_staff
  on public.documents
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

comment on column public.documents.building_id is
  'אופציונלי: קישור לוגי לבניין/אתר; RLS לפי תפקיד ב-profiles בלבד.';

-- Bucket פרטי (חתימות URL מורשות למשתמש מחובר בלבד)
update storage.buckets
set public = false
where id = 'documents';

drop policy if exists "anon_insert_storage_documents" on storage.objects;
drop policy if exists "anon_select_storage_documents" on storage.objects;
drop policy if exists "anon_delete_storage_documents" on storage.objects;

drop policy if exists documents_storage_select_scoped on storage.objects;
create policy documents_storage_select_scoped
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents d
      where d.storage_path = storage.objects.name
        and exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role::text in ('admin', 'manager', 'property_manager')
        )
    )
  );

drop policy if exists documents_storage_insert_staff on storage.objects;
create policy documents_storage_insert_staff
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

drop policy if exists documents_storage_delete_staff on storage.objects;
create policy documents_storage_delete_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('admin', 'manager', 'property_manager')
    )
  );

notify pgrst, 'reload schema';
