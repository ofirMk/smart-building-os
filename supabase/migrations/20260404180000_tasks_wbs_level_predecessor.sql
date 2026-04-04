-- WBS engine: outline level, predecessor row index, stable predecessor FK, sibling order

alter table public.tasks
  add column if not exists level integer not null default 0;

alter table public.tasks
  add column if not exists predecessor_index integer null;

alter table public.tasks
  add column if not exists predecessor_task_id uuid null references public.tasks (id) on delete set null;

alter table public.tasks
  add column if not exists wbs_order integer not null default 0;

alter table public.tasks drop constraint if exists tasks_level_nonneg_chk;
alter table public.tasks
  add constraint tasks_level_nonneg_chk check (level >= 0);

alter table public.tasks drop constraint if exists tasks_predecessor_index_chk;
alter table public.tasks
  add constraint tasks_predecessor_index_chk check (predecessor_index is null or predecessor_index >= 1);

create index if not exists tasks_predecessor_task_id_idx on public.tasks (predecessor_task_id);
create index if not exists tasks_project_wbs_order_idx on public.tasks (project_id, parent_id, wbs_order);

comment on column public.tasks.level is 'WBS outline depth (0 = root)';
comment on column public.tasks.predecessor_index is '1-based row# of FS predecessor in canonical flat WBS (optional, synced with predecessor_task_id)';
comment on column public.tasks.predecessor_task_id is 'Finish-to-start predecessor task';
comment on column public.tasks.wbs_order is 'Sibling sort order within same parent';
