-- REPAIR: project_documents is missing created_at column.
-- Migration 20260627170100 creates an index on (company_id, project_id, created_at desc)
-- but the table was originally created with uploaded_at instead of created_at.

alter table public.project_documents
  add column if not exists created_at timestamptz not null default now();

update public.project_documents
set created_at = coalesce(uploaded_at, updated_at, now())
where created_at = now() and (uploaded_at is not null or updated_at is not null);
