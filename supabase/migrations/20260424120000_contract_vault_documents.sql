-- כספת מסמכי חוזה: מטא-דאטה, טקסט לחיפוש, embedding לעוזר AI.
-- דורש: mo_user_can_access_project, mo_user_can_edit_project_financials (מיגרציות קודמות).

create extension if not exists vector;

create type public.mo_contract_vault_sensitive_level as enum (
  'standard',
  'confidential',
  'restricted'
);

create type public.mo_contract_vault_ingest_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

create table if not exists public.mo_contract_vault_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  sensitive_level public.mo_contract_vault_sensitive_level not null default 'standard',
  viewer_admin boolean not null default false,
  viewer_manager boolean not null default false,
  viewer_partner boolean not null default false,
  ingest_status public.mo_contract_vault_ingest_status not null default 'pending',
  ocr_text text null,
  embedding vector(768) null,
  ingest_error text null,
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mo_contract_vault_viewers_chk check (
    viewer_admin or viewer_manager or viewer_partner
  )
);

create index if not exists mo_contract_vault_project_created_idx
  on public.mo_contract_vault_documents (project_id, created_at desc);

create index if not exists mo_contract_vault_ingest_status_idx
  on public.mo_contract_vault_documents (ingest_status)
  where ingest_status <> 'ready';

comment on table public.mo_contract_vault_documents is
  'מסמכי חוזה בכספת — הרשאות צפייה לפי דגלים, טקסט ווקטור ל-AI.';

-- ---------------------------------------------------------------------------
-- מי רשאי לקרוא שורה (לפי בחירת המעלה)
-- ---------------------------------------------------------------------------
create or replace function public.mo_contract_vault_row_readable(
  p_doc public.mo_contract_vault_documents
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.mo_user_can_access_project(p_doc.project_id)
    and (
      (
        p_doc.viewer_admin
        and exists (
          select 1
          from public.profiles pr
          where pr.id = auth.uid()
            and (
              pr.role = 'admin'
              or pr.marker_ofek_full_project_access = true
            )
        )
      )
      or (
        p_doc.viewer_manager
        and public.mo_user_can_edit_project_financials(p_doc.project_id)
      )
      or (
        p_doc.viewer_partner
        and public.mo_user_can_access_project(p_doc.project_id)
      )
    );
$$;

grant execute on function public.mo_contract_vault_row_readable(
  public.mo_contract_vault_documents
) to authenticated;

alter table public.mo_contract_vault_documents enable row level security;

drop policy if exists mo_contract_vault_select on public.mo_contract_vault_documents;
create policy mo_contract_vault_select
  on public.mo_contract_vault_documents
  for select
  to authenticated
  using (public.mo_contract_vault_row_readable(mo_contract_vault_documents));

drop policy if exists mo_contract_vault_insert on public.mo_contract_vault_documents;
create policy mo_contract_vault_insert
  on public.mo_contract_vault_documents
  for insert
  to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.mo_user_can_edit_project_financials(project_id)
    and (viewer_admin or viewer_manager or viewer_partner)
  );

drop policy if exists mo_contract_vault_update on public.mo_contract_vault_documents;
create policy mo_contract_vault_update
  on public.mo_contract_vault_documents
  for update
  to authenticated
  using (
    uploaded_by = auth.uid()
    or public.mo_contract_vault_row_readable(mo_contract_vault_documents)
  )
  with check (
    uploaded_by = auth.uid()
    or public.mo_contract_vault_row_readable(mo_contract_vault_documents)
  );

grant select, insert, update on public.mo_contract_vault_documents to authenticated;
grant all on public.mo_contract_vault_documents to service_role;

-- ---------------------------------------------------------------------------
-- חיפוש וקטורי לעוזר AI (לפי פרויקט)
-- ---------------------------------------------------------------------------
create or replace function public.match_contract_vault_documents(
  p_project_id uuid,
  query_embedding vector(768),
  match_count int default 6
)
returns table (
  id uuid,
  file_name text,
  ocr_excerpt text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    d.file_name,
    left(coalesce(d.ocr_text, ''), 900) as ocr_excerpt,
    (1 - (d.embedding <=> query_embedding))::double precision as similarity
  from public.mo_contract_vault_documents d
  where d.project_id = p_project_id
    and d.embedding is not null
    and d.ingest_status = 'ready'
    and public.mo_contract_vault_row_readable(d)
  order by d.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

comment on function public.match_contract_vault_documents(uuid, vector, int) is
  'RAG: מקטעים מכספת החוזה לפי דמיון קוסינוס — רק מסמכים שהמשתמש רשאי לראות.';

grant execute on function public.match_contract_vault_documents(uuid, vector, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket (פרטי)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('mo-contract-vault', 'mo-contract-vault', false)
on conflict (id) do nothing;

drop policy if exists mo_contract_vault_storage_select on storage.objects;
create policy mo_contract_vault_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'mo-contract-vault'
    and public.mo_user_can_access_project(
      (split_part(name, '/', 1))::uuid
    )
  );

drop policy if exists mo_contract_vault_storage_insert on storage.objects;
create policy mo_contract_vault_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'mo-contract-vault'
    and public.mo_user_can_edit_project_financials(
      (split_part(name, '/', 1))::uuid
    )
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  );

drop policy if exists mo_contract_vault_storage_delete on storage.objects;
create policy mo_contract_vault_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'mo-contract-vault'
    and public.mo_user_can_edit_project_financials(
      (split_part(name, '/', 1))::uuid
    )
  );
