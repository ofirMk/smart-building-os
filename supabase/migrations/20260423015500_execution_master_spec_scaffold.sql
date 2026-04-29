-- Execution & QA scaffold from Master Spec (Daily Logs, QA/Safety forms, Defects tickets)
-- Scope: daily field reporting, quality/safety checklists, and defect lifecycle closure with subcontractor assignment.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'exec_defect_status'
  ) then
    create type public.exec_defect_status as enum ('OPEN', 'IN_PROGRESS', 'FIXED', 'REJECTED');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'exec_form_category'
  ) then
    create type public.exec_form_category as enum ('QA', 'SAFETY');
  end if;
end
$$;

create table if not exists public.exec_daily_logs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  log_date date not null,
  weather_summary text null,
  engineering_equipment_summary text null,
  progress_summary text null,
  safety_notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exec_daily_logs_weather_nonempty check (
    weather_summary is null or length(trim(weather_summary)) > 0
  )
);

create unique index if not exists exec_daily_logs_company_project_date_uq
  on public.exec_daily_logs (company_id, project_id, log_date);
create index if not exists exec_daily_logs_company_date_idx
  on public.exec_daily_logs (company_id, log_date desc);

drop trigger if exists exec_daily_logs_updated_at on public.exec_daily_logs;
create trigger exec_daily_logs_updated_at
  before update on public.exec_daily_logs
  for each row
  execute function public.set_updated_at();

create table if not exists public.exec_daily_log_workforce_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  daily_log_id uuid not null references public.exec_daily_logs (id) on delete cascade,
  business_partner_id uuid null references public.erp_master_business_partners (id) on delete set null,
  role_label text null,
  workers_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exec_daily_log_workforce_count_nonnegative check (workers_count >= 0)
);

create index if not exists exec_daily_log_workforce_company_log_idx
  on public.exec_daily_log_workforce_lines (company_id, daily_log_id);

drop trigger if exists exec_daily_log_workforce_lines_updated_at on public.exec_daily_log_workforce_lines;
create trigger exec_daily_log_workforce_lines_updated_at
  before update on public.exec_daily_log_workforce_lines
  for each row
  execute function public.set_updated_at();

create table if not exists public.exec_qa_safety_forms (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  category public.exec_form_category not null,
  phase_ref text null,
  form_date date not null default current_date,
  score_percent numeric(7,3) null,
  notes text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exec_qa_safety_forms_score_range check (
    score_percent is null or (score_percent >= 0 and score_percent <= 100)
  )
);

create index if not exists exec_qa_safety_forms_company_project_idx
  on public.exec_qa_safety_forms (company_id, project_id, category, form_date desc);

drop trigger if exists exec_qa_safety_forms_updated_at on public.exec_qa_safety_forms;
create trigger exec_qa_safety_forms_updated_at
  before update on public.exec_qa_safety_forms
  for each row
  execute function public.set_updated_at();

create table if not exists public.exec_defects (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  defect_number text not null,
  title text not null,
  description text null,
  status public.exec_defect_status not null default 'OPEN',
  assigned_business_partner_id uuid null references public.erp_master_business_partners (id) on delete set null,
  opened_by uuid null references auth.users (id) on delete set null,
  opened_at timestamptz not null default now(),
  due_date date null,
  fixed_at timestamptz null,
  rejected_reason text null,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exec_defects_number_nonempty check (length(trim(defect_number)) > 0),
  constraint exec_defects_title_nonempty check (length(trim(title)) > 0)
);

create unique index if not exists exec_defects_company_number_uq
  on public.exec_defects (company_id, defect_number);
create index if not exists exec_defects_company_status_due_idx
  on public.exec_defects (company_id, status, due_date);
create index if not exists exec_defects_company_project_idx
  on public.exec_defects (company_id, project_id, opened_at desc);

drop trigger if exists exec_defects_updated_at on public.exec_defects;
create trigger exec_defects_updated_at
  before update on public.exec_defects
  for each row
  execute function public.set_updated_at();

create table if not exists public.exec_defect_activity (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  defect_id uuid not null references public.exec_defects (id) on delete cascade,
  from_status public.exec_defect_status null,
  to_status public.exec_defect_status null,
  comment text null,
  attachment_urls jsonb not null default '[]'::jsonb,
  actor_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists exec_defect_activity_company_defect_idx
  on public.exec_defect_activity (company_id, defect_id, created_at desc);

alter table public.exec_daily_logs enable row level security;
alter table public.exec_daily_log_workforce_lines enable row level security;
alter table public.exec_qa_safety_forms enable row level security;
alter table public.exec_defects enable row level security;
alter table public.exec_defect_activity enable row level security;

drop policy if exists exec_daily_logs_all_authenticated on public.exec_daily_logs;
create policy exec_daily_logs_all_authenticated
  on public.exec_daily_logs
  for all to authenticated
  using (true) with check (true);

drop policy if exists exec_daily_log_workforce_lines_all_authenticated on public.exec_daily_log_workforce_lines;
create policy exec_daily_log_workforce_lines_all_authenticated
  on public.exec_daily_log_workforce_lines
  for all to authenticated
  using (true) with check (true);

drop policy if exists exec_qa_safety_forms_all_authenticated on public.exec_qa_safety_forms;
create policy exec_qa_safety_forms_all_authenticated
  on public.exec_qa_safety_forms
  for all to authenticated
  using (true) with check (true);

drop policy if exists exec_defects_all_authenticated on public.exec_defects;
create policy exec_defects_all_authenticated
  on public.exec_defects
  for all to authenticated
  using (true) with check (true);

drop policy if exists exec_defect_activity_all_authenticated on public.exec_defect_activity;
create policy exec_defect_activity_all_authenticated
  on public.exec_defect_activity
  for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.exec_daily_logs to authenticated;
grant select, insert, update, delete on public.exec_daily_log_workforce_lines to authenticated;
grant select, insert, update, delete on public.exec_qa_safety_forms to authenticated;
grant select, insert, update, delete on public.exec_defects to authenticated;
grant select, insert, update, delete on public.exec_defect_activity to authenticated;
