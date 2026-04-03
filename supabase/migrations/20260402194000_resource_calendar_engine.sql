-- Marker Ofek: Resource & Calendar Engine (global resources + task links)

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  profession text not null default '',
  cost_per_day numeric(12, 2) not null default 0,
  availability_status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_cost_per_day_nonneg_chk check (cost_per_day >= 0),
  constraint resources_availability_status_chk check (
    availability_status in ('available', 'unavailable', 'vacation')
  )
);

create index if not exists resources_name_idx on public.resources (name);
create index if not exists resources_availability_status_idx
  on public.resources (availability_status);

drop trigger if exists resources_updated_at on public.resources;
create trigger resources_updated_at
  before update on public.resources
  for each row
  execute function public.set_updated_at();

-- Bootstrap from existing project_resources while preserving resource IDs.
insert into public.resources (
  id,
  name,
  profession,
  cost_per_day,
  availability_status,
  created_at,
  updated_at
)
select
  pr.id,
  pr.full_name,
  coalesce(pr.profession, ''),
  round(coalesce(pr.hourly_cost, 0) * 8, 2),
  case when coalesce(pr.is_active, true) then 'available' else 'unavailable' end,
  coalesce(pr.created_at, now()),
  coalesce(pr.updated_at, now())
from public.project_resources pr
on conflict (id) do update
set
  name = excluded.name,
  profession = excluded.profession,
  cost_per_day = excluded.cost_per_day,
  availability_status = excluded.availability_status;

-- Rewire existing relation tables to the new resources table.
alter table if exists public.task_resource_assignments
  drop constraint if exists task_resource_assignments_resource_id_fkey;
alter table if exists public.task_resource_assignments
  add constraint task_resource_assignments_resource_id_fkey
  foreign key (resource_id) references public.resources (id) on delete cascade;

alter table if exists public.project_resource_vacations
  drop constraint if exists project_resource_vacations_resource_id_fkey;
alter table if exists public.project_resource_vacations
  add constraint project_resource_vacations_resource_id_fkey
  foreign key (resource_id) references public.resources (id) on delete cascade;

alter table public.resources enable row level security;

drop policy if exists resources_admin_all on public.resources;
create policy resources_admin_all
  on public.resources
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

grant select, insert, update, delete on public.resources to authenticated;
grant all on public.resources to service_role;
