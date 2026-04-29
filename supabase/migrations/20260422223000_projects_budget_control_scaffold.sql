-- Projects & Budget Control scaffold (Master Spec ingestion bootstrap)
-- Scope: full project lifecycle from planning/BOQ to monthly control cycle.

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'pbc_project_type'
  ) then
    create type public.pbc_project_type as enum ('RESIDENTIAL', 'COMMERCIAL', 'INFRA', 'OTHER');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'pbc_version_status'
  ) then
    create type public.pbc_version_status as enum ('DRAFT', 'LOCKED');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'pbc_version_kind'
  ) then
    create type public.pbc_version_kind as enum ('TENDER', 'ZERO', 'EXECUTION');
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'pbc_resource_type'
  ) then
    create type public.pbc_resource_type as enum (
      'SUBCONTRACTOR',
      'MATERIAL',
      'EQUIPMENT',
      'SITE_MANAGER',
      'OTHER'
    );
  end if;

  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'pbc_actual_source_type'
  ) then
    create type public.pbc_actual_source_type as enum (
      'PURCHASE_INVOICE',
      'GOODS_RECEIPT',
      'SUBCONTRACTOR_BILL',
      'MANUAL'
    );
  end if;
end
$$;

create table if not exists public.pbc_projects (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_code text not null,
  name text not null,
  client_name text null,
  project_manager_name text null,
  project_type public.pbc_project_type not null default 'OTHER',
  planned_start_date date null,
  planned_end_date date null,
  actual_start_date date null,
  actual_end_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbc_projects_project_code_nonempty check (length(trim(project_code)) > 0),
  constraint pbc_projects_name_nonempty check (length(trim(name)) > 0),
  constraint pbc_projects_planned_dates_order_chk check (
    planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date
  ),
  constraint pbc_projects_actual_dates_order_chk check (
    actual_end_date is null or actual_start_date is null or actual_end_date >= actual_start_date
  )
);

create unique index if not exists pbc_projects_company_project_code_uq
  on public.pbc_projects (company_id, project_code);
create unique index if not exists pbc_projects_company_id_id_uq
  on public.pbc_projects (company_id, id);
create index if not exists pbc_projects_company_type_idx
  on public.pbc_projects (company_id, project_type);

drop trigger if exists pbc_projects_updated_at on public.pbc_projects;
create trigger pbc_projects_updated_at
  before update on public.pbc_projects
  for each row
  execute function public.set_updated_at();

create table if not exists public.pbc_planning_versions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  version_number integer not null,
  version_kind public.pbc_version_kind not null,
  status public.pbc_version_status not null default 'DRAFT',
  copied_from_version_id uuid null,
  approved_at timestamptz null,
  locked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbc_versions_version_number_chk check (version_number > 0),
  constraint pbc_versions_company_project_fk
    foreign key (company_id, project_id)
    references public.pbc_projects (company_id, id)
    on delete cascade,
  constraint pbc_versions_copy_fk
    foreign key (copied_from_version_id)
    references public.pbc_planning_versions (id)
    on delete set null
);

create unique index if not exists pbc_versions_company_project_no_uq
  on public.pbc_planning_versions (company_id, project_id, version_number);
create unique index if not exists pbc_versions_company_id_id_uq
  on public.pbc_planning_versions (company_id, id);
create index if not exists pbc_versions_company_project_idx
  on public.pbc_planning_versions (company_id, project_id);
create index if not exists pbc_versions_company_kind_idx
  on public.pbc_planning_versions (company_id, version_kind, status);

drop trigger if exists pbc_versions_updated_at on public.pbc_planning_versions;
create trigger pbc_versions_updated_at
  before update on public.pbc_planning_versions
  for each row
  execute function public.set_updated_at();

create table if not exists public.pbc_boq_nodes (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  version_id uuid not null,
  parent_node_id uuid null,
  hierarchy_level smallint not null,
  structure_code text not null,
  title text not null,
  unit_of_measure text null,
  planned_quantity numeric(18,3) not null default 0,
  planned_unit_cost numeric(18,2) not null default 0,
  planned_total_cost numeric(18,2) generated always as (
    round(planned_quantity * planned_unit_cost, 2)
  ) stored,
  executed_percent numeric(5,2) not null default 0,
  is_change_order_line boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbc_boq_hierarchy_level_chk check (hierarchy_level between 1 and 4),
  constraint pbc_boq_executed_percent_chk check (executed_percent >= 0 and executed_percent <= 100),
  constraint pbc_boq_structure_code_nonempty check (length(trim(structure_code)) > 0),
  constraint pbc_boq_title_nonempty check (length(trim(title)) > 0),
  constraint pbc_boq_company_version_fk
    foreign key (company_id, version_id)
    references public.pbc_planning_versions (company_id, id)
    on delete cascade,
  constraint pbc_boq_parent_fk
    foreign key (parent_node_id)
    references public.pbc_boq_nodes (id)
    on delete cascade
);

create unique index if not exists pbc_boq_company_version_code_uq
  on public.pbc_boq_nodes (company_id, version_id, structure_code);
create unique index if not exists pbc_boq_company_id_id_uq
  on public.pbc_boq_nodes (company_id, id);
create index if not exists pbc_boq_company_version_parent_idx
  on public.pbc_boq_nodes (company_id, version_id, parent_node_id, hierarchy_level);

drop trigger if exists pbc_boq_nodes_updated_at on public.pbc_boq_nodes;
create trigger pbc_boq_nodes_updated_at
  before update on public.pbc_boq_nodes
  for each row
  execute function public.set_updated_at();

create table if not exists public.pbc_task_bom_resources (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  boq_node_id uuid not null,
  resource_type public.pbc_resource_type not null default 'OTHER',
  catalog_item_code text null,
  resource_name text not null,
  unit_of_measure text null,
  planned_quantity numeric(18,3) not null default 0,
  planned_unit_cost numeric(18,2) not null default 0,
  planned_total_cost numeric(18,2) generated always as (
    round(planned_quantity * planned_unit_cost, 2)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbc_task_bom_resource_name_nonempty check (length(trim(resource_name)) > 0),
  constraint pbc_task_bom_company_boq_fk
    foreign key (company_id, boq_node_id)
    references public.pbc_boq_nodes (company_id, id)
    on delete cascade
);

create index if not exists pbc_task_bom_company_boq_idx
  on public.pbc_task_bom_resources (company_id, boq_node_id, resource_type);

drop trigger if exists pbc_task_bom_resources_updated_at on public.pbc_task_bom_resources;
create trigger pbc_task_bom_resources_updated_at
  before update on public.pbc_task_bom_resources
  for each row
  execute function public.set_updated_at();

create table if not exists public.pbc_control_periods (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  version_id uuid not null,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pbc_control_period_label_nonempty check (length(trim(period_label)) > 0),
  constraint pbc_control_period_dates_chk check (period_end >= period_start),
  constraint pbc_control_period_company_project_fk
    foreign key (company_id, project_id)
    references public.pbc_projects (company_id, id)
    on delete cascade,
  constraint pbc_control_period_company_version_fk
    foreign key (company_id, version_id)
    references public.pbc_planning_versions (company_id, id)
    on delete cascade
);

create unique index if not exists pbc_control_periods_company_project_label_uq
  on public.pbc_control_periods (company_id, project_id, period_label);
create unique index if not exists pbc_control_periods_company_id_id_uq
  on public.pbc_control_periods (company_id, id);
create index if not exists pbc_control_periods_company_project_dates_idx
  on public.pbc_control_periods (company_id, project_id, period_start, period_end);

drop trigger if exists pbc_control_periods_updated_at on public.pbc_control_periods;
create trigger pbc_control_periods_updated_at
  before update on public.pbc_control_periods
  for each row
  execute function public.set_updated_at();

create table if not exists public.pbc_actual_cost_entries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  period_id uuid not null,
  boq_node_id uuid not null,
  resource_id uuid null,
  source_type public.pbc_actual_source_type not null default 'MANUAL',
  source_reference text null,
  actual_amount numeric(18,2) not null default 0,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pbc_actual_cost_amount_nonnegative check (actual_amount >= 0),
  constraint pbc_actual_cost_company_period_fk
    foreign key (company_id, period_id)
    references public.pbc_control_periods (company_id, id)
    on delete cascade,
  constraint pbc_actual_cost_company_boq_fk
    foreign key (company_id, boq_node_id)
    references public.pbc_boq_nodes (company_id, id)
    on delete cascade,
  constraint pbc_actual_cost_resource_fk
    foreign key (resource_id)
    references public.pbc_task_bom_resources (id)
    on delete set null
);

create index if not exists pbc_actual_cost_entries_company_period_idx
  on public.pbc_actual_cost_entries (company_id, period_id, posted_at desc);
create index if not exists pbc_actual_cost_entries_company_boq_idx
  on public.pbc_actual_cost_entries (company_id, boq_node_id);

create table if not exists public.pbc_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null,
  version_id uuid null,
  snapshot_at timestamptz not null default now(),
  original_budget numeric(18,2) not null default 0,
  revised_budget numeric(18,2) not null default 0,
  overall_progress_percent numeric(5,2) not null default 0,
  variance_amount numeric(18,2) not null default 0,
  forecast_profit_loss numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint pbc_kpi_progress_chk check (
    overall_progress_percent >= 0 and overall_progress_percent <= 100
  ),
  constraint pbc_kpi_company_project_fk
    foreign key (company_id, project_id)
    references public.pbc_projects (company_id, id)
    on delete cascade,
  constraint pbc_kpi_company_version_fk
    foreign key (company_id, version_id)
    references public.pbc_planning_versions (company_id, id)
    on delete set null
);

create index if not exists pbc_kpi_snapshots_company_project_time_idx
  on public.pbc_kpi_snapshots (company_id, project_id, snapshot_at desc);

alter table public.pbc_projects enable row level security;
alter table public.pbc_planning_versions enable row level security;
alter table public.pbc_boq_nodes enable row level security;
alter table public.pbc_task_bom_resources enable row level security;
alter table public.pbc_control_periods enable row level security;
alter table public.pbc_actual_cost_entries enable row level security;
alter table public.pbc_kpi_snapshots enable row level security;

drop policy if exists pbc_projects_all_authenticated on public.pbc_projects;
create policy pbc_projects_all_authenticated
  on public.pbc_projects
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_planning_versions_all_authenticated on public.pbc_planning_versions;
create policy pbc_planning_versions_all_authenticated
  on public.pbc_planning_versions
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_boq_nodes_all_authenticated on public.pbc_boq_nodes;
create policy pbc_boq_nodes_all_authenticated
  on public.pbc_boq_nodes
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_task_bom_resources_all_authenticated on public.pbc_task_bom_resources;
create policy pbc_task_bom_resources_all_authenticated
  on public.pbc_task_bom_resources
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_control_periods_all_authenticated on public.pbc_control_periods;
create policy pbc_control_periods_all_authenticated
  on public.pbc_control_periods
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_actual_cost_entries_all_authenticated on public.pbc_actual_cost_entries;
create policy pbc_actual_cost_entries_all_authenticated
  on public.pbc_actual_cost_entries
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

drop policy if exists pbc_kpi_snapshots_all_authenticated on public.pbc_kpi_snapshots;
create policy pbc_kpi_snapshots_all_authenticated
  on public.pbc_kpi_snapshots
  for all
  to authenticated
  using (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  )
  with check (
    company_id = coalesce(
      nullif((current_setting('request.headers', true)::json ->> 'x-company-id'), ''),
      company_id
    )
  );

grant select, insert, update, delete on public.pbc_projects to authenticated;
grant select, insert, update, delete on public.pbc_planning_versions to authenticated;
grant select, insert, update, delete on public.pbc_boq_nodes to authenticated;
grant select, insert, update, delete on public.pbc_task_bom_resources to authenticated;
grant select, insert, update, delete on public.pbc_control_periods to authenticated;
grant select, insert, update, delete on public.pbc_actual_cost_entries to authenticated;
grant select, insert, update, delete on public.pbc_kpi_snapshots to authenticated;

grant all on public.pbc_projects to service_role;
grant all on public.pbc_planning_versions to service_role;
grant all on public.pbc_boq_nodes to service_role;
grant all on public.pbc_task_bom_resources to service_role;
grant all on public.pbc_control_periods to service_role;
grant all on public.pbc_actual_cost_entries to service_role;
grant all on public.pbc_kpi_snapshots to service_role;
