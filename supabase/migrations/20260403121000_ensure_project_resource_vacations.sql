-- Hotfix: ensure resource vacations table exists in environments that missed prior migrations.

create table if not exists public.project_resource_vacations (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
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

alter table public.project_resource_vacations enable row level security;

drop policy if exists project_resource_vacations_admin_all on public.project_resource_vacations;
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

grant select, insert, update, delete on public.project_resource_vacations to authenticated;
grant all on public.project_resource_vacations to service_role;
