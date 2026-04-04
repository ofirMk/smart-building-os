-- Marker Ofek — הערות הקשר (project_comments)
-- דורש: public.projects, public.profiles, public.user_role
-- הרצה אחרי marker_ofek_contracts_schema.sql

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum — הקשר ההערה
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mo_comment_context') then
    create type public.mo_comment_context as enum (
      'contract_item',
      'po_line',
      'general'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- טבלה
-- ---------------------------------------------------------------------------

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  context_type public.mo_comment_context not null,
  context_id uuid,
  context_label text,
  message text not null,
  created_at timestamptz not null default now(),
  constraint project_comments_context_consistency check (
    (context_type = 'general'::public.mo_comment_context and context_id is null)
    or (
      context_type <> 'general'::public.mo_comment_context
      and context_id is not null
    )
  )
);

create index if not exists project_comments_project_idx
  on public.project_comments (project_id);

create index if not exists project_comments_context_lookup_idx
  on public.project_comments (project_id, context_type, context_id);

create index if not exists project_comments_created_idx
  on public.project_comments (created_at desc);

comment on table public.project_comments is 'הערות פנימיות לפי פרויקט (סעיף חוזה, שורת רכש, או כללי)';
comment on column public.project_comments.context_label is
  'תווית לתצוגה (סעיף BoQ, שורת PO) — למרכז התראות';

-- ---------------------------------------------------------------------------
-- RLS — מנהל בלבד (עקב שאר מודול מרקר אופק)
-- ---------------------------------------------------------------------------

alter table public.project_comments enable row level security;

drop policy if exists project_comments_admin_all on public.project_comments;
drop policy if exists project_comments_select_admin on public.project_comments;
drop policy if exists project_comments_insert_admin on public.project_comments;

create policy project_comments_select_admin
  on public.project_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy project_comments_insert_admin
  on public.project_comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );
