-- Marker Ofek — Profit center: projects ↔ tender, project document vault
-- Mirror of supabase/migrations/20260327240000_projects_profit_center.sql
-- Apply after: marker_ofek_tender_intake.sql, marker_ofek_contracts_schema.sql, marker_ofek_data_integrity.sql

alter table public.projects
  add column if not exists client_name text,
  add column if not exists tender_id uuid references public.tenders (id) on delete set null;

create index if not exists projects_tender_id_idx on public.projects (tender_id);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text,
  file_path text not null,
  document_kind text,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists project_documents_project_id_idx
  on public.project_documents (project_id);

alter table public.project_documents enable row level security;

drop policy if exists project_documents_admin_all on public.project_documents;
create policy project_documents_admin_all
  on public.project_documents
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.project_documents to authenticated;
grant all on public.project_documents to service_role;

insert into storage.buckets (id, name, public)
values ('project_documents', 'project_documents', false)
on conflict (id) do nothing;

drop policy if exists project_documents_storage_admin_insert on storage.objects;
create policy project_documents_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists project_documents_storage_admin_select on storage.objects;
create policy project_documents_storage_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists project_documents_storage_admin_update on storage.objects;
create policy project_documents_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'project_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists project_documents_storage_admin_delete on storage.objects;
create policy project_documents_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project_documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
