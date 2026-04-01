-- Marker Ofek — Module 1.1 קליטת חומרי מכרז (Tender materials intake)
-- tenders + tender_documents; RLS: admin; storage bucket tender-documents

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_tender_document_status') then
    create type public.mo_tender_document_status as enum (
      'to_execution',
      'for_review',
      'for_tender'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_tender_document_type') then
    create type public.mo_tender_document_type as enum (
      'boq',
      'tech_spec',
      'sale_spec',
      'drawing_electrical',
      'drawing_general'
    );
  end if;
end
$$;

create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  project_name_from_ai text,
  tender_date_target date,
  consultant_name_from_ai text,
  building_structure_raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tender_documents (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  ai_inferred_name text,
  ai_inferred_date date,
  status public.mo_tender_document_status not null default 'for_review',
  floors_data jsonb not null default '{"labels":[]}'::jsonb,
  document_type public.mo_tender_document_type not null default 'tech_spec',
  tags text[] not null default '{}'::text[]
);

create index if not exists tender_documents_tender_id_idx
  on public.tender_documents (tender_id);

drop trigger if exists tenders_updated_at on public.tenders;
create trigger tenders_updated_at
  before update on public.tenders
  for each row
  execute function public.set_updated_at();

alter table public.tenders enable row level security;
alter table public.tender_documents enable row level security;

drop policy if exists tenders_admin_all on public.tenders;
create policy tenders_admin_all
  on public.tenders
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

drop policy if exists tender_documents_admin_all on public.tender_documents;
create policy tender_documents_admin_all
  on public.tender_documents
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

grant select, insert, update, delete on public.tenders to authenticated;
grant select, insert, update, delete on public.tender_documents to authenticated;
grant all on public.tenders to service_role;
grant all on public.tender_documents to service_role;

-- Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('tender-documents', 'tender-documents', false)
on conflict (id) do nothing;

drop policy if exists tender_documents_storage_admin_insert on storage.objects;
create policy tender_documents_storage_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tender-documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_storage_admin_select on storage.objects;
create policy tender_documents_storage_admin_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tender-documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_storage_admin_update on storage.objects;
create policy tender_documents_storage_admin_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tender-documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

drop policy if exists tender_documents_storage_admin_delete on storage.objects;
create policy tender_documents_storage_admin_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tender-documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
