-- Marker Ofek: Gantt resource engine (employees, vacations, assignments)

create table if not exists public.project_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  full_name text not null,
  profession text not null default '',
  hourly_cost numeric(12, 2) not null default 0,
  work_days int2[] not null default '{0,1,2,3,4}'::int2[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_resources_hourly_cost_nonneg_chk check (hourly_cost >= 0)
);

create index if not exists project_resources_project_id_idx
  on public.project_resources (project_id);

drop trigger if exists project_resources_updated_at on public.project_resources;
create trigger project_resources_updated_at
  before update on public.project_resources
  for each row
  execute function public.set_updated_at();

create table if not exists public.project_resource_vacations (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.project_resources (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_resource_vacations_date_order_chk check (start_date <= end_date)
);

create index if not exists project_resource_vacations_resource_id_idx
  on public.project_resource_vacations (resource_id);

drop trigger if exists project_resource_vacations_updated_at on public.project_resource_vacations;
create trigger project_resource_vacations_updated_at
  before update on public.project_resource_vacations
  for each row
  execute function public.set_updated_at();

create table if not exists public.task_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  resource_id uuid not null references public.project_resources (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, resource_id)
);

create index if not exists task_resource_assignments_resource_id_idx
  on public.task_resource_assignments (resource_id);
create index if not exists task_resource_assignments_project_id_idx
  on public.task_resource_assignments (project_id);

alter table public.project_resources enable row level security;
alter table public.project_resource_vacations enable row level security;
alter table public.task_resource_assignments enable row level security;

drop policy if exists project_resources_admin_all on public.project_resources;
drop policy if exists project_resource_vacations_admin_all on public.project_resource_vacations;
drop policy if exists task_resource_assignments_admin_all on public.task_resource_assignments;

create policy project_resources_admin_all
  on public.project_resources
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

create policy project_resource_vacations_admin_all
  on public.project_resource_vacations
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

create policy task_resource_assignments_admin_all
  on public.task_resource_assignments
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

grant select, insert, update, delete on public.project_resources to authenticated;
grant select, insert, update, delete on public.project_resource_vacations to authenticated;
grant select, insert, update, delete on public.task_resource_assignments to authenticated;

grant all on public.project_resources to service_role;
grant all on public.project_resource_vacations to service_role;
grant all on public.task_resource_assignments to service_role;
