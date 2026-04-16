-- Multi-Gantt: one project can own multiple schedule boards (gantts); tasks are scoped per gantt.

create table if not exists public.gantts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists gantts_project_id_created_at_idx
  on public.gantts (project_id, created_at desc);

comment on table public.gantts is
  'MS Project–style Gantt boards per project (e.g. שלד, חשמל).';

alter table public.gantts enable row level security;

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

grant select, insert, update, delete on public.gantts to authenticated;
grant all on public.gantts to service_role;

-- Link tasks to a gantt (nullable during transition)
alter table public.gantt_tasks
  add column if not exists gantt_id uuid references public.gantts (id) on delete cascade;

-- Default gantt per project that already has tasks
insert into public.gantts (project_id, name, status)
select distinct t.project_id, 'לוח זמנים ראשי', 'active'
from public.gantt_tasks t
where not exists (
  select 1 from public.gantts g where g.project_id = t.project_id
);

update public.gantt_tasks t
set gantt_id = sub.id
from (
  select g.id, g.project_id
  from public.gantts g
  where g.name = 'לוח זמנים ראשי'
) sub
where t.project_id = sub.project_id
  and t.gantt_id is null;

-- Any remaining rows: attach to earliest gantt for that project
update public.gantt_tasks t
set gantt_id = (
  select g2.id
  from public.gantts g2
  where g2.project_id = t.project_id
  order by g2.created_at asc
  limit 1
)
where t.gantt_id is null;

do $$
begin
  if exists (select 1 from public.gantt_tasks where gantt_id is null) then
    raise exception 'Migration failed: gantt_tasks still has null gantt_id';
  end if;
end $$;

alter table public.gantt_tasks alter column gantt_id set not null;

create index if not exists gantt_tasks_gantt_id_idx
  on public.gantt_tasks (gantt_id);

-- Snapshots are per gantt schedule
alter table public.gantt_snapshots
  add column if not exists gantt_id uuid references public.gantts (id) on delete cascade;

-- Ensure a gantt exists for every project that only has snapshots (no tasks yet)
insert into public.gantts (project_id, name, status)
select distinct s.project_id, 'לוח זמנים ראשי', 'active'
from public.gantt_snapshots s
where not exists (
  select 1 from public.gantts g where g.project_id = s.project_id
);

update public.gantt_snapshots s
set gantt_id = (
  select g.id
  from public.gantts g
  where g.project_id = s.project_id
  order by g.created_at asc
  limit 1
)
where s.gantt_id is null;

do $$
begin
  if exists (select 1 from public.gantt_snapshots where gantt_id is null) then
    raise exception 'Migration failed: gantt_snapshots still has null gantt_id';
  end if;
end $$;

alter table public.gantt_snapshots alter column gantt_id set not null;

create index if not exists gantt_snapshots_gantt_id_created_at_idx
  on public.gantt_snapshots (gantt_id, created_at desc);
