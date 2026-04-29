-- Legacy compatibility tables required by historical migrations.
-- These are only created when missing so canonical schemas can still evolve later.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'mo_entity_type'
  ) then
    create type public.mo_entity_type as enum (
      'supplier',
      'client',
      'employee',
      'contractor',
      'other'
    );
  end if;
end
$$;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  title text,
  status text,
  is_deleted boolean not null default false,
  retention_pct numeric(10, 4) not null default 0,
  insurance_pct numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete set null,
  invoice_number text,
  total_amount numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  supplier_id uuid,
  total_amount numeric(18, 2),
  status text,
  created_by uuid,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mo_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references public.purchase_orders (id) on delete set null,
  invoice_number text,
  total_amount numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mo_supplier_invoice_imports (
  id uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid references public.mo_supplier_invoices (id) on delete set null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.items_catalog (
  id uuid primary key default gen_random_uuid(),
  internal_sku text,
  supplier_id uuid,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partial_account_line_items (
  id uuid primary key default gen_random_uuid(),
  partial_account_id uuid,
  contract_line_item_id uuid,
  is_deleted boolean not null default false,
  approved_percentage numeric(10, 4),
  execution_percentage numeric(10, 4),
  approved_amount numeric(18, 2),
  cumulative_amount numeric(18, 2),
  quantity_previous numeric(18, 4),
  quantity_current numeric(18, 4),
  line_total_price numeric(18, 2),
  created_at timestamptz not null default now()
);

create table if not exists public.partial_accounts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete set null,
  project_id uuid,
  billing_period text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text,
  client_name text,
  client_entity_id uuid,
  internal_project_code text,
  status text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  name text,
  type public.mo_entity_type not null default 'other',
  legal_id text,
  contact_info jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mo_invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  invoice_number text,
  issue_date date,
  subtotal numeric(18, 2) not null default 0,
  vat_amount numeric(18, 2) not null default 0,
  grand_total numeric(18, 2) not null default 0,
  total_amount numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mo_receipt_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.mo_invoices (id) on delete cascade,
  amount numeric(18, 2) not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.po_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders (id) on delete cascade,
  item_id uuid,
  quantity numeric(18, 4),
  unit_price numeric(18, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_line_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts (id) on delete cascade,
  item_id uuid,
  description text,
  quantity numeric(18, 4),
  unit_price numeric(18, 2),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_client_contract_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  client_contract_id uuid,
  contract_id uuid references public.contracts (id) on delete cascade,
  line_number integer not null default 1,
  boq_ref text,
  description text not null default '',
  quantity numeric(18, 3) not null default 0,
  unit_price numeric(18, 2) not null default 0,
  total_price numeric(18, 2) not null default 0,
  retainage_exempt boolean not null default false,
  is_advance_line boolean not null default false,
  last_approved_pct numeric(8, 4) default 0,
  last_approved_qty numeric(15, 4) default 0,
  last_approved_amount numeric(15, 2) default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_client_progress_bills (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  client_contract_id uuid,
  contract_id uuid references public.contracts (id) on delete cascade,
  bill_number text,
  period_start date,
  period_end date,
  billing_period_start date,
  billing_period_end date,
  status text not null default 'DRAFT',
  submitted_total_amount numeric(18, 2) not null default 0,
  approved_total_amount numeric(18, 2) not null default 0,
  indexed_submitted_amount numeric(18, 2) not null default 0,
  indexed_approved_amount numeric(18, 2) not null default 0,
  retention_deducted_amount numeric(18, 2) not null default 0,
  advance_repayment_amount numeric(18, 2) not null default 0,
  net_approved_payable numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_proj_projects (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  project_number text,
  code text,
  name text,
  status text,
  start_date date,
  end_date date,
  project_manager_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_proj_boq_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.erp_proj_projects (id) on delete cascade,
  company_id text,
  version_id uuid,
  section text,
  item_number text,
  description text,
  uom text,
  quantity numeric(18, 3),
  unit_price numeric(18, 2),
  code text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_master_business_partners (
  id uuid primary key default gen_random_uuid(),
  company_id text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
