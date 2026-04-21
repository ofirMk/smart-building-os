-- ERP Projects & Control foundation (Medatech-style)
-- Multi-tenant by company_id on every table.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'erp_proj_project_status'
  ) then
    create type public.erp_proj_project_status as enum ('ACTIVE', 'COMPLETED', 'DRAFT');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'erp_proj_version_status'
  ) then
    create type public.erp_proj_version_status as enum ('DRAFT', 'APPROVED');
  end if;
end
$$;

create table if not exists public.erp_proj_projects (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_number text not null,
  name text not null,
  status public.erp_proj_project_status not null default 'DRAFT',
  start_date date null,
  end_date date null,
  project_manager_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_projects_number_nonempty check (length(trim(project_number)) > 0),
  constraint erp_proj_projects_name_nonempty check (length(trim(name)) > 0),
  constraint erp_proj_projects_date_order_chk check (end_date is null or start_date is null or end_date >= start_date)
);

create unique index if not exists erp_proj_projects_company_project_number_uq
  on public.erp_proj_projects (company_id, project_number);
create unique index if not exists erp_proj_projects_company_id_uq
  on public.erp_proj_projects (company_id, id);
create index if not exists erp_proj_projects_company_status_idx
  on public.erp_proj_projects (company_id, status);

drop trigger if exists erp_proj_projects_updated_at on public.erp_proj_projects;
create trigger erp_proj_projects_updated_at
  before update on public.erp_proj_projects
  for each row
  execute function public.set_updated_at();

create table if not exists public.erp_proj_planning_versions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  version_number integer not null,
  description text not null default '',
  is_base_version boolean not null default false,
  is_execution_version boolean not null default false,
  status public.erp_proj_version_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_planning_versions_version_number_chk check (version_number > 0),
  constraint erp_proj_planning_versions_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete cascade
);

create unique index if not exists erp_proj_planning_versions_company_project_version_uq
  on public.erp_proj_planning_versions (company_id, project_id, version_number);
create unique index if not exists erp_proj_planning_versions_company_id_uq
  on public.erp_proj_planning_versions (company_id, id);
create index if not exists erp_proj_planning_versions_company_project_idx
  on public.erp_proj_planning_versions (company_id, project_id);
create index if not exists erp_proj_planning_versions_company_status_idx
  on public.erp_proj_planning_versions (company_id, status);

drop trigger if exists erp_proj_planning_versions_updated_at on public.erp_proj_planning_versions;
create trigger erp_proj_planning_versions_updated_at
  before update on public.erp_proj_planning_versions
  for each row
  execute function public.set_updated_at();

create table if not exists public.erp_proj_boq_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  version_id uuid not null,
  section text not null,
  item_number text not null,
  description text not null,
  uom text not null,
  quantity numeric(18,3) not null,
  unit_price numeric(18,2) not null,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_proj_boq_lines_section_nonempty check (length(trim(section)) > 0),
  constraint erp_proj_boq_lines_item_number_nonempty check (length(trim(item_number)) > 0),
  constraint erp_proj_boq_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_proj_boq_lines_uom_nonempty check (length(trim(uom)) > 0),
  constraint erp_proj_boq_lines_quantity_nonnegative check (quantity >= 0),
  constraint erp_proj_boq_lines_unit_price_nonnegative check (unit_price >= 0),
  constraint erp_proj_boq_lines_company_version_fk
    foreign key (company_id, version_id)
    references public.erp_proj_planning_versions (company_id, id)
    on delete cascade
);

create index if not exists erp_proj_boq_lines_company_version_idx
  on public.erp_proj_boq_lines (company_id, version_id);
create unique index if not exists erp_proj_boq_lines_company_version_item_uq
  on public.erp_proj_boq_lines (company_id, version_id, section, item_number);

drop trigger if exists erp_proj_boq_lines_updated_at on public.erp_proj_boq_lines;
create trigger erp_proj_boq_lines_updated_at
  before update on public.erp_proj_boq_lines
  for each row
  execute function public.set_updated_at();

alter table public.erp_proj_projects enable row level security;
alter table public.erp_proj_planning_versions enable row level security;
alter table public.erp_proj_boq_lines enable row level security;

drop policy if exists erp_proj_projects_all_authenticated on public.erp_proj_projects;
create policy erp_proj_projects_all_authenticated
  on public.erp_proj_projects
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_proj_planning_versions_all_authenticated on public.erp_proj_planning_versions;
create policy erp_proj_planning_versions_all_authenticated
  on public.erp_proj_planning_versions
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists erp_proj_boq_lines_all_authenticated on public.erp_proj_boq_lines;
create policy erp_proj_boq_lines_all_authenticated
  on public.erp_proj_boq_lines
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.erp_proj_projects to authenticated;
grant select, insert, update, delete on public.erp_proj_planning_versions to authenticated;
grant select, insert, update, delete on public.erp_proj_boq_lines to authenticated;

grant all on public.erp_proj_projects to service_role;
grant all on public.erp_proj_planning_versions to service_role;
grant all on public.erp_proj_boq_lines to service_role;

