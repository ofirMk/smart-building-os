-- Optional denormalized WBS code for display / exports (e.g. 1.2.3). Hierarchy remains parent_id + wbs_order + level.
alter table public.tasks
  add column if not exists wbs_code text null;

create index if not exists tasks_project_id_wbs_code_idx
  on public.tasks (project_id)
  where wbs_code is not null;

comment on column public.tasks.wbs_code is 'Optional display code (e.g. 1.2.3); may be synced from WBS tree for UI/CSV.';
