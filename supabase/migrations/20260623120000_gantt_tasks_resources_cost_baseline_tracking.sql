-- Gantt tracking upgrade: resources, costs, baselines and actuals

alter table if exists public.gantt_tasks
  add column if not exists resources jsonb not null default '[]'::jsonb;

alter table if exists public.gantt_tasks
  add column if not exists cost numeric(14, 2) not null default 0;

alter table if exists public.gantt_tasks
  add column if not exists baseline_start timestamptz null;

alter table if exists public.gantt_tasks
  add column if not exists baseline_end timestamptz null;

alter table if exists public.gantt_tasks
  add column if not exists actual_start timestamptz null;

alter table if exists public.gantt_tasks
  add column if not exists actual_end timestamptz null;

alter table public.gantt_tasks
  drop constraint if exists gantt_tasks_cost_non_negative_chk;

alter table public.gantt_tasks
  add constraint gantt_tasks_cost_non_negative_chk
  check (cost >= 0);

alter table public.gantt_tasks
  drop constraint if exists gantt_tasks_resources_array_chk;

alter table public.gantt_tasks
  add constraint gantt_tasks_resources_array_chk
  check (jsonb_typeof(resources) = 'array');

create index if not exists gantt_tasks_baseline_start_idx
  on public.gantt_tasks (baseline_start);

create index if not exists gantt_tasks_baseline_end_idx
  on public.gantt_tasks (baseline_end);
