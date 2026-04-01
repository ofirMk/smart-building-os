-- כספת מסמכים + אחסון ב-bucket documents

create type public.document_type as enum (
  'lease',
  'warranty',
  'building_plans',
  'general'
);

create type public.document_related_to as enum (
  'tenant',
  'vendor',
  'building',
  'general'
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  document_type public.document_type not null,
  related_to public.document_related_to not null,
  file_url text not null,
  storage_path text not null,
  file_name text,
  content_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_created_at_idx on public.documents (created_at desc);

create trigger documents_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at ();

alter table public.documents enable row level security;

create policy "anon_select_documents_dashboard"
on public.documents
for select
to anon
using (true);

create policy "anon_insert_documents_dashboard"
on public.documents
for insert
to anon
with check (true);

-- Bucket לאחסון (ציבורי ל-public URL)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "anon_insert_storage_documents" on storage.objects;
drop policy if exists "anon_select_storage_documents" on storage.objects;
drop policy if exists "anon_delete_storage_documents" on storage.objects;

create policy "anon_insert_storage_documents"
on storage.objects
for insert
to anon
with check (bucket_id = 'documents');

create policy "anon_select_storage_documents"
on storage.objects
for select
to anon
using (bucket_id = 'documents');

create policy "anon_delete_storage_documents"
on storage.objects
for delete
to anon
using (bucket_id = 'documents');
