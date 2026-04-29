-- Execution & QA canonical checklist table
-- Ensures required entity names from spec: exec_daily_logs, exec_defects, exec_checklists.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'exec_form_category'
  ) then
    create type public.exec_form_category as enum ('QA', 'SAFETY');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'exec_checklist_status'
  ) then
    create type public.exec_checklist_status as enum ('OPEN', 'IN_PROGRESS', 'DONE');
  end if;
end
$$;

create table if not exists public.exec_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  checklist_number text not null,
  category public.exec_form_category not null,
  title text not null,
  status public.exec_checklist_status not null default 'OPEN',
  checklist_date date not null default current_date,
  score_percent numeric(7,3) null,
  notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exec_checklists_number_nonempty check (length(trim(checklist_number)) > 0),
  constraint exec_checklists_title_nonempty check (length(trim(title)) > 0),
  constraint exec_checklists_score_range check (
    score_percent is null or (score_percent >= 0 and score_percent <= 100)
  )
);

create unique index if not exists exec_checklists_company_number_uq
  on public.exec_checklists (company_id, checklist_number);
create index if not exists exec_checklists_company_project_category_date_idx
  on public.exec_checklists (company_id, project_id, category, checklist_date desc);
create index if not exists exec_checklists_company_status_idx
  on public.exec_checklists (company_id, status, checklist_date desc);

drop trigger if exists exec_checklists_updated_at on public.exec_checklists;
create trigger exec_checklists_updated_at
  before update on public.exec_checklists
  for each row
  execute function public.set_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'exec_qa_safety_forms'
  ) then
    insert into public.exec_checklists (
      company_id,
      project_id,
      checklist_number,
      category,
      title,
      status,
      checklist_date,
      score_percent,
      notes,
      created_by,
      created_at,
      updated_at
    )
    select
      legacy.company_id,
      legacy.project_id,
      'LEGACY-' || left(legacy.id::text, 8),
      legacy.category,
      coalesce(nullif(trim(legacy.phase_ref), ''), 'Legacy checklist'),
      case
        when coalesce(legacy.score_percent, 0) >= 90 then 'DONE'::public.exec_checklist_status
        when coalesce(legacy.score_percent, 0) >= 75 then 'IN_PROGRESS'::public.exec_checklist_status
        else 'OPEN'::public.exec_checklist_status
      end,
      legacy.form_date,
      legacy.score_percent,
      legacy.notes,
      legacy.created_by,
      legacy.created_at,
      legacy.updated_at
    from public.exec_qa_safety_forms as legacy
    on conflict (company_id, checklist_number) do nothing;
  end if;
end
$$;

alter table public.exec_checklists enable row level security;

drop policy if exists exec_checklists_all_authenticated on public.exec_checklists;
create policy exec_checklists_all_authenticated
  on public.exec_checklists
  for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.exec_checklists to authenticated;
