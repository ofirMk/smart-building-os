-- Finance scaffold from Master Spec (Payment Demands, Client Billings, Cash Flow, Actual Payments)
-- Scope: budgeted payment demands, client income billing, monthly cash-flow forecasting, and actual settlement loop.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'fin_payment_demand_status'
  ) then
    create type public.fin_payment_demand_status as enum ('PENDING', 'APPROVED_FOR_PAYMENT', 'PAID');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'fin_client_billing_status'
  ) then
    create type public.fin_client_billing_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'COLLECTED');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'fin_cash_flow_kind'
  ) then
    create type public.fin_cash_flow_kind as enum ('OUTFLOW', 'INFLOW');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'fin_actual_payment_direction'
  ) then
    create type public.fin_actual_payment_direction as enum ('OUT', 'IN');
  end if;
end
$$;

create table if not exists public.fin_payment_demands (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  demand_number text not null,
  source_type text not null,
  source_contract_billing_id uuid null references public.ctr_progress_billings (id) on delete set null,
  source_supplier_invoice_id uuid null references public.proc_supplier_invoices (id) on delete set null,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  planned_due_date date not null,
  planned_amount numeric(18,2) not null default 0,
  status public.fin_payment_demand_status not null default 'PENDING',
  approved_for_payment_at timestamptz null,
  paid_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_payment_demands_number_nonempty check (length(trim(demand_number)) > 0),
  constraint fin_payment_demands_source_type_chk check (
    source_type in ('CONTRACT_BILLING', 'SUPPLIER_INVOICE', 'MANUAL')
  ),
  constraint fin_payment_demands_planned_amount_nonnegative check (planned_amount >= 0),
  constraint fin_payment_demands_source_link_chk check (
    (source_type = 'CONTRACT_BILLING' and source_contract_billing_id is not null)
    or (source_type = 'SUPPLIER_INVOICE' and source_supplier_invoice_id is not null)
    or (source_type = 'MANUAL')
  )
);

create unique index if not exists fin_payment_demands_company_number_uq
  on public.fin_payment_demands (company_id, demand_number);
create index if not exists fin_payment_demands_company_due_status_idx
  on public.fin_payment_demands (company_id, planned_due_date, status);

drop trigger if exists fin_payment_demands_updated_at on public.fin_payment_demands;
create trigger fin_payment_demands_updated_at
  before update on public.fin_payment_demands
  for each row
  execute function public.set_updated_at();

create table if not exists public.fin_client_billings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  client_billing_number text not null,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  business_partner_id uuid null references public.erp_master_business_partners (id) on delete set null,
  billing_period date null,
  milestone_label text null,
  cumulative_progress_percent numeric(7,3) null,
  billed_amount numeric(18,2) not null default 0,
  status public.fin_client_billing_status not null default 'DRAFT',
  planned_collection_date date null,
  collected_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_client_billings_number_nonempty check (length(trim(client_billing_number)) > 0),
  constraint fin_client_billings_progress_range check (
    cumulative_progress_percent is null or (cumulative_progress_percent >= 0 and cumulative_progress_percent <= 100)
  ),
  constraint fin_client_billings_amount_nonnegative check (billed_amount >= 0)
);

create unique index if not exists fin_client_billings_company_number_uq
  on public.fin_client_billings (company_id, client_billing_number);
create index if not exists fin_client_billings_company_collection_idx
  on public.fin_client_billings (company_id, planned_collection_date, status);

drop trigger if exists fin_client_billings_updated_at on public.fin_client_billings;
create trigger fin_client_billings_updated_at
  before update on public.fin_client_billings
  for each row
  execute function public.set_updated_at();

create table if not exists public.fin_cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  entry_month date not null,
  entry_kind public.fin_cash_flow_kind not null,
  source_type text not null default 'MANUAL',
  payment_demand_id uuid null references public.fin_payment_demands (id) on delete set null,
  client_billing_id uuid null references public.fin_client_billings (id) on delete set null,
  forecast_amount numeric(18,2) not null default 0,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_cash_flow_entries_month_start_chk check (extract(day from entry_month) = 1),
  constraint fin_cash_flow_entries_source_chk check (
    source_type in ('PAYMENT_DEMAND', 'CLIENT_BILLING', 'MANUAL')
  ),
  constraint fin_cash_flow_entries_forecast_nonnegative check (forecast_amount >= 0)
);

create index if not exists fin_cash_flow_entries_company_month_kind_idx
  on public.fin_cash_flow_entries (company_id, entry_month, entry_kind);
create index if not exists fin_cash_flow_entries_company_source_idx
  on public.fin_cash_flow_entries (company_id, source_type);

drop trigger if exists fin_cash_flow_entries_updated_at on public.fin_cash_flow_entries;
create trigger fin_cash_flow_entries_updated_at
  before update on public.fin_cash_flow_entries
  for each row
  execute function public.set_updated_at();

create table if not exists public.fin_actual_payments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  direction public.fin_actual_payment_direction not null,
  payment_demand_id uuid null references public.fin_payment_demands (id) on delete set null,
  client_billing_id uuid null references public.fin_client_billings (id) on delete set null,
  cash_flow_entry_id uuid null references public.fin_cash_flow_entries (id) on delete set null,
  amount numeric(18,2) not null default 0,
  paid_at timestamptz not null default now(),
  bank_reference text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fin_actual_payments_amount_positive check (amount > 0),
  constraint fin_actual_payments_link_chk check (
    payment_demand_id is not null
    or client_billing_id is not null
    or cash_flow_entry_id is not null
  )
);

create index if not exists fin_actual_payments_company_paid_at_idx
  on public.fin_actual_payments (company_id, paid_at desc);
create index if not exists fin_actual_payments_company_direction_idx
  on public.fin_actual_payments (company_id, direction);

drop trigger if exists fin_actual_payments_updated_at on public.fin_actual_payments;
create trigger fin_actual_payments_updated_at
  before update on public.fin_actual_payments
  for each row
  execute function public.set_updated_at();

alter table public.fin_payment_demands enable row level security;
alter table public.fin_client_billings enable row level security;
alter table public.fin_cash_flow_entries enable row level security;
alter table public.fin_actual_payments enable row level security;

drop policy if exists fin_payment_demands_all_authenticated on public.fin_payment_demands;
create policy fin_payment_demands_all_authenticated
  on public.fin_payment_demands
  for all to authenticated
  using (true) with check (true);

drop policy if exists fin_client_billings_all_authenticated on public.fin_client_billings;
create policy fin_client_billings_all_authenticated
  on public.fin_client_billings
  for all to authenticated
  using (true) with check (true);

drop policy if exists fin_cash_flow_entries_all_authenticated on public.fin_cash_flow_entries;
create policy fin_cash_flow_entries_all_authenticated
  on public.fin_cash_flow_entries
  for all to authenticated
  using (true) with check (true);

drop policy if exists fin_actual_payments_all_authenticated on public.fin_actual_payments;
create policy fin_actual_payments_all_authenticated
  on public.fin_actual_payments
  for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.fin_payment_demands to authenticated;
grant select, insert, update, delete on public.fin_client_billings to authenticated;
grant select, insert, update, delete on public.fin_cash_flow_entries to authenticated;
grant select, insert, update, delete on public.fin_actual_payments to authenticated;
