-- Marker Ofek: Work Management & Gantt infrastructure

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid null references public.tasks (id) on delete set null,
  name text not null,
  description text null,
  start_date date null,
  end_date date null,
  actual_start_date date null,
  actual_end_date date null,
  progress numeric(5, 2) not null default 0,
  dependency_ids uuid[] not null default '{}'::uuid[],
  estimated_cost numeric(14, 2) not null default 0,
  actual_cost numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_progress_range_chk check (progress >= 0 and progress <= 100),
  constraint tasks_cost_nonneg_chk check (estimated_cost >= 0 and actual_cost >= 0),
  constraint tasks_planned_date_order_chk check (
    start_date is null or end_date is null or start_date <= end_date
  ),
  constraint tasks_actual_date_order_chk check (
    actual_start_date is null or actual_end_date is null or actual_start_date <= actual_end_date
  )
);

create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_parent_id_idx on public.tasks (parent_id);
create index if not exists tasks_start_date_idx on public.tasks (start_date);
create index if not exists tasks_end_date_idx on public.tasks (end_date);
create index if not exists tasks_dependency_ids_gin_idx on public.tasks using gin (dependency_ids);

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

create table if not exists public.task_resources (
  task_id uuid not null references public.tasks (id) on delete cascade,
  item_id uuid not null references public.items_catalog (id) on delete restrict,
  quantity_estimated numeric(14, 3) not null default 0,
  quantity_actual numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, item_id),
  constraint task_resources_qty_nonneg_chk check (
    quantity_estimated >= 0 and quantity_actual >= 0
  )
);

create index if not exists task_resources_item_id_idx on public.task_resources (item_id);

drop trigger if exists task_resources_updated_at on public.task_resources;
create trigger task_resources_updated_at
  before update on public.task_resources
  for each row
  execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.task_resources enable row level security;

drop policy if exists tasks_admin_all on public.tasks;
drop policy if exists task_resources_admin_all on public.task_resources;

create policy tasks_admin_all
  on public.tasks
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy task_resources_admin_all
  on public.task_resources
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_resources to authenticated;
grant all on public.tasks to service_role;
grant all on public.task_resources to service_role;
