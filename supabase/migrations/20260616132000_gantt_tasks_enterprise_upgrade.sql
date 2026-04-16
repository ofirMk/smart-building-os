-- Gantt enterprise upgrade: hierarchy, milestones, schedule mode, rich dependencies, resources, constraints

alter table if exists public.gantt_tasks
  add column if not exists parent_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gantt_tasks_parent_fk'
  ) then
    alter table public.gantt_tasks
      add constraint gantt_tasks_parent_fk
      foreign key (parent_id)
      references public.gantt_tasks (id)
      on delete set null;
  end if;
end $$;

alter table if exists public.gantt_tasks
  add column if not exists is_milestone boolean not null default false;

alter table if exists public.gantt_tasks
  add column if not exists schedule_mode text not null default 'auto';

alter table if exists public.gantt_tasks
  add column if not exists resources jsonb not null default '[]'::jsonb;

alter table if exists public.gantt_tasks
  add column if not exists constraint_type text null;

alter table if exists public.gantt_tasks
  add column if not exists constraint_date date null;

-- Backfill legacy dependencies arrays of strings => [{ taskId, type, lag }]
update public.gantt_tasks gt
set dependencies = coalesce(
  (
    select jsonb_agg(
      jsonb_build_object(
        'taskId', dep_txt,
        'type', 'FS',
        'lag', 0
      )
    )
    from jsonb_array_elements_text(gt.dependencies) dep_txt
  ),
  '[]'::jsonb
)
where jsonb_typeof(gt.dependencies) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(gt.dependencies) dep
    where jsonb_typeof(dep) = 'string'
  );

alter table public.gantt_tasks
  drop constraint if exists gantt_tasks_schedule_mode_chk;

alter table public.gantt_tasks
  add constraint gantt_tasks_schedule_mode_chk
  check (schedule_mode in ('auto', 'manual'));

alter table public.gantt_tasks
  drop constraint if exists gantt_tasks_resources_array_chk;

alter table public.gantt_tasks
  add constraint gantt_tasks_resources_array_chk
  check (jsonb_typeof(resources) = 'array');

-- Keep dependencies as json array; app layer validates object shape.
alter table public.gantt_tasks
  drop constraint if exists gantt_tasks_dependencies_array_chk;

alter table public.gantt_tasks
  add constraint gantt_tasks_dependencies_array_chk
  check (jsonb_typeof(dependencies) = 'array');

create index if not exists gantt_tasks_parent_id_idx
  on public.gantt_tasks (parent_id);

create index if not exists gantt_tasks_schedule_mode_idx
  on public.gantt_tasks (schedule_mode);

create index if not exists gantt_tasks_constraint_date_idx
  on public.gantt_tasks (constraint_date);
