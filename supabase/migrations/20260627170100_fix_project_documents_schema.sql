-- Fix project_documents schema drift and align vault/security expectations.
-- Idempotent: safe to run on environments where some columns already exist.

alter table public.project_documents
  add column if not exists mime_type text;

alter table public.project_documents
  add column if not exists size bigint;

alter table public.project_documents
  add column if not exists company_id text;

update public.project_documents
set company_id = coalesce(company_id, 'default')
where company_id is null;

alter table public.project_documents
  alter column company_id set default 'default';

alter table public.project_documents
  alter column company_id set not null;

create index if not exists project_documents_company_project_idx
  on public.project_documents (company_id, project_id, created_at desc);

comment on column public.project_documents.mime_type is
  'MIME type for file rows; folders should use application/x-directory.';
comment on column public.project_documents.size is
  'File size in bytes (null for virtual folders).';
comment on column public.project_documents.company_id is
  'Tenant key. Derived from request header x-company-id when provided.';

alter table public.project_documents enable row level security;

drop policy if exists project_documents_authenticated_all on public.project_documents;

create policy project_documents_company_scoped_all
  on public.project_documents
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif(
        (current_setting('request.headers', true)::json ->> 'x-company-id'),
        ''
      ),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif(
        (current_setting('request.headers', true)::json ->> 'x-company-id'),
        ''
      ),
      company_id
    )
  );
