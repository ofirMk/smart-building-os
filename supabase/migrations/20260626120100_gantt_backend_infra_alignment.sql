-- Align Gantt backend infrastructure with MS Project clone contract:
-- - ensure gantts + gantt_snapshots core shape
-- - extend gantt_tasks with gantt_id/cost/resources/notes/baselines

create table if not exists public.gantts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table if exists public.gantts
  add column if not exists project_id uuid references public.projects (id) on delete cascade;
alter table if exists public.gantts
  add column if not exists name text;
alter table if exists public.gantts
  add column if not exists status text not null default 'active';
alter table if exists public.gantts
  add column if not exists created_at timestamptz not null default now();

create index if not exists gantts_project_id_created_at_idx
  on public.gantts (project_id, created_at desc);

alter table if exists public.gantt_tasks
  add column if not exists gantt_id uuid references public.gantts (id) on delete cascade;

alter table if exists public.gantt_tasks
  add column if not exists cost numeric(14, 2) not null default 0;

alter table public.gantt_tasks
  drop column if exists resources;

alter table public.gantt_tasks
  add column if not exists resources text;

alter table if exists public.gantt_tasks
  add column if not exists notes text;

alter table if exists public.gantt_tasks
  add column if not exists baseline_start timestamptz;

alter table if exists public.gantt_tasks
  add column if not exists baseline_end timestamptz;

alter table if exists public.gantt_tasks
  drop constraint if exists gantt_tasks_cost_non_negative_chk;

alter table if exists public.gantt_tasks
  add constraint gantt_tasks_cost_non_negative_chk check (cost >= 0);

create index if not exists gantt_tasks_gantt_id_idx
  on public.gantt_tasks (gantt_id);

create table if not exists public.gantt_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type text not null,
  tasks_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table if exists public.gantt_snapshots
  add column if not exists project_id uuid references public.projects (id) on delete cascade;
alter table if exists public.gantt_snapshots
  add column if not exists name text;
alter table if exists public.gantt_snapshots
  add column if not exists type text;
alter table if exists public.gantt_snapshots
  add column if not exists tasks_data jsonb;
alter table if exists public.gantt_snapshots
  add column if not exists created_at timestamptz not null default now();

-- Backward-compatible aliases for existing app callers.
alter table if exists public.gantt_snapshots
  add column if not exists snapshot_name text;
alter table if exists public.gantt_snapshots
  add column if not exists snapshot_type text;

update public.gantt_snapshots
set
  name = coalesce(nullif(name, ''), nullif(snapshot_name, ''), 'Snapshot'),
  type = coalesce(nullif(type, ''), nullif(snapshot_type, ''), 'UPDATE')
where
  name is null or name = '' or type is null or type = '';

update public.gantt_snapshots
set
  snapshot_name = coalesce(nullif(snapshot_name, ''), name),
  snapshot_type = coalesce(nullif(snapshot_type, ''), type)
where
  snapshot_name is null or snapshot_name = '' or snapshot_type is null or snapshot_type = '';

alter table if exists public.gantt_snapshots
  alter column name set not null;
alter table if exists public.gantt_snapshots
  alter column type set not null;

alter table if exists public.gantt_snapshots
  drop constraint if exists gantt_snapshots_type_chk;

alter table if exists public.gantt_snapshots
  add constraint gantt_snapshots_type_chk check (type in ('UPDATE', 'RECOVERY', 'CHANGE_ORDER'));

alter table if exists public.gantt_snapshots
  drop constraint if exists gantt_snapshots_tasks_data_object_chk;

alter table if exists public.gantt_snapshots
  add constraint gantt_snapshots_tasks_data_object_chk check (jsonb_typeof(tasks_data) = 'array');

create index if not exists gantt_snapshots_project_id_created_at_idx
  on public.gantt_snapshots (project_id, created_at desc);

alter table if exists public.gantts enable row level security;
alter table if exists public.gantt_snapshots enable row level security;

drop policy if exists gantts_select_scope on public.gantts;
create policy gantts_select_scope
  on public.gantts
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

drop policy if exists gantts_write_scope on public.gantts;
create policy gantts_write_scope
  on public.gantts
  for all
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id))
  with check (public.mo_user_can_edit_project_financials(project_id));

drop policy if exists gantt_snapshots_select_scope on public.gantt_snapshots;
create policy gantt_snapshots_select_scope
  on public.gantt_snapshots
  for select
  to authenticated
  using (public.mo_user_can_access_project(project_id));

drop policy if exists gantt_snapshots_write_scope on public.gantt_snapshots;
create policy gantt_snapshots_write_scope
  on public.gantt_snapshots
  for all
  to authenticated
  using (public.mo_user_can_edit_project_financials(project_id))
  with check (public.mo_user_can_edit_project_financials(project_id));

grant select, insert, update, delete on public.gantts to authenticated;
grant all on public.gantts to service_role;
grant select, insert, update, delete on public.gantt_snapshots to authenticated;
grant all on public.gantt_snapshots to service_role;
