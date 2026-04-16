-- Gantt module foundation table (construction schedule tasks)

create table if not exists public.gantt_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  phase text not null,
  start_date date null,
  end_date date null,
  progress integer not null default 0,
  status text not null default 'Not Started',
  dependencies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint gantt_tasks_progress_range_chk check (progress >= 0 and progress <= 100),
  constraint gantt_tasks_date_order_chk check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  constraint gantt_tasks_dependencies_array_chk check (jsonb_typeof(dependencies) = 'array')
);

create index if not exists gantt_tasks_project_id_idx
  on public.gantt_tasks (project_id);

create index if not exists gantt_tasks_phase_idx
  on public.gantt_tasks (phase);

create index if not exists gantt_tasks_start_date_idx
  on public.gantt_tasks (start_date);

create index if not exists gantt_tasks_end_date_idx
  on public.gantt_tasks (end_date);

create index if not exists gantt_tasks_dependencies_gin_idx
  on public.gantt_tasks using gin (dependencies);

alter table public.gantt_tasks enable row level security;

drop policy if exists gantt_tasks_select_scope on public.gantt_tasks;
create policy gantt_tasks_select_scope
  on public.gantt_tasks
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

drop policy if exists gantt_tasks_write_scope on public.gantt_tasks;
create policy gantt_tasks_write_scope
  on public.gantt_tasks
  for all
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id))
  with check (public.mo_user_can_edit_project_financials(project_id));

grant select, insert, update, delete on public.gantt_tasks to authenticated;
grant all on public.gantt_tasks to service_role;
