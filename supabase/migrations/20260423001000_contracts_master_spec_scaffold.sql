-- Contracts scaffold from Master Spec (Contract lifecycle -> BOQ appendix -> versions -> progress billing)
-- Scope: subcontractor/supplier contracts, approved versions, and monthly partial billing flow.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'ctr_contract_status'
  ) then
    create type public.ctr_contract_status as enum ('DRAFT', 'ACTIVE', 'APPROVED', 'CLOSED');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'ctr_version_status'
  ) then
    create type public.ctr_version_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'ctr_billing_status'
  ) then
    create type public.ctr_billing_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED');
  end if;
end
$$;

create table if not exists public.ctr_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_number text not null,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  business_partner_id uuid null references public.erp_master_business_partners (id) on delete set null,
  title text not null,
  total_amount numeric(18,2) not null default 0,
  payment_terms text null,
  retention_percent numeric(6,3) not null default 0,
  insurance_percent numeric(6,3) not null default 0,
  status public.ctr_contract_status not null default 'DRAFT',
  start_date date null,
  end_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctr_contracts_number_nonempty check (length(trim(contract_number)) > 0),
  constraint ctr_contracts_title_nonempty check (length(trim(title)) > 0),
  constraint ctr_contracts_total_nonnegative check (total_amount >= 0),
  constraint ctr_contracts_retention_range check (retention_percent >= 0 and retention_percent <= 100),
  constraint ctr_contracts_insurance_range check (insurance_percent >= 0 and insurance_percent <= 100)
);

create unique index if not exists ctr_contracts_company_number_uq
  on public.ctr_contracts (company_id, contract_number);
create index if not exists ctr_contracts_company_project_idx
  on public.ctr_contracts (company_id, project_id, status);

drop trigger if exists ctr_contracts_updated_at on public.ctr_contracts;
create trigger ctr_contracts_updated_at
  before update on public.ctr_contracts
  for each row
  execute function public.set_updated_at();

create table if not exists public.ctr_contract_versions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_id uuid not null references public.ctr_contracts (id) on delete cascade,
  version_no integer not null,
  change_order_ref text null,
  version_reason text null,
  status public.ctr_version_status not null default 'DRAFT',
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctr_contract_versions_no_positive check (version_no >= 0)
);

create unique index if not exists ctr_contract_versions_company_contract_no_uq
  on public.ctr_contract_versions (company_id, contract_id, version_no);
create index if not exists ctr_contract_versions_company_status_idx
  on public.ctr_contract_versions (company_id, status, created_at desc);

drop trigger if exists ctr_contract_versions_updated_at on public.ctr_contract_versions;
create trigger ctr_contract_versions_updated_at
  before update on public.ctr_contract_versions
  for each row
  execute function public.set_updated_at();

create table if not exists public.ctr_contract_boq_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_version_id uuid not null references public.ctr_contract_versions (id) on delete cascade,
  boq_line_id uuid null references public.erp_proj_boq_lines (id) on delete set null,
  line_no integer not null,
  line_code text null,
  description text not null,
  unit_of_measure text null,
  contract_quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  line_total numeric(18,2) generated always as (contract_quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctr_contract_boq_lines_line_positive check (line_no > 0),
  constraint ctr_contract_boq_lines_description_nonempty check (length(trim(description)) > 0),
  constraint ctr_contract_boq_lines_qty_nonnegative check (contract_quantity >= 0),
  constraint ctr_contract_boq_lines_unit_price_nonnegative check (unit_price >= 0)
);

create unique index if not exists ctr_contract_boq_lines_company_version_line_uq
  on public.ctr_contract_boq_lines (company_id, contract_version_id, line_no);
create index if not exists ctr_contract_boq_lines_company_boq_idx
  on public.ctr_contract_boq_lines (company_id, boq_line_id);

drop trigger if exists ctr_contract_boq_lines_updated_at on public.ctr_contract_boq_lines;
create trigger ctr_contract_boq_lines_updated_at
  before update on public.ctr_contract_boq_lines
  for each row
  execute function public.set_updated_at();

create table if not exists public.ctr_progress_billings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  contract_id uuid not null references public.ctr_contracts (id) on delete cascade,
  billing_number text not null,
  billing_date date not null default current_date,
  period_start date null,
  period_end date null,
  status public.ctr_billing_status not null default 'DRAFT',
  cumulative_progress_percent numeric(7,3) null,
  gross_amount numeric(18,2) not null default 0,
  retention_amount numeric(18,2) not null default 0,
  advance_deduction_amount numeric(18,2) not null default 0,
  offsets_amount numeric(18,2) not null default 0,
  payable_amount numeric(18,2) generated always as (
    gross_amount - retention_amount - advance_deduction_amount - offsets_amount
  ) stored,
  approved_at timestamptz null,
  posted_finance_doc_ref text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctr_progress_billings_number_nonempty check (length(trim(billing_number)) > 0),
  constraint ctr_progress_billings_progress_range check (
    cumulative_progress_percent is null or (cumulative_progress_percent >= 0 and cumulative_progress_percent <= 100)
  ),
  constraint ctr_progress_billings_nonnegative_totals check (
    gross_amount >= 0 and retention_amount >= 0 and advance_deduction_amount >= 0 and offsets_amount >= 0
  ),
  constraint ctr_progress_billings_period_range check (
    period_end is null or period_start is null or period_end >= period_start
  )
);

create unique index if not exists ctr_progress_billings_company_contract_number_uq
  on public.ctr_progress_billings (company_id, contract_id, billing_number);
create index if not exists ctr_progress_billings_company_contract_date_idx
  on public.ctr_progress_billings (company_id, contract_id, billing_date desc);

drop trigger if exists ctr_progress_billings_updated_at on public.ctr_progress_billings;
create trigger ctr_progress_billings_updated_at
  before update on public.ctr_progress_billings
  for each row
  execute function public.set_updated_at();

create table if not exists public.ctr_billing_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  billing_id uuid not null references public.ctr_progress_billings (id) on delete cascade,
  contract_boq_line_id uuid not null references public.ctr_contract_boq_lines (id) on delete cascade,
  line_no integer not null,
  previous_cumulative_qty numeric(18,3) not null default 0,
  current_cumulative_qty numeric(18,3) not null default 0,
  approved_delta_qty numeric(18,3) generated always as (current_cumulative_qty - previous_cumulative_qty) stored,
  unit_price numeric(18,2) not null default 0,
  line_gross_amount numeric(18,2) generated always as (
    (current_cumulative_qty - previous_cumulative_qty) * unit_price
  ) stored,
  retention_deduction_amount numeric(18,2) not null default 0,
  advance_deduction_amount numeric(18,2) not null default 0,
  offsets_amount numeric(18,2) not null default 0,
  line_payable_amount numeric(18,2) generated always as (
    ((current_cumulative_qty - previous_cumulative_qty) * unit_price)
    - retention_deduction_amount
    - advance_deduction_amount
    - offsets_amount
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ctr_billing_lines_line_positive check (line_no > 0),
  constraint ctr_billing_lines_cumulative_qty_valid check (
    previous_cumulative_qty >= 0 and current_cumulative_qty >= previous_cumulative_qty
  ),
  constraint ctr_billing_lines_nonnegative_deductions check (
    retention_deduction_amount >= 0 and advance_deduction_amount >= 0 and offsets_amount >= 0 and unit_price >= 0
  )
);

create unique index if not exists ctr_billing_lines_company_billing_line_uq
  on public.ctr_billing_lines (company_id, billing_id, line_no);
create index if not exists ctr_billing_lines_company_contract_line_idx
  on public.ctr_billing_lines (company_id, contract_boq_line_id);

drop trigger if exists ctr_billing_lines_updated_at on public.ctr_billing_lines;
create trigger ctr_billing_lines_updated_at
  before update on public.ctr_billing_lines
  for each row
  execute function public.set_updated_at();

alter table public.ctr_contracts enable row level security;
alter table public.ctr_contract_versions enable row level security;
alter table public.ctr_contract_boq_lines enable row level security;
alter table public.ctr_progress_billings enable row level security;
alter table public.ctr_billing_lines enable row level security;

drop policy if exists ctr_contracts_all_authenticated on public.ctr_contracts;
create policy ctr_contracts_all_authenticated
  on public.ctr_contracts
  for all to authenticated
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

drop policy if exists ctr_contract_versions_all_authenticated on public.ctr_contract_versions;
create policy ctr_contract_versions_all_authenticated
  on public.ctr_contract_versions
  for all to authenticated
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

drop policy if exists ctr_contract_boq_lines_all_authenticated on public.ctr_contract_boq_lines;
create policy ctr_contract_boq_lines_all_authenticated
  on public.ctr_contract_boq_lines
  for all to authenticated
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

drop policy if exists ctr_progress_billings_all_authenticated on public.ctr_progress_billings;
create policy ctr_progress_billings_all_authenticated
  on public.ctr_progress_billings
  for all to authenticated
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

drop policy if exists ctr_billing_lines_all_authenticated on public.ctr_billing_lines;
create policy ctr_billing_lines_all_authenticated
  on public.ctr_billing_lines
  for all to authenticated
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

grant select, insert, update, delete on public.ctr_contracts to authenticated;
grant select, insert, update, delete on public.ctr_contract_versions to authenticated;
grant select, insert, update, delete on public.ctr_contract_boq_lines to authenticated;
grant select, insert, update, delete on public.ctr_progress_billings to authenticated;
grant select, insert, update, delete on public.ctr_billing_lines to authenticated;
