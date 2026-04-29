-- Procurement scaffold from Master Spec (Suppliers -> PO -> GRN -> Supplier Invoices)
-- Scope: end-to-end procurement and supply-chain control with budget linkage.

do $$
begin
  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'proc_status'
  ) then
    create type public.proc_status as enum ('DRAFT', 'APPROVED', 'PARTIALLY_PAID', 'CLOSED');
  end if;

  if not exists (
    select 1 from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'proc_invoice_status'
  ) then
    create type public.proc_invoice_status as enum ('DRAFT', 'MATCHED', 'APPROVED', 'POSTED');
  end if;
end
$$;

create table if not exists public.proc_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_code text not null,
  name text not null,
  payment_terms text null,
  obligation_open_amount numeric(18,2) not null default 0,
  supplier_rating numeric(4,2) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_suppliers_code_nonempty check (length(trim(supplier_code)) > 0),
  constraint proc_suppliers_name_nonempty check (length(trim(name)) > 0),
  constraint proc_suppliers_open_obligation_nonnegative check (obligation_open_amount >= 0),
  constraint proc_suppliers_rating_range_chk check (
    supplier_rating is null or (supplier_rating >= 0 and supplier_rating <= 5)
  )
);

create unique index if not exists proc_suppliers_company_code_uq
  on public.proc_suppliers (company_id, supplier_code);
create index if not exists proc_suppliers_company_name_idx
  on public.proc_suppliers (company_id, name);

drop trigger if exists proc_suppliers_updated_at on public.proc_suppliers;
create trigger proc_suppliers_updated_at
  before update on public.proc_suppliers
  for each row
  execute function public.set_updated_at();

create table if not exists public.proc_items_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  item_code text not null,
  item_name text not null,
  unit_of_measure text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_items_catalog_code_nonempty check (length(trim(item_code)) > 0),
  constraint proc_items_catalog_name_nonempty check (length(trim(item_name)) > 0)
);

create unique index if not exists proc_items_catalog_company_code_uq
  on public.proc_items_catalog (company_id, item_code);

drop trigger if exists proc_items_catalog_updated_at on public.proc_items_catalog;
create trigger proc_items_catalog_updated_at
  before update on public.proc_items_catalog
  for each row
  execute function public.set_updated_at();

create table if not exists public.proc_supplier_catalog_prices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.proc_suppliers (id) on delete cascade,
  item_id uuid not null references public.proc_items_catalog (id) on delete cascade,
  agreed_unit_price numeric(18,2) not null default 0,
  currency_code text null default 'ILS',
  valid_from date null,
  valid_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_supplier_catalog_prices_nonnegative check (agreed_unit_price >= 0),
  constraint proc_supplier_catalog_prices_validity_chk check (
    valid_to is null or valid_from is null or valid_to >= valid_from
  )
);

create unique index if not exists proc_supplier_catalog_prices_company_supplier_item_uq
  on public.proc_supplier_catalog_prices (company_id, supplier_id, item_id, coalesce(valid_from, '1900-01-01'::date));

drop trigger if exists proc_supplier_catalog_prices_updated_at on public.proc_supplier_catalog_prices;
create trigger proc_supplier_catalog_prices_updated_at
  before update on public.proc_supplier_catalog_prices
  for each row
  execute function public.set_updated_at();

create table if not exists public.proc_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  po_number text not null,
  project_id uuid null references public.erp_proj_projects (id) on delete set null,
  boq_line_id uuid null references public.erp_proj_boq_lines (id) on delete set null,
  supplier_id uuid not null references public.proc_suppliers (id) on delete restrict,
  status public.proc_status not null default 'DRAFT',
  requested_delivery_date date null,
  approved_at timestamptz null,
  sent_to_supplier_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_purchase_orders_number_nonempty check (length(trim(po_number)) > 0)
);

create unique index if not exists proc_purchase_orders_company_po_number_uq
  on public.proc_purchase_orders (company_id, po_number);
create index if not exists proc_purchase_orders_company_project_idx
  on public.proc_purchase_orders (company_id, project_id, status);

drop trigger if exists proc_purchase_orders_updated_at on public.proc_purchase_orders;
create trigger proc_purchase_orders_updated_at
  before update on public.proc_purchase_orders
  for each row
  execute function public.set_updated_at();

create table if not exists public.proc_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  po_id uuid not null references public.proc_purchase_orders (id) on delete cascade,
  line_no integer not null,
  item_id uuid null references public.proc_items_catalog (id) on delete set null,
  description text not null,
  requested_quantity numeric(18,3) not null default 0,
  received_quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  requested_delivery_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_po_lines_line_no_positive check (line_no > 0),
  constraint proc_po_lines_description_nonempty check (length(trim(description)) > 0),
  constraint proc_po_lines_quantities_chk check (
    requested_quantity >= 0 and received_quantity >= 0 and received_quantity <= requested_quantity
  ),
  constraint proc_po_lines_unit_price_nonnegative check (unit_price >= 0)
);

create unique index if not exists proc_po_lines_company_po_line_no_uq
  on public.proc_purchase_order_lines (company_id, po_id, line_no);
create index if not exists proc_po_lines_company_po_idx
  on public.proc_purchase_order_lines (company_id, po_id);

drop trigger if exists proc_purchase_order_lines_updated_at on public.proc_purchase_order_lines;
create trigger proc_purchase_order_lines_updated_at
  before update on public.proc_purchase_order_lines
  for each row
  execute function public.set_updated_at();

create table if not exists public.proc_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  po_line_id uuid not null references public.proc_purchase_order_lines (id) on delete cascade,
  receipt_number text not null,
  received_quantity numeric(18,3) not null default 0,
  received_at timestamptz not null default now(),
  site_note text null,
  created_at timestamptz not null default now(),
  constraint proc_goods_receipts_number_nonempty check (length(trim(receipt_number)) > 0),
  constraint proc_goods_receipts_quantity_positive check (received_quantity > 0)
);

create index if not exists proc_goods_receipts_company_po_line_idx
  on public.proc_goods_receipts (company_id, po_line_id, received_at desc);

create table if not exists public.proc_supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.proc_suppliers (id) on delete restrict,
  po_id uuid null references public.proc_purchase_orders (id) on delete set null,
  grn_id uuid null references public.proc_goods_receipts (id) on delete set null,
  invoice_number text not null,
  invoice_date date null,
  total_amount numeric(18,2) not null default 0,
  status public.proc_invoice_status not null default 'DRAFT',
  match_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proc_supplier_invoices_number_nonempty check (length(trim(invoice_number)) > 0),
  constraint proc_supplier_invoices_total_nonnegative check (total_amount >= 0)
);

create unique index if not exists proc_supplier_invoices_company_supplier_invoice_uq
  on public.proc_supplier_invoices (company_id, supplier_id, invoice_number);
create index if not exists proc_supplier_invoices_company_status_idx
  on public.proc_supplier_invoices (company_id, status, invoice_date desc);

drop trigger if exists proc_supplier_invoices_updated_at on public.proc_supplier_invoices;
create trigger proc_supplier_invoices_updated_at
  before update on public.proc_supplier_invoices
  for each row
  execute function public.set_updated_at();

alter table public.proc_suppliers enable row level security;
alter table public.proc_items_catalog enable row level security;
alter table public.proc_supplier_catalog_prices enable row level security;
alter table public.proc_purchase_orders enable row level security;
alter table public.proc_purchase_order_lines enable row level security;
alter table public.proc_goods_receipts enable row level security;
alter table public.proc_supplier_invoices enable row level security;

drop policy if exists proc_suppliers_all_authenticated on public.proc_suppliers;
create policy proc_suppliers_all_authenticated
  on public.proc_suppliers
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

drop policy if exists proc_items_catalog_all_authenticated on public.proc_items_catalog;
create policy proc_items_catalog_all_authenticated
  on public.proc_items_catalog
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

drop policy if exists proc_supplier_catalog_prices_all_authenticated on public.proc_supplier_catalog_prices;
create policy proc_supplier_catalog_prices_all_authenticated
  on public.proc_supplier_catalog_prices
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

drop policy if exists proc_purchase_orders_all_authenticated on public.proc_purchase_orders;
create policy proc_purchase_orders_all_authenticated
  on public.proc_purchase_orders
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

drop policy if exists proc_purchase_order_lines_all_authenticated on public.proc_purchase_order_lines;
create policy proc_purchase_order_lines_all_authenticated
  on public.proc_purchase_order_lines
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

drop policy if exists proc_goods_receipts_all_authenticated on public.proc_goods_receipts;
create policy proc_goods_receipts_all_authenticated
  on public.proc_goods_receipts
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

drop policy if exists proc_supplier_invoices_all_authenticated on public.proc_supplier_invoices;
create policy proc_supplier_invoices_all_authenticated
  on public.proc_supplier_invoices
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

grant select, insert, update, delete on public.proc_suppliers to authenticated;
grant select, insert, update, delete on public.proc_items_catalog to authenticated;
grant select, insert, update, delete on public.proc_supplier_catalog_prices to authenticated;
grant select, insert, update, delete on public.proc_purchase_orders to authenticated;
grant select, insert, update, delete on public.proc_purchase_order_lines to authenticated;
grant select, insert, update, delete on public.proc_goods_receipts to authenticated;
grant select, insert, update, delete on public.proc_supplier_invoices to authenticated;

grant all on public.proc_suppliers to service_role;
grant all on public.proc_items_catalog to service_role;
grant all on public.proc_supplier_catalog_prices to service_role;
grant all on public.proc_purchase_orders to service_role;
grant all on public.proc_purchase_order_lines to service_role;
grant all on public.proc_goods_receipts to service_role;
grant all on public.proc_supplier_invoices to service_role;
