-- Gantt: task notes (claims / delay documentation) + project schedule snapshots (versioning)

alter table public.gantt_tasks
  add column notes text null;

comment on column public.gantt_tasks.notes is
  'Free-text task notes (e.g. delay reasons, claims protection).';

create table if not exists public.gantt_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  snapshot_name text not null,
  snapshot_type text not null,
  tasks_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint gantt_snapshots_type_chk check (
    snapshot_type in ('UPDATE', 'RECOVERY', 'CHANGE_ORDER')
  ),
  constraint gantt_snapshots_tasks_data_object_chk check (jsonb_typeof(tasks_data) = 'array')
);

create index if not exists gantt_snapshots_project_id_created_at_idx
  on public.gantt_snapshots (project_id, created_at desc);

comment on table public.gantt_snapshots is
  'Frozen Gantt task arrays for schedule versioning (replaces ad-hoc MS Project Save-As).';

alter table public.gantt_snapshots enable row level security;

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

grant select, insert, update, delete on public.gantt_snapshots to authenticated;
grant all on public.gantt_snapshots to service_role;
